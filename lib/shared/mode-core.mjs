/**
 * dsh-chatgpt-ui — mode decision core (shared by the browser bundle and tests).
 *
 * The switcher's whole policy is a pure function: given the current preset,
 * whether the session is still blank, which presets the deployment offers, and
 * whether dot's panel is registered, decide what a click must DO. The browser
 * fragment (`lib/client/mode.js`) only turns the result into calls; the unit
 * test (`test/mode.test.mjs`) drives the same function with fabricated inputs.
 *
 * Not an agent-preset: `dot` is a panel, not a session mode, so selecting it
 * must never create or re-compose a session.
 *
 * Built by scripts/build-client.mjs into lib/client.js with the `export`
 * keywords stripped — this file must stay free of imports for that reason.
 */

/** Chat mode: the `chat` agent preset (read-only, conversation only). */
export const MODE_CHAT = 'chat'

/** Agent mode: any other preset — the default, code-capable composition. */
export const MODE_AGENT = 'agent'

/** dot mode: the super-agent panel, selected without touching the session. */
export const MODE_DOT = 'dot'

/** Main-slot key dot registers its panel under (`dsh-super-agent/lib/client.js`). */
export const DOT_PANEL_ID = 'super-agent'

/** The preset whose presence enables the Chat segment. */
export const CHAT_PRESET_ID = 'chat'

/**
 * Map a session's projection preset to the switcher's display mode.
 * @param {string|null|undefined} preset - `agentPreset` projection value.
 * @returns {'chat'|'agent'} the mode the session is in.
 */
export function modeOfPreset(preset) {
  return preset === CHAT_PRESET_ID ? MODE_CHAT : MODE_AGENT
}

/** Product names used by the brand switcher and the centred segment. */
export const PRODUCT_LABELS = {
  [MODE_CHAT]: 'Chat',
  [MODE_AGENT]: 'Work'
}

/**
 * P0-16: the header segment speaks Chinese in the reference (聊天 / 工作). The
 * product roster and the brand switcher keep the product names, so these two
 * labels are their own map instead of a rewrite of `PRODUCT_LABELS`.
 */
export const PRODUCT_SEGMENT_LABELS = {
  [MODE_CHAT]: '聊天',
  [MODE_AGENT]: '工作'
}

/**
 * The product a session preset belongs to. Anything that is not the read-only
 * `chat` preset is Work (the code-capable default and the deployment's other
 * presets).
 * @param {string|null|undefined} preset - `agentPreset` projection value.
 * @returns {'chat'|'agent'} product mode.
 */
export function productOfPreset(preset) {
  return preset === CHAT_PRESET_ID ? MODE_CHAT : MODE_AGENT
}

/**
 * Product name for one preset.
 * @param {string|null|undefined} preset - `agentPreset` projection value.
 * @returns {'Chat'|'Work'} display name.
 */
export function productLabel(preset) {
  return PRODUCT_LABELS[productOfPreset(preset)]
}

/**
 * Which segments the switcher should render.
 * @param {{ presets?: readonly string[], dotAvailable?: boolean }} input - deployment facts.
 * @returns {{ chat: boolean, agent: boolean, dot: boolean }} segment visibility.
 */
export function visibleSegments(input) {
  const presets = Array.isArray(input?.presets) ? input.presets : []
  return {
    chat: presets.includes(CHAT_PRESET_ID),
    agent: true,
    dot: input?.dotAvailable === true
  }
}

/**
 * Decide what a click on one segment means.
 *
 * `select` is legal only while the session is blank: the host locks a session's
 * composition once its conversation starts, so a non-blank session gets a
 * confirmation ("this will start a new session") instead of a doomed in-place
 * switch. `panel` never touches a session.
 *
 * @param {object} input - click context.
 * @param {'chat'|'agent'|'dot'} input.target - clicked segment.
 * @param {string|null|undefined} input.currentPreset - `agentPreset` projection value.
 * @param {boolean} input.blank - whether the session still has no content.
 * @param {readonly string[]} [input.presets] - presets the deployment offers.
 * @param {string|null} [input.agentPreset] - the preset `agent` means (the deployment default); absent hides the agent switch.
 * @param {boolean} [input.dotAvailable] - whether dot's panel is registered.
 * @returns {{ kind: 'hidden'|'noop'|'select'|'confirm-new-session'|'new-session'|'panel', preset?: string, panelId?: string, reason?: string }} the action.
 */
export function decideModeAction(input) {
  const target = input?.target
  const segments = visibleSegments(input)
  if (target === MODE_DOT) {
    if (!segments.dot) return { kind: 'hidden', reason: 'dot-panel-missing' }
    return { kind: 'panel', panelId: DOT_PANEL_ID }
  }
  if (target !== MODE_CHAT && target !== MODE_AGENT) {
    return { kind: 'hidden', reason: 'unknown-target' }
  }
  const preset = target === MODE_CHAT ? CHAT_PRESET_ID : input?.agentPreset ?? null
  if (preset === null) return { kind: 'hidden', reason: 'agent-preset-missing' }
  if (preset === input?.currentPreset) return { kind: 'noop' }
  if (target === MODE_CHAT && !segments.chat) return { kind: 'hidden', reason: 'chat-preset-missing' }
  if (input?.blank === true) return { kind: 'select', preset }
  return { kind: 'confirm-new-session', preset, reason: 'session-not-blank' }
}

/**
 * The preset one segment stands for.
 * @param {'chat'|'agent'|'dot'} target - clicked segment.
 * @param {string|null} [agentPreset] - the deployment default preset id.
 * @returns {string|null} preset id, or null for dot / an unavailable agent preset.
 */
export function presetForSegment(target, agentPreset) {
  if (target === MODE_CHAT) return CHAT_PRESET_ID
  if (target === MODE_AGENT) return agentPreset ?? null
  return null
}

/**
 * Whether the switcher may run an action the user explicitly confirmed.
 * The hero has no session yet, so "new-session" there is just `select` on the
 * session the user is about to create — both are allowed, only the wording differs.
 * @param {{ kind: string }} decision - decision from {@link decideModeAction}.
 * @returns {boolean} true for every actionable decision.
 */
export function isActionable(decision) {
  return (
    decision?.kind === 'select' ||
    decision?.kind === 'confirm-new-session' ||
    decision?.kind === 'new-session' ||
    decision?.kind === 'panel'
  )
}

/**
 * The body attribute value a mode paints with. Display only: permissions come
 * from the host policy, never from this attribute.
 * @param {string|null|undefined} preset - `agentPreset` projection value.
 * @returns {'chat'|'agent'} attribute value.
 */
export function modeAttribute(preset) {
  return modeOfPreset(preset)
}

/** Wordmarks the `brand` config value can pick. */
export const BRAND_MODES = ['dot', 'chatgpt', 'hidden']

/**
 * Normalise the plugin's `brand` config value.
 *
 * A typo in a profile patch must not take the skin down, so unknown values fall
 * back to `dot` instead of throwing.
 * @param {unknown} value - raw config value.
 * @returns {'dot'|'chatgpt'|'hidden'} the effective wordmark.
 */
export function brandMode(value) {
  const text = typeof value === 'string' ? value.trim().toLowerCase() : ''
  return BRAND_MODES.includes(text) ? text : 'dot'
}
