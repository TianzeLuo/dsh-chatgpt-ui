#!/usr/bin/env node
/**
 * scripts/m13-sheets.mjs — reference / before / after sheets for P0-3.
 *
 * Draws, from the PNGs the capture scripts already wrote:
 *   docs/screenshots/m13-composer-{light,dark}.png  (4 columns: reference open
 *     pill, before, after, after-open — the ring proof is its own column)
 *   docs/screenshots/m13-chat-{light,dark}.png      (before / after + reference
 *     values; Chat must stay 52 high, radius 26)
 *
 * Dev-only: playwright + Chromium. No live app.
 */
import { mkdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const LIVE = join(ROOT, 'docs/capture/live')
const SHOTS = join(ROOT, 'docs/screenshots')
mkdirSync(SHOTS, { recursive: true })

let playwright
for (const candidate of ['/mnt/f/project/y86/node_modules/playwright/index.mjs', 'playwright', 'playwright-core']) {
  try {
    playwright = await import(candidate)
    break
  } catch {}
}
if (playwright === undefined) {
  console.error('m13-sheets: playwright is required')
  process.exit(2)
}

const png = (name) => `data:image/png;base64,${readFileSync(join(LIVE, name)).toString('base64')}`

const themes = {
  light: { bg: '#f4f4f4', ink: '#0d0d0d', sub: '#6b6b6b', frame: '#ffffff', line: 'rgba(0,0,0,.08)' },
  dark: { bg: '#1a1a1a', ink: '#f2f2f2', sub: '#a8a8a8', frame: '#242424', line: 'rgba(255,255,255,.1)' }
}

const composerColumns = [
  { label: '参考 ChatGPT', note: '768×127 · r28 · 药丸打开态蓝环', src: (theme) => `m12-ref-composer-${theme}.png` },
  { label: '修复前', note: '838×103 · 编辑区 26 · glyphTop 21', src: (theme) => `m13-before-work-${theme}.png` },
  { label: '修复后', note: '768×127 · 编辑区 52 · glyphTop 20', src: (theme) => `m13-after-work-${theme}.png` },
  { label: '修复后 · 药丸打开', note: '静态无边框 → 1.5px #3A83F7 环', src: (theme) => `m13-after-work-open-${theme}.png` }
]

const chatColumns = [
  { label: '修复前 · Chat', note: '52 高 · r26 · 无工具带', value: '52 / 26', src: (theme) => `m13-before-chat-${theme}.png` },
  { label: '修复后 · Chat', note: '52 高 · r26 · 无工具带', value: '52 / 26', src: (theme) => `m13-after-chat-${theme}.png` }
]

const browser = await playwright.chromium.launch({
  headless: true,
  executablePath: process.env.M13_CHROME ?? '/home/user/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome',
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
})
const page = await browser.newPage({ viewport: { width: 1860, height: 900 }, deviceScaleFactor: 2 })

for (const theme of ['light', 'dark']) {
  const palette = themes[theme]

  const composerHtml = `<!doctype html><html><head><meta charset="utf-8"><style>
    *{box-sizing:border-box}
    body{margin:0;padding:28px 30px 22px;background:${palette.bg};color:${palette.ink};font:14px/1.45 -apple-system,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif}
    h1{margin:0 0 2px;font-size:22px;font-weight:650;letter-spacing:-.01em}
    p.sub{margin:0 0 20px;color:${palette.sub};font-size:13px}
    .grid{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;align-items:start}
    figure{margin:0;min-width:0}
    figcaption{display:flex;flex-direction:column;gap:3px;margin:0 2px 7px;font-size:13px}
    figcaption b{font-weight:600}
    figcaption span{color:${palette.sub};font-size:12px}
    .frame{height:270px;display:flex;align-items:center;justify-content:center;padding:10px;border:1px solid ${palette.line};border-radius:14px;background:${palette.frame};overflow:hidden}
    img{max-width:100%;max-height:100%;display:block;object-fit:contain;border-radius:6px}
    footer{margin-top:18px;padding-top:12px;border-top:1px solid ${palette.line};color:${palette.sub};font-size:11.5px;display:flex;justify-content:space-between;gap:14px}
  </style></head><body>
    <h1>M13 · Work 输入卡几何对齐</h1>
    <p class="sub">参考 ChatGPT / 修复前 / 修复后 · 同卡取景 · ${theme === 'light' ? '浅色' : '深色'}；末列为药丸打开态描边证据</p>
    <div class="grid">${composerColumns.map((column) => `
      <figure>
        <figcaption><b>${column.label}</b><span>${column.note}</span></figcaption>
        <div class="frame"><img src="${png(column.src(theme))}" alt=""></div>
      </figure>`).join('')}</div>
    <footer><span>M13 · 实现 1600×1000 @2x · 参考 chatgpt.com 1600×865 @2x · 断言：宽高差 ≤2px、glyphTop ≤2px、底行中心线 ≤1px、Chat 52/26</span><span>docs/m13-composer.json</span></footer>
  </body></html>`
  await page.setViewportSize({ width: 1860, height: 520 })
  await page.setContent(composerHtml, { waitUntil: 'load' })
  await page.waitForTimeout(220)
  await page.screenshot({ path: join(SHOTS, `m13-composer-${theme}.png`) })
  console.log('wrote', join('docs/screenshots', `m13-composer-${theme}.png`))

  const chatHtml = `<!doctype html><html><head><meta charset="utf-8"><style>
    *{box-sizing:border-box}
    body{margin:0;padding:28px 30px 22px;background:${palette.bg};color:${palette.ink};font:14px/1.45 -apple-system,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif}
    h1{margin:0 0 2px;font-size:22px;font-weight:650;letter-spacing:-.01em}
    p.sub{margin:0 0 20px;color:${palette.sub};font-size:13px}
    .grid{display:grid;grid-template-columns:1fr 1fr 0.72fr;gap:16px;align-items:start}
    figure{margin:0;min-width:0}
    figcaption{display:flex;flex-direction:column;gap:3px;margin:0 2px 7px;font-size:13px}
    figcaption b{font-weight:600}
    figcaption span{color:${palette.sub};font-size:12px}
    .frame{height:180px;display:flex;align-items:center;justify-content:center;padding:10px;border:1px solid ${palette.line};border-radius:14px;background:${palette.frame};overflow:hidden}
    img{max-width:100%;max-height:100%;display:block;object-fit:contain;border-radius:6px}
    .spec{height:180px;display:flex;flex-direction:column;justify-content:center;gap:8px;padding:16px;border:1px solid ${palette.line};border-radius:14px;background:${palette.frame}}
    .spec b{font-size:13px}.spec div{display:flex;justify-content:space-between;gap:12px;font-size:12px;color:${palette.sub}}
    .spec strong{color:${palette.ink};font-weight:600;font-variant-numeric:tabular-nums}
    footer{margin-top:18px;padding-top:12px;border-top:1px solid ${palette.line};color:${palette.sub};font-size:11.5px;display:flex;justify-content:space-between;gap:14px}
  </style></head><body>
    <h1>M13 · Chat 输入卡回归</h1>
    <p class="sub">Chat 态只做回归：卡片保持 52 高、26 圆角、无工具带；Work 的本轮规则全部限定在 agent 作用域</p>
    <div class="grid">${chatColumns.map((column) => `
      <figure>
        <figcaption><b>${column.label}</b><span>${column.note}</span></figcaption>
        <div class="frame"><img src="${png(column.src(theme))}" alt=""></div>
      </figure>`).join('')}
      <div class="spec"><b>参考值（phase3/4b）</b>
        <div><span>高度</span><strong>52px</strong></div>
        <div><span>圆角</span><strong>26px</strong></div>
        <div><span>工具带</span><strong>无</strong></div>
        <div><span>本轮实现</span><strong>52 / 26</strong></div>
      </div>
    </div>
    <footer><span>M13 · 1600×1000 @2x · 修复前后 Chat 卡片逐项相同；Work 规则未命中 chat 态</span><span>docs/m13-composer.json</span></footer>
  </body></html>`
  await page.setViewportSize({ width: 1500, height: 330 })
  await page.setContent(chatHtml, { waitUntil: 'load' })
  await page.waitForTimeout(220)
  await page.screenshot({ path: join(SHOTS, `m13-chat-${theme}.png`) })
  console.log('wrote', join('docs/screenshots', `m13-chat-${theme}.png`))
}

await browser.close()
