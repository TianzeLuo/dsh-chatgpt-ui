/**
 * dsh-chatgpt-ui — per-product model memory (shared by the browser bundle and tests).
 *
 * The Host keeps ONE default model selection (`agentDefaultModel`) and every
 * `session/selectModel` call also writes it in the background. That is why a
 * model chosen in Chat used to appear in Work: both products read the same
 * default. This module gives each product (Chat / Work) its own remembered
 * selection in browser storage, so:
 *
 *   - creating a session in a product applies that product's last choice,
 *   - switching products on a blank session applies the target product's choice,
 *   - choosing a model in one product never rewrites the other product's entry.
 *
 * Nothing here talks to the Host. The browser fragment reads/writes through
 * these helpers, and applies the result with `session/selectModel`.
 *
 * No imports: scripts/build-client.mjs inlines this file into the browser
 * bundle by dropping its `export` keywords.
 */

/** One localStorage entry for both products (a map keyed by product). */
export const CHATGPT_MODEL_MEMORY_KEY = 'dsh-chatgpt-ui:model-selection-by-product'

/** Product keys. They match `MODE_CHAT` / `MODE_AGENT` in mode-core. */
export const CHATGPT_MODEL_PRODUCTS = ['chat', 'agent']

/**
 * Normalize one stored/requested selection.
 * @param {unknown} value - anything that may look like a ModelSelection.
 * @returns {{provider: string, model: string, reasoningEffort?: string}|undefined} normalized selection.
 */
export function chatgptNormalizeModelSelection(value) {
  if (value === null || typeof value !== 'object') return undefined
  const provider = typeof value.provider === 'string' ? value.provider.trim() : ''
  const model = typeof value.model === 'string' ? value.model.trim() : ''
  if (provider === '' || model === '') return undefined
  const reasoningEffort =
    typeof value.reasoningEffort === 'string' && value.reasoningEffort !== ''
      ? value.reasoningEffort
      : undefined
  return reasoningEffort === undefined ? { provider, model } : { provider, model, reasoningEffort }
}

/**
 * Stable string identity for comparisons inside a store selector. An absent
 * effort is its own value (the Host resolves the adapter default then), so it
 * must not compare equal to an explicit level.
 * @param {unknown} selection - selection or undefined.
 * @returns {string} `provider\0model\0effort`, or an empty string.
 */
export function chatgptModelSelectionKey(selection) {
  const normalized = chatgptNormalizeModelSelection(selection)
  if (normalized === undefined) return ''
  return [normalized.provider, normalized.model, normalized.reasoningEffort ?? ''].join('\u0000')
}

/**
 * Whether two selections name the same provider, model and effort.
 * @param {unknown} left - first selection.
 * @param {unknown} right - second selection.
 * @returns {boolean} true when both normalize to the same key.
 */
export function chatgptSameModelSelection(left, right) {
  const leftKey = chatgptModelSelectionKey(left)
  return leftKey !== '' && leftKey === chatgptModelSelectionKey(right)
}

/**
 * Read the whole product map, ignoring malformed entries.
 * @param {{getItem?: Function}|null|undefined} storage - localStorage-like.
 * @returns {Record<string, {provider: string, model: string, reasoningEffort?: string}>} normalized map.
 */
export function chatgptReadModelMemory(storage) {
  let parsed
  try {
    const raw = storage?.getItem?.(CHATGPT_MODEL_MEMORY_KEY)
    if (typeof raw !== 'string' || raw === '') return {}
    parsed = JSON.parse(raw)
  } catch {
    return {}
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
  const memory = {}
  for (const product of CHATGPT_MODEL_PRODUCTS) {
    const selection = chatgptNormalizeModelSelection(parsed[product])
    if (selection !== undefined) memory[product] = selection
  }
  return memory
}

/**
 * Read one product's remembered selection.
 * @param {{getItem?: Function}|null|undefined} storage - localStorage-like.
 * @param {'chat'|'agent'} product - product key.
 * @returns {{provider: string, model: string, reasoningEffort?: string}|undefined} selection, or undefined.
 */
export function chatgptReadProductModel(storage, product) {
  if (!CHATGPT_MODEL_PRODUCTS.includes(product)) return undefined
  return chatgptReadModelMemory(storage)[product]
}

/**
 * Remember one product's selection. `null`/`undefined` clears that product's
 * entry (used to roll back a rejected pick); the other product is untouched.
 * A storage failure is non-fatal: the current page keeps working without
 * memory.
 * @param {{getItem?: Function, setItem?: Function}|null|undefined} storage - localStorage-like.
 * @param {'chat'|'agent'} product - product key.
 * @param {unknown} selection - selection to remember, or null to clear.
 * @returns {object|undefined} the normalized selection now stored, or undefined.
 */
export function chatgptWriteProductModel(storage, product, selection) {
  if (!CHATGPT_MODEL_PRODUCTS.includes(product)) return undefined
  const normalized = chatgptNormalizeModelSelection(selection)
  try {
    const memory = chatgptReadModelMemory(storage)
    if (normalized === undefined) delete memory[product]
    else memory[product] = normalized
    storage?.setItem?.(CHATGPT_MODEL_MEMORY_KEY, JSON.stringify(memory))
    return normalized
  } catch {
    return normalized
  }
}

/**
 * Build the `session/selectModel` request that restores one selection.
 * @param {string|undefined} sessionId - target Session.
 * @param {unknown} selection - remembered selection.
 * @returns {{sessionId: string, provider: string, model: string, reasoningEffort?: string}|null} request, or null.
 */
export function chatgptModelSelectRequest(sessionId, selection) {
  if (typeof sessionId !== 'string' || sessionId === '') return null
  const normalized = chatgptNormalizeModelSelection(selection)
  if (normalized === undefined) return null
  return { sessionId, ...normalized }
}

/**
 * Whether the catalog still offers a remembered selection. A model that
 * disappeared (or an effort it no longer publishes) must not be reused: the
 * Host would reject it and the pill would lie about the active model.
 * @param {unknown} selection - remembered selection.
 * @param {object[]} choices - from `chatgptModelChoices`.
 * @returns {boolean} true when the selection can be applied.
 */
export function chatgptSelectionOffered(selection, choices) {
  const normalized = chatgptNormalizeModelSelection(selection)
  if (normalized === undefined || !Array.isArray(choices)) return false
  const choice =
    choices.find((entry) => entry?.provider === normalized.provider && entry?.model === normalized.model) ??
    choices.find((entry) => entry?.model === normalized.model)
  if (choice === undefined) return false
  if (normalized.reasoningEffort === undefined) return true
  return (Array.isArray(choice.efforts) ? choice.efforts : []).some(
    (level) => level?.id === normalized.reasoningEffort
  )
}
