#!/usr/bin/env node
/**
 * scripts/m20-corners.mjs — P0-9 corner-shape evidence frames.
 *
 * The Host theme ships `@deepseek-ai/dsh-client-ui-theme/corner-shape.css`:
 *
 *   @supports (corner-shape:superellipse(1.5)) {
 *     :root { --dsw-corner-shape: superellipse(1.5) }
 *     *, :before, :after { corner-shape: var(--dsw-corner-shape) }
 *   }
 *
 * `corner-shape` is a separate property from `border-radius`, so every
 * `border-radius: 50%` circle and every pill was painted as a squircle. The skin
 * re-points the Host's own knob once, at the skin root:
 *
 *   body[data-chatgpt-ui] { --dsw-corner-shape: round }
 *
 * Custom properties inherit, so the Host's universal rule computes `round` for
 * the whole subtree — the skin panels, the popovers mounted on <body>, and the
 * Host chrome the skin recolours. Chromium normalises the computed value of
 * `round` to `superellipse(1)`.
 *
 * This script records both themes on one URL: the required 4× frames (send,
 * dots, avatar, slider thumb), the extra circle samples (add, reset, stars,
 * settings switch thumb), the non-circular surfaces (28 composer card, 16
 * sidebar / menus, 20 effort panel), and a `skin=off` control proving the
 * Host outline is untouched when the skin does not mount.
 *
 * Writes docs/m20.json and docs/screenshots/m20-corners-*.png.
 *
 *   node scripts/m20-corners.mjs --url "http://127.0.0.1:3132/?token=…"
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
  console.error('usage: node scripts/m20-corners.mjs --url <tokenised-url>')
  process.exit(2)
}
const DOCS = resolve(ROOT, typeof args.get('out') === 'string' ? args.get('out') : 'docs')
const SHOTS = join(DOCS, 'screenshots')
mkdirSync(SHOTS, { recursive: true })

let playwright
for (const candidate of ['playwright', 'playwright', 'playwright-core']) {
  try {
    playwright = await import(candidate)
    break
  } catch {}
}
if (playwright === undefined) {
  console.error('m20-corners: playwright is required')
  process.exit(2)
}
const CHROME = process.env.M20_CHROME ?? process.env.CHATGPT_UI_CHROME ?? process.env.HOME + '/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome'
const browser = await playwright.chromium.launch({
  headless: true,
  executablePath: CHROME,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
})

const ROUND_VALUES = ['round', 'superellipse(1)']
const isRound = (value) => ROUND_VALUES.includes(value)

const result = {
  task: 'P0-9',
  capturedAt: new Date().toISOString(),
  url: url.replace(/([?&]token=)[^&]+/, '$1***'),
  environment: { width: 1600, height: 1000, dpr: 2, locale: 'zh-CN' },
  rootCause: {
    hostSheet: '@deepseek-ai/dsh-client-ui-theme/corner-shape.css',
    hostSelector: '*, :before, :after',
    hostDeclaration: 'corner-shape: var(--dsw-corner-shape)',
    hostVariable: ':root { --dsw-corner-shape: superellipse(1.5) }',
    why: 'corner-shape is a separate property from border-radius, so border-radius: 50% plus superellipse(1.5) paints a squircle; only changing border-radius can never make a true circle.'
  },
  fix: {
    file: 'lib/client/css/00-tokens.css',
    selector: 'body[data-chatgpt-ui]',
    declaration: '--dsw-corner-shape: round',
    mechanism: 'the Host universal rule reads var(--dsw-corner-shape); the custom property inherits from the skin root, so one declaration rounds the whole subtree without a universal selector or per-element patches',
    computedNormalisation: 'Chromium reports round as superellipse(1)'
  },
  themes: {},
  skinOff: null,
  assertions: [],
  assertionSummary: null
}

const round = (value) => Math.round(Number(value) * 10) / 10

const shot = async (context, page, name, clip, scale = 2) => {
  const session = await context.newCDPSession(page)
  const png = await session.send('Page.captureScreenshot', {
    format: 'png',
    fromSurface: true,
    captureBeyondViewport: false,
    clip: { ...clip, scale }
  }).catch(() => null)
  await session.detach().catch(() => {})
  if (png?.data === undefined) throw new Error(`m20-corners: screenshot failed: ${name}`)
  writeFileSync(join(SHOTS, name), Buffer.from(png.data, 'base64'))
}

const measure = (page) => page.evaluate(() => {
  const num = (value) => Math.round(Number(value) * 10) / 10
  const info = (el) => {
    if (el === null || el === undefined) return null
    const r = el.getBoundingClientRect()
    const cs = getComputedStyle(el)
    return {
      tag: el.tagName,
      className: String(el.className ?? '').slice(0, 80),
      text: (el.textContent ?? '').trim().slice(0, 48),
      rect: { x: num(r.x), y: num(r.y), w: num(r.width), h: num(r.height), r: num(r.right), b: num(r.bottom) },
      style: {
        cornerShape: cs.cornerShape,
        borderTopLeftRadius: cs.borderTopLeftRadius,
        borderTopRightRadius: cs.borderTopRightRadius,
        borderBottomLeftRadius: cs.borderBottomLeftRadius,
        borderBottomRightRadius: cs.borderBottomRightRadius,
        backgroundColor: cs.backgroundColor,
        boxShadow: cs.boxShadow
      },
      square: Math.abs(r.width - r.height) <= 1
    }
  }
  const one = (selector) => document.querySelector(selector)
  const all = (selector) => [...document.querySelectorAll(selector)]
  const circles = []
  const seen = new Set()
  for (const el of all('body *')) {
    const r = el.getBoundingClientRect()
    if (r.width < 1 || r.height < 1) continue
    const cs = getComputedStyle(el)
    const radius = cs.borderTopLeftRadius
    if (!(radius === '50%' || Number.parseFloat(radius) >= 999)) continue
    if (Math.abs(r.width - r.height) > 1) continue
    const key = `${Math.round(r.width)}x${Math.round(r.height)}:${String(el.className ?? '').slice(0, 40)}`
    if (seen.has(key)) continue
    seen.add(key)
    circles.push(info(el))
  }
  const workspaceLabel = document.querySelector('[class*="_workspace"]')?.textContent?.trim() ?? null
  const rootStyle = getComputedStyle(document.body)
  const styleRuleCount = [...document.styleSheets].reduce((count, sheet) => {
    try {
      return count + [...sheet.cssRules].filter((rule) => rule.cssText?.includes('--dsw-corner-shape: round')).length
    } catch {
      return count
    }
  }, 0)
  return {
    root: {
      selector: 'body[data-chatgpt-ui]',
      attribute: document.body.getAttribute('data-chatgpt-ui'),
      skin: document.body.getAttribute('data-cgpt-skin'),
      theme: document.body.getAttribute('data-ds-dark-theme') === null ? 'light' : 'dark',
      variable: rootStyle.getPropertyValue('--dsw-corner-shape').trim(),
      cornerShape: rootStyle.cornerShape,
      styleRuleCount
    },
    workspaceLabel,
    send: info(one("[data-composer-card='true'] button[class*='_primary']")),
    add: info(one("[data-composer-card='true'] button[class*='_add']")),
    avatar: info(one('.chatgpt-super-agent-icon')),
    brandMark: info(one('.chatgpt-brand-mark')),
    composerCard: info(one("[data-composer-card='true']")),
    sidebar: info(one("[data-slot='sidebar'] [class*='quietBars']")),
    rail: info(one('.chatgpt-rail')),
    modeSegment: info(one('.chatgpt-mode-seg')),
    modelPill: info(one('[data-cgpt-model-pill]')),
    effort: {
      menu: info(one('[data-cgpt-model-menu]')),
      thumb: info(one('.chatgpt-effort-thumb')),
      track: info(one('.chatgpt-effort-track')),
      reset: info(one('.chatgpt-effort-reset')),
      ticks: all('.chatgpt-effort-tick').map(info),
      stars: all('.chatgpt-effort-star').map(info).slice(0, 6),
      starCount: all('.chatgpt-effort-star').length
    },
    workMenu: info(one('.chatgpt-work-menu')),
    search: info(one('.chatgpt-search-modal')),
    settings: {
      dialog: info(one("[role='dialog']")),
      switchThumb: info(one("[role='dialog'] [class*='_thumb']")),
      switch: info(one("[role='dialog'] [class*='_switch']"))
    },
    circles
  }
})

const closeDialogs = async (page) => {
  for (const label of ['Close', '关闭']) {
    const button = page.getByRole('button', { name: label }).first()
    if (await button.count()) await button.click({ force: true }).catch(() => {})
  }
}

const ensureWorkMode = async (page) => {
  await page.keyboard.press('Escape')
  await page.waitForTimeout(250)
  if ((await page.evaluate(() => document.body.dataset.chatgptMode)) !== 'agent') {
    const segment = page.locator('.chatgpt-mode-seg[data-segment="agent"]').first()
    if (await segment.count()) await segment.click({ force: true })
    await page.waitForTimeout(700)
  }
}

/** Pick the first directory in the Host workspace dialog (a fresh profile has no workspace). */
const ensureWorkspace = async (page) => {
  const placeholder = await page.locator('[data-composer-input="true"]').getAttribute('data-placeholder').catch(() => '')
  const ready = !(placeholder ?? '').includes('选择一个工作区')
  if (ready) return
  const trigger = page.locator('button[class*="_workspace"]').first()
  if (await trigger.count()) await trigger.click({ force: true })
  await page.waitForTimeout(800)
  const row = page.locator('[role="dialog"] [class*="_row"]').first()
  if (await row.count()) await row.click({ force: true })
  await page.waitForTimeout(300)
  const open = page.getByRole('button', { name: '打开' }).first()
  if (await open.count()) await open.click({ force: true })
  await page.waitForTimeout(1600)
}

const openEffortPanel = async (page) => {
  const pill = page.locator('[data-cgpt-model-pill]').first()
  if ((await pill.count()) === 0) return false
  await pill.click()
  await page.waitForTimeout(700)
  return true
}

const openSettings = async (page) => {
  const settings = page.getByRole('button', { name: /设置|Settings/ }).first()
  if ((await settings.count()) === 0) return false
  await settings.click({ force: true }).catch(() => {})
  await page.waitForTimeout(1200)
  const dialog = page.locator("[role='dialog']").first()
  return (await dialog.count()) > 0
}

const assertionsFor = (theme, state) => {
  const list = []
  const check = (id, label, pass, measured) => list.push({ id, label, pass, measured })
  check('root-round', 'skin root computed corner-shape is round', isRound(state.root.cornerShape), { computed: state.root.cornerShape, variable: state.root.variable })
  check('root-variable', 'the root re-points --dsw-corner-shape to round', state.root.variable === 'round', state.root.variable)
  check('root-rule-once', 'exactly one root rule declares the override', state.root.styleRuleCount === 1, state.root.styleRuleCount)
  const required = [
    ['send', 'send button 36×36'],
    ['avatar', 'super-agent avatar 20×20']
  ]
  for (const [key, label] of required) {
    const element = state[key]
    check(`${key}-present`, `${label} exists`, element !== null, element?.rect ?? null)
    if (element !== null) {
      check(`${key}-square`, `${label} is square`, element.square, { w: element.rect.w, h: element.rect.h })
      check(`${key}-round`, `${label} computes round`, isRound(element.style.cornerShape), element.style.cornerShape)
    }
  }
  const thumb = state.effort.thumb
  check('thumb-present', 'slider thumb exists', thumb !== null, thumb?.rect ?? null)
  if (thumb !== null) {
    check('thumb-square', 'slider thumb 34×34', thumb.rect.w === 34 && thumb.rect.h === 34, thumb.rect)
    check('thumb-round', 'slider thumb computes round', isRound(thumb.style.cornerShape), thumb.style.cornerShape)
  }
  check('ticks-present', 'effort ticks exist', state.effort.ticks.length >= 1, state.effort.ticks.length)
  check('ticks-square', 'every effort tick is square', state.effort.ticks.every((tick) => tick.square), state.effort.ticks.map((tick) => ({ w: tick.rect.w, h: tick.rect.h })))
  check('ticks-round', 'every effort tick computes round', state.effort.ticks.every((tick) => isRound(tick.style.cornerShape)), state.effort.ticks.map((tick) => tick.style.cornerShape))
  check('circles-round', 'every round-radius element in the DOM computes round and square', state.circles.every((circle) => isRound(circle.style.cornerShape) && circle.square), state.circles.map((circle) => ({ className: circle.className, w: circle.rect.w, h: circle.rect.h, cs: circle.style.cornerShape })))
  // Non-circular corners must stay standard arcs too (the reference is not a squircle).
  const surfaces = [
    ['composer-card', state.composerCard, 28],
    ['sidebar', state.sidebar, 16],
    ['effort-panel', state.effort.menu, 20]
  ]
  for (const [key, element, radius] of surfaces) {
    check(`${key}-present`, `${key} exists`, element !== null, element?.rect ?? null)
    if (element !== null) {
      check(`${key}-radius`, `${key} radius ${radius}px`, Number.parseFloat(element.style.borderTopLeftRadius) === radius, element.style.borderTopLeftRadius)
      check(`${key}-round`, `${key} computes round`, isRound(element.style.cornerShape), element.style.cornerShape)
    }
  }
  const optional = [
    ['work-menu', state.workMenu?.workMenu ?? null, 16],
    ['search', state.search?.search ?? null, 16],
    ['chat-card', state.chat?.composerCard ?? null, 26],
    ['settings-dialog', state.settings?.settings?.dialog ?? null, 28]
  ]
  for (const [key, element, radius] of optional) {
    if (element === null) continue
    check(`${key}-radius`, `${key} radius ${radius}px`, Number.parseFloat(element.style.borderTopLeftRadius) === radius, element.style.borderTopLeftRadius)
    check(`${key}-round`, `${key} computes round`, isRound(element.style.cornerShape), element.style.cornerShape)
  }
  const switchThumb = state.settings?.settings?.switchThumb ?? null
  if (switchThumb !== null) {
    check('switch-thumb-square', 'settings switch thumb 16×16', switchThumb.rect.w === 16 && switchThumb.rect.h === 16, switchThumb.rect)
    check('switch-thumb-round', 'settings switch thumb computes round', isRound(switchThumb.style.cornerShape), switchThumb.style.cornerShape)
  }
  return list.map((entry) => ({ theme, ...entry }))
}

const clipFor = (rect, padding) => ({
  x: Math.max(0, rect.x - padding),
  y: Math.max(0, rect.y - padding),
  width: rect.w + padding * 2,
  height: rect.h + padding * 2
})

for (const theme of ['dark', 'light']) {
  const context = await browser.newContext({
    viewport: { width: 1600, height: 1000 },
    deviceScaleFactor: 2,
    locale: 'zh-CN',
    colorScheme: theme
  })
  const page = await context.newPage()
  page.on('console', (message) => {
    if (message.type() === 'error') console.log(`[m20-corners:${theme}] console error: ${message.text()}`)
  })
  await page.goto(url, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('[data-composer-card="true"]', { timeout: 30000 }).catch(() => {})
  await page.waitForTimeout(2200)
  await closeDialogs(page)
  await ensureWorkMode(page)
  await ensureWorkspace(page)
  await ensureWorkMode(page)
  await page.mouse.move(20, 20)
  await page.waitForTimeout(400)

  const themeResult = { screenshots: [], state: {}, assertions: [] }
  const base = await measure(page)
  themeResult.state.base = base

  const sendRect = base.send?.rect
  if (sendRect !== undefined && sendRect !== null) {
    const name = `m20-corners-${theme}-send-4x.png`
    await shot(context, page, name, clipFor(sendRect, 8), 4)
    themeResult.screenshots.push(name)
  }
  const avatarRect = base.avatar?.rect
  if (avatarRect !== undefined && avatarRect !== null) {
    const name = `m20-corners-${theme}-avatar-4x.png`
    await shot(context, page, name, clipFor(avatarRect, 8), 4)
    themeResult.screenshots.push(name)
  }

  const panelOpen = await openEffortPanel(page)
  await page.mouse.move(20, 20)
  await page.waitForTimeout(400)
  const panel = await measure(page)
  themeResult.state.panel = panel
  themeResult.state.effortOpen = panelOpen
  if (panelOpen) {
    if (panel.effort.thumb !== null) {
      const name = `m20-corners-${theme}-thumb-4x.png`
      await shot(context, page, name, clipFor(panel.effort.thumb.rect, 6), 4)
      themeResult.screenshots.push(name)
    }
    if (panel.effort.track !== null) {
      const name = `m20-corners-${theme}-dots-4x.png`
      const track = panel.effort.track.rect
      await shot(context, page, name, { x: Math.max(0, track.x - 10), y: Math.max(0, track.y - 8), width: track.w + 20, height: track.h + 16 }, 4)
      themeResult.screenshots.push(name)
    }
    if (panel.effort.menu !== null) {
      const name = `m20-corners-${theme}-panel-2x.png`
      await shot(context, page, name, clipFor(panel.effort.menu.rect, 12), 2)
      themeResult.screenshots.push(name)
    }
  }
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)

  // Work tool menu: the 16px menu surface.
  const workTool = page.locator('.chatgpt-work-tool').first()
  if (await workTool.count()) {
    await workTool.click({ force: true }).catch(() => {})
    await page.waitForTimeout(500)
    themeResult.state.workMenu = await measure(page)
    await page.mouse.move(20, 20)
    await page.waitForTimeout(250)
    if (themeResult.state.workMenu.workMenu !== null) {
      const name = `m20-corners-${theme}-menu-2x.png`
      await shot(context, page, name, clipFor(themeResult.state.workMenu.workMenu.rect, 10), 2)
      themeResult.screenshots.push(name)
    }
    await page.keyboard.press('Escape')
    await page.waitForTimeout(250)
  }

  // Search dialog (16px surface).
  await page.keyboard.press('Control+k')
  await page.waitForTimeout(700)
  themeResult.state.search = await measure(page)
  await page.keyboard.press('Escape')
  await page.waitForTimeout(250)

  // Settings: the host switch thumb is a 16px circle (radio/checkbox family).
  const settingsOpen = await openSettings(page)
  themeResult.state.settingsOpen = settingsOpen
  if (settingsOpen) {
    themeResult.state.settings = await measure(page)
    const thumb = themeResult.state.settings.settings.switchThumb
    if (thumb !== null) {
      const name = `m20-corners-${theme}-switch-4x.png`
      await shot(context, page, name, clipFor(thumb.rect, 8), 4)
      themeResult.screenshots.push(name)
    }
    await page.keyboard.press('Escape')
    await page.waitForTimeout(500)
  }

  // Work composer card (28px) before the Chat variant replaces it.
  const workSurfaceRect = themeResult.state.base.composerCard?.rect
  if (workSurfaceRect !== undefined && workSurfaceRect !== null) {
    const name = `m20-corners-${theme}-surfaces-work-2x.png`
    await shot(context, page, name, { x: Math.max(0, workSurfaceRect.x - 16), y: Math.max(0, workSurfaceRect.y - 16), width: workSurfaceRect.w + 32, height: workSurfaceRect.h + 100 }, 2)
    themeResult.screenshots.push(name)
  }

  // Chat mode card is the 26px variant of the composer surface.
  const chatSegment = page.locator('.chatgpt-mode-seg[data-segment="chat"]').first()
  if (await chatSegment.count()) {
    await chatSegment.click({ force: true }).catch(() => {})
    await page.waitForTimeout(900)
    themeResult.state.chat = await measure(page)
    const chatRect = themeResult.state.chat.composerCard?.rect
    if (chatRect !== undefined && chatRect !== null) {
      const name = `m20-corners-${theme}-surfaces-chat-2x.png`
      await shot(context, page, name, { x: Math.max(0, chatRect.x - 16), y: Math.max(0, chatRect.y - 16), width: chatRect.w + 32, height: chatRect.h + 70 }, 2)
      themeResult.screenshots.push(name)
    }
  }

  const fullName = `m20-corners-${theme}-full.png`
  await shot(context, page, fullName, { x: 0, y: 0, width: 1600, height: 1000 }, 1)
  themeResult.screenshots.push(fullName)

  const panelState = themeResult.state.panel
  themeResult.assertions.push(...assertionsFor(theme, {
    ...base,
    ...panelState,
    root: base.root,
    effort: panelState.effort,
    workMenu: themeResult.state.workMenu,
    search: themeResult.state.search,
    settings: themeResult.state.settings,
    chat: themeResult.state.chat,
    circles: [...base.circles, ...panelState.circles].filter((circle, index, list) => list.findIndex((entry) => entry.className === circle.className && entry.rect.w === circle.rect.w && entry.rect.h === circle.rect.h) === index)
  }))
  themeResult.assertionSummary = {
    total: themeResult.assertions.length,
    passed: themeResult.assertions.filter((entry) => entry.pass).length,
    failed: themeResult.assertions.filter((entry) => !entry.pass).map((entry) => entry.id)
  }
  result.themes[theme] = themeResult
  await context.close()
}

// Control: with the skin switch off the Host keeps its own superellipse(1.5).
// The Host strips the query string after boot, so `?skin=off` is not reliable;
// the documented switch (used by the native-parity gate) is localStorage, set
// before the app module evaluates.
{
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 2, locale: 'zh-CN' })
  await context.addInitScript(() => {
    try {
      localStorage.setItem('cgpt-skin', 'off')
    } catch {
      // The control then measures the skinned page and fails loudly.
    }
  })
  const page = await context.newPage()
  await page.goto(url, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('[data-composer-card="true"]', { timeout: 30000 }).catch(() => {})
  await page.waitForTimeout(2000)
  result.skinOff = await page.evaluate(() => {
    const num = (value) => Math.round(Number(value) * 10) / 10
    const info = (el) => {
      if (el === null || el === undefined) return null
      const r = el.getBoundingClientRect()
      const cs = getComputedStyle(el)
      return { rect: { w: num(r.width), h: num(r.height) }, cornerShape: cs.cornerShape, borderTopLeftRadius: cs.borderTopLeftRadius }
    }
    const root = getComputedStyle(document.body)
    return {
      bodyAttribute: document.body.getAttribute('data-chatgpt-ui'),
      rootVariable: getComputedStyle(document.documentElement).getPropertyValue('--dsw-corner-shape').trim(),
      rootCornerShape: root.cornerShape,
      send: info(document.querySelector("[data-composer-card='true'] button[class*='_primary']")),
      add: info(document.querySelector("[data-composer-card='true'] button[class*='_add']")),
      composerCard: info(document.querySelector("[data-composer-card='true']"))
    }
  })
  await context.close()
}

const flat = Object.values(result.themes).flatMap((theme) => theme.assertions)
flat.push({
  theme: 'control',
  id: 'skin-off-host-outline',
  label: 'skin=off mounts nothing: no document mark, the Host keeps superellipse(1.5) on its surfaces',
  pass: result.skinOff.bodyAttribute === null &&
    result.skinOff.rootVariable === 'superellipse(1.5)' &&
    result.skinOff.rootCornerShape === 'superellipse(1.5)' &&
    result.skinOff.composerCard?.cornerShape === 'superellipse(1.5)',
  measured: result.skinOff
})
result.assertions = flat
result.assertionSummary = {
  total: flat.length,
  passed: flat.filter((entry) => entry.pass).length,
  failed: flat.filter((entry) => !entry.pass).map((entry) => `${entry.theme}:${entry.id}`)
}

writeFileSync(join(DOCS, 'm20.json'), `${JSON.stringify(result, null, 2)}\n`)
console.log(JSON.stringify({
  wrote: join(DOCS, 'm20.json'),
  screenshots: Object.values(result.themes).flatMap((theme) => theme.screenshots).length,
  summary: result.assertionSummary
}, null, 2))
await browser.close()
if (result.assertionSummary.failed.length > 0) process.exitCode = 1
