#!/usr/bin/env node
/**
 * P0-21 — Chat/Work composer content auto-grow.
 *
 * The live evidence in docs/m39.json is captured from the running skin; these
 * checks pin both the source contract and every measured height/scroll state.
 *
 * Run: node test/m39.test.mjs
 */
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (path) => readFileSync(join(ROOT, path), 'utf8')
const tokens = read('lib/client/css/00-tokens.css')
const composerCss = read('lib/client/css/40-composer.css')
const heroCss = read('lib/client/css/60-hero.css')
const workCss = read('lib/client/css/65-work-card.css')
const composerJs = read('lib/client/composer.js')
const bundle = read('lib/client.js')
const doc = JSON.parse(read('docs/m39.json'))

test('P0-21: the shared cap is the Host input max or 40vh', () => {
  assert.match(tokens, /--dsh-chatgpt-composer-max-height:\s*min\(336px,\s*40vh\)/)
  assert.match(composerCss, /--dsh-chatgpt-composer-max-height:\s*min\(var\(--dsh-composer-text-max-height,\s*336px\),\s*40vh\)/)
  assert.match(composerCss, /max-height:\s*var\(--dsh-chatgpt-composer-max-height\)/)
  assert.match(workCss, /max-height:\s*var\(--dsh-chatgpt-composer-max-height\)/)
  assert.equal(doc.cap.hostNative, 336)
  assert.equal(doc.cap.effectiveAt850, 336)
  assert.equal(doc.cap.effectiveAt600, 240)
})

test('P0-21: Chat keeps 52px at one line and grows from the editor', () => {
  const chatCard = composerCss.match(/body\[data-chatgpt-ui\]\[data-chatgpt-mode='chat'\] \[class\*='_composerStack'\]:not\(\[class\*='_composerHero'\]\) \[data-composer-card='true'\]\s*\{([\s\S]*?)\}/)?.[1] ?? ''
  assert.match(chatCard, /height:\s*auto/)
  assert.match(chatCard, /min-height:\s*var\(--cgpt-chat-card-height\)/)
  const chatScroll = composerCss.match(/body\[data-chatgpt-ui\]\[data-chatgpt-mode='chat'\] \[class\*='_composerStack'\]:not\(\[class\*='_composerHero'\]\) \[data-input-scroll='true'\]\s*\{([\s\S]*?)\}/)?.[1] ?? ''
  assert.match(chatScroll, /height:\s*auto/)
  assert.match(chatScroll, /min-height:\s*calc\(var\(--cgpt-chat-card-height\)\s*-\s*2px\)/)
  assert.match(chatScroll, /max-height:\s*var\(--dsh-chatgpt-composer-max-height\)/)
  assert.match(chatScroll, /overflow-y:\s*auto/)
  assert.match(heroCss, /data-composer-card='true'[\s\S]{0,300}height:\s*auto/)
  assert.equal(doc.chat.one.card.h, 52)
  assert.equal(doc.chat.one.radius, undefined)
  assert.equal(doc.chat.one.card.radius, '9999px')
})

test('P0-21: multiline Chat aligns to the top and pins its row to the bottom', () => {
  assert.match(composerCss, /\[data-cgpt-composer-grow\] \[data-input-scroll='true'\]\s*\{\s*align-items:\s*flex-start/)
  assert.match(composerCss, /\[data-cgpt-composer-grow\] \[data-input-scroll='true'\] > div\s*\{\s*align-items:\s*flex-start/)
  assert.match(composerCss, /\[data-cgpt-composer-grow\] \[data-composer-input='true'\]\s*\{[\s\S]*?padding-top:\s*8px;[\s\S]*?padding-bottom:\s*8px/)
  assert.match(composerCss, /\[data-composer-card='true'\]\[data-cgpt-composer-grow\] \[class\*='_row'\]\s*\{[\s\S]*?top:\s*auto;[\s\S]*?bottom:\s*0;[\s\S]*?height:\s*50px/)
  assert.match(composerCss, /\[data-cgpt-composer-capped\] \[data-input-scroll='true'\]\s*\{\s*overflow-y:\s*scroll/)
  assert.equal(doc.chat.three.card.radius, '26px')
  assert.equal(doc.chat.ten.card.radius, '26px')
  assert.equal(doc.chat.cap.card.radius, '26px')
})

test('P0-21: the grow controller covers all edit paths and resize', () => {
  assert.match(composerJs, /function chatgptMountComposerAutoGrow\(\)/)
  assert.match(composerJs, /const eventNames = \['input', 'keydown', 'paste', 'compositionend', 'focusin'\]/)
  assert.match(composerJs, /window\.addEventListener\('resize', onResize\)/)
  assert.match(composerJs, /new MutationObserver\(schedule\)/)
  assert.match(composerJs, /input\.scrollHeight/)
  assert.match(composerJs, /verticalPadding/)
  assert.match(composerJs, /toggleAttribute\('data-cgpt-composer-grow', multiline\)/)
  assert.match(composerJs, /toggleAttribute\('data-cgpt-composer-capped', capped\)/)
  assert.match(composerJs, /scroll\.scrollTop = 0/)
  assert.match(composerJs, /disposers\.push\(chatgptMountComposerAutoGrow\(\)\)/)
  assert.ok(bundle.includes('chatgptMountComposerAutoGrow'))
  assert.ok(bundle.includes('data-cgpt-composer-grow'))
})

test('P0-21: the four Chat states and the fallback are measured', () => {
  assert.equal(doc.chat.one.grow, false)
  assert.equal(doc.chat.three.grow, true)
  assert.ok(doc.chat.three.card.h > doc.chat.one.card.h)
  assert.ok(doc.chat.ten.card.h > doc.chat.three.card.h)
  assert.ok(doc.chat.ten.scroll.scrollH <= doc.chat.ten.scroll.clientH + 1)
  assert.equal(doc.chat.cap.capped, true)
  assert.equal(doc.chat.cap.card.h, 338)
  assert.equal(doc.chat.cap.scroll.h, 336)
  assert.equal(doc.chat.cap.scroll.maxHeight, '336px')
  assert.ok(doc.chat.cap.scroll.scrollH > doc.chat.cap.scroll.clientH)
  assert.equal(doc.chat.cap.scroll.scrollTop > 0, true)
  for (const key of ['three', 'ten', 'cap']) assert.equal(doc.chat[key].card.bottom, doc.chat.one.card.bottom)
  assert.equal(doc.chat.cleared.card.h, 52)
  assert.equal(doc.chat.cleared.grow, false)
  assert.equal(doc.chat.cleared.capped, false)
  assert.equal(doc.chat.cleared.card.radius, '9999px')
})

test('P0-21: paste, composition, soft wrap and 40vh are exercised', () => {
  assert.ok(doc.chat.paste.card.h > 52)
  assert.ok(doc.chat.composition.card.h > 52)
  assert.equal(doc.chat.softWrap.grow, true)
  assert.equal(doc.chat.softWrap.capped, true)
  assert.equal(doc.chat.shortCap.cap.effective, 240)
  assert.equal(doc.chat.shortCap.scroll.h, 240)
  assert.equal(doc.chat.shortCap.card.h, 242)
  assert.equal(doc.chat.shortCap.card.bottom, 572)
  for (const [name, value] of Object.entries(doc.events)) assert.ok(value, name)
})

test('P0-21: Work uses the same cap and bottom anchor', () => {
  assert.ok(doc.work.one.card.h > 52)
  assert.equal(doc.work.cap.scroll.h, doc.chat.cap.scroll.h)
  assert.equal(doc.work.cap.scroll.maxHeight, '336px')
  assert.ok(doc.work.cap.scroll.scrollH > doc.work.cap.scroll.clientH)
  assert.equal(doc.work.cap.card.bottom, doc.work.one.card.bottom)
  assert.equal(doc.work.cap.capped, true)
})

test('P0-21: blank Chat hero grows upward from a fixed bottom', () => {
  assert.equal(doc.chat.hero.one.card.h, 52)
  assert.ok(doc.chat.hero.three.card.h > doc.chat.hero.one.card.h)
  assert.equal(doc.chat.hero.three.card.bottom, doc.chat.hero.one.card.bottom)
  assert.equal(doc.chat.hero.cap.capped, true)
  assert.equal(doc.chat.hero.cap.scroll.h, 336)
  assert.equal(doc.chat.hero.cap.card.bottom, doc.chat.hero.one.card.bottom)
})

test('P0-21: every recorded assertion passes and every frame exists', () => {
  assert.equal(doc.summary.total, 21)
  assert.equal(doc.summary.passed, 21)
  assert.deepEqual(doc.summary.failed, [])
  for (const entry of doc.assertions) assert.equal(entry.ok, true, entry.id)
  assert.equal(doc.screenshots.length, 7)
  for (const name of doc.screenshots) {
    const path = join(ROOT, 'docs/screenshots', name)
    assert.ok(existsSync(path), `missing ${name}`)
    const header = readFileSync(path).subarray(16, 24)
    const w = header.readUInt32BE(0)
    const h = header.readUInt32BE(4)
    assert.equal(w, 1233)
    assert.ok(h === 850 || h === 600, `${name} is ${w}x${h}`)
  }
})
