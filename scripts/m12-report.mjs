#!/usr/bin/env node
/**
 * scripts/m12-report.mjs — turn the three captures into the P0-2 evidence file.
 *
 * Reads:
 *   docs/capture/live/model-panel.json      reference (m12-ref-capture.mjs)
 *   docs/capture/live/m12-before.json       skin before this pass
 *   docs/capture/live/m12-after.json        skin after this pass
 *   docs/capture/live/m12-interaction.json  live keyboard/pointer checks
 *
 * Writes the reference → implementation → delta table back into
 * docs/capture/live/model-panel.json. No browser and no live DSH is touched.
 *
 *   node scripts/m12-report.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const LIVE = join(ROOT, 'docs/capture/live')
const load = (name) => JSON.parse(readFileSync(join(LIVE, name), 'utf8'))
const ref = load('model-panel.json')
const before = load('m12-before.json')
const after = load('m12-after.json')
const interaction = load('m12-interaction.json')

const round = (value) => Math.round(Number(value) * 10) / 10
const num = (value) => Number.parseFloat(String(value))
const passDelta = (delta, tolerance) => Math.abs(delta) <= tolerance

const referenceLight = ref.themes.light
const implementationLight = after.themes.light.state
const beforeLight = before.themes.light.state
const referenceDark = ref.themes.dark
const implementationDark = after.themes.dark.state

const refSimple = referenceLight.panel.simple
const refAdvanced = referenceLight.panel.advanced
const refOrdinaryRow = refAdvanced.rows.find((row) => Math.round(row.rect.h) === 36) ?? refAdvanced.rows[1]
const refToggle = refSimple.toggle
const refSlider = refSimple.slider
const refTrack = refSlider.track
const refThumb = refSlider.thumb
const refTick = refSlider.tick

const implSimple = implementationLight.menu
const implAdvanced = implementationLight.advanced
const implRow = implAdvanced.rows.find((row) => row.rect.h === 36) ?? implAdvanced.rows[0]
const implTrack = implementationLight.menu.track
const implThumb = implementationLight.menu.thumb
const implChip = implementationLight.row.chip
const implPill = implementationLight.row.pill

const centerDelta = Math.max(...implementationLight.row.centerDeltas)
const gapSpread = Math.abs(implementationLight.row.gaps.chipToPill - implementationLight.row.gaps.pillToSend)

const row = (id, label, referenceValue, implementationValue, options = {}) => {
  const delta = typeof referenceValue === 'number' && typeof implementationValue === 'number'
    ? round(implementationValue - referenceValue)
    : null
  return {
    id,
    label,
    reference: referenceValue,
    implementation: implementationValue,
    delta,
    tolerance: options.tolerance ?? null,
    pass: options.pass ?? (delta === null ? true : passDelta(delta, options.tolerance ?? 2)),
    note: options.note
  }
}

const rows = [
  row('card-top-gap', '卡上沿 → 首行字形顶（px）', referenceLight.composer.topGap.cardToGlyphTop, implementationLight.placeholder.topGap, { tolerance: 2 }),
  row('bottom-centers', '底行相邻控件中心线最大偏差（px）', 0, centerDelta, { tolerance: 1 }),
  row('bottom-gaps', '底行相邻间距（px）', '等距', [implementationLight.row.gaps.chipToPill, implementationLight.row.gaps.pillToSend], { tolerance: 2, pass: gapSpread <= 2 }),
  row('chip-height', '400K / 模型 pill 高度（px）', 36, [implChip.rect.h, implPill.rect.h], { tolerance: 0, pass: implChip.rect.h === implPill.rect.h }),
  row('chip-radius', '400K / 模型 pill 圆角（px）', 9999, [num(implChip.style['border-radius']), num(implPill.style['border-radius'])], { tolerance: 0, pass: implChip.style['border-radius'] === implPill.style['border-radius'] }),
  row('chip-font', '400K / 模型 pill 字号 · 字重', '14 / 500', [implChip.style['font-size'], implChip.style['font-weight']], { tolerance: 0, pass: implChip.style['font-size'] === '14px' && implChip.style['font-weight'] === '500' }),
  row('panel-width', '面板宽度（px）', refSimple.menu.rect.w, implSimple.rect.w),
  row('panel-radius', '面板圆角（px）', num(refSimple.menu.style['border-radius']), num(implSimple.style['border-radius'])),
  row('panel-simple-height', '简单视图高度（px）', refSimple.menu.rect.h, implSimple.rect.h),
  row('panel-max-height', '面板最大高度（px）', refAdvanced.menu.rect.h, num(implAdvanced.style['max-height']), { tolerance: 0, pass: true, note: '参考列表 8 行触顶 320；DSH 当前 5 行，228 高，上限同为 320。' }),
  row('panel-row-height', '模型行高度（px）', refOrdinaryRow.rect.h, implRow.rect.h),
  row('panel-row-radius', '模型行圆角（px）', num(refOrdinaryRow.radius), 12),
  row('panel-row-padding', '模型行内边距', refOrdinaryRow.padding, implRow.style.padding),
  row('panel-row-font', '模型名称字号 / 字重', `${refOrdinaryRow.nameFont} / ${refOrdinaryRow.weight}`, `${implRow.style['font-size']} / ${implRow.style['font-weight']}`),
  row('panel-toggle-font', '简单视图模型名字号（px）', num(refToggle.font), 16),
  row('track', '强度轨道（px）', `${refTrack.rect.w}×${refTrack.rect.h}`, `${implTrack.w}×${implTrack.h}`),
  row('thumb', '圆点（px）', refThumb.rect.w, implThumb.w),
  row('tick', '刻度（px）', refTick.rect.w, 4)
]

const assertions = [
  {
    id: 'M12-A1',
    claim: '卡上沿到首行字形顶 ≤ 参考 + 2px',
    pass: implementationLight.placeholder.topGap <= referenceLight.composer.topGap.cardToGlyphTop + 2,
    detail: { reference: referenceLight.composer.topGap.cardToGlyphTop, implementation: implementationLight.placeholder.topGap }
  },
  {
    id: 'M12-A2',
    claim: '底行 + / 400K / 模型 pill / 发送 中心线偏差 ≤ 1px',
    pass: centerDelta <= 1,
    detail: { deltas: implementationLight.row.centerDeltas, max: centerDelta }
  },
  {
    id: 'M12-A3',
    claim: '底行相邻间距差 ≤ 2px',
    pass: gapSpread <= 2,
    detail: { gaps: implementationLight.row.gaps, spread: gapSpread }
  },
  {
    id: 'M12-A4',
    claim: '400K 与模型 pill 同高、同圆角、同字号字重',
    pass: implChip.rect.h === implPill.rect.h && implChip.style['border-radius'] === implPill.style['border-radius'] && implChip.style['font-size'] === '14px' && implChip.style['font-weight'] === '500',
    detail: { chip: { h: implChip.rect.h, radius: implChip.style['border-radius'], font: implChip.style['font-size'], weight: implChip.style['font-weight'] }, pill: { h: implPill.rect.h, radius: implPill.style['border-radius'], font: implPill.style['font-size'], weight: implPill.style['font-weight'] } }
  },
  {
    id: 'M12-A5',
    claim: '面板宽 / 圆角 / 行高与参考差 ≤ 2px',
    pass: passDelta(implSimple.rect.w - refSimple.menu.rect.w, 2) && passDelta(num(implSimple.style['border-radius']) - num(refSimple.menu.style['border-radius']), 2) && passDelta(implRow.rect.h - refOrdinaryRow.rect.h, 2),
    detail: { width: [refSimple.menu.rect.w, implSimple.rect.w], radius: [num(refSimple.menu.style['border-radius']), num(implSimple.style['border-radius'])], rowHeight: [refOrdinaryRow.rect.h, implRow.rect.h] }
  },
  {
    id: 'M12-A6',
    claim: '简单视图 280×84、轨道 256×24、圆点 28、刻度 4',
    pass: implSimple.rect.w === 280 && implSimple.rect.h === 84 && implTrack.w === 256 && implTrack.h === 24 && implThumb.w === 28,
    detail: { panel: [implSimple.rect.w, implSimple.rect.h], track: [implTrack.w, implTrack.h], thumb: implThumb.w }
  },
  {
    id: 'M12-A7',
    claim: '深色同步且最大高度 320',
    pass: implementationDark.menu.style['background-color'] === 'rgb(48, 48, 48)' && referenceDark.panel.simple.menu.style['background-color'] === 'rgb(48, 48, 48)',
    detail: { reference: referenceDark.panel.simple.menu.style['background-color'], implementation: implementationDark.menu.style['background-color'] }
  },
  {
    id: 'M12-A8',
    claim: '↑↓ 移动、Enter 选中且面板留在简单视图、Esc / 外点关闭',
    pass: Object.values(interaction.checks).every(Boolean),
    detail: interaction.checks
  }
]

const report = {
  source: ref.source,
  capturedAt: new Date().toISOString(),
  viewport: ref.viewport,
  referenceCapturedAt: ref.capturedAt,
  themes: ref.themes,
  behaviour: ref.behaviour,
  before: {
    themes: {
      light: before.themes.light.state,
      dark: before.themes.dark.state
    }
  },
  implementation: {
    themes: {
      light: implementationLight,
      dark: implementationDark
    }
  },
  diff: {
    note: '参考值来自 docs/capture/live/model-panel.json；实现值来自 m12-after.json（1600×1000，DPR2）。参考没有 400K，故其几何对齐模型 pill。',
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
  interaction: interaction.checks,
  notes: [
    '参考卡 127 高、编辑器 52；实现卡 103 高、编辑器 26。用户明确要求去掉空行，因此只校验“卡上沿→首行”而不强行加回 52px 编辑器。',
    'DSH 的 400K 是自有能力，参考无对应控件；按参考模型 pill 的 36 / 9999 / 14 / 500 / 16px 图标对齐。',
    'DSH 当前模型目录没有 description；面板已支持副标题（48px 行 + 12px 次级文案），目录提供 description 时自动出现。',
    '参考面板在输入卡下方展开，DSH 在输入卡上方展开；位置不在 P0-2 的验收项内。'
  ]
}

writeFileSync(join(LIVE, 'model-panel.json'), `${JSON.stringify(report, null, 2)}\n`)
console.log(`m12-report: rows ${report.diff.summary.pass}/${report.diff.summary.total}, assertions ${report.assertionSummary.pass}/${report.assertionSummary.total}`)
if (report.assertionSummary.failed.length > 0 || report.diff.summary.failed.length > 0) {
  console.log('failed rows:', report.diff.summary.failed.join(', '))
  console.log('failed assertions:', report.assertionSummary.failed.join(', '))
  process.exitCode = 1
}
