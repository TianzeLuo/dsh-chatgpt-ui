#!/usr/bin/env node
/**
 * scripts/m14-capture.mjs — P0-4 measured frames for the reasoning panel.
 *
 * One URL, both themes. Per theme it captures:
 *   - the open effort panel (two-line header, lightning, reset, 5-stop slider);
 *   - the slider dragged to the highest stop;
 *   - the provider-grouped model list.
 *
 * Read-only towards the Host: it opens the skin's own pill, drags its own
 * range input and clicks its own model line. It creates one blank scratch
 * session when the page has none (the composer is session-scoped) and sends
 * no message. Writes docs/capture/live/m14-<theme>.json and
 * docs/capture/live/m14-*.png.
 *
 *   node scripts/m14-capture.mjs --url "http://127.0.0.1:3114/?token=…"
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
  console.error('usage: node scripts/m14-capture.mjs --url <tokenised-url>')
  process.exit(2)
}
const OUT = resolve(ROOT, typeof args.get('out') === 'string' ? args.get('out') : 'docs/capture/live')
mkdirSync(OUT, { recursive: true })

let playwright
for (const candidate of ['/mnt/f/project/y86/node_modules/playwright/index.mjs', 'playwright', 'playwright-core']) {
  try {
    playwright = await import(candidate)
    break
  } catch {}
}
if (playwright === undefined) {
  console.error('m14-capture: playwright is required')
  process.exit(2)
}
const CHROME = process.env.M14_CHROME ?? '/home/user/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome'
const browser = await playwright.chromium.launch({
  headless: true,
  executablePath: CHROME,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
})

const result = {
  source: 'user desktop screenshots (P0-4 brief)',
  capturedAt: new Date().toISOString(),
  url: url.replace(/([?&]token=)[^&]+/, '$1***'),
  themes: {}
}
const round = (value) => Math.round(Number(value) * 10) / 10

async function shot(page, name, clip) {
  const session = await page.context().newCDPSession(page)
  const png = await session.send('Page.captureScreenshot', {
    format: 'png',
    fromSurface: true,
    captureBeyondViewport: false,
    ...(clip === undefined ? {} : { clip: { ...clip, scale: 2 } })
  }).catch(() => null)
  await session.detach().catch(() => {})
  if (png?.data !== undefined) writeFileSync(join(OUT, name), Buffer.from(png.data, 'base64'))
}

const measure = (page) => page.evaluate(() => {
  const round = (value) => Math.round(Number(value) * 10) / 10
  const rect = (el) => {
    if (el === null || el === undefined) return null
    const b = el.getBoundingClientRect()
    return { x: round(b.x), y: round(b.y), w: round(b.width), h: round(b.height), b: round(b.bottom), r: round(b.right), cx: round(b.x + b.width / 2), cy: round(b.y + b.height / 2) }
  }
  const css = (el, keys) => el === null || el === undefined
    ? null
    : Object.fromEntries(keys.map((key) => [key, getComputedStyle(el).getPropertyValue(key)]))
  const menu = document.querySelector('[data-cgpt-model-menu]')
  if (menu === null) return { menu: null, pill: document.querySelector('[data-cgpt-model-pill]')?.innerText ?? null }
  const pill = document.querySelector('[data-cgpt-model-pill]')
  const simpleBox = menu.querySelector('.chatgpt-model-simple')
  const name = menu.querySelector('.chatgpt-effort-head-name')
  const toggle = menu.querySelector('.chatgpt-model-simple-toggle')
  const reset = menu.querySelector('.chatgpt-effort-reset')
  const lightning = menu.querySelector('.chatgpt-effort-head-icon')
  const track = menu.querySelector('.chatgpt-effort-track')
  const fill = menu.querySelector('.chatgpt-effort-fill')
  const thumb = menu.querySelector('.chatgpt-effort-thumb')
  const range = menu.querySelector('.chatgpt-effort-range')
  const ticks = [...menu.querySelectorAll('.chatgpt-effort-tick')]
  const titleStyle = css(menu.querySelector('.chatgpt-model-group-title'), ['height', 'background-color', 'color', 'font-size', 'font-weight', 'padding'])
  return {
    pill: {
      text: pill?.innerText ?? null,
      placeholder: pill?.querySelector('[data-cgpt-pill-placeholder]')?.textContent ?? null,
      expanded: pill?.getAttribute('aria-expanded') ?? null,
      rect: rect(pill)
    },
    menu: {
      rect: rect(menu),
      style: css(menu, ['width', 'border-radius', 'padding', 'background-color', 'box-shadow', 'overflow']),
      view: menu.getAttribute('data-view'),
      scrollHeight: menu.scrollHeight,
      clientHeight: menu.clientHeight
    },
    simple: name === null ? null : {
      box: { rect: rect(simpleBox), style: css(simpleBox, ['padding', 'box-sizing']) },
      header: rect(menu.querySelector('.chatgpt-effort-head')),
      name: { text: name.textContent, rect: rect(name), style: css(name, ['color', 'font-size', 'font-weight', 'line-height']) },
      toggle: { text: toggle.innerText, rect: rect(toggle), style: css(toggle, ['color', 'font-size', 'font-weight']) },
      lightning: rect(lightning),
      reset: { rect: rect(reset), style: css(reset, ['color', 'border-radius']) },
      track: { rect: rect(track), style: css(track, ['height', 'border-radius', 'background-color']) },
      fill: { rect: rect(fill), style: css(fill, ['background-color', 'border-radius']) },
      thumb: { rect: rect(thumb), style: css(thumb, ['width', 'height', 'border-radius', 'background-color', 'border', 'box-shadow', 'top']) },
      ticks: ticks.map((tick) => ({ rect: rect(tick), style: css(tick, ['width', 'height', 'border-radius', 'background-color']), selected: tick.getAttribute('data-selected') })),
      range: { rect: rect(range), value: range?.value ?? null, max: range?.max ?? null },
      slider: rect(menu.querySelector('.chatgpt-effort-slider'))
    },
    advanced: menu.getAttribute('data-view') === 'advanced' ? {
      groups: [...menu.querySelectorAll('[data-cgpt-model-group]')].map((group) => ({
        provider: group.getAttribute('data-cgpt-model-group'),
        title: group.querySelector('.chatgpt-model-group-title')?.textContent ?? '',
        rect: rect(group),
        titleRect: rect(group.querySelector('.chatgpt-model-group-title')),
        titleStyle,
        rows: [...group.querySelectorAll('.chatgpt-model-choice')].map((row) => ({
          name: row.querySelector('.chatgpt-model-choice-name')?.textContent ?? '',
          current: row.getAttribute('data-current') === 'true',
          checked: row.getAttribute('aria-checked') === 'true',
          check: row.querySelector('.chatgpt-model-choice-check') !== null,
          description: row.querySelector('.chatgpt-model-choice-description') !== null,
          rect: rect(row),
          style: css(row, ['height', 'padding', 'border-radius', 'font-size', 'font-weight'])
        }))
      })),
      descriptionCount: menu.querySelectorAll('.chatgpt-model-choice-description').length
    } : null
  }
})

for (const theme of ['light', 'dark']) {
  const context = await browser.newContext({
    viewport: { width: 1600, height: 1000 },
    deviceScaleFactor: 2,
    locale: 'zh-CN',
    colorScheme: theme
  })
  const page = await context.newPage()
  page.on('console', (message) => {
    if (message.type() === 'error') console.log(`[m14-capture:${theme}] console error: ${message.text()}`)
  })
  await page.goto(url, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('[data-composer-card="true"]', { timeout: 30000 }).catch(() => {})
  await page.waitForTimeout(2200)
  for (const label of ['Close', '关闭']) {
    const close = page.getByRole('button', { name: label }).first()
    if (await close.count()) await close.click({ force: true }).catch(() => {})
  }
  await page.waitForTimeout(300)
  await page.keyboard.press('Escape')
  await page.waitForTimeout(200)
  if ((await page.evaluate(() => document.body.dataset.chatgptMode)) !== 'agent') {
    const seg = page.locator('.chatgpt-mode-seg[data-segment="agent"]').first()
    if (await seg.count()) await seg.click({ force: true })
    await page.waitForTimeout(700)
  }
  // Each theme starts from a fresh blank session so the frame shows the
  // deployment default (xhigh), not the effort a previous capture dragged to.
  const newChat = page.locator('.chatgpt-new-chat').first()
  if (await newChat.count()) {
    await newChat.click()
    await page.waitForTimeout(2500)
  }
  await page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur())
  await page.waitForTimeout(300)

  const pill = page.locator('[data-cgpt-model-pill]').first()
  if ((await pill.count()) === 0) {
    console.log(`[m14-capture:${theme}] no model pill; skipped`)
    await context.close()
    continue
  }
  await pill.click()
  await page.waitForTimeout(450)
  // The Host remembers the last used level across blank sessions, and the
  // previous capture ends on the top stop. Reset to the model's default so
  // the "open" frame always shows the deployment default (xhigh), then keep
  // the reset interaction in the same evidence run.
  const reset = page.locator('[data-cgpt-effort-reset]').first()
  if (await reset.count()) {
    await reset.click({ force: true })
    await page.waitForTimeout(900)
    await page.mouse.move(20, 20)
    await page.waitForTimeout(200)
  }
  const simple = await measure(page)
  result.themes[theme] = { simple, max: null, advanced: null }
  if (simple.simple !== null) {
    const box = simple.menu.rect
    await shot(page, `m14-panel-${theme}.png`, { x: box.x - 24, y: box.y - 24, width: box.w + 48, height: box.h + 104 })
  }

  // Drag the handle to the far right stop with a real pointer gesture.
  const track = await page.locator('.chatgpt-effort-track').first().boundingBox()
  if (track !== null) {
    await page.mouse.move(track.x + track.width * 0.6, track.y + track.height / 2)
    await page.mouse.down()
    await page.mouse.move(track.x + track.width - 16, track.y + track.height / 2, { steps: 12 })
    await page.mouse.up()
    await page.waitForTimeout(900)
  }
  const max = await measure(page)
  result.themes[theme].max = max
  if (max.simple !== null) {
    const box = max.menu.rect
    await shot(page, `m14-slider-max-${theme}.png`, { x: box.x - 24, y: box.y - 24, width: box.w + 48, height: box.h + 104 })
  }

  // Model list: the second line of the header drills in.
  await page.locator('[data-cgpt-model-view-toggle]').click()
  await page.waitForTimeout(450)
  const advanced = await measure(page)
  result.themes[theme].advanced = advanced
  if (advanced.menu !== null) {
    const box = advanced.menu.rect
    await shot(page, `m14-models-${theme}.png`, { x: box.x - 24, y: box.y - 24, width: box.w + 48, height: box.h + 48 })
  }

  // Picking the current row must return to the effort view, then Escape and an
  // outside click must close the panel. The current row is chosen so the next
  // capture starts from the same model.
  const currentRow = page.locator('[data-cgpt-model-choice][data-current="true"]').first()
  if (await currentRow.count()) {
    await currentRow.click()
    await page.waitForTimeout(600)
    const afterPick = await measure(page)
    result.themes[theme].afterPick = { view: afterPick.menu?.view ?? null, pill: afterPick.pill?.text ?? null }
    await page.keyboard.press('Escape')
    await page.waitForTimeout(300)
    result.themes[theme].dismissEsc = (await page.locator('[data-cgpt-model-menu]').count()) === 0
    await page.locator('[data-cgpt-model-pill]').first().click()
    await page.waitForTimeout(350)
    await page.locator('[data-composer-input="true"]').first().click()
    await page.waitForTimeout(300)
    result.themes[theme].dismissOutside = (await page.locator('[data-cgpt-model-menu]').count()) === 0
  }
  await context.close()
}

writeFileSync(join(OUT, 'm14-capture.json'), `${JSON.stringify(result, null, 2)}\n`)
console.log(`m14-capture: wrote ${join(OUT, 'm14-capture.json')}`)
await browser.close()
