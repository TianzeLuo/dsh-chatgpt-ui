#!/usr/bin/env node
/**
 * Module-7 live interaction checklist (dev-only).
 *
 * Requires a running DSH Web instance with this plugin loaded. It touches the
 * composer and opens/closes menus, but never submits a message or writes a file.
 *
 *   node scripts/check-module7.mjs --url 'http://127.0.0.1:3090/?token=…' \
 *     [--playwright /path/to/playwright]
 *
 * The four checklist items are open → select/execute → close → focus restore for
 * commands, @ mentions and search. Exits non-zero on the first failed group.
 */
import { join } from 'node:path'

const args = new Map()
for (let i = 2; i < process.argv.length; i += 2) args.set(process.argv[i].replace(/^--/, ''), process.argv[i + 1])
const url = args.get('url')
if (url === undefined) {
  console.error('usage: node scripts/check-module7.mjs --url <DSH Web URL> [--playwright <dir>]')
  process.exit(2)
}
const playwrightDir = args.get('playwright')
let playwright
try {
  playwright = await import(playwrightDir === undefined ? 'playwright-core' : join(playwrightDir, 'index.mjs'))
} catch (error) {
  console.error(`playwright-core is required for this check (${error.message})`)
  process.exit(2)
}
const CHROME = process.env.CHATGPT_UI_CHROME ?? process.env.HOME + '/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome'
const browser = await playwright.chromium.launch({ headless: true, executablePath: CHROME, args: ['--no-sandbox', '--disable-dev-shm-usage'] })
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } })
let passed = 0
const check = (name, condition, detail = '') => {
  if (!condition) {
    console.error(`FAIL  ${name}${detail === '' ? '' : ` — ${detail}`}`)
    process.exitCode = 1
    return
  }
  passed += 1
}
const clear = async () => {
  await page.keyboard.press('Escape')
  await page.keyboard.press('Control+A')
  await page.keyboard.press('Backspace')
  await page.waitForTimeout(180)
}
try {
  await page.goto(url, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('[data-composer-input="true"]', { timeout: 20000 })
  await page.waitForTimeout(1200)
  const input = page.locator('[data-composer-input="true"]').first()
  await input.focus()

  // / open → filter → execute → close
  await page.keyboard.type('/')
  await page.waitForSelector('[data-trigger-menu][data-cgpt-trigger-menu="command"]', { timeout: 5000 })
  const commandStyle = await page.evaluate(() => {
    const menu = document.querySelector('[data-trigger-menu][data-cgpt-trigger-menu="command"]')
    const row = menu?.querySelector('[role=option]')
    return { width: menu?.getBoundingClientRect().width, height: row?.getBoundingClientRect().height }
  })
  check('/ menu width is 240px', commandStyle.width === 240, JSON.stringify(commandStyle))
  check('/ row height is 36px', commandStyle.height === 36, JSON.stringify(commandStyle))
  await page.keyboard.type('model')
  await page.waitForTimeout(300)
  check('/ filters to a real command', await page.locator('[data-trigger-menu] [role=option]').count() > 0)
  await page.keyboard.press('Enter')
  await page.waitForTimeout(500)
  check('/ Enter executes and closes the menu', await page.locator('[data-trigger-menu]').count() === 0)
  await clear()

  // / no-result → Esc closes
  await page.keyboard.type('/zzzz')
  await page.waitForTimeout(500)
  check('/ no-result state is visible', await page.locator('.chatgpt-trigger-empty').count() === 1)
  await page.keyboard.press('Escape')
  await page.waitForTimeout(200)
  check('/ no-result Esc closes', await page.locator('.chatgpt-trigger-empty').count() === 0)
  await clear()

  // @ open → keyboard select project → native chip → Esc
  await page.keyboard.type('@')
  await page.waitForSelector('[data-trigger-menu][data-cgpt-trigger-menu="reference"]', { timeout: 5000 })
  const menuText = await page.locator('[data-trigger-menu]').innerText()
  check('@ menu exposes the project section', menuText.includes('项目'))
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Enter')
  await page.waitForTimeout(400)
  check('@ pick inserts a reference chip', await page.locator('[data-composer-card] [data-composer-chip="reference"]').count() === 1)
  await clear()

  // search open → query → arrow → Esc → focus restore
  await page.keyboard.press('Control+k')
  await page.waitForSelector('.chatgpt-search-layer', { timeout: 5000 })
  const modal = await page.locator('.chatgpt-search-modal').boundingBox()
  check('search modal is 720×460', modal !== null && Math.round(modal.width) === 720 && Math.round(modal.height) === 460, JSON.stringify(modal))
  await page.keyboard.type('super')
  await page.waitForTimeout(1400)
  check('search returns grouped rows', await page.locator('.chatgpt-search-row').count() > 0)
  await page.keyboard.press('ArrowDown')
  await page.waitForTimeout(150)
  check('search arrow moves a row', await page.locator('.chatgpt-search-row[data-active="true"]').count() === 1)
  await page.keyboard.press('Escape')
  await page.waitForTimeout(250)
  check('search Esc closes', await page.locator('.chatgpt-search-layer').count() === 0)
  check('search close restores composer focus', await page.evaluate(() => document.activeElement?.getAttribute('data-composer-input') === 'true'))
} finally {
  await browser.close()
}
console.log(`module7 live: ${passed} checks passed${process.exitCode === 1 ? ', with failures' : ''}`)
