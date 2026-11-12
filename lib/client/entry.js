/**
 * dsh-chatgpt-ui — browser entry (fragment).  Concatenated into lib/client.js
 * by scripts/build-client.mjs, inside the `window.__ModuleLoader__.load`
 * factory, so it must not contain import/export statements.
 *
 * M0 installed three things: the document mark (`body[data-chatgpt-ui]`), the
 * alias-token layer through `ctx.theme.overrideTokens`, and the single
 * stylesheet. M2/M3 added three more, each in its own effect so a host that lacks
 * one seat keeps the rest:
 *
 *   4. the locale namespace backing the switcher's copy;
 *   5. the product switcher (centred header segment + new-page cards) and the
 *      `body[data-chatgpt-mode]` display attribute;
 *   6. the product switcher in the sidebar brand seat (mark hidden, name
 *      renders the portal menu), skipped when another plugin already owns those
 *      single slots;
 *   7. the fixed 52px rail overlay and the Settings launcher bridge;
 *   8. the self-rendered sidebar session list that replaces the host's
 *      `sidebar.workspaces` occupant while keeping the host shell around it.
 *
 * Every install is wrapped in ctx.effect, so unloading the plugin restores the
 * previous palette, removes the sheet, unregisters the slots, and drops the
 * brand — no reload.
 */

/** Keep in sync with package.json / skin.json. */
const CHATGPT_UI_VERSION = '0.1.0'

/** Document attribute gating every rule in css/. */
const CHATGPT_BODY_ATTR = 'data-chatgpt-ui'

/** Runtime skin switch. `off` mounts nothing, so the Host renders exactly as if
 * the plugin were not installed (used by the native-parity gate). */
const CHATGPT_SKIN_ATTR = 'data-cgpt-skin'

/** Services the plugin waits for before mounting anything (slots are the only hard one). */
const inject = ['slots', 'uiWorkspace', 'remote', 'remote.agentPresets']

/** Services the switcher adds once they exist (the remote namespace is a service of its own). */
const CHATGPT_MODE_SERVICES = ['locale', 'remote', 'remote.agentPresets', 'uiWorkspace', 'layout']

/**
 * Mount the skin.
 * @param {object} ctx - client Cordis context.
 * @param {{brand?: 'dot'|'chatgpt'|'hidden'}} [config] - plugin config from the
 *   profile's patch layer (`brand` picks the sidebar wordmark; default `dot`).
 * @returns {void}
 */
function apply(ctx, config) {
  const doc = typeof document === 'undefined' ? undefined : document
  if (doc === undefined || doc.body === null) {
    console.warn('[dsh-chatgpt-ui] no document at mount time; skin skipped')
    return
  }

  const querySkin = typeof location === 'undefined' ? null : new URLSearchParams(location.search).get('skin')
  let storedSkin = null
  try {
    storedSkin = window.localStorage?.getItem('cgpt-skin') ?? null
  } catch {
    // Storage can be unavailable in a hardened context; the config switch and
    // the default (on) remain.
  }
  if (config?.skin === 'off' || config?.skin === false || querySkin === 'off' || storedSkin === 'off') {
    console.info('[dsh-chatgpt-ui] skin disabled; Host left untouched')
    return
  }

  ctx.effect(() => {
    const previous = doc.body.getAttribute(CHATGPT_BODY_ATTR)
    const previousSkin = doc.body.getAttribute(CHATGPT_SKIN_ATTR)
    doc.body.setAttribute(CHATGPT_BODY_ATTR, CHATGPT_UI_VERSION)
    doc.body.setAttribute(CHATGPT_SKIN_ATTR, 'on')
    return () => {
      if (previous === null) doc.body.removeAttribute(CHATGPT_BODY_ATTR)
      else doc.body.setAttribute(CHATGPT_BODY_ATTR, previous)
      if (previousSkin === null) doc.body.removeAttribute(CHATGPT_SKIN_ATTR)
      else doc.body.setAttribute(CHATGPT_SKIN_ATTR, previousSkin)
    }
  }, 'dsh-chatgpt-ui: document mark')

  ctx.effect(() => mountChatgptStyles(doc, CHATGPT_CSS_TEXT), 'dsh-chatgpt-ui: stylesheet')

  // P1-e: the Host has no visibility/resume hook, so a tab that comes back
  // with a half-open mux socket keeps reporting `connected` forever. Rebuild
  // the generation on return (and on the first click after a long idle), and
  // time out any host call that never settles instead of failing silently.
  ctx.effect(() => mountChatgptConnectionWatchdog(ctx), 'dsh-chatgpt-ui: connection watchdog')

  // Keyboard modality marker: the host autofocuses the composer, and Chrome
  // treats that programmatic focus as :focus-visible. A persistent 2px ring on
  // every fresh page would be louder than the reference, so the ring is gated
  // on a real Tab key and cleared by any pointer press.
  ctx.effect(() => {
    const onKey = (event) => {
      if (event.key === 'Tab') doc.body.setAttribute('data-cgpt-keyboard', 'true')
    }
    const onPointer = () => doc.body.removeAttribute('data-cgpt-keyboard')
    doc.addEventListener('keydown', onKey, true)
    doc.addEventListener('pointerdown', onPointer, true)
    return () => {
      doc.removeEventListener('keydown', onKey, true)
      doc.removeEventListener('pointerdown', onPointer, true)
      doc.body.removeAttribute('data-cgpt-keyboard')
    }
  }, 'dsh-chatgpt-ui: keyboard modality')

  // Module 4: the code-wrap default. M15 removed the process-group annotation:
  // the process/step/thinking region is the Host's, including its summary copy,
  // so this observer only flips the initial state of code cards.
  ctx.effect(() => mountChatgptMessages(doc), 'dsh-chatgpt-ui: message affordances')
  ctx.effect(() => mountChatgptTriggerMenus(doc), 'dsh-chatgpt-ui: trigger menu tags')

  // Module 7: the @ project group is a Host-trigger source, populated from the
  // real workspace snapshot. It inserts the Host's own folder reference so the
  // composer chip and message renderer stay native.
  ctx.inject(['workspaces', 'inputTriggers'], (scope) => {
    scope.effect(() => mountChatgptProjectMentions(scope), 'dsh-chatgpt-ui: @ project source')
  })

  ctx.inject(['theme'], (scope) => {
    scope.effect(() => installChatgptTheme(scope), 'dsh-chatgpt-ui: token layer')
  })

  // The list owns the single `sidebar.workspaces` seat. It needs the session
  // and workspace services, not the preset roster, so a host without that
  // remote namespace still gets a working list.
  // `layout` is listed so the list's own context carries the service it needs
  // for the super-agent row (its panel id lives in the main slot). The click
  // path still goes through `chatgptSelectPanel`, which reads the service with
  // `ctx.get`, so a host without it cannot throw "without inject".
  // `remote.session` backs the project menu's 在资源管理器中打开 (reveal) and is
  // already a core Web service; the list still works when only workspaceFiles
  // is mounted, because the reveal entry disables itself without the namespace.
  ctx.inject(
    ['slots', 'sessions', 'workspaces', 'uiWorkspace', 'layout', 'remote.workspaceFiles', 'remote.session'],
    (scope) => {
      scope.effect(() => mountChatgptSessionList(scope), 'dsh-chatgpt-ui: sidebar session list')
    }
  )

  // Module 5: the project page and its file picker use read-only Host file
  // listings plus the native right-sidebar document preview. The overlay is
  // independent of the sidebar mount; a host without workspaceFiles simply
  // shows the API boundary instead of a fake file tree.
  ctx.inject(['slots', 'sessions', 'workspaces', 'uiWorkspace', 'remote.workspaceFiles'], (scope) => {
    scope.inject(['sidebarRight'], (inner) => {
      inner.effect(() => mountChatgptProjectPage(inner), 'dsh-chatgpt-ui: project page')
    })
  })

  // Brand needs slots only, so it survives a host that does not mount the
  // preset remote namespace.
  ctx.inject(['slots'], (scope) => {
    scope.effect(() => mountChatgptBrand(scope, config), 'dsh-chatgpt-ui: brand')
    scope.effect(() => mountChatgptTriggerFeedback(scope), 'dsh-chatgpt-ui: trigger no-result state')

    scope.inject(CHATGPT_MODE_SERVICES, (inner) => {
      inner.effect(() => mountChatgptLocales(inner), 'dsh-chatgpt-ui: locale namespace')
      const roster = createChatgptModeRoster(inner)
      inner.effect(() => mountChatgptModeSlots(inner, roster), 'dsh-chatgpt-ui: mode switcher')
      inner.effect(() => mountChatgptRail(inner), 'dsh-chatgpt-ui: permanent icon rail')
    })

    // Work composer (Phase 4B): the effort chip and the tool bar read two Host
    // remotes of their own, so they mount behind their own inject and simply
    // stay absent on a host that does not compose them.
    scope.inject(['remote.session', 'remote.permissionPresets'], (inner) => {
      inner.effect(() => mountChatgptWorkComposer(inner), 'dsh-chatgpt-ui: work composer')
    })
  })

  console.info(
    `[dsh-chatgpt-ui] v${CHATGPT_UI_VERSION} mounted — body[${CHATGPT_BODY_ATTR}]="${CHATGPT_UI_VERSION}", ` +
      `token layer ${CHATGPT_THEME_SOURCE} (${Object.keys(CHATGPT_TOKEN_LAYERS).length} tokens), stylesheet #${CHATGPT_STYLE_ID}, ` +
      'skins: sidebar / chat / composer / dark (M1), product switcher (Phase 1), session list (Phase 3)'
  )
}
