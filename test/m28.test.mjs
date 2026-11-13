/**
 * P0-16 — the empty Chat page against the desktop reference.
 *
 * Three gates:
 *
 *   1. token gate — the empty composer's width, its muted copy colour and the
 *      white on-disc arrow are named tokens (never a bare width inside a rule),
 *      and `--cgpt-empty-composer-w` is consumed by the blank-page hero only, so
 *      a started conversation keeps the Host's column.
 *   2. structure gate — the mode switch is two equal Chinese segments typeset in
 *      the body font (not monospace), the single-row capsule keeps plus / copy /
 *      effort / send, and the two lines the reference does not have
 *      (「标准模式」 and 「聊天模式：」) are gone from source *and* bundle.
 *   3. evidence gate — docs/m28.json's live assertions all pass, its width ratio
 *      sits inside [0.60, 0.62], and docs/m27b.json still carries every measured
 *      row plus the frames the report links to.
 *
 * Run: node test/m28.test.mjs
 */
import assert from 'node:assert/strict'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import nodeTest from 'node:test'
import { read, exists, evidenceTest } from './evidence.mjs'
const test = evidenceTest(nodeTest, import.meta.url)

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

const BLANK = (text) => text.replace(/[^\n]/g, ' ')
const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, BLANK)
const CSS = ['00-tokens.css', '05-cgpt-tokens.css', '06-cgpt-tokens-dark.css', '40-composer.css', '60-hero.css', '70-mode.css', '65-work-card.css']
const sheets = new Map(CSS.map((file) => [file, stripComments(read(`lib/client/css/${file}`))]))
const allCss = [...sheets.values()].join('\n')

/** Every top-level `selector { body }` block in a stylesheet, comments removed. */
const blocks = (css) => {
  const out = []
  const pattern = /([^{}]+)\{([^{}]*)\}/g
  let match
  while ((match = pattern.exec(css)) !== null) out.push({ selector: match[1].trim(), body: match[2] })
  return out
}

test('P0-16/P0-17: the empty composer width is one token, 757px', () => {
  assert.match(sheets.get('05-cgpt-tokens.css'), /--cgpt-empty-composer-w:\s*757px;/)
  // No rule may hard-code the measured width: the token is the single source.
  for (const block of blocks(allCss)) {
    if (block.body.includes('--cgpt-empty-composer-w:')) continue
    assert.doesNotMatch(block.body, /(^|[^-\w])757px/, `bare 757px in ${block.selector}`)
  }
})

test('P0-16/P0-18: only the blank-page heroes read the empty width token', () => {
  const consumers = blocks(allCss).filter((block) => block.body.includes('var(--cgpt-empty-composer-w)'))
  assert.ok(consumers.length > 0, 'no consumer of --cgpt-empty-composer-w')
  for (const block of consumers) {
    assert.match(block.selector, /data-chatgpt-mode='(chat|agent)'/, `unscoped consumer: ${block.selector}`)
    assert.match(block.selector, /_composerHero/, `consumer outside the hero: ${block.selector}`)
  }
  // The Host's own column tokens stay untouched so a sent turn is unchanged.
  const heroFile = sheets.get('60-hero.css')
  assert.match(heroFile, /--dsh-composer-side-clearance:\s*0px;/)
  assert.doesNotMatch(heroFile, /--dsh-chat-content-width\s*:/)
  assert.doesNotMatch(sheets.get('05-cgpt-tokens.css'), /--dsh-chat-content-width\s*:/)
})

test('P0-16: single-row capsule keeps plus / copy / effort / send paddings', () => {
  const tokens = sheets.get('05-cgpt-tokens.css')
  assert.match(tokens, /--cgpt-empty-composer-pad-left:\s*52px;/)
  assert.match(tokens, /--cgpt-empty-composer-pad-right:\s*143px;/)
  const hero = sheets.get('60-hero.css')
  assert.match(hero, /padding:\s*0 var\(--cgpt-empty-composer-pad-right\) 0 var\(--cgpt-empty-composer-pad-left\);/)
  // The capsule is centred on the window's centre line: 32px Host padding plus
  // the 71px that lifts the card from the block's centre to the reference's.
  assert.match(hero, /padding-bottom:\s*103px;/)
  // Scope gate forbids `*`, so the seat's rendered child is hidden by its position.
  assert.match(hero, /\[data-slot='conversation\.hero\.agentPreset'\]\s*>\s*:first-child/, 'agent preset chip is not disabled')
})

test('P0-16: the muted empty-state grey is a token, light and dark', () => {
  assert.match(sheets.get('05-cgpt-tokens.css'), /--cgpt-empty-composer-muted:\s*#8f8f8f;/)
  assert.match(sheets.get('06-cgpt-tokens-dark.css'), /--cgpt-empty-composer-muted:\s*#afafaf;/)
  const consumers = blocks(allCss).filter((block) => block.body.includes('var(--cgpt-empty-composer-muted'))
  assert.ok(consumers.length >= 3, `expected placeholder + ::after + compact pill, got ${consumers.length}`)
  for (const block of consumers) assert.match(block.selector, /chat/, `unscoped muted consumer: ${block.selector}`)
})

test('P0-16: the send arrow is white on the blue disc', () => {
  assert.match(sheets.get('05-cgpt-tokens.css'), /--cgpt-send-on-disc-fg:\s*#ffffff;/)
  const composer = blocks(sheets.get('40-composer.css'))
  const colourRule = composer.find(
    (block) => block.selector.includes('_primary') && block.selector.includes("data-chatgpt-mode='chat'") && block.body.includes('var(--cgpt-send-on-disc-fg)')
  )
  assert.ok(colourRule !== undefined, 'chat send button colour rule missing')
  // The svg and its paths follow the button's colour instead of the theme's
  // `--cgpt-text-on-accent` (#0d0d0d in dark).
  const arrowRule = composer.find((block) => /_primary[^,]*svg path/.test(block.selector) && block.body.includes('fill: currentColor'))
  assert.ok(arrowRule !== undefined, 'send arrow fill rule missing')
  assert.match(arrowRule.selector, /data-chatgpt-mode='chat'/)
  assert.match(arrowRule.body, /opacity:\s*1/)
})

test('P0-16: the mode switch is two equal rounded Chinese segments in the body font', () => {
  const mode = sheets.get('70-mode.css')
  const segment = blocks(mode).find((block) => /\.chatgpt-mode-seg\b/.test(block.selector) && block.body.includes('font-family'))
  assert.ok(segment !== undefined, 'segment font rule missing')
  assert.match(segment.body, /font-family:\s*var\(--cgpt-font-body\)/)
  assert.doesNotMatch(segment.body, /mono/)
  assert.match(segment.body, /letter-spacing:\s*0;/)
  const group = blocks(mode).find((block) => /\.chatgpt-mode-group::before/.test(block.selector))
  assert.ok(group !== undefined, 'switch track rule missing')
  assert.match(group.body, /inset:\s*0;/)
  // The thumb is exactly one half of the 224px track, so it cannot overhang.
  const tokens = sheets.get('05-cgpt-tokens.css')
  assert.match(tokens, /--cgpt-segment-width:\s*224px;/)
  assert.match(tokens, /--cgpt-segment-item-width:\s*112px;/)
  assert.match(tokens, /--cgpt-segment-thumb-width:\s*112px;/)
  assert.match(mode, /width:\s*var\(--cgpt-segment-thumb-width\)/)
  assert.match(read('lib/shared/mode-core.mjs'), /PRODUCT_SEGMENT_LABELS\s*=\s*\{[^}]*'聊天'[^}]*'工作'/s)
  assert.match(read('lib/client/mode-ui.js'), /PRODUCT_SEGMENT_LABELS\[/)
})

test('P0-16: the two extra lines are gone from every shipped string', () => {
  const bundle = read('lib/client.js')
  for (const source of ['lib/client/entry.js', 'lib/client/mode-ui.js', 'lib/client/composer.js', 'lib/client.js', 'lib/client/css/70-mode.css', 'lib/client/css/60-hero.css']) {
    const text = read(source)
    assert.ok(!text.includes('标准模式'), `${source} still renders the 标准模式 chip`)
    assert.ok(!text.includes('聊天模式'), `${source} still renders the 聊天模式 hint`)
    assert.ok(!text.includes('chatgpt-hero-hint'), `${source} still references the hero hint row`)
  }
  assert.ok(!bundle.includes('标准模式'))
  assert.ok(!bundle.includes('聊天模式'))
})

test('P0-16: the compact effort pill exists only for a Chat session with efforts', () => {
  const composer = read('lib/client/composer.js')
  assert.match(composer, /data-cgpt-pill-compact/)
  assert.match(composer, /const compact = props\.compact === true/)
  assert.match(composer, /if \(preset === CHAT_PRESET_ID && !compact\) return null/)
  assert.match(composer, /if \(compact && effortLabel === ''\) return null/)
  // Zero-effort hosts must not render an empty trigger.
  assert.match(composer, /chatgpt-chat-effort/)
})

test('P0-16: recorded live evidence passes and stays inside the ratio window', () => {
  assert.ok(exists('docs/m28.json'), 'docs/m28.json missing — run tools/m28-capture.mjs')
  const evidence = JSON.parse(read('docs/m28.json'))
  assert.ok(Array.isArray(evidence.assertions) && evidence.assertions.length >= 20)
  for (const assertion of evidence.assertions) {
    assert.equal(assertion.ok, true, `${assertion.name}: ${JSON.stringify(assertion.actual)}`)
  }
  assert.deepEqual(evidence.errors, [])
  const light = evidence.states.find((state) => state.id === 'light-1440')
  const reference = evidence.states.find((state) => state.id === 'light-1233')
  const sent = evidence.states.find((state) => state.id === 'light-sent')
  assert.ok(light !== undefined && reference !== undefined && sent !== undefined)
  assert.ok(light.ratio >= 0.6 && light.ratio <= 0.62, `1440 ratio ${light.ratio}`)
  assert.ok(reference.ratio >= 0.6 && reference.ratio <= 0.62, `1233 ratio ${reference.ratio}`)
  assert.ok(Math.abs(reference.card.w - 752) <= 1, `1233 width ${reference.card.w}`)
  assert.equal(light.card.h, 52)
  assert.equal(light.cardStyle.radius, '26px')
  assert.equal(light.titleInk.fontSize, '24px')
  assert.equal(light.switch.w, 224)
  assert.equal(light.switch.h, 36)
  // A sent conversation must not inherit the empty-state width.
  assert.ok(Math.abs(sent.sentCard.w - 704) <= 1, `sent card ${sent.sentCard.w}`)
  assert.equal(sent.cardMaxWidth, '704px')
})

test('P0-16: the reference table and its frames exist', () => {
  assert.ok(exists('docs/m27b.json'), 'docs/m27b.json missing')
  const table = JSON.parse(read('docs/m27b.json'))
  assert.deepEqual(Object.keys(table.rows[0]), ['元素', '网页实测', '桌面比例换算', '实现值', '误差'])
  const elements = table.rows.map((row) => row.元素).join('|')
  for (const needle of ['空态输入框宽度', '空态输入框高度', '圆角', '标题字号', '模式切换轨道', '「极高」字号', '发送键']) {
    assert.ok(elements.includes(needle), `m27b.json lacks a row for ${needle}`)
  }
  assert.match(table.rows[0].实现值, /^752\.13 \/ 1233 = 0\.61$/)
  assert.ok(exists('docs/reference/m28-chat-empty-desktop-dark.webp'), 'desktop reference missing')
  for (const shot of [
    'docs/screenshots/m28-empty-chat-light.png',
    'docs/screenshots/m28-empty-chat-dark.png',
    'docs/screenshots/m28-empty-chat-1233.png',
    'docs/screenshots/m28-switch-light-chat.png',
    'docs/screenshots/m28-switch-light-work.png',
    'docs/screenshots/m28-switch-dark-chat.png',
    'docs/screenshots/m28-switch-dark-work.png',
    'docs/screenshots/m28-focus-chat-light.png',
    'docs/screenshots/m28-placeholder-chat-light.png'
  ]) {
    assert.ok(exists(shot), `${shot} missing`)
  }
  assert.ok(exists('docs/m28-web.json'), 'docs/m28-web.json missing — run tools/m28-ref-probe.mjs')
  const web = JSON.parse(read('docs/m28-web.json'))
  assert.equal(web.found, true)
  assert.equal(web.composer.effort.text, '极高')
  assert.equal(web.composer.effort.fontSize, '16px')
  assert.equal(web.composer.effort.color, 'rgb(143, 143, 143)')
  assert.equal(web.modeSwitch.track.box.w, 224)
  assert.equal(web.modeSwitch.segments.length, 2)
})
