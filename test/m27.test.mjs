/**
 * P0-15 — the streaming answer must use the same type as the settled answer.
 *
 * Two gates:
 *
 *   1. stylesheet scan — no rule may change font size/line height when the
 *      transcript is in a streaming state (data-streaming / aria-busy /
 *      is-streaming / pending), and every answer-typography selector must key
 *      on the answer's stable discriminator `data-chat-group-part='response'`
 *      instead of `:not([data-turn-process-member])` alone. The Host marks the
 *      whole live turn as a process window, so the old selector went dead while
 *      the reply streamed and came back at completion — the font jump.
 *   2. recorded live evidence — docs/m27.json's light, dark and narrow runs
 *      must show identical font-size/line-height/glyph metrics mid-stream and
 *      settled, and the same-region frames must match the recorded clip.
 *
 * Run: node test/m27.test.mjs
 */
import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import nodeTest from 'node:test'
import { loc, read, evidenceTest } from './evidence.mjs'
const test = evidenceTest(nodeTest, import.meta.url)

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const CSS_DIR = loc('lib/client/css')

const BLANK = (text) => text.replace(/[^\n]/g, ' ')
const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, BLANK)

const lineAt = (text, index) => text.slice(0, index).split('\n').length

/** Split a selector list on top-level commas. */
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

/** Remove :not(...) groups so a positive state test ignores exclusions. */
const stripNegations = (selector) => {
  let output = ''
  let index = 0
  while (index < selector.length) {
    const at = selector.indexOf(':not(', index)
    if (at < 0) {
      output += selector.slice(index)
      break
    }
    output += selector.slice(index, at)
    let depth = 1
    let cursor = at + 5
    while (cursor < selector.length && depth > 0) {
      if (selector[cursor] === '(') depth += 1
      if (selector[cursor] === ')') depth -= 1
      cursor += 1
    }
    index = cursor
  }
  return output
}

/** Every innermost `selector { declarations }` pair, with its source line. */
const rulesOf = (css, file) => {
  const text = stripComments(css)
  const rules = []
  const pattern = /([^{}]+)\{([^{}]*)\}/g
  for (const match of text.matchAll(pattern)) {
    const selector = match[1].trim().replace(/\s+/g, ' ')
    const declarations = match[2]
    if (selector === '' || selector.startsWith('@')) continue
    rules.push({ file, line: lineAt(text, match.index + match[1].indexOf(match[1].trim())), selector, declarations })
  }
  return rules
}

const TYPOGRAPHY = /(^|[;\s])(font-size|line-height|font|letter-spacing|text-size-adjust|zoom|transform)\s*:/
const ANSWER_SCOPE = "[data-chat-flow-kind='assistant-step']"
const STABLE_ANSWER = "[data-chat-group-part='response']"
const POSITIVE_STREAMING = /\[data-streaming|\.is-streaming|\[aria-busy|\[data-pending/

const allRules = readdirSync(CSS_DIR)
  .filter((name) => name.endsWith('.css'))
  .sort()
  .flatMap((name) => rulesOf(readFileSync(join(CSS_DIR, name), 'utf8'), `lib/client/css/${name}`))

test('m27: no streaming-state selector changes font size or line height', () => {
  const offenders = []
  for (const rule of allRules) {
    if (!TYPOGRAPHY.test(rule.declarations)) continue
    for (const selector of splitSelectors(rule.selector)) {
      if (POSITIVE_STREAMING.test(stripNegations(selector))) offenders.push(`${rule.file}:${rule.line} ${selector}`)
    }
  }
  assert.deepEqual(offenders, [])
})

test('m27: every answer typography rule requires the stable response discriminator', () => {
  const offenders = []
  const guarded = []
  for (const rule of allRules) {
    if (!rule.selector.includes(ANSWER_SCOPE)) continue
    const answerTypo = TYPOGRAPHY.test(rule.declarations) || /margin-top\s*:/.test(rule.declarations)
    if (!answerTypo) continue
    for (const selector of splitSelectors(rule.selector)) {
      if (!selector.includes(ANSWER_SCOPE)) continue
      if (!selector.includes(STABLE_ANSWER)) offenders.push(`${rule.file}:${rule.line} ${selector}`)
      else guarded.push(rule)
    }
  }
  assert.deepEqual(offenders, [])
  assert.ok(guarded.length >= 20, `expected the answer typography rules to be guarded, saw ${guarded.length}`)
  const source = readdirSync(CSS_DIR)
    .filter((name) => name.endsWith('.css'))
    .map((name) => readFileSync(join(CSS_DIR, name), 'utf8'))
    .join('\n')
  assert.equal((source.match(/\[data-chat-flow-kind='assistant-step'\]/g) ?? []).length, 39)
})

test('m27: no answer rule leans on zoom, scale or text-size-adjust', () => {
  const offenders = allRules
    .filter((rule) => rule.selector.includes(ANSWER_SCOPE))
    .filter((rule) => /(text-size-adjust|zoom\s*:|scale\()/.test(rule.declarations))
    .map((rule) => `${rule.file}:${rule.line}`)
  assert.deepEqual(offenders, [])
})

test('m27: the built bundle carries the guarded selector, not the streaming-only one', () => {
  const bundle = read('lib/client.js')
  const guarded = "[data-chat-flow-kind='assistant-step']:is([data-chat-group-part='response'], :not([data-turn-process-member]))"
  assert.ok(bundle.includes(guarded), 'rebuilt client must contain the guarded answer selector')
  const bare = "[data-chat-flow-kind='assistant-step']:not([data-turn-process-member])"
  assert.equal(bundle.split(guarded).length - 1, 39)
  assert.ok(!bundle.includes(bare), 'the old streaming-blind selector must be gone')
})

test('m27: the source rule line recorded in docs/m27.json is the guarded selector', () => {
  const report = JSON.parse(read('docs/m27.json'))
  const rule = report.rules.answerItem
  const lines = read(rule.file).split('\n')
  assert.equal(rule.line, lines.findIndex((text) => text.includes(rule.selector)) + 1, 'recorded line is the rule line')
  assert.ok(lines[rule.line - 1].includes(rule.selector), lines[rule.line - 1])
  const root = report.rules.answerRoot
  const rootBlock = read(root.file).split('\n').slice(root.line - 1, root.line + 4).join('\n')
  assert.ok(rootBlock.includes('font-size: var(--cgpt-msg-font-size)'), rootBlock)
  assert.ok(rootBlock.includes('line-height: var(--cgpt-msg-line-height)'), rootBlock)
})

test('m27: live evidence is typographically identical mid-stream and settled', () => {
  const report = JSON.parse(read('docs/m27.json'))
  assert.deepEqual(report.failures, [])
  assert.equal(report.states.length, 3)
  for (const state of report.states) {
    assert.equal(state.allEqual, true, state.id)
    for (const node of ['root', 'paragraph', 'listItem', 'code']) {
      assert.equal(state.mid[node].fontSize, state.done[node].fontSize, `${state.id} ${node} font-size`)
      assert.equal(state.mid[node].lineHeight, state.done[node].lineHeight, `${state.id} ${node} line-height`)
    }
    assert.equal(state.parity.glyphHeightDelta, 0, `${state.id} glyph height`)
    assert.deepEqual(state.parity.glyphOffsetDelta, { x: 0, y: 0 }, `${state.id} glyph offset`)
    assert.equal(state.parity.paragraphHeightDelta, 0, `${state.id} first paragraph height`)
    // The final reference size must stay 16/26 — the fix may not "align" by
    // shrinking the settled reply.
    assert.equal(state.mid.root.fontSize, '16px')
    assert.equal(state.mid.root.lineHeight, '26px')
    assert.equal(state.done.root.fontSize, '16px')
    assert.equal(state.done.root.lineHeight, '26px')
    assert.equal(state.mid.attrs['data-turn-process-member'], 'true')
    assert.equal(state.done.attrs['data-turn-process-member'], undefined)
  }
})

test('m27: screenshots are the recorded same-region DPR-2 crop', () => {
  const report = JSON.parse(read('docs/m27.json'))
  const clip = report.states[0].clip
  assert.deepEqual(report.screenshots.mid.clip, clip)
  assert.deepEqual(report.screenshots.done.clip, clip)
  for (const relative of ['docs/screenshots/m27-stream-mid.png', 'docs/screenshots/m27-stream-done.png']) {
    const path = loc(relative)
    assert.ok(existsSync(path), relative)
    assert.ok(statSync(path).size > 1024, relative)
    const png = readFileSync(path)
    assert.equal(png.readUInt32BE(16), clip.width * 2, `${relative} width`)
    assert.equal(png.readUInt32BE(20), clip.height * 2, `${relative} height`)
  }
})
