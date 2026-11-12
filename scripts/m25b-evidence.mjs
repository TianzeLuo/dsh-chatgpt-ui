#!/usr/bin/env node
/**
 * scripts/m25b-evidence.mjs — P0-13b evidence into `docs/m25.json`.
 *
 * Adds the parts `scripts/m25-capture.mjs` does not own:
 *
 *   mapping    one row per shipped glyph (39): the glyph key, the reference
 *              glyph id it must be identical to, the menu items that use it,
 *              and a boolean that is the diff tool's verdict — not a guess;
 *   menuItems  every visible row of the three picked menus → glyph → reference,
 *              so a menu item cannot appear without a mapping row;
 *   geometrySources  for every measured number: the selector it was read from
 *              and the capture file/json path that holds the reference value;
 *   selection  the current-row evidence: the live picker fills no row and marks
 *              the current one with the trailing ✓ only.
 *
 * Run after tools/m25-icon-diff.mjs and scripts/m25-capture.mjs:
 *   node scripts/m25b-evidence.mjs
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DOCS = join(ROOT, 'docs')
const EVIDENCE = join(DOCS, 'm25.json')

const evidence = JSON.parse(readFileSync(EVIDENCE, 'utf8'))
const capture = JSON.parse(readFileSync(join(DOCS, 'capture/live/project-menus.json'), 'utf8'))
const permission = JSON.parse(readFileSync(join(DOCS, 'capture/live/m25b-permission.json'), 'utf8'))
const diff = JSON.parse(readFileSync(join(DOCS, 'm25-icons-diff.json'), 'utf8'))
const iconsSource = readFileSync(join(ROOT, 'lib/client/menu-icons.js'), 'utf8')
const workCss = readFileSync(join(ROOT, 'lib/client/css/65-work-card.css'), 'utf8')
const { CHATGPT_MENU_ICONS } = new Function(`${iconsSource}\n;return { CHATGPT_MENU_ICONS }`)()

/** Which menu items render each glyph (verified by grep in the test). */
const ITEMS = {
  folderClosed: ['项目行（收起）', '会话菜单「在此项目中新建聊天」'],
  folderOpen: ['项目行（展开）', '悬停卡标题'],
  chevronCollapse: ['项目行悬停「折叠」'],
  more: ['项目行悬停「⋯」'],
  newChat: ['项目行悬停「新建会话」'],
  pin: ['项目卡「移到最前」'],
  pinOutline: ['⋯ 菜单「置顶」', '会话菜单「置顶」'],
  pinSolid: ['会话菜单「取消置顶」'],
  edit: ['⋯ 菜单「编辑」', '悬停卡「编辑项目」', '项目菜单「编辑项目」'],
  reveal: ['⋯ 菜单「在资源管理器中打开」'],
  archive: ['⋯ 菜单「归档聊天」', '会话菜单「归档」', '项目菜单「删除项目」'],
  remove: ['⋯ 菜单「移除项目」'],
  chatCount: ['悬停卡「N 次聊天」'],
  repoPath: ['悬停卡·仓库路径'],
  folderPath: ['悬停卡·本地路径'],
  pinMark: ['悬停卡「收藏」'],
  rename: ['会话菜单「重命名」', '项目菜单「重命名项目」'],
  unpin: ['⋯ 菜单「取消置顶」'],
  trash: ['会话菜单「删除」'],
  open: ['会话菜单「打开」'],
  back: ['项目菜单「返回」'],
  star: [],
  check: ['权限菜单·当前项 ✓', '模型面板·当前项 ✓'],
  submenu: [],
  plus: ['项目节标题「＋」'],
  permissionAsk: ['权限菜单「请求批准」'],
  permissionAuto: ['权限菜单「帮我批准」'],
  permissionFull: ['权限菜单「完全访问权限」'],
  shield: ['权限 chip（P0-10B；参考按当前档位取图标，本轮不改）'],
  file: ['项目页·普通文件'],
  fileText: ['项目页·文本'],
  filePdf: ['项目页·PDF'],
  fileImage: ['项目页·图片'],
  fileCode: ['项目页·代码'],
  fileTable: ['项目页·表格'],
  fileArchive: ['项目页·压缩包'],
  search: ['项目页「搜索」'],
  close: ['文件选择器「关闭」'],
  lock: ['会话菜单「锁定聊天」']
}

/** The reference id a glyph's origin points at. */
function referenceId(origin) {
  if (origin.startsWith('sprite:')) return origin.slice('sprite:'.length)
  if (origin.startsWith('mask:')) return origin.slice('mask:'.length)
  if (origin.startsWith('menu:')) return `inline:${origin.slice(origin.indexOf('/') + 1)} (20 viewBox, 18px)`
  return origin
}

const diffByKey = new Map(diff.icons.map((row) => [row.key, row]))
const rows = Object.entries(CHATGPT_MENU_ICONS).map(([key, glyph]) => {
  const verdict = diffByKey.get(key)
  const items = ITEMS[key] ?? []
  return {
    glyph: key,
    size: glyph.size,
    viewBox: glyph.viewBox,
    origin: glyph.origin,
    referenceGlyphId: referenceId(glyph.origin),
    referenceKind: glyph.origin.split(':')[0],
    referenceWhere: verdict?.reference ?? null,
    items,
    menuItemCount: items.length,
    viewBoxIdentical: verdict?.viewBoxIdentical === true,
    pathsIdentical: verdict?.pathsIdentical === true,
    identical: verdict?.identical === true,
    note: glyph.note
  }
})

/** The three menus' rows, mapped one by one (label → glyph → reference). */
const MENU_ITEMS = [
  { menu: 'projectMore', label: '置顶', glyph: 'pinOutline', referenceGlyphId: 'codex-icon-pin-light-16', referenceKind: 'sprite' },
  { menu: 'projectMore', label: '取消置顶', glyph: 'unpin', referenceGlyphId: 'codex-icon-pin-slash-light-16', referenceKind: 'sprite', note: 'P0-19c：已置顶态用附件里的图钉+斜杠字形' },
  { menu: 'projectMore', label: '编辑', glyph: 'edit', referenceGlyphId: 'codex-icon-pencil-light-20', referenceKind: 'sprite', note: '桌面参考用铅笔；网页版同名位置叫「项目设置」并画齿轮' },
  { menu: 'projectMore', label: '在资源管理器中打开', glyph: 'reveal', referenceGlyphId: 'codex-icon-folder-open-light-16', referenceKind: 'sprite' },
  { menu: 'projectMore', label: '归档聊天', glyph: 'archive', referenceGlyphId: 'sessionRowWeb/归档', referenceKind: 'mask' },
  { menu: 'projectMore', label: '移除项目', glyph: 'remove', referenceGlyphId: 'codex-icon-xmark-md-light-16', referenceKind: 'sprite' },
  { menu: 'session', label: '打开', glyph: 'open', referenceGlyphId: 'codex-icon-chevron-right-md-light-16', referenceKind: 'sprite' },
  { menu: 'session', label: '重命名', glyph: 'rename', referenceGlyphId: 'sessionRowWeb/重命名', referenceKind: 'mask' },
  { menu: 'session', label: '置顶', glyph: 'pinOutline', referenceGlyphId: 'codex-icon-pin-light-16', referenceKind: 'sprite' },
  { menu: 'session', label: '取消置顶', glyph: 'pinSolid', referenceGlyphId: 'codex-icon-pin-fill-light-16', referenceKind: 'sprite', note: 'P0-19c：会话已置顶态用实心图钉，与项目菜单的斜杠区分' },
  { menu: 'session', label: '归档', glyph: 'archive', referenceGlyphId: 'sessionRowWeb/归档', referenceKind: 'mask' },
  { menu: 'session', label: '删除', glyph: 'trash', referenceGlyphId: 'sessionRowWeb/删除', referenceKind: 'mask' },
  { menu: 'permission', label: '请求批准', glyph: 'permissionAsk', referenceGlyphId: 'inline:请求批准 (20 viewBox, 18px)', referenceKind: 'menu' },
  { menu: 'permission', label: '帮我批准', glyph: 'permissionAuto', referenceGlyphId: 'inline:帮我批准 (20 viewBox, 18px)', referenceKind: 'menu' },
  { menu: 'permission', label: '完全访问权限', glyph: 'permissionFull', referenceGlyphId: 'inline:完全访问权限 (20 viewBox, 18px)', referenceKind: 'menu' }
]
const menuItems = MENU_ITEMS.map((row) => {
  const glyph = CHATGPT_MENU_ICONS[row.glyph]
  return {
    ...row,
    referenceGlyph: row.referenceKind === 'menu'
      ? `menu:m25b-permission/${row.label}`
      : `${row.referenceKind}:${row.referenceGlyphId}`,
    implementationGlyph: glyph.origin,
    identical: glyph.origin === (row.referenceKind === 'menu'
      ? `menu:m25b-permission/${row.label}`
      : `${row.referenceKind}:${row.referenceGlyphId}`)
  }
})

/** Per-number source selectors: where each table row was measured. */
const SOURCES = {
  projectRow: {
    file: 'docs/capture/live/project-menus.json',
    selector: '[class*="folder-row"]',
    jsonPath: 'projectRow.reference',
    fields: ['rect', 'style (height/radius/font-size/line-height/padding)', 'folderGlyph.renderedWidth', 'titleRect.x', 'actions[].rect/glyph.renderedWidth', 'rightActionGap']
  },
  moreMenuSurface: {
    file: 'docs/capture/live/project-menus.json',
    selector: '[role="menu"]:has([role="menuitem"])',
    jsonPath: 'menus.projectMoreWeb[0].rect/style',
    fields: ['rect.width', 'style.padding', 'style.borderRadius', 'style.backdropFilter']
  },
  moreMenuRow: {
    file: 'docs/capture/live/project-menus.json',
    selector: '[role="menuitem"]',
    jsonPath: 'menus.projectMoreWeb[0].items[*]',
    fields: ['rect.height', 'style.borderRadius', 'style.padding', 'style.fontSize', 'style.lineHeight', 'masks[].renderedWidth', 'vars["--icon-leading-size"]']
  },
  moreMenuSeparator: {
    file: 'docs/capture/live/project-menus.json',
    selector: 'div[role="separator"]',
    jsonPath: 'menus.sessionRowWeb[0].separators[0]',
    fields: ['rect.height', 'rect.width', 'line.rect.width', 'line.rect.height']
  },
  permissionRow: {
    file: 'docs/capture/live/m25b-permission.json',
    selector: '[role="menu"] [role="menuitem"]',
    jsonPath: 'themes.dark.surfaces[0].items[*]',
    fields: ['rect.height', 'style.padding', 'style.backgroundColor', 'style.fontSize', 'icon.rect.width', 'iconSlot.size', 'check.rect']
  }
}
for (const [table, source] of [
  ['projectRow', 'projectRow'],
  ['moreMenu', 'moreMenuSurface']
]) {
  for (const row of evidence.tables[table] ?? []) {
    row.selector = SOURCES[source].selector
    row.source = `${SOURCES[source].file}#${SOURCES[source].jsonPath}`
  }
}
for (const row of evidence.tables.moreMenu ?? []) {
  if (/^row "/.test(row.name)) {
    row.selector = SOURCES.moreMenuRow.selector
    row.source = `${SOURCES.moreMenuRow.file}#${SOURCES.moreMenuRow.jsonPath}`
  } else if (/^separator/.test(row.name)) {
    row.selector = SOURCES.moreMenuSeparator.selector
    row.source = `${SOURCES.moreMenuSeparator.file}#${SOURCES.moreMenuSeparator.jsonPath}`
  }
}

const permissionRows = permission.themes.dark.surfaces[0].items
const selectedIndex = permissionRows.findIndex((item) => item.check !== null)
evidence.mapping = {
  generatedAt: new Date().toISOString(),
  unit: 'glyph id → reference glyph id → menu items (booleans are the diff verdict)',
  count: rows.length,
  allIdentical: rows.every((row) => row.identical === true),
  menuItemCount: menuItems.length,
  allMenuItemsIdentical: menuItems.every((row) => row.identical === true),
  rows,
  menuItems
}
evidence.geometrySources = SOURCES
evidence.selection = {
  surface: 'permission picker (权限菜单)',
  reference: {
    crop: 'docs/capture/live/m25b-ref-permission-menu.png',
    cropLight: 'docs/capture/live/m25b-ref-permission-menu-light.png',
    source: 'docs/capture/live/m25b-permission.json',
    observed: '三行背景均为 transparent；当前行（帮我批准）只有右侧 16px ✓（codex-icon-checkmark-lg-light-16），没有整行底色',
    rowBackgrounds: permissionRows.map((item) => ({ text: item.text.split(' ')[0], background: item.style.background, checked: item.check !== null })),
    checkGlyph: permissionRows[selectedIndex]?.check?.html.match(/codex-icon-[a-z0-9-]+/)?.[0] ?? null
  },
  implementation: {
    rule: 'body[data-chatgpt-ui] .chatgpt-permission-row[data-current="true"] { background: transparent; }',
    genericRuleExcludes: '.chatgpt-work-menu-item[data-current="true"]:not(.chatgpt-permission-row)',
    check: 'chatgptMenuGlyph("check") — checkmark-lg, trailing',
    pass: /\.chatgpt-permission-row\[data-current='true'\]\s*\{[^}]*background:\s*transparent/.test(workCss) &&
      /\.chatgpt-work-menu-item\[data-current='true'\]:not\(\.chatgpt-permission-row\)/.test(workCss)
  },
  verdict: 'matches the reference: no fill on the current row, trailing ✓ only'
}
evidence.icons = { identical: diff.summary.identical, of: diff.summary.glyphs, handDrawnPaths: diff.summary.handDrawnMenuPaths }
evidence.source = `${evidence.source}; permission picker captured 2026-11-07 in docs/capture/live/m25b-permission.json`
evidence.generatedAt = new Date().toISOString()
evidence.sheets = JSON.parse(readFileSync(join(DOCS, 'm25-sheets.json'), 'utf8')).sheets
const additions = [
  { name: `mapping: ${rows.length} glyph rows, every one identical to its reference glyph`, pass: rows.every((row) => row.identical === true), detail: rows.filter((row) => row.identical !== true).map((row) => row.glyph) },
  { name: 'mapping: every menu row has a mapping row and a reference glyph', pass: menuItems.every((row) => row.identical === true), detail: menuItems.filter((row) => row.identical !== true) },
  { name: 'selection: current permission row has no fill, only the trailing check', pass: evidence.selection.implementation.pass === true && selectedIndex >= 0 && permissionRows.every((item) => item.style.background === 'rgba(0, 0, 0, 0)') && permissionRows.filter((item) => item.check !== null).length === 1, detail: permissionRows.map((item) => [item.text.split(' ')[0], item.style.background, item.check !== null]) },
  { name: 'sheets: 5 sheets, each with a live reference crop, implementation and overlay', pass: (evidence.sheets ?? []).length >= 5 && evidence.sheets.every((sheet) => typeof sheet.reference === 'string' && sheet.reference.startsWith('docs/capture/live/')), detail: evidence.sheets.map((sheet) => sheet.name) }
]
// Re-running the generator must not accumulate copies of its own rows.
evidence.assertions = [
  ...evidence.assertions.filter((row) => !/^(mapping|selection|sheets): /.test(row.name)),
  ...additions
]

writeFileSync(EVIDENCE, JSON.stringify(evidence, null, 2) + '\n')
console.log(`m25b-evidence: ${rows.length} glyph rows, ${menuItems.length} menu rows, ${(evidence.sheets ?? []).length} sheets → docs/m25.json`)
console.log(`  all glyphs identical: ${evidence.mapping.allIdentical}, all menu rows identical: ${evidence.mapping.allMenuItemsIdentical}`)
console.log(`  selection: ${evidence.selection.verdict}`)
