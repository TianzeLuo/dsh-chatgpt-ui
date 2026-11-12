/**
 * dsh-chatgpt-ui — Work composer (browser half fragment).
 *
 * Phase 4B rebuilds the Work input card as the reference's three bands:
 *
 *   input    — the Host editor, 52px tall, 15/18 pad
 *   actions  — `+`, one model+effort pill, send (no mic, no voice)
 *   tools    — 选择项目 / 文件 / 插件 … 帮我批准 (48px bar under the card)
 *
 * Two seats, both no-ops in Chat mode (Chat keeps the 760×52 single row from
 * Phase 3):
 *
 *   conversation.input.right — the effort chip plus the two media buttons.
 *     `display: contents` lets the buttons join the host row's flex line, so
 *     the effort chip can sit *after* the host model chip (CSS order) instead
 *     of before it.
 *
 *   conversation.composer.bar — the tool bar. It renders as a sibling of the
 *     card inside the host's composer stack, which is exactly the reference's
 *     layout: a bar tucked under the 760px card (reference: 732 under 768).
 *
 * The effort control reads the current model's levels from the Host catalog
 * (`session/modelCatalog`) and writes through `session/selectModel`, so nothing
 * about levels, persistence or defaults is re-implemented here. The approval
 * menu reads `permissionPresets/catalog` and switches with the Host's own
 * `/permission` command.
 *
 * This file is a fragment: no import/export statements — scripts/build-client.mjs
 * concatenates it inside the module-loader factory, after rail.js (which owns
 * `chatgptOpenPluginsSettings`) and sessions.js.
 */

/**
 * Visible copy. The reference card is Chinese and the brief pins these labels,
 * so they do not follow the host's UI language; the placeholder is overridden
 * in CSS with the same wording. `t()` is still used for the accessible names
 * and tooltips.
 */
const CHATGPT_WORK_LABELS = {
  project: '选择项目',
  files: '文件',
  plugins: '插件',
  approval: '帮我批准',
  effort: '推理强度',
  chooseEffort: '选择推理强度',
  reset: '重置',
  model: '模型',
  modelChoose: '选择模型'
}

const CHATGPT_CHEVRON_SVG =
  '<svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M4 6.5 8 10.5l4-4"/></svg>'

/** Right chevron for the panel's model→effort drill-in row. */
const CHATGPT_CHEVRON_RIGHT_SVG =
  '<svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M6.5 4l4 4-4 4"/></svg>'

/** Check glyph for the selected menu row. */
const CHATGPT_CHECK_SVG = chatgptMenuGlyph('check')

/** Circular-arrow reset glyph on the right of the header. */
const CHATGPT_RESET_SVG =
  '<svg viewBox="0 0 20 20" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3.5 8.4A6.4 6.4 0 1 1 4 12.6"/><path d="M3.2 4.1v4.3h4.3"/></svg>'

/** Panel height before the first measurement (12 + 44 block + 12 + 34 + 16). */
const CHATGPT_PANEL_SIMPLE_HEIGHT = 118
/** Scroll cap of the provider-grouped model list. */
const CHATGPT_PANEL_MAX_HEIGHT = 420

/**
 * P0-8 star specks over the top-stop gradient: 14 white 1–2px dots, spread
 * pseudo-randomly with more of them on the selected (right) side. Fixed values
 * keep the capture frames deterministic across runs.
 */
const CHATGPT_EFFORT_STARS = [
  { x: 10, y: 66, s: 1, o: 0.55 },
  { x: 17, y: 38, s: 1, o: 0.7 },
  { x: 24, y: 74, s: 2, o: 0.75 },
  { x: 29, y: 52, s: 1, o: 0.6 },
  { x: 36, y: 26, s: 1, o: 0.65 },
  { x: 42, y: 60, s: 2, o: 0.8 },
  { x: 48, y: 80, s: 1, o: 0.55 },
  { x: 55, y: 44, s: 2, o: 0.85 },
  { x: 61, y: 68, s: 1, o: 0.75 },
  { x: 67, y: 32, s: 1, o: 0.8 },
  { x: 72, y: 56, s: 2, o: 0.9 },
  { x: 79, y: 76, s: 1, o: 0.7 },
  { x: 85, y: 40, s: 2, o: 0.95 },
  { x: 92, y: 62, s: 1, o: 0.85 }
]

/** Shield glyph for the approval entry. */
const CHATGPT_SHIELD_SVG = chatgptMenuGlyph('shield')

/* P0-11 permission menu: three 16px glyphs on a 20px leading slot. P0-13b
   corrected two of them against the desktop picker: 「请求批准」is the open
   hand, 「帮我批准」is the command/terminal square (`>_`, not a shield), and
   「完全访问权限」keeps the shield-exclamation. All three come from
   menu-icons.js, so no path is drawn here. */
const CHATGPT_PERMISSION_ASK_SVG = chatgptMenuGlyph('permissionAsk')
const CHATGPT_PERMISSION_AUTO_SVG = chatgptMenuGlyph('permissionAuto')
const CHATGPT_PERMISSION_FULL_SVG = chatgptMenuGlyph('permissionFull')

/**
 * The three reference rows. Titles come from the shared approval-name map so
 * the chip and the menu cannot drift; descriptions and icons are menu-only.
 */
const CHATGPT_PERMISSION_COPY = {
  'read-only': {
    description: '编辑外部文件和使用互联网时始终询问',
    icon: CHATGPT_PERMISSION_ASK_SVG
  },
  'workspace-write': {
    description: '仅对检测到的风险操作请求批准',
    icon: CHATGPT_PERMISSION_AUTO_SVG
  },
  'danger-full-access': {
    description: '可不受限制地访问互联网和你电脑上的任何文件',
    icon: CHATGPT_PERMISSION_FULL_SVG,
    fullAccess: true
  }
}

/** Voice glyph (the blue button) — copied from the reference sprite. */

/**
 * A tiny async store for one Host read, shared by every seat that needs it.
 * @param {() => Promise<object>} read - loader returning `{ok, value}` or a value.
 * @returns {{get: Function, subscribe: Function, load: Function}} store.
 */
function createChatgptAsyncStore(read) {
  let state = { status: 'idle', value: null, error: null }
  const listeners = new Set()
  const emit = () => {
    for (const listener of [...listeners]) listener()
  }
  let inflight = null
  return {
    get: () => state,
    subscribe: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    load: () => {
      if (inflight !== null) return inflight
      if (state.status === 'ready') return Promise.resolve(state.value)
      state = { status: 'loading', value: state.value, error: null }
      emit()
      inflight = read()
        .then((result) => {
          const value = result !== null && typeof result === 'object' && 'ok' in result ? result.value : result
          state = { status: 'ready', value, error: null }
          return value
        })
        .catch((error) => {
          state = { status: 'error', value: null, error: String(error?.message ?? error) }
          return null
        })
        .finally(() => {
          inflight = null
          emit()
        })
      return inflight
    }
  }
}

/**
 * Subscribe to one async store.
 * @param {{get: Function, subscribe: Function}} store - store.
 * @returns {object} snapshot.
 */
function useChatgptAsyncStore(store) {
  return chatgptReact.useSyncExternalStore(store.subscribe, store.get, store.get)
}

/**
 * Load-once wrapper: the first consumer triggers the read, later ones reuse it.
 * @param {object} store - async store.
 * @param {object} snapshot - current snapshot (drives the effect).
 * @returns {object} snapshot.
 */
function useChatgptLoaded(store, snapshot) {
  chatgptReact.useEffect(() => {
    if (snapshot.status === 'idle') void store.load()
  }, [store, snapshot.status])
  return snapshot
}

/**
 * Measure a floating panel and keep it inside the viewport.
 * @param {object|null} anchor - trigger rect (`getBoundingClientRect`).
 * @param {number} width - panel width.
 * @param {number} height - panel height.
 * @returns {{left: number, top: number}} fixed-position coordinates.
 */
function chatgptPopoverAbove(anchor, width, height) {
  const margin = 8
  const viewport = typeof window === 'undefined' ? { innerWidth: 1024, innerHeight: 768 } : window
  const left = Math.max(margin, Math.min(viewport.innerWidth - width - margin, anchor.right - width))
  const above = anchor.top - height - margin
  const top = above >= margin ? above : Math.min(viewport.innerHeight - height - margin, anchor.bottom + margin)
  return { left: Math.round(left), top: Math.round(top) }
}

/**
 * P0-18: measure a panel that is *left-aligned* with its trigger and opens in a
 * requested direction, flipping only when the requested side has no room.
 *
 * The approval picker is the first user: the reference aligns its left edge with
 * the chip (the old helper right-aligned it), opens downwards under a new
 * conversation and upwards under a started one. Horizontal clamping is the
 * viewport guard of last resort; at 1233px the align-start position already
 * fits, so the measured left delta stays 0.
 *
 * @param {object} anchor - trigger rect (`getBoundingClientRect`).
 * @param {number} width - panel width.
 * @param {number} height - panel height.
 * @param {{align?: 'start'|'end', direction?: 'below'|'above'}} [options] - alignment and preferred side.
 * @returns {{left: number, top: number, direction: 'above'|'below'}} fixed coordinates and the side actually used.
 */
function chatgptPopoverBeside(anchor, width, height, options = {}) {
  const margin = 8
  const viewport = typeof window === 'undefined' ? { innerWidth: 1024, innerHeight: 768 } : window
  const aligned = options.align === 'end' ? anchor.right - width : anchor.left
  const left = Math.max(margin, Math.min(viewport.innerWidth - width - margin, aligned))
  const below = anchor.bottom + margin
  const above = anchor.top - height - margin
  const fitsBelow = below + height <= viewport.innerHeight - margin
  const fitsAbove = above >= margin
  const preferBelow = options.direction !== 'above'
  let top
  let direction
  if (preferBelow ? fitsBelow : !fitsAbove) {
    top = below
    direction = 'below'
  } else {
    top = above
    direction = 'above'
  }
  if (direction === 'below' && !fitsBelow && fitsAbove) {
    top = above
    direction = 'above'
  } else if (direction === 'above' && !fitsAbove && fitsBelow) {
    top = below
    direction = 'below'
  } else if (!fitsAbove && !fitsBelow) {
    top = Math.max(margin, viewport.innerHeight - height - margin)
  }
  return { left: Math.round(left), top: Math.round(top), direction }
}

/**
 * Close a popover on outside click or Escape.
 * @param {object} ref - panel ref.
 * @param {Function} onClose - close handler.
 * @param {boolean} open - whether the panel is mounted.
 * @returns {void}
 */
function useChatgptDismiss(ref, onClose, open) {
  chatgptReact.useEffect(() => {
    if (!open) return undefined
    const onPointer = (event) => {
      if (ref.current !== null && ref.current.contains(event.target)) return
      onClose()
    }
    const onKey = (event) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', onPointer, true)
    document.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('mousedown', onPointer, true)
      document.removeEventListener('keydown', onKey, true)
    }
  }, [ref, onClose, open])
}

/**
 * Whether the Session in a slot is still the empty composer state.
 *
 * The reference only shows the tool row under a *new* conversation: once a
 * session has a message, that row (project / files / plugins / approval) is
 * gone and the card is just the composer. The Host records the flag on the
 * Session summary and keeps it current, so this subscribes to the same list
 * store the sidebar reads instead of guessing from the DOM.
 *
 * @param {object} ctx - client Cordis context.
 * @param {string|undefined} sessionId - the slot's session.
 * @returns {boolean} true while the Session is blank.
 */
function useChatgptSessionBlank(ctx, sessionId) {
  // `ctx.get` is the optional accessor: the composer's slot context declares
  // `remote.session`, not `sessions`, so a property read would throw
  // "cannot get property \"sessions\" without inject".
  let store
  try {
    store = typeof ctx?.get === 'function' ? ctx.get('sessions')?.list : undefined
  } catch {
    store = undefined
  }
  const read = chatgptReact.useCallback(() => {
    // No store means no way to know the flag; the row stays (the old
    // behaviour) rather than disappearing from a worked-in conversation.
    if (typeof sessionId !== 'string' || store === undefined) return true
    const row = store.getSnapshot?.()?.byId?.[sessionId]
    return row === undefined ? true : row.blank === true
  }, [sessionId, store])
  const [blank, setBlank] = chatgptReact.useState(read)
  chatgptReact.useEffect(() => {
    setBlank(read())
    if (typeof store?.subscribe !== 'function') return undefined
    return store.subscribe(() => setBlank(read()))
  }, [read, store])
  return blank
}

/**
 * The merged model + thinking-effort pill and its two-view popover.
 *
 * Desktop form (P0-8): a 280×20px-corner panel with 12/16/16 padding. The
 * lightning glyph is gone; the top row keeps its 20px column plus 12px gap as
 * blank space, a 126×44 hover block carries the effort name (16px/600, blue,
 * purple at the top level) over the model name (14px/400, #D0D0D0) with a
 * 12px `›`, and a 20px reset sits on the first text line. Under it, 12px
 * lower, is a 248×30 track with four 4px stops and a 34px perfectly round white
 * thumb; the top level paints a #4F6BFF → #A855F7 → #7C3AED sweep with 14
 * white star specks. Opening the panel swaps the pill's caption to
 * 「选择推理强度」; closing restores `model + effort`.
 *
 * The model list behind the `model ›` row is grouped by the Host provider:
 * a small provider header, then one 46px row per model with only its name and,
 * on the current row, a check. Choosing a model returns to the effort view
 * (the reference does not close the panel).
 *
 * Levels come from the Host catalog (`modelCatalog().value.groups[]`), never
 * from a hard-coded list, and every write goes through `session/selectModel`
 * (which persists the choice as the session default on the Host side). A model
 * without `reasoning` offers no effort section at all.
 *
 * @param {object} props - slot props plus `ctx`, `catalog`, `t`.
 * @returns {object|null} React element.
 */
function ChatgptModelControl(props) {
  const { sessionId, useProjection, ctx, catalog, t } = props
  const preset = typeof useProjection === 'function' ? useProjection('agentPreset') : undefined
  // P0-16: Chat's blank page has no model control of its own, but the reference
  // row ends with the effort selector alone (极高 ⌄). The same control is reused
  // in its compact form there — same popover, only the trigger changes. `compact`
  // comes from the seat: the Host does not render `conversation.input.right` on
  // the sessionless page, so Chat's copy is mounted from `conversation.input.left`
  // instead (see mountChatgptWorkComposer).
  const compact = props.compact === true
  const snapshot = useChatgptLoaded(catalog, useChatgptAsyncStore(catalog))
  const selection =
    chatgptActiveSelection(typeof useProjection === 'function' ? useProjection('modelSelection') : undefined) ??
    (snapshot.value?.default === undefined ? undefined : snapshot.value.default)
  const choices = chatgptModelChoices(snapshot.value)
  const groups = chatgptModelGroups(choices)
  const choice = chatgptChoiceOf(choices, selection)
  const efforts = choice?.efforts ?? []
  const projectionIndex = chatgptEffortIndexOf(efforts, selection?.reasoningEffort, choice?.defaultEffort)

  const [pendingModel, setPendingModel] = chatgptReact.useState(null)
  const [pendingEffort, setPendingEffort] = chatgptReact.useState(null)
  const [open, setOpen] = chatgptReact.useState(false)
  // `simple` is the effort view (its model line opens the list); `advanced`
  // is the provider-grouped model list. Selecting a model returns to `simple`
  // instead of closing, exactly like the desktop panel.
  const [view, setView] = chatgptReact.useState('simple')
  const [activeChoice, setActiveChoice] = chatgptReact.useState(0)
  const [position, setPosition] = chatgptReact.useState(null)
  const triggerRef = chatgptReact.useRef(null)
  const menuRef = chatgptReact.useRef(null)
  const toggleRef = chatgptReact.useRef(null)
  const choiceRefs = chatgptReact.useRef([])
  const close = chatgptReact.useCallback(() => setOpen(false), [])
  useChatgptDismiss(menuRef, close, open)

  // The Host projection lands a beat after the optimistic pick; drop the
  // overlay once it agrees (or when the pick failed and nothing moved).
  chatgptReact.useEffect(() => {
    if (pendingEffort !== null && pendingEffort === projectionIndex) setPendingEffort(null)
  }, [pendingEffort, projectionIndex])

  chatgptReact.useEffect(() => {
    if (pendingModel === null) return
    if (choice !== undefined && choice.provider === pendingModel.provider && choice.model === pendingModel.model) {
      setPendingModel(null)
    }
  }, [pendingModel, choice])

  const index = pendingEffort ?? projectionIndex

  const send = chatgptReact.useCallback(
    (request) => {
      if (request === null) return
      ctx.remote.session.selectModel(request).then((result) => {
        if (result?.ok === false) {
          setPendingEffort(null)
          setPendingModel(null)
          console.warn(`[dsh-chatgpt-ui] model switch failed: ${result.error?.code ?? 'error'}`)
        }
      })
    },
    [ctx]
  )

  const applyEffort = chatgptReact.useCallback(
    (next) => {
      const request = chatgptEffortRequest(sessionId, selection, efforts, next)
      if (request === null) return
      setPendingEffort(next)
      send(request)
    },
    [efforts, selection, send, sessionId]
  )

  const applyModel = chatgptReact.useCallback(
    (next) => {
      const request = chatgptModelRequest(sessionId, next, efforts[index]?.id)
      if (request === null) return
      setPendingModel({ provider: next.provider, model: next.model })
      setPendingEffort(null)
      const rect = triggerRef.current?.getBoundingClientRect()
      if (rect !== undefined) setPosition(chatgptPopoverAbove(rect, 280, CHATGPT_PANEL_SIMPLE_HEIGHT))
      setView('simple')
      send(request)
    },
    [efforts, index, send, sessionId]
  )

  const resetEffort = chatgptReact.useCallback(() => {
    const next = chatgptEffortDefaultIndex(efforts, choice?.defaultEffort)
    if (next < 0 || next === index) return
    applyEffort(next)
  }, [applyEffort, choice, efforts, index])

  const openMenu = chatgptReact.useCallback(() => {
    const rect = triggerRef.current?.getBoundingClientRect()
    if (rect === undefined) return
    // First paint uses the measured simple height; the effect below replaces it
    // with the actual one so the menu never hangs off the bottom of the viewport.
    setView('simple')
    setPosition(chatgptPopoverAbove(rect, 280, CHATGPT_PANEL_SIMPLE_HEIGHT))
    setOpen(true)
  }, [])

  chatgptReact.useEffect(() => {
    if (!open) return
    const menu = menuRef.current
    const rect = triggerRef.current?.getBoundingClientRect()
    if (menu === null || rect === undefined) return
    const measured = chatgptPopoverAbove(rect, 280, menu.getBoundingClientRect().height)
    setPosition((current) =>
      current !== null && current.left === measured.left && current.top === measured.top ? current : measured
    )
  }, [open, view, groups.length, efforts.length])

  // A menu opened from the keyboard must be operable from the keyboard: focus
  // the model line in `simple`, or the active model row in `advanced`.
  chatgptReact.useEffect(() => {
    if (!open) return undefined
    const timer = setTimeout(() => {
      if (view === 'advanced') choiceRefs.current[activeChoice]?.focus()
      else toggleRef.current?.focus({ preventScroll: true })
    }, 0)
    return () => clearTimeout(timer)
  }, [open, view, activeChoice])

  const currentChoiceIndex = choices.findIndex(
    (entry) => entry.provider === (choice?.provider ?? '') && entry.model === (choice?.model ?? '')
  )
  // Measured estimate before the panel paints: 8px top + (32px provider header
  // + 46px rows) per group + 8px bottom, capped at the scroll height.
  const advancedHeight = Math.min(
    CHATGPT_PANEL_MAX_HEIGHT,
    16 + groups.reduce((sum, group) => sum + 32 + group.models.length * 46, 0)
  )
  const openAdvanced = chatgptReact.useCallback(() => {
    const rect = triggerRef.current?.getBoundingClientRect()
    if (rect !== undefined) setPosition(chatgptPopoverAbove(rect, 280, advancedHeight))
    setActiveChoice(Math.max(0, currentChoiceIndex))
    setView('advanced')
  }, [advancedHeight, currentChoiceIndex])

  // Keyboard inside the open panel: up/down walks the model rows, Enter picks
  // one (and returns to the effort view), left returns to the effort view, and
  // left/right on the effort view moves the slider. Buttons and the native
  // range keep their own Enter/arrow behaviour.
  chatgptReact.useEffect(() => {
    if (!open) return undefined
    const onKeyDown = (event) => {
      if (event.key === 'Escape' || event.altKey || event.metaKey || event.ctrlKey) return
      const target = event.target
      if (target instanceof Element && target.closest('.chatgpt-effort-reset') !== null) return
      if (target instanceof Element && target.matches('.chatgpt-effort-range')) return
      if (view === 'simple') {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
          event.preventDefault()
          event.stopPropagation()
          openAdvanced()
          return
        }
        if (event.key === 'Enter') {
          event.preventDefault()
          event.stopPropagation()
          openAdvanced()
          return
        }
        if (efforts.length > 1) {
          const next = chatgptEffortStep(index, event.key, efforts.length)
          if (next !== index) {
            event.preventDefault()
            event.stopPropagation()
            applyEffort(next)
          }
        }
        return
      }
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Home' || event.key === 'End') {
        event.preventDefault()
        event.stopPropagation()
        const last = choices.length - 1
        const next = event.key === 'Home'
          ? 0
          : event.key === 'End'
            ? last
            : event.key === 'ArrowDown'
              ? Math.min(last, activeChoice + 1)
              : Math.max(0, activeChoice - 1)
        setActiveChoice(next)
        return
      }
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault()
        event.stopPropagation()
        const picked = choices[activeChoice]
        if (picked !== undefined) applyModel(picked)
        return
      }
      if (event.key === 'ArrowLeft' || event.key === 'Backspace') {
        event.preventDefault()
        event.stopPropagation()
        setView('simple')
      }
    }
    document.addEventListener('keydown', onKeyDown, true)
    return () => document.removeEventListener('keydown', onKeyDown, true)
  }, [open, view, index, efforts, activeChoice, choices, applyEffort, applyModel, openAdvanced])

  if (preset === CHAT_PRESET_ID && !compact) return null
  if (choices.length === 0) return null

  const effortLabel = efforts.length > 1 ? chatgptEffortName(efforts[index]) : ''
  // Compact is effort-only: a model with a single level has nothing to show, so
  // the Chat row falls back to the add control plus the send disc.
  if (compact && effortLabel === '') return null
  const modelLabel = pendingModel === null ? (choice?.name ?? selection?.model ?? '') : (chatgptChoiceOf(choices, pendingModel)?.name ?? choice?.name ?? '')
  const onTriggerKeyDown = (event) => {
    if (open) return
    if (efforts.length <= 1) {
      if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
        event.preventDefault()
        openMenu()
      }
      return
    }
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight' || event.key === 'Home' || event.key === 'End') {
      const next = chatgptEffortStep(index, event.key, efforts.length)
      if (next !== index) {
        event.preventDefault()
        applyEffort(next)
      }
    } else if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      openMenu()
    }
  }

  const offset = chatgptEffortOffset(index, efforts.length)
  const fill = chatgptEffortFill(index, efforts.length)
  // P0-6: only the top stop of a multi-level model earns the blue→purple fill.
  const maxEffort = chatgptIsMaxEffort(efforts, index)
  const ticks = efforts.map((entry, tickIndex) => ({
    id: entry.id,
    x: chatgptEffortOffset(tickIndex, efforts.length),
    selected: tickIndex <= index
  }))

  return chatgptH(
    chatgptReact.Fragment,
    null,
    chatgptH(
      'button',
      {
        ref: triggerRef,
        type: 'button',
        className: compact ? 'chatgpt-model-pill chatgpt-model-pill-compact' : 'chatgpt-model-pill',
        'data-cgpt-model-pill': '',
        'data-cgpt-pill-compact': compact ? 'true' : undefined,
        'data-open': open ? 'true' : 'false',
        'aria-haspopup': 'menu',
        'aria-expanded': open ? 'true' : 'false',
        'aria-label': open
          ? CHATGPT_WORK_LABELS.chooseEffort
          : compact
            ? `${t('work.effort')}: ${effortLabel}`
            : `${t('work.model')}: ${modelLabel}${effortLabel === '' ? '' : ` · ${t('work.effort')}: ${effortLabel}`}`,
        title: open
          ? CHATGPT_WORK_LABELS.chooseEffort
          : compact
            ? effortLabel
            : `${modelLabel}${effortLabel === '' ? '' : ` · ${effortLabel}`}`,
        onClick: () => (open ? close() : openMenu()),
        onKeyDown: onTriggerKeyDown
      },
      open
        ? chatgptH('span', { className: 'chatgpt-model-pill-placeholder', 'data-cgpt-pill-placeholder': '' }, CHATGPT_WORK_LABELS.chooseEffort)
        : compact
          ? null
          : chatgptH('span', { className: 'chatgpt-model-pill-name' }, modelLabel),
      open || effortLabel === ''
        ? null
        : chatgptH('span', { className: 'chatgpt-model-pill-effort' }, effortLabel),
      chatgptH('span', {
        className: 'chatgpt-model-pill-chevron',
        'aria-hidden': 'true',
        dangerouslySetInnerHTML: { __html: CHATGPT_CHEVRON_SVG }
      })
    ),
    open
      ? chatgptReactDom.createPortal(
          chatgptH(
            'div',
            {
              ref: menuRef,
              className: 'chatgpt-effort-menu chatgpt-model-menu',
              'data-cgpt-model-menu': '',
              'data-view': view,
              role: 'group',
              'aria-label': t('work.model'),
              style: {
                left: `${position?.left ?? 0}px`,
                top: `${position?.top ?? 0}px`,
                width: '280px',
                visibility: position === null ? 'hidden' : 'visible'
              }
            },
            view === 'advanced'
              ? chatgptH(
                  'div',
                  { className: 'chatgpt-model-advanced' },
                  chatgptH(
                    'div',
                    { className: 'chatgpt-model-list', role: 'menu', 'aria-label': CHATGPT_WORK_LABELS.modelChoose },
                    groups.map((group) =>
                      chatgptH(
                        'div',
                        {
                          key: `group-${group.provider}`,
                          className: 'chatgpt-model-group',
                          role: 'group',
                          'aria-label': group.name,
                          'data-cgpt-model-group': group.provider
                        },
                        chatgptH(
                          'div',
                          { className: 'chatgpt-model-group-title', 'data-cgpt-model-group-title': '' },
                          group.name
                        ),
                        group.models.map((entry) => {
                          const choiceIndex = choices.indexOf(entry)
                          const selected =
                            entry.provider === (choice?.provider ?? '') && entry.model === (choice?.model ?? '')
                          return chatgptH(
                            'button',
                            {
                              key: `${entry.provider}/${entry.model}`,
                              ref: (node) => {
                                choiceRefs.current[choiceIndex] = node
                              },
                              type: 'button',
                              role: 'menuitemradio',
                              'aria-checked': selected ? 'true' : 'false',
                              className: 'chatgpt-model-choice',
                              'data-cgpt-model-choice': `${entry.provider}/${entry.model}`,
                              'data-current': selected ? 'true' : 'false',
                              'data-active': choiceIndex === activeChoice ? 'true' : 'false',
                              onClick: () => applyModel(entry)
                            },
                            chatgptH('span', { className: 'chatgpt-model-choice-name' }, entry.name),
                            selected
                              ? chatgptH('span', {
                                  className: 'chatgpt-model-choice-check',
                                  'aria-hidden': 'true',
                                  dangerouslySetInnerHTML: { __html: CHATGPT_CHECK_SVG }
                                })
                              : null
                          )
                        })
                      )
                    )
                  )
                )
              : chatgptH(
                  'div',
                  { className: 'chatgpt-model-simple' },
                  chatgptH(
                    'div',
                    { className: 'chatgpt-effort-head' },
                    // P0-6: the lightning glyph is gone, but its 20px column
                    // and the 12px gap stay as blank space. With the same
                    // reservation on the reset side the 126px choice block
                    // lands dead centre on the 280px panel while the reset
                    // keeps its 16px right inset.
                    chatgptH('span', {
                      className: 'chatgpt-effort-head-blank',
                      'aria-hidden': 'true'
                    }),
                    chatgptH(
                      'button',
                      {
                        ref: toggleRef,
                        type: 'button',
                        className: 'chatgpt-effort-choice',
                        'data-cgpt-effort-choice': '',
                        'data-cgpt-model-view-toggle': '',
                        title: `${effortLabel === '' ? CHATGPT_WORK_LABELS.effort : effortLabel} · ${modelLabel}`,
                        'aria-label': `${CHATGPT_WORK_LABELS.modelChoose}: ${modelLabel}`,
                        onClick: openAdvanced
                      },
                      chatgptH(
                        'span',
                        {
                          className: 'chatgpt-effort-choice-name',
                          'data-cgpt-effort-name': '',
                          'data-max': maxEffort ? 'true' : 'false',
                          title: effortLabel
                        },
                        effortLabel === '' ? CHATGPT_WORK_LABELS.effort : effortLabel
                      ),
                      chatgptH(
                        'span',
                        { className: 'chatgpt-effort-choice-model' },
                        chatgptH('span', { className: 'chatgpt-effort-choice-model-name' }, modelLabel),
                        chatgptH('span', {
                          className: 'chatgpt-effort-choice-chevron',
                          'aria-hidden': 'true',
                          dangerouslySetInnerHTML: { __html: CHATGPT_CHEVRON_RIGHT_SVG }
                        })
                      )
                    ),
                    chatgptH(
                      'button',
                      {
                        type: 'button',
                        className: 'chatgpt-effort-reset',
                        'data-cgpt-effort-reset': '',
                        'aria-label': '重置为默认推理强度',
                        title: '重置为默认推理强度',
                        onClick: resetEffort
                      },
                      chatgptH('span', {
                        'aria-hidden': 'true',
                        dangerouslySetInnerHTML: { __html: CHATGPT_RESET_SVG }
                      })
                    )
                  ),
                  efforts.length > 1
                    ? chatgptH(
                        'div',
                        { className: 'chatgpt-effort-slider' },
                        chatgptH(
                          'div',
                          {
                            className: 'chatgpt-effort-track',
                            'data-max': maxEffort ? 'true' : 'false'
                          },
                          chatgptH('span', {
                            className: 'chatgpt-effort-fill',
                            'data-max': maxEffort ? 'true' : 'false',
                            style: { width: `${fill}px` }
                          }),
                          maxEffort
                            ? chatgptH(
                                'span',
                                {
                                  className: 'chatgpt-effort-stars',
                                  'data-cgpt-effort-stars': '',
                                  'aria-hidden': 'true'
                                },
                                CHATGPT_EFFORT_STARS.map((star, starIndex) =>
                                  chatgptH('span', {
                                    key: `star-${starIndex}`,
                                    className: 'chatgpt-effort-star',
                                    style: {
                                      left: `${star.x}%`,
                                      top: `${star.y}%`,
                                      width: `${star.s}px`,
                                      height: `${star.s}px`,
                                      opacity: star.o
                                    }
                                  })
                                )
                              )
                            : null,
                          ticks.map((tick) =>
                            chatgptH('span', {
                              key: `tick-${tick.id}`,
                              className: 'chatgpt-effort-tick',
                              'data-cgpt-effort-tick': '',
                              'data-selected': tick.selected ? 'true' : 'false',
                              style: { left: `${tick.x - 2}px` },
                              'aria-hidden': 'true'
                            })
                          ),
                          chatgptH('span', {
                            className: 'chatgpt-effort-thumb',
                            'data-cgpt-effort-thumb': '',
                            style: { left: `${offset - CHATGPT_EFFORT_THUMB / 2}px` },
                            'aria-hidden': 'true'
                          }),
                          chatgptH('input', {
                            type: 'range',
                            className: 'chatgpt-effort-range',
                            min: 0,
                            max: efforts.length - 1,
                            step: 1,
                            value: index,
                            'aria-label': t('work.effort'),
                            'aria-valuetext': effortLabel,
                            'data-cgpt-effort-range': '',
                            onChange: (event) => applyEffort(Number(event.target.value))
                          })
                        )
                      )
                    : null
                )
          ),
          document.body
        )
      : null
  )
}

/**
 * The permission selector (P0-10B).
 *
 * One chip in the composer's action row, right of the attachment control, in
 * both Chat and Work. It is not a new permission system: the caption is the
 * Host `permissions` projection's `currentValue` rendered through the skin's
 * label map, the menu is `permissionPresets/catalog`, and a click runs the
 * Host's own `/permission <preset>` command, which sets the sandbox mode and
 * the `approval` policy and appends both to the session log (so the choice
 * survives a reload with the session).
 *
 * Chat sessions are pinned read-only on the Host (`lib/host/chat-policy.js`):
 * its `/permission` handler refuses escalation, so a failed switch keeps the
 * menu open with one explanatory line instead of silently doing nothing.
 *
 * P0-18b: the control paints in the card action row for both a blank and a
 * started Work session, immediately after the Host's `+`. Chat never paints it.
 *
 * @param {object} props - slot props plus `ctx`, `approvals`, `t`.
 * @returns {object|null} React element, or null when no catalog is composed.
 */
function ChatgptPermissionControl(props) {
  const { sessionId, useProjection, ctx, approvals, t } = props
  const preset = typeof useProjection === 'function' ? useProjection('agentPreset') : undefined
  const permissions = typeof useProjection === 'function' ? useProjection('permissions') : undefined
  const snapshot = useChatgptLoaded(approvals, useChatgptAsyncStore(approvals))
  const options = chatgptApprovalOptions(snapshot.value)
  const label = chatgptApprovalLabel(permissions?.currentValue, options)
  const blank = useChatgptSessionBlank(ctx, sessionId)
  const [open, setOpen] = chatgptReact.useState(false)
  const [position, setPosition] = chatgptReact.useState(null)
  const [note, setNote] = chatgptReact.useState('')
  const buttonRef = chatgptReact.useRef(null)
  const menuRef = chatgptReact.useRef(null)
  const close = chatgptReact.useCallback(() => {
    setOpen(false)
    setNote('')
  }, [])
  useChatgptDismiss(menuRef, close, open)
  if (!chatgptApprovalAvailable(snapshot.value)) return null
  // Chat's row is the reference's single line; the Host approval chip is not
  // part of it (P0-16/P0-17). On Work the chip lives in the card action row for
  // both a new and a started session, so this one seat serves both states.
  if (preset === CHAT_PRESET_ID) return null

  // A Chat session is pinned read-only on the Host, so its menu carries the
  // reason from the moment it opens instead of letting a click look ignored.
  const locked = preset === CHAT_PRESET_ID ? t('work.permission.chatLocked') : ''

  const toggleMenu = () => {
    if (open) {
      close()
      return
    }
    const rect = buttonRef.current?.getBoundingClientRect()
    if (rect === undefined) return
    setNote(locked)
    // P0-18: left edge on the button, downward for a new conversation and
    // upward for a started one; the helper flips only when that side is full.
    setPosition(
      chatgptPopoverBeside(rect, 298, 18 + options.length * 42.5 + (locked === '' ? 0 : 24), {
        align: 'start',
        direction: blank ? 'below' : 'above'
      })
    )
    setOpen(true)
  }

  const switchTo = (value) => {
    const binding = ctx.get('sessions')?.binding?.(sessionId)
    const live = binding?.session
    if (live === undefined) return
    live.command(`/permission ${value}`).then((result) => {
      if (result?.ok && result.value?.matched === true && locked === '') {
        close()
        return
      }
      if (locked !== '') {
        setNote(locked)
        return
      }
      console.warn(`[dsh-chatgpt-ui] approval switch failed: ${result?.error?.code ?? 'no /permission command'}`)
    })
  }

  return chatgptH(
    chatgptReact.Fragment,
    null,
    chatgptH(
      'button',
      {
        ref: buttonRef,
        type: 'button',
        className: 'chatgpt-permission',
        'data-cgpt-permission': '',
        'data-cgpt-permission-blank': blank ? 'true' : 'false',
        'data-cgpt-permission-value': permissions?.currentValue ?? '',
        'aria-haspopup': 'menu',
        'aria-expanded': open ? 'true' : 'false',
        'aria-label': `${t('work.permission')}: ${label}`,
        title: t('work.permission.hint'),
        onClick: toggleMenu
      },
      chatgptH('span', {
        className: 'chatgpt-permission-icon',
        'aria-hidden': 'true',
        dangerouslySetInnerHTML: { __html: CHATGPT_PERMISSION_AUTO_SVG }
      }),
      chatgptH('span', { className: 'chatgpt-permission-label' }, label)
    ),
    open
      ? chatgptReactDom.createPortal(
          chatgptH(
            'div',
            {
              ref: menuRef,
              className: 'chatgpt-work-menu chatgpt-permission-menu',
              'data-cgpt-work-menu': 'permission',
              'data-cgpt-permission-open': position?.direction ?? '',
              role: 'menu',
              'aria-label': t('work.permission'),
              style: {
                left: `${position?.left ?? 0}px`,
                top: `${position?.top ?? 0}px`,
                width: '298px',
                visibility: position === null ? 'hidden' : 'visible'
              }
            },
            // P0-18: no ChatGPT caption row — the picker starts with the DSH
            // permission options themselves.
            options.map((option) => {
              const copy = CHATGPT_PERMISSION_COPY[option.value] ?? {}
              return chatgptH(
                'button',
                {
                  key: option.value,
                  type: 'button',
                  role: 'menuitemradio',
                  'aria-checked': option.value === permissions?.currentValue ? 'true' : 'false',
                  className: `chatgpt-work-menu-item chatgpt-permission-row${copy.fullAccess === true ? ' is-full-access' : ''}`,
                  'data-cgpt-approval-option': option.value,
                  'data-cgpt-permission-row': option.value,
                  'data-current': option.value === permissions?.currentValue ? 'true' : 'false',
                  title: option.hostName,
                  onClick: () => switchTo(option.value)
                },
                chatgptH('span', {
                  className: 'chatgpt-permission-icon',
                  'aria-hidden': 'true',
                  dangerouslySetInnerHTML: { __html: copy.icon ?? CHATGPT_PERMISSION_ASK_SVG }
                }),
                chatgptH(
                  'span',
                  { className: 'chatgpt-permission-copy' },
                  chatgptH('span', { className: 'chatgpt-work-menu-label' }, option.label),
                  chatgptH(
                    'span',
                    { className: 'chatgpt-permission-description' },
                    copy.description ?? ''
                  )
                ),
                option.value === permissions?.currentValue
                  ? chatgptH('span', {
                      className: 'chatgpt-work-menu-check',
                      'aria-hidden': 'true',
                      dangerouslySetInnerHTML: { __html: CHATGPT_CHECK_SVG }
                    })
                  : null
              )
            }),
            note === ''
              ? null
              : chatgptH('div', { className: 'chatgpt-permission-note', 'data-cgpt-permission-note': '' }, note)
          ),
          document.body
        )
      : null
  )
}

/* P0-18b: switching projects calls the Host's `startSession`, which navigates
   to another Session and makes the Host mount a fresh hero card. The 180ms
   slide/fade in 60-hero.css is keyed off that mount, so it replayed as a visible
   flash while the card itself kept its 757×127 geometry. Suppress the enter
   animation for this navigation only; the next Chat↔Work click clears the flag
   in mode-ui.js so a product switch still fades. */
const CHATGPT_PROJECT_SWITCH_ATTR = 'data-chatgpt-project-switch'

/** Mark the next host hero mount as a project switch (no enter animation). */
function chatgptSuppressProjectSwitchAnimation() {
  if (typeof document === 'undefined' || document.body === null) return
  document.body.setAttribute(CHATGPT_PROJECT_SWITCH_ATTR, '')
}

/**
 * Pin the composer card to its pre-switch viewport rect while the Host swaps
 * Sessions. The remount briefly lays the hero title block out 6px shorter, and
 * the centred card moves 3px for a frame even with the enter animation off.
 * Position-fixing the card (rather than a JS counter-translate) closes the
 * mount/paint race: the new node carries the pin from its first layout. The pin
 * is released after the navigation settles, when flow position matches again.
 */
function chatgptPinComposerRect(duration = 1000, keepFocus = false) {
  if (typeof document === 'undefined' || typeof window === 'undefined') return
  const card = document.querySelector("[data-composer-card='true']")
  if (card === null) return
  const rect = card.getBoundingClientRect()
  const body = document.body
  body.style.setProperty('--cgpt-switch-card-top', `${rect.top}px`)
  body.style.setProperty('--cgpt-switch-card-left', `${rect.left}px`)
  body.style.setProperty('--cgpt-switch-card-width', `${rect.width}px`)
  body.style.setProperty('--cgpt-switch-card-height', `${rect.height}px`)
  body.setAttribute('data-chatgpt-project-pin', '')
  const end = performance.now() + duration
  const focusUntil = performance.now() + 900
  const tick = () => {
    const live = document.querySelector("[data-composer-card='true']")
    if (live !== null && keepFocus && performance.now() < focusUntil) {
      // Put the caret back on the incoming card before the pin releases; the
      // click on the menu has necessarily taken focus off the editor.
      const editor = live.querySelector("[data-composer-input='true']")
      if (editor !== null && document.activeElement !== editor) editor.focus({ preventScroll: true })
    }
    if (performance.now() < end) window.requestAnimationFrame(tick)
  }
  window.requestAnimationFrame(tick)
  window.setTimeout(() => {
    body.removeAttribute('data-chatgpt-project-pin')
    body.style.removeProperty('--cgpt-switch-card-top')
    body.style.removeProperty('--cgpt-switch-card-left')
    body.style.removeProperty('--cgpt-switch-card-width')
    body.style.removeProperty('--cgpt-switch-card-height')
  }, duration)
}

/** Focus the composer input without scrolling; retries until the new card lands. */
function chatgptFocusComposerInput() {
  if (typeof document === 'undefined') return
  const input = document.querySelector("[data-composer-card='true'] [data-composer-input='true']")
  if (input !== null && document.activeElement !== input) input.focus({ preventScroll: true })
}

/** Restore focus after the switch commits, not on the outgoing card. */
function chatgptRestoreComposerFocus(previousLabel, attempt = 0) {
  if (typeof window === 'undefined') return
  window.requestAnimationFrame(() => {
    const tool = document.querySelector("[data-cgpt-work-tool='project']")
    const input = document.querySelector("[data-composer-card='true'] [data-composer-input='true']")
    if (tool !== null && input !== null && tool.textContent !== previousLabel) {
      if (document.activeElement !== input) input.focus({ preventScroll: true })
      return
    }
    if (attempt < 40) chatgptRestoreComposerFocus(previousLabel, attempt + 1)
    else chatgptFocusComposerInput()
  })
}

/**
 * The 48px tool bar under the Work card (project + files).
 * @param {object} props - slot props plus `ctx`, `t`.
 * @returns {object|null} React element.
 */
function ChatgptWorkTools(props) {
  const { sessionId, useProjection, ctx, t } = props
  const preset = typeof useProjection === 'function' ? useProjection('agentPreset') : undefined
  const [menu, setMenu] = chatgptReact.useState(null) // 'project' | null
  const [position, setPosition] = chatgptReact.useState(null)
  const [projectQuery, setProjectQuery] = chatgptReact.useState('')
  const [projectBusy, setProjectBusy] = chatgptReact.useState(false)
  const [projectError, setProjectError] = chatgptReact.useState('')
  const projectRef = chatgptReact.useRef(null)
  const projectMenuHadFocus = chatgptReact.useRef(false)
  const menuRef = chatgptReact.useRef(null)
  const close = chatgptReact.useCallback(() => setMenu(null), [])
  useChatgptDismiss(menuRef, close, menu !== null)
  const blank = useChatgptSessionBlank(ctx, sessionId)

  // Only a new, still-empty conversation carries the tool row (reference).
  // P0-10B: a started session shows no project-name chip either; the project
  // already reads in the row's group label and the composer must stay one row.
  if (preset === CHAT_PRESET_ID) return null
  if (!blank) return null

  const openAt = (ref, kind, width, height) => {
    const rect = ref.current?.getBoundingClientRect()
    if (rect === undefined) return
    setPosition(chatgptPopoverAbove(rect, width, height))
    setMenu(kind)
  }

  const workspaces = ctx.get('workspaces')?.list?.getSnapshot?.()
  const projectItems = workspaces?.items ?? []
  const currentProject = projectItems.find((item) => (item.sessionIds ?? []).includes(sessionId))
  const currentProjectId = currentProject?.workspaceId
  /* P0-18: the button names the project once the session is bound to one. The
     auto-created first-use Workspace is the unselected state (the Host itself
     relabels `default-workspace`), so it keeps the 「选择项目」 call to action. */
  const projectLabel =
    currentProject === undefined || currentProject.title === 'default-workspace'
      ? CHATGPT_WORK_LABELS.project
      : currentProject.title ?? currentProject.workspaceId
  const visibleProjects = chatgptFilterProjectFiles(
    projectItems.map((item) => ({ path: item.title ?? item.workspaceId, name: item.title ?? item.workspaceId, workspaceId: item.workspaceId })),
    projectQuery
  ).map((item) => projectItems.find((project) => project.workspaceId === item.workspaceId)).filter(Boolean)
  /* M10: the reference's empty picker is one grey "没有项目" line. When there
     are no projects and no search term, the empty line already says it, so the
     separate "clear project" row would be a duplicate; keep that row whenever
     projects exist or a search is filtering them. */
  const showClearProjectRow = !(visibleProjects.length === 0 && projectQuery.trim() === '')

  const openProject = () => {
    setProjectError('')
    setProjectQuery('')
    const trigger = projectRef.current?.getBoundingClientRect()
    const card = document.querySelector('[data-composer-card="true"]')?.getBoundingClientRect()
    if (trigger === undefined || card === undefined) return
    // The project picker is wider than its trigger and must clear the whole
    // composer card, not just the tool row that sits under it.
    const position = chatgptPopoverAbove(card, 300, 174)
    position.left = Math.max(8, Math.min(window.innerWidth - 308, Math.round(trigger.left)))
    setPosition(position)
    setMenu('project')
  }

  const selectProject = (workspaceId) => {
    setMenu(null)
    setProjectQuery('')
    const restoreFocus = projectMenuHadFocus.current
    // P0-18b: clicking the project already in force must not navigate at all;
    // the old path called `startSession` even for the same Workspace, which
    // remounted the hero for no shape change.
    if (workspaceId === currentProjectId) {
      // Let the menu unmount and its own focus restore run before returning
      // focus to the editor; one rAF still loses that race.
      if (restoreFocus) window.setTimeout(() => window.requestAnimationFrame(chatgptFocusComposerInput), 120)
      return
    }
    const workspace = ctx.get('uiWorkspace')
    if (typeof workspace?.startSession !== 'function') return
    const previousLabel = projectLabel
    chatgptSuppressProjectSwitchAnimation()
    chatgptPinComposerRect(1000, restoreFocus)
    workspace.startSession(workspaceId)
    if (restoreFocus) chatgptRestoreComposerFocus(previousLabel)
  }

  const selectNoProject = async () => {
    setProjectError('')
    const restoreFocus = projectMenuHadFocus.current
    const previousLabel = projectLabel
    chatgptSuppressProjectSwitchAnimation()
    // Session creation is local; a 2s pin covers it without touching the
    // directory-picker path used by "new project".
    chatgptPinComposerRect(2000, restoreFocus)
    try {
      const started = await chatgptStartNoProjectSession(ctx)
      if (started && restoreFocus) chatgptRestoreComposerFocus(previousLabel)
      if (started) setMenu(null)
      else setProjectError('宿主未能创建无项目会话')
    } catch (reason) {
      setProjectError(reason instanceof Error && reason.message !== '' ? reason.message : '无法创建无项目会话')
    }
  }

  const createProject = async () => {
    if (projectBusy) return
    setProjectBusy(true)
    setProjectError('')
    const restoreFocus = projectMenuHadFocus.current
    const previousLabel = projectLabel
    try {
      const created = await chatgptCreateProject(ctx)
      if (created !== null) {
        setMenu(null)
        // Pin only once the directory picker and Host creation have finished;
        // starting it before the picker would hold a fixed card for its whole
        // lifetime and could expire before the actual navigation.
        chatgptSuppressProjectSwitchAnimation()
        chatgptPinComposerRect(1000, restoreFocus)
        ctx.get('uiWorkspace')?.startSession?.(created.workspaceId)
        if (restoreFocus) chatgptRestoreComposerFocus(previousLabel)
      }
    } catch (reason) {
      setProjectError(reason instanceof Error && reason.message !== '' ? reason.message : '新建项目失败')
    } finally {
      setProjectBusy(false)
    }
  }

  const pickFiles = () => {
    if (typeof chatgptOpenFilePicker === 'function') {
      chatgptOpenFilePicker(sessionId)
      return
    }
    document.querySelector('[data-composer-card="true"] input[type="file"]')?.click()
  }

  return chatgptH(
    chatgptReact.Fragment,
    null,
    chatgptH(
      'div',
      { className: 'chatgpt-work-tools', 'data-cgpt-work-tools': '', 'data-mode': 'agent' },
      chatgptH(
        'div',
        { className: 'chatgpt-work-tools-left' },
        chatgptH(
          'button',
          {
            ref: projectRef,
            type: 'button',
            className: 'chatgpt-work-tool',
            'data-cgpt-work-tool': 'project',
            'aria-haspopup': 'menu',
            'aria-expanded': menu === 'project' ? 'true' : 'false',
            // pointerdown fires before the button takes focus, so this is the
            // only moment that can tell whether the editor had focus.
            onPointerDown: () => {
              const active = typeof document === 'undefined' ? null : document.activeElement
              projectMenuHadFocus.current = active?.closest?.("[data-composer-input='true']") !== null
            },
            onMouseDown: (event) => event.preventDefault(),
            onClick: openProject
          },
          chatgptH('span', {
            className: 'chatgpt-work-tool-icon',
            'aria-hidden': 'true',
            dangerouslySetInnerHTML: { __html: chatgptRailGlyph('folder') }
          }),
          chatgptH('span', { className: 'chatgpt-work-tool-label' }, projectLabel)
        ),
        chatgptH(
          'button',
          {
            type: 'button',
            className: 'chatgpt-work-tool',
            'data-cgpt-work-tool': 'files',
            onClick: pickFiles
          },
          chatgptH('span', {
            className: 'chatgpt-work-tool-icon',
            'aria-hidden': 'true',
            dangerouslySetInnerHTML: { __html: chatgptRailGlyph('paperclip') }
          }),
          chatgptH('span', { className: 'chatgpt-work-tool-label' }, CHATGPT_WORK_LABELS.files)
        ),
      )
    ),
    menu === 'project'
      ? chatgptReactDom.createPortal(
          chatgptH(
            'div',
            {
              ref: menuRef,
              className: 'chatgpt-work-menu chatgpt-project-picker',
              'data-cgpt-work-menu': 'project',
              role: 'menu',
              'aria-label': t('work.tools.project'),
              style: {
                left: `${position?.left ?? 0}px`,
                top: `${position?.top ?? 0}px`,
                /* M10: reference frame is 261px wide (device 1197..1718 @2×),
                   not 300. The token keeps the geometry in one place. */
                width: 'var(--cgpt-project-picker-width, 261px)',
                visibility: position === null ? 'hidden' : 'visible'
              }
            },
            chatgptH(
              'div',
              { className: 'chatgpt-project-picker-search' },
              chatgptH('span', {
                'aria-hidden': 'true',
                dangerouslySetInnerHTML: { __html: CHATGPT_SESSION_ICONS.search }
              }),
              chatgptH('input', {
                autoFocus: true,
                type: 'search',
                value: projectQuery,
                placeholder: '搜索项目',
                'aria-label': '搜索项目',
                onChange: (event) => setProjectQuery(event.target.value),
                onKeyDown: (event) => {
                  if (event.key === 'Escape') {
                    event.preventDefault()
                    close()
                  }
                }
              })
            ),
            projectError === ''
              ? null
              : chatgptH('p', { className: 'chatgpt-project-picker-error', role: 'alert' }, projectError),
            chatgptH(
              'button',
              {
                type: 'button',
                role: 'menuitem',
                className: 'chatgpt-work-menu-item chatgpt-project-picker-new',
                'data-cgpt-project-new': '',
                disabled: projectBusy,
                onClick: () => void createProject()
              },
              chatgptH('span', {
                className: 'chatgpt-work-tool-icon',
                'aria-hidden': 'true',
                dangerouslySetInnerHTML: { __html: CHATGPT_SESSION_ICONS.plus }
              }),
              chatgptH('span', { className: 'chatgpt-work-menu-label' }, '新建项目'),
              projectBusy ? chatgptH('span', { className: 'chatgpt-project-picker-busy' }, '等待选择…') : null
            ),
            visibleProjects.length === 0
              ? chatgptH('div', { className: 'chatgpt-work-menu-empty' }, projectQuery.trim() === '' ? '没有项目' : '没有匹配的项目')
              : visibleProjects.map((item) =>
                  chatgptH(
                    'button',
                    {
                      key: item.workspaceId,
                      type: 'button',
                      role: 'menuitemradio',
                      'aria-checked': item.workspaceId === currentProjectId ? 'true' : 'false',
                      className: 'chatgpt-work-menu-item chatgpt-project-picker-item',
                      'data-cgpt-project-option': item.workspaceId,
                      title: item.path ?? item.title,
                      // Keep the editor focused while choosing; the menu is a
                      // transient command surface, not a text destination.
                      onMouseDown: (event) => event.preventDefault(),
                      onClick: () => selectProject(item.workspaceId)
                    },
                    chatgptH('span', {
                      className: 'chatgpt-work-tool-icon',
                      'aria-hidden': 'true',
                      dangerouslySetInnerHTML: { __html: chatgptRailGlyph('folder') }
                    }),
                    chatgptH('span', { className: 'chatgpt-work-menu-label' }, item.title ?? item.workspaceId),
                    item.workspaceId === currentProjectId
                      ? chatgptH('span', {
                          className: 'chatgpt-work-menu-check',
                          'aria-hidden': 'true',
                          dangerouslySetInnerHTML: { __html: CHATGPT_CHECK_SVG }
                        })
                      : null
                  )
                ),
            showClearProjectRow
              ? chatgptH('div', { className: 'chatgpt-project-picker-separator' })
              : null,
            showClearProjectRow
              ? chatgptH(
                  'button',
                  {
                    type: 'button',
                    role: 'menuitemradio',
                    'aria-checked': currentProjectId === undefined ? 'true' : 'false',
                    className: 'chatgpt-work-menu-item chatgpt-project-picker-none',
                    'data-cgpt-project-none': '',
                    onClick: () => void selectNoProject()
                  },
                  chatgptH('span', {
                    className: 'chatgpt-work-tool-icon',
                    'aria-hidden': 'true',
                    dangerouslySetInnerHTML: { __html: CHATGPT_SESSION_ICONS.folder }
                  }),
                  chatgptH('span', { className: 'chatgpt-work-menu-label' }, '没有项目')
                )
              : null
          ),
          document.body
        )
      : null
  )
}

/** Chat's quiet file entry. Work uses the labelled tool row instead. */
/**
 * P0-16: Chat's compact effort seat.
 *
 * The reference row ends with 「极高 ⌄」. The Host renders
 * `conversation.input.right` only when a session exists, and the blank page is
 * sessionless, so the pill is mounted from `conversation.input.left` (the one
 * in-card seat the blank composer does render) and laid out at the row's right
 * edge by CSS.
 *
 * P0-17: an established Chat conversation now gets the same compact trigger,
 * but from `conversation.input.right` — that seat is inside the Host's trailing
 * group, immediately before the send disc. `place` keeps the two seats from
 * painting a duplicate control: the left seat owns the blank hero, the right
 * seat owns every started Chat conversation.
 * @param {object} props - slot props plus `ctx`, `catalog`, and optional `place`.
 * @returns {object|null} React element.
 */
function ChatgptChatEffort(props) {
  const { sessionId, useProjection, ctx } = props
  const preset = typeof useProjection === 'function' ? useProjection('agentPreset') : undefined
  const blank = useChatgptSessionBlank(ctx, sessionId)
  if (preset !== CHAT_PRESET_ID) return null
  if (props.place === 'right' ? blank : !blank) return null
  return chatgptH(ChatgptModelControl, { ...props, compact: true })
}

/** P0-16: the reference's empty Chat row opens with a `+`, not the paperclip of
 *  a started conversation. 20px box, 1.5px round-capped strokes (the web's
 *  plus glyph measures 15×15 ink inside a 20×20 frame). */
const CHATGPT_ADD_SVG =
  '<svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M10 2.75v14.5"/><path d="M2.75 10h14.5"/></svg>'

/**
 * Empty Chat's left control: the reference's `+`.
 * @param {object} props - slot props (`sessionId`, `useProjection`) plus `ctx`.
 * @returns {object|null} React element, or null outside a blank Chat session.
 */
function ChatgptChatFileEntry(props) {
  const { sessionId, useProjection } = props
  const preset = typeof useProjection === 'function' ? useProjection('agentPreset') : undefined
  if (preset !== CHAT_PRESET_ID) return null
  return chatgptH(
    'button',
    {
      type: 'button',
      className: 'chatgpt-chat-files',
      'data-cgpt-chat-files': '',
      'aria-label': '添加文件',
      title: '添加文件',
      onClick: () => {
        if (typeof chatgptOpenFilePicker === 'function') chatgptOpenFilePicker(sessionId)
        else document.querySelector('[data-composer-card="true"] input[type="file"]')?.click()
      }
    },
    chatgptH('span', {
      'aria-hidden': 'true',
      dangerouslySetInnerHTML: { __html: CHATGPT_ADD_SVG }
    })
  )
}

/**
 * Keep Chat's composer out of the Host's "Choose workspace" state.
 *
 * P0-17: a Chat session is created in the default Workspace so the Host mounts
 * an editor. If an older Session still renders without one (created before this
 * fix, or a draft whose workspace was cleared), the composer becomes an inert
 * trigger: no Lexical editor, and every click opens the Workspace picker. In
 * Chat mode that picker is not an entry point we want at all, so the click is
 * claimed here and a proper Chat session (workspace-bound, see
 * `chatgptStartProductSession`) is started instead. Work mode is untouched:
 * the listener returns before looking at the DOM.
 *
 * @param {object} ctx - client Cordis context.
 * @returns {() => void} disposer removing both capture listeners.
 */
function chatgptMountChatWorkspaceGuard(ctx) {
  let busy = false
  const claim = (event) => {
    if (document.body.getAttribute('data-chatgpt-mode') !== CHAT_PRESET_ID) return
    const target = event.target
    if (!(target instanceof Element)) return
    if (target.closest("button, a, input, textarea, [role='button']") !== null) return
    const card = target.closest("[data-composer-card='true']")
    if (card === null || !card.matches("[class*='_cardWorkspaceTrigger']")) return
    event.preventDefault()
    event.stopPropagation()
    event.stopImmediatePropagation()
    if (busy) return
    busy = true
    void chatgptStartProductSession(ctx, { agentPreset: CHAT_PRESET_ID })
      .catch((reason) => {
        console.warn(`[dsh-chatgpt-ui] chat composer could not leave the workspace state: ${String(reason?.message ?? reason)}`)
      })
      .finally(() => {
        busy = false
      })
  }
  document.addEventListener('pointerdown', claim, true)
  document.addEventListener('click', claim, true)
  return () => {
    document.removeEventListener('pointerdown', claim, true)
    document.removeEventListener('click', claim, true)
  }
}

/**
 * P0-21: one content-height measurement for the Chat and Work composers.
 *
 * The Host editor is a contenteditable div, so its own `scrollHeight` is the
 * content height at every stage — including IME composition, paste, explicit
 * newlines and a soft-wrapped long line. CSS owns the actual box: the Chat
 * capsule and the hero keep their 52px minimum and grow from this content;
 * Chat's last rule below is the only extra bit (align a multiline editor to
 * the top and pin its overlay button row to the bottom).
 *
 * The measurement is event-driven, not just `input`: keydown and paste schedule
 * before their edit lands; compositionend covers IME text that arrives without a
 * normal key event; window resize re-checks the 40vh side of the cap; a
 * MutationObserver catches the Host mounting a composer for a new Session. No
 * height is cached, so deletion and soft wrap take the same read.
 *
 * @returns {() => void} disposer removing listeners and observers.
 */
function chatgptMountComposerAutoGrow() {
  let frame = 0
  let resizeObserver = null
  const observedInputs = new WeakSet()
  const eventNames = ['input', 'keydown', 'paste', 'compositionend', 'focusin']

  const singleLineHeight = (input) => {
    const line = Number.parseFloat(window.getComputedStyle(input).lineHeight)
    return Number.isFinite(line) && line > 0 ? line + 1 : 28
  }

  const capHeight = (card) => {
    const host = Number.parseFloat(window.getComputedStyle(card).getPropertyValue('--dsh-composer-text-max-height'))
    const native = Number.isFinite(host) && host > 0 ? host : 336
    return Math.min(native, window.innerHeight * 0.4)
  }

  const sync = () => {
    frame = 0
    for (const card of document.querySelectorAll("[data-composer-card='true']")) {
      const scroll = card.querySelector("[data-input-scroll='true']")
      const input = card.querySelector("[data-composer-input='true']")
      if (scroll === null || input === null) continue
      const style = window.getComputedStyle(input)
      const verticalPadding = Number.parseFloat(style.paddingTop) + Number.parseFloat(style.paddingBottom)
      const content = input.scrollHeight - (Number.isFinite(verticalPadding) ? verticalPadding : 0)
      const multiline = content > singleLineHeight(input)
      const capped = content > capHeight(card) + 1
      card.toggleAttribute('data-cgpt-composer-grow', multiline)
      card.toggleAttribute('data-cgpt-composer-capped', capped)
      // The blank hero is centred by the Host. Keep its visual bottom edge on
      // the original baseline by rising half the growth; the started capsule
      // is already anchored by the Host composer stack.
      if (card.closest("[class*='_composerHero']") !== null) {
        const base = Number.parseFloat(window.getComputedStyle(card).getPropertyValue('--cgpt-composer-empty-height')) || 52
        const grown = card.getBoundingClientRect().height
        card.style.setProperty('--cgpt-hero-rise', `${Math.max(0, (grown - base) / 2)}px`)
      } else {
        card.style.removeProperty('--cgpt-hero-rise')
      }
      // A cleared/soft-shrunk editor must not keep a stale scroll offset.
      if (!capped && scroll.scrollTop !== 0) scroll.scrollTop = 0
      if (resizeObserver !== null && !observedInputs.has(input)) {
        observedInputs.add(input)
        resizeObserver.observe(input)
      }
    }
  }

  const schedule = () => {
    if (frame !== 0) return
    frame = window.requestAnimationFrame(sync)
  }

  const onEditorEvent = (event) => {
    if (!(event.target instanceof Element)) return
    if (event.target.closest("[data-composer-card='true']") === null) return
    schedule()
  }

  for (const name of eventNames) document.addEventListener(name, onEditorEvent, true)
  const onResize = () => schedule()
  window.addEventListener('resize', onResize)
  if (typeof ResizeObserver === 'function') resizeObserver = new ResizeObserver(schedule)
  const cards = new MutationObserver(schedule)
  cards.observe(document.documentElement, { childList: true, subtree: true })
  sync()

  return () => {
    if (frame !== 0) window.cancelAnimationFrame(frame)
    for (const name of eventNames) document.removeEventListener(name, onEditorEvent, true)
    window.removeEventListener('resize', onResize)
    resizeObserver?.disconnect()
    cards.disconnect()
  }
}

/**
 * Register the Work composer seats.
 * @param {object} ctx - client Cordis context (`slots`, `remote.session`,
 *   `remote.permissionPresets`, `sessions`, `workspaces`, `uiWorkspace`).
 * @returns {() => void} disposer removing both registrations.
 */
function mountChatgptWorkComposer(ctx) {
  const catalog = createChatgptAsyncStore(() => ctx.remote.session.modelCatalog())
  const approvals = createChatgptAsyncStore(() => ctx.remote.permissionPresets.catalog())
  const disposers = []
  disposers.push(
    ctx.slots.inject('conversation.input.right', () =>
      ctx.slots.register(
        {
          name: 'conversation.input.right',
          id: 'chatgpt-work-controls',
          order: 10,
          locale: CHATGPT_LOCALE_NS
        },
        (props) => chatgptH(ChatgptModelControl, { ...props, ctx, catalog })
      )
    )
  )
  disposers.push(
    ctx.slots.inject('conversation.input.left', () =>
      ctx.slots.register(
        {
          name: 'conversation.input.left',
          id: 'chatgpt-work-tools',
          order: 20,
          locale: CHATGPT_LOCALE_NS
        },
        (props) => chatgptH(ChatgptWorkTools, { ...props, ctx })
      )
    )
  )
  /* P0-10B: the permission chip is its own seat in the card action row, after
     the attachment entry. P0-18 moves the blank-Work instance into the bottom
     tool bar (fourth button) and keeps this seat for a started Work session. */
  disposers.push(
    ctx.slots.inject('conversation.input.left', () =>
      ctx.slots.register(
        {
          name: 'conversation.input.left',
          id: 'chatgpt-permission',
          order: 30,
          locale: CHATGPT_LOCALE_NS
        },
        (props) => chatgptH(ChatgptPermissionControl, { ...props, ctx, approvals })
      )
    )
  )
  disposers.push(
    ctx.slots.inject('conversation.input.left', () =>
      ctx.slots.register(
        {
          name: 'conversation.input.left',
          id: 'chatgpt-chat-files',
          order: 10,
          locale: CHATGPT_LOCALE_NS
        },
        (props) => chatgptH(ChatgptChatFileEntry, { ...props, ctx })
      )
    )
  )
  /* P0-16: the blank Chat row's trailing effort control (see ChatgptChatEffort). */
  disposers.push(
    ctx.slots.inject('conversation.input.left', () =>
      ctx.slots.register(
        {
          name: 'conversation.input.left',
          id: 'chatgpt-chat-effort',
          order: 40,
          locale: CHATGPT_LOCALE_NS
        },
        (props) => chatgptH(ChatgptChatEffort, { ...props, ctx, catalog })
      )
    )
  )
  /* P0-17: a started Chat conversation takes the same compact trigger from the
     trailing seat, directly before the send disc. */
  disposers.push(
    ctx.slots.inject('conversation.input.right', () =>
      ctx.slots.register(
        {
          name: 'conversation.input.right',
          id: 'chatgpt-chat-effort-right',
          order: 5,
          locale: CHATGPT_LOCALE_NS
        },
        (props) => chatgptH(ChatgptChatEffort, { ...props, ctx, catalog, place: 'right' })
      )
    )
  )
  disposers.push(chatgptMountComposerAutoGrow())
  disposers.push(chatgptMountChatWorkspaceGuard(ctx))

  return () => {
    for (const dispose of disposers) dispose()
  }
}
