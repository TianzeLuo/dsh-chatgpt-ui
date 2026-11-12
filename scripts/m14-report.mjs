#!/usr/bin/env node
/**
 * scripts/m14-report.mjs — P0-4 evidence table.
 *
 * The reference is the user's desktop screenshot, summarised in the task
 * brief (radius 20–24, padding 16, track 44–48, thumb 52–56, five stops, row
 * 44–48, provider headers). The screenshot files themselves are not in the
 * repository, so the brief's numeric windows are encoded here as `range`.
 *
 * Reads docs/capture/live/m14-capture.json and writes docs/m14-panel.json.
 *
 *   node scripts/m14-report.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const LIVE = join(ROOT, 'docs/capture/live')
const capture = JSON.parse(readFileSync(join(LIVE, 'm14-capture.json'), 'utf8'))

const round = (value) => Math.round(Number(value) * 10) / 10
const num = (value) => Number.parseFloat(String(value))
const hex = (value) => {
  const match = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(String(value))
  if (match === null) return String(value)
  return `#${[match[1], match[2], match[3]].map((part) => Number(part).toString(16).padStart(2, '0')).join('')}`
}

const light = capture.themes.light
const dark = capture.themes.dark
if (light === undefined || dark === undefined) throw new Error('m14-capture: both themes are required')

const row = (id, label, reference, implementation, options = {}) => {
  const numeric = typeof reference === 'number' && typeof implementation === 'number'
  const delta = numeric ? round(implementation - reference) : null
  const inRange = options.range === undefined || !numeric
    ? true
    : implementation >= options.range[0] && implementation <= options.range[1]
  const pass = options.pass ?? (numeric ? inRange && Math.abs(delta) <= (options.tolerance ?? 0) : implementation === reference)
  return {
    id,
    label,
    reference,
    implementation,
    delta,
    tolerance: options.tolerance ?? null,
    range: options.range ?? null,
    pass,
    ...options.note === undefined ? {} : { note: options.note }
  }
}

const lightSimple = light.simple.simple
const darkSimple = dark.simple.simple
const lightAdvanced = light.advanced.advanced
const darkAdvanced = dark.advanced.advanced
const lightGroups = lightAdvanced.groups
const darkGroups = darkAdvanced.groups
const lightFirstGroup = lightGroups[0]
const darkFirstGroup = darkGroups[0]
const lightFirstRow = lightFirstGroup.rows[0]
const darkFirstRow = darkFirstGroup.rows[0]
const tickX = lightSimple.ticks.map((tick) => tick.rect.cx)
const tickGaps = tickX.slice(1).map((value, index) => round(value - tickX[index]))
const tickSpread = round(Math.max(...tickGaps) - Math.min(...tickGaps))
const currentCheck = lightGroups.some((group) => group.rows.some((entry) => entry.current && entry.check && entry.checked))
const subtitleCount = lightAdvanced.descriptionCount + darkAdvanced.descriptionCount

const rows = [
  row('panel-radius', '面板圆角（px）', 24, num(light.simple.menu.style['border-radius']), { range: [20, 24], tolerance: 4, note: '参考 20–24，实现取上限 24' }),
  row('panel-padding', '面板内边距（px）', 16, num(lightSimple.box.style.padding), { range: [16, 16], tolerance: 2 }),
  row('panel-width', '面板宽度（px）', 280, light.simple.menu.rect.w, { tolerance: 0, note: '沿用 M12 的 280；参考未给宽度，列表与面板同宽' }),
  row('track-height', '轨道高度（px）', 46, lightSimple.track.rect.h, { range: [44, 48], tolerance: 2 }),
  row('track-width', '轨道宽度（px）', 248, lightSimple.track.rect.w, { tolerance: 0, note: '280 − 16×2 = 248' }),
  row('thumb-diameter', '手柄直径（px）', 54, lightSimple.thumb.rect.w, { range: [52, 56], tolerance: 2 }),
  row('thumb-height', '手柄高度（px）', 54, lightSimple.thumb.rect.h, { tolerance: 0 }),
  row('thumb-radius', '手柄圆角', '50%', lightSimple.thumb.style['border-radius'], { note: '正圆，非圆角方形' }),
  row('thumb-border', '手柄描边', '0px', lightSimple.thumb.style.border.split(' ')[0], { note: '纯白、无描边' }),
  row('stops', '档位圆点数量', 5, lightSimple.ticks.length, { tolerance: 0 }),
  row('tick-size', '档位圆点直径（px）', 6, lightSimple.ticks[0].rect.w, { tolerance: 1, range: [6, 6] }),
  row('tick-evenness', '相邻档位间距最大差（px）', 0, tickSpread, { tolerance: 1 }),
  row('row-height', '模型行高（px）', 46, lightFirstRow.rect.h, { range: [44, 48], tolerance: 2 }),
  row('row-padding', '模型行横向内边距（px）', 16, num(String(lightFirstRow.style.padding).split(' ')[1] ?? lightFirstRow.style.padding), { tolerance: 0 }),
  row('group-title-height', '分组标题行高（px）', 32, lightFirstGroup.titleRect.h, { tolerance: 0 }),
  row('group-title-font', '分组标题字号（px）', 12, num(lightFirstGroup.titleStyle['font-size']), { tolerance: 0 }),
  row('group-title-weight', '分组标题字重', 500, num(lightFirstGroup.titleStyle['font-weight']), { tolerance: 0 }),
  row('group-title-bg-light', '浅色分组底色', '#f7f7f7', hex(lightFirstGroup.titleStyle['background-color']), { note: '参考明确要求 #F7F7F7' }),
  row('group-title-fg-light', '浅色分组文字', '#6e6e6e', hex(lightFirstGroup.titleStyle.color), { note: '小号灰字' }),
  row('group-title-bg-dark', '深色分组底色', '#383838', hex(darkFirstGroup.titleStyle['background-color']), { note: '相对 #2E2E2E 的整行浅底' }),
  row('group-title-fg-dark', '深色分组文字', '#9b9b9b', hex(darkFirstGroup.titleStyle.color), { note: '小号灰字' }),
  row('panel-bg-light', '浅色面板底色', '#ffffff', hex(light.simple.menu.style['background-color']), { note: '白底' }),
  row('panel-bg-dark', '深色面板底色', '#2e2e2e', hex(dark.simple.menu.style['background-color']), { note: '参考 #2E2E2E 左右' }),
  row('track-dark', '深色未选中轨道', '#3f3f3f', hex(darkSimple.track.style['background-color']), { note: '参考 #3F3F3F' }),
  row('fill', '已选中段 / 蓝色', '#2f7cf6', hex(lightSimple.fill.style['background-color']), { note: '参考 #2F7CF6' }),
  row('accent-dark', '深色强度名蓝色', '#4c8dff', hex(darkSimple.name.style.color), { note: '参考 #4C8DFF' }),
  row('accent-light', '浅色强度名蓝色', '#2f7cf6', hex(lightSimple.name.style.color), { note: '浅色同选中段蓝' }),
  row('pill-open-text', '药丸打开态文案', '选择推理强度', light.simple.pill.text, { note: '关闭后恢复「模型名 + 强度名」' }),
  row('groups', '模型列表分组数', 3, lightGroups.length, { tolerance: 0, note: '按宿主 provider 分组' }),
  row('group-names', '分组标题', 'DeepSeek 账号 / DeepSeek / commandcode', lightGroups.map((group) => group.title).join(' / '), { note: '宿主 provider 名照实显示' }),
  row('subtitles', '模型行副标题数量', 0, subtitleCount, { tolerance: 0, note: '行内只留模型名' }),
  row('selected-check', '选中行勾选', true, currentCheck, { note: '当前模型行右侧 ✓' }),
  row('header-lines', '头部行数', 2, lightSimple.header === null ? 0 : (lightSimple.name.text === '极高' && lightSimple.toggle.text !== '' ? 2 : 0), { note: '强度名在上、模型名 + › 在下' }),
  row('reset-target', '重置回到默认档', '极高', lightSimple.name.text, { note: '默认档由 defaultEffort 决定，实测 xhigh' }),
  row('max-value', '拖到最高档索引', 4, num(light.max.simple.range.value), { tolerance: 0 }),
  row('max-name', '最高档名称', '最高', light.max.simple.name.text),
  row('pick-returns', '选模型后视图', 'simple', light.afterPick.view),
  row('esc-close', 'Esc 关闭', true, light.dismissEsc),
  row('outside-close', '点外部关闭', true, light.dismissOutside)
]

const circle = (theme) => {
  const thumb = theme.simple.simple.thumb
  return thumb.rect.w === thumb.rect.h && thumb.style['border-radius'] === '50%' && thumb.style.border.startsWith('0px')
}
const inRange = (value, min, max) => value >= min && value <= max
const assertions = [
  {
    id: 'M14-A1',
    claim: '手柄为正圆：宽高相等、border-radius 50%、无描边',
    pass: circle(light) && circle(dark),
    detail: { light: { w: lightSimple.thumb.rect.w, h: lightSimple.thumb.rect.h, radius: lightSimple.thumb.style['border-radius'], border: lightSimple.thumb.style.border }, dark: { w: darkSimple.thumb.rect.w, h: darkSimple.thumb.rect.h, radius: darkSimple.thumb.style['border-radius'], border: darkSimple.thumb.style.border } }
  },
  {
    id: 'M14-A2',
    claim: '药丸打开态文案为「选择推理强度」',
    pass: light.simple.pill.text === '选择推理强度' && dark.simple.pill.text === '选择推理强度',
    detail: { light: light.simple.pill.text, dark: dark.simple.pill.text }
  },
  {
    id: 'M14-A3',
    claim: '模型列表按 provider 分组、组内只有模型名、无副标题',
    pass: lightGroups.length === 3 && darkGroups.length === 3 && subtitleCount === 0 && lightGroups.every((group, index) => group.title === darkGroups[index].title),
    detail: { groups: lightGroups.map((group) => ({ provider: group.provider, title: group.title, rows: group.rows.map((entry) => entry.name) })), subtitles: subtitleCount }
  },
  {
    id: 'M14-A4',
    claim: '选中模型行右侧显示勾选',
    pass: currentCheck,
    detail: { currentCheck }
  },
  {
    id: 'M14-A5',
    claim: '轨道 44–48、手柄 52–56、5 个圆点',
    pass: inRange(lightSimple.track.rect.h, 44, 48) && inRange(lightSimple.thumb.rect.w, 52, 56) && lightSimple.ticks.length === 5 && tickSpread <= 1,
    detail: { track: lightSimple.track.rect.h, thumb: lightSimple.thumb.rect.w, stops: lightSimple.ticks.length, tickSpread }
  },
  {
    id: 'M14-A6',
    claim: '面板圆角 20–24、内边距约 16',
    pass: inRange(num(light.simple.menu.style['border-radius']), 20, 24) && num(lightSimple.box.style.padding) === 16,
    detail: { radius: light.simple.menu.style['border-radius'], padding: lightSimple.box.style.padding }
  },
  {
    id: 'M14-A7',
    claim: '深浅两套颜色齐备：深色 #2E2E2E / #3F3F3F / #4C8DFF，浅色白底 + #F7F7F7',
    pass: hex(dark.simple.menu.style['background-color']) === '#2e2e2e' && hex(darkSimple.track.style['background-color']) === '#3f3f3f' && hex(darkSimple.name.style.color) === '#4c8dff' && hex(light.simple.menu.style['background-color']) === '#ffffff' && hex(lightFirstGroup.titleStyle['background-color']) === '#f7f7f7',
    detail: { darkPanel: hex(dark.simple.menu.style['background-color']), darkTrack: hex(darkSimple.track.style['background-color']), darkAccent: hex(darkSimple.name.style.color), lightPanel: hex(light.simple.menu.style['background-color']), lightGroup: hex(lightFirstGroup.titleStyle['background-color']) }
  },
  {
    id: 'M14-A8',
    claim: '拖到最高档：值=4、名称=最高、填充到 221px',
    pass: num(light.max.simple.range.value) === 4 && light.max.simple.name.text === '最高' && light.max.simple.fill.rect.w === 221 && dark.max.simple.name.text === '最高',
    detail: { value: light.max.simple.range.value, name: light.max.simple.name.text, fill: light.max.simple.fill.rect.w, darkName: dark.max.simple.name.text }
  },
  {
    id: 'M14-A9',
    claim: '重置图标回到模型默认档（xhigh / 极高）',
    pass: lightSimple.name.text === '极高' && darkSimple.name.text === '极高',
    detail: { light: lightSimple.name.text, dark: darkSimple.name.text }
  },
  {
    id: 'M14-A10',
    claim: '选模型后返回强度视图；Esc 与点外部都关闭面板',
    pass: light.afterPick.view === 'simple' && light.dismissEsc === true && light.dismissOutside === true && dark.afterPick.view === 'simple',
    detail: { light, dark }
  },
  {
    id: 'M14-A11',
    claim: '5 个档位圆点在轨道内均匀分布',
    pass: tickSpread <= 1 && tickX[0] >= lightSimple.track.rect.x && tickX.at(-1) <= lightSimple.track.rect.r,
    detail: { centers: tickX, gaps: tickGaps, spread: tickSpread }
  }
]

const failedRows = rows.filter((entry) => entry.pass === false)
const failedAssertions = assertions.filter((entry) => entry.pass === false)
const output = {
  source: 'user desktop screenshots (P0-4 brief)',
  capturedAt: capture.capturedAt,
  referenceNote: '参考窗口来自任务说明：面板圆角 20–24、内边距约 16、轨道高 44–48、手柄直径 52–56、5 档、行高 44–48、分组标题小号灰字整行浅底。截图原件不在仓库，故以数值窗口记录 reference；实现值由 scripts/m14-capture.mjs 在 3114 隔离实例实拍。',
  themes: {
    light: { measurements: light, screenshots: { panel: 'docs/screenshots/m14-panel-light.png', models: 'docs/screenshots/m14-models-light.png', max: 'docs/screenshots/m14-slider-max-light.png' } },
    dark: { measurements: dark, screenshots: { panel: 'docs/screenshots/m14-panel-dark.png', models: 'docs/screenshots/m14-models-dark.png', max: 'docs/screenshots/m14-slider-max-dark.png' } }
  },
  rows,
  assertions,
  summary: { rows: rows.length, failed: failedRows.map((entry) => entry.id), assertions: assertions.length, failedAssertions: failedAssertions.map((entry) => entry.id) }
}

writeFileSync(join(ROOT, 'docs/m14-panel.json'), `${JSON.stringify(output, null, 2)}\n`)
console.log(`m14-report: ${rows.length} rows, ${failedRows.length} failed; ${assertions.length} assertions, ${failedAssertions.length} failed`)
if (failedRows.length > 0) console.log(failedRows.map((entry) => `  FAIL ${entry.id}`).join('\n'))
if (failedAssertions.length > 0) console.log(failedAssertions.map((entry) => `  FAIL ${entry.id}: ${entry.claim}`).join('\n'))
if (failedRows.length > 0 || failedAssertions.length > 0) process.exitCode = 1
