#!/usr/bin/env node
/**
 * tools/m25-sheet.mjs — render every candidate menu glyph, verbatim from the
 * capture (`docs/capture/live/project-menus.json`: the sprite `<symbol>` bodies
 * plus the mask-image SVGs the web menus use), so the choice of a glyph is a
 * visual match against the reference instead of a guess.
 *
 *   node tools/m25-sheet.mjs [--out docs/screenshots] [--dpr 4] [--dark]
 *
 * Writes docs/screenshots/m25-glyph-sheet-<dark|light>.png.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const args = new Map()
for (let index = 2; index < process.argv.length; index += 1) {
  const key = process.argv[index]
  if (!key.startsWith('--')) continue
  const next = process.argv[index + 1]
  if (next === undefined || next.startsWith('--')) args.set(key.slice(2), true)
  else {
    args.set(key.slice(2), next)
    index += 1
  }
}
const OUT = resolve(ROOT, typeof args.get('out') === 'string' ? args.get('out') : 'docs/screenshots')
mkdirSync(OUT, { recursive: true })
const DPR = Number(args.get('dpr') ?? 4)
const DARK = args.get('light') !== true

let playwright
for (const candidate of [args.get('playwright'), 'playwright', 'playwright', 'playwright-core'].filter(Boolean)) {
  try {
    playwright = await import(candidate)
    break
  } catch {}
}
if (playwright === undefined) {
  console.error('m25-sheet: playwright is required')
  process.exit(2)
}

const capture = JSON.parse(readFileSync(join(ROOT, 'docs/capture/live/project-menus.json'), 'utf8'))
const symbols = capture.sprite?.symbols ?? {}

/** Every mask-image SVG we decoded, keyed by menu + label. */
const masks = []
const seen = new Set()
for (const [key, surfaces] of Object.entries(capture.menus)) {
  if (!Array.isArray(surfaces)) continue
  for (const surface of surfaces) {
    for (const item of surface.items ?? []) {
      for (const mask of item.masks ?? []) {
        const svg = mask.svg.replace(/^data:image\/svg\+xml;utf8,/, '')
        const sig = svg.slice(0, 90)
        if (seen.has(sig)) continue
        seen.add(sig)
        masks.push({ key: `${key}/${item.text}`, svg })
      }
    }
  }
}

const spriteCells = Object.entries(symbols)
  .filter(([, value]) => value !== null)
  .map(([id, value]) => ({
    label: id.replace('codex-icon-', ''),
    svg: `<svg viewBox="${value.viewBox}" width="20" height="20" fill="${value.fill ?? 'currentColor'}" xmlns="http://www.w3.org/2000/svg">${value.inner}</svg>`
  }))
const maskCells = masks.map((entry) => ({
  label: 'MASK ' + entry.key,
  svg: entry.svg.replace('<svg ', '<svg width="20" height="20" ')
}))

const cells = [...maskCells, ...spriteCells]
const ink = DARK ? '#ededed' : '#0d0d0d'
const bg = DARK ? '#212121' : '#ffffff'
const html = `<!doctype html><meta charset="utf-8"><style>
  body { margin: 0; background: ${bg === '#212121' ? '#0d0d0d' : '#f4f4f4'}; font: 11px/1.3 ui-monospace, monospace; color: ${ink}; padding: 12px; }
  .grid { display: grid; grid-template-columns: repeat(12, 92px); gap: 6px; }
  .cell { display: flex; flex-direction: column; align-items: center; gap: 3px; padding: 6px 2px; background: ${bg}; border-radius: 8px; }
  .cell svg { color: ${ink}; }
  .cell span { max-width: 88px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 9px; opacity: .8; }
</style><div class="grid">${cells
  .map((cell) => `<div class="cell">${cell.svg}<span title="${cell.label}">${cell.label}</span></div>`)
  .join('')}</div>`
const file = join(OUT, `m25-glyph-sheet-${DARK ? 'dark' : 'light'}.html`)
writeFileSync(file, html)

const browser = await playwright.chromium.launch({
  headless: true,
  executablePath: process.env.M25_CHROME ?? process.env.HOME + '/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome',
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
})
const page = await browser.newPage({ viewport: { width: 1200, height: 900 }, deviceScaleFactor: DPR })
await page.goto('file://' + file)
await page.waitForTimeout(300)
const height = await page.evaluate(() => document.body.scrollHeight)
await page.screenshot({ path: join(OUT, `m25-glyph-sheet-${DARK ? 'dark' : 'light'}.png`), fullPage: false, clip: { x: 0, y: 0, width: 1200, height: Math.min(height + 24, 4000) } })
await browser.close()
console.log(`m25-sheet: ${cells.length} cells (${maskCells.length} mask + ${spriteCells.length} sprite) → docs/screenshots/m25-glyph-sheet-${DARK ? 'dark' : 'light'}.png`)
