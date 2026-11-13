#!/usr/bin/env node
/**
 * P0-3 contract: the Work card is 127 high (its width is now the Host reading
 * column, P0-10B), the first glyph sits 20px below the
 * card top, the bottom row stays 36/8/8, the open model pill carries the 1.5px
 * blue ring, and Chat stays 52/26.
 *
 * Source checks run without a browser; the measurement group reads
 * docs/m13-composer.json, written by scripts/m13-report.mjs from the two live
 * captures.
 *
 * Run: node test/m13.test.mjs
 */
import { existsSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loc, read, skipSuite } from './evidence.mjs'
skipSuite(import.meta.url)

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

const css = read('lib/client/css/65-work-card.css')
const tokens = read('lib/client/css/05-cgpt-tokens.css')
const darkTokens = read('lib/client/css/06-cgpt-tokens-dark.css')
const bundle = read('lib/client.js')
const report = JSON.parse(read('docs/m13-composer.json'))

let checks = 0
let failures = 0
const check = (name, condition, detail) => {
  checks += 1
  if (condition) return
  failures += 1
  console.log(`FAIL  ${name}${detail === undefined ? '' : ` — ${detail}`}`)
}

// 1. Source: the card is a centred 768px column, not the Host reading column.
/* P0-10B superseded the fixed 768px fold: the live card is the Host reading
   column, so the P0-3 width rows below stay as the historical record. */
check('css: the card is the Host reading column (P0-10B)', /\[data-composer-card='true'\] \{[\s\S]*?width: 100%;[\s\S]*?max-width: var\(--dsh-chat-content-width, var\(--cgpt-msg-max, 920px\)\);/.test(css))
check('css: no fixed 768px column remains', !css.includes('max-width: 768px') && !css.includes('min(768px, 100%)'))
check('css: the card is centred with auto inline margins', /margin-left: auto;[\s\S]{0,80}margin-right: auto;/.test(css))
check('css: the Host border is removed', /\[data-composer-card='true'\] \{[\s\S]*?\n  border: 0;/.test(css))
check('css: the reference shadow token is used', css.includes('box-shadow: var(--cgpt-work-card-shadow)'))
check('tokens: light shadow is the reference trio', tokens.includes('--cgpt-work-card-shadow: 0 0 0 1px rgba(0, 0, 0, 0.04), 0 2px 8px rgba(0, 0, 0, 0.04), 0 4px 80px 8px rgba(0, 0, 0, 0.024)'))
check('tokens: dark shadow is the 1px inset hairline', darkTokens.includes('--cgpt-work-card-shadow: inset 0 0 1px 0 rgba(255, 255, 255, 0.2)'))

// 2. Source: the 52px editor and the 8px row insets.
check('css: the editor reserves 52px', /\[data-input-scroll='true'\] \{[\s\S]*?min-height: 52px;/.test(css))
check('css: the scroll has no stray right margin', /\[data-input-scroll='true'\] \{[\s\S]*?margin: 0;/.test(css))
check('css: the action row cancels 10px of the 18px gutter', css.includes('margin: 16px -10px 0'))
check('css: the action row stays 36 high with 8px gaps', /\[class\*='_row'\] \{[\s\S]*?gap: 8px;[\s\S]*?height: 36px;/.test(css))
check('css: the tool band is 13px inset on both sides', css.includes('left: 13px') && css.includes('right: 13px'))

// 3. Source: the open pill (P0-6 removed the ring) and the untouched static state.
check('css: the open pill has the grey fill and no ring', /\.chatgpt-model-pill\[aria-expanded='true'\] \{[^}]*background: var\(--cgpt-work-hover\)[^}]*box-shadow: none/.test(css))
check('css: the ring uses the selected-segment blue', tokens.includes('--cgpt-effort-fill: #2f7cf6'))
check('css: the pill keeps 36 / 9999 / 14 / 500', /\.chatgpt-model-pill \{[^}]*height: 36px[^}]*border-radius: 9999px[^}]*font-size: 14px[^}]*font-weight: 500/.test(css))
check('css: the static pill has no border', /\.chatgpt-model-pill \{[^}]*border: 0;/.test(css))
check('bundle: the built client carries the new rules', bundle.includes('min-height: 52px') && bundle.includes('box-shadow: none') && bundle.includes('--cgpt-work-card-shadow'))

// 4. The measurement table: reference → before → after → delta.
const row = (id) => report.diff.rows.find((entry) => entry.id === id)
check('evidence: 26 rows, all passing', report.diff.rows.length === 26 && report.diff.summary.failed.length === 0, JSON.stringify(report.diff.summary))
check('evidence: 8 assertions, all passing', report.assertions.length === 8 && report.assertionSummary.failed.length === 0, JSON.stringify(report.assertionSummary))
check('width: the P0-3 capture stays 768 → 838.4 → 768 (P0-10B moved the live width to the reading column)', row('card-width')?.reference === 768 && row('card-width')?.before === 838.4 && row('card-width')?.implementation === 768 && row('card-width')?.delta === 0)
check('height: 127 → 103 → 127', row('card-height')?.reference === 127 && row('card-height')?.before === 103 && row('card-height')?.implementation === 127 && row('card-height')?.delta === 0)
check('editor: 52 → 26 → 52', row('editor-height')?.implementation === 52)
check('glyphTop: 20 → 21 → 20', row('glyph-top')?.implementation === 20 && row('glyph-top')?.delta === 0)
check('baseline: 32.8 → 33.8 → 32.8', row('baseline')?.implementation === 32.8 && row('baseline')?.delta === 0)
check('row: 36 high, centres 0', row('row-height')?.implementation === 36 && row('row-centers')?.implementation === 0)
check('gaps: 8 / 8', row('gap-chip-pill')?.implementation === 8 && row('gap-pill-send')?.implementation === 8)
check('insets: + 8 from left, send 8 from right', row('add-inset')?.implementation === 8 && row('send-inset')?.implementation === 8)
check('ring: the live contract is 1.5px on the selected blue', /1\.5px/.test(row('pill-ring-open')?.implementation ?? '') && (row('pill-ring-static')?.implementation ?? '').endsWith('/ none'))
check('tool band: 48 high, buttons 36, 13 insets', row('tools-height')?.implementation === 48 && row('tools-button-height')?.implementation === 36 && row('tools-inset')?.implementation === '13/13')
check('chat: 52 / 26 before and after', row('chat-height')?.before === 52 && row('chat-height')?.implementation === 52 && row('chat-radius')?.implementation === 26)
check('chat: no tool band', row('chat-tools')?.implementation === '无')
check('dark: shadows match the reference', report.assertions.find((entry) => entry.id === 'M13-A7')?.pass === true)

// 5. The evidence files the brief asks for exist and are not empty.
for (const path of [
  'docs/screenshots/m13-composer-light.png',
  'docs/screenshots/m13-composer-dark.png',
  'docs/screenshots/m13-chat-light.png',
  'docs/screenshots/m13-chat-dark.png',
  'docs/capture/live/m13-before.json',
  'docs/capture/live/m13-after.json',
  'docs/capture/live/m13-before-work-light.png',
  'docs/capture/live/m13-after-work-light.png',
  'docs/capture/live/m13-before-work-open-light.png',
  'docs/capture/live/m13-after-work-open-light.png',
  'docs/capture/live/m13-before-chat-light.png',
  'docs/capture/live/m13-after-chat-light.png'
]) {
  const full = loc(path)
  check(`evidence: ${path} exists and is not empty`, existsSync(full) && statSync(full).size > 1000)
}

if (failures > 0) {
  console.log(`\n${failures}/${checks} checks failed`)
  process.exitCode = 1
} else {
  console.log(`m13: ${checks} checks passed`)
}
