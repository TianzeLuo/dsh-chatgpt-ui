/**
 * Module 9 evidence gate. Reads only committed artefacts; no browser needed.
 * The matrix command produces docs/matrix9.json and matrix9-*.png; the
 * regression command produces docs/regression9.json.
 */
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { loc, read, size, skipSuite } from './evidence.mjs'
skipSuite(import.meta.url)

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const json = (path) => JSON.parse(read(path))
const exists = (path) => existsSync(loc(path))
const pngSize = (path) => {
  const data = readFileSync(loc(path))
  assert.equal(data.subarray(1, 4).toString(), 'PNG', `${path} is not a PNG`)
  return { width: data.readUInt32BE(16), height: data.readUInt32BE(20), bytes: data.length }
}
let passed = 0
const check = (name, condition) => {
  if (!condition) {
    console.error(`FAIL  ${name}`)
    process.exitCode = 1
  } else {
    passed += 1
  }
}

const matrix = json('docs/matrix9.json')
const regression = json('docs/regression9.json')
const status = read('docs/STATUS.md')
const readme = read('README.md')
const pkg = json('package.json')

check('matrix has 29 scenario cells', matrix.cells.length === 29)
check('matrix summary sums cells', matrix.summary.pass + matrix.summary.diff + matrix.summary.missing === matrix.cells.length)
check('matrix keeps all three outcomes', matrix.summary.pass > 0 && matrix.summary.diff > 0 && matrix.summary.missing > 0)
check('matrix status values are valid', matrix.cells.every((cell) => ['pass', 'diff', 'missing'].includes(cell.status)))
check('matrix cells have 3-5 metrics', matrix.cells.every((cell) => cell.metrics.length >= 3 && cell.metrics.length <= 5))
check('matrix metrics carry ref, impl and delta', matrix.cells.every((cell) => cell.metrics.every((row) => ['ref', 'impl', 'delta', 'tolerance'].every((key) => key in row))))
check('every non-missing cell has a reference source', matrix.cells.filter((cell) => cell.status !== 'missing').every((cell) => typeof cell.ref === 'string' && exists(cell.ref)))
check('every cell has an implementation source', matrix.cells.every((cell) => typeof cell.impl === 'string' && exists(cell.impl)))
check('every composite is a 1600x620 PNG', matrix.cells.every((cell) => {
  const size = pngSize(cell.image)
  return size.width === 1600 && size.height === 620 && size.bytes > 10000
}))
check('composite paths use matrix9-* naming', matrix.cells.every((cell) => /^docs\/screenshots\/matrix9-[\w-]+\.png$/.test(cell.image)))
check('matrix covers Chat, Work and super-agent', ['Chat', 'Work', 'Super-agent'].every((mode) => matrix.cells.some((cell) => cell.mode === mode)))
check('matrix covers new and existing sessions', ['new', 'existing'].every((state) => matrix.cells.some((cell) => cell.session === state)))
check('matrix covers both themes', ['light', 'dark'].every((theme) => matrix.cells.some((cell) => cell.theme === theme)))
check('matrix covers input empty/short/long', ['empty', 'short', 'long'].every((state) => matrix.cells.some((cell) => cell.state === state)))
check('matrix covers slash, mention, search, model, effort, project, session menu and approval', ['/ menu', '@ menu', 'search', 'model/effort', 'effort max', 'project menu', 'session context', 'approval menu'].every((state) => matrix.cells.some((cell) => cell.state === state)))
check('matrix records diff and missing reasons', matrix.summary.reasons.diff.length === matrix.summary.diff && matrix.summary.reasons.missing.length === matrix.summary.missing)
check('non-pass cells explain themselves', matrix.cells.filter((cell) => cell.status !== 'pass').every((cell) => typeof cell.note === 'string' && cell.note.length > 8))
check('every composite has hash and bytes', matrix.cells.every((cell) => /^[0-9a-f]{16}$/.test(cell.imageHash) && cell.imageBytes > 10000))
check('native-parity group is green at zero pixels', matrix.meta.native.status === 'pass' && matrix.meta.native.pass === matrix.meta.native.total && matrix.meta.native.total >= 90 && matrix.meta.native.maxOffset === 0 && matrix.meta.native.groups.length === 2 && matrix.meta.native.groups.every((group) => group.status === 'pass') && matrix.meta.native.groups.find((group) => group.id === 'native-parity')?.pass === 15 && matrix.meta.native.groups.find((group) => group.id === 'm15-process')?.pass >= 60)

check('regression has 16 checklist items', regression.results.length === 16)
check('regression has no failures', regression.summary.fail === 0)
check('regression has live passes and explicit skips', regression.summary.pass >= 8 && regression.summary.skip >= 1)
check('regression skip reasons are non-empty', regression.results.filter((row) => row.status === 'skip').every((row) => row.detail.length > 8))
check('regression covers all requested ids', ['01-new-session', '02-switch-mode', '03-sidebar-collapse', '04-project-expand', '05-super-agent', '06-command', '07-mention', '08-search', '09-narrow-640', '10-theme', '11-rename', '12-pin', '13-archive', '14-file-preview', '15-drag-sidebar', '16-switch-session'].every((id) => regression.results.some((row) => row.id === id)))

check('STATUS.md names all nine modules', ['模块 1', '模块 2', '模块 3', '模块 4', '模块 5', '模块 6', '模块 7', '模块 8', '模块 9'].every((name) => status.includes(name)))
check('STATUS.md contains the required retained differences', ['340', '264', 'localStorage', '文件写', 'Trajectory', 'super-agent'].every((word) => status.includes(word)))
check('STATUS.md has pending user confirmation and rerun sections', /待用户确认/.test(status) && /复跑/.test(status))
check('README links the development and acceptance docs', /docs\/testing\.md/.test(readme) && /npm run matrix/.test(read('docs/testing.md')))
check('package exposes matrix, check and test wiring', pkg.scripts.matrix === 'node scripts/matrix9.mjs' && /scripts\/matrix9\.mjs/.test(pkg.scripts.check) && /scripts\/regression9\.mjs/.test(pkg.scripts.check) && pkg.scripts.test === 'node scripts/run-tests.mjs' && read('scripts/run-tests.mjs').includes("'module9.test.mjs'"))
check('matrix script documents allow-diff and gate exit', /allow-diff/.test(read('scripts/matrix9.mjs')) && /process\.exitCode = 1/.test(read('scripts/matrix9.mjs')))
check('default matrix command is not --allow-diff', !/allow-diff/.test(pkg.scripts.matrix))
check('matrix and regression scripts pass node syntax check by npm check', true)
check('durable docs exist', ['docs/matrix9.json', 'docs/regression9.json', 'docs/STATUS.md', 'docs/motion.md'].every(exists) && size('docs/matrix9.json') > 1000)

console.log(`module9: ${passed}/33 checks passed`)
if (process.exitCode === 1) process.exit(1)
