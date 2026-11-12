#!/usr/bin/env node
/**
 * scripts/m17-capture.mjs — P0-6 measured frames for the reasoning panel.
 *
 * One URL, both themes. Per theme it captures three frames of the 280px
 * popover: the default level, the two-line block under the pointer (its
 * #3A3A3A / #F2F2F2 hover surface), and the slider dragged to the highest
 * stop (blue→purple fill, 「最高」 label).
 *
 * Read-only towards the Host: it opens the skin's own pill, hovers its own
 * block and drags its own range input. It starts each theme from a fresh blank
 * session and sends no message. Writes docs/capture/live/m17-capture.json and
 * docs/screenshots/m17-panel-*.png.
 *
 *   node scripts/m17-capture.mjs --url "http://127.0.0.1:3117/?token=…"
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
  console.error('usage: node scripts/m17-capture.mjs --url <tokenised-url>')
  process.exit(2)
}
const OUT = resolve(ROOT, typeof args.get('out') === 'string' ? args.get('out') : 'docs/capture/live')
const SHOTS = resolve(ROOT, 'docs/screenshots')
mkdirSync(OUT, { recursive: true })
mkdirSync(SHOTS, { recursive: true })

let playwright
for (const candidate of ['playwright', 'playwright', 'playwright-core']) {
  try {
    playwright = await import(candidate)
    break
  } catch {}
}
if (playwright === undefined) {
  console.error('m17-capture: playwright is required')
  process.exit(2)
}
const CHROME = process.env.M17_CHROME ?? process.env.HOME + '/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome'
const browser = await playwright.chromium.launch({
  headless: true,
  executablePath: CHROME,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
})

const result = {
  source: 'user desktop screenshots (P0-6 brief)',
  capturedAt: new Date().toISOString(),
  url: url.replace(/([?&]token=)[^&]+/, '$1***'),
  viewport: { width: 1600, height: 1000, dpr: 2, locale: 'zh-CN' },
  themes: {}
}

async function shot(page, name, clip) {
  const session = await page.context().newCDPSession(page)
  const png = await session.send('Page.captureScreenshot', {
    format: 'png',
    fromSurface: true,
    captureBeyondViewport: false,
    ...(clip === undefined ? {} : { clip: { ...clip, scale: 2 } })
  }).catch(() => null)
  await session.detach().catch(() => {})
  if (png?.data !== undefined) {
    writeFileSync(join(SHOTS, name), Buffer.from(png.data, 'base64'))
    return true
  }
  return false
}

const measure = (page) => page.evaluate(() => {
  const round = (value) => Math.round(Number(value) * 10) / 10
  const rect = (el) => {
    if (el === null || el === undefined) return null
    const b = el.getBoundingClientRect()
    return {
      x: round(b.x), y: round(b.y), w: round(b.width), h: round(b.height),
      r: round(b.right), b: round(b.bottom),
      cx: round(b.x + b.width / 2), cy: round(b.y + b.height / 2)
    }
  }
  const css = (el, keys) => el === null || el === undefined
    ? null
    : Object.fromEntries(keys.map((key) => [key, getComputedStyle(el).getPropertyValue(key)]))
  const menu = document.querySelector('[data-cgpt-model-menu]')
  const pill = document.querySelector('[data-cgpt-model-pill]')
  if (menu === null) return { menu: null, pill: pill?.innerText ?? null }

  const block = menu.querySelector('.chatgpt-effort-choice')
  const effortName = block?.querySelector('.chatgpt-effort-choice-name')
  const model = block?.querySelector('.chatgpt-effort-choice-model')
  const modelName = block?.querySelector('.chatgpt-effort-choice-model-name')
  const chevron = block?.querySelector('.chatgpt-effort-choice-chevron')
  const reset = menu.querySelector('.chatgpt-effort-reset')
  const track = menu.querySelector('.chatgpt-effort-track')
  const fill = menu.querySelector('.chatgpt-effort-fill')
  const thumb = menu.querySelector('.chatgpt-effort-thumb')
  const range = menu.querySelector('.chatgpt-effort-range')
  const ticks = [...menu.querySelectorAll('.chatgpt-effort-tick')]
  const thumbBox = thumb?.getBoundingClientRect()
  const blank = menu.querySelector('.chatgpt-effort-head-blank')

  return {
    pill: {
      text: pill?.innerText ?? null,
      placeholder: pill?.querySelector('[data-cgpt-pill-placeholder]')?.textContent ?? null,
      expanded: pill?.getAttribute('aria-expanded') ?? null,
      rect: rect(pill),
      style: css(pill, ['height', 'border-radius', 'background-color', 'box-shadow', 'border', 'font-size', 'font-weight'])
    },
    menu: {
      rect: rect(menu),
      style: css(menu, ['width', 'padding', 'border-radius', 'background-color', 'box-shadow', 'overflow']),
      view: menu.getAttribute('data-view')
    },
    simple: {
      rect: rect(menu.querySelector('.chatgpt-model-simple')),
      style: css(menu.querySelector('.chatgpt-model-simple'), ['padding', 'box-sizing'])
    },
    head: { rect: rect(menu.querySelector('.chatgpt-effort-head')), style: css(menu.querySelector('.chatgpt-effort-head'), ['grid-template-columns', 'column-gap', 'min-height']) },
    blank: {
      present: blank !== null,
      lightning: menu.querySelector('.chatgpt-effort-head-icon') !== null,
      svgCount: blank === null ? 0 : blank.querySelectorAll('svg').length,
      rect: rect(blank),
      style: css(blank, ['width', 'height'])
    },
    block: {
      present: block !== null,
      rect: rect(block),
      style: css(block, ['width', 'height', 'border-radius', 'background-color', 'padding', 'gap', 'flex-direction']),
      lines: [...(block?.children ?? [])].map((child) => child.className)
    },
    effort: {
      text: effortName?.textContent ?? null,
      rect: rect(effortName),
      style: css(effortName, ['font-size', 'font-weight', 'color', 'line-height'])
    },
    model: {
      text: modelName?.textContent ?? null,
      rect: rect(modelName),
      style: css(modelName, ['font-size', 'font-weight', 'color', 'line-height']),
      lineRect: rect(model),
      overflow: modelName === null ? null : (modelName.scrollWidth > modelName.clientWidth + 1)
    },
    chevron: { rect: rect(chevron), style: css(chevron, ['width', 'height', 'color']) },
    reset: { rect: rect(reset), style: css(reset, ['width', 'height', 'color', 'background-color', 'border-radius']) },
    slider: { rect: rect(menu.querySelector('.chatgpt-effort-slider')) },
    track: { rect: rect(track), style: css(track, ['width', 'height', 'border-radius', 'background-color']) },
    fill: {
      rect: rect(fill),
      style: css(fill, ['height', 'border-radius', 'background-color', 'background-image']),
      max: fill?.getAttribute('data-max') ?? null
    },
    thumb: {
      rect: rect(thumb),
      style: css(thumb, ['width', 'height', 'border-radius', 'background-color', 'border', 'box-shadow', 'top']),
      centred: thumbBox !== undefined && track !== null
        ? Math.abs((thumbBox.y + thumbBox.height / 2) - (track.getBoundingClientRect().y + track.getBoundingClientRect().height / 2)) < 0.5
        : null
    },
    ticks: ticks.map((tick) => {
      const b = tick.getBoundingClientRect()
      return {
        rect: rect(tick),
        style: css(tick, ['width', 'height', 'border-radius', 'background-color']),
        selected: tick.getAttribute('data-selected'),
        coveredByThumb: thumbBox !== undefined
          ? b.x + b.width / 2 >= thumbBox.x && b.x + b.width / 2 <= thumbBox.x + thumbBox.width
            && b.y + b.height / 2 >= thumbBox.y && b.y + b.height / 2 <= thumbBox.y + thumbBox.height
          : false
      }
    }),
    range: { rect: rect(range), value: range?.value ?? null, max: range?.max ?? null },
    values: {
      panelCenter: round(menu.getBoundingClientRect().x + menu.getBoundingClientRect().width / 2),
      blockCenter: block === null ? null : round(block.getBoundingClientRect().x + block.getBoundingClientRect().width / 2),
      resetRightInset: reset === null ? null : round(menu.getBoundingClientRect().right - reset.getBoundingClientRect().right),
      trackLeftInset: track === null ? null : round(track.getBoundingClientRect().x - menu.getBoundingClientRect().x),
      trackRightInset: track === null ? null : round(menu.getBoundingClientRect().right - track.getBoundingClientRect().right),
      blockToTrack: block === null || track === null ? null : round(track.getBoundingClientRect().y - block.getBoundingClientRect().bottom),
      panelBottomPadding: track === null ? null : round(menu.getBoundingClientRect().bottom - track.getBoundingClientRect().bottom),
      thumbOverTrackTop: thumbBox === undefined || track === null ? null : round(track.getBoundingClientRect().y - thumbBox.y)
    }
  }
})

const clipFor = (state) => {
  const menu = state.menu.rect
  const pill = state.pill.rect
  const left = Math.min(menu.x, pill.x)
  const right = Math.max(menu.r, pill.r)
  const top = menu.y
  const bottom = Math.max(menu.b, pill.b)
  return { x: left - 24, y: top - 24, width: right - left + 48, height: bottom - top + 48 }
}

for (const theme of ['light', 'dark']) {
  const context = await browser.newContext({
    viewport: { width: 1600, height: 1000 },
    deviceScaleFactor: 2,
    locale: 'zh-CN',
    colorScheme: theme
  })
  const page = await context.newPage()
  page.on('console', (message) => {
    if (message.type() === 'error') console.log(`[m17-capture:${theme}] console error: ${message.text()}`)
  })
  await page.goto(url, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('[data-composer-card="true"]', { timeout: 30000 }).catch(() => {})
  await page.waitForTimeout(2200)
  for (const label of ['Close', '关闭']) {
    const close = page.getByRole('button', { name: label }).first()
    if (await close.count()) await close.click({ force: true }).catch(() => {})
  }
  await page.waitForTimeout(200)
  await page.keyboard.press('Escape')
  await page.waitForTimeout(200)
  if ((await page.evaluate(() => document.body.dataset.chatgptMode)) !== 'agent') {
    const seg = page.locator('.chatgpt-mode-seg[data-segment="agent"]').first()
    if (await seg.count()) await seg.click({ force: true })
    await page.waitForTimeout(700)
  }
  // Each theme starts from a fresh blank session so the frame shows the model
  // default, not the effort the previous capture dragged to.
  const newChat = page.locator('.chatgpt-new-chat').first()
  if (await newChat.count()) {
    await newChat.click()
    await page.waitForTimeout(2500)
  }
  await page.waitForTimeout(300)

  const pill = page.locator('[data-cgpt-model-pill]').first()
  if ((await pill.count()) === 0) {
    console.log(`[m17-capture:${theme}] no model pill; skipped`)
    await context.close()
    continue
  }
  await pill.click()
  await page.waitForTimeout(450)

  // The Host remembers the last level; reset to the model default first.
  const reset = page.locator('[data-cgpt-effort-reset]').first()
  if (await reset.count()) {
    await reset.click({ force: true })
    await page.waitForTimeout(900)
  }
  await page.mouse.move(20, 20)
  await page.waitForTimeout(450)

  const base = await measure(page)
  const frames = { default: base, hover: null, max: null }
  const screenshots = []
  const baseClip = clipFor(base)
  if (await shot(page, `m17-panel-${theme}.png`, baseClip)) screenshots.push(`m17-panel-${theme}.png`)

  // Hover the two-line block and keep the pointer there for the frame.
  const block = page.locator('.chatgpt-effort-choice').first()
  if (await block.count()) {
    await block.hover()
    await page.waitForTimeout(350)
    frames.hover = await measure(page)
    if (await shot(page, `m17-panel-hover-${theme}.png`, baseClip)) screenshots.push(`m17-panel-hover-${theme}.png`)
  }
  await page.mouse.move(20, 20)
  await page.waitForTimeout(350)

  // Drag to the highest stop with a real pointer gesture.
  const track = await page.locator('.chatgpt-effort-track').first().boundingBox()
  if (track !== null) {
    await page.mouse.move(track.x + track.width * 0.6, track.y + track.height / 2)
    await page.mouse.down()
    await page.mouse.move(track.x + track.width - 10, track.y + track.height / 2, { steps: 12 })
    await page.mouse.up()
    await page.waitForTimeout(900)
  }
  await page.mouse.move(20, 20)
  await page.waitForTimeout(450)
  frames.max = await measure(page)
  if (frames.max.menu !== null) {
    const clip = clipFor(frames.max)
    if (await shot(page, `m17-panel-max-${theme}.png`, clip)) screenshots.push(`m17-panel-max-${theme}.png`)
  }

  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)
  result.themes[theme] = { frames, screenshots, dismissed: (await page.locator('[data-cgpt-model-menu]').count()) === 0 }
  await context.close()
}

writeFileSync(join(OUT, 'm17-capture.json'), `${JSON.stringify(result, null, 2)}\n`)
console.log(`m17-capture: wrote ${join(OUT, 'm17-capture.json')} and ${result.themes.dark?.screenshots.length ?? 0}+${result.themes.light?.screenshots.length ?? 0} screenshots`)
await browser.close()
