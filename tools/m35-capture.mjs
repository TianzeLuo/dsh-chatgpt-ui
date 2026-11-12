#!/usr/bin/env node
/**
 * tools/m35-capture.mjs — P0-19c: two-way project 置顶, the removed 分区 row and
 * the project/session ⋯ menu alignment.
 *
 *   node tools/m35-capture.mjs --url "http://127.0.0.1:3116/?token=…" [--out docs]
 *
 * One isolated DSH instance with three seeded projects drives every state:
 *   1. project ⋯ menu, unpinned → 置顶 + hollow pin
 *   2. click 置顶 → the project moves to the front (Gamma), reload → still first
 *   3. project ⋯ menu, pinned → 取消置顶 + pin-with-slash (the attachment glyph)
 *   4. click 取消置顶 → host order restored, label/glyph back to 置顶
 *   5. session ⋯ menu, unpinned (hollow pin) and pinned (solid-centre pin)
 *   6. the two menus compared field by field: every geometry value is equal
 *
 * Writes docs/m35.json and docs/screenshots/m35-*.png. The annotated sheets are
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
  console.error('usage: node tools/m35-capture.mjs --url <tokenised-url> [--out docs]')
  process.exit(2)
}
const OUT = resolve(ROOT, typeof args.get('out') === 'string' ? args.get('out') : 'docs')
const SHOTS = join(OUT, 'screenshots')
const CAPTURE = join(OUT, 'capture', 'm35')
mkdirSync(SHOTS, { recursive: true })
mkdirSync(CAPTURE, { recursive: true })

const playwrightPath = process.env.M35_PLAYWRIGHT ?? 'playwright'
const CHROME = process.env.CHATGPT_UI_CHROME ?? process.env.HOME + '/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome'
const { chromium } = await import(playwrightPath)

const round = (value) => Math.round(value * 100) / 100
const redact = (value) => value.replace(/([?&]token=)[^&]+/, '$1***')

// The generated glyph table is the single source of truth for the two pin
// variants; the capture compares the live SVG path data against it.
const MENU_ICONS_JS = readFileSync(join(ROOT, 'lib/client/menu-icons.js'), 'utf8')
const iconOf = (key) => {
  const start = MENU_ICONS_JS.indexOf(`  ${key}: {`)
  if (start < 0) throw new Error(`icon ${key} not found`)
  const block = MENU_ICONS_JS.slice(start, MENU_ICONS_JS.indexOf('\n  },', start))
  const origin = (block.match(/origin: ("(?:[^"\\]|\\.)*")/) ?? [])[1]
  const svgLiteral = (block.match(/svg: ("(?:[^"\\]|\\.)*")/) ?? [])[1]
  const svg = JSON.parse(svgLiteral)
  return {
    key,
    origin: origin === undefined ? '' : JSON.parse(origin),
    viewBox: (svg.match(/viewBox="([^"]+)"/) ?? [])[1],
    paths: [...svg.matchAll(/\sd="([^"]+)"/g)].map((match) => match[1]),
    size: Number((svg.match(/width="(\d+)"/) ?? [])[1])
  }
}
const pathKey = (svgMarkup) => [...String(svgMarkup).matchAll(/\sd="([^"]+)"/g)].map((match) => match[1]).join('|')
const GLYPHS = { pinOutline: iconOf('pinOutline'), pinSolid: iconOf('pinSolid'), unpin: iconOf('unpin') }

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
  // The first-run onboarding dialog sits above the sidebar; close it.
  await page.evaluate(() => {
    const dialog = document.querySelector('._dialog_o6lrb_33')
    if (dialog !== null) dialog.querySelector('button')?.click()
  })
  await page.waitForTimeout(350)
}
await dismissNotice()

const projectOrder = () =>
  page.evaluate(() => [...document.querySelectorAll('[data-cgpt-project-row]')].map((node) => node.textContent.trim()))

/** One menu's computed geometry, rows and glyphs, read from the live DOM. */
const menuGeometry = (selector) =>
  page.evaluate((sel) => {
    const menu = document.querySelector(sel)
    if (menu === null) return null
    const roundValue = (value) => Math.round(value * 100) / 100
    const cs = getComputedStyle(menu)
    const box = menu.getBoundingClientRect()
    const readItem = (node) => {
      const style = getComputedStyle(node)
      const rect = node.getBoundingClientRect()
      const icon = node.querySelector('.chatgpt-session-menu-icon')
      const iconBox = icon === null ? null : icon.getBoundingClientRect()
      const svg = icon === null ? null : icon.querySelector('svg')
      const svgBox = svg === null ? null : svg.getBoundingClientRect()
      const label = node.querySelector('.chatgpt-session-menu-label')
      return {
        label: label === null ? '' : label.textContent,
        height: roundValue(rect.height),
        width: roundValue(rect.width),
        padding: style.padding,
        gap: style.gap,
        radius: style.borderRadius,
        fontSize: style.fontSize,
        lineHeight: style.lineHeight,
        iconSlot: iconBox === null ? null : [roundValue(iconBox.width), roundValue(iconBox.height)],
        iconSize: svgBox === null ? null : [roundValue(svgBox.width), roundValue(svgBox.height)],
        iconViewBox: svg === null ? null : svg.getAttribute('viewBox'),
        iconPaths: svg === null ? '' : [...svg.querySelectorAll('[d]')].map((node) => node.getAttribute('d')).join('|'),
        iconHtml: svg === null ? '' : svg.outerHTML
      }
    }
    const items = [...menu.querySelectorAll('.chatgpt-session-menu-item')].map(readItem)
    const separator = menu.querySelector('.chatgpt-session-menu-separator')
    const separatorStyle = separator === null ? null : getComputedStyle(separator)
    const separatorBox = separator === null ? null : separator.getBoundingClientRect()
    return {
      rect: {
        x: roundValue(box.x),
        y: roundValue(box.y),
        w: roundValue(box.width),
        h: roundValue(box.height),
        cx: roundValue(box.x + box.width / 2),
        cy: roundValue(box.y + box.height / 2)
      },
      style: {
        width: cs.width,
        minWidth: cs.minWidth,
        padding: cs.padding,
        gap: cs.gap,
        borderRadius: cs.borderRadius,
        background: cs.backgroundColor,
        backdropFilter: cs.backdropFilter,
        boxShadow: cs.boxShadow,
        fontSize: cs.fontSize,
        lineHeight: cs.lineHeight
      },
      items,
      separator:
        separator === null
          ? null
          : {
              height: roundValue(separatorBox.height),
              width: roundValue(separatorBox.width),
              padding: separatorStyle.padding,
              margin: separatorStyle.margin
            }
    }
  }, selector)

const triggerFromBox = (box) => ({
  x: round(box.x),
  y: round(box.y),
  w: round(box.width),
  h: round(box.height),
  cx: round(box.x + box.width / 2),
  cy: round(box.y + box.height / 2),
  right: round(box.x + box.width)
})

const openProjectMenu = async (index) => {
  const head = page.locator('[data-cgpt-project-head]').nth(index)
  await head.hover()
  await page.waitForTimeout(350)
  const more = head.locator('.chatgpt-project-more')
  const box = await more.boundingBox()
  const row = triggerFromBox(await head.boundingBox())
  await more.click()
  await page.waitForTimeout(350)
  return { trigger: triggerFromBox(box), row }
}

const closeMenu = async () => {
  await page.keyboard.press('Escape')
  await page.waitForTimeout(250)
  await page.mouse.move(760, 700)
  await page.waitForTimeout(250)
}

const clip = (name, box) => page.screenshot({ path: join(CAPTURE, name), clip: box })
const shot = (name, box) => page.screenshot({ path: join(SHOTS, name), clip: box })

// ---- 1. project menu, unpinned -------------------------------------------
const orderBefore = await projectOrder()
const projectOpen = await openProjectMenu(1) // Beta: pinning it must move it to the front
const projectTrigger = projectOpen.trigger
const projectUnpinned = await menuGeometry('.chatgpt-project-hover-menu')
await clip('m35-project-unpinned-raw.png', { x: 0, y: 0, width: 620, height: 560 })
await shot('m35-project-menu-unpinned.png', { x: 0, y: 0, width: 620, height: 560 })

const projectLabels = projectUnpinned.items.map((item) => item.label)
addAssertion(
  'the project ⋯ menu no longer contains 分区 (five rows, no dead disabled item)',
  projectLabels.join(',') === '置顶,编辑,在资源管理器中打开,归档聊天,移除项目',
  JSON.stringify(projectLabels)
)
addAssertion(
  'unpinned project menu shows 置顶 with the hollow pin sprite',
  projectUnpinned.items[0].label === '置顶' &&
    projectUnpinned.items[0].iconPaths === GLYPHS.pinOutline.paths.join('|') &&
    projectUnpinned.items[0].iconViewBox === GLYPHS.pinOutline.viewBox,
  JSON.stringify({ label: projectUnpinned.items[0].label, viewBox: projectUnpinned.items[0].iconViewBox, size: projectUnpinned.items[0].iconSize })
)

// ---- 2. pin the project: two-way + order + persistence --------------------
const pinButton = page.locator('[data-cgpt-project-menu-item="pin-project"]')
await pinButton.click()
await page.waitForTimeout(600)
const orderAfterPin = await projectOrder()
const storedAfterPin = await page.evaluate(() => window.localStorage.getItem('dsh-chatgpt-ui:pinned-projects'))
await page.screenshot({ path: join(CAPTURE, 'm35-order-pinned-raw.png'), clip: { x: 0, y: 90, width: 620, height: 420 } })
await shot('m35-pin-order.png', { x: 0, y: 90, width: 620, height: 420 })
addAssertion(
  '置顶 moves the project to the front (Beta was second, is now first)',
  orderAfterPin[0] === orderBefore[1] && orderAfterPin.join(',') !== orderBefore.join(','),
  JSON.stringify({ before: orderBefore, after: orderAfterPin })
)
addAssertion(
  'the pinned flag is persisted under dsh-chatgpt-ui:pinned-projects',
  typeof storedAfterPin === 'string' && JSON.parse(storedAfterPin).length === 1,
  storedAfterPin
)

// Pinned menu state, without leaving the page.
const projectPinnedTrigger = (await openProjectMenu(0)).trigger // Beta is now the first project
const projectPinned = await menuGeometry('.chatgpt-project-hover-menu')
await clip('m35-project-pinned-raw.png', { x: 0, y: 0, width: 620, height: 560 })
await shot('m35-project-menu-pinned.png', { x: 0, y: 0, width: 620, height: 560 })
addAssertion(
  'pinned project menu flips to 取消置顶 with the pin + slash glyph (the attachment glyph)',
  projectPinned.items[0].label === '取消置顶' &&
    projectPinned.items[0].iconPaths === GLYPHS.unpin.paths.join('|') &&
    projectPinned.items[0].iconViewBox === GLYPHS.unpin.viewBox,
  JSON.stringify({ label: projectPinned.items[0].label, viewBox: projectPinned.items[0].iconViewBox, expected: GLYPHS.unpin.viewBox })
)
await closeMenu()

// Reload: the order and the label survive.
await page.reload({ waitUntil: 'networkidle' })
await page.waitForTimeout(1300)
await dismissNotice()
const orderAfterReload = await projectOrder()
addAssertion(
  'the pinned project is still first after a reload (state is durable)',
  orderAfterReload[0] === orderAfterPin[0],
  JSON.stringify({ before: orderAfterPin, after: orderAfterReload })
)
await openProjectMenu(0)
const projectPinnedReload = await menuGeometry('.chatgpt-project-hover-menu')
addAssertion(
  'after reload the menu still reads 取消置顶 (two-way state, not a one-shot host reorder)',
  projectPinnedReload.items[0].label === '取消置顶' &&
    projectPinnedReload.items[0].iconPaths === GLYPHS.unpin.paths.join('|'),
  JSON.stringify({ label: projectPinnedReload.items[0].label })
)

// ---- 3. unpin restores the host order ------------------------------------
await page.locator('[data-cgpt-project-menu-item="pin-project"]').click()
await page.waitForTimeout(600)
const orderAfterUnpin = await projectOrder()
const storedAfterUnpin = await page.evaluate(() => window.localStorage.getItem('dsh-chatgpt-ui:pinned-projects'))
addAssertion(
  '取消置顶 puts the project back into the host order (reversible)',
  orderAfterUnpin.join(',') === orderBefore.join(',') && JSON.parse(storedAfterUnpin).length === 0,
  JSON.stringify({ before: orderBefore, after: orderAfterUnpin, stored: storedAfterUnpin })
)

// ---- 4. session menu: unpinned / pinned ----------------------------------
const sessionId = await page.evaluate(
  () => document.querySelector('[data-cgpt-session-row]')?.getAttribute('data-cgpt-session-row') ?? null
)
const sessionRow = (id) => page.locator(`[data-cgpt-session-row="${id}"]`).first()
const sessionMoreButton = (id) => page.locator(`[data-cgpt-row-more="${id}"]`).first()
await sessionRow(sessionId).hover()
await page.waitForTimeout(350)
const sessionMoreBox = await sessionMoreButton(sessionId).boundingBox()
const sessionRowBox = triggerFromBox(await sessionRow(sessionId).boundingBox())
const sessionTrigger = triggerFromBox(sessionMoreBox)
await sessionMoreButton(sessionId).click()
await page.waitForTimeout(350)
const sessionUnpinned = await menuGeometry('.chatgpt-session-menu[data-cgpt-session-menu="session"]')
await clip('m35-session-unpinned-raw.png', { x: 0, y: 0, width: 620, height: 560 })
await shot('m35-session-menu-unpinned.png', { x: 0, y: 0, width: 620, height: 560 })
const sessionLabels = sessionUnpinned.items.map((item) => item.label)
addAssertion(
  'unpinned session menu shows 置顶 with the hollow pin (same sprite as the project menu)',
  sessionLabels.includes('置顶') &&
    sessionUnpinned.items.find((item) => item.label === '置顶').iconPaths === GLYPHS.pinOutline.paths.join('|'),
  JSON.stringify(sessionLabels)
)
await page.locator('[data-cgpt-menu-item="pin"]').click()
await page.waitForTimeout(700)
// A pinned session leaves its project group for the 已置顶 group, so the row is
// addressed by id rather than by position.
await sessionRow(sessionId).hover()
await page.waitForTimeout(350)
const sessionPinnedMoreBox = await sessionMoreButton(sessionId).boundingBox()
const sessionPinnedTrigger = triggerFromBox(sessionPinnedMoreBox)
await sessionMoreButton(sessionId).click()
await page.waitForTimeout(350)
const sessionPinned = await menuGeometry('.chatgpt-session-menu[data-cgpt-session-menu="session"]')
await clip('m35-session-pinned-raw.png', { x: 0, y: 0, width: 620, height: 560 })
await shot('m35-session-menu-pinned.png', { x: 0, y: 0, width: 620, height: 560 })
const sessionPinnedItem = sessionPinned.items.find((item) => item.label === '取消置顶')
addAssertion(
  'pinned session menu shows 取消置顶 with the solid-centre pin (not the project slash glyph)',
  sessionPinnedItem !== undefined &&
    sessionPinnedItem.iconPaths === GLYPHS.pinSolid.paths.join('|') &&
    sessionPinnedItem.iconPaths !== GLYPHS.unpin.paths.join('|'),
  JSON.stringify({ labels: sessionPinned.items.map((item) => item.label), viewBox: sessionPinnedItem?.iconViewBox })
)
// Restore the host state so a repeat run starts clean.
await page.locator('[data-cgpt-menu-item="pin"]').click()
await page.waitForTimeout(700)

// ---- 5. the two menus, field by field ------------------------------------
const geometryKeys = ['width', 'padding', 'borderRadius', 'background', 'fontSize', 'lineHeight', 'minWidth', 'boxShadow', 'backdropFilter']
const projectRow = projectUnpinned.items[0]
const sessionRowItem = sessionUnpinned.items[0]
const comparison = {
  surface: Object.fromEntries(
    geometryKeys.map((key) => [key, { project: projectUnpinned.style[key], session: sessionUnpinned.style[key], delta: projectUnpinned.style[key] === sessionUnpinned.style[key] ? 0 : null }])
  ),
  row: {
    height: { project: projectRow.height, session: sessionRowItem.height, delta: round(Math.abs(projectRow.height - sessionRowItem.height)) },
    width: { project: projectRow.width, session: sessionRowItem.width, delta: round(Math.abs(projectRow.width - sessionRowItem.width)) },
    padding: { project: projectRow.padding, session: sessionRowItem.padding, delta: projectRow.padding === sessionRowItem.padding ? 0 : null },
    radius: { project: projectRow.radius, session: sessionRowItem.radius, delta: projectRow.radius === sessionRowItem.radius ? 0 : null },
    fontSize: { project: projectRow.fontSize, session: sessionRowItem.fontSize, delta: projectRow.fontSize === sessionRowItem.fontSize ? 0 : null },
    lineHeight: { project: projectRow.lineHeight, session: sessionRowItem.lineHeight, delta: projectRow.lineHeight === sessionRowItem.lineHeight ? 0 : null },
    gap: { project: projectRow.gap, session: sessionRowItem.gap, delta: projectRow.gap === sessionRowItem.gap ? 0 : null },
    iconSlot: { project: projectRow.iconSlot, session: sessionRowItem.iconSlot, delta: projectRow.iconSlot?.join() === sessionRowItem.iconSlot?.join() ? 0 : null },
    iconSize: { project: projectRow.iconSize, session: sessionRowItem.iconSize, delta: projectRow.iconSize?.join() === sessionRowItem.iconSize?.join() ? 0 : null }
  },
  separator: {
    height: { project: projectUnpinned.separator.height, session: sessionUnpinned.separator.height, delta: round(Math.abs(projectUnpinned.separator.height - sessionUnpinned.separator.height)) },
    inset: { project: projectUnpinned.separator.padding, session: sessionUnpinned.separator.padding, delta: projectUnpinned.separator.padding === sessionUnpinned.separator.padding ? 0 : null }
  }
}
const flatDeltas = Object.values(comparison).flatMap((group) => Object.values(group).map((entry) => entry.delta))
const nonZero = flatDeltas.filter((delta) => delta !== 0)
addAssertion(
  'every measured geometry value of the two menus is identical (width, row height, radius, padding, icon slot, gap, divider)',
  nonZero.length === 0,
  JSON.stringify({ nonZero, comparison: comparison.row })
)

// P0-19e: both menus align their top edge to the row's top edge (not the ⋯,
// which is centred 4px lower) and fall back to bottom alignment near the
// viewport's bottom margin.
const anchor = {
  project: {
    trigger: projectTrigger,
    row: projectOpen.row,
    menu: projectUnpinned.rect,
    topDelta: round(Math.abs(projectUnpinned.rect.y - projectOpen.row.y)),
    gapX: round(projectUnpinned.rect.x - projectTrigger.right)
  },
  session: {
    trigger: sessionTrigger,
    row: sessionRowBox,
    menu: sessionUnpinned.rect,
    topDelta: round(Math.abs(sessionUnpinned.rect.y - sessionRowBox.y)),
    gapX: round(sessionUnpinned.rect.x - sessionTrigger.right)
  }
}
addAssertion(
  'both menus sit 8px right of their trigger and on the row\'s top edge (P0-19e)',
  anchor.project.gapX === 8 && anchor.session.gapX === 8 && anchor.project.topDelta <= 1 && anchor.session.topDelta <= 1,
  JSON.stringify(anchor)
)

// ---- annotated sheets ----------------------------------------------------
const dataUrl = (name) => `data:image/png;base64,${readFileSync(join(CAPTURE, name)).toString('base64')}`
const escapeHtml = (value) => String(value).replace(/[&<>"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[char]))
const boxHtml = (box, color = '#4c8dff') =>
  `<div class="box" style="left:${box.x}px;top:${box.y}px;width:${box.w}px;height:${box.h}px;border-color:${color}"></div>`
const noteHtml = (x, y, text, color = '#eaeaea') =>
  `<div class="pinote" style="left:${x}px;top:${y}px;color:${color}">${escapeHtml(text)}</div>`

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
    .pinote{position:absolute;white-space:nowrap;font:10.5px/14px ui-monospace,SFMono-Regular,Menlo,monospace;text-shadow:0 1px 2px #000,0 0 3px #000}
    .panel ul{margin:8px 0 0;padding:0;list-style:none;color:#bdbdbd;font-size:11.5px;line-height:1.55}
    code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;color:#c9d7ff}
  </style></head><body><h1>${escapeHtml(title)}</h1><p class="note">${note}</p><div class="row">${panels
    .map(
      (panel) => `<section class="panel"><h2>${escapeHtml(panel.caption)}</h2><div class="shot" style="width:${panel.cssW}px;height:${panel.cssH}px"><img src="${dataUrl(panel.file)}" />${panel.overlay ?? ''}</div><ul>${panel.legend
        .map((line) => `<li>${line}</li>`)
        .join('')}</ul></section>`
    )
    .join('')}</div></body></html>`
  const sheetContext = await browser.newContext({ viewport: { width, height: 300 }, deviceScaleFactor: 1, colorScheme: 'dark' })
  const sheetPage = await sheetContext.newPage()
  await sheetPage.setContent(html, { waitUntil: 'load' })
  await sheetPage.waitForTimeout(120)
  await sheetPage.screenshot({ path: join(SHOTS, outName), fullPage: true })
  await sheetContext.close()
}

const itemLegend = (menu) =>
  menu.items.map((item, index) => `行 ${index + 1}：<code>${escapeHtml(item.label)}</code> · ${item.height}px 行高 · 图标 ${item.iconSize?.join('×')} · viewBox ${item.iconViewBox}`)
const menuBox = (menu) => boxHtml(menu.rect, '#4c8dff')
const triggerBox = (trigger) => (trigger === null ? '' : boxHtml({ x: trigger.x, y: trigger.y, w: trigger.w, h: trigger.h }, '#58d68d'))

await sheet(
  'm35-project-menu-states.png',
  'P0-19c · 项目 ⋯ 菜单：未置顶 / 已置顶（620×560 CSS，2× 截取）',
  `蓝框 = 弹出层 <code>${projectUnpinned.rect.w}×${projectUnpinned.rect.h}</code> · 绿框 = 触发按钮。未置顶 <code>置顶 + 空心图钉</code>；已置顶 <code>取消置顶 + 图钉斜杠</code>（附件字形 <code>codex-icon-pin-slash-light-16</code> 原样复用）。分区行已删除，菜单只剩五行。`,
  [
    {
      caption: '① 未置顶：置顶 / 空心图钉',
      file: 'm35-project-unpinned-raw.png',
      cssW: 620,
      cssH: 560,
      overlay: menuBox(projectUnpinned) + triggerBox(projectTrigger),
      legend: [
        ...itemLegend(projectUnpinned).slice(0, 2),
        `菜单 ${projectUnpinned.rect.w}×${projectUnpinned.rect.h} · padding <code>${projectUnpinned.style.padding}</code> · r${projectUnpinned.style.borderRadius}`,
        `无 分区 行：${!projectLabels.includes('分区')}`
      ]
    },
    {
      caption: '② 已置顶：取消置顶 / 图钉 + 斜杠',
      file: 'm35-project-pinned-raw.png',
      cssW: 620,
      cssH: 560,
      overlay: menuBox(projectPinned) + triggerBox(projectPinnedTrigger),
      legend: [
        ...itemLegend(projectPinned).slice(0, 2),
        `图标路径与生成的 <code>unpin</code> 字形逐字节相同：${projectPinned.items[0].iconPaths === GLYPHS.unpin.paths.join('|')}`,
        `持久化键 <code>dsh-chatgpt-ui:pinned-projects</code> = <code>${escapeHtml(storedAfterPin ?? '')}</code>`
      ]
    }
  ]
)

await sheet(
  'm35-session-menu-states.png',
  'P0-19c · 会话 ⋯ 菜单：未置顶 / 已置顶（620×560 CSS，2× 截取）',
  `会话菜单与项目菜单同宽 ${sessionUnpinned.rect.w}、同行高 ${sessionRowItem.height}、同内距 <code>${sessionUnpinned.style.padding}</code>、同图标槽 ${sessionRowItem.iconSlot?.join('×')}。会话图钉用实心变体：未置顶空心、已置顶实心。`,
  [
    {
      caption: '① 未置顶：置顶 / 空心图钉',
      file: 'm35-session-unpinned-raw.png',
      cssW: 620,
      cssH: 560,
      overlay: menuBox(sessionUnpinned) + triggerBox(sessionTrigger),
      legend: [
        ...itemLegend(sessionUnpinned).slice(0, 3),
        `菜单 ${sessionUnpinned.rect.w}×${sessionUnpinned.rect.h} · r${sessionUnpinned.style.borderRadius}`
      ]
    },
    {
      caption: '② 已置顶：取消置顶 / 实心图钉',
      file: 'm35-session-pinned-raw.png',
      cssW: 620,
      cssH: 560,
      overlay: menuBox(sessionPinned) + triggerBox(sessionPinnedTrigger),
      legend: [
        ...itemLegend(sessionPinned).slice(0, 3),
        `图标路径与 <code>pin-fill-light-16</code> 相同：${sessionPinnedItem?.iconPaths === GLYPHS.pinSolid.paths.join('|')}`
      ]
    }
  ]
)

await sheet(
  'm35-menus-compare.png',
  'P0-19c · 两菜单并排对照：每一项几何值差 0（同 2× 比例）',
  `左：项目 ⋯ 菜单；右：会话 ⋯ 菜单。宽度 <code>${projectUnpinned.rect.w} / ${sessionUnpinned.rect.w}</code>，行高 <code>${projectRow.height} / ${sessionRowItem.height}</code>，内距 <code>${projectUnpinned.style.padding} / ${sessionUnpinned.style.padding}</code>，图标槽 <code>${projectRow.iconSlot?.join('×')} / ${sessionRowItem.iconSlot?.join('×')}</code>，分隔线 <code>${projectUnpinned.separator.height}px / ${sessionUnpinned.separator.height}px</code>。`,
  [
    {
      caption: `项目菜单 · ${projectLabels.length} 行`,
      file: 'm35-project-unpinned-raw.png',
      cssW: 620,
      cssH: 560,
      overlay:
        menuBox(projectUnpinned) +
        boxHtml({ x: projectUnpinned.rect.x + 12, y: projectUnpinned.rect.y + 4.25, w: projectUnpinned.items[0].width, h: projectRow.height }, '#ffd166'),
      legend: [
        `表面 ${projectUnpinned.rect.w} × ${projectUnpinned.rect.h} · padding ${projectUnpinned.style.padding} · r${projectUnpinned.style.borderRadius}`,
        `行 ${projectRow.width} × ${projectRow.height} · padding ${projectRow.padding} · gap ${projectRow.gap} · ${projectRow.fontSize}/${projectRow.lineHeight}`,
        `图标槽 ${projectRow.iconSlot?.join('×')} · 图钉 ${projectRow.iconSize?.join('×')} · 分隔线 ${projectUnpinned.separator.height}px`
      ]
    },
    {
      caption: `会话菜单 · ${sessionLabels.length} 行`,
      file: 'm35-session-unpinned-raw.png',
      cssW: 620,
      cssH: 560,
      overlay:
        menuBox(sessionUnpinned) +
        boxHtml({ x: sessionUnpinned.rect.x + 12, y: sessionUnpinned.rect.y + 4.25, w: sessionUnpinned.items[0].width, h: sessionRowItem.height }, '#ffd166'),
      legend: [
        `表面 ${sessionUnpinned.rect.w} × ${sessionUnpinned.rect.h} · padding ${sessionUnpinned.style.padding} · r${sessionUnpinned.style.borderRadius}`,
        `行 ${sessionRowItem.width} × ${sessionRowItem.height} · padding ${sessionRowItem.padding} · gap ${sessionRowItem.gap} · ${sessionRowItem.fontSize}/${sessionRowItem.lineHeight}`,
        `图标槽 ${sessionRowItem.iconSlot?.join('×')} · 图钉 ${sessionRowItem.iconSize?.join('×')} · 分隔线 ${sessionUnpinned.separator.height}px`
      ]
    }
  ]
)

await sheet(
  'm35-pin-order.png',
  'P0-19c · 置顶后排序：Beta 从未置顶第 2 位排到最前（侧栏 2× 截取）',
  `置顶前 <code>${escapeHtml(orderBefore.join(' · '))}</code> → 置顶后 <code>${escapeHtml(orderAfterPin.join(' · '))}</code>；刷新后仍是 <code>${escapeHtml(orderAfterReload.join(' · '))}</code>；取消置顶回到 <code>${escapeHtml(orderAfterUnpin.join(' · '))}</code>。`,
  [
    {
      caption: '① 置顶后（Beta 在前）',
      file: 'm35-order-pinned-raw.png',
      cssW: 620,
      cssH: 420,
      overlay: noteHtml(380, 12, `pinned = ${JSON.parse(storedAfterPin ?? '[]').length} id (${JSON.parse(storedAfterPin ?? '[]')[0]?.slice(0, 8) ?? ''}…)`, '#58d68d'),
      legend: orderAfterPin.map((title, index) => `${index + 1}. ${escapeHtml(title)}`)
    }
  ]
)

// The three pin variants at 4× so the source glyphs can be compared directly.
const glyphCells = Object.entries(GLYPHS)
  .map(
    ([name, glyph]) => `<figure><div class="glyph">${glyphSource(glyph)}</div><figcaption><b>${name}</b><br/>${escapeHtml(glyph.origin)}<br/>${glyph.viewBox} · ${glyph.size}px</figcaption></figure>`
  )
  .join('')
const glyphHtml = `<!doctype html><html><head><meta charset="utf-8"><style>
  body{margin:0;padding:20px;background:#1b1b1b;color:#ededed;font:12px/1.5 "PingFang SC","Noto Sans SC",sans-serif;display:flex;gap:28px}
  figure{margin:0;text-align:center} .glyph{width:128px;height:128px;display:flex;align-items:center;justify-content:center;background:#212121;border:1px solid #333;border-radius:10px;color:#ededed}
  .glyph svg{width:128px;height:128px} figcaption{margin-top:8px;color:#b9b9b9;font-size:11px;line-height:1.6}
  </style></head><body>${glyphCells}</body></html>`
function glyphSource(glyph) {
  return `<svg viewBox="${glyph.viewBox}" width="${glyph.size}" height="${glyph.size}" fill="currentColor" xmlns="http://www.w3.org/2000/svg">${glyph.paths
    .map((d) => `<path d="${d}"/>`)
    .join('')}</svg>`
}
const glyphContext = await browser.newContext({ viewport: { width: 560, height: 220 }, deviceScaleFactor: 1, colorScheme: 'dark' })
const glyphPage = await glyphContext.newPage()
await glyphPage.setContent(glyphHtml, { waitUntil: 'load' })
await glyphPage.waitForTimeout(100)
await glyphPage.screenshot({ path: join(SHOTS, 'm35-pin-glyphs.png'), fullPage: true })
await glyphContext.close()

// ---- evidence ------------------------------------------------------------
const failed = assertions.filter((entry) => entry.ok !== true)
const evidence = {
  task: 'P0-19c',
  url: redact(url),
  capturedAt: new Date().toISOString(),
  viewport: { width: 1233, height: 850, deviceScaleFactor: 2 },
  menus: {
    project: {
      dataAttribute: "data-cgpt-session-menu='project-hover'",
      labels: projectLabels,
      unpinned: { label: projectUnpinned.items[0].label, icon: 'pinOutline', viewBox: projectUnpinned.items[0].iconViewBox, size: projectUnpinned.items[0].iconSize },
      pinned: { label: projectPinned.items[0].label, icon: 'unpin', viewBox: projectPinned.items[0].iconViewBox, size: projectPinned.items[0].iconSize },
      geometry: projectUnpinned,
      anchor
    },
    session: {
      dataAttribute: "data-cgpt-session-menu='session'",
      labels: sessionLabels,
      unpinned: { label: '置顶', icon: 'pinOutline', viewBox: sessionUnpinned.items.find((item) => item.label === '置顶').iconViewBox },
      pinned: { label: sessionPinnedItem?.label ?? null, icon: 'pinSolid', viewBox: sessionPinnedItem?.iconViewBox ?? null, size: sessionPinnedItem?.iconSize ?? null },
      geometry: sessionUnpinned
    }
  },
  geometryComparison: comparison,
  geometryDeltaTotal: flatDeltas.length,
  geometryDeltaNonZero: nonZero.length,
  pins: {
    semantics: 'project: hollow ⇄ pin+slash (two-way, persisted); session: hollow ⇄ solid-centre (host pinSession/unpinSession)',
    glyphs: {
      pinOutline: GLYPHS.pinOutline,
      pinSolid: GLYPHS.pinSolid,
      unpin: GLYPHS.unpin
    },
    attachment:
      'The staged 取消置顶 reference (188×68 png) draws the pin-with-slash row: its glyph is the ChatGPT sprite symbol codex-icon-pin-slash-light-16, which this build reuses verbatim as `unpin` (no hand-drawn approximation). The solid-centre variant is the sprite sibling codex-icon-pin-fill-light-16; the hollow one is codex-icon-pin-light-16.',
    persistenceKey: 'dsh-chatgpt-ui:pinned-projects',
    persistenceValueAfterPin: storedAfterPin,
    persistenceValueAfterUnpin: storedAfterUnpin,
    order: { before: orderBefore, afterPin: orderAfterPin, afterReload: orderAfterReload, afterUnpin: orderAfterUnpin }
  },
  sectionRemoval: {
    removed: '分区 (action section-project)',
    reason: 'DSH has no project-section model; the row was a permanently disabled dead item.',
    projectMenuLabels: projectLabels,
    absent: !projectLabels.includes('分区') && !projectLabels.some((label) => label.includes('分区')),
    separators: projectUnpinned.items.length === 5 ? 3 : null
  },
  assertions,
  summary: { total: assertions.length, passed: assertions.length - failed.length, failed: failed.map((entry) => entry.id) },
  screenshots: [
    'docs/screenshots/m35-project-menu-unpinned.png',
    'docs/screenshots/m35-project-menu-pinned.png',
    'docs/screenshots/m35-project-menu-states.png',
    'docs/screenshots/m35-session-menu-unpinned.png',
    'docs/screenshots/m35-session-menu-pinned.png',
    'docs/screenshots/m35-session-menu-states.png',
    'docs/screenshots/m35-menus-compare.png',
    'docs/screenshots/m35-pin-order.png',
    'docs/screenshots/m35-pin-glyphs.png'
  ],
  errors
}
writeFileSync(join(OUT, 'm35.json'), `${JSON.stringify(evidence, null, 2)}\n`)
console.log(`docs/m35.json — ${evidence.summary.passed}/${evidence.summary.total} assertions passed, ${errors.length} page errors`)
await browser.close()
process.exit(failed.length === 0 ? 0 : 1)
