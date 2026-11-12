#!/usr/bin/env node
/**
 * tools/m25-icon-diff.mjs — prove the shipped menu glyphs are the reference's,
 * not a drawing of them.
 *
 * For every glyph in `lib/client/menu-icons.js` the tool re-reads the capture
 * (`docs/capture/live/project-menus.json`, plus `m25b-permission.json` for the
 * permission picker), finds the source the glyph claims
 * (`sprite:<symbol id>`, `mask:<menu>/<label>`, `inline:<aria>` or
 * `menu:m25b-permission/<label>`), and compares
 * the `viewBox` and the ordered list of path `d` strings — as strings, exactly.
 * The result is a boolean per glyph, never a similarity score: either the
 * reference's own path data is in the file or it is not.
 *
 *   node tools/m25-icon-diff.mjs [--out docs/m25-icons-diff.json] [--quiet]
 *
 * Exits non-zero when any glyph is not identical, or when the bundle draws a
 * menu glyph inline instead of taking it from `menu-icons.js`.
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const args = new Map()
for (let index = 2; index < process.argv.length; index += 1) {
  const key = process.argv[index]
  if (!key.startsWith('--')) continue
  const next = process.argv[index + 1]
  if (next === undefined || next.startsWith('--')) args.set(key.slice(2), true)
  else {
    args.set(key.slice(2), next)
    index += 1
  }
}
const OUT = resolve(ROOT, typeof args.get('out') === 'string' ? args.get('out') : 'docs/m25-icons-diff.json')
mkdirSync(dirname(OUT), { recursive: true })
const QUIET = args.get('quiet') === true

const capture = JSON.parse(readFileSync(join(ROOT, 'docs/capture/live/project-menus.json'), 'utf8'))
const permission = JSON.parse(readFileSync(join(ROOT, 'docs/capture/live/m25b-permission.json'), 'utf8'))
const iconsSource = readFileSync(join(ROOT, 'lib/client/menu-icons.js'), 'utf8')
const bundle = readFileSync(join(ROOT, 'lib/client.js'), 'utf8')

const { CHATGPT_MENU_ICONS } = new Function(`${iconsSource}\n;return { CHATGPT_MENU_ICONS }`)()

/** `<svg …>` → { viewBox, d[] } with the path order preserved. */
function parse(svg) {
  const viewBox = (svg.match(/viewBox="([^"]+)"/) ?? [])[1] ?? null
  const ds = [...svg.matchAll(/<path\b[^>]*?\sd="([^"]+)"/g)].map((match) => match[1])
  return { viewBox, ds }
}

/** The reference body a glyph claims, straight out of the capture. */
function referenceOf(origin) {
  if (origin.startsWith('sprite:')) {
    const id = origin.slice('sprite:'.length)
    const symbol = capture.sprite?.symbols?.[id]
    if (symbol === null || symbol === undefined) return null
    return { viewBox: symbol.viewBox, ds: symbol.paths.map((path) => path.d), where: `sprite symbol #${id}` }
  }
  if (origin.startsWith('mask:')) {
    const [menuKey, label] = [origin.split('/')[0].slice('mask:'.length), origin.slice(origin.indexOf('/') + 1)]
    for (const surface of capture.menus[menuKey] ?? []) {
      for (const item of surface.items ?? []) {
        if (item.text !== label) continue
        const mask = (item.masks ?? [])[0]
        if (mask === undefined) return null
        return parse(mask.svg.replace(/^data:image\/svg\+xml;utf8,/, '')) !== null
          ? { ...parse(mask.svg.replace(/^data:image\/svg\+xml;utf8,/, '')), where: `${menuKey}/${label} mask-image` }
          : null
      }
    }
    return null
  }
  if (origin.startsWith('menu:')) {
    const label = origin.slice(origin.indexOf('/') + 1)
    const surface = permission.themes?.dark?.surfaces?.[0]
    const item = (surface?.items ?? []).find((entry) => (entry.text ?? '').split(' ')[0] === label)
    const outer = item?.icon?.html
    if (typeof outer !== 'string') return null
    return { ...parse(outer), where: `m25b-permission.json row「${label}」leading svg` }
  }
  if (origin.startsWith('inline:')) {
    const prefix = origin.slice('inline:'.length).replace('…', '')
    const action = (capture.projectRow?.actions ?? []).find((entry) => (entry.aria ?? '').startsWith(prefix))
    const outer = action?.glyph?.outerHTML
    if (typeof outer !== 'string') return null
    return { ...parse(outer), where: `live node [aria-label^="${prefix}"]` }
  }
  return null
}

const rows = []
for (const [key, glyph] of Object.entries(CHATGPT_MENU_ICONS)) {
  const used = parse(glyph.svg)
  const reference = referenceOf(glyph.origin)
  const viewBoxEqual = reference !== null && reference.viewBox === used.viewBox
  const pathsEqual = reference !== null && JSON.stringify(reference.ds) === JSON.stringify(used.ds) && used.ds.length > 0
  rows.push({
    key,
    origin: glyph.origin,
    reference: reference?.where ?? null,
    renderedSize: glyph.size,
    viewBox: used.viewBox,
    referenceViewBox: reference?.viewBox ?? null,
    pathCount: used.ds.length,
    referencePathCount: reference?.ds.length ?? null,
    viewBoxIdentical: viewBoxEqual === true,
    pathsIdentical: pathsEqual === true,
    identical: viewBoxEqual === true && pathsEqual === true
  })
}

/** The bundle must not draw a menu glyph by hand. */
const sessionsSource = readFileSync(join(ROOT, 'lib/client/sessions.js'), 'utf8')
const composerSource = readFileSync(join(ROOT, 'lib/client/composer.js'), 'utf8')
const projectSource = readFileSync(join(ROOT, 'lib/client/project.js'), 'utf8')
const handDrawn = []
for (const [file, source] of [
  ['lib/client/sessions.js', sessionsSource],
  ['lib/client/composer.js', composerSource],
  ['lib/client/project.js', projectSource]
]) {
  const maps = source.match(/const CHATGPT_(?:SESSION_ICONS|SESSION_MENU_ICONS|PROJECT_FILE_SVGS)[\s\S]*?\n\}/g) ?? []
  for (const block of maps) {
    const inline = block.match(/:\s*'(?:<svg[\s\S]*?)'/g) ?? []
    for (const entry of inline) if (entry.includes('<path')) handDrawn.push(`${file}: ${entry.slice(0, 60)}…`)
  }
}
const usesMenuGlyph = (source) => (source.match(/chatgptMenuGlyph\(/g) ?? []).length
const bundleChecks = {
  bundleIncludesMenuIcons: bundle.includes('CHATGPT_MENU_ICONS'),
  sessionsUsesCapturedGlyphs: usesMenuGlyph(sessionsSource) > 0,
  composerUsesCapturedGlyphs: usesMenuGlyph(composerSource) > 0,
  projectUsesCapturedGlyphs: usesMenuGlyph(projectSource) > 0,
  handDrawnMenuPaths: handDrawn
}

const allIdentical = rows.every((row) => row.identical === true)
const report = {
  unit: 'string-equality (not similarity)',
  generatedAt: new Date().toISOString(),
  source: 'docs/capture/live/project-menus.json + m25b-permission.json vs lib/client/menu-icons.js',
  summary: {
    glyphs: rows.length,
    identical: rows.filter((row) => row.identical === true).length,
    allIdentical,
    ...bundleChecks
  },
  icons: rows
}
writeFileSync(OUT, JSON.stringify(report, null, 2) + '\n')

if (!QUIET) {
  for (const row of rows) {
    console.log(`${row.identical === true ? 'PASS' : 'FAIL'}  ${row.key.padEnd(18)} ${row.origin}`)
    if (row.identical !== true) console.log(`      viewBox ${row.viewBox} vs ${row.referenceViewBox}, paths ${row.pathCount} vs ${row.referencePathCount}`)
  }
  console.log(`\n${report.summary.identical}/${report.summary.glyphs} glyphs are byte-identical to the reference path data`)
  console.log(`hand-drawn menu paths left in the sources: ${handDrawn.length}`)
}
console.log(`m25-icon-diff: ${allIdentical && handDrawn.length === 0 ? 'PASS' : 'FAIL'} → ${OUT.relativeTo ?? OUT}`)
process.exit(allIdentical && handDrawn.length === 0 ? 0 : 1)
