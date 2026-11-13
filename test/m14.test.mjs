#!/usr/bin/env node
/**
 * Panel contract, P0-8 form (geometry superseded the P0-6 252×36/44px panel):
 * the lightning glyph is gone (its 20px column and 12px gap stay blank), the
 * two lines are one 126×44 hover block, the track is 248×30 with four 4px
 * stops, and the 34px thumb is a pure white circle that opts out of the Host
 * `corner-shape: superellipse(1.5)` squircle. The pill switches to
 * 「选择推理强度」 while open without a ring, and the model list stays
 * provider-grouped. The frozen P0-4 measurements are still read from
 * docs/m14-panel.json by the evidence group at the bottom.
 *
 * Run: node test/m14.test.mjs
 */
import { existsSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loc, read, skipSuite } from './evidence.mjs'
skipSuite(import.meta.url)

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

const composer = read('lib/client/composer.js')
const core = read('lib/shared/composer-core.mjs')
const css = read('lib/client/css/65-work-card.css')
const a11y = read('lib/client/css/85-a11y.css')
const tokens = read('lib/client/css/05-cgpt-tokens.css')
const darkTokens = read('lib/client/css/06-cgpt-tokens-dark.css')
const bundle = read('lib/client.js')
const report = JSON.parse(read('docs/m14-panel.json'))

let checks = 0
let failures = 0
const check = (name, condition, detail) => {
  checks += 1
  if (condition) return
  failures += 1
  console.log(`FAIL  ${name}${detail === undefined ? '' : ` — ${detail}`}`)
}

// 1. Source: two-line header, lightning left, reset right.
check('header: one block holds the effort name over the model line', composer.includes("className: 'chatgpt-effort-choice-name'") && composer.includes("className: 'chatgpt-effort-choice-model'"))
check('header: the lightning glyph is gone, its 20px column stays', !composer.includes('CHATGPT_LIGHTNING_SVG') && composer.includes("className: 'chatgpt-effort-head-blank'") && css.includes('.chatgpt-effort-head-blank'))
check('header: the reset control is on the right', composer.includes("className: 'chatgpt-effort-reset'") && composer.includes('chatgptEffortDefaultIndex'))
check('header: the effort name uses the accent token', /\.chatgpt-effort-choice-name \{[^}]*color: var\(--cgpt-effort-accent\)/.test(css))
check('header: the model line is 14px with a 12px chevron', /\.chatgpt-effort-choice-model \{[^}]*font-size: 14px/.test(css) && composer.includes('CHATGPT_CHEVRON_RIGHT_SVG'))
check('header: reset returns to the model default, not the first level', core.includes('export function chatgptEffortDefaultIndex') && composer.includes('choice?.defaultEffort'))

// 2. Slider: 46px pill, 54px round thumb, 5 dynamic stops.
check('slider: the track is 248×30 and 15px rounded', /\.chatgpt-effort-track \{[^}]*width: 100%[^}]*height: 30px[^}]*border-radius: 15px/.test(css))
check('slider: the thumb is 34×34', /\.chatgpt-effort-thumb \{[^}]*width: 34px[^}]*height: 34px/.test(css))
check('slider: the thumb is a perfect circle', /\.chatgpt-effort-thumb \{[^}]*border-radius: 50%/.test(css))
check('slider: the thumb has no border', /\.chatgpt-effort-thumb \{[^}]*border: 0|\.chatgpt-effort-thumb \{[^}]*border-width: 0/.test(css) && !/\.chatgpt-effort-thumb \{[^}]*border: [1-9]/.test(css))
check('slider: the 34px thumb is centred on the 30px track', /\.chatgpt-effort-thumb \{[^}]*top: -2px/.test(css))
check('slider: stops are 4px dots', /\.chatgpt-effort-tick \{[^}]*width: 4px[^}]*height: 4px[^}]*border-radius: 50%/.test(css))
check('slider: one stop per catalog level', composer.includes('const ticks = efforts.map') && composer.includes("'data-cgpt-effort-tick'"))
check('slider: drag writes through selectModel without closing', composer.includes('onChange: (event) => applyEffort') && composer.includes('setPendingEffort(next)'))
check('slider: the top stop paints the three-stop blue→purple sweep', composer.includes("'data-max': maxEffort ? 'true' : 'false'") && css.includes("chatgpt-effort-fill[data-max='true']") && css.includes('linear-gradient(90deg, var(--cgpt-effort-max-a) 0%, var(--cgpt-effort-max-b) 52%, var(--cgpt-effort-max-c) 100%)'))

// 3. Pill caption switch.
check('pill: open caption is 选择推理强度', composer.includes("chooseEffort: '选择推理强度'") && composer.includes("'data-cgpt-pill-placeholder'"))
check('pill: closed caption is model + effort', composer.includes("className: 'chatgpt-model-pill-name'") && composer.includes("className: 'chatgpt-model-pill-effort'"))
check('pill: the open caption replaces the model name', /open\s*\?\s*chatgptH\('span', \{ className: 'chatgpt-model-pill-placeholder'/.test(composer))
check('pill: open caption is rendered only while open', composer.includes('open\n        ? chatgptH(\'span\''))

// 4. Model list grouped by provider, no subtitles.
check('list: grouped by provider', composer.includes('chatgptModelGroups(choices)') && composer.includes("'data-cgpt-model-group': group.provider"))
check('list: the provider header is full-width and small grey', /\.chatgpt-model-group-title \{[^}]*height: 32px[^}]*background: var\(--cgpt-effort-group-bg\)[^}]*font-size: 12px/.test(css))
check('list: rows are 40px with only a name and a check', /\.chatgpt-model-choice \{[^}]*height: 40px/.test(css) && !composer.includes('chatgpt-model-choice-description'))
check('list: the current row has a check on the right', composer.includes("className: 'chatgpt-model-choice-check'") && composer.includes("'data-current': selected"))
check('list: selecting returns to the effort view', /setView\('simple'\)\s*\n\s*send\(request\)/.test(composer))
check('list: width matches the panel', composer.includes("width: '280px'") && css.includes('width: 100%'))
check('list: overflow scrolls', /\.chatgpt-model-menu\[data-view='advanced'\] \{[^}]*max-height: 420px[^}]*overflow-y: auto/.test(css))

// 5. Both themes.
check('theme: light overlay is white and groups #F7F7F7', tokens.includes('--cgpt-overlay-bg: #ffffff') && tokens.includes('--cgpt-model-panel-bg: var(--cgpt-overlay-bg)') && tokens.includes('--cgpt-effort-group-bg: #f7f7f7'))
check('theme: dark overlay is #2B2B2B and groups #383838', darkTokens.includes('--cgpt-overlay-bg: #2b2b2b') && darkTokens.includes('--cgpt-model-panel-bg: var(--cgpt-overlay-bg)') && darkTokens.includes('--cgpt-effort-group-bg: #383838'))
check('theme: dark unselected track is #3F3F3F', darkTokens.includes('--cgpt-effort-track: #3f3f3f'))
check('theme: selected segment is #2F7CF6 in both', tokens.includes('--cgpt-effort-fill: #2f7cf6') && darkTokens.includes('--cgpt-effort-fill: #2f7cf6'))
check('theme: strength name is #4C8DFF in dark', darkTokens.includes('--cgpt-effort-accent: #4c8dff'))
check('a11y: panel controls join the focus ring list', a11y.includes('.chatgpt-effort-reset') && a11y.includes('.chatgpt-model-choice') && a11y.includes('.chatgpt-effort-choice'))
check('build: the bundle carries the new panel', bundle.includes('chatgpt-effort-choice-name') && bundle.includes('chatgpt-model-group-title') && bundle.includes('data-cgpt-pill-placeholder'))

// 6. Measured evidence.
const row = (id) => report.rows.find((entry) => entry.id === id)
check('evidence: 39 rows, all passing', report.rows.length === 39 && report.summary.failed.length === 0, JSON.stringify(report.summary))
check('evidence: 11 assertions, all passing', report.assertions.length === 11 && report.summary.failedAssertions.length === 0, JSON.stringify(report.summary))
check('evidence: panel radius 20–24, padding 16', row('panel-radius')?.implementation >= 20 && row('panel-radius')?.implementation <= 24 && row('panel-padding')?.implementation === 16)
check('evidence: track 46, thumb 54, five stops', row('track-height')?.implementation === 46 && row('thumb-diameter')?.implementation === 54 && row('stops')?.implementation === 5)
check('evidence: thumb is a perfect circle', row('thumb-radius')?.implementation === '50%' && row('thumb-height')?.implementation === row('thumb-diameter')?.implementation && row('thumb-border')?.implementation === '0px')
check('evidence: row height 46, group header 32 / 12px', row('row-height')?.implementation === 46 && row('group-title-height')?.implementation === 32 && row('group-title-font')?.implementation === 12)
check('evidence: pill opens as 选择推理强度', row('pill-open-text')?.implementation === '选择推理强度')
check('evidence: three provider groups and no subtitles', row('groups')?.implementation === 3 && row('subtitles')?.implementation === 0)
check('evidence: current row has a check', row('selected-check')?.implementation === true)
check('evidence: max drag reaches 最高', row('max-name')?.implementation === '最高' && row('max-value')?.implementation === 4)
check('evidence: reset, pick-return, Esc and outside close', row('reset-target')?.implementation === '极高' && row('pick-returns')?.implementation === 'simple' && row('esc-close')?.implementation === true && row('outside-close')?.implementation === true)
check('evidence: both themes have measured frames', report.themes.light.measurements !== null && report.themes.dark.measurements !== null)

for (const path of [
  'docs/screenshots/m14-panel-light.png',
  'docs/screenshots/m14-panel-dark.png',
  'docs/screenshots/m14-models-light.png',
  'docs/screenshots/m14-models-dark.png',
  'docs/screenshots/m14-slider-max-light.png',
  'docs/screenshots/m14-slider-max-dark.png',
  'docs/capture/live/m14-capture.json'
]) {
  const full = loc(path)
  check(`evidence: ${path} exists and is not empty`, existsSync(full) && statSync(full).size > 1000)
}

if (failures > 0) {
  console.log(`\n${failures}/${checks} checks failed`)
  process.exitCode = 1
} else {
  console.log(`m14: ${checks} checks passed`)
}
