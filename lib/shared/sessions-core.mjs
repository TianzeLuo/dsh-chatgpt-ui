/**
 * Pure session-list projection used by the browser fragment and its tests.
 *
 * The sidebar browser owns grouping, ordering, and the visibility rules that
 * the host browser applies to Session rows. Keeping those decisions here (and
 * out of React) makes them testable without a DOM and keeps a host snapshot
 * change from silently turning archived or subagent rows into ordinary chats.
 *
 * No imports: scripts/build-client.mjs inlines this file into the browser
 * bundle by dropping its `export` keywords.
 */

/** Persisted per-Workspace expansion map. */
export const CHATGPT_PROJECT_EXPANSION_KEY = 'dsh-chatgpt-ui:expanded-projects'

/** Persisted visibility of the whole 项目 section (not per-project expansion). */
export const CHATGPT_PROJECTS_VISIBLE_KEY = 'dsh-chatgpt-ui:projects-visible'

/**
 * Persisted pinned-project ids, host order excluded. P0-19c: a project 置顶 is
 * the skin's own two-way flag — the Host has no project pin, and its
 * `workspaces.insertBefore` can move a project up but can never put it back.
 * The list keeps the ids in the order they were pinned; the render order is
 * "pinned first, host order inside each group" (see chatgptSortProjectsByPin).
 */
export const CHATGPT_PINNED_PROJECTS_KEY = 'dsh-chatgpt-ui:pinned-projects'

/** Session-row menu capabilities that a real host call backs. */
export const CHATGPT_SESSION_MENU_ACTIONS = ['open', 'rename', 'pin', 'archive']

/** Project-header menu capabilities that a real host call backs. */
export const CHATGPT_PROJECT_MENU_ACTIONS = ['rename-project', 'new-in-project', 'move-project-top', 'delete-project']

/**
 * First rows rendered inside each project (P0-22). The Host's sidebar/workspace
 * bundles expose no per-project first-page constant (the native browser renders
 * every member), so the brief's fallback of 8 applies. This is deliberately
 * NOT the 最近/pinned cursor: each project pages from its own total.
 */
export const CHATGPT_PROJECT_INITIAL_LIMIT = 8

/** Additional rows revealed by one project-local 显示更多 step. */
export const CHATGPT_PROJECT_PAGE_SIZE = 8

/** First page of the cross-project 最近 stream. */
export const CHATGPT_RECENT_INITIAL_LIMIT = 12

/** Additional 最近 rows revealed by 显示更多. */
export const CHATGPT_RECENT_PAGE_SIZE = 12

/** Longest first-prompt preview used as a Session title fallback. */
export const CHATGPT_SESSION_SUMMARY_LIMIT = 40

/** Project basename used by the Host as its displayTitle fallback. */
function projectBasename(row) {
  const cwd = typeof row?.cwd === 'string' ? row.cwd.replace(/[\\/]+$/, '') : ''
  const base = cwd.split(/[\\/]/).filter(Boolean).pop()
  return base === undefined ? '' : base
}

/** First human prompt from the turn-outline projection, when the Host exposes it. */
function firstPrompt(row, projections) {
  const direct = Array.isArray(row?.turnOutline) ? row.turnOutline : undefined
  const projected = Array.isArray(row?.projectionValues?.turnOutline) ? row.projectionValues.turnOutline : undefined
  const shared = Array.isArray(projections?.turnOutline) ? projections.turnOutline : undefined
  for (const turns of [direct, projected, shared]) {
    if (turns === undefined) continue
    for (const turn of turns) {
      const prompt = typeof turn?.prompt === 'string' ? turn.prompt.replace(/\s+/g, ' ').trim() : ''
      if (prompt !== '') return prompt
    }
  }
  return ''
}

/** Clamp a prompt to 40 visible code points, ellipsis included. */
export function chatgptSessionPromptPreview(prompt) {
  const text = typeof prompt === 'string' ? prompt.replace(/\s+/g, ' ').trim() : ''
  if (text === '') return ''
  const chars = Array.from(text)
  return chars.length <= CHATGPT_SESSION_SUMMARY_LIMIT
    ? text
    : chars.slice(0, CHATGPT_SESSION_SUMMARY_LIMIT - 1).join('') + '…'
}

/**
 * Session label shown in a row. The Host's `displayTitle` falls back to the
 * project basename or session id, so those values must not masquerade as a
 * title; use the first durable user prompt before the neutral 新会话 fallback.
 * @param {object|undefined} row - SessionSummary.
 * @param {object|undefined} [projections] - shared projection values for the row.
 * @returns {string} durable title, first-prompt summary, or 新会话.
 */
export function chatgptSessionTitle(row, projections) {
  if (row?.blank === true) return '新会话'
  const display = typeof row?.displayTitle === 'string' ? row.displayTitle.trim() : ''
  const durable = typeof row?.title === 'string' ? row.title.trim() : ''
  const basename = projectBasename(row)
  const fallbackNames = new Set([basename, typeof row?.id === 'string' ? row.id : ''])
  // A default caption is not a title: several untitled Sessions would all
  // render as 新会话 and be indistinguishable in 最近. Prefer the first durable
  // prompt below instead.
  const placeholders = new Set(['新会话', 'New chat', 'New session', 'Untitled', '未命名'])
  const usable = (value) => value !== '' && !fallbackNames.has(value) && !placeholders.has(value)
  const candidate = usable(display) ? display : usable(durable) ? durable : ''
  if (candidate !== '') return candidate
  const prompt = firstPrompt(row, projections)
  if (prompt !== '') return chatgptSessionPromptPreview(prompt)
  return '新会话'
}

/**
 * Workspace label shown as a project group.
 * @param {object|undefined} workspace - WorkspaceView.
 * @returns {string} title, or the final path segment as a fallback.
 */
export function chatgptProjectTitle(workspace) {
  const title = typeof workspace?.title === 'string' ? workspace.title.trim() : ''
  if (title !== '') return title
  const path = typeof workspace?.path === 'string' ? workspace.path.replace(/[\\/]+$/, '') : ''
  const base = path.split(/[\\/]/).filter(Boolean).pop()
  return base === undefined || base === '' ? '未命名项目' : base
}

/**
 * Durable title prefixes that mark a Session as an internal conversation.
 *
 * super-agent creates its workers as ordinary Sessions (they need
 * `header.cwd` = the target project), so the Host carries no `origin` flag for
 * them; the plugin names every worker `Super-agent worker · <task>` (see its
 * `lib/index.js`) and its legacy/restart path produced `Super-agent · <task>`.
 * Those two prefixes are the marker super-agent itself uses to hide them from
 * the Host sidebar, so the skin reuses the same rule instead of keeping a
 * hardcoded id list.
 */
export const CHATGPT_INTERNAL_TITLE_PREFIXES = ['Super-agent worker ·', 'Super-agent ·']

/**
 * Whether a Session is an internal (non-conversation) one.
 *
 * Two independent markers, either is enough:
 *   1. the Session id is in the super-agent set (`routerSessionIds` plus the
 *      dedicated workspace's members, read from its `/api/super-agent/ui/state`);
 *   2. the durable title starts with one of the internal prefixes.
 *
 * @param {string} id - Session id.
 * @param {object|undefined} row - SessionSummary (may be absent before the list settles).
 * @param {Set<string>} [internalIds] - ids reported by super-agent's public state.
 * @returns {boolean} true when the row must stay out of the browser.
 */
export function chatgptIsInternalSession(id, row, internalIds) {
  if (typeof id === 'string' && internalIds instanceof Set && internalIds.has(id)) return true
  const title = typeof row?.title === 'string' ? row.title.trim() : ''
  const display = typeof row?.displayTitle === 'string' ? row.displayTitle.trim() : ''
  return CHATGPT_INTERNAL_TITLE_PREFIXES.some(
    (prefix) => title.startsWith(prefix) || display.startsWith(prefix)
  )
}

/**
 * Whether a Session belongs on the ordinary browser surface.
 * Mirrors the host: subagent children are catalog-only, blanks are visible only
 * while they are the selected New Session, and archived rows are not shown.
 * @param {object} row - SessionSummary.
 * @param {string|undefined} currentBlank - selected blank Session id.
 * @param {Set<string>} archived - archived Session ids.
 * @returns {boolean} true when the row is visible.
 */
export function chatgptSessionVisible(row, currentBlank, archived) {
  if (row === undefined || row === null) return false
  if (row.origin === 'subagent') return false
  if (row.blank === true && row.id !== currentBlank) return false
  return !archived.has(row.id)
}

/**
 * The Session the main view currently retains.
 * @param {object|undefined} list - SessionListState.
 * @returns {string|undefined} retained Session id.
 */
export function chatgptCurrentMainId(list) {
  for (const row of Object.values(list?.byId ?? {})) {
    if ((row?.retainedBy?.mainView ?? 0) > 0) return row.id
  }
  return undefined
}

/** Last-active value in milliseconds, accepting numeric and ISO timestamps. */
function recencyOf(row) {
  const value = row?.updatedAt
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Date.parse(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return 0
}

/** Newest first with a deterministic identity tie-break. */
function byRecency(ids, summaries) {
  return [...ids].sort((left, right) => {
    const a = recencyOf(summaries[left])
    const b = recencyOf(summaries[right])
    if (a !== b) return b - a
    return left < right ? -1 : 1
  })
}

/**
 * Build the three list sections: pinned rows, project groups, and a recent
 * stream that spans projects. A pinned Session appears only in 置顶; a project
 * Session may appear once in its project and once in 最近, but never twice in
 * 最近.
 * @param {object|undefined} list - SessionListState.
 * @param {object|undefined} workspaces - WorkspaceSnapshot.
 * @param {{ internalSessionIds?: Set<string>, isInternal?: (id: string, row: object|undefined) => boolean, excludeFromProjects?: (id: string, row: object|undefined) => boolean }} [options]
 *   internal-Session filter: the super-agent ids it reported, and/or a predicate
 *   (defaults to the title-prefix marker in `chatgptIsInternalSession`); plus an
 *   optional "display outside projects" predicate (Chat Sessions, P0-17).
 * @returns {{pinned: object[], projects: object[], recent: object[], total: number, recentTotal: number}} sections.
 */
export function chatgptBuildSessionSections(list, workspaces, options) {
  const summaries = list?.byId ?? {}
  const archived = new Set(workspaces?.archivedSessionIds ?? [])
  const internalIds = options?.internalSessionIds instanceof Set ? options.internalSessionIds : new Set()
  const isInternal = typeof options?.isInternal === 'function'
    ? options.isInternal
    : (id, row) => chatgptIsInternalSession(id, row, internalIds)
  const isUngrouped = typeof options?.excludeFromProjects === 'function'
    ? options.excludeFromProjects
    : () => false
  const currentBlank = chatgptCurrentMainId(list)
  const pinnedOrder = workspaces?.pinnedSessionIds ?? []
  const workspacesRows = workspaces?.items ?? []
  const known = new Set(list?.ids ?? Object.keys(summaries))
  // A Workspace can know its members before the Host's flat Session list has
  // settled (the browser may mount during a reconnect). Keep those rows
  // addressable by id so the list is not a permanent skeleton; their title
  // falls back until a SessionSummary arrives.
  const memberVisible = (id) => {
    if (archived.has(id)) return false
    if (isInternal(id, summaries[id])) return false
    const row = summaries[id]
    return row === undefined ? true : chatgptSessionVisible(row, currentBlank, archived)
  }
  const visible = new Set()
  for (const id of known) {
    const row = summaries[id]
    if (isInternal(id, row)) continue
    if (chatgptSessionVisible(row, currentBlank, archived)) visible.add(id)
  }

  const pinnedSet = new Set(pinnedOrder)
  const pinned = pinnedOrder
    .filter((id) => visible.has(id))
    .map((id) => ({ id, row: summaries[id] }))

  const accounted = new Set()
  const projectOf = new Map()
  const projects = workspacesRows.map((workspace) => {
    const members = [...new Set(workspace.sessionIds ?? [])].filter(
      (id) => (visible.has(id) || memberVisible(id)) && !pinnedSet.has(id) && !isUngrouped(id, summaries[id])
    )
    for (const id of members) {
      accounted.add(id)
      if (!projectOf.has(id)) {
        projectOf.set(id, { id: workspace.workspaceId, title: chatgptProjectTitle(workspace) })
      }
    }
    return {
      id: workspace.workspaceId,
      title: chatgptProjectTitle(workspace),
      path: workspace.path,
      // A project whose every member turned out to be internal (the Super-agent
      // workspace that hosts the Router) is not a user project: hide the group
      // instead of leaving an empty header behind.
      internalOnly: (workspace.sessionIds ?? []).length > 0 && members.length === 0,
      rows: byRecency(members, summaries).map((id) => ({ id, row: summaries[id] }))
    }
  }).filter((project) => project.internalOnly !== true)

  // 最近 is the global last-active stream: project members plus ungrouped
  // sessions. It is keyed by Session id, so a project row can offer a second
  // entry point without appearing twice in this stream. Pinned rows stay in
  // their own section to avoid a third duplicate.
  const recentIds = new Set([...visible].filter((id) => !pinnedSet.has(id)))
  for (const project of projects) {
    for (const entry of project.rows) if (!pinnedSet.has(entry.id)) recentIds.add(entry.id)
  }
  const recent = byRecency([...recentIds], summaries).map((id) => ({
    id,
    row: summaries[id],
    project: projectOf.get(id)
  }))
  const uniqueIds = new Set([...pinned.map((entry) => entry.id), ...accounted, ...recent.map((entry) => entry.id)])
  const total = uniqueIds.size
  return { pinned, projects, recent, total, recentTotal: recent.length }
}

/**
 * Read and normalize persisted expansion. Missing ids default to expanded, so
 * a newly created project does not arrive collapsed by accident.
 * @param {unknown} stored - parsed localStorage value or anything else.
 * @param {readonly string[]} ids - current Workspace ids.
 * @returns {Record<string, boolean>} normalized map.
 */
export function chatgptNormalizeProjectExpansion(stored, ids) {
  const source = stored !== null && typeof stored === 'object' && !Array.isArray(stored) ? stored : {}
  const next = {}
  for (const id of ids) next[id] = source[id] !== false
  return next
}

/**
 * Read the persisted pinned-project ids without trusting their shape.
 * @param {{getItem?: Function}|null|undefined} storage - localStorage-like.
 * @returns {string[]} unique, non-empty ids; [] on any failure.
 */
export function chatgptReadPinnedProjects(storage) {
  try {
    const raw = storage?.getItem?.(CHATGPT_PINNED_PROJECTS_KEY)
    if (typeof raw !== 'string' || raw === '') return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return [...new Set(parsed.filter((id) => typeof id === 'string' && id !== ''))]
  } catch {
    return []
  }
}

/**
 * Two-way toggle for one project id.
 * @param {readonly string[]} ids - current pinned ids.
 * @param {string} id - Workspace id.
 * @returns {string[]} a new list (pinning appends, unpinning removes).
 */
export function chatgptTogglePinnedProject(ids, id) {
  const list = Array.isArray(ids) ? ids.filter((entry) => typeof entry === 'string' && entry !== '') : []
  if (typeof id !== 'string' || id === '') return list
  return list.includes(id) ? list.filter((entry) => entry !== id) : [...list, id]
}

/**
 * Order projects with the pinned ones first, keeping the Host's own order
 * inside both groups (the array is stable, so pinning never reshuffles the
 * unpinned tail and unpinning restores the original position).
 * @param {readonly object[]} projects - sections.projects (host order).
 * @param {readonly string[]} pinnedIds - persisted ids.
 * @returns {object[]} new ordered array.
 */
export function chatgptSortProjectsByPin(projects, pinnedIds) {
  const list = Array.isArray(projects) ? projects : []
  const pinned = new Set(Array.isArray(pinnedIds) ? pinnedIds : [])
  return [...list.filter((project) => pinned.has(project?.id)), ...list.filter((project) => !pinned.has(project?.id))]
}

/**
 * One popover anchoring rule for both sidebar menus (P0-19c, retuned by
 * P0-19e). Horizontally: 8px right of the trigger, flipped to its left when
 * that side has no room, then clamped inside the viewport. Vertically: the
 * panel's top edge sits on the row's top edge; when that would push the panel
 * past the viewport's bottom margin it flips to bottom-edge alignment (panel
 * bottom = row bottom), which keeps it clear of the trigger.
 *
 * `row` is the row the trigger belongs to (the 28px ⋯ is centred in a 36px
 * row, so the trigger's own top is 4px lower than the edge the panel aligns
 * to). Without a row, the trigger rect doubles as the row.
 *
 * @param {{x: number, y: number, width: number, height: number}} trigger - trigger rect.
 * @param {{width: number, height: number}} size - measured menu size.
 * @param {{width: number, height: number}} viewport - window size.
 * @param {{x: number, y: number, width: number, height: number}} [row] - owning row rect.
 * @returns {{left: number, top: number, flipped: boolean, align: 'top'|'bottom'|'clamped', cornerCorrection: number}} position + flip facts.
 */
export function chatgptMenuPlacement(trigger, size, viewport, row) {
  const margin = 8
  // P0-19e allows up to 1px to clear the panel's rounded corner; measured 0
  // because the row's own top edge is already outside the 16px radius.
  const cornerCorrection = 0
  const triggerX = Number(trigger?.x) || 0
  const triggerY = Number(trigger?.y) || 0
  const triggerW = Number(trigger?.width) || 0
  const triggerH = Number(trigger?.height) || 0
  const rowTop = row === undefined ? triggerY : Number(row.y) || 0
  const rowBottom = row === undefined ? triggerY + triggerH : rowTop + (Number(row.height) || 0)
  const menuW = Math.max(0, Number(size?.width) || 0)
  const menuH = Math.max(0, Number(size?.height) || 0)
  const viewW = Math.max(0, Number(viewport?.width) || 0)
  const viewH = Math.max(0, Number(viewport?.height) || 0)
  const right = triggerX + triggerW
  const rightEdge = right + margin
  let left = rightEdge
  let flipped = false
  if (menuW > 0 && rightEdge + menuW > viewW - margin) {
    // The reference opens towards the content; when that side is out of room
    // the popover flips to the trigger's left edge.
    const flippedLeft = triggerX - menuW - margin
    if (flippedLeft >= margin) {
      left = flippedLeft
      flipped = true
    } else {
      // Neither side fits at full size: keep it on screen and let max-width
      // do the shrinking.
      left = Math.max(margin, Math.min(rightEdge, viewW - menuW - margin))
    }
  }
  let top = rowTop + cornerCorrection
  let align = 'top'
  if (menuH > 0 && top + menuH > viewH - margin) {
    const flippedTop = rowBottom - menuH
    if (flippedTop >= margin) {
      top = flippedTop
      align = 'bottom'
    } else {
      // Taller than the space above the row too: stay inside the viewport; the
      // panel can only cover the trigger in this pathological case.
      top = Math.max(margin, Math.min(top, viewH - menuH - margin))
      align = 'clamped'
    }
  }
  return { left: Math.round(left), top: Math.round(top), flipped, align, cornerCorrection }
}

/**
 * Clamp one project's visible count. Every project starts at N even when its
 * stored entry is missing or malformed; a project with fewer than N rows shows
 * all of them. This is the invariant that makes "has rows but only a load-more
 * placeholder" impossible.
 * @param {number|undefined} limit - stored per-project limit.
 * @param {number} total - project row count.
 * @returns {number} visible count in [0, total], at least N when total >= N.
 */
export function chatgptProjectLimit(limit, total) {
  const available = Math.max(0, Number.isFinite(total) ? Math.floor(total) : 0)
  const current = Math.max(CHATGPT_PROJECT_INITIAL_LIMIT, Number.isFinite(limit) ? Math.floor(limit) : CHATGPT_PROJECT_INITIAL_LIMIT)
  return Math.min(current, available)
}

/**
 * One project-local page step. Only the caller's per-project entry moves;
 * 最近 and other projects are outside this function.
 * @param {number|undefined} limit - current project limit.
 * @param {number} total - project row count.
 * @returns {number} next limit, capped by this project's total.
 */
export function chatgptNextProjectLimit(limit, total) {
  const available = Math.max(0, Number.isFinite(total) ? Math.floor(total) : 0)
  const current = chatgptProjectLimit(limit, available)
  return Math.min(current + CHATGPT_PROJECT_PAGE_SIZE, available)
}

/**
 * Project-local pagination (P0-22): each project slices its own rows by its
 * own limit, so a pinned/earlier project can never consume another project's
 * first page. 最近 keeps its independent recentLimit; pinned rows are shown in
 * full (their section is outside the project pager).
 * @param {{pinned: object[], projects: object[], recent: object[]}} sections - sections.
 * @param {Record<string, number>} [projectLimits] - projectId -> visible limit.
 * @param {number} [recentLimit] - maximum 最近 rows.
 * @returns {{pinned: object[], projects: object[], recent: object[], shown: number, recentHidden: number}} paged view; each project carries total/hidden/truncated.
 */
export function chatgptPageSessionSections(sections, projectLimits = {}, recentLimit = CHATGPT_RECENT_INITIAL_LIMIT) {
  const limits = projectLimits !== null && typeof projectLimits === 'object' ? projectLimits : {}
  const pinned = sections.pinned
  const projects = sections.projects.map((project) => {
    const total = project.rows.length
    const limit = chatgptProjectLimit(limits[project.id], total)
    const rows = project.rows.slice(0, limit)
    return { ...project, rows, total, hidden: total - rows.length, truncated: rows.length < total }
  })
  const recent = sections.recent.slice(0, Math.max(0, recentLimit))
  const shown = pinned.length + projects.reduce((sum, project) => sum + project.rows.length, 0) + recent.length
  return {
    pinned,
    projects,
    recent,
    shown,
    recentHidden: Math.max(0, sections.recent.length - recent.length)
  }
}

/**
 * One 最近 page step.
 * @param {number} limit - current visible count.
 * @param {number} total - total 最近 rows.
 * @returns {number} next visible count.
 */
export function chatgptNextRecentLimit(limit, total) {
  const current = Number.isFinite(limit) ? Math.max(0, limit) : CHATGPT_RECENT_INITIAL_LIMIT
  return Math.min(Math.max(CHATGPT_RECENT_INITIAL_LIMIT, current + CHATGPT_RECENT_PAGE_SIZE), Math.max(0, total))
}
