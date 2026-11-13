/**
 * P0-9 corner-shape gate.
 *
 * The Host theme ships a global squircle:
 *
 *   @supports (corner-shape:superellipse(1.5)) {
 *     :root { --dsw-corner-shape: superellipse(1.5) }
 *     *, :before, :after { corner-shape: var(--dsw-corner-shape) }
 *   }
 *
 * `corner-shape` is not `border-radius`, so a `border-radius: 50%` element with
 * the Host value paints as a squircle. The skin re-points the Host knob once at
 * `body[data-chatgpt-ui]`; the custom property inherits, so the whole subtree
 * computes `round`. This test fails when:
 *
 *   - the root override disappears, moves, or is set to anything but `round`,
 *   - a `border-radius: 50%` / `9999px` rule lives outside the skin root and has
 *     no local `corner-shape: round` (an uncovered circle),
 *   - the built client bundle does not carry the override,
 *   - the committed DOM evidence (docs/m20.json) shows a circle that is not
 *     round, a non-circular surface that is not a standard arc, or a skin-off
 *     control that leaks the override into the Host outline.
 *
 * Chromium reports `round` as `superellipse(1)`; both spellings are accepted
 * everywhere and the evidence records the computed string verbatim.
 */

import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { loc, skipSuite } from './evidence.mjs'
skipSuite(import.meta.url)

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const CSS_DIR = loc('lib/client/css')
const EVIDENCE = loc('docs/m20.json')
const ROUND_VALUES = ['round', 'superellipse(1)']

const stripComments = (text) => text.replace(/\/\*[\s\S]*?\*\//g, '')
const roundRules = (css) => [...stripComments(css).matchAll(/([^{}]+)\{([^{}]*)\}/g)]
  .map((match) => ({ selector: match[1].trim().replace(/\s+/g, ' '), body: match[2] }))
  .filter((rule) => !rule.selector.startsWith('@'))
const declarations = (body, property) => [...body.matchAll(new RegExp(`(?:^|;)\\s*${property}\\s*:\\s*([^;]+)`, 'g'))].map((match) => match[1].trim())
/** Split a selector list on top-level commas only (`:is(a, b)` stays whole). */
const splitSelectors = (selector) => {
  const parts = []
  let depth = 0
  let quote = ''
  let current = ''
  for (const character of selector) {
    if (quote !== '') {
      current += character
      if (character === quote) quote = ''
      continue
    }
    if (character === '"' || character === "'") {
      quote = character
      current += character
      continue
    }
    if (character === '(' || character === '[') depth += 1
    if (character === ')' || character === ']') depth = Math.max(0, depth - 1)
    if (character === ',' && depth === 0) {
      parts.push(current.trim())
      current = ''
      continue
    }
    current += character
  }
  if (current.trim() !== '') parts.push(current.trim())
  return parts
}

const cssFiles = readdirSync(CSS_DIR).filter((file) => file.endsWith('.css')).sort()
const cssText = Object.fromEntries(cssFiles.map((file) => [file, readFileSync(join(CSS_DIR, file), 'utf8')]))

const rootOverrides = []
for (const file of cssFiles) {
  for (const rule of roundRules(cssText[file])) {
    const values = declarations(rule.body, '--dsw-corner-shape')
    for (const value of values) rootOverrides.push({ file, selector: rule.selector, value })
  }
}

test('the skin root re-points the Host corner-shape knob exactly once', () => {
  assert.equal(rootOverrides.length, 1, `expected one --dsw-corner-shape declaration, found: ${JSON.stringify(rootOverrides)}`)
  const [override] = rootOverrides
  assert.equal(override.file, '00-tokens.css', 'the override belongs in the first, base slice')
  assert.equal(override.value, 'round', 'the root override must be round, not a superellipse')
  const selectors = splitSelectors(override.selector)
  assert.ok(selectors.length >= 1)
  for (const selector of selectors) {
    assert.match(selector, /^body\[data-chatgpt-ui\]$/, `the override must sit on the skin root, got: ${selector}`)
  }
})

test('every full-round radius rule is inside the root scope', () => {
  const offenders = []
  let fullRoundRules = 0
  for (const file of cssFiles) {
    for (const rule of roundRules(cssText[file])) {
      const fullRound = declarations(rule.body, 'border-radius').some((value) => /^(?:50%|9999px|999px)$/.test(value))
      if (!fullRound) continue
      fullRoundRules += 1
      const local = declarations(rule.body, 'corner-shape').some((value) => ROUND_VALUES.includes(value))
      for (const selector of splitSelectors(rule.selector)) {
        if (local) continue
        if (selector.startsWith('body[data-chatgpt-ui]')) continue
        if (selector.startsWith('[data-cgpt-root]')) {
          offenders.push(`${file}: ${selector} (a detached root outside body needs its own corner-shape: round)`)
          continue
        }
        offenders.push(`${file}: ${selector} (not under the skin root)`)
      }
    }
  }
  assert.ok(fullRoundRules >= 10, `expected the skin's circle/pill rules to be scanned, found ${fullRoundRules}`)
  assert.deepEqual(offenders, [], `uncovered round radius rules:\n${offenders.join('\n')}`)
})

test('the skin never asks for a superellipse', () => {
  const offenders = []
  for (const file of cssFiles) {
    const css = stripComments(cssText[file])
    for (const match of css.matchAll(/corner-shape\s*:\s*superellipse\([^)]*\)/g)) {
      offenders.push(`${file}:${css.slice(0, match.index).split('\n').length}`)
    }
  }
  assert.deepEqual(offenders, [], `superellipse resets found: ${offenders.join(', ')}`)
})

test('the built bundle carries the root override', () => {
  const bundle = readFileSync(loc('lib/client.js'), 'utf8')
  const matches = bundle.match(/--dsw-corner-shape:\s*round/g) ?? []
  assert.equal(matches.length, 1, 'the bundle must carry exactly one root override')
  assert.ok(bundle.includes('body[data-chatgpt-ui]'), 'the bundle must keep the skin root selector')
})

test('the DOM snapshot carries the root attribute and the evidence proves the computed value', () => {
  const snapshot = readFileSync(loc('test/fixtures/dom-snapshot.html'), 'utf8')
  assert.match(snapshot, /<body[^>]*data-chatgpt-ui=/, 'the snapshot body must carry data-chatgpt-ui; otherwise no rule in css/ applies to it')
  assert.ok(existsSync(EVIDENCE), 'docs/m20.json is required: run node scripts/m20-corners.mjs --url <instance>')
  const evidence = JSON.parse(readFileSync(EVIDENCE, 'utf8'))
  assert.equal(evidence.task, 'P0-9')
  assert.deepEqual(evidence.assertionSummary.failed, [], `capture assertions failed: ${evidence.assertionSummary.failed.join(', ')}`)
  for (const theme of ['dark', 'light']) {
    const state = evidence.themes[theme]?.state
    assert.ok(state !== undefined, `missing ${theme} evidence`)
    assert.equal(state.base.root.variable, 'round', `${theme}: the root must declare --dsw-corner-shape: round`)
    assert.ok(ROUND_VALUES.includes(state.base.root.cornerShape), `${theme}: root computes ${state.base.root.cornerShape}`)
    assert.equal(state.base.root.styleRuleCount, 1, `${theme}: expected exactly one root rule in the document`)
  }
})

test('the DOM evidence has every should-be-circle computed round and square', () => {
  const evidence = JSON.parse(readFileSync(EVIDENCE, 'utf8'))
  for (const theme of ['dark', 'light']) {
    const state = evidence.themes[theme].state
    const circles = {
      send: state.base.send,
      avatar: state.base.avatar,
      thumb: state.panel.effort.thumb,
      reset: state.panel.effort.reset,
      switchThumb: state.settings.settings.switchThumb
    }
    for (const [id, element] of Object.entries(circles)) {
      assert.ok(element !== null, `${theme}: ${id} missing from the DOM evidence`)
      assert.ok(
        ROUND_VALUES.includes(element.style.cornerShape),
        `${theme}: ${id} computes ${element.style.cornerShape}, expected round`
      )
      assert.ok(
        Math.abs(element.rect.w - element.rect.h) <= 1,
        `${theme}: ${id} is ${element.rect.w}×${element.rect.h}, not square`
      )
    }
    assert.equal(state.panel.effort.ticks.length, 4, `${theme}: expected four effort ticks`)
    for (const tick of state.panel.effort.ticks) {
      assert.equal(tick.rect.w, 4)
      assert.equal(tick.rect.h, 4)
      assert.ok(ROUND_VALUES.includes(tick.style.cornerShape), `${theme}: tick computes ${tick.style.cornerShape}`)
    }
    for (const circle of [...state.base.circles, ...state.panel.circles]) {
      assert.ok(ROUND_VALUES.includes(circle.style.cornerShape), `${theme}: ${circle.className} computes ${circle.style.cornerShape}`)
      assert.ok(circle.square, `${theme}: ${circle.className} is not square`)
    }
  }
})

test('the DOM evidence has every non-circular corner as a standard arc', () => {
  const evidence = JSON.parse(readFileSync(EVIDENCE, 'utf8'))
  for (const theme of ['dark', 'light']) {
    const state = evidence.themes[theme].state
    const surfaces = {
      'composer card 28': state.base.composerCard,
      'sidebar 16': state.base.sidebar,
      'effort panel 20': state.panel.effort.menu,
      'work menu 16': state.workMenu.workMenu,
      'search 16': state.search.search,
      'chat card 26': state.chat.composerCard,
      'settings dialog 28': state.settings.settings.dialog
    }
    for (const [id, element] of Object.entries(surfaces)) {
      assert.ok(element !== null, `${theme}: ${id} missing`)
      assert.ok(ROUND_VALUES.includes(element.style.cornerShape), `${theme}: ${id} computes ${element.style.cornerShape}`)
    }
    assert.equal(state.base.composerCard.style.borderTopLeftRadius, '28px')
    assert.equal(state.base.sidebar.style.borderTopLeftRadius, '16px')
    assert.equal(state.panel.effort.menu.style.borderTopLeftRadius, '20px')
    assert.equal(state.workMenu.workMenu.style.borderTopLeftRadius, '16px')
    assert.equal(state.search.search.style.borderTopLeftRadius, '16px')
    assert.equal(state.chat.composerCard.style.borderTopLeftRadius, '26px')
  }
})

test('skin=off keeps the Host outline untouched', () => {
  const evidence = JSON.parse(readFileSync(EVIDENCE, 'utf8'))
  assert.equal(evidence.skinOff.bodyAttribute, null, 'the skin must not mount its document mark when switched off')
  assert.equal(evidence.skinOff.rootVariable, 'superellipse(1.5)')
  assert.equal(evidence.skinOff.rootCornerShape, 'superellipse(1.5)')
  assert.equal(evidence.skinOff.composerCard.cornerShape, 'superellipse(1.5)')
})

test('the 4× acceptance frames exist in both themes', () => {
  const shots = loc('docs/screenshots')
  for (const theme of ['dark', 'light']) {
    for (const kind of ['send', 'dots', 'avatar', 'thumb']) {
      const path = join(shots, `m20-corners-${theme}-${kind}-4x.png`)
      assert.ok(existsSync(path), `missing ${path}`)
      assert.ok(statSync(path).size > 1000, `screenshot looks empty: ${path}`)
    }
  }
})
