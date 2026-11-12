#!/usr/bin/env node
/**
 * Session-list projection test (Phase 3).
 *
 * The sidebar list groups the Host snapshot itself, so these checks run the
 * exact module that is inlined into the browser bundle. They cover visibility
 * (subagent, blank, archived), pin dedupe, workspace grouping, membership that
 * arrives before the flat list, paging, expansion persistence, and the menu
 * capabilities that the UI is allowed to paint.
 *
 * Run: node test/sessions.test.mjs
 */

import {
  CHATGPT_PROJECT_EXPANSION_KEY,
  CHATGPT_PROJECTS_VISIBLE_KEY,
  CHATGPT_PROJECT_MENU_ACTIONS,
  CHATGPT_RECENT_INITIAL_LIMIT,
  CHATGPT_RECENT_PAGE_SIZE,
  CHATGPT_PROJECT_INITIAL_LIMIT,
  CHATGPT_PROJECT_PAGE_SIZE,
  CHATGPT_SESSION_MENU_ACTIONS,
  CHATGPT_INTERNAL_TITLE_PREFIXES,
  chatgptBuildSessionSections,
  chatgptCurrentMainId,
  chatgptIsInternalSession,
  chatgptNextProjectLimit,
  chatgptNextRecentLimit,
  chatgptNormalizeProjectExpansion,
  chatgptPageSessionSections,
  chatgptProjectLimit,
  chatgptProjectTitle,
  chatgptSessionTitle,
  chatgptSessionVisible
} from '../lib/shared/sessions-core.mjs'

let failures = 0
let checks = 0
const check = (name, condition, detail) => {
  checks += 1
  if (condition) return
  failures += 1
  console.log(`FAIL  ${name}${detail === undefined ? '' : ` — ${detail}`}`)
}

const row = (id, extra = {}) => ({
  id,
  title: id.toUpperCase(),
  updatedAt: 100,
  origin: 'main',
  blank: false,
  ...extra
})

// 1. Titles: display title wins, blank rows fall back, paths name projects.
{
  check('displayTitle wins', chatgptSessionTitle({ title: 'old', displayTitle: ' new ' }) === 'new')
  const prompted = {
    title: '',
    cwd: '/mnt/f/project/tools/plugin',
    displayTitle: 'plugin',
    projectionValues: { turnOutline: [{ prompt: '  请检查  最近分组  ' }] }
  }
  check('empty title uses first user prompt', chatgptSessionTitle(prompted) === '请检查 最近分组', chatgptSessionTitle(prompted))
  check(
    'shared turn-outline projection supplies the prompt',
    chatgptSessionTitle({ ...prompted, projectionValues: undefined }, { turnOutline: [{ prompt: '来自共享投影' }] }) === '来自共享投影'
  )
  check('whitespace title uses first user prompt', chatgptSessionTitle({ ...prompted, title: '   ' }) === '请检查 最近分组')
  check('project basename is never a title fallback', chatgptSessionTitle({ ...prompted, projectionValues: undefined }) === '新会话')
  check('empty prompt falls back to 新会话', chatgptSessionTitle({ ...prompted, projectionValues: { turnOutline: [{ prompt: '  ' }] } }) === '新会话')
  const longPrompt = '长'.repeat(80)
  const longTitle = chatgptSessionTitle({ ...prompted, projectionValues: { turnOutline: [{ prompt: longPrompt }] } })
  check('overlong title from first prompt clips to 40 characters including ellipsis', Array.from(longTitle).length === 40 && longTitle.endsWith('…'), longTitle)
  check('missing summary falls back to 新会话', chatgptSessionTitle(undefined) === '新会话')
  check(
    'placeholder display title yields to the first prompt',
    chatgptSessionTitle({ ...prompted, title: '新会话', displayTitle: '新会话' }) === '请检查 最近分组'
  )
  check(
    'English placeholder title yields to the first prompt',
    chatgptSessionTitle({ ...prompted, title: 'New chat', displayTitle: 'New chat' }) === '请检查 最近分组'
  )
  check(
    'placeholder with no prompt remains the placeholder',
    chatgptSessionTitle({ title: 'Untitled', displayTitle: 'Untitled' }) === '新会话'
  )
  check('blank row never shows a project-derived title', chatgptSessionTitle({ title: 'plugin', blank: true }) === '新会话')
  check('project title uses title', chatgptProjectTitle({ title: 'DSH', path: '/x/y' }) === 'DSH')
  check('project title uses final path segment', chatgptProjectTitle({ path: '/mnt/f/project/tools/plugin/' }) === 'plugin')
  check('project title handles an empty path', chatgptProjectTitle({}) === '未命名项目')
}

// 2. Visibility mirrors the Host browser rules.
{
  const archived = new Set(['arch'])
  check('ordinary row visible', chatgptSessionVisible(row('a'), undefined, archived))
  check('subagent row hidden', chatgptSessionVisible(row('s', { origin: 'subagent' }), undefined, archived) === false)
  check('archived row hidden', chatgptSessionVisible(row('arch'), undefined, archived) === false)
  check('unselected blank hidden', chatgptSessionVisible(row('b', { blank: true }), 'other', archived) === false)
  check('selected blank visible', chatgptSessionVisible(row('b', { blank: true }), 'b', archived))
  check('retained main is found', chatgptCurrentMainId({ byId: { a: row('a'), b: row('b', { retainedBy: { mainView: 1 } }) } }) === 'b')
}

// 3. Grouping: pinned first, project rows next, recent last. A row appears once.
{
  const summaries = {
    p: row('p', { updatedAt: 90 }),
    a: row('a', { updatedAt: 80 }),
    r: row('r', { updatedAt: 70 }),
    sub: row('sub', { origin: 'subagent', updatedAt: 60 }),
    blank: row('blank', { blank: true, updatedAt: 50 }),
    arch: row('arch', { updatedAt: 40 })
  }
  const list = { ids: Object.keys(summaries), byId: summaries }
  const workspaces = {
    items: [{ workspaceId: 'w1', title: 'Project One', path: '/p/one', sessionIds: ['a', 'sub', 'blank', 'arch', 'p', 'a'] }],
    pinnedSessionIds: ['p'],
    archivedSessionIds: ['arch']
  }
  const sections = chatgptBuildSessionSections(list, workspaces)
  check('pinned has the pin only', sections.pinned.length === 1 && sections.pinned[0].id === 'p')
  check('project is grouped once', sections.projects.length === 1 && sections.projects[0].title === 'Project One')
  check(
    'project excludes pinned, subagent, blank, archived and duplicates',
    sections.projects[0].rows.length === 1 && sections.projects[0].rows[0].id === 'a',
    JSON.stringify(sections.projects[0].rows)
  )
  check(
    'recent spans the project and ungrouped rows in recency order',
    sections.recent.length === 2 && sections.recent[0].id === 'a' && sections.recent[1].id === 'r',
    JSON.stringify(sections.recent.map((entry) => entry.id))
  )
  check('recent row carries its project marker', sections.recent[0].project?.title === 'Project One')
  check('ungrouped recent row has no project marker', sections.recent[1].project === undefined)
  check('total counts each row once despite the second recent entry point', sections.total === 3, String(sections.total))
  check('recentTotal equals the stream length', sections.recentTotal === 2)
  const onlyProject = chatgptBuildSessionSections(
    { ids: ['a'], byId: { a: summaries.a } },
    { items: [{ workspaceId: 'w1', title: 'Project One', sessionIds: ['a'] }], pinnedSessionIds: [], archivedSessionIds: [] }
  )
  check('a lone project session still creates 最近 content', onlyProject.recent.length === 1 && onlyProject.recent[0].id === 'a')
  const onlyProjectPage = chatgptPageSessionSections(onlyProject, 120)
  check('that lone project session is visible on the first 最近 page', onlyProjectPage.recent.length === 1 && onlyProjectPage.recentHidden === 0)
}

// 3b. P0-17: Chat joins a Workspace for an editable composer but is displayed
// outside every project group; it stays in the global 最近 stream.
{
  const summaries = {
    work: row('work', { projectionValues: { agentPreset: 'standard' } }),
    chat: row('chat', { projectionValues: { agentPreset: 'chat' } })
  }
  const list = { ids: ['work', 'chat'], byId: summaries }
  const workspaces = {
    items: [{ workspaceId: 'w', title: 'W', sessionIds: ['work', 'chat'] }],
    pinnedSessionIds: [],
    archivedSessionIds: []
  }
  const sections = chatgptBuildSessionSections(list, workspaces, {
    excludeFromProjects: (id, entry) => entry?.projectionValues?.agentPreset === 'chat'
  })
  check('Chat row is not in a project group', sections.projects[0].rows.length === 1 && sections.projects[0].rows[0].id === 'work', JSON.stringify(sections.projects[0].rows))
  check('Chat row stays in 最近', sections.recent.some((entry) => entry.id === 'chat'))
  check('Chat row counts once', sections.total === 2, String(sections.total))
  const unfiltered = chatgptBuildSessionSections(list, workspaces)
  check('without the predicate the Host membership still groups both', unfiltered.projects[0].rows.length === 2)
}

// 4. A Workspace member can precede the flat Session list without disappearing.
{
  const summaries = { known: row('known') }
  const list = { ids: ['known'], byId: summaries }
  const workspaces = { items: [{ workspaceId: 'w', title: 'W', sessionIds: ['known', 'ghost'] }], pinnedSessionIds: [], archivedSessionIds: [] }
  const sections = chatgptBuildSessionSections(list, workspaces)
  check('unknown workspace member stays addressable', sections.projects[0].rows.some((entry) => entry.id === 'ghost'))
  check('unknown member title is neutral', chatgptSessionTitle(sections.projects[0].rows.find((entry) => entry.id === 'ghost').row) === '新会话')
}

// 5. Pinned wins over project membership; no duplicate in recent.
{
  const summaries = { a: row('a'), b: row('b') }
  const list = { ids: ['a', 'b'], byId: summaries }
  const sections = chatgptBuildSessionSections(list, {
    items: [{ workspaceId: 'w', title: 'W', sessionIds: ['a', 'b'] }],
    pinnedSessionIds: ['b'],
    archivedSessionIds: []
  })
  check('pinned row removed from project', sections.projects[0].rows.length === 1 && sections.projects[0].rows[0].id === 'a')
  check('pinned row not in recent', sections.recent.length === 1 && sections.recent[0].id === 'a')
  check('project member appears once in recent', sections.recent.filter((entry) => entry.id === 'a').length === 1)
}

// 6. Expansion persistence normalizes missing/unknown/false values.
{
  check('expansion key is stable', CHATGPT_PROJECT_EXPANSION_KEY === 'dsh-chatgpt-ui:expanded-projects')
  const normalized = chatgptNormalizeProjectExpansion({ a: false, gone: false }, ['a', 'b'])
  check('stored false is preserved', normalized.a === false)
  check('new project defaults open', normalized.b === true)
  check('unknown project is dropped', Object.keys(normalized).length === 2 && normalized.gone === undefined)
  const empty = chatgptNormalizeProjectExpansion(null, ['x'])
  check('missing storage defaults open', empty.x === true)
}

// 7. Project-local paging (P0-22): N=8 per project, +8 per local step.
{
  check('project first page is 8', CHATGPT_PROJECT_INITIAL_LIMIT === 8 && CHATGPT_PROJECT_PAGE_SIZE === 8)
  check('project limit defaults to N', chatgptProjectLimit(undefined, 20) === 8)
  check('short project shows all', chatgptProjectLimit(undefined, 3) === 3)
  check('stored zero still renders N', chatgptProjectLimit(0, 5) === 5)
  check('first project load more', chatgptNextProjectLimit(8, 20) === 16)
  check('project step is capped by its total', chatgptNextProjectLimit(16, 20) === 20)
  check('short project has no extra page', chatgptNextProjectLimit(undefined, 3) === 3)

  const projectA = Array.from({ length: 20 }, (_, index) => ({ id: `a${index}`, row: row(`a${index}`) }))
  const projectB = Array.from({ length: 3 }, (_, index) => ({ id: `b${index}`, row: row(`b${index}`) }))
  const sections = { pinned: [], projects: [{ id: 'a', title: 'A', rows: projectA }, { id: 'b', title: 'B', rows: projectB }], recent: [] }
  const first = chatgptPageSessionSections(sections, {}, 12)
  check('A starts at N', first.projects[0].rows.length === 8 && first.projects[0].total === 20 && first.projects[0].hidden === 12 && first.projects[0].truncated === true)
  check('B shows all rows when below N', first.projects[1].rows.length === 3 && first.projects[1].hidden === 0 && first.projects[1].truncated === false)
  const moreA = chatgptPageSessionSections(sections, { a: 16 }, 12)
  check('A local step only grows A', moreA.projects[0].rows.length === 16 && moreA.projects[1].rows.length === 3)
  check('A local step keeps its remaining count', moreA.projects[0].hidden === 4)
  const fullA = chatgptPageSessionSections(sections, { a: 20 }, 12)
  check('A complete hides no rows', fullA.projects[0].rows.length === 20 && fullA.projects[0].truncated === false)

  const pinned = Array.from({ length: 120 }, (_, index) => ({ id: `p${index}`, row: row(`p${index}`) }))
  const withPinned = chatgptPageSessionSections({ pinned, projects: [{ id: 'w', title: 'W', rows: projectA.slice(0, 5) }], recent: [] }, {})
  check('pinned rows cannot eat a project first page', withPinned.pinned.length === 120 && withPinned.projects[0].rows.length === 5 && withPinned.projects[0].truncated === false)

  const recent = Array.from({ length: 30 }, (_, index) => ({ id: `r${index}`, row: row(`r${index}`), project: { title: 'A' } }))
  const withRecent = chatgptPageSessionSections({ pinned: [], projects: [{ id: 'a', title: 'A', rows: projectA }], recent }, { a: 8 }, 12)
  check('recent defaults to 12 and keeps its own hidden count', withRecent.recent.length === 12 && withRecent.recentHidden === 18)
  check('recent does not move a project limit', withRecent.projects[0].rows.length === 8 && withRecent.projects[0].hidden === 12)
  const recentMore = chatgptPageSessionSections({ pinned: [], projects: [{ id: 'a', title: 'A', rows: projectA }], recent }, { a: 8 }, 24)
  check('recent 显示更多 is independent', recentMore.recent.length === 24 && recentMore.recentHidden === 6 && recentMore.projects[0].rows.length === 8)
}

// 7b. Recent ordering is stable and includes project sessions without duplicates.
{
  const summaries = {
    z: row('z', { updatedAt: 100 }),
    a: row('a', { updatedAt: 100 }),
    m: row('m', { updatedAt: 100 }),
    old: row('old', { updatedAt: 50 })
  }
  const list = { ids: Object.keys(summaries), byId: summaries }
  const sections = chatgptBuildSessionSections(list, {
    items: [{ workspaceId: 'w', title: 'W', sessionIds: ['z', 'a', 'old'] }],
    pinnedSessionIds: [],
    archivedSessionIds: []
  })
  check(
    'equal updatedAt falls back to id ascending',
    JSON.stringify(sections.recent.slice(0, 3).map((entry) => entry.id)) === JSON.stringify(['a', 'm', 'z']),
    JSON.stringify(sections.recent.map((entry) => entry.id))
  )
  check('project member is in recent without duplication', sections.recent.filter((entry) => entry.id === 'a').length === 1)
  check('recent project marker is carried for project members', sections.recent.find((entry) => entry.id === 'a').project.title === 'W')
}

// 7c. Internal Sessions (super-agent Router / worker) never reach the browser.
{
  const summaries = {
    user: row('user', { title: '帮我改一下登录页' }),
    worker: row('worker', { title: 'Super-agent worker · 修复登录页', updatedAt: 900 }),
    legacy: row('legacy', { title: 'Super-agent · 旧版 worker', updatedAt: 800 }),
    router: row('router', { title: '新会话', updatedAt: 700, blank: true })
  }
  const workspaces = {
    items: [
      { workspaceId: 'w1', title: '我的项目', sessionIds: ['user', 'worker'] },
      { workspaceId: 'w2', title: 'Super-agent Workspace', sessionIds: ['router'] }
    ],
    pinnedSessionIds: ['worker'],
    archivedSessionIds: []
  }
  const list = { ids: Object.keys(summaries), byId: summaries }

  check(
    'title prefix marks a worker as internal',
    chatgptIsInternalSession('worker', summaries.worker) === true &&
      chatgptIsInternalSession('legacy', summaries.legacy) === true,
    JSON.stringify(CHATGPT_INTERNAL_TITLE_PREFIXES)
  )
  check('a normal title is not internal', chatgptIsInternalSession('user', summaries.user) === false)
  check(
    'the super-agent id set marks the Router internal',
    chatgptIsInternalSession('router', summaries.router, new Set(['router'])) === true
  )

  const byPrefix = chatgptBuildSessionSections(list, workspaces)
  const recentIds = byPrefix.recent.map((entry) => entry.id)
  check('worker stays out of 最近', recentIds.includes('worker') === false, recentIds.join(','))
  check('legacy worker stays out of 最近', recentIds.includes('legacy') === false)
  check('worker stays out of its project', byPrefix.projects[0].rows.some((entry) => entry.id === 'worker') === false)
  check('a purely internal project group is dropped', byPrefix.projects.some((project) => project.title === 'Super-agent Workspace') === false)
  check('worker stays out of 置顶', byPrefix.pinned.some((entry) => entry.id === 'worker') === false)
  check('the user Session survives', recentIds.includes('user') && byPrefix.projects[0].rows.some((entry) => entry.id === 'user'))

  const byIds = chatgptBuildSessionSections(list, {
    items: [{ workspaceId: 'w1', title: '我的项目', sessionIds: ['user', 'worker'] }],
    pinnedSessionIds: [],
    archivedSessionIds: []
  }, { internalSessionIds: new Set(['worker']) })
  check(
    'the super-agent id set alone filters a row without a prefix',
    byIds.recent.some((entry) => entry.id === 'worker') === false && byIds.projects[0].rows.length === 1
  )

  // A normal project that happens to have no sessions stays visible: only a
  // group whose every member was filtered as internal disappears.
  const empty = chatgptBuildSessionSections(
    { ids: [], byId: {} },
    { items: [{ workspaceId: 'w3', title: '空项目', sessionIds: [] }], pinnedSessionIds: [], archivedSessionIds: [] }
  )
  check('an empty project still renders', empty.projects.length === 1)
}

// 8. Menu capabilities are exactly the Host-backed calls the UI implements.
{
  check('session menu actions', JSON.stringify(CHATGPT_SESSION_MENU_ACTIONS) === JSON.stringify(['open', 'rename', 'pin', 'archive']))
  check('project menu actions', JSON.stringify(CHATGPT_PROJECT_MENU_ACTIONS) === JSON.stringify(['rename-project', 'new-in-project', 'move-project-top', 'delete-project']))
  check('no delete action is advertised', CHATGPT_SESSION_MENU_ACTIONS.includes('delete') === false)
  check('no move-to-project action is advertised', CHATGPT_SESSION_MENU_ACTIONS.includes('move') === false)
  check('section visibility has its own storage key', CHATGPT_PROJECTS_VISIBLE_KEY === 'dsh-chatgpt-ui:projects-visible')
  check('section visibility is not the expansion key', CHATGPT_PROJECTS_VISIBLE_KEY !== CHATGPT_PROJECT_EXPANSION_KEY)
}

console.log(`sessions: ${checks - failures}/${checks} checks passed`)
if (failures > 0) process.exitCode = 1
