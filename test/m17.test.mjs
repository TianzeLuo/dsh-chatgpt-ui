#!/usr/bin/env node
/**
 * P0-6 contract, source geometry updated by P0-8: the 280px reasoning panel is
 * one 126×44 two-line hover block (no lightning glyph, 20+12 blank column on
 * the left, 20px reset on the first text line), a 248×30 pill track with four
 * 4px stops, a 34px pure-white thumb (corner-shape: round), and a three-stop
 * blue→purple top fill. The pill's open state is 「选择推理强度」 with a grey
 * fill and no ring.
 *
 * Source checks run without a browser against the live P0-8 values; the
 * measurement group still reads the frozen P0-6 docs/m17-panel.json and
 * docs/capture/live/m17-capture.json.
 *
 * Run: node test/m17.test.mjs
 */
import { existsSync, readFileSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (path) => readFileSync(join(ROOT, path), 'utf8')

const composer = read('lib/client/composer.js')
const core = read('lib/shared/composer-core.mjs')
const css = read('lib/client/css/65-work-card.css')
const tokens = read('lib/client/css/05-cgpt-tokens.css')
const darkTokens = read('lib/client/css/06-cgpt-tokens-dark.css')
const a11y = read('lib/client/css/85-a11y.css')
const bundle = read('lib/client.js')
const report = JSON.parse(read('docs/m17-panel.json'))
const capture = JSON.parse(read('docs/capture/live/m17-capture.json'))
const packageJson = JSON.parse(read('package.json'))

let checks = 0
let failures = 0
const check = (name, condition, detail) => {
  checks += 1
  if (condition) return
  failures += 1
  console.log(`FAIL  ${name}${detail === undefined ? '' : ` — ${detail}`}`)
}

// 1. Source: one block, no lightning, 20 + 12 blank column, reset on the right.
check('source: the two lines are one choice block', composer.includes("className: 'chatgpt-effort-choice'") && composer.includes("className: 'chatgpt-effort-choice-name'") && composer.includes("className: 'chatgpt-effort-choice-model'"))
check('source: the block is the model-list toggle', composer.includes("'data-cgpt-model-view-toggle': ''") && composer.includes("'data-cgpt-effort-choice': ''"))
check('source: the lightning constant is deleted', !composer.includes('CHATGPT_LIGHTNING_SVG') && !css.includes('chatgpt-effort-head-icon') && !bundle.includes('chatgpt-effort-head-icon'))
check('source: the 20px blank column stays on the left', composer.includes("className: 'chatgpt-effort-head-blank'") && /\.chatgpt-effort-head \{[^}]*grid-template-columns: 20px minmax\(0, 1fr\) 20px[^}]*column-gap: 12px/.test(css))
check('source: the reset is 20×20 and follows the default effort', composer.includes("className: 'chatgpt-effort-reset'") && composer.includes('chatgptEffortDefaultIndex') && core.includes('export function chatgptEffortDefaultIndex'))
check('source: the effort name uses the accent token', /\.chatgpt-effort-choice-name \{[^}]*color: var\(--cgpt-effort-accent\)/.test(css))
check('source: the model line is 14px and the chevron 12px', /\.chatgpt-effort-choice-model \{[^}]*font-size: 14px[^}]*font-weight: 400/.test(css) && /\.chatgpt-effort-choice-chevron \{[^}]*width: 12px[^}]*height: 12px/.test(css))
check('source: the block is 126×44 with 12px corners', /\.chatgpt-effort-choice \{[^}]*width: 126px[^}]*min-height: 44px[^}]*border-radius: 12px/.test(css))

// 2. Slider geometry and colours.
check('slider: core constants are 248 / 17 / 34', core.includes('const CHATGPT_EFFORT_TRACK = 248') && core.includes('const CHATGPT_EFFORT_INSET = 17') && core.includes('const CHATGPT_EFFORT_THUMB = 34'))
check('slider: levels spread inset → track - inset', core.includes('const span = CHATGPT_EFFORT_TRACK - inset * 2') && core.includes('return Math.round(inset + (span * clamped) / (length - 1))'))
check('slider: the track is 100%×30 and 15px rounded', /\.chatgpt-effort-track \{[^}]*width: 100%[^}]*height: 30px[^}]*border-radius: 15px/.test(css))
check('slider: the fill is 30 high', /\.chatgpt-effort-fill \{[^}]*height: 30px[^}]*border-radius: 15px/.test(css))
check('slider: the top stop is a three-stop blue→purple sweep', composer.includes("'data-max': maxEffort ? 'true' : 'false'") && /\.chatgpt-effort-fill\[data-max='true'\] \{[^}]*linear-gradient/.test(css) && css.includes('var(--cgpt-effort-max-a) 0%, var(--cgpt-effort-max-b) 52%, var(--cgpt-effort-max-c) 100%'))
check('slider: 4px stops', /\.chatgpt-effort-tick \{[^}]*width: 4px[^}]*height: 4px[^}]*border-radius: 50%/.test(css) && composer.includes('const ticks = efforts.map'))
check('slider: the thumb is 34×34, circular, borderless, corner-shape round', /\.chatgpt-effort-thumb \{[^}]*width: 34px[^}]*height: 34px[^}]*border-radius: 50%/.test(css) && /\.chatgpt-effort-thumb \{[^}]*border: 0;/.test(css) && css.includes('corner-shape: round'))
check('slider: the 34px thumb is centred with top -2px', /\.chatgpt-effort-thumb \{[^}]*top: -2px/.test(css) && /\.chatgpt-effort-slider \{[^}]*width: 100%[^}]*height: 34px[^}]*margin: 12px 0 0/.test(css))
check('slider: drag writes through selectModel without closing', composer.includes('onChange: (event) => applyEffort') && composer.includes('setPendingEffort(next)'))

// 3. Pill: text, no ring, grey fill, 14px.
check('pill: the open caption is 选择推理强度', composer.includes("chooseEffort: '选择推理强度'") && composer.includes("'data-cgpt-pill-placeholder'"))
check('pill: the open state keeps the grey fill and drops the ring', /\.chatgpt-model-pill\[aria-expanded='true'\] \{[^}]*background: var\(--cgpt-work-hover\)[^}]*box-shadow: none/.test(css))
check('pill: no 1.5px blue ring remains', !css.includes('0 0 0 1.5px') && !bundle.includes('0 0 0 1.5px'))
check('pill: 14px caption', /\.chatgpt-model-pill \{[^}]*font-size: 14px/.test(css))

// 4. Tokens and accessibility.
check('palette: light track #E9E9E9, dark #3F3F3F', css.includes('--cgpt-effort-track: #e9e9e9') && css.includes('--cgpt-effort-track: #3f3f3f'))
check('palette: max name #C084FC dark / #9333EA light, normal #4C8DFF', css.includes('--cgpt-effort-accent-max: #c084fc') && css.includes('--cgpt-effort-accent-max: #9333ea') && css.includes('--cgpt-effort-accent: #4c8dff'))
check('palette: model #D0D0D0, ticks #8B8B8B at 50%', css.includes('--cgpt-effort-model-fg: #d0d0d0') && css.includes('--cgpt-effort-tick: #8b8b8b') && css.includes('opacity: 0.5'))
check('palette: top gradient #4F6BFF → #A855F7 → #7C3AED (light paler)', css.includes('--cgpt-effort-max-a: #4f6bff') && css.includes('--cgpt-effort-max-b: #a855f7') && css.includes('--cgpt-effort-max-c: #7c3aed') && css.includes('--cgpt-effort-max-a: #6e84ff'))
check('a11y: the block replaces the old toggle', a11y.includes('.chatgpt-effort-choice') && a11y.includes('.chatgpt-effort-reset') && !a11y.includes('chatgpt-model-simple-toggle'))
check('a11y: reduced motion covers the block, fill and thumb', /prefers-reduced-motion: reduce[\s\S]*\.chatgpt-effort-fill[\s\S]*\.chatgpt-effort-thumb[\s\S]*\.chatgpt-effort-choice/.test(a11y))

// 5. Built bundle and package wiring.
check('build: the bundle carries the new block and CSS', bundle.includes('chatgpt-effort-choice-name') && bundle.includes('chatgpt-effort-head-blank') && bundle.includes('chatgpt-effort-fill[data-max=') && bundle.includes('width: 34px') && bundle.includes('corner-shape: round'))
check('build: the bundle has no lightning glyph', !bundle.includes('CHATGPT_LIGHTNING_SVG') && !bundle.includes('chatgpt-effort-head-icon'))
check('wiring: npm test runs m17', /test\/m17\.test\.mjs/.test(packageJson.scripts?.test ?? ''))
check('wiring: npm run check runs the m17 report', /scripts\/m17-report\.mjs/.test(packageJson.scripts?.check ?? ''))

// 6. The report table: reference → implementation → delta.
const row = (id) => report.diff.rows.find((entry) => entry.id === id)
check('report: every captured row is table-shaped', report.diff.rows.length >= 45 && report.diff.rows.every((entry) => typeof entry.reference === 'string' && typeof entry.implementation === 'string' && typeof entry.delta === 'string' && typeof entry.pass === 'boolean'))
check('report: no mismatched rows', report.diff.summary.failed.length === 0, JSON.stringify(report.diff.summary))
check('report: the two geometric conflicts are documented', report.conflicts.some((entry) => entry.id === 'track-284') && report.conflicts.some((entry) => entry.id === 'thumb-44-vs-track-36') && report.conflicts.some((entry) => entry.id === 'tick-under-thumb'))
check('report: all 8 assertions pass', report.assertions.length === 8 && report.assertions.every((assertion) => assertion.pass) && report.assertionSummary.failed.length === 0)
for (const id of ['panel-width', 'panel-radius', 'block-width', 'block-height', 'block-hover-dark', 'effort-size', 'model-size', 'reset-inset', 'track-width', 'track-height', 'track-dark', 'max-gradient', 'block-gap', 'bottom-gap', 'thumb-size', 'tick-count', 'pill-text', 'pill-ring', 'lightning', 'font-ratio', 'thumb-track-ratio']) {
  check(`report: row ${id} exists and passes`, row(id)?.pass === true)
}
check('report: track inset is within the ±2px tolerance', row('track-inset')?.pass === true && row('track-inset')?.conflict === true)
check('report: thumb overflow is the only failed numeric row and is flagged', row('thumb-overflow')?.pass === false && row('thumb-overflow')?.conflict === true)

// 7. The capture is the same panel in both themes.
check('capture: both themes have default/hover/max frames', ['dark', 'light'].every((theme) => capture.themes[theme] && ['default', 'hover', 'max'].every((frame) => capture.themes[theme].frames[frame] !== null)))
check('capture: six screenshots exist and are non-empty', ['m17-panel-dark.png', 'm17-panel-hover-dark.png', 'm17-panel-max-dark.png', 'm17-panel-light.png', 'm17-panel-hover-light.png', 'm17-panel-max-light.png'].every((name) => existsSync(join(ROOT, 'docs/screenshots', name)) && statSync(join(ROOT, 'docs/screenshots', name)).size > 5000))
for (const theme of ['dark', 'light']) {
  const frame = capture.themes[theme].frames.default
  const max = capture.themes[theme].frames.max
  check(`capture: ${theme} panel is 280 and the block is 126×63`, frame.menu.rect.w === 280 && frame.block.rect.w === 126 && frame.block.rect.h === 63)
  check(`capture: ${theme} has no lightning and a 20px blank`, frame.blank.lightning === false && frame.blank.rect.w === 20 && frame.blank.svgCount === 0)
  check(`capture: ${theme} block is centred and the reset sits 16px in`, frame.values.blockCenter === frame.values.panelCenter && frame.values.resetRightInset === 16)
  check(`capture: ${theme} track is 252×36 with five 5px stops`, frame.track.rect.w === 252 && frame.track.rect.h === 36 && frame.ticks.length === 5 && frame.ticks.every((tick) => tick.rect.w === 5 && tick.rect.h === 5))
  check(`capture: ${theme} thumb is 44×44 white, centred`, frame.thumb.rect.w === 44 && frame.thumb.rect.h === 44 && frame.thumb.rect.cy === frame.track.rect.cy && frame.thumb.style['background-color'] === 'rgb(255, 255, 255)' && frame.thumb.style['box-shadow'] === 'none')
  check(`capture: ${theme} max stop is the blue→purple gradient and 最高`, max.effort.text === '最高' && max.fill.max === 'true' && max.fill.style['background-image'].includes('rgb(139, 92, 246)') && max.thumb.rect.r === max.track.rect.r)
  check(`capture: ${theme} pill is 选择推理强度, 14px, grey, no ring`, frame.pill.text === '选择推理强度' && frame.pill.style['font-size'] === '14px' && frame.pill.style['box-shadow'] === 'none' && frame.pill.style['background-color'] !== 'rgba(0, 0, 0, 0)')
  check(`capture: ${theme} hover background matches the brief`, theme === 'dark' ? capture.themes[theme].frames.hover.block.style['background-color'] === 'rgb(58, 58, 58)' : capture.themes[theme].frames.hover.block.style['background-color'] === 'rgb(242, 242, 242)')
  check(`capture: ${theme} light/dark token colours`, theme === 'dark'
    ? frame.track.style['background-color'] === 'rgb(63, 63, 63)' && frame.menu.style['background-color'] === 'rgb(48, 48, 48)'
    : frame.track.style['background-color'] === 'rgb(229, 229, 229)' && frame.menu.style['background-color'] === 'rgb(255, 255, 255)')
}

if (failures > 0) {
  console.log(`\n${failures}/${checks} checks failed`)
  process.exitCode = 1
} else {
  console.log(`m17: ${checks} checks passed`)
}
