/**
 * dsh-chatgpt-ui — the permanent 52px icon rail (browser half fragment).
 *
 * The host collapses its sidebar to 0 on macOS/Windows-titlebar and to 56 on
 * the web/Linux, so a rail cannot live inside that grid track. This overlay is
 * fixed at x=0 and independent of the column animation; the host column is
 * given the measured 340px track (52 rail + 288 panel) and its root is shifted
 * right by 52px in CSS. Panel drag and collapse keep working because the width
 * still belongs to the host's layout store.
 *
 * P0-10A reference order (settings pinned to the bottom):
 *   首页        back to the empty main page (new blank Session when the
 *               retained conversation has already started)
 *   定时任务    the host `schedules` main panel (restored as a primary entry)
 *   插件        the host `plugins` main panel (plugin manager)
 *   更多        a popover with Chat / Work / Super-agent / 设置
 *   项目        opens the all-projects overview (not one project detail);
 *               stays lit while either project overlay is open
 *   设置        pinned last, opens the host Settings modal
 * super-agent is deliberately NOT a rail entry: it belongs to the sidebar's
 * fixed top area (新聊天 + super-agent), where the reference puts it.
 * Every panel open goes through `chatgptSelectPanel`, which reads the layout
 * service with `ctx.get` (the rail context does declare `layout`, but the same
 * helper serves the sidebar list, which does not).
 * The glyphs are NOT hand-drawn: `lib/client/rail-icons.js` is generated from
 * `docs/capture/icons.json`, which `scripts/extract-icons.mjs` fills with the
 * sprite symbols chatgpt.com itself renders (default outline + filled selected
 * twin). Geometry: 36×36 button, 10px radius, 20px icon, 8px gap.
 *
 * This file is a fragment: no import/export statements — scripts/build-client.mjs
 * concatenates it inside the module-loader factory.
 */

const CHATGPT_RAIL_WIDTH = 52
const CHATGPT_RAIL_BUTTON_SIZE = 36
const CHATGPT_RAIL_ICON_SIZE = 20
/** The measured panel width the peek overlay floats at (docs/capture/m9). */
const CHATGPT_PANEL_WIDTH = 288

/** Host main-panel id of the plugin manager (`dsh-client-ui-plugin-manager`). */
const CHATGPT_PLUGINS_PANEL_ID = 'plugins'

/** The panel's own search glyph (the sprite has no search symbol). */
const CHATGPT_RAIL_SEARCH_SVG =
  '<svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><circle cx="8.8" cy="8.8" r="4.9"/><path d="m12.4 12.4 3.4 3.4"/></svg>'

/** The peek header's 展开侧栏 glyph: the host's 16px panel icon. */
const CHATGPT_PEEK_EXPAND_SVG =
  '<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1"><path d="M13.5 1.5H2.5C1.94772 1.5 1.5 1.94772 1.5 2.5V13.5C1.5 14.0523 1.94772 14.5 2.5 14.5H13.5C14.0523 14.5 14.5 14.0523 14.5 13.5V2.5C14.5 1.94772 14.0523 1.5 13.5 1.5Z"/><path d="M5.5 1.5V14.5"/></svg>'

/**
 * The five destinations in reading order. `kind` decides the action:
 * home = close the panel and return to the empty home, panel = select a host
 * main panel, menu = the 更多 popover, projects = the all-projects overview.
 * 设置 is not in this list: it is pinned below the spacer.
 */
const CHATGPT_RAIL_ITEMS = [
  { id: 'home', label: '首页', glyph: 'home', kind: 'home' },
  { id: 'schedules', label: '定时任务', glyph: 'schedules', kind: 'panel', panelId: 'schedules' },
  { id: 'plugins', label: '插件', glyph: 'plugins', kind: 'panel', panelId: CHATGPT_PLUGINS_PANEL_ID },
  { id: 'more', label: '更多', glyph: 'more', kind: 'menu' },
  { id: 'projects', label: '项目', glyph: 'folder', kind: 'projects' }
]

/**
 * Filled twins synthesized for the rail destinations whose sprite only ships
 * one outline glyph. The reference's selected state is a solid icon plus the
 * same grey pill 首页 uses; home has a real sprite twin, and the 定时任务 /
 * 插件 twins are captured from the web app (see docs/capture/icons.json).
 * Colors are currentColor; the folder seam is cut out with the selected pill
 * token so the glyph still reads inside the highlight.
 */
const CHATGPT_RAIL_SOLID_GLYPHS = {
  folder:
    '<svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true" fill="currentColor"><path d="M3 5.5A1.5 1.5 0 0 1 4.5 4h3l1.8 2H15.5A1.5 1.5 0 0 1 17 7.5v7A1.5 1.5 0 0 1 15.5 16h-11A1.5 1.5 0 0 1 3 14.5z"/></svg>',
  more:
    '<svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true" fill="currentColor"><circle cx="4.2" cy="10" r="1.7"></circle><circle cx="10" cy="10" r="1.7"></circle><circle cx="15.8" cy="10" r="1.7"></circle></svg>'
}

/** Solid/bold markup for a rail icon, falling back to the generated twin. */
function chatgptRailItemGlyph(name, selected) {
  if (selected === true && CHATGPT_RAIL_SOLID_GLYPHS[name] !== undefined) return CHATGPT_RAIL_SOLID_GLYPHS[name]
  return chatgptRailGlyph(name, selected)
}

/** The bottom-pinned entry: the host Settings modal. */
const CHATGPT_RAIL_SETTINGS_ITEM = { id: 'settings', label: '设置', glyph: 'settings', kind: 'settings' }

/** Panel keys that the host currently exposes in the `main` slot. */
function chatgptMainPanelKeys(ctx) {
  try {
    const entries = ctx.slots.entriesOfSlot === undefined ? [] : ctx.slots.entriesOfSlot('main')
    return new Set((entries ?? []).flatMap((entry) => {
      const key = entry?.options?.key ?? entry?.options?.id
      return typeof key === 'string' ? [key] : []
    }))
  } catch {
    return new Set()
  }
}

/** Live frame/sidebar measurements used by the overlay rail. */
function useChatgptFrameMetrics() {
  const [metrics, setMetrics] = chatgptReact.useState({ collapsed: false, panelWidth: 288, ready: false })
  chatgptReact.useEffect(() => {
    let frame = null
    let slot = null
    let column = null
    let raf = 0
    let observer
    const read = () => {
      if (frame === null) frame = document.querySelector('[class*="_frame"]')
      if (slot === null) slot = document.querySelector('[data-slot="sidebar"]')
      if (column === null) column = document.querySelector('[class*="_sidebarCol"]')
      raf = 0
      if (frame === null || slot === null) {
        raf = requestAnimationFrame(read)
        return
      }
      const collapsed = frame.hasAttribute('data-sidebar-collapsed')
      const first = frame === null ? '' : getComputedStyle(frame).gridTemplateColumns.trim().split(/\s+/)[0]
      const track = Number.parseFloat(first) || 0
      const next = { collapsed, panelWidth: Math.max(0, Math.round(track - CHATGPT_RAIL_WIDTH)), ready: true }
      setMetrics((previous) =>
        previous.collapsed === next.collapsed && previous.panelWidth === next.panelWidth && previous.ready === next.ready
          ? previous
          : next
      )
    }
    read()
    const resize = new ResizeObserver(read)
    const start = () => {
      if (frame === null) frame = document.querySelector('[class*="_frame"]')
      if (slot === null) slot = document.querySelector('[data-slot="sidebar"]')
      if (column === null) column = document.querySelector('[class*="_sidebarCol"]')
      if (frame !== null) {
        resize.observe(frame)
        observer = new MutationObserver(read)
        observer.observe(frame, { attributes: true, attributeFilter: ['data-sidebar-collapsed', 'style'] })
      }
      if (slot !== null) resize.observe(slot)
      if (column !== null) resize.observe(column)
    }
    if (frame !== null && slot !== null) start()
    else raf = requestAnimationFrame(start)
    return () => {
      resize.disconnect()
      observer?.disconnect()
      if (raf !== 0) cancelAnimationFrame(raf)
    }
  }, [])
  return metrics
}

/**
 * Give the host sidebar the measured 340px track on first paint and whenever it
 * expands. Never run while dragging or on every store change: drag must stay
 * authoritative until the next collapse/expand cycle.
 */
function useChatgptSidebarWidth(ctx) {
  chatgptReact.useEffect(() => {
    let frame = null
    let wasCollapsed = null
    const apply = () => {
      if (frame === null) return
      if (frame.hasAttribute('data-dragging')) return
      const collapsed = frame.hasAttribute('data-sidebar-collapsed')
      if (wasCollapsed === null) {
        wasCollapsed = collapsed
        if (!collapsed) setMeasuredWidth()
      } else if (wasCollapsed && !collapsed) {
        wasCollapsed = false
        setMeasuredWidth()
      } else {
        wasCollapsed = collapsed
      }
    }
    const setMeasuredWidth = () => {
      const first = getComputedStyle(frame).gridTemplateColumns.trim().split(/\s+/)[0]
      const px = Number.parseFloat(first)
      if (!Number.isFinite(px) || px >= 340) return
      const actions = ctx.layout?.panels
      if (typeof actions?.setSidebar === 'function') actions.setSidebar(340)
      else console.warn('[dsh-chatgpt-ui] layout.panels.setSidebar is unavailable; panel stays at the host width')
    }
    const start = () => {
      if (frame === null) frame = document.querySelector('[class*="_frame"]')
      if (frame === null) {
        requestAnimationFrame(start)
        return
      }
      apply()
      const observer = new MutationObserver(apply)
      observer.observe(frame, { attributes: true, attributeFilter: ['data-sidebar-collapsed', 'data-dragging'] })
      frame.__chatgptSidebarObserver?.disconnect()
      frame.__chatgptSidebarObserver = observer
    }
    start()
    return () => {
      if (frame !== null) {
        frame.__chatgptSidebarObserver?.disconnect()
        delete frame.__chatgptSidebarObserver
      }
    }
  }, [ctx])
}

/** Capture `openSettings` from the Settings launcher seat without showing a second trigger. */
function mountChatgptSettingsBridge(ctx) {
  const bridge = { openSettings: null }
  const dispose = ctx.slots.inject('settings.launcher', () =>
    ctx.slots.register(
      {
        name: 'settings.launcher',
        id: 'chatgpt-rail-settings-bridge',
        priority: -1
      },
      function ChatgptSettingsBridge(props) {
        const { openSettings } = props
        chatgptReact.useEffect(() => {
          bridge.openSettings = typeof openSettings === 'function' ? openSettings : null
          return () => {
            if (bridge.openSettings === openSettings) bridge.openSettings = null
          }
        }, [openSettings])
        return null
      }
    )
  )
  return { bridge, dispose }
}

/** Open the host settings modal, falling back to its hidden trigger if the launcher seat is absent. */
function chatgptOpenSettings(bridge) {
  if (typeof bridge.openSettings === 'function') {
    bridge.openSettings()
    return
  }
  const trigger = document.querySelector('[data-slot="sidebar"] button[aria-haspopup="dialog"]')
  if (trigger !== null) trigger.click()
}

/** Reopen the host sidebar when a rail action needs its panel visible. */
function chatgptOpenSidebar() {
  const frame = document.querySelector('[class*="_frame"]')
  if (frame === null || !frame.hasAttribute('data-sidebar-collapsed')) return false
  // The host localises this control ("打开侧边栏" in the zh UI), so the label
  // alone cannot be the contract. The header's last *button* is the toggle in
  // both states; `:last-of-type` also survives the host tooltip <span> that is
  // appended as the header's last child after ~500ms of hover.
  const toggle =
    document.querySelector('[data-slot="sidebar"] button[aria-label="Open sidebar"]') ??
    document.querySelector('[data-slot="sidebar"] button[aria-label="打开侧边栏"]') ??
    document.querySelector('[data-slot="sidebar"] [data-window-drag] > button:last-of-type')
  if (toggle === null) return false
  toggle.click()
  return true
}

/** Open the custom list's Host-backed search, falling back to the host control. */
function chatgptOpenSearch() {
  const request = new CustomEvent('dsh-chatgpt:search', { cancelable: true })
  document.dispatchEvent(request)
  if (request.defaultPrevented) return
  const button = document.querySelector('[data-slot="sidebar"] button[class*="_searchButton"]')
  if (button !== null) {
    // Defer past the custom button's own click/pointer cycle; the host's
    // outside-click handler otherwise closes the search it just opened.
    window.setTimeout(() => button.click(), 0)
    return
  }
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', code: 'KeyK', ctrlKey: true, bubbles: true }))
}

/**
 * The 更多 popover: products, super-agent and settings.
 * @param {object} props - anchor, items, selection and close callbacks.
 * @returns {object} React element.
 */
function ChatgptRailMenu(props) {
  const { anchor, items, onSelect, onClose } = props
  const menuRef = chatgptReact.useRef(null)
  chatgptReact.useEffect(() => {
    menuRef.current?.querySelector('[role="menuitem"]')?.focus()
    const onPointerDown = (event) => {
      const target = event.target instanceof Element ? event.target : null
      // The 更多 button owns the toggle; ignore its pointerdown so the click
      // handler can close an already-open menu instead of reopening it.
      if (target !== null && target.closest('[data-cgpt-rail-item="more"]') !== null) return
      if (menuRef.current !== null && !menuRef.current.contains(event.target)) onClose()
    }
    const onKeyDown = (event) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      onClose()
      document.querySelector('[data-cgpt-rail-item="more"]')?.focus()
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    document.addEventListener('keydown', onKeyDown, true)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true)
      document.removeEventListener('keydown', onKeyDown, true)
    }
  }, [onClose])
  return chatgptH(
    'div',
    {
      ref: menuRef,
      className: 'chatgpt-rail-menu',
      role: 'menu',
      'aria-label': '更多',
      style: { left: `${anchor.left}px`, top: `${anchor.top}px` }
    },
    items.map((item) =>
      chatgptH(
        'button',
        {
          key: item.id,
          type: 'button',
          className: 'chatgpt-rail-menu-item',
          'data-cgpt-rail-menu-item': item.id,
          role: 'menuitem',
          onClick: () => onSelect(item.id)
        },
        chatgptH('span', {
          className: 'chatgpt-rail-menu-icon',
          'aria-hidden': 'true',
          dangerouslySetInnerHTML: { __html: chatgptRailGlyph(item.glyph, false) }
        }),
        chatgptH('span', { className: 'chatgpt-rail-menu-label' }, item.label)
      )
    )
  )
}

/** One rail button with a 500ms hover tooltip and the measured hit target. */
function ChatgptRailButton(props) {
  const { item, active, expanded, onActivate } = props
  const [tip, setTip] = chatgptReact.useState(false)
  const timer = chatgptReact.useRef(undefined)
  const hide = () => {
    window.clearTimeout(timer.current)
    timer.current = undefined
    setTip(false)
  }
  const show = (delay) => {
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setTip(true), delay)
  }
  chatgptReact.useEffect(() => hide, [])
  return chatgptH(
    'button',
    {
      type: 'button',
      className: 'chatgpt-rail-button',
      'data-cgpt-rail-item': item.id,
      'data-cgpt-rail-state': active ? 'selected' : 'default',
      'data-selected': active ? 'true' : undefined,
      'aria-label': item.label,
      'aria-current': active ? 'page' : undefined,
      'aria-haspopup': item.kind === 'menu' ? 'menu' : undefined,
      'aria-expanded': item.kind === 'menu' ? expanded === true : undefined,
      onClick: onActivate,
      onMouseEnter: () => show(500),
      onMouseLeave: hide,
      // Hover only, or keyboard focus: a mouse click already names the action
      // through its result, and a tooltip left over the panel header is noise.
      onFocus: (event) => {
        if (event.currentTarget.matches(':focus-visible')) show(0)
      },
      onBlur: hide
    },
    chatgptH('span', {
      className: 'chatgpt-rail-icon',
      'data-cgpt-rail-glyph': item.glyph,
      'data-cgpt-rail-glyph-state': active ? 'filled' : 'outline',
      'aria-hidden': 'true',
      dangerouslySetInnerHTML: { __html: chatgptRailItemGlyph(item.glyph, active) }
    }),
    tip
      ? chatgptH('span', { className: 'chatgpt-rail-tooltip', role: 'tooltip' }, item.label)
      : null
  )
}

/**
 * The fixed rail and the panel-header search button.
 * @param {object} props - shell.overlay props (`useSessions`, `usePanelInfo`) plus ctx/bridge.
 * @returns {object} React element.
 */
function ChatgptRail(props) {
  const { ctx, bridge, useSessions, usePanelInfo } = props
  const session = useChatgptMainSession(useSessions)
  const activePanel = typeof usePanelInfo === 'function' ? usePanelInfo((info) => info.activePanelId) : null
  const metrics = useChatgptFrameMetrics()
  const [panelKeys, setPanelKeys] = chatgptReact.useState(() => chatgptMainPanelKeys(ctx))
  const [settingsOpen, setSettingsOpen] = chatgptReact.useState(false)
  const [projectOpen, setProjectOpen] = chatgptReact.useState(
    () => typeof document !== 'undefined' && document.body.hasAttribute('data-cgpt-project-open')
  )
  const [projectKind, setProjectKind] = chatgptReact.useState('none')
  const [moreMenu, setMoreMenu] = chatgptReact.useState(null)
  // P0-19a peek is transient UI state, never persisted. The host frame's
  // `data-sidebar-collapsed` attribute remains the only collapsed/expanded
  // fact; this flag only mirrors it while a pointer or focus is over the rail.
  const [peek, setPeek] = chatgptReact.useState(false)
  useChatgptSidebarWidth(ctx)

  // Hovering or tabbing into the rail reveals the collapsed panel as an
  // overlay; leaving the rail + panel hides it after a short grace period so
  // crossing the 1px seam cannot flicker. Escape also dismisses it.
  chatgptReact.useEffect(() => {
    if (!metrics.collapsed) {
      setPeek(false)
      return undefined
    }
    let timer = 0
    const inside = (node) =>
      node instanceof Element &&
      (node.closest('.chatgpt-rail') !== null ||
        node.closest('[data-slot="sidebar"]') !== null ||
        node.closest('.chatgpt-peek-expand') !== null ||
        node.closest('.chatgpt-panel-search') !== null)
    const show = () => {
      if (timer !== 0) {
        window.clearTimeout(timer)
        timer = 0
      }
      setPeek(true)
    }
    const hideSoon = () => {
      if (timer !== 0) window.clearTimeout(timer)
      timer = window.setTimeout(() => {
        timer = 0
        setPeek(false)
      }, 140)
    }
    const onPointerOver = (event) => {
      if (inside(event.target)) show()
      else hideSoon()
    }
    const onFocusIn = (event) => {
      if (inside(event.target)) show()
      else hideSoon()
    }
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setPeek(false)
    }
    document.addEventListener('pointerover', onPointerOver, true)
    document.addEventListener('focusin', onFocusIn, true)
    document.addEventListener('keydown', onKeyDown, true)
    return () => {
      document.removeEventListener('pointerover', onPointerOver, true)
      document.removeEventListener('focusin', onFocusIn, true)
      document.removeEventListener('keydown', onKeyDown, true)
      if (timer !== 0) window.clearTimeout(timer)
      setPeek(false)
    }
  }, [metrics.collapsed])

  chatgptReact.useEffect(() => {
    if (!peek) return undefined
    document.body.setAttribute('data-cgpt-sidebar-peek', '')
    return () => document.body.removeAttribute('data-cgpt-sidebar-peek')
  }, [peek])

  chatgptReact.useEffect(() => {
    const refresh = () => setPanelKeys(chatgptMainPanelKeys(ctx))
    refresh()
    return ctx.slots.subscribe('main', refresh)
  }, [ctx])

  // The project page is an overlay over the conversation, so `activePanel`
  // stays null (or keeps whatever panel was underneath). Derive the 项目
  // selection from the overlay's host attribute instead of guessing from the
  // panel store; this is what keeps the button lit after a sidebar row opens
  // the page and drops it when the page closes.
  //
  // `projectKind` distinguishes the all-projects overview from a single
  // project's page. The overview is 首页 (P0-11); only a project detail page
  // lights the 项目 rail entry.
  chatgptReact.useEffect(() => {
    const read = () => {
      const open = document.body.hasAttribute('data-cgpt-project-open')
      const kind = document.body.getAttribute('data-cgpt-project-kind')
      setProjectOpen(open)
      setProjectKind(!open ? 'none' : kind === 'detail' ? 'detail' : 'overview')
    }
    read()
    const observer = new MutationObserver(read)
    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ['data-cgpt-project-open', 'data-cgpt-project-kind']
    })
    return () => observer.disconnect()
  }, [])

  // Settings is a modal, not a panel: the bottom entry stays lit for as long as
  // the dialog is in the document. 插件 is a real main panel, so it lights from
  // `activePanel` instead of from the modal's nav row.
  chatgptReact.useEffect(() => {
    const read = () => {
      setSettingsOpen(document.querySelector('[data-shortcut-modal="settings"]') !== null)
    }
    read()
    const observer = new MutationObserver(read)
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['data-shortcut-modal']
    })
    return () => observer.disconnect()
  }, [])

  const onMode = (target) => {
    setMoreMenu(null)
    chatgptCloseProjectPage()
    if (metrics.collapsed) chatgptOpenSidebar()
    chatgptSelectPanel(ctx, null)
    void chatgptSelectProduct(ctx, target, session)
  }
  const onPanel = (panelId) => {
    // 插件 is the plugin manager's own main panel (`dsh-client-ui-plugin-manager`
    // registers it as "plugins"), not a Settings tab.
    setMoreMenu(null)
    chatgptCloseProjectPage()
    if (metrics.collapsed) chatgptOpenSidebar()
    if (!chatgptSelectPanel(ctx, panelId)) {
      console.warn(`[dsh-chatgpt-ui] rail panel unavailable: "${panelId}" is not a registered main panel`)
    }
  }
  const onSettings = () => {
    setMoreMenu(null)
    chatgptCloseProjectPage()
    chatgptOpenSettings(bridge)
  }
  const onHome = () => {
    setMoreMenu(null)
    chatgptCloseProjectPage()
    if (metrics.collapsed) chatgptOpenSidebar()
    chatgptSelectPanel(ctx, null)
    // The reference home is the empty "what can I help with" page, not the
    // conversation that happened to be open. A blank retained session is
    // already home; a started session gets the same fresh session the
    // 新聊天 row creates. Panels always return to the conversation first.
    if (session.sessionId !== undefined && session.blank !== true) {
      void chatgptStartProductSession(ctx, { agentPreset: chatgptDefaultPreset() }).catch((reason) => {
        console.warn(`[dsh-chatgpt-ui] home session failed: ${reason instanceof Error ? reason.message : reason}`)
      })
    }
  }
  const onProjects = () => {
    setMoreMenu(null)
    if (metrics.collapsed) chatgptOpenSidebar()
    // Underlying panel goes back to the conversation, so closing the project
    // overlay returns to 首页 rather than to a stale panel.
    chatgptSelectPanel(ctx, null)
    // P0-10A: 项目 is a destination, not a shortcut into the first project.
    // Empty id is the overview sentinel (all projects); a second click while a
    // detail page is open also returns to that overview.
    chatgptOpenProjectPage('')
  }
  const onMore = (event) => {
    if (moreMenu !== null) {
      setMoreMenu(null)
      return
    }
    const rect = event.currentTarget.getBoundingClientRect()
    const height = 260
    setMoreMenu({
      left: Math.round(Math.max(CHATGPT_RAIL_WIDTH + 4, rect.right + 6)),
      top: Math.round(Math.max(8, Math.min(rect.top, window.innerHeight - height)))
    })
  }

  const active = (item) => {
    if (item.kind === 'projects') return projectOpen === true && projectKind === 'detail' && settingsOpen !== true && moreMenu === null
    if (item.kind === 'home') {
      // P0-11: the all-projects overview and the Super-agent page are both
      // 首页; only a project detail page hands the highlight to 项目. The
      // overlay can sit over a main panel, so on the overview `activePanel`
      // is deliberately ignored.
      const homeSurface =
        projectOpen === true
          ? projectKind !== 'detail'
          : activePanel === null || activePanel === DOT_PANEL_ID
      return homeSurface && settingsOpen !== true && moreMenu === null
    }
    if (item.kind === 'panel') {
      // 定时任务 and 插件 each own their own button and light from the real
      // main-panel store; no derived "more" highlight guesses the page.
      return projectOpen !== true && settingsOpen !== true && moreMenu === null && activePanel === item.panelId
    }
    if (item.kind === 'settings') return settingsOpen === true
    if (item.kind === 'menu') return moreMenu !== null
    return false
  }

  const moreItems = [
    { id: 'chat', label: 'Chat', glyph: 'chat', onSelect: () => onMode(MODE_CHAT) },
    { id: 'work', label: 'Work', glyph: 'work', onSelect: () => onMode(MODE_AGENT) },
    { id: 'schedules', label: '定时任务', glyph: 'schedules', onSelect: () => onPanel('schedules') },
    ...(panelKeys.has(DOT_PANEL_ID)
      ? [{ id: 'agent', label: 'Super-agent', glyph: 'agent', onSelect: () => onPanel(DOT_PANEL_ID) }]
      : []),
    { id: 'settings', label: '设置', glyph: 'settings', onSelect: onSettings }
  ]

  return chatgptH(
    chatgptReact.Fragment,
    null,
    chatgptH(
      'nav',
      { className: 'chatgpt-rail', 'aria-label': 'ChatGPT' },
      CHATGPT_RAIL_ITEMS.map((item) =>
        chatgptH(ChatgptRailButton, {
          key: item.id,
          item,
          active: active(item),
          expanded: item.kind === 'menu' ? moreMenu !== null : undefined,
          onActivate: (event) => {
            if (item.kind === 'menu') return onMore(event)
            if (item.kind === 'home') return onHome()
            if (item.kind === 'projects') return onProjects()
            if (item.kind === 'panel') return onPanel(item.panelId)
          }
        })
      ),
      chatgptH('div', { className: 'chatgpt-rail-spacer' }),
      chatgptH(ChatgptRailButton, {
        item: CHATGPT_RAIL_SETTINGS_ITEM,
        active: active(CHATGPT_RAIL_SETTINGS_ITEM),
        onActivate: onSettings
      }),
      moreMenu === null
        ? null
        : chatgptH(ChatgptRailMenu, {
            anchor: moreMenu,
            items: moreItems,
            onClose: () => setMoreMenu(null),
            onSelect: (id) => {
              const selected = moreItems.find((item) => item.id === id)
              setMoreMenu(null)
              if (selected !== undefined) selected.onSelect()
            }
          })
    ),
    metrics.ready && (metrics.collapsed === false || peek === true)
      ? chatgptH(
          'button',
          {
            type: 'button',
            className: 'chatgpt-panel-search',
            'aria-label': '搜索聊天',
            title: '搜索聊天',
            style: {
              left: `${CHATGPT_RAIL_WIDTH + (metrics.collapsed ? CHATGPT_PANEL_WIDTH : metrics.panelWidth) - 90}px`
            },
            onClick: chatgptOpenSearch
          },
          chatgptH('span', {
            'aria-hidden': 'true',
            dangerouslySetInnerHTML: { __html: CHATGPT_RAIL_SEARCH_SVG }
          })
        )
      : null,
    metrics.ready && metrics.collapsed && peek
      ? chatgptH(
          'button',
          {
            type: 'button',
            className: 'chatgpt-peek-expand',
            'aria-label': '展开侧栏',
            title: '展开侧栏',
            // Same column as the expanded header's 收起侧边栏 control:
            // 340px panel edge − 16px inset − 36px button.
            style: { left: `${CHATGPT_RAIL_WIDTH + CHATGPT_PANEL_WIDTH - 52}px` },
            onClick: () => {
              // The host toggle is the only writer of the collapsed state, so
              // the expansion it performs is the persisted one.
              chatgptOpenSidebar()
              setPeek(false)
            }
          },
          chatgptH('span', {
            'aria-hidden': 'true',
            dangerouslySetInnerHTML: { __html: CHATGPT_PEEK_EXPAND_SVG }
          })
        )
      : null
  )
}

/**
 * Register the settings bridge and the overlay rail.
 * @param {object} ctx - client Cordis context with slots/layout/uiWorkspace.
 * @returns {() => void} disposer.
 */
function mountChatgptRail(ctx) {
  const { bridge, dispose: disposeBridge } = mountChatgptSettingsBridge(ctx)
  const disposeRail = ctx.slots.inject('shell.overlay', () =>
    ctx.slots.register(
      {
        name: 'shell.overlay',
        id: 'chatgpt-rail',
        order: 20
      },
      (props) => chatgptH(ChatgptRail, { ...props, ctx, bridge })
    )
  )
  return () => {
    disposeRail()
    disposeBridge()
  }
}
