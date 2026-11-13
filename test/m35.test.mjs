#!/usr/bin/env node
/**
 * P0-19c — 项目 ⋯ 菜单两项置顶、删除分区行、会话/项目菜单同一规格。
 *
 * Source checks pin the contract the live evidence (docs/m35.json) proves:
 *   - the project pin row is two-way: 置顶 + hollow pin ⇄ 取消置顶 + pin-slash,
 *     persisted under dsh-chatgpt-ui:pinned-projects and sorted first;
 *   - the 分区 row is gone (no dead disabled entry, no extra separator);
 *   - both ⋯ menus resolve to one surface/row/icon/divider spec;
 *   - both anchor right of the trigger and on the row's top edge (P0-19e);
 *   - the session pin row uses the hollow ⇄ solid-centre pair instead.
 *
 * Run: node test/m35.test.mjs
 */

import { existsSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  CHATGPT_PINNED_PROJECTS_KEY,
  chatgptMenuPlacement,
  chatgptReadPinnedProjects,
  chatgptSortProjectsByPin,
  chatgptTogglePinnedProject
} from '../lib/shared/sessions-core.mjs'
import { loc, read, skipSuite } from './evidence.mjs'

skipSuite(import.meta.url)

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

const sessions = read('lib/client/sessions.js')
const core = read('lib/shared/sessions-core.mjs')
const icons = read('lib/client/menu-icons.js')
const menuCss = read('lib/client/css/25-sessions.css')
const overlayCss = read('lib/client/css/76-overlay.css')
const tokens = read('lib/client/css/05-cgpt-tokens.css')
const bundle = read('lib/client.js')
const doc = JSON.parse(read('docs/m35.json'))

let checks = 0
let failures = 0
const check = (name, condition, detail) => {
  checks += 1
  if (condition) return
  failures += 1
  console.log(`FAIL  ${name}${detail === undefined ? '' : ` — ${detail}`}`)
}

// ---- 1. pure helpers: persisted pin, two-way toggle, stable sort ---------
{
  const storageOf = (value) => ({ getItem: () => value })
  check('pin: the persistence key is dsh-chatgpt-ui:pinned-projects', CHATGPT_PINNED_PROJECTS_KEY === 'dsh-chatgpt-ui:pinned-projects')
  check('pin: an absent/malformed value reads as empty', chatgptReadPinnedProjects(undefined).length === 0 && chatgptReadPinnedProjects(storageOf('not json')).length === 0 && chatgptReadPinnedProjects(storageOf('{"a":1}')).length === 0)
  check('pin: duplicate and blank ids are dropped on read', chatgptReadPinnedProjects(storageOf('["a","a","",2,"b"]')).join(',') === 'a,b')
  check('pin: toggling appends an id without mutating the input', (() => {
    const input = ['a']
    const next = chatgptTogglePinnedProject(input, 'b')
    return next.join(',') === 'a,b' && input.join(',') === 'a'
  })())
  check('pin: toggling the same id again removes it (two-way, reversible)', (() => {
    const once = chatgptTogglePinnedProject([], 'b')
    const twice = chatgptTogglePinnedProject(once, 'b')
    return once.join(',') === 'b' && twice.length === 0
  })())
  check('pin: sort keeps pinned first and the Host order inside both groups', (() => {
    const projects = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }]
    const once = chatgptSortProjectsByPin(projects, ['c', 'a']).map((row) => row.id).join(',')
    const back = chatgptSortProjectsByPin(projects, []).map((row) => row.id).join(',')
    return once === 'a,c,b,d' && back === 'a,b,c,d' && projects.map((row) => row.id).join(',') === 'a,b,c,d'
  })())
  check('pin: unknown persisted ids cannot create rows', chatgptSortProjectsByPin([{ id: 'a' }], ['zzz']).map((row) => row.id).join(',') === 'a')
}

// ---- 2. one anchor rule for both menus -----------------------------------
{
  const trigger = { x: 300, y: 200, width: 24, height: 24 }
  const size = { width: 164.5, height: 180 }
  const viewport = { width: 1233, height: 850 }
  const right = chatgptMenuPlacement(trigger, size, viewport)
  check('anchor: 8px right of the trigger', right.left === 332 && right.flipped === false, JSON.stringify(right))
  // P0-19e: the panel's top edge sits on the row's top edge, not the ⋯ centre.
  check('anchor: top edge on the row top', right.top === 200 && right.align === 'top', JSON.stringify(right))
  const rowAligned = chatgptMenuPlacement(trigger, size, viewport, { x: 300, y: 196, width: 272, height: 36 })
  check('anchor: the owning row supplies the top edge', rowAligned.top === 196 && rowAligned.align === 'top', JSON.stringify(rowAligned))
  const tight = chatgptMenuPlacement(trigger, size, { width: 420, height: 850 })
  check('anchor: flips to the trigger left when the right side has no room', tight.flipped === true && tight.left === Math.round(300 - 164.5 - 8), JSON.stringify(tight))
  // P0-19e: no room below flips to bottom-edge alignment (row bottom), fully visible.
  const bottom = chatgptMenuPlacement({ x: 300, y: 820, width: 24, height: 24 }, size, viewport, { x: 300, y: 816, width: 272, height: 36 })
  check('anchor: flips to bottom-edge alignment when the panel would overflow', bottom.align === 'bottom' && bottom.top === 852 - 180 && bottom.top >= 8, JSON.stringify(bottom))
  const clamped = chatgptMenuPlacement({ x: 300, y: 20, width: 24, height: 24 }, { width: 164.5, height: 900 }, viewport, { x: 300, y: 16, width: 272, height: 36 })
  check('anchor: a panel taller than the viewport is clamped, never positioned off-screen', clamped.align === 'clamped' && clamped.top === 8, JSON.stringify(clamped))
  check('anchor: both menus call the shared helper', (sessions.match(/chatgptMenuPlacement\(/g) ?? []).length >= 2)
  check('anchor: the hover card keeps its top-aligned anchor', sessions.includes('left: Math.round(rect.right + 8)') && sessions.includes('top: Math.round(rect.top)'))
}

// ---- 3. pin glyphs come from the captured sprite, not a drawing -----------
{
  const glyph = (key) => {
    const start = icons.indexOf(`  ${key}: {`)
    return start < 0 ? null : icons.slice(start, icons.indexOf('\n  },', start))
  }
  const pinOutline = glyph('pinOutline')
  const pinSolid = glyph('pinSolid')
  const unpin = glyph('unpin')
  check('glyph: hollow pin is codex-icon-pin-light-16', pinOutline?.includes('sprite:codex-icon-pin-light-16') === true)
  check('glyph: solid pin is codex-icon-pin-fill-light-16', pinSolid?.includes('sprite:codex-icon-pin-fill-light-16') === true)
  check('glyph: pin-slash is codex-icon-pin-slash-light-16', unpin?.includes('sprite:codex-icon-pin-slash-light-16') === true)
  check('glyph: 分区 has no glyph left', !icons.includes('  section: {'))
  check('glyph: the three pin states are three distinct path sets', (() => {
    const paths = (block) => {
      const literal = (block.match(/svg: ("(?:[^"\\]|\\.)*")/) ?? [])[1]
      const svg = JSON.parse(literal)
      return [...svg.matchAll(/\sd="([^"]+)"/g)].map((match) => match[1]).join('|')
    }
    return new Set([paths(pinOutline), paths(pinSolid), paths(unpin)]).size === 3
  })())
  check('glyph: the menu rows take the captured glyphs from the generated map', ['pinOutline', 'pinSolid', 'unpin'].every((key) => sessions.includes(`${key}: chatgptMenuGlyph('${key}')`)))
}

// ---- 4. the project menu: two-way row, five rows, no 分区 -----------------
{
  check('project menu: 置顶 is a two-way label', sessions.includes("label: pinned === true ? '取消置顶' : '置顶'") || sessions.includes("pinned === true ? '取消置顶' : '置顶'"))
  check('project menu: unpinned uses the hollow pin, pinned uses the slash pin', /icon: pinned === true \? 'unpin' : 'pinOutline'/.test(sessions))
  check('project menu: the pin row exposes its state', sessions.includes("'data-cgpt-menu-pinned'"))
  check('project menu: the 分区 row and its icon are gone', !sessions.includes("action: 'section-project'") && !sessions.includes("label: '分区'") && !bundle.includes('section-project'))
  check('project menu: five rows in reference order with three dividers', (() => {
    const start = sessions.indexOf('function ChatgptProjectHoverMenu')
    const block = sessions.slice(start, sessions.indexOf('moveFocus', sessions.indexOf("action: 'remove-project'", start)))
    const order = ['编辑', '在资源管理器中打开', '归档聊天', '移除项目'].map((label) => block.indexOf(`label: '${label}'`))
    return block.includes("action: 'pin-project'") && order.every((index, position) => index > 0 && (position === 0 || index > order[position - 1])) && (block.match(/\{ separator: true \}/g) ?? []).length === 3
  })())
  check('project menu: pin toggles the persisted set instead of reordering the Host', sessions.includes('const toggleProjectPin =') && sessions.includes('chatgptTogglePinnedProject(current, id)') && !/workspaces\.insertBefore\(/.test(sessions))
  check('project menu: the list reads the set and sorts with it', sessions.includes('chatgptReadPinnedProjectIds()') && sessions.includes('chatgptSortProjectsByPin(baseSections.projects, pinnedProjects)'))
  check('project menu: pinned state is passed to the open menu', sessions.includes('pinned: pinnedProjectIds.has(projectMenuProject.id)'))
}

// ---- 5. the session menu: same spec, different pin pair -------------------
{
  check('session menu: open/rename/置顶/归档 with no 分区', (() => {
    const start = sessions.indexOf("action: 'open', label: '打开'")
    const block = sessions.slice(start, start + 800)
    return start > 0 && block.includes("label: '重命名'") && block.includes("action: 'pin'") && block.includes("label: '归档'") && !block.includes('分区')
  })())
  check('session menu: 置顶 ⇄ 取消置顶', sessions.includes("label: pinned ? '取消置顶' : '置顶'") || sessions.includes("pinned ? '取消置顶' : '置顶'"))
  check('session menu: hollow pin ⇄ solid-centre pin', /icon: pinned \? 'pinSolid' : 'pinOutline'/.test(sessions))
  check('session menu: still calls the Host pin API', sessions.includes('pinSession') && sessions.includes('unpinSession'))
}

// ---- 6. both menus, one surface/row/icon/divider spec ---------------------
{
  const shared = (css, tail) => {
    const start = css.indexOf("data-cgpt-session-menu='project-hover'")
    if (start < 0) return false
    const window = css.slice(Math.max(0, start - 400), start + 1200)
    return window.includes("data-cgpt-session-menu='session'") && window.includes(tail)
  }
  check('css: 25-sessions has one row rule for both menus using [role=menu]', shared(menuCss, "[role='menu'] .chatgpt-session-menu-item"))
  check('css: the row rule takes every desktop token', ['--cgpt-desktop-menu-row-height', '--cgpt-desktop-menu-icon-gap', '--cgpt-desktop-menu-icon-slot', '--cgpt-desktop-menu-font'].every((token) => menuCss.includes(token)))
  check('css: 25-sessions has one divider rule for both menus', shared(menuCss, '.chatgpt-session-menu-separator'))
  check('css: 76-overlay has one surface rule for both menus', shared(overlayCss, '--cgpt-desktop-menu-pad-y'))
  check('css: the surface rule carries the 164.5px floor and 16px corner', /min-width: var\(--cgpt-desktop-menu-min-width\)/.test(overlayCss) && /border-radius: var\(--cgpt-desktop-menu-radius\)/.test(overlayCss))
  check('css: the desktop tokens are the measured ones', ['--cgpt-desktop-menu-min-width:164.5px', '--cgpt-desktop-menu-pad-y:4.25px', '--cgpt-desktop-menu-pad-x:12px', '--cgpt-desktop-menu-row-height:28.5px', '--cgpt-desktop-menu-icon-slot:18px', '--cgpt-desktop-menu-icon-gap:4px', '--cgpt-desktop-menu-font:13px', '--cgpt-desktop-menu-radius:16px', '--cgpt-desktop-menu-separator-height:9.5px'].every((needle) => tokens.replace(/\s+/g, '').includes(needle.replace(/\s+/g, ''))))
}

// ---- 7. evidence: docs/m35.json is complete and disagrees nowhere ---------
{
  check('evidence: every live assertion passed', doc.assertions.length >= 10 && doc.assertions.every((row) => row.ok === true), doc.assertions.filter((row) => row.ok !== true).map((row) => row.id))
  check('evidence: no page errors during capture', doc.errors.length === 0, doc.errors)
  check('evidence: the project menu lists five labels and no 分区', doc.menus.project.labels.join(',') === '置顶,编辑,在资源管理器中打开,归档聊天,移除项目')
  check('evidence: project pin is hollow ⇄ slash with the attachment glyph', doc.menus.project.unpinned.icon === 'pinOutline' && doc.menus.project.pinned.icon === 'unpin' && doc.menus.project.pinned.label === '取消置顶' && doc.pins.attachment.includes('codex-icon-pin-slash-light-16'))
  check('evidence: session pin is hollow ⇄ solid-centre', doc.menus.session.pinned.icon === 'pinSolid' && doc.menus.session.pinned.label === '取消置顶' && doc.menus.session.unpinned.icon === 'pinOutline')
  check('evidence: the geometry table has zero non-zero deltas', doc.geometryDeltaNonZero === 0 && doc.geometryDeltaTotal >= 18, doc.geometryDeltaTotal)
  const same = (key) => doc.geometryComparison.surface[key].delta === 0
  check('evidence: width / padding / radius / background / shadow agree', ['width', 'padding', 'borderRadius', 'background', 'boxShadow', 'backdropFilter'].every(same))
  const rowSame = (key) => doc.geometryComparison.row[key].delta === 0
  check('evidence: row height / padding / gap / icon slot / icon size / font agree', ['height', 'width', 'padding', 'radius', 'fontSize', 'lineHeight', 'gap', 'iconSlot', 'iconSize'].every(rowSame))
  check('evidence: divider height and inset agree', doc.geometryComparison.separator.height.delta === 0 && doc.geometryComparison.separator.inset.delta === 0)
  check('evidence: measured numbers equal the desktop tokens', doc.geometryComparison.surface.width.project === '164.5px' && doc.geometryComparison.row.height.project === 28.5 && doc.geometryComparison.separator.height.project === 9.5 && doc.geometryComparison.row.iconSlot.project.join('x') === '18x18')
  check('evidence: pin persistence and ordering are recorded', doc.pins.persistenceKey === 'dsh-chatgpt-ui:pinned-projects' && doc.pins.order.afterPin[0] === 'Beta 项目' && doc.pins.order.afterReload[0] === 'Beta 项目' && doc.pins.order.afterUnpin.join(',') === doc.pins.order.before.join(','))
  check('evidence: 分区 removal is recorded', doc.sectionRemoval.absent === true && doc.sectionRemoval.projectMenuLabels.length === 5)
  check('evidence: both menus anchor 8px right and on the row top edge', doc.menus.project.anchor.project.gapX === 8 && doc.menus.project.anchor.project.topDelta <= 1 && doc.menus.project.anchor.session.gapX === 8 && doc.menus.project.anchor.session.topDelta <= 1)
  for (const path of doc.screenshots) {
    check(`evidence: ${path} exists`, existsSync(loc(path)) && statSync(loc(path)).size > 3000)
  }
}

console.log(`m35: ${checks - failures}/${checks} checks passed`)
process.exit(failures === 0 ? 0 : 1)
