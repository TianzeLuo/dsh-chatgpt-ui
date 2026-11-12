#!/usr/bin/env node
/**
 * tools/m30-capture.mjs — one Chat placeholder for the blank hero and a
 * started Session.
 *
 *   node tools/m30-capture.mjs --url "http://127.0.0.1:3107/?token=…" [--out docs]
 *
 * Writes:
 *   docs/m30.json
 *   docs/screenshots/m30-placeholder-empty.png
 *   docs/screenshots/m30-placeholder-existing.png
 *
 * Both frames are the same-scale (DPR 2) left edge of the composer card:
 * 360×52 CSS → 720×104 device px. The card's own x/y differ by state; the
 * crop width/height and the card-relative text edge are what is compared.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const args = new Map()
for (let index = 2; index < process.argv.length; index += 1) {
  const token = process.argv[index]
  if (!token.startsWith('--')) continue
  const next = process.argv[index + 1]
  if (next === undefined || next.startsWith('--')) args.set(token.slice(2), true)
  else {
    args.set(token.slice(2), next)
    index += 1
  }
}
const url = args.get('url')
if (typeof url !== 'string') {
  console.error('usage: node tools/m30-capture.mjs --url <tokenised-url> [--out docs]')
  process.exit(2)
}
const OUT = resolve(ROOT, typeof args.get('out') === 'string' ? args.get('out') : 'docs')
const SHOTS = join(OUT, 'screenshots')
mkdirSync(SHOTS, { recursive: true })

const playwrightPath = process.env.M30_PLAYWRIGHT ?? '/mnt/f/project/y86/node_modules/playwright/index.mjs'
const CHROME = process.env.CHATGPT_UI_CHROME ?? '/home/user/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome'
const { chromium } = await import(playwrightPath)

const browser = await chromium.launch({ headless: true, executablePath: CHROME, args: ['--no-sandbox', '--disable-dev-shm-usage'] })
const context = await browser.newContext({ viewport: { width: 1233, height: 850 }, deviceScaleFactor: 2, locale: 'zh-CN', colorScheme: 'dark' })
const page = await context.newPage()
const errors = []
page.on('pageerror', (error) => errors.push(String(error).slice(0, 200)))
await page.goto(url, { waitUntil: 'networkidle' })
await page.waitForTimeout(1000)
const notice = page.getByRole('button', { name: /继续|Continue/ })
if ((await notice.count()) > 0) {
  await notice.first().click()
  await page.waitForTimeout(400)
}
await page.locator('.chatgpt-mode-seg', { hasText: '聊天' }).first().click()
await page.waitForTimeout(700)
await page.locator('.chatgpt-new-chat').first().click()
await page.waitForTimeout(1000)

/** Composer + placeholder geometry/typesetting, relative to the card. */
const measure = () =>
  page.evaluate(() => {
    const round = (value) => Math.round(value * 100) / 100
    const card = document.querySelector("[data-composer-card='true']")
    const placeholder = card?.querySelector('[data-composer-placeholder="true"]')
    if (card === null || card === undefined || placeholder === null || placeholder === undefined) return null
    const cardBox = card.getBoundingClientRect()
    const box = placeholder.getBoundingClientRect()
    const style = getComputedStyle(placeholder)
    const after = getComputedStyle(placeholder, '::after')
    const text = after.content.replace(/^["']|["']$/g, '')
    return {
      card: { x: round(cardBox.x), y: round(cardBox.y), w: round(cardBox.width), h: round(cardBox.height) },
      box: { x: round(box.x), y: round(box.y), w: round(box.width), h: round(box.height) },
      paddingLeft: style.paddingLeft,
      textLeft: round(box.x + parseFloat(style.paddingLeft)),
      textLeftInCard: round(box.x + parseFloat(style.paddingLeft) - cardBox.x),
      text,
      fontSize: after.fontSize,
      lineHeight: style.lineHeight,
      color: after.color,
      fontFamily: after.fontFamily,
      plus: (() => {
        const node = card.querySelector('.chatgpt-chat-files')
        if (node === null) return null
        const b = node.getBoundingClientRect()
        return { x: round(b.x), y: round(b.y), w: round(b.width), h: round(b.height) }
      })()
    }
  })

const empty = await measure()
const emptyShot = join(SHOTS, 'm30-placeholder-empty.png')
const existingShot = join(SHOTS, 'm30-placeholder-existing.png')
await page.screenshot({ path: emptyShot, clip: { x: empty.card.x, y: empty.card.y, width: 360, height: 52 } })

const input = page.locator('[data-composer-input="true"]').first()
const inputBox = await input.boundingBox()
if (inputBox !== null) {
  await page.mouse.click(inputBox.x + Math.min(80, inputBox.width / 2), inputBox.y + inputBox.height / 2)
  await page.keyboard.type('你好')
  await page.keyboard.press('Enter')
  await page.waitForTimeout(2600)
}
const existing = await measure()
await page.screenshot({ path: existingShot, clip: { x: existing.card.x, y: existing.card.y, width: 360, height: 52 } })

const PNG_SIZE = (path) => {
  const buffer = readFileSync(path)
  return { w: buffer.readUInt32BE(16), h: buffer.readUInt32BE(20) }
}
const shotSizes = [PNG_SIZE(emptyShot), PNG_SIZE(existingShot)]

const ASSERTIONS = []
const check = (id, ok, detail) => ASSERTIONS.push({ id, ok: ok === true, detail })
check('same placeholder text', empty?.text === existing?.text, `${JSON.stringify(empty?.text)} vs ${JSON.stringify(existing?.text)}`)
check('placeholder is 随便问点什么', empty?.text === '随便问点什么' && existing?.text === '随便问点什么', JSON.stringify(empty?.text))
check('same font size', empty?.fontSize === existing?.fontSize, `${empty?.fontSize} vs ${existing?.fontSize}`)
check('same colour', empty?.color === existing?.color, `${empty?.color} vs ${existing?.color}`)
check('same card-relative left edge', Math.abs(empty?.textLeftInCard - existing?.textLeftInCard) <= 0.5, `${empty?.textLeftInCard} vs ${existing?.textLeftInCard}`)
check('same placeholder padding-left', empty?.paddingLeft === existing?.paddingLeft, `${empty?.paddingLeft} vs ${existing?.paddingLeft}`)
check('same card height', empty?.card.h === existing?.card.h && empty?.card.h === 52, `${empty?.card.h}/${existing?.card.h}`)
check('both frames are 720×104 device px', shotSizes.every((size) => size.w === 720 && size.h === 104), JSON.stringify(shotSizes))

const report = {
  tool: 'm30-capture',
  measuredAt: new Date().toISOString(),
  url: url.replace(/([?&]token=)[^&]+/, '$1***'),
  viewport: { w: 1233, h: 850, dpr: 2 },
  source: '--dsh-chatgpt-placeholder-chat in lib/client/css/00-tokens.css',
  screenshots: ['m30-placeholder-empty.png', 'm30-placeholder-existing.png'],
  states: { empty, existing },
  assertions: ASSERTIONS,
  summary: {
    total: ASSERTIONS.length,
    passed: ASSERTIONS.filter((entry) => entry.ok).length,
    failed: ASSERTIONS.filter((entry) => !entry.ok).map((entry) => entry.id)
  },
  errors
}
writeFileSync(join(OUT, 'm30.json'), `${JSON.stringify(report, null, 2)}\n`)
console.log(JSON.stringify(report.summary, null, 2))
for (const entry of ASSERTIONS) if (!entry.ok) console.log(`FAIL ${entry.id}: ${entry.detail}`)
await context.close()
await browser.close()
if (report.summary.failed.length > 0) process.exit(1)
