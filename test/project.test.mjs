import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  CHATGPT_PROJECT_INSTRUCTIONS_PREFIX,
  CHATGPT_PROJECT_FILE_LIMIT,
  CHATGPT_PROJECT_SKIPPED_DIRS,
  chatgptProjectInstructionsKey,
  chatgptReadProjectInstructions,
  chatgptWriteProjectInstructions,
  chatgptNormalizeProjectPath,
  chatgptIsAbsolutePath,
  chatgptJoinProjectPath,
  chatgptProjectRelativePath,
  chatgptProjectBasename,
  chatgptFormatBytes,
  chatgptProjectFileKind,
  chatgptProjectFileBadge,
  chatgptFilterProjectFiles,
  chatgptFileAddress,
  chatgptMergeRecentFiles,
  chatgptReadRecentFiles,
  chatgptWriteRecentFiles
} from '../lib/shared/project-core.mjs'

let checks = 0
let failures = 0
function check(name, condition) {
  checks += 1
  if (!condition) {
    failures += 1
    console.error(`FAIL  ${name}`)
  }
}

class MemoryStorage {
  constructor() { this.map = new Map() }
  getItem(key) { return this.map.has(key) ? this.map.get(key) : null }
  setItem(key, value) { this.map.set(key, String(value)) }
  removeItem(key) { this.map.delete(key) }
}

// 1. Instructions are browser-persisted, bounded, and per workspace.
{
  const storage = new MemoryStorage()
  check('instructions key is workspace-scoped', chatgptProjectInstructionsKey('w1') === `${CHATGPT_PROJECT_INSTRUCTIONS_PREFIX}w1`)
  check('instructions default empty', chatgptReadProjectInstructions(storage, 'w1') === '')
  chatgptWriteProjectInstructions(storage, 'w1', '用中文回答')
  check('instructions round-trip', chatgptReadProjectInstructions(storage, 'w1') === '用中文回答')
  check('instructions are isolated', chatgptReadProjectInstructions(storage, 'w2') === '')
  chatgptWriteProjectInstructions(storage, 'w1', 'x'.repeat(5000))
  check('instructions bounded at 4000', chatgptReadProjectInstructions(storage, 'w1').length === 4000)
  chatgptWriteProjectInstructions(storage, 'w1', '')
  check('empty save removes key', storage.getItem(chatgptProjectInstructionsKey('w1')) === null)
  const broken = { getItem() { throw new Error('denied') }, setItem() { throw new Error('denied') }, removeItem() { throw new Error('denied') } }
  check('storage failure reads empty', chatgptReadProjectInstructions(broken, 'w1') === '')
  check('storage failure returns draft', chatgptWriteProjectInstructions(broken, 'w1', 'draft') === 'draft')
}

// 2. Paths preserve Host spelling and display normalization.
{
  check('backslashes normalize', chatgptNormalizeProjectPath('.\\src\\a.ts') === 'src/a.ts')
  check('leading slash normalizes', chatgptNormalizeProjectPath('/a/b') === 'a/b')
  check('posix absolute', chatgptIsAbsolutePath('/home/u/a') === true)
  check('windows absolute', chatgptIsAbsolutePath('F:\\work\\a') === true)
  check('relative is not absolute', chatgptIsAbsolutePath('src/a') === false)
  check('posix join', chatgptJoinProjectPath('/home/u/work/', 'src/a.ts') === '/home/u/work/src/a.ts')
  check('windows join keeps backslashes', chatgptJoinProjectPath('F:\\work\\', 'src/a.ts') === 'F:\\work\\src\\a.ts')
  check('empty relative returns root', chatgptJoinProjectPath('/a/b/', '') === '/a/b')
  check('relative under root', chatgptProjectRelativePath('F:\\work', 'F:\\work\\src\\a.ts') === 'src/a.ts')
  check('relative outside root stays normalized', chatgptProjectRelativePath('/a/b', '/c/d') === 'c/d')
  check('basename windows', chatgptProjectBasename('F:\\work\\a.txt') === 'a.txt')
  check('basename posix', chatgptProjectBasename('/a/b/c.png') === 'c.png')
}

// 3. File metadata, filtering and the native preview address.
{
  check('bytes', chatgptFormatBytes(512) === '512 B')
  check('kb', chatgptFormatBytes(2048) === '2.0 KB')
  check('mb', chatgptFormatBytes(3 * 1024 * 1024) === '3.0 MB')
  check('invalid size empty', chatgptFormatBytes(-1) === '')
  check('image kind', chatgptProjectFileKind('a/b/Photo.JPG') === 'image')
  check('pdf kind', chatgptProjectFileKind('report.pdf') === 'pdf')
  check('code kind', chatgptProjectFileKind('src/app.ts') === 'code')
  check('office kind', chatgptProjectFileKind('deck.pptx') === 'office')
  check('unknown kind', chatgptProjectFileKind('LICENSE') === 'file')
  check('badge uppercase', chatgptProjectFileBadge('a/b/photo.jpeg') === 'JPEG')
  check('badge empty without extension', chatgptProjectFileBadge('LICENSE') === '')
  const files = [
    { path: 'src/app.ts', name: 'app.ts' },
    { path: 'docs/README.md', name: 'README.md' },
    { path: 'assets/photo.png', name: 'photo.png' }
  ]
  check('filter by name', chatgptFilterProjectFiles(files, 'read').length === 1)
  check('filter by directory', chatgptFilterProjectFiles(files, 'assets').length === 1)
  check('filter trims and lowercases', chatgptFilterProjectFiles(files, '  APP ').length === 1)
  check('empty query returns copy', chatgptFilterProjectFiles(files, '').length === 3 && chatgptFilterProjectFiles(files, '') !== files)
  check('filter handles non-array', chatgptFilterProjectFiles(null, 'a').length === 0)
  check('address grammar', chatgptFileAddress('s1', 'F:\\work\\a b#c.png') === 'dsh-resource://file/session/s1/F%3A/work/a%20b%23c.png')
  check('address keeps leading slash', chatgptFileAddress('s1', '/home/u/a.txt') === 'dsh-resource://file/session/s1//home/u/a.txt')
  check('limit advertised', CHATGPT_PROJECT_FILE_LIMIT === 200)
  check('dependency dirs skipped', CHATGPT_PROJECT_SKIPPED_DIRS.has('node_modules') && CHATGPT_PROJECT_SKIPPED_DIRS.has('.git'))
}

// 4. Recent files are de-duplicated, capped and defensive.
{
  const merged = chatgptMergeRecentFiles(
    [{ path: 'a.txt', name: 'a.txt' }, { path: 'b.txt', name: 'b.txt' }],
    [{ path: 'c.txt', name: 'c.txt' }, { path: 'a.txt', name: 'a.txt' }],
    3
  )
  check('recent newest first', merged.map((f) => f.path).join(',') === 'c.txt,a.txt,b.txt')
  check('recent cap', chatgptMergeRecentFiles([], Array.from({ length: 20 }, (_, i) => ({ path: `f${i}.txt` }))).length === 8)
  const storage = new MemoryStorage()
  chatgptWriteRecentFiles(storage, 'w1', merged)
  check('recent round-trip', chatgptReadRecentFiles(storage, 'w1').length === 3)
  storage.setItem(chatgptRecentFilesKeySafe('w1'), '{not json')
  check('malformed recent is empty', chatgptReadRecentFiles(storage, 'w1').length === 0)
  storage.setItem(chatgptRecentFilesKeySafe('w1'), JSON.stringify([{ path: '' }, { path: 'ok.txt' }, null]))
  check('invalid recent rows filtered', chatgptReadRecentFiles(storage, 'w1').map((f) => f.path).join(',') === 'ok.txt')
}

// 5. The browser half wires the page, picker and Chat file entry exactly once.
{
  const bundle = readFileSync(join(process.cwd(), 'lib/client.js'), 'utf8')
  check('page mount registered', /id: 'chatgpt-project-page'/.test(bundle))
  check('project row toggles expansion instead of navigating', /onClick: \(\) => toggleProject\(project\.id\)/.test(bundle) && !/data-cgpt-project-row[\s\S]{0,500}chatgptOpenProjectPage/.test(bundle))
  check('project row has no chevron', !bundle.includes('chatgpt-project-toggle'))
  check('file picker listens for event', /CHATGPT_FILE_PICKER_EVENT/.test(bundle))
  check('native preview used', /sidebarRight\.openResource\(chatgptFileAddress/.test(bundle))
  check('no fake upload control', bundle.includes('上传项目文件') === false)
  check('API boundary stated', bundle.includes('上传与删除未开放') && bundle.includes('宿主暂无项目说明写接口'))
}

console.log(`project: ${checks - failures}/${checks} checks passed`)
if (failures > 0) process.exitCode = 1

function chatgptRecentFilesKeySafe(id) {
  return `dsh-chatgpt-ui:recent-files:v1:${id}`
}
