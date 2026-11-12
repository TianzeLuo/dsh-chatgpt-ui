/**
 * dsh-chatgpt-ui — self-rendered sidebar session list (browser half fragment).
 *
 * The host's `sidebar.workspaces` single slot normally renders its own browser:
 * a workspace section header, search, pinned/workspace/flat grouping, and the
 * Host row-action slots. This fragment replaces only that occupant. The host
 * shell (brand, New Session button, drag handle, collapse control) stays mounted;
 * the shell's own New Session row is hidden by CSS, and the first row below the
 * header is this list's own 新聊天 row with the same `uiWorkspace.startSession`
 * call behind it.
 *
 * Everything the menu offers is backed by a Host service:
 *   open      uiWorkspace.openSession
 *   rename    sessions.using(...).binding.session.rename
 *   pin       workspaces.pinSession / unpinSession
 *   archive   workspaces.archiveSession
 *
 * The Host has no client method to delete a Session or attach an unaccounted
 * Session to a Workspace (`IWorkspaces` exposes insertSessionBefore only for an
 * already-accounted member). Those two menu items are therefore deliberately
 * absent rather than painted as dead controls.
 *
 * This file is a fragment: no import/export statements — scripts/build-client.mjs
 * concatenates it inside the module-loader factory.
 */

/**
 * super-agent state for the sidebar: unread count plus its internal Sessions.
 *
 * dsh-super-agent publishes `GET /api/super-agent/ui/state` for its own badge
 * (`unreadTotal`); the same read-only payload names the Sessions that are not
 * user conversations:
 *   - `routerSessionIds`  the Router Sessions it owns;
 *   - `workspaceSessions` every Session of the dedicated Super-agent workspace
 *     (the Router lives there and so do its restarts).
 * The poll only runs while the `super-agent` panel is registered, and any
 * failure (plugin absent, session expired, offline) renders no badge and no
 * filtering rather than guessing.
 * @param {boolean} enabled - whether dot's panel is registered.
 * @returns {{ unread: number, internalIds: Set<string> }} badge count and internal Session ids.
 */
function useChatgptSuperAgentState(enabled) {
  const [state, setState] = chatgptReact.useState({ unread: 0, internalIds: new Set() })
  chatgptReact.useEffect(() => {
    if (enabled !== true) {
      setState({ unread: 0, internalIds: new Set() })
      return undefined
    }
    let cancelled = false
    let timer = 0
    const read = async () => {
      try {
        const response = await fetch('/api/super-agent/ui/state', {
          credentials: 'same-origin',
          headers: { accept: 'application/json' }
        })
        if (!response.ok) throw new Error(String(response.status))
        const payload = await response.json()
        const value = Math.floor(Number(payload?.unreadTotal ?? 0))
        const internalIds = new Set()
        for (const id of [...(payload?.routerSessionIds ?? []), ...(payload?.workspaceSessions ?? [])]) {
          if (typeof id === 'string' && id !== '') internalIds.add(id)
        }
        if (!cancelled) {
          setState((current) =>
            current.unread === (Number.isFinite(value) && value > 0 ? value : 0) &&
            current.internalIds.size === internalIds.size &&
            [...internalIds].every((id) => current.internalIds.has(id))
              ? current
              : { unread: Number.isFinite(value) && value > 0 ? value : 0, internalIds }
          )
        }
      } catch {
        if (!cancelled) setState((current) => (current.unread === 0 && current.internalIds.size === 0 ? current : { unread: 0, internalIds: new Set() }))
      }
      if (!cancelled) timer = window.setTimeout(read, 4000)
    }
    void read()
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [enabled])
  return state
}

/**
 * Sidebar glyphs (P0-13). Every one is the reference's own markup, copied
 * verbatim into `lib/client/menu-icons.js` by `scripts/build-menu-icons.mjs`
 * from the read-only capture in `docs/capture/live/project-menus.json`.
 * Nothing here is drawn: the folder pair is the sprite's `folder-light-16` /
 * `folder-open-light-16` rendered at the measured 20px, the ⋯ is the sprite's
 * ellipsis at the measured 14px, and 新建会话 is the inline pen-in-square the
 * reference itself renders in that button.
 */
const CHATGPT_SESSION_ICONS = {
  // Phase 4C-1: the reference's 新聊天 is a pen-in-square, not a plus. The
  // glyph comes from the sidebar button itself (docs/capture/icons.json →
  // `compose`), re-coloured by currentColor.
  plus: chatgptRailGlyph('compose'),
  chevron: chatgptMenuGlyph('submenu'),
  folder: chatgptMenuGlyph('folderClosed'),
  folderOpen: chatgptMenuGlyph('folderOpen'),
  more: chatgptMenuGlyph('more'),
  newChat: chatgptMenuGlyph('newChat'),
  search: chatgptMenuGlyph('search'),
  close: chatgptMenuGlyph('close'),
  session: chatgptMenuGlyph('chatCount'),
  file: chatgptMenuGlyph('file')
}

/**
 * Menu glyphs (P0-13), all verbatim. The reference renders a menu's leading
 * icon at 18px when it comes from its mask-image SVG and at 16px when it comes
 * from its sprite; both numbers are the measured ones, and each body is copied
 * exactly, so a menu row cannot drift into a hand-drawn approximation.
 */
const CHATGPT_SESSION_MENU_ICONS = {
  open: chatgptMenuGlyph('open'),
  rename: chatgptMenuGlyph('rename'),
  pin: chatgptMenuGlyph('pin'),
  pinOutline: chatgptMenuGlyph('pinOutline'),
  pinSolid: chatgptMenuGlyph('pinSolid'),
  unpin: chatgptMenuGlyph('unpin'),
  archive: chatgptMenuGlyph('archive'),
  project: chatgptMenuGlyph('folderClosed'),
  folderOpen: chatgptMenuGlyph('folderOpen'),
  star: chatgptMenuGlyph('pinMark'),
  chat: chatgptMenuGlyph('chatCount'),
  path: chatgptMenuGlyph('folderPath'),
  repo: chatgptMenuGlyph('repoPath'),
  trash: chatgptMenuGlyph('trash'),
  remove: chatgptMenuGlyph('remove'),
  settings: chatgptMenuGlyph('edit'),
  edit: chatgptMenuGlyph('edit'),
  reveal: chatgptMenuGlyph('reveal'),
  back: chatgptMenuGlyph('back'),
  check: chatgptMenuGlyph('check'),
  lock: chatgptMenuGlyph('lock')
}


/** The real running indicator: a 14px arc, spun only while the Host says running. */
const CHATGPT_SESSION_SPINNER_SVG =
  '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><circle cx="8" cy="8" r="5.6" stroke-dasharray="26 9"/></svg>'

/** A stable, empty source for a slot that is mounted before a service exists. */
const CHATGPT_EMPTY_SNAPSHOT = { ids: [], byId: {}, phase: 'pending' }
const CHATGPT_EMPTY_WORKSPACES = {
  items: [],
  archivedSessionIds: [],
  pinnedSessionIds: [],
  phase: 'pending',
  state: 'idle',
  error: null
}

/**
 * A path the reference would draw with its repository glyph: `owner/name`,
 * with no directory separator and no drive letter. Anything else is a local
 * folder and gets the folder glyph.
 * @param {string} path - the workspace path.
 * @returns {boolean} true for a repository-like path.
 */
function chatgptIsRepoPath(path) {
  if (typeof path !== 'string') return false
  const trimmed = path.trim()
  if (trimmed === '') return false
  if (/^[A-Za-z]:[\\/]/.test(trimmed)) return false
  return /^[\w.-]+\/[\w.-]+$/.test(trimmed)
}

/** Read the persisted project expansion map without trusting its shape. */
function chatgptReadProjectExpansion() {
  try {
    if (typeof window === 'undefined' || window.localStorage === undefined) return {}
    const raw = window.localStorage.getItem(CHATGPT_PROJECT_EXPANSION_KEY)
    if (raw === null) return {}
    const parsed = JSON.parse(raw)
    return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

/** Persist only a map of booleans; quota/security failures are non-fatal. */
function chatgptWriteProjectExpansion(map) {
  try {
    if (typeof window === 'undefined' || window.localStorage === undefined) return
    window.localStorage.setItem(CHATGPT_PROJECT_EXPANSION_KEY, JSON.stringify(map))
  } catch {
    // The list stays usable when storage is full or disabled.
  }
}

/** Read the whole-section visibility flag; missing/broken storage means open. */
function chatgptReadProjectsVisible() {
  try {
    if (typeof window === 'undefined' || window.localStorage === undefined) return true
    return window.localStorage.getItem(CHATGPT_PROJECTS_VISIBLE_KEY) !== 'false'
  } catch {
    return true
  }
}

/** Persist only the section flag, never the per-project expansion map. */
function chatgptWriteProjectsVisible(visible) {
  try {
    if (typeof window === 'undefined' || window.localStorage === undefined) return
    window.localStorage.setItem(CHATGPT_PROJECTS_VISIBLE_KEY, visible === true ? 'true' : 'false')
  } catch {
    // The list stays usable when storage is full or disabled.
  }
}

/**
 * Read the persisted pinned-project ids (P0-19c). Storage failures degrade to
 * "nothing pinned" — the list itself still renders in the Host's order.
 * @returns {string[]} pinned Workspace ids.
 */
function chatgptReadPinnedProjectIds() {
  try {
    if (typeof window === 'undefined' || window.localStorage === undefined) return []
    return chatgptReadPinnedProjects(window.localStorage)
  } catch {
    return []
  }
}

/** Persist only the pinned-project ids; a quota/security error is non-fatal. */
function chatgptWritePinnedProjectIds(ids) {
  try {
    if (typeof window === 'undefined' || window.localStorage === undefined) return
    window.localStorage.setItem(CHATGPT_PINNED_PROJECTS_KEY, JSON.stringify(ids))
  } catch {
    // The toggle still applies for this page session.
  }
}

/**
 * One ordinary Session row, plus its hover/focus action.
 * @param {object} props - row data, selected state, and callbacks.
 * @returns {object} React element.
 */
function ChatgptSessionRow(props) {
  const { id, row, projections, selected, pinned, tabIndex, indent, projectLabel, running, onOpen, onMenu, onContextMenu, onFocus } = props
  const title = chatgptSessionTitle(row, projections)
  return chatgptH(
    'div',
    {
      className: `chatgpt-session-item${indent === true ? ' chatgpt-session-item-indented' : ''}`,
      'data-cgpt-session-row': id,
      'data-cgpt-session-pinned': pinned === true ? '' : undefined,
      'data-cgpt-running': running === true ? 'true' : undefined,
      role: 'listitem'
    },
    chatgptH(
      'button',
      {
        type: 'button',
        className: 'chatgpt-session-row',
        'data-cgpt-nav': id,
        tabIndex,
        'aria-current': selected ? 'page' : undefined,
        title,
        onClick: () => onOpen(id),
        onFocus,
        onKeyDown: (event) => {
          if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
            event.preventDefault()
            onMenu(event, event.currentTarget)
          }
        },
        onContextMenu: (event) => onContextMenu(event, id)
      },
      running === true
        ? chatgptH(
            'span',
            {
              className: 'chatgpt-session-running',
              'data-cgpt-running-spinner': '',
              'aria-hidden': 'true',
              dangerouslySetInnerHTML: { __html: CHATGPT_SESSION_SPINNER_SVG }
            }
          )
        : null,
      chatgptH('span', { className: 'chatgpt-session-title' }, title),
      projectLabel === undefined || projectLabel === '' || projectLabel === title
        ? null
        : chatgptH(
            'span',
            {
              className: 'chatgpt-session-project',
              'data-cgpt-project-tag': '',
              title: `所属项目：${projectLabel}`
            },
            projectLabel
          )
    ),
    chatgptH(
      'button',
      {
        type: 'button',
        className: 'chatgpt-session-more',
        'data-cgpt-row-more': id,
        tabIndex: -1,
        'aria-label': `会话操作：${title}`,
        'aria-haspopup': 'menu',
        onClick: (event) => {
          event.preventDefault()
          event.stopPropagation()
          onMenu(event, event.currentTarget)
        }
      },
      chatgptH('span', {
        'aria-hidden': 'true',
        dangerouslySetInnerHTML: { __html: CHATGPT_SESSION_ICONS.more }
      })
    )
  )
}

/**
 * The super-agent row's mark (Phase 4C-2).
 *
 * The reference shows "你的 Dot" with dot's own circular avatar. Copying that
 * logo is off the table, so this is the skin's own avatar-shaped mark: a 20px
 * disc with a four-point spark, which reads as "the agent" without reusing
 * dot's three dots, its colours or its proportions.
 */
const CHATGPT_SUPER_AGENT_MARK =
  '<svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true" fill="none">' +
  '<circle cx="10" cy="10" r="8.4" fill="currentColor" opacity=".16"/>' +
  '<circle cx="10" cy="10" r="8.4" stroke="currentColor" stroke-opacity=".32" stroke-width="1"/>' +
  '<path d="M10 4.9l1.42 3.68L15.1 10l-3.68 1.42L10 15.1 8.58 11.42 4.9 10l3.68-1.42z" fill="currentColor"/>' +
  '</svg>'

/**
 * One menu row. The menuitem role and roving tabindex are managed by the menu.
 * @param {object} props - label, icon, action, and ref callback.
 * @returns {object} React element.
 */
function ChatgptMenuButton(props) {
  const { label, icon, action, disabled, danger, itemRef, onActivate } = props
  return chatgptH(
    'button',
    {
      type: 'button',
      className: `chatgpt-session-menu-item${danger === true ? ' is-danger' : ''}`,
      role: 'menuitem',
      tabIndex: -1,
      'data-cgpt-menu-item': action,
      disabled,
      ref: itemRef,
      onClick: onActivate
    },
    chatgptH('span', {
      className: 'chatgpt-session-menu-icon',
      'aria-hidden': 'true',
      dangerouslySetInnerHTML: { __html: CHATGPT_SESSION_MENU_ICONS[icon] }
    }),
    chatgptH('span', { className: 'chatgpt-session-menu-label' }, label)
  )
}

/**
 * Accessible session/project action menu.
 * @param {object} props - anchor, kind, target, close and action callbacks.
 * @returns {object} React element.
 */
function ChatgptSessionMenu(props) {
  const { menu, project, pinned, firstProjectId, onClose, onAction, autoFocus, onEnter, onLeave } = props
  const menuRef = chatgptReact.useRef(null)
  const itemRefs = chatgptReact.useRef([])
  const trigger = menu.trigger
  // P0-19c: one anchoring rule for both sidebar menus — right of the trigger,
  // vertically centred, flipped inside the viewport (chatgptMenuPlacement).
  // Placed by the layout effect below, before the first paint, so the initial
  // value only has to be a harmless corner.
  const [position, setPosition] = chatgptReact.useState({ left: 8, top: 8 })
  const isProject = menu.kind === 'project'
  const projectTitle = typeof project?.title === 'string' && project.title !== '' ? project.title : '未命名项目'
  const projectPath = typeof project?.path === 'string' ? project.path : ''
  const projectChatCount = Array.isArray(project?.rows) ? project.rows.length : 0
  const labels = isProject
    ? menu.view === 'edit'
      ? [
          { separator: true },
          { action: 'back-project', label: '返回', icon: 'back' },
          { action: 'rename-project', label: '重命名项目', icon: 'rename' },
          { action: 'new-in-project', label: '在此项目中新建聊天', icon: 'project' },
          { separator: true },
          { action: 'move-project-top', label: '移到最前', icon: 'pin', disabled: menu.id === firstProjectId },
          { separator: true },
          { action: 'delete-project', label: '删除项目', icon: 'archive', danger: true }
        ]
      : [
          { separator: true },
          { action: 'edit-project', label: '编辑项目', icon: 'settings' }
        ]
    : [
        { action: 'open', label: '打开', icon: 'open' },
        { action: 'rename', label: '重命名', icon: 'rename' },
        { separator: true },
        // P0-19c: the session pin is the sprite's solid-centre variant once
        // pinned (hollow ⇄ solid), which is what distinguishes it from the
        // project menu's hollow ⇄ slash pair.
        { action: 'pin', label: pinned ? '取消置顶' : '置顶', icon: pinned ? 'pinSolid' : 'pinOutline' },
        { separator: true },
        { action: 'archive', label: '归档', icon: 'archive' }
      ]
  const itemBase = isProject ? 1 : 0

  chatgptReact.useLayoutEffect(() => {
    const node = menuRef.current
    if (node === null) return
    const box = node.getBoundingClientRect()
    if (isProject) {
      // The row-hover card is not one of the two ⋯ menus: it keeps its P0-11
      // anchor (right of the row, top aligned) so its taller surface does not
      // float up over the row above.
      const next = {
        left: Math.min(Math.max(8, menu.x ?? 8), Math.max(8, window.innerWidth - box.width - 8)),
        top: Math.min(Math.max(8, menu.y ?? 8), Math.max(8, window.innerHeight - box.height - 8))
      }
      setPosition((previous) =>
        previous.left === next.left && previous.top === next.top ? previous : { left: next.left, top: next.top }
      )
      return
    }
    const rect = trigger?.getBoundingClientRect?.()
    if (rect === undefined) return
    // P0-19e: align the panel to the row's top edge, not to the 28px ⋯ (which
    // is centred 4px below it); chatgptMenuPlacement flips to bottom alignment
    // when the panel would not fit below.
    const rowRect = trigger.closest?.('[data-cgpt-session-row]')?.getBoundingClientRect?.()
    const next = chatgptMenuPlacement(
      { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      { width: box.width, height: box.height },
      { width: window.innerWidth, height: window.innerHeight },
      rowRect === undefined || rowRect === null ? undefined : { x: rowRect.x, y: rowRect.y, width: rowRect.width, height: rowRect.height }
    )
    setPosition((previous) =>
      previous.left === next.left && previous.top === next.top ? previous : { left: next.left, top: next.top }
    )
  }, [menu, trigger, isProject])

  chatgptReact.useEffect(() => {
    if (autoFocus === false) return
    const first = itemRefs.current.find((item) => item !== null && item !== undefined)
    if (first !== undefined) window.setTimeout(() => first.focus(), 0)
  }, [autoFocus])

  chatgptReact.useEffect(() => {
    const onPointerDown = (event) => {
      if (menuRef.current?.contains(event.target)) return
      if (menu.trigger?.contains?.(event.target)) return
      onClose()
    }
    const onKey = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
      }
    }
    const close = () => onClose()
    document.addEventListener('pointerdown', onPointerDown, true)
    document.addEventListener('keydown', onKey, true)
    window.addEventListener('resize', close)
    window.addEventListener('blur', close)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true)
      document.removeEventListener('keydown', onKey, true)
      window.removeEventListener('resize', close)
      window.removeEventListener('blur', close)
    }
  }, [menu, onClose])

  const moveFocus = (delta) => {
    const items = itemRefs.current.filter((item) => item !== null && item !== undefined && !item.disabled)
    if (items.length === 0) return
    const current = items.indexOf(document.activeElement)
    const next = (current + delta + items.length) % items.length
    items[next].focus()
  }

  return chatgptH(
    'div',
    {
      className: 'chatgpt-session-menu',
      'data-cgpt-session-menu': menu.kind,
      role: 'menu',
      'aria-label': isProject ? '项目操作' : '会话操作',
      ref: menuRef,
      style: { left: `${position.left}px`, top: `${position.top}px` },
      onMouseEnter: () => onEnter?.(),
      onMouseLeave: () => onLeave?.(),
      onKeyDown: (event) => {
        if (event.key === 'ArrowDown') {
          event.preventDefault()
          moveFocus(1)
        } else if (event.key === 'ArrowUp') {
          event.preventDefault()
          moveFocus(-1)
        } else if (event.key === 'Home') {
          event.preventDefault()
          itemRefs.current.find((item) => item !== null && item !== undefined && !item.disabled)?.focus()
        } else if (event.key === 'End') {
          event.preventDefault()
          const items = itemRefs.current.filter((item) => item !== null && item !== undefined && !item.disabled)
          items[items.length - 1]?.focus()
        } else if (event.key === 'Tab') {
          event.preventDefault()
          onClose()
        }
      }
    },
    isProject
      ? chatgptH(
          'div',
          { className: 'chatgpt-project-menu-card', role: 'presentation', key: 'project-card' },
          chatgptH('span', {
            className: 'chatgpt-project-menu-icon',
            'aria-hidden': 'true',
            dangerouslySetInnerHTML: { __html: CHATGPT_SESSION_MENU_ICONS.folderOpen }
          }),
          chatgptH('span', { className: 'chatgpt-project-menu-title' }, projectTitle),
          chatgptH('span', {
            className: 'chatgpt-project-menu-star',
            'aria-hidden': 'true',
            title: '收藏',
            dangerouslySetInnerHTML: { __html: CHATGPT_SESSION_MENU_ICONS.star }
          })
        )
      : null,
    isProject
      ? chatgptH(
          'div',
          { className: 'chatgpt-project-menu-meta', role: 'presentation', key: 'project-meta' },
          chatgptH('span', {
            className: 'chatgpt-project-menu-meta-icon',
            'aria-hidden': 'true',
            dangerouslySetInnerHTML: { __html: CHATGPT_SESSION_MENU_ICONS.chat }
          }),
          `${projectChatCount} 次聊天`
        )
      : null,
    isProject
      ? chatgptH('div', { className: 'chatgpt-session-menu-separator', role: 'separator', key: 'project-meta-separator' })
      : null,
    isProject
      ? chatgptH(
          'button',
          {
            type: 'button',
            className: 'chatgpt-project-menu-path',
            'data-cgpt-project-path': '',
            role: 'menuitem',
            tabIndex: -1,
            ref: (node) => {
              itemRefs.current[0] = node
            },
            title: projectPath === '' ? '未关联路径' : `打开项目：${projectPath}`,
            disabled: projectPath === '',
            onClick: () => onAction('open-project')
          },
          chatgptH('span', {
            className: 'chatgpt-project-menu-path-icon',
            'aria-hidden': 'true',
            // P0-13: the reference's card shows a repository glyph for a
            // `owner/name` path and a folder glyph for a local path.
            'data-cgpt-project-path-kind': chatgptIsRepoPath(projectPath) ? 'repo' : 'folder',
            dangerouslySetInnerHTML: {
              __html: chatgptIsRepoPath(projectPath) ? CHATGPT_SESSION_MENU_ICONS.repo : CHATGPT_SESSION_MENU_ICONS.path
            }
          }),
          chatgptH('span', { className: 'chatgpt-project-menu-path-text' }, projectPath === '' ? '未关联路径' : projectPath)
        )
      : null,
    labels.map((entry, index) =>
      entry.separator === true
        ? chatgptH('div', { className: 'chatgpt-session-menu-separator', role: 'separator', key: `sep-${index}` })
        : chatgptH(ChatgptMenuButton, {
            key: entry.action,
            label: entry.label,
            icon: entry.icon,
            action: entry.action,
            disabled: entry.disabled === true,
            danger: entry.danger === true,
            itemRef: (node) => {
              itemRefs.current[itemBase + index] = node
            },
            onActivate: () => onAction(entry.action)
          })
    )
  )
}

/**
 * The project row's ⋯ action menu (P0-10A; anchor moved in P0-11).
 *
 * It is deliberately NOT a context menu: a click on ⋯ opens it, it sits to the
 * RIGHT of the button and is vertically centred on it (P0-19c). The row-hover
 * card is a separate `ChatgptSessionMenu` (`data-cgpt-session-menu='project'`);
 * this menu is `project-hover` for evidence compatibility. Every entry is
 * either backed by a Host call or rendered disabled with a reason:
 *
 *   置顶 / 取消置顶    the skin's own persisted flag                 two-way
 *   编辑               workspaces.rename via the shared dialog
 *   在资源管理器中打开  remote.session.openWorkspacePath({reveal})    disabled without path/API
 *   归档聊天           workspaces.archiveSession per project chat     disabled with zero chats
 *   移除项目           the shared delete confirmation
 *
 * P0-19c removed the 分区 entry: DSH has no project-section model, so the row
 * was a dead disabled item (and the reference has no such row either).
 *
 * @param {object} props - project, pinned state, disabled facts and callbacks.
 * @returns {object} React element.
 */
function ChatgptProjectHoverMenu(props) {
  const { menu, project, pinned, disabled, onClose, onAction } = props
  const menuRef = chatgptReact.useRef(null)
  const itemRefs = chatgptReact.useRef([])
  const trigger = menu.trigger
  // Placed by the layout effect below, before the first paint, so the initial
  // value only has to be a harmless corner.
  const [position, setPosition] = chatgptReact.useState({ left: 8, top: 8 })

  chatgptReact.useLayoutEffect(() => {
    const node = menuRef.current
    if (node === null) return
    const rect = trigger?.getBoundingClientRect?.()
    if (rect === undefined) return
    const box = node.getBoundingClientRect()
    // P0-19e: same row-top / bottom-flip rule as the session ⋯ menu.
    const rowRect = trigger.closest?.('[data-cgpt-project-head]')?.getBoundingClientRect?.()
    const next = chatgptMenuPlacement(
      { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      { width: box.width, height: box.height },
      { width: window.innerWidth, height: window.innerHeight },
      rowRect === undefined || rowRect === null ? undefined : { x: rowRect.x, y: rowRect.y, width: rowRect.width, height: rowRect.height }
    )
    setPosition((previous) =>
      previous.left === next.left && previous.top === next.top ? previous : { left: next.left, top: next.top }
    )
  }, [menu, trigger])

  chatgptReact.useEffect(() => {
    if (menu.focus === true) {
      const first = itemRefs.current.find((item) => item !== null && item !== undefined && !item.disabled)
      if (first !== undefined) window.setTimeout(() => first.focus(), 0)
    }
    const onPointerDown = (event) => {
      if (menuRef.current?.contains(event.target)) return
      if (menu.trigger?.contains?.(event.target)) return
      onClose()
    }
    const onKey = (event) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      onClose()
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    document.addEventListener('keydown', onKey, true)
    window.addEventListener('resize', onClose)
    window.addEventListener('blur', onClose)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true)
      document.removeEventListener('keydown', onKey, true)
      window.removeEventListener('resize', onClose)
      window.removeEventListener('blur', onClose)
    }
  }, [menu, onClose])

  const items = [
    // Two-way 置顶: the label and the glyph both flip with the persisted flag.
    // The pinned glyph is the attachment's pin-with-slash (sprite verbatim).
    { action: 'pin-project', label: pinned === true ? '取消置顶' : '置顶', icon: pinned === true ? 'unpin' : 'pinOutline', pinned: pinned === true },
    { action: 'edit-project', label: '编辑', icon: 'edit' },
    { separator: true },
    { action: 'reveal-project', label: '在资源管理器中打开', icon: 'reveal', disabled: disabled.path === true, reason: '当前环境没有可用的资源管理器入口' },
    { separator: true },
    { action: 'archive-project-chats', label: '归档聊天', icon: 'archive', disabled: disabled.chats === true, reason: '项目里没有可归档的会话' },
    { separator: true },
    { action: 'remove-project', label: '移除项目', icon: 'remove', danger: true }
  ]

  const moveFocus = (delta) => {
    const buttons = itemRefs.current.filter((item) => item !== null && item !== undefined && !item.disabled)
    if (buttons.length === 0) return
    const current = buttons.indexOf(document.activeElement)
    buttons[(current + delta + buttons.length) % buttons.length].focus()
  }

  return chatgptH(
    'div',
    {
      ref: menuRef,
      className: 'chatgpt-session-menu chatgpt-project-hover-menu',
      'data-cgpt-session-menu': 'project-hover',
      'data-cgpt-project-menu': menu.id,
      role: 'menu',
      'aria-label': `项目操作：${project?.title ?? ''}`,
      style: { left: `${position.left}px`, top: `${position.top}px` },
      onMouseEnter: () => menu.onEnter?.(),
      onMouseLeave: () => menu.onLeave?.(),
      onKeyDown: (event) => {
        if (event.key === 'ArrowDown') {
          event.preventDefault()
          moveFocus(1)
        } else if (event.key === 'ArrowUp') {
          event.preventDefault()
          moveFocus(-1)
        } else if (event.key === 'Home') {
          event.preventDefault()
          itemRefs.current.find((item) => item !== null && item !== undefined && !item.disabled)?.focus()
        } else if (event.key === 'End') {
          event.preventDefault()
          const buttons = itemRefs.current.filter((item) => item !== null && item !== undefined && !item.disabled)
          buttons[buttons.length - 1]?.focus()
        } else if (event.key === 'Tab') {
          event.preventDefault()
          onClose()
        }
      }
    },
    items.map((entry, index) =>
      entry.separator === true
        ? chatgptH('div', { className: 'chatgpt-session-menu-separator', role: 'separator', key: `sep-${index}` })
        : chatgptH(
            'button',
            {
              key: entry.action,
              type: 'button',
              className: `chatgpt-session-menu-item${entry.danger === true ? ' is-danger' : ''}${entry.disabled === true ? ' is-disabled' : ''}`,
              role: 'menuitem',
              tabIndex: -1,
              'data-cgpt-project-menu-item': entry.action,
              'data-cgpt-menu-pinned': entry.pinned === true ? 'true' : undefined,
              'aria-disabled': entry.disabled === true ? 'true' : undefined,
              'aria-haspopup': entry.submenu === true ? 'menu' : undefined,
              disabled: entry.disabled === true,
              title: entry.disabled === true ? entry.reason : undefined,
              ref: (node) => {
                itemRefs.current[index] = node
              },
              onClick: () => {
                if (entry.disabled === true) return
                onAction(entry.action)
              }
            },
            chatgptH('span', {
              className: 'chatgpt-session-menu-icon',
              'aria-hidden': 'true',
              dangerouslySetInnerHTML: { __html: CHATGPT_SESSION_MENU_ICONS[entry.icon] ?? '' }
            }),
            chatgptH('span', { className: 'chatgpt-session-menu-label' }, entry.label),
            entry.submenu === true
              ? chatgptH('span', {
                  className: 'chatgpt-session-menu-trailing',
                  'aria-hidden': 'true',
                  dangerouslySetInnerHTML: { __html: CHATGPT_SESSION_ICONS.chevron }
                })
              : null
          )
    )
  )
}

/**
 * Modal rename dialog for a Session or a project.
 * @param {object} props - initial title, error, close and submit callbacks.
 * @returns {object} React element.
 */
function ChatgptRenameDialog(props) {
  const { dialog, onClose, onSubmit } = props
  const [value, setValue] = chatgptReact.useState(dialog.title)
  const [error, setError] = chatgptReact.useState('')
  const [busy, setBusy] = chatgptReact.useState(false)
  const inputRef = chatgptReact.useRef(null)
  const isProject = dialog.kind === 'project'

  chatgptReact.useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  const submit = async (event) => {
    event.preventDefault()
    const title = value.trim()
    if (title === '') {
      setError('名称不能为空')
      inputRef.current?.focus()
      return
    }
    setBusy(true)
    setError('')
    try {
      await onSubmit(title)
      onClose()
    } catch (reason) {
      setError(reason instanceof Error && reason.message !== '' ? reason.message : '重命名失败')
      setBusy(false)
    }
  }

  return chatgptH(
    'div',
    {
      className: 'chatgpt-session-dialog-backdrop',
      onMouseDown: (event) => {
        if (event.target === event.currentTarget) onClose()
      }
    },
    chatgptH(
      'form',
      {
        className: 'chatgpt-session-dialog',
        role: 'dialog',
        'aria-modal': 'true',
        'aria-labelledby': 'chatgpt-session-dialog-title',
        onSubmit: submit,
        onKeyDown: (event) => {
          if (event.key === 'Escape') {
            event.preventDefault()
            onClose()
          }
        }
      },
      chatgptH('h2', { id: 'chatgpt-session-dialog-title', className: 'chatgpt-session-dialog-title' }, isProject ? '重命名项目' : '重命名会话'),
      chatgptH('label', { className: 'chatgpt-session-dialog-label', htmlFor: 'chatgpt-session-dialog-input' }, '名称'),
      chatgptH('input', {
        id: 'chatgpt-session-dialog-input',
        ref: inputRef,
        className: 'chatgpt-session-dialog-input',
        value,
        maxLength: 200,
        onChange: (event) => setValue(event.target.value),
        'aria-invalid': error !== '' ? 'true' : undefined,
        'aria-describedby': error !== '' ? 'chatgpt-session-dialog-error' : undefined
      }),
      error === ''
        ? null
        : chatgptH('p', { id: 'chatgpt-session-dialog-error', className: 'chatgpt-session-dialog-error', role: 'alert' }, error),
      chatgptH(
        'div',
        { className: 'chatgpt-session-dialog-actions' },
        chatgptH('button', { type: 'button', className: 'chatgpt-session-dialog-button', onClick: onClose, disabled: busy }, '取消'),
        chatgptH('button', { type: 'submit', className: 'chatgpt-session-dialog-button chatgpt-session-dialog-primary', disabled: busy }, busy ? '保存中…' : '保存')
      )
    )
  )
}

/**
 * Global search surface (Module 7). It is still a sidebar-owned component, but
 * it paints a fixed 720px floating dialog so the result groups can use the
 * conversation width instead of the 288px sidebar.
 *
 * Data boundaries:
 *   - sessions: Host `sessions.search` (message content); if that transport is
 *     unavailable, the already-loaded titles are matched and the fallback is
 *     stated in the panel.
 *   - projects: Host `workspaces.list` snapshot.
 *   - files: Host `workspaceFiles.list` for the current Session's workspace,
 *     capped and read-only.
 *
 * Keyboard: ↑/↓ move the active row, Enter opens it, Esc closes and the caller
 * restores focus to the composer. The initial state is the recent Session list,
 * mirroring the reference's useful empty query.
 */
function ChatgptSessionSearch(props) {
  const { ctx, onClose, onOpen, titleOf, localSessions, sessionList, workspaceList } = props
  const [query, setQuery] = chatgptReact.useState('')
  const [status, setStatus] = chatgptReact.useState('idle')
  const [sessions, setSessions] = chatgptReact.useState([])
  const [projects, setProjects] = chatgptReact.useState([])
  const [files, setFiles] = chatgptReact.useState([])
  const [fileNote, setFileNote] = chatgptReact.useState('')
  const [fallback, setFallback] = chatgptReact.useState(false)
  const [filter, setFilter] = chatgptReact.useState('all')
  const [active, setActive] = chatgptReact.useState(0)
  const inputRef = chatgptReact.useRef(null)
  const listRef = chatgptReact.useRef(null)

  // The dialog controls the whole layer: Esc closes even when focus has moved
  // from the query input to a tab or a result row.
  chatgptReact.useEffect(() => {
    const onEscape = (event) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return
      event.preventDefault()
      onClose()
    }
    document.addEventListener('keydown', onEscape, true)
    return () => document.removeEventListener('keydown', onEscape, true)
  }, [onClose])

  const recentRows = chatgptReact.useMemo(() => {
    return Object.values(localSessions ?? {})
      .filter((row) => row && row.blank !== true && row.origin !== 'subagent')
      .sort((a, b) => (Date.parse(b.updatedAt ?? '') || 0) - (Date.parse(a.updatedAt ?? '') || 0))
      .slice(0, 8)
  }, [localSessions])

  const currentMain = chatgptCurrentMainId(sessionList ?? {})
  const currentRow = sessionList?.byId?.[currentMain]
  const currentWorkspace = (workspaceList?.items ?? []).find((workspace) =>
    Array.isArray(workspace.sessionIds) && workspace.sessionIds.includes(currentMain)
  )
  const searchRoot = currentWorkspace?.path ?? currentRow?.cwd ?? ''
  const authorizingSession =
    currentWorkspace?.sessionIds?.find((id) => sessionList?.byId?.[id]?.blank !== true) ??
    (currentRow?.blank === true ? undefined : currentMain)

  chatgptReact.useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  chatgptReact.useEffect(() => {
    setActive(0)
  }, [query, filter])

  chatgptReact.useEffect(() => {
    const text = query.trim()
    if (text === '') {
      setStatus('idle')
      setSessions(recentRows.map((row) => ({ sessionId: row.id, snippet: '' })))
      setProjects([])
      setFiles([])
      setFileNote('')
      setFallback(false)
      return undefined
    }

    let cancelled = false
    const controller = new AbortController()
    setStatus('loading')
    setFallback(false)
    setFileNote('')
    setProjects([])
    setFiles([])
    const timer = window.setTimeout(async () => {
      const localMatches = Object.values(localSessions ?? {})
        .filter((row) => row && row.blank !== true && titleOf(row.id).toLowerCase().includes(text.toLowerCase()))
        .map((row) => ({ sessionId: row.id, snippet: '' }))

      let nextSessions = []
      let nextFallback = false
      try {
        if (typeof ctx.sessions?.search === 'function') {
          const result = await ctx.sessions.search(text, controller.signal)
          if (cancelled || controller.signal.aborted) return
          if (result?.ok === true) {
            nextSessions = Array.isArray(result.value?.items) ? result.value.items : []
          } else {
            nextSessions = localMatches
            nextFallback = true
          }
        } else {
          nextSessions = localMatches
          nextFallback = true
        }
      } catch {
        if (cancelled || controller.signal.aborted) return
        nextSessions = localMatches
        nextFallback = true
      }
      if (cancelled || controller.signal.aborted) return
      setSessions(nextSessions)
      setFallback(nextFallback)

      const needle = text.toLowerCase()
      const nextProjects = (workspaceList?.items ?? [])
        .filter((workspace) => {
          const haystack = `${workspace.title ?? ''} ${workspace.path ?? ''}`.toLowerCase()
          return haystack.includes(needle)
        })
        .slice(0, 6)
        .map((workspace) => ({
          workspaceId: workspace.workspaceId,
          title: workspace.title || workspace.path?.split(/[\\/]/u).filter(Boolean).at(-1) || '未命名项目',
          path: workspace.path ?? '',
          count: Array.isArray(workspace.sessionIds) ? workspace.sessionIds.length : 0
        }))
      setProjects(nextProjects)

      if (searchRoot === '' || authorizingSession === undefined || ctx.remote?.workspaceFiles?.list === undefined) {
        setFileNote(searchRoot === '' ? '当前会话没有工作区，文件搜索不可用' : '当前会话尚未打开工作区')
        setStatus('ready')
        return
      }

      try {
        const found = []
        const queue = ['']
        const seen = new Set()
        while (queue.length > 0 && found.length < 120 && !cancelled) {
          const directory = queue.shift()
          if (seen.has(directory)) continue
          seen.add(directory)
          const requestPath = directory === '' ? searchRoot : chatgptJoinProjectPath(searchRoot, directory)
          const result = await chatgptWithTimeout(ctx.remote.workspaceFiles.list(authorizingSession, requestPath))
          if (cancelled) return
          if (result?.ok !== true) throw new Error(result?.error?.message ?? '无法读取工作区文件')
          const listedPath = chatgptProjectRelativePath(searchRoot, result.value?.path ?? '')
          for (const entry of result.value?.entries ?? []) {
            const relative = listedPath === '' ? entry.name : `${listedPath}/${entry.name}`
            if (entry.type === 'directory') {
              if (!CHATGPT_PROJECT_SKIPPED_DIRS.has(entry.name) && seen.size < 80) queue.push(relative)
              continue
            }
            if (entry.type !== 'file') continue
            if (!relative.toLowerCase().includes(needle)) continue
            found.push({
              name: entry.name,
              path: relative,
              absolute: chatgptJoinProjectPath(searchRoot, relative),
              sessionId: authorizingSession
            })
            if (found.length >= 8) break
          }
        }
        if (cancelled) return
        setFiles(found)
        setFileNote(found.length === 0 ? '当前项目没有匹配的文件' : '')
      } catch (reason) {
        if (cancelled) return
        setFiles([])
        setFileNote(reason instanceof Error && reason.message !== '' ? reason.message : '文件搜索暂不可用')
      }
      if (!cancelled) setStatus('ready')
    }, 180)

    return () => {
      cancelled = true
      controller.abort()
      window.clearTimeout(timer)
    }
  }, [authorizingSession, ctx, localSessions, query, recentRows, searchRoot, workspaceList])

  const sessionRows = sessions.map((item) => ({
    kind: 'session',
    key: `session:${item.sessionId}`,
    id: item.sessionId,
    title: titleOf(item.sessionId),
    snippet: typeof item.snippet === 'string' ? item.snippet : ''
  }))
  const projectRows = projects.map((item) => ({
    kind: 'project',
    key: `project:${item.workspaceId}`,
    id: item.workspaceId,
    title: item.title,
    meta: `${item.count} 个会话 · ${item.path}`
  }))
  const fileRows = files.map((item) => ({
    kind: 'file',
    key: `file:${item.path}`,
    id: item.path,
    title: item.name,
    meta: item.path,
    absolute: item.absolute,
    sessionId: item.sessionId
  }))

  const groups = []
  if (filter === 'all' || filter === 'sessions') {
    if (sessionRows.length > 0) groups.push({ kind: 'sessions', title: query.trim() === '' ? '最近会话' : '会话', rows: sessionRows })
  }
  if (query.trim() !== '' && (filter === 'all' || filter === 'projects') && projectRows.length > 0) {
    groups.push({ kind: 'projects', title: '项目', rows: projectRows })
  }
  if (query.trim() !== '' && (filter === 'all' || filter === 'files') && fileRows.length > 0) {
    groups.push({ kind: 'files', title: '文件', rows: fileRows })
  }
  const flat = groups.flatMap((group) => group.rows)
  const selected = flat.length === 0 ? -1 : Math.min(active, flat.length - 1)

  const activate = (row) => {
    if (row === undefined) return
    if (row.kind === 'session') {
      onOpen(row.id)
      return
    }
    if (row.kind === 'project') {
      chatgptOpenProjectPage(row.id)
      onClose()
      return
    }
    if (row.kind === 'file') {
      try {
        if (ctx.sidebarRight?.openResource !== undefined && row.absolute !== undefined) {
          ctx.sidebarRight.openResource(chatgptFileAddress(row.sessionId, row.absolute))
        } else {
          chatgptOpenProjectPage(currentWorkspace?.workspaceId ?? '')
        }
      } catch {
        // The result stays visible; the Host preview owns its own error path.
      }
      onClose()
    }
  }

  const onKeyDown = (event) => {
    if (event.isComposing === true) return
    if (event.key === 'Escape') {
      event.preventDefault()
      onClose()
      return
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      if (flat.length === 0) return
      const delta = event.key === 'ArrowDown' ? 1 : -1
      setActive((current) => (Math.min(current, flat.length - 1) + delta + flat.length) % flat.length)
      return
    }
    if (event.key === 'Enter') {
      event.preventDefault()
      activate(flat[selected])
    }
  }

  chatgptReact.useEffect(() => {
    const node = listRef.current?.querySelector('[data-cgpt-search-row][data-active="true"]')
    node?.scrollIntoView?.({ block: 'nearest' })
  }, [selected])

  const tab = (id, label, count) =>
    chatgptH(
      'button',
      {
        type: 'button',
        role: 'tab',
        'aria-selected': filter === id ? 'true' : 'false',
        className: `chatgpt-search-tab${filter === id ? ' is-active' : ''}`,
        onClick: () => setFilter(id)
      },
      label,
      count === undefined ? null : chatgptH('span', { className: 'chatgpt-search-tab-count' }, String(count))
    )

  return chatgptH(
    'div',
    {
      className: 'chatgpt-search-layer',
      onMouseDown: (event) => {
        if (event.target === event.currentTarget) onClose()
      }
    },
    chatgptH(
      'div',
      {
        className: 'chatgpt-session-search chatgpt-search-modal',
        role: 'dialog',
        'aria-modal': 'true',
        'aria-label': '搜索聊天、项目和文件'
      },
      chatgptH(
        'div',
        { className: 'chatgpt-search-head' },
        chatgptH('span', {
          className: 'chatgpt-search-icon',
          'aria-hidden': 'true',
          dangerouslySetInnerHTML: { __html: CHATGPT_SESSION_ICONS.search }
        }),
        chatgptH('input', {
          ref: inputRef,
          className: 'chatgpt-search-input',
          type: 'search',
          value: query,
          placeholder: '搜索聊天、项目和文件',
          'aria-label': '搜索聊天、项目和文件',
          onChange: (event) => setQuery(event.target.value),
          onKeyDown
        }),
        query === ''
          ? null
          : chatgptH(
              'button',
              {
                type: 'button',
                className: 'chatgpt-search-clear',
                onClick: () => {
                  setQuery('')
                  inputRef.current?.focus()
                }
              },
              '清除'
            ),
        chatgptH(
          'button',
          { type: 'button', className: 'chatgpt-search-close', 'aria-label': '关闭搜索', onClick: onClose },
          chatgptH('span', { 'aria-hidden': 'true', dangerouslySetInnerHTML: { __html: CHATGPT_SESSION_ICONS.close } })
        )
      ),
      chatgptH(
        'div',
        { className: 'chatgpt-search-tabs', role: 'tablist', 'aria-label': '搜索结果类型' },
        tab('all', '全部'),
        tab('sessions', '会话', sessionRows.length),
        tab('projects', '项目', projectRows.length),
        tab('files', '文件', fileRows.length)
      ),
      chatgptH(
        'div',
        {
          className: 'chatgpt-search-body',
          ref: listRef,
          role: 'listbox',
          'aria-label': '搜索结果',
          'aria-busy': status === 'loading' ? 'true' : undefined,
          'aria-activedescendant': selected < 0 ? undefined : `chatgpt-search-option-${selected}`
        },
        status === 'loading'
          ? chatgptH(
              'div',
              { className: 'chatgpt-search-skeleton', role: 'status' },
              chatgptH('span', { className: 'chatgpt-search-skeleton-row' }),
              chatgptH('span', { className: 'chatgpt-search-skeleton-row is-short' }),
              chatgptH('span', { className: 'chatgpt-search-skeleton-row' })
            )
          : null,
        fallback && status === 'ready'
          ? chatgptH('p', { className: 'chatgpt-search-note chatgpt-search-note-fallback' }, '宿主内容搜索暂不可用，当前显示本地标题匹配')
          : null,
        (status === 'idle' || status === 'ready') && flat.length === 0
          ? chatgptH(
              'div',
              { className: 'chatgpt-search-empty', role: 'status' },
              chatgptH(
                'strong',
                null,
                query.trim() === ''
                  ? filter === 'all' || filter === 'sessions'
                    ? '最近还没有会话'
                    : `还没有可搜索的${filter === 'projects' ? '项目' : '文件'}`
                  : '没有找到匹配结果'
              ),
              chatgptH(
                'span',
                null,
                query.trim() === ''
                  ? filter === 'all' || filter === 'sessions'
                    ? '输入关键词搜索聊天、项目和文件'
                    : '输入关键词后按类型筛选'
                  : filter === 'files'
                    ? fileNote || '试试其他关键词或切换类型'
                    : '试试其他关键词，或切换上方类型'
              )
            )
          : null,
        groups.map((group) =>
          chatgptH(
            'section',
            { className: 'chatgpt-search-group', key: group.kind, 'aria-label': group.title },
            chatgptH('h3', { className: 'chatgpt-search-group-title' }, group.title),
            group.rows.map((row) =>
              chatgptH(
                'button',
                {
                  key: row.key,
                  id: `chatgpt-search-option-${flat.indexOf(row)}`,
                  type: 'button',
                  role: 'option',
                  'aria-selected': flat.indexOf(row) === selected ? 'true' : 'false',
                  'data-cgpt-search-row': '',
                  'data-kind': row.kind,
                  'data-active': flat.indexOf(row) === selected ? 'true' : 'false',
                  className: `chatgpt-search-row${flat.indexOf(row) === selected ? ' is-active' : ''}`,
                  onMouseEnter: () => setActive(flat.indexOf(row)),
                  onClick: () => activate(row)
                },
                chatgptH('span', {
                  className: 'chatgpt-search-row-icon',
                  'aria-hidden': 'true',
                  dangerouslySetInnerHTML: {
                    __html:
                      row.kind === 'project'
                        ? CHATGPT_SESSION_ICONS.folder
                        : row.kind === 'file'
                          ? CHATGPT_SESSION_ICONS.file
                          : CHATGPT_SESSION_ICONS.session
                  }
                }),
                chatgptH('span', { className: 'chatgpt-search-row-main' },
                  chatgptH('span', { className: 'chatgpt-search-row-title' }, row.title),
                  row.snippet === '' ? null : chatgptH('span', { className: 'chatgpt-search-row-snippet' }, row.snippet)
                ),
                row.meta === undefined ? null : chatgptH('span', { className: 'chatgpt-search-row-meta' }, row.meta)
              )
            )
          )
        ),
        filter === 'files' && status === 'ready' && fileNote !== '' && fileRows.length > 0
          ? chatgptH('p', { className: 'chatgpt-search-note' }, fileNote)
          : null
      ),
      chatgptH(
        'div',
        { className: 'chatgpt-search-foot' },
        chatgptH('span', null, '↑↓ 选择 · Enter 打开 · Esc 关闭'),
        chatgptH('span', null, '⌘K / Ctrl+K')
      )
    )
  )
}

/**
 * The sidebar list itself.
 * @param {object} props - slot owner props (`wide`) plus ctx.
 * @returns {object} React element.
 */
function ChatgptSessionList(props) {
  const { ctx, useSessions, useWorkspaces, useSessionStatus } = props
  // The Host's global hooks are the supported reactive read face: they attach
  // the subscription that drives the list phase. Direct snapshots are only a
  // last-resort fallback on a Host that did not bind the hooks.
  const sessionList =
    typeof useSessions === 'function' ? useSessions((state) => state) : ctx.sessions?.list?.getSnapshot?.() ?? CHATGPT_EMPTY_SNAPSHOT
  const workspaceList =
    typeof useWorkspaces === 'function'
      ? useWorkspaces((state) => state)
      : ctx.workspaces?.list?.getSnapshot?.() ?? CHATGPT_EMPTY_WORKSPACES
  // Host-owned running facts (SessionStatus.running), never a plugin timer.
  // The standard global hook is the only source; a host that omits it also
  // omits the indicator instead of painting a decorative spinner.
  const sessionStatuses =
    typeof useSessionStatus === 'function' ? useSessionStatus((statuses) => statuses) : undefined
  const isRunning = (id) =>
    sessionStatuses?.get?.(id)?.running === true || sessionList.byId?.[id]?.running === true
  const dotAvailable = chatgptMainPanelKeys(ctx).has(DOT_PANEL_ID)
  const dotState = useChatgptSuperAgentState(dotAvailable)
  // super-agent's Router and worker Sessions are internal conversations: they
  // never belong in 最近 or in a project group. The filter is the plugin's own
  // marker (see chatgptIsInternalSession): its public state names the Router ids
  // and its dedicated workspace, and its workers carry the title prefix.
  // P0-19c: project 置顶 is the skin's two-way persisted flag (the Host has no
  // project pin API that can be undone), so the order is derived here: pinned
  // projects first, the Host's own order inside each group.
  const [pinnedProjects, setPinnedProjects] = chatgptReact.useState(() => chatgptReadPinnedProjectIds())
  const baseSections = chatgptBuildSessionSections(sessionList, workspaceList, {
    internalSessionIds: dotState.internalIds
  })
  const sections = {
    ...baseSections,
    projects: chatgptSortProjectsByPin(baseSections.projects, pinnedProjects)
  }
  const pinnedProjectIds = new Set(pinnedProjects)
  // P0-19f: the 项目 section and its membership are mode-independent. Chat and
  // Work show the same heading, groups, rows, order, pin and expansion state;
  // switching modes must not mount/unmount or reorder the section. Chat rows now
  // stay in their Workspace group in both modes (P0-17's exclusion is retired).
  const dotUnread = dotState.unread
  const projectIds = sections.projects.map((project) => project.id)
  const projectIdsKey = projectIds.join('\u0000')
  const [expanded, setExpanded] = chatgptReact.useState(() => chatgptReadProjectExpansion())
  const normalizedExpanded = chatgptReact.useMemo(
    () => chatgptNormalizeProjectExpansion(expanded, projectIds),
    [expanded, projectIdsKey]
  )
  // The heading collapses the whole 项目 list; each project keeps its own
  // persisted expansion. These are deliberately two separate stores.
  const [projectsVisible, setProjectsVisible] = chatgptReact.useState(() => chatgptReadProjectsVisible())
  // P0-22: project pagination is keyed by project id, never one shared cursor.
  // Collapsing/re-expanding keeps the user's last count while this list stays
  // mounted; a reload starts every project at N again (state is not persisted).
  const [projectLimits, setProjectLimits] = chatgptReact.useState({})
  const [recentLimit, setRecentLimit] = chatgptReact.useState(CHATGPT_RECENT_INITIAL_LIMIT)
  const [focusId, setFocusId] = chatgptReact.useState(undefined)
  const [menu, setMenu] = chatgptReact.useState(null)
  const [projectMenu, setProjectMenu] = chatgptReact.useState(null)
  const projectMenuTimer = chatgptReact.useRef(0)
  // P0-11: row hover opens the reference's project card (name / star / chats /
  // path / 编辑项目). The ⋯ button opens the separate six-entry action menu.
  const [projectCard, setProjectCard] = chatgptReact.useState(null)
  const projectCardTimer = chatgptReact.useRef(0)
  const [dialog, setDialog] = chatgptReact.useState(null)
  const [toast, setToast] = chatgptReact.useState(null)
  const [searchOpen, setSearchOpen] = chatgptReact.useState(false)
  const rootRef = chatgptReact.useRef(null)
  const searchReturnRef = chatgptReact.useRef(null)
  const page = chatgptPageSessionSections(sections, projectLimits, recentLimit)
  const searchRows = Object.fromEntries(
    [...sections.pinned, ...sections.projects.flatMap((project) => project.rows), ...sections.recent].map((entry) => [
      entry.id,
      entry.row ?? { id: entry.id }
    ])
  )
  // A Session can appear in both 项目 and 最近. Keep one tab stop: the primary
  // project/pinned occurrence when it is actually rendered; otherwise the
  // 最近 occurrence takes over (for example, a collapsed project).
  const primaryRowIds = new Set(
    [
      ...page.pinned,
      ...page.projects
        .filter((project) => normalizedExpanded[project.id] !== false)
        .flatMap((project) => project.rows)
    ].map((entry) => entry.id)
  )
  const currentMain = chatgptCurrentMainId(sessionList)
  const activeId = focusId ?? currentMain ?? '__new__'
  const titleOf = (id) => chatgptSessionTitle(sessionList.byId?.[id], sessionList.projectionsBySession?.[id]?.values)

  // The Host can restore a Session list before its turn-outline projections.
  // Untitled rows would then all fall back to 新会话, so ask for the outline of
  // each visible untitled row once; the first durable prompt becomes its label.
  const projectionRefreshRef = chatgptReact.useRef(new Set())
  chatgptReact.useEffect(() => {
    const visibleRows = [
      ...sections.pinned,
      ...sections.recent,
      ...sections.projects.flatMap((project) => project.rows)
    ]
    const byId = new Map(visibleRows.map((entry) => [entry.id, entry.row]))
    for (const [id, row] of byId) {
      if (row === undefined || row.blank === true) continue
      if (typeof row.title === 'string' && row.title.trim() !== '' && row.title.trim() !== '新会话') continue
      const projections = sessionList.projectionsBySession?.[id]?.values
      if (Array.isArray(projections?.turnOutline) && projections.turnOutline.length > 0) continue
      if (projectionRefreshRef.current.has(id)) continue
      if (typeof ctx.sessions?.refreshProjections !== 'function') continue
      projectionRefreshRef.current.add(id)
      ctx.sessions.refreshProjections(id).catch(() => {
        // A read-only or archived Session may refuse projections; it keeps the
        // neutral fallback instead of blocking the rest of the list.
      })
    }
  }, [ctx, sessionList.ids, sessionList.projectionsBySession, sections])

  chatgptReact.useEffect(() => {
    // Do not write the empty normalization produced before the workspace store
    // hydrates: that would erase a stored collapsed project on every reload.
    // Merge instead of replace as well, so a list that arrives in two pages
    // cannot drop the expansion of a project that has not loaded yet.
    if (projectIds.length === 0) return
    chatgptWriteProjectExpansion({ ...chatgptReadProjectExpansion(), ...normalizedExpanded })
  }, [projectIdsKey, normalizedExpanded])

  chatgptReact.useEffect(() => {
    if (toast === null) return undefined
    const timer = window.setTimeout(() => setToast(null), 3200)
    return () => window.clearTimeout(timer)
  }, [toast])

  chatgptReact.useEffect(() => {
    const open = (event) => {
      event?.preventDefault?.()
      searchReturnRef.current = document.activeElement
      setSearchOpen(true)
    }
    document.addEventListener('dsh-chatgpt:search', open)
    // The Host still owns the sidebar header's magnifier. Intercept its click
    // before the Host handler: replacing `sidebar.workspaces` also replaced the
    // Host search surface, so the magnifier must open this list's search.
    const onSearchClick = (event) => {
      const button = event.target instanceof Element ? event.target.closest('[class*="_searchButton"]') : null
      if (button === null) return
      event.preventDefault()
      event.stopPropagation()
      searchReturnRef.current = document.activeElement
      setSearchOpen(true)
    }
    document.addEventListener('click', onSearchClick, true)
    return () => {
      document.removeEventListener('dsh-chatgpt:search', open)
      document.removeEventListener('click', onSearchClick, true)
    }
  }, [])

  chatgptReact.useEffect(() => {
    const focus = (selector) => {
      const element = rootRef.current?.querySelector(selector)
      if (!(element instanceof HTMLElement)) return
      element.focus()
      element.scrollIntoView({ block: 'nearest' })
    }
    const focusRecent = () => focus('[data-cgpt-nav="recent"]')
    const focusProjects = () => {
      // Reveal the section; never rewrite the per-project expansion map.
      setProjectsVisible(true)
      chatgptWriteProjectsVisible(true)
      window.requestAnimationFrame(() => focus('[data-cgpt-nav="projects"]'))
    }
    document.addEventListener('dsh-chatgpt:history', focusRecent)
    document.addEventListener('dsh-chatgpt:projects', focusProjects)
    return () => {
      document.removeEventListener('dsh-chatgpt:history', focusRecent)
      document.removeEventListener('dsh-chatgpt:projects', focusProjects)
    }
  }, [])

  chatgptReact.useEffect(() => {
    const onKey = (event) => {
      // Bubble phase: if the Host (terminal, editor, command palette) already
      // claimed Cmd/Ctrl+K, its defaultPrevented wins and we do not hijack it.
      if (event.defaultPrevented) return
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'k') return
      const target = event.target
      if (target instanceof Element && target.closest('[data-terminal], .xterm, [contenteditable="true"][data-terminal-input]') !== null) return
      event.preventDefault()
      searchReturnRef.current = document.activeElement
      setSearchOpen(true)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  const closeSearch = chatgptReact.useCallback(() => {
    setSearchOpen(false)
    window.setTimeout(() => {
      const composer = document.querySelector('[data-composer-input="true"]')
      if (composer instanceof HTMLElement) {
        composer.focus()
        return
      }
      const trigger = searchReturnRef.current
      if (trigger instanceof HTMLElement && trigger.isConnected) trigger.focus()
    }, 0)
  }, [])

  const closeMenu = chatgptReact.useCallback(() => {
    setMenu((current) => {
      const trigger = current?.trigger
      if (trigger !== undefined && trigger.isConnected) window.setTimeout(() => trigger.focus(), 0)
      return null
    })
  }, [])

  const showError = (text) => setToast({ kind: 'error', text })
  const showNotice = (text) => setToast({ kind: 'info', text })

  /** Close the project hover menu, cancelling any pending open/close timer. */
  const closeProjectMenu = chatgptReact.useCallback(() => {
    window.clearTimeout(projectMenuTimer.current)
    projectMenuTimer.current = 0
    setProjectMenu(null)
  }, [])

  /** Close the row-hover project card and cancel its grace timer. */
  const closeProjectCard = chatgptReact.useCallback(() => {
    window.clearTimeout(projectCardTimer.current)
    projectCardTimer.current = 0
    setProjectCard(null)
  }, [])

  /** Keep the project card open while the pointer is on it. */
  const keepProjectCard = () => {
    window.clearTimeout(projectCardTimer.current)
    projectCardTimer.current = 0
  }

  /** Close the project card after a grace period (row → card pointer move). */
  const scheduleProjectCardClose = () => {
    window.clearTimeout(projectCardTimer.current)
    projectCardTimer.current = window.setTimeout(() => {
      projectCardTimer.current = 0
      setProjectCard(null)
    }, 220)
  }

  /**
   * Open the reference's project card to the right of the hovered row.
   * @param {object} project - project section row.
   * @param {HTMLElement} head - `.chatgpt-project-head` (the row's hover area).
   */
  const openProjectCard = (project, head) => {
    if (projectMenu !== null || menu !== null) return
    keepProjectCard()
    const rect = head?.getBoundingClientRect?.()
    if (rect === undefined) return
    setProjectCard({
      id: project.id,
      left: Math.round(rect.right + 8),
      top: Math.round(rect.top),
      trigger: head,
      onEnter: keepProjectCard,
      onLeave: scheduleProjectCardClose
    })
  }

  /** Hover-open with a short dwell so crossing rows does not flash cards. */
  const scheduleProjectCardOpen = (project, head) => {
    keepProjectCard()
    projectCardTimer.current = window.setTimeout(() => {
      projectCardTimer.current = 0
      openProjectCard(project, head)
    }, 160)
  }

  /** Keep the menu open while the pointer is on it or on its row. */
  const keepProjectMenu = () => {
    window.clearTimeout(projectMenuTimer.current)
    projectMenuTimer.current = 0
  }

  /** Close after a grace period so a row → menu pointer move keeps it open. */
  const scheduleProjectMenuClose = () => {
    window.clearTimeout(projectMenuTimer.current)
    projectMenuTimer.current = window.setTimeout(() => {
      projectMenuTimer.current = 0
      setProjectMenu(null)
    }, 220)
  }

  /**
   * Open the ⋯ action menu to the right of the button, vertically centred on it
   * (P0-19c — the same anchor rule as the session menu; the popover itself
   * applies the viewport flip in `chatgptMenuPlacement`).
   * @param {object} project - project section row.
   * @param {HTMLElement} trigger - the ⋯ button.
   * @param {boolean} focus - focus the first item (click/keyboard, not hover).
   */
  const openProjectMenu = (project, trigger, focus) => {
    keepProjectMenu()
    closeProjectCard()
    const rect = trigger?.getBoundingClientRect?.()
    if (rect === undefined) return
    setMenu(null)
    setProjectMenu({
      id: project.id,
      trigger,
      focus: focus === true,
      onEnter: keepProjectMenu,
      onLeave: scheduleProjectMenuClose
    })
  }

  chatgptReact.useEffect(
    () => () => {
      window.clearTimeout(projectMenuTimer.current)
      window.clearTimeout(projectCardTimer.current)
    },
    []
  )

  /**
   * Start a NEW Work conversation in one project.
   *
   * `chatgptStartWorkSession` passes `clearPreviousDraft: true`, so a draft left
   * in the project is not carried into the new Session. The Work preset comes
   * from the Host roster, not from the remembered Chat/Work default: this
   * shortcut always switches to Work.
   */
  const startProjectSession = (projectId) => {
    setMenu(null)
    closeProjectMenu()
    chatgptCloseProjectPage()
    void chatgptWorkPreset(ctx)
      .then((preset) => {
        if (!chatgptStartWorkSession(ctx, projectId, preset)) {
          showError('无法新建会话：宿主没有提供会话导航')
        }
      })
      .catch((reason) => {
        if (reason?.name === 'ChatgptConnectionError') return
        showError(`无法新建会话：${reason instanceof Error ? reason.message : '未知错误'}`)
      })
  }

  const openSession = (id) => {
    setMenu(null)
    closeProjectMenu()
    setSearchOpen(false)
    chatgptCloseProjectPage()
    try {
      ctx.uiWorkspace.openSession(id)
    } catch (reason) {
      showError(`无法打开会话：${reason instanceof Error ? reason.message : '未知错误'}`)
    }
  }

  // The brand switcher's product is the default for every 新聊天; the Host
  // rejects a Chat session without the `chat` preset, so the preset must be
  // passed at creation time (it is immutable afterwards).
  const startSession = (workspaceId) => {
    setMenu(null)
    closeProjectMenu()
    chatgptCloseProjectPage()
    const preset = chatgptDefaultPreset()
    // Chat is displayed outside every 项目 group. chatgptStartProductSession
    // binds it to the default Workspace (the Host needs one to mount an
    // editable editor) and the section builder filters it out of project rows.
    void chatgptStartProductSession(ctx, { agentPreset: preset, workspaceId }).catch((reason) => {
      if (reason?.name === 'ChatgptConnectionError') return
      showError(`无法开始新聊天：${reason instanceof Error ? reason.message : '未知错误'}`)
    })
  }

  const toggleProject = (id) => {
    closeProjectMenu()
    setExpanded((current) => {
      const visible = current[id] !== false
      return { ...current, [id]: !visible }
    })
  }

  const toggleProjects = () => {
    setProjectsVisible((current) => {
      const next = current !== true
      chatgptWriteProjectsVisible(next)
      return next
    })
  }

  const addProject = async () => {
    closeProjectMenu()
    try {
      const created = await chatgptCreateProject(ctx)
      if (created !== null) chatgptOpenProjectPage(created.workspaceId)
    } catch (reason) {
      showError(reason instanceof Error && reason.message !== '' ? reason.message : '新建项目失败')
    }
  }

  const openMenu = (event, kind, id, trigger) => {
    event.preventDefault()
    event.stopPropagation()
    closeProjectMenu()
    closeProjectCard()
    // P0-19c: like the project menu, the session popover hangs off the trigger
    // itself (right side, vertically centred) rather than the pointer/row edge.
    setMenu({ kind, id, trigger })
  }

  const runAction = async (action) => {
    const target = menu
    if (target === null) return
    setMenu(null)
    try {
      if (action === 'open') {
        openSession(target.id)
        return
      }
      if (action === 'rename') {
        setDialog({ kind: 'session', id: target.id, title: titleOf(target.id) })
        return
      }
      if (action === 'pin') {
        const pinned = workspaceList.pinnedSessionIds?.includes(target.id) === true
        await (pinned ? ctx.workspaces.unpinSession(target.id) : ctx.workspaces.pinSession(target.id))
        return
      }
      if (action === 'archive') {
        await ctx.workspaces.archiveSession(target.id)
        return
      }
    } catch (reason) {
      const code = reason?.rpcError?.code ?? reason?.code
      if (action === 'archive' && code === 'workspace/session-active') {
        showError('会话正在运行，无法归档')
      } else if (action === 'pin' || action === 'unpin') {
        showError('无法更新置顶状态')
      } else if (action === 'archive') {
        showError('归档失败')
      } else {
        showError(reason instanceof Error && reason.message !== '' ? reason.message : '操作失败')
      }
    }
  }

  /**
   * Flip one project's pinned flag and persist it. The list re-sorts from the
   * new set on the next render (pinned first, then the Host's order), and the
   * same click un-pins, so the action is reversible.
   * @param {string} id - Workspace id.
   */
  const toggleProjectPin = (id) => {
    setPinnedProjects((current) => {
      const next = chatgptTogglePinnedProject(current, id)
      chatgptWritePinnedProjectIds(next)
      return next
    })
  }

  /** Drop a deleted project's id so the persisted set cannot go stale. */
  const forgetProjectPin = (id) => {
    setPinnedProjects((current) => {
      if (!current.includes(id)) return current
      const next = current.filter((entry) => entry !== id)
      chatgptWritePinnedProjectIds(next)
      return next
    })
  }

  /**
   * Dispatch one project hover-menu entry. Every branch is backed by a Host
   * service except 置顶/取消置顶, which is the skin's own persisted flag.
   * @param {string} action - menu action id.
   * @returns {Promise<void>} resolves after the action settles.
   */
  const runProjectAction = async (action) => {
    const target = projectMenu
    closeProjectMenu()
    if (target === null) return
    const project = sections.projects.find((entry) => entry.id === target.id)
    if (project === undefined) return
    if (action === 'edit-project') {
      setDialog({ kind: 'project', id: project.id, title: project.title })
      return
    }
    try {
      if (action === 'pin-project') {
        // Two-way and local: workspaces.insertBefore could only move a project
        // up, never put it back, and had no persisted "pinned" meaning.
        toggleProjectPin(project.id)
        return
      }
      if (action === 'reveal-project') {
        const remoteSession =
          (typeof ctx.get === 'function' ? ctx.get('remote.session') : undefined) ?? ctx.remote?.session
        if (typeof remoteSession?.openWorkspacePath !== 'function') {
          showError('当前宿主没有提供资源管理器入口')
          return
        }
        const result = await remoteSession.openWorkspacePath({ path: project.path, action: 'reveal' })
        if (result?.ok !== true) {
          throw new Error(result?.error?.message ?? '无法打开资源管理器')
        }
        return
      }
      if (action === 'archive-project-chats') {
        const ids = project.rows.map((entry) => entry.id)
        let archived = 0
        let failure = null
        for (const id of ids) {
          try {
            await ctx.workspaces.archiveSession(id)
            archived += 1
          } catch (reason) {
            if (failure === null) failure = reason
          }
        }
        if (failure !== null) {
          const code = failure?.rpcError?.code ?? failure?.code
          showError(code === 'workspace/session-active' ? '有会话正在运行，无法归档' : '部分会话归档失败')
        } else if (archived > 0) {
          showNotice(`已归档 ${archived} 个会话`)
        }
        return
      }
      if (action === 'remove-project') {
        forgetProjectPin(project.id)
        chatgptRequestProjectDelete(project.id, project.title)
      }
    } catch (reason) {
      showError(reason instanceof Error && reason.message !== '' ? reason.message : '项目操作失败')
    }
  }

  /**
   * Actions of the row-hover project card: open the project page or the rename
   * dialog. The card is not the ⋯ menu, so it gets its own target state.
   */
  const runProjectCardAction = (action) => {
    const target = projectCard
    closeProjectCard()
    if (target === null) return
    const project = sections.projects.find((entry) => entry.id === target.id)
    if (project === undefined) return
    if (action === 'open-project') {
      chatgptOpenProjectPage(project.id)
      return
    }
    if (action === 'edit-project') {
      setDialog({ kind: 'project', id: project.id, title: project.title })
    }
  }

  const revealAvailable = (() => {
    try {
      const remoteSession =
        (typeof ctx.get === 'function' ? ctx.get('remote.session') : undefined) ?? ctx.remote?.session
      return typeof remoteSession?.openWorkspacePath === 'function'
    } catch {
      return false
    }
  })()

  const submitRename = async (title) => {
    if (dialog === null) return
    if (dialog.kind === 'project') {
      await ctx.workspaces.rename(dialog.id, title)
      return
    }
    const result = await ctx.sessions.using(
      dialog.id,
      { source: 'workspaceOperation' },
      (reference) => reference.binding.session.rename(title)
    )
    if (result?.ok !== true) throw new Error(result?.error?.message ?? '重命名失败')
  }

  const onRootKeyDown = (event) => {
    if (event.target instanceof HTMLElement && event.target.closest('.chatgpt-session-menu') !== null) return
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
    const nodes = [...(rootRef.current?.querySelectorAll('[data-cgpt-nav]') ?? [])].filter(
      (node) => node instanceof HTMLElement && node.tabIndex >= 0 && !node.disabled
    )
    if (nodes.length === 0) return
    const index = nodes.indexOf(event.target)
    if (index < 0) return
    event.preventDefault()
    let next = index
    if (event.key === 'ArrowDown') next = Math.min(nodes.length - 1, index + 1)
    else if (event.key === 'ArrowUp') next = Math.max(0, index - 1)
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = nodes.length - 1
    nodes[next].focus()
  }

  const loadingSessionsOnly = sessionList.phase !== 'ready' && sections.total === 0
  const skeleton =
    workspaceList.phase !== 'ready' || loadingSessionsOnly
      ? chatgptH(
          'div',
          { className: 'chatgpt-session-skeleton', 'data-cgpt-session-skeleton': '', 'aria-busy': 'true', 'aria-label': '正在加载会话' },
          Array.from({ length: 6 }, (_, index) => chatgptH('div', { className: 'chatgpt-session-skeleton-row', key: index }))
        )
      : null
  const error =
    workspaceList.state === 'error' && workspaceList.phase === 'ready'
      ? chatgptH(
          'div',
          { className: 'chatgpt-session-error', role: 'alert' },
          chatgptH('span', null, '会话列表加载失败'),
          chatgptH(
            'button',
            {
              type: 'button',
              className: 'chatgpt-session-error-retry',
              onClick: () => {
                void ctx.sessions.refresh?.().catch(() => {})
              }
            },
            '重试'
          )
        )
      : null

  const rows = (list, indent, withProject = false) =>
    list.map((entry) =>
      chatgptH(ChatgptSessionRow, {
        key: entry.id,
        id: entry.id,
        row: entry.row,
        selected: entry.id === currentMain,
        pinned: sections.pinned.some((pin) => pin.id === entry.id),
        projections: sessionList.projectionsBySession?.[entry.id]?.values,
        indent,
        projectLabel: withProject ? entry.project?.title : undefined,
        running: isRunning(entry.id),
        tabIndex: entry.id === activeId && (!withProject || !primaryRowIds.has(entry.id)) ? 0 : -1,
        onOpen: openSession,
        onMenu: (event, trigger) => openMenu(event, 'session', entry.id, trigger),
        onContextMenu: (event, id) => openMenu(event, 'session', id, event.currentTarget),
        onFocus: () => setFocusId(entry.id)
      })
    )

  const projectNodes = projectsVisible ? page.projects.map((project) => {
    const open = normalizedExpanded[project.id] !== false
    const groupId = `chatgpt-project-${project.id}`
    // P0-19a: the project row never spins. The running indicator belongs to the
    // session rows only; a project row is a folder, not a turn.
    return chatgptH(
      'div',
      {
        className: 'chatgpt-project',
        key: project.id,
        'data-cgpt-project-total': project.total,
        'data-cgpt-project-visible': project.rows.length
      },
      chatgptH(
        'div',
        {
          className: 'chatgpt-project-head',
          role: 'listitem',
          'data-cgpt-project-head': project.id,
          onMouseEnter: (event) => scheduleProjectCardOpen(project, event.currentTarget),
          onMouseLeave: scheduleProjectCardClose
        },
        chatgptH(
          'button',
          {
            type: 'button',
            className: 'chatgpt-project-row',
            'data-cgpt-nav': `project-${project.id}`,
            'data-cgpt-project-row': project.id,
            tabIndex: 0,
            'aria-expanded': open ? 'true' : 'false',
            'aria-controls': groupId,
            title: open ? `收起项目：${project.title}` : `展开项目：${project.title}`,
            // P0-10A: the row only expands/collapses. It never navigates to the
            // project overview/page; that destination lives on the rail.
            onClick: () => toggleProject(project.id),
            onFocus: () => setFocusId(`project-${project.id}`)
          },
          chatgptH('span', {
            className: 'chatgpt-project-icon',
            // P0-13: the reference swaps the folder glyph with the row's state —
            // an open folder when the project is expanded, a closed one when it
            // is collapsed. Both bodies come from the capture, unmodified.
            'data-cgpt-project-folder': open === true ? 'open' : 'closed',
            'aria-hidden': 'true',
            dangerouslySetInnerHTML: {
              __html: open === true ? CHATGPT_SESSION_ICONS.folderOpen : CHATGPT_SESSION_ICONS.folder
            }
          }),
          chatgptH('span', { className: 'chatgpt-project-title' }, project.title)
        ),
        // P0-13: the reference puts ⋯ first and 新建会话 to its right, 8px
        // apart and 8px from the row's edge — the captured order, not ours.
        chatgptH(
          'div',
          { className: 'chatgpt-project-actions' },
          chatgptH(
            'button',
            {
              type: 'button',
              className: 'chatgpt-project-more',
              'data-cgpt-project-more': project.id,
              tabIndex: 0,
              'aria-label': `项目操作：${project.title}`,
              'aria-haspopup': 'menu',
              'aria-expanded': projectMenu?.id === project.id ? 'true' : 'false',
              onClick: (event) => {
                event.preventDefault()
                event.stopPropagation()
                openProjectMenu(project, event.currentTarget, true)
              },
              onFocus: (event) => openProjectMenu(project, event.currentTarget, true)
            },
            chatgptH('span', {
              'aria-hidden': 'true',
              dangerouslySetInnerHTML: { __html: CHATGPT_SESSION_ICONS.more }
            })
          ),
          chatgptH(
            'button',
            {
              type: 'button',
              className: 'chatgpt-project-new',
              'data-cgpt-project-new': project.id,
              tabIndex: -1,
              'aria-label': `在「${project.title}」中新建会话`,
              title: '新建会话',
              onClick: (event) => {
                event.preventDefault()
                event.stopPropagation()
                startProjectSession(project.id)
              }
            },
            chatgptH('span', {
              'aria-hidden': 'true',
              dangerouslySetInnerHTML: { __html: CHATGPT_SESSION_ICONS.newChat }
            })
          )
        )
      ),
      open
        ? chatgptH(
            'div',
            { className: 'chatgpt-project-body', id: groupId, role: 'list', 'aria-label': project.title },
            project.rows.length === 0
              ? chatgptH('div', { className: 'chatgpt-project-empty' }, '暂无会话')
              : [
                  rows(project.rows, true),
                  project.truncated === true
                    ? chatgptH(
                        'button',
                        {
                          type: 'button',
                          className: 'chatgpt-session-load-more chatgpt-project-load-more',
                          'data-cgpt-project-load-more': project.id,
                          'aria-label': `显示「${project.title}」更多会话`,
                          onClick: () => {
                            // P0-22: only this project's map entry moves. It cannot
                            // touch 最近, another project, or pinned rows.
                            setProjectLimits((current) => ({
                              ...current,
                              [project.id]: chatgptNextProjectLimit(current[project.id], project.total)
                            }))
                          }
                        },
                        `显示更多（剩余 ${project.hidden}）`
                      )
                    : null
                ]
          )
        : null
    )
  })
    : []

  const recentNodes = page.recent.length > 0
    ? chatgptH(
        'div',
        { className: 'chatgpt-recent' },
        chatgptH(
          'div',
          {
            className: 'chatgpt-section-heading',
            role: 'presentation',
            tabIndex: -1,
            'data-cgpt-nav': 'recent'
          },
          '最近'
        ),
        chatgptH('div', { role: 'list', 'aria-label': '最近' }, rows(page.recent, false, true)),
        page.recentHidden > 0
          ? chatgptH(
              'button',
              {
                type: 'button',
                className: 'chatgpt-session-load-more chatgpt-recent-more',
                'data-cgpt-recent-more': '',
                onClick: () =>
                  setRecentLimit((current) => chatgptNextRecentLimit(current, sections.recent.length))
              },
              `显示更多（剩余 ${page.recentHidden}）`
            )
          : null
      )
    : null

  const projectMenuProject =
    projectMenu === null ? undefined : sections.projects.find((entry) => entry.id === projectMenu.id)
  const projectCardProject =
    projectCard === null ? undefined : sections.projects.find((entry) => entry.id === projectCard.id)

  // P0-10A: 新聊天 + super-agent are a fixed top block, a SIBLING of the
  // scroll container. Only 项目/最近 scroll below them; the host sidebar's own
  // overflow: hidden therefore cannot clip them and scrolling cannot move them.
  const fixedBar = chatgptH(
    'div',
    { className: 'chatgpt-session-fixed', 'data-cgpt-session-fixed': '' },
                chatgptH(
                  'button',
                  {
                    type: 'button',
                    className: 'chatgpt-new-chat',
                    'data-cgpt-new-chat': '',
                    'data-cgpt-nav': '__new__',
                    tabIndex: activeId === '__new__' ? 0 : -1,
                    onClick: () => startSession(),
                    onFocus: () => setFocusId('__new__')
                  },
                  chatgptH('span', {
                    className: 'chatgpt-new-chat-icon',
                    'aria-hidden': 'true',
                    dangerouslySetInnerHTML: { __html: CHATGPT_SESSION_ICONS.plus }
                  }),
                  chatgptH('span', { className: 'chatgpt-new-chat-label' }, '新聊天')
                ),
                dotAvailable
                  ? chatgptH(
                      'button',
                      {
                        type: 'button',
                        className: 'chatgpt-super-agent',
                        'data-cgpt-super-agent': '',
                        'data-cgpt-nav': 'dot',
                        tabIndex: activeId === 'dot' ? 0 : -1,
                        'aria-label':
                          dotUnread > 0 ? `super-agent，${dotUnread} 条未读` : 'super-agent',
                        onClick: () => {
                          setMenu(null)
                          if (!chatgptSelectPanel(ctx, DOT_PANEL_ID)) {
                            showError('无法打开 super-agent：宿主的 dot 面板没有注册')
                          }
                        },
                        onFocus: () => setFocusId('dot')
                      },
                      chatgptH('span', {
                        className: 'chatgpt-super-agent-icon',
                        'aria-hidden': 'true',
                        dangerouslySetInnerHTML: { __html: CHATGPT_SUPER_AGENT_MARK }
                      }),
                      chatgptH('span', { className: 'chatgpt-super-agent-label' }, 'super-agent'),
                      dotUnread > 0
                        ? chatgptH(
                            'span',
                            { className: 'chatgpt-super-agent-badge', 'aria-hidden': 'true' },
                            dotUnread > 99 ? '99+' : String(dotUnread)
                          )
                        : null
                    )
                  : null,
  )

  return chatgptH(
    'div',
    {
      className: 'chatgpt-sessions',
      'data-cgpt-session-list': '',
      'data-phase': sessionList.phase,
      'data-session-phase': sessionList.phase,
      'data-workspace-phase': workspaceList.phase,
      'data-workspace-state': workspaceList.state,
      'data-hook-sessions': typeof useSessions,
      'data-hook-workspaces': typeof useWorkspaces,
      ref: rootRef,
      onKeyDown: onRootKeyDown
    },
    searchOpen
      ? chatgptH(ChatgptSessionSearch, {
          ctx,
          onClose: closeSearch,
          onOpen: openSession,
          titleOf,
          localSessions: searchRows,
          sessionList,
          workspaceList
        })
      : chatgptH(
          chatgptReact.Fragment,
          null,
          fixedBar,
          chatgptH(
          'div',
          { className: 'chatgpt-session-scroll', 'data-cgpt-session-scroll': '' },
          skeleton,
          error,
          skeleton === null && error === null
            ? chatgptH(
                'div',
                { role: 'list', 'aria-label': '会话列表', 'aria-busy': 'false' },
                sections.pinned.length > 0
                  ? chatgptH(
                      'div',
                      { className: 'chatgpt-pinned', role: 'list', 'aria-label': '置顶会话' },
                      rows(page.pinned, false)
                    )
                  : null,
                chatgptH(
                  'div',
                  { className: 'chatgpt-projects-section' },
                  chatgptH(
                    'div',
                    { className: 'chatgpt-projects-heading-row' },
                    chatgptH(
                      'button',
                      {
                        type: 'button',
                        className: 'chatgpt-projects-heading',
                        'data-cgpt-nav': 'projects',
                        tabIndex: 0,
                        'aria-expanded': projectsVisible ? 'true' : 'false',
                        'aria-controls': 'chatgpt-project-groups',
                        title: projectsVisible ? '收起项目列表' : '展开项目列表',
                        onClick: toggleProjects,
                        onFocus: () => setFocusId('projects')
                      },
                      chatgptH('span', { className: 'chatgpt-section-heading-label' }, '项目'),
                      chatgptH('span', {
                        className: `chatgpt-section-chevron${projectsVisible ? ' is-open' : ''}`,
                        'aria-hidden': 'true',
                        dangerouslySetInnerHTML: { __html: CHATGPT_SESSION_ICONS.chevron }
                      })
                    ),
                    chatgptH(
                      'button',
                      {
                        type: 'button',
                        className: 'chatgpt-projects-add',
                        'data-cgpt-project-add': '',
                        'aria-label': '新建项目',
                        title: '新建项目',
                        onClick: () => void addProject()
                      },
                      chatgptH('span', {
                        'aria-hidden': 'true',
                        dangerouslySetInnerHTML: { __html: CHATGPT_SESSION_ICONS.plus }
                      })
                    )
                  ),
                  projectsVisible
                    ? sections.projects.length === 0
                      ? chatgptH('div', { className: 'chatgpt-project-empty chatgpt-projects-none' }, '没有项目')
                      : chatgptH(
                          'div',
                          { className: 'chatgpt-project-groups', id: 'chatgpt-project-groups', role: 'list', 'aria-label': '项目会话' },
                          projectNodes
                        )
                    : null
                ),
                recentNodes,
                sections.total === 0
                  ? chatgptH(
                      'div',
                      { className: 'chatgpt-session-empty', 'data-cgpt-session-empty': '' },
                      chatgptH('p', { className: 'chatgpt-session-empty-title' }, '还没有会话'),
                      chatgptH('p', { className: 'chatgpt-session-empty-note' }, '从上方的新聊天开始')
                    )
                  : null,
              )
            : null
        )
        ),
    projectCard === null || projectCardProject === undefined
      ? null
      : chatgptH(ChatgptSessionMenu, {
          key: `card:${projectCard.id}`,
          menu: {
            kind: 'project',
            id: projectCard.id,
            x: projectCard.left,
            y: projectCard.top,
            trigger: projectCard.trigger
          },
          project: projectCardProject,
          firstProjectId: sections.projects[0]?.id,
          autoFocus: false,
          onEnter: keepProjectCard,
          onLeave: scheduleProjectCardClose,
          onClose: closeProjectCard,
          onAction: runProjectCardAction
        }),
    projectMenu === null || projectMenuProject === undefined
      ? null
      : chatgptH(ChatgptProjectHoverMenu, {
          menu: projectMenu,
          project: projectMenuProject,
          pinned: pinnedProjectIds.has(projectMenuProject.id),
          disabled: {
            path: revealAvailable !== true || (projectMenuProject.path ?? '') === '',
            chats: projectMenuProject.rows.length === 0
          },
          onClose: closeProjectMenu,
          onAction: (action) => {
            void runProjectAction(action)
          }
        }),
    menu === null
      ? null
      : chatgptH(ChatgptSessionMenu, {
          key: `${menu.kind}:${menu.id}:${menu.view ?? 'main'}`,
          menu,
          project:
            menu.kind === 'project' ? sections.projects.find((entry) => entry.id === menu.id) : undefined,
          pinned: workspaceList.pinnedSessionIds?.includes(menu.id) === true,
          firstProjectId: sections.projects[0]?.id,
          onClose: closeMenu,
          onAction: (action) => {
            void runAction(action)
          }
        }),
    dialog === null
      ? null
      : chatgptH(ChatgptRenameDialog, {
          dialog,
          onClose: () => setDialog(null),
          onSubmit: submitRename
        }),
    toast === null
      ? null
      : chatgptH(
          'div',
          { className: 'chatgpt-session-toast', role: 'status', 'aria-live': 'polite', 'data-kind': toast.kind },
          toast.text
        )
  )
}

/**
 * Replace the host workspace browser in the sidebar hole.
 * @param {object} ctx - client context with slots/sessions/workspaces/uiWorkspace.
 * @returns {() => void} disposer.
 */
function mountChatgptSessionList(ctx) {
  return ctx.slots.inject('sidebar.workspaces', () =>
    ctx.slots.register(
      {
        name: 'sidebar.workspaces',
        id: 'chatgpt-session-list',
        priority: -1
      },
      (props) => chatgptH(ChatgptSessionList, { ...props, ctx })
    )
  )
}
