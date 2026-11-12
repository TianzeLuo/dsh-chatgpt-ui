#!/usr/bin/env node
/**
 * Phase 2 acceptance shots: measured 52px rail + 288px panel, 340px track,
 * New chat 276×35, panel search 36, 224×36 segment, collapsed rail, and the
 * Settings → Plugins path. Also asserts the values in the live DOM.
 *
 * Dev-only, like scripts/phase1-shots.mjs. It needs playwright-core and a
 * Chromium build; it writes only below --out (default docs/screenshots).
 *
 *   node scripts/phase2-shots.mjs --url "http://127.0.0.1:3099/?token=..." \
 *     --playwright /path/to/node_modules/playwright-core
 *
 * Exit 1 on any failed geometry/action assertion, console error, or missing
 * mount marker. PNGs and the JSON summary are still written for inspection.
 */

import { mkdirSync, writeFileSync } from 'node:fs'
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
const CHROME = process.env.CHATGPT_UI_CHROME ?? process.env.HOME + '/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome'
const browser = await playwright.chromium.launch({ headless: true, executablePath: CHROME, args: ['--no-sandbox', '--disable-dev-shm-usage'] })
const failures = []
const check = (name, condition, detail) => {
  if (!condition) failures.push(`${name}${detail === undefined ? '' : ` (${detail})`}`)
}
const summary = {}

async function openPage(colorScheme) {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1, colorScheme })
  const errors = []
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto(url, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('[data-slot="sidebar"]', { timeout: 60000 })
  await page.waitForFunction(() => document.body.getAttribute('data-chatgpt-ui') !== null, null, { timeout: 60000 })
  await dismissDialogs(page)
  await page.waitForTimeout(1400)
  await dismissDialogs(page)
  return { page, errors }
}

/** The scratch profile shows the onboarding dialog twice (welcome, then a
 *  delayed API-key prompt). Wait for three clear samples before a capture. */
async function dismissDialogs(page) {
  let clean = 0
  for (let attempt = 0; attempt < 30 && clean < 3; attempt += 1) {
    const dialogs = page.locator('[role="dialog"]')
    const count = await dialogs.count()
    if (count === 0) {
      clean += 1
      await page.waitForTimeout(350)
      continue
    }
    clean = 0
    // Use a trusted click: the onboarding dialog ignores a synthetic .click().
    await page.locator('[role="dialog"] button[aria-label="Close"]').first().click({ timeout: 1500 }).catch(() => {})
    await page.waitForTimeout(450)
  }
  if ((await page.locator('[role="dialog"]').count()) > 0) await page.keyboard.press('Escape').catch(() => {})
  await page.waitForTimeout(250)
}

async function measure(page) {
  return page.evaluate(() => {
    const q = (selector) => document.querySelector(selector)
    const rect = (element) => {
      if (element === null) return null
      const box = element.getBoundingClientRect()
      return { x: box.x, y: box.y, w: box.width, h: box.height }
    }
    const style = (selector, pseudo) => (q(selector) === null ? null : getComputedStyle(q(selector), pseudo))
    const selected = q('.chatgpt-mode-seg[aria-pressed="true"]')
    return {
      grid: q('[class*="_frame"]')?.style.gridTemplateColumns,
      rail: rect(q('.chatgpt-rail')),
      railItems: [...document.querySelectorAll('.chatgpt-rail-button')].map((button) => ({
        label: button.getAttribute('aria-label'),
        rect: rect(button),
        icon: rect(button.querySelector('svg'))
      })),
      panel: rect(q('[data-slot="sidebar"]')?.firstElementChild),
      panelRadius: q('[data-slot="sidebar"]')?.firstElementChild === null ? null : getComputedStyle(q('[data-slot="sidebar"]').firstElementChild).borderTopLeftRadius,
      header: rect(q('[data-slot="sidebar"] [data-window-drag]')),
      newChat: rect(q('[data-slot="sidebar"] [class*="_newSession"]')),
      search: rect(q('.chatgpt-panel-search')),
      group: rect(q('.chatgpt-mode-group')),
      segment: rect(q('.chatgpt-mode-seg')),
      thumb: selected === null ? null : { w: style('.chatgpt-mode-seg[aria-pressed="true"]', '::before').width, h: style('.chatgpt-mode-seg[aria-pressed="true"]', '::before').height },
      section: rect(q('[data-slot="sidebar"] [class*="_sectionHeader"]')),
      sectionFont: style('[data-slot="sidebar"] [class*="_sectionLabel"]')?.fontSize ?? null,
      sectionColor: style('[data-slot="sidebar"] [class*="_sectionLabel"]')?.color ?? null,
      surfaces: {
        body: style('body').backgroundColor,
        rail: style('.chatgpt-rail').backgroundColor,
        panel: q('[data-slot="sidebar"]')?.firstElementChild === null ? null : getComputedStyle(q('[data-slot="sidebar"]').firstElementChild).backgroundColor
      },
      collapsed: q('[class*="_frame"]')?.hasAttribute('data-sidebar-collapsed') ?? false
    }
  })
}

async function assertPage(label, page, colorScheme) {
  const m = await measure(page)
  summary[label] = m
  check(`${label}: 340px host track`, m.grid?.startsWith('340px '), m.grid)
  check(`${label}: rail 52`, m.rail?.w === 52, JSON.stringify(m.rail))
  check(`${label}: panel 288 at x=52`, m.panel?.w === 288 && m.panel?.x === 52, JSON.stringify(m.panel))
  check(`${label}: panel top-left radius 16`, m.panelRadius === '16px', m.panelRadius)
  check(`${label}: New chat 266×35`, m.newChat?.w === 266 && m.newChat?.h === 35, JSON.stringify(m.newChat))
  check(`${label}: search 36`, m.search?.w === 36 && m.search?.h === 36, JSON.stringify(m.search))
  check(`${label}: segment 224×36`, m.group?.w === 224 && m.group?.h === 36, JSON.stringify(m.group))
  check(`${label}: segment item 112×36`, m.segment?.w === 112 && m.segment?.h === 36, JSON.stringify(m.segment))
  check(`${label}: thumb 121×37`, m.thumb?.w === '121px' && m.thumb?.h === '37px', JSON.stringify(m.thumb))
  check(`${label}: seven rail entries`, m.railItems.length === 7, JSON.stringify(m.railItems.map((item) => item.label)))
  check(`${label}: rail buttons 36, icons 20`, m.railItems.every((item) => item.rect?.w === 36 && item.rect?.h === 36 && item.icon?.w === 20 && item.icon?.h === 20))
  check(`${label}: settings pinned bottom`, m.railItems.at(-1)?.label === '设置' && m.railItems.at(-1)?.rect?.y > 900)
  check(`${label}: group heading 14px`, m.sectionFont === '14px', m.sectionFont)
  if (colorScheme === 'dark') {
    check(`${label}: main #0e0e0e`, m.surfaces.body === 'rgb(14, 14, 14)', m.surfaces.body)
    check(`${label}: rail #000`, m.surfaces.rail === 'rgb(0, 0, 0)', m.surfaces.rail)
    check(`${label}: heading #afafaf`, m.sectionColor === 'rgb(175, 175, 175)', m.sectionColor)
  } else {
    check(`${label}: main #fcfcfc`, m.surfaces.body === 'rgb(252, 252, 252)', m.surfaces.body)
    check(`${label}: rail #f9f9f9`, m.surfaces.rail === 'rgb(249, 249, 249)', m.surfaces.rail)
  }
}

const light = await openPage('light')
await assertPage('light', light.page, 'light')
await dismissDialogs(light.page)
await light.page.evaluate(() => document.activeElement?.blur())
await light.page.screenshot({ path: join(outDir, 'phase2-light.png') })
await light.page.screenshot({ path: join(outDir, 'phase2-rail-light.png'), clip: { x: 0, y: 0, width: 120, height: 1000 } })
await light.page.screenshot({ path: join(outDir, 'phase2-sidebar-top-light.png'), clip: { x: 0, y: 0, width: 340, height: 260 } })

// 500ms tooltip, then the Settings launcher and its Plugins section.
await dismissDialogs(light.page)
await light.page.hover('.chatgpt-rail-button[data-cgpt-rail-item="home"]')
await light.page.waitForTimeout(620)
check('light: tooltip appears after 500ms', (await light.page.$eval('.chatgpt-rail-tooltip', (node) => node.textContent).catch(() => null)) === '首页')
await light.page.mouse.move(800, 500)
await light.page.click('.chatgpt-rail-button[data-cgpt-rail-item="settings"]')
await light.page.waitForTimeout(650)
const settings = await light.page.evaluate(() => ({
  open: document.querySelector('[data-shortcut-modal="settings"]') !== null,
  plugins: [...document.querySelectorAll('button')].some((button) => /plugins/i.test(button.textContent ?? '')),
  active: document.querySelector('.chatgpt-rail-button[data-cgpt-rail-item="settings"]')?.getAttribute('aria-current')
}))
summary.settings = settings
check('light: Settings opens', settings.open === true)
check('light: Plugins reachable in Settings', settings.plugins === true)
check('light: Settings rail active', settings.active === 'page')
await light.page.screenshot({ path: join(outDir, 'phase2-settings-light.png') })
await light.page.keyboard.press('Escape')
await light.page.waitForTimeout(500)

await light.page.click('.chatgpt-rail-button[data-cgpt-rail-item="more"]')
await light.page.waitForTimeout(250)
const moreItems = await light.page.$$eval('.chatgpt-rail-menu-item', (nodes) => nodes.map((node) => node.textContent.trim()))
check('light: more exposes Chat/Work', moreItems.includes('Chat') && moreItems.includes('Work'), JSON.stringify(moreItems))
await light.page.locator('.chatgpt-rail-menu-item', { hasText: '定时任务' }).click()
await light.page.waitForTimeout(600)
check('light: more closes after panel action', (await light.page.evaluate(() => document.querySelector('.chatgpt-rail-menu') === null)))
await light.page.click('.chatgpt-rail-button[data-cgpt-rail-item="more"]')
await light.page.waitForTimeout(250)
await light.page.locator('.chatgpt-rail-menu-item', { hasText: 'Work' }).click()
await light.page.waitForTimeout(500)

await light.page.click('[data-slot="sidebar"] button[aria-label="Collapse sidebar"]')
await light.page.waitForTimeout(700)
const collapsedLight = await measure(light.page)
summary.collapsedLight = collapsedLight
check('light collapsed: rail still 52', collapsedLight.rail?.w === 52, JSON.stringify(collapsedLight.rail))
check('light collapsed: panel search hidden', collapsedLight.search === null)
check('light collapsed: seven rail entries', collapsedLight.railItems.length === 7)
await light.page.screenshot({ path: join(outDir, 'phase2-collapsed-light.png') })
check('light: no console errors', light.errors.length === 0, light.errors.join(' | '))
await light.page.close()

const dark = await openPage('dark')
await assertPage('dark', dark.page, 'dark')
await dismissDialogs(dark.page)
await dark.page.evaluate(() => document.activeElement?.blur())
await dark.page.screenshot({ path: join(outDir, 'phase2-dark.png') })
await dark.page.screenshot({ path: join(outDir, 'phase2-rail-dark.png'), clip: { x: 0, y: 0, width: 120, height: 1000 } })
await dark.page.screenshot({ path: join(outDir, 'phase2-sidebar-top-dark.png'), clip: { x: 0, y: 0, width: 340, height: 260 } })
await dark.page.click('[data-slot="sidebar"] button[aria-label="Collapse sidebar"]')
await dark.page.waitForTimeout(700)
const collapsedDark = await measure(dark.page)
summary.collapsedDark = collapsedDark
check('dark collapsed: rail still 52', collapsedDark.rail?.w === 52, JSON.stringify(collapsedDark.rail))
await dark.page.screenshot({ path: join(outDir, 'phase2-collapsed-dark.png') })
check('dark: no console errors', dark.errors.length === 0, dark.errors.join(' | '))
await dark.page.close()

writeFileSync(join(outDir, 'phase2-measurements.json'), `${JSON.stringify({ at: new Date().toISOString(), summary, failures }, null, 2)}\n`)
await browser.close()
if (failures.length > 0) {
  console.error(`FAIL  ${failures.length} Phase 2 assertion(s):`)
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}
console.log('PASS  Phase 2 rail/panel/settings/light/dark/collapsed assertions')
console.log(`wrote ${outDir}/phase2-*.png and phase2-measurements.json`)
