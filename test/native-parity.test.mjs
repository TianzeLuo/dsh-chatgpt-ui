/**
 * Native-parity gate on the committed evidence.
 *
 * docs/native-parity.json is produced by tools/native-parity.mjs from two
 * isolated instances on the same fixture session: A is clean, B runs the same
 * plugin with its skin switch off, so the Host must render byte-for-byte the
 * native transcript. This is the module-4 gate: the skinned layout may change,
 * but switching the skin off may not leave a single style or geometry delta.
 * The recorded before/after history still shows the regression that motivated
 * the gate.
 */

import assert from 'node:assert/strict'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const report = JSON.parse(readFileSync(join(ROOT, 'docs/native-parity.json'), 'utf8'))
const TOLERANCE = 1

test('the skin-off transcript matches the clean transcript within 1px', () => {
  assert.equal(report.tolerance, TOLERANCE)
  assert.equal(report.fixture.bSkin, 'off', 'the gate must compare against the skin-off instance')
  assert.ok(report.comparison.counts.total >= 12, 'fixture should contain the full trajectory')
  assert.equal(report.comparison.counts.diff, 0, `native nodes differ: ${JSON.stringify(report.comparison.elements.filter((element) => element.status !== 'pass'), null, 2)}`)
  assert.equal(report.comparison.pass, true)
  assert.ok(report.comparison.maxOffset <= TOLERANCE, `max offset ${report.comparison.maxOffset}px`)
})

test('every element records geometry and computed style', () => {
  for (const element of report.comparison.elements) {
    assert.equal(element.status, 'pass', `${element.kind} is ${element.status}`)
    for (const key of ['relX', 'relY', 'height', 'widthNormalised']) {
      assert.ok(element.delta[key] <= TOLERANCE, `${element.kind}.${key}=${element.delta[key]}`)
    }
    assert.deepEqual(element.styleDelta, [], `${element.kind} style changed`)
    for (const side of ['a', 'b']) {
      for (const key of ['x', 'y', 'w', 'h', 'fontSize', 'lineHeight', 'display', 'flexDirection', 'gap', 'padding', 'margin']) {
        assert.ok(element[side][key] !== undefined, `${element.kind}.${side}.${key} missing`)
      }
    }
  }
})

test('the recorded before/after history shows the regression and its fix', () => {
  const history = report.history
  assert.ok(history, 'history block missing')
  assert.ok(history.beforeFix.summary.maxYOffset > 100, 'before-fix drift should be recorded')
  assert.ok(history.beforeFix.summary.maxHeightDelta >= 20, 'before-fix tool-row height inflation should be recorded')
  assert.ok(history.beforeFix.summary.maxWidthDelta > 20, 'before-fix width drift should be recorded')
  assert.equal(history.afterFix.summary.pass, true)
  assert.ok(history.afterFix.summary.maxOffset <= TOLERANCE)
})

test('full and close-up screenshots exist for both instances', () => {
  for (const side of ['A', 'B']) {
    for (const kind of ['full', 'transcript', 'cards', 'answer']) {
      const path = join(ROOT, `docs/screenshots/native-parity-${side}-${kind}.png`)
      assert.ok(existsSync(path), `missing ${path}`)
      assert.ok(statSync(path).size > 5000, `screenshot looks empty: ${path}`)
    }
  }
})
