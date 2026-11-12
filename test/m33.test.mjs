/**
 * M33 — one user bubble for ordinary, steering and pending-steering rows.
 *
 * The source gate proves every shared user-bubble rule now includes the Host's
 * durable `steering` flow kind and no longer excludes pending echoes. The
 * evidence gate proves the live measurements (plugin before/after and a
 * no-plugin control) and the annotated comparison crops.
 *
 * Run: node test/m33.test.mjs
 */
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (path) => readFileSync(join(ROOT, path), 'utf8')
const exists = (path) => existsSync(join(ROOT, path))
const json = (path) => JSON.parse(read(path))
const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '')

const USER_BUBBLE = "body[data-chatgpt-ui][data-cgpt-skin='on'] :is([data-chat-flow-kind='user'], [data-chat-flow-kind='steering'], [data-submission-echo])"
const css = stripComments(read('lib/client/css/30-chat.css'))

test('M33: every user-bubble rule matches steering and pending echoes', () => {
  assert.doesNotMatch(css, /:not\(\[data-pending-steering\]\)/, 'pending steering must not be excluded')
  assert.doesNotMatch(css, /\[data-pending-steering\]/, 'the queue attribute must not select a different skin')
  assert.match(css, new RegExp(USER_BUBBLE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ' \\.Sixlwa_bubble \\{'))
  assert.equal((css.match(/data-chat-flow-kind='steering'/g) ?? []).length, 15, 'all 15 shared-user selectors include steering')
  for (const selector of ['.Sixlwa_userRow', '.Sixlwa_userStack', '.Sixlwa_bubble', '.Sixlwa_bubble a', '[data-code-wrap]', '.xzv4MW_actions', '.xzv4MW_timeStart', '.xzv4MW_action']) {
    assert.match(css, new RegExp(USER_BUBBLE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ' ' + selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), selector)
  }
  const built = read('lib/client.js')
  assert.match(built, /data-chat-flow-kind='steering'/)
  assert.doesNotMatch(built, /:not\(\[data-pending-steering\]\)/)
})

test('M33: the fixed rows are geometrically and chromatically equal', () => {
  const report = json('docs/m33.json')
  const after = report.states.plugin_after
  for (const key of ['x', 'w', 'right', 'radius', 'bg', 'fg', 'padding', 'fontSize', 'lineHeight', 'textAlign', 'whiteSpace']) {
    assert.equal(after.steering[key], after.normal[key], `plugin_after.${key}`)
  }
  assert.equal(after.steering.x, 647)
  assert.equal(after.steering.w, 476)
  assert.equal(after.steering.right, 1123)
  assert.equal(after.steering.radius, '22px')
  assert.equal(after.steering.bg, '#173E76')
  assert.deepEqual(after.differences, {
    left: 0, width: 0, right: 0, radius: 0, background: 0, foreground: 0,
    padding: 0, fontSize: 0, lineHeight: 0, textAlign: 0, whiteSpace: 0
  })
})

test('M33: the before state is the host grey 14/22 bubble', () => {
  const before = json('docs/m33.json').states.plugin_before
  assert.equal(before.steering.bg, '#2F2F2F')
  assert.equal(before.steering.fg, '#EDEDED')
  assert.equal(before.steering.radius, '20px')
  assert.equal(before.steering.fontSize, '14px')
  assert.equal(before.steering.lineHeight, '22px')
  assert.equal(before.steering.w, 477.359375)
  assert.notEqual(before.differences.radius, 0)
  assert.notEqual(before.differences.fontSize, 0)
  assert.notEqual(before.differences.background, 0)
})

test('M33: the no-plugin pair is already equal (control)', () => {
  const clean = json('docs/m33.json').states.clean_no_plugin
  for (const key of ['x', 'w', 'right', 'radius', 'bg', 'fg', 'padding', 'fontSize', 'lineHeight', 'textAlign', 'whiteSpace']) {
    assert.equal(clean.steering[key], clean.normal[key], `clean.${key}`)
  }
  assert.equal(clean.normal.bg, '#2C2C2E')
  assert.equal(clean.normal.w, 477.359375)
  assert.deepEqual(clean.differences, {
    left: 0, width: 0, right: 0, radius: 0, background: 0, foreground: 0,
    padding: 0, fontSize: 0, lineHeight: 0, textAlign: 0, whiteSpace: 0
  })
  const report = json('docs/m33.json')
  assert.equal(report.summary.total, report.assertions.length)
  assert.equal(report.summary.passed, report.assertions.length)
  assert.deepEqual(report.summary.failed, [])
  for (const entry of report.assertions) assert.equal(entry.ok, true, entry.id)
})

test('M33: the three annotated comparison crops exist', () => {
  const report = json('docs/m33.json')
  assert.equal(report.screenshots.length, 3)
  for (const shot of report.screenshots) {
    assert.ok(exists(shot.file), `${shot.file} missing`)
    const buffer = readFileSync(join(ROOT, shot.file))
    assert.equal(buffer.subarray(1, 4).toString('ascii'), 'PNG', `${shot.file} is not PNG`)
    const [width, height] = shot.size.split('x').map(Number)
    assert.equal(buffer.readUInt32BE(16), width, `${shot.file} width`)
    assert.equal(buffer.readUInt32BE(20), height, `${shot.file} height`)
  }
})
