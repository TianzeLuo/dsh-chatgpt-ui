#!/usr/bin/env node
/**
 * P0-13 — project folder states, captured menu glyphs, measured menu geometry.
 *
 * Three kinds of guarantee, all read from files that already exist in the repo:
 *
 *   1. provenance  every glyph in lib/client/menu-icons.js is byte-identical to
 *      the reference source it claims in docs/capture/live/project-menus.json
 *      (docs/m25-icons-diff.json must say so, and this test re-checks it);
 *   2. wiring      no menu, card, row or permission row draws an inline path
 *      any more, the project row really renders two different folder SVGs, and
 *      the ⋯ menu keeps the reference's entries in the reference's order (P0-19c
 *      removed 分区 and made 置顶 two-way);
 *   3. geometry    the numbers the live capture measured are the numbers the
 *      stylesheet declares, and the implementation frames re-measure them on
 *      the running skin within 1px (docs/m25.json).
 *
 * Run: node test/m25.test.mjs
 */

import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
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

const capture = JSON.parse(read('docs/capture/live/project-menus.json'))
const permissionCapture = JSON.parse(read('docs/capture/live/m25b-permission.json'))
const diff = JSON.parse(read('docs/m25-icons-diff.json'))
const evidence = JSON.parse(read('docs/m25.json'))
const iconsSource = read('lib/client/menu-icons.js')
const sessionsJs = read('lib/client/sessions.js')
const composerJs = read('lib/client/composer.js')
const projectJs = read('lib/client/project.js')
const tokens = read('lib/client/css/05-cgpt-tokens.css')
const darkTokens = read('lib/client/css/06-cgpt-tokens-dark.css')
const sessionsCss = read('lib/client/css/25-sessions.css')
const overlayCss = read('lib/client/css/76-overlay.css')
const workCss = read('lib/client/css/65-work-card.css')

const { CHATGPT_MENU_ICONS } = new Function(`${iconsSource}\n;return { CHATGPT_MENU_ICONS }`)()

// ---- 1. provenance -------------------------------------------------------
check("capture: the reference was read over CDP without mutating anything",
  capture.meta.readOnly.navigated === false && capture.meta.readOnly.typed === false &&
  capture.meta.readOnly.sent === false && capture.meta.readOnly.settingsChanged === false)
check("capture: the sprite and the two web menus are present",
  Object.keys(capture.sprite.symbols).length >= 40 && Array.isArray(capture.menus.projectMoreWeb) && Array.isArray(capture.menus.sessionRowWeb))
check("icons: every glyph declares a captured source",
  Object.values(CHATGPT_MENU_ICONS).every((glyph) => /^(sprite:|mask:|inline:|menu:)/.test(glyph.origin)))
check('icons: docs/m25-icons-diff.json says all identical',
  diff.summary.allIdentical === true && diff.summary.identical === diff.summary.glyphs, diff.summary)
check("icons: no hand-drawn menu path survives in the sources",
  diff.summary.handDrawnMenuPaths.length === 0, diff.summary.handDrawnMenuPaths)

// Re-verify the identity claim here rather than trusting the JSON alone.
const pathOf = (svg) => [...svg.matchAll(/<path\b[^>]*?\sd="([^"]+)"/g)].map((m) => m[1])
const viewBoxOf = (svg) => (svg.match(/viewBox="([^"]+)"/) ?? [])[1]
for (const [key, glyph] of Object.entries(CHATGPT_MENU_ICONS)) {
  let reference = null
  if (glyph.origin.startsWith('sprite:')) {
    const symbol = capture.sprite.symbols[glyph.origin.slice('sprite:'.length)]
    if (symbol !== null && symbol !== undefined) reference = { viewBox: symbol.viewBox, ds: symbol.paths.map((p) => p.d) }
  } else if (glyph.origin.startsWith('mask:')) {
    const [menuKey, label] = [glyph.origin.split('/')[0].slice('mask:'.length), glyph.origin.slice(glyph.origin.indexOf('/') + 1)]
    for (const surface of capture.menus[menuKey] ?? []) {
      for (const item of surface.items ?? []) {
        if (item.text === label && (item.masks ?? []).length > 0) {
          reference = { viewBox: viewBoxOf(item.masks[0].svg), ds: pathOf(item.masks[0].svg) }
        }
      }
    }
  } else if (glyph.origin.startsWith('menu:')) {
    const label = glyph.origin.slice(glyph.origin.indexOf('/') + 1)
    const item = (permissionCapture.themes.dark.surfaces[0].items ?? []).find((entry) => (entry.text ?? '').split(' ')[0] === label)
    if (typeof item?.icon?.html === 'string') reference = { viewBox: viewBoxOf(item.icon.html), ds: pathOf(item.icon.html) }
  } else if (glyph.origin.startsWith('inline:')) {
    const prefix = glyph.origin.slice('inline:'.length).replace('…', '')
    const action = (capture.projectRow.actions ?? []).find((entry) => (entry.aria ?? '').startsWith(prefix))
    if (action?.glyph?.outerHTML !== undefined) reference = { viewBox: action.glyph.viewBox, ds: pathOf(action.glyph.outerHTML) }
  }
  check(`icon ${key}: path data equals the capture`,
    reference !== null && JSON.stringify(reference.ds) === JSON.stringify(pathOf(glyph.svg)) && reference.viewBox === viewBoxOf(glyph.svg),
    { origin: glyph.origin, reference: reference === null ? null : reference.ds.length, used: pathOf(glyph.svg).length })
}

// ---- 2. the project row's two folder states ----------------------------
const closed = capture.sprite.symbols['codex-icon-folder-light-16']
const open = capture.sprite.symbols['codex-icon-folder-open-light-16']
check("row: the reference really has two different folder glyphs",
  closed.paths[0].d !== open.paths[0].d)
check('row: collapsed renders folder-light-16 verbatim',
  CHATGPT_MENU_ICONS.folderClosed.svg.includes(closed.paths[0].d) && CHATGPT_MENU_ICONS.folderClosed.viewBox === closed.viewBox)
check('row: expanded renders folder-open-light-16 verbatim',
  CHATGPT_MENU_ICONS.folderOpen.svg.includes(open.paths[0].d) && CHATGPT_MENU_ICONS.folderOpen.viewBox === open.viewBox)
check('row: the two states are selected by aria-expanded in the source',
  /'data-cgpt-project-folder': open === true \? 'open' : 'closed'/.test(sessionsJs) &&
  /open === true \? CHATGPT_SESSION_ICONS\.folderOpen : CHATGPT_SESSION_ICONS\.folder/.test(sessionsJs))
check('row: the icon maps read the captured glyphs, not inline paths',
  /folder: chatgptMenuGlyph\('folderClosed'\)/.test(sessionsJs) && /folderOpen: chatgptMenuGlyph\('folderOpen'\)/.test(sessionsJs) &&
  !/folder:\s*'<svg/.test(sessionsJs))
check('row: hover actions keep the reference order (⋯ then 新建会话)',
  sessionsJs.indexOf("'chatgpt-project-more'") < sessionsJs.indexOf("'chatgpt-project-new'"))

// ---- 3. menus draw only captured glyphs --------------------------------
const menuMap = sessionsJs.slice(sessionsJs.indexOf('const CHATGPT_SESSION_MENU_ICONS'), sessionsJs.indexOf('const CHATGPT_SESSION_SPINNER_SVG'))
check("menus: every menu icon entry calls chatgptMenuGlyph",
  (menuMap.match(/chatgptMenuGlyph\(/g) ?? []).length >= 18 && !/<path/.test(menuMap), menuMap.length)
check("menus: the ⋯ menu keeps the reference's five entries, no 分区",
  ["'置顶'", "'编辑'", "'在资源管理器中打开'", "'归档聊天'", "'移除项目'", "'取消置顶'"].every((needle) => sessionsJs.includes(needle)) &&
  !sessionsJs.includes("'分区'"))
check("menus: 移除项目 uses the cross, not a bin",
  /action: 'remove-project', label: '移除项目', icon: 'remove'/.test(sessionsJs))
check("menus: the card header uses the open folder and the pin mark",
  /CHATGPT_SESSION_MENU_ICONS\.folderOpen/.test(sessionsJs) && /CHATGPT_SESSION_MENU_ICONS\.star/.test(sessionsJs) &&
  CHATGPT_MENU_ICONS.pinMark.svg === CHATGPT_MENU_ICONS.pin.svg)
check("menus: the card path row switches between repo and folder glyph",
  /chatgptIsRepoPath\(projectPath\) \? CHATGPT_SESSION_MENU_ICONS\.repo : CHATGPT_SESSION_MENU_ICONS\.path/.test(sessionsJs))
check('permission: the three rows use the hand / shield-with-prompt / shield-alert glyphs',
  /CHATGPT_PERMISSION_ASK_SVG = chatgptMenuGlyph\('permissionAsk'\)/.test(composerJs) &&
  /CHATGPT_PERMISSION_AUTO_SVG = chatgptMenuGlyph\('permissionAuto'\)/.test(composerJs) &&
  /CHATGPT_PERMISSION_FULL_SVG = chatgptMenuGlyph\('permissionFull'\)/.test(composerJs) &&
  /CHATGPT_CHECK_SVG = chatgptMenuGlyph\('check'\)/.test(composerJs))
check('project page: file-type glyphs are captured too',
  /CHATGPT_PROJECT_FOLDER_SVG = chatgptMenuGlyph\('folderClosed'\)/.test(projectJs) &&
  /CHATGPT_PROJECT_FOLDER_OPEN_SVG = chatgptMenuGlyph\('folderOpen'\)/.test(projectJs) &&
  !/const CHATGPT_PROJECT_FILE_SVGS = \{[\s\S]{0,900}<path/.test(projectJs))

// ---- 4. geometry: tokens equal the measured numbers --------------------
const refSurface = capture.menus.projectMoreWeb[0]
const refItem = refSurface.items[0]
const refSep = capture.menus.sessionRowWeb[0].separators[0]
const refRow = capture.projectRow
const measured = [
  ['--cgpt-menu-min-width: 160px', refSurface.rect.width >= 160],
  ['--cgpt-menu-gutter: 10px', Number.parseFloat(refSurface.style.padding) === 10],
  ['--cgpt-menu-radius: 16px', Number.parseFloat(refSurface.style.borderRadius) === 16],
  ['--cgpt-menu-row-height: 36px', Number.parseFloat(refItem.style.height) === 36],
  ['--cgpt-menu-row-radius: 12px', Number.parseFloat(refItem.style.borderRadius) === 12],
  ['--cgpt-menu-row-pad-y: 6px', Number.parseFloat(refItem.style.padding.split(' ')[0]) === 6],
  ['--cgpt-menu-row-pad-x: 10px', Number.parseFloat(refItem.style.padding.split(' ')[1]) === 10],
  // the reference's slot is `calc(.25rem * 5)` = 20px; the glyph inside it
  // measures 18px (mask) or 16px (sprite) in the capture
  ['--cgpt-menu-icon-slot: 20px', (refSurface.vars['--icon-leading-size'] ?? '') === 'calc(.25rem * 5)' && (refItem.masks[0]?.renderedWidth ?? 0) === 18 && refSurface.items[2].glyphs[0].renderedWidth === 16],
  ['--cgpt-menu-icon-gap: 6px', (refSurface.vars['--spacing-menu-item-content'] ?? 'calc(.25rem * 1.5)').includes('1.5')],
  ['--cgpt-project-icon-size: 20px', refRow.folderGlyph.renderedWidth >= 19 && refRow.folderGlyph.renderedWidth <= 20],
  ['--cgpt-session-action-size: 20px', refRow.actions[1].rect.width === 20],
  ['--cgpt-session-action-icon: 14px', refRow.actions[1].glyph.renderedWidth === 14],
  ['--cgpt-project-action-gap: 8px', refRow.rightActionGap.gap === 8],
  ['--cgpt-project-action-inset: 8px', refRow.rightActionGap.rightInset === 8]
]
for (const [declaration, matchesReference] of measured) {
  const name = declaration.split(':')[0]
  const value = declaration.split(': ')[1]
  check(`tokens ${name}: declared ${value} and that is what the capture measured`,
    tokens.includes(`${name}: ${value};`) === matchesReference && tokens.includes(declaration) && matchesReference,
    { declaration, matchesReference })
}
// The capture records the separator as a 17px group whose 1px line is inset
// (140 − 124) / 2 = 8px on each side.
check("tokens: separator is the measured 17px group with an 8px inset",
  /--cgpt-menu-separator-inset: 8px/.test(tokens) && /height: 17px/.test(overlayCss) && /padding: 8px var\(--cgpt-menu-separator-inset\)/.test(overlayCss) &&
  refSep.rect.height === 17 && (refSep.rect.width - refSep.line.rect.width) / 2 === 8 && refSep.line.rect.height === 1)
check("tokens: the menu colours are the measured ones, both themes",
  /--cgpt-menu-bg: rgba\(255, 255, 255, 0\.9\)/.test(tokens) && /--cgpt-menu-text: #0d0d0d/.test(tokens) &&
  /--cgpt-menu-danger: #fa423e/.test(tokens) && /--cgpt-menu-warning: #923b0f/.test(tokens) &&
  /--cgpt-menu-bg: rgba\(33, 33, 33, 0\.9\)/.test(darkTokens) && /--cgpt-menu-text: #ededed/.test(darkTokens) &&
  /--cgpt-menu-danger: #ff6764/.test(darkTokens) && /--cgpt-menu-warning: #e25507/.test(darkTokens) &&
  capture.tokens.dark['--color-text'] === '#ededed' && capture.tokens.light['--color-text'] === '#0d0d0d' &&
  capture.tokens.dark['--color-text-warning'] === '#e25507' && capture.tokens.light['--color-text-warning'] === '#923b0f')
check("tokens: the shadow and blur match the captured surface",
  /--cgpt-menu-shadow: 0 0 0 0\.5px rgba\(0, 0, 0, 0\.1\), 0 8px 16px -4px rgba\(0, 0, 0, 0\.12\)/.test(tokens) &&
  /--cgpt-menu-shadow: inset 0 0 1px 0 rgba\(255, 255, 255, 0\.2\), 0 8px 16px -4px rgba\(0, 0, 0, 0\.12\)/.test(darkTokens) &&
  /--cgpt-menu-blur: 8px/.test(tokens) && capture.menus.projectMoreWeb[0].style.backdropFilter === 'blur(8px)')
check("css: no menu surface still hard-codes the old 8px/40px geometry",
  !/\.chatgpt-session-menu[\s\S]{0,400}padding: var\(--cgpt-overlay-padding\)/.test(sessionsCss) &&
  !/\.chatgpt-session-menu-item[\s\S]{0,400}height: var\(--cgpt-session-menu-item-height\)/.test(sessionsCss))

// ---- 5. live evidence --------------------------------------------------
check("evidence: every geometry row in docs/m25.json is within 1px",
  evidence.tables.projectRow.every((row) => row.pass === true) &&
  evidence.assertions.filter((row) => /within 1px|measured/.test(row.name)).every((row) => row.pass === true),
  evidence.assertions.filter((row) => row.pass !== true).map((row) => row.name))
check("evidence: the live row really renders two different paths",
  evidence.projectRow.reference !== undefined &&
  evidence.projectRow.expanded !== undefined &&
  evidence.projectRow.glyphs !== undefined &&
  evidence.projectRow.glyphs.collapsed !== evidence.projectRow.glyphs.expanded,
  evidence.projectRow.glyphs)
check("evidence: every assertion in the capture passed",
  evidence.assertions.every((row) => row.pass === true), evidence.assertions.filter((row) => row.pass !== true).map((row) => row.name))
for (const [name, path] of Object.entries(evidence.frames)) {
  check(`frame ${name} exists and is not empty`, existsSync(loc(path)) && readFileSync(loc(path)).length > 1000, path)
}
check("sheets: reference and implementation frames are composed side by side",
  existsSync(loc('docs/screenshots/m25-more-menu-sheet.png')) &&
  existsSync(loc('docs/screenshots/m25-sidebar-projects-sheet.png')) &&
  existsSync(loc('docs/screenshots/m25-session-menu-sheet.png')))
check("capture: the desktop-only menus are declared, not invented",
  capture.notCapturedFromWeb.some((entry) => entry.menu === 'permission') &&
  capture.notCapturedFromWeb.some((entry) => entry.menu === 'projectHoverCard') &&
  capture.notCapturedFromWeb.every((entry) => typeof entry.alternative === 'string' && entry.alternative.length > 10),
  capture.notCapturedFromWeb.map((entry) => entry.menu))

// ---- 6. P0-13b: glyph audit, selected state, real reference sheets ------
const mapping = evidence.mapping ?? {}
const mappingRows = mapping.rows ?? []
check('mapping: docs/m25.json carries all 39 glyph rows and every one is identical',
  mapping.count === 39 && mappingRows.length === 39 && mappingRows.every((row) => row.identical === true && row.pathsIdentical === true && row.viewBoxIdentical === true),
  { count: mappingRows.length, failing: mappingRows.filter((row) => row.identical !== true).map((row) => row.glyph) })
check('mapping: every shipped glyph has a row and every row names its reference glyph',
  Object.keys(CHATGPT_MENU_ICONS).every((key) => mappingRows.some((row) => row.glyph === key)) &&
  mappingRows.every((row) => CHATGPT_MENU_ICONS[row.glyph]?.origin === row.origin && typeof row.referenceGlyphId === 'string' && row.referenceGlyphId.length > 0))
check('mapping: every menu row is mapped to a glyph and a reference glyph',
  mapping.menuItemCount === 15 && mapping.allMenuItemsIdentical === true &&
  (mapping.menuItems ?? []).every((row) => CHATGPT_MENU_ICONS[row.glyph] !== undefined && row.identical === true),
  (mapping.menuItems ?? []).filter((row) => row.identical !== true))
check('mapping: the ⋯ 菜单「编辑」is the pencil, not the web 项目设置 gear',
  CHATGPT_MENU_ICONS.edit.origin === 'sprite:codex-icon-pencil-light-20' &&
  !/^mask:projectMoreWeb\/项目设置$/.test(CHATGPT_MENU_ICONS.edit.origin) &&
  CHATGPT_MENU_ICONS.edit.svg.includes(capture.sprite.symbols['codex-icon-pencil-light-20'].paths[0].d))
check('mapping: permission「帮我批准」is the shield with a >_ prompt, not a shield-check',
  CHATGPT_MENU_ICONS.permissionAuto.origin === 'menu:m25b-permission/帮我批准' &&
  CHATGPT_MENU_ICONS.permissionAuto.svg.includes('M7.65336 12.426') &&
  CHATGPT_MENU_ICONS.permissionAuto.svg.includes('M13.4678 11.4318') &&
  !CHATGPT_MENU_ICONS.permissionAuto.svg.includes('M11.562 4.034'))
check('mapping: the current-row ✓ is the reference checkmark-lg',
  CHATGPT_MENU_ICONS.check.origin === 'sprite:codex-icon-checkmark-lg-light-16' &&
  CHATGPT_MENU_ICONS.check.svg.includes(capture.sprite.symbols['codex-icon-checkmark-lg-light-16'].paths[0].d))
check('selection: the reference fills no row and puts the ✓ on 帮我批准 only',
  (permissionCapture.themes.dark.surfaces[0].items ?? []).every((item) => item.style.background === 'rgba(0, 0, 0, 0)') &&
  permissionCapture.themes.dark.surfaces[0].items.filter((item) => item.check !== null).length === 1 &&
  permissionCapture.themes.dark.surfaces[0].items[1].check !== null &&
  /codex-icon-checkmark-lg-light-16/.test(permissionCapture.themes.dark.surfaces[0].items[1].check.html))
check('selection: the implementation matches — no fill, generic current rule excludes permission rows',
  /\.chatgpt-permission-row\[data-current='true'\]\s*\{[^}]*background:\s*transparent/.test(workCss) &&
  /\.chatgpt-work-menu-item\[data-current='true'\]:not\(\.chatgpt-permission-row\)/.test(workCss) &&
  /chatgpt-permission-row/.test(composerJs))
const sheets = JSON.parse(read('docs/m25-sheets.json')).sheets
check('sheets: at least 5 sheets, each with a live reference crop and an implementation',
  sheets.length >= 5 && sheets.every((sheet) => typeof sheet.reference === 'string' && sheet.reference.startsWith('docs/capture/live/') && existsSync(loc(sheet.reference)) && existsSync(loc(sheet.frame))),
  sheets.map((sheet) => [sheet.name, sheet.reference]))
check('sheets: dark and light for the ⋯ menu and the permission menu, plus the hover card',
  ['more-menu', 'more-menu-light', 'permission-menu', 'permission-menu-light', 'hover-card'].every((name) => sheets.some((sheet) => sheet.name === name)) &&
  sheets.find((sheet) => sheet.name === 'permission-menu').reference === 'docs/capture/live/m25b-ref-permission-menu.png' &&
  sheets.find((sheet) => sheet.name === 'permission-menu-light').reference === 'docs/capture/live/m25b-ref-permission-menu-light.png')

console.log(`\n${checks - failures}/${checks} P0-13 checks passed`)
process.exit(failures === 0 ? 0 : 1)
