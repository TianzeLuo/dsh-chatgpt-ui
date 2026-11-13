/**
 * The evidence gate for the acceptance suites.
 *
 * Two things live here, because they must agree with each other:
 *
 * 1. `EVIDENCE_ROOT` — where the locally captured evidence is read from. The
 *    default is `<repo>/docs`, which is where the capture scripts write. The
 *    evidence itself is **not** in the repository (see docs/testing.md §2), so
 *    a maintainer machine that keeps it elsewhere points
 *    `CHATGPT_UI_EVIDENCE` at that directory instead:
 *
 *      CHATGPT_UI_EVIDENCE=/path/to/_archive/dsh-chatgpt-ui/docs npm test
 *
 *    Only the local capture material is redirected: the committed prose under
 *    `docs/` (the allowlist below) always resolves inside the repo.
 *
 * 2. `EVIDENCE` — which files each evidence suite needs. A suite that cannot
 *    find its evidence skips instead of failing (red line 5 in AGENTS.md): the
 *    skin's contract suites must be green on a clean clone, and a skip must be
 *    visible in the output rather than silently counted as a pass.
 *
 * `scripts/run-tests.mjs` reads the same table to decide the layering.
 */
import { existsSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/** Repository root. */
export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/** Committed documents under `docs/`: never redirected to the evidence root. */
const COMMITTED = new Set([
  'about.md',
  'architecture.md',
  'design-tokens.md',
  'development.md',
  'limitations.md',
  'roadmap.md',
  'testing.md',
  'troubleshooting.md'
])

/** Where the capture evidence lives. Override with `CHATGPT_UI_EVIDENCE`. */
export const EVIDENCE_ROOT = process.env.CHATGPT_UI_EVIDENCE
  ? resolve(process.env.CHATGPT_UI_EVIDENCE)
  : join(ROOT, 'docs')

/**
 * Absolute path for a repository-relative path. Paths under `docs/` that are
 * local evidence resolve against `EVIDENCE_ROOT`; everything else (committed
 * docs, `lib/`, `package.json`, …) resolves against the repository.
 */
export function loc(path) {
  const raw = String(path)
  if (raw.startsWith('/')) {
    // The evidence JSON records absolute paths from the machine that captured
    // it. Those under this repository's `docs/` follow the evidence root.
    const repoDocs = `${join(ROOT, 'docs')}/`
    return raw.startsWith(repoDocs) ? join(EVIDENCE_ROOT, raw.slice(repoDocs.length)) : raw
  }
  const rel = raw.replace(/^\.\//, '')
  if (!rel.startsWith('docs/')) return join(ROOT, rel)
  const tail = rel.slice('docs/'.length)
  const committed = COMMITTED.has(tail) || tail.startsWith('images/')
  return committed ? join(ROOT, rel) : join(EVIDENCE_ROOT, tail)
}

/** Read a repository or evidence file as UTF-8 (or the given encoding). */
export const read = (path, encoding = 'utf8') => readFileSync(loc(path), encoding)

/** Read and parse a JSON file. */
export const json = (path) => JSON.parse(read(path))

/** Does the file (or directory) exist? */
export const exists = (path) => existsSync(loc(path))

/** Size in bytes. Throws when missing, like `statSync`. */
export const size = (path) => statSync(loc(path)).size

/** The evidence files the given suite declares, as written in `EVIDENCE`. */
const keysFor = (url) => {
  const name = url === undefined ? '' : String(url).split('/').slice(-1)[0]
  return EVIDENCE[name] ?? []
}

/** Evidence entries that are missing on this machine. */
export const missingEvidence = (url) => keysFor(url).filter((path) => !exists(path))

/**
 * Suite-level gate for the hand-rolled `check()` suites: when the declared
 * evidence is missing, print one `SKIP` line with the reason and exit 0 —
 * skipped, never passed, never failed.
 */
export function skipSuite(url, note) {
  const missing = missingEvidence(url)
  if (missing.length === 0) return
  const name = String(url).split('/').slice(-1)[0]
  console.log(`SKIP  test/${name} — 缺少本机证据：${missing.join('、')}${note ? `（${note}）` : ''}`)
  console.log('      evidence is local-only: see docs/testing.md §2 for how to generate it or point CHATGPT_UI_EVIDENCE at it')
  process.exit(0)
}

/**
 * `node:test` gate: wrap the runner's `test` so every case is skipped with a
 * reason when the evidence is missing. Suites that read evidence *inside* a
 * case use this; suites that read it at module scope use `skipSuite`.
 */
export function evidenceTest(nodeTest, url) {
  const missing = missingEvidence(url)
  const reason = missing.length
    ? `缺少本机证据：${missing.join('、')}（docs/testing.md §2）`
    : ''
  const wrap = (name, options, fn) => {
    if (typeof options === 'function') return wrap(name, undefined, options)
    if (!missing.length) return nodeTest(name, options ?? {}, fn)
    return nodeTest(name, { ...(options ?? {}), skip: reason })
  }
  return wrap
}

/**
 * Which acceptance suite needs which local capture. Paths are relative to the
 * repository (`docs/…`); directories are allowed for the groups a suite walks.
 * Core suites are absent from this table — they read only repository files.
 */
export const EVIDENCE = {
  'icons.test.mjs': ['docs/capture/icons.json'],
  'messages.test.mjs': ['docs/screenshots'],
  'module6.test.mjs': ['docs/capture/icons.json', 'docs/icon-check.json', 'docs/screenshots'],
  'module8.test.mjs': ['docs/motion.md', 'docs/responsive-audit.json', 'docs/theme-audit.json', 'docs/screenshots'],
  'module9.test.mjs': ['docs/STATUS.md', 'docs/matrix9.json', 'docs/motion.md', 'docs/regression9.json'],
  'native-parity.test.mjs': ['docs/native-parity.json', 'docs/screenshots'],
  'process-native.test.mjs': ['docs/m15-process.json', 'docs/m15-process-native.png', 'docs/screenshots'],
  'm11.test.mjs': ['docs/m11-fixes.json', 'docs/screenshots'],
  'm12.test.mjs': ['docs/capture/live/model-panel.json', 'docs/capture/live/m12-interaction.json'],
  'm13.test.mjs': ['docs/m13-composer.json', 'docs/capture/live', 'docs/screenshots'],
  'm14.test.mjs': ['docs/m14-panel.json', 'docs/capture/live/m14-capture.json', 'docs/screenshots'],
  'm16.test.mjs': ['docs/m16.json'],
  'm17.test.mjs': ['docs/m17-panel.json', 'docs/capture/live/m17-capture.json', 'docs/screenshots'],
  'm19.test.mjs': ['docs/capture/slider-dom.json', 'docs/screenshots'],
  'corner-shape.test.mjs': ['docs/m20.json', 'docs/screenshots'],
  'm21.test.mjs': ['docs/m21.json', 'docs/m35.json'],
  'm22.test.mjs': ['docs/m22.json'],
  'm23.test.mjs': ['docs/m23.json', 'docs/screenshots'],
  'm24.test.mjs': ['docs/m24.json'],
  'm25.test.mjs': ['docs/m25.json', 'docs/m25-sheets.json', 'docs/m25-icons-diff.json', 'docs/capture/live', 'docs/screenshots'],
  'm26.test.mjs': ['docs/m26.json', 'docs/m26-sheets.json', 'docs/capture/m26'],
  'm27.test.mjs': ['docs/m27.json', 'docs/screenshots'],
  'm28.test.mjs': ['docs/m28.json', 'docs/m28-web.json', 'docs/m27b.json', 'docs/screenshots', 'docs/reference'],
  'm29.test.mjs': ['docs/m29.json', 'docs/screenshots'],
  'm30.test.mjs': ['docs/m30.json', 'docs/screenshots'],
  'm31.test.mjs': ['docs/p1e.json'],
  'p018.test.mjs': ['docs/m31.json', 'docs/screenshots'],
  'p018b.test.mjs': ['docs/m31b.json', 'docs/screenshots'],
  'm32.test.mjs': ['docs/m32.json', 'docs/screenshots'],
  'm33.test.mjs': ['docs/m33.json'],
  'm34.test.mjs': ['docs/m34.json', 'docs/screenshots'],
  'm35.test.mjs': ['docs/m35.json'],
  'm36.test.mjs': ['docs/m36.json', 'docs/screenshots'],
  'm37.test.mjs': ['docs/m37.json'],
  'm38.test.mjs': ['docs/m38.json', 'docs/screenshots'],
  'm39.test.mjs': ['docs/m39.json', 'docs/screenshots'],
  'm40.test.mjs': ['docs/m40.json', 'docs/screenshots']
}
