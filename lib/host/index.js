/**
 * dsh-chatgpt-ui — host half.
 *
 * M0 is a no-op: the skin is browser-only. M2 adds the Chat-mode read-only
 * policy here (see docs/chatgpt-ui-plan.md §3.5), mounted from the same row as
 * the browser half, so nothing needs to change on the client side.
 *
 * Deliberately dependency-free and side-effect-free: a host half that throws at
 * import time would take the whole profile down with it.
 */

export const name = 'dsh-chatgpt-ui'

/** No host services are required until M2. */
export const inject = []

/**
 * Install the host half.
 * @param {import('@deepseek-ai/cordis').Context} ctx - owning Cordis context.
 * @returns {void}
 */
export function apply() {}
