/**
 * M34 — P0-19b (corrected): the new-chat page-top Chat/Work segment stays; the
 * sidebar-top product switcher is gone; the two new-session paths keep their
 * defaults.
 *
 * P0-19f later changed the sidebar header to text-only (no logo icon) and made
 * 项目 mode-independent; m38 owns those checks. This gate keeps the P0-19b
 * seats/paths evidence and intentionally no longer pins the native mark.
 *
 * Run: node test/m34.test.mjs
 */
import assert from 'node:assert/strict'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (path) => readFileSync(join(ROOT, path), 'utf8')
const json = (path) => JSON.parse(read(path))
const exists = (path) => existsSync(join(ROOT, path))
const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '')

const report = json('docs/m34.json')
const modeUi = read('lib/client/mode-ui.js')
const modeCss = stripComments(read('lib/client/css/70-mode.css'))
const brand = read('lib/client/brand.js')
const mode = read('lib/client/mode.js')
const sessions = read('lib/client/sessions.js')
const built = read('lib/client.js')

test('M34: the page-top segment is the only mode switch', () => {
  assert.match(modeUi, /conversation\.header\.leading/)
  assert.match(modeUi, /id: 'chatgpt-mode-switch'/)
  assert.match(modeUi, /data-chatgpt-mode-switch': 'header'/)
  assert.match(modeUi, /if \(blank === false\) return null/, 'the segment is blank-only')
  assert.doesNotMatch(modeUi, /chatgpt-dsh-mark|ChatgptDshMark/, 'the header is not a brand-mark seat')
  assert.doesNotMatch(modeUi, /chatgpt-hero-mode|ChatgptHeroModes|chatgpt-hero-mode-switch/, 'no second switch in the hero')
  assert.doesNotMatch(modeUi, /conversation\.hero\.options/, 'the hero slot is not owned')

  assert.match(modeCss, /\.chatgpt-header-mode \{[\s\S]*?position: absolute;[\s\S]*?left: 50%;[\s\S]*?top: 26px;/)
  assert.doesNotMatch(modeCss, /chatgpt-dsh-mark|chatgpt-hero-mode/, 'the old mark/hero rules are gone')
  assert.match(
    modeCss,
    /\[class\*='_heroOptions'\] \{[\s\S]*?flex: 1 1 100%;[\s\S]*?justify-content: center;/
  )
  assert.doesNotMatch(modeCss, /order: -1/, 'the empty hero slot is not reordered')

  assert.match(built, /chatgpt-mode-switch/)
  assert.match(built, /chatgpt-header-mode/)
  assert.doesNotMatch(built, /chatgpt-dsh-mark|chatgpt-hero-mode/)
})

test('M34: the sidebar no longer mounts the product switcher', () => {
  const mount = brand.slice(brand.indexOf('function mountChatgptBrand'))
  assert.doesNotMatch(mount, /ChatgptBrandSwitcher/, 'the switcher is not mounted')
  assert.match(mount, /sidebar\.brand\.mark/, 'the mark slot is shadowed empty (P0-19f)')
})

test('M34: new-session defaults are Chat first, Work for a project', () => {
  assert.match(mode, /function chatgptDefaultPreset\(\) \{[\s\S]*?if \(stored === null\) return CHAT_PRESET_ID/)
  assert.match(mode, /if \(stored\.mode === MODE_CHAT\) return CHAT_PRESET_ID/)
  assert.match(sessions, /chatgptWorkPreset\(ctx\)/)
  assert.match(sessions, /startProjectSession/)
})

test('M34: the live report passes and all screenshots exist', () => {
  assert.equal(report.task, 'P0-19b')
  for (const assertion of report.assertions) {
    assert.equal(assertion.ok, true, `${assertion.id}: ${assertion.detail}`)
  }
  assert.deepEqual(report.errors, [])
  const names = [
    'm34-sidebar-top.png',
    'm34-existing-sidebar-top.png',
    'm34-new-chat-work.png',
    'm34-new-chat-chat.png',
    'm34-top-detail-work.png',
    'm34-top-detail-chat.png',
    'm34-first-new-chat.png',
    'm34-existing-session.png',
    'm34-project-new.png'
  ]
  for (const name of names) {
    const path = join(ROOT, 'docs/screenshots', name)
    assert.ok(existsSync(path), name)
    assert.ok(statSync(path).size > 1000, `${name} is not empty`)
  }
})

test('M34: the page-top switch is 224×36 in both states', () => {
  for (const state of [report.header.work, report.header.chat]) {
    assert.equal(state.count, 1)
    assert.equal(state.seat, 'conversation.header.leading')
    assert.equal(state.pill.w, 224)
    assert.equal(state.pill.h, 36)
    assert.equal(state.pill.cx, 786.5)
    assert.equal(state.pill.cy, 26)
    assert.equal(state.heroSwitchCount, 0)
    assert.equal(state.heroCapsuleCount, 0)
    assert.deepEqual(state.segments.map((segment) => segment.text), ['聊天', '工作'])
    assert.deepEqual(state.segments.map((segment) => segment.rect), [
      { x: 674.5, y: 8, w: 112, h: 36, cx: 730.5, cy: 26 },
      { x: 786.5, y: 8, w: 112, h: 36, cx: 842.5, cy: 26 }
    ])
  }
  const work = report.header.work
  assert.equal(work.segments.find((segment) => segment.text === '工作').pressed, 'true')
  assert.equal(work.bodyMode, 'agent')
  assert.equal(work.preset.text, '标准模式')
  assert.equal(work.preset.visible, true)
  const chat = report.header.chat
  assert.equal(chat.segments.find((segment) => segment.text === '聊天').pressed, 'true')
  assert.equal(chat.bodyMode, 'chat')
  assert.equal(chat.preset.visible, false)
  assert.equal(report.header.existing.count, 0)
  assert.deepEqual(report.header.existing.allSeats, [])
})

test('M34: both new-session paths and the remembered mode', () => {
  assert.equal(report.memory.key, 'dsh-chatgpt-ui:product-default')
  assert.equal(report.memory.firstTime.afterNewChat, null)
  assert.equal(report.memory.firstTime.resultPreset, 'Chat')
  assert.equal(report.paths.firstNewChat.preset, 'Chat')
  assert.equal(report.paths.firstNewChat.mode, 'chat')
  assert.equal(report.paths.firstNewChat.storage, null)
  assert.equal(report.paths.firstNewChat.headerSwitch, true)
  assert.equal(report.paths.firstNewChat.headerSeat, 'conversation.header.leading')
  assert.equal(report.paths.firstNewChat.heroSwitchCount, 0)
  assert.equal(report.memory.work.value, JSON.stringify({ mode: 'agent', preset: 'standard' }))
  assert.equal(report.memory.chat.value, JSON.stringify({ mode: 'chat', preset: 'chat' }))
  assert.equal(report.paths.topNewWork.preset, '标准模式')
  assert.equal(report.paths.topNewWork.mode, 'agent')
  assert.equal(report.paths.topNewChat.preset, 'Chat')
  assert.equal(report.paths.topNewChat.mode, 'chat')
  assert.equal(report.memory.afterReload.chat.resultPreset, 'Chat')
  assert.equal(report.memory.afterReload.work.resultPreset, '标准模式')
  assert.equal(report.paths.projectNew.preset, '标准模式')
  assert.equal(report.paths.projectNew.mode, 'agent')
  assert.equal(report.paths.projectNew.bound, true)
  assert.equal(report.paths.projectNew.rememberedBefore, JSON.stringify({ mode: 'chat', preset: 'chat' }))
  assert.equal(report.paths.projectNew.rememberedAfter, report.paths.projectNew.rememberedBefore)
  assert.equal(report.paths.existing.headerSwitch, false)
  assert.equal(report.paths.existing.heroSwitchCount, 0)
})
