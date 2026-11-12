#!/usr/bin/env node
/**
 * scripts/m13-report.mjs — assemble the P0-3 evidence table.
 *
 * Reads the reference composer block from docs/capture/live/model-panel.json
 * and the two live captures (m13-before.json / m13-after.json), then writes
 * docs/m13-composer.json with a reference → before → after → delta row per
 * item and the acceptance assertions. No browser, no live DSH.
 *
 *   node scripts/m13-report.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const LIVE = join(ROOT, 'docs/capture/live')
const load = (name) => JSON.parse(readFileSync(join(LIVE, name), 'utf8'))
const ref = load('model-panel.json')
const before = load('m13-before.json')
const after = load('m13-after.json')

const round = (value) => Math.round(Number(value) * 10) / 10
const num = (value) => Number.parseFloat(String(value))
const max = (values) => values.length === 0 ? 0 : Math.max(...values)
const near = (actual, expected, tolerance) => Math.abs(round(actual) - expected) <= tolerance

const refComposer = ref.themes.light.composer
const refComposerDark = ref.themes.dark.composer
const refCard = refComposer.card
const refCardDark = refComposerDark.card
const refEditor = refComposer.editor
const refRow = refComposer.row
const refTopGap = refComposer.topGap

const toolBand = (work) => work === null || work.tools === null
  ? null
  : {
      height: work.tools.rect.h,
      insetLeft: round(work.tools.rect.x - work.card.rect.x),
      insetRight: round(work.card.rect.r - work.tools.rect.r),
      buttonHeight: max(work.tools.buttons.map((button) => button.rect.h))
    }

const pillOpenRing = (work) => work === null || work.row === null ? null : {
  shadow: work.row.pill.style['box-shadow'],
  background: work.row.pill.style['background-color'],
  height: work.row.pill.rect.h
}

const theme = (capture, themeName) => {
  const row = capture.themes[themeName]
  return {
    work: row.work,
    workOpen: row.workOpen,
    chat: row.chat,
    ring: pillOpenRing(row.workOpen),
    tools: toolBand(row.work)
  }
}

const beforeLight = theme(before, 'light')
const afterLight = theme(after, 'light')
const beforeDark = theme(before, 'dark')
const afterDark = theme(after, 'dark')

const refRing = {
  width: 1.5,
  color: 'rgb(58, 131, 247)',
  note: '从 m12-ref-composer-light.png 药丸边缘取样：蓝环 ~1.5–2px，#3A83F7；P0-3 取 1.5px'
}
const refTools = {
  height: 48,
  buttonHeight: 36,
  insetLeft: 13,
  insetRight: 13,
  note: '从 docs/screenshots/m9-ref-work-short-light.png 像素扫描：灰带 741.5×48，两侧内缩 13，按钮 36'
}

const row = (id, label, referenceValue, beforeValue, implementationValue, options = {}) => {
  const delta = typeof referenceValue === 'number' && typeof implementationValue === 'number'
    ? round(implementationValue - referenceValue)
    : null
  return {
    id,
    label,
    reference: referenceValue,
    before: beforeValue,
    implementation: implementationValue,
    delta,
    tolerance: options.tolerance ?? null,
    pass: options.pass ?? (delta === null ? true : Math.abs(delta) <= (options.tolerance ?? 0)),
    ...(options.note === undefined ? {} : { note: options.note })
  }
}

const rows = [
  row('card-width', '卡片宽度（px）', refCard.rect.w, beforeLight.work.card.rect.w, afterLight.work.card.rect.w, { tolerance: 2 }),
  row('card-height', '卡片高度（px）', refCard.rect.h, beforeLight.work.card.rect.h, afterLight.work.card.rect.h, { tolerance: 2 }),
  row('card-radius', '卡片圆角（px）', num(refCard.style['border-radius']), num(beforeLight.work.card.style['border-radius']), num(afterLight.work.card.style['border-radius']), { tolerance: 0 }),
  row('card-shadow', '卡片阴影（参考三层）', refCard.style['box-shadow'], beforeLight.work.card.style['box-shadow'], afterLight.work.card.style['box-shadow'], { pass: afterLight.work.card.style['box-shadow'] === refCard.style['box-shadow'] }),
  row('card-to-editor', '卡上沿 → 编辑区（px）', refTopGap.cardToEditor, round(beforeLight.work.scroll.rect.y - beforeLight.work.card.rect.y), round(afterLight.work.scroll.rect.y - afterLight.work.card.rect.y), { tolerance: 1 }),
  row('editor-height', '编辑区高度（px）', refEditor.rect.h, beforeLight.work.scroll.rect.h, afterLight.work.scroll.rect.h, { tolerance: 2 }),
  row('glyph-top', '卡上沿 → 首行字形顶（px）', refTopGap.cardToGlyphTop, beforeLight.work.placeholder.topGap, afterLight.work.placeholder.topGap, { tolerance: 2 }),
  row('baseline', '卡上沿 → 文字基线（px）', refTopGap.cardToBaseline, beforeLight.work.placeholder.baselineGap, afterLight.work.placeholder.baselineGap, { tolerance: 2 }),
  row('row-height', '底行高度（px）', refRow.plus.h, beforeLight.work.row.rect.h, afterLight.work.row.rect.h, { tolerance: 0 }),
  row('row-center', '底行中心线距卡上沿（px）', round(refRow.plus.cy - refCard.rect.y), beforeLight.work.row.centerOffset, afterLight.work.row.centerOffset, { tolerance: 1 }),
  row('row-centers', '底行控件中心线最大偏差（px）', 0, max(beforeLight.work.row.centerDeltas), max(afterLight.work.row.centerDeltas), { tolerance: 1 }),
  row('gap-chip-pill', '400K → 药丸间距（px）', 8, beforeLight.work.row.gaps.chipToPill, afterLight.work.row.gaps.chipToPill, { tolerance: 2 }),
  row('gap-pill-send', '药丸 → 发送间距（px）', 8, beforeLight.work.row.gaps.pillToSend, afterLight.work.row.gaps.pillToSend, { tolerance: 2 }),
  row('add-inset', '+ 左内缩（px）', round(refRow.plus.x - refCard.rect.x), round(beforeLight.work.row.add.x - beforeLight.work.card.rect.x), round(afterLight.work.row.add.x - afterLight.work.card.rect.x), { tolerance: 2 }),
  row('send-inset', '发送键右内缩（px）', round(refCard.rect.r - refRow.voice.r), round(beforeLight.work.card.rect.r - beforeLight.work.row.send.r), round(afterLight.work.card.rect.r - afterLight.work.row.send.r), { tolerance: 2 }),
  row('pill-height', '模型药丸高度（px）', refRow.model.h, beforeLight.work.row.pill.rect.h, afterLight.work.row.pill.rect.h, { tolerance: 0 }),
  row('pill-radius', '模型药丸圆角（px）', 9999, num(beforeLight.work.row.pill.style['border-radius']), num(afterLight.work.row.pill.style['border-radius']), { tolerance: 0 }),
  row('pill-font', '模型药丸字号 · 字重', `${refRow.modelLabel['font-size']} / ${refRow.modelLabel['font-weight']}`, `${beforeLight.work.row.pill.style['font-size']} / ${beforeLight.work.row.pill.style['font-weight']}`, `${afterLight.work.row.pill.style['font-size']} / ${afterLight.work.row.pill.style['font-weight']}`, { pass: afterLight.work.row.pill.style['font-size'] === '14px' && afterLight.work.row.pill.style['font-weight'] === '500' }),
  row('pill-ring-open', '药丸打开态描边', '1.5px #3A83F7', beforeLight.ring.shadow, afterLight.ring.shadow, { pass: afterLight.ring.shadow.includes('0px 0px 0px 1.5px') && afterLight.ring.shadow.includes('rgb(58, 131, 247)') }),
  row('pill-ring-static', '药丸静止态边框', '无边框 · 浅灰', `${beforeLight.work.row.pill.style['border-color']} / ${beforeLight.work.row.pill.style['box-shadow']}`, `${afterLight.work.row.pill.style['border-color']} / ${afterLight.work.row.pill.style['box-shadow']}`, { pass: afterLight.work.row.pill.style['box-shadow'] === 'none' }),
  row('tools-height', '工具带高度（px）', refTools.height, beforeLight.tools.height, afterLight.tools.height, { tolerance: 0 }),
  row('tools-button-height', '工具按钮高度（px）', refTools.buttonHeight, beforeLight.tools.buttonHeight, afterLight.tools.buttonHeight, { tolerance: 0 }),
  row('tools-inset', '工具带两侧内缩（px）', `${refTools.insetLeft}/${refTools.insetRight}`, `${beforeLight.tools.insetLeft}/${beforeLight.tools.insetRight}`, `${afterLight.tools.insetLeft}/${afterLight.tools.insetRight}`, { pass: afterLight.tools.insetLeft === 13 && afterLight.tools.insetRight === 13 }),
  row('chat-height', 'Chat 卡片高度（px）', 52, beforeLight.chat.card.rect.h, afterLight.chat.card.rect.h, { tolerance: 0 }),
  row('chat-radius', 'Chat 卡片圆角（px）', 26, num(beforeLight.chat.card.style['border-radius']), num(afterLight.chat.card.style['border-radius']), { tolerance: 0 }),
  row('chat-tools', 'Chat 无工具带', '无', beforeLight.chat.tools === null ? '无' : '有', afterLight.chat.tools === null ? '无' : '有', { pass: afterLight.chat.tools === null })
]

const assertions = [
  {
    id: 'M13-A1',
    claim: '卡片宽高与参考差 ≤ 2px（768×127）',
    pass: near(afterLight.work.card.rect.w, refCard.rect.w, 2) && near(afterLight.work.card.rect.h, refCard.rect.h, 2),
    detail: {
      width: [refCard.rect.w, beforeLight.work.card.rect.w, afterLight.work.card.rect.w],
      height: [refCard.rect.h, beforeLight.work.card.rect.h, afterLight.work.card.rect.h]
    }
  },
  {
    id: 'M13-A2',
    claim: '字形顶与基线差 ≤ 2px（20 / 32.8）',
    pass: near(afterLight.work.placeholder.topGap, refTopGap.cardToGlyphTop, 2) && near(afterLight.work.placeholder.baselineGap, refTopGap.cardToBaseline, 2),
    detail: {
      glyphTop: [refTopGap.cardToGlyphTop, beforeLight.work.placeholder.topGap, afterLight.work.placeholder.topGap],
      baseline: [refTopGap.cardToBaseline, beforeLight.work.placeholder.baselineGap, afterLight.work.placeholder.baselineGap]
    }
  },
  {
    id: 'M13-A3',
    claim: '底行中心线偏差 ≤ 1px',
    pass: max(afterLight.work.row.centerDeltas) <= 1,
    detail: { deltas: afterLight.work.row.centerDeltas, max: max(afterLight.work.row.centerDeltas) }
  },
  {
    id: 'M13-A4',
    claim: '底行 36 高、相邻间距 8 / 8',
    pass: afterLight.work.row.rect.h === 36 && afterLight.work.row.gaps.chipToPill === 8 && afterLight.work.row.gaps.pillToSend === 8,
    detail: { height: afterLight.work.row.rect.h, gaps: afterLight.work.row.gaps }
  },
  {
    id: 'M13-A5',
    claim: '药丸打开态 1.5px 蓝环，静止态无边框无阴影',
    pass: afterLight.ring.shadow.includes('0px 0px 0px 1.5px') && afterLight.ring.shadow.includes('rgb(58, 131, 247)') && afterLight.work.row.pill.style['box-shadow'] === 'none',
    detail: { open: afterLight.ring.shadow, openFill: afterLight.ring.background, staticShadow: afterLight.work.row.pill.style['box-shadow'] }
  },
  {
    id: 'M13-A6',
    claim: 'Chat 卡片仍为 52 高 / 26 圆角，且无工具带',
    pass: afterLight.chat.card.rect.h === 52 && num(afterLight.chat.card.style['border-radius']) === 26 && afterLight.chat.tools === null,
    detail: { before: [beforeLight.chat.card.rect.h, beforeLight.chat.card.style['border-radius']], after: [afterLight.chat.card.rect.h, afterLight.chat.card.style['border-radius']] }
  },
  {
    id: 'M13-A7',
    claim: '浅深卡片阴影对齐参考（三层 / 内描边）',
    pass: afterLight.work.card.style['box-shadow'] === refCard.style['box-shadow'] && afterDark.work.card.style['box-shadow'] === refCardDark.style['box-shadow'],
    detail: { light: [refCard.style['box-shadow'], afterLight.work.card.style['box-shadow']], dark: [refCardDark.style['box-shadow'], afterDark.work.card.style['box-shadow']] }
  },
  {
    id: 'M13-A8',
    claim: '工具带 48 高、按钮 36、两侧 13',
    pass: afterLight.tools.height === 48 && afterLight.tools.buttonHeight === 36 && afterLight.tools.insetLeft === 13,
    detail: afterLight.tools
  }
]

const report = {
  task: 'tsk_3983b473b6',
  title: 'M13 · Work 输入卡几何对齐（768×127 / glyphTop 20 / 48px 差）',
  generatedAt: new Date().toISOString(),
  viewport: { width: 1600, height: 1000, dpr: 2 },
  sources: {
    reference: 'docs/capture/live/model-panel.json（chatgpt.com 实测，2026-11-05）',
    referenceRing: 'docs/capture/live/m12-ref-composer-light.png 像素取样',
    referenceTools: 'docs/screenshots/m9-ref-work-short-light.png 像素扫描',
    before: 'docs/capture/live/m13-before.json',
    after: 'docs/capture/live/m13-after.json'
  },
  reference: {
    light: {
      card: {
        width: refCard.rect.w,
        height: refCard.rect.h,
        radius: num(refCard.style['border-radius']),
        background: refCard.style['background-color'],
        shadow: refCard.style['box-shadow']
      },
      editor: {
        height: refEditor.rect.h,
        fontSize: refEditor.style['font-size'],
        lineHeight: refEditor.style['line-height'],
        padding: refEditor.style.padding
      },
      topGap: refTopGap,
      row: {
        height: refRow.plus.h,
        centerOffset: round(refRow.plus.cy - refCard.rect.y),
        addInset: round(refRow.plus.x - refCard.rect.x),
        pill: { height: refRow.model.h, radius: '9999px', font: refRow.modelLabel['font-size'], weight: refRow.modelLabel['font-weight'] }
      },
      ring: refRing,
      tools: refTools
    },
    dark: {
      card: {
        width: refCardDark.rect.w,
        height: refCardDark.rect.h,
        radius: num(refCardDark.style['border-radius']),
        background: refCardDark.style['background-color'],
        shadow: refCardDark.style['box-shadow']
      },
      editor: { height: refComposerDark.editor.rect.h },
      topGap: refComposerDark.topGap
    },
    chat: { height: 52, radius: 26, note: 'phase3/4b 验收值；本轮只回归不改' }
  },
  captures: {
    light: beforeLight,
    dark: beforeDark
  },
  implementation: {
    light: afterLight,
    dark: afterDark
  },
  diff: {
    rows,
    summary: {
      pass: rows.filter((entry) => entry.pass).length,
      total: rows.length,
      failed: rows.filter((entry) => !entry.pass).map((entry) => entry.id)
    }
  },
  assertions,
  assertionSummary: {
    pass: assertions.filter((entry) => entry.pass).length,
    total: assertions.length,
    failed: assertions.filter((entry) => !entry.pass).map((entry) => entry.id)
  },
  screenshots: [
    'docs/screenshots/m13-composer-light.png',
    'docs/screenshots/m13-composer-dark.png',
    'docs/screenshots/m13-chat-light.png',
    'docs/screenshots/m13-chat-dark.png',
    'docs/capture/live/m13-before-work-light.png',
    'docs/capture/live/m13-after-work-light.png',
    'docs/capture/live/m13-before-work-open-light.png',
    'docs/capture/live/m13-after-work-open-light.png',
    'docs/capture/live/m13-before-chat-light.png',
    'docs/capture/live/m13-after-chat-light.png'
  ],
  notes: [
    '参考卡 padding 为 0（内部 18/8 由子元素承担）；实现保留 15/18/8 的卡片内边距，可见几何与参考一致，不单列 padding 差值。',
    '参考底行右端是 mic + voice 两个 36 圆钮；DSH 只有一个 36 发送圆钮，因此“发送键贴右”按参考最右 voice 的 8px 内缩对齐，间距取 mic↔voice 的 8px。',
    '参考工具带在 768 卡片下沿之外（m9 像素扫描：741.5×48、两侧内缩 13、按钮 36）；本轮保持其位置，仅把 18px 内缩改成参考的 13px，未塞进 127px 卡内（卡内高度预算只容纳一条 36px 底行）。',
    '400K 是 DSH 独有控件，参考无对应项；继续沿用模型药丸的 36 / 9999 / 14 / 500 几何。'
  ]
}

writeFileSync(join(ROOT, 'docs', 'm13-composer.json'), `${JSON.stringify(report, null, 2)}\n`)
console.log(`m13-report: rows ${report.diff.summary.pass}/${report.diff.summary.total}, assertions ${report.assertionSummary.pass}/${report.assertionSummary.total}`)
if (report.diff.summary.failed.length > 0 || report.assertionSummary.failed.length > 0) {
  console.log('failed rows:', report.diff.summary.failed.join(', '))
  console.log('failed assertions:', report.assertionSummary.failed.join(', '))
  process.exitCode = 1
}
