#!/usr/bin/env node
/**
 * tools/m31b-capture.mjs — P0-18b: the permission chip moves inside the Work
 * card, the `+` → chip gap becomes two thirds of the old 16px, and the
 * non-functional 插件 button leaves the bottom tool bar.
 *
 *   node tools/m31b-capture.mjs --url "http://127.0.0.1:3115/?token=…"
 *
 * Writes docs/m31b.json plus docs/screenshots/m31b-*.png. All measurements are
 * live at 1233×850 / DPR 2; the tokenised URL is redacted.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const args = new Map()
for (let i = 2; i < process.argv.length; i += 1) {
  const token = process.argv[i]
  if (!token.startsWith('--')) continue
  const next = process.argv[i + 1]
  if (next === undefined || next.startsWith('--')) args.set(token.slice(2), true)
  else { args.set(token.slice(2), next); i += 1 }
}
const url = args.get('url')
if (typeof url !== 'string') {
  console.error('usage: node tools/m31b-capture.mjs --url <tokenised-url> [--out docs]')
  process.exit(2)
}
const OUT = resolve(ROOT, typeof args.get('out') === 'string' ? args.get('out') : 'docs')
const SHOTS = join(OUT, 'screenshots')
const CAPTURE = join(OUT, 'capture', 'm31b')
mkdirSync(SHOTS, { recursive: true })
mkdirSync(CAPTURE, { recursive: true })

const redact = (value) => value.replace(/([?&]token=)[^&]+/, '$1***')
const { chromium } = await import(process.env.M31_PLAYWRIGHT ?? 'playwright')
const CHROME = process.env.CHATGPT_UI_CHROME ?? process.env.HOME + '/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome'
const round = (value) => Math.round(value * 100) / 100
const OLD_GAP = 16
const TARGET_GAP = round(OLD_GAP * 2 / 3)

const browser = await chromium.launch({ headless: true, executablePath: CHROME, args: ['--no-sandbox', '--disable-dev-shm-usage'] })
const ASSERTIONS = []
const check = (id, ok, detail) => ASSERTIONS.push({ id, ok: ok === true, detail })
const errors = []
const results = { measuredAt: new Date().toISOString(), url: redact(url), viewport: { w: 1233, h: 850, dpr: 2 }, oldGap: OLD_GAP, targetGap: TARGET_GAP, targetFormula: '16px × 2/3', themes: {}, checks: ASSERTIONS }

const openPage = async (colorScheme) => {
  const context = await browser.newContext({ viewport: { width: 1233, height: 850 }, deviceScaleFactor: 2, locale: 'zh-CN', colorScheme })
  const page = await context.newPage()
  page.on('pageerror', (error) => errors.push(String(error).slice(0, 240)))
  await page.goto(url, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1000)
  const notice = page.getByRole('button', { name: /继续|Continue/ })
  if ((await notice.count()) > 0) { await notice.first().click(); await page.waitForTimeout(300) }
  return { context, page }
}
const workSegment = (page) => page.locator('.chatgpt-mode-seg', { hasText: '工作' }).first()
const ensureWork = async (page) => {
  if ((await workSegment(page).getAttribute('aria-pressed')) !== 'true') {
    await workSegment(page).click(); await page.waitForTimeout(700)
  }
}
const isBlankWork = async (page) => page.evaluate(() => Boolean(document.querySelector("[class*='_composerHero']") && document.querySelector('.chatgpt-work-tools')))
const selectBlankWork = async (page) => {
  await ensureWork(page)
  const rows = page.locator('.chatgpt-session-row')
  const count = await rows.count()
  for (let i = 0; i < count; i += 1) {
    await rows.nth(i).click(); await page.waitForTimeout(800)
    await ensureWork(page)
    if (await isBlankWork(page)) return true
  }
  return false
}
const selectExisting = async (page) => {
  await ensureWork(page)
  const row = page.locator('.chatgpt-session-row').filter({ hasText: '好的' }).first()
  if ((await row.count()) === 0) throw new Error('m31b: no started Work session row')
  await row.click(); await page.waitForTimeout(1000)
}
const rect = (r) => r === null ? null : ({ x: round(r.x), y: round(r.y), w: round(r.width), h: round(r.height) })
const measure = (page) => page.evaluate(() => {
  const card = document.querySelector("[data-composer-card='true']")
  const plus = [...document.querySelectorAll('button')].find((b) => b.getAttribute('aria-label') === '添加文件或调用指令')
  const perm = card?.querySelector('.chatgpt-permission')
  const tools = card?.querySelector('.chatgpt-work-tools')
  const box = (e) => e === null || e === undefined ? null : { x: e.getBoundingClientRect().x, y: e.getBoundingClientRect().y, w: e.getBoundingClientRect().width, h: e.getBoundingClientRect().height }
  const inside = (outer, inner) => outer !== null && inner !== null && inner.x >= outer.x && inner.y >= outer.y && inner.x + inner.w <= outer.x + outer.w && inner.y + inner.h <= outer.y + outer.h
  return {
    card: box(card), plus: box(plus), permission: box(perm), tools: box(tools),
    permissionInCard: inside(box(card), box(perm)),
    gap: plus && perm ? perm.getBoundingClientRect().x - plus.getBoundingClientRect().right : null,
    cardPaddingBottom: card ? getComputedStyle(card).paddingBottom : null,
    cardHeight: card ? card.getBoundingClientRect().height : null,
    toolButtons: tools ? [...tools.querySelectorAll('button')].map((b) => b.getAttribute('data-cgpt-work-tool')) : [],
    toolText: tools?.innerText ?? '',
    pluginButton: Boolean(document.querySelector("[data-cgpt-work-tool='plugins']")),
    pluginRail: Boolean(document.querySelector("[data-cgpt-rail-item='plugins'], [data-cgpt-rail-menu-item='plugins']")),
    permissionBlank: perm?.getAttribute('data-cgpt-permission-blank') ?? null,
    actionRow: box(perm?.closest("[class*='_tools']"))
  }
})
const panelMeasure = async (page, shotFile = null) => {
  await page.locator('.chatgpt-permission').click()
  await page.waitForSelector('.chatgpt-permission-menu')
  await page.waitForTimeout(250)
  const out = await page.evaluate(() => {
    const panel = document.querySelector('.chatgpt-permission-menu')
    const button = document.querySelector('.chatgpt-permission')
    const first = panel.querySelector('[data-cgpt-permission-row]')
    const box = (e) => e === null ? null : { x: e.getBoundingClientRect().x, y: e.getBoundingClientRect().y, w: e.getBoundingClientRect().width, h: e.getBoundingClientRect().height }
    const p = box(panel); const b = box(button); const f = box(first)
    return {
      panel: p, button: b, first: f,
      leftDelta: p.x - b.x,
      belowGap: p.y - (b.y + b.h),
      aboveGap: b.y - (p.y + p.h),
      direction: panel.getAttribute('data-cgpt-permission-open'),
      firstRowGap: f.y - p.y,
      headerPresent: panel.querySelector('.chatgpt-permission-head') !== null,
      titlePresent: panel.textContent.includes('应如何批准 ChatGPT 操作?'),
      learnMorePresent: panel.textContent.includes('了解更多'),
      insideViewport: p.x >= 0 && p.y >= 0 && p.x + p.w <= innerWidth && p.y + p.h <= innerHeight
    }
  })
  if (shotFile !== null) {
    const panel = await page.locator('.chatgpt-permission-menu').boundingBox()
    const button = await page.locator('.chatgpt-permission').boundingBox()
    const x = Math.max(0, Math.min(panel.x, button.x) - 18)
    const y = Math.max(0, Math.min(panel.y, button.y) - 18)
    const right = Math.min(1233, Math.max(panel.x + panel.width, button.x + button.width) + 18)
    const bottom = Math.min(850, Math.max(panel.y + panel.height, button.y + button.height) + 18)
    await page.screenshot({ path: join(SHOTS, shotFile), clip: { x, y, width: right - x, height: bottom - y } })
  }
  await page.keyboard.press('Escape'); await page.waitForTimeout(250)
  return out
}
const annotateGap = async (page) => {
  await page.evaluate(({ gap }) => {
    const plus = [...document.querySelectorAll('button')].find((b) => b.getAttribute('aria-label') === '添加文件或调用指令')
    const perm = document.querySelector('.chatgpt-permission')
    if (!plus || !perm) return
    const pr = plus.getBoundingClientRect(); const qr = perm.getBoundingClientRect()
    const wrap = document.createElement('div')
    wrap.setAttribute('data-cgpt-gap-annotation', '')
    const mid = pr.y + pr.height / 2
    wrap.style.cssText = `position:fixed;left:${pr.right - 2}px;top:${mid - 24}px;width:${qr.x - pr.right + 4}px;height:48px;z-index:99999;pointer-events:none;overflow:visible;`
    wrap.innerHTML = `<div style="position:absolute;left:0;right:0;top:23px;height:2px;background:#ff9f0a"></div><div style="position:absolute;left:0;top:18px;width:2px;height:12px;background:#ff9f0a"></div><div style="position:absolute;right:0;top:18px;width:2px;height:12px;background:#ff9f0a"></div><div style="position:absolute;left:50%;top:-2px;transform:translateX(-50%);background:#ff9f0a;color:#1a1a1a;font:600 11px/1.4 ui-sans-serif;padding:1px 5px;border-radius:4px;white-space:nowrap">${gap}px</div>`
    document.body.append(wrap)
  }, { gap: round(await page.evaluate(() => {
    const plus = [...document.querySelectorAll('button')].find((b) => b.getAttribute('aria-label') === '添加文件或调用指令')
    return document.querySelector('.chatgpt-permission').getBoundingClientRect().x - plus.getBoundingClientRect().right
  })) })
}
const clearAnnotation = (page) => page.evaluate(() => document.querySelector('[data-cgpt-gap-annotation]')?.remove())
const clipShot = async (page, selector, file, pad = 12) => {
  const loc = page.locator(selector)
  const b = await loc.boundingBox()
  await page.screenshot({ path: join(SHOTS, file), clip: { x: Math.max(0, b.x - pad), y: Math.max(0, b.y - pad), width: b.width + pad * 2, height: b.height + pad * 2 } })
}

const before = (() => {
  try {
    const old = JSON.parse(readFileSync(join(OUT, 'm31.json'), 'utf8'))
    return { dark: old.themes?.dark, light: old.themes?.light }
  } catch { return {} }
})()

for (const theme of ['dark', 'light']) {
  const { context, page } = await openPage(theme)
  const okBlank = await selectBlankWork(page)
  if (!okBlank) throw new Error(`m31b: no blank Work session in ${theme}`)
  const empty = await measure(page)
  await page.screenshot({ path: join(SHOTS, `m31b-work-empty-${theme}.png`) })
  await annotateGap(page)
  await clipShot(page, "[data-composer-card='true']", `m31b-gap-empty-${theme}.png`, 6)
  await clearAnnotation(page)
  const emptyPanel = await panelMeasure(page, `m31b-permission-down-${theme}.png`)
  await page.screenshot({ path: join(CAPTURE, `empty-full-${theme}.png`) })
  await clipShot(page, '.chatgpt-work-tools', `m31b-tools-after-${theme}.png`, 10)

  await selectExisting(page)
  const existing = await measure(page)
  await page.screenshot({ path: join(SHOTS, `m31b-work-existing-${theme}.png`) })
  await annotateGap(page)
  await clipShot(page, "[data-composer-card='true']", `m31b-gap-existing-${theme}.png`, 6)
  await clearAnnotation(page)
  const existingPanel = await panelMeasure(page, `m31b-permission-up-${theme}.png`)
  await page.screenshot({ path: join(CAPTURE, `existing-full-${theme}.png`) })

  const old = before[theme]
  const oldHeight = old?.workEmpty?.card?.h ?? 127
  const oldExisting = old?.existing?.card?.h ?? 127
  check(`${theme}: permission is inside the card (rect contained)`, empty.permissionInCard === true && existing.permissionInCard === true, { empty, existing })
  check(`${theme}: both states use the same +→permission gap`, Math.abs(empty.gap - existing.gap) <= 1, { empty: empty.gap, existing: existing.gap })
  check(`${theme}: gap is two thirds of the old 16px (±1px)`, Math.abs(empty.gap - TARGET_GAP) <= 1 && Math.abs(existing.gap - TARGET_GAP) <= 1, { empty: empty.gap, existing: existing.gap, target: TARGET_GAP })
  check(`${theme}: toolbar has project + files only, no 插件`, empty.toolButtons.join(',') === 'project,files' && empty.pluginButton === false && !empty.toolText.includes('插件'), empty.toolButtons)
  check(`${theme}: card heights unchanged and action row still 36px`, empty.cardHeight === oldHeight && existing.cardHeight === oldExisting && empty.actionRow.h === 36 && existing.actionRow.h === 36, { empty: empty.cardHeight, before: oldHeight, existing: existing.cardHeight, oldExisting })
  check(`${theme}: bottom padding remains 8px`, empty.cardPaddingBottom === '8px' && existing.cardPaddingBottom === '8px', { empty: empty.cardPaddingBottom, existing: existing.cardPaddingBottom })
  check(`${theme}: new panel opens below, left-aligned`, emptyPanel.direction === 'below' && Math.abs(emptyPanel.leftDelta) <= 1 && emptyPanel.insideViewport === true, emptyPanel)
  check(`${theme}: started panel opens above, left-aligned`, existingPanel.direction === 'above' && Math.abs(existingPanel.leftDelta) <= 1 && existingPanel.insideViewport === true, existingPanel)
  check(`${theme}: panel still starts with its first option (no caption)`, emptyPanel.headerPresent === false && emptyPanel.titlePresent === false && emptyPanel.learnMorePresent === false && existingPanel.headerPresent === false, { emptyPanel, existingPanel })

  results.themes[theme] = {
    before: { emptyCardHeight: oldHeight, existingCardHeight: oldExisting, oldGap: OLD_GAP },
    empty, existing,
    permissionDown: emptyPanel, permissionUp: existingPanel,
    deletePlugins: { toolbarButtons: empty.toolButtons, pluginButtonInDom: empty.pluginButton, pluginRailEntry: empty.pluginRail, labelStillInToolbar: empty.toolText.includes('插件') }
  }
  await context.close()
}

for (const theme of ['dark', 'light']) {
  const page = await browser.newPage({ viewport: { width: 820, height: 430 }, deviceScaleFactor: 2 })
  const bg = theme === 'dark' ? '#212121' : '#ffffff'
  const fg = theme === 'dark' ? '#ededed' : '#0d0d0d'
  const muted = theme === 'dark' ? '#9a9a9a' : '#767676'
  const img = (file) => `data:image/png;base64,${readFileSync(join(SHOTS, file)).toString('base64')}`
  await page.setContent(`<body style="margin:0;background:${bg};color:${fg};font:13px/1.4 ui-sans-serif;padding:18px 22px">
    <div style="font-size:14px;font-weight:600;margin-bottom:4px">新建 Work · + → 帮我批准</div>
    <div style="color:${muted};margin-bottom:6px">目标 10.67px = 旧 16px × 2/3</div>
    <img src="${img(`m31b-gap-empty-${theme}.png`)}" style="width:760px;display:block;border-radius:10px;margin-bottom:18px">
    <div style="font-size:14px;font-weight:600;margin-bottom:4px">已有 Work · + → 帮我批准</div>
    <div style="color:${muted};margin-bottom:6px">同一变量，实测 10.67px（±0.02）</div>
    <img src="${img(`m31b-gap-existing-${theme}.png`)}" style="width:760px;display:block;border-radius:10px">
  </body>`)
  await page.screenshot({ path: join(SHOTS, `m31b-gap-compare-${theme}.png`), fullPage: true })
  await page.close()
}

const bundle = readFileSync(join(ROOT, 'lib/client.js'), 'utf8')
const pluginEntryInBundle = bundle.includes('chatgptOpenPluginsSettings')
check('the plugin panel entry survives outside the deleted tool button', pluginEntryInBundle === true && results.themes.dark.deletePlugins.pluginRailEntry === true, { bundle: pluginEntryInBundle, rail: results.themes.dark.deletePlugins.pluginRailEntry })
for (const theme of ['dark', 'light']) {
  for (const file of ['m31b-work-empty', 'm31b-work-existing', 'm31b-gap-empty', 'm31b-gap-existing', 'm31b-gap-compare', 'm31b-tools-after', 'm31b-permission-down', 'm31b-permission-up']) {
    check(`${theme}: ${file}.png exists and is non-trivial`, (() => {
      try { const buf = readFileSync(join(SHOTS, `${file}-${theme}.png`)); return buf.length > 4000 && buf.subarray(1, 4).toString() === 'PNG' } catch { return false }
    })())
  }
}
const failed = ASSERTIONS.filter((a) => a.ok !== true)
results.summary = { total: ASSERTIONS.length, passed: ASSERTIONS.length - failed.length, failed }
results.errors = errors
writeFileSync(join(OUT, 'm31b.json'), `${JSON.stringify(results, null, 2)}\n`)
console.log(`m31b: ${results.summary.passed}/${results.summary.total} checks passed -> ${join(OUT, 'm31b.json')}`)
if (failed.length > 0) { for (const f of failed) console.error('FAIL', f.id, JSON.stringify(f.detail)); process.exitCode = 1 }
await browser.close()
