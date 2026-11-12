/**
 * Pure helpers for the project page and file picker.
 *
 * The Host exposes Workspaces (projects), read-only workspace file listings and
 * Session navigation; it exposes no project-instruction or file-mutation API.
 * These helpers therefore keep path, search, size and address formatting
 * deterministic while the UI states the API boundary explicitly.
 */

/** Prefix for the browser-persisted project instructions. */
export const CHATGPT_PROJECT_INSTRUCTIONS_PREFIX = 'dsh-chatgpt-ui:project-instructions:v1:'

/** Prefix for the browser-persisted recent-file list. */
export const CHATGPT_RECENT_FILES_PREFIX = 'dsh-chatgpt-ui:recent-files:v1:'

/** Cap on files shown by the project page and picker. */
export const CHATGPT_PROJECT_FILE_LIMIT = 200

/** Directory names that must not be walked by the project file scan. */
export const CHATGPT_PROJECT_SKIPPED_DIRS = new Set([
  '.git', '.hg', '.svn', 'node_modules', '.next', 'dist', 'build', 'target', 'vendor', '.cache'
])

/** One localStorage key for a Workspace's instructions. */
export function chatgptProjectInstructionsKey(workspaceId) {
  return CHATGPT_PROJECT_INSTRUCTIONS_PREFIX + String(workspaceId ?? '')
}

/** One localStorage key for a Workspace's recent files. */
export function chatgptRecentFilesKey(workspaceId) {
  return CHATGPT_RECENT_FILES_PREFIX + String(workspaceId ?? '')
}

/** Read instructions through a storage-like object; malformed/missing values are empty. */
export function chatgptReadProjectInstructions(storage, workspaceId) {
  try {
    const value = storage?.getItem?.(chatgptProjectInstructionsKey(workspaceId))
    return typeof value === 'string' ? value : ''
  } catch {
    return ''
  }
}

/** Persist instructions; storage failures stay non-fatal. */
export function chatgptWriteProjectInstructions(storage, workspaceId, text) {
  try {
    const value = typeof text === 'string' ? text.slice(0, 4000) : ''
    if (value === '') storage?.removeItem?.(chatgptProjectInstructionsKey(workspaceId))
    else storage?.setItem?.(chatgptProjectInstructionsKey(workspaceId), value)
    return value
  } catch {
    return typeof text === 'string' ? text.slice(0, 4000) : ''
  }
}

/** Normalize a Workspace-relative path for display and React keys. */
export function chatgptNormalizeProjectPath(path) {
  return String(path ?? '').replace(/\\/g, '/').replace(/^\.\/+/, '').replace(/^\/+/, '')
}

/** Whether a path is absolute in either Host spelling. */
export function chatgptIsAbsolutePath(path) {
  const value = String(path ?? '')
  return value.startsWith('/') || /^[A-Za-z]:[\\/]/.test(value) || value.startsWith('\\\\')
}

/**
 * Join a Workspace root and a relative path in the root's native spelling.
 * Windows roots keep backslashes because workspaceFiles accepts Host paths.
 */
export function chatgptJoinProjectPath(root, relative) {
  const base = String(root ?? '').replace(/[\\/]+$/, '')
  const child = String(relative ?? '').replace(/^[\\/]+/, '')
  if (base === '') return child
  if (child === '') return base
  const separator = /^[A-Za-z]:[\\/]/.test(base) || base.startsWith('\\\\') ? '\\' : '/'
  return `${base}${separator}${child.replace(/[\\/]+/g, separator)}`
}

/** Path relative to a root when it is inside it; otherwise the normalized input. */
export function chatgptProjectRelativePath(root, absolute) {
  const path = chatgptNormalizeProjectPath(absolute)
  const base = chatgptNormalizeProjectPath(root).replace(/\/+$/, '')
  if (base !== '' && path.startsWith(base + '/')) return path.slice(base.length + 1)
  return path
}

/** Basename in either separator spelling. */
export function chatgptProjectBasename(path) {
  return chatgptNormalizeProjectPath(path).split('/').filter(Boolean).pop() ?? ''
}

/** Human file size for the list. */
export function chatgptFormatBytes(bytes) {
  const value = Number(bytes)
  if (!Number.isFinite(value) || value < 0) return ''
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(value < 10 * 1024 ? 1 : 0)} KB`
  return `${(value / (1024 * 1024)).toFixed(1)} MB`
}

/** File glyph family used by the page and picker. */
export function chatgptProjectFileKind(name) {
  const extension = chatgptProjectBasename(name).split('.').pop()?.toLowerCase() ?? ''
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'avif'].includes(extension)) return 'image'
  if (['pdf'].includes(extension)) return 'pdf'
  if (['md', 'markdown', 'txt', 'rst', 'log'].includes(extension)) return 'text'
  if (['json', 'jsonc', 'yaml', 'yml', 'toml', 'xml', 'csv', 'tsv'].includes(extension)) return 'data'
  if (['js', 'mjs', 'cjs', 'ts', 'tsx', 'jsx', 'css', 'html', 'py', 'rs', 'go', 'java', 'c', 'cc', 'cpp', 'h', 'sh', 'bash', 'zsh', 'sql'].includes(extension)) return 'code'
  if (['zip', 'tar', 'gz', 'tgz', '7z', 'rar'].includes(extension)) return 'archive'
  if (['doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx'].includes(extension)) return 'office'
  return 'file'
}

/** Stable uppercase extension badge text (max four characters). */
export function chatgptProjectFileBadge(name) {
  const base = chatgptProjectBasename(name)
  const dot = base.lastIndexOf('.')
  if (dot <= 0 || dot === base.length - 1) return ''
  return base.slice(dot + 1).toUpperCase().slice(0, 4)
}

/** Case-insensitive search over basename and relative directory. */
export function chatgptFilterProjectFiles(files, query) {
  const needle = String(query ?? '').trim().toLowerCase()
  const items = Array.isArray(files) ? files : []
  if (needle === '') return [...items]
  return items.filter((file) => {
    const name = String(file?.name ?? file?.path ?? '').toLowerCase()
    const path = String(file?.path ?? '').toLowerCase()
    return name.includes(needle) || path.includes(needle)
  })
}

/** File address in the Host preview's Session-scoped grammar. */
export function chatgptFileAddress(sessionId, absolutePath) {
  const normalized = String(absolutePath ?? '').replace(/\\/g, '/')
  const encoded = normalized.split('/').map((part) => encodeURIComponent(part)).join('/')
  return `dsh-resource://file/session/${encodeURIComponent(String(sessionId ?? ''))}/${encoded}`
}

/** Recent files de-duplicated by relative path, newest first, capped. */
export function chatgptMergeRecentFiles(previous, added, limit = 8) {
  const next = []
  const seen = new Set()
  for (const file of [...(Array.isArray(added) ? added : []), ...(Array.isArray(previous) ? previous : [])]) {
    const path = chatgptNormalizeProjectPath(file?.path)
    if (path === '' || seen.has(path)) continue
    seen.add(path)
    next.push({ path, name: file?.name ?? chatgptProjectBasename(path), size: file?.size })
    if (next.length >= limit) break
  }
  return next
}

/** Read a recent-file list defensively. */
export function chatgptReadRecentFiles(storage, workspaceId) {
  try {
    const raw = storage?.getItem?.(chatgptRecentFilesKey(workspaceId))
    const parsed = raw === null || raw === undefined ? [] : JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((file) => file !== null && typeof file === 'object' && typeof file.path === 'string' && file.path !== '')
      .slice(0, 8)
      .map((file) => ({ path: chatgptNormalizeProjectPath(file.path), name: String(file.name ?? chatgptProjectBasename(file.path)), size: file.size }))
  } catch {
    return []
  }
}

/** Persist a recent-file list; failures are non-fatal. */
export function chatgptWriteRecentFiles(storage, workspaceId, files) {
  try {
    storage?.setItem?.(chatgptRecentFilesKey(workspaceId), JSON.stringify(files.slice(0, 8)))
  } catch {
    // The picker still works from the live listing.
  }
}
