/**
 * dsh-chatgpt-ui — Chat-mode permission policy, host half.
 *
 * A Chat session must be read-only no matter what the UI says, so this is
 * enforced on the Host: whenever an Agent's composed preset is `chat`, the
 * session's sandbox is pinned to `read-only`, its approval policy to `never`,
 * and the knobs in force before the switch are persisted so leaving the mode
 * (only possible while the session is blank) puts them back.
 *
 * Non-Chat sessions are never touched: the only input is
 * `ctx.agentPresets.composedPreset(agent.ctx)`, which dot's Worker sessions do
 * not match, so they keep their own permissions.
 *
 * Two host calls the upstream reference imports are re-stated as the events they
 * append (`setSandboxMode` is `session.append('sandbox/mode', …)`, and
 * `setApprovalPolicy` appends `approval/policy`), because a profile-linked
 * plugin cannot resolve `@deepseek-ai/*` specifiers — verified on the isolated
 * instance (ERR_MODULE_NOT_FOUND). That keeps this file dependency-free.
 *
 * Behaviour follows the MIT-licensed `dsh-preset-chat/lib/chat-policy.js`
 * (attribution in docs/licenses.md); the code is an independent implementation
 * narrowed to the `chat` preset, with every optional surface guarded so a host
 * without it degrades instead of failing the profile.
 */

import {
  CHAT_APPROVAL_POLICY,
  CHAT_PRESET_ID,
  CHAT_SANDBOX_MODE,
  createChatPolicy,
  permissionState
} from './chat-policy-core.js'

export const name = 'dsh-chatgpt-ui-chat-policy'

/** Host services this policy reads and writes. */
export const inject = [
  'agents',
  'agentPresets',
  'permissionPresets',
  'sandboxPolicy',
  'approval',
  'sessionProjections',
  'storageDomain'
]

/** Marker the image tool returns when the workspace write leg was skipped. */
const ATTACHMENT_ONLY = 'DSH_CHAT_IMAGE_ATTACHMENT_ONLY'

/** Storage domain that keeps one recovery record per Chat session. */
const STORAGE_DOMAIN = 'dsh_chatgpt_ui_chat_permissions'

/**
 * Record validator handed to the storage domain.
 *
 * The domain layer validates records with a zod schema; zod is not resolvable
 * from a profile-linked plugin (same ERR_MODULE_NOT_FOUND as above), so this is
 * the two-method subset the domain runtime actually calls — `safeParse` to prove
 * the global does not accept `null` (the medium's "never written" sentinel) and
 * `parse` to validate a stored value on open.
 */
const recordMapSchema = {
  safeParse(value) {
    return { success: typeof value === 'object' && value !== null && !Array.isArray(value) }
  },
  parse(value) {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      throw new TypeError('chat permission records must be an object map')
    }
    const checked = {}
    for (const [key, record] of Object.entries(value)) {
      if (typeof record !== 'object' || record === null) continue
      checked[key] = permissionState(record)
    }
    return checked
  }
}

/**
 * Wrap the image tool so generated images stay conversation attachments.
 * @param {object} original - the registered image tool definition.
 * @returns {object} the same tool with `output_path` removed and the skip marker honoured.
 */
export function attachmentOnlyImagegen(original) {
  const parameters = structuredClone(original.parameters)
  delete parameters.properties?.output_path
  if (Array.isArray(parameters.required)) {
    parameters.required = parameters.required.filter((field) => field !== 'output_path')
  }
  return {
    ...original,
    description:
      'Generate or edit an image and return it as a chat attachment. Images stay in this conversation; never write them into the project folder.',
    parameters,
    async execute(args, exec) {
      const value = await original.execute(args, exec)
      if (typeof value?.writeError === 'string' && value.writeError.endsWith(ATTACHMENT_ONLY)) {
        const { writeError: _error, ...attachment } = value
        return attachment
      }
      return value
    }
  }
}

/**
 * Mount the policy.
 * @param {import('@deepseek-ai/cordis').Context} ctx - host Cordis context.
 * @returns {Promise<void>} resolves once the recovery records are loaded.
 */
export async function apply(ctx) {
  const domain = await ctx.storageDomain.open({
    name: STORAGE_DOMAIN,
    version: 1,
    tables: {},
    global: { schema: recordMapSchema, initial: {} }
  })

  let storageError = false
  const reportStorageError = () => {
    if (storageError) return
    storageError = true
    console.warn('[dsh-chatgpt-ui] chat permission record could not be saved; restore runs from memory until restart')
  }

  const isChat = (agent) => agent?.ctx !== undefined && ctx.agentPresets.composedPreset(agent.ctx) === CHAT_PRESET_ID

  const readPermission = (session) => ({
    mode: ctx.sandboxPolicy.resolve({ session }).mode,
    policy: ctx.approval.overrideOf(session) ?? ctx.approval.config.policy ?? 'ask',
    preset: ctx.sessionProjections.stateOf(session, 'permissions')?.preset ?? null
  })

  /**
   * Optional surfaces: prompt shadow, `/permission` command, tool guard, image
   * attachment rewrite. Each block checks for its own API, so a host without one
   * keeps the read-only pin and loses only that surface.
   */
  const attach = (agent) => {
    let dispose
    try {
      const fiber = agent.ctx.inject(['tools', 'commands', 'systemPrompt'], (inner) => {
        const disposers = []

        try {
          // Chat has no project directory in context; the workspace itself stays
          // resolvable for attachments.
          inner.systemPrompt.context({
            name: 'working-directory:current',
            order: inner.systemPrompt.getContextOrder?.('WORKING_DIRECTORY') ?? 100,
            required: true,
            interpolate: false,
            text: ''
          })
        } catch {
          /* prompt layout differs on this host: skip the shadow */
        }

        try {
          const native = inner.commands.find?.(agent, 'permission')
          inner.commands.register({
            name: 'permission',
            description: 'Chat 模式固定只读，不允许提升权限 / Chat mode is read-only; escalation is unavailable',
            input: { hint: '[read-only]' },
            handler: (invocation) => {
              if (!isChat(agent)) return native?.handler(invocation)
              const requested = String(invocation.rawInput ?? '').trim()
              return {
                kind: requested === '' || requested === CHAT_SANDBOX_MODE ? 'success' : 'error',
                text: 'Chat 模式固定为只读权限，不能提升；生成的图片保留为会话附件。'
              }
            }
          })
        } catch {
          /* no command surface: the tool guard still blocks escalation */
        }

        try {
          inner.tools.guard?.((exec) => {
            if (!isChat(agent)) return undefined
            if (exec?.arguments?.sandbox_permissions === 'require_escalated') {
              return 'Chat 模式固定只读，不允许提升权限。'
            }
            return undefined
          })
        } catch {
          /* no guard hook */
        }

        try {
          inner.systemPrompt.section({
            name: 'chatgpt-ui:chat-read-only',
            order: 340,
            text:
              'This session runs the Chat preset: project files are read-only and sandbox escalation is unavailable. ' +
              'Read attached or explicitly referenced documents normally; never claim to have written project files. ' +
              'Generated images are returned as conversation attachments only.'
          })
        } catch {
          /* no section API */
        }

        try {
          let original
          let imageDispose
          const refresh = () => {
            const next = inner.tools.get?.('imagegen')
            if (next === original) return
            original = next
            imageDispose?.()
            imageDispose = undefined
            if (next) imageDispose = inner.tools.register(attachmentOnlyImagegen(next))
          }
          refresh()
          inner.on?.('tools/change', refresh)
          disposers.push(() => imageDispose?.())
        } catch {
          /* image tool absent: nothing to rewrite */
        }

        return disposers
      })
      dispose = () => {
        try {
          fiber?.dispose?.()
        } catch {
          /* already disposed */
        }
      }
    } catch (error) {
      console.warn(`[dsh-chatgpt-ui] chat surfaces unavailable: ${error?.message ?? error}`)
    }
    return dispose
  }

  const policy = createChatPolicy({
    isChat,
    readPermission,
    applyPreset: (session, preset) => ctx.permissionPresets.set(session, preset),
    applySandbox: (session, mode) => session.append('sandbox/mode', { mode }),
    applyApproval: (session, policy) => session.append('approval/policy', { policy }),
    permissionPresetNames: () => ctx.permissionPresets.names,
    loadRecords: () => domain.global.get(),
    saveRecords: (records) => domain.global.set(records),
    attach,
    onStorageError: reportStorageError
  })

  ctx.on('agent/created', ({ agent }) => policy.reconcile(agent))
  // This notification is delivered inside the session append that recorded the
  // switch, and an append may not reenter another append — so the repair runs
  // after publication instead of inside it.
  ctx.on('agent-preset/selected', (id) => {
    const agent = ctx.agents.get(id)
    if (agent === undefined) return undefined
    return Promise.resolve().then(() => policy.reconcile(agent))
  })
  ctx.on('agent/disposed', ({ agent }) => policy.release(agent))

  // A session append cannot append again from inside its own observer, so a
  // knob change is repaired just after publication instead of reentrantly.
  ctx.on('session/event', (session, event) => {
    if (!['permission/preset', 'sandbox/mode', 'approval/policy'].includes(event?.type)) return
    const agent = ctx.agents.get(session.id)
    if (agent === undefined) return
    queueMicrotask(() => {
      policy.reconcile(agent).catch(() => {})
    })
  })

  ctx.effect(
    () => async () => {
      policy.disposeAll()
      await domain.close()
    },
    'dsh-chatgpt-ui: chat policy storage'
  )

  for (const agent of ctx.agents.list()) await policy.reconcile(agent)
}

export { CHAT_APPROVAL_POLICY, CHAT_PRESET_ID, CHAT_SANDBOX_MODE }
