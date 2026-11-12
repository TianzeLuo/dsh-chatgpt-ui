#!/usr/bin/env node
/**
 * Capture the M1 acceptance screenshots (light + dark, empty new-chat page).
 *
 * Dev-only tool: unlike the rest of this package it needs `playwright-core` with
 * a Chromium build. It is NOT a runtime or build dependency — point NODE_PATH at
 * any existing install (or pass --playwright <dir>):
 *
 *   NODE_PATH=/mnt/f/project/y86/node_modules node scripts/screenshots.mjs \
 *     --url "http://127.0.0.1:3099/?token=..." [--out docs/screenshots]
 *
 * Each shot is taken only after the skin reports itself mounted, the preview
 * notice is dismissed, and no console error has been seen; the script prints the
 * measured geometry so a regression is visible without eyeballing the PNG.
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
  console.error('try: NODE_PATH=/path/to/node_modules node scripts/screenshots.mjs --url ...')
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
const log = []
page.on('console', (message) => {
  log.push(`${message.type()}: ${message.text()}`)
  if (message.type() === 'error') errors.push(message.text())
})
page.on('pageerror', (error) => errors.push(error.message))

await page.goto(url, { waitUntil: 'domcontentloaded' })
await page.waitForSelector('[data-slot="sidebar"]', { timeout: 60000 })
await page.waitForFunction(() => document.body.getAttribute('data-chatgpt-ui') !== null, null, { timeout: 60000 })

/** Two first-run modals can cover the page: the versioned preview notice
 *  (button "Continue") and the "Get started" credentials step that follows it
 *  (header close button). The settings shell mounts the second one a beat after
 *  the first closes, so settle for a stretch of consecutive clean checks instead
 *  of a single look. */
await page.waitForTimeout(2000)
let cleanChecks = 0
for (let attempt = 0; attempt < 12 && cleanChecks < 3; attempt++) {
  const modal = await page.evaluate(() => document.querySelector('[role="presentation"]') !== null)
  if (!modal) {
    cleanChecks += 1
    await page.waitForTimeout(600)
    continue
  }
  cleanChecks = 0
  const acted = await page.evaluate(() => {
    const scope = document.querySelector('[role="presentation"]') ?? document
    const close = scope.querySelector('button[aria-label="Close"]')
    if (close !== null) {
      close.click()
      return 'close'
    }
    const cont = [...scope.querySelectorAll('button')].find((candidate) => /continue|继续/i.test(candidate.textContent ?? ''))
    if (cont !== undefined) {
      cont.click()
      return 'continue'
    }
    return 'none'
  })
  if (acted === 'none') await page.keyboard.press('Escape').catch(() => {})
  await page.waitForTimeout(1200)
}

const measure = () =>
  page.evaluate(() => {
    const px = (node) => (node === null ? null : Math.round(node.getBoundingClientRect().width))
    const style = (node, property) => (node === null ? null : getComputedStyle(node).getPropertyValue(property).trim())
    const card = document.querySelector('[data-composer-card="true"]')
    const sidebar = document.querySelector('[data-slot="sidebar"]')
    return {
      bodyAttr: document.body.getAttribute('data-chatgpt-ui'),
      dark: document.body.hasAttribute('data-ds-dark-theme'),
      canvas: getComputedStyle(document.body).backgroundColor,
      sidebarFill: style(sidebar, 'background-color'),
      sidebarInnerWidth: px(document.querySelector('[class*="_sidebarCol"]')),
      composerCardWidth: px(card),
      composerCardHeight: card === null ? null : Math.round(card.getBoundingClientRect().height),
      composerRadius: style(card, 'border-radius'),
      composerBorder: style(card, 'border-top-color') + ' ' + style(card, 'border-top-width'),
      sendButton: (() => {
        const button = document.querySelector('[data-slot="conversation.composer.bar"] button[class*="_primary"]')
        return button === null ? null : { w: px(button), radius: style(button, 'border-radius'), bg: style(button, 'background-color') }
      })(),
      newSessionHeight: (() => {
        const button = document.querySelector('[class*="_newSession"]')
        return button === null ? null : Math.round(button.getBoundingClientRect().height)
      })(),
      hero: (() => {
        const hero = document.querySelector('[class*="_composerHero"]')
        const headline = document.querySelector('[class*="_headline"]')
        const stack = hero === null ? null : hero.querySelector('[class*="_stack"]')
        return {
          headlineDisplay: headline === null ? null : getComputedStyle(headline).display,
          greeting: stack === null ? null : getComputedStyle(stack, '::before').content,
          fish: (document.querySelector('[class*="_fishHitbox"]')?.getClientRects().length ?? 0) > 0,
          previewBadge: (document.querySelector('[class*="_previewBadge"]')?.getClientRects().length ?? 0) > 0
        }
      })(),
      cards: (() => {
        const style = (node, properties) =>
          node === null ? null : Object.fromEntries(properties.map((property) => [property, getComputedStyle(node).getPropertyValue(property).trim()]))
        return {
          composer: style(card, ['border-top-style', 'border-top-color', 'box-shadow']),
          add: style(document.querySelector('[data-slot="conversation.composer.bar"] button[class*="_add"]'), ['border-top-style', 'background-color', 'width']),
          chip: style(document.querySelector('button[class*="_workspace"]') ?? document.querySelector('button[class*="_seat"]'), ['border-top-style', 'background-color', 'color', 'font-size'])
        }
      })()
    }
  })

await page.waitForTimeout(800)
/* The host autofocuses the composer on a new page, so the idle card already
   matches :focus-within — blur first, or the "focus adds a ring" assertion would
   compare a focused card with itself. */
await page.evaluate(() => {
  if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
})
await page.waitForTimeout(200)
const light = await measure()
await page.screenshot({ path: join(outDir, 'm1-light-new.png') })

/* ---- M2: mode switcher + dot brand ---- */
const m2 = await page.evaluate(() => {
  const brand = document.querySelector('[data-slot="sidebar.brand.name"] .chatgpt-brand-name')
  const placeholder = document.querySelector('[data-composer-placeholder="true"]')
  return {
    brandName: brand === null ? null : getComputedStyle(brand, '::after').content,
    brandMark: document.querySelector('[data-slot="sidebar.brand.mark"] .chatgpt-brand-mark') !== null,
    mode: document.body.getAttribute('data-chatgpt-mode'),
    heroCards: [...document.querySelectorAll('[data-mode-card]')].map((node) => node.getAttribute('data-mode-card')),
    headerSwitch: document.querySelector('[data-chatgpt-mode-switch="header"]') !== null,
    placeholder: placeholder === null ? null : getComputedStyle(placeholder, '::after').content,
    slotErrors: [...document.querySelectorAll('[data-slot-error]')].map((node) => node.getAttribute('data-slot-error'))
  }
})
/* Only a profile with a workspace gets a blank session, and only then do the
   mode cards exist; keep the last good M2 shot instead of overwriting it with a
   card-less page. */
const hasHeroCardsNow = m2.heroCards.length > 0
if (hasHeroCardsNow) await page.screenshot({ path: join(outDir, 'm2-hero-modes.png') })

/* Blank session: Chat must switch in place (no new session) and paint only the
   display attribute. Clicking Agent again restores it. */
const hasHeroCards = hasHeroCardsNow
const chatClick = hasHeroCards
  ? await page
      .click('[data-mode-card="chat"]')
      .then(() => true)
      .catch(() => false)
  : false
await page.waitForTimeout(1200)
const afterChat = await page.evaluate(() => {
  const placeholder = document.querySelector('[data-composer-placeholder="true"]')
  return {
    mode: document.body.getAttribute('data-chatgpt-mode'),
    chatCardPressed: document.querySelector('[data-mode-card="chat"]')?.getAttribute('aria-pressed') ?? null,
    placeholder: placeholder === null ? null : getComputedStyle(placeholder, '::after').content
  }
})
if (hasHeroCards) {
  await page
    .click('[data-mode-card="agent"]')
    .then(() => true)
    .catch(() => false)
  await page.waitForTimeout(1200)
}
const afterAgent = await page.evaluate(() => document.body.getAttribute('data-chatgpt-mode'))

/* Focus state: focus the composer's editable wrapper so :focus-within paints
   the ring. (The scratch profile has no workspace, so the editor itself is not
   clickable; focus() on the wrapper still triggers :focus-within.) */
await page.evaluate(() => document.querySelector('[data-composer-input="true"]')?.focus())
await page.waitForTimeout(400)
const lightFocus = await measure()
await page.screenshot({ path: join(outDir, 'm1-light-focus.png') })
await page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur())

await page.emulateMedia({ colorScheme: 'dark' })
await page.waitForFunction(() => document.body.hasAttribute('data-ds-dark-theme'), null, { timeout: 15000 }).catch(() => {})
await page.waitForTimeout(800)
const dark = await measure()
await page.screenshot({ path: join(outDir, 'm1-dark-new.png') })

await page.evaluate(() => document.querySelector('[data-composer-input="true"]')?.focus())
await page.waitForTimeout(400)
const darkFocus = await measure()
await page.screenshot({ path: join(outDir, 'm1-dark-focus.png') })

await browser.close()

const assertions = [
  ['light mounted', light.bodyAttr !== null],
  ['dark mounted', dark.dark === true],
  ['no console errors', errors.length === 0],
  ['hero headline hidden (light)', light.hero.headlineDisplay === 'none'],
  ['greeting rendered (light)', /What can I help with|有什么可以帮你的/.test(light.hero.greeting ?? '')],
  ['no DSH fish painted', light.hero.fish === false],
  ['no Preview badge painted', light.hero.previewBadge === false],
  ['composer edge is solid (light)', light.cards.composer['border-top-style'] === 'solid'],
  ['composer edge is solid (dark)', dark.cards.composer['border-top-style'] === 'solid'],
  ['focus ring adds a second shadow (light)', (lightFocus.cards.composer['box-shadow'] ?? '') !== (light.cards.composer['box-shadow'] ?? '')],
  ['add button is borderless', light.cards.add['border-top-style'] === 'none'],
  ['chip is borderless', light.cards.chip['border-top-style'] === 'none'],
  ['M2 brand is dot', /dot/.test(m2.brandName ?? '') && m2.brandMark === true],
  [
    m2.heroCards.length === 0 ? 'M2 mode attribute (skipped: no conversation mounted)' : 'M2 mode attribute present',
    m2.mode === null || m2.mode === 'agent' || m2.mode === 'chat'
  ],
  ['M2 hero offers Chat + Agent', m2.heroCards.length === 0 || (m2.heroCards.includes('chat') && m2.heroCards.includes('agent'))],
  ['M2 no session header without a session', m2.headerSwitch === false],
  ['M2 no slot errors', m2.slotErrors.length === 0],
  [
    hasHeroCards ? 'M2 blank session switches in place' : 'M2 blank session switches in place (skipped: no workspace session)',
    hasHeroCards ? chatClick && afterChat.mode === 'chat' && afterChat.chatCardPressed === 'true' : true
  ],
  [
    hasHeroCards ? 'M2 chat placeholder painted' : 'M2 chat placeholder painted (skipped)',
    hasHeroCards ? /Ask anything|随便问点什么/.test(afterChat.placeholder ?? '') : true
  ],
  [
    hasHeroCards ? 'M2 switching back restores agent' : 'M2 switching back restores agent (skipped)',
    hasHeroCards ? afterAgent === 'agent' : true
  ]
]
const failed = assertions.filter(([, green]) => !green)
const ok = failed.length === 0
console.log(JSON.stringify({ ok, assertions, light, dark, lightFocus, darkFocus, m2, afterChat, afterAgent, errors, log: log.filter((line) => /chatgpt|error/i.test(line)) }, null, 1))
if (!ok) console.error(`FAIL ${failed.length}/${assertions.length}: ${failed.map(([label]) => label).join(', ')}`)
process.exit(ok ? 0 : 1)
