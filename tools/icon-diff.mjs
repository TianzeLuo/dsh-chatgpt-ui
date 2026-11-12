#!/usr/bin/env node
/**
 * tools/icon-diff.mjs — pixel-diff every rail glyph against the reference sprite.
 *
 * The brief asks for a measurement, not an opinion: each glyph is rendered at
 * its real 20×20 viewBox, once from the sprite symbol we captured
 * (`docs/capture/icons.json`) and once from what the skin actually ships
 * (`lib/client/rail-icons.js`), then compared pixel by pixel. Both are drawn
 * with `fill="currentColor"` → black on transparent, at 8× so antialiasing is
 * measurable rather than rounded away.
 *
 * Output, per glyph and state:
 *   docs/screenshots/icon-diff-<glyph>[-selected].png   实现 | 参考 | 差异
 *   docs/icon-diff.json                                 ratios + offenders
 *
 * Exit code is 1 when any glyph exceeds --threshold (default 2%), unless
 * --allow-diff is passed.
 *
 * Usage: node tools/icon-diff.mjs [--threshold 2] [--allow-diff]
 *        [--scale 8] [--prefix icon-diff] [--json icon-diff.json]
 *        [--playwright /path/to/node_modules/playwright]
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const args = new Map()
for (let index = 2; index < process.argv.length; index += 1) {
  const token = process.argv[index]
  if (!token.startsWith('--')) continue
  const next = process.argv[index + 1]
  if (next === undefined || next.startsWith('--')) args.set(token.slice(2), true)
  else {
    args.set(token.slice(2), next)
    index += 1
  }
}

const OUT = resolve(ROOT, typeof args.get('out') === 'string' ? args.get('out') : 'docs')
const SHOTS = join(OUT, 'screenshots')
mkdirSync(SHOTS, { recursive: true })
const THRESHOLD = Number(args.get('threshold') ?? 2)
const SIZE = 20
const SCALE = Number(args.get('scale') ?? 8)
const PREFIX = typeof args.get('prefix') === 'string' ? args.get('prefix') : 'icon-diff'
const JSON_NAME = typeof args.get('json') === 'string' ? args.get('json') : 'icon-diff.json'

// ---- our shipped glyphs ---------------------------------------------------
const railSource = readFileSync(join(ROOT, 'lib/client/rail-icons.js'), 'utf8')
const ours = new Function('module', 'exports', `${railSource}\n;return CHATGPT_RAIL_GLYPHS`)(
  { exports: {} },
  {}
)
const reference = JSON.parse(readFileSync(join(ROOT, 'docs/capture/icons.json'), 'utf8')).icons

// ---- playwright -----------------------------------------------------------
let playwright
const candidates = [args.get('playwright'), 'playwright', 'playwright', 'playwright-core'].filter(Boolean)
let lastError
for (const candidate of candidates) {
  try {
    playwright = await import(candidate)
    break
  } catch (error) {
    lastError = error
  }
}
if (playwright === undefined) {
  console.error(`playwright is required for the icon diff (${lastError?.message ?? 'not found'})`)
  process.exit(2)
}
const chromium = playwright.chromium ?? playwright.default?.chromium
const browser = await chromium.launch({
  headless: true,
  executablePath:
    process.env.CHATGPT_UI_CHROME ??
    process.env.PLAYWRIGHT_CHROMIUM ??
    process.env.HOME + '/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome',
  args: ['--no-sandbox']
})
const DPR = Number(args.get('dpr') ?? 1)
const page = await browser.newPage({ viewport: { width: 900, height: 400 }, deviceScaleFactor: DPR })

/** Standalone SVG needs the namespace; an inline glyph in the client does not. */
const withXmlns = (markup) =>
  markup.includes('xmlns=') ? markup : markup.replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ')

/** Reference markup → the same `<svg>` shape we ship. */
const referenceSvg = (glyph, variant) => {
  const entry = glyph?.[variant]
  if (entry === undefined || typeof entry.inner !== 'string') return null
  const viewBox = entry.viewBox ?? '0 0 20 20'
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" width="${SIZE}" height="${SIZE}" fill="currentColor">${entry.inner}</svg>`
}

const panels = []
const results = []
const live = []
for (const name of Object.keys(ours)) {
  for (const variant of ['default', 'selected']) {
    const ourSvg = ours[name]?.[variant]
    const refSvg = referenceSvg(reference[name], variant)
    const id = variant === 'default' ? name : `${name}-selected`
    if (typeof ourSvg !== 'string' || refSvg === null) {
      results.push({ glyph: name, variant, status: 'missing', ratio: null, reason: refSvg === null ? 'reference symbol not captured' : 'glyph missing from rail-icons.js' })
      continue
    }
    const measured = await page.evaluate(
      async ({ a, b, size, scale }) => {
        const draw = async (markup) => {
          const canvas = document.createElement('canvas')
          canvas.width = size * scale
          canvas.height = size * scale
          const context = canvas.getContext('2d', { willReadFrequently: true })
          const image = new Image()
          image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`
          await image.decode()
          context.drawImage(image, 0, 0, size * scale, size * scale)
          return { context, canvas, data: context.getImageData(0, 0, size * scale, size * scale) }
        }
        const left = await draw(a)
        const right = await draw(b)
        const total = left.data.data.length / 4
        let ink = 0
        let differ = 0
        const diff = document.createElement('canvas')
        diff.width = size * scale
        diff.height = size * scale
        const diffContext = diff.getContext('2d')
        const out = diffContext.createImageData(size * scale, size * scale)
        for (let index = 0; index < total; index += 1) {
          const offset = index * 4
          const la = left.data.data[offset + 3]
          const ra = right.data.data[offset + 3]
          const lc = left.data.data[offset]
          const rc = right.data.data[offset]
          const inked = la > 8 || ra > 8
          if (inked) ink += 1
          const different = Math.abs(la - ra) > 8 || (inked && Math.abs(lc - rc) > 8)
          if (inked && different) differ += 1
          out.data[offset] = different ? 220 : 30
          out.data[offset + 1] = different ? 60 : 30
          out.data[offset + 2] = different ? 60 : 30
          out.data[offset + 3] = inked ? (different ? 235 : 70) : 0
        }
        diffContext.putImageData(out, 0, 0)
        const compose = document.createElement('canvas')
        compose.width = size * scale * 3 + 24
        compose.height = size * scale + 26
        const composeContext = compose.getContext('2d')
        composeContext.fillStyle = '#ffffff'
        composeContext.fillRect(0, 0, compose.width, compose.height)
        composeContext.drawImage(left.canvas, 0, 20)
        composeContext.drawImage(right.canvas, size * scale + 12, 20)
        composeContext.drawImage(diff, size * scale * 2 + 24, 20)
        composeContext.fillStyle = '#111111'
        composeContext.font = '12px monospace'
        composeContext.fillText('shipped', 2, 14)
        composeContext.fillText('reference', size * scale + 14, 14)
        composeContext.fillText('diff', size * scale * 2 + 26, 14)
        return { ratio: ink === 0 ? 0 : differ / ink, ink, differ, png: compose.toDataURL('image/png') }
      },
      { a: withXmlns(ourSvg), b: refSvg, size: SIZE, scale: SCALE }
    )
    const percent = Math.round(measured.ratio * 10000) / 100
    const file = join(SHOTS, `${PREFIX}-${id}.png`)
    writeFileSync(file, Buffer.from(measured.png.split(',')[1], 'base64'))
    results.push({
      glyph: name,
      variant,
      status: percent > THRESHOLD ? 'diff' : 'pass',
      ratio: percent,
      ink: measured.ink,
      differ: measured.differ,
      shot: file.replace(`${ROOT}/`, '')
    })
    panels.push({ id, percent })
    console.log(`${percent > THRESHOLD ? 'DIFF' : 'PASS'} ${id}: ${percent}% (${measured.differ}/${measured.ink} ink px)`)
  }
}

// ---- live rendering (the skin's own DOM, not just the path data) ----------
// A verbatim path can still look soft when the browser rasterises it at a
// fractional size or the CSS scales the box, so the rail icons are measured
// where they actually render, at whatever pixel size the layout gives them.
const url = typeof args.get('url') === 'string' ? args.get('url') : null
if (url !== null) {
  await page.setViewportSize({ width: 1587, height: 907 })
  await page.goto(url, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('[data-cgpt-rail-item]', { timeout: 60000 })
  await page.waitForTimeout(1500)
  for (const name of ['home', 'schedules', 'plugins', 'more', 'settings']) {
    const handle = page.locator(`[data-cgpt-rail-item="${name}"] svg`).first()
    if ((await handle.count()) === 0) {
      live.push({ glyph: name, status: 'missing', reason: 'no rail glyph in the DOM' })
      continue
    }
    const box = await handle.boundingBox()
    const styles = await handle.evaluate((el) => {
      const style = getComputedStyle(el)
      return {
        width: style.width,
        height: style.height,
        transform: style.transform,
        opacity: style.opacity
      }
    })
    if (box === null) {
      live.push({ glyph: name, status: 'missing', reason: 'rail glyph has no box' })
      continue
    }
    const state = await page.locator(`[data-cgpt-rail-item="${name}"]`).first().getAttribute('data-cgpt-rail-state')
    const variant = state === 'selected' ? 'selected' : 'default'
    const refSvg = referenceSvg(reference[name], variant)
    const bytes = await handle.screenshot()
    const measured = await page.evaluate(
      async ({ png, ref, size, scale }) => {
        const draw = async (source) => {
          const canvas = document.createElement('canvas')
          canvas.width = size * scale
          canvas.height = size * scale
          const context = canvas.getContext('2d', { willReadFrequently: true })
          const image = new Image()
          image.src = source
          await image.decode()
          context.drawImage(image, 0, 0, size * scale, size * scale)
          return { canvas, data: context.getImageData(0, 0, size * scale, size * scale) }
        }
        const left = await draw(`data:image/png;base64,${png}`)
        const right = await draw(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(ref)}`)
        // The live crop carries the button background, the reference is on
        // transparent; compare silhouettes relative to each image's own corner
        // colour so both reduce to "is this pixel part of the glyph". Coverage
        // is normalised by the darkest ink distance: the skin paints muted grey
        // glyphs, the reference is black, and an absolute distance would count
        // a grey antialias fringe as ink while dropping the black one.
        const mask = (data, width) => {
          const px = data.data
          const bg = [px[0], px[1], px[2], px[3]]
          const out = new Uint8Array(px.length / 4)
          const distances = new Float32Array(out.length)
          let strongest = 0
          for (let index = 0; index < out.length; index += 1) {
            const offset = index * 4
            const distance =
              Math.abs(px[offset] - bg[0]) + Math.abs(px[offset + 1] - bg[1]) + Math.abs(px[offset + 2] - bg[2]) + Math.abs(px[offset + 3] - bg[3])
            distances[index] = distance
            if (distance > strongest) strongest = distance
          }
          const cut = strongest * 0.5
          for (let index = 0; index < out.length; index += 1) out[index] = distances[index] > cut ? 1 : 0
          return out
        }
        const a = mask(left.data)
        const b = mask(right.data)
        let ink = 0
        let differ = 0
        for (let index = 0; index < a.length; index += 1) {
          if (a[index] === 0 && b[index] === 0) continue
          ink += 1
          if (a[index] !== b[index]) differ += 1
        }
        return { ratio: ink === 0 ? 1 : differ / ink, ink, differ }
      },
      { png: bytes.toString('base64'), ref: refSvg, size: Math.max(1, Math.round(box.width * DPR)), scale: 1 }
    )
    const percent = Math.round(measured.ratio * 10000) / 100
    live.push({
      glyph: name,
      status: percent > THRESHOLD ? 'diff' : 'pass',
      ratio: percent,
      variant,
      box: { w: Math.round(box.width * 10) / 10, h: Math.round(box.height * 10) / 10 },
      styles
    })
    console.log(`${percent > THRESHOLD ? 'LIVE-DIFF' : 'LIVE-PASS'} ${name}: ${percent}% at ${Math.round(box.width * 10) / 10}px (${styles.width})`)
  }
}

const offenders = results.filter((entry) => entry.status !== 'pass')
const summary = {
  generatedAt: new Date().toISOString(),
  size: SIZE,
  scale: SCALE,
  threshold: THRESHOLD,
  glyphs: results.length,
  pass: results.filter((entry) => entry.status === 'pass').length,
  diff: results.filter((entry) => entry.status === 'diff').length,
  missing: results.filter((entry) => entry.status === 'missing').length,
  worst: results.filter((entry) => entry.ratio !== null).sort((a, b) => b.ratio - a.ratio).slice(0, 5),
  live,
  results
}
writeFileSync(join(OUT, JSON_NAME), JSON.stringify(summary, null, 1))
console.log(`ICON DIFF ${summary.glyphs} glyph states: pass=${summary.pass} diff=${summary.diff} missing=${summary.missing}`)
for (const entry of offenders) console.log(`  ${entry.status} ${entry.glyph}${entry.variant === 'selected' ? '-selected' : ''}: ${entry.ratio ?? 'n/a'}%${entry.reason === undefined ? '' : ` — ${entry.reason}`}`)

await browser.close()
if (offenders.length > 0 && args.get('allow-diff') !== true) process.exit(1)
