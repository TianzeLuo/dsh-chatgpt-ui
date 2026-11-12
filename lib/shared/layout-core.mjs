/**
 * Layout panel access for the browser half (shared, inlined by the bundle).
 *
 * Why a module instead of a direct `ctx.layout` read: the rail, the sidebar
 * list and the composer mount under different `ctx.inject([...])` sets. Reading
 * a service property the current context did not declare throws
 * `cannot get property "layout" without inject`, which is exactly what the
 * super-agent rail/sidebar entries did. `ctx.get` is the optional accessor — it
 * returns `undefined` instead of throwing — so every panel open goes through
 * `chatgptSelectPanel`, and a host without the layout service gets a `false`
 * return the caller can report instead of a dead button or a stack trace.
 *
 * The second guard is the main-slot registry: `layout.selectPanel` throws for an
 * id the host never registered, and plugin availability differs per install
 * (the plugin manager ships as `dsh-client-ui-plugin-manager`, dot as an
 * optional third-party panel). Asking `hasMainPanel` first turns that into a
 * boolean.
 */

/**
 * Resolve the layout service without an inject requirement.
 *
 * `ctx.get` never throws; the `ctx.layout` fallback is wrapped anyway so an
 * exotic context (a plain object in a test, a detached fiber) cannot break a
 * click path.
 *
 * @param {object} ctx - any client Cordis context (or a stand-in in tests).
 * @returns {object|undefined} the layout controller when the host provides it.
 */
export function chatgptResolveLayout(ctx) {
  if (ctx === undefined || ctx === null) return undefined
  if (typeof ctx.get === 'function') {
    try {
      const service = ctx.get('layout')
      if (service !== undefined && service !== null) return service
    } catch {
      return undefined
    }
  }
  try {
    return ctx.layout ?? undefined
  } catch {
    return undefined
  }
}

/**
 * Select a Host main panel, or `null` to return to the conversation.
 *
 * @param {object} ctx - any client Cordis context.
 * @param {string|null} panelId - main-slot panel key; `null` selects the conversation.
 * @returns {boolean} true when the host accepted the request.
 */
export function chatgptSelectPanel(ctx, panelId) {
  const layout = chatgptResolveLayout(ctx)
  if (typeof layout?.selectPanel !== 'function') return false
  if (panelId !== null) {
    const has = typeof layout.hasMainPanel === 'function' ? layout.hasMainPanel(panelId) : undefined
    if (has === false) return false
  }
  try {
    layout.selectPanel(panelId)
    return true
  } catch {
    return false
  }
}
