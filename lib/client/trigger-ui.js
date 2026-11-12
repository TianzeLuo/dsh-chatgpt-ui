/**
 * dsh-chatgpt-ui — slash/@ trigger chrome (browser half fragment).
 *
 * The Host already owns the real command catalog, the file/session reference
 * source, keyboard adjudication and execution. This fragment deliberately does
 * not duplicate any of that:
 *
 *   - it tags the Host's trigger menu as `command` or `reference` so the skin
 *     can size the two menus independently (command 240px, reference 320px);
 *   - it registers one extra `@` source for the Host's real workspaces, so the
 *     menu gains the briefed 项目 category without inventing command data;
 *   - it paints the Host's otherwise invisible no-result state. The Host closes
 *     its menu when every source returns zero rows; this is the one piece of
 *     trigger UI the Host does not render itself.
 *
 * Everything is scoped to `body[data-chatgpt-ui]` and removed by ctx.effect.
 */
const CHATGPT_TRIGGER_MENU_ATTR = 'data-cgpt-trigger-menu'
const CHATGPT_PROJECT_SOURCE = 'project'

/** Classify one Host menu from its localized section labels. */
function chatgptTagTriggerMenu(menu) {
  if (!(menu instanceof HTMLElement)) return
  const text = menu.innerText ?? ''
  const command = /(^|\n)(Add|Commands|添加|指令)(\n|$)/u.test(text) ? 'command' : 'reference'
  if (menu.getAttribute(CHATGPT_TRIGGER_MENU_ATTR) === command) return
  menu.setAttribute(CHATGPT_TRIGGER_MENU_ATTR, command)
}

/** Tag the portals as they mount; the Host keeps one menu at a time. */
function mountChatgptTriggerMenus(doc) {
  const tagAll = () => {
    for (const menu of doc.querySelectorAll('[data-trigger-menu]')) chatgptTagTriggerMenu(menu)
  }
  tagAll()
  const observer = new MutationObserver(tagAll)
  observer.observe(doc.body, { childList: true, subtree: true })
  return () => observer.disconnect()
}

/** Normalize a workspace path for the @ grammar (directory references end in /). */
function chatgptProjectMention(path) {
  const normalized = String(path ?? '').replace(/[\\/]+$/u, '')
  if (normalized === '') return ''
  const quoted = /\s/u.test(normalized)
  return quoted ? `@"${normalized}/"` : `@${normalized}/`
}

/**
 * A real workspace as an @ candidate. Picking it inserts the Host's directory
 * reference, so the composer and message renderer use the same atomic chip as a
 * folder mention; no project-only fake renderer is introduced.
 */
function chatgptProjectSource(ctx) {
  const workspaces = ctx.get('workspaces')
  const list = () => workspaces?.list?.getSnapshot?.()?.items ?? []
  return {
    trigger: '@',
    name: CHATGPT_PROJECT_SOURCE,
    showGroupTitle: false,
    async candidates(_session, { query } = {}) {
      const needle = String(query ?? '').trim().toLowerCase()
      return list()
        .filter((workspace) => typeof workspace?.path === 'string' && workspace.path !== '')
        .filter((workspace) => {
          if (needle === '') return true
          return `${workspace.title ?? ''} ${workspace.path}`.toLowerCase().includes(needle)
        })
        .slice(0, 8)
        .map((workspace) => ({
          name: workspace.title || workspace.path.split(/[\\/]/u).filter(Boolean).at(-1) || '项目',
          section: '项目',
          icon: 'folder',
          description: workspace.path,
          value: JSON.stringify({ workspaceId: workspace.workspaceId, path: workspace.path, title: workspace.title })
        }))
    },
    onPick({ candidate } = {}) {
      let value
      try {
        value = JSON.parse(String(candidate?.value ?? ''))
      } catch {
        return undefined
      }
      const ref = chatgptProjectMention(value?.path)
      if (ref === '') return undefined
      return {
        insert: {
          source: 'reference',
          ref,
          label: `${value.title || value.path.split(/[\\/]/u).filter(Boolean).at(-1) || '项目'}/`,
          appearance: 'folder',
          clipboardText: ref
        }
      }
    }
  }
}

/** Register the workspace source; a Host without the trigger pipeline stays untouched. */
function mountChatgptProjectMentions(ctx) {
  const triggers = ctx.get('inputTriggers')
  if (triggers === undefined || typeof triggers.registerSource !== 'function') return undefined
  return triggers.registerSource(chatgptProjectSource(ctx))
}

/** The Host closes the menu on zero results; show a quiet, scoped explanation. */
function ChatgptTriggerFeedback() {
  const [state, setState] = chatgptReact.useState(null)
  const suppressedRef = chatgptReact.useRef(false)

  chatgptReact.useEffect(() => {
    let timer = 0
    const inspect = () => {
      if (suppressedRef.current) return
      window.clearTimeout(timer)
      timer = window.setTimeout(() => {
        const menu = document.querySelector('[data-trigger-menu]')
        const active = document.activeElement
        const editable = active instanceof HTMLElement && active.isContentEditable ? active : null
        const text = editable?.textContent ?? ''
        const match = /(?:^|\s)([/@])([^\s/]*)$/u.exec(text)
        if (menu !== null || match === null) {
          setState(null)
          return
        }
        setState({ marker: match[1], query: match[2] })
      }, 40)
    }
    const onKey = (event) => {
      if (event.key !== 'Escape') return
      suppressedRef.current = true
      setState(null)
    }
    const onPointer = (event) => {
      if (event.target instanceof Element && event.target.closest('.chatgpt-trigger-empty') !== null) return
      suppressedRef.current = true
      setState(null)
    }
    const onInput = () => {
      suppressedRef.current = false
      inspect()
    }
    document.addEventListener('input', onInput, true)
    document.addEventListener('keydown', onKey, true)
    document.addEventListener('pointerdown', onPointer, true)
    const observer = new MutationObserver(inspect)
    observer.observe(document.body, { childList: true, subtree: true })
    inspect()
    return () => {
      window.clearTimeout(timer)
      document.removeEventListener('input', onInput, true)
      document.removeEventListener('keydown', onKey, true)
      document.removeEventListener('pointerdown', onPointer, true)
      observer.disconnect()
    }
  }, [])

  if (state === null) return null
  const card = document.querySelector('[data-composer-card="true"]')?.getBoundingClientRect()
  const style = card === undefined
    ? { left: 420, bottom: 120, width: 240 }
    : {
        left: Math.round(card.left),
        bottom: Math.max(8, Math.round(window.innerHeight - card.top + 8)),
        width: 240
      }
  return chatgptH(
    'div',
    { className: 'chatgpt-trigger-empty', role: 'status', style },
    state.marker === '/'
      ? `没有匹配的命令${state.query === '' ? '' : `：/${state.query}`}`
      : `没有匹配的文件、项目或会话${state.query === '' ? '' : `：${state.query}`}`
  )
}

/** Register the feedback layer; shell.overlay is global and already used by page overlays. */
function mountChatgptTriggerFeedback(ctx) {
  return ctx.slots.inject('shell.overlay', () =>
    ctx.slots.register({ name: 'shell.overlay', id: 'chatgpt-trigger-feedback', order: 30 }, ChatgptTriggerFeedback)
  )
}
