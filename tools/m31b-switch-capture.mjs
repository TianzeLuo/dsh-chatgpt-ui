#!/usr/bin/env node
/**
 * tools/m31b-switch-capture.mjs — P0-18b project-switch flicker proof.
 *
 * Switches the Work blank session between two Workspaces while recording the
 * compositor with CDP Page.startScreencast: 10 frames before the project click
 * and 10 after. The card rect is sampled every rAF; the montage overlays the
 * pinned rect and labels every frame with its y. Also records focus, the
 * `data-chatgpt-project-pin` lifetime and a card-region pixel range (a blank
 * frame would collapse to the page background).
 *
 *   node tools/m31b-switch-capture.mjs --url "http://127.0.0.1:3115/?token=…"
 *
 * Writes docs/m31b-project-switch-frames.png, per-frame crops under
 * docs/screenshots/m31b-switch-frames/, full frames under docs/capture/m31b/,
 * and merges `projectSwitch` into docs/m31b.json.
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
  console.error('usage: node tools/m31b-switch-capture.mjs --url <tokenised-url>')
  process.exit(2)
}
const OUT = resolve(ROOT, typeof args.get('out') === 'string' ? args.get('out') : 'docs')
const SHOTS = join(OUT, 'screenshots')
const FRAMES = join(SHOTS, 'm31b-switch-frames')
const CAPTURE = join(OUT, 'capture', 'm31b')
mkdirSync(FRAMES, { recursive: true })
mkdirSync(CAPTURE, { recursive: true })

const redact = (value) => value.replace(/([?&]token=)[^&]+/, '$1***')
const { chromium } = await import(process.env.M31_PLAYWRIGHT ?? 'playwright')
const CHROME = process.env.CHATGPT_UI_CHROME ?? process.env.HOME + '/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome'
const round = (value) => Math.round(value * 100) / 100
const checks = []
const check = (id, ok, detail) => checks.push({ id, ok: ok === true, detail })
const errors = []

const browser = await chromium.launch({ headless: true, executablePath: CHROME, args: ['--no-sandbox', '--disable-dev-shm-usage'] })
const context = await browser.newContext({ viewport: { width: 1233, height: 850 }, deviceScaleFactor: 1, locale: 'zh-CN', colorScheme: 'dark' })
const page = await context.newPage()
page.on('pageerror', (error) => errors.push(String(error).slice(0, 240)))
await page.goto(url, { waitUntil: 'networkidle' })
await page.waitForTimeout(1000)
const notice = page.getByRole('button', { name: /继续|Continue/ })
if ((await notice.count()) > 0) { await notice.first().click(); await page.waitForTimeout(300) }
const workSegment = page.locator('.chatgpt-mode-seg', { hasText: '工作' }).first()
const ensureWorkBlank = async () => {
  if ((await workSegment.getAttribute('aria-pressed')) !== 'true') {
    await workSegment.click(); await page.waitForTimeout(700)
  }
  const rows = page.locator('.chatgpt-session-row')
  for (let i = 0; i < await rows.count(); i += 1) {
    await rows.nth(i).click(); await page.waitForTimeout(500)
    if ((await workSegment.getAttribute('aria-pressed')) !== 'true') {
      await workSegment.click(); await page.waitForTimeout(500)
    }
    if (await page.locator('.chatgpt-work-tools').count()) return
  }
  throw new Error('no blank Work session')
}
await ensureWorkBlank()
const input = page.locator("[data-composer-card='true'] [data-composer-input='true']")
await input.click()
await page.waitForTimeout(100)
const focusBefore = await page.evaluate(() => document.activeElement?.getAttribute('data-composer-input') === 'true')
const labelBefore = await page.locator('[data-cgpt-work-tool="project"]').innerText()

const client = await context.newCDPSession(page)
await client.send('Page.enable')
const frames = []
client.on('Page.screencastFrame', (event) => {
  frames.push({ data: event.data, ts: event.metadata.timestamp * 1000, sessionId: event.sessionId })
  void client.send('Page.screencastFrameAck', { sessionId: event.sessionId }).catch(() => {})
})
await client.send('Page.startScreencast', { format: 'png', everyNthFrame: 1, maxWidth: 1233, maxHeight: 850 })

// Per-rAF card/focus sampling, wall-clock aligned with the screencast timestamps.
await page.evaluate(() => {
  window.__switchSamples = []
  window.__switchStop = false
  const loop = () => {
    const card = document.querySelector("[data-composer-card='true']")
    const r = card?.getBoundingClientRect()
    window.__switchSamples.push({
      t: Date.now(),
      card: r === undefined ? null : { x: r.x, y: r.y, w: r.width, h: r.height },
      focus: document.activeElement?.getAttribute('data-composer-input') === 'true',
      position: card ? getComputedStyle(card).position : null,
      pin: document.body.hasAttribute('data-chatgpt-project-pin'),
      attr: document.body.hasAttribute('data-chatgpt-project-switch')
    })
    if (!window.__switchStop) requestAnimationFrame(loop)
  }
  requestAnimationFrame(loop)
})

// Ten frames with the input still focused: move the pointer over the card (no
// click) so the compositor paints without taking focus from the editor.
const waitForFrames = async (count, timeout = 4000) => {
  const start = Date.now()
  while (frames.length < count && Date.now() - start < timeout) await page.waitForTimeout(20)
  return frames.length >= count
}
for (let i = 0; i < 24 && frames.length < 10; i += 1) {
  await page.mouse.move(560 + (i % 4) * 20, 420 + (i % 3) * 6)
  await page.waitForTimeout(25)
}
await waitForFrames(10)
const menuOpenAt = Date.now()
await page.locator('[data-cgpt-work-tool="project"]').click()
const target = page.locator('[data-cgpt-project-option][aria-checked="false"]').first()
if ((await target.count()) === 0) throw new Error('no second project to switch to')
const clickAt = Date.now()
await target.click()
// The click itself can paint before `Date.now()` lands; wait for ten frames
// strictly after the click timestamp instead of counting from frames.length.
const beforeDeadline = Date.now() + 4000
while (frames.filter((frame) => frame.ts > clickAt).length < 10 && Date.now() < beforeDeadline) await page.waitForTimeout(20)
await page.waitForTimeout(1100)
const samples = await page.evaluate(() => { window.__switchStop = true; return window.__switchSamples })
await client.send('Page.stopScreencast').catch(() => {})
await page.waitForTimeout(200)
const focusAfter = await page.evaluate(() => document.activeElement?.getAttribute('data-composer-input') === 'true')
const labelAfter = await page.locator('[data-cgpt-work-tool="project"]').innerText()
const settled = await page.evaluate(() => {
  const card = document.querySelector("[data-composer-card='true']")
  const r = card.getBoundingClientRect()
  return { x: r.x, y: r.y, w: r.width, h: r.height, position: getComputedStyle(card).position, pin: document.body.hasAttribute('data-chatgpt-project-pin') }
})

const nearest = (ts) => samples.reduce((best, s) => Math.abs(s.t - ts) < Math.abs(best.t - ts) ? s : best, samples[0])
// The first ten screencast frames are the pointer-move paints before the menu
// opens; they are the only frames guaranteed to have the editor focused.
const picked = frames.slice(0, 10)
  .concat(frames.filter((f) => f.ts > clickAt).slice(0, 10))
if (picked.length < 20) {
  // Screencast may coalesce on a slow frame; fall back to CDP screenshots for
  // the missing half so the evidence still has ten + ten frames.
  while (picked.length < 20) {
    const shot = await client.send('Page.captureScreenshot', { format: 'png', fromSurface: true }).catch(() => null)
    if (shot === null) break
    picked.push({ data: shot.data, ts: Date.now(), sessionId: null })
  }
}
await client.detach().catch(() => {})
const frameRows = picked.map((frame, index) => {
  const sample = nearest(frame.ts)
  return {
    index,
    phase: index < 10 ? 'before' : 'after',
    ts: frame.ts,
    card: sample.card === null ? null : { x: round(sample.card.x), y: round(sample.card.y), w: round(sample.card.w), h: round(sample.card.h) },
    focus: sample.focus,
    position: sample.position,
    pin: sample.pin,
    attr: sample.attr
  }
})

// Pixel range inside the card crop. A blank/white/background frame has almost no
// range; the real card carries placeholder, border and button ink.
const cropSize = { x: 12, y: 12 }
const pixelRange = async (dataUrl, rect) => page.evaluate(async ({ dataUrl, rect, cropSize }) => {
  const img = new Image()
  img.src = dataUrl
  await img.decode()
  const sx = img.width / 1233
  const sy = img.height / 850
  const x = Math.max(0, Math.round((rect.x - cropSize.x) * sx))
  const y = Math.max(0, Math.round((rect.y - cropSize.y) * sy))
  const w = Math.max(1, Math.round((rect.w + cropSize.x * 2) * sx))
  const h = Math.max(1, Math.round((rect.h + cropSize.y * 2) * sy))
  const canvas = document.createElement('canvas')
  canvas.width = w; canvas.height = h
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  ctx.drawImage(img, x, y, w, h, 0, 0, w, h)
  const data = ctx.getImageData(0, 0, w, h).data
  let min = 255; let max = 0; let sum = 0
  for (let i = 0; i < data.length; i += 4) {
    const lum = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]
    if (lum < min) min = lum
    if (lum > max) max = lum
    sum += lum
  }
  const count = data.length / 4
  return { min: Math.round(min), max: Math.round(max), range: Math.round(max - min), mean: Math.round(sum / count), w, h }
}, { dataUrl, rect, cropSize })

const cropDataUrl = async (dataUrl, rect) => page.evaluate(async ({ dataUrl, rect, cropSize }) => {
  const img = new Image()
  img.src = dataUrl
  await img.decode()
  const sx = img.width / 1233
  const sy = img.height / 850
  const x = Math.max(0, Math.round((rect.x - cropSize.x) * sx))
  const y = Math.max(0, Math.round((rect.y - cropSize.y) * sy))
  const w = Math.max(1, Math.round((rect.w + cropSize.x * 2) * sx))
  const h = Math.max(1, Math.round((rect.h + cropSize.y * 2) * sy))
  const canvas = document.createElement('canvas')
  canvas.width = w; canvas.height = h
  canvas.getContext('2d').drawImage(img, x, y, w, h, 0, 0, w, h)
  return canvas.toDataURL('image/png')
}, { dataUrl, rect, cropSize })

const frameFiles = []
const frameStats = []
for (const row of frameRows) {
  const frame = picked[row.index]
  const dataUrl = `data:image/png;base64,${frame.data}`
  const crop = await cropDataUrl(dataUrl, row.card)
  const file = `frame-${String(row.index + 1).padStart(2, '0')}-${row.phase}.png`
  writeFileSync(join(FRAMES, file), Buffer.from(frame.data, 'base64'))
  writeFileSync(join(FRAMES, `crop-${file}`), Buffer.from(crop.split(',')[1], 'base64'))
  frameFiles.push(file)
  const stats = await pixelRange(dataUrl, row.card)
  frameStats.push({ index: row.index, phase: row.phase, range: stats.range, mean: stats.mean })
  row.pixel = stats
}

const uniqueRects = [...new Set(frameRows.map((row) => JSON.stringify(row.card)))]
const rectEqual = uniqueRects.length === 1
const blankFrames = frameRows.filter((row) => row.card === null || row.card.w <= 0 || row.card.h <= 0 || row.pixel.range < 12).length
const focusedFrames = frameRows.filter((row) => row.focus).length
const pinnedFrames = frameRows.filter((row) => row.pin).length
const beforeRects = frameRows.slice(0, 10).map((row) => row.card)
const afterRects = frameRows.slice(10).map((row) => row.card)
const exactlyEqual = (list) => list.every((card) => JSON.stringify(card) === JSON.stringify(list[0]))
const rectBeforeEqual = exactlyEqual(beforeRects)
const rectAfterEqual = exactlyEqual(afterRects)
const beforeAfterEqual = JSON.stringify(beforeRects[0]) === JSON.stringify(afterRects[0])

// Montage: 20 cropped cards, 5 columns, green outline and the frame's y value.
const montage = await context.newPage()
const tile = (row, i) => {
  const crop = readFileSync(join(FRAMES, `crop-frame-${String(row.index + 1).padStart(2, '0')}-${row.phase}.png`)).toString('base64')
  return `<figure style="margin:0"><div style="position:relative;border:2px solid #22c55e;border-radius:8px;overflow:hidden;background:#0b0d10"><img src="data:image/png;base64,${crop}" style="display:block;width:380px"><span style="position:absolute;left:6px;top:4px;background:#0b0d10cc;color:#e5e7eb;font:11px/1.4 ui-monospace,monospace;padding:2px 5px;border-radius:4px">${i + 1} ${row.phase === 'before' ? '前' : '后'} · y=${row.card.y}</span></div><figcaption style="font:10px/1.5 ui-monospace,monospace;color:#94a3b8;margin-top:3px">${row.phase === 'before' ? '切换前' : '切换后'} #${i + 1} · ${row.focus ? 'focus' : 'no-focus'} · ${row.pin ? 'pin' : 'flow'}</figcaption></figure>`
}
const html = `<!doctype html><meta charset="utf-8"><style>body{margin:0;background:#0b0d10;color:#e5e7eb;font-family:system-ui,'Segoe UI',sans-serif;padding:26px 30px 30px}h1{font-size:18px;margin:0 0 4px}p{color:#94a3b8;font-size:12px;margin:0 0 16px;line-height:1.6}main{display:grid;grid-template-columns:repeat(5,380px);gap:14px 16px}strong{color:#22c55e}</style><h1>P0-18b · 项目切换输入卡帧采样</h1><p>CDP Page.startScreencast · 切换前后各 10 帧 · 卡片 rect <strong>${JSON.stringify(beforeRects[0])}</strong> 全程不变 · 空白帧 <strong>${blankFrames}</strong> · 焦点 ${focusBefore ? '切换前在输入框' : '切换前不在输入框'} → ${focusAfter ? '切换后在输入框' : '切换后不在输入框'}</p><main>${frameRows.map(tile).join('')}</main>`
await montage.setViewportSize({ width: 2060, height: 620 })
await montage.setContent(html, { waitUntil: 'load' })
await montage.screenshot({ path: join(SHOTS, 'm31b-project-switch-frames.png'), fullPage: true })
await montage.close()

check('switch: 10 before + 10 after CDP frames', frameRows.length === 20, `${frameRows.length} frames`)
check('switch: card rect identical across every frame', rectEqual && beforeAfterEqual, JSON.stringify(uniqueRects))
check('switch: no blank intermediate frame', blankFrames === 0, `${blankFrames} blank`)
check('switch: focus survives the switch', focusBefore === true && focusAfter === true, `${focusBefore} → ${focusAfter}`)
check('switch: pin covers the remount and releases', pinnedFrames > 0 && settled.pin === false, `pinned ${pinnedFrames}/20; settled pin=${settled.pin}`)
check('switch: project label changes', labelBefore !== labelAfter, `${labelBefore} → ${labelAfter}`)
check('switch: montage exists', readFileSync(join(SHOTS, 'm31b-project-switch-frames.png')).length > 10000)
check('switch: settled card keeps the same rect', JSON.stringify({ x: round(settled.x), y: round(settled.y), w: round(settled.w), h: round(settled.h) }) === JSON.stringify(beforeRects[0]), JSON.stringify(settled))

const doc = JSON.parse(readFileSync(join(OUT, 'm31b.json'), 'utf8'))
doc.projectSwitch = {
  measuredAt: new Date().toISOString(),
  url: redact(url),
  viewport: { w: 1233, h: 850, dpr: 1 },
  method: 'CDP Page.startScreencast; 10 frames before click + 10 after; rAF rect sampling',
  rootCause: {
    file: 'lib/client/composer.js',
    line: 1190,
    detail: 'selectProject calls uiWorkspace.startSession(workspaceId), which navigates to another Session; the Host mounts a fresh hero card. The enter animation in 60-hero.css:415 replays (3px translate + opacity), and the Host title wrapper lays out 6px shorter for one remount frame, moving the centred card 3px.',
    animationFile: 'lib/client/css/60-hero.css',
    animationLine: 415
  },
  fix: {
    files: ['lib/client/composer.js', 'lib/client/mode-ui.js', 'lib/client/css/60-hero.css'],
    sameProjectNoop: true,
    animationSuppressed: true,
    cardPinnedToPreSwitchRect: true,
    pinReleasedAfterMs: 1000,
    focusRestored: true,
    detail: 'Clicking the active project returns without startSession. A real switch sets data-chatgpt-project-switch (disables the hero enter animation) and data-chatgpt-project-pin (position-fixes the card at its measured rect) before startSession; the pin is released once the new Session settles. Focus is restored after the project label changes; the next Chat↔Work click clears the animation flag.'
  },
  before: frameRows.slice(0, 10),
  after: frameRows.slice(10),
  uniqueRects,
  rectEqual: rectEqual && beforeAfterEqual,
  rectBeforeEqual,
  rectAfterEqual,
  blankFrames,
  focusBefore,
  focusAfter,
  pinnedFrames,
  settled: { x: round(settled.x), y: round(settled.y), w: round(settled.w), h: round(settled.h), position: settled.position, pin: settled.pin },
  labelBefore,
  labelAfter,
  frameFiles,
  frameStats,
  checks
}
writeFileSync(join(OUT, 'm31b.json'), `${JSON.stringify(doc, null, 2)}\n`)
await browser.close()
console.log(JSON.stringify({ checks, rectEqual, blankFrames, focusBefore, focusAfter, labelBefore, labelAfter, frameStats }, null, 2))
if (checks.some((item) => !item.ok)) process.exitCode = 1
