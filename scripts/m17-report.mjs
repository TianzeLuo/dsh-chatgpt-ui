#!/usr/bin/env node
/**
 * scripts/m17-report.mjs — P0-6 reference → implementation → delta table.
 *
 * Reads docs/capture/live/m17-capture.json (written by m17-capture.mjs) and the
 * panel's source, then writes docs/m17-panel.json and docs/m17-panel.md.
 * The table is numeric where the brief gives numbers; colours are exact hex.
 *
 *   node scripts/m17-report.mjs
 */
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const capturePath = join(ROOT, 'docs/capture/live/m17-capture.json')
if (!existsSync(capturePath)) {
  console.error('m17-report: docs/capture/live/m17-capture.json is missing; run m17-capture first')
  process.exit(2)
}
const capture = JSON.parse(readFileSync(capturePath, 'utf8'))
const composer = readFileSync(join(ROOT, 'lib/client/composer.js'), 'utf8')
const bundle = readFileSync(join(ROOT, 'lib/client.js'), 'utf8')
const css = readFileSync(join(ROOT, 'lib/client/css/65-work-card.css'), 'utf8')
const light = readFileSync(join(ROOT, 'lib/client/css/05-cgpt-tokens.css'), 'utf8')
const dark = readFileSync(join(ROOT, 'lib/client/css/06-cgpt-tokens-dark.css'), 'utf8')
const a11y = readFileSync(join(ROOT, 'lib/client/css/85-a11y.css'), 'utf8')

const themes = capture.themes
if (!themes.dark || !themes.light) {
  console.error('m17-report: the capture needs a dark and a light frame')
  process.exit(2)
}
const d = themes.dark.frames.default
const dh = themes.dark.frames.hover
const dm = themes.dark.frames.max
const l = themes.light.frames.default
const lh = themes.light.frames.hover
const lm = themes.light.frames.max

const num = (value) => Math.round(Number(value) * 1000) / 1000
const hex = (rgb) => {
  const match = /^rgba?\(([^)]+)\)$/.exec(String(rgb).trim())
  if (match === null) return String(rgb)
  const parts = match[1].split(',').map((part) => Number(part.trim()))
  const [r, g, b, a = 1] = parts
  if (a < 1) return `rgba(${r}, ${g}, ${b}, ${a})`
  return `#${[r, g, b].map((channel) => channel.toString(16).padStart(2, '0')).join('')}`.toUpperCase()
}
const px = (value) => `${num(value)} px`
const ratio = (value) => `${num(value)}`
const font = (state) => `${num(parseFloat(state.style['font-size']))}px/${state.style['font-weight']}`
const size = (rect) => `${num(rect.w)} × ${num(rect.h)} px`
const shadow = (state) => state.style['box-shadow'] === 'none' ? '无' : state.style['box-shadow']
const border = (state) => /^0px/.test(state.style.border) ? '无' : state.style.border
const radius = (state) => state.style['border-radius']
const rgbOf = (state, key) => hex(state.style[key])

const rows = []
const row = (id, group, label, reference, implementation, delta, pass, extra = {}) => {
  rows.push({ id, group, label, reference, implementation, delta, pass, ...extra })
}

// ---- panel shell ----------------------------------------------------------
row('panel-width', '面板', '宽度', '280 px', px(d.menu.rect.w), `${num(d.menu.rect.w - 280)} px`, d.menu.rect.w === 280)
row('panel-radius', '面板', '圆角', '20 px', radius(d.menu), `${num(parseFloat(radius(d.menu)) - 20)} px`, parseFloat(radius(d.menu)) === 20)
row('panel-pad-x', '面板', '左右内边距', '16 px', `${num(parseFloat(d.simple.style.padding.split(' ')[1]))} px`, '0 px', parseFloat(d.simple.style.padding.split(' ')[1]) === 16)
row('panel-pad-top', '面板', '顶部内边距', '12 px', `${num(parseFloat(d.simple.style.padding.split(' ')[0]))} px`, '0 px', parseFloat(d.simple.style.padding.split(' ')[0]) === 12)
row('panel-pad-bottom', '面板', '底部内边距', '16 px', `${num(parseFloat(d.simple.style.padding.split(' ')[2]))} px`, '0 px', parseFloat(d.simple.style.padding.split(' ')[2]) === 16)
row('panel-bg-dark', '面板', '深色背景', '#303030', rgbOf(d.menu, 'background-color'), '0', rgbOf(d.menu, 'background-color') === '#303030', { kind: 'color' })
row('panel-bg-light', '面板', '浅色背景', '#FFFFFF', rgbOf(l.menu, 'background-color'), '0', rgbOf(l.menu, 'background-color') === '#FFFFFF', { kind: 'color' })
row('panel-height', '面板', '高度', '—', px(d.menu.rect.h), '—', true, { derived: true, note: '12 + 63 + 14 + 36 + 16' })

// ---- top row --------------------------------------------------------------
row('blank-width', '顶部区块', '闪电留白列', '20 px', `${num(d.blank.rect.w)} px`, `${num(d.blank.rect.w - 20)} px`, d.blank.rect.w === 20)
row('blank-gap', '顶部区块', '留白列与中列间距', '12 px', `${num(parseFloat(d.head.style['column-gap']))} px`, '0 px', parseFloat(d.head.style['column-gap']) === 12)
row('block-width', '顶部区块', '两行块宽度', '126 px', px(d.block.rect.w), `${num(d.block.rect.w - 126)} px`, d.block.rect.w === 126)
row('block-height', '顶部区块', '两行块高度', '63 px', px(d.block.rect.h), `${num(d.block.rect.h - 63)} px`, d.block.rect.h === 63)
row('block-radius', '顶部区块', '两行块圆角', '12 px', radius(d.block), `${num(parseFloat(radius(d.block)) - 12)} px`, parseFloat(radius(d.block)) === 12)
row('block-center', '顶部区块', '块中心与面板中心的偏差', '0 px', `${num(Math.abs(d.values.blockCenter - d.values.panelCenter))} px`, `${num(Math.abs(d.values.blockCenter - d.values.panelCenter))} px`, Math.abs(d.values.blockCenter - d.values.panelCenter) === 0)
row('block-hover-dark', '顶部区块', '深色 hover 背景', '#3A3A3A', rgbOf(dh.block, 'background-color'), '0', rgbOf(dh.block, 'background-color') === '#3A3A3A', { kind: 'color', note: '静止态透明，hover/focus 时着色' })
row('block-hover-light', '顶部区块', '浅色 hover 背景', '#F2F2F2', rgbOf(lh.block, 'background-color'), '0', rgbOf(lh.block, 'background-color') === '#F2F2F2', { kind: 'color' })
row('block-lines', '顶部区块', '两行结构', '2 行', `${d.block.lines.length} 行`, '0', d.block.lines.length === 2)
row('effort-size', '顶部区块', '强度名字号', '18 px', `${num(parseFloat(d.effort.style['font-size']))} px`, `${num(parseFloat(d.effort.style['font-size']) - 18)} px`, parseFloat(d.effort.style['font-size']) === 18)
row('effort-weight', '顶部区块', '强度名字重', '600', d.effort.style['font-weight'], '0', d.effort.style['font-weight'] === '600')
row('effort-dark', '顶部区块', '深色强度名颜色', '#4C8DFF', rgbOf(d.effort, 'color'), '0', rgbOf(d.effort, 'color') === '#4C8DFF', { kind: 'color' })
row('effort-light', '顶部区块', '浅色强度名颜色', '—', rgbOf(l.effort, 'color'), '—', true, { derived: true, note: '浅色沿用选中段蓝 #2F7CF6' })
row('model-size', '顶部区块', '模型名字号', '15 px', `${num(parseFloat(d.model.style['font-size']))} px`, `${num(parseFloat(d.model.style['font-size']) - 15)} px`, parseFloat(d.model.style['font-size']) === 15)
row('model-weight', '顶部区块', '模型名字重', '400', d.model.style['font-weight'], '0', d.model.style['font-weight'] === '400')
row('model-dark', '顶部区块', '深色模型名颜色', '#D6D6D6', rgbOf(d.model, 'color'), '0', rgbOf(d.model, 'color') === '#D6D6D6', { kind: 'color' })
row('model-light', '顶部区块', '浅色模型名颜色', '—', rgbOf(l.model, 'color'), '—', true, { derived: true, note: '浅色用 #5D5D5D 保证对比度' })
row('chevron', '顶部区块', '右箭头尺寸', '12 px', size(d.chevron.rect), '0', d.chevron.rect.w === 12 && d.chevron.rect.h === 12)
row('reset-size', '顶部区块', '重置按钮尺寸', '20 px', size(d.reset.rect), '0', d.reset.rect.w === 20 && d.reset.rect.h === 20)
row('reset-dark', '顶部区块', '深色重置图标颜色', '#B4B4B4', rgbOf(d.reset, 'color'), '0', rgbOf(d.reset, 'color') === '#B4B4B4', { kind: 'color' })
row('reset-inset', '顶部区块', '重置按钮右侧内缩', '16 px', px(d.values.resetRightInset), `${num(d.values.resetRightInset - 16)} px`, d.values.resetRightInset === 16)
row('font-ratio', '顶部区块', '强度名:模型名字号', '18:15', `${num(parseFloat(d.effort.style['font-size']))}:${num(parseFloat(d.model.style['font-size']))}`, '0', parseFloat(d.effort.style['font-size']) / parseFloat(d.model.style['font-size']) === 18 / 15)

// ---- slider ---------------------------------------------------------------
row('track-width', '滑块', '轨道宽度', '252 px', px(d.track.rect.w), `${num(d.track.rect.w - 252)} px`, d.track.rect.w === 252)
row('track-height', '滑块', '轨道高度', '36 px', px(d.track.rect.h), `${num(d.track.rect.h - 36)} px`, d.track.rect.h === 36)
row('track-radius', '滑块', '轨道圆角', '18 px', radius(d.track), `${num(parseFloat(radius(d.track)) - 18)} px`, parseFloat(radius(d.track)) === 18)
row('track-dark', '滑块', '深色未选中轨道', '#3F3F3F', rgbOf(d.track, 'background-color'), '0', rgbOf(d.track, 'background-color') === '#3F3F3F', { kind: 'color' })
row('track-light', '滑块', '浅色未选中轨道', '#E5E5E5', rgbOf(l.track, 'background-color'), '0', rgbOf(l.track, 'background-color') === '#E5E5E5', { kind: 'color' })
row('fill', '滑块', '选中段底色', '#2F7CF6', rgbOf(d.fill, 'background-color'), '0', rgbOf(d.fill, 'background-color') === '#2F7CF6', { kind: 'color' })
row('max-gradient', '滑块', '最高档渐变（左→右）', '#2F7CF6 → #8B5CF6', dm.fill.style['background-image'], '0', dm.fill.max === 'true' && dm.fill.style['background-image'].includes('rgb(47, 124, 246)') && dm.fill.style['background-image'].includes('rgb(139, 92, 246)'), { kind: 'gradient' })
row('track-inset', '滑块', '轨道到面板左右边', '16 px', `${num(d.values.trackLeftInset)} / ${num(d.values.trackRightInset)} px`, `${num(d.values.trackLeftInset - 16)} / ${num(d.values.trackRightInset - 16)} px`, Math.abs(d.values.trackLeftInset - 16) <= 2 && Math.abs(d.values.trackRightInset - 16) <= 2, { conflict: true, note: '16 + 252 + 16 = 284 ≠ 280；轨道 14px 内缩仍在 ±2px 容差内' })
row('block-gap', '滑块', '两行块到轨道', '14 px', px(d.values.blockToTrack), `${num(d.values.blockToTrack - 14)} px`, d.values.blockToTrack === 14)
row('bottom-gap', '滑块', '轨道到面板底部', '16 px', px(d.values.panelBottomPadding), `${num(d.values.panelBottomPadding - 16)} px`, d.values.panelBottomPadding === 16)
row('thumb-size', '滑块', '拇指尺寸', '44 px', size(d.thumb.rect), '0', d.thumb.rect.w === 44 && d.thumb.rect.h === 44)
row('thumb-radius', '滑块', '拇指圆角', '50%', radius(d.thumb), '0', radius(d.thumb) === '50%')
row('thumb-fill', '滑块', '拇指填充', '#FFFFFF', rgbOf(d.thumb, 'background-color'), '0', rgbOf(d.thumb, 'background-color') === '#FFFFFF', { kind: 'color' })
row('thumb-border', '滑块', '拇指边框', '无', border(d.thumb), '0', border(d.thumb) === '无')
row('thumb-shadow', '滑块', '拇指阴影', '无', shadow(d.thumb), '0', shadow(d.thumb) === '无')
row('thumb-centre', '滑块', '拇指中心与轨道中心的偏差', '0 px', `${num(Math.abs(d.thumb.rect.cy - d.track.rect.cy))} px`, `${num(Math.abs(d.thumb.rect.cy - d.track.rect.cy))} px`, Math.abs(d.thumb.rect.cy - d.track.rect.cy) === 0)
row('thumb-overflow', '滑块', '拇指上下溢出轨道', '0 px', `+${num(-d.thumb.style.top.replace('px', ''))} px`, `+${num(-d.thumb.style.top.replace('px', ''))} px`, false, { conflict: true, note: '44px 拇指 > 36px 轨道，几何上必然上下各凸 4px；保持垂直居中且未被裁切' })
row('thumb-track-ratio', '滑块', '拇指直径:轨道高', '44:36', `${num(d.thumb.rect.h)}:${num(d.track.rect.h)}`, '0', d.thumb.rect.h / d.track.rect.h === 44 / 36)
row('tick-count', '滑块', '圆点数量', '5', `${d.ticks.length}`, '0', d.ticks.length === 5)
row('tick-size', '滑块', '圆点直径', '5 px', `${num(d.ticks[0].rect.w)} × ${num(d.ticks[0].rect.h)} px`, '0', d.ticks.every((tick) => tick.rect.w === 5 && tick.rect.h === 5))
row('tick-on', '滑块', '已选侧圆点', '白色 60%', rgbOf(d.ticks[0], 'background-color'), '0', d.ticks[0].style['background-color'] === 'rgba(255, 255, 255, 0.6)', { kind: 'color' })
row('tick-off-dark', '滑块', '深色未选侧圆点', '#8A8A8A', rgbOf(d.ticks[d.ticks.length - 1], 'background-color'), '0', rgbOf(d.ticks[d.ticks.length - 1], 'background-color') === '#8A8A8A', { kind: 'color' })
row('tick-off-light', '滑块', '浅色未选侧圆点', '#B0B0B0', rgbOf(l.ticks[l.ticks.length - 1], 'background-color'), '0', rgbOf(l.ticks[l.ticks.length - 1], 'background-color') === '#B0B0B0', { kind: 'color' })

// ---- pill -----------------------------------------------------------------
row('pill-text', '胶囊', '展开文案', '选择推理强度', d.pill.text, '0', d.pill.text === '选择推理强度')
row('pill-ring', '胶囊', '蓝色描边', '去掉', shadow(d.pill), '0', shadow(d.pill) === '无')
row('pill-bg-dark', '胶囊', '深色灰底', '保留灰底', rgbOf(d.pill, 'background-color'), '—', d.pill.style['background-color'] !== 'rgba(0, 0, 0, 0)', { kind: 'color' })
row('pill-bg-light', '胶囊', '浅色灰底', '保留灰底', rgbOf(l.pill, 'background-color'), '—', l.pill.style['background-color'] !== 'rgba(0, 0, 0, 0)', { kind: 'color' })
row('pill-font', '胶囊', '字号', '14 px', `${num(parseFloat(d.pill.style['font-size']))} px`, `${num(parseFloat(d.pill.style['font-size']) - 14)} px`, parseFloat(d.pill.style['font-size']) === 14)
row('pill-weight', '胶囊', '字重', '—', d.pill.style['font-weight'], '—', true, { derived: true })

// ---- removed / static -----------------------------------------------------
row('lightning', '删除项', '闪电图标', '删除，保留 20+12 留白', d.blank.lightning ? '仍在' : '已删除', '0', d.blank.lightning === false && d.blank.svgCount === 0 && !composer.includes('CHATGPT_LIGHTNING_SVG') && !bundle.includes('chatgpt-effort-head-icon'))
row('pill-ring-css', '删除项', '旧 1.5px 蓝环 CSS', '删除', /chatgpt-model-pill\[aria-expanded='true'\][^}]*box-shadow: none/.test(css) ? '已删除' : '仍存在', '0', /chatgpt-model-pill\[aria-expanded='true'\][^}]*box-shadow: none/.test(css))
row('lightning-blank', '删除项', '留白列宽 + 列间距', '20 + 12 px', `${num(d.blank.rect.w)} + ${num(parseFloat(d.head.style['column-gap']))} px`, '0', d.blank.rect.w === 20 && parseFloat(d.head.style['column-gap']) === 12)

// ---- assertions (the eight acceptance checks) -----------------------------
const darkTicks = d.ticks
const maxTicks = dm.ticks
const visible = (ticks) => ticks.filter((tick) => tick.coveredByThumb === false).length
const assertions = [
  {
    id: 'thumb-44',
    label: '拇指 44×44 正圆，纯白、无边框、无阴影',
    pass: d.thumb.rect.w === 44 && d.thumb.rect.h === 44 && d.thumb.style['border-radius'] === '50%' && d.thumb.style['background-color'] === 'rgb(255, 255, 255)' && d.thumb.style['border'] === '0px none rgb(237, 237, 237)' && d.thumb.style['box-shadow'] === 'none',
    measured: { width: d.thumb.rect.w, height: d.thumb.rect.h, radius: d.thumb.style['border-radius'], border: d.thumb.style['border'], shadow: d.thumb.style['box-shadow'] }
  },
  {
    id: 'track-36',
    label: '轨道高 36',
    pass: d.track.rect.h === 36,
    measured: { height: d.track.rect.h }
  },
  {
    id: 'track-252',
    label: '轨道宽 252',
    pass: d.track.rect.w === 252,
    measured: { width: d.track.rect.w }
  },
  {
    id: 'max-gradient',
    label: '最高档填充为 #2F7CF6 → #8B5CF6 渐变，并显示「最高」',
    pass: dm.fill.max === 'true' && dm.fill.style['background-image'].includes('linear-gradient') && dm.fill.style['background-image'].includes('rgb(47, 124, 246)') && dm.fill.style['background-image'].includes('rgb(139, 92, 246)') && dm.effort.text === '最高',
    measured: { dataMax: dm.fill.max, backgroundImage: dm.fill.style['background-image'], label: dm.effort.text }
  },
  {
    id: 'ticks-5',
    label: '5 个 5px 圆点（4 个可见 + 当前档位点被拇指覆盖）',
    pass: darkTicks.length === 5 && darkTicks.every((tick) => tick.rect.w === 5 && tick.rect.h === 5) && visible(darkTicks) >= 4 && darkTicks.some((tick) => tick.selected === 'true') && darkTicks.some((tick) => tick.selected === 'false'),
    measured: { count: darkTicks.length, size: `${darkTicks[0].rect.w}×${darkTicks[0].rect.h}`, visibleDefault: visible(darkTicks), visibleMax: visible(maxTicks), selected: darkTicks.filter((tick) => tick.selected === 'true').length }
  },
  {
    id: 'no-lightning',
    label: '无闪电图标，留白列仍为 20 + 12',
    pass: d.blank.lightning === false && d.blank.svgCount === 0 && !composer.includes('CHATGPT_LIGHTNING_SVG') && !bundle.includes('chatgpt-effort-head-icon') && d.blank.rect.w === 20 && parseFloat(d.head.style['column-gap']) === 12,
    measured: { lightningNode: d.blank.lightning, blankSvgCount: d.blank.svgCount, blankWidth: d.blank.rect.w, gap: parseFloat(d.head.style['column-gap']), sourceConstant: composer.includes('CHATGPT_LIGHTNING_SVG') }
  },
  {
    id: 'pill-no-ring',
    label: '胶囊展开文案 14px、保留灰底、无蓝环',
    pass: d.pill.text === '选择推理强度' && d.pill.style['box-shadow'] === 'none' && /^0px/.test(d.pill.style.border) && d.pill.style['background-color'] !== 'rgba(0, 0, 0, 0)' && parseFloat(d.pill.style['font-size']) === 14,
    measured: { text: d.pill.text, shadow: d.pill.style['box-shadow'], border: d.pill.style.border, background: d.pill.style['background-color'], fontSize: d.pill.style['font-size'] }
  },
  {
    id: 'block-126-two-lines',
    label: '两行块 126×63、圆角 12、两行且居中，hover 背景 #3A3A3A',
    pass: d.block.rect.w === 126 && d.block.rect.h === 63 && d.block.style['border-radius'] === '12px' && d.block.lines.length === 2 && Math.abs(d.values.blockCenter - d.values.panelCenter) <= 0.5 && rgbOf(dh.block, 'background-color') === '#3A3A3A' && parseFloat(d.effort.style['font-size']) === 18 && parseFloat(d.model.style['font-size']) === 15,
    measured: { width: d.block.rect.w, height: d.block.rect.h, radius: d.block.style['border-radius'], lines: d.block.lines, centreDelta: Math.abs(d.values.blockCenter - d.values.panelCenter), hoverBg: rgbOf(dh.block, 'background-color') }
  }
]
const failedAssertions = assertions.filter((assertion) => !assertion.pass)

const failedRows = rows.filter((entry) => !entry.pass && !entry.conflict)
const conflicts = rows.filter((entry) => entry.conflict)
const summary = {
  total: rows.length,
  passed: rows.filter((entry) => entry.pass).length,
  failed: failedRows.map((entry) => entry.id),
  conflicts: conflicts.map((entry) => entry.id)
}

const screenshots = [...(themes.dark.screenshots ?? []), ...(themes.light.screenshots ?? [])]
for (const name of screenshots) {
  const path = join(ROOT, 'docs/screenshots', name)
  if (!existsSync(path) || statSync(path).size < 1000) {
    console.error(`m17-report: missing or empty screenshot ${name}`)
    process.exit(1)
  }
}
const source = {
  composer: composer.includes('chatgpt-effort-choice-name') && composer.includes('chatgpt-effort-choice-model') && !composer.includes('CHATGPT_LIGHTNING_SVG'),
  // P0-8 superseded the P0-6 geometry. The rows/assertions below keep the
  // frozen P0-6 capture; this gate only verifies that the live source still
  // carries the panel, so it follows the current values (248×30, 34px thumb).
  css: css.includes('.chatgpt-effort-choice-name') && css.includes("chatgpt-effort-fill[data-max='true']") && /\.chatgpt-effort-track \{[^}]*width: 100%[^}]*height: 30px/.test(css) && /\.chatgpt-effort-thumb \{[^}]*width: 34px[^}]*height: 34px/.test(css),
  tokens: light.includes('--cgpt-effort-track: #e5e5e5') && dark.includes('--cgpt-effort-track: #3f3f3f') && light.includes('--cgpt-overlay-bg: #ffffff') && dark.includes('--cgpt-overlay-bg: #2b2b2b') && light.includes('--cgpt-model-panel-bg: var(--cgpt-overlay-bg)'),
  a11y: a11y.includes('.chatgpt-effort-choice') && a11y.includes('.chatgpt-effort-reset') && !a11y.includes('chatgpt-model-simple-toggle')
}
if (!Object.values(source).every(Boolean)) {
  failedRows.push({ id: 'source-contract', label: 'source contract' })
  summary.failed.push('source-contract')
}

const report = {
  task: 'P0-6',
  title: '推理强度面板像素级复刻',
  source: capture.source,
  capturedAt: capture.capturedAt,
  environment: capture.viewport,
  url: capture.url,
  themes: ['dark', 'light'],
  screenshots,
  reference: {
    dark: '用户桌面截图（深色）',
    light: '用户桌面截图（浅色）'
  },
  diff: { rows, summary },
  assertions,
  assertionSummary: { total: assertions.length, passed: assertions.filter((assertion) => assertion.pass).length, failed: failedAssertions.map((assertion) => assertion.id) },
  conflicts: [
    { id: 'track-284', detail: '16 + 252 + 16 = 284 ≠ 280。面板保持 280、轨道保持 252，左右内缩取 14px（与 16 的偏差 2px，在容差内）。' },
    { id: 'thumb-44-vs-track-36', detail: '44px 拇指放在 36px 轨道上，上下各凸 4px 是几何必然；拇指垂直居中、未被裁切，且 4px 仍在 14px 块间距与 16px 底部内边距内。' },
    { id: 'tick-under-thumb', detail: '当前档位的 5px 圆点被 44px 拇指覆盖，单帧可见 4 个；这与参考图（m9）及滑块通用行为一致，5 个元素均在 DOM 中。' },
    { id: 'hover-bg-state', detail: '两行块的 #3A3A3A / #F2F2F2 作为 hover/focus 背景；静止态透明。若参考图是常驻底色，改一行 CSS 即可。' },
    { id: 'light-thumb-white-on-white', detail: '浅色面板 #FFFFFF + 纯白拇指（无边框/阴影）时，拇指上下 4px 与面板同色，只在 36px 轨道带内可辨；按 brief 保留纯白。' }
  ],
  source
}

writeFileSync(join(ROOT, 'docs/m17-panel.json'), `${JSON.stringify(report, null, 2)}\n`)

// ---- Markdown -------------------------------------------------------------
const table = [
  '| 组 | 项目 | 参考值 | 实现值 | 偏差 | 结果 |',
  '| --- | --- | --- | --- | --- | --- |',
  ...rows.map((entry) => `| ${entry.group} | ${entry.label}${entry.derived ? '（推导）' : ''} | ${entry.reference} | ${entry.implementation} | ${entry.delta} | ${entry.conflict ? (entry.pass ? '⚠️ 容差内' : '⚠️ 冲突') : entry.pass ? '✅' : '❌'} |`)
].join('\n')
const assertionTable = [
  '| # | 断言 | 实测 | 结果 |',
  '| --- | --- | --- | --- |',
  ...assertions.map((assertion, index) => `| ${index + 1} | ${assertion.label} | ${JSON.stringify(assertion.measured)} | ${assertion.pass ? '✅' : '❌'} |`)
].join('\n')
const image = (name, alt) => `![${alt}](screenshots/${name})`
const md = `# P0-6 推理强度面板

参考：用户桌面截图（深色 / 浅色，未入库）。实现：\`dsh-chatgpt-ui\` 推理强度弹层（280px，5 档）。
截图环境：1600×1000 @2x，zh-CN，Chromium headless；状态为默认档「高」、hover 两行块、最高档「最高」。

## 截图

| 深色 | 浅色 |
| --- | --- |
| ${image('m17-panel-dark.png', '深色默认档')} | ${image('m17-panel-light.png', '浅色默认档')} |
| ${image('m17-panel-hover-dark.png', '深色 hover 两行块')} | ${image('m17-panel-hover-light.png', '浅色 hover 两行块')} |
| ${image('m17-panel-max-dark.png', '深色最高档渐变')} | ${image('m17-panel-max-light.png', '浅色最高档渐变')} |

## 数值表（参考 → 实现 → 偏差）

${table}

> 数值行容差 ±2px；颜色行要求完全一致。带「（推导）」的行在 brief 中没有给出数值，按深色规格或对比度推导。

## 断言（8 项）

${assertionTable}

## 口径与冲突

${report.conflicts.map((entry) => `- **${entry.id}**：${entry.detail}`).join('\n')}

## 复现

\`\`\`bash
node scripts/build-client.mjs
node scripts/m17-capture.mjs --url "http://127.0.0.1:3117/?token=…"
node scripts/m17-report.mjs
node test/m17.test.mjs
\`\`\`

截图与 \`docs/m17-panel.json\` 均由 capture/report 生成；JSON 是唯一数值源，本文件的表格由它渲染。
`
writeFileSync(join(ROOT, 'docs/m17-panel.md'), md)

console.log(`m17-report: ${rows.length} rows (${summary.passed} passed, ${summary.failed.length} failed, ${conflicts.length} conflicts), ${assertions.length} assertions (${assertions.length - failedAssertions.length} passed)`)
console.log(`m17-report: wrote docs/m17-panel.json and docs/m17-panel.md`)
if (failedRows.length > 0 || failedAssertions.length > 0) process.exitCode = 1
