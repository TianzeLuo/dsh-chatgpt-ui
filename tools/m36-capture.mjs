#!/usr/bin/env node
/**
 * tools/m36-capture.mjs — P0-19d evidence for the 500ms hover regression.
 *
 *   node tools/m36-capture.mjs --url "http://127.0.0.1:3122/?token=…" [--out docs]
 *
 * Hovering 收起侧边栏 for half a second made the icon jump right and the
 * highlight shrink. The host inserts its tooltip <span role="tooltip"> as the
 * last child of the header logo row at ~500ms; the old selector
 * `> button:last-child` stopped matching at that instant, so every pinned
 * 36×36 rule dropped and the button fell back to the host's 28×28 box
 * (button x 288→296, icon x 306→310, highlight 36→28).
 *
 * The fix is `> button:last-of-type` (the tooltip is a span, so the toggle is
 * still the last button). This script samples hover at 0 / 200 / 700 / 1500ms,
 * records both selector match counts, and verifies that hovering a *rail*
 * button still opens the temporary peek.
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
  console.error('usage: node tools/m36-capture.mjs --url <tokenised-url> [--out docs]')
  process.exit(2)
}
const OUT = resolve(ROOT, typeof args.get('out') === 'string' ? args.get('out') : 'docs')
const SHOTS = join(OUT, 'screenshots')
mkdirSync(SHOTS, { recursive: true })

const { chromium } = await import(process.env.M36_PLAYWRIGHT ?? '/mnt/f/project/y86/node_modules/playwright/index.mjs')
const CHROME = process.env.CHATGPT_UI_CHROME ?? '/home/user/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome'
const COLLAPSE = "[data-slot='sidebar'] [data-window-drag] > button:last-of-type"
const OLD_COLLAPSE = "[data-slot='sidebar'] [data-window-drag] > button:last-child"
const FRAME_SELECTOR = '[class*="_frame"]'
const CROP = { x: 220, y: 0, width: 220, height: 64 }
const round = (value) => Math.round(value * 100) / 100
const redact = (value) => value.replace(/([?&]token=)[^&]+/, '$1***')

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
await page.waitForTimeout(1400)
const dismissNotice = async () => {
  const notice = page.getByRole('button', { name: /继续|Continue/ })
  if ((await notice.count()) > 0) {
    await notice.first().click()
    await page.waitForTimeout(400)
  }
}
await dismissNotice()

const measure = () =>
  page.evaluate(({ collapseSelector, oldSelector, frameSelector }) => {
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
        padding: computed.padding,
        width: computed.width,
        height: computed.height,
        transform: computed.transform,
        transition: computed.transition,
        position: computed.position,
        zIndex: computed.zIndex,
        visibility: computed.visibility,
        animationName: computed.animationName,
        animationDuration: computed.animationDuration
      }
    }
    const control = (element) => {
      if (element === null || element === undefined) return null
      return { rect: rect(element), style: style(element), icon: rect(element.querySelector('svg')) }
    }
    const frame = document.querySelector(frameSelector)
    const header = document.querySelector("[data-slot='sidebar'] [data-window-drag]")
    const tooltip = document.querySelector('[role="tooltip"]')
    return {
      collapsed: frame === null ? null : frame.hasAttribute('data-sidebar-collapsed'),
      peek: document.body.hasAttribute('data-cgpt-sidebar-peek'),
      columns: frame === null ? null : getComputedStyle(frame).gridTemplateColumns,
      search: control(document.querySelector('.chatgpt-panel-search')),
      collapse: control(document.querySelector(collapseSelector)),
      oldSelectorMatches: document.querySelector(oldSelector) === null ? 0 : 1,
      lastOfTypeMatches: document.querySelector(collapseSelector) === null ? 0 : 1,
      headerChildren: header === null ? [] : [...header.children].map((element) => element.tagName),
      tooltip: tooltip === null ? null : { text: tooltip.textContent, rect: rect(tooltip) },
      panel: control(document.querySelector("[data-slot='sidebar'] > div")),
      expand: control(document.querySelector('.chatgpt-peek-expand'))
    }
  }, { collapseSelector: COLLAPSE, oldSelector: OLD_COLLAPSE, frameSelector: FRAME_SELECTOR })

const clip = (name) => page.screenshot({ path: join(SHOTS, name), clip: CROP })

const ensureExpanded = async () => {
  const collapsed = await page.evaluate((selector) => document.querySelector(selector)?.hasAttribute('data-sidebar-collapsed') ?? null, FRAME_SELECTOR)
  if (collapsed === true) {
    await page.evaluate((selector) => document.querySelector(selector)?.click(), COLLAPSE)
    await page.waitForTimeout(750)
  }
}
await ensureExpanded()

// ---- four hover frames ----------------------------------------------------
await page.mouse.move(700, 600)
await page.waitForTimeout(300)
const hoverStart = Date.now()
await page.locator(COLLAPSE).hover()
const frames = []
const sample = async (label, rawName, waitMs) => {
  if (waitMs > 0) await page.waitForTimeout(waitMs)
  const state = await measure()
  await clip(rawName)
  frames.push({ label, elapsedMs: Date.now() - hoverStart, ...state, raw: `docs/screenshots/${rawName}` })
  console.log(`${label}: icon=${JSON.stringify(state.collapse?.icon)} hover=${JSON.stringify(state.collapse?.rect)} old=${state.oldSelectorMatches} tooltip=${state.tooltip?.text ?? '—'}`)
}
await sample('0ms', 'm36-raw-0ms.png', 30)
await sample('200ms', 'm36-raw-200ms.png', 170)
await sample('700ms', 'm36-raw-700ms.png', 500)
await sample('1500ms', 'm36-raw-1500ms.png', 800)

const fixed = frames[0]
const constant = (pick) => frames.every((frame) => JSON.stringify(pick(frame)) === JSON.stringify(pick(fixed)))
const iconConstant = constant((frame) => frame.collapse.icon)
const hoverBoxConstant = constant((frame) => frame.collapse.rect)
const searchLine = frames.every((frame) => frame.search !== null && frame.collapse !== null && Math.abs(frame.search.icon.cy - frame.collapse.icon.cy) <= 0.5)

addAssertion(
  'the icon centre stays at (306, 26) in all four frames',
  iconConstant && fixed.collapse.icon.cx === 306 && fixed.collapse.icon.cy === 26,
  JSON.stringify(frames.map((frame) => frame.collapse?.icon))
)
addAssertion(
  'the hover box stays (288, 8) 36×36 in all four frames',
  hoverBoxConstant && fixed.collapse.rect.x === 288 && fixed.collapse.rect.y === 8 && fixed.collapse.rect.w === 36 && fixed.collapse.rect.h === 36,
  JSON.stringify(frames.map((frame) => frame.collapse?.rect))
)
addAssertion(
  'the host tooltip arrives after 500ms but no longer drops the pinned geometry',
  frames[0].tooltip === null &&
    frames[1].tooltip === null &&
    frames[2].tooltip?.text === '收起侧边栏' &&
    frames[3].tooltip?.text === '收起侧边栏' &&
    frames[2].collapse.rect.w === 36 &&
    frames[3].collapse.rect.w === 36,
  JSON.stringify(frames.map((frame) => ({ tooltip: frame.tooltip?.text ?? null, w: frame.collapse?.rect.w })))
)
addAssertion(
  'runtime proof: the old :last-child selector matches 0 once the tooltip is inserted, :last-of-type keeps matching',
  frames[0].oldSelectorMatches === 1 &&
    frames[1].oldSelectorMatches === 1 &&
    frames[2].oldSelectorMatches === 0 &&
    frames[3].oldSelectorMatches === 0 &&
    frames.every((frame) => frame.lastOfTypeMatches === 1),
  JSON.stringify(frames.map((frame) => ({ old: frame.oldSelectorMatches, lastOfType: frame.lastOfTypeMatches })))
)
addAssertion(
  'the tooltip is the extra header child that breaks :last-child',
  frames[2].headerChildren.join(',') === 'BUTTON,BUTTON,SPAN',
  JSON.stringify(frames.map((frame) => frame.headerChildren))
)
addAssertion('the button hover is not a peek trigger (peek false in all four frames)', frames.every((frame) => frame.peek === false), JSON.stringify(frames.map((frame) => frame.peek)))
addAssertion('search and collapse icons stay on the same horizontal line', searchLine, JSON.stringify(frames.map((frame) => ({ search: frame.search?.icon.cy, collapse: frame.collapse?.icon.cy }))))

// ---- rail hover still peeks ----------------------------------------------
await page.mouse.move(700, 600)
await page.waitForTimeout(250)
await page.locator(COLLAPSE).click()
await page.waitForTimeout(800)
await page.mouse.move(700, 600)
await page.waitForTimeout(300)
const beforeRail = await measure()
await page.locator('.chatgpt-rail-button').nth(1).hover()
await page.waitForTimeout(300)
const railPeek = await measure()
await page.screenshot({ path: join(SHOTS, 'm36-rail-peek.png'), clip: { x: 0, y: 0, width: 420, height: 420 } })
await page.mouse.move(700, 600)
await page.waitForTimeout(300)
const afterRail = await measure()

const peek = {
  before: { peek: beforeRail.peek, columns: beforeRail.columns },
  visible: railPeek.peek === true && railPeek.panel?.rect.w === 288 && railPeek.panel?.style.position === 'fixed',
  panel: railPeek.panel?.rect ?? null,
  panelZ: railPeek.panel?.style.zIndex ?? null,
  columnsBefore: beforeRail.columns,
  columnsAfter: railPeek.columns,
  expandVisible: railPeek.expand !== null,
  hiddenAfterLeave: afterRail.peek === false,
  screenshot: 'docs/screenshots/m36-rail-peek.png'
}
addAssertion('hovering another rail button still opens the 288px peek', peek.visible, JSON.stringify(peek))
addAssertion('the peek does not change the main content columns', peek.columnsBefore === peek.columnsAfter, JSON.stringify({ before: peek.columnsBefore, after: peek.columnsAfter }))
addAssertion('the peek closes after the pointer leaves the rail', peek.hiddenAfterLeave === true, JSON.stringify({ peek: afterRail.peek }))

// ---- annotated frames -----------------------------------------------------
const SCALE = 2
const origin = { x: CROP.x, y: CROP.y }
const dataUrl = (name) => `data:image/png;base64,${readFileSync(join(SHOTS, name)).toString('base64')}`
const escapeHtml = (value) => String(value).replace(/[&<>"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[char]))
const local = (box) => ({ x: (box.x - origin.x) * SCALE, y: (box.y - origin.y) * SCALE, w: box.w * SCALE, h: box.h * SCALE })
const boxHtml = (box, color) => {
  const b = local(box)
  return `<div class="box" style="left:${b.x}px;top:${b.y}px;width:${b.w}px;height:${b.h}px;border-color:${color}"></div>`
}
const lineHtml = (box, color) => {
  const b = local(box)
  return `<div class="vline" style="left:${b.x}px;top:0;height:${CROP.height * SCALE}px;background:${color}"></div>`
}
const caption = (frame) => {
  const c = frame.collapse
  return `${frame.label} · icon x=${c.icon.cx} · hover ${c.rect.w}×${c.rect.h} · peek=${frame.peek} · tooltip=${frame.tooltip ? '有' : '—'}`
}
const panel = (frame) => {
  const overlay =
    boxHtml(frame.search.rect, '#8e8e8e') +
    boxHtml(frame.collapse.rect, '#58d68d') +
    lineHtml({ x: frame.collapse.icon.cx, y: 0, w: 0, h: CROP.height }, '#ffd166') +
    (frame.tooltip ? boxHtml(frame.tooltip.rect, '#f5a623') : '')
  return `<section class="panel">
    <div class="shot" style="width:${CROP.width * SCALE}px;height:${CROP.height * SCALE}px">
      <img src="${dataUrl(frame.raw.split('/').pop())}" />
      ${overlay}
    </div>
    <p class="cap">${escapeHtml(caption(frame))}</p>
    <p class="sub">hover 背景 ${frame.collapse.style.background} · 旧选择器命中 ${frame.oldSelectorMatches} · :last-of-type 命中 ${frame.lastOfTypeMatches}</p>
  </section>`
}

const sheet = async (outName, title, note, frames, columns) => {
  const gap = 16
  const width = 22 * 2 + columns * CROP.width * SCALE + gap * (columns - 1)
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
    *{box-sizing:border-box} body{margin:0;padding:22px;background:#0b0b0b;color:#f2f2f2;font:13px/1.55 "PingFang SC","Noto Sans SC","Microsoft YaHei",sans-serif}
    h1{font-size:17px;margin:0 0 4px;font-weight:600} .note{color:#a9a9a9;margin:0 0 14px;max-width:${columns === 1 ? 520 : 1000}px}
    .grid{display:grid;grid-template-columns:repeat(${columns},max-content);gap:${gap}px}
    .panel{margin:0} .shot{position:relative;overflow:hidden;border:1px solid #2c2c2c;border-radius:6px;background:#000}
    .shot img{display:block;width:100%;height:100%}
    .box{position:absolute;border:1.5px solid;border-radius:3px}
    .vline{position:absolute;width:1px;opacity:.85}
    .cap{margin:6px 0 0;font:11px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace;color:#eaeaea;white-space:normal;overflow-wrap:anywhere}
    .sub{margin:2px 0 0;font:10px/1.45 ui-monospace,SFMono-Regular,Menlo,monospace;color:#9f9f9f;white-space:normal;overflow-wrap:anywhere}
    code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;color:#c9d7ff}
  </style></head><body><h1>${escapeHtml(title)}</h1><p class="note">${note}</p><div class="grid">${frames.map(panel).join('')}</div></body></html>`
  const sheetContext = await browser.newContext({ viewport: { width, height: 200 }, deviceScaleFactor: 1, colorScheme: 'dark' })
  const sheetPage = await sheetContext.newPage()
  await sheetPage.setContent(html, { waitUntil: 'load' })
  await sheetPage.waitForTimeout(100)
  await sheetPage.screenshot({ path: join(SHOTS, outName), fullPage: true })
  await sheetContext.close()
}

const note = '宿主在悬停约 500ms 时把 &lt;span role="tooltip"&gt; 追加为 header 最后一个子节点；旧的 <code>> button:last-child</code> 立刻失配，36×36 规则整体掉落，按钮回落到宿主 28×28（图标 x 306→310、高亮 36→28）。改用 <code>:last-of-type</code> 后，tooltip 出现前后四帧几何完全不变。绿框=收起按钮，灰框=搜索，黄线=图标中心 x=306，橙框=tooltip。'
for (const [index, frame] of frames.entries()) {
  await sheet(`m36-hover-${frame.label}.png`, `P0-19d · 收起侧边栏悬停 ${frame.label}（220×64 CSS，2×）`, '色块：绿=收起按钮，灰=搜索，黄线=图标中心 x，橙=tooltip。', [frame], 1)
}
await sheet('m36-hover.png', 'P0-19d · 收起侧边栏悬停四帧：图标 x 与高亮尺寸恒定', note, frames, 2)

const failed = assertions.filter((entry) => entry.ok !== true)
const evidence = {
  task: 'P0-19d',
  url: redact(url),
  capturedAt: new Date().toISOString(),
  viewport: { width: 1233, height: 850, deviceScaleFactor: 2 },
  crop: CROP,
  frames,
  constant: { icon: iconConstant, hoverBox: hoverBoxConstant },
  rootCause: {
    confirmed: true,
    isPeek: false,
    file: 'lib/client/css/20-sidebar.css',
    line: 54,
    lineNote: 'pre-fix line of the failing selector (that spot now holds the explanatory comment; the fixed rule is just below)',
    selector: "body[data-chatgpt-ui] [data-slot='sidebar'] [data-window-drag] > button:last-child",
    trigger: 'the host appends <span role="tooltip" class="_bubble_…"> as the last child of the header logo row after ~500ms of hover',
    effect: 'the selector stops matching at that instant, the pinned 36×36 rules drop, and the toggle falls back to the host 28×28 box: button x 288→296, icon x 306→310, highlight 36→28',
    runtimeProof: 'frames 0/200ms oldSelectorMatches=1; frames 700/1500ms oldSelectorMatches=0 while lastOfTypeMatches=1',
    fix: "use `> button:last-of-type` in the four CSS rules and in the rail.js toggle fallback",
    railFallback: 'lib/client/rail.js:253'
  },
  beforeFix: {
    source: 'pre-fix build, same page, hover 700ms (scratch probe)',
    button: { x: 296, y: 12, w: 28, h: 28 },
    icon: { cx: 310, cy: 26 },
    highlight: { w: 28, h: 28 }
  },
  peek,
  assertions,
  summary: { total: assertions.length, passed: assertions.length - failed.length, failed: failed.map((entry) => entry.id) },
  screenshots: [
    'docs/screenshots/m36-hover-0ms.png',
    'docs/screenshots/m36-hover-200ms.png',
    'docs/screenshots/m36-hover-700ms.png',
    'docs/screenshots/m36-hover-1500ms.png',
    'docs/screenshots/m36-hover.png',
    'docs/screenshots/m36-rail-peek.png'
  ],
  errors
}
writeFileSync(join(OUT, 'm36.json'), `${JSON.stringify(evidence, null, 2)}\n`)
console.log(`docs/m36.json — ${evidence.summary.passed}/${evidence.summary.total} assertions passed, ${errors.length} page errors`)
await browser.close()
process.exit(failed.length === 0 ? 0 : 1)
