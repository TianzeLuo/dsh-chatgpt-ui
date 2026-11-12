/**
 * M30 — one Chat placeholder for the blank hero and a started Session.
 *
 * The source gate proves there is exactly one text definition and one consumer;
 * the evidence gate proves the two live states render the same string with the
 * same size, colour and card-relative left edge, and that both same-scale crops
 * exist.
 *
 * Run: node test/m30.test.mjs
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
const BLANK = (text) => text.replace(/[^\n]/g, ' ')
const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, BLANK)

const CSS_FILES = [
  '00-tokens.css',
  '20-sidebar.css',
  '35-project.css',
  '40-composer.css',
  '60-hero.css',
  '65-work-card.css',
  '70-mode.css'
]
const allCss = CSS_FILES.map((file) => stripComments(read(`lib/client/css/${file}`))).join('\n')

test('M30: the Chat placeholder has one token and one consumer', () => {
  const tokens = stripComments(read('lib/client/css/00-tokens.css'))
  assert.equal((tokens.match(/--dsh-chatgpt-placeholder-chat\s*:/g) ?? []).length, 1)
  assert.match(tokens, /--dsh-chatgpt-placeholder-chat:\s*'随便问点什么';/)
  assert.doesNotMatch(allCss, /--dsh-chatgpt-placeholder-chat-(?:zh|established)/)
  const consumers = [...allCss.matchAll(/content:\s*var\(--dsh-chatgpt-placeholder-chat\)/g)]
  assert.equal(consumers.length, 1, `expected one consumer, got ${consumers.length}`)
  // The old per-state copies are gone from the stylesheet.
  assert.doesNotMatch(allCss, /询问 ChatGPT/)
  assert.doesNotMatch(allCss, /输入消息，开始对话/)
  assert.doesNotMatch(read('lib/client.js'), /询问 ChatGPT/)
})

test('M30: empty and started placeholders are textually and visually identical', () => {
  const evidence = json('docs/m30.json')
  assert.equal(evidence.summary.total, 8)
  assert.equal(evidence.summary.passed, 8)
  assert.deepEqual(evidence.summary.failed, [])
  for (const entry of evidence.assertions) assert.equal(entry.ok, true, entry.id)
  const empty = evidence.states.empty
  const existing = evidence.states.existing
  assert.equal(empty.text, '随便问点什么')
  assert.equal(existing.text, empty.text)
  assert.equal(empty.fontSize, '16px')
  assert.equal(existing.fontSize, empty.fontSize)
  assert.equal(empty.lineHeight, '26px')
  assert.equal(existing.lineHeight, empty.lineHeight)
  assert.equal(empty.color, existing.color)
  assert.equal(empty.paddingLeft, '38px')
  assert.equal(existing.paddingLeft, empty.paddingLeft)
  assert.equal(empty.textLeftInCard, 53)
  assert.equal(existing.textLeftInCard, empty.textLeftInCard)
  assert.equal(empty.card.h, 52)
  assert.equal(existing.card.h, 52)
})

test('M30: both same-scale crops exist', () => {
  for (const name of ['m30-placeholder-empty.png', 'm30-placeholder-existing.png']) {
    const path = `docs/screenshots/${name}`
    assert.ok(exists(path), `${path} missing`)
    const header = readFileSync(join(ROOT, path)).subarray(16, 24)
    assert.equal(header.readUInt32BE(0), 720, `${name} width`)
    assert.equal(header.readUInt32BE(4), 104, `${name} height`)
  }
})
