#!/usr/bin/env node
/**
 * P0-2 contract: the two-view model/effort panel, the 400K / pill geometry,
 * and the captured evidence table. Source-level checks run without a browser;
 * the final group reads docs/capture/live/model-panel.json, which the report
 * script writes from the measured frames.
 *
 * Run: node test/m12.test.mjs
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (path) => readFileSync(join(ROOT, path), 'utf8')

const composer = read('lib/client/composer.js')
const css = read('lib/client/css/65-work-card.css')
const tokens = read('lib/client/css/05-cgpt-tokens.css')
const darkTokens = read('lib/client/css/06-cgpt-tokens-dark.css')
const core = read('lib/shared/composer-core.mjs')
const bundle = read('lib/client.js')
const report = JSON.parse(read('docs/capture/live/model-panel.json'))
const interaction = JSON.parse(read('docs/capture/live/m12-interaction.json'))

let checks = 0
let failures = 0
const check = (name, condition, detail) => {
  checks += 1
  if (condition) return
  failures += 1
  console.log(`FAIL  ${name}${detail === undefined ? '' : ` — ${detail}`}`)
}

// 1. The panel still has the two levels introduced by M12 (P0-4 restyles them).
check('panel: simple view is rendered', composer.includes("className: 'chatgpt-model-simple'"))
check('panel: the choice block is the drill-in toggle', composer.includes("'data-cgpt-model-view-toggle': ''") && composer.includes("className: 'chatgpt-effort-choice'"))
check('panel: advanced view is rendered', composer.includes("className: 'chatgpt-model-advanced'"))
check('panel: every model row is a radio item', composer.includes("role: 'menuitemradio'") && composer.includes("'data-cgpt-model-choice'"))
check('panel: the view is exposed for measurement', composer.includes("'data-view': view"))
check('panel: the old effort head/level list is gone', !composer.includes('chatgpt-effort-level') && !composer.includes('chatgpt-model-menu-divider'))
check('panel: choosing a model returns to the simple view', /setView\('simple'\)\s*\n\s*send\(request\)/.test(composer))
check('panel: arrow keys walk the model rows', composer.includes("event.key === 'ArrowDown'") && composer.includes("event.key === 'ArrowUp'") && composer.includes('setActiveChoice(next)'))
check('panel: Enter picks the active row', composer.includes("if (event.key === 'Enter' || event.key === ' ')") && composer.includes('applyModel(picked)'))
check('panel: Escape is left to the shared dismiss hook', composer.includes("if (event.key === 'Escape' || event.altKey"))
check('panel: the Host description is kept in the core catalog shape', core.includes("description: typeof model.description === 'string'"))
check('panel: P0-4 does not paint a subtitle in the row', !composer.includes('chatgpt-model-choice-description'))
check('panel: the current row uses a check, not bolder text', composer.includes('CHATGPT_CHECK_SVG') && !/chatgpt-model-choice\[data-current='true'\]\s*\{[^}]*font-weight/.test(css))

// 2. Geometry superseded by P0-4 (see m14.test.mjs); M12 keeps the interaction contract.
check('geometry: panel is 280 wide', composer.includes("width: '280px'"))
check('geometry: panel uses the 16px overlay radius', /\.chatgpt-effort-menu \{[^}]*border-radius: var\(--cgpt-overlay-radius\)/.test(css))
check('geometry: advanced list caps at 420', /\.chatgpt-model-menu\[data-view='advanced'\] \{[^}]*max-height: 420px/.test(css))
check('geometry: simple view keeps 12/16/16 inside the 8px overlay inset', /\.chatgpt-model-simple \{[^}]*padding: 4px 8px 8px/.test(css))
check('geometry: model rows are 40 high with 12px item padding', /\.chatgpt-model-choice \{[^}]*height: 40px[^}]*padding: 0 12px/.test(css))
check('geometry: row name is 14/400', /\.chatgpt-model-choice \{[^}]*font-size: 14px[^}]*font-weight: 400/.test(css))
check('geometry: the provider header is 12px tertiary', /\.chatgpt-model-group-title \{[^}]*color: var\(--cgpt-effort-group-fg\)[^}]*font-size: 12px/.test(css))
check('geometry: the check uses the blue accent', /\.chatgpt-model-choice-check \{[^}]*color: var\(--cgpt-effort-accent\)/.test(css))
check('geometry: the effort name is 16/600', /\.chatgpt-effort-choice-name \{[^}]*font-size: 16px[^}]*font-weight: 600/.test(css))
check('geometry: the slider is 248 × 30 with a 34 round thumb', /\.chatgpt-effort-track \{[^}]*width: 100%[^}]*height: 30px[^}]*border-radius: 15px/.test(css) && /\.chatgpt-effort-thumb \{[^}]*width: 34px[^}]*height: 34px[^}]*border-radius: 50%/.test(css))

// 3. The DSH-only 400K chip follows the pill, not the old smaller chip.
check('chip: the context button is targeted', css.includes("button[aria-label='选择上下文大小']"))
check('chip: 36 high / 9999 / 14 / 500', /button\[aria-label='选择上下文大小'\] \{[^}]*height: 36px[^}]*border-radius: 9999px[^}]*font-size: 14px[^}]*font-weight: 500/.test(css))
check('chip: the glyph is 16 and the chevron 12', /button\[aria-label='选择上下文大小'\] svg \{[^}]*width: 16px[^}]*height: 16px/.test(css) && /_chevron'\] svg \{[^}]*width: 12px/.test(css))
check('chip: the slot root loses its 10px side padding', /\[data-slot='conversation.input.right'\] > :not\(\[data-cgpt-root\]\):not\(button\) \{[^}]*padding: 0/.test(css))
check('chip: tokens cover the unified overlay surface in both themes', tokens.includes('--cgpt-overlay-bg: #ffffff') && darkTokens.includes('--cgpt-overlay-bg: #2b2b2b') && tokens.includes('--cgpt-model-panel-bg: var(--cgpt-overlay-bg)'))
check('chip: the built bundle carries the new markup', bundle.includes('data-cgpt-model-view-toggle') && bundle.includes('chatgpt-model-simple') && bundle.includes('chatgpt-model-advanced'))

// 4. The evidence file is a reference → implementation → delta table.
check('evidence: 18 measured rows, all passing', report.diff.rows.length === 18 && report.diff.summary.failed.length === 0, JSON.stringify(report.diff.summary))
check('evidence: 8 assertions, all passing', report.assertions.length === 8 && report.assertionSummary.failed.length === 0, JSON.stringify(report.assertionSummary))
const row = (id) => report.diff.rows.find((entry) => entry.id === id)
check('evidence: panel width is 280', row('panel-width')?.implementation === 280)
check('evidence: M12 capture still records its own 16px radius', row('panel-radius')?.reference === 16)
check('evidence: M12 capture still records its own 36px rows', row('panel-row-height')?.implementation === 36)
check('evidence: card top gap is reference + 1', row('card-top-gap')?.delta === 1)
check('evidence: bottom centers are 0', row('bottom-centers')?.delta === 0)
check('evidence: chip and pill are 36 high', row('chip-height')?.pass === true)
check('evidence: interaction contract is green', Object.values(interaction.checks).every(Boolean), JSON.stringify(interaction.checks))

if (failures > 0) {
  console.log(`\n${failures}/${checks} checks failed`)
  process.exitCode = 1
} else {
  console.log(`m12: ${checks} checks passed`)
}
