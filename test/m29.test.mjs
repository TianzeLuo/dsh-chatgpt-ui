/**
 * P0-17 — Chat composer: editability, hidden workspace/context controls, + disc
 * geometry and the two measured widths.
 *
 * The live evidence in docs/m29.json is the source of truth; this file also
 * gates the source rules that the evidence depends on, so a CSS/source edit
 * cannot quietly pass on an old capture.
 *
 * Run: node test/m29.test.mjs
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import nodeTest from 'node:test'
import { loc, read, exists, evidenceTest } from './evidence.mjs'
const test = evidenceTest(nodeTest, import.meta.url)

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const json = (path) => JSON.parse(read(path))

const BLANK = (text) => text.replace(/[^\n]/g, ' ')
const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, BLANK)
const blocks = (css) => {
  const out = []
  const pattern = /([^{}]+)\{([^{}]*)\}/g
  let match
  while ((match = pattern.exec(css)) !== null) out.push({ selector: match[1].trim(), body: match[2] })
  return out
}

const tokens = stripComments(read('lib/client/css/05-cgpt-tokens.css'))
const composerCss = stripComments(read('lib/client/css/40-composer.css'))
const heroCss = stripComments(read('lib/client/css/60-hero.css'))
const modeCss = stripComments(read('lib/client/css/70-mode.css'))
const projectCss = stripComments(read('lib/client/css/35-project.css'))
const allCss = [tokens, composerCss, heroCss, modeCss, projectCss].join('\n')
const modeJs = read('lib/client/mode.js')
const sessionsJs = read('lib/client/sessions.js')
const composerJs = read('lib/client/composer.js')
const sessionsCore = read('lib/shared/sessions-core.mjs')
const bundle = read('lib/client.js')

test('P0-17: the empty card uses the 2x desktop reference, 757 CSS px', () => {
  assert.match(tokens, /--cgpt-empty-composer-w:\s*757px;/)
  const reference = json('docs/m29.json').reference
  assert.equal(reference.css.w, 757)
  assert.equal(reference.device.w / reference.scale, 1233.5)
  for (const block of blocks(allCss)) {
    if (block.body.includes('--cgpt-empty-composer-w:')) continue
    assert.doesNotMatch(block.body, /(^|[^-\w])757px/, `bare 757px in ${block.selector}`)
  }
  // 757/1233.5 = 0.6137: inside the brief's ±0.5%.
  assert.ok(Math.abs(757 - reference.css.w) / reference.css.w <= 0.005)
})

test('P0-17: a started Chat card is the message column minus 60px', () => {
  assert.match(tokens, /--cgpt-chat-card-inset:\s*60px;/)
  assert.match(tokens, /--cgpt-chat-card-height:\s*52px;/)
  const rule = blocks(composerCss).find((block) =>
    block.body.includes('max-width: calc(var(--dsh-chat-content-width, var(--cgpt-msg-max)) - var(--cgpt-chat-card-inset))')
  )
  assert.ok(rule, 'existing Chat card max-width rule is absent')
  assert.match(rule.selector, /_composerStack/)
  assert.match(rule.selector, /:not\(\[class\*='_composerHero'\]\)/)
  assert.match(rule.body, /border-radius:\s*9999px/)
  // P0-21: content growth owns the height; the 52px reference is the minimum.
  assert.match(rule.body, /height:\s*auto/)
  assert.match(rule.body, /min-height:\s*var\(--cgpt-chat-card-height\)/)
  // The Host column tokens are read, never redefined.
  assert.doesNotMatch(composerCss, /--dsh-chat-content-width\s*:/)
  const evidence = json('docs/m29.json')
  for (const theme of ['light', 'dark']) {
    const frame = evidence.themes[theme].existing
    assert.equal(frame.card.w, frame.columnWidth - 60)
    assert.equal((frame.columnWidth - frame.card.w) / 2, 30)
    assert.equal(frame.card.h, 52)
    assert.equal(frame.cardStyle.radius, '9999px')
  }
})

test('P0-17: the + icon is a 20px block centred in a 34–36px hover disc', () => {
  assert.match(projectCss, /\.chatgpt-chat-files svg\s*\{\s*display:\s*block;/)
  const evidence = json('docs/m29.json')
  for (const theme of ['light', 'dark']) {
    for (const state of ['empty', 'existing']) {
      const plus = evidence.themes[theme][state].plus
      assert.equal(plus.svgSize.w, 20)
      assert.equal(plus.svgSize.h, 20)
      assert.ok(Math.abs(plus.centerDelta.x) <= 0.5 && Math.abs(plus.centerDelta.y) <= 0.5)
    }
    assert.ok(evidence.themes[theme].hover.diameter >= 32 && evidence.themes[theme].hover.diameter <= 36)
    assert.ok(Math.abs(evidence.themes[theme].hover.centerDelta.x) <= 0.5)
    assert.ok(Math.abs(evidence.themes[theme].hover.centerDelta.y) <= 0.5)
  }
})

test('P0-17: Chat hides the Host workspace/context affordances', () => {
  // The hero workspace chip is above the card; the access-mode chip sits inside
  // the Host tool row. Neither paints in Chat.
  assert.match(modeCss, /\[class\*='_heroWorkspaceRow'\]\s*>\s*button\[class\*='_workspace'\]/)
  assert.match(modeCss, /\[data-slot='conversation\.input\.permission'\]/)
  assert.match(composerCss, /\[data-slot='conversation\.input\.right'\]\s*>\s*:not\(\[data-cgpt-model-pill\]\)/)
  assert.match(composerCss, /\[data-slot='conversation\.input\.model'\]\s*>\s*:not\(\[data-cgpt-model-pill\]\)/)
  assert.match(modeCss, /\.chatgpt-readonly\s*\{\s*display:\s*none;/)
  const evidence = json('docs/m29.json')
  for (const theme of ['light', 'dark']) {
    for (const state of ['empty', 'existing']) {
      const frame = evidence.themes[theme][state]
      assert.equal(frame.contextOrWorkspaceInCard, 0)
      const forbidden = frame.hiddenControls.filter((entry) => !entry.name.startsWith('hero workspace chip'))
      assert.ok(forbidden.every((entry) => entry.visibleCount === 0), JSON.stringify(forbidden))
    }
    // The Host chip above the card stays in React's tree, but is not painted.
    assert.equal(evidence.themes[theme].empty.hiddenControls.find((entry) => entry.name.startsWith('hero workspace chip')).visibleCount, 0)
  }
})

test('P0-17: a fresh Chat Session owns a Workspace so the editor mounts', () => {
  assert.match(modeJs, /function chatgptChatWorkspace\(ctx\)/)
  assert.match(modeJs, /request\.workspaceId = chatWorkspace\.workspaceId/)
  // P1-e wraps the Host call in the timeout helper; the workspace must still
  // be the request that creates the Chat session.
  assert.match(modeJs, /id = await [^\n]*sessions\.create\(request\)/)
  // P0-19f retired the Chat-only project exclusion: the 项目 section and its
  // membership are now mode-independent, so switching Chat/Work does not reflow.
  assert.match(sessionsCore, /excludeFromProjects/)
  assert.doesNotMatch(sessionsJs, /excludeFromProjects:/)
  assert.match(sessionsJs, /className: 'chatgpt-projects-section'/)
  // Legacy ungrouped blank Sessions: a click on the Host trigger starts an
  // editable Chat instead of opening the workspace picker.
  assert.match(composerJs, /function chatgptMountChatWorkspaceGuard\(ctx\)/)
  assert.match(composerJs, /chatgptStartProductSession\(ctx, \{ agentPreset: CHAT_PRESET_ID \}\)/)
  for (const needle of ['chatgptChatWorkspace', 'chatgptBuildSessionSections', 'chatgptMountChatWorkspaceGuard', '--cgpt-chat-card-inset']) {
    assert.ok(bundle.includes(needle), `bundle misses ${needle}`)
  }
})

test('P0-17: click and focus evidence is the textbox, with the caret marker', () => {
  const evidence = json('docs/m29.json')
  for (const theme of ['light', 'dark']) {
    const frame = evidence.themes[theme]
    assert.equal(frame.focus.isComposer, true)
    assert.equal(frame.focus.selectionType, 'Caret')
    assert.equal(frame.focus.hit.insideComposer, true)
    assert.equal(frame.focus.hit.contenteditable, 'true')
    assert.equal(frame.clickExisting.isComposer, true)
    assert.equal(frame.focus.nativeCaretPainted, false)
    assert.equal(frame.focus.caretMarker.synthetic, true)
    assert.equal(frame.focus.caretMarker.rect.w, 2)
    assert.ok(frame.focus.caretMarker.rect.h >= 18)
  }
  assert.equal(evidence.clickDiagnosis.nowHit.light.insideComposer, true)
  assert.equal(evidence.clickDiagnosis.nowHit.dark.insideComposer, true)
})

test('P0-17: the live assertions all pass and every frame exists', () => {
  const evidence = json('docs/m29.json')
  assert.equal(evidence.summary.total, 36)
  assert.equal(evidence.summary.passed, 36)
  assert.deepEqual(evidence.summary.failed, [])
  for (const entry of evidence.assertions) assert.equal(entry.ok, true, entry.id)
  assert.equal(evidence.themes.light.empty.placeholder.after, evidence.themes.light.existing.placeholder.after)
  assert.equal(evidence.themes.dark.empty.placeholder.after, evidence.themes.dark.existing.placeholder.after)
  assert.match(evidence.themes.light.existing.placeholder.after, /随便问点什么/)
  assert.match(evidence.themes.dark.existing.placeholder.after, /随便问点什么/)
  assert.equal(evidence.themes.light.existing.cardStyle.background, 'rgb(255, 255, 255)')
  assert.equal(evidence.themes.dark.existing.cardStyle.background, 'rgb(33, 33, 33)')
  // The desktop reference does not scale with the window: 757 stays 757 while
  // the old 61vw became 976 at 1600. The started card always tracks column−60.
  assert.equal(evidence.responsive.length, 4)
  for (const frame of evidence.responsive) {
    assert.ok(Math.abs(frame.empty.w - 757) / 757 <= 0.005, `${frame.width}: empty ${frame.empty.w}`)
    assert.ok(Math.abs(frame.existing.w - (frame.existing.column - 60)) <= 1, `${frame.width}: ${frame.existing.w} vs ${frame.existing.column}`)
  }
  for (const name of evidence.screenshots) {
    const path = `docs/screenshots/${name}`
    assert.ok(exists(path), `missing ${path}`)
    const header = readFileSync(loc(path)).subarray(16, 24)
    const w = header.readUInt32BE(0)
    const h = header.readUInt32BE(4)
    if (name.includes('plus-hover')) assert.ok(w === 224 && h === 224, `${name} is ${w}x${h}, expected 4x 224`)
    else assert.ok(w === 2466 && h === 1700, `${name} is ${w}x${h}`)
  }
})
