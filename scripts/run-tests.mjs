#!/usr/bin/env node
/**
 * `npm test` — the full gate, layered by the evidence that is on this machine.
 *
 * The 12 core suites read only repository files and always run. The other 38
 * replay locally captured evidence (geometry JSON, reference captures,
 * screenshots) that is deliberately not in the repository; each of them skips
 * itself when its evidence is missing, and this runner prints one line saying
 * which layer it took, then a summary. `npm run test:core` is the same core
 * layer without this file.
 *
 * Environment:
 *   CHATGPT_UI_EVIDENCE  directory holding the local evidence (default: docs/)
 *
 * Exit code is 1 when any suite failed; skipped suites never fail the run.
 */
import { spawnSync } from 'node:child_process'
import { EVIDENCE, EVIDENCE_ROOT, ROOT, exists } from '../test/evidence.mjs'

/** Suites that need nothing but the repository. Order mirrors `test:core`. */
const CORE = [
  'selectors.contract.mjs',
  'mode.test.mjs',
  'preset.test.mjs',
  'chat-policy.test.mjs',
  'independence.test.mjs',
  'layout.test.mjs',
  'sessions.test.mjs',
  'work-composer.test.mjs',
  'tools.test.mjs',
  'scoped-css.test.mjs',
  'project.test.mjs',
  'module7.test.mjs'
]

/** Evidence suites, in the order the modules were built. */
const REPLAY = [
  'icons.test.mjs',
  'messages.test.mjs',
  'module6.test.mjs',
  'module8.test.mjs',
  'module9.test.mjs',
  'native-parity.test.mjs',
  'process-native.test.mjs',
  'm12.test.mjs',
  'm13.test.mjs',
  'm14.test.mjs',
  'm16.test.mjs',
  'm17.test.mjs',
  'm11.test.mjs',
  'm19.test.mjs',
  'corner-shape.test.mjs',
  'm21.test.mjs',
  'm22.test.mjs',
  'm23.test.mjs',
  'm24.test.mjs',
  'm25.test.mjs',
  'm26.test.mjs',
  'm27.test.mjs',
  'm28.test.mjs',
  'm29.test.mjs',
  'm30.test.mjs',
  'm31.test.mjs',
  'p018.test.mjs',
  'p018b.test.mjs',
  'm32.test.mjs',
  'm33.test.mjs',
  'm35.test.mjs',
  'm36.test.mjs',
  'm34.test.mjs',
  'm38.test.mjs',
  'm40.test.mjs',
  'm37.test.mjs',
  'm39.test.mjs',
  'p4b.test.mjs'
]

const withoutEvidence = REPLAY.filter((suite) => EVIDENCE[suite].some((path) => !exists(path)))

console.log(`evidence root: ${EVIDENCE_ROOT}`)
if (withoutEvidence.length === 0) {
  console.log(`evidence complete: running all ${CORE.length + REPLAY.length} suites (core ${CORE.length} + evidence replay ${REPLAY.length})`)
} else {
  console.log(`evidence missing for ${withoutEvidence.length}/${REPLAY.length} replay suites: they skip, the other ${CORE.length + REPLAY.length - withoutEvidence.length} suites run — see docs/testing.md §2`)
}

const run = (suite) => {
  const child = spawnSync(process.execPath, [`test/${suite}`], { cwd: ROOT, encoding: 'utf8' })
  const output = `${child.stdout ?? ''}${child.stderr ?? ''}`
  process.stdout.write(output.endsWith('\n') || output === '' ? output : `${output}\n`)
  const failed = child.status !== 0
  const skipped = /^SKIP  test\//m.test(output) || /(ℹ|#) skipped [1-9]/.test(output)
  return { suite, failed, skipped }
}

const results = []
for (const suite of [...CORE, ...REPLAY]) results.push(run(suite))

const failed = results.filter((result) => result.failed)
const skipped = results.filter((result) => !result.failed && result.skipped)
const passed = results.length - failed.length - skipped.length
console.log('')
console.log(`npm test: ${passed} passed · ${skipped.length} skipped · ${failed.length} failed (${results.length} suites)`)
if (skipped.length > 0) {
  console.log(`skipped: ${skipped.map((result) => result.suite.replace(/\.m?js$/, '')).join(' ')}`)
}
if (failed.length > 0) {
  console.log(`failed: ${failed.map((result) => result.suite).join(' ')}`)
  process.exit(1)
}
