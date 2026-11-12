/**
 * dsh-chatgpt-ui — connection-recovery decision core (shared by the browser
 * bundle and the node tests).
 *
 * P1-e: the Host's mux WebSocket can die without a close event. Its own state
 * machine then still reports `connected`, unary HTTP calls keep working, but
 * every projection update (mode, session list, control baseline) stops
 * arriving — the UI looks alive and every click appears to do nothing until a
 * manual reload. The Host also has no `visibilitychange`/`resume` hook, so the
 * skin is the only layer that can notice the user came back.
 *
 * The policy is pure so it can be unit-tested:
 *
 *   - how long away is "long enough" to rebuild the connection;
 *   - whether a manual reconnect is allowed right now;
 *   - whether the one-shot auto-reload budget is still available.
 *
 * Built into lib/client.js by scripts/build-client.mjs with the `export`
 * keywords stripped; kept import-free for that reason.
 */

/** Away threshold: 5 minutes hidden or eventless. The reported failure needs
 *  "十几分钟"; five minutes is comfortably past a normal tab switch and well
 *  before the host's 2s-heartbeat socket would have died if it was going to. */
export const CONNECTION_AWAY_MS = 5 * 60 * 1000

/** Never rebuild the generation twice inside this window (click + visibility
 *  often fire together on return). */
export const CONNECTION_RECONNECT_COOLDOWN_MS = 30 * 1000

/** After a timed-out call, how long the reconnect gets to reach `connected`
 *  before the page is reloaded once. */
export const CONNECTION_RECOVERY_GRACE_MS = 6 * 1000

/** Unary host calls that never settle are treated as a dead carrier after
 *  this long. A healthy `session.create`/`select` answers in well under 1s. */
export const CONNECTION_ACTION_TIMEOUT_MS = 12 * 1000

/** One automatic reload per tab per ten minutes. */
export const CONNECTION_RELOAD_COOLDOWN_MS = 10 * 60 * 1000

/**
 * Whether the skin should rebuild the Host generation now.
 *
 * A manual rebuild is only useful from `connected`: `connecting` already has a
 * generation in flight, and `disconnected` means the browser says it is
 * offline, where the Host resumes by itself once the network returns.
 *
 * @param {{ hiddenMs?: number, idleMs?: number, state?: string|null, sinceReconnectMs?: number }} input - away measurements and Host state.
 * @param {{ awayMs?: number, cooldownMs?: number }} [limits] - test overrides.
 * @returns {boolean} true when `connection.reconnect()` should be called.
 */
export function shouldReconnectAfterAway(input, limits = {}) {
  const awayMs = limits.awayMs ?? CONNECTION_AWAY_MS
  const cooldownMs = limits.cooldownMs ?? CONNECTION_RECONNECT_COOLDOWN_MS
  const away = Math.max(input?.hiddenMs ?? 0, input?.idleMs ?? 0)
  if (!(away >= awayMs)) return false
  // Only a live generation can be rebuilt; unknown/connecting/disconnected
  // states are the Host's own reconnect loop, not ours.
  if (input?.state !== 'connected') return false
  return (input?.sinceReconnectMs ?? Infinity) >= cooldownMs
}

/**
 * Whether the one-shot auto-reload budget is still available.
 * @param {{ now?: number, lastReloadAt?: number }} input - clock and stored stamp.
 * @param {{ cooldownMs?: number }} [limits] - test overrides.
 * @returns {boolean} true when a reload may run.
 */
export function shouldAutoReload(input, limits = {}) {
  const cooldownMs = limits.cooldownMs ?? CONNECTION_RELOAD_COOLDOWN_MS
  const last = input?.lastReloadAt ?? 0
  if (!(last > 0)) return true
  return (input?.now ?? Date.now()) - last >= cooldownMs
}

/**
 * Whether a projection actually changed after an in-place preset switch.
 *
 * The host's `agentPresets.select` resolves over HTTP even when the mux socket
 * is dead; the value that reaches the UI travels over that socket. Comparing
 * the projection with the requested preset is therefore the cheapest health
 * check the skin has.
 *
 * @param {{ agentPreset?: string|null }|undefined} values - `sessions.projectionValues(sessionId)`.
 * @param {string} preset - preset the click asked for.
 * @returns {boolean} true when the UI already reflects the switch.
 */
export function presetApplied(values, preset) {
  return values?.agentPreset === preset
}
