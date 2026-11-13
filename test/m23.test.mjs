#!/usr/bin/env node
/**
 * P0-11 — rail selected states, one column, the two project menus, and the
 * unified overlay whose reference is the permission menu.
 *
 * Source checks pin the contract; docs/m23.json and its frames are the live
 * implementation evidence captured from the running skin.
 *
 * Run: node test/m23.test.mjs
 */

import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loc, read, exists, size, skipSuite } from './evidence.mjs'
skipSuite(import.meta.url)

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const railCss = read('lib/client/css/21-rail.css')
const chatCss = read('lib/client/css/30-chat.css')
const overlayCss = read('lib/client/css/76-overlay.css')
const tokens = read('lib/client/css/05-cgpt-tokens.css')
const darkTokens = read('lib/client/css/06-cgpt-tokens-dark.css')
const workCss = read('lib/client/css/65-work-card.css')
const railJs = read('lib/client/rail.js')
const sessionsJs = read('lib/client/sessions.js')
const composerJs = read('lib/client/composer.js')
const composerCore = read('lib/shared/composer-core.mjs')
const projectJs = read('lib/client/project.js')
const railIcons = read('lib/client/rail-icons.js')
const doc = JSON.parse(read('docs/m23.json'))

let checks = 0
let failures = 0
const check = (name, condition, detail) => {
  checks += 1
  if (condition) return
  failures += 1
  console.log(`FAIL  ${name}${detail === undefined ? '' : ` — ${detail}`}`)
}
const nonEmpty = (path) => exists(path) && size(path) > 0

// 1. Rail: two captured filled states + a single highlight rule.
check('rail: schedules/plugins selected glyphs are captured filled twins', /schedules:[\s\S]*?selected:[\s\S]*?M10\.001 1\.83496/.test(railIcons) && /plugins:[\s\S]*?selected:[\s\S]*?M10\.5218 1\.88086/.test(railIcons) && !railIcons.includes('CHATGPT_RAIL_SOLID_GLYPHS'))
check('rail: overview keeps 首页, detail switches to 项目', railJs.includes("projectKind === 'detail'") && railJs.includes("projectKind !== 'detail'") && railJs.includes("data-cgpt-project-kind"))
check('rail: project kind is published by the project page', projectJs.includes("document.body.setAttribute('data-cgpt-project-kind'") && projectJs.includes("projectId === '' ? 'overview' : 'detail'"))
check('rail: selected is a light pill with 8px padding and radius 10', /\.chatgpt-rail-button \{[\s\S]*?padding: var\(--cgpt-rail-button-padding, 8px\)/.test(railCss) && /\[data-cgpt-rail-state='selected'\][\s\S]*?background: var\(--cgpt-rail-active-bg\)/.test(railCss))
check('rail: hover changes only the background', /\.chatgpt-rail-button:hover \{[\s\S]*?background: var\(--cgpt-rail-hover-bg\);/.test(railCss) && !/\.chatgpt-rail-button:hover \{[^}]*color:/.test(railCss))
check('rail: no text-only width cap remains', /max-width: var\(--dsh-chat-content-width, var\(--cgpt-msg-max, 920px\)\);/.test(chatCss) && !/max-width: min\(var\(--dsh-chat-content-width/.test(chatCss))

// 2. The two menus coexist, with different anchors and one overlay surface.
check('menus: hover card and more menu are two distinct menus', sessionsJs.includes("'data-cgpt-session-menu': 'project-hover'") && sessionsJs.includes("kind: 'project',") && sessionsJs.includes('projectCard === null'))
check('menus: card anchors right of the row and top-aligned', sessionsJs.includes('left: Math.round(rect.right + 8)') && sessionsJs.includes('top: Math.round(rect.top)'))
// P0-19e: the ⋯ menu and the session menu share one anchor rule (right of the
// trigger, top edge on the row, bottom flip inside the viewport).
check('menus: the ⋯ menu anchors right of its trigger on the row top edge', (sessionsJs.match(/chatgptMenuPlacement\(/g) ?? []).length >= 2)
check('menus: row hover opens the card, ⋯ opens the six-entry menu', sessionsJs.includes('scheduleProjectCardOpen') && sessionsJs.includes('scheduleProjectCardClose') && sessionsJs.includes("action: 'pin-project'") && sessionsJs.includes("action: 'remove-project'"))
const moreStart = sessionsJs.lastIndexOf('const items = [', sessionsJs.indexOf('const moveFocus', sessionsJs.indexOf("action: 'pin-project'")))
const moreBlock = sessionsJs.slice(moreStart, sessionsJs.indexOf('const moveFocus', moreStart))
check('menus: five entries grouped 置顶/编辑 ─ 打开 ─ 归档 ─ 移除, no 分区', (moreBlock.match(/\{ separator: true \}/g) ?? []).length === 3 && moreBlock.indexOf("label: '编辑'") < moreBlock.indexOf('{ separator: true }') && moreBlock.indexOf("label: '在资源管理器中打开'") < moreBlock.lastIndexOf('{ separator: true }') && moreBlock.indexOf("label: '归档聊天'") < moreBlock.indexOf("label: '移除项目'") && !moreBlock.includes("label: '分区'"))
check('overlay: one shared surface file, not one set per menu', existsSync(loc('lib/client/css/76-overlay.css')) && /\.chatgpt-session-menu,[\s\S]*?\.chatgpt-work-menu,[\s\S]*?\.chatgpt-effort-menu,[\s\S]*?\.chatgpt-rail-menu/.test(overlayCss))
check('overlay: measured 16 radius / 10 gutter / 36 rows / 6x10 item padding / 8px separator inset', /--cgpt-menu-radius: 16px/.test(tokens) && /--cgpt-menu-gutter: 10px/.test(tokens) && /--cgpt-menu-row-height: 36px/.test(tokens) && /--cgpt-menu-row-pad-y: 6px/.test(tokens) && /--cgpt-menu-row-pad-x: 10px/.test(tokens) && /--cgpt-menu-separator-inset: 8px/.test(tokens) && /padding: 8px var\(--cgpt-menu-separator-inset\)/.test(overlayCss))
check('overlay: dark surface #2B2B2B', /--cgpt-overlay-bg: #2b2b2b/.test(read('lib/client/css/06-cgpt-tokens-dark.css')))

// 3. Permission menu: three described rows, orange last row.
check('permission: three labels match the Host choices', /['"]read-only['"]:\s*'请求批准'/.test(composerCore) && /['"]workspace-write['"]:\s*'帮我批准'/.test(composerCore) && /['"]danger-full-access['"]:\s*'完全访问权限'/.test(composerCore))
check('permission: descriptions are rendered under the titles', composerJs.includes("className: 'chatgpt-permission-description'") && composerJs.includes('仅对检测到的风险操作请求批准') && composerJs.includes('可不受限制地访问互联网和你电脑上的任何文件'))
// P0-14: the desktop picker (docs/reference/屏幕截图 2026-11-07 090156.png) paints
// that row #ff8549, so the row now reads its own token; the generic
// --cgpt-menu-warning stays as measured (m25 keeps asserting it).
check('permission: last row is orange as a whole', /\.chatgpt-permission-row\.is-full-access[\s\S]*?color: var\(--cgpt-desktop-menu-warning\)/.test(workCss) && /--cgpt-desktop-menu-warning: #923b0f/.test(tokens) && /--cgpt-desktop-menu-warning: #ff8549/.test(darkTokens) && /--cgpt-menu-warning: #923b0f/.test(tokens) && /--cgpt-menu-warning: #e25507/.test(darkTokens))

// 4. docs/m23.json: the live numbers.
check('evidence: 41/41 assertions pass', doc.summary.total === 42 && doc.summary.passed === 42 && doc.summary.failed === 0, doc.summary)
check('evidence: schedules/plugins selected static diff 0%', doc.rail.iconDiff.schedules === 0 && doc.rail.iconDiff.plugins === 0 && doc.rail.iconDiff.staticDiff === 0, doc.rail.iconDiff)
check('evidence: home stays selected on overview and super-agent', doc.rail.overview.states[0][1] === 'selected' && doc.rail.superAgent.states[0][1] === 'selected' && doc.rail.overview.states[4][1] === 'default')
check('evidence: dark project card is #2B2B2B / 16 / 12', doc.menus.darkCard?.card?.background === 'rgb(43, 43, 43)' && doc.menus.darkCard?.card?.radius === '16px' && doc.menus.darkCard?.card?.padding === '12px')
check('evidence: project selected on project detail', doc.rail.detail.states[4][1] === 'selected' && doc.rail.detail.states[0][1] === 'default')
check('evidence: max drag keeps card and column within 1px', doc.width.equality.before <= 1 && doc.width.equality.during <= 1 && doc.width.equality.after <= 1 && doc.width.textMax.capRemoved === true && doc.width.overflow <= 1, doc.width.equality)
check('evidence: card and more menu exist with different anchors', doc.menus.hover !== null && doc.menus.more !== null && (doc.menus.hover.card.rect.y !== doc.menus.more.menu.rect.y || doc.menus.hover.card.rect.x !== doc.menus.more.menu.rect.x), { hover: doc.menus.hover.card.rect, more: doc.menus.more.menu.rect })
check('evidence: card is 300 / 16 / 8 and more is 6 rows × 40 with 3 separators', doc.menus.hover.card.rect.w === 300 && doc.menus.hover.card.radius === '16px' && doc.menus.hover.card.padding === '12px' && doc.menus.more.menu.items.length === 6 && doc.menus.more.menu.separators.length === 3 && doc.menus.more.menu.items.every((item) => item.height === 40 && item.paddingLeft === '12px'))
check('evidence: permission has three described rows and orange last row', doc.permission.light.rows.length === 3 && doc.permission.light.rows.every((row) => row.description.length > 6 && row.titleSize === '15px' && row.titleWeight === '600' && row.descriptionSize === '13px' && row.icon.w === 20) && doc.permission.light.rows[2].color === 'rgb(240, 138, 93)')
check('evidence: permission surface is #FFFFFF light and #2B2B2B dark', doc.permission.light.background === 'rgb(255, 255, 255)' && doc.permission.dark.background === 'rgb(43, 43, 43)' && doc.permission.light.radius === '16px' && doc.permission.light.padding === '8px')
check('evidence: current permission row carries the check', doc.permission.light.rows.some((row) => row.current === true && row.check === true))

for (const name of [
  'm23-rail-home',
  'm23-rail-schedules',
  'm23-rail-plugins',
  'm23-rail-more',
  'm23-rail-projects',
  'm23-project-overview',
  'm23-project-detail',
  'm23-home-super-agent',
  'm23-project-hover-menu',
  'm23-project-more-menu',
  'm23-project-hover-menu-dark',
  'm23-permission-light',
  'm23-permission-dark',
  'm23-width-max'
]) {
  check(`evidence: ${name}.png exists`, nonEmpty(`docs/screenshots/${name}.png`))
}

console.log(`\nm23: ${checks - failures}/${checks} checks passed`)
if (failures > 0) process.exit(1)
