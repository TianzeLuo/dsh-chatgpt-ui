#!/usr/bin/env node
/**
 * scripts/m12-interaction.mjs — live keyboard/pointer contract for the
 * model+effort panel. Read-only: it only opens the skin's panel and presses
 * keys; the one `selectModel` call is on the model that is already selected.
 *
 *   node scripts/m12-interaction.mjs --url "http://127.0.0.1:3110/?token=..."
 *
 * Writes docs/capture/live/m12-interaction.json.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'docs/capture/live')
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
  console.error('usage: node scripts/m12-interaction.mjs --url <tokenised-url>')
  process.exit(2)
}
let playwright
for (const candidate of ['/mnt/f/project/y86/node_modules/playwright/index.mjs', 'playwright', 'playwright-core']) {
  try {
    playwright = await import(candidate)
    break
  } catch {}
}
if (playwright === undefined) {
  console.error('m12-interaction: playwright is required')
  process.exit(2)
}
const browser = await playwright.chromium.launch({
  headless: true,
  executablePath: process.env.M12_CHROME ?? '/home/user/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome',
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
})
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, locale: 'zh-CN' })
await page.goto(url, { waitUntil: 'domcontentloaded' })
await page.waitForSelector('[data-cgpt-model-pill]', { timeout: 30000 })
await page.waitForTimeout(2000)
await page.evaluate(() => document.body.removeAttribute('data-ds-dark-theme'))

const state = () => page.evaluate(() => {
  const menu = document.querySelector('[data-cgpt-model-menu]')
  const active = document.activeElement
  return {
    open: menu !== null,
    view: menu?.getAttribute('data-view') ?? null,
    focused: (active?.innerText ?? active?.getAttribute?.('aria-label') ?? '').replace(/\s+/g, ' ').trim().slice(0, 60),
    current: (menu?.querySelector('[data-current="true"]')?.innerText ?? '').replace(/\s+/g, ' ').trim(),
    pill: (document.querySelector('[data-cgpt-model-pill]')?.innerText ?? '').replace(/\s+/g, ' ').trim()
  }
})

const before = await state()
await page.locator('[data-cgpt-model-pill]').click()
await page.waitForTimeout(300)
const opened = await state()
await page.keyboard.press('ArrowDown')
await page.waitForTimeout(300)
const arrowIntoModels = await state()
await page.keyboard.press('ArrowDown')
await page.waitForTimeout(180)
const arrowMoves = await state()
await page.keyboard.press('ArrowUp')
await page.waitForTimeout(180)
await page.keyboard.press('Enter')
await page.waitForTimeout(900)
const pickedCurrent = await state()
await page.keyboard.press('ArrowDown')
await page.waitForTimeout(300)
await page.keyboard.press('Escape')
await page.waitForTimeout(300)
const escaped = await state()

// Pointer path: trigger -> drill-in row -> current model row.
await page.locator('[data-cgpt-model-pill]').click()
await page.waitForTimeout(250)
await page.locator('[data-cgpt-model-view-toggle]').click()
await page.waitForTimeout(250)
const pointerIntoModels = await state()
await page.locator('[data-cgpt-model-choice][data-current="true"]').click()
await page.waitForTimeout(700)
const pointerPickedCurrent = await state()
await page.keyboard.press('Escape')
await page.waitForTimeout(250)

// Outside click closes.
await page.locator('[data-cgpt-model-pill]').click()
await page.waitForTimeout(250)
await page.mouse.click(400, 400)
await page.waitForTimeout(300)
const outside = await state()

const report = {
  capturedAt: new Date().toISOString(),
  url: url.replace(/([?&]token=)[^&]+/, '$1***'),
  initial: before,
  opened,
  arrowIntoModels,
  arrowMoves,
  pickedCurrent,
  escaped,
  pointerIntoModels,
  pointerPickedCurrent,
  outside,
  checks: {
    triggerOpensSimple: opened.open && opened.view === 'simple',
    arrowDownOpensModels: arrowIntoModels.open && arrowIntoModels.view === 'advanced',
    arrowMovesFocus: arrowMoves.focused !== arrowIntoModels.focused,
    enterPicksAndReturns: pickedCurrent.open && pickedCurrent.view === 'simple',
    escapeCloses: escaped.open === false,
    pointerDrillIn: pointerIntoModels.open && pointerIntoModels.view === 'advanced',
    pointerPickKeepsPanel: pointerPickedCurrent.open && pointerPickedCurrent.view === 'simple',
    outsideCloses: outside.open === false,
    selectionUnchanged: before.pill === pickedCurrent.pill && before.pill === pointerPickedCurrent.pill
  }
}
mkdirSync(OUT, { recursive: true })
writeFileSync(join(OUT, 'm12-interaction.json'), `${JSON.stringify(report, null, 2)}\n`)
console.log('m12-interaction:', JSON.stringify(report.checks))
console.log(`m12-interaction: wrote ${join(OUT, 'm12-interaction.json')}`)
await browser.close()
