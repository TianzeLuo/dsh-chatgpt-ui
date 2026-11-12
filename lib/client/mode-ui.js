/**
 * dsh-chatgpt-ui — mode switcher UI (browser half fragment).
 *
 * Two seats, one policy (lib/shared/mode-core.mjs):
 *
 *   conversation.header.leading — the centred Chat/Work segment. This is the
 *     new-session mode entry: it appears only while the main session is still a
 *     blank draft, and its host is root-scoped, so it also paints
 *     `body[data-chatgpt-mode]` for the display rules below.
 *
 *   conversation.input.left — Chat mode's read-only note, once a session has
 *     started.
 *
 * A started session shows no Chat/Work switch anywhere: the sidebar keeps the
 * Host's own brand (no product switcher), and the top segment removes itself
 * (`blank === false`). The remembered default for the next 新聊天 lives in
 * `dsh-chatgpt-ui:product-default`.
 *
 * The seats only write `body[data-chatgpt-mode]` for display rules; the real
 * permission switch is the Host policy (`lib/host/chat-policy.js`).
 *
 * Phase 1 turns the switcher into a two-product control: Chat (the `chat`
 * preset) and Work (the deployment's default agent preset). The dot segment is
 * gone; the super-agent panel is reached from its own sidebar row.
 *
 * This file is a fragment: no import/export statements — scripts/build-client.mjs
 * concatenates it inside the module-loader factory, where `require` is the
 * module loader's own resolver.
 */

const chatgptReact = require('react')
const chatgptH = chatgptReact.createElement

/**
 * Read the session the main conversation currently retains.
 *
 * `conversation.header.leading` is a root-scoped slot: it receives the global
 * `useSessions` hook but no `sessionId` / `useProjection`. The retained main
 * view row is the host's own identity for "the conversation on screen" (the
 * workspace browser uses the same `retainedBy.mainView` signal). The selector
 * returns a primitive string so `useSessions` keeps a stable snapshot.
 * @param {object|undefined} list - session list snapshot.
 * @returns {string} `sessionId\0preset\0blank` or an empty string.
 */
function chatgptMainSessionKey(list) {
  const rows = list?.byId ?? {}
  for (const row of Object.values(rows)) {
    if ((row?.retainedBy?.mainView ?? 0) <= 0) continue
    const projection = list?.projectionsBySession?.[row.id]?.values ?? row?.projectionValues
    const preset = projection?.agentPreset ?? ''
    return `${row.id}\u0000${preset}\u0000${row.blank === true ? '1' : '0'}`
  }
  return ''
}

/**
 * Resolve the retained main session from a global `useSessions` hook.
 * @param {Function|undefined} useSessions - global slot hook.
 * @returns {{ sessionId: string|undefined, preset: string|undefined, blank: boolean }} session facts.
 */
function useChatgptMainSession(useSessions) {
  const key =
    typeof useSessions === 'function'
      ? useSessions(chatgptMainSessionKey)
      : ''
  if (key === '') return { sessionId: undefined, preset: undefined, blank: true }
  const [sessionId, preset, blank] = key.split('\u0000')
  return {
    sessionId: sessionId === '' ? undefined : sessionId,
    preset: preset === '' ? undefined : preset,
    blank: blank !== '0'
  }
}

/**
 * Subscribe to the roster store.
 * @param {object} roster - store from `createChatgptModeRoster`.
 * @returns {object} current roster state.
 */
function useChatgptRoster(roster) {
  return chatgptReact.useSyncExternalStore(roster.subscribe, roster.get, roster.get)
}

/**
 * Paint `body[data-chatgpt-mode]` while mounted.
 * @param {string|null|undefined} preset - `agentPreset` projection value.
 * @returns {void}
 */
function useChatgptModeAttribute(preset) {
  chatgptReact.useEffect(() => {
    chatgptPaintMode(preset)
    return () => chatgptClearMode()
  }, [preset])
}

/**
 * The confirmation row shared by both seats.
 * @param {object} props - `t`, `decision`, `onAccept`, `onCancel`.
 * @returns {object} React element.
 */
function ChatgptModeConfirm(props) {
  const { t, decision, onAccept, onCancel } = props
  // A fixed-position toast at the bottom centre: ChatGPT's own "can't do that
  // here" note, not a dialog. One line of copy plus the one action that is
  // actually possible (start a new chat); Escape / the × dismisses it.
  chatgptReact.useEffect(() => {
    if (typeof document === 'undefined') return undefined
    const onKey = (event) => {
      if (event.key === 'Escape') onCancel()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onCancel])
  return chatgptH(
    'div',
    {
      className: 'chatgpt-toast',
      'data-chatgpt-toast': '',
      role: 'status',
      'aria-live': 'polite',
      title: t('mode.confirm.title')
    },
    chatgptH('span', { className: 'chatgpt-toast-text' }, t('mode.confirm.body')),
    chatgptH(
      'button',
      {
        type: 'button',
        className: 'chatgpt-toast-action',
        onClick: () => onAccept(decision)
      },
      t('mode.confirm.action')
    ),
    chatgptH(
      'button',
      {
        type: 'button',
        className: 'chatgpt-toast-close',
        'aria-label': t('mode.confirm.cancel'),
        onClick: onCancel
      },
      '\u00d7'
    )
  )
}

/**
 * Top-centre product segment (`conversation.header.leading`).
 *
 * This seat is root-scoped, so it derives the on-screen session from the global
 * `useSessions` hook instead of a `sessionId` prop. It reads the same state the
 * session-header seat would and keeps the confirmation policy for a started
 * conversation.
 * @param {object} props - slot props (`useSessions`, `t`) plus `roster`, `ctx`.
 * @returns {object} React element.
 */
function ChatgptModeSwitch(props) {
  const { useSessions, t, roster, ctx } = props
  const state = useChatgptRoster(roster)
  const session = useChatgptMainSession(useSessions)
  const { sessionId, preset, blank } = session
  const [pending, setPending] = chatgptReact.useState(null)
  useChatgptModeAttribute(preset)
  chatgptReact.useEffect(() => {
    void roster.load()
  }, [roster])

  const visible = visibleSegments(state)
  const run = (decision) => {
    // P0-18b: a product switch is an explicit transition and should still play
    // the hero enter fade, even after a project switch suppressed it.
    if (typeof document !== 'undefined') document.body.removeAttribute('data-chatgpt-project-switch')
    chatgptApplyDecision(ctx, decision, { sessionId }).catch((error) => {
      console.warn(`[dsh-chatgpt-ui] mode switch failed: ${error?.message ?? error}`)
      // The connection guard already told the user when the carrier died.
      if (error?.name !== 'ChatgptConnectionError') {
        chatgptShowConnectionToast(`模式切换失败：${error?.message ?? error}`)
      }
    })
  }
  // The segment is the NEW-session control, not a property of a conversation.
  // A started session keeps the mode it was composed with, so the control is
  // absent there; the new-chat page top is the only place it appears.
  if (blank === false) return null
  const segments = []
  if (visible.chat) segments.push(MODE_CHAT)
  segments.push(MODE_AGENT)

  return chatgptH(
    'div',
    { className: 'chatgpt-mode chatgpt-header-mode', 'data-chatgpt-mode-switch': 'header' },
    chatgptH(
      'div',
      { className: 'chatgpt-mode-group', role: 'group', 'aria-label': t('mode.label') },
      segments.map((segment) =>
        chatgptH(
          'button',
          {
            key: segment,
            type: 'button',
            className: 'chatgpt-mode-seg',
            'data-segment': segment,
            'aria-pressed':
              segment === MODE_CHAT ? preset === CHAT_PRESET_ID : preset !== CHAT_PRESET_ID,
            title: t(segment === MODE_CHAT ? 'mode.chat.hint' : 'mode.agent.hint'),
            onClick: () => {
              // The centred segment is also visible on the sessionless page,
              // where there is no preset to change in place. A click then
              // starts the first session for that product.
              if (sessionId === undefined) {
                const targetPreset = segment === MODE_CHAT ? CHAT_PRESET_ID : state.agentPreset
                if (targetPreset !== null) run({ kind: 'new-session', preset: targetPreset })
                return
              }
              const decision = decideModeAction({
                target: segment,
                currentPreset: preset,
                blank,
                presets: state.presets,
                agentPreset: state.agentPreset,
                dotAvailable: state.dotAvailable
              })
              if (decision.kind === 'confirm-new-session') {
                setPending(decision)
                return
              }
              if (isActionable(decision)) run(decision)
            }
          },
          chatgptH('span', { className: 'chatgpt-mode-text' }, PRODUCT_SEGMENT_LABELS[segment])
        )
      )
    ),
    pending === null
      ? null
      : chatgptH(ChatgptModeConfirm, {
          t,
          decision: pending,
          onAccept: (decision) => {
            setPending(null)
            run({ kind: 'new-session', preset: decision.preset })
          },
          onCancel: () => setPending(null)
        })
  )
}

/** Lock glyph for the read-only chip (14px, currentColor). */
const CHATGPT_LOCK_SVG =
  '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.9" aria-hidden="true"><rect x="4.5" y="10.5" width="15" height="9.5" rx="2.2"/><path d="M8.2 10.5V7.8a3.8 3.8 0 0 1 7.6 0v2.7"/></svg>'

/**
 * Chat mode's read-only note (`conversation.input.left`).
 *
 * The host's permission chip names a Host preset ("Workspace Write" on the
 * default one). Chat mode overwrites that preset from the host half, so the
 * chip would name something that no longer applies; this entry states what does
 * hold instead, and only in Chat mode. It is a note, not a control: clicking it
 * opens no menu, so it cannot look like it widens access.
 * @param {object} props - slot props (`useProjection`, `t`).
 * @returns {object|null} React element, or null outside Chat mode.
 */
function ChatgptReadOnlyChip(props) {
  const { useProjection, t } = props
  const preset = typeof useProjection === 'function' ? useProjection('agentPreset') : undefined
  if (preset !== CHAT_PRESET_ID) return null
  return chatgptH(
    'span',
    {
      className: 'chatgpt-readonly',
      'data-chatgpt-readonly': '',
      role: 'note',
      title: t('mode.readonly.title')
    },
    chatgptH('span', {
      className: 'chatgpt-readonly-icon',
      'aria-hidden': 'true',
      dangerouslySetInnerHTML: { __html: CHATGPT_LOCK_SVG }
    }),
    chatgptH('span', { className: 'chatgpt-readonly-text' }, t('mode.readonly'))
  )
}

/**
 * Register the two roster-backed seats (top segment, read-only chip).
 * @param {object} ctx - client Cordis context (needs `slots`).
 * @param {object} roster - shared roster store.
 * @returns {() => void} disposer removing every registration.
 */
function mountChatgptModeSlots(ctx, roster) {
  const disposers = []
  disposers.push(
    ctx.slots.inject('conversation.header.leading', () =>
      ctx.slots.register(
        {
          name: 'conversation.header.leading',
          id: 'chatgpt-mode-switch',
          order: 20,
          locale: CHATGPT_LOCALE_NS
        },
        (props) => chatgptH(ChatgptModeSwitch, { ...props, roster, ctx })
      )
    )
  )
  disposers.push(
    ctx.slots.inject('conversation.input.left', () =>
      ctx.slots.register(
        {
          name: 'conversation.input.left',
          id: 'chatgpt-read-only',
          order: 10,
          locale: CHATGPT_LOCALE_NS
        },
        (props) => chatgptH(ChatgptReadOnlyChip, props)
      )
    )
  )
  return () => {
    for (const dispose of disposers) dispose()
  }
}
