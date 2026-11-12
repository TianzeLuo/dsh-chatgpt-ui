#!/usr/bin/env node
/**
 * scripts/m12-impl-capture.mjs — measured screenshots of the P0-2 surfaces.
 *
 * Drives one DSH Web URL (a skin-enabled instance), records the Work composer
 * card/hand-off row and the model+effort panel in both themes, and writes
 * `docs/capture/live/m12-impl-<tag>.json` plus `m12-<tag>-*.png`.
 *
 *   node scripts/m12-impl-capture.mjs --url "http://127.0.0.1:3110/?token=..." --tag before
 *
 * Read-only towards the Host: it only clicks the skin's own trigger, toggles
 * the body's dark-theme attribute, and takes screenshots. No message is sent
 * and no Host setting is changed.
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
  console.error('usage: node scripts/m12-impl-capture.mjs --url <tokenised-url> [--tag before]')
  process.exit(2)
}
const TAG = typeof args.get('tag') === 'string' ? args.get('tag') : 'state'
const OUT = resolve(ROOT, typeof args.get('out') === 'string' ? args.get('out') : 'docs/capture/live')
mkdirSync(OUT, { recursive: true })

let playwright
for (const candidate of ['/mnt/f/project/y86/node_modules/playwright/index.mjs', 'playwright', 'playwright-core']) {
  try {
    playwright = await import(candidate)
    break
  } catch {}
}
if (playwright === undefined) {
  console.error('m12-impl-capture: playwright is required')
  process.exit(2)
}
const CHROME = process.env.M12_CHROME ?? '/home/user/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome'
const browser = await playwright.chromium.launch({
  headless: true,
  executablePath: CHROME,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
})
let context
let page

const result = { tag: TAG, url: url.replace(/([?&]token=)[^&]+/, '$1***'), capturedAt: new Date().toISOString(), themes: {} }
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

const measure = () => page.evaluate(() => {
  const round = (value) => Math.round(value * 10) / 10
  const rect = (el) => {
    if (el === null || el === undefined) return null
    const box = el.getBoundingClientRect()
    return { x: round(box.x), y: round(box.y), w: round(box.width), h: round(box.height), b: round(box.bottom), r: round(box.right), cx: round(box.x + box.width / 2), cy: round(box.y + box.height / 2) }
  }
  const style = (el, keys) => el === null || el === undefined ? null : Object.fromEntries(keys.map((key) => [key, getComputedStyle(el).getPropertyValue(key)]))
  const card = document.querySelector('[data-composer-card="true"]')
  if (card === null) return { card: null }
  const editor = card.querySelector('[data-composer-input="true"]')
  const scroll = card.querySelector('[data-input-scroll="true"]')
  const placeholder = card.querySelector('[data-composer-placeholder="true"]')
  const row = card.querySelector("[class*='_row']")
  const add = card.querySelector("button[class*='_add']")
  const pill = document.querySelector('[data-cgpt-model-pill]')
  const send = card.querySelector("[class*='_trailing'] button[class*='_primary']")
  const leaf400 = [...card.querySelectorAll('*')].find((el) => el.childElementCount === 0 && (el.textContent ?? '').trim() === '400K')
  const chip = leaf400?.closest('button') ?? leaf400
  const menu = document.querySelector('[data-cgpt-model-menu]')
  const placeholderStyle = placeholder === null ? null : getComputedStyle(placeholder, '::after')
  const phRect = placeholder === null ? null : placeholder.getBoundingClientRect()
  const phLine = placeholderStyle === null ? 26 : Number.parseFloat(placeholderStyle.lineHeight)
  const phFont = placeholderStyle === null ? 16 : Number.parseFloat(placeholderStyle.fontSize)
  const rowRect = row === null ? null : row.getBoundingClientRect()
  return {
    card: { rect: rect(card), style: style(card, ['padding', 'border-radius', 'background-color', 'border', 'box-shadow', 'gap']) },
    editor: { rect: rect(editor), style: style(editor, ['min-height', 'line-height', 'font-size', 'padding']) },
    scroll: { rect: rect(scroll), style: style(scroll, ['min-height', 'height']) },
    placeholder: {
      rect: rect(placeholder),
      glyphTop: phRect === null ? null : round(phRect.top + (phLine - phFont) / 2),
      topGap: phRect === null ? null : round(phRect.top + (phLine - phFont) / 2 - card.getBoundingClientRect().top),
      baselineGap: phRect === null ? null : round(phRect.top + (phLine - phFont) / 2 + phFont * 0.8 - card.getBoundingClientRect().top),
      style: placeholderStyle === null ? null : { font: placeholderStyle.fontSize, line: placeholderStyle.lineHeight, content: placeholderStyle.content }
    },
    row: {
      rect: rect(row),
      center: rowRect === null ? null : round(rowRect.y + rowRect.height / 2),
      add: rect(add),
      chip: { rect: rect(chip), style: style(chip, ['height', 'padding', 'font-size', 'font-weight', 'border-radius', 'gap']) },
      pill: { rect: rect(pill), style: style(pill, ['height', 'padding', 'font-size', 'font-weight', 'border-radius', 'gap']) },
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
    menu: menu === null ? null : {
      rect: rect(menu),
      style: style(menu, ['padding', 'border-radius', 'background-color', 'box-shadow', 'max-height', 'width']),
      view: menu.getAttribute('data-view') ?? null,
      section: menu.querySelector('[data-cgpt-model-section]')?.textContent ?? null,
      title: menu.querySelector('.chatgpt-model-menu-title')?.textContent ?? null,
      rows: [...menu.querySelectorAll('[data-cgpt-model-choice]')].map((rowEl) => ({
        text: (rowEl.innerText ?? '').replace(/\s+/g, ' ').trim(),
        current: rowEl.getAttribute('data-current') === 'true',
        rect: rect(rowEl),
        style: style(rowEl, ['height', 'padding', 'border-radius', 'font-size', 'font-weight', 'gap'])
      })),
      toggle: rect(menu.querySelector('[data-cgpt-model-view-toggle]')),
      effortLevels: [...menu.querySelectorAll('[data-cgpt-effort-level]')].map((rowEl) => ({ text: (rowEl.innerText ?? '').replace(/\s+/g, ' ').trim(), current: rowEl.getAttribute('data-current') === 'true', rect: rect(rowEl) })),
      track: rect(menu.querySelector('.chatgpt-effort-track')),
      thumb: rect(menu.querySelector('.chatgpt-effort-thumb')),
      fill: style(menu.querySelector('.chatgpt-effort-fill'), ['width', 'background-color']),
      head: rect(menu.querySelector('.chatgpt-effort-head'))
    }
  }
})

async function openPanel() {
  const pill = page.locator('[data-cgpt-model-pill]').first()
  if ((await pill.count()) === 0) return false
  if ((await page.locator('[data-cgpt-model-menu]').count()) > 0) return true
  await pill.click()
  await page.waitForTimeout(700)
  return (await page.locator('[data-cgpt-model-menu]').count()) > 0
}

for (const theme of ['light', 'dark']) {
  // A fresh context with `colorScheme` is the host's real theme path: it also
  // swaps the theme service's token layer. Toggling `data-ds-dark-theme` alone
  // leaves the service on its light values and the page canvas white.
  context = await browser.newContext({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 2, locale: 'zh-CN', colorScheme: theme })
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
  const state = await measure()
  result.themes[theme] = { state }
  if (state.card !== null) {
    await screenshot(`m12-${TAG}-composer-${theme}.png`, { x: state.card.rect.x - 14, y: state.card.rect.y - 14, width: state.card.rect.w + 28, height: state.card.rect.h + 70 })
  }
  if (await openPanel()) {
    result.themes[theme].state.menu = (await measure()).menu
    const menu = result.themes[theme].state.menu
    if (menu !== null) {
      await screenshot(`m12-${TAG}-panel-simple-${theme}.png`, { x: menu.rect.x - 10, y: menu.rect.y - 10, width: menu.rect.w + 20, height: menu.rect.h + 20 })
    }
    const toggle = page.locator('[data-cgpt-model-view-toggle]').first()
    if (await toggle.count()) {
      await toggle.click()
      await page.waitForTimeout(500)
      await page.mouse.move(80, 80)
      await page.waitForTimeout(150)
      result.themes[theme].state.advanced = (await measure()).menu
      const advanced = result.themes[theme].state.advanced
      if (advanced !== null) {
        await screenshot(`m12-${TAG}-panel-advanced-${theme}.png`, { x: advanced.rect.x - 10, y: advanced.rect.y - 10, width: advanced.rect.w + 20, height: advanced.rect.h + 20 })
      }
    }
    await page.keyboard.press('Escape')
    await page.waitForTimeout(250)
  }
  await context.close()
}

writeFileSync(join(OUT, `m12-${TAG}.json`), `${JSON.stringify(result, null, 2)}\n`)
console.log(`m12-impl-capture: wrote ${join(OUT, `m12-${TAG}.json`)}`)
await browser.close()
