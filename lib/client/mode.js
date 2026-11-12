/**
 * dsh-chatgpt-ui — mode actions (browser half fragment).
 *
 * Turns the pure decision from `lib/shared/mode-core.mjs` into host calls, and
 * owns the small roster store the switcher reads (which presets this deployment
 * actually offers, whether dot's panel is mounted). Nothing here decides
 * permissions: `body[data-chatgpt-mode]` is display-only, the Host policy owns
 * the real sandbox and approval.
 *
 * This file is a fragment: no import/export statements — scripts/build-client.mjs
 * concatenates it inside the module-loader factory (mode-core.mjs is inlined
 * above it).
 */

/**
 * Whether dot's panel is registered right now.
 *
 * Registration is optional: without dsh-super-agent the `main` slot has no
 * `super-agent` key, and the switcher must hide the segment instead of calling
 * `selectPanel` (which throws on an unknown key).
 * @param {object} ctx - client Cordis context (needs `slots`).
 * @returns {boolean} true when dot's panel can be selected.
 */
function chatgptDotPanelAvailable(ctx) {
  try {
    const entries = ctx.slots.entriesOfSlot === undefined ? [] : ctx.slots.entriesOfSlot('main')
    return (entries ?? []).some((entry) => {
      const options = entry?.options ?? {}
      return (options.key ?? options.id) === DOT_PANEL_ID
    })
  } catch {
    return false
  }
}

/**
 * Read the deployment's presets.
 *
 * The `agent` segment means "the deployment's default preset", which is a
 * different id on every deployment (`standard`, `minimal`, …) — the roster says
 * which one through `isDefault`. The `chat` segment is this package's own id.
 * @param {object} ctx - client Cordis context (needs `remote.agentPresets`).
 * @returns {Promise<{ presets: string[], agentPreset: string|null }>} roster projection.
 */
async function chatgptPresetRoster(ctx) {
  try {
    const result = await ctx.remote.agentPresets.list()
    if (result?.ok !== true) return { presets: [], agentPreset: null }
    const rows = result.value?.presets ?? []
    const presets = rows.map((preset) => preset.id)
    const fallback = rows.find((preset) => preset.id !== CHAT_PRESET_ID)
    const defaultRow = rows.find((preset) => preset.isDefault === true && preset.id !== CHAT_PRESET_ID)
    return { presets, agentPreset: (defaultRow ?? fallback)?.id ?? null }
  } catch {
    return { presets: [], agentPreset: null }
  }
}

/**
 * Small observable the switcher subscribes to.
 *
 * `useSyncExternalStore` needs a stable snapshot object, so a refresh replaces
 * the whole state instead of mutating it.
 * @param {object} ctx - client Cordis context.
 * @returns {{ subscribe: (fn: () => void) => () => void, get: () => object, load: () => Promise<void>, refresh: () => void }} the store.
 */
function createChatgptModeRoster(ctx) {
  const listeners = new Set()
  let state = { status: 'idle', presets: [], agentPreset: null, dotAvailable: chatgptDotPanelAvailable(ctx) }
  const emit = () => {
    for (const listener of listeners) listener()
  }
  const refresh = () => {
    const dotAvailable = chatgptDotPanelAvailable(ctx)
    if (dotAvailable === state.dotAvailable) return
    state = { ...state, dotAvailable }
    emit()
  }
  const load = async () => {
    if (state.status === 'loading') return
    state = { ...state, status: 'loading' }
    emit()
    const roster = await chatgptPresetRoster(ctx)
    state = { status: 'ready', ...roster, dotAvailable: chatgptDotPanelAvailable(ctx) }
    emit()
  }
  return {
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    get: () => state,
    load,
    refresh
  }
}

/**
 * The Workspace a Chat Session is opened in.
 *
 * The Host composer is only editable when the Session names a Workspace or a
 * directory *and* the Workspace store has not settled: its hero chooses
 * `sessionWorkspace` over `cwd` once `workspaces.phase === 'ready'`, so an
 * ungrouped Session has no `chipTitle`, renders the inert "Choose workspace"
 * trigger and never mounts an editor (P0-17: clicking it only opened the
 * picker). Chat therefore opens in this deployment's default (first) Workspace.
 * The sidebar still renders Chat outside project groups — see
 * `chatgptBuildSessionSections`'s `excludeFromProjects`.
 *
 * @param {object} ctx - client Cordis context with `workspaces`.
 * @returns {{ workspaceId?: string, path?: string }|undefined} Workspace row.
 */
function chatgptChatWorkspace(ctx) {
  try {
    const items = ctx.get('workspaces')?.list?.getSnapshot?.()?.items ?? []
    return items[0]
  } catch {
    return undefined
  }
}

/**
 * Start a session for a product.
 *
 * Chat is displayed outside every 项目 group (the sidebar filters it, and the
 * hero's workspace chip is hidden), but the Host needs a Workspace to mount an
 * editable composer for a blank Session. Work keeps the Host's workspace flow,
 * where `startSession` reuses the blank of the selected project.
 *
 * @param {object} ctx - client Cordis context with sessions/uiWorkspace.
 * @param {{ agentPreset?: string, workspaceId?: string, cwd?: string }} [options] - preset, target project and Chat workspace.
 * @returns {Promise<string|undefined>} the created Chat session id, when one was created.
 */
async function chatgptStartProductSession(ctx, options) {
  const agentPreset = options?.agentPreset
  const workspaceId = options?.workspaceId
  const sessions = typeof ctx.get === 'function' ? ctx.get('sessions') : undefined
  const workspace = typeof ctx.get === 'function' ? ctx.get('uiWorkspace') : ctx.uiWorkspace
  if (agentPreset === CHAT_PRESET_ID && typeof sessions?.create === 'function') {
    const chatWorkspace = chatgptChatWorkspace(ctx)
    const request = { agentPreset }
    if (typeof chatWorkspace?.workspaceId === 'string' && chatWorkspace.workspaceId !== '') {
      request.workspaceId = chatWorkspace.workspaceId
    } else if (typeof chatWorkspace?.path === 'string' && chatWorkspace.path !== '') {
      request.cwd = chatWorkspace.path
    }
    let id
    try {
      id = await chatgptRunHostCall(ctx, 'session.create (chat)', () => sessions.create(request))
    } catch (error) {
      if (error?.name === 'ChatgptConnectionError') throw error
      // A deployment with no Workspace at all still gets a Chat Session; it
      // stays ungrouped and the composer falls back to the Host's picker.
      if (request.workspaceId === undefined && request.cwd === undefined) throw error
      id = await chatgptRunHostCall(ctx, 'session.create (chat fallback)', () => sessions.create({ agentPreset }))
    }
    workspace?.openSession?.(id)
    return id
  }
  if (agentPreset === undefined) workspace.startSession(workspaceId)
  else workspace.startSession(workspaceId, { agentPreset })
  return undefined
}

/**
 * The deployment's Work preset (the default non-Chat preset).
 * @param {object} ctx - client Cordis context (needs `remote.agentPresets`).
 * @returns {Promise<string|undefined>} preset id, undefined for the Host default.
 */
async function chatgptWorkPreset(ctx) {
  const roster = await chatgptPresetRoster(ctx)
  return roster.agentPreset ?? undefined
}

/**
 * Start a fresh Work conversation inside one project.
 *
 * `clearPreviousDraft` is deliberate: the project-row shortcut promises a new
 * conversation, so a blank draft left in the project must not carry its text
 * or attachments into the new Session.
 * @param {object} ctx - client Cordis context with uiWorkspace.
 * @param {string} workspaceId - target Workspace.
 * @param {string|undefined} agentPreset - Work preset; undefined means Host default.
 * @returns {boolean} whether the Host navigation call was available.
 */
function chatgptStartWorkSession(ctx, workspaceId, agentPreset) {
  const workspace = typeof ctx.get === 'function' ? ctx.get('uiWorkspace') : ctx.uiWorkspace
  if (typeof workspace?.startSession !== 'function') return false
  const options = { clearPreviousDraft: true }
  if (typeof agentPreset === 'string' && agentPreset !== '') options.agentPreset = agentPreset
  workspace.startSession(workspaceId, options)
  return true
}

/**
 * Run one actionable decision.
 *
 * - `select`  → in-place preset switch; legal only while the session is blank
 *               (the host rejects it otherwise with `agent-preset/locked`).
 * - `new-session` → a fresh session under the requested preset; a started
 *               session's composition is immutable, so this is the only path.
 * - `panel`   → select dot's main panel without touching any session.
 *
 * @param {object} ctx - client Cordis context.
 * @param {{ kind: string, preset?: string, panelId?: string }} decision - from `decideModeAction`.
 * @param {{ sessionId?: string, workspaceId?: string }} [options] - click context.
 * @returns {Promise<void>} resolves when the action completed or was skipped.
 */
async function chatgptApplyDecision(ctx, decision, options) {
  if (decision === undefined || decision === null) return
  if (decision.kind === 'select' || decision.kind === 'new-session') {
    // Every manual switch also becomes the default for the NEXT new session.
    chatgptWriteStoredProduct(productOfPreset(decision.preset), decision.preset)
  }
  if (decision.kind === 'select') {
    if (options?.sessionId === undefined) return
    // P1-e: the Host's `select` answers over HTTP even when the mux socket is
    // dead, so the call settling is not proof the UI changed. Check the value
    // that travels over the socket and recover instead of failing silently.
    const result = await chatgptRunHostCall(ctx, 'agentPresets.select', () =>
      ctx.remote.agentPresets.select(options.sessionId, decision.preset)
    )
    if (result?.ok === false) {
      const message = typeof result.error?.message === 'string' ? result.error.message : '宿主拒绝了模式切换'
      chatgptShowConnectionToast(`模式切换失败：${message}`)
      return
    }
    // A blank session may not carry an `agentPreset` projection yet; in that
    // case the switcher paints from the stored product and there is nothing to
    // wait for. Only a value that already existed can be expected to change.
    if (chatgptKnownPreset(ctx, options.sessionId) !== undefined) {
      await chatgptConfirmPresetApplied(ctx, options.sessionId, decision.preset)
    }
    return
  }
  if (decision.kind === 'new-session') {
    await chatgptRunHostCall(
      ctx,
      'start new session',
      () => chatgptStartProductSession(ctx, { agentPreset: decision.preset, workspaceId: options?.workspaceId }),
      { timeoutMs: 20000 }
    )
    // The new session's preset arrives over the same socket as every other
    // projection; a dead carrier would leave the segment where it was.
    await chatgptConfirmModeAttribute(ctx, decision.preset === CHAT_PRESET_ID ? MODE_CHAT : MODE_AGENT)
    return
  }
  if (decision.kind === 'panel') {
    if (!chatgptSelectPanel(ctx, decision.panelId)) {
      console.warn('[dsh-chatgpt-ui] dot panel unavailable: the host did not accept the panel id')
    }
  }
}

/** localStorage key: the product a NEW session starts in (set from the brand switcher). */
const CHATGPT_PRODUCT_STORAGE_KEY = 'dsh-chatgpt-ui:product-default'

/**
 * Read the remembered default product.
 *
 * The brand switcher owns "which product do new sessions open in"; every other
 * control (the empty-state segment, the rail menu) mirrors it. Nothing is
 * persisted on the Host: this is a display default, and the real mode of a
 * session remains its `agentPreset` projection.
 * @returns {{ mode: 'chat'|'agent', preset: string|null }|null} stored choice, or null.
 */
function chatgptReadStoredProduct() {
  try {
    if (typeof window === 'undefined' || window.localStorage === undefined) return null
    const raw = window.localStorage.getItem(CHATGPT_PRODUCT_STORAGE_KEY)
    if (raw === null) return null
    const parsed = JSON.parse(raw)
    if (parsed === null || typeof parsed !== 'object') return null
    const mode = parsed.mode === MODE_CHAT || parsed.mode === MODE_AGENT ? parsed.mode : null
    if (mode === null) return null
    const preset = typeof parsed.preset === 'string' && parsed.preset !== '' ? parsed.preset : null
    return { mode, preset }
  } catch {
    return null
  }
}

/**
 * Remember the default product for the next new session.
 * @param {'chat'|'agent'} mode - chosen product.
 * @param {string|null|undefined} preset - its preset id (null keeps the deployment default).
 * @returns {void}
 */
function chatgptWriteStoredProduct(mode, preset) {
  try {
    if (typeof window === 'undefined' || window.localStorage === undefined) return
    window.localStorage.setItem(
      CHATGPT_PRODUCT_STORAGE_KEY,
      JSON.stringify({ mode, preset: typeof preset === 'string' && preset !== '' ? preset : null })
    )
  } catch {
    // A full/disabled store must not block switching.
  }
}

/**
 * Preset a new session should start with.
 *
 * P0-19b: the top 新聊天 path (and the rail's home button) uses the mode the
 * user chose last, persisted across reloads. With nothing stored yet the first
 * new chat is Chat; after that the in-page capsule and the brand switcher keep
 * `dsh-chatgpt-ui:product-default` current.
 * @returns {string|undefined} `chat`, the stored Work preset, or undefined for the deployment default.
 */
/**
 * Current `agentPreset` projection of a session, from either store the
 * switcher reads. `undefined` means the session has no preset projection yet.
 * @param {object} ctx - client Cordis context.
 * @param {string|undefined} sessionId - session to read.
 * @returns {string|undefined} preset id.
 */
function chatgptKnownPreset(ctx, sessionId) {
  if (typeof sessionId !== 'string') return undefined
  try {
    const sessions = typeof ctx.get === 'function' ? ctx.get('sessions') : undefined
    const listed = sessions?.getListSnapshot?.()?.projectionsBySession?.[sessionId]?.values
    return listed?.agentPreset ?? sessions?.projectionValues?.(sessionId)?.agentPreset
  } catch {
    return undefined
  }
}

function chatgptDefaultPreset() {
  const stored = chatgptReadStoredProduct()
  if (stored === null) return CHAT_PRESET_ID
  if (stored.mode === MODE_CHAT) return CHAT_PRESET_ID
  return stored.preset ?? undefined
}

/**
 * Product of the retained main session, for the sidebar's display rules.
 *
 * A primitive string keeps `useSessions` on a stable snapshot. With no session
 * retained (first paint, panels open) the remembered default is the answer, so
 * choosing Chat in the brand menu hides 项目 before the first session exists.
 * @param {object|undefined} list - `useSessions` snapshot.
 * @returns {'chat'|'agent'} product mode.
 */
function chatgptProductSelector(list) {
  const rows = list?.byId ?? {}
  for (const row of Object.values(rows)) {
    if ((row?.retainedBy?.mainView ?? 0) <= 0) continue
    const projection = list?.projectionsBySession?.[row.id]?.values ?? row?.projectionValues
    return productOfPreset(projection?.agentPreset)
  }
  return chatgptReadStoredProduct()?.mode ?? MODE_AGENT
}

/**
 * Paint the session's mode onto `<body>` for display-only rules.
 * @param {string|null|undefined} preset - `agentPreset` projection value.
 * @returns {void}
 */
function chatgptPaintMode(preset) {
  if (typeof document === 'undefined' || document.body === null) return
  document.body.setAttribute('data-chatgpt-mode', modeAttribute(preset))
}

/** Remove the display attribute (its absence means "host default"). */
function chatgptClearMode() {
  if (typeof document === 'undefined' || document.body === null) return
  document.body.removeAttribute('data-chatgpt-mode')
}
