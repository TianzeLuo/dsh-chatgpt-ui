/**
 * Project page, project dialogs and the workspace file picker.
 *
 * The page is an overlay over the native conversation column: the Host's
 * conversation stays mounted (and is made inert while the page is open), so
 * closing the page restores the exact same Session. Project rows, file
 * listings, previews and mutations all go through Host services:
 *   - workspaces.list / create / rename / delete / insertBefore
 *   - workspaceFiles.list (read-only) + workspaceFiles.readBytes
 *   - uiWorkspace.openSession / startSession / pickDirectory
 *   - sidebarRight.openResource (the native document preview)
 *
 * The Host has no project-instructions write API and no workspace-file write
 * API. Instructions therefore persist in this browser's localStorage (clearly
 * labelled in the editor); project file upload/delete controls are not painted.
 * These are reported as API boundaries rather than replaced with fake controls.
 */

const CHATGPT_PROJECT_EVENT = 'dsh-chatgpt:open-project'
const CHATGPT_PROJECT_CLOSE_EVENT = 'dsh-chatgpt:close-project'
const CHATGPT_FILE_PICKER_EVENT = 'dsh-chatgpt:open-files'

/** Bound a remote file RPC so a stale/blank Session cannot leave the panel loading forever. */
function chatgptWithTimeout(promise, ms = 8000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('读取工作区文件超时')), ms)
    Promise.resolve(promise).then(
      (value) => { clearTimeout(timer); resolve(value) },
      (reason) => { clearTimeout(timer); reject(reason) }
    )
  })
}
const CHATGPT_PROJECT_DELETE_EVENT = 'dsh-chatgpt:delete-project'

/** Dispatch the page-open event from the sidebar without coupling the files.
 * `''` is the all-projects overview sentinel; a non-empty id opens one project.
 */
function chatgptOpenProjectPage(workspaceId) {
  if (typeof window === 'undefined' || typeof workspaceId !== 'string') return
  window.dispatchEvent(new CustomEvent(CHATGPT_PROJECT_EVENT, { detail: { workspaceId } }))
}

/** Close the page when a sidebar Session or the New chat row is used. */
function chatgptCloseProjectPage() {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(CHATGPT_PROJECT_CLOSE_EVENT))
}

/** Ask the global picker for one Session; it resolves the Session's workspace itself. */
function chatgptOpenFilePicker(sessionId) {
  if (typeof window === 'undefined' || typeof sessionId !== 'string' || sessionId === '') return
  window.dispatchEvent(new CustomEvent(CHATGPT_FILE_PICKER_EVENT, { detail: { sessionId } }))
}

/** Ask for the delete confirmation from either the page or the sidebar menu. */
function chatgptRequestProjectDelete(workspaceId, title) {
  if (typeof window === 'undefined' || typeof workspaceId !== 'string' || workspaceId === '') return
  window.dispatchEvent(new CustomEvent(CHATGPT_PROJECT_DELETE_EVENT, { detail: { workspaceId, title } }))
}

/** Start a new conversation in a project through the Host navigation service. */
function chatgptStartProjectSession(ctx, workspaceId) {
  const ui = ctx?.get?.('uiWorkspace')
  if (typeof ui?.startSession !== 'function') return false
  ui.startSession(workspaceId)
  return true
}

/** Start a conversation without a project (a fresh Session with no workspace). */
async function chatgptStartNoProjectSession(ctx) {
  const sessions = ctx?.get?.('sessions')
  const ui = ctx?.get?.('uiWorkspace')
  if (typeof sessions?.create !== 'function' || typeof ui?.openSession !== 'function') return false
  const created = await sessions.create({})
  const id = typeof created === 'string'
    ? created
    : created?.ok === true && typeof created.value?.sessionId === 'string'
      ? created.value.sessionId
      : undefined
  if (id === undefined) return false
  ui?.openSession?.(id)
  return true
}

/** Pick a directory and register/adopt it as a project. */
async function chatgptCreateProject(ctx, { open = false } = {}) {
  const ui = ctx?.get?.('uiWorkspace')
  const workspaces = ctx?.get?.('workspaces')
  if (typeof ui?.pickDirectory !== 'function' || typeof workspaces?.create !== 'function') return null
  const path = await ui.pickDirectory()
  if (typeof path !== 'string' || path === '') return null
  const workspace = await workspaces.create({ path })
  if (workspace === undefined || workspace === null) return null
  if (open === true) chatgptOpenProjectPage(workspace.workspaceId)
  return workspace
}

/** Subscribe to one Host store with a stable fallback. */
function useChatgptProjectSnapshot(store, fallback) {
  const subscribe = chatgptReact.useCallback(
    (listener) => (typeof store?.subscribe === 'function' ? store.subscribe(listener) : () => {}),
    [store]
  )
  const read = chatgptReact.useCallback(() => store?.getSnapshot?.() ?? fallback, [store, fallback])
  return chatgptReact.useSyncExternalStore(subscribe, read, read)
}

const CHATGPT_EMPTY_PROJECT_WORKSPACES = { items: [], phase: 'pending', archivedSessionIds: [], pinnedSessionIds: [] }
const CHATGPT_EMPTY_PROJECT_SESSIONS = { ids: [], byId: {}, phase: 'pending' }

/**
 * Project glyphs (P0-13): the reference's own markup, copied verbatim into
 * `lib/client/menu-icons.js` from the read-only capture. The overview list and
 * the empty hero use the closed folder; an expanded section uses the open one.
 */
const CHATGPT_PROJECT_FOLDER_SVG = chatgptMenuGlyph('folderClosed')
const CHATGPT_PROJECT_FOLDER_OPEN_SVG = chatgptMenuGlyph('folderOpen')
const CHATGPT_PROJECT_FILE_SVGS = {
  image: chatgptMenuGlyph('fileImage'),
  pdf: chatgptMenuGlyph('filePdf'),
  text: chatgptMenuGlyph('fileText'),
  data: chatgptMenuGlyph('fileTable'),
  code: chatgptMenuGlyph('fileCode'),
  archive: chatgptMenuGlyph('fileArchive'),
  office: chatgptMenuGlyph('file'),
  file: chatgptMenuGlyph('file')
}

function ChatgptProjectFileIcon({ name }) {
  const kind = chatgptProjectFileKind(name)
  return chatgptH('span', {
    className: `chatgpt-project-file-icon is-${kind}`,
    'data-cgpt-file-kind': kind,
    'aria-hidden': 'true',
    dangerouslySetInnerHTML: { __html: CHATGPT_PROJECT_FILE_SVGS[kind] ?? CHATGPT_PROJECT_FILE_SVGS.file }
  })
}

function chatgptProjectDate(value) {
  const date = new Date(value ?? 0)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric' }).format(date)
}

function ChatgptProjectRow(props) {
  const { row, onOpen } = props
  return chatgptH(
    'button',
    {
      type: 'button',
      className: 'chatgpt-project-chatrow',
      'data-cgpt-project-chat': row.id,
      onClick: () => onOpen(row.id)
    },
    chatgptH('span', {
      className: 'chatgpt-project-chatrow-icon',
      'aria-hidden': 'true',
      dangerouslySetInnerHTML: { __html: CHATGPT_PROJECT_FILE_SVGS.text }
    }),
    chatgptH('span', { className: 'chatgpt-project-chatrow-title' }, row.title),
    chatgptH('span', { className: 'chatgpt-project-chatrow-date' }, row.date)
  )
}

/**
 * All-projects overview (P0-10A). The rail's 项目 destination opens this list,
 * not the first project's detail page. Each row opens that project's page; the
 * top action creates a new project through the Host directory picker.
 * @param {object} props - measured left edge, workspace/session snapshots and callbacks.
 * @returns {object} React element.
 */
function ChatgptProjectOverview(props) {
  const { left, workspaces, sessions, onOpen, onClose, onCreate } = props
  const archived = new Set(workspaces.archivedSessionIds ?? [])
  const rows = (workspaces.items ?? []).map((workspace) => {
    const ids = [...new Set(workspace.sessionIds ?? [])].filter((id) => !archived.has(id))
    return {
      id: workspace.workspaceId,
      title: chatgptProjectTitle(workspace),
      path: typeof workspace.path === 'string' && workspace.path !== '' ? workspace.path : '未关联路径',
      count: ids.length,
      fresh: ids.filter((id) => sessions.byId?.[id]?.blank !== true).length
    }
  })
  return chatgptH(
    'section',
    {
      className: 'chatgpt-project-page chatgpt-project-overview',
      'data-cgpt-project-overview': '',
      role: 'dialog',
      tabIndex: -1,
      'aria-modal': 'true',
      'aria-label': '所有项目',
      style: { left: `${left}px` }
    },
    chatgptH(
      'div',
      { className: 'chatgpt-project-scroll' },
      chatgptH(
        'div',
        { className: 'chatgpt-project-shell' },
        chatgptH(
          'div',
          { className: 'chatgpt-project-topbar' },
          chatgptH(
            'button',
            { type: 'button', className: 'chatgpt-project-back', 'aria-label': '关闭项目总览', onClick: onClose },
            chatgptH('span', { 'aria-hidden': 'true', dangerouslySetInnerHTML: { __html: CHATGPT_SESSION_ICONS.chevron } }),
            chatgptH('span', null, '项目')
          ),
          chatgptH('button', { type: 'button', className: 'chatgpt-project-action', onClick: onCreate }, '新建项目')
        ),
        chatgptH(
          'header',
          { className: 'chatgpt-project-header' },
          chatgptH('h1', { className: 'chatgpt-project-heading' }, '项目'),
          chatgptH('p', { className: 'chatgpt-project-path' }, `${rows.length} 个项目`)
        ),
        rows.length === 0
          ? chatgptH(
              'div',
              { className: 'chatgpt-project-hero-empty' },
              chatgptH('span', {
                className: 'chatgpt-project-hero-icon',
                'aria-hidden': 'true',
                dangerouslySetInnerHTML: { __html: CHATGPT_PROJECT_FOLDER_SVG }
              }),
              chatgptH('h2', null, '还没有项目'),
              chatgptH('p', null, '新建一个项目，把会话和文件放在一起。'),
              chatgptH('button', { type: 'button', className: 'chatgpt-project-primary', onClick: onCreate }, '新建项目')
            )
          : chatgptH(
              'div',
              { className: 'chatgpt-project-overview-list', role: 'list', 'aria-label': '全部项目' },
              rows.map((row) =>
                chatgptH(
                  'button',
                  {
                    key: row.id,
                    type: 'button',
                    className: 'chatgpt-project-overview-row',
                    'data-cgpt-project-overview-row': row.id,
                    onClick: () => onOpen(row.id)
                  },
                  chatgptH('span', {
                    className: 'chatgpt-project-overview-icon',
                    'aria-hidden': 'true',
                    dangerouslySetInnerHTML: { __html: CHATGPT_PROJECT_FOLDER_SVG }
                  }),
                  chatgptH(
                    'span',
                    { className: 'chatgpt-project-overview-main' },
                    chatgptH('span', { className: 'chatgpt-project-overview-title' }, row.title),
                    chatgptH('span', { className: 'chatgpt-project-overview-path', title: row.path }, row.path)
                  ),
                  chatgptH('span', { className: 'chatgpt-project-overview-count' }, `${row.count} 个会话`),
                  chatgptH('span', {
                    className: 'chatgpt-project-overview-arrow',
                    'aria-hidden': 'true',
                    dangerouslySetInnerHTML: { __html: CHATGPT_SESSION_ICONS.chevron }
                  })
                )
              )
            )
      )
    )
  )
}

/**
 * Full project page. Rendered in `shell.overlay`, so it can sit over the
 * conversation column while the Host's own conversation remains mounted.
 */
function ChatgptProjectPage(props) {
  const { ctx } = props
  const workspaces = useChatgptProjectSnapshot(ctx.workspaces?.list, CHATGPT_EMPTY_PROJECT_WORKSPACES)
  const sessions = useChatgptProjectSnapshot(ctx.sessions?.list, CHATGPT_EMPTY_PROJECT_SESSIONS)
  const [projectId, setProjectId] = chatgptReact.useState(null)
  const [left, setLeft] = chatgptReact.useState(340)
  const [deleteTarget, setDeleteTarget] = chatgptReact.useState(null)
  const pageRef = chatgptReact.useRef(null)
  const [instructions, setInstructions] = chatgptReact.useState('')
  const [instructionsDraft, setInstructionsDraft] = chatgptReact.useState('')
  const [editingInstructions, setEditingInstructions] = chatgptReact.useState(false)
  const [editingName, setEditingName] = chatgptReact.useState(false)
  const [nameDraft, setNameDraft] = chatgptReact.useState('')
  const [actionError, setActionError] = chatgptReact.useState('')
  const [moreOpen, setMoreOpen] = chatgptReact.useState(false)
  const [fileState, setFileState] = chatgptReact.useState({ phase: 'idle', items: [], error: '', truncated: false })
  const [fileRefresh, setFileRefresh] = chatgptReact.useState(0)
  const [previewError, setPreviewError] = chatgptReact.useState('')

  const project = projectId === null ? undefined : workspaces.items?.find((item) => item.workspaceId === projectId)

  chatgptReact.useEffect(() => {
    const open = (event) => {
      const id = event?.detail?.workspaceId
      if (typeof id !== 'string') return
      setProjectId(id)
      setActionError('')
      setMoreOpen(false)
      setEditingName(false)
      setEditingInstructions(false)
      setPreviewError('')
    }
    const close = () => setProjectId(null)
    const askDelete = (event) => {
      const id = event?.detail?.workspaceId
      if (typeof id !== 'string' || id === '') return
      setDeleteTarget({ workspaceId: id, title: String(event.detail.title ?? '') })
    }
    window.addEventListener(CHATGPT_PROJECT_EVENT, open)
    window.addEventListener(CHATGPT_PROJECT_CLOSE_EVENT, close)
    window.addEventListener(CHATGPT_PROJECT_DELETE_EVENT, askDelete)
    return () => {
      window.removeEventListener(CHATGPT_PROJECT_EVENT, open)
      window.removeEventListener(CHATGPT_PROJECT_CLOSE_EVENT, close)
      window.removeEventListener(CHATGPT_PROJECT_DELETE_EVENT, askDelete)
    }
  }, [])

  // Measure the native main column so the overlay starts exactly where the
  // conversation starts; resizing/collapsing the sidebar moves it with it.
  chatgptReact.useLayoutEffect(() => {
    if (projectId === null) return undefined
    const measure = () => {
      let node = document.querySelector('[data-slot="main"]')
      while (node !== null && node.getBoundingClientRect().width === 0) node = node.parentElement
      const next = node === null ? 340 : Math.round(node.getBoundingClientRect().left)
      setLeft((current) => (current === next ? current : next))
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(document.body)
    window.addEventListener('resize', measure)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [projectId])

  // Inert the native conversation, not just cover it: keyboard and screen-reader
  // users should not wander into the page underneath.
  chatgptReact.useEffect(() => {
    if (projectId === null) return undefined
    const main = document.querySelector('[data-slot="main"]')
    const previousInert = main?.getAttribute('inert')
    const previousHidden = main?.getAttribute('aria-hidden')
    document.body.setAttribute('data-cgpt-project-open', '')
    // P0-11: the overview is 首页, a single project's page is 项目. The rail
    // observes this attribute, so switching overview → detail (without closing
    // the overlay) moves the highlight without a subtree observer.
    document.body.setAttribute('data-cgpt-project-kind', projectId === '' ? 'overview' : 'detail')
    main?.setAttribute('inert', '')
    main?.setAttribute('aria-hidden', 'true')
    pageRef.current?.focus({ preventScroll: true })
    return () => {
      document.body.removeAttribute('data-cgpt-project-open')
      document.body.removeAttribute('data-cgpt-project-kind')
      if (main === null || main === undefined) return
      if (previousInert === null) main.removeAttribute('inert')
      else main.setAttribute('inert', previousInert)
      if (previousHidden === null) main.removeAttribute('aria-hidden')
      else main.setAttribute('aria-hidden', previousHidden)
    }
  }, [projectId, project?.workspaceId])

  chatgptReact.useEffect(() => {
    if (projectId === null) return undefined
    const onKey = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        setProjectId(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [projectId])

  chatgptReact.useEffect(() => {
    if (!moreOpen) return undefined
    const onDown = (event) => {
      if (event.target?.closest?.('.chatgpt-project-more-wrap') === null) setMoreOpen(false)
    }
    const onKey = (event) => {
      if (event.key === 'Escape') setMoreOpen(false)
    }
    document.addEventListener('pointerdown', onDown, true)
    window.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown, true)
      window.removeEventListener('keydown', onKey)
    }
  }, [moreOpen])

  chatgptReact.useEffect(() => {
    if (project === undefined) return
    const next = chatgptReadProjectInstructions(window.localStorage, project.workspaceId)
    setInstructions(next)
    setInstructionsDraft(next)
    setEditingInstructions(false)
  }, [project?.workspaceId])

  const projectSessions = chatgptReact.useMemo(() => {
    if (project === undefined) return []
    const archived = new Set(workspaces.archivedSessionIds ?? [])
    return [...new Set(project.sessionIds ?? [])]
      .filter((id) => !archived.has(id))
      .map((id) => {
        const row = sessions.byId?.[id]
        if (row?.origin === 'subagent') return null
        return {
          id,
          title: chatgptSessionTitle(row, sessions.projectionsBySession?.[id]?.values),
          date: chatgptProjectDate(row?.updatedAt)
        }
      })
      .filter((row) => row !== null)
      .sort((a, b) => {
        const at = Date.parse(sessions.byId?.[a.id]?.updatedAt ?? '') || 0
        const bt = Date.parse(sessions.byId?.[b.id]?.updatedAt ?? '') || 0
        return bt - at
      })
  }, [project, workspaces.archivedSessionIds, sessions.byId, sessions.projectionsBySession])

  const authorizingSession = projectSessions[0]?.id

  chatgptReact.useEffect(() => {
    if (project === undefined) return undefined
    if (authorizingSession === undefined) {
      setFileState({ phase: 'no-session', items: [], error: '', truncated: false })
      return undefined
    }
    let cancelled = false
    setFileState((current) => ({ ...current, phase: 'loading', error: '' }))
    const load = async () => {
      const files = []
      const queue = ['']
      const seen = new Set()
      let truncated = false
      try {
        while (queue.length > 0 && files.length < CHATGPT_PROJECT_FILE_LIMIT) {
          const directory = queue.shift()
          if (seen.has(directory)) continue
          seen.add(directory)
          const requestPath = directory === '' ? project.path : chatgptJoinProjectPath(project.path, directory)
          const result = await chatgptWithTimeout(ctx.remote.workspaceFiles.list(authorizingSession, requestPath))
          if (result?.ok !== true) throw new Error(result?.error?.message ?? '无法列出项目文件')
          const listedPath = chatgptProjectRelativePath(project.path, result.value?.path ?? '')
          for (const entry of result.value?.entries ?? []) {
            const relative = listedPath === '' ? entry.name : `${listedPath}/${entry.name}`
            if (entry.type === 'directory') {
              if (!CHATGPT_PROJECT_SKIPPED_DIRS.has(entry.name) && seen.size < 80) queue.push(relative)
              continue
            }
            if (entry.type !== 'file') continue
            files.push({ path: relative, name: entry.name, size: entry.size })
            if (files.length >= CHATGPT_PROJECT_FILE_LIMIT) {
              truncated = true
              break
            }
          }
        }
        if (!cancelled) setFileState({ phase: 'ready', items: files, error: '', truncated })
      } catch (reason) {
        if (!cancelled) {
          setFileState({
            phase: 'error',
            items: [],
            error: reason instanceof Error && reason.message !== '' ? reason.message : '无法读取项目文件',
            truncated: false
          })
        }
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [project?.workspaceId, authorizingSession, fileRefresh])

  if (projectId === null) {
    return deleteTarget === null
      ? null
      : chatgptH(ChatgptProjectDeleteDialog, {
          ctx,
          target: deleteTarget,
          onClose: () => setDeleteTarget(null),
          onDeleted: () => setDeleteTarget(null)
        })
  }

  if (projectId === '') {
    return chatgptH(ChatgptProjectOverview, {
      left,
      workspaces,
      sessions,
      onOpen: (workspaceId) => setProjectId(workspaceId),
      onClose: () => setProjectId(null),
      onCreate: () => {
        void chatgptCreateProject(ctx, { open: true }).catch(() => {})
      }
    })
  }

  if (project === undefined) {
    // The project may disappear while its detail page is open (deleted in
    // another window). Fall back to the overview rather than a blank overlay.
    return chatgptH(ChatgptProjectOverview, {
      left,
      workspaces,
      sessions,
      onOpen: (workspaceId) => setProjectId(workspaceId),
      onClose: () => setProjectId(null),
      onCreate: () => {
        void chatgptCreateProject(ctx, { open: true }).catch(() => {})
      }
    })
  }

  const saveInstructions = () => {
    const saved = chatgptWriteProjectInstructions(window.localStorage, project.workspaceId, instructionsDraft)
    setInstructions(saved)
    setEditingInstructions(false)
  }

  const saveName = async () => {
    const next = nameDraft.trim()
    if (next === '' || next === project.title) {
      setEditingName(false)
      return
    }
    try {
      await ctx.workspaces.rename(project.workspaceId, next)
      setEditingName(false)
      setActionError('')
    } catch (reason) {
      setActionError(reason instanceof Error ? reason.message : '重命名项目失败')
    }
  }

  const previewFile = (file) => {
    const current = chatgptCurrentMainId(sessions)
    const sessionId = typeof current === 'string' && current !== '' ? current : authorizingSession
    if (sessionId === undefined || ctx.sidebarRight === undefined) {
      setPreviewError('宿主未提供文件预览面板')
      return
    }
    const absolute = chatgptJoinProjectPath(project.path, file.path)
    try {
      chatgptWriteRecentFiles(
        window.localStorage,
        project.workspaceId,
        chatgptMergeRecentFiles(chatgptReadRecentFiles(window.localStorage, project.workspaceId), [file])
      )
      setProjectId(null)
      window.setTimeout(() => {
        try {
          ctx.sidebarRight.openResource(chatgptFileAddress(sessionId, absolute))
        } catch (reason) {
          setPreviewError(reason instanceof Error ? reason.message : '预览打开失败')
        }
      }, 40)
    } catch (reason) {
      setPreviewError(reason instanceof Error ? reason.message : '预览打开失败')
    }
  }

  const moveToFront = async () => {
    const first = workspaces.items?.[0]?.workspaceId
    if (first === undefined || first === project.workspaceId) return
    try {
      await ctx.workspaces.insertBefore(project.workspaceId, first)
      setMoreOpen(false)
    } catch (reason) {
      setActionError(reason instanceof Error ? reason.message : '移动项目失败')
    }
  }

  const files = fileState.items
  const isEmptyProject = projectSessions.length === 0 && files.length === 0 && instructions.trim() === ''

  const instructionsSection = chatgptH(
              'section',
              { className: 'chatgpt-project-section', 'data-cgpt-project-section': 'instructions' },
              chatgptH(
                'div',
                { className: 'chatgpt-project-section-head' },
                chatgptH('h2', null, '项目说明'),
                editingInstructions
                  ? null
                  : chatgptH(
                      'button',
                      { type: 'button', className: 'chatgpt-project-textbtn', onClick: () => { setInstructionsDraft(instructions); setEditingInstructions(true) } },
                      instructions === '' ? '添加说明' : '编辑'
                    )
              ),
              editingInstructions
                ? chatgptH(
                    'div',
                    { className: 'chatgpt-project-instructions-edit' },
                    chatgptH('textarea', {
                      autoFocus: true,
                      value: instructionsDraft,
                      maxLength: 4000,
                      rows: 6,
                      placeholder: '告诉 ChatGPT 这个项目的目标、背景和回答方式。',
                      'aria-label': '项目说明',
                      onChange: (event) => setInstructionsDraft(event.target.value)
                    }),
                    chatgptH(
                      'div',
                      { className: 'chatgpt-project-editfoot' },
                      chatgptH('span', null, '保存在此浏览器（宿主暂无项目说明写接口）'),
                      chatgptH(
                        'span',
                        { className: 'chatgpt-project-editbtns' },
                        chatgptH('button', { type: 'button', onClick: () => { setEditingInstructions(false); setInstructionsDraft(instructions) } }, '取消'),
                        chatgptH('button', { type: 'button', className: 'chatgpt-project-primary', onClick: saveInstructions }, '保存')
                      )
                    )
                  )
                : instructions === ''
                  ? chatgptH('p', { className: 'chatgpt-project-emptyline' }, '添加项目说明，让项目里的对话共享同一套背景与要求。')
                  : chatgptH('p', { className: 'chatgpt-project-instructions' }, instructions)
            )

  return chatgptH(
    'section',
    {
      ref: pageRef,
      className: 'chatgpt-project-page',
      'data-cgpt-project-page': project.workspaceId,
      role: 'dialog',
      tabIndex: -1,
      'aria-modal': 'true',
      'aria-label': `${chatgptProjectTitle(project)} 项目`,
      style: { left: `${left}px` }
    },
    chatgptH(
      'div',
      { className: 'chatgpt-project-scroll' },
      chatgptH(
        'div',
        { className: 'chatgpt-project-shell' },
        chatgptH(
          'div',
          { className: 'chatgpt-project-topbar' },
          chatgptH(
            'button',
            {
              type: 'button',
              className: 'chatgpt-project-back',
              'aria-label': '关闭项目页',
              onClick: () => setProjectId(null)
            },
            chatgptH('span', { 'aria-hidden': 'true', dangerouslySetInnerHTML: { __html: CHATGPT_SESSION_ICONS.chevron } }),
            chatgptH('span', null, '项目')
          ),
          chatgptH(
            'div',
            { className: 'chatgpt-project-topactions' },
            chatgptH(
              'button',
              { type: 'button', className: 'chatgpt-project-action', onClick: () => setEditingName(true) },
              '编辑'
            ),
            chatgptH(
              'div',
              { className: 'chatgpt-project-more-wrap' },
              chatgptH(
                'button',
                {
                  type: 'button',
                  className: 'chatgpt-project-iconbtn',
                  'aria-label': '项目更多操作',
                  'aria-haspopup': 'menu',
                  'aria-expanded': moreOpen ? 'true' : 'false',
                  onClick: () => setMoreOpen((open) => !open)
                },
                chatgptH('span', { 'aria-hidden': 'true', dangerouslySetInnerHTML: { __html: CHATGPT_SESSION_ICONS.more } })
              ),
              moreOpen
                ? chatgptH(
                    'div',
                    { className: 'chatgpt-project-menu', role: 'menu', 'aria-label': '项目更多操作' },
                    workspaces.items?.[0]?.workspaceId === project.workspaceId
                      ? null
                      : chatgptH(
                          'button',
                          { type: 'button', role: 'menuitem', onClick: () => void moveToFront() },
                          '移到最前'
                        ),
                    chatgptH(
                      'button',
                      {
                        type: 'button',
                        role: 'menuitem',
                        className: 'is-danger',
                        onClick: () => {
                          setMoreOpen(false)
                          chatgptRequestProjectDelete(project.workspaceId, chatgptProjectTitle(project))
                        }
                      },
                      '删除项目'
                    )
                  )
                : null
            )
          )
        ),
        chatgptH(
          'header',
          { className: 'chatgpt-project-header' },
          editingName
            ? chatgptH(
                'div',
                { className: 'chatgpt-project-nameedit' },
                chatgptH('input', {
                  autoFocus: true,
                  value: nameDraft,
                  maxLength: 200,
                  'aria-label': '项目名称',
                  onChange: (event) => setNameDraft(event.target.value),
                  onKeyDown: (event) => {
                    if (event.key === 'Escape') {
                      event.preventDefault()
                      setEditingName(false)
                    }
                    if (event.key === 'Enter') {
                      event.preventDefault()
                      void saveName()
                    }
                  }
                }),
                chatgptH('button', { type: 'button', onClick: () => void saveName() }, '保存'),
                chatgptH('button', { type: 'button', onClick: () => setEditingName(false) }, '取消')
              )
            : chatgptH('h1', { className: 'chatgpt-project-heading' }, chatgptProjectTitle(project)),
          chatgptH('p', { className: 'chatgpt-project-path', title: project.path }, project.path ?? ''),
          chatgptH(
            'div',
            { className: 'chatgpt-project-stats' },
            chatgptH('span', null, `${projectSessions.length} 个会话`),
            chatgptH('span', { 'aria-hidden': 'true' }, '·'),
            chatgptH('span', null, fileState.phase === 'ready' ? `${files.length} 个文件` : fileState.phase === 'no-session' ? '0 个文件' : '文件')
          ),
          actionError === '' ? null : chatgptH('p', { className: 'chatgpt-project-error', role: 'alert' }, actionError)
        ),
        isEmptyProject
          ? chatgptH(
              'div',
              { className: 'chatgpt-project-hero-empty' },
              chatgptH('span', { className: 'chatgpt-project-hero-icon', 'aria-hidden': 'true', dangerouslySetInnerHTML: { __html: CHATGPT_PROJECT_FOLDER_SVG } }),
              chatgptH('h2', null, '这个项目还没有内容'),
              chatgptH('p', null, '从项目里开始一段对话，或让同事把工作区文件放进项目目录。'),
              chatgptH(
                'button',
                { type: 'button', className: 'chatgpt-project-primary', onClick: () => {
                  setProjectId(null)
                  chatgptStartProjectSession(ctx, project.workspaceId)
                } },
                '在此项目中新建对话'
              )
            )
          : null,
        isEmptyProject
          ? chatgptH('div', { className: 'chatgpt-project-empty-details' }, instructionsSection)
          : chatgptH(
          'div',
          { className: 'chatgpt-project-grid' },
          chatgptH(
            'div',
            { className: 'chatgpt-project-maincol' },
            instructionsSection,
            chatgptH(
              'section',
              { className: 'chatgpt-project-section', 'data-cgpt-project-section': 'sessions' },
              chatgptH(
                'div',
                { className: 'chatgpt-project-section-head' },
                chatgptH('h2', null, '会话'),
                chatgptH(
                  'button',
                  {
                    type: 'button',
                    className: 'chatgpt-project-textbtn',
                    onClick: () => {
                      setProjectId(null)
                      chatgptStartProjectSession(ctx, project.workspaceId)
                    }
                  },
                  '新建对话'
                )
              ),
              projectSessions.length === 0
                ? chatgptH('p', { className: 'chatgpt-project-emptyline' }, '还没有会话。在这个项目里新建一段对话开始。')
                : chatgptH(
                    'div',
                    { className: 'chatgpt-project-chatlist', role: 'list' },
                    projectSessions.map((row) =>
                      chatgptH(ChatgptProjectRow, {
                        key: row.id,
                        row,
                        onOpen: (id) => {
                          setProjectId(null)
                          ctx.uiWorkspace?.openSession?.(id)
                        }
                      })
                    )
                  )
            )
          ),
          chatgptH(
            'aside',
            { className: 'chatgpt-project-sidecol' },
            chatgptH(
              'section',
              { className: 'chatgpt-project-section', 'data-cgpt-project-section': 'files' },
              chatgptH(
                'div',
                { className: 'chatgpt-project-section-head' },
                chatgptH('h2', null, '文件'),
                chatgptH(
                  'button',
                  { type: 'button', className: 'chatgpt-project-textbtn', onClick: () => setFileRefresh((value) => value + 1) },
                  '刷新'
                )
              ),
              previewError === '' ? null : chatgptH('p', { className: 'chatgpt-project-error' }, previewError),
              fileState.phase === 'loading'
                ? chatgptH(
                    'div',
                    { className: 'chatgpt-project-file-skeleton', 'aria-label': '正在读取项目文件' },
                    chatgptH('span'),
                    chatgptH('span'),
                    chatgptH('span')
                  )
                : fileState.phase === 'no-session'
                  ? chatgptH('p', { className: 'chatgpt-project-emptyline' }, '项目还没有会话，宿主无法读取工作区文件。')
                  : fileState.phase === 'error'
                    ? chatgptH('p', { className: 'chatgpt-project-error' }, fileState.error)
                    : files.length === 0
                      ? chatgptH('p', { className: 'chatgpt-project-emptyline' }, '还没有文件。')
                      : chatgptH(
                          'div',
                          { className: 'chatgpt-project-filelist' },
                          files.map((file) =>
                            chatgptH(
                              'button',
                              {
                                key: file.path,
                                type: 'button',
                                className: 'chatgpt-project-filerow',
                                'data-cgpt-project-file': file.path,
                                title: file.path,
                                onClick: () => previewFile(file)
                              },
                              chatgptH(ChatgptProjectFileIcon, { name: file.name }),
                              chatgptH(
                                'span',
                                { className: 'chatgpt-project-filerow-main' },
                                chatgptH('span', { className: 'chatgpt-project-filerow-name' }, file.name),
                                chatgptH('span', { className: 'chatgpt-project-filerow-path' }, chatgptProjectBasename(file.path) === file.path ? '' : file.path.replace(/\/?[^/]+$/, ''))
                              ),
                              chatgptH('span', { className: 'chatgpt-project-filerow-size' }, chatgptFormatBytes(file.size))
                            )
                          ),
                          fileState.truncated ? chatgptH('p', { className: 'chatgpt-project-file-note' }, `仅显示前 ${CHATGPT_PROJECT_FILE_LIMIT} 个文件`) : null
                        )
            ),
            chatgptH('p', { className: 'chatgpt-project-side-note' }, '宿主当前只提供文件读取；上传与删除未开放。')
          )
        )
      )
    ),
    deleteTarget === null
      ? null
      : chatgptH(ChatgptProjectDeleteDialog, {
          ctx,
          target: deleteTarget,
          onClose: () => setDeleteTarget(null),
          onDeleted: (workspaceId) => {
            setDeleteTarget(null)
            if (workspaceId === projectId) setProjectId(null)
          }
        })
  )
}

/** Delete confirmation shared by the page and the sidebar menu. */
function ChatgptProjectDeleteDialog(props) {
  const { ctx, target, onClose, onDeleted } = props
  const [busy, setBusy] = chatgptReact.useState(false)
  const [error, setError] = chatgptReact.useState('')
  const confirm = async () => {
    setBusy(true)
    setError('')
    try {
      await ctx.workspaces.delete(target.workspaceId)
      onDeleted(target.workspaceId)
    } catch (reason) {
      setError(reason instanceof Error && reason.message !== '' ? reason.message : '删除项目失败')
      setBusy(false)
    }
  }
  return chatgptH(
    'div',
    { className: 'chatgpt-project-dialog-backdrop', onMouseDown: (event) => { if (event.target === event.currentTarget && !busy) onClose() } },
    chatgptH(
      'div',
      { className: 'chatgpt-project-dialog', role: 'alertdialog', 'aria-modal': 'true', 'aria-labelledby': 'chatgpt-project-delete-title' },
      chatgptH('h2', { id: 'chatgpt-project-delete-title' }, '删除项目？'),
      chatgptH('p', null, `“${target.title || '这个项目'}”的项目分组会被删除；会话与工作区文件不会删除。`),
      error === '' ? null : chatgptH('p', { className: 'chatgpt-project-error', role: 'alert' }, error),
      chatgptH(
        'div',
        { className: 'chatgpt-project-dialog-actions' },
        chatgptH('button', { type: 'button', onClick: onClose, disabled: busy }, '取消'),
        chatgptH('button', { type: 'button', className: 'is-danger', onClick: () => void confirm(), disabled: busy }, busy ? '删除中…' : '删除项目')
      )
    )
  )
}

/** File picker shared by the Work tool row and the Chat paperclip. */
function ChatgptFilePicker(props) {
  const { ctx } = props
  const workspaces = useChatgptProjectSnapshot(ctx.workspaces?.list, CHATGPT_EMPTY_PROJECT_WORKSPACES)
  const sessions = useChatgptProjectSnapshot(ctx.sessions?.list, CHATGPT_EMPTY_PROJECT_SESSIONS)
  const [request, setRequest] = chatgptReact.useState(null)
  const [query, setQuery] = chatgptReact.useState('')
  const [selected, setSelected] = chatgptReact.useState([])
  const [files, setFiles] = chatgptReact.useState([])
  const [phase, setPhase] = chatgptReact.useState('idle')
  const [error, setError] = chatgptReact.useState('')
  const [recent, setRecent] = chatgptReact.useState([])
  const [style, setStyle] = chatgptReact.useState({ left: 400, bottom: 100, width: 420 })
  const [busy, setBusy] = chatgptReact.useState(false)
  const panelRef = chatgptReact.useRef(null)
  const searchRef = chatgptReact.useRef(null)

  chatgptReact.useEffect(() => {
    const open = (event) => {
      const sessionId = event?.detail?.sessionId
      if (typeof sessionId !== 'string' || sessionId === '') return
      setRequest({ sessionId })
      setQuery('')
      setSelected([])
      setError('')
      setPhase('loading')
    }
    const close = () => setRequest(null)
    window.addEventListener(CHATGPT_FILE_PICKER_EVENT, open)
    window.addEventListener(CHATGPT_PROJECT_CLOSE_EVENT, close)
    return () => {
      window.removeEventListener(CHATGPT_FILE_PICKER_EVENT, open)
      window.removeEventListener(CHATGPT_PROJECT_CLOSE_EVENT, close)
    }
  }, [])

  const session = request === null ? undefined : sessions.byId?.[request.sessionId]
  const workspace = request === null ? undefined : workspaces.items?.find((item) => (item.sessionIds ?? []).includes(request.sessionId))
  const root = workspace?.path ?? session?.cwd ?? ''
  const workspaceKey = workspace?.workspaceId ?? root ?? request?.sessionId ?? ''
  // A fresh 新会话 exists in the composer before the Host persists it, so its
  // remote file scope can never answer. Read through an older Session in the
  // same workspace; the selected bytes still attach to the current composer.
  const fileSessionId = request === null
    ? undefined
    : (workspace?.sessionIds ?? []).find((id) => id !== request.sessionId && sessions.byId?.[id] !== undefined)
      ?? (sessions.byId?.[request.sessionId]?.blank === false ? request.sessionId : undefined)

  chatgptReact.useLayoutEffect(() => {
    if (request === null) return
    const card = document.querySelector('[data-composer-card="true"]')
    const rect = card?.getBoundingClientRect()
    const left = Math.max(8, rect === undefined ? 400 : Math.round(rect.left + 8))
    const rightbar = document.querySelector('[class*="rightbarCol"]')
    const rightbarLeft = rightbar?.getBoundingClientRect?.().left
    const maxWidth = typeof rightbarLeft === 'number' && rightbarLeft > left
      ? Math.round(rightbarLeft - left - 12)
      : window.innerWidth - left - 12
    const width = Math.max(280, Math.min(380, rect === undefined ? 380 : Math.round(rect.width - 16), maxWidth))
    setStyle({
      left,
      bottom: Math.max(8, window.innerHeight - (rect === undefined ? window.innerHeight - 120 : rect.top) + 8),
      width
    })
    searchRef.current?.focus()
  }, [request])

  chatgptReact.useEffect(() => {
    if (request === null) return undefined
    let cancelled = false
    setRecent(chatgptReadRecentFiles(window.localStorage, workspaceKey))
    setPhase('loading')
    setError('')
    const load = async () => {
      if (root === '' || fileSessionId === undefined) {
        if (!cancelled) {
          setFiles([])
          setPhase('ready')
          setError(root === ''
            ? '当前会话没有项目文件夹；仍可从本机浏览文件。'
            : '当前会话尚未保存，无法读取项目文件；仍可从本机浏览文件。')
        }
        return
      }
      const out = []
      const queue = ['']
      const seen = new Set()
      try {
        while (queue.length > 0 && out.length < CHATGPT_PROJECT_FILE_LIMIT) {
          const directory = queue.shift()
          if (seen.has(directory)) continue
          seen.add(directory)
          const requestPath = directory === '' ? root : chatgptJoinProjectPath(root, directory)
          const result = await chatgptWithTimeout(ctx.remote.workspaceFiles.list(fileSessionId, requestPath))
          if (result?.ok !== true) throw new Error(result?.error?.message ?? '无法读取项目文件')
          const listedPath = chatgptProjectRelativePath(root, result.value?.path ?? '')
          for (const entry of result.value?.entries ?? []) {
            const relative = listedPath === '' ? entry.name : `${listedPath}/${entry.name}`
            if (entry.type === 'directory') {
              if (!CHATGPT_PROJECT_SKIPPED_DIRS.has(entry.name) && seen.size < 60) queue.push(relative)
              continue
            }
            if (entry.type === 'file') out.push({ path: relative, name: entry.name, size: entry.size })
            if (out.length >= CHATGPT_PROJECT_FILE_LIMIT) break
          }
        }
        if (!cancelled) {
          setFiles(out)
          setPhase('ready')
        }
      } catch (reason) {
        if (!cancelled) {
          setFiles([])
          setPhase('ready')
          setError(reason instanceof Error && reason.message !== '' ? reason.message : '无法读取项目文件')
        }
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [request, root, workspaceKey, fileSessionId])

  chatgptReact.useEffect(() => {
    if (request === null) return undefined
    const onKey = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        setRequest(null)
      }
    }
    const onDown = (event) => {
      if (panelRef.current?.contains(event.target)) return
      if (event.target?.closest?.('[data-cgpt-work-tool="files"], [data-cgpt-chat-files]') !== null) return
      setRequest(null)
    }
    window.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onDown, true)
    return () => {
      window.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onDown, true)
    }
  }, [request])

  if (request === null) return null

  const selectedPaths = new Set(selected)
  const filtered = chatgptFilterProjectFiles(files, query)
  const recentRows = query.trim() === '' ? recent.filter((file) => !selectedPaths.has(file.path)).slice(0, 4) : []
  const remember = (chosen) => {
    const next = chatgptMergeRecentFiles(chatgptReadRecentFiles(window.localStorage, workspaceKey), chosen)
    chatgptWriteRecentFiles(window.localStorage, workspaceKey, next)
    setRecent(next)
  }
  const toggle = (file) => {
    setSelected((current) =>
      current.includes(file.path) ? current.filter((path) => path !== file.path) : [...current, file.path]
    )
  }
  const chosenFiles = files.filter((file) => selectedPaths.has(file.path))
  const insertReferences = () => {
    const input = document.querySelector('[data-composer-input]')
    if (input === null || chosenFiles.length === 0) return
    const text = chosenFiles.map((file) => `@${file.path}`).join(' ')
    input.focus()
    const selection = window.getSelection()
    if (selection !== null) {
      const range = document.createRange()
      range.selectNodeContents(input)
      range.collapse(false)
      selection.removeAllRanges()
      selection.addRange(range)
    }
    try {
      document.execCommand('insertText', false, `${text} `)
    } catch {
      input.textContent = `${input.textContent ?? ''}${text} `
      input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }))
    }
    remember(chosenFiles)
    setRequest(null)
  }
  const addAttachments = async () => {
    if (chosenFiles.length === 0 || busy) return
    setBusy(true)
    setError('')
    try {
      const input = document.querySelector('[data-composer-card="true"] input[type="file"]')
      if (!(input instanceof HTMLInputElement)) throw new Error('宿主没有可用的附件入口')
      const transfer = new DataTransfer()
      for (const file of chosenFiles) {
        const result = await chatgptWithTimeout(ctx.remote.workspaceFiles.readBytes(fileSessionId, chatgptJoinProjectPath(root, file.path), {}))
        if (result?.ok !== true) throw new Error(result?.error?.message ?? `无法读取 ${file.name}`)
        transfer.items.add(new File([result.value.data], file.name))
      }
      input.files = transfer.files
      input.dispatchEvent(new Event('change', { bubbles: true }))
      remember(chosenFiles)
      setRequest(null)
    } catch (reason) {
      setError(reason instanceof Error && reason.message !== '' ? reason.message : '添加附件失败')
    } finally {
      setBusy(false)
    }
  }

  return chatgptH(
    'div',
    { className: 'chatgpt-filepicker-layer' },
    chatgptH(
      'div',
      {
        ref: panelRef,
        className: 'chatgpt-filepicker',
        'data-cgpt-file-root': root,
        'data-cgpt-file-session': fileSessionId ?? '',
        'data-cgpt-file-phase': phase,
        role: 'dialog',
        'aria-modal': 'false',
        'aria-label': '选择项目文件',
        style: { left: `${style.left}px`, bottom: `${style.bottom}px`, width: `${style.width}px` }
      },
      chatgptH(
        'div',
        { className: 'chatgpt-filepicker-search' },
        chatgptH('span', { 'aria-hidden': 'true', dangerouslySetInnerHTML: { __html: CHATGPT_SESSION_ICONS.search } }),
        chatgptH('input', {
          ref: searchRef,
          value: query,
          type: 'search',
          placeholder: '搜索项目文件…',
          'aria-label': '搜索项目文件',
          onChange: (event) => setQuery(event.target.value)
        }),
        chatgptH(
          'button',
          { type: 'button', className: 'chatgpt-filepicker-close', 'aria-label': '关闭文件选择', onClick: () => setRequest(null) },
          chatgptH('span', { 'aria-hidden': 'true', dangerouslySetInnerHTML: { __html: CHATGPT_SESSION_ICONS.close } })
        )
      ),
      error === '' ? null : chatgptH('p', { className: 'chatgpt-filepicker-note', role: 'status' }, error),
      chatgptH(
        'div',
        { className: 'chatgpt-filepicker-scroll' },
        phase === 'loading'
          ? chatgptH('div', { className: 'chatgpt-filepicker-skeleton', 'aria-label': '正在读取文件' }, chatgptH('span'), chatgptH('span'), chatgptH('span'))
          : chatgptH(
              chatgptReact.Fragment,
              null,
              recentRows.length > 0
                ? chatgptH(
                    'div',
                    { className: 'chatgpt-filepicker-group' },
                    chatgptH('p', { className: 'chatgpt-filepicker-label' }, '最近文件'),
                    recentRows.map((file) => chatgptH(ChatgptFilePickerRow, {
                      key: `recent-${file.path}`,
                      file,
                      checked: false,
                      onToggle: () => toggle(file)
                    }))
                  )
                : null,
              filtered.length === 0
                ? chatgptH('p', { className: 'chatgpt-filepicker-empty' }, query.trim() === '' ? '还没有可选择的文件' : '没有匹配的文件')
                : chatgptH(
                    'div',
                    { className: 'chatgpt-filepicker-group' },
                    chatgptH('p', { className: 'chatgpt-filepicker-label' }, query.trim() === '' ? '项目文件' : '搜索结果'),
                    filtered.map((file) => chatgptH(ChatgptFilePickerRow, {
                      key: file.path,
                      file,
                      checked: selectedPaths.has(file.path),
                      onToggle: () => toggle(file)
                    }))
                  )
            )
      ),
      selected.length > 0
        ? chatgptH(
            'div',
            { className: 'chatgpt-filepicker-chips' },
            chosenFiles.map((file) =>
              chatgptH(
                'span',
                { key: file.path, className: 'chatgpt-filepicker-chip' },
                file.name,
                chatgptH('button', {
                  type: 'button',
                  'aria-label': `移除 ${file.name}`,
                  onClick: () => toggle(file)
                }, '×')
              )
            )
          )
        : null,
      chatgptH(
        'div',
        { className: 'chatgpt-filepicker-footer' },
        chatgptH(
          'button',
          {
            type: 'button',
            className: 'chatgpt-filepicker-browse',
            onClick: () => {
              setRequest(null)
              document.querySelector('[data-composer-card="true"] input[type="file"]')?.click()
            }
          },
          '浏览全部'
        ),
        chatgptH(
          'div',
          { className: 'chatgpt-filepicker-actions' },
          chatgptH(
            'button',
            { type: 'button', className: 'chatgpt-filepicker-secondary', disabled: selected.length === 0 || busy, onClick: insertReferences },
            '插入 @'
          ),
          chatgptH(
            'button',
            { type: 'button', className: 'chatgpt-filepicker-primary', disabled: selected.length === 0 || busy, onClick: () => void addAttachments() },
            busy ? '添加中…' : '添加附件'
          )
        )
      )
    )
  )
}

function ChatgptFilePickerRow(props) {
  const { file, checked, onToggle } = props
  return chatgptH(
    'button',
    {
      type: 'button',
      role: 'checkbox',
      'aria-checked': checked ? 'true' : 'false',
      className: `chatgpt-filepicker-row${checked ? ' is-checked' : ''}`,
      'data-cgpt-file-option': file.path,
      onClick: onToggle
    },
    chatgptH('span', { className: 'chatgpt-filepicker-check', 'aria-hidden': 'true' }, checked ? '✓' : ''),
    chatgptH(ChatgptProjectFileIcon, { name: file.name }),
    chatgptH(
      'span',
      { className: 'chatgpt-filepicker-rowmain' },
      chatgptH('span', { className: 'chatgpt-filepicker-rowname' }, file.name),
      file.path.includes('/') ? chatgptH('span', { className: 'chatgpt-filepicker-rowpath' }, file.path.replace(/\/?[^/]+$/, '')) : null
    )
  )
}

/** Register the page, delete dialog and file picker in the shell overlay. */
function mountChatgptProjectPage(ctx) {
  return ctx.slots.inject('shell.overlay', () =>
    ctx.slots.register(
      {
        name: 'shell.overlay',
        id: 'chatgpt-project-page',
        order: 30
      },
      (props) => chatgptH(chatgptReact.Fragment, null,
        chatgptH(ChatgptProjectPage, { ...props, ctx }),
        chatgptH(ChatgptFilePicker, { ...props, ctx })
      )
    )
  )
}
