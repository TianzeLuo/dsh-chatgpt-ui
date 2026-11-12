#!/usr/bin/env node
/**
 * scripts/m13-capture.mjs — P0-3 measured frames for the Work composer card.
 *
 * One URL, both themes, two tags (`before` / `after`):
 *   - Work card + editor + bottom row + tool band geometry;
 *   - the model pill closed and open (blue focus ring);
 *   - the Chat card (must stay 768×52, radius 26).
 *
 * Read-only towards the Host: it only clicks the skin's own mode cards and
 * model pill, presses Escape, and screenshots. No message is sent, no setting
 * is changed; the Chat switch is an in-place preset select on a blank scratch
 * session and is switched back before the context closes.
 *
 *   node scripts/m13-capture.mjs --url "http://127.0.0.1:3110/?token=…" --tag before
 *
 * Writes docs/capture/live/m13-<tag>.json and m13-<tag>-*.png.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const args = new Map()
for (let i = 2; i < process.argv.length; i += 1) {
  const token = process.argv[i]
  if (!token.startsWith('--')) continue
  const next = process.argv[i + 1]
  if (next === undefined || next.startsWith('--')) args.set(token.slice(2), true)
  else {
    args.set(token.slice(2), next)
    i += 1
  }
}
const url = args.get('url')
if (typeof url !== 'string') {
  console.error('usage: node scripts/m13-capture.mjs --url <tokenised-url> [--tag before]')
  process.exit(2)
}
const TAG = typeof args.get('tag') === 'string' ? args.get('tag') : 'state'
const OUT = resolve(ROOT, typeof args.get('out') === 'string' ? args.get('out') : 'docs/capture/live')
mkdirSync(OUT, { recursive: true })

let playwright
for (const candidate of ['playwright', 'playwright', 'playwright-core']) {
  try {
    playwright = await import(candidate)
    break
  } catch {}
}
if (playwright === undefined) {
  console.error('m13-capture: playwright is required')
  process.exit(2)
}
const CHROME = process.env.M13_CHROME ?? process.env.HOME + '/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome'
const browser = await playwright.chromium.launch({
  headless: true,
  executablePath: CHROME,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
})
let context
let page

const result = {
  tag: TAG,
  url: url.replace(/([?&]token=)[^&]+/, '$1***'),
  capturedAt: new Date().toISOString(),
  themes: {}
}
const round = (value) => Math.round(value * 10) / 10

async function screenshot(name, clip) {
  const session = await context.newCDPSession(page)
  const shot = await session.send('Page.captureScreenshot', {
    format: 'png',
    fromSurface: true,
    captureBeyondViewport: false,
    ...(clip === undefined ? {} : { clip: { ...clip, scale: 1 } })
  }).catch(() => null)
  await session.detach().catch(() => {})
  if (shot?.data !== undefined) writeFileSync(join(OUT, name), Buffer.from(shot.data, 'base64'))
}

const measureWork = () => page.evaluate(() => {
  const round = (value) => Math.round(value * 10) / 10
  const rect = (el) => {
    if (el === null || el === undefined) return null
    const box = el.getBoundingClientRect()
    return {
      x: round(box.x), y: round(box.y), w: round(box.width), h: round(box.height),
      b: round(box.bottom), r: round(box.right),
      cx: round(box.x + box.width / 2), cy: round(box.y + box.height / 2)
    }
  }
  const css = (el, keys) => el === null || el === undefined
    ? null
    : Object.fromEntries(keys.map((key) => [key, getComputedStyle(el).getPropertyValue(key)]))
  const card = document.querySelector('[data-composer-card="true"]')
  if (card === null) return { card: null }
  const cardRect = card.getBoundingClientRect()
  const editor = card.querySelector('[data-composer-input="true"]')
  const scroll = card.querySelector('[data-input-scroll="true"]')
  const placeholder = card.querySelector('[data-composer-placeholder="true"]')
  const row = card.querySelector("[class*='_row']")
  const add = card.querySelector("button[class*='_add']")
  const pill = document.querySelector('[data-cgpt-model-pill]')
  const send = card.querySelector("[class*='_trailing'] button[class*='_primary']")
  const leaf400 = [...card.querySelectorAll('*')].find((el) => el.childElementCount === 0 && (el.textContent ?? '').trim() === '400K')
  const chip = leaf400?.closest('button') ?? leaf400
  const tools = document.querySelector('.chatgpt-work-tools')
  const toolButtons = tools === null ? [] : [...tools.querySelectorAll('.chatgpt-work-tool')]
  const placeholderStyle = placeholder === null ? null : getComputedStyle(placeholder, '::after')
  const phRect = placeholder === null ? null : placeholder.getBoundingClientRect()
  const phLine = placeholderStyle === null ? 26 : Number.parseFloat(placeholderStyle.lineHeight)
  const phFont = placeholderStyle === null ? 16 : Number.parseFloat(placeholderStyle.fontSize)
  const rowRect = row === null ? null : row.getBoundingClientRect()
  const glyphTop = phRect === null ? null : round(phRect.top + (phLine - phFont) / 2)
  return {
    mode: document.body.dataset.chatgptMode ?? null,
    card: { rect: rect(card), style: css(card, ['width', 'max-width', 'padding', 'border-radius', 'background-color', 'border', 'box-shadow', 'gap', 'margin-top', 'margin-bottom']) },
    editor: { rect: rect(editor), style: css(editor, ['min-height', 'line-height', 'font-size', 'padding']) },
    scroll: { rect: rect(scroll), style: css(scroll, ['min-height', 'height', 'margin', 'width']) },
    placeholder: {
      rect: rect(placeholder),
      glyphTop,
      baseline: glyphTop === null ? null : round(glyphTop + phFont * 0.8),
      topGap: glyphTop === null ? null : round(glyphTop - cardRect.top),
      baselineGap: glyphTop === null ? null : round(glyphTop + phFont * 0.8 - cardRect.top),
      style: placeholderStyle === null ? null : { font: placeholderStyle.fontSize, line: placeholderStyle.lineHeight }
    },
    row: {
      rect: rect(row),
      center: rowRect === null ? null : round(rowRect.y + rowRect.height / 2),
      centerOffset: rowRect === null ? null : round(rowRect.y + rowRect.height / 2 - cardRect.top),
      add: rect(add),
      chip: { rect: rect(chip), style: css(chip, ['height', 'padding', 'font-size', 'font-weight', 'border-radius', 'gap']) },
      pill: {
        rect: rect(pill),
        style: css(pill, ['height', 'padding', 'font-size', 'font-weight', 'border-radius', 'gap', 'background-color', 'box-shadow', 'outline', 'border-color']),
        expanded: pill === null ? null : pill.getAttribute('aria-expanded')
      },
      send: rect(send),
      gaps: {
        addToChip: add === null || chip === null ? null : round(chip.getBoundingClientRect().x - add.getBoundingClientRect().right),
        chipToPill: chip === null || pill === null ? null : round(pill.getBoundingClientRect().x - chip.getBoundingClientRect().right),
        pillToSend: pill === null || send === null ? null : round(send.getBoundingClientRect().x - pill.getBoundingClientRect().right)
      },
      centerDeltas: [add, chip, pill, send].filter(Boolean).map((el) => {
        const box = el.getBoundingClientRect()
        return round(Math.abs(box.y + box.height / 2 - (rowRect.y + rowRect.height / 2)))
      })
    },
    tools: {
      rect: rect(tools),
      style: css(tools, ['height', 'padding', 'left', 'right', 'bottom', 'border-radius', 'position', 'background-color']),
      buttons: toolButtons.map((button) => ({ tool: button.getAttribute('data-cgpt-work-tool'), rect: rect(button) }))
    }
  }
})

const measureChat = () => page.evaluate(() => {
  const round = (value) => Math.round(value * 10) / 10
  const rect = (el) => {
    if (el === null || el === undefined) return null
    const box = el.getBoundingClientRect()
    return { x: round(box.x), y: round(box.y), w: round(box.width), h: round(box.height), b: round(box.bottom), r: round(box.right) }
  }
  const css = (el, keys) => el === null || el === undefined
    ? null
    : Object.fromEntries(keys.map((key) => [key, getComputedStyle(el).getPropertyValue(key)]))
  const card = document.querySelector('[data-composer-card="true"]')
  if (card === null) return { card: null }
  return {
    mode: document.body.dataset.chatgptMode ?? null,
    card: { rect: rect(card), style: css(card, ['width', 'max-width', 'height', 'padding', 'border-radius', 'background-color', 'border', 'box-shadow']) },
    editor: { rect: rect(card.querySelector('[data-composer-input="true"]')), style: css(card.querySelector('[data-composer-input="true"]'), ['min-height', 'line-height', 'font-size', 'padding']) },
    row: { rect: rect(card.querySelector("[class*='_row']")) },
    tools: rect(document.querySelector('.chatgpt-work-tools'))
  }
})

async function waitMode(mode) {
  await page.waitForFunction((value) => document.body.dataset.chatgptMode === value, mode, { timeout: 15000 }).catch(() => {})
  await page.waitForTimeout(700)
}

async function selectMode(mode) {
  // The header segment is the always-mounted control on a blank session; the
  // hero cards only exist on the sessionless page.
  const segment = page.locator(`.chatgpt-mode-seg[data-segment="${mode}"]`).first()
  if ((await segment.count()) > 0) {
    await segment.click({ force: true })
    await waitMode(mode)
    return true
  }
  const card = page.locator(`[data-mode-card="${mode}"]`).first()
  if ((await card.count()) === 0) return false
  await card.click({ force: true })
  await waitMode(mode)
  return true
}

async function openPill() {
  const pill = page.locator('[data-cgpt-model-pill]').first()
  if ((await pill.count()) === 0) return false
  if ((await page.locator('[data-cgpt-model-menu]').count()) > 0) return true
  await pill.click()
  await page.waitForTimeout(500)
  return (await page.locator('[data-cgpt-model-menu]').count()) > 0
}

for (const theme of ['light', 'dark']) {
  context = await browser.newContext({
    viewport: { width: 1600, height: 1000 },
    deviceScaleFactor: 2,
    locale: 'zh-CN',
    colorScheme: theme
  })
  page = await context.newPage()
  await page.goto(url, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('[data-composer-card="true"]', { timeout: 30000 }).catch(() => {})
  await page.waitForTimeout(2500)
  for (const label of ['Close', '关闭']) {
    const close = page.getByRole('button', { name: label }).first()
    if (await close.count()) await close.click({ force: true }).catch(() => {})
  }
  await page.waitForTimeout(500)
  await page.keyboard.press('Escape')
  await page.waitForTimeout(250)
  if ((await page.evaluate(() => document.body.dataset.chatgptMode)) !== 'agent') {
    await selectMode('agent')
  }
  await page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur())
  await page.waitForTimeout(150)

  const work = await measureWork()
  result.themes[theme] = { work }

  if (work.card !== null) {
    const clip = {
      x: work.card.rect.x - 14,
      y: work.card.rect.y - 14,
      width: work.card.rect.w + 28,
      height: work.card.rect.h + 48 + 28
    }
    await screenshot(`m13-${TAG}-work-${theme}.png`, clip)
  }

  if (await openPill()) {
    await page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur())
    await page.waitForTimeout(200)
    const open = await measureWork()
    result.themes[theme].workOpen = open
    if (open.card !== null) {
      const clip = {
        x: open.card.rect.x - 14,
        y: open.card.rect.y - 14,
        width: open.card.rect.w + 28,
        height: open.card.rect.h + 48 + 28
      }
      await screenshot(`m13-${TAG}-work-open-${theme}.png`, clip)
    }
    await page.keyboard.press('Escape')
    await page.waitForTimeout(250)
  } else {
    result.themes[theme].workOpen = null
  }

  // Chat state — the same card must stay 768×52 with radius 26.
  const switched = await selectMode('chat')
  result.themes[theme].chat = switched ? await measureChat() : null
  if (switched) {
    const chat = result.themes[theme].chat
    if (chat?.card !== null) {
      const clip = {
        x: chat.card.rect.x - 14,
        y: chat.card.rect.y - 14,
        width: chat.card.rect.w + 28,
        height: chat.card.rect.h + 28
      }
      await screenshot(`m13-${TAG}-chat-${theme}.png`, clip)
    }
    await selectMode('agent')
  }
  await context.close()
}

writeFileSync(join(OUT, `m13-${TAG}.json`), `${JSON.stringify(result, null, 2)}\n`)
console.log(`m13-capture: wrote ${join(OUT, `m13-${TAG}.json`)}`)
await browser.close()
