/**
 * dsh-chatgpt-ui — sidebar brand (browser half fragment).
 *
 * P0-19b removed the Chat/Work switcher from the sidebar top. P0-19f then
 * dropped the logo icon: the mark slot is shadowed empty, the Host's wordmark
 * stays, and the header shows text only. `brand: hidden` still shadows both
 * slots.
 *
 * The old switcher implementation below is no longer mounted (the default
 * configuration returns before touching the slots); it is kept only as the
 * source for the recorded menu styling until a later cleanup removes it.
 *
 * This file is a fragment: no import/export statements — scripts/build-client.mjs
 * concatenates it inside the module-loader factory.
 */

const chatgptReactDom = require('react-dom')

/** Chat mark: an outlined conversation bubble, 18px, currentColor. */
const CHATGPT_BRAND_MARK_SVG =
  '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M20.5 11.2a8 8 0 0 1-11.6 7.1L4.2 19.6l1.3-4.4A8 8 0 1 1 20.5 11.2Z"/></svg>'

/** Work glyph: an outlined terminal window with a code prompt, 18px. */
const CHATGPT_WORK_MARK_SVG =
  '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="5" width="17" height="14" rx="2.6"/><path d="m7.5 9 3 3-3 3M13 15h4"/></svg>'

/** The product rows the menu offers, in reading order. */
const CHATGPT_BRAND_ITEMS = [MODE_CHAT, MODE_AGENT]

/**
 * Priority this skin registers the brand slots at.
 *
 * The host's own brand entries sit at the default priority 0, and the way to
 * replace a single-slot entry is a *lower* priority (lowest renders), so the
 * skin asks for -1. A third party that already shadowed the default is left
 * alone: it would collide at the same priority, and the host's rule is one
 * occupant per priority.
 */
const CHATGPT_BRAND_PRIORITY = -1

/**
 * Whether another plugin has already shadowed a single slot.
 *
 * The host's default entries carry no `id` and priority 0; only an occupant at
 * or below this skin's priority counts as "taken".
 * @param {object} ctx - client Cordis context (needs `slots`).
 * @param {string} slot - slot id.
 * @returns {boolean} true when a foreign registration would collide.
 */
function chatgptSlotTaken(ctx, slot) {
  try {
    const entries = ctx.slots.entriesOfSlot === undefined ? [] : ctx.slots.entriesOfSlot(slot)
    return (entries ?? []).some((entry) => (entry?.options?.priority ?? 0) <= CHATGPT_BRAND_PRIORITY)
  } catch {
    return false
  }
}

/**
 * Brand mark element for the selected product.
 * @param {{ mode?: 'chat'|'agent' }} [props] - product mode.
 * @returns {object} React element.
 */
function ChatgptBrandMark({ mode }) {
  return chatgptH('span', {
    className: 'chatgpt-brand-mark',
    'aria-hidden': 'true',
    dangerouslySetInnerHTML: {
      __html: mode === MODE_AGENT ? CHATGPT_WORK_MARK_SVG : CHATGPT_BRAND_MARK_SVG
    }
  })
}

/**
 * Product icon inside the menu.
 * @param {{ mode: 'chat'|'agent' }} props - product mode.
 * @returns {object} React element.
 */
function ChatgptProductMark({ mode }) {
  return chatgptH('span', {
    className: 'chatgpt-brand-menu-mark',
    'aria-hidden': 'true',
    dangerouslySetInnerHTML: {
      __html: mode === MODE_CHAT ? CHATGPT_BRAND_MARK_SVG : CHATGPT_WORK_MARK_SVG
    }
  })
}

/**
 * Switch the active product.
 *
 * A blank session changes preset in place. A started session (or no session at
 * all) gets a fresh session under the product's preset; the old conversation is
 * untouched. This is the deliberate action behind a menu row — the brand row's
 * own click never reaches the host's new-session handler.
 * @param {object} ctx - client Cordis context.
 * @param {'chat'|'agent'} target - chosen product.
 * @param {{ sessionId?: string, preset?: string, blank: boolean }} session - current session facts.
 * @returns {Promise<void>} resolves after the action was attempted.
 */
async function chatgptSelectProduct(ctx, target, session) {
  let preset = CHAT_PRESET_ID
  if (target === MODE_AGENT) {
    const roster = await chatgptPresetRoster(ctx)
    preset = roster.agentPreset
  }
  if (preset === null || preset === undefined) return
  // The brand switcher is the product decision point: whatever it lands on is
  // also the default the next 新聊天 starts in.
  chatgptWriteStoredProduct(productOfPreset(preset), preset)
  if (session.preset === preset) return
  try {
    if (session.sessionId !== undefined && session.blank === true && ctx.remote?.agentPresets !== undefined) {
      await ctx.remote.agentPresets.select(session.sessionId, preset)
      return
    }
    if (ctx.uiWorkspace?.startSession !== undefined) {
      ctx.uiWorkspace.startSession(undefined, { agentPreset: preset })
    }
  } catch (error) {
    console.warn(`[dsh-chatgpt-ui] product switch failed: ${error?.message ?? error}`)
  }
}

/**
 * Product switcher: icon + mode-dependent name + chevron, with a portal menu.
 * @param {object} props - slot props (global `useSessions`) plus `ctx`.
 * @returns {object} React element.
 */
function ChatgptBrandSwitcher(props) {
  const { useSessions, t, ctx } = props
  const session = useChatgptMainSession(useSessions)
  const mode = productOfPreset(session.preset)
  const [open, setOpen] = chatgptReact.useState(false)
  const [position, setPosition] = chatgptReact.useState({ left: 8, top: 8 })
  const triggerRef = chatgptReact.useRef(null)
  const menuRef = chatgptReact.useRef(null)
  const itemRefs = chatgptReact.useRef([])
  const selectedIndex = mode === MODE_CHAT ? 0 : 1
  const label = PRODUCT_LABELS[mode]
  // Root slots receive the standard props, but `t` is not guaranteed on every
  // host; keep the menu usable with the English fallback if it is absent.
  const tr = (key, fallback) => (typeof t === 'function' ? t(key) : fallback)
  const switchLabel = tr('brand.switch', 'Switch product')
  const menuLabel = tr('brand.menu', 'Products')

  const close = (restoreFocus) => {
    setOpen(false)
    if (restoreFocus === true && triggerRef.current !== null) triggerRef.current.focus()
  }

  const openMenu = () => {
    const rect = triggerRef.current?.getBoundingClientRect()
    if (rect === undefined) return
    const width = 208
    const height = 96
    const left = Math.min(Math.max(8, rect.left), Math.max(8, window.innerWidth - width - 8))
    const top = rect.bottom + 6 + height > window.innerHeight ? Math.max(8, rect.top - height - 6) : rect.bottom + 6
    setPosition({ left, top })
    setOpen(true)
  }

  chatgptReact.useEffect(() => {
    if (!open) return undefined
    const item = itemRefs.current[selectedIndex]
    if (item !== undefined && item !== null) item.focus()
    const onPointerDown = (event) => {
      if (menuRef.current?.contains(event.target) === true) return
      if (triggerRef.current?.contains(event.target) === true) return
      close(false)
    }
    const onViewportChange = () => close(false)
    document.addEventListener('pointerdown', onPointerDown, true)
    window.addEventListener('resize', onViewportChange)
    document.addEventListener('scroll', onViewportChange, true)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true)
      window.removeEventListener('resize', onViewportChange)
      document.removeEventListener('scroll', onViewportChange, true)
    }
  }, [open, selectedIndex])

  const onTriggerKeyDown = (event) => {
    if (event.key === 'Escape' && open) {
      event.preventDefault()
      event.stopPropagation()
      close(true)
      return
    }
    if (event.key === 'Enter' || event.key === ' ' || event.key === 'ArrowDown') {
      event.preventDefault()
      event.stopPropagation()
      if (open) {
        itemRefs.current[selectedIndex]?.focus()
      } else {
        openMenu()
      }
    }
  }

  const onMenuKeyDown = (event) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      close(true)
      return
    }
    if (event.key === 'Tab') {
      event.preventDefault()
      const focused = itemRefs.current.findIndex((item) => item === document.activeElement)
      const current = focused >= 0 ? focused : selectedIndex
      const delta = event.shiftKey ? -1 : 1
      const next = (current + delta + CHATGPT_BRAND_ITEMS.length) % CHATGPT_BRAND_ITEMS.length
      itemRefs.current[next]?.focus()
      return
    }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp' && event.key !== 'Home' && event.key !== 'End') return
    event.preventDefault()
    const focused = itemRefs.current.findIndex((item) => item === document.activeElement)
    let next = focused
    if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = CHATGPT_BRAND_ITEMS.length - 1
    else next = (Math.max(0, focused) + (event.key === 'ArrowDown' ? 1 : -1) + CHATGPT_BRAND_ITEMS.length) % CHATGPT_BRAND_ITEMS.length
    itemRefs.current[next]?.focus()
  }

  const choose = (target) => {
    close(true)
    if (target === mode) return
    void chatgptSelectProduct(ctx, target, session)
  }

  const menu =
    open && typeof document !== 'undefined'
      ? chatgptReactDom.createPortal(
          chatgptH(
            'div',
            {
              ref: menuRef,
              className: 'chatgpt-brand-menu',
              role: 'menu',
              'aria-label': menuLabel,
              'data-chatgpt-brand-menu': '',
              style: { left: `${position.left}px`, top: `${position.top}px` },
              onKeyDown: onMenuKeyDown
            },
            CHATGPT_BRAND_ITEMS.map((item, index) =>
              chatgptH(
                'button',
                {
                  key: item,
                  ref: (node) => {
                    itemRefs.current[index] = node
                  },
                  type: 'button',
                  role: 'menuitemradio',
                  'aria-checked': item === mode,
                  tabIndex: -1,
                  className: 'chatgpt-brand-menu-item',
                  'data-product': item,
                  onClick: () => choose(item)
                },
                chatgptH(ChatgptProductMark, { mode: item }),
                chatgptH('span', { className: 'chatgpt-brand-menu-label' }, PRODUCT_LABELS[item]),
                item === mode
                  ? chatgptH('span', {
                      className: 'chatgpt-brand-menu-check',
                      'aria-hidden': 'true',
                      dangerouslySetInnerHTML: {
                        __html:
                          '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m3.5 8.5 3 3 6-7"/></svg>'
                      }
                    })
                  : null
              )
            )
          ),
          document.body
        )
      : null

  return chatgptH(
    'span',
    {
      ref: triggerRef,
      className: 'chatgpt-brand-switcher',
      'data-chatgpt-brand-switcher': '',
      role: 'button',
      tabIndex: 0,
      'aria-haspopup': 'menu',
      'aria-expanded': open,
      'aria-label': `${switchLabel}: ${label}`,
      title: `${label} — ${switchLabel}`,
      onClick: (event) => {
        event.preventDefault()
        event.stopPropagation()
        if (open) close(false)
        else openMenu()
      },
      onKeyDown: onTriggerKeyDown,
      onPointerDown: (event) => {
        event.stopPropagation()
      }
    },
    chatgptH(ChatgptBrandMark, { mode }),
    chatgptH('span', { className: 'chatgpt-brand-switcher-label' }, label),
    chatgptH('span', {
      className: 'chatgpt-brand-chevron',
      'aria-hidden': 'true',
      dangerouslySetInnerHTML: {
        __html:
          '<svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="m4 6 4 4 4-4"/></svg>'
      }
    }),
    menu
  )
}

/**
 * Register the brand slots: text-only by default, fully hidden with `brand: hidden`.
 *
 * P0-19f: the sidebar header keeps the Host's wordmark but drops the logo icon.
 * The Host's `sidebar.brand.mark` entry is shadowed by an empty component (the
 * icon node disappears from the DOM, not just from paint); the name slot stays
 * Host-native. `brand: hidden` still shadows both slots.
 *
 * @param {object} ctx - client Cordis context (needs `slots`).
 * @param {{brand?: string}} [config] - plugin config (`brand: hidden` hides the brand).
 * @returns {() => void} disposer removing whatever was registered.
 */
function mountChatgptBrand(ctx, config) {
  const mode = brandMode(config?.brand)
  const disposers = []
  const markTaken = chatgptSlotTaken(ctx, 'sidebar.brand.mark')
  if (markTaken) {
    console.warn(
      '[dsh-chatgpt-ui] sidebar brand mark already owned by another plugin; leaving it untouched'
    )
  } else {
    disposers.push(
      ctx.slots.inject('sidebar.brand.mark', () =>
        ctx.slots.register(
          { name: 'sidebar.brand.mark', id: 'chatgpt-brand-mark', priority: CHATGPT_BRAND_PRIORITY },
          () => null
        )
      )
    )
  }
  if (mode === 'hidden') {
    if (chatgptSlotTaken(ctx, 'sidebar.brand.name')) {
      console.warn(
        '[dsh-chatgpt-ui] sidebar brand name already owned by another plugin; leaving it untouched'
      )
    } else {
      disposers.push(
        ctx.slots.inject('sidebar.brand.name', () =>
          ctx.slots.register(
            { name: 'sidebar.brand.name', id: 'chatgpt-brand-name', priority: CHATGPT_BRAND_PRIORITY },
            () => null
          )
        )
      )
    }
  }
  return () => {
    for (const dispose of disposers) dispose()
  }
}
