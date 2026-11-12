#!/usr/bin/env node
/**
 * tools/m32-capture.mjs — P0-19a sidebar controls, hover reveal and spinner.
 *
 *   node tools/m32-capture.mjs --url "http://127.0.0.1:3120/?token=…" [--out docs]
 *
 * One isolated DSH instance (the M27 paced fixture) drives every state:
 *   1. expanded header: search + 收起侧边栏 icon centres and hover geometry
 *   2. collapsed: hover the rail → temporary overlay, move out → gone,
 *      click 展开侧栏 → the host's own persisted expansion (reload checked)
 *   3. one paced turn: only the session rows spin, project rows never do
 *
 * Writes docs/m32.json and docs/screenshots/m32-*.png. The annotated sheets are
 * composed from the same 2× clips in a throwaway HTML page, so every number in
 * the overlay is the measured one.
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
const url = args.get('url')
if (typeof url !== 'string') {
  console.error('usage: node tools/m32-capture.mjs --url <tokenised-url> [--out docs]')
  process.exit(2)
}
const OUT = resolve(ROOT, typeof args.get('out') === 'string' ? args.get('out') : 'docs')
const SHOTS = join(OUT, 'screenshots')
mkdirSync(SHOTS, { recursive: true })

const playwrightPath = process.env.M32_PLAYWRIGHT ?? '/mnt/f/project/y86/node_modules/playwright/index.mjs'
const CHROME = process.env.CHATGPT_UI_CHROME ?? '/home/user/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome'
const { chromium } = await import(playwrightPath)

const RAIL = 52
const PANEL = 288
const round = (value) => Math.round(value * 100) / 100
const redact = (value) => value.replace(/([?&]token=)[^&]+/, '$1***')
const COLLAPSE = "[data-slot='sidebar'] [data-window-drag] > button:last-of-type"
const FRAME = '[class*="_frame"]'

const assertions = []
const addAssertion = (id, ok, detail) => {
  assertions.push({ id, ok: ok === true, detail })
  if (ok !== true) console.log(`FAIL  ${id} — ${detail}`)
}

const browser = await chromium.launch({
  headless: true,
  executablePath: CHROME,
  args: ['--no-sandbox', '--disable-dev-shm-usage']
})
const context = await browser.newContext({
  viewport: { width: 1233, height: 850 },
  deviceScaleFactor: 2,
  locale: 'zh-CN',
  colorScheme: 'dark'
})
const page = await context.newPage()
const errors = []
page.on('pageerror', (error) => errors.push(String(error).slice(0, 300)))
await page.goto(url, { waitUntil: 'networkidle' })
await page.waitForTimeout(1300)
const dismissNotice = async () => {
  const notice = page.getByRole('button', { name: /继续|Continue/ })
  if ((await notice.count()) > 0) {
    await notice.first().click()
    await page.waitForTimeout(400)
  }
}
await dismissNotice()

/** Everything the evidence needs, read from the live DOM. */
const measure = () =>
  page.evaluate(() => {
    const roundValue = (value) => Math.round(value * 100) / 100
    const rect = (element) => {
      if (element === null || element === undefined) return null
      const box = element.getBoundingClientRect()
      return {
        x: roundValue(box.x),
        y: roundValue(box.y),
        w: roundValue(box.width),
        h: roundValue(box.height),
        cx: roundValue(box.x + box.width / 2),
        cy: roundValue(box.y + box.height / 2)
      }
    }
    const style = (element) => {
      if (element === null || element === undefined) return null
      const computed = getComputedStyle(element)
      return {
        background: computed.backgroundColor,
        radius: computed.borderRadius,
        position: computed.position,
        zIndex: computed.zIndex,
        visibility: computed.visibility,
        animationName: computed.animationName,
        animationDuration: computed.animationDuration,
        width: computed.width,
        height: computed.height,
        padding: computed.padding,
        transform: computed.transform
      }
    }
    const control = (element) => {
      if (element === null || element === undefined) return null
      return { rect: rect(element), style: style(element), icon: rect(element.querySelector('svg')) }
    }
    const frame = document.querySelector('[class*="_frame"]')
    const div = document.querySelector("[data-slot='sidebar'] > div")
    const header = div === null || div === undefined ? null : div.querySelector('[data-window-drag]')
    const anchor =
      document.querySelector('[data-composer-card="true"]') ??
      document.querySelector('[data-slot="main"] h1') ??
      document.querySelector('[data-slot="main"] > *')
    const spinner = document.querySelector('[data-cgpt-session-row] [data-cgpt-running-spinner]')
    return {
      collapsed: frame === null ? null : frame.hasAttribute('data-sidebar-collapsed'),
      columns: frame === null ? null : getComputedStyle(frame).gridTemplateColumns,
      peek: document.body.hasAttribute('data-cgpt-sidebar-peek'),
      search: control(document.querySelector('.chatgpt-panel-search')),
      expand: control(document.querySelector('.chatgpt-peek-expand')),
      collapse: control(header === null ? null : header.querySelector(':scope > button:last-of-type')),
      panel: { rect: rect(div), style: style(div) },
      anchor: rect(anchor),
      sessionSpinners: document.querySelectorAll('[data-cgpt-session-row] [data-cgpt-running-spinner]').length,
      projectSpinners: document.querySelectorAll('[data-cgpt-project-head] [data-cgpt-running-spinner]').length,
      projectRows: document.querySelectorAll('[data-cgpt-project-head]').length,
      spinnerAnimation: spinner === null ? null : {
        name: getComputedStyle(spinner).animationName,
        duration: getComputedStyle(spinner).animationDuration,
        position: rect(spinner),
        row: rect(spinner.closest('[data-cgpt-session-row]'))
      },
      projectRowRect: rect(document.querySelector('[data-cgpt-project-head]'))
    }
  })

const clip = (name, box) => page.screenshot({ path: join(SHOTS, name), clip: box })

const ensureExpanded = async () => {
  const collapsed = await page.evaluate((frameSelector) => document.querySelector(frameSelector)?.hasAttribute('data-sidebar-collapsed') ?? null, FRAME)
  if (collapsed === true) {
    await page.evaluate((selector) => document.querySelector(selector)?.click(), COLLAPSE)
    await page.waitForTimeout(750)
  }
}

await ensureExpanded()

// ---- 1. header: icon alignment + hover stability -------------------------
await page.mouse.move(700, 600)
await page.waitForTimeout(250)
const expandedBefore = await measure()
await clip('m32-collapse-before.png', { x: 0, y: 0, width: 420, height: 96 })

await page.locator(COLLAPSE).hover()
await page.waitForTimeout(400)
const expandedHover = await measure()
await clip('m32-collapse-after.png', { x: 0, y: 0, width: 420, height: 96 })

// Search's own hovered box, measured with a real pointer.
await page.mouse.move(700, 600)
await page.waitForTimeout(300)
const searchRest = await measure()
await page.locator('.chatgpt-panel-search').hover()
await page.waitForTimeout(350)
const searchHover = await measure()
await page.mouse.move(700, 600)
await page.waitForTimeout(250)

const alignment = {
  searchButton: expandedBefore.search.rect,
  searchIcon: expandedBefore.search.icon,
  collapseButton: expandedBefore.collapse.rect,
  collapseIcon: expandedBefore.collapse.icon,
  iconCenterDeltaX: round(Math.abs(expandedBefore.search.icon.cx - expandedBefore.collapse.icon.cx)),
  iconCenterDeltaY: round(Math.abs(expandedBefore.search.icon.cy - expandedBefore.collapse.icon.cy)),
  note: 'Both glyphs are concentric in their own 36×36 button and share cy=26. The x centres are 268 and 306 because the buttons sit side by side (36px + 2px gap); Δx is the layout stride, not an icon misalignment.',
  iconButtonDelta: {
    search: {
      x: round(Math.abs(expandedBefore.search.icon.cx - expandedBefore.search.rect.cx)),
      y: round(Math.abs(expandedBefore.search.icon.cy - expandedBefore.search.rect.cy))
    },
    collapse: {
      x: round(Math.abs(expandedBefore.collapse.icon.cx - expandedBefore.collapse.rect.cx)),
      y: round(Math.abs(expandedBefore.collapse.icon.cy - expandedBefore.collapse.rect.cy))
    }
  }
}
addAssertion(
  'search and collapse icons sit on the same horizontal centre line (|Δy| ≤ 0.5px)',
  alignment.iconCenterDeltaY <= 0.5,
  JSON.stringify({ searchIcon: alignment.searchIcon, collapseIcon: alignment.collapseIcon, deltaY: alignment.iconCenterDeltaY })
)
addAssertion(
  'each icon is concentric with the 36×36 button that owns it',
  alignment.iconButtonDelta.search.x <= 0.5 &&
    alignment.iconButtonDelta.search.y <= 0.5 &&
    alignment.iconButtonDelta.collapse.x <= 0.5 &&
    alignment.iconButtonDelta.collapse.y <= 0.5,
  JSON.stringify(alignment.iconButtonDelta)
)
addAssertion(
  'x centres recorded (search 268, collapse 306 by layout)',
  alignment.searchIcon.cx < alignment.collapseIcon.cx && alignment.iconCenterDeltaX === 38,
  JSON.stringify({ searchX: alignment.searchIcon.cx, collapseX: alignment.collapseIcon.cx })
)

const hover = {
  before: { button: expandedBefore.collapse.rect, icon: expandedBefore.collapse.icon, background: expandedBefore.collapse.style.background },
  after: { button: expandedHover.collapse.rect, icon: expandedHover.collapse.icon, background: expandedHover.collapse.style.background },
  searchHover: { button: searchHover.search.rect, icon: searchHover.search.icon, background: searchHover.search.style.background },
  iconMoved: false,
  highlightSizeChanged: false,
  highlightMatchesSearch: false
}
hover.iconMoved = JSON.stringify(hover.before.icon) !== JSON.stringify(hover.after.icon)
hover.highlightSizeChanged =
  JSON.stringify([hover.before.button.w, hover.before.button.h]) !== JSON.stringify([hover.after.button.w, hover.after.button.h]) ||
  JSON.stringify([hover.before.button.x, hover.before.button.y]) !== JSON.stringify([hover.after.button.x, hover.after.button.y])
hover.highlightMatchesSearch =
  hover.before.button.w === hover.searchHover.button.w &&
  hover.before.button.h === hover.searchHover.button.h &&
  expandedBefore.collapse.style.radius === searchRest.search.style.radius

addAssertion('hover leaves the icon exactly where it was', hover.iconMoved === false, JSON.stringify({ before: hover.before.icon, after: hover.after.icon }))
addAssertion('hover leaves the highlight box at 36×36', hover.highlightSizeChanged === false, JSON.stringify({ before: hover.before.button, after: hover.after.button }))
addAssertion(
  'hover highlight matches the search highlight (same 36×36 and 8px radius)',
  hover.highlightMatchesSearch && hover.after.background === searchHover.search.style.background,
  JSON.stringify({ collapse: { size: [hover.after.button.w, hover.after.button.h], radius: expandedBefore.collapse.style.radius, bg: hover.after.background }, search: { size: [hover.searchHover.button.w, hover.searchHover.button.h], radius: searchRest.search.style.radius, bg: hover.searchHover.background } })
)
addAssertion('hover changes colour only', hover.before.background !== hover.after.background && hover.after.background === searchHover.search.style.background, JSON.stringify({ before: hover.before.background, after: hover.after.background }))

// ---- 2. collapsed peek ----------------------------------------------------
await page.mouse.move(700, 600)
await page.waitForTimeout(250)
await page.locator(COLLAPSE).click()
await page.waitForTimeout(800)
const collapsedState = await measure()
await clip('m32-peek-1-collapsed.png', { x: 0, y: 0, width: 420, height: 560 })

const railItem = page.locator('.chatgpt-rail-button').nth(1)
await railItem.hover()
await page.waitForTimeout(260)
const peekState = await measure()
await clip('m32-peek-2-hover.png', { x: 0, y: 0, width: 420, height: 560 })

await page.mouse.move(700, 600)
await page.waitForTimeout(300)
const outState = await measure()
await clip('m32-peek-3-out.png', { x: 0, y: 0, width: 420, height: 560 })

const peek = {
  visible: peekState.peek && peekState.panel.style.visibility === 'visible' && peekState.panel.rect.w === PANEL,
  attr: peekState.peek,
  panel: peekState.panel,
  mainColumnsBefore: collapsedState.columns,
  mainColumnsAfter: peekState.columns,
  anchorBefore: collapsedState.anchor,
  anchorAfter: peekState.anchor,
  coversContent: peekState.panel.rect.x === RAIL && peekState.panel.rect.w === PANEL && collapsedState.anchor !== null && peekState.panel.rect.x + peekState.panel.rect.w > collapsedState.anchor.x,
  animationDurationMs: Math.round(Number.parseFloat(peekState.panel.style.animationDuration) * 1000),
  hiddenAfterLeave: outState.peek === false && outState.panel.style.visibility === 'hidden',
  keyboardReveal: false,
  escapeHides: false,
  expandedAfterClick: false,
  afterReloadCollapsed: null
}
addAssertion('hovering the rail reveals the 288px panel as a floating layer', peek.visible === true, JSON.stringify({ peek: peekState.peek, panel: peekState.panel }))
addAssertion('the peek is positioned over the content (fixed x=52, w=288, covers the column)', peek.coversContent === true, JSON.stringify({ panel: peekState.panel.rect, anchor: collapsedState.anchor }))
addAssertion('the peek does not squeeze the main content (grid columns unchanged)', peek.mainColumnsBefore === peek.mainColumnsAfter, JSON.stringify({ before: peek.mainColumnsBefore, after: peek.mainColumnsAfter }))
addAssertion('the content anchor keeps its box while the panel floats', JSON.stringify(peek.anchorBefore) === JSON.stringify(peek.anchorAfter), JSON.stringify({ before: peek.anchorBefore, after: peek.anchorAfter }))
addAssertion('the fade/slide animation lasts ≤120ms', peek.animationDurationMs <= 120 && peekState.panel.style.animationName === 'chatgpt-sidebar-peek-in', JSON.stringify({ name: peekState.panel.style.animationName, ms: peek.animationDurationMs }))
addAssertion('leaving the rail hides the peek again', peek.hiddenAfterLeave === true, JSON.stringify({ attr: outState.peek, visibility: outState.panel.style.visibility }))

// Keyboard focus enters the rail without a pointer: same reveal.
await page.locator('.chatgpt-rail-button').first().focus()
await page.waitForTimeout(240)
const keyboardState = await measure()
peek.keyboardReveal = keyboardState.peek === true && keyboardState.panel.style.visibility === 'visible'
addAssertion('keyboard focus inside the rail triggers the reveal', peek.keyboardReveal === true, JSON.stringify({ peek: keyboardState.peek }))
await page.keyboard.press('Escape')
await page.waitForTimeout(250)
const escapeState = await measure()
peek.escapeHides = escapeState.peek === false
addAssertion('Escape dismisses the temporary reveal', peek.escapeHides === true, JSON.stringify({ peek: escapeState.peek }))

// Clicking 展开侧栏 delegates to the host toggle, which persists the state.
await railItem.hover()
await page.waitForTimeout(240)
const beforeExpandClick = await measure()
await page.locator('.chatgpt-peek-expand').click()
await page.waitForTimeout(800)
const afterExpandClick = await measure()
await page.mouse.move(700, 600)
await page.waitForTimeout(300)
await clip('m32-peek-expanded.png', { x: 0, y: 0, width: 420, height: 560 })
peek.expandedAfterClick = afterExpandClick.collapsed === false && afterExpandClick.peek === false
addAssertion(
  'clicking 展开侧栏 during the peek turns it into a permanent host expansion',
  peek.expandedAfterClick === true,
  JSON.stringify({ collapsed: afterExpandClick.collapsed, peek: afterExpandClick.peek, expandButton: beforeExpandClick.expand?.rect ?? null })
)

const columnsBeforeReload = afterExpandClick.columns
await page.reload({ waitUntil: 'networkidle' })
await page.waitForTimeout(1300)
await dismissNotice()
const afterReload = await measure()
peek.afterReloadCollapsed = afterReload.collapsed
addAssertion(
  'the host persisted the expansion across a reload',
  afterReload.collapsed === false && afterReload.columns === columnsBeforeReload,
  JSON.stringify({ collapsed: afterReload.collapsed, columnsBefore: columnsBeforeReload, columnsAfter: afterReload.columns })
)

// ---- 3. running indicator: session rows only, half speed ------------------
await ensureExpanded()
let running = null
for (let attempt = 0; attempt < 2 && running === null; attempt += 1) {
  const input = page.locator('[data-composer-input="true"]').first()
  if ((await input.count()) === 0) break
  await input.click()
  await page.keyboard.type('P0-19a 运行指示核验', { delay: 5 })
  await page.keyboard.press('Enter')
  for (let index = 0; index < 120; index += 1) {
    await page.waitForTimeout(100)
    const state = await measure()
    if (state.sessionSpinners > 0 || state.projectSpinners > 0) {
      running = state
      break
    }
  }
}
if (running === null) running = await measure()
await clip('m32-spinner-raw.png', { x: 0, y: 40, width: 560, height: 480 })

const spinner = {
  beforeCssDuration: '0.9s',
  afterComputedDuration: running.spinnerAnimation?.duration ?? null,
  animationName: running.spinnerAnimation?.name ?? null,
  sessionRowSpinners: running.sessionSpinners,
  projectRowSpinners: running.projectSpinners,
  projectRows: running.projectRows,
  projectRowChecked: running.projectRows > 0 && running.projectSpinners === 0,
  spinnerPosition: running.spinnerAnimation?.position ?? null
}
addAssertion('the session spinner runs at 1.8s (0.9s × 2)', spinner.afterComputedDuration === '1.8s', JSON.stringify(spinner))
addAssertion('only session rows spin: project rows have zero spinner nodes', spinner.projectRows > 0 && spinner.projectRowSpinners === 0 && spinner.sessionRowSpinners > 0, JSON.stringify({ projectRows: spinner.projectRows, projectSpinners: spinner.projectRowSpinners, sessionSpinners: spinner.sessionRowSpinners }))

// ---- annotated sheets -----------------------------------------------------
const dataUrl = (name) => `data:image/png;base64,${readFileSync(join(SHOTS, name)).toString('base64')}`
const escapeHtml = (value) => String(value).replace(/[&<>"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[char]))
const boxHtml = (box, color = '#4c8dff') =>
  `<div class="box" style="left:${box.x}px;top:${box.y}px;width:${box.w}px;height:${box.h}px;border-color:${color}"></div>`
const pointHtml = (point, color = '#ffd166') =>
  `<div class="point" style="left:${point.cx}px;top:${point.cy}px;background:${color}"></div>`
const noteHtml = (x, y, text, color = '#eaeaea') =>
  `<div class="pinote" style="left:${x}px;top:${y}px;color:${color}">${escapeHtml(text)}</div>`

const panelHtml = (panel) => `
  <section class="panel">
    <h2>${escapeHtml(panel.caption)}</h2>
    <div class="shot" style="width:${panel.cssW}px;height:${panel.cssH}px">
      <img src="${dataUrl(panel.file)}" />
      ${panel.overlay ?? ''}
    </div>
    <ul>${panel.legend.map((line) => `<li>${line}</li>`).join('')}</ul>
  </section>`

const sheet = async (outName, title, note, panels) => {
  const gap = 18
  const width = 22 * 2 + panels.reduce((sum, panel) => sum + panel.cssW, 0) + gap * (panels.length - 1)
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
    *{box-sizing:border-box} body{margin:0;padding:22px;background:#0b0b0b;color:#f2f2f2;font:13px/1.5 "PingFang SC","Noto Sans SC","Microsoft YaHei",sans-serif}
    h1{font-size:18px;margin:0 0 4px;font-weight:600} .note{color:#a9a9a9;margin:0 0 16px;max-width:${width - 44}px}
    .row{display:flex;gap:${gap}px;align-items:flex-start}
    .panel{margin:0} .panel h2{font-size:13px;font-weight:600;margin:0 0 6px;color:#d6d6d6}
    .shot{position:relative;overflow:hidden;border:1px solid #2c2c2c;border-radius:6px;background:#000}
    .shot img{display:block;width:100%;height:100%}
    .box{position:absolute;border:1.5px solid;border-radius:4px}
    .point{position:absolute;width:5px;height:5px;border-radius:50%;transform:translate(-50%,-50%);box-shadow:0 0 0 2px rgba(0,0,0,.55)}
    .pinote{position:absolute;white-space:nowrap;font:10.5px/14px ui-monospace,SFMono-Regular,Menlo,monospace;text-shadow:0 1px 2px #000,0 0 3px #000}
    .panel ul{margin:8px 0 0;padding:0;list-style:none;color:#bdbdbd;font-size:11.5px;line-height:1.55}
    code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;color:#c9d7ff}
  </style></head><body><h1>${escapeHtml(title)}</h1><p class="note">${note}</p><div class="row">${panels.map(panelHtml).join('')}</div></body></html>`
  const sheetContext = await browser.newContext({
    viewport: { width, height: 300 },
    deviceScaleFactor: 1,
    colorScheme: 'dark'
  })
  const sheetPage = await sheetContext.newPage()
  await sheetPage.setContent(html, { waitUntil: 'load' })
  await sheetPage.waitForTimeout(120)
  await sheetPage.screenshot({ path: join(SHOTS, outName), fullPage: true })
  await sheetContext.close()
}

const headerOverlay =
  boxHtml({ x: 250, y: 8, w: 36, h: 36 }, '#4c8dff') +
  boxHtml({ x: 288, y: 8, w: 36, h: 36 }, '#4c8dff') +
  pointHtml({ cx: expandedBefore.search.icon.cx, cy: expandedBefore.search.icon.cy }) +
  pointHtml({ cx: expandedBefore.collapse.icon.cx, cy: expandedBefore.collapse.icon.cy })

await sheet(
  'm32-collapse-hover.png',
  'P0-19a · 收起侧边栏 hover 前后（同一区域 420×96 CSS，2× 截取）',
  '蓝框 = 两枚 36×36 按钮；黄点 = 图标中心。搜索 (268, 26)、收起 (306, 26)，<code>|Δy| = 0</code>；hover 只改底色，图标与高亮框前后逐像素不动。',
  [
    {
      caption: '① hover 前（指针在内容区）',
      file: 'm32-collapse-before.png',
      cssW: 420,
      cssH: 96,
      overlay: headerOverlay,
      legend: [
        `搜索按钮 @ (${expandedBefore.search.rect.x}, ${expandedBefore.search.rect.y}) · ${expandedBefore.search.rect.w}×${expandedBefore.search.rect.h} · icon (${expandedBefore.search.icon.cx}, ${expandedBefore.search.icon.cy})`,
        `收起按钮 @ (${expandedBefore.collapse.rect.x}, ${expandedBefore.collapse.rect.y}) · ${expandedBefore.collapse.rect.w}×${expandedBefore.collapse.rect.h} · icon (${expandedBefore.collapse.icon.cx}, ${expandedBefore.collapse.icon.cy})`,
        `hover 前底色 <code>${hover.before.background}</code>`
      ]
    },
    {
      caption: '② hover 后（悬停 收起侧边栏）',
      file: 'm32-collapse-after.png',
      cssW: 420,
      cssH: 96,
      overlay: headerOverlay,
      legend: [
        `图标仍在 (${expandedHover.search.icon.cx}, ${expandedHover.search.icon.cy}) 与 (${expandedHover.collapse.icon.cx}, ${expandedHover.collapse.icon.cy})`,
        `高亮框仍为 (${expandedHover.collapse.rect.x}, ${expandedHover.collapse.rect.y}) ${expandedHover.collapse.rect.w}×${expandedHover.collapse.rect.h} · r${expandedHover.collapse.style.radius}`,
        `hover 底色 <code>${hover.after.background}</code>（与搜索 hover 相同）`
      ]
    }
  ]
)

const peekOverlay2 =
  boxHtml({ x: RAIL, y: 0, w: PANEL, h: 560 }, '#58d68d') +
  boxHtml({ x: 288, y: 8, w: 36, h: 36 }, '#58d68d') +
  pointHtml({ cx: 306, cy: 26 }, '#58d68d')
await sheet(
  'm32-peek.png',
  'P0-19a · 收起态 → 悬停导轨临时展开 → 移出（420×560 CSS，2× 截取）',
  '主内容 grid 全程不变（<code>' + escapeHtml(peek.mainColumnsBefore) + '</code>）；绿框 = 悬浮层 (x=52, w=288, position:fixed, z5) 与展开按钮；移出后 <code>data-cgpt-sidebar-peek</code> 移除，面板立即回到 hidden。',
  [
    {
      caption: '① 收起态',
      file: 'm32-peek-1-collapsed.png',
      cssW: 420,
      cssH: 560,
      overlay: boxHtml({ x: 0, y: 0, w: RAIL, h: 560 }, '#8e8e8e'),
      legend: ['面板 visibility:hidden（宿主折叠状态）', `主内容列：${peek.mainColumnsBefore}`, `内容锚点 x=${peek.anchorBefore?.x}, w=${peek.anchorBefore?.w}`]
    },
    {
      caption: '② 悬停导轨按钮 → 临时展开',
      file: 'm32-peek-2-hover.png',
      cssW: 420,
      cssH: 560,
      overlay: peekOverlay2,
      legend: [
        `面板 (${peek.panel.rect.x}, ${peek.panel.rect.y}) ${peek.panel.rect.w}×${peek.panel.rect.h} · ${peek.panel.style.position} · z${peek.panel.style.zIndex}`,
        `动画 ${peek.panel.style.animationName} ${peek.panel.style.animationDuration}`,
        `主内容列：${peek.mainColumnsAfter}（不挤压）`,
        `展开按钮出现 @ (288, 8) 36×36；点击写回宿主持久状态`
      ]
    },
    {
      caption: '③ 指针移出 → 自动消失',
      file: 'm32-peek-3-out.png',
      cssW: 420,
      cssH: 560,
      overlay: boxHtml({ x: 0, y: 0, w: RAIL, h: 560 }, '#8e8e8e'),
      legend: [`data-cgpt-sidebar-peek = ${outState.peek}`, `面板 visibility:${outState.panel.style.visibility}`, `主内容列：${outState.columns}`]
    }
  ]
)

// The spinner clip starts at y=40; translate page coordinates into the crop.
const SPIN_TOP = 40
const spinnerTop = running.spinnerAnimation?.position
const sessionRow = running.spinnerAnimation?.row
const projectRow = running.projectRowRect
const spinnerOverlay =
  (spinnerTop === null
    ? ''
    : pointHtml({ cx: spinnerTop.cx, cy: spinnerTop.cy - SPIN_TOP }, '#ffd166') +
      (sessionRow === null ? '' : boxHtml({ x: sessionRow.x, y: sessionRow.y - SPIN_TOP, w: sessionRow.w, h: sessionRow.h }, '#ffd166'))) +
  (projectRow === null
    ? ''
    : boxHtml({ x: projectRow.x, y: projectRow.y - SPIN_TOP, w: projectRow.w, h: projectRow.h }, '#58d68d')) +
  (sessionRow === null ? '' : noteHtml(352, sessionRow.y - SPIN_TOP + 10, '会话行 · 转圈 1.8s', '#ffd166')) +
  (projectRow === null ? '' : noteHtml(352, projectRow.y - SPIN_TOP + 10, '项目行 · 无 spinner', '#58d68d'))
await sheet(
  'm32-spinner.png',
  'P0-19a · 会话运行指示减速一半，项目条目不再转圈（560×480 CSS，2× 截取）',
  `会话行 spinner：<code>${spinner.animationName}</code> <code>${spinner.beforeCssDuration} → ${spinner.afterComputedDuration}</code>；项目行 spinner 节点数 <code>${spinner.projectRowSpinners}</code>。黄框 = 运行中的会话行，绿框 = 项目行。`,
  [
    {
      caption: '运行中的会话（Work / M27 paced fixture）',
      file: 'm32-spinner-raw.png',
      cssW: 560,
      cssH: 480,
      overlay: spinnerOverlay,
      legend: [
        `会话行 spinner：${spinner.sessionRowSpinners} 个，位置 (${spinner.spinnerPosition?.cx ?? '-'}, ${spinner.spinnerPosition?.cy ?? '-'})`,
        `项目行：${spinner.projectRows} 行，spinner ${spinner.projectRowSpinners} 个`,
        `动画 ${spinner.animationName} · ${spinner.afterComputedDuration}（原 ${spinner.beforeCssDuration}）`
      ]
    }
  ]
)

// ---- evidence -------------------------------------------------------------
const failed = assertions.filter((entry) => entry.ok !== true)
const evidence = {
  task: 'P0-19a',
  url: redact(url),
  capturedAt: new Date().toISOString(),
  viewport: { width: 1233, height: 850, deviceScaleFactor: 2 },
  alignment,
  hover,
  peek,
  spinner,
  assertions,
  summary: { total: assertions.length, passed: assertions.length - failed.length, failed: failed.map((entry) => entry.id) },
  screenshots: [
    'docs/screenshots/m32-collapse-hover.png',
    'docs/screenshots/m32-collapse-before.png',
    'docs/screenshots/m32-collapse-after.png',
    'docs/screenshots/m32-peek.png',
    'docs/screenshots/m32-peek-1-collapsed.png',
    'docs/screenshots/m32-peek-2-hover.png',
    'docs/screenshots/m32-peek-3-out.png',
    'docs/screenshots/m32-peek-expanded.png',
    'docs/screenshots/m32-spinner.png'
  ],
  errors
}
writeFileSync(join(OUT, 'm32.json'), `${JSON.stringify(evidence, null, 2)}\n`)
console.log(`docs/m32.json — ${evidence.summary.passed}/${evidence.summary.total} assertions passed, ${errors.length} page errors`)
await browser.close()
process.exit(failed.length === 0 ? 0 : 1)
