#!/usr/bin/env node
/**
 * tools/m37-capture.mjs — P0-19e: the ⋯ hover plate and the panel anchor.
 *
 *   node tools/m37-capture.mjs --url "http://127.0.0.1:3116/?token=…" [--out docs]
 *
 * Two fixes are measured on the same isolated instance:
 *   1. the 28×28 hover plate and its 14px glyph are concentric — the glyph's
 *      centre is compared with the plate's centre on both ⋯ paths
 *      (project row and session row), and the plate is compared with the
 *      sidebar's other 28×28 small buttons;
 *   2. the panel's top edge sits on the row's top edge; when the panel would
 *      overflow the viewport's 8px bottom margin it flips to bottom-edge
 *      alignment (panel bottom = row bottom). The same page is re-opened at
 *      440px height to drive both flip cases (project: the last row; session:
 *      the 最近 row).
 *
 * Writes docs/m37.json and docs/screenshots/m37-*.png. The hover zoom is shot
 * at deviceScaleFactor 4 so a 48px clip is a 192px 1:1 4× enlargement.
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
  console.error('usage: node tools/m37-capture.mjs --url <tokenised-url> [--out docs]')
  process.exit(2)
}
const OUT = resolve(ROOT, typeof args.get('out') === 'string' ? args.get('out') : 'docs')
const SHOTS = join(OUT, 'screenshots')
const CAPTURE = join(OUT, 'capture', 'm37')
mkdirSync(SHOTS, { recursive: true })
mkdirSync(CAPTURE, { recursive: true })

const playwrightPath = process.env.M37_PLAYWRIGHT ?? '/mnt/f/project/y86/node_modules/playwright/index.mjs'
const CHROME = process.env.CHATGPT_UI_CHROME ?? '/home/user/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome'
const { chromium } = await import(playwrightPath)

const round = (value) => Math.round(value * 100) / 100
const redact = (value) => value.replace(/([?&]token=)[^&]+/, '$1***')
const tokensCss = readFileSync(join(ROOT, 'lib/client/css/05-cgpt-tokens.css'), 'utf8')
const sessionsCss = readFileSync(join(ROOT, 'lib/client/css/25-sessions.css'), 'utf8')
const sidebarActionSize = Number((tokensCss.match(/--cgpt-sidebar-action-size:\s*(\d+)px/) ?? [])[1])
const iconSize = Number((tokensCss.match(/--cgpt-session-action-icon:\s*(\d+)px/) ?? [])[1])

const errors = []
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

const openPage = async ({ height = 850, dpr = 2 } = {}) => {
  const context = await browser.newContext({
    viewport: { width: 1233, height },
    deviceScaleFactor: dpr,
    locale: 'zh-CN',
    colorScheme: 'dark'
  })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(String(error).slice(0, 300)))
  await page.goto(url, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1300)
  const notice = page.getByRole('button', { name: /继续|Continue/ })
  if ((await notice.count()) > 0) {
    await notice.first().click()
    await page.waitForTimeout(350)
  }
  await page.evaluate(() => {
    const dialog = document.querySelector('._dialog_o6lrb_33')
    if (dialog !== null) dialog.querySelector('button')?.click()
  })
  await page.waitForTimeout(350)
  return { context, page, errors }
}

const hoverInfo = (page, selector) =>
  page.evaluate((sel) => {
    const button = document.querySelector(sel)
    if (button === null) return null
    const roundValue = (value) => Math.round(value * 100) / 100
    const plate = button.getBoundingClientRect()
    const style = getComputedStyle(button)
    const svg = button.querySelector('svg')
    const icon = svg.getBoundingClientRect()
    const ink = svg.querySelector('path')?.getBoundingClientRect() ?? null
    const token = getComputedStyle(document.body).getPropertyValue('--cgpt-sidebar-action-size').trim()
    return {
      plate: {
        x: roundValue(plate.x),
        y: roundValue(plate.y),
        w: roundValue(plate.width),
        h: roundValue(plate.height),
        cx: roundValue(plate.x + plate.width / 2),
        cy: roundValue(plate.y + plate.height / 2),
        radius: style.borderRadius,
        background: style.backgroundColor
      },
      icon: {
        w: roundValue(icon.width),
        h: roundValue(icon.height),
        cx: roundValue(icon.x + icon.width / 2),
        cy: roundValue(icon.y + icon.height / 2),
        viewBox: svg.getAttribute('viewBox'),
        paths: svg.querySelectorAll('path').length,
        display: getComputedStyle(svg).display
      },
      ink: ink === null ? null : { w: roundValue(ink.width), h: roundValue(ink.height), cx: roundValue(ink.x + ink.width / 2), cy: roundValue(ink.y + ink.height / 2) },
      deviation: {
        x: roundValue(icon.x + icon.width / 2 - (plate.x + plate.width / 2)),
        y: roundValue(icon.y + icon.height / 2 - (plate.y + plate.height / 2))
      },
      token,
      boxSizing: style.boxSizing,
      display: style.display
    }
  }, selector)

const menuState = (page, menuSelector, rowSelector) =>
  page.evaluate(([menuSel, rowSel]) => {
    const menu = document.querySelector(menuSel)
    const row = document.querySelector(rowSel)
    if (menu === null || row === null) return null
    const roundValue = (value) => Math.round(value * 100) / 100
    const m = menu.getBoundingClientRect()
    const r = row.getBoundingClientRect()
    const trigger = document.querySelector(rowSel)?.querySelector('[data-cgpt-row-more], .chatgpt-project-more')?.getBoundingClientRect() ?? null
    const viewH = window.innerHeight
    return {
      viewH,
      row: { top: roundValue(r.top), bottom: roundValue(r.bottom), h: roundValue(r.height) },
      menu: { top: roundValue(m.top), bottom: roundValue(m.bottom), h: roundValue(m.height), left: roundValue(m.left), width: roundValue(m.width) },
      trigger: trigger === null ? null : { left: roundValue(trigger.left), right: roundValue(trigger.right), bottom: roundValue(trigger.bottom) },
      deltaTop: roundValue(m.top - r.top),
      deltaBottom: roundValue(m.bottom - r.bottom),
      align: Math.abs(m.top - r.top) <= 1 ? 'top' : Math.abs(m.bottom - r.bottom) <= 1 ? 'bottom' : 'other',
      fullyVisible: m.top >= 8 && m.bottom <= viewH - 8,
      triggerCovered: trigger !== null && m.left < trigger.right - 0.5 && m.right > trigger.left + 0.5 && m.top < trigger.bottom - 0.5
    }
  }, [menuSelector, rowSelector])

const hoverCrop = (plate) => ({ x: plate.x - 10, y: plate.y - 10, width: 48, height: 48 })
const covered = (menu, trigger) =>
  trigger !== null && trigger !== undefined && menu.left < trigger.right - 0.5 && menu.left + menu.width > trigger.left + 0.5 && menu.top < trigger.bottom - 0.5

// ---- 1. hover plate, 4× zoom ------------------------------------------------
const zoom = await openPage({ dpr: 4 })
const zoomPage = zoom.page
errors.push(...zoom.errors)
await zoomPage.locator('[data-cgpt-project-head]').first().hover()
await zoomPage.waitForTimeout(300)
await zoomPage.locator('[data-cgpt-project-head] .chatgpt-project-more').first().hover()
await zoomPage.waitForTimeout(300)
const projectHover = await hoverInfo(zoomPage, '[data-cgpt-project-head] .chatgpt-project-more')
const projectHoverCrop = hoverCrop(projectHover.plate)
await zoomPage.screenshot({ path: join(CAPTURE, 'm37-project-hover-raw.png'), clip: projectHoverCrop })

await zoomPage.locator('[data-cgpt-session-row]').first().hover()
await zoomPage.waitForTimeout(300)
await zoomPage.locator('[data-cgpt-row-more]').first().hover()
await zoomPage.waitForTimeout(300)
const sessionHover = await hoverInfo(zoomPage, '[data-cgpt-row-more]')
const sessionHoverCrop = hoverCrop(sessionHover.plate)
await zoomPage.screenshot({ path: join(CAPTURE, 'm37-session-hover-raw.png'), clip: sessionHoverCrop })

addAssertion(
  'project ⋯: plate is the sidebar 28×28 small button and the 14px glyph is concentric (|Δ| ≤ 0.5px)',
  projectHover.plate.w === sidebarActionSize &&
    projectHover.plate.h === sidebarActionSize &&
    projectHover.icon.w === iconSize &&
    projectHover.icon.h === iconSize &&
    Math.abs(projectHover.deviation.x) <= 0.5 &&
    Math.abs(projectHover.deviation.y) <= 0.5,
  JSON.stringify({ plate: projectHover.plate, icon: projectHover.icon, deviation: projectHover.deviation })
)
addAssertion(
  'session ⋯: same plate and glyph, concentric (|Δ| ≤ 0.5px)',
  sessionHover.plate.w === sidebarActionSize &&
    sessionHover.plate.h === sidebarActionSize &&
    sessionHover.icon.w === iconSize &&
    sessionHover.icon.h === iconSize &&
    Math.abs(sessionHover.deviation.x) <= 0.5 &&
    Math.abs(sessionHover.deviation.y) <= 0.5,
  JSON.stringify({ plate: sessionHover.plate, icon: sessionHover.icon, deviation: sessionHover.deviation })
)
addAssertion(
  'both paths use the same plate/glyph numbers and the same hover background',
  projectHover.plate.w === sessionHover.plate.w &&
    projectHover.plate.h === sessionHover.plate.h &&
    projectHover.icon.w === sessionHover.icon.w &&
    projectHover.icon.h === sessionHover.icon.h &&
    projectHover.plate.background === sessionHover.plate.background &&
    projectHover.plate.radius === sessionHover.plate.radius &&
    projectHover.icon.viewBox === sessionHover.icon.viewBox,
  JSON.stringify({ project: projectHover.plate, session: sessionHover.plate })
)
await zoom.context.close()

// ---- 2. top-edge alignment (850px tall) ------------------------------------
const tall = await openPage({ height: 850 })
const page = tall.page
errors.push(...tall.errors)
const heads = page.locator('[data-cgpt-project-head]')
const headCount = await heads.count()
const projectHead = heads.nth(headCount - 1)
await projectHead.hover()
await page.waitForTimeout(300)
await projectHead.locator('.chatgpt-project-more').click()
await page.waitForTimeout(300)
const projectTop = await menuState(page, '.chatgpt-project-hover-menu', '[data-cgpt-project-head]')
// The row selector above resolves inside the last project wrapper; take the
// measured row from the element we actually hovered to stay independent of DOM
// nesting details.
const projectTopRow = await (async () => {
  const box = await projectHead.boundingBox()
  const state = projectTop
  return {
    ...state,
    row: { top: round(box.y), bottom: round(box.y + box.height), h: round(box.height) },
    deltaTop: round(state.menu.top - box.y),
    align: Math.abs(state.menu.top - box.y) <= 1 ? 'top' : 'other'
  }
})()
await page.screenshot({ path: join(CAPTURE, 'm37-project-top-raw.png'), clip: { x: 0, y: 0, width: 640, height: 560 } })
await page.keyboard.press('Escape')
await page.waitForTimeout(250)

const sessionRow = page.locator('[data-cgpt-session-row]').first()
await sessionRow.hover()
await page.waitForTimeout(300)
await page.locator('[data-cgpt-row-more]').first().click()
await page.waitForTimeout(300)
const sessionTop = await menuState(page, '.chatgpt-session-menu[data-cgpt-session-menu="session"]', '[data-cgpt-session-row]')
await page.screenshot({ path: join(CAPTURE, 'm37-session-top-raw.png'), clip: { x: 0, y: 0, width: 640, height: 560 } })

addAssertion(
  'default anchoring: the panel top equals the row top on both paths (|Δ| ≤ 1px)',
  Math.abs(projectTopRow.deltaTop) <= 1 && projectTopRow.align === 'top' && Math.abs(sessionTop.deltaTop) <= 1 && sessionTop.align === 'top',
  JSON.stringify({ project: projectTopRow, session: sessionTop })
)
await tall.context.close()

// ---- 3. bottom-edge flip (440px tall) --------------------------------------
const short = await openPage({ height: 440 })
const shortPage = short.page
errors.push(...short.errors)
const shortHeads = shortPage.locator('[data-cgpt-project-head]')
const shortHeadCount = await shortHeads.count()
const flipHead = shortHeads.nth(shortHeadCount - 1)
await flipHead.hover()
await shortPage.waitForTimeout(300)
await flipHead.locator('.chatgpt-project-more').click()
await shortPage.waitForTimeout(300)
const flipHeadBox = await flipHead.boundingBox()
const projectFlipBase = await menuState(shortPage, '.chatgpt-project-hover-menu', '[data-cgpt-project-head]')
const flipMoreBox = await flipHead.locator('.chatgpt-project-more').boundingBox()
const flipTrigger = { left: round(flipMoreBox.x), right: round(flipMoreBox.x + flipMoreBox.width), bottom: round(flipMoreBox.y + flipMoreBox.height) }
const projectFlip = {
  ...projectFlipBase,
  row: { top: round(flipHeadBox.y), bottom: round(flipHeadBox.y + flipHeadBox.height), h: round(flipHeadBox.height) },
  trigger: flipTrigger,
  deltaBottom: round(projectFlipBase.menu.bottom - (flipHeadBox.y + flipHeadBox.height)),
  align: Math.abs(projectFlipBase.menu.bottom - (flipHeadBox.y + flipHeadBox.height)) <= 1 ? 'bottom' : 'other',
  triggerCovered: covered(projectFlipBase.menu, flipTrigger)
}
await shortPage.screenshot({ path: join(CAPTURE, 'm37-project-flip-raw.png'), clip: { x: 0, y: 0, width: 640, height: 440 } })
await shortPage.keyboard.press('Escape')
await shortPage.waitForTimeout(250)

const recentRow = shortPage.locator('[data-cgpt-session-row]').last()
await recentRow.hover()
await shortPage.waitForTimeout(300)
const recentBox = await recentRow.boundingBox()
await shortPage.locator('[data-cgpt-row-more]').last().click()
await shortPage.waitForTimeout(300)
const sessionFlipBase = await menuState(shortPage, '.chatgpt-session-menu[data-cgpt-session-menu="session"]', '[data-cgpt-session-row]')
const recentMoreBox = await shortPage.locator('[data-cgpt-row-more]').last().boundingBox()
const sessionFlipTrigger = { left: round(recentMoreBox.x), right: round(recentMoreBox.x + recentMoreBox.width), bottom: round(recentMoreBox.y + recentMoreBox.height) }
const sessionFlip = {
  ...sessionFlipBase,
  row: { top: round(recentBox.y), bottom: round(recentBox.y + recentBox.height), h: round(recentBox.height) },
  trigger: sessionFlipTrigger,
  deltaBottom: round(sessionFlipBase.menu.bottom - (recentBox.y + recentBox.height)),
  align: Math.abs(sessionFlipBase.menu.bottom - (recentBox.y + recentBox.height)) <= 1 ? 'bottom' : 'other',
  triggerCovered: covered(sessionFlipBase.menu, sessionFlipTrigger)
}
await shortPage.screenshot({ path: join(CAPTURE, 'm37-session-flip-raw.png'), clip: { x: 0, y: 0, width: 640, height: 440 } })

addAssertion(
  'near the bottom both panels flip to bottom-edge alignment (|Δ| ≤ 1px), stay fully visible and clear of the trigger',
  projectFlip.align === 'bottom' &&
    sessionFlip.align === 'bottom' &&
    Math.abs(projectFlip.deltaBottom) <= 1 &&
    Math.abs(sessionFlip.deltaBottom) <= 1 &&
    projectFlip.fullyVisible &&
    sessionFlip.fullyVisible &&
    projectFlip.triggerCovered === false &&
    sessionFlip.triggerCovered === false,
  JSON.stringify({ project: projectFlip, session: sessionFlip })
)
addAssertion(
  'the flip only fires when the panel would cross the bottom margin (top-align case really fits)',
  projectTopRow.menu.bottom < projectTopRow.viewH - 8 && sessionTop.menu.bottom < sessionTop.viewH - 8,
  JSON.stringify({ project: projectTopRow.menu, session: sessionTop.menu, viewH: projectTopRow.viewH })
)
await short.context.close()

// ---- 4. annotated sheets ----------------------------------------------------
const dataUrl = (name) => `data:image/png;base64,${readFileSync(join(CAPTURE, name)).toString('base64')}`
const escapeHtml = (value) => String(value).replace(/[&<>"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[char]))
const crosshair = (x, y, scale, color = '#4c8dff') =>
  `<div class="vline" style="left:${x * scale}px;border-left-color:${color}"></div>` +
  `<div class="hline" style="top:${y * scale}px;border-top-color:${color}"></div>` +
  `<div class="dot" style="left:${x * scale}px;top:${y * scale}px;border-color:${color}"></div>`
const guide = (y, scale, color, label, side = 'right') =>
  `<div class="guide" style="top:${y * scale}px;border-top-color:${color}"></div><div class="glabel ${side}" style="top:${y * scale + 2}px;color:${color}">${escapeHtml(label)}</div>`

const sheet = async (outName, title, note, panels, extra = []) => {
  const gap = 18
  const width = Math.max(720, 44 + panels.reduce((sum, panel) => sum + panel.cssW, 0) + gap * (panels.length - 1))
  const legend = [...panels.flatMap((panel) => panel.legend), ...extra]
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
    *{box-sizing:border-box} body{margin:0;padding:22px;background:#0b0b0b;color:#f2f2f2;font:13px/1.5 "PingFang SC","Noto Sans SC","Microsoft YaHei",sans-serif}
    h1{font-size:18px;margin:0 0 4px;font-weight:600} .note{color:#a9a9a9;margin:0 0 16px}
    .row{display:flex;gap:${gap}px;align-items:flex-start}
    .panel{margin:0} .panel h2{font-size:13px;font-weight:600;margin:0 0 6px;color:#d6d6d6}
    .shot{position:relative;overflow:hidden;border:1px solid #2c2c2c;border-radius:6px;background:#000}
    .shot img{display:block;width:100%;height:100%}
    .vline{position:absolute;top:0;bottom:0;border-left:1.5px dashed;pointer-events:none}
    .hline{position:absolute;left:0;right:0;border-top:1.5px dashed;pointer-events:none}
    .dot{position:absolute;width:12px;height:12px;border:1.8px solid;border-radius:50%;transform:translate(-50%,-50%);pointer-events:none}
    .guide{position:absolute;left:0;right:0;border-top:1.5px dashed;pointer-events:none}
    .glabel{position:absolute;font:10.5px/14px ui-monospace,Menlo,monospace;text-shadow:0 1px 2px #000}
    .glabel.right{right:6px} .glabel.left{left:6px}
    .legend{margin:12px 0 0;padding:0;list-style:none;color:#bdbdbd;font-size:11.5px;line-height:1.6;columns:2;column-gap:28px}
    .legend li{break-inside:avoid;margin:0 0 2px}
    code{font-family:ui-monospace,Menlo,monospace;color:#c9d7ff}
  </style></head><body><h1>${escapeHtml(title)}</h1><p class="note">${note}</p><div class="row">${panels
    .map(
      (panel) => `<section class="panel"><h2>${panel.caption}</h2><div class="shot" style="width:${panel.cssW}px;height:${panel.cssH}px"><img src="${dataUrl(panel.file)}" />${panel.overlay ?? ''}</div></section>`
    )
    .join('')}</div><ul class="legend">${legend.map((line) => `<li>${line}</li>`).join('')}</ul></body></html>`
  const context = await browser.newContext({ viewport: { width, height: 300 }, deviceScaleFactor: 1, colorScheme: 'dark' })
  const sheetPage = await context.newPage()
  await sheetPage.setContent(html, { waitUntil: 'load' })
  await sheetPage.waitForTimeout(120)
  await sheetPage.screenshot({ path: join(SHOTS, outName), fullPage: true })
  await context.close()
}

const hoverPanel = (caption, file, info, crop, scale) => {
  const cx = info.plate.cx - crop.x
  const cy = info.plate.cy - crop.y
  return {
    caption,
    file,
    cssW: 48 * scale,
    cssH: 48 * scale,
    overlay: crosshair(cx, cy, scale),
    legend: [
      `hover 底 <code>${info.plate.w}×${info.plate.h}</code> · 圆角 <code>${info.plate.radius}</code> · 背景 <code>${info.plate.background}</code>`,
      `图标 <code>${info.icon.w}×${info.icon.h}</code> · viewBox <code>${info.icon.viewBox}</code> · <code>display:${info.icon.display}</code>`,
      `中心偏差 Δx <code>${info.deviation.x}</code> · Δy <code>${info.deviation.y}</code>（阈值 ≤0.5px）`,
      `底盘尺寸取自 <code>--cgpt-sidebar-action-size: ${info.token}</code>`
    ]
  }
}

await sheet(
  'm37-project-hover-zoom.png',
  'P0-19e · 项目条目 ⋯ 悬停：28×28 底盘与 14px 三点同心（4× 放大，蓝十字 = 底盘中心）',
  `裁剪 ${projectHoverCrop.width}×${projectHoverCrop.height} CSS px，按 4× 输出（DPR 4 实拍 1:1）。` +
    ` 三点图标中心 = (<code>${projectHover.icon.cx}</code>, <code>${projectHover.icon.cy}</code>)，底盘中心 = (<code>${projectHover.plate.cx}</code>, <code>${projectHover.plate.cy}</code>)，偏差 <code>${projectHover.deviation.x} / ${projectHover.deviation.y}</code>。`,
  [hoverPanel('① 项目条目 ⋯（悬停高亮）', 'm37-project-hover-raw.png', projectHover, projectHoverCrop, 4)]
)

await sheet(
  'm37-session-hover-zoom.png',
  'P0-19e · 会话条目 ⋯ 悬停：同一 28×28 底盘、同一 14px 三点（4× 放大）',
  `与项目条目同尺寸、同圆角、同底色；三点图标中心 = (<code>${sessionHover.icon.cx}</code>, <code>${sessionHover.icon.cy}</code>)，底盘中心 = (<code>${sessionHover.plate.cx}</code>, <code>${sessionHover.plate.cy}</code>)，偏差 <code>${sessionHover.deviation.x} / ${sessionHover.deviation.y}</code>。`,
  [hoverPanel('② 会话条目 ⋯（悬停高亮）', 'm37-session-hover-raw.png', sessionHover, sessionHoverCrop, 4)]
)

await sheet(
  'm37-hover-compare.png',
  'P0-19e · 两条 ⋯ 路径并排：底盘、图标、偏差完全一致',
  `左：项目条目；右：会话条目。两处均为 <code>${sidebarActionSize}×${sidebarActionSize}</code> 底盘、<code>${iconSize}px</code> 图标、<code>${projectHover.plate.radius}</code> 圆角；中心偏差 <code>${projectHover.deviation.x}/${projectHover.deviation.y}</code> 与 <code>${sessionHover.deviation.x}/${sessionHover.deviation.y}</code>。`,
  [
    hoverPanel('项目条目 ⋯（4×）', 'm37-project-hover-raw.png', projectHover, projectHoverCrop, 4),
    hoverPanel('会话条目 ⋯（4×）', 'm37-session-hover-raw.png', sessionHover, sessionHoverCrop, 4)
  ]
)

await sheet(
  'm37-project-top-align.png',
  'P0-19e · 下方空间充足：面板上边缘 = 行上边缘（项目条目，2× 实拍）',
  `面板 top <code>${projectTopRow.menu.top}</code>，行 top <code>${projectTopRow.row.top}</code>，差值 <code>${projectTopRow.deltaTop}</code>；面板 bottom <code>${projectTopRow.menu.bottom}</code> < 视口底 − 8（<code>${projectTopRow.viewH - 8}</code>），因此保持上缘对齐。`,
  [
    {
      caption: `① 项目行（行高 ${projectTopRow.row.h}px）`,
      file: 'm37-project-top-raw.png',
      cssW: 640,
      cssH: 560,
      overlay:
        guide(projectTopRow.row.top, 1, '#58d68d', `行 top = ${projectTopRow.row.top}`, 'left') +
        guide(projectTopRow.menu.top, 1, '#4c8dff', `面板 top = ${projectTopRow.menu.top}`, 'right'),
      legend: [
        `Δtop = <code>${projectTopRow.deltaTop}px</code>（阈值 ≤1px，圆角修正 0px）`,
        `面板高 <code>${projectTopRow.menu.h}</code> · 面板底 <code>${projectTopRow.menu.bottom}</code> · 视口底 −8 = <code>${projectTopRow.viewH - 8}</code>`,
        `水平：面板 left <code>${projectTopRow.menu.left}</code> = 触发器 right + 8`
      ]
    }
  ]
)

await sheet(
  'm37-session-top-align.png',
  'P0-19e · 下方空间充足：面板上边缘 = 行上边缘（会话条目，2× 实拍）',
  `会话条目同一规则：面板 top <code>${sessionTop.menu.top}</code>，行 top <code>${sessionTop.row.top}</code>，差值 <code>${sessionTop.deltaTop}</code>；水平仍贴着 ⋯ 右侧 8px。`,
  [
    {
      caption: `② 会话行（行高 ${sessionTop.row.h}）`,
      file: 'm37-session-top-raw.png',
      cssW: 640,
      cssH: 560,
      overlay:
        guide(sessionTop.row.top, 1, '#58d68d', `行 top = ${sessionTop.row.top}`, 'left') +
        guide(sessionTop.menu.top, 1, '#4c8dff', `面板 top = ${sessionTop.menu.top}`, 'right'),
      legend: [
        `Δtop = <code>${sessionTop.deltaTop}px</code>（阈值 ≤1px）`,
        `面板高 <code>${sessionTop.menu.h}</code> · 面板底 <code>${sessionTop.menu.bottom}</code> · 视口底 −8 = <code>${sessionTop.viewH - 8}</code>`,
        `水平：面板 left <code>${sessionTop.menu.left}</code> = 触发器 right + 8`
      ]
    }
  ]
)

await sheet(
  'm37-project-bottom-flip.png',
  'P0-19e · 下方不足：翻转为下边缘对齐（项目条目，视口 440px）',
  `视口高 <code>${projectFlip.viewH}</code>：上缘对齐时面板底 <code>${projectFlip.row.top + projectFlip.menu.h}</code> 会越过 <code>${projectFlip.viewH - 8}</code>，因此翻转为面板底 = 行底。差值 <code>${projectFlip.deltaBottom}</code>，完整可见 <code>${projectFlip.fullyVisible}</code>，不遮挡 ⋯ <code>${projectFlip.triggerCovered === false}</code>。`,
  [
    {
      caption: `③ 项目行底 ${projectFlip.row.bottom}px`,
      file: 'm37-project-flip-raw.png',
      cssW: 640,
      cssH: 440,
      overlay:
        guide(projectFlip.row.bottom, 1, '#58d68d', `行 bottom = ${projectFlip.row.bottom}`, 'left') +
        guide(projectFlip.menu.bottom, 1, '#ffd166', `面板 bottom = ${projectFlip.menu.bottom}`, 'right'),
      legend: [
        `Δbottom = <code>${projectFlip.deltaBottom}px</code>（阈值 ≤1px）`,
        `面板 top <code>${projectFlip.menu.top}</code> ≥ 8，面板底 <code>${projectFlip.menu.bottom}</code> ≤ 视口 −8`,
        `触发器不被覆盖：面板 left <code>${projectFlip.menu.left}</code> ≥ 触发器 right <code>${projectFlip.trigger?.right}</code>`
      ]
    }
  ]
)

await sheet(
  'm37-session-bottom-flip.png',
  'P0-19e · 下方不足：翻转为下边缘对齐（会话条目，视口 440px）',
  `最近会话行同一阈值：面板底 <code>${sessionFlip.row.top + sessionFlip.menu.h}</code> > <code>${sessionFlip.viewH - 8}</code>，翻转后面板 bottom <code>${sessionFlip.menu.bottom}</code> = 行 bottom <code>${sessionFlip.row.bottom}</code>（差 <code>${sessionFlip.deltaBottom}</code>）。`,
  [
    {
      caption: `④ 会话行底 ${sessionFlip.row.bottom}px`,
      file: 'm37-session-flip-raw.png',
      cssW: 640,
      cssH: 440,
      overlay:
        guide(sessionFlip.row.bottom, 1, '#58d68d', `行 bottom = ${sessionFlip.row.bottom}`, 'left') +
        guide(sessionFlip.menu.bottom, 1, '#ffd166', `面板 bottom = ${sessionFlip.menu.bottom}`, 'right'),
      legend: [
        `Δbottom = <code>${sessionFlip.deltaBottom}px</code>（阈值 ≤1px）`,
        `面板 top <code>${sessionFlip.menu.top}</code> ≥ 8，面板底 <code>${sessionFlip.menu.bottom}</code> ≤ 视口 −8`,
        `触发器不被覆盖：面板 left <code>${sessionFlip.menu.left}</code> ≥ 触发器 right <code>${sessionFlip.trigger?.right}</code>`
      ]
    }
  ]
)

// ---- 5. evidence -----------------------------------------------------------
const failed = assertions.filter((entry) => entry.ok !== true)
const plateSpec = {
  token: `--cgpt-sidebar-action-size: ${sidebarActionSize}px`,
  iconToken: `--cgpt-session-action-icon: ${iconSize}px`,
  siblings: [
    '.chatgpt-chat-files { width: 28px; height: 28px; border-radius: 7px }',
    'project page action button { width: 28px; height: 28px }',
    'host sidebar inline action buttons: 28px'
  ],
  referenceCapture: 'docs/capture/live/project-menus.json measured the web build at 20×20; P0-19e supersedes it for the sidebar hover plate, the 14px glyph is unchanged'
}
const evidence = {
  task: 'P0-19e',
  url: redact(url),
  capturedAt: new Date().toISOString(),
  viewport: { width: 1233, heights: [850, 440], deviceScaleFactor: 2, zoomDeviceScaleFactor: 4 },
  hover: {
    project: { selector: '[data-cgpt-project-head] .chatgpt-project-more', ...projectHover },
    session: { selector: '[data-cgpt-row-more]', ...sessionHover },
    plateSpec,
    threshold: 0.5
  },
  alignment: {
    rule: {
      horizontal: 'trigger right + 8px; flips to the left when the right side has no room; clamped inside the viewport',
      vertical: 'panel top = row top (cornerCorrection 0px); when panel top + height > viewport height - 8 the panel flips to row bottom - height (bottom edge = row bottom)',
      margin: 8,
      cornerCorrection: 0,
      rowSource: 'the row element owning the trigger: [data-cgpt-project-head] / [data-cgpt-session-row]'
    },
    top: { project: projectTopRow, session: sessionTop },
    flip: { project: projectFlip, session: sessionFlip, triggerViewportHeight: 440 },
    flipThreshold: { rule: 'panel top + panel height > viewport height - margin', margin: 8, viewportHeights: [850, 440], allowedBottomAt440: 440 - 8 },
    threshold: 1,
    consistency: {
      plate: `project ${projectHover.plate.w}×${projectHover.plate.h} / session ${sessionHover.plate.w}×${sessionHover.plate.h}`,
      glyph: `project ${projectHover.icon.w}px / session ${sessionHover.icon.w}px`,
      centreDeviation: `project ${projectHover.deviation.x}/${projectHover.deviation.y} / session ${sessionHover.deviation.x}/${sessionHover.deviation.y}`,
      topAlign: `project ${projectTopRow.deltaTop}px / session ${sessionTop.deltaTop}px`,
      bottomAlign: `project ${projectFlip.deltaBottom}px / session ${sessionFlip.deltaBottom}px`,
      identical:
        projectHover.plate.w === sessionHover.plate.w &&
        projectHover.plate.h === sessionHover.plate.h &&
        projectHover.icon.w === sessionHover.icon.w &&
        projectHover.icon.h === sessionHover.icon.h &&
        projectHover.deviation.x === sessionHover.deviation.x &&
        projectHover.deviation.y === sessionHover.deviation.y &&
        Math.abs(projectTopRow.deltaTop) <= 1 &&
        Math.abs(sessionTop.deltaTop) <= 1 &&
        projectFlip.align === 'bottom' &&
        sessionFlip.align === 'bottom'
    }
  },
  assertions,
  summary: { total: assertions.length, passed: assertions.length - failed.length, failed: failed.map((entry) => entry.id) },
  screenshots: [
    'docs/screenshots/m37-project-hover-zoom.png',
    'docs/screenshots/m37-session-hover-zoom.png',
    'docs/screenshots/m37-hover-compare.png',
    'docs/screenshots/m37-project-top-align.png',
    'docs/screenshots/m37-session-top-align.png',
    'docs/screenshots/m37-project-bottom-flip.png',
    'docs/screenshots/m37-session-bottom-flip.png'
  ],
  errors
}
writeFileSync(join(OUT, 'm37.json'), `${JSON.stringify(evidence, null, 2)}\n`)
console.log(`docs/m37.json — ${evidence.summary.passed}/${evidence.summary.total} assertions passed, ${errors.length} page errors`)
await browser.close()
process.exit(failed.length === 0 ? 0 : 1)
