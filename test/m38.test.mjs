/**
 * M38 — P0-19f: the sidebar header is text-only (no logo icon) and the 项目
 * section is visible and identical in Chat and Work.
 *
 * The source gate pins the empty mark entry, the zero-gap wordmark, and the
 * mode-independent project render. The evidence gate reads the live report:
 * the 52px line, the 16px text inset, unchanged search/collapse coordinates,
 * and equal project heights/rows in both modes.
 *
 * Run: node test/m38.test.mjs
 */
import assert from 'node:assert/strict'
import { existsSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { loc, read, skipSuite } from './evidence.mjs'
skipSuite(import.meta.url)

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const json = (path) => JSON.parse(read(path))
const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '')

const report = json('docs/m38.json')
const brand = read('lib/client/brand.js')
const sidebarCss = stripComments(read('lib/client/css/20-sidebar.css'))
const sessions = read('lib/client/sessions.js')
const built = read('lib/client.js')
const mount = brand.slice(brand.indexOf('function mountChatgptBrand'))

test('M38: the sidebar mark is empty while the Host wordmark stays', () => {
  assert.doesNotMatch(mount, /ChatgptBrandSwitcher/, 'the retired switcher is not mounted')
  assert.match(mount, /sidebar\.brand\.mark/)
  assert.match(mount, /ctx\.slots\.register\([\s\S]*?\(\) => null/, 'the mark renders nothing')
  assert.match(mount, /mode === 'hidden'/, 'brand: hidden still shadows the name')

  const mark = sidebarCss.match(/\[class\*='_brandMark'\]\s*\{[\s\S]*?\}/)
  assert.ok(mark !== null, 'the Host mark wrapper is styled')
  assert.match(mark[0], /display:\s*none\s*!important/)
  assert.match(mark[0], /width:\s*0\s*!important/)
  const identity = sidebarCss.match(/\[class\*='_brandIdentity'\]\s*\{[\s\S]*?\}/)
  assert.ok(identity !== null, 'the brand identity is styled')
  assert.match(identity[0], /gap:\s*0/)
})

test('M38: 项目 renders without a product gate', () => {
  assert.doesNotMatch(sessions, /showProjects/, 'the Chat-only gate is gone')
  assert.doesNotMatch(sessions, /excludeFromProjects:/, 'Chat rows are grouped like Work')
  assert.match(sessions, /className: 'chatgpt-projects-section'/)
  assert.match(sessions, /rows\(page\.recent, false, true\)/)
  // Order, pin and fold are still the P0-19c/session machinery.
  assert.match(sessions, /chatgptSortProjectsByPin/)
  assert.match(sessions, /chatgptReadProjectsVisible/)
  assert.match(built, /chatgpt-projects-section/)
  assert.match(built, /sidebar\.brand\.mark/)
})

test('M38: the header has no logo node, 16px text inset, same 52px line', () => {
  const header = report.header.work
  assert.equal(header.mark.slotSvgCount, 0)
  assert.equal(header.mark.slotImgCount, 0)
  assert.equal(header.mark.slotChildren, 0)
  assert.equal(header.mark.wrapperDisplay, 'none')
  assert.deepEqual(header.wordmark.svg, { x: 68, y: 14, w: 156, h: 24, cx: 146, cy: 26 })
  assert.equal(header.textInset, 16)
  assert.equal(header.header.h, 52)
  assert.equal(header.header.cy, 26)
  assert.ok(Math.abs(header.ink.cy - 26) <= 1, `ink centre is ${header.ink.cy}`)
  assert.deepEqual(report.header.textBaseline, {
    top: 17.52,
    bottom: 35.64,
    center: 26.58,
    headerCenter: 26,
    delta: 0.58
  })
  assert.equal(report.header.chat.mark.slotSvgCount, 0)
})

test('M38: search/collapse keep their pre-change coordinates', () => {
  const before = report.baseline
  for (const mode of ['work', 'chat']) {
    const header = report.header[mode]
    assert.deepEqual(header.search, before.search)
    assert.deepEqual(header.collapse, before.collapse)
    assert.equal(header.search.cy, 26)
    assert.equal(header.collapse.cy, 26)
    assert.equal(header.header.h, 52)
  }
})

test('M38: 项目 is visible and identical in Chat and Work', () => {
  const work = report.projects.work
  const chat = report.projects.chat
  for (const state of [work, chat]) {
    assert.equal(state.present, true)
    assert.ok(state.count > 0)
    assert.ok(state.height > 0)
    assert.ok(state.sectionRows.length > 0)
    assert.equal(state.heading.expanded, 'true')
  }
  assert.ok(Math.abs(work.height - chat.height) <= 0.5, `${work.height} vs ${chat.height}`)
  assert.equal(report.projects.heightDelta, 0)
  assert.equal(report.projects.sameProjects, true)
  assert.equal(report.projects.nodeKept, true)
  assert.equal(chat.marker, 'kept')
  assert.equal(report.projects.workAgain.marker, 'kept')
  assert.deepEqual(
    work.projects.map((project) => ({ id: project.id, title: project.title, rows: project.rows })),
    chat.projects.map((project) => ({ id: project.id, title: project.title, rows: project.rows }))
  )
  assert.equal(work.heading.expanded, chat.heading.expanded)
  assert.equal(work.storageVisible, chat.storageVisible)
  assert.equal(work.storageExpansion, chat.storageExpansion)
})

test('M38: every live assertion and screenshot is present', () => {
  assert.equal(report.task, 'P0-19f')
  for (const assertion of report.assertions) {
    assert.equal(assertion.ok, true, `${assertion.id}: ${assertion.detail}`)
  }
  assert.deepEqual(report.errors, [])
  for (const name of [
    'm38-header.png',
    'm38-sidebar-chat.png',
    'm38-sidebar-work.png',
    'm38-sidebar-compare.png',
    'm38-top-switch-chat.png',
    'm38-top-switch-work.png'
  ]) {
    const path = loc(`docs/screenshots/${name}`)
    assert.ok(existsSync(path), name)
    assert.ok(statSync(path).size > 1000, `${name} is not empty`)
  }
})
