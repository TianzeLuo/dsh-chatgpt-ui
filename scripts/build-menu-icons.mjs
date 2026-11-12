#!/usr/bin/env node
/**
 * scripts/build-menu-icons.mjs — generate `lib/client/menu-icons.js` from the
 * read-only capture in `docs/capture/live/project-menus.json`.
 *
 * Nothing here is drawn: every glyph body is copied verbatim from one of the
 * three sources the reference itself uses —
 *   mask   — the `mask-image: url("data:image/svg+xml;utf8,<svg …>")` the web
 *            menus render for their leading icons (decoded at capture time);
 *   sprite — the `<symbol>` bodies of `/cdn/assets/icons-*.svg`, the sprite the
 *            page loads;
 *   inline — an inline `<svg>` read straight off a live node;
 *   menuIcon — an inline `<svg>` inside a captured menu row (the permission
 *            picker renders its three leading glyphs inline at a 20 viewBox,
 *            not through the sprite, so that is what we copy).
 *
 * The viewBox and the path data are kept exactly as captured; only the outer
 * `width`/`height` are set to the size the reference renders the glyph at
 * (measured in the same capture), and `fill="currentColor"` is preserved so the
 * glyph follows the row colour like it does in the product.
 *
 *   node scripts/build-menu-icons.mjs
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const CAPTURE = join(ROOT, 'docs/capture/live/project-menus.json')
const PERMISSION = join(ROOT, 'docs/capture/live/m25b-permission.json')
const OUT = join(ROOT, 'lib/client/menu-icons.js')

const capture = JSON.parse(readFileSync(CAPTURE, 'utf8'))
const permission = JSON.parse(readFileSync(PERMISSION, 'utf8'))

/** Find the decoded mask SVG a menu item used, by menu + label. */
function maskOf(menuKey, label) {
  for (const surface of capture.menus[menuKey] ?? []) {
    for (const item of surface.items ?? []) {
      if (item.text !== label) continue
      const mask = (item.masks ?? [])[0]
      if (mask === undefined) continue
      return { svg: mask.svg.replace(/^data:image\/svg\+xml;utf8,/, ''), size: mask.renderedWidth }
    }
  }
  throw new Error(`build-menu-icons: no mask captured for ${menuKey}/${label}`)
}

/** The `<symbol>` body of a sprite id, verbatim. */
function spriteOf(id) {
  const symbol = capture.sprite?.symbols?.[id]
  if (symbol === null || symbol === undefined) throw new Error(`build-menu-icons: sprite symbol ${id} was not captured`)
  return symbol
}

/** An inline `<svg>` read off a live node (matched by its host aria-label). */
function inlineOf(ariaPrefix) {
  const action = (capture.projectRow?.actions ?? []).find((entry) => (entry.aria ?? '').startsWith(ariaPrefix))
  const outer = action?.glyph?.outerHTML
  if (typeof outer !== 'string' || outer === '') throw new Error(`build-menu-icons: no inline svg captured for ${ariaPrefix}`)
  return { outer, size: action.glyph.renderedWidth }
}

/** The leading `<svg>` of one row of the captured permission picker. */
function menuIconOf(row) {
  const surface = permission.themes?.dark?.surfaces?.[0]
  const item = surface?.items?.[row]
  const outer = item?.icon?.html
  if (typeof outer !== 'string' || outer === '') throw new Error(`build-menu-icons: no permission menu icon at row ${row}`)
  const viewBox = (outer.match(/viewBox="([^"]+)"/) ?? [])[1]
  const body = outer.replace(/^<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '')
  return { viewBox, size: item.icon.rect.width, body, origin: `menu:m25b-permission/${item.text.split(' ')[0]}` }
}

/**
 * The icon table. `size` is the rendered size measured in the capture:
 * menu glyphs come out at 18px (mask) or 16px (sprite), the project row's
 * folder at 20px, the row's hover actions at 14px.
 */
const SPEC = [
  // — project rows —
  { key: 'folderClosed', note: 'collapsed project row / closed folder', from: { kind: 'sprite', id: 'codex-icon-folder-light-16' }, size: 20 },
  { key: 'folderOpen', note: 'expanded project row / open folder', from: { kind: 'sprite', id: 'codex-icon-folder-open-light-16' }, size: 20 },
  { key: 'chevronCollapse', note: 'row hover: collapse control', from: { kind: 'sprite', id: 'codex-icon-chevron-right-md-light-16' }, size: 20 },
  { key: 'more', note: 'row hover: ⋯ trigger', from: { kind: 'sprite', id: 'codex-icon-ellipsis-horizontal-light-16' }, size: 14 },
  { key: 'newChat', note: 'row hover: 新建会话 (pen-in-square, inline on the reference)', from: { kind: 'inline', aria: '在 ' }, size: 14 },
  // — project ⋯ menu (desktop: 置顶/取消置顶 · 编辑 · 在资源管理器中打开 · 归档聊天 · 移除项目;
  //   P0-19c removed the unsupported 分区 row) —
  { key: 'pin', note: '置顶', from: { kind: 'mask', menu: 'projectMoreWeb', label: '置顶项目' }, size: 18 },
  // P0-13b: the desktop ⋯ menu's「编辑」is a pencil. The web row menu calls
  // the same slot「项目设置」and draws a gear; the desktop reference wins here,
  // and the glyph is the sprite's own 20-viewBox pencil, rendered at 18px so it
  // stays optically matched with the mask glyphs beside it.
  { key: 'edit', note: '编辑 (desktop reference: pencil, not the web 项目设置 gear)', from: { kind: 'sprite', id: 'codex-icon-pencil-light-20' }, size: 18 },
  { key: 'reveal', note: '在资源管理器中打开 (desktop-only row)', from: { kind: 'sprite', id: 'codex-icon-folder-open-light-16' }, size: 16 },
  { key: 'archive', note: '归档聊天 / 归档', from: { kind: 'mask', menu: 'sessionRowWeb', label: '归档' }, size: 18 },
  { key: 'remove', note: '移除项目 (desktop uses a cross, not a bin)', from: { kind: 'sprite', id: 'codex-icon-xmark-md-light-16' }, size: 16 },
  // — project hover card —
  { key: 'chatCount', note: 'N 次聊天', from: { kind: 'sprite', id: 'codex-icon-chat-bubble-light-16' }, size: 16 },
  { key: 'repoPath', note: 'card path row: repository', from: { kind: 'sprite', id: 'codex-icon-folder-badge-branch-light-16' }, size: 16 },
  { key: 'folderPath', note: 'card path row: local folder', from: { kind: 'sprite', id: 'codex-icon-folder-light-16' }, size: 16 },
  { key: 'pinMark', note: 'card top-right pin', from: { kind: 'mask', menu: 'projectMoreWeb', label: '置顶项目' }, size: 18 },
  // — session rows and menus —
  { key: 'rename', note: '重命名', from: { kind: 'mask', menu: 'sessionRowWeb', label: '重命名' }, size: 18 },
  // P0-19c: the three pin states are the sprite's own trio, copied verbatim —
  // hollow (`pin`), hollow with a slash (`pin-slash`, the 取消置顶 reference
  // glyph in the attachment) and the solid-centre variant (`pin-fill`). The
  // project menu toggles hollow ⇄ slash, the session menu hollow ⇄ solid.
  { key: 'pinOutline', note: '置顶 (未置顶: hollow pin)', from: { kind: 'sprite', id: 'codex-icon-pin-light-16' }, size: 16 },
  { key: 'pinSolid', note: '取消置顶 (会话已置顶: solid-centre pin)', from: { kind: 'sprite', id: 'codex-icon-pin-fill-light-16' }, size: 16 },
  { key: 'unpin', note: '取消置顶 (项目已置顶: pin + slash)', from: { kind: 'sprite', id: 'codex-icon-pin-slash-light-16' }, size: 16 },
  { key: 'trash', note: '删除 (session menu)', from: { kind: 'mask', menu: 'sessionRowWeb', label: '删除' }, size: 18 },
  { key: 'open', note: '打开 / 进入', from: { kind: 'sprite', id: 'codex-icon-chevron-right-md-light-16' }, size: 16 },
  { key: 'back', note: '返回', from: { kind: 'sprite', id: 'codex-icon-chevron-left-md-light-16' }, size: 16 },
  { key: 'star', note: '收藏', from: { kind: 'sprite', id: 'codex-icon-star-fill-light-16' }, size: 16 },
  // P0-13b: both the permission picker and the model picker mark the current
  // row with `codex-icon-checkmark-lg-light-16`, not the smaller `-md` mark.
  { key: 'check', note: 'current selection (both pickers use the -lg mark)', from: { kind: 'sprite', id: 'codex-icon-checkmark-lg-light-16' }, size: 16 },
  { key: 'submenu', note: 'submenu chevron', from: { kind: 'sprite', id: 'codex-icon-chevron-right-md-light-16' }, size: 16 },
  { key: 'plus', note: '新建', from: { kind: 'sprite', id: 'codex-icon-plus-md-light-16' }, size: 16 },
  // — permission menu (captured live in docs/capture/live/m25b-permission.json:
  //   the picker renders inline 20-viewBox glyphs at 18px inside a 20px slot) —
  { key: 'permissionAsk', note: '请求批准 (open hand)', from: { kind: 'menuIcon', row: 0 }, size: 18 },
  // P0-13b: the reference draws a shield with `>_` inside it (a command
  // prompt), not the shield-check the P0-13 capture assumed.
  { key: 'permissionAuto', note: '帮我批准 (shield with >_ prompt)', from: { kind: 'menuIcon', row: 1 }, size: 18 },
  { key: 'permissionFull', note: '完全访问权限 (shield with !)', from: { kind: 'menuIcon', row: 2 }, size: 18 },
  { key: 'shield', note: 'permission chip', from: { kind: 'sprite', id: 'codex-icon-shield-light-16' }, size: 16 },
  // — file-type glyphs the project surfaces list —
  { key: 'file', note: '普通文件', from: { kind: 'sprite', id: 'codex-icon-document-light-16' }, size: 16 },
  { key: 'fileText', note: '文本文件', from: { kind: 'sprite', id: 'codex-icon-page-text-light-16' }, size: 16 },
  { key: 'filePdf', note: 'PDF', from: { kind: 'sprite', id: 'codex-icon-document-pdf-light-16' }, size: 16 },
  { key: 'fileImage', note: '图片', from: { kind: 'sprite', id: 'codex-icon-photo-light-16' }, size: 16 },
  { key: 'fileCode', note: '代码', from: { kind: 'sprite', id: 'codex-icon-code-light-16' }, size: 16 },
  { key: 'fileTable', note: '表格', from: { kind: 'sprite', id: 'codex-icon-spreadsheet-light-16' }, size: 16 },
  { key: 'fileArchive', note: '归档文件', from: { kind: 'sprite', id: 'codex-icon-archive-light-16' }, size: 16 },
  { key: 'search', note: '搜索', from: { kind: 'sprite', id: 'codex-icon-magnifying-glass-lg-light-16' }, size: 16 },
  { key: 'close', note: '关闭', from: { kind: 'sprite', id: 'codex-icon-xmark-md-light-16' }, size: 16 },
  { key: 'lock', note: '锁定', from: { kind: 'sprite', id: 'codex-icon-lock-light-16' }, size: 16 }
]

/** Render one captured source into a standalone `<svg>` string. */
function render(entry) {
  const source = entry.from
  if (source.kind === 'mask') {
    const mask = maskOf(source.menu, source.label)
    const svg = mask.svg
    const viewBox = (svg.match(/viewBox="([^"]+)"/) ?? [])[1]
    const body = svg.replace(/^<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '')
    return { viewBox, size: entry.size, body, origin: `mask:${source.menu}/${source.label}` }
  }
  if (source.kind === 'sprite') {
    const symbol = spriteOf(source.id)
    return { viewBox: symbol.viewBox, size: entry.size, body: symbol.inner, origin: `sprite:${source.id}` }
  }
  if (source.kind === 'menuIcon') {
    const glyph = menuIconOf(source.row)
    return { viewBox: glyph.viewBox, size: entry.size, body: glyph.body, origin: glyph.origin }
  }
  const inline = inlineOf(source.aria)
  const svg = inline.outer
  const viewBox = (svg.match(/viewBox="([^"]+)"/) ?? [])[1]
  const body = svg.replace(/^<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '')
  return { viewBox, size: entry.size, body, origin: `inline:${source.aria}…` }
}

const built = SPEC.map((entry) => ({ ...entry, ...render(entry) }))

const lines = [
  '/**',
  ' * dsh-chatgpt-ui — menu and project-row glyphs (GENERATED by',
  ' * scripts/build-menu-icons.mjs — DO NOT EDIT BY HAND).',
  ' *',
  ' * Source: docs/capture/live/project-menus.json, a read-only CDP capture of',
  ' * the live ChatGPT web app. viewBox and path data are copied verbatim from',
  ' * the reference (its mask-image data URLs, its icon sprite, and inline nodes',
  ' * read off the live DOM); only width/height are set, to the size the',
  ' * reference renders each glyph at. A hand-drawn glyph drifts, which is',
  ' * exactly the failure this file exists to prevent.',
  ' *',
  ' * This file is a fragment: no import/export statements — scripts/build-client.mjs',
  ' * concatenates it inside the module-loader factory.',
  ' */',
  '',
  '/** @type {Record<string, { viewBox: string, size: number, origin: string, note: string, svg: string }>} */',
  'const CHATGPT_MENU_ICONS = {'
]
for (const entry of built) {
  const svg = `<svg viewBox="${entry.viewBox}" width="${entry.size}" height="${entry.size}" aria-hidden="true" fill="currentColor" xmlns="http://www.w3.org/2000/svg">${entry.body}</svg>`
  lines.push(
    `  ${entry.key}: {`,
    `    viewBox: ${JSON.stringify(entry.viewBox)},`,
    `    size: ${entry.size},`,
    `    origin: ${JSON.stringify(entry.origin)},`,
    `    note: ${JSON.stringify(entry.note)},`,
    `    svg: ${JSON.stringify(svg)}`,
    '  },'
  )
}
lines.push('}', '')
lines.push(
  '/**',
  ' * Markup for one captured glyph.',
  ' * @param {string} name - glyph key (see the table above).',
  ' * @returns {string} inline SVG markup, or an empty string for an unknown glyph.',
  ' */',
  'function chatgptMenuGlyph(name) {',
  '  const glyph = CHATGPT_MENU_ICONS[name]',
  '  if (glyph === undefined) return \'\'',
  '  return glyph.svg',
  '}'
)
lines.push('')

mkdirSync(dirname(OUT), { recursive: true })
writeFileSync(OUT, lines.join('\n'))
console.log(`build-menu-icons: ${built.length} glyphs → lib/client/menu-icons.js`)
for (const entry of built) console.log(`  ${entry.key.padEnd(18)} ${String(entry.size).padStart(2)}px  ${entry.origin}`)
