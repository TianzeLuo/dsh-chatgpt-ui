/**
 * dsh-chatgpt-ui — Chat-mode permission policy, pure decision half.
 *
 * Split out of `chat-policy.js` so the enter / restore / ignore decisions can be
 * unit-tested against a fake context (test/chat-policy.test.mjs) without booting
 * DSH. The host half owns the services; this module owns only the state machine:
 *
 *   chat agent + no record  → snapshot the current knobs, then pin read-only
 *   chat agent + record     → re-pin (the session log may have drifted)
 *   other agent + record    → restore the snapshot once, drop the record
 *   other agent + no record → do nothing at all
 *
 * Everything here is dependency-free on purpose: a profile-linked plugin cannot
 * resolve `@deepseek-ai/*` by specifier (verified: ERR_MODULE_NOT_FOUND under the
 * isolated instance), so the two host write paths are re-stated as one-line
 * `session.append(...)` calls in `chat-policy.js`.
 *
 * Behaviour follows the MIT-licensed reference `dsh-preset-chat/lib/chat-policy.js`
 * (see docs/licenses.md); this file is an independent implementation of the same
 * observable behaviour, narrowed to the `chat` preset.
 */

/** Preset identity this policy owns; must match presets/chat.patch.yml `config.id`. */
export const CHAT_PRESET_ID = 'chat'

/** File-effect mode a Chat session is pinned to. */
export const CHAT_SANDBOX_MODE = 'read-only'

/** Approval policy a Chat session is pinned to: never prompt, always refuse. */
export const CHAT_APPROVAL_POLICY = 'never'

/** Host permission-preset name used for the same bundle, when the deployment has it. */
export const READ_ONLY_PRESET_NAME = 'read-only'

/**
 * Normalize the three knobs into the shape stored in the recovery record.
 * @param {{ mode?: string, policy?: string, preset?: string|null }} input - raw knob reads.
 * @returns {{ mode: string, policy: string, preset: string|null }} the record.
 */
export function permissionState(input) {
  return {
    mode: input.mode ?? CHAT_SANDBOX_MODE,
    policy: input.policy ?? 'ask',
    preset: input.preset ?? null
  }
}

/**
 * Which knobs still need pinning for a Chat session.
 * @param {{ mode: string, policy: string, preset: string|null }} current - effective knobs.
 * @returns {string[]} subset of `['preset', 'sandbox', 'approval']`.
 */
export function enforcementSteps(current) {
  const steps = []
  if (current.preset !== READ_ONLY_PRESET_NAME) steps.push('preset')
  if (current.mode !== CHAT_SANDBOX_MODE) steps.push('sandbox')
  if (current.policy !== CHAT_APPROVAL_POLICY) steps.push('approval')
  return steps
}

/**
 * Which knobs have to be put back when a session leaves Chat mode.
 * @param {{ mode: string, policy: string, preset: string|null }} current - effective knobs.
 * @param {{ mode: string, policy: string, preset: string|null }} before - recorded snapshot.
 * @returns {{ preset: string|null, mode: string|null, policy: string|null }} values to restore.
 */
export function restoreSteps(current, before) {
  return {
    preset: before.preset !== null && current.preset !== before.preset ? before.preset : null,
    mode: before.mode !== current.mode ? before.mode : null,
    policy: before.policy !== current.policy ? before.policy : null
  }
}

/**
 * Build the policy state machine over injected host reads and writes.
 *
 * Every side effect is a `deps` callback, so the unit test drives the same code
 * path the running plugin does. `reconcile` is idempotent and safe to call on
 * boot, on `agent/created`, and on `agent-preset/selected`.
 *
 * @param {object} deps - host wiring.
 * @param {(agent: object) => boolean} deps.isChat - whether this agent runs the chat preset.
 * @param {(session: object) => {mode: string, policy: string, preset: string|null}} deps.readPermission - effective knobs.
 * @param {(session: object, name: string) => void} deps.applyPreset - permissionPresets.set.
 * @param {(session: object, mode: string) => void} deps.applySandbox - sandbox/mode event.
 * @param {(session: object, policy: string) => void} deps.applyApproval - approval/policy event.
 * @param {() => readonly string[]} deps.permissionPresetNames - available preset names.
 * @param {() => Record<string, {mode: string, policy: string, preset: string|null}>} deps.loadRecords - persisted snapshot map.
 * @param {(records: object) => Promise<void>} deps.saveRecords - persist the snapshot map.
 * @param {(agent: object) => (() => void)|undefined} [deps.attach] - optional extra fiber (prompt section, tool guard); returns its disposer.
 * @param {() => void} [deps.onStorageError] - called with a persistence failure.
 * @returns {{ reconcile: (agent: object) => Promise<void>, release: (agent: object) => Promise<void>, disposeAll: () => void, records: () => object }} the policy.
 */
export function createChatPolicy(deps) {
  /** agentId → { enforcing, fiber, scheduled } for agents currently in Chat mode. */
  const active = new Map()
  const records = { ...deps.loadRecords() }
  let writes = Promise.resolve()

  const persist = () => {
    const snapshot = { ...records }
    writes = writes.then(() => deps.saveRecords(snapshot)).catch(() => {
      try {
        deps.onStorageError?.()
      } catch {
        /* reporting is best-effort; the in-memory record still restores this process */
      }
    })
    return writes
  }

  const apply = (session, step, value) => {
    if (step === 'preset') {
      if (deps.permissionPresetNames().includes(value)) deps.applyPreset(session, value)
      return
    }
    if (step === 'sandbox') deps.applySandbox(session, value)
    else deps.applyApproval(session, value)
  }

  const enforce = (agent, state) => {
    if (state.enforcing || !deps.isChat(agent)) return
    state.enforcing = true
    try {
      const current = permissionState(deps.readPermission(agent.session))
      for (const step of enforcementSteps(current)) {
        apply(agent.session, step, step === 'preset' ? READ_ONLY_PRESET_NAME : step === 'sandbox' ? CHAT_SANDBOX_MODE : CHAT_APPROVAL_POLICY)
      }
    } finally {
      state.enforcing = false
    }
  }

  const restore = (agent, before) => {
    const current = permissionState(deps.readPermission(agent.session))
    const steps = restoreSteps(current, before)
    if (steps.preset !== null) apply(agent.session, 'preset', steps.preset)
    if (steps.mode !== null) apply(agent.session, 'sandbox', steps.mode)
    if (steps.policy !== null) apply(agent.session, 'approval', steps.policy)
  }

  const reconcile = (agent) => {
    if (agent === undefined || agent === null || agent.ctx === undefined) return Promise.resolve()
    if (!deps.isChat(agent)) {
      const previous = active.get(agent.id)
      active.delete(agent.id)
      const disposal = previous?.fiber?.()
      if (records[agent.id] === undefined) return Promise.resolve(disposal)
      restore(agent, records[agent.id])
      delete records[agent.id]
      return Promise.all([disposal, persist()]).then(() => undefined)
    }
    if (active.has(agent.id)) {
      enforce(agent, active.get(agent.id))
      return writes
    }
    const entered = records[agent.id] === undefined
    if (entered) records[agent.id] = permissionState(deps.readPermission(agent.session))
    const state = { enforcing: false, fiber: undefined, scheduled: false }
    active.set(agent.id, state)
    enforce(agent, state)
    state.fiber = deps.attach?.(agent)
    return Promise.all([entered ? persist() : writes]).then(() => undefined)
  }

  const release = (agent) => {
    const state = active.get(agent.id)
    active.delete(agent.id)
    return Promise.resolve(state?.fiber?.())
  }

  const disposeAll = () => {
    for (const state of active.values()) state.fiber?.()
    active.clear()
  }

  return { reconcile, release, disposeAll, records: () => ({ ...records }) }
}
