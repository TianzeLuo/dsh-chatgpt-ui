/**
 * P0-19a — sidebar collapse control, hover peek, and the slow session spinner.
 *
 * The source gate pins the three deliverables:
 *   - search + collapse icons share one horizontal centre line; hover changes
 *     the background only, never the 36×36 box or the glyph position;
 *   - the collapsed rail can be revealed as a 120ms fixed overlay, and its
 *     展开侧栏 button writes through the host's own toggle (persisted);
 *   - the session spinner is 1.8s (was 0.9s) and project rows never spin.
 *
 * The evidence gate proves the same claims against docs/m32.json and the
 * screenshots the capture produced from the isolated instance.
 *
 * Run: node test/m32.test.mjs
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

const rail = read('lib/client/rail.js')
const sessions = read('lib/client/sessions.js')
const sidebarCss = read('lib/client/css/20-sidebar.css')
const railCss = read('lib/client/css/21-rail.css')
const sessionsCss = read('lib/client/css/25-sessions.css')
const client = read('lib/client.js')
const doc = json('docs/m32.json')

const pngSize = (name) => {
  const header = readFileSync(loc(`docs/screenshots/${name}`)).subarray(16, 24)
  return { width: header.readUInt32BE(0), height: header.readUInt32BE(4) }
}

test('P0-19a: both header icons are centred on one 36px row and hover is paint-only', () => {
  assert.match(railCss, /\.chatgpt-panel-search > span,/)
  assert.match(railCss, /\.chatgpt-peek-expand > span/)
  assert.match(railCss, /display:\s*inline-flex/)
  assert.match(railCss, /\.chatgpt-panel-search svg,/)
  assert.match(railCss, /display:\s*block/)
  // The collapse control is the search control's twin, with pinned geometry.
  assert.match(sidebarCss, /\[data-window-drag\] > button:last-of-type \{[\s\S]*?width: var\(--cgpt-rail-button-size\)/)
  assert.match(sidebarCss, /\[data-window-drag\] > button:last-of-type:hover \{[\s\S]*?width: var\(--cgpt-rail-button-size\)[\s\S]*?padding: 0;[\s\S]*?transform: none;/)
  assert.match(sidebarCss, /\[data-window-drag\] > button:last-of-type > svg \{[\s\S]*?display: block/)
  assert.match(railCss, /border-radius: var\(--cgpt-radius-row\)/)
})

test('P0-19a: peek is a transient overlay, and 展开侧栏 uses the host toggle', () => {
  assert.match(rail, /data-cgpt-sidebar-peek/)
  assert.match(rail, /addEventListener\('pointerover'/)
  assert.match(rail, /addEventListener\('focusin'/)
  assert.match(rail, /140\)/)
  assert.match(rail, /'展开侧栏'/)
  assert.match(rail, /button\[aria-label="打开侧边栏"\]/)
  assert.match(rail, /chatgptOpenSidebar\(\)/)
  assert.match(sidebarCss, /body\[data-chatgpt-ui\]\[data-cgpt-sidebar-peek\] \[data-sidebar-collapsed\] \[data-slot='sidebar'\] > div \{[\s\S]*?position: fixed !important/)
  assert.match(sidebarCss, /width: var\(--cgpt-panel-width\) !important/)
  assert.match(sidebarCss, /z-index: 5/)
  assert.match(sidebarCss, /animation: chatgpt-sidebar-peek-in 120ms/)
  assert.match(sidebarCss, /@keyframes chatgpt-sidebar-peek-in/)
  assert.match(railCss, /\.chatgpt-peek-expand/)
})

test('P0-19a: the session spinner is 1.8s and the project row never spins', () => {
  assert.match(sessionsCss, /animation: chatgpt-session-spin 1\.8s linear infinite/)
  assert.doesNotMatch(sessionsCss, /chatgpt-session-spin 0\.9s/)
  assert.match(sessionsCss, /animation-duration: 4\.8s/)
  assert.doesNotMatch(sessions, /chatgpt-project-running/)
  assert.doesNotMatch(sessions, /'data-cgpt-project-running'/)
  // A session row still owns the real Host-backed indicator.
  assert.match(sessions, /'data-cgpt-running-spinner'/)
})

test('P0-19a: the client bundle carries all three changes', () => {
  assert.match(client, /data-cgpt-sidebar-peek/)
  assert.match(client, /chatgpt-sidebar-peek-in 120ms/)
  assert.match(client, /chatgpt-session-spin 1\.8s/)
  assert.match(client, /chatgpt-peek-expand/)
})

test('P0-19a: live evidence passes every assertion', () => {
  assert.equal(doc.task, 'P0-19a')
  assert.equal(doc.summary.total, 19)
  assert.equal(doc.summary.passed, 19)
  assert.deepEqual(doc.summary.failed, [])
  for (const entry of doc.assertions) assert.equal(entry.ok, true, entry.id)
  assert.deepEqual(doc.errors, [])
})

test('P0-19a: icon centres and hover geometry are recorded', () => {
  const { alignment, hover } = doc
  assert.equal(alignment.searchIcon.cx, 268)
  assert.equal(alignment.collapseIcon.cx, 306)
  assert.equal(alignment.searchIcon.cy, 26)
  assert.equal(alignment.collapseIcon.cy, 26)
  assert.equal(alignment.iconCenterDeltaY, 0)
  assert.equal(alignment.iconCenterDeltaX, 38)
  assert.ok(alignment.iconCenterDeltaY <= 0.5)
  for (const side of ['search', 'collapse']) {
    assert.ok(alignment.iconButtonDelta[side].x <= 0.5)
    assert.ok(alignment.iconButtonDelta[side].y <= 0.5)
  }
  assert.deepEqual(hover.before.icon, hover.after.icon)
  assert.deepEqual(hover.before.button, hover.after.button)
  assert.equal(hover.iconMoved, false)
  assert.equal(hover.highlightSizeChanged, false)
  assert.equal(hover.highlightMatchesSearch, true)
  assert.equal(hover.after.background, hover.searchHover.background)
  assert.equal(hover.before.button.w, 36)
  assert.equal(hover.before.button.h, 36)
})

test('P0-19a: the peek floats, hides and becomes permanent through the host', () => {
  const { peek } = doc
  assert.equal(peek.visible, true)
  assert.equal(peek.panel.style.position, 'fixed')
  assert.equal(peek.panel.rect.x, 52)
  assert.equal(peek.panel.rect.w, 288)
  assert.equal(peek.panel.style.zIndex, '5')
  assert.equal(peek.coversContent, true)
  assert.equal(peek.mainColumnsBefore, peek.mainColumnsAfter)
  assert.equal(peek.mainColumnsBefore, '56px 1177px 0px')
  assert.deepEqual(peek.anchorBefore, peek.anchorAfter)
  assert.ok(peek.animationDurationMs <= 120)
  assert.equal(peek.panel.style.animationName, 'chatgpt-sidebar-peek-in')
  assert.equal(peek.hiddenAfterLeave, true)
  assert.equal(peek.keyboardReveal, true)
  assert.equal(peek.escapeHides, true)
  assert.equal(peek.expandedAfterClick, true)
  assert.equal(peek.afterReloadCollapsed, false)
})

test('P0-19a: spinner timing and project-row absence are recorded', () => {
  const { spinner } = doc
  assert.equal(spinner.beforeCssDuration, '0.9s')
  assert.equal(spinner.afterComputedDuration, '1.8s')
  assert.equal(spinner.animationName, 'chatgpt-session-spin')
  assert.ok(spinner.sessionRowSpinners > 0)
  assert.equal(spinner.projectRowSpinners, 0)
  assert.ok(spinner.projectRows > 0)
  assert.equal(spinner.projectRowChecked, true)
})

test('P0-19a: every screenshot exists, and the 3 peek frames are 2× 420×560', () => {
  for (const path of doc.screenshots) {
    assert.ok(exists(path), `${path} missing`)
    assert.ok(statSync(loc(path)).size > 3000, `${path} too small`)
  }
  for (const name of ['m32-peek-1-collapsed.png', 'm32-peek-2-hover.png', 'm32-peek-3-out.png', 'm32-peek-expanded.png']) {
    assert.deepEqual(pngSize(name), { width: 840, height: 1120 }, name)
  }
  assert.deepEqual(pngSize('m32-collapse-before.png'), { width: 840, height: 192 })
  assert.deepEqual(pngSize('m32-collapse-after.png'), { width: 840, height: 192 })
})
