/**
 * P0-18b — the Work permission chip moves into the card action row for both a
 * blank and a started session, the `+` → chip gap becomes two thirds of the old
 * 16px through one token, and the non-functional 插件 button leaves the bottom
 * tool bar while the plugin panel entry survives elsewhere.
 *
 * Source + live evidence (`docs/m31b.json`, `docs/screenshots/m31b-*.png`).
 * Run: node test/p018b.test.mjs
 */
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { loc, read, skipSuite } from './evidence.mjs'
skipSuite(import.meta.url)

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const composerJs = read('lib/client/composer.js')
const modeUiJs = read('lib/client/mode-ui.js')
const composerCss = read('lib/client/css/40-composer.css')
const workCss = read('lib/client/css/65-work-card.css')
const heroCss = read('lib/client/css/60-hero.css')
const tokens = read('lib/client/css/05-cgpt-tokens.css')
const clientJs = read('lib/client.js')
const doc = JSON.parse(read('docs/m31b.json'))
const images = [
  'm31b-work-empty-dark.png', 'm31b-work-empty-light.png',
  'm31b-work-existing-dark.png', 'm31b-work-existing-light.png',
  'm31b-gap-empty-dark.png', 'm31b-gap-empty-light.png',
  'm31b-gap-existing-dark.png', 'm31b-gap-existing-light.png',
  'm31b-gap-compare-dark.png', 'm31b-gap-compare-light.png',
  'm31b-tools-after-dark.png', 'm31b-tools-after-light.png',
  'm31b-permission-down-dark.png', 'm31b-permission-down-light.png',
  'm31b-permission-up-dark.png', 'm31b-permission-up-light.png',
  'm31b-project-switch-frames.png'
]

test('P0-18b: one permission seat serves both Work states in the action row', () => {
  assert.match(composerJs, /if \(preset === CHAT_PRESET_ID\) return null/)
  assert.doesNotMatch(composerJs, /props\.placement/)
  assert.doesNotMatch(composerJs, /placement:\s*'toolbar'/)
  assert.match(composerJs, /className:\s*'chatgpt-permission'/)
  assert.match(composerJs, /'data-cgpt-permission-blank': blank \? 'true' : 'false'/)
})

test('P0-18b: the tool bar keeps project + files and drops the 插件 button', () => {
  assert.match(composerJs, /'data-cgpt-work-tool': 'project'/)
  assert.match(composerJs, /'data-cgpt-work-tool': 'files'/)
  assert.doesNotMatch(composerJs, /'data-cgpt-work-tool': 'plugins'/)
  assert.doesNotMatch(workCss, /chatgpt-work-tools \.chatgpt-permission/)
  // The plugin panel entry is a separate rail seat and must remain.
  assert.match(clientJs, /chatgptOpenPluginsSettings/)
  assert.match(clientJs, /data-cgpt-rail-item/)
})

test('P0-18b: one target gap token is two thirds of the measured 16px old gap', () => {
  assert.match(tokens, /--cgpt-work-permission-gap-base:\s*16px;/)
  assert.match(tokens, /--cgpt-work-permission-gap:\s*calc\(var\(--cgpt-work-permission-gap-base\) \* 2 \/ 3\);/)
  assert.match(composerCss, /margin:\s*0 0 0 calc\(var\(--cgpt-work-permission-gap\) - var\(--cgpt-work-permission-host-gap\)\);/)
  assert.match(composerCss, /--cgpt-work-permission-host-gap:\s*8px;/)
  assert.match(composerCss, /\[data-cgpt-permission-blank='false'\]\s*\{[^}]*--cgpt-work-permission-host-gap:\s*16px;/s)
})

test('P0-18b: evidence exists and the capture passed every check', () => {
  assert.equal(doc.summary.total, doc.checks.length)
  assert.equal(doc.summary.failed.length, 0)
  assert.ok(doc.summary.passed >= 30)
  assert.equal(doc.oldGap, 16)
  assert.equal(doc.targetGap, 10.67)
})

for (const theme of ['dark', 'light']) {
  test(`P0-18b[${theme}]: permission sits inside the card in both states`, () => {
    const { empty, existing } = doc.themes[theme]
    assert.equal(empty.permissionInCard, true)
    assert.equal(existing.permissionInCard, true)
    assert.equal(empty.permissionBlank, 'true')
    assert.equal(existing.permissionBlank, 'false')
    const inside = (card, button) =>
      button.x >= card.x && button.y >= card.y &&
      button.x + button.w <= card.x + card.w &&
      button.y + button.h <= card.y + card.h
    assert.ok(inside(empty.card, empty.permission))
    assert.ok(inside(existing.card, existing.permission))
  })

  test(`P0-18b[${theme}]: both gaps are equal and two thirds of 16px`, () => {
    const { empty, existing } = doc.themes[theme]
    assert.ok(Math.abs(empty.gap - existing.gap) <= 1, `${empty.gap} vs ${existing.gap}`)
    assert.ok(Math.abs(empty.gap - doc.targetGap) <= 1, `${empty.gap} vs ${doc.targetGap}`)
    assert.ok(Math.abs(existing.gap - doc.targetGap) <= 1, `${existing.gap} vs ${doc.targetGap}`)
    const ratio = ((empty.gap + existing.gap) / 2) / doc.oldGap
    assert.ok(ratio >= 0.6 && ratio <= 0.73, String(ratio))
  })

  test(`P0-18b[${theme}]: card heights and action row stay at 127 / 36`, () => {
    const frame = doc.themes[theme]
    assert.equal(frame.empty.cardHeight, 127)
    assert.equal(frame.existing.cardHeight, 127)
    assert.equal(frame.before.emptyCardHeight, 127)
    assert.equal(frame.before.existingCardHeight, 127)
    assert.equal(frame.empty.actionRow.h, 36)
    assert.equal(frame.existing.actionRow.h, 36)
    assert.equal(frame.empty.cardPaddingBottom, '8px')
    assert.equal(frame.existing.cardPaddingBottom, '8px')
  })

  test(`P0-18b[${theme}]: only project + files remain in the bottom row`, () => {
    const frame = doc.themes[theme]
    assert.deepEqual(frame.empty.toolButtons, ['project', 'files'])
    assert.equal(frame.empty.pluginButton, false)
    assert.equal(frame.empty.toolText.includes('插件'), false)
    assert.equal(frame.deletePlugins.pluginRailEntry, true)
  })

  test(`P0-18b[${theme}]: panel stays left-aligned and keeps down/up directions`, () => {
    const down = doc.themes[theme].permissionDown
    const up = doc.themes[theme].permissionUp
    assert.ok(Math.abs(down.leftDelta) <= 1, String(down.leftDelta))
    assert.ok(Math.abs(up.leftDelta) <= 1, String(up.leftDelta))
    assert.equal(down.direction, 'below')
    assert.equal(up.direction, 'above')
    assert.equal(down.insideViewport, true)
    assert.equal(up.insideViewport, true)
    assert.ok(down.firstRowGap >= 8 && down.firstRowGap <= 10)
    assert.equal(down.headerPresent, false)
    assert.equal(down.titlePresent, false)
    assert.equal(down.learnMorePresent, false)
  })
}

test('P0-18b: every acceptance screenshot exists and is non-trivial', () => {
  for (const file of images) {
    const path = loc(`docs/screenshots/${file}`)
    assert.ok(existsSync(path), `missing ${file}`)
    const buffer = readFileSync(path)
    assert.ok(buffer.length > 4000, `${file} is too small`)
    assert.equal(buffer.subarray(1, 4).toString(), 'PNG')
  }
})


test('P0-18b: switching to the active project is a no-op and a real switch pins the card', () => {
  assert.match(composerJs, /workspaceId === currentProjectId/)
  assert.match(composerJs, /chatgptSuppressProjectSwitchAnimation/)
  assert.match(composerJs, /chatgptPinComposerRect/)
  assert.match(composerJs, /chatgptRestoreComposerFocus/)
  assert.match(composerJs, /data-chatgpt-project-pin/)
  assert.match(modeUiJs, /removeAttribute\('data-chatgpt-project-switch'\)/)
  assert.match(heroCss, /data-chatgpt-project-switch[^}]*animation:\s*none/s)
  assert.match(heroCss, /data-chatgpt-project-pin[^}]*position:\s*fixed/s)
})

test('P0-18b: project-switch evidence has 10 + 10 frames, equal rects, focus and no blank frame', () => {
  const sw = doc.projectSwitch
  assert.ok(sw, 'projectSwitch missing from docs/m31b.json')
  assert.equal(sw.before.length, 10)
  assert.equal(sw.after.length, 10)
  assert.equal(sw.rectEqual, true)
  assert.equal(sw.rectBeforeEqual, true)
  assert.equal(sw.rectAfterEqual, true)
  assert.equal(sw.blankFrames, 0)
  assert.equal(sw.focusBefore, true)
  assert.equal(sw.focusAfter, true)
  assert.equal(sw.settled.pin, false)
  assert.equal(sw.settled.position, 'relative')
  assert.notEqual(sw.labelBefore, sw.labelAfter)
  const first = JSON.stringify(sw.before[0].card)
  for (const frame of [...sw.before, ...sw.after]) {
    assert.equal(JSON.stringify(frame.card), first, `frame ${frame.index} moved`)
    assert.ok(frame.pixel.range >= 12, `frame ${frame.index} looks blank`)
  }
  assert.equal(sw.checks.every((item) => item.ok), true)
  assert.match(sw.rootCause.file, /composer\.js$/)
  assert.match(sw.fix.files.join(','), /60-hero\.css/)
  const shot = loc('docs/screenshots/m31b-project-switch-frames.png')
  assert.ok(existsSync(shot))
  assert.ok(readFileSync(shot).length > 10000)
})
