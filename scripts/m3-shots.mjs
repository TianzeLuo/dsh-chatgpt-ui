#!/usr/bin/env node
/**
 * m3-shots.mjs — M3 screenshots: mode cards, read-only chip, dot badge, toast.
 *
 * Needs dsh-super-agent installed and a workspace with a blank session. It
 * answers `/api/super-agent/ui/state` with a fixed payload so the badge has
 * counts without dispatching a real task (layout evidence, not a load test).
 *
 *   node scripts/m3-shots.mjs --playwright /path/to/playwright-core \
 *     --url "http://127.0.0.1:3099/?token=..." --out docs/screenshots
 *
 * Outputs: m3-hero-modes-final.png (light), m3-chat-mode.png (Chat copy),
 * m3-toast-light.png / m3-toast-dark.png, m3-dark-final.png.
 */

import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

const args = new Map()
for (let index = 2; index < process.argv.length; index += 2) {
  args.set(process.argv[index].replace(/^--/, ''), process.argv[index + 1])
}

const url = args.get('url')
const outDir = args.get('out') ?? 'docs/screenshots'
if (url === undefined) {
  console.error('usage: node scripts/m3-shots.mjs --url <url> --playwright <dir> [--out <dir>]')
  process.exit(2)
}

const playwrightPath = args.get('playwright') ?? 'playwright-core'
const playwright = await import(
  playwrightPath.endsWith('.js') || playwrightPath.endsWith('.mjs') ? playwrightPath : `${playwrightPath}/index.js`
)
const chromium = playwright.chromium ?? playwright.default?.chromium

const BADGE_STATE = {
  ok: true,
  active: true,
  unreadTotal: 3,
  instances: [],
  activeInstanceId: 'default',
  router: {
    sessionId: 'screenshot',
    status: { router: { status: 'running', activeWorkers: 2, pendingTriggers: 0 }, counts: { tasks: { working: 2 } } }
  }
}

const browser = await chromium.launch({
  headless: true,
  executablePath: args.get('chromium') ?? '/home/user/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome',
  args: ['--no-sandbox', '--disable-dev-shm-usage']
})
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, colorScheme: 'light' })
const errors = []
const failedResponses = []
page.on('pageerror', (error) => errors.push(String(error)))
page.on('response', (response) => {
  if (response.status() >= 400) failedResponses.push(`${response.status()} ${response.url()}`)
})
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text())
})
await page.route('**/api/super-agent/ui/state', (route) =>
  route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(BADGE_STATE) })
)

await page.goto(url, { waitUntil: 'domcontentloaded' })
await page.waitForSelector('[data-slot="sidebar"]', { timeout: 60000 })
await page.waitForTimeout(2500)
/* First-run modals (Preview Notice, Get started) would sit on top of the shot. */
const closeModals = async () => {
  for (let step = 0; step < 8; step += 1) {
    const modal = await page.evaluate(() => document.querySelector('[role="presentation"]') !== null)
    if (!modal) {
      await page.waitForTimeout(300)
      continue
    }
    await page.evaluate(() => document.querySelector('[role="presentation"] button[aria-label="Close"]')?.click())
    await page.waitForTimeout(500)
  }
}
await closeModals()

/* A blank session mounts both the hero cards and the composer slots. */
const chip = page.locator('button[class*="_workspace"]').first()
if ((await chip.count()) > 0) {
  await chip.click().catch(() => {})
  await page.waitForTimeout(1200)
  await page.keyboard.press('Escape').catch(() => {})
  await page.waitForTimeout(800)
}

/** Everything the screenshots claim, measured once. */
const measure = () =>
  page.evaluate(() => {
    const rect = (node) => (node === null ? null : node.getBoundingClientRect())
    const round = (value) => Math.round(value * 10) / 10
    const cards = [...document.querySelectorAll('[data-mode-card]')]
    const cardRects = cards.map((node) => rect(node))
    const titles = [...document.querySelectorAll('.chatgpt-mode-card-title')]
    const descs = [...document.querySelectorAll('.chatgpt-mode-card-desc')]
    const composer = document.querySelector('[data-composer-card="true"]')
    const badge = document.querySelector('[data-super-agent-badge]')
    const perm = document.querySelector('[data-slot="conversation.input.permission"]')
    const readonly = document.querySelector('[data-chatgpt-readonly]')
    const toast = document.querySelector('[data-chatgpt-toast]')
    const placeholder = document.querySelector('[data-composer-placeholder="true"]')
    const css = (node, prop) => (node === null ? null : getComputedStyle(node).getPropertyValue(prop).trim())
    const cardStyle = cards[1] === undefined ? null : getComputedStyle(cards[1])
    return {
      mode: document.body.getAttribute('data-chatgpt-mode'),
      dark: document.body.hasAttribute('data-ds-dark-theme'),
      cards: cards.map((node) => node.getAttribute('data-mode-card')),
      cardWidths: cardRects.map((value) => (value === null ? null : round(value.width))),
      cardHeights: cardRects.map((value) => (value === null ? null : round(value.height))),
      cardTops: cardRects.map((value) => (value === null ? null : round(value.top))),
      titleLines: titles.map((node) => round(node.getBoundingClientRect().height / parseFloat(getComputedStyle(node).lineHeight))),
      descLines: descs.map((node) => round(node.getBoundingClientRect().height / parseFloat(getComputedStyle(node).lineHeight))),
      cardGapBelow: composer === null || cardRects.at(-1) == null ? null : round(rect(composer).top - cardRects.at(-1).bottom),
      cardGapBetween: cardRects.length < 2 ? null : round(cardRects[1].left - cardRects[0].right),
      cardBg: cardStyle === null ? null : cardStyle.backgroundColor,
      cardFg: cardStyle === null ? null : cardStyle.color,
      descFg: descs[0] === undefined ? null : getComputedStyle(descs[0]).color,
      badge: badge === null ? null : badge.textContent,
      badgeBg: css(badge, 'background-color'),
      badgeFg: css(badge, 'color'),
      navBadge: document.querySelector('[data-super-agent-nav-badge]')?.textContent ?? null,
      readonly: readonly === null ? null : readonly.textContent,
      readonlyFg: css(readonly, 'color'),
      readonlyBg: css(readonly, 'background-color'),
      permissionVisible: perm === null ? null : getComputedStyle(perm).display !== 'none',
      placeholder: placeholder === null ? null : getComputedStyle(placeholder, '::after').content,
      toast: toast === null ? null : toast.textContent,
      toastBg: css(toast, 'background-color'),
      toastFg: css(toast, 'color'),
      toastHeight: toast === null ? null : round(rect(toast).height),
      toastBottom: toast === null ? null : round(window.innerHeight - rect(toast).bottom),
      toastCentered: toast === null ? null : Math.abs(rect(toast).left + rect(toast).width / 2 - window.innerWidth / 2) < 2,
      composerTop: composer === null ? null : round(rect(composer).top)
    }
  })

const agentLight = await measure()
await page.screenshot({ path: join(outDir, 'm3-hero-modes-final.png') })

/* Chat mode: same page, one click; copy and chip swap with the preset. */
await page.locator('[data-mode-card="chat"]').click().catch(() => {})
await page.waitForTimeout(1800)
const chatLight = await measure()
await page.screenshot({ path: join(outDir, 'm3-chat-mode.png') })

/* Non-blank session → the toast. Type one message (the Host appends the user
   event before any model call, so the session stops being blank) and click the
   other mode. */
let toastLight = null
const composer = page.locator('[data-composer-input="true"]').first()
await composer.click().catch(() => {})
await page.keyboard.type('hello').catch(() => {})
await page.keyboard.press('Enter').catch(() => {})
await page.waitForTimeout(1800)
/* A session with a message is no longer blank, so the same switch now needs a
   new chat; in the session view the header segments are the only switcher. */
await page.locator('[data-chatgpt-mode-switch="header"] [data-segment="agent"]').click().catch(() => {})
await page.waitForTimeout(900)
toastLight = await measure()
if (toastLight.toast !== null) await page.screenshot({ path: join(outDir, 'm3-toast-light.png') })

/* Dark: the toast first (still up from the light pass), then the session chrome
   without it, then the new-page cards. */
await page.emulateMedia({ colorScheme: 'dark' })
await page.waitForFunction(() => document.body.hasAttribute('data-ds-dark-theme'), null, { timeout: 15000 }).catch(() => {})
await page.waitForTimeout(900)
const darkToast = await measure()
if (darkToast.toast !== null) await page.screenshot({ path: join(outDir, 'm3-toast-dark.png') })
/* Dismiss it so the composer row (read-only chip + badge) is visible. */
await page.keyboard.press('Escape').catch(() => {})
await page.waitForTimeout(700)
const dark = await measure()
await page.screenshot({ path: join(outDir, 'm3-dark-session.png') })

/* A second dark frame for the new-page cards (they only mount without a
   session, so this is a different page state). */
await page.evaluate(() => {
  const button = [...document.querySelectorAll('button')].find((node) => (node.textContent || '').trim() === 'New Session')
  button?.click()
})
await page.waitForTimeout(1400)
/* A fresh session can re-open the Host's "Get started" modal. */
await closeModals()
const darkHero = await measure()
await page.screenshot({ path: join(outDir, 'm3-dark-final.png') })

await browser.close()

/* WCAG contrast for the new surfaces (text vs the surface it sits on). */
const rgb = (value) => {
  const match = /rgba?\(([^)]+)\)/.exec(value ?? '')
  if (match === null) return null
  const parts = match[1].split(',').map((part) => parseFloat(part.trim()))
  return { r: parts[0], g: parts[1], b: parts[2], a: parts[3] ?? 1 }
}
const over = (fg, bg) => {
  if (fg === null || bg === null) return null
  return {
    r: fg.r * fg.a + bg.r * (1 - fg.a),
    g: fg.g * fg.a + bg.g * (1 - fg.a),
    b: fg.b * fg.a + bg.b * (1 - fg.a),
    a: 1
  }
}
const luminance = (color) => {
  if (color === null) return null
  const channel = (value) => {
    const scaled = value / 255
    return scaled <= 0.03928 ? scaled / 12.92 : ((scaled + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(color.r) + 0.7152 * channel(color.g) + 0.0722 * channel(color.b)
}
const contrast = (fg, bg) => {
  const a = luminance(fg)
  const b = luminance(bg)
  if (a === null || b === null) return null
  return Math.round(((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)) * 10) / 10
}
const WHITE = { r: 255, g: 255, b: 255, a: 1 }
const light = {
  cardTitle: contrast(over(rgb(agentLight.cardFg), rgb(agentLight.cardBg)), over(rgb(agentLight.cardBg), WHITE)),
  cardDesc: contrast(over(rgb(agentLight.descFg), rgb(agentLight.cardBg)), over(rgb(agentLight.cardBg), WHITE)),
  toast: contrast(over(rgb(toastLight.toastFg), rgb(toastLight.toastBg)), over(rgb(toastLight.toastBg), WHITE)),
  readonly: contrast(over(rgb(chatLight.readonlyFg), rgb(chatLight.readonlyBg ?? 'rgba(0,0,0,0)')), over(rgb(chatLight.readonlyBg ?? 'rgba(0,0,0,0)'), WHITE)),
  badge: contrast(over(rgb(agentLight.badgeFg), rgb(agentLight.badgeBg)), over(rgb(agentLight.badgeBg), WHITE))
}
const darkContrast = {
  cardTitle: contrast(over(rgb(darkHero.cardFg), rgb(darkHero.cardBg ?? 'rgba(0,0,0,0)')), over(rgb(darkHero.cardBg ?? 'rgba(0,0,0,0)'), { r: 33, g: 33, b: 33, a: 1 })),
  cardDesc: contrast(over(rgb(darkHero.descFg), rgb(darkHero.cardBg ?? 'rgba(0,0,0,0)')), over(rgb(darkHero.cardBg ?? 'rgba(0,0,0,0)'), { r: 33, g: 33, b: 33, a: 1 })),
  toast: contrast(over(rgb(darkToast.toastFg), rgb(darkToast.toastBg)), over(rgb(darkToast.toastBg), { r: 33, g: 33, b: 33, a: 1 })),
  readonly: contrast(over(rgb(dark.readonlyFg), rgb(dark.readonlyBg ?? 'rgba(0,0,0,0)')), over(rgb(dark.readonlyBg ?? 'rgba(0,0,0,0)'), { r: 33, g: 33, b: 33, a: 1 })),
  badge: contrast(over(rgb(dark.badgeFg), rgb(dark.badgeBg ?? 'rgba(0,0,0,0)')), over(rgb(dark.badgeBg ?? 'rgba(0,0,0,0)'), { r: 33, g: 33, b: 33, a: 1 }))
}

const spread = (values) => (values.some((value) => value === null) ? 999 : Math.max(...values) - Math.min(...values))
const assertions = [
  ['badge shows running + unread', /running/.test(agentLight.badge ?? '') && /unread/.test(agentLight.badge ?? '')],
  ['sidebar nav badge mirrors unread', agentLight.navBadge === '3'],
  ['three mode cards', agentLight.cards.join(',') === 'chat,agent,dot'],
  ['cards share one width', spread(agentLight.cardWidths) <= 1],
  ['cards share one height', spread(agentLight.cardHeights) <= 1],
  ['titles stay on one line', agentLight.titleLines.every((lines) => lines <= 1.2)],
  ['descriptions fit in two lines', agentLight.descLines.every((lines) => lines <= 2.2)],
  ['cards sit ≥12px above the composer', (agentLight.cardGapBelow ?? 0) >= 12],
  ['card gap is ≥12px', (agentLight.cardGapBetween ?? 0) >= 11.5],
  ['Chat mode swaps the placeholder', /Ask anything|随便问点什么/.test(chatLight.placeholder ?? '')],
  ['Chat mode shows the read-only chip', chatLight.readonly !== null && chatLight.permissionVisible === false],
  ['toast appears on a non-blank session', toastLight.toast !== null],
  ['toast is bottom-centre, one line', toastLight.toastCentered === true && (toastLight.toastHeight ?? 99) <= 48],
  ['dark theme applied', dark.dark === true],
  ['dark toast is up before dismissal', darkToast.toast !== null],
  ['dark session keeps the read-only chip', dark.readonly !== null],
  ['dark session keeps the dot badge', dark.badge !== null],
  ['dark new page keeps three cards', darkHero.cards.length === 3],
  ['light contrast: card title ≥4.5', (light.cardTitle ?? 0) >= 4.5],
  ['light contrast: card desc ≥4.5', (light.cardDesc ?? 0) >= 4.5],
  ['light contrast: toast ≥4.5', (light.toast ?? 0) >= 4.5],
  ['light contrast: read-only chip ≥4.5', (light.readonly ?? 0) >= 4.5],
  ['dark contrast: toast ≥4.5', (darkContrast.toast ?? 0) >= 4.5],
  ['dark contrast: card title ≥4.5', (darkContrast.cardTitle ?? 0) >= 4.5],
  ['dark contrast: card desc ≥4.5', (darkContrast.cardDesc ?? 0) >= 4.5],
  ['dark contrast: toast ≥4.5', (darkContrast.toast ?? 0) >= 4.5],
  ['dark contrast: read-only chip ≥4.5', (darkContrast.readonly ?? 0) >= 4.5],
  ['dark contrast: badge ≥4.5', (darkContrast.badge ?? 0) >= 4.5],
  /* The Host's own open-in-app icon route 404s in this scratch profile; that is
     the Host bundle, not this skin, so it is filtered like favicon. */
  ['no console errors', errors.filter((line) => !/favicon|404/.test(line)).length === 0],
  [
    'no failed requests except host assets',
    failedResponses.filter((line) => !/favicon|\/open-in-app\/icon\//.test(line)).length === 0
  ]
]
const failed = assertions.filter(([, green]) => !green)
const ok = failed.length === 0
console.log(
  JSON.stringify(
    { ok, agentLight, chatLight, toastLight, darkToast, dark, darkHero, light, darkContrast, assertions, errors, failedResponses },
    null,
    1
  )
)
if (!ok) console.error(`FAIL ${failed.length}/${assertions.length}: ${failed.map(([label]) => label).join(', ')}`)
writeFileSync(
  join('test', 'fixtures', 'm3-shots.json'),
  JSON.stringify({ agentLight, chatLight, toastLight, darkToast, dark, darkHero, light, darkContrast, errors, failedResponses }, null, 1)
)
process.exit(ok ? 0 : 1)
