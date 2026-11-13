#!/usr/bin/env node
/**
 * P0-14 — the three desktop menus, re-cut against the 2026-11-07 references.
 *
 * Three guarantees, all from files already in the repo:
 *
 *   1. numbers      docs/m26.json's table is self-consistent (逻辑px = 像素/2,
 *      each 误差 recomputed from 实现px) and every row is inside the 1px budget
 *      unless it is explicitly marked as content-dependent or as a documented
 *      deviation;
 *   2. implementation the values that table claims are the values the
 *      stylesheet declares (the P0-14 token block) and the values the built
 *      client renders — proved by the DPR-2 implementation frames, whose pixel
 *      size must be the measured CSS size × 2;
 *   3. the three fixes   the selected row really is ✓-only with no fill, and
 *      完全访问权限 really paints glyph, title and description in the reference
 *      orange, with the composer chip on the same 帮我批准 glyph. P0-18 removed
 *      the ChatGPT caption row from the product; the historical P0-14 frames
 *      keep it locally (tools/m26-capture.mjs) so this evidence stays frozen.
 *
 * Run: node test/m26.test.mjs
 */

import { existsSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readPng } from '../scripts/png-read.mjs'
import { loc, read, skipSuite } from './evidence.mjs'
skipSuite(import.meta.url)

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

let checks = 0
let failures = 0
const check = (name, condition, detail) => {
  checks += 1
  if (condition === true) {
    console.log(`ok ${checks} - ${name}`)
    return
  }
  failures += 1
  console.error(`not ok ${checks} - ${name}${detail === undefined ? '' : ` — ${JSON.stringify(detail)}`}`)
}

const m26 = JSON.parse(read('docs/m26.json'))
const workCss = read('lib/client/css/65-work-card.css')
const sessionsCss = read('lib/client/css/25-sessions.css')
const overlayCss = read('lib/client/css/76-overlay.css')
const composerCss = read('lib/client/css/40-composer.css')
const tokens = read('lib/client/css/05-cgpt-tokens.css')
const darkTokens = read('lib/client/css/06-cgpt-tokens-dark.css')
const composerJs = read('lib/client/composer.js')
const clientJs = read('lib/client.js')
const metrics = JSON.parse(read('docs/capture/m26/impl-metrics.json')).surfaces

// ---- 1. the table is arithmetic-consistent and inside the budget ----------
check('m26: the reference scale is 2 device px per CSS px',
  m26.scale.devicePixelsPerCssPixel === 2 && m26.referenceBaselines.length === 3)

const rows = m26.surfaces.flatMap((surface) => surface.elements.map((element) => ({ surface: surface.name, ...element })))
const logicalOk = rows.filter((row) => Math.abs(row.logical - row.referencePx / 2) > 0.001)
check('m26: every 换算逻辑px is 参考图像素 / 2', logicalOk.length === 0, logicalOk.map((row) => [row.surface, row.element]))

const errorOk = rows.filter((row) => Math.abs(row.error - Math.round(Math.abs(row.implemented - row.logical) * 100) / 100) > 0.001)
check('m26: every 误差 is |实现px − 换算逻辑px| as written', errorOk.length === 0, errorOk.map((row) => [row.surface, row.element, row.error]))

const overBudget = rows.filter((row) => row.error > 1 && row.contentDependent !== true && row.exempt !== true)
check('m26: every exchangeable element is within 1px', overBudget.length === 0, overBudget.map((row) => [row.surface, row.element, row.error]))
check('m26: every over-budget row is marked content-sized or explicitly exempted',
  rows.filter((row) => row.error > 1).every((row) => row.contentDependent === true || row.exempt === true),
  rows.filter((row) => row.error > 1).map((row) => [row.element, row.error]))

// ---- 2. the table's numbers are the stylesheet's numbers ------------------
const declarations = [
  ['--cgpt-desktop-menu-pad-x: 12px', tokens],
  ['--cgpt-desktop-menu-pad-y: 4.25px', tokens],
  ['--cgpt-desktop-menu-row-height: 28.5px', tokens],
  ['--cgpt-desktop-menu-icon-slot: 18px', tokens],
  ['--cgpt-desktop-menu-icon-gap: 4px', tokens],
  ['--cgpt-desktop-menu-font: 13px', tokens],
  ['--cgpt-desktop-menu-radius: 16px', tokens],
  ['--cgpt-desktop-menu-min-width: 164.5px', tokens],
  ['--cgpt-desktop-menu-separator-height: 9.5px', tokens],
  ['--cgpt-desktop-permission-width: 298px', tokens],
  ['--cgpt-desktop-permission-row-height: 42.5px', tokens],
  ['--cgpt-desktop-permission-title-font: 13px', tokens],
  ['--cgpt-desktop-permission-description-font: 12px', tokens],
  ['--cgpt-desktop-permission-title-line: 17px', tokens],
  ['--cgpt-desktop-card-pad-y: 5px', tokens],
  ['--cgpt-desktop-chip-height: 24px', tokens],
  ['--cgpt-desktop-chip-icon: 16px', tokens],
  ['--cgpt-desktop-chip-text: #a2a2a2', darkTokens],
  ['--cgpt-desktop-menu-title: #979797', darkTokens],
  ['--cgpt-desktop-menu-muted: #949494', darkTokens],
  ['--cgpt-desktop-menu-icon-color: #cacaca', darkTokens],
  ['--cgpt-desktop-menu-strong: #ffffff', darkTokens],
  ['--cgpt-desktop-menu-warning: #ff8549', darkTokens]
]
const missing = declarations.filter(([literal, source]) => source.includes(literal) !== true)
check('m26: the P0-14 token block declares every number and colour the table reports', missing.length === 0, missing.map(([literal]) => literal))

const permissionRow = m26.surfaces.find((surface) => surface.name === 'permission').elements.find((element) => element.element === '行距（相邻行标题 ink 顶）')
check('m26: the reported 42.5px row pitch is the token the stylesheet uses',
  permissionRow.implemented === 42.5 && /--cgpt-desktop-permission-row-height:\s*42\.5px/.test(tokens) && /height:\s*var\(--cgpt-desktop-permission-row-height\)/.test(workCss))
check('m26: the picker surface takes its width, gutter and corner from those tokens',
  /\.chatgpt-work-menu\.chatgpt-permission-menu\s*\{[^}]*width:\s*var\(--cgpt-desktop-permission-width\) !important[^}]*padding:\s*var\(--cgpt-desktop-permission-pad-y\) var\(--cgpt-desktop-menu-pad-x\)/s.test(overlayCss) &&
  /--cgpt-desktop-permission-pad-y:\s*9px/.test(tokens) &&
  !/\.chatgpt-permission-head\s*\{/.test(workCss))

// ---- 3. the frames measure the implementation, not a mock -----------------
const frames = [
  ['permission', 'docs/capture/m26/impl-permission.png', metrics.permission.box],
  ['project-menu', 'docs/capture/m26/impl-project-menu.png', metrics['project-menu'].box],
  ['project-card', 'docs/capture/m26/impl-project-card.png', metrics['project-card'].box],
  ['permission-chip', 'docs/capture/m26/impl-permission-chip.png', metrics['permission-chip'].box]
]
const frameErrors = frames.map(([name, file, box]) => {
  if (existsSync(loc(file)) !== true) return [name, 'missing']
  const png = readPng(loc(file))
  // A screenshot is clipped to whole device pixels, so a fractional CSS box can
  // land one device px either side of the exact 2x product.
  return [name, Math.max(0, Math.abs(png.width - box.width * 2) - 1), Math.max(0, Math.abs(png.height - box.height * 2) - 1)]
})
check('m26: each implementation frame is the measured CSS box at 2x, within 1 device px',
  frameErrors.every(([, width, height]) => typeof width === 'number' && width <= 1 && height <= 1), frameErrors)

check('m26: the historical picker measures 298 wide and 164 tall; the ⋯ menu 164.5x208; the chip is 36 tall',
  metrics.permission.box.width === 298 && metrics.permission.box.height === 164 &&
  metrics['project-menu'].box.width === 164.5 && metrics['project-menu'].box.height === 208 &&
  metrics['permission-chip'].box.height === 36)

const bandReport = JSON.parse(read('docs/capture/m26/measure.json'))
// The left edge is the menu gutter + glyph slot, so it must agree for every
// band. The right edge is the end of a string: only the picker's copy is the
// same text on both sides, so only there is it a geometry check.
const leftOff = bandReport.surfaces.filter((surface) => surface.name !== 'permission-chip').flatMap((surface) => surface.bands).filter((band) => band.error !== null && band.error.left > 1)
const pickerRightOff = bandReport.surfaces.find((surface) => surface.name === 'permission').bands.filter((band) => band.error !== null && band.error.right > 2)
check('m26: the band report covers all four surfaces and every ink left edge is within 1px',
  bandReport.surfaces.length === 4 &&
  bandReport.surfaces.every((surface) => surface.bands.length > 0) &&
  leftOff.length === 0,
  leftOff.map((band) => [band.label, band.error.left]))
check('m26: the picker — the one surface whose copy is identical on both sides — ends every band within 2px',
  pickerRightOff.length === 0, pickerRightOff.map((band) => [band.label, band.error.right]))

check('m26: the picker row pitch re-measured from the frames is 42.5 (reference 42.5)',
  (() => {
    const permission = bandReport.surfaces.find((surface) => surface.name === 'permission')
    const impl = permission.bands.map((band) => band.implementation).filter(Boolean)
    const pitch = (impl[4].y - impl[2].y) / 2
    return Math.abs(pitch - 42.5) <= 0.5
  })())

// ---- 4. the three confirmed fixes ----------------------------------------
// P0-18 supersedes P0-14's caption row. The historical frame in
// tools/m26-capture.mjs still renders it, but the product must not.
check('fix 1 (superseded): the ChatGPT caption row and 了解更多 link are gone from the product',
  !composerJs.includes('chatgpt-permission-head') &&
  !composerJs.includes('应如何批准 ChatGPT 操作?') &&
  !composerJs.includes('了解更多') &&
  !clientJs.includes('应如何批准 ChatGPT 操作?') &&
  !/\.chatgpt-permission-head/.test(workCss))

check('fix 2: the current row has no fill and only the trailing ✓',
  /\.chatgpt-permission-row\[data-current='true'\]\s*\{\s*background:\s*transparent;?/s.test(workCss) &&
  /\.chatgpt-permission-row\[data-current='true'\] \.chatgpt-permission-description\s*\{[^}]*opacity:\s*1/s.test(workCss) &&
  /chatgpt-work-menu-check/.test(composerJs))

check('fix 3: 完全访问权限 paints glyph, title, description and ✓ with the desktop orange',
  /\.chatgpt-permission-row\.is-full-access[\s\S]{0,400}?color:\s*var\(--cgpt-desktop-menu-warning\)/.test(workCss) &&
  /\.is-full-access \.chatgpt-permission-icon/.test(workCss) &&
  /\.is-full-access \.chatgpt-work-menu-label/.test(workCss) &&
  /\.is-full-access \.chatgpt-permission-description/.test(workCss))

check('fix 3: the composer chip uses the 帮我批准 glyph (permissionAuto), not the generic shield',
  /dangerouslySetInnerHTML:\s*\{\s*__html:\s*CHATGPT_PERMISSION_AUTO_SVG\s*\}/.test(composerJs) &&
  !/className:\s*'chatgpt-permission'[\s\S]{0,600}?CHATGPT_SHIELD_SVG/.test(composerJs))
// P0-18 supersedes the P0-14 chip geometry: the chip is now the fourth composer
// tool button (36px, 0/8 padding, 9999 radius, 20px glyph, 14px caption), so
// this P0-14 gate only keeps the glyph identity and rejects the old capsule.
check('fix 3: the chip stays the 帮我批准 glyph and no longer the P0-14 capsule',
  /\.chatgpt-permission\s*\{[^}]*height:\s*36px/s.test(composerCss) &&
  /\.chatgpt-permission\s*\{[^}]*padding:\s*0 8px/s.test(composerCss) &&
  /\.chatgpt-permission\s*\{[^}]*border-radius:\s*9999px/s.test(composerCss) &&
  /\.chatgpt-permission \.chatgpt-permission-icon\s*\{[^}]*width:\s*20px/s.test(overlayCss) &&
  !/\.chatgpt-permission\s*\{[^}]*height:\s*var\(--cgpt-desktop-chip-height\)/s.test(composerCss))

// ---- 5. the overlays exist ------------------------------------------------
const overlays = m26.surfaces.map((surface) => surface.overlay)
check('m26: one same-scale overlay per surface, each written and non-trivial',
  overlays.length === 4 && overlays.every((file) => existsSync(loc(file)) && statSync(loc(file)).size > 3000),
  overlays.filter((file) => !existsSync(loc(file))))
check('m26: the overlay report lists the same four sheets with their alignment rule',
  JSON.parse(read('docs/m26-sheets.json')).sheets.length === 4 &&
  JSON.parse(read('docs/m26-sheets.json')).panels.join('|') === 'reference|implementation|blend 50/50')

console.log(`\n${checks - failures}/${checks} P0-14 checks passed`)
process.exit(failures === 0 ? 0 : 1)
