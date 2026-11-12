#!/usr/bin/env node
/**
 * Phase 1 acceptance shots: product switcher, centred Chat/Work segment,
 * collapsed 56px icon rail.
 *
 * Dev-only tool, like scripts/screenshots.mjs: it needs playwright-core and a
 * Chromium build. It does not write outside --out (default docs/screenshots).
 *
 *   node scripts/phase1-shots.mjs --url "http://127.0.0.1:3099/?token=..." \
 *     --playwright /path/to/node_modules/playwright-core
 *
 * Exit 1 when the mount marker is missing, a console error appears, or one of
 * the geometry/interaction assertions fails; the PNGs and JSON summary are
 * still printed/saved.
 */

import { mkdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const args = new Map()
for (let i = 2; i < process.argv.length; i += 2) args.set(process.argv[i].replace(/^--/, ''), process.argv[i + 1])

const url = args.get('url')
if (url === undefined) {
  console.error('missing --url (the tokenised URL printed by `dsh web`)')
  process.exit(2)
}

const outDir = resolve(ROOT, args.get('out') ?? 'docs/screenshots')
mkdirSync(outDir, { recursive: true })

const playwrightDir = args.get('playwright')
let playwright
try {
  playwright = await import(playwrightDir === undefined ? 'playwright-core' : join(playwrightDir, 'index.mjs'))
} catch (error) {
  console.error(`playwright-core is required for screenshots (${error.message})`)
  process.exit(2)
}

const CHROME = process.env.CHATGPT_UI_CHROME ?? '/home/user/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome'
const browser = await playwright.chromium.launch({
  headless: true,
  executablePath: CHROME,
  args: ['--no-sandbox', '--disable-dev-shm-usage']
})

const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 })
const errors = []
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text())
})
page.on('pageerror', (error) => errors.push(error.message))

await page.goto(url, { waitUntil: 'domcontentloaded' })
await page.waitForSelector('[data-slot="sidebar"]', { timeout: 60000 })
await page.waitForFunction(() => document.body.getAttribute('data-chatgpt-ui') !== null, null, { timeout: 60000 })

/** Close the real dialog shell. Do not look for [role=presentation]: the host
 *  also uses it for a zero-size dock tab strip, which would never "close". */
async function dismissDialogs() {
  let clean = 0
  for (let attempt = 0; attempt < 20 && clean < 3; attempt += 1) {
    const dialog = await page.evaluate(() => document.querySelector('[role="dialog"]') !== null)
    if (!dialog) {
      clean += 1
      await page.waitForTimeout(350)
      continue
    }
    clean = 0
    const acted = await page.evaluate(() => {
      const scope = document.querySelector('[role="dialog"]') ?? document
      const close = scope.querySelector('button[aria-label="Close"]')
      if (close !== null) {
        close.click()
        return 'close'
      }
      const cont = [...scope.querySelectorAll('button')].find((button) => /continue|继续/i.test(button.textContent ?? ''))
      if (cont !== undefined) {
        cont.click()
        return 'continue'
      }
      return 'none'
    })
    if (acted === 'none') await page.keyboard.press('Escape').catch(() => {})
    await page.waitForTimeout(800)
  }
}
await dismissDialogs()
/* A scratch profile cannot create its default workspace; the host toast lingers
   for a few seconds and would sit on top of the header segment. */
await page.waitForTimeout(5000)

const failures = []
const check = (name, condition, detail) => {
  if (condition) return
  failures.push(`${name}${detail === undefined ? '' : ` (${detail})`}`)
}

const measure = () =>
  page.evaluate(() => {
    const rect = (node) => {
      if (node === null) return null
      const box = node.getBoundingClientRect()
      return { left: Math.round(box.left), top: Math.round(box.top), width: Math.round(box.width), height: Math.round(box.height) }
    }
    const style = (node, property) => (node === null ? null : getComputedStyle(node).getPropertyValue(property).trim())
    const header = document.querySelector('[data-slot="conversation.header"] header')
    const segment = document.querySelector('.chatgpt-header-mode')
    const frame = document.querySelector('[class*="_frame"]')
    const brand = document.querySelector('[data-chatgpt-brand-switcher]')
    const newSession = document.querySelector('[data-slot="sidebar"] [class*="_newSession"]')
    const panelRows = [...document.querySelectorAll('[data-slot="sidebar"] [class*="_panelRow"]')]
    const segmentBox = segment?.getBoundingClientRect()
    const headerBox = header?.getBoundingClientRect()
    return {
      mode: document.body.getAttribute('data-chatgpt-mode'),
      dark: document.body.hasAttribute('data-ds-dark-theme'),
      collapsed: frame?.getAttribute('data-sidebar-collapsed') === 'true',
      brand: brand === null ? null : { text: brand.textContent, rect: rect(brand), icon: style(brand.querySelector('.chatgpt-brand-mark svg'), 'width') },
      segment: segment === null ? null : { rect: rect(segment), centerDelta: Math.round(segmentBox.left + segmentBox.width / 2 - (headerBox.left + headerBox.width / 2)), labels: [...segment.querySelectorAll('.chatgpt-mode-seg')].map((node) => ({ text: node.textContent, pressed: node.getAttribute('aria-pressed') })) },
      newSession: rect(newSession),
      newSessionIcon: style(newSession?.querySelector('svg'), 'width'),
      panelRows: panelRows.map((node) => rect(node)),
      panelIcons: panelRows.map((node) => style(node.querySelector('svg'), 'width')),
      sessions: document.querySelectorAll('[data-row-key^="session:"]').length,
      url: location.href,
      menu: document.querySelector('[data-chatgpt-brand-menu]') !== null
    }
  })

const light = await measure()
check('dark theme is not active initially', light.dark === false)
check('brand switcher is visible', light.brand !== null)
check('brand name follows the selected product', light.brand?.text.includes(light.mode === 'chat' ? 'Chat' : 'Work') === true, light.brand?.text)
check('centred segment is visible', light.segment !== null)
check('centred segment is horizontally centred', Math.abs(light.segment?.centerDelta ?? 999) <= 1, String(light.segment?.centerDelta))
check('centred segment has exactly two labels', light.segment?.labels.length === 2)
check('centred segment labels are products', light.segment?.labels.map((row) => row.text).join('/') === 'Chat/Work')
check('centred segment lives in header.leading', await page.evaluate(() => document.querySelector('[data-slot="conversation.header.leading"] .chatgpt-header-mode') !== null))
check('old session-header seat carries no switcher', await page.evaluate(() => document.querySelector('[data-slot="conversation.session.header.actions"] .chatgpt-mode') === null))
check('exactly one segment is selected', light.segment?.labels.filter((row) => row.pressed === 'true').length === 1)
check('expanded rail keeps the 36px New Session row', light.newSession?.height === 36, String(light.newSession?.height))
await page.screenshot({ path: join(outDir, 'phase1-light.png') })

/* Brand click: menu opens, host starts no session, Escape restores focus. */
const rowsBefore = light.sessions
await page.click('[data-chatgpt-brand-switcher]')
await page.waitForTimeout(250)
const menuOpen = await measure()
check('brand menu opens', menuOpen.menu === true)
check('brand menu keeps two rows with one checked', await page.evaluate(() => {
  const rows = [...document.querySelectorAll('.chatgpt-brand-menu-item')]
  return rows.length === 2 && rows.filter((row) => row.getAttribute('aria-checked') === 'true').length === 1
}))
check('opening the menu starts no session', menuOpen.sessions === rowsBefore, `${rowsBefore} -> ${menuOpen.sessions}`)
check('menu rows are named Chat and Work', await page.evaluate(() => [...document.querySelectorAll('.chatgpt-brand-menu-label')].map((node) => node.textContent).join('/') === 'Chat/Work'))
check('menu moves focus to the checked product', await page.evaluate(() => document.activeElement?.getAttribute('data-product') === document.querySelector('.chatgpt-brand-menu-item[aria-checked="true"]')?.getAttribute('data-product')))
await page.screenshot({ path: join(outDir, 'phase1-menu-light.png') })

await page.keyboard.press('ArrowUp')
check('arrow keys move menu focus', await page.evaluate(() => document.activeElement?.getAttribute('data-product') === 'chat'))
await page.keyboard.press('Escape')
await page.waitForTimeout(150)
check('Escape closes the menu', await page.evaluate(() => document.querySelector('[data-chatgpt-brand-menu]') === null))
check('Escape restores focus to the switcher', await page.evaluate(() => document.activeElement?.hasAttribute('data-chatgpt-brand-switcher') === true))
check('closing the menu starts no session', (await measure()).sessions === rowsBefore)

/* Keyboard open from the trigger, then an outside click. */
await page.keyboard.press('Enter')
await page.waitForTimeout(200)
check('Enter opens the menu from the focused trigger', (await measure()).menu === true)
check('keyboard open starts no session', (await measure()).sessions === rowsBefore)
await page.mouse.click(900, 600)
await page.waitForTimeout(200)
check('outside click closes the menu', (await measure()).menu === false)
check('outside click starts no session', (await measure()).sessions === rowsBefore)

/* Product switch: click the other row, verify state + persistence, restore. */
if (light.sessions === 0) {
  failures.push('switch test needs one blank session in the scratch profile')
} else {
  const target = light.mode === 'chat' ? 'agent' : 'chat'
  const targetLabel = target === 'chat' ? 'Chat' : 'Work'
  const targetRows = (await measure()).sessions
  const targetUrl = (await measure()).url
  await page.click('[data-chatgpt-brand-switcher]')
  await page.waitForTimeout(200)
  await page.click(`.chatgpt-brand-menu-item[data-product="${target}"]`)
  await page.waitForTimeout(1200)
  const switched = await measure()
  check('menu closes after choosing a product', switched.menu === false)
  check('choosing a product changes the mode', switched.mode === target, `${light.mode} -> ${switched.mode}`)
  check('brand follows the chosen product', switched.brand?.text.includes(targetLabel) === true, switched.brand?.text)
  check('header segment follows the chosen product', switched.segment?.labels.filter((row) => row.pressed === 'true').map((row) => row.text).join('/') === targetLabel, JSON.stringify(switched.segment?.labels))
  check('switch does not create a session', switched.sessions === targetRows, `${targetRows} -> ${switched.sessions}`)
  check('switch keeps the URL', switched.url === targetUrl, `${targetUrl} -> ${switched.url}`)

  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('[data-slot="sidebar"]', { timeout: 60000 })
  await page.waitForFunction(() => document.body.getAttribute('data-chatgpt-ui') !== null, null, { timeout: 60000 })
  await page.waitForTimeout(1400)
  await dismissDialogs()
  const persisted = await measure()
  check('chosen product persists after reload (mode)', persisted.mode === target, String(persisted.mode))
  check('chosen product persists after reload (brand)', persisted.brand?.text.includes(targetLabel) === true, persisted.brand?.text)
  check('chosen product persists after reload (segment)', persisted.segment?.labels.filter((row) => row.pressed === 'true').map((row) => row.text).join('/') === targetLabel)

  await page.click('[data-chatgpt-brand-switcher]')
  await page.waitForTimeout(200)
  await page.click(`.chatgpt-brand-menu-item[data-product="${light.mode}"]`)
  await page.waitForTimeout(900)
  const restored = await measure()
  check('product can be switched back', restored.mode === light.mode, `${target} -> ${restored.mode}`)
}

/* Collapsed rail. */
await page.click('[data-slot="sidebar"] [class*="_toggle"]')
await page.waitForTimeout(450)
const rail = await measure()
check('sidebar reports collapsed', rail.collapsed === true)
check('rail item is 40x40', rail.newSession?.width === 40 && rail.newSession?.height === 40, JSON.stringify(rail.newSession))
check('rail icon is 20px', rail.newSessionIcon === '20px', rail.newSessionIcon)
check('panel rows are 40x40', rail.panelRows.every((row) => row.width === 40 && row.height === 40), JSON.stringify(rail.panelRows))
check('panel icons are 20px', rail.panelIcons.every((size) => size === '20px'), JSON.stringify(rail.panelIcons))
await page.screenshot({ path: join(outDir, 'phase1-rail-light.png') })

/* Expand again for the dark full shot, then collapse for the dark rail. */
await page.click('[data-slot="sidebar"] [class*="_toggle"]')
await page.waitForTimeout(400)
await page.emulateMedia({ colorScheme: 'dark' })
await page.waitForFunction(() => document.body.hasAttribute('data-ds-dark-theme'), null, { timeout: 15000 })
await page.waitForTimeout(500)
const dark = await measure()
check('dark theme is active', dark.dark === true)
await page.screenshot({ path: join(outDir, 'phase1-dark.png') })
await page.click('[data-slot="sidebar"] [class*="_toggle"]')
await page.waitForTimeout(450)
const darkRail = await measure()
check('dark rail item is 40x40', darkRail.newSession?.width === 40 && darkRail.newSession?.height === 40)
await page.screenshot({ path: join(outDir, 'phase1-rail-dark.png') })

const summary = { light, menuOpen, rail, dark, darkRail, failures, errors: errors.slice(0, 20) }
console.log(JSON.stringify(summary, null, 2))
await browser.close()

if (errors.length > 0 || failures.length > 0) {
  console.error(`FAIL  ${failures.length} geometry/interaction check(s), ${errors.length} console error(s)`)
  process.exit(1)
}
console.log('PASS  phase 1 screenshots and geometry')
