/**
 * P0-19d — the collapse toggle must not change geometry after the host tooltip
 * appears at ~500ms.
 *
 * Root cause (implemented, measured in docs/m36.json): the host appends its
 * tooltip <span role="tooltip"> as the LAST CHILD of the header logo row. The
 * old `> button:last-child` selector stopped matching at that instant, all
 * pinned 36×36 rules dropped, and the toggle fell back to the host 28×28 box
 * (button x 288→296, icon x 306→310, highlight 36→28). The fix is
 * `> button:last-of-type` — the tooltip is a span, so the toggle is still the
 * last button.
 *
 * Run: node test/m36.test.mjs
 */
import assert from 'node:assert/strict'
import { readFileSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { loc, read, exists, skipSuite } from './evidence.mjs'
skipSuite(import.meta.url)

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const json = (path) => JSON.parse(read(path))
const pngSize = (name) => {
  const header = readFileSync(loc(`docs/screenshots/${name}`)).subarray(16, 24)
  return { width: header.readUInt32BE(0), height: header.readUInt32BE(4) }
}

const sidebarCss = read('lib/client/css/20-sidebar.css')
const rail = read('lib/client/rail.js')
const client = read('lib/client.js')
const doc = json('docs/m36.json')

test('P0-19d: the toggle selector survives the host tooltip span', () => {
  assert.match(sidebarCss, /> button:last-of-type \{[\s\S]*?width: var\(--cgpt-rail-button-size\)/)
  assert.match(sidebarCss, /> button:last-of-type:hover \{/)
  assert.match(sidebarCss, /> button:last-of-type > svg \{/)
  assert.match(sidebarCss, /\[data-cgpt-sidebar-peek\][\s\S]*?> button:last-of-type \{/)
  // No CSS rule may still depend on the toggle being the literal last child.
  assert.doesNotMatch(sidebarCss, /> button:last-child \{/)
  assert.doesNotMatch(sidebarCss, /> button:last-child:hover/)
  assert.match(sidebarCss, /LAST CHILD/)
  assert.match(sidebarCss, /500ms/)
  // The JS fallback clicks the same robust selector.
  assert.match(rail, /\[data-window-drag\] > button:last-of-type/)
  assert.doesNotMatch(rail, /\[data-window-drag\] > button:last-child'/)
  assert.match(client, /> button:last-of-type/)
})

test('P0-19d: four hover frames keep the icon x and hover size constant', () => {
  assert.equal(doc.task, 'P0-19d')
  assert.equal(doc.frames.length, 4)
  assert.deepEqual(doc.frames.map((frame) => frame.label), ['0ms', '200ms', '700ms', '1500ms'])
  for (const frame of doc.frames) {
    assert.equal(frame.collapse.icon.cx, 306)
    assert.equal(frame.collapse.icon.cy, 26)
    assert.equal(frame.collapse.rect.x, 288)
    assert.equal(frame.collapse.rect.y, 8)
    assert.equal(frame.collapse.rect.w, 36)
    assert.equal(frame.collapse.rect.h, 36)
    assert.equal(frame.peek, false)
    assert.equal(frame.lastOfTypeMatches, 1)
    assert.equal(frame.search.icon.cy, 26)
  }
  assert.equal(doc.constant.icon, true)
  assert.equal(doc.constant.hoverBox, true)
  assert.deepEqual(doc.frames.map((frame) => frame.oldSelectorMatches), [1, 1, 0, 0])
  assert.deepEqual(doc.frames.map((frame) => frame.headerChildren.join(',')), ['BUTTON,BUTTON', 'BUTTON,BUTTON', 'BUTTON,BUTTON,SPAN', 'BUTTON,BUTTON,SPAN'])
  assert.equal(doc.frames[0].tooltip, null)
  assert.equal(doc.frames[1].tooltip, null)
  assert.equal(doc.frames[2].tooltip.text, '收起侧边栏')
  assert.equal(doc.frames[3].tooltip.text, '收起侧边栏')
})

test('P0-19d: runtime proof names the real cause, not the peek', () => {
  assert.equal(doc.rootCause.confirmed, true)
  assert.equal(doc.rootCause.isPeek, false)
  assert.equal(doc.rootCause.file, 'lib/client/css/20-sidebar.css')
  assert.equal(doc.rootCause.line, 54)
  assert.match(doc.rootCause.runtimeProof, /oldSelectorMatches=0/)
  assert.match(doc.rootCause.fix, /last-of-type/)
  assert.equal(doc.beforeFix.button.w, 28)
  assert.equal(doc.beforeFix.button.h, 28)
  assert.equal(doc.beforeFix.icon.cx, 310)
  assert.equal(doc.beforeFix.highlight.w, 28)
})

test('P0-19d: hovering a rail button still opens the temporary peek', () => {
  assert.equal(doc.peek.visible, true)
  assert.equal(doc.peek.panel.w, 288)
  assert.equal(doc.peek.panelZ, '5')
  assert.equal(doc.peek.expandVisible, true)
  assert.equal(doc.peek.columnsBefore, '56px 1177px 0px')
  assert.equal(doc.peek.columnsAfter, '56px 1177px 0px')
  assert.equal(doc.peek.hiddenAfterLeave, true)
})

test('P0-19d: every assertion and screenshot is present', () => {
  assert.equal(doc.summary.total, 10)
  assert.equal(doc.summary.passed, 10)
  assert.deepEqual(doc.summary.failed, [])
  for (const entry of doc.assertions) assert.equal(entry.ok, true, entry.id)
  assert.deepEqual(doc.errors, [])
  for (const path of doc.screenshots) {
    assert.ok(exists(path), `${path} missing`)
    assert.ok(statSync(loc(path)).size > 5000, `${path} too small`)
  }
  for (const name of ['m36-hover-0ms.png', 'm36-hover-200ms.png', 'm36-hover-700ms.png', 'm36-hover-1500ms.png']) {
    assert.deepEqual(pngSize(name), { width: 484, height: 302 }, name)
  }
})
