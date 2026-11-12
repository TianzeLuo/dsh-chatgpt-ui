#!/usr/bin/env node
/**
 * P0-10A — rail five destinations, fixed sidebar block, project rows.
 *
 * Source checks pin the contract that the live evidence proves:
 *   - 首页 / 定时任务 / 插件 / 更多 / 项目, no super-agent in the rail;
 *   - 新聊天 + super-agent are a sibling of the scrolling list;
 *   - a project row only toggles its group and never navigates;
 *   - its menu is a hover menu anchored to the row's right edge;
 *   - 新建会话 clears the old draft and starts Work;
 *   - the running spinner reads Host SessionStatus.running, never a timer.
 *
 * It also validates docs/m21.json and every screenshot it names.
 *
 * Run: node test/m21.test.mjs
 */

import { existsSync, readFileSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (path) => readFileSync(join(ROOT, path), 'utf8')
const rail = read('lib/client/rail.js')
const sessions = read('lib/client/sessions.js')
const mode = read('lib/client/mode.js')
const css = read('lib/client/css/25-sessions.css')
const railCss = read('lib/client/css/21-rail.css')
const doc = JSON.parse(read('docs/m21.json'))
const doc35 = JSON.parse(read('docs/m35.json'))

let checks = 0
let failures = 0
const check = (name, condition, detail) => {
  checks += 1
  if (condition) return
  failures += 1
  console.log(`FAIL  ${name}${detail === undefined ? '' : ` — ${detail}`}`)
}

// 1. Rail: five destinations, restored schedules, no super-agent.
{
  const block = rail.slice(rail.indexOf('const CHATGPT_RAIL_ITEMS = ['), rail.indexOf('const CHATGPT_RAIL_SETTINGS_ITEM'))
  const ids = [...block.matchAll(/id: '([a-z]+)'/g)].map((match) => match[1])
  check('rail order is 首页/定时任务/插件/更多/项目', ids.join(',') === 'home,schedules,plugins,more,projects', ids.join(','))
  check('定时任务 is a primary host panel', /id: 'schedules'[^\n]*panelId: 'schedules'/.test(block))
  check('plugins is still the plugin-manager panel', /id: 'plugins'[^\n]*panelId: CHATGPT_PLUGINS_PANEL_ID/.test(block))
  check('projects opens the all-projects overview', /chatgptOpenProjectPage\(''\)/.test(rail) && !/chatgptOpenProjectPage\(first\)/.test(rail))
  check('no super-agent rail item', !/id: 'agent'[^\n]*kind: 'panel'/.test(block) && !block.includes('DOT_PANEL_ID'))
  check('selection is driven by the real active panel', rail.includes('activePanel === item.panelId') && rail.includes("item.kind === 'projects'") && rail.includes('projectOpen'))
  check('selected/unselected glyph state is exposed', rail.includes("'data-cgpt-rail-glyph-state': active ? 'filled' : 'outline'") && rail.includes("'data-cgpt-rail-state': active ? 'selected' : 'default'"))
  check('selected fill uses the light highlight token', railCss.includes("[data-cgpt-rail-state='selected']") && railCss.includes('background: var(--cgpt-rail-active-bg)'))
}

// 2. Fixed sidebar block: new chat + super-agent, only the list scrolls.
{
  const fixed = sessions.indexOf("className: 'chatgpt-session-fixed'")
  const scroll = sessions.indexOf("className: 'chatgpt-session-scroll'")
  check('fixed block exists before the scroll container', fixed !== -1 && scroll !== -1 && fixed < scroll)
  check('super-agent row lives in the fixed block', sessions.slice(fixed, scroll).includes("'data-cgpt-super-agent'"))
  check('new chat button lives in the fixed block', sessions.slice(fixed, scroll).includes("'data-cgpt-new-chat'") && sessions.slice(fixed, scroll).includes('onClick: () => startSession()'))
  check('fixed block is not nested in the scroll container', !sessions.slice(scroll, scroll + 200).includes("className: 'chatgpt-session-fixed'"))
  check('fixed block CSS is flex:none outside the scroller', /\.chatgpt-session-fixed\s*\{[\s\S]*?flex:\s*none/.test(css) && /\.chatgpt-session-scroll\s*\{[\s\S]*?overflow-y:\s*auto/.test(css))
}

// 3. Project row: no chevron, click toggles only, hover actions.
{
  check('project row has no chevron element', !sessions.includes('chatgpt-project-chevron') && !sessions.includes('chatgpt-project-toggle'))
  check('project row click only toggles its expansion', /onClick: \(\) => toggleProject\(project\.id\)/.test(sessions))
  check('project row does not open the project page', !/data-cgpt-project-row[\s\S]{0,600}chatgptOpenProjectPage/.test(sessions))
  check('project row structure starts with folder + title', /className: 'chatgpt-project-icon'[\s\S]{0,700}className: 'chatgpt-project-title'/.test(sessions))
  check('hover actions contain 新建会话 and ⋯', sessions.includes("'data-cgpt-project-new'") && sessions.includes("'data-cgpt-project-more'"))
  check('hover actions are revealed by the head hover', /\.chatgpt-project-head:hover \.chatgpt-project-actions|\.chatgpt-project-head:hover \.chatgpt-project-new/.test(css))
  check('expansion is persisted independently', sessions.includes('chatgptWriteProjectExpansion') && sessions.includes('CHATGPT_PROJECT_EXPANSION_KEY'))
  check('persistence waits for the workspace store before writing', sessions.includes('if (projectIds.length === 0) return') && sessions.includes('chatgptWriteProjectExpansion({ ...chatgptReadProjectExpansion(), ...normalizedExpanded })'))
}

// 4. Hover menu: right-anchored, vertical top aligned, six entries.
{
  check('hover menu is not a context menu', sessions.includes("'data-cgpt-session-menu': 'project-hover'") && sessions.includes("openProjectMenu"))
  // P0-19c: both ⋯ menus share one anchor rule (right of the trigger,
  // vertically centred, flipped inside the viewport), so the literal 8px offset
  // moved into `chatgptMenuPlacement`.
  check('hover menu uses the shared trigger anchor', (sessions.match(/chatgptMenuPlacement\(/g) ?? []).length >= 2)
  check('hover menu keeps the menu-open grace period', sessions.includes('scheduleProjectMenuClose') && sessions.includes('keepProjectMenu'))
  for (const action of ['pin-project', 'edit-project', 'reveal-project', 'archive-project-chats', 'remove-project']) {
    check(`menu entry ${action} is present`, sessions.includes(`action: '${action}'`))
  }
  // P0-19c removed the row: DSH has no project-section model.
  check('分区 row is gone from the project menu', !sessions.includes("action: 'section-project'") && !sessions.includes("label: '分区'"))
  check('置顶 toggles the persisted skin flag', sessions.includes('chatgptTogglePinnedProject(current, id)') && sessions.includes('chatgptWritePinnedProjectIds'))
  check('编辑 uses the rename dialog', sessions.includes("kind: 'project-rename'") || sessions.includes('submitRename'))
  check('在资源管理器中打开 uses remote.session.openWorkspacePath', sessions.includes('openWorkspacePath') && sessions.includes("action: 'reveal'"))
  check('移除项目 goes through the shared delete helper', sessions.includes('chatgptRequestProjectDelete(project.id, project.title)') && read('lib/client/project.js').includes("dsh-chatgpt:delete-project"))
}

// 5. New Session: Work mode, old draft cleared, no navigation.
{
  check('mode.js exposes the Work starter', mode.includes('function chatgptStartWorkSession') && mode.includes('clearPreviousDraft: true'))
  check('project action calls the Work starter with the project id', sessions.includes('chatgptStartWorkSession(ctx, projectId, preset)'))
  check('the new-session shortcut closes the menu and project page', sessions.includes('closeProjectMenu()') && sessions.includes('chatgptCloseProjectPage()'))
}

// 6. Running is a Host fact.
{
  check('the list reads useSessionStatus', sessions.includes('useSessionStatus') && sessions.includes('SessionStatus.running'))
  check('running is true only for a running row', sessions.includes(".running === true"))
  check('the spinner has real markup and a CSS animation', sessions.includes("'data-cgpt-running-spinner'") && css.includes('@keyframes chatgpt-session-spin'))
  check('the spinner is not a plugin timer', !/setInterval\([^)]*spinner|setTimeout\([^)]*spinner/.test(sessions))
  check('the project row never renders a spinner', !sessions.includes('chatgpt-session-running chatgpt-project-running') && !sessions.includes("'data-cgpt-project-running'"))
}

// 7. The recorded evidence agrees with the source.
{
  check('evidence task is P0-10A', doc.task === 'P0-10A')
  check('evidence rail order matches', doc.rail.order.join(',') === 'home,schedules,plugins,more,projects,settings')
  check('evidence has no super-agent rail button', !doc.rail.buttons.some((item) => item.id === 'agent'))
  check('evidence has the restored schedules button', doc.rail.buttons.some((item) => item.id === 'schedules' && item.label === '定时任务'))
  check('every rail run marks one solid selected item', doc.rail.runs.every((run) => run.states.filter((state) => state.state === 'selected').length === 1 && run.states.filter((state) => state.glyphState === 'filled').length === 1))
  check('fixed area is outside the scrollport', doc.sidebar.fixedArea.outsideScroll === true && doc.sidebar.fixedArea.parent === 'chatgpt-sessions')
  check('fixed area contains both rows and is 83px', doc.sidebar.fixedArea.height === 83 && doc.sidebar.fixedArea.rows.join(',') === '新聊天,super-agent')
  check('fixed rows do not move when the list scrolls', doc.sidebar.beforeScroll.fixed.y === doc.sidebar.afterScroll.fixed.y && doc.sidebar.afterScroll.scrollTop > 0)
  check('fixed rows stay above the scrolling content', doc.sidebar.afterScroll.fixed.bottom <= doc.sidebar.afterScroll.scroll.y + 1)
  check('project row click leaves the URL and panel untouched', doc.projectRow.click.before.url === doc.projectRow.click.after.url && doc.projectRow.click.after.panel === null && doc.projectRow.click.after.overview === false)
  check('project row click flips only its own expansion', doc.projectRow.click.before.aria === 'true' && doc.projectRow.click.after.aria === 'false')
  check('collapsed project survives a reload', doc.projectRow.click.persisted.aria === 'false' && doc.projectRow.click.persisted.overview === false)
  check('hover menu is to the right of the row', doc.projectRow.menu.kind === 'hover' && doc.projectRow.menu.rect.x > doc.projectRow.menu.rowRect.right)
  check('hover menu is top aligned with the row', doc.projectRow.menu.topAligned === true)
  check('hover menu has all five current actions', ['置顶', '编辑', '在资源管理器中打开', '归档聊天', '移除项目'].every((label) => doc.projectRow.menu.items.some((item) => item.label === label)))
  check('every menu action names its backing or is explicitly disabled', doc.projectRow.menu.items.every((item) => item.disabled === true || typeof item.backing === 'string'))
  // P0-19c: the 分区 row was removed. The old m21 capture still records it (it
  // is a historical frame); the current evidence is docs/m35.json.
  check('分区 is absent from the current menu evidence', doc35.sectionRemoval.absent === true && !doc35.menus.project.labels.includes('分区'))
  check('new session produced Work mode without navigating', doc.projectRow.newSession.created.mode === 'agent' && doc.projectRow.newSession.urlUnchanged === true)
  check('running came from the Host and cleared', doc.projectRow.running.fakeTimer === false && doc.projectRow.running.spinnersAtCapture > 0 && doc.projectRow.running.clearsWhenHostSettles === true)
  check('all recorded assertions passed', doc.assertionSummary.failed.length === 0 && doc.assertionSummary.pass === doc.assertionSummary.total)
  for (const path of [...doc.rail.screenshots, ...doc.sidebar.screenshots, ...doc.projectRow.screenshots]) {
    check(`screenshot exists: ${path}`, existsSync(join(ROOT, path)) && statSync(join(ROOT, path)).size > 3000)
  }
}

console.log(`${failures === 0 ? 'PASS' : 'FAIL'}  ${checks - failures}/${checks} P0-10A checks passed`)
process.exit(failures === 0 ? 0 : 1)
