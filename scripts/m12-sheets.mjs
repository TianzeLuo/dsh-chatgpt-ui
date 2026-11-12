#!/usr/bin/env node
/**
 * scripts/m12-sheets.mjs — compose the reference → before → after evidence
 * sheets for P0-2. Reads the PNGs already written by the capture scripts and
 * draws six sheets under docs/screenshots/:
 *
 *   m12-composer-{light,dark}.png
 *   m12-panel-simple-{light,dark}.png
 *   m12-panel-advanced-{light,dark}.png
 *
 * Dev-only: playwright + Chromium, like scripts/m11-shots.mjs. No live app.
 */
import { mkdirSync, readFileSync } from 'node:fs'
import { readPng, writePng } from './png-read.mjs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const LIVE = join(ROOT, 'docs/capture/live')
const SHOTS = join(ROOT, 'docs/screenshots')
mkdirSync(SHOTS, { recursive: true })

let playwright
for (const candidate of ['playwright', 'playwright', 'playwright-core']) {
  try {
    playwright = await import(candidate)
    break
  } catch {}
}
if (playwright === undefined) {
  console.error('m12-sheets: playwright is required')
  process.exit(2)
}

const png = (name) => `data:image/png;base64,${readFileSync(join(LIVE, name)).toString('base64')}`

// The pre-P0-2 dark capture was taken by toggling `data-ds-dark-theme` on a
// light context, so its page canvas stayed white. Repaint only the pixels
// outside the card/panel silhouette to the host's dark canvas; the evidence
// inside the silhouette is untouched. This is called out in the sheet footer.
function insideRounded(x, y, region) {
  if (x < region.x || x >= region.x + region.w || y < region.y || y >= region.y + region.h) return false
  const r = region.r
  if (r <= 0) return true
  const cx = x < region.x + r ? region.x + r : x >= region.x + region.w - r ? region.x + region.w - r : null
  const cy = y < region.y + r ? region.y + r : y >= region.y + region.h - r ? region.y + region.h - r : null
  if (cx === null || cy === null) return true
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r
}
function cleanDarkCanvas(input, output, regions) {
  const image = readPng(join(LIVE, input))
  const out = Buffer.alloc(image.width * image.height * 3)
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const from = (y * image.width + x) * image.channels
      const to = (y * image.width + x) * 3
      const r = image.data[from]
      const g = image.data[from + 1]
      const b = image.data[from + 2]
      const outside = !regions.some((region) => insideRounded(x, y, region))
      const white = r >= 244 && g >= 244 && b >= 244
      out[to] = outside && white ? 14 : r
      out[to + 1] = outside && white ? 14 : g
      out[to + 2] = outside && white ? 14 : b
    }
  }
  writePng(join(LIVE, output), image.width, image.height, out)
}
// Card (x14 y14 838×103 r28) + its 48px tool bar below it.
cleanDarkCanvas('m12-before-composer-dark.png', 'm12-before-composer-dark-clean.png', [
  { x: 14, y: 14, w: 838, h: 103, r: 28 },
  { x: 14, y: 117, w: 838, h: 48, r: 24 }
])
// Merged panel (x10 y10 280×392 r16).
cleanDarkCanvas('m12-before-panel-simple-dark.png', 'm12-before-panel-simple-dark-clean.png', [
  { x: 10, y: 10, w: 280, h: 392, r: 16 }
])

const strip = (name) => `<span class="chip">${name}</span>`

const themes = {
  light: { bg: '#f4f4f4', ink: '#0d0d0d', sub: '#6b6b6b', frame: '#ffffff', line: 'rgba(0,0,0,.08)' },
  dark: { bg: '#1a1a1a', ink: '#f2f2f2', sub: '#a8a8a8', frame: '#242424', line: 'rgba(255,255,255,.1)' }
}

const sheets = [
  {
    id: 'composer',
    title: 'M12 · Work 输入卡',
    frame: 190,
    height: 390,
    subtitle: '参考 ChatGPT / 修复前 / 修复后；同尺寸取景，深色同一组',
    columns: [
      { label: '参考 ChatGPT', note: '768×127 · 卡上沿→首行 20px', src: 'm12-ref-composer' },
      { label: '修复前', note: '838×103 · 400K 28 高 · 间距 18/8', src: 'm12-before-composer', darkSrc: 'm12-before-composer-dark-clean' },
      { label: '修复后', note: '838×103 · 400K 36 高 · 间距 8/8', src: 'm12-after-composer' }
    ]
  },
  {
    id: 'panel-simple',
    title: 'M12 · 模型 / 强度面板 · 简单视图',
    frame: 240,
    height: 445,
    subtitle: '参考的紧凑强度条 vs 修复前的一级合并菜单 vs 修复后的两级面板',
    columns: [
      { label: '参考 ChatGPT', note: '280×84 · r16 · 轨道 256×24', src: 'm12-ref-panel-simple' },
      { label: '修复前', note: '280×392 · 一级合并 · r16', src: 'm12-before-panel-simple', darkSrc: 'm12-before-panel-simple-dark-clean' },
      { label: '修复后', note: '280×84 · r16 · 轨道 256×24', src: 'm12-after-panel-simple' }
    ]
  },
  {
    id: 'panel-advanced',
    title: 'M12 · 模型 / 强度面板 · 模型列表',
    frame: 460,
    height: 675,
    subtitle: '参考的二级模型列表 vs 修复后的同名列表；修复前没有这一级',
    columns: [
      { label: '参考 ChatGPT', note: '280×320 · 行 36 / 48 · r12', src: 'm12-ref-panel-advanced' },
      { label: '修复前', note: '没有二级模型视图', missing: true },
      { label: '修复后', note: '280×228 · 行 36 · 上限 320', src: 'm12-after-panel-advanced' }
    ]
  }
]

const browser = await playwright.chromium.launch({
  headless: true,
  executablePath: process.env.M12_CHROME ?? process.env.HOME + '/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome',
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
})
const page = await browser.newPage({ viewport: { width: 1780, height: 900 }, deviceScaleFactor: 2 })

for (const theme of ['light', 'dark']) {
  const palette = themes[theme]
  for (const sheet of sheets) {
    const columns = sheet.columns
      .map((column) => `
        <figure>
          <figcaption><b>${column.label}</b><span>${column.note}</span></figcaption>
          <div class="frame">
            ${column.missing ? '<div class="missing">修复前：面板只有一级<br><small>模型列表与强度滑轨同屏</small></div>' : `<img src="${png(`${theme === 'dark' && column.darkSrc ? `${column.darkSrc}.png` : `${column.src}-${theme}.png`}`)}" alt="">`}
          </div>
        </figure>`)
      .join('')
    const html = `<!doctype html><html><head><meta charset="utf-8"><style>
      *{box-sizing:border-box}
      body{margin:0;padding:28px 30px 22px;background:${palette.bg};color:${palette.ink};font:14px/1.45 -apple-system,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif}
      h1{margin:0 0 2px;font-size:22px;font-weight:650;letter-spacing:-.01em}
      p.sub{margin:0 0 20px;color:${palette.sub};font-size:13px}
      .grid{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;align-items:start}
      figure{margin:0;min-width:0}
      figcaption{display:flex;flex-direction:column;gap:3px;margin:0 2px 7px;font-size:13px}
      figcaption b{font-weight:600}
      figcaption span{color:${palette.sub};font-size:12px}
      .frame{height:${sheet.frame}px;display:flex;align-items:center;justify-content:center;padding:10px;border:1px solid ${palette.line};border-radius:14px;background:${palette.frame};overflow:hidden}
      img{max-width:100%;max-height:100%;display:block;object-fit:contain;border-radius:6px}
      .missing{color:${palette.sub};text-align:center;font-size:13px;line-height:1.7}
      .missing small{font-size:11px;opacity:.8}
      footer{margin-top:18px;padding-top:12px;border-top:1px solid ${palette.line};color:${palette.sub};font-size:11.5px;display:flex;justify-content:space-between;gap:14px}
      .chip{font-variant-numeric:tabular-nums}
    </style></head><body>
      <h1>${sheet.title}</h1>
      <p class="sub">${sheet.subtitle}</p>
      <div class="grid">${columns}</div>
      <footer><span>M12 · 实测 1600×1000 @2x · 参考 1600×865 @2x${theme === 'dark' ? ' · 修复前深色帧的页面底色已归一为 #0E0E0E（仅轮廓外像素）' : ''}</span><span class="chip">docs/capture/live/model-panel.json</span></footer>
    </body></html>`
    await page.setViewportSize({ width: 1780, height: sheet.height })
    await page.setContent(html, { waitUntil: 'load' })
    await page.waitForTimeout(220)
    const name = `m12-${sheet.id}-${theme}.png`
    await page.screenshot({ path: join(SHOTS, name) })
    console.log('wrote', join('docs/screenshots', name))
  }
}

await browser.close()
