#!/usr/bin/env node
/**
 * Selector contract test.
 *
 * The skin has no host API to lean on: it paints against DOM anchors the host
 * happens to publish (`data-slot` outlets, `data-chat-flow-kind` markers, and
 * the stable tail of CSS-module class names). A host upgrade can rename any of
 * them silently, which would leave dead CSS and a half-styled window. This test
 * turns that into a red light:
 *
 *   1. every `tier: "boot"` anchor must appear in test/fixtures/dom-snapshot.html;
 *   2. `tier: "session"` / `tier: "flow"` anchors are reported as pending until a
 *      snapshot with an open session exists (they need a signed-in profile);
 *   3. every anchor used by css/*.css must be declared in test/contract.json —
 *      a new selector cannot slip in without a contract entry and a fixture.
 *
 * Run: node test/selectors.contract.mjs   (npm test)
 * Exit: 0 pass (or skip), 1 contract breach.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const contract = JSON.parse(readFileSync(join(ROOT, 'test/contract.json'), 'utf8'))
const snapshotPath = join(ROOT, contract.snapshot)

const SKIP_HINT = `snapshot missing: ${contract.snapshot}
How to generate it (needs a running DSH Web UI; the token URL is printed by \`dsh web\`):
  1) node scripts/capture-snapshot.mjs --url "http://127.0.0.1:3099/?token=..."
  2) commit the resulting file; the contract test then runs for real.
Nothing is asserted in this run — this is a skip, not a pass.`

if (!existsSync(snapshotPath)) {
  console.log(`SKIP  ${SKIP_HINT}`)
  process.exit(0)
}

const html = readFileSync(snapshotPath, 'utf8')
const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** How each anchor kind is counted in the snapshot. */
const counters = {
  'data-slot': (value) => new RegExp(`data-slot="${escapeRegex(value)}"`, 'g'),
  'data-chat-flow-kind': (value) => new RegExp(`data-chat-flow-kind="${escapeRegex(value)}"`, 'g'),
  'class-substring': (value) => new RegExp(`class="[^"]*${escapeRegex(value)}`, 'g'),
  attribute: (value) => new RegExp(escapeRegex(value), 'g')
}

const count = (anchor) => {
  const make = counters[anchor.kind]
  if (make === undefined) throw new Error(`anchor ${anchor.id}: unknown kind ${anchor.kind}`)
  return (html.match(make(anchor.value)) ?? []).length
}

const missingBoot = []
const pending = []
for (const anchor of contract.anchors) {
  const hits = count(anchor)
  if (hits > 0) continue
  if (anchor.tier === 'boot') missingBoot.push(anchor)
  else pending.push(anchor)
}

/** Lint the stylesheets: every anchor a rule names must be in the contract. */
const cssDir = join(ROOT, 'lib/client/css')
const declared = new Set(contract.anchors.filter((a) => a.kind === 'data-slot').map((a) => a.value))
const declaredClasses = new Set(contract.anchors.filter((a) => a.kind === 'class-substring').map((a) => a.value))
const undeclared = []
for (const file of readdirSync(cssDir).filter((name) => name.endsWith('.css'))) {
  const text = readFileSync(join(cssDir, file), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
  for (const match of text.matchAll(/data-slot\s*=\s*['"]([^'"]+)['"]/g)) {
    if (!declared.has(match[1])) undeclared.push(`${file}: data-slot="${match[1]}"`)
  }
  for (const match of text.matchAll(/class\*=\s*['"]([^'"]+)['"]/g)) {
    if (!declaredClasses.has(match[1])) undeclared.push(`${file}: class*="${match[1]}"`)
  }
}

const bootTotal = contract.anchors.filter((a) => a.tier === 'boot').length
console.log(`snapshot: ${contract.snapshot} (${html.length} bytes)`)
console.log(`boot anchors: ${bootTotal - missingBoot.length}/${bootTotal} hit`)
if (pending.length > 0) {
  console.log(`pending (needs a live session snapshot): ${pending.map((a) => a.id).join(', ')}`)
}
for (const anchor of missingBoot) {
  console.log(`MISS  ${anchor.id}  ${anchor.kind}="${anchor.value}"  (${anchor.usedBy})`)
}
for (const item of undeclared) {
  console.log(`UNDECLARED  ${item} — add it to test/contract.json before using it`)
}

/** Design contract: measured rail/sidebar values and no palette leaks outside the token file. */
const tokenFile = 'lib/client/css/05-cgpt-tokens.css'
const tokenText = readFileSync(join(ROOT, tokenFile), 'utf8')
const railCss = readFileSync(join(ROOT, 'lib/client/css/21-rail.css'), 'utf8')
const railJs = readFileSync(join(ROOT, 'lib/client/rail.js'), 'utf8')
const designBreaches = []
for (const [name, value] of Object.entries({
  railWidth: '--cgpt-rail-width: 52px;',
  panelWidth: '--cgpt-panel-width: 288px;',
  railButton: '--cgpt-rail-button-size: 36px;',
  railIcon: '--cgpt-rail-icon-size: 20px;',
  railGap: '--cgpt-rail-gap: 8px;',
  panelRadius: '--cgpt-radius-panel: 16px;',
  segmentWidth: '--cgpt-segment-width: 224px;',
  // P0-16: the thumb is exactly one half of the 224px track (was 121×37, which
  // overhung the neighbouring segment by 9px and made the two halves unequal).
  segmentThumb: '--cgpt-segment-thumb-width: 112px;',
  segmentThumbHeight: '--cgpt-segment-thumb-height: 36px;'
})) {
  if (!tokenText.includes(value)) designBreaches.push(`${tokenFile}: missing ${name} (${value})`)
}
if (!railCss.includes('width: var(--cgpt-rail-width)')) designBreaches.push('21-rail.css: rail width must use --cgpt-rail-width')
if (!railJs.includes("'shell.overlay'") || !railJs.includes("'settings.launcher'") || !railJs.includes('priority: -1')) designBreaches.push('rail.js: settings bridge and shell.overlay registration are required')
if (!railJs.includes("id: 'chat'") || !railJs.includes("id: 'work'") || !railJs.includes("id: 'agent'") || !railJs.includes("id: 'schedules'") || !railJs.includes("id: 'settings'")) designBreaches.push('rail.js: five measured entries are required')
for (const file of readdirSync(cssDir).filter((name) => name.endsWith('.css') && name !== '05-cgpt-tokens.css' && name !== '06-cgpt-tokens-dark.css')) {
  const text = readFileSync(join(cssDir, file), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
  if (/#(?:fff|ffffff|000|000000)\b/i.test(text) || /rgba\(\s*255\s*,\s*255\s*,\s*255\s*,|rgba\(\s*0\s*,\s*0\s*,\s*0\s*,/i.test(text)) {
    designBreaches.push(`${file}: raw white/black colour outside the token files`)
  }
}
if (designBreaches.length > 0) {
  for (const breach of designBreaches) console.log(`DESIGN  ${breach}`)
}

if (missingBoot.length > 0 || undeclared.length > 0 || designBreaches.length > 0) {
  console.log(
    `\nFAIL  ${missingBoot.length} missing anchor(s), ${undeclared.length} undeclared selector(s), ${designBreaches.length} design breach(es).\n` +
      'Re-capture the snapshot, diff it against the contract, then either update the selectors or record the host change.'
  )
  process.exit(1)
}

console.log(`PASS  ${bootTotal} boot anchors present, stylesheet selectors all declared, rail/token design contract met`)
