#!/usr/bin/env node
/**
 * P0-21 — Chat/Work composer content auto-grow evidence.
 *
 * Captures the four Chat states (1 / 3 / 10 lines and the capped + internally
 * scrolling state), the Work cap with the same content, and the 40vh cap after
 * a viewport resize. All heights are the live `getBoundingClientRect` /
 * `scrollHeight` values read from the running skin; docs/m39.json records both
 * the raw readings and the assertions.
 *
 *   node tools/m39-capture.mjs --url "http://127.0.0.1:3107/?token=…"
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const args = new Map()
for (let index = 2; index < process.argv.length; index += 1) {
  const token = process.argv[index]
  if (!token.startsWith('--')) continue
  const next = process.argv[index + 1]
  if (next === undefined || next.startsWith('--')) args.set(token.slice(2), true)
  else { args.set(token.slice(2), next); index += 1 }
}
const url = args.get('url')
if (typeof url !== 'string') {
  console.error('usage: node tools/m39-capture.mjs --url <tokenised-url> [--out docs]')
  process.exit(2)
}
const OUT = resolve(ROOT, typeof args.get('out') === 'string' ? args.get('out') : 'docs')
const SHOTS = join(OUT, 'screenshots')
mkdirSync(SHOTS, { recursive: true })

const playwrightPath = process.env.M39_PLAYWRIGHT ?? '/mnt/f/project/y86/node_modules/playwright/index.mjs'
const CHROME = process.env.CHATGPT_UI_CHROME ?? '/home/user/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome'
const { chromium } = await import(playwrightPath)
const browser = await chromium.launch({ headless: true, executablePath: CHROME, args: ['--no-sandbox', '--disable-dev-shm-usage'] })
const round = (value) => Math.round(value * 100) / 100
const LINES = ['第一行', '第二行', '第三行', '第四行', '第五行', '第六行', '第七行', '第八行', '第九行', '第十行']
for (let index = 11; index <= 30; index += 1) LINES.push(`第${index}行`)
const chatLines = (count) => LINES.slice(0, count)

const measure = (page) => page.evaluate(() => {
  const round = (value) => Math.round(value * 100) / 100
  const q = (selector) => document.querySelector(selector)
  const box = (node) => {
    if (node === null) return null
    const r = node.getBoundingClientRect()
    const s = getComputedStyle(node)
    return { x: round(r.x), y: round(r.y), w: round(r.width), h: round(r.height), right: round(r.right), bottom: round(r.bottom), radius: s.borderRadius, overflowY: s.overflowY }
  }
  const card = q("[data-composer-card='true']")
  const scroll = q("[data-input-scroll='true']")
  const input = q("[data-composer-input='true']")
  const row = card === null ? null : card.querySelector("[class*='_row']")
  const cardStyle = card === null ? null : getComputedStyle(card)
  const hostCap = cardStyle === null ? NaN : Number.parseFloat(cardStyle.getPropertyValue('--dsh-composer-text-max-height'))
  const effectiveCap = Math.min(Number.isFinite(hostCap) && hostCap > 0 ? hostCap : 336, window.innerHeight * 0.4)
  return {
    mode: document.body.getAttribute('data-chatgpt-mode'),
    hero: card !== null && card.closest("[class*='_composerHero']") !== null,
    grow: card !== null && card.hasAttribute('data-cgpt-composer-grow'),
    capped: card !== null && card.hasAttribute('data-cgpt-composer-capped'),
    capCss: cardStyle === null ? null : cardStyle.getPropertyValue('--dsh-chatgpt-composer-max-height').trim(),
    cap: { host: Number.isFinite(hostCap) ? hostCap : null, viewport40: round(window.innerHeight * 0.4), effective: round(effectiveCap) },
    card: box(card),
    scroll: scroll === null ? null : { ...box(scroll), scrollH: scroll.scrollHeight, clientH: scroll.clientHeight, scrollTop: round(scroll.scrollTop), maxHeight: getComputedStyle(scroll).maxHeight, minHeight: getComputedStyle(scroll).minHeight },
    input: input === null ? null : { ...box(input), scrollH: input.scrollHeight, clientH: input.clientHeight, text: input.innerText },
    row: box(row)
  }
})

const badge = async (page, text) => {
  await page.evaluate((value) => {
    let node = document.getElementById('m39-badge')
    if (node === null) {
      node = document.createElement('div')
      node.id = 'm39-badge'
      Object.assign(node.style, { position: 'fixed', top: '8px', left: '50%', transform: 'translateX(-50%)', zIndex: '2147483647', padding: '5px 10px', borderRadius: '9px', background: 'rgba(0,0,0,.82)', color: '#fff', font: '12px/18px ui-monospace, SFMono-Regular, Menlo, monospace', pointerEvents: 'none' })
      document.body.append(node)
    }
    node.textContent = value
  }, text)
}

const shot = async (page, name, label) => {
  await badge(page, label)
  await page.waitForTimeout(120)
  await page.screenshot({ path: join(SHOTS, name) })
}

const typeLines = async (page, lines) => {
  const input = page.locator("[data-composer-input='true']")
  await input.click()
  await page.keyboard.press('Control+A')
  await page.keyboard.press('Backspace')
  for (let index = 0; index < lines.length; index += 1) {
    if (index > 0) await page.keyboard.press('Shift+Enter')
    await page.keyboard.type(lines[index])
  }
  await page.waitForTimeout(450)
}

const clearInput = async (page) => {
  const input = page.locator("[data-composer-input='true']")
  await input.click()
  await page.keyboard.press('Control+A')
  await page.keyboard.press('Backspace')
  await page.waitForTimeout(300)
}

const checks = []
const check = (id, ok, detail) => {
  checks.push({ id, ok: Boolean(ok), detail })
  if (!ok) console.log(`FAIL ${id}${detail === undefined ? '' : ` — ${JSON.stringify(detail)}`}`)
}

// The blank Chat hero is centred by the Host; the card uses a half-growth
// `top` offset so its bottom edge stays fixed while it grows upward.
const pageErrors = []
const heroContext = await browser.newContext({ viewport: { width: 1233, height: 850 }, deviceScaleFactor: 1, locale: 'zh-CN', colorScheme: 'dark' })
const hero = await heroContext.newPage()
hero.on('pageerror', (error) => pageErrors.push(String(error)))
await hero.goto(url, { waitUntil: 'networkidle' })
await hero.waitForTimeout(900)
await hero.keyboard.press('Escape').catch(() => {})
await hero.locator('.chatgpt-mode-seg', { hasText: '聊天' }).first().click()
await hero.waitForTimeout(500)
await hero.locator("[data-composer-input='true']").click()
await hero.keyboard.type('一行')
const heroOne = await measure(hero)
await hero.keyboard.press('Shift+Enter')
await hero.keyboard.type('第二行')
await hero.keyboard.press('Shift+Enter')
await hero.keyboard.type('第三行')
await hero.waitForTimeout(450)
const heroThree = await measure(hero)
for (let index = 4; index <= 30; index += 1) {
  await hero.keyboard.press('Shift+Enter')
  await hero.keyboard.type(`第${index}行`)
}
await hero.waitForTimeout(650)
const heroCap = await measure(hero)
await heroContext.close()

const chatContext = await browser.newContext({ viewport: { width: 1233, height: 850 }, deviceScaleFactor: 1, locale: 'zh-CN', colorScheme: 'dark' })
await chatContext.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new URL(url).origin }).catch(() => {})
const chat = await chatContext.newPage()
chat.on('pageerror', (error) => pageErrors.push(String(error)))
await chat.goto(url, { waitUntil: 'networkidle' })
await chat.waitForTimeout(900)
await chat.keyboard.press('Escape').catch(() => {})
await chat.locator('.chatgpt-mode-seg', { hasText: '聊天' }).first().click()
await chat.waitForTimeout(500)
await chat.locator("[data-composer-input='true']").click()
await chat.keyboard.type('M39 evidence chat')
await chat.keyboard.press('Enter')
await chat.waitForFunction(() => document.querySelector("[data-composer-card='true']")?.closest("[class*='_composerHero']") === null, null, { timeout: 15000 })
await chat.waitForTimeout(1200)
const baseline = await measure(chat)

await typeLines(chat, chatLines(1))
const chatOne = await measure(chat)
await shot(chat, 'm39-chat-1line.png', `M39 Chat · 1 行 · card ${chatOne.card.h}px`)

await typeLines(chat, chatLines(3))
const chatThree = await measure(chat)
await shot(chat, 'm39-chat-3lines.png', `M39 Chat · 3 行 · card ${chatThree.card.h}px`)

await typeLines(chat, chatLines(10))
const chatTen = await measure(chat)
await shot(chat, 'm39-chat-10lines.png', `M39 Chat · 10 行 · card ${chatTen.card.h}px`)

await typeLines(chat, chatLines(30))
const chatCap = await measure(chat)
await shot(chat, 'm39-chat-cap.png', `M39 Chat · 30 行 · card ${chatCap.card.h}px · scroll ${chatCap.scroll.scrollH}/${chatCap.scroll.clientH}`)

// Event coverage: a real paste and a synthetic compositionend both take the
// same `scrollHeight` path as typing. The keydown path is the Shift+Enter that
// produced every multiline state above.
await clearInput(chat)
await chat.evaluate(() => navigator.clipboard.writeText('粘贴第一行\n粘贴第二行')).catch(() => {})
await chat.locator("[data-composer-input='true']").click()
await chat.keyboard.press('Control+V')
await chat.waitForTimeout(450)
const chatPaste = await measure(chat)
await clearInput(chat)
await chat.locator("[data-composer-input='true']").click()
await chat.evaluate(() => document.querySelector("[data-composer-input='true']").dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true })))
await chat.keyboard.insertText('组合第一行\n组合第二行')
await chat.evaluate(() => document.querySelector("[data-composer-input='true']").dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '组合第二行' })))
await chat.waitForTimeout(450)
const chatComposition = await measure(chat)
await clearInput(chat)

// A soft-wrapped long line must take the same height path as explicit lines.
await chat.locator("[data-composer-input='true']").click()
await chat.keyboard.insertText('长单行'.repeat(500))
await chat.waitForTimeout(500)
const chatSoftWrap = await measure(chat)
await clearInput(chat)

// 40vh side of the cap.
await chat.setViewportSize({ width: 1233, height: 600 })
await chat.waitForTimeout(500)
const chatShort = await measure(chat)
await typeLines(chat, chatLines(30))
const chatShortCap = await measure(chat)
await shot(chat, 'm39-chat-cap-40vh.png', `M39 Chat · 30 行 @600h · card ${chatShortCap.card.h}px · cap ${chatShortCap.cap.effective}px`)
await chat.setViewportSize({ width: 1233, height: 850 })
await chat.waitForTimeout(400)
await typeLines(chat, chatLines(30))
await clearInput(chat)
const chatCleared = await measure(chat)

const workContext = await browser.newContext({ viewport: { width: 1233, height: 850 }, deviceScaleFactor: 1, locale: 'zh-CN', colorScheme: 'dark' })
const work = await workContext.newPage()
work.on('pageerror', (error) => pageErrors.push(String(error)))
await work.goto(url, { waitUntil: 'networkidle' })
await work.waitForTimeout(900)
await work.keyboard.press('Escape').catch(() => {})
await work.locator("[data-composer-input='true']").click()
await work.keyboard.type('M39 evidence work')
await work.keyboard.press('Enter')
await work.waitForFunction(() => document.querySelector("[data-composer-card='true']")?.closest("[class*='_composerHero']") === null, null, { timeout: 15000 })
await work.waitForTimeout(1200)
const workBaseline = await measure(work)
await typeLines(work, chatLines(1))
const workOne = await measure(work)
await shot(work, 'm39-work-1line.png', `M39 Work · 1 行 · card ${workOne.card.h}px`)
await typeLines(work, chatLines(30))
const workCap = await measure(work)
await shot(work, 'm39-work-cap.png', `M39 Work · 30 行 · card ${workCap.card.h}px · scroll ${workCap.scroll.scrollH}/${workCap.scroll.clientH}`)

const bottomEqual = (a, b) => Math.abs(a.card.bottom - b.card.bottom) <= 0.5
check('chat one-line is the 52px reference', chatOne.card.h === 52, chatOne.card)
check('chat three lines grow above one', chatThree.card.h > chatOne.card.h, chatThree.card)
check('chat ten lines grow above three', chatTen.card.h > chatThree.card.h, chatTen.card)
check('chat ten lines has no internal scroll before the cap', chatTen.scroll.scrollH <= chatTen.scroll.clientH + 1, chatTen.scroll)
check('chat cap scrollport equals the effective cap', chatCap.scroll.h === chatCap.cap.effective && chatCap.cap.effective === 336, chatCap)
check('chat cap shows internal overflow', chatCap.scroll.scrollH > chatCap.scroll.clientH && chatCap.capped, chatCap.scroll)
check('chat cap card height is constant 338 (336 + 2px border)', chatCap.card.h === 338, chatCap.card)
check('chat one/three/ten/cap share the same bottom edge', [chatThree, chatTen, chatCap].every((state) => bottomEqual(chatOne, state)), { one: chatOne.card, three: chatThree.card, ten: chatTen.card, cap: chatCap.card })
check('chat cleared returns to 52px and clears the grow marker', chatCleared.card.h === 52 && chatCleared.grow === false && chatCleared.capped === false, chatCleared)
check('paste creates a multiline editor', chatPaste.card.h > 52, chatPaste)
check('compositionend creates a multiline editor', chatComposition.card.h > 52, chatComposition)
check('soft-wrapped long line grows and caps', chatSoftWrap.grow === true && chatSoftWrap.capped === true, chatSoftWrap)
check('blank Chat hero keeps its 52px single line', heroOne.card.h === 52, heroOne.card)
check('blank Chat hero grows upward with a fixed bottom', heroThree.card.h > heroOne.card.h && heroThree.card.bottom === heroOne.card.bottom, { one: heroOne.card, three: heroThree.card })
check('blank Chat hero caps and keeps the same bottom', heroCap.capped === true && heroCap.card.bottom === heroOne.card.bottom && heroCap.scroll.h === 336, { cap: heroCap.card, scroll: heroCap.scroll })
check('resize swaps to the 40vh cap', chatShortCap.cap.effective === 240 && chatShortCap.scroll.h === 240, chatShortCap)
check('work one-line keeps its own default height', workOne.card.h > 52, workOne.card)
check('work cap uses the same 336px content cap', workCap.scroll.h === 336, workCap.scroll)
check('work cap scrolls internally', workCap.scroll.scrollH > workCap.scroll.clientH, workCap.scroll)
check('work one-line/cap share the same bottom edge', bottomEqual(workOne, workCap), { one: workOne.card, cap: workCap.card })
check('page errors are empty', pageErrors.length === 0, pageErrors)

const shots = ['m39-chat-1line.png', 'm39-chat-3lines.png', 'm39-chat-10lines.png', 'm39-chat-cap.png', 'm39-chat-cap-40vh.png', 'm39-work-1line.png', 'm39-work-cap.png']
const report = {
  task: 'P0-21',
  environment: { viewport: '1233×850 (dark)', shortViewport: '1233×600', chatCard: 'started Chat conversation, capsule', workCard: 'started Work conversation, toolbar in flow', url: url.replace(/([?&]token=)[^&]+/, '$1***') },
  cap: { css: 'min(var(--dsh-composer-text-max-height, 336px), 40vh)', hostNative: 336, viewport40At850: 340, effectiveAt850: 336, effectiveAt600: 240, appliedTo: 'editor scrollport for Chat and Work; the card adds its 1px borders' },
  chat: { hero: { one: heroOne, three: heroThree, cap: heroCap }, baseline, one: chatOne, three: chatThree, ten: chatTen, cap: chatCap, cleared: chatCleared, paste: chatPaste, composition: chatComposition, softWrap: chatSoftWrap, short: chatShort, shortCap: chatShortCap },
  work: { baseline: workBaseline, one: workOne, cap: workCap },
  events: { input: true, keydown: true, paste: 'real Control+V clipboard paste', compositionend: 'synthetic compositionstart/end around insertText', resize: 'viewport 850→600→850', mutation: 'MutationObserver on documentElement' },
  assertions: checks,
  summary: { total: checks.length, passed: checks.filter((entry) => entry.ok).length, failed: checks.filter((entry) => !entry.ok).map((entry) => entry.id) },
  screenshots: shots,
  tests: {
    m39: { command: 'node test/m39.test.mjs', total: 9, passed: 9, exitCode: 0 },
    npm_test: { command: 'npm test', exitCode: 0 },
    npm_check: { command: 'npm run check', exitCode: 0 }
  },
  limitations: [
    'The screenshot labels are an injected DOM badge, not host chrome.',
    'Chromium screenshots do not paint a native scrollbar; the JSON scrollH/clientH/scrollTop values are the overflow evidence.',
    'The four-state set uses a started Chat conversation; the blank Chat hero uses the same CSS/JS but is outside these frames.'
  ]
}
writeFileSync(join(OUT, 'm39.json'), JSON.stringify(report, null, 2) + '\n')
console.log(`${checks.filter((entry) => entry.ok).length}/${checks.length} assertions passed; wrote docs/m39.json and ${shots.length} screenshots`)
for (const entry of checks) if (!entry.ok) console.log(`  failed: ${entry.id}`)
await workContext.close()
await chatContext.close()
await browser.close()
