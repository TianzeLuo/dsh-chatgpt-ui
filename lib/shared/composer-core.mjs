/**
 * dsh-chatgpt-ui — Phase 4B composer policy (shared, ESM).
 *
 * Pure helpers behind the Work composer: which thinking-effort levels the
 * current model offers, how the slider maps an index to pixels, what the
 * `selectModel` request must carry, and how the session approval presets are
 * labelled. Kept out of the fragment so `test/work-composer.test.mjs` can call
 * them directly in Node (the bundle inlines this file verbatim).
 *
 * Everything here reads the Host's own catalog shape:
 *   modelCatalog.value.groups[].models[].reasoning.{efforts,defaultEffort}
 *   modelCatalog.value.default = { provider, model, reasoningEffort }
 * No level count is hard-coded: a two-level model gets a two-stop slider and a
 * model without `reasoning` gets no control at all.
 */

/** Fallback Chinese names for the effort ids providers ship (`low`, `xhigh`, …). */
const CHATGPT_EFFORT_NAMES = {
  minimal: '极低',
  low: '低',
  medium: '中',
  high: '高',
  xhigh: '极高',
  max: '最高'
}

/** Approval presets we can name ourselves; unknown values fall back to the Host name. */
const CHATGPT_APPROVAL_NAMES = {
  'read-only': '请求批准',
  'workspace-write': '帮我批准',
  'danger-full-access': '完全访问权限',
  auto: '自动选择',
  custom: '自定义'
}

/** Slider geometry of the desktop panel (P0-8: 30px track, 34px round thumb).
 *  The panel is 280 wide with 12/16/16 padding, so the track is 100% of the
 *  248px content box — no 252→284 overflow any more. The 17px inset is the
 *  34px thumb radius, so at either end the handle's edge lands on the track's
 *  edge and is never clipped sideways. */
const CHATGPT_EFFORT_TRACK = 248
const CHATGPT_EFFORT_INSET = 17
const CHATGPT_EFFORT_THUMB = 34

/**
 * One effort level's display name.
 * @param {{id: string, name?: string}} effort - catalog level.
 * @returns {string} Chinese name for a known id, else the Host name, else the id.
 */
export function chatgptEffortName(effort) {
  if (effort === undefined || effort === null) return ''
  const known = CHATGPT_EFFORT_NAMES[effort.id]
  if (known !== undefined) return known
  return typeof effort.name === 'string' && effort.name !== '' ? effort.name : String(effort.id)
}

/**
 * The effort levels of one catalog model.
 * @param {object|null|undefined} catalog - `modelCatalog().value`.
 * @param {string|undefined} provider - provider group id.
 * @param {string|undefined} modelId - model id inside that group.
 * @returns {{efforts: object[], defaultEffort?: string}|null} levels, or null when the model has none.
 */
export function chatgptEffortsFor(catalog, provider, modelId) {
  const groups = catalog?.groups
  if (!Array.isArray(groups) || provider === undefined || modelId === undefined) return null
  for (const group of groups) {
    if (group?.id !== provider) continue
    for (const model of group.models ?? []) {
      if (model?.id !== modelId) continue
      const efforts = model.reasoning?.efforts
      if (!Array.isArray(efforts) || efforts.length === 0) return null
      return { efforts, defaultEffort: model.reasoning?.defaultEffort }
    }
  }
  return null
}

/**
 * Index of the level a selection points at.
 * @param {object[]} efforts - catalog levels.
 * @param {string|undefined} effortId - selected id, if any.
 * @param {string|undefined} defaultEffort - the model's default id.
 * @returns {number} index, or -1 when the levels are empty.
 */
export function chatgptEffortIndexOf(efforts, effortId, defaultEffort) {
  if (!Array.isArray(efforts) || efforts.length === 0) return -1
  const wanted = effortId ?? defaultEffort
  const index = efforts.findIndex((level) => level.id === wanted)
  return index === -1 ? 0 : index
}

/**
 * Whether a level is the model's highest one (the only state that earns the
 * gradient fill). A single-level model never earns it: there is nothing above.
 * @param {object[]} efforts - catalog levels.
 * @param {number} index - current index.
 * @returns {boolean} true for the top level of a multi-level model.
 */
export function chatgptIsMaxEffort(efforts, index) {
  return Array.isArray(efforts) && efforts.length > 1 && index === efforts.length - 1
}

/**
 * Next index for one arrow key.
 * @param {number} index - current index.
 * @param {string} key - keyboard key.
 * @param {number} length - level count.
 * @returns {number} clamped next index (unchanged for unrelated keys).
 */
export function chatgptEffortStep(index, key, length) {
  if (length <= 0) return -1
  const last = length - 1
  if (key === 'ArrowRight' || key === 'ArrowUp') return Math.min(last, index + 1)
  if (key === 'ArrowLeft' || key === 'ArrowDown') return Math.max(0, index - 1)
  if (key === 'Home') return 0
  if (key === 'End') return last
  return index
}

/**
 * Horizontal centre of one level on the track, in pixels from the track's left
 * edge. The tick row is inset by the 17px thumb radius on both sides, so the
 * first and last levels sit on those insets instead of on the rounded corners.
 * @param {number} index - level index.
 * @param {number} length - level count.
 * @returns {number} centre in px.
 */
export function chatgptEffortOffset(index, length) {
  const inset = CHATGPT_EFFORT_INSET
  const span = CHATGPT_EFFORT_TRACK - inset * 2
  if (!Number.isFinite(length) || length <= 1) return inset
  const clamped = Math.max(0, Math.min(length - 1, index))
  return Math.round(inset + (span * clamped) / (length - 1))
}

/**
 * Fill width for a level: the track reaches the thumb centre, except the top
 * level, which fills the whole 248px track so the white handle stays legible
 * against the gradient in the light theme (no border/shadow allowed).
 * @param {number} index - level index.
 * @param {number} length - level count.
 * @returns {number} width in px.
 */
export function chatgptEffortFill(index, length) {
  if (Number.isFinite(length) && length > 1 && index >= length - 1) return CHATGPT_EFFORT_TRACK
  return chatgptEffortOffset(index, length)
}

/**
 * The `selectModel` request that switches the level. Returns null when the
 * control has nothing to send (no session, no selection, no levels).
 * @param {string|undefined} sessionId - current session.
 * @param {{provider: string, model: string, reasoningEffort?: string}|undefined} selection - projection value.
 * @param {object[]} efforts - catalog levels.
 * @param {number} index - target level.
 * @returns {{sessionId: string, provider: string, model: string, reasoningEffort: string}|null} request.
 */
export function chatgptEffortRequest(sessionId, selection, efforts, index) {
  if (typeof sessionId !== 'string' || sessionId === '') return null
  if (selection === undefined || selection === null) return null
  const level = Array.isArray(efforts) ? efforts[index] : undefined
  if (level === undefined) return null
  return {
    sessionId,
    provider: selection.provider,
    model: selection.model,
    reasoningEffort: level.id
  }
}

/**
 * The catalog grouped by provider, in the Host's registration order.
 *
 * The desktop model list shows a small provider header before each run of
 * models, so this helper keeps the grouping that `chatgptModelChoices` flattens
 * away. A provider with no models is dropped, exactly like the Host catalogs it.
 *
 * @param {object[]} choices - from `chatgptModelChoices`.
 * @returns {{provider: string, name: string, models: object[]}[]} groups.
 */
export function chatgptModelGroups(choices) {
  const groups = []
  const index = new Map()
  for (const choice of Array.isArray(choices) ? choices : []) {
    let group = index.get(choice.provider)
    if (group === undefined) {
      group = { provider: choice.provider, name: choice.group, models: [] }
      index.set(choice.provider, group)
      groups.push(group)
    }
    group.models.push(choice)
  }
  return groups.filter((group) => group.models.length > 0)
}

/**
 * The level the reset control returns to: the model's own default, else the
 * first level. Returns -1 when the model publishes no levels.
 * @param {object[]} efforts - catalog levels.
 * @param {string|undefined} defaultEffort - the model's default id.
 * @returns {number} index.
 */
export function chatgptEffortDefaultIndex(efforts, defaultEffort) {
  return chatgptEffortIndexOf(efforts, undefined, defaultEffort)
}

/**
 * Every model the catalog offers, flattened to the shape the merged pill needs.
 *
 * The reference's single pill opens one menu with the model list on top and the
 * thinking-effort control underneath, so both halves read from one list: the
 * model rows and the effort levels of the *currently selected* model.
 *
 * @param {object|null|undefined} catalog - `modelCatalog().value`.
 * @returns {{provider: string, model: string, name: string, description: string, group: string, efforts: object[], defaultEffort?: string}[]} choices.
 */
export function chatgptModelChoices(catalog) {
  const groups = catalog?.groups
  if (!Array.isArray(groups)) return []
  const choices = []
  for (const group of groups) {
    if (group?.id === undefined) continue
    for (const model of group.models ?? []) {
      if (model?.id === undefined) continue
      const efforts = Array.isArray(model.reasoning?.efforts) ? model.reasoning.efforts : []
      choices.push({
        provider: group.id,
        model: model.id,
        name: typeof model.name === 'string' && model.name !== '' ? model.name : model.id,
        // The reference's model rows carry a one-line description under the
        // name; keep the Host's own copy when it ships one.
        description: typeof model.description === 'string' ? model.description : '',
        group: typeof group.name === 'string' ? group.name : group.id,
        efforts,
        defaultEffort: model.reasoning?.defaultEffort
      })
    }
  }
  return choices
}

/**
 * The choice a selection points at, falling back to an id match.
 * @param {object[]} choices - from `chatgptModelChoices`.
 * @param {{provider?: string, model?: string}|undefined} selection - projection value.
 * @returns {object|undefined} the matching choice.
 */
export function chatgptChoiceOf(choices, selection) {
  if (!Array.isArray(choices) || selection === undefined || selection === null) return undefined
  return (
    choices.find((choice) => choice.provider === selection.provider && choice.model === selection.model) ??
    choices.find((choice) => choice.model === selection.model)
  )
}

/**
 * The `selectModel` request for picking another model.
 *
 * The effort is kept when the next model publishes the same level, otherwise
 * the model's own default is used — the Host rejects an unknown level, so a
 * stale id must never travel.
 *
 * @param {string|undefined} sessionId - current session.
 * @param {object|undefined} choice - target from `chatgptModelChoices`.
 * @param {string|undefined} currentEffort - the level selected right now.
 * @returns {{sessionId: string, provider: string, model: string, reasoningEffort?: string}|null} request.
 */
export function chatgptModelRequest(sessionId, choice, currentEffort) {
  if (typeof sessionId !== 'string' || sessionId === '') return null
  if (choice === undefined || choice === null) return null
  const efforts = Array.isArray(choice.efforts) ? choice.efforts : []
  const keep = efforts.some((level) => level.id === currentEffort) ? currentEffort : undefined
  const level = keep ?? choice.defaultEffort ?? efforts[0]?.id
  return {
    sessionId,
    provider: choice.provider,
    model: choice.model,
    ...(level === undefined ? {} : { reasoningEffort: level })
  }
}

/**
 * The selection a `modelSelection` projection currently describes.
 * @param {object|undefined} value - projection value (`{next, lastUsed}`).
 * @returns {object|undefined} the pending selection, else the last used one.
 */
export function chatgptActiveSelection(value) {
  if (value === undefined || value === null) return undefined
  return value.next ?? value.lastUsed ?? undefined
}

/**
 * Approval menu entries from the process catalog, in the Host's order.
 * @param {object|null|undefined} catalog - `permissionPresets.catalog().value`.
 * @returns {{value: string, label: string, hostName: string}[]} entries.
 */
export function chatgptApprovalOptions(catalog) {
  const options = catalog?.options
  if (!Array.isArray(options)) return []
  return options.map((option) => ({
    value: option.value,
    label: CHATGPT_APPROVAL_NAMES[option.value] ?? option.name ?? option.value,
    hostName: option.name ?? option.value
  }))
}

/**
 * Short label for one approval value (the trigger's caption).
 * @param {string|undefined} value - `permissions.currentValue`.
 * @param {object[]} options - `chatgptApprovalOptions` result.
 * @returns {string} label, or an empty string when the value is unknown.
 */
export function chatgptApprovalLabel(value, options) {
  if (typeof value !== 'string' || value === '') return ''
  const known = CHATGPT_APPROVAL_NAMES[value]
  if (known !== undefined) return known
  const option = (options ?? []).find((entry) => entry.value === value)
  return option?.label ?? value
}

/**
 * Whether the approval menu should be offered at all: no catalog means no
 * permission service is composed, and a dead button would be worse than none.
 * @param {object|null|undefined} catalog - approval catalog.
 * @returns {boolean} true when at least two presets exist.
 */
export function chatgptApprovalAvailable(catalog) {
  return Array.isArray(catalog?.options) && catalog.options.length > 1
}
