#!/usr/bin/env node
/**
 * scripts/m18-bubble.mjs — P0-7 acceptance frames for the user bubble.
 *
 * Captures the three moments of one send in both themes:
 *
 *   before     the previous, already durable user bubble (the colour the
 *              composer hands over from)
 *   immediate  the Host's optimistic echo row (`[data-submission-echo]`),
 *              held open by CDP latency so the frame is observable
 *   stable     the durable `[data-chat-flow-kind='user']` node after the
 *              admission round-trip
 *
 * It asserts that the three computed `background-color` values are identical
 * and that `transition-duration` is `0s`, writes `docs/m18.json`, the raw
 * panels under `docs/capture/live/`, and the three-column sheet
 * `docs/screenshots/m18-bubble.png`.
 *
 * Dev-only: needs playwright + Chromium, like the other capture scripts.
 * Read-only towards the Host apart from sending two prompts in a scratch
 * workspace (the m18 fixture model answers without tools or file writes).
 *
 *   node scripts/m18-bubble.mjs --url "http://127.0.0.1:3121/?token=…"
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
  else {
    args.set(token.slice(2), next)
    i += 1
  }
}
const url = args.get('url')
if (typeof url !== 'string') {
  console.error('usage: node scripts/m18-bubble.mjs --url <tokenised-url>')
  process.exit(2)
}
const DOCS = resolve(ROOT, typeof args.get('out') === 'string' ? args.get('out') : 'docs')
const LIVE = join(DOCS, 'capture', 'live')
const SHOTS = join(DOCS, 'screenshots')
mkdirSync(LIVE, { recursive: true })
mkdirSync(SHOTS, { recursive: true })

let playwright
for (const candidate of ['playwright', 'playwright', 'playwright-core']) {
  try {
    playwright = await import(candidate)
    break
  } catch {}
}
if (playwright === undefined) {
  console.error('m18-bubble: playwright is required')
  process.exit(2)
}
const CHROME = process.env.M18_CHROME ?? process.env.CHATGPT_UI_CHROME ?? process.env.HOME + '/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome'
const VIEWPORT = { width: 1440, height: 900 }
const CLIP = { x: 440, y: 56, width: 960, height: 840 }
const TEXT_BEFORE = 'P0-7 帧一：先取得一条已稳定的用户气泡，它的底色就是发送瞬间必须保持的颜色。'
const TEXT_SEND = 'P0-7 帧二：点击发送的瞬间与确认之后，都必须是同一块蓝底。'

const browser = await playwright.chromium.launch({
  headless: true,
  executablePath: CHROME,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
})

const result = {
  task: 'P0-7',
  capturedAt: new Date().toISOString(),
  url: url.replace(/([?&]token=)[^&]+/, '$1***'),
  viewport: VIEWPORT,
  contract: {
    userBubbleToken: { light: '--cgpt-user-bubble-bg', dark: '--cgpt-user-bubble-bg' },
    pendingAnchor: '[data-submission-echo]',
    durableAnchor: "[data-chat-flow-kind='user']"
  },
  themes: {}
}

const round = (value) => Math.round(Number(value) * 10) / 10
const capture = async (page, name) => {
  const session = await page.context().newCDPSession(page)
  const shot = await session.send('Page.captureScreenshot', {
    format: 'png',
    fromSurface: true,
    captureBeyondViewport: false,
    clip: { ...CLIP, scale: 2 }
  }).catch(() => null)
  await session.detach().catch(() => {})
  if (shot?.data === undefined) throw new Error(`screenshot failed: ${name}`)
  writeFileSync(join(LIVE, name), Buffer.from(shot.data, 'base64'))
}

const bubbleStyle = (page) => page.evaluate(() => {
  const first = document.querySelector("[data-chat-flow-kind='user']")
  const rows = [...document.querySelectorAll("[data-chat-flow-kind='user']")]
  const echo = document.querySelector('[data-submission-echo]')
  const durableRow = echo === null ? rows.at(-1) ?? null : null
  let state
  let row
  if (echo !== null) {
    state = 'submission-echo'
    row = echo
  } else if (durableRow !== null) {
    state = 'durable'
    row = durableRow
  } else {
    state = 'none'
    row = null
  }
  const bubble = row?.querySelector('.Sixlwa_bubble') ?? null
  const assistant = document.querySelector("[data-chat-flow-kind='assistant-step'] .hWmORq_root")
  const read = (el, keys) => el === null || el === undefined
    ? null
    : Object.fromEntries(keys.map((key) => [key, getComputedStyle(el).getPropertyValue(key)]))
  const box = bubble?.getBoundingClientRect()
  return {
    state,
    hasFirst: first !== null,
    userRows: rows.length,
    echoes: document.querySelectorAll('[data-submission-echo]').length,
    bubble: read(bubble, [
      'background-color', 'color', 'transition-duration', 'transition-property',
      'border-radius', 'font-size', 'line-height', 'padding'
    ]),
    rect: box === undefined ? null : {
      x: Math.round(box.x), y: Math.round(box.y), w: Math.round(box.width), h: Math.round(box.height)
    },
    assistant: read(assistant, ['background-color']),
    rowAttrs: row === null ? null : row.getAttributeNames()
  }
})

const primary = (page) => page.locator('[data-composer-card] button[class*="_primary"]')
const isRunningLabel = (label) => /stop|停止|generating/i.test(label ?? '')
const waitSettled = async (page) => {
  for (let i = 0; i < 120; i += 1) {
    const button = primary(page).first()
    if ((await button.count()) > 0) {
      const label = await button.getAttribute('aria-label').catch(() => null)
      if (!isRunningLabel(label)) break
    }
    await page.waitForTimeout(100)
  }
  await page.waitForTimeout(500)
}

const typeDraft = async (page, text) => {
  const input = page.locator('[data-composer-input]').first()
  await input.click()
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+A' : 'Control+A')
  await page.keyboard.press('Backspace')
  await page.keyboard.type(text)
  await page.waitForTimeout(300)
}

for (const theme of ['light', 'dark']) {
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 2,
    locale: 'zh-CN',
    colorScheme: theme
  })
  const page = await context.newPage()
  await page.goto(url, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('[data-composer-input][data-phase="plain"]', { timeout: 30000 })
  await page.waitForTimeout(1500)
  for (const label of ['Close', '关闭']) {
    const close = page.getByRole('button', { name: label }).first()
    if (await close.count()) await close.click({ force: true }).catch(() => {})
  }
  await page.keyboard.press('Escape')
  await page.waitForTimeout(400)
  const skinned = await page.evaluate(() => ({
    skin: document.body.getAttribute('data-cgpt-skin'),
    dark: document.body.hasAttribute('data-ds-dark-theme')
  }))
  if (skinned.skin !== 'on') throw new Error(`skin not on (${JSON.stringify(skinned)})`)

  // Frame A: the settled bubble this send will sit under.
  await typeDraft(page, TEXT_BEFORE)
  await primary(page).first().click()
  await waitSettled(page)
  const beforeCount = await page.evaluate(() => document.querySelectorAll("[data-chat-flow-kind='user']").length)
  const before = await bubbleStyle(page)
  if (before.state !== 'durable' || before.bubble === null) throw new Error('before: no durable user bubble')

  // Frame A shot: the next draft is already in the composer.
  await typeDraft(page, TEXT_SEND)
  await capture(page, `m18-${theme}-before.png`)

  // Frame B: hold the admission round-trip so the echo row stays on screen.
  const cdp = await context.newCDPSession(page)
  await cdp.send('Network.enable')
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false, latency: 2500, downloadThroughput: 1024 * 1024, uploadThroughput: 1024 * 1024
  })
  await primary(page).first().click()
  let immediate = null
  for (let i = 0; i < 80; i += 1) {
    immediate = await bubbleStyle(page)
    if (immediate.state === 'submission-echo' && immediate.bubble !== null) break
    await page.waitForTimeout(50)
  }
  if (immediate.state !== 'submission-echo') throw new Error('immediate: echo row never painted')
  await capture(page, `m18-${theme}-immediate.png`)

  // Frame C: release the network; the durable node replaces the echo.
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1
  })
  let stable = null
  for (let i = 0; i < 150; i += 1) {
    stable = await bubbleStyle(page)
    if (stable.echoes === 0 && stable.userRows > beforeCount && stable.bubble !== null) break
    await page.waitForTimeout(100)
  }
  await waitSettled(page)
  stable = await bubbleStyle(page)
  if (stable.echoes !== 0 || stable.userRows <= beforeCount) throw new Error('stable: durable node missing')
  await capture(page, `m18-${theme}-stable.png`)

  const frames = { before, immediate, stable }
  const colours = Object.values(frames).map((frame) => frame.bubble?.['background-color'] ?? null)
  const durations = Object.values(frames).map((frame) => frame.bubble?.['transition-duration'] ?? null)
  const consistent = colours.every((colour) => colour !== null && colour === colours[0])
  const transitionsOff = durations.every((duration) => duration === '0s')
  result.themes[theme] = {
    darkAttribute: skinned.dark,
    frames,
    colours,
    transitionDurations: durations,
    consistent,
    transitionsOff
  }
  if (!consistent) throw new Error(`${theme}: background colours differ (${colours.join(' / ')})`)
  if (!transitionsOff) throw new Error(`${theme}: bubble still transitions (${durations.join(' / ')})`)
  await context.close()
}

writeFileSync(join(DOCS, 'm18.json'), `${JSON.stringify(result, null, 2)}\n`)

// ---- the three-column sheet -------------------------------------------------
const panel = (theme, frame) =>
  `data:image/png;base64,${readFileSync(join(LIVE, `m18-${theme}-${frame}.png`)).toString('base64')}`
const frameCopy = {
  before: { title: '发出前', note: '上一条已稳定气泡 · data-chat-flow-kind=user' },
  immediate: { title: '发送瞬间', note: '乐观回声 · data-submission-echo' },
  stable: { title: '稳定后', note: '服务端确认后 · data-chat-flow-kind=user' }
}
const palette = {
  light: { bg: '#f7f7f8', card: '#ffffff', ink: '#0d0d0d', sub: '#6b6b6b', line: 'rgba(0,0,0,.09)' },
  dark: { bg: '#141414', card: '#1f1f1f', ink: '#f2f2f2', sub: '#a8a8a8', line: 'rgba(255,255,255,.12)' }
}
const rows = ['light', 'dark'].map((theme) => {
  const p = palette[theme]
  const themeResult = result.themes[theme]
  const columns = ['before', 'immediate', 'stable'].map((frame) => {
    const item = themeResult.frames[frame]
    const copy = frameCopy[frame]
    const colour = item.bubble['background-color']
    return `<figure style="--line:${p.line}">
      <figcaption><strong>${copy.title}</strong><span>${copy.note}</span></figcaption>
      <img src="${panel(theme, frame)}" />
      <dl>
        <div><dt>background-color</dt><dd>${colour}</dd></div>
        <div><dt>transition-duration</dt><dd>${item.bubble['transition-duration']}</dd></div>
        <div><dt>radius / padding</dt><dd>${item.bubble['border-radius']} · ${item.bubble.padding}</dd></div>
      </dl>
    </figure>`
  }).join('')
  return `<section style="--bg:${p.bg};--card:${p.card};--ink:${p.ink};--sub:${p.sub};--line:${p.line}">
    <h2>${theme === 'light' ? '浅色' : '深色'} · 三帧 background-color 一致（${themeResult.colours[0]}）</h2>
    <div class="grid">${columns}</div>
  </section>`
}).join('')

const sheet = `<!doctype html><html><head><meta charset="utf-8"><style>
  *{box-sizing:border-box}
  body{margin:0;padding:26px 28px 22px;background:${palette.light.bg};color:${palette.light.ink};
    font:13px/1.45 -apple-system,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif}
  h1{margin:0 0 4px;font-size:21px;font-weight:650;letter-spacing:-.01em}
  p.lead{margin:0 0 18px;color:#6b6b6b;font-size:12px;max-width:1180px}
  section{margin:0 0 22px;padding:16px 16px 12px;border:1px solid rgba(0,0,0,.08);border-radius:14px;background:#fff}
  h2{margin:0 0 12px;font-size:14px;font-weight:600}
  .grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}
  figure{margin:0;min-width:0;border:1px solid #e6e6e6;border-radius:10px;overflow:hidden;background:#fff}
  figcaption{display:flex;flex-direction:column;gap:2px;padding:8px 10px;border-bottom:1px solid #eee;font-size:12px}
  figcaption strong{font-size:13px}
  figcaption span{color:#6b6b6b;font-size:11px}
  img{display:block;width:100%;height:auto}
  dl{display:flex;flex-direction:column;gap:2px;margin:0;padding:8px 10px;font-size:11px}
  dl div{display:flex;justify-content:space-between;gap:8px}
  dt{color:#6b6b6b;margin:0}
  dd{margin:0;font-variant-numeric:tabular-nums;font-weight:600}
  footer{color:#6b6b6b;font-size:11px;margin-top:4px}
</style></head><body>
  <h1>P0-7 · 用户气泡灰→蓝闪烁修复</h1>
  <p class="lead">同一次发送的三个时刻：发出前的已稳定气泡、点击发送瞬间的乐观回声、服务端确认后的持久节点。
     三帧均使用 <code>--cgpt-user-bubble-bg</code>，<code>transition</code> 为 <code>none</code>（计算值 0s）。</p>
  ${rows}
  <footer>采集：${result.capturedAt} · ${result.url} · 视口 ${VIEWPORT.width}×${VIEWPORT.height} · 来源 docs/capture/live/m18-*.png</footer>
</body></html>`

const sheetPage = await browser.newPage({ viewport: { width: 1500, height: 900 }, deviceScaleFactor: 2 })
await sheetPage.setContent(sheet, { waitUntil: 'load' })
await sheetPage.waitForTimeout(300)
await sheetPage.screenshot({ path: join(SHOTS, 'm18-bubble.png'), fullPage: true })
await sheetPage.close()
await browser.close()

console.log(`m18-bubble: wrote docs/m18.json and docs/screenshots/m18-bubble.png`)
for (const theme of ['light', 'dark']) {
  const data = result.themes[theme]
  console.log(`  ${theme}: ${data.colours.join(' / ')} · transition ${data.transitionDurations.join(' / ')}`)
}
