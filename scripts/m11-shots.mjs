#!/usr/bin/env node
/**
 * scripts/m11-shots.mjs — M11 regression evidence sheets + assertions.
 *
 * Reads the live captures written by `scripts/m11-capture.mjs`
 * (`.m11-tmp/before.json`, `.m11-tmp/final.json` and their PNGs; regenerate the
 * "before" pair by checking out the pre-M11 CSS and re-running the capture),
 * checks the four M11 assertions against those numbers, and composes one
 * 原生 → 修复前 → 修复后 sheet per regression:
 *
 *   docs/screenshots/m11-1-spacing.png    已完成 → 正文 的间距
 *   docs/screenshots/m11-2-composer.png   输入卡 → 统计行 / 窗口底
 *   docs/screenshots/m11-3-diff.png       变更卡与 diff 内部栅格
 *   docs/screenshots/m11-4-width.png      列宽拖拽
 *   docs/screenshots/m11-5-hover.png      hover 反馈
 *
 * Numbers land in docs/m11-fixes.json (the file the node test asserts on).
 *
 *   node scripts/m11-shots.mjs
 *
 * Dev-only: playwright + Chromium are used to draw the sheets, same as
 * scripts/m10-shots.mjs. No live DSH is touched here.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readPng, writePng } from './png-read.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SHOTS = join(ROOT, 'docs/screenshots')
const TMP = join(ROOT, '.m11-tmp')
const CROPS = join(TMP, 'sheets')
const PLAYWRIGHT = process.env.PLAYWRIGHT_DIR ?? 'playwright'
const CHROME = process.env.CHATGPT_UI_CHROME ?? process.env.HOME + '/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome'
const CHROME_ARGS = ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--disable-software-rasterizer']

mkdirSync(SHOTS, { recursive: true })
mkdirSync(CROPS, { recursive: true })

const before = JSON.parse(readFileSync(join(TMP, 'before.json'), 'utf8'))
const final = JSON.parse(readFileSync(join(TMP, 'final.json'), 'utf8'))
const nativeReport = JSON.parse(readFileSync(join(TMP, 'native.json'), 'utf8'))
const pre = JSON.parse(readFileSync(join(TMP, 'pre67.json'), 'utf8'))

const native = final.off
const after = final.on
const prior = before.on

/* ---- assertions -------------------------------------------------------- */
const near = (value, target, tolerance) => Math.abs(value - target) <= tolerance
const ratio = (part, whole) => (whole === 0 ? 0 : part / whole)

const assertions = []

const gapNative = native.base.spacing.gapProcToStep
const gapAfter = after.base.spacing.gapProcToStep
assertions.push({
  id: 'A1-spacing',
  claim: '「已完成」到正文的间距 ≤ 原生 + 2px',
  pass: gapAfter <= gapNative + 2,
  detail: { native: gapNative, before: prior.base.spacing.gapProcToStep, after: gapAfter }
})

const cardNative = native.base.composer.gapCardToStat
const cardAfter = after.base.composer.gapCardToStat
const bottomNative = native.base.composer.gapStatToBottom
const bottomAfter = after.base.composer.gapStatToBottom
assertions.push({
  id: 'A2-composer',
  claim: '输入卡到统计行的间距 ≤ 原生 + 2px，统计行仍贴窗口底',
  pass: cardAfter <= cardNative + 2 && near(bottomAfter, bottomNative, 2),
  detail: {
    native: cardNative,
    before: prior.base.composer.gapCardToStat,
    after: cardAfter,
    statToBottomNative: bottomNative,
    statToBottomAfter: bottomAfter
  }
})

const headNative = native.base.diff.header.w
const headAfter = after.base.diff.header.w
const cardWidthAfter = after.base.diff.card.w
const numAfter = after.diffHover.diff.numbers[0]
const textAfter = after.diffHover.diff.texts[0]
const noOverlap = numAfter === undefined || textAfter === undefined || numAfter.rect.right <= textAfter.rect.x + 0.5
assertions.push({
  id: 'A3-diff',
  claim: '变更卡按钮不再被压扁；diff 行号列与代码列矩形不相交',
  pass:
    ratio(headAfter, cardWidthAfter) > 0.95 &&
    headNative / native.base.diff.card.w > 0.95 &&
    noOverlap &&
    numAfter?.align === 'right' &&
    /Mono|Consolas|monospace/.test(numAfter?.font ?? '') &&
    after.base.diff.pathWidths.every((width) => width > 0),
  detail: {
    headerNative: headNative,
    headerBefore: prior.base.diff.header.w,
    headerAfter: headAfter,
    cardAfter: cardWidthAfter,
    pathsNative: native.base.diff.pathWidths,
    pathsBefore: prior.base.diff.pathWidths,
    pathsAfter: after.base.diff.pathWidths,
    numberRect: numAfter?.rect ?? null,
    textRect: textAfter?.rect ?? null,
    grid: after.diffHover.diff.lines[0]?.grid ?? null
  }
})

const dragAfter = after.drag.delta ?? 0
const dragNative = native.drag.delta ?? 0
assertions.push({
  id: 'A4-width',
  claim: '拖拽改变列宽 ≥ 40px，且刷新后保持',
  pass:
    Math.abs(dragAfter) >= 40 &&
    Math.abs(dragNative) >= 40 &&
    Math.abs(final.persisted.width - after.drag.after.width) <= 1,
  detail: {
    native: { from: native.drag.before.width, to: native.drag.after?.width, delta: dragNative },
    before: { from: prior.drag.before.width, to: prior.drag.after?.width, delta: prior.drag.delta },
    after: { from: after.drag.before.width, to: after.drag.after?.width, delta: dragAfter },
    persisted: final.persisted.width
  }
})

const hoverPass =
  after.hover.backgroundUnchanged === true &&
  after.hover.colorChanged === true &&
  after.hover.hovered.background === after.hover.idle.background
assertions.push({
  id: 'A5-hover',
  claim: 'hover 后背景色不变、文字颜色改变',
  pass: hoverPass,
  detail: {
    native: native.hover,
    before: prior.hover,
    after: after.hover
  }
})

/* ---- crops ------------------------------------------------------------- */
function crop(input, name, x, y, w, h) {
  const img = readPng(input)
  const ox = Math.max(0, Math.min(img.width - 1, Math.round(x)))
  const oy = Math.max(0, Math.min(img.height - 1, Math.round(y)))
  const ow = Math.max(1, Math.min(img.width - ox, Math.round(w)))
  const oh = Math.max(1, Math.min(img.height - oy, Math.round(h)))
  const out = Buffer.alloc(ow * oh * 3)
  for (let row = 0; row < oh; row += 1) {
    for (let col = 0; col < ow; col += 1) {
      const px = img.pixel(ox + col, oy + row)
      const at = (row * ow + col) * 3
      out[at] = px[0]
      out[at + 1] = px[1]
      out[at + 2] = px[2]
    }
  }
  const path = join(CROPS, name)
  writePng(path, ow, oh, out)
  return path
}

/* ---- reference composer ------------------------------------------------- */
/*
 * The ChatGPT reference (docs/screenshots/m9-ref-chat-short-light.png, 2x DPR,
 * 3174×1814) draws one 54px-tall pill: card top y=850, first text ink y=893, so
 * the card's top edge to the first text line is (893-850)/2 = 21.5 CSS px.
 */
const REFERENCE_COMPOSER = { file: 'docs/screenshots/m9-ref-chat-short-light.png', x: 1140, y: 836, w: 1572, h: 138 }
const REFERENCE_CARD_TO_TEXT = 21.5

/**
 * First text row inside the composer card, read off the full-page capture: the
 * smallest y in the card's text band that carries real ink (the card's border
 * and fill are far lighter than any text colour).
 */
function inkTop(screenshot, card, name) {
  const img = readPng(join(TMP, screenshot))
  const x0 = Math.round(card.x) + 6
  const x1 = Math.round(card.right) - 6
  const y0 = Math.round(card.y)
  for (let y = y0; y < y0 + Math.min(90, card.h); y += 1) {
    let ink = 0
    for (let x = x0; x < x1; x += 1) {
      const px = img.pixel(x, y)
      if (px[0] + px[1] + px[2] < 600) ink += 1
    }
    if (ink >= 4) {
      const shot = crop(join(TMP, screenshot), `${name}-ink.png`, card.x - 10, card.y - 8, card.w + 20, Math.max(70, y - card.y + 40))
      return { top: y, offset: Math.round((y - y0) * 10) / 10, crop: shot }
    }
  }
  return { top: null, offset: null, crop: null }
}

const beforeInk = inkTop('pre67/full-on.png', pre.on.base.composerRow.card, 'item6-before')
const afterInk = inkTop('final/full-on.png', after.base.composerRow.card, 'item6-after')

/* ---- composer assertions (M11-6 / M11-7) -------------------------------- */
const pickRow = (record) => {
  const items = record.base.composerRow.items
  const plus = items[0]
  const probe = items.find((item) => item.probe) ?? null
  const pill = items.find((item) => item.cls.includes('chatgpt-model-pill')) ?? null
  const send = items[items.length - 1]
  const spread = (list) => {
    const values = list.filter(Boolean).map((item) => item.center)
    return values.length === 0 ? null : Math.round((Math.max(...values) - Math.min(...values)) * 10) / 10
  }
  const gap = (left, right) => (left === null || right === null ? null : Math.round((right.rect.x - left.rect.right) * 10) / 10)
  return {
    plus,
    probe,
    pill,
    send,
    centers: [plus, probe, pill, send].filter(Boolean).map((item) => item.center),
    spread: spread([plus, probe, pill, send]),
    gapProbeToPill: gap(probe, pill),
    gapPillToSend: gap(pill, send),
    chipHeight: probe?.rect.h ?? null,
    chipRadius: probe?.style['border-radius'] ?? null,
    chipFont: probe?.style['font-size'] ?? null,
    pillHeight: pill?.rect.h ?? null
  }
}
const beforeRow = pickRow(pre.on)
const afterRow = pickRow(after)

assertions.push({
  id: 'A6-padding',
  claim: '卡片上沿到首行文字 ≤ 参考 + 2px',
  pass: afterInk.offset !== null && afterInk.offset <= REFERENCE_CARD_TO_TEXT + 2,
  detail: { reference: REFERENCE_CARD_TO_TEXT, before: beforeInk.offset, after: afterInk.offset }
})

const gapSpread = [afterRow.gapProbeToPill, afterRow.gapPillToSend].filter((value) => value !== null)
assertions.push({
  id: 'A7-row',
  claim: '底部行各元素垂直中心线差 ≤ 1px，相邻间距差 ≤ 2px',
  pass:
    afterRow.spread !== null &&
    afterRow.spread <= 1 &&
    (gapSpread.length < 2 || Math.max(...gapSpread) - Math.min(...gapSpread) <= 2) &&
    afterRow.chipHeight === afterRow.pillHeight,
  detail: {
    centersBefore: beforeRow.centers,
    centersAfter: afterRow.centers,
    spreadBefore: beforeRow.spread,
    spreadAfter: afterRow.spread,
    gapsBefore: [beforeRow.gapProbeToPill, beforeRow.gapPillToSend],
    gapsAfter: [afterRow.gapProbeToPill, afterRow.gapPillToSend],
    chipBefore: { height: beforeRow.chipHeight, radius: beforeRow.chipRadius, font: beforeRow.chipFont },
    chipAfter: { height: afterRow.chipHeight, radius: afterRow.chipRadius, font: afterRow.chipFont },
    pillHeight: afterRow.pillHeight
  }
})

/** Full-page screenshots give identical framing for all three states. */
const fromFull = (state, tag, name, box) =>
  crop(join(TMP, state, `full-${tag}.png`), `${name}-${state}-${tag}.png`, box.x, box.y, box.w, box.h)

const frame1 = (record) => {
  const column = record.base.width.column
  return { x: column.x - 24, y: record.base.spacing.procRow.y - 22, w: column.w + 48, h: 132 }
}
const frame2 = (record) => {
  const card = record.base.composer.card
  return { x: card.x - 16, y: card.y - 12, w: card.w + 32, h: 1000 - (card.y - 12) }
}

const item1 = {
  native: fromFull('final', 'off', 'item1', frame1(native)),
  before: fromFull('before', 'on', 'item1', frame1(prior)),
  after: fromFull('final', 'on', 'item1', frame1(after))
}
const item2 = {
  native: fromFull('final', 'off', 'item2', frame2(native)),
  before: fromFull('before', 'on', 'item2', frame2(prior)),
  after: fromFull('final', 'on', 'item2', frame2(after))
}
const item3 = {
  native: join(TMP, 'final/item3-diff-off.png'),
  before: join(TMP, 'before/item3-diff-on.png'),
  after: join(TMP, 'final/item3-diff-on.png')
}
const item4 = {
  native: join(TMP, 'final/item4-width-off.png'),
  before: join(TMP, 'before/item4-width-on.png'),
  after: join(TMP, 'final/item4-width-on.png')
}
const item5 = {
  native: join(TMP, 'final/item5-hover-off.png'),
  before: join(TMP, 'before/item5-hover-on.png'),
  after: join(TMP, 'final/item5-hover-on.png')
}

const referenceComposer = crop(join(ROOT, REFERENCE_COMPOSER.file), 'item6-reference.png', REFERENCE_COMPOSER.x, REFERENCE_COMPOSER.y, REFERENCE_COMPOSER.w, REFERENCE_COMPOSER.h)
// The whole card, polled from its own top edge: the fix moves that edge, so a
// fixed-y crop would frame a different slice in each state.
const item6 = {
  native: referenceComposer,
  before: join(TMP, 'pre67/item6-composer-padding-on.png'),
  after: join(TMP, 'final/item6-composer-padding-on.png')
}
const item7 = {
  native: crop(join(ROOT, REFERENCE_COMPOSER.file), 'item7-reference.png', REFERENCE_COMPOSER.x, REFERENCE_COMPOSER.y + 40, REFERENCE_COMPOSER.w, 100),
  before: join(TMP, 'pre67/item7-composer-row-on.png'),
  after: join(TMP, 'final/item7-composer-row-on.png')
}

/* ---- sheets ------------------------------------------------------------ */
const px = (value) => `${Math.round(value * 10) / 10}`
const fpx = (value) => (value === null || value === undefined ? '—' : `${Math.round(value * 10) / 10}`)

const sheets = [
  {
    id: 'm11-1-spacing',
    title: 'M11-1 · 「已完成，用时 X」与正文之间的间距',
    sub: '根因：30-chat.css 给 Host 的过程组包装 `.O_Ebla_root`（[data-step-process]）加了 `margin-top: 10px`，并把过程行按钮从原生 `height: calc(33px + delta)` + 8px 下内边距压成 24px。',
    images: item1,
    fixed: '16px',
    notes: { native: `${px(gapNative)}px`, before: `${px(prior.base.spacing.gapProcToStep)}px`, after: `${px(gapAfter)}px` },
    rows: [
      ['原生 → 修复前 → 修复后 间距', `${px(gapNative)}`, `${px(prior.base.spacing.gapProcToStep)}`, `${px(gapAfter)}`],
      ['过程行高度（含原生下内边距）', '33', '24', '33'],
      ['过程组 margin-top', '0', '10', '0']
    ]
  },
  {
    id: 'm11-2-composer',
    title: 'M11-2 · 输入卡与窗口底部之间的空白',
    sub: '根因：65-work-card.css 给卡片预留了 `margin-bottom: 48px` 给「绝对定位工具条」，标准模式并不渲染该工具条，48px 成了纯空白；原生统计行紧贴卡片。',
    images: item2,
    fixed: '4px',
    notes: { native: `${px(cardNative)}px`, before: `${px(prior.base.composer.gapCardToStat)}px`, after: `${px(cardAfter)}px` },
    rows: [
      ['卡片 → 统计行', `${px(cardNative)}`, `${px(prior.base.composer.gapCardToStat)}`, `${px(cardAfter)}`],
      ['统计行 → 窗口底', `${px(bottomNative)}`, `${px(prior.base.composer.gapStatToBottom)}`, `${px(bottomAfter)}`],
      ['卡片 margin-bottom', '0', '48', '0'],
      ['卡片宽度（列宽 + 32）', px(native.base.composer.card.w), px(prior.base.composer.card.w), px(after.base.composer.card.w)]
    ]
  },
  {
    id: 'm11-3-diff',
    title: 'M11-3 · 「修改内容」变更卡与 diff 内部栅格',
    sub: '根因：`[data-chat-flow-kind="turn-tail"] button` 与两个 slot 的 `button` 规则（28×28、padding 0）命中了变更卡的 header/文件行按钮，把整卡压成 28px；diff 本身是原生四列栅格。',
    images: item3,
    fixed: '按钮 100% 宽',
    notes: { native: `header ${px(headNative)}`, before: `header 28`, after: `header ${px(headAfter)}` },
    rows: [
      ['卡片 header 宽度', `${px(headNative)}`, '28', `${px(headAfter)}`],
      ['header / 卡片', `${Math.round(ratio(headNative, native.base.diff.card.w) * 100)}%`, '4%', `${Math.round(ratio(headAfter, cardWidthAfter) * 100)}%`],
      ['文件名宽度', native.base.diff.pathWidths.map(px).join(' / '), '0 / 0', after.base.diff.pathWidths.map(px).join(' / ')],
      ['行号列 / 代码列（矩形相交）', '否', '否', noOverlap ? '否' : '是'],
      ['行号列宽 · 对齐 · 字体', '38.5 · right · 等宽', '38.5 · right · 等宽', `${px(numAfter?.rect.w ?? 0)} · ${numAfter?.align} · 等宽`]
    ]
  },
  {
    id: 'm11-4-width',
    title: 'M11-4 · 列宽拖拽（宿主 inline 宽度被硬编码覆盖）',
    sub: '根因：皮肤把 `--dsh-chat-content-width` 重指为 760px，并给 `.EvIC1a_column` 写死 `max-width: 760px`；宿主拖拽只写 `--dsh-chat-user-width`，于是宽度恒定、拖拽看起来失效。',
    images: item4,
    fixed: '−166px',
    notes: {
      native: `${px(native.drag.before.width)} → ${px(native.drag.after?.width ?? 0)}`,
      before: `${px(prior.drag.before.width)} → ${px(prior.drag.after?.width ?? 0)}`,
      after: `${px(after.drag.before.width)} → ${px(after.drag.after?.width ?? 0)}`
    },
    rows: [
      ['拖拽前列宽', px(native.drag.before.width), px(prior.drag.before.width), px(after.drag.before.width)],
      ['拖拽后列宽', px(native.drag.after?.width ?? 0), px(prior.drag.after?.width ?? 0), px(after.drag.after?.width ?? 0)],
      ['Δ', px(dragNative), px(prior.drag.delta ?? 0), px(dragAfter)],
      ['刷新后列宽', px(nativeReport.persisted.width), px(prior.drag.after?.width ?? 0), px(final.persisted.width)],
      ['localStorage 偏好', '640', '640（未生效）', '640']
    ]
  },
  {
    id: 'm11-5-hover',
    title: 'M11-5 · 「已完成」与展开条目的 hover 反馈',
    sub: '根因：过程行/展开行的 `:hover` 写了 `background: var(--cgpt-surface-hover)`，hover 时刷出一整块底色；原生只提亮文字与图标。',
    images: item5,
    fixed: '仅文字变色',
    notes: {
      native: '背景 · 不变',
      before: '背景 · 变灰块',
      after: '背景 · 不变'
    },
    rows: [
      ['hover 背景色', native.hover.hovered.background, prior.hover.hovered.background, after.hover.hovered.background],
      ['静止文字色', native.hover.idle.color, prior.hover.idle.color, after.hover.idle.color],
      ['hover 文字色', native.hover.hovered.color, prior.hover.hovered.color, after.hover.hovered.color],
      ['图标随文字变色', '是', '是（并有底色）', '是']
    ]
  },
  {
    id: 'm11-6-composer-padding',
    title: 'M11-6 · 输入卡首行文字上方的空行',
    sub: '根因：65-work-card.css 的 Work 占位符用 `display: block` 的 ::after 画中文文案，零宽基座文字先占掉一个 26px 行盒，占位文字被推到第二行；input 与滚动容器又各留了 `min-height: 52px` 给这行空洞。参考是单行胶囊，文字距卡片上沿 21.5px。',
    images: item6,
    layout: 'stack',
    fixed: '20px',
    notes: {
      native: `${px(REFERENCE_CARD_TO_TEXT)}px`,
      before: `${px(beforeInk.offset)}px`,
      after: `${px(afterInk.offset)}px`
    },
    rows: [
      ['卡片上沿 → 首行文字', px(REFERENCE_CARD_TO_TEXT), px(beforeInk.offset), px(afterInk.offset)],
      ['首行文字 → 工具行', '—', px(pre.on.base.composerRow.gapTextToRow), px(after.base.composerRow.gapTextToRow)],
      ['输入区高度（一行）', '54', px(pre.on.base.composerRow.input.rect.h), px(after.base.composerRow.input.rect.h)],
      ['卡片高度', '55', px(pre.on.base.composerRow.card.h), px(after.base.composerRow.card.h)]
    ]
  },
  {
    id: 'm11-7-composer-row',
    title: 'M11-7 · 底部工具行的 400K / 模型 / 发送对齐',
    sub: '根因：`400K` 是宿主 slot 注入的裸文本（14px、label-primary、无高度无圆角），行内间距被写成 5px，且发送键前多出一个 0×0 的空 activity 座位（再多一跳 8px）。参考行内元素同中心线、间距 8–12px。',
    images: item7,
    layout: 'stack',
    fixed: '8px · 同中心线',
    notes: {
      native: '中心线一致',
      before: `${fpx(beforeRow.gapProbeToPill)} / ${fpx(beforeRow.gapPillToSend)}`,
      after: `${fpx(afterRow.gapProbeToPill)} / ${fpx(afterRow.gapPillToSend)}`
    },
    rows: [
      ['400K 高度 · 圆角', '文本', `${fpx(beforeRow.chipHeight)} · ${beforeRow.chipRadius}`, `${fpx(afterRow.chipHeight)} · ${afterRow.chipRadius}`],
      ['400K 字号 · 颜色', '—', `${beforeRow.chipFont} · label-primary`, `${afterRow.chipFont} · secondary`],
      ['400K → 模型 间距', '—', fpx(beforeRow.gapProbeToPill), fpx(afterRow.gapProbeToPill)],
      ['模型 → 发送 间距', '—', fpx(beforeRow.gapPillToSend), fpx(afterRow.gapPillToSend)],
      ['行内元素中心线差', '0.5', fpx(beforeRow.spread), fpx(afterRow.spread)]
    ]
  }
]

const { chromium } = await import(join(PLAYWRIGHT, 'index.mjs'))
const browser = await chromium.launch({ headless: true, executablePath: CHROME, args: CHROME_ARGS })
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 240 }, deviceScaleFactor: 1 })
  for (const spec of sheets) {
    const shot = (path, maxWidth = 508) => {
      const img = readPng(path)
      // The reference is a 2x capture: halve it so both sides read at the CSS scale.
      const native = img.width > 1000 ? 0.5 : 1
      const scale = Math.min(native, maxWidth / img.width)
      return `<img src="data:image/png;base64,${readFileSync(path).toString('base64')}" style="width:${Math.round(img.width * scale)}px">`
    }
    const panels = [
      ['native', '原生 · 皮肤关闭（宿主渲染）', '', ''],
      ['before', '修复前 · 皮肤开启', 'before', ''],
      ['after', '修复后 · 皮肤开启', 'after', '']
    ]
    await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>
      html,body{margin:0;background:#f4f4f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif;color:#0d0d0d}
      .frame{box-sizing:border-box;width:1600px;padding:18px 24px 16px;background:#f4f4f4}
      h1{margin:0;font-size:19px;font-weight:650;letter-spacing:.01em}
      .sub{margin-top:5px;font-size:12px;line-height:1.5;color:#5c5c5c;max-width:1540px}
      .grid{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-top:12px;align-items:start}
      .card{background:#fff;border:1px solid #ddd;border-radius:10px;overflow:hidden}
      .cap{display:flex;align-items:center;gap:7px;height:30px;padding:0 11px;font-size:11px;color:#555;border-bottom:1px solid #eee}
      .cap .lbl{flex:none}.cap .note{margin-left:auto;font-variant-numeric:tabular-nums;color:#8a6d1f;font-weight:600}
      .dot{width:7px;height:7px;border-radius:50%;background:#8f8f8f}.dot.before{background:#c4553d}.dot.after{background:#10a37f}
      .shot{display:flex;align-items:flex-start;justify-content:center;background:#fcfcfc;padding:6px;box-sizing:border-box}
      .shot img{display:block;max-width:100%}
      table{border-collapse:collapse;font-size:11px;margin-top:12px;width:100%}
      th,td{border-bottom:1px solid #e6e6e6;padding:4px 8px;text-align:left}
      th{color:#777;font-weight:500}
      .changed{color:#9a5b13;font-weight:650}
      .final{color:#0d7a55;font-weight:650}
      .verd{margin-top:8px;font-size:11px;color:#0d7a55;font-weight:600}
      .stack{display:flex;flex-direction:column;gap:8px;margin-top:12px}
      .srow{display:flex;align-items:center;gap:12px;background:#fff;border:1px solid #ddd;border-radius:10px;padding:8px 12px}
      .srow .scap{flex:none;width:132px;font-size:11px;color:#555;display:flex;flex-direction:column;gap:4px}
      .srow .scap .dot{display:inline-block;margin-right:6px}
      .srow .snote{font-size:11px;color:#8a6d1f;font-weight:600;font-variant-numeric:tabular-nums}
      .srow img{display:block;max-width:1400px}
    </style></head><body><div class="frame">
      <h1>${spec.title}</h1>
      <div class="sub">${spec.sub}</div>
      ${spec.layout === 'stack'
        ? `<div class="stack">
            ${panels.map(([key, label, dot]) => `<div class="srow"><div class="scap"><span class="dot ${dot}"></span>${label}<span class="snote">${spec.notes[key]}</span></div>${shot(spec.images[key], 1400)}</div>`).join('')}
          </div>`
        : `<div class="grid">
            ${panels.map(([key, label, dot]) => `<div class="card"><div class="cap"><span class="dot ${dot}"></span><span class="lbl">${label}</span><span class="note">${spec.notes[key]}</span></div><div class="shot">${shot(spec.images[key])}</div></div>`).join('')}
          </div>`}
      <table><tr><th>测点</th><th>原生</th><th>修复前</th><th>修复后</th></tr>
        ${spec.rows.map(([name, a, b, c]) => `<tr><td>${name}</td><td>${a}</td><td class="${b === a ? '' : 'changed'}">${b}</td><td class="${c === a ? 'final' : 'changed'}">${c}</td></tr>`).join('')}
      </table>
      <div class="verd">✓ 修复后列（${spec.fixed}）与原生一致</div>
    </div></body></html>`)
    await page.waitForTimeout(120)
    await page.screenshot({ path: join(SHOTS, `${spec.id}.png`), fullPage: true })
    console.log(`wrote docs/screenshots/${spec.id}.png`)
  }
} finally {
  await browser.close()
}

const report = {
  generatedAt: new Date().toISOString(),
  viewport: final.viewport,
  source: {
    capture: 'scripts/m11-capture.mjs on an isolated DSH (token redacted) + fixture transcript test/fixtures/m11-llm',
    native: 'skin off (body[data-cgpt-skin] absent) in the same page context, same session',
    before: '.m11-tmp/before.json — captured with the pre-M11 CSS',
    nativePersistence: '.m11-tmp/native.json — the skin-off drag + refresh probe',
    after: '.m11-tmp/final.json — captured with the fixed CSS'
  },
  values: {
    spacingGap: { native: gapNative, before: prior.base.spacing.gapProcToStep, after: gapAfter },
    composerPadding: {
      reference: REFERENCE_CARD_TO_TEXT,
      before: beforeInk.offset,
      after: afterInk.offset,
      inputHeight: { before: pre.on.base.composerRow.input.rect.h, after: after.base.composerRow.input.rect.h },
      cardHeight: { before: pre.on.base.composerRow.card.h, after: after.base.composerRow.card.h }
    },
    composerRow: {
      centers: { before: beforeRow.centers, after: afterRow.centers },
      spread: { reference: 0.5, before: beforeRow.spread, after: afterRow.spread },
      gaps: { before: [beforeRow.gapProbeToPill, beforeRow.gapPillToSend], after: [afterRow.gapProbeToPill, afterRow.gapPillToSend] },
      chip: { before: { h: beforeRow.chipHeight, radius: beforeRow.chipRadius, font: beforeRow.chipFont }, after: { h: afterRow.chipHeight, radius: afterRow.chipRadius, font: afterRow.chipFont } },
      pillHeight: afterRow.pillHeight
    },
    composerGap: { native: cardNative, before: prior.base.composer.gapCardToStat, after: cardAfter },
    composerStatToBottom: { native: bottomNative, before: prior.base.composer.gapStatToBottom, after: bottomAfter },
    diffHeaderWidth: { native: headNative, before: prior.base.diff.header.w, after: headAfter },
    diffNumberRect: numAfter?.rect ?? null,
    diffTextRect: textAfter?.rect ?? null,
    diffNumberColumn: { width: numAfter?.rect.w ?? null, align: numAfter?.align ?? null, font: numAfter?.font ?? null },
    diffGrid: after.diffHover.diff.lines[0]?.grid ?? null,
    columnWidth: {
      native: { start: native.drag.before.width, dragged: native.drag.after?.width ?? null, persisted: nativeReport.persisted.width },
      before: { start: prior.drag.before.width, dragged: prior.drag.after?.width ?? null },
      after: { start: after.drag.before.width, dragged: after.drag.after?.width ?? null, persisted: final.persisted.width }
    },
    hover: {
      native: { background: native.hover.hovered.background, idleColor: native.hover.idle.color, hoverColor: native.hover.hovered.color },
      before: { background: prior.hover.hovered.background, idleColor: prior.hover.idle.color, hoverColor: prior.hover.hovered.color },
      after: { background: after.hover.hovered.background, idleColor: after.hover.idle.color, hoverColor: after.hover.hovered.color }
    }
  },
  assertions,
  pass: assertions.every((entry) => entry.pass)
}
writeFileSync(join(ROOT, 'docs/m11-fixes.json'), `${JSON.stringify(report, null, 2)}\n`)
console.log(`wrote docs/m11-fixes.json (${assertions.filter((entry) => entry.pass).length}/${assertions.length} assertions pass)`)
if (!report.pass) {
  for (const entry of assertions.filter((item) => !item.pass)) console.error(`FAIL ${entry.id}: ${entry.claim} ${JSON.stringify(entry.detail)}`)
  process.exit(1)
}
