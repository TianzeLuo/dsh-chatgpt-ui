/**
 * tools.test.mjs — the acceptance tooling has to stay runnable in one command.
 *
 * The matrix and the icon diff are the evidence for the Phase 5 brief, so the
 * contract they are consumed under is pinned here: the flags the brief names,
 * the artefacts the docs link to, and the honest exit codes.
 */

import { readFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const matrix = readFileSync(join(ROOT, 'tools/matrix.mjs'), 'utf8')
const diff = readFileSync(join(ROOT, 'tools/icon-diff.mjs'), 'utf8')
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))

let passed = 0
const check = (name, ok) => {
  if (ok) passed += 1
  else console.log(`FAIL  ${name}`)
  if (!ok) process.exitCode = 1
}

check('tools: one-command matrix exists', existsSync(join(ROOT, 'tools/matrix.mjs')))
check('tools: matrix takes --url / --url-light', matrix.includes("args.get('url-dark') ?? args.get('url')") && matrix.includes("args.get('url-light')"))
check('tools: matrix writes docs/matrix.json', matrix.includes("join(OUT, 'matrix.json')"))
check('tools: matrix exits non-zero on diff/missing unless --allow-diff', matrix.includes("args.get('allow-diff') !== true") && matrix.includes('process.exit(1)'))
check('tools: matrix covers every briefed dimension', ['scenario', 'state', 'theme', 'interaction', 'input'].every((key) => matrix.includes(`${key}:`)) && matrix.includes("'project'") && matrix.includes("'row-menu'"))
check('tools: matrix renders per-theme-per-scene sheets', matrix.includes('matrix-${theme}-${scenario}'))
check('tools: icon diff takes a threshold and exits on offenders', diff.includes("args.get('threshold')") && diff.includes('process.exit(1)'))
check('tools: icon diff writes configurable docs JSON', diff.includes("args.get('json')") && diff.includes('join(OUT, JSON_NAME)'))
check('tools: icon diff renders at the real 20px viewBox', diff.includes('const SIZE = 20'))
check('tools: docs point at the matrix command', readFileSync(join(ROOT, 'docs/testing.md'), 'utf8').includes('tools/matrix.mjs'))
check('tools: package has no runtime dependency on playwright', JSON.stringify(pkg.dependencies ?? {}).includes('playwright') === false)

console.log(`PASS  ${passed} acceptance-tooling checks`)
