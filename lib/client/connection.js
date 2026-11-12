/**
 * dsh-chatgpt-ui — connection watchdog (browser half fragment).
 *
 * P1-e exists because a DSH Web tab can come back from a sleep/freeze with a
 * half-open mux WebSocket: the browser never fires `close`, the Host's
 * `connection` service still reports `connected`, unary HTTP RPCs keep
 * succeeding, and every UI update that travels over the socket (session list,
 * `agentPreset` projection, control baseline) silently stops. The user sees
 * clicks that "do nothing" until a manual reload.
 *
 * The Host owns that defect and this package must not patch it. What the skin
 * can do is notice the two moments where the defect becomes observable:
 *
 *   1. the user comes back (visibilitychange after ≥5min hidden, freeze/resume,
 *      bfcache pageshow) — rebuild the generation before the first click;
 *   2. the user clicks after ≥5min without any pointer/key event — rebuild
 *      first, then let the handler run against a fresh socket;
 *   3. a host call never settles (no timeout in the RPC layer) — fail loudly,
 *      reconnect, and reload the page once if the socket does not come back.
 *
 * Everything is logged to `console` and to `window.__dshChatgptConnection`
 * (`docs/p1e.json` reads that ring from CDP). Nothing here runs on a healthy
 * page: under the away threshold the watchdog is a no-op.
 *
 * This file is a fragment: no import/export statements — scripts/build-client.mjs
 * concatenates it inside the module-loader factory (connection-core.mjs is
 * inlined above it).
 */

/** Key holding the last automatic reload stamp (sessionStorage, same tab). */
const CHATGPT_RELOAD_STORAGE_KEY = 'dsh-chatgpt-ui:auto-reload-at'

/** Ring size for the CDP-readable connection log. */
const CHATGPT_CONNECTION_LOG_LIMIT = 80

/**
 * The Host connection service, when this deployment has one.
 * @param {object} ctx - client Cordis context.
 * @returns {object|undefined} `ctx.connection`, or undefined.
 */
function chatgptConnectionService(ctx) {
  try {
    return typeof ctx?.get === 'function' ? ctx.get('connection') : undefined
  } catch {
    return undefined
  }
}

/**
 * Record one connection decision for the console and for CDP evidence.
 * @param {object} ctx - client Cordis context.
 * @param {'info'|'warn'} level - log level.
 * @param {string} message - one-line description.
 * @param {object} [extra] - extra fields merged into the ring entry.
 * @returns {void}
 */
function chatgptConnectionLog(ctx, level, message, extra) {
  const connection = chatgptConnectionService(ctx)
  const entry = {
    t: Date.now(),
    level,
    message,
    state: connection?.state?.getSnapshot?.() ?? null,
    visibility: typeof document === 'undefined' ? null : document.visibilityState,
    online: typeof navigator === 'undefined' ? null : navigator.onLine,
    ...(extra ?? {})
  }
  if (typeof window !== 'undefined') {
    const ring = (window.__dshChatgptConnection ??= {
      since: entry.t,
      events: []
    })
    ring.events.push(entry)
    if (ring.events.length > CHATGPT_CONNECTION_LOG_LIMIT) ring.events.shift()
  }
  const line = `[dsh-chatgpt-ui] connection ${message}`
  if (level === 'warn') console.warn(line)
  else console.info(line)
}

/**
 * Show (or replace) the skin's own bottom-centre status toast.
 *
 * The markup reuses the confirmation toast's styles (70-mode.css) but not its
 * React component, because connection failures can happen outside any slot
 * (the Host may have torn the whole tree down while the socket was dead).
 *
 * @param {string} text - message for the user.
 * @param {{ actionLabel?: string, onAction?: () => void, ttl?: number }} [options] - optional action and auto-dismiss.
 * @returns {void}
 */
function chatgptShowConnectionToast(text, options) {
  if (typeof document === 'undefined' || document.body === null) return
  const previous = document.querySelector('[data-chatgpt-connection-toast]')
  if (previous !== null && previous !== undefined) previous.remove()
  const toast = document.createElement('div')
  toast.className = 'chatgpt-toast'
  toast.setAttribute('data-chatgpt-connection-toast', '')
  toast.setAttribute('role', 'status')
  toast.setAttribute('aria-live', 'polite')
  const label = document.createElement('span')
  label.className = 'chatgpt-toast-text'
  label.textContent = text
  toast.append(label)
  if (typeof options?.actionLabel === 'string') {
    const action = document.createElement('button')
    action.type = 'button'
    action.className = 'chatgpt-toast-action'
    action.textContent = options.actionLabel
    action.addEventListener('click', () => {
      options.onAction?.()
    })
    toast.append(action)
  }
  document.body.append(toast)
  const ttl = options?.ttl ?? 0
  if (ttl > 0) window.setTimeout(() => toast.remove(), ttl)
}

/** Remove the connection toast if it is still on screen. @returns {void} */
function chatgptHideConnectionToast() {
  if (typeof document === 'undefined') return
  document.querySelector('[data-chatgpt-connection-toast]')?.remove()
}

/**
 * Rebuild the Host generation once, unless it is pointless or too soon.
 * @param {object} ctx - client Cordis context.
 * @param {string} reason - why the skin is rebuilding (logged).
 * @param {{ force?: boolean }} [options] - force bypasses the cooldown.
 * @returns {boolean} true when `reconnect()` was called.
 */
function chatgptReconnect(ctx, reason, options = {}) {
  const connection = chatgptConnectionService(ctx)
  if (connection === undefined || typeof connection.reconnect !== 'function') {
    chatgptConnectionLog(ctx, 'warn', `no connection service; cannot reconnect (${reason})`)
    return false
  }
  const now = Date.now()
  const ring = typeof window === 'undefined' ? undefined : window.__dshChatgptConnection
  const last = ring?.lastReconnectAt ?? 0
  if (options.force !== true) {
    if (connection.state?.getSnapshot?.() === 'connecting') {
      chatgptConnectionLog(ctx, 'info', `reconnect skipped (${reason}): already connecting`)
      return false
    }
    if (last > 0 && now - last < CONNECTION_RECONNECT_COOLDOWN_MS) {
      chatgptConnectionLog(ctx, 'info', `reconnect skipped (${reason}): cooldown`)
      return false
    }
  }
  chatgptConnectionLog(ctx, 'warn', `reconnect (${reason})`)
  if (ring !== undefined) ring.lastReconnectAt = now
  try {
    connection.reconnect()
    return true
  } catch (error) {
    chatgptConnectionLog(ctx, 'warn', `reconnect threw (${reason}): ${error instanceof Error ? error.message : String(error)}`)
    return false
  }
}

/**
 * Reload the page at most once per tab per cooldown window.
 *
 * `sessionStorage` survives the reload, so a second automatic reload inside
 * the same tab is refused even if the first one did not fix the socket.
 *
 * @param {object} ctx - client Cordis context (for the log).
 * @param {string} reason - why a reload was attempted.
 * @param {{ force?: boolean }} [options] - force is the user's own button.
 * @returns {boolean} true when `location.reload()` was called.
 */
function chatgptReloadOnce(ctx, reason, options = {}) {
  if (typeof location === 'undefined' || typeof location.reload !== 'function') return false
  let last = 0
  try {
    last = Number(window.sessionStorage?.getItem(CHATGPT_RELOAD_STORAGE_KEY) ?? 0) || 0
  } catch {
    // Storage can be unavailable; a missing budget must not block recovery.
  }
  const now = Date.now()
  if (options.force !== true && !shouldAutoReload({ now, lastReloadAt: last })) {
    chatgptConnectionLog(ctx, 'warn', `automatic reload suppressed (${reason}): once per ${Math.round(CONNECTION_RELOAD_COOLDOWN_MS / 60000)}min`)
    return false
  }
  try {
    window.sessionStorage?.setItem(CHATGPT_RELOAD_STORAGE_KEY, String(now))
  } catch {
    // A disabled store only costs the throttle, not the reload.
  }
  chatgptConnectionLog(ctx, 'warn', `reloading the page (${reason})`)
  location.reload()
  return true
}

/**
 * Fail visibly and recover: reconnect now, then reload once if the generation
 * does not reach `connected` inside the grace window.
 * @param {object} ctx - client Cordis context.
 * @param {string} reason - logged cause.
 * @param {{ notify?: boolean, successText?: string }} [options] - toast policy.
 * @returns {void}
 */
function chatgptRecoverConnection(ctx, reason, options = {}) {
  const notify = options.notify === true
  const connection = chatgptConnectionService(ctx)
  if (notify) chatgptShowConnectionToast('连接已断开，正在重新连接…', { ttl: CONNECTION_RECOVERY_GRACE_MS + 2000 })
  const reconnected = chatgptReconnect(ctx, reason, { force: true })
  if (!reconnected || typeof window === 'undefined') return
  window.setTimeout(() => {
    const state = connection?.state?.getSnapshot?.()
    if (state === 'connected') {
      chatgptConnectionLog(ctx, 'info', `connection recovered (${reason})`)
      if (notify) {
        if (typeof options.successText === 'string') chatgptShowConnectionToast(options.successText, { ttl: 6000 })
        else chatgptHideConnectionToast()
      }
      return
    }
    chatgptConnectionLog(ctx, 'warn', `connection still ${state ?? 'unknown'} after reconnect (${reason})`)
    if (chatgptReloadOnce(ctx, reason)) return
    chatgptShowConnectionToast('连接仍未恢复，请刷新页面', {
      actionLabel: '刷新页面',
      onAction: () => chatgptReloadOnce(ctx, `${reason} (manual)`, { force: true })
    })
  }, CONNECTION_RECOVERY_GRACE_MS)
}

/**
 * Race one host call against the action timeout.
 * @param {Promise<unknown>} promise - in-flight host call.
 * @param {number} timeoutMs - deadline.
 * @returns {Promise<unknown>} the call result, or a `ChatgptActionTimeout`.
 */
function chatgptWithTimeout(promise, timeoutMs) {
  return new Promise((resolve, reject) => {
    let settled = false
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      const error = new Error(`host call did not settle within ${timeoutMs}ms`)
      error.name = 'ChatgptActionTimeout'
      reject(error)
    }, timeoutMs)
    Promise.resolve(promise).then(
      (value) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        resolve(value)
      },
      (error) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        reject(error)
      }
    )
  })
}

/**
 * Run one host call with a deadline. A call that never settles is the direct
 * cause of a click with no feedback; it is turned into a visible recovery.
 * @param {object} ctx - client Cordis context.
 * @param {string} label - call name for the log.
 * @param {() => Promise<unknown>} run - the call.
 * @param {{ timeoutMs?: number, notify?: boolean }} [options] - deadline / toast.
 * @returns {Promise<unknown>} the call result.
 */
async function chatgptRunHostCall(ctx, label, run, options = {}) {
  try {
    return await chatgptWithTimeout(run(), options.timeoutMs ?? CONNECTION_ACTION_TIMEOUT_MS)
  } catch (error) {
    if (error?.name === 'ChatgptActionTimeout') {
      chatgptConnectionLog(ctx, 'warn', `${label} timed out after ${options.timeoutMs ?? CONNECTION_ACTION_TIMEOUT_MS}ms`)
      chatgptRecoverConnection(ctx, `${label} timeout`, {
        notify: options.notify !== false,
        successText: '连接已恢复，请再点一次'
      })
      const failure = new Error('连接已断开，正在重新连接…')
      failure.name = 'ChatgptConnectionError'
      throw failure
    }
    throw error
  }
}

/**
 * Wait until the local projection shows the requested preset.
 * @param {object} ctx - client Cordis context (needs `sessions`).
 * @param {string|undefined} sessionId - session the preset was selected on.
 * @param {string} preset - expected `agentPreset`.
 * @param {number} timeoutMs - deadline.
 * @returns {Promise<boolean>} true when the projection matches.
 */
async function chatgptWaitForPreset(ctx, sessionId, preset, timeoutMs) {
  if (typeof sessionId !== 'string') return true
  const deadline = Date.now() + timeoutMs
  for (;;) {
    try {
      const sessions = typeof ctx.get === 'function' ? ctx.get('sessions') : undefined
      // The switcher paints from the list snapshot, which is also what the user
      // sees. `projectionValues` alone can lag or be absent for a session that
      // only exists in the roster, so either evidence is accepted.
      const list = sessions?.getListSnapshot?.()
      const row = list?.byId?.[sessionId]
      const listed = list?.projectionsBySession?.[sessionId]?.values ?? row?.projectionValues
      if (presetApplied(listed, preset)) return true
      if (presetApplied(sessions?.projectionValues?.(sessionId), preset)) return true
    } catch {
      // A disposed session store is not a connection failure; keep polling.
    }
    if (Date.now() >= deadline) return false
    await new Promise((resolve) => setTimeout(resolve, 150))
  }
}

/**
 * Confirm an in-place mode switch actually reached the UI.
 *
 * `agentPresets.select` answers over plain HTTP, so it keeps succeeding on a
 * half-open mux socket while the projection never updates. When that happens
 * the skin rebuilds the socket; if the value still does not arrive, it reloads
 * the page once instead of leaving a silently dead control.
 *
 * @param {object} ctx - client Cordis context.
 * @param {string|undefined} sessionId - session that was switched.
 * @param {string} preset - preset the click asked for.
 * @returns {Promise<boolean>} true when the UI reflects the switch.
 */
async function chatgptConfirmPresetApplied(ctx, sessionId, preset) {
  if (await chatgptWaitForPreset(ctx, sessionId, preset, 3500)) return true
  chatgptConnectionLog(ctx, 'warn', `preset projection for ${JSON.stringify(preset)} did not update; rebuilding the connection`)
  if (chatgptReconnect(ctx, 'preset projection stale after select', { force: true }) && (await chatgptWaitForPreset(ctx, sessionId, preset, CONNECTION_RECOVERY_GRACE_MS))) {
    chatgptConnectionLog(ctx, 'info', `preset projection recovered after reconnect (${JSON.stringify(preset)})`)
    return true
  }
  chatgptShowConnectionToast('模式已切换，但界面未能更新：连接已断开，正在尝试刷新页面', { ttl: 8000 })
  window.setTimeout(() => {
    chatgptReloadOnce(ctx, 'preset projection never arrived')
  }, 1200)
  return false
}

/**
 * Wait until `<body data-chatgpt-mode>` shows the requested product.
 *
 * New-session mode changes travel the same socket as projections: the create
 * call succeeds over HTTP, then the freshly composed session's preset has to
 * arrive before the display attribute follows. A value that never arrives is
 * the "switch mode did nothing" symptom, so reconnect and, if needed, reload
 * once instead of leaving the control dead.
 *
 * @param {object} ctx - client Cordis context.
 * @param {'chat'|'agent'} expected - product the click asked for.
 * @param {number} [timeoutMs] - deadline.
 * @returns {Promise<boolean>} true when the attribute matches.
 */
async function chatgptConfirmModeAttribute(ctx, expected, timeoutMs = 4000) {
  if (typeof document === 'undefined') return true
  const deadline = Date.now() + timeoutMs
  for (;;) {
    if (document.body?.getAttribute('data-chatgpt-mode') === expected) return true
    if (Date.now() >= deadline) break
    await new Promise((resolve) => setTimeout(resolve, 150))
  }
  chatgptConnectionLog(ctx, 'warn', `mode attribute did not reach ${JSON.stringify(expected)}; rebuilding the connection`)
  if (chatgptReconnect(ctx, 'mode attribute stale after switch', { force: true })) {
    const retry = Date.now() + CONNECTION_RECOVERY_GRACE_MS
    while (Date.now() < retry) {
      if (document.body?.getAttribute('data-chatgpt-mode') === expected) {
        chatgptConnectionLog(ctx, 'info', `mode attribute recovered after reconnect (${JSON.stringify(expected)})`)
        return true
      }
      await new Promise((resolve) => setTimeout(resolve, 150))
    }
  }
  chatgptShowConnectionToast('模式已切换，但界面未能更新：连接已断开，正在尝试刷新页面', { ttl: 8000 })
  window.setTimeout(() => {
    chatgptReloadOnce(ctx, 'mode attribute never arrived')
  }, 1200)
  return false
}

/**
 * Install the away/visibility watchdog. Idempotent per effect; the returned
 * cleanup removes every listener and the toast.
 * @param {object} ctx - client Cordis context.
 * @returns {() => void} cleanup.
 */
function mountChatgptConnectionWatchdog(ctx) {
  const doc = typeof document === 'undefined' ? undefined : document
  if (doc === undefined || doc.body === null) return () => {}
  const win = typeof window === 'undefined' ? undefined : window
  let hiddenAt = 0
  let lastInteractionAt = Date.now()
  const away = () => (hiddenAt === 0 ? 0 : Date.now() - hiddenAt)
  const idle = () => Date.now() - lastInteractionAt

  const recoverIfAway = (reason, hiddenMs, idleMs) => {
    const connection = chatgptConnectionService(ctx)
    const ring = typeof window === 'undefined' ? undefined : window.__dshChatgptConnection
    const since = ring?.lastReconnectAt === undefined ? Infinity : Date.now() - ring.lastReconnectAt
    if (!shouldReconnectAfterAway({ hiddenMs, idleMs, state: connection?.state?.getSnapshot?.() ?? 'connected', sinceReconnectMs: since })) return
    chatgptConnectionLog(ctx, 'warn', `${reason} (hidden ${Math.round(hiddenMs / 1000)}s, idle ${Math.round(idleMs / 1000)}s); rebuilding the connection`)
    chatgptReconnect(ctx, reason, { force: true })
  }

  const onVisibility = () => {
    if (doc.visibilityState === 'hidden') {
      hiddenAt = Date.now()
      chatgptConnectionLog(ctx, 'info', 'hidden; watching for a silent socket loss')
      return
    }
    const hiddenMs = away()
    hiddenAt = 0
    lastInteractionAt = Date.now()
    recoverIfAway('visible after an away period', hiddenMs, 0)
  }
  const onFreeze = () => {
    hiddenAt = Date.now()
    chatgptConnectionLog(ctx, 'info', 'frozen; watching for a silent socket loss')
  }
  const onResume = () => {
    const hiddenMs = away()
    hiddenAt = 0
    lastInteractionAt = Date.now()
    recoverIfAway('resumed after a freeze', hiddenMs, 0)
  }
  const onPageShow = (event) => {
    if (event.persisted !== true) return
    lastInteractionAt = Date.now()
    chatgptConnectionLog(ctx, 'info', 'restored from the back/forward cache')
    recoverIfAway('restored from the back/forward cache', 0, CONNECTION_AWAY_MS)
  }
  const onOnline = () => {
    chatgptConnectionLog(ctx, 'info', 'browser reports online')
    recoverIfAway('network came back after an away period', 0, idle())
  }
  // Reconnect in the CAPTURE phase of `click`, not on `pointerdown`: rebuilding
  // the generation re-renders Host state, and a node replaced between pointerdown
  // and mouseup would never receive the click at all. At click time the event is
  // already targeted, so the handler still runs against a fresh socket.
  const onClick = () => {
    const idleMs = idle()
    lastInteractionAt = Date.now()
    recoverIfAway('first click after an away period', 0, idleMs)
  }
  const onKeyDown = (event) => {
    // Enter/Space will synthesize a click; leave the idle measurement to it.
    if (event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar') return
    lastInteractionAt = Date.now()
  }

  doc.addEventListener('visibilitychange', onVisibility)
  doc.addEventListener('freeze', onFreeze)
  doc.addEventListener('resume', onResume)
  doc.addEventListener('click', onClick, true)
  doc.addEventListener('keydown', onKeyDown, true)
  win?.addEventListener('pageshow', onPageShow)
  win?.addEventListener('online', onOnline)

  chatgptConnectionLog(ctx, 'info', 'watchdog mounted')

  return () => {
    doc.removeEventListener('visibilitychange', onVisibility)
    doc.removeEventListener('freeze', onFreeze)
    doc.removeEventListener('resume', onResume)
    doc.removeEventListener('click', onClick, true)
    doc.removeEventListener('keydown', onKeyDown, true)
    win?.removeEventListener('pageshow', onPageShow)
    win?.removeEventListener('online', onOnline)
    chatgptHideConnectionToast()
  }
}
