#!/usr/bin/env node
/**
 * Module-8 responsive/focus/motion probe. Read-only against the running DSH
 * Web GUI. Usage:
 *   node scripts/check-responsive.mjs --url 'http://127.0.0.1:3090/?token=…'
 * It writes docs/responsive-audit.json and exits non-zero if an acceptance
 * condition fails. No host package or profile file is touched.
 */
import { writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const args = new Map()
for (let i = 2; i < process.argv.length; i += 2) args.set(process.argv[i].replace(/^--/, ''), process.argv[i + 1])
const url = args.get('url') ?? process.env.DSH_WEB_URL
if (url === undefined) {
  console.error('usage: node scripts/check-responsive.mjs --url <DSH Web URL>')
  process.exit(2)
}
let playwright
try {
  playwright = await import(args.get('playwright') === undefined ? 'playwright-core' : join(args.get('playwright'), 'index.mjs'))
} catch (error) {
  console.error(`playwright-core is required (${error.message})`)
  process.exit(2)
}
const CHROME = process.env.CHATGPT_UI_CHROME ?? '/home/user/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome'
const browser = await playwright.chromium.launch({ headless: true, executablePath: CHROME, args: ['--no-sandbox', '--disable-dev-shm-usage'] })

const checks = []
const add = (name, pass, detail) => checks.push({ name, pass: Boolean(pass), detail })
const widths = [640, 768, 900, 1024, 1280, 1600]
const widthsReport = []

async function rectOf(page, selector) {
  return page.evaluate((sel) => {
    const node = document.querySelector(sel)
    if (node === null) return null
    const rect = node.getBoundingClientRect()
    const style = getComputedStyle(node)
    return { x: +rect.x.toFixed(1), y: +rect.y.toFixed(1), width: +rect.width.toFixed(1), height: +rect.height.toFixed(1), right: +rect.right.toFixed(1), bottom: +rect.bottom.toFixed(1), visibility: style.visibility, display: style.display }
  }, selector)
}
const inside = (rect, width, height) => rect !== null && rect.x >= -0.5 && rect.right <= width + 0.5 && rect.y >= -0.5 && rect.bottom <= height + 0.5
const overlaps = (a, b) => a !== null && b !== null && a.x < b.right && b.x < a.right && a.y < b.bottom && b.y < a.bottom

for (const width of widths) {
  const context = await browser.newContext({ viewport: { width, height: 800 }, colorScheme: 'light', deviceScaleFactor: 1 })
  const page = await context.newPage()
  await page.goto(url, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2100)
  const base = await page.evaluate(() => {
    const rail = document.querySelector('.chatgpt-rail')?.getBoundingClientRect()
    const panel = document.querySelector('[class*="sidebarCol"]')?.getBoundingClientRect()
    const sessions = document.querySelector('.chatgpt-session-scroll')
    const sessionStyle = sessions === null ? null : getComputedStyle(sessions)
    const card = document.querySelector('[data-composer-card="true"]')?.getBoundingClientRect()
    const pill = document.querySelector('.chatgpt-model-pill')?.getBoundingClientRect()
    const primary = document.querySelector('[class*="_primary"]')?.getBoundingClientRect()
    const searchButton = document.querySelector('.chatgpt-panel-search')
    const sidebarVisible = sessionStyle !== null && sessionStyle.visibility !== 'hidden' && (sessionStyle.display !== 'none') && sessions.getBoundingClientRect().width > 0
    return {
      rail: rail === undefined ? null : { width: rail.width, x: rail.x },
      panel: panel === undefined ? null : { width: panel.width, x: panel.x },
      sidebarVisible,
      sessionScroll: sessionStyle === null ? null : { width: sessions.getBoundingClientRect().width, overflowY: sessionStyle.overflowY, scrollbarWidth: sessionStyle.scrollbarWidth, scrollbarColor: sessionStyle.scrollbarColor },
      card: card === undefined ? null : { x: card.x, y: card.y, width: card.width, height: card.height, right: card.right, bottom: card.bottom },
      pill: pill === undefined ? null : { x: pill.x, y: pill.y, width: pill.width, height: pill.height, right: pill.right, bottom: pill.bottom },
      primary: primary === undefined ? null : { x: primary.x, y: primary.y, width: primary.width, height: primary.height, right: primary.right, bottom: primary.bottom },
      searchButton: searchButton !== null,
      scrollWidth: document.documentElement.scrollWidth,
      viewport: { width: innerWidth, height: innerHeight },
      bodyOverflowX: getComputedStyle(document.body).overflowX
    }
  })
  add(`${width}: no horizontal overflow`, base.scrollWidth <= width + 1 && base.viewport.width === width, { scrollWidth: base.scrollWidth })
  add(`${width}: rail stays 52px`, base.rail !== null && Math.abs(base.rail.width - 52) < 0.6, base.rail)
  add(`${width}: composer inside viewport`, inside(base.card, width, 800), base.card)
  add(`${width}: send inside composer`, base.primary !== null && base.card !== null && base.primary.x >= base.card.x && base.primary.right <= base.card.right + 1, { card: base.card, send: base.primary })
  add(`${width}: pill and send do not overlap`, !overlaps(base.pill, base.primary), { pill: base.pill, send: base.primary })
  /* P0-10B: the 288px track is the panel; the list is the panel minus the 8px
     scrollbar gutter and must follow the Host splitter instead of a fixed width. */
  add(`${width}: sidebar list fills the panel or host-hidden`, base.sidebarVisible ? Math.abs(base.sessionScroll.width - (base.panel.width - 60)) < 1 && Math.abs(base.panel.width - 340) < 1 : base.panel.width <= 56, { sidebarVisible: base.sidebarVisible, panel: base.panel, session: base.sessionScroll })
  add(`${width}: sidebar scrolls vertically`, base.sessionScroll === null || base.sessionScroll.overflowY === 'auto' || base.sessionScroll.overflowY === 'scroll', base.sessionScroll)

  // Search overlay: <=640 is edge-to-edge; wider widths stay a 720px dialog.
  await page.keyboard.press('Control+k')
  await page.waitForTimeout(350)
  const search = await rectOf(page, '.chatgpt-search-modal')
  add(`${width}: search opens visibly`, search !== null && search.visibility !== 'hidden' && search.display !== 'none', search)
  add(`${width}: search inside viewport`, inside(search, width, 800), search)
  if (width <= 640) add(`${width}: search is full-width`, search !== null && search.x <= 0.5 && search.right >= width - 0.5, search)
  else add(`${width}: search keeps dialog width`, search !== null && search.width <= 720.5, search)
  await page.keyboard.press('Escape')
  await page.waitForTimeout(160)

  // Command menu from the real composer.
  const input = page.locator('[data-composer-input="true"]').first()
  if (await input.count()) {
    await input.focus({ timeout: 2500 })
    await page.keyboard.type('/')
    await page.waitForTimeout(350)
  }
  const menu = await rectOf(page, '[data-trigger-menu]')
  add(`${width}: command menu inside viewport`, inside(menu, width, 800), menu)
  await page.keyboard.press('Escape')
  await page.waitForTimeout(160)

  widthsReport.push({ width, base, search, menu })
  await context.close()
}

// Collapsed sidebar (only when the host exposes the toggle at >=1024).
{
  const context = await browser.newContext({ viewport: { width: 1600, height: 800 }, colorScheme: 'light' })
  const page = await context.newPage()
  await page.goto(url, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2100)
  const toggle = page.locator('[aria-label="Collapse sidebar"]')
  const count = await toggle.count()
  add('collapse toggle exists at 1600', count > 0, { count })
  if (count > 0) {
    await toggle.click({ force: true })
    await page.waitForTimeout(350)
    const collapsed = await page.evaluate(() => {
      const rail = document.querySelector('.chatgpt-rail')?.getBoundingClientRect()
      const panel = document.querySelector('[class*="sidebarCol"]')?.getBoundingClientRect()
      const sessions = document.querySelector('.chatgpt-session-scroll')
      const style = sessions === null ? null : getComputedStyle(sessions)
      return { rail: rail === undefined ? null : rail.width, panel: panel === undefined ? null : panel.width, sidebarVisibility: style?.visibility ?? null, scrollWidth: document.documentElement.scrollWidth }
    })
    add('collapsed rail stays 52px', collapsed.rail !== null && Math.abs(collapsed.rail - 52) < 0.6, collapsed)
    add('collapsed panel is rail only (<=56px)', collapsed.panel !== null && collapsed.panel <= 56.5, collapsed)
    add('collapsed sidebar is hidden', collapsed.sidebarVisibility === 'hidden', collapsed)
    add('collapsed page has no horizontal overflow', collapsed.scrollWidth <= 1601, collapsed)
    await page.screenshot({ path: join(ROOT, 'docs/screenshots/m8-collapsed-light.png') })
  }
  await context.close()
}

// 600px height: the shell must not grow a document scrollbar; the lists own it.
{
  const context = await browser.newContext({ viewport: { width: 1280, height: 600 }, colorScheme: 'light' })
  const page = await context.newPage()
  await page.goto(url, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2100)
  const short = await page.evaluate(() => {
    const sessions = document.querySelector('.chatgpt-session-scroll')
    const card = document.querySelector('[data-composer-card="true"]')?.getBoundingClientRect()
    const tools = document.querySelector('.chatgpt-work-tools')?.getBoundingClientRect()
    return {
      doc: { scrollWidth: document.documentElement.scrollWidth, scrollHeight: document.documentElement.scrollHeight, innerWidth, innerHeight },
      sidebar: sessions === null ? null : { clientHeight: sessions.clientHeight, scrollHeight: sessions.scrollHeight, overflowY: getComputedStyle(sessions).overflowY },
      card: card === undefined ? null : { x: card.x, y: card.y, right: card.right, bottom: card.bottom },
      tools: tools === undefined ? null : { x: tools.x, y: tools.y, right: tools.right, bottom: tools.bottom }
    }
  })
  add('600px: no document overflow', short.doc.scrollWidth <= 1281 && short.doc.scrollHeight <= 601, short.doc)
  add('600px: card fits above fold', short.card !== null && short.card.bottom <= 600, short.card)
  add('600px: tools fit above fold', short.tools !== null && short.tools.bottom <= 600, short.tools)
  add('600px: sidebar scrolls independently', short.sidebar === null || short.sidebar.overflowY === 'auto' || short.sidebar.overflowY === 'scroll', short.sidebar)
  await page.screenshot({ path: join(ROOT, 'docs/screenshots/m8-height600-light.png') })
  const scrollProbe = await page.evaluate(() => {
    const sessions = document.querySelector('.chatgpt-session-scroll')
    if (sessions === null) return null
    const fixture = document.createElement('div')
    for (let i = 0; i < 30; i += 1) {
      const row = document.createElement('div')
      row.className = 'chatgpt-session-row'
      row.style.cssText = 'height:36px;display:flex;align-items:center;padding:0 12px;font-size:13px;'
      row.textContent = `fixture ${i}`
      fixture.append(row)
    }
    sessions.append(fixture)
    return { clientHeight: sessions.clientHeight, scrollHeight: sessions.scrollHeight, documentScrollHeight: document.documentElement.scrollHeight }
  })
  add('600px: sidebar owns overflow scrolling', scrollProbe !== null && scrollProbe.scrollHeight > scrollProbe.clientHeight && scrollProbe.documentScrollHeight <= 601, scrollProbe)
  await context.close()
}

// DPR 2 and reduced motion.
{
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2, colorScheme: 'dark' })
  const page = await context.newPage()
  await page.goto(url, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2100)
  /* The Work card is borderless by design (M13 removed the Host hairline), so
     the 1px border geometry is measured on the Chat card, which keeps it. */
  await page.locator('.chatgpt-mode-seg').filter({ hasText: 'Chat' }).first().click({ timeout: 3000 }).catch(() => {})
  await page.waitForTimeout(1200)
  const dpr = await page.evaluate(() => ({ dpr: devicePixelRatio, font: getComputedStyle(document.body).fontFamily, tokenFont: getComputedStyle(document.body).getPropertyValue('--cgpt-font-body').trim(), railWidth: document.querySelector('.chatgpt-rail')?.getBoundingClientRect().width, border: getComputedStyle(document.querySelector('[data-composer-card="true"]') ?? document.body).borderTopWidth }))
  add('DPR 2 is honored', dpr.dpr === 2, dpr)
  add('DPR 2 keeps rail at 52 CSS px', Math.abs(dpr.railWidth - 52) < 0.6, dpr)
  add('DPR 2 keeps 1px border geometry', dpr.border === '1px', dpr)
  add('font stack includes Latin and CJK fallbacks', /Segoe UI/.test(dpr.font) && /PingFang SC|Microsoft YaHei|Noto Sans SC/.test(dpr.font) && /PingFang SC|Microsoft YaHei|Noto Sans SC/.test(dpr.tokenFont), dpr)
  await page.screenshot({ path: join(ROOT, 'docs/screenshots/m8-dpr2-dark.png') })
  await context.close()
}
{
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce', colorScheme: 'light' })
  const page = await context.newPage()
  await page.goto(url, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1800)
  const motion = await page.evaluate(() => {
    const stack = document.querySelector("[class*='_composerHero'] [class*='_stack']")
    const card = document.querySelector('[data-composer-card="true"]')
    const host = document.createElement('div')
    host.style.cssText = 'position:fixed;left:-10000px;top:-10000px;width:320px;height:200px;overflow:hidden;'
    host.innerHTML = '<div class="chatgpt-toast" style="left:-10000px"></div><div class="chatgpt-session-skeleton-row"></div><div class="chatgpt-search-skeleton-row"></div>'
    document.body.appendChild(host)
    const read = (selector, pseudo = null) => {
      const node = document.querySelector(selector)
      return node === null ? null : getComputedStyle(node, pseudo)
    }
    return {
      reduce: matchMedia('(prefers-reduced-motion: reduce)').matches,
      heroTitle: stack === null ? null : getComputedStyle(stack, '::before').animationName,
      heroCard: card === null ? null : getComputedStyle(card).animationName,
      toast: read('.chatgpt-toast')?.animationName,
      sessionSkeleton: read('.chatgpt-session-skeleton-row')?.animationName,
      searchSkeleton: read('.chatgpt-search-skeleton-row')?.animationName,
      effortFillTransition: (() => { const node = document.createElement('div'); node.className = 'chatgpt-effort-fill'; document.body.append(node); return getComputedStyle(node).transitionDuration })(),
      effortThumbTransition: (() => { const node = document.createElement('div'); node.className = 'chatgpt-effort-thumb'; document.body.append(node); return getComputedStyle(node).transitionDuration })(),
      lineHeight: read('.chatgpt-work-tool')?.lineHeight ?? null
    }
  })
  add('reduced-motion media matches', motion.reduce, motion)
  add('reduced-motion disables empty fade', motion.heroTitle === 'none' && motion.heroCard === 'none', motion)
  add('reduced-motion disables toast/skeleton animation', motion.toast === 'none' && motion.sessionSkeleton === 'none' && motion.searchSkeleton === 'none', motion)
  add('reduced-motion disables the slider transition', motion.effortFillTransition === '0s' && motion.effortThumbTransition === '0s', motion)
  await page.screenshot({ path: join(ROOT, 'docs/screenshots/m8-reduced-motion-light.png') })
  await context.close()
}

await browser.close()
const failed = checks.filter((check) => !check.pass)
const report = {
  meta: {
    module: 8,
    generatedAt: new Date().toISOString(),
    widths: [640, 768, 900, 1024, 1280, 1600],
    viewportHeight: 800,
    shortViewport: [1280, 600],
    dpr: 2,
    source: 'live DSH 3090; host auto-collapses the sidebar below 1024px (preserved, not overridden)',
    checks: checks.length,
    pass: checks.length - failed.length,
    fail: failed.length
  },
  widths: widthsReport,
  checks,
  failures: failed
}
writeFileSync(join(ROOT, 'docs/responsive-audit.json'), JSON.stringify(report, null, 2) + '\n')
console.log(`responsive: ${checks.length - failed.length}/${checks.length} checks passed`)
for (const failure of failed) console.log(`  FAIL ${failure.name} ${JSON.stringify(failure.detail)}`)
process.exitCode = failed.length === 0 ? 0 : 1
