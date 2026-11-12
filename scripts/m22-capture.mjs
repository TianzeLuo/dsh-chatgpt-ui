#!/usr/bin/env node
/**
 * scripts/m22-capture.mjs — P0-10B evidence: splitter follow-through, one
 * composer column, the removed project chip, and the permission selector.
 *
 * Frames (docs/screenshots):
 *   m22-sidebar-before.png / m22-sidebar-after.png
 *   m22-conversation-before.png / m22-conversation-after.png
 *   m22-project-card-before.png / m22-project-card-after.png
 *   m22-permission-menu.png, m22-permission-chat.png, m22-permission-narrow.png
 *
 * The project-chip "before" frame is a reconstruction: P0-10B deleted the node,
 * so the script re-inserts the exact removed markup plus the CSS rules that went
 * with it (`docs/m22.json → projectChip.before.reconstructed = true`). Every
 * other frame is the live skin.
 *
 *   node scripts/m22-capture.mjs --url "http://127.0.0.1:3136/?token=…"
 *
 * Writes docs/m22.json and exits non-zero when an assertion fails.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
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
  console.error('usage: node scripts/m22-capture.mjs --url <tokenised-url> [--out docs]')
  process.exit(2)
}
const DOCS = resolve(ROOT, typeof args.get('out') === 'string' ? args.get('out') : 'docs')
const SHOTS = join(DOCS, 'screenshots')
mkdirSync(SHOTS, { recursive: true })

let playwright
for (const candidate of ['/mnt/f/project/y86/node_modules/playwright/index.mjs', 'playwright', 'playwright-core']) {
  try {
    playwright = await import(candidate)
    break
  } catch {}
}
if (playwright === undefined) {
  console.error('m22-capture: playwright is required')
  process.exit(2)
}
const CHROME = process.env.M22_CHROME ?? process.env.CHATGPT_UI_CHROME ?? '/home/user/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome'
const browser = await playwright.chromium.launch({
  headless: true,
  executablePath: CHROME,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
})

const assertions = []
const check = (name, pass, detail) => {
  assertions.push({ name, pass: pass === true, detail })
  console.log(`${pass === true ? 'PASS' : 'FAIL'}  ${name}${pass === true ? '' : ` ${JSON.stringify(detail)}`}`)
}
const round = (value) => Math.round(value * 10) / 10

const openPage = async (context, selector = '.chatgpt-session-row') => {
  const page = await context.newPage()
  await page.goto(url, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector(selector, { timeout: 30000 })
  await page.waitForFunction(() => document.body.getAttribute('data-chatgpt-ui') !== null, null, { timeout: 30000 })
  await page.waitForTimeout(1200)
  return page
}
const shot = async (page, name, clip) => {
  await page.screenshot({ path: join(SHOTS, name), ...(clip === undefined ? {} : { clip }) })
  return `docs/screenshots/${name}`
}
const pad = (rect, top, right, bottom, left) => {
  const width = rect.width ?? rect.w
  const height = rect.height ?? rect.h
  return {
    x: Math.max(0, Math.floor(rect.x - left)),
    y: Math.max(0, Math.floor(rect.y - top)),
    width: Math.ceil(width + left + right),
    height: Math.ceil(height + top + bottom)
  }
}
const union = (rects) => {
  const boxes = rects.filter((rect) => rect !== null && rect !== undefined).map((rect) => ({
    x: rect.x,
    y: rect.y,
    right: rect.x + (rect.w ?? rect.width),
    bottom: rect.y + (rect.h ?? rect.height)
  }))
  const x = Math.min(...boxes.map((box) => box.x))
  const y = Math.min(...boxes.map((box) => box.y))
  return { x, y, width: Math.max(...boxes.map((box) => box.right)) - x, height: Math.max(...boxes.map((box) => box.bottom)) - y }
}
const clampClip = async (page, clip) => {
  const size = await page.evaluate(() => ({
    width: Math.max(document.documentElement.scrollWidth, window.innerWidth),
    height: Math.max(document.documentElement.scrollHeight, window.innerHeight)
  }))
  const x = Math.max(0, Math.min(clip.x, size.width - 40))
  const y = Math.max(0, Math.min(clip.y, size.height - 40))
  return {
    x,
    y,
    width: Math.min(clip.width, size.width - x),
    height: Math.min(clip.height, size.height - y)
  }
}

const SIDEBAR_READ = `() => {
  const rect = (el) => { if (el === null) return null; const b = el.getBoundingClientRect(); return { x: +b.x.toFixed(1), w: +b.width.toFixed(1), right: +b.right.toFixed(1), bottom: +b.bottom.toFixed(1) } }
  const frame = document.querySelector('[class*="_frame"]')
  const panel = document.querySelector('[data-slot="sidebar"]')?.firstElementChild ?? null
  const list = document.querySelector('.chatgpt-sessions')
  const scroll = document.querySelector('.chatgpt-session-scroll')
  const row = document.querySelector('.chatgpt-session-row')
  const thumb = scroll === null ? null : { x: +(scroll.getBoundingClientRect().right - 4).toFixed(1), w: 4 }
  return {
    grid: frame === null ? null : getComputedStyle(frame).gridTemplateColumns,
    track: frame === null ? null : +parseFloat(getComputedStyle(frame).gridTemplateColumns).toFixed(1),
    panel: rect(panel),
    list: rect(list),
    scroll: rect(scroll),
    row: rect(row),
    thumb,
    scrollTop: scroll?.scrollTop ?? null,
    scrollHeight: scroll?.scrollHeight ?? null,
    clientHeight: scroll?.clientHeight ?? null
  }
}`

const COLUMN_READ = `() => {
  const rect = (el) => { if (el === null) return null; const b = el.getBoundingClientRect(); return { x: +b.x.toFixed(1), y: +b.y.toFixed(1), w: +b.width.toFixed(1), h: +b.height.toFixed(1), right: +b.right.toFixed(1), center: +(b.x + b.width / 2).toFixed(1) } }
  const card = document.querySelector('[data-composer-card="true"]')
  const column = document.querySelector('[class*="_column"][class*="EvIC1a"], [class*="EvIC1a_column"]')
  const body = document.querySelector('[class*="wSkVaW_body"]')
  const handle = document.querySelector('[class*="_widthHandle"][data-side="right"]')
  const hero = document.querySelector("[class*='_composerHero'] [class*='_stack']")
  return {
    card: rect(card),
    column: rect(column),
    hero: rect(hero),
    handle: rect(handle),
    contentWidth: body === null ? null : getComputedStyle(body).getPropertyValue('--dsh-chat-content-width').trim(),
    userWidth: body === null ? null : (body.style.getPropertyValue('--dsh-chat-user-width') || null),
    stored: localStorage.getItem('dsh.conversation.contentWidth'),
    overflow: { scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth },
    cardChip: document.querySelector('.chatgpt-work-project-readonly') !== null,
    chipAttr: document.querySelector('[data-cgpt-project-readonly]') !== null
  }
}`

const PERMISSION_READ = `() => {
  const rect = (el) => { if (el === null) return null; const b = el.getBoundingClientRect(); return { x: +b.x.toFixed(1), y: +b.y.toFixed(1), w: +b.width.toFixed(1), h: +b.height.toFixed(1) } }
  const button = document.querySelector('[data-cgpt-permission]')
  const menu = document.querySelector('[data-cgpt-work-menu="permission"]')
  return {
    button: rect(button),
    label: button === null ? null : button.innerText.trim(),
    value: button === null ? null : button.getAttribute('data-cgpt-permission-value'),
    expanded: button === null ? null : button.getAttribute('aria-expanded'),
    menu: rect(menu),
    options: menu === null ? [] : [...menu.querySelectorAll('[data-cgpt-approval-option]')].map((node) => ({
      value: node.getAttribute('data-cgpt-approval-option'),
      label: node.querySelector('.chatgpt-work-menu-label')?.textContent?.trim() ?? '',
      hostName: node.getAttribute('title'),
      current: node.getAttribute('data-current') === 'true'
    })),
    note: menu === null ? null : (menu.querySelector('[data-cgpt-permission-note]')?.textContent?.trim() ?? null),
    row: rect(document.querySelector('[class*="_row"]')),
    rowWrap: (() => { const row = document.querySelector('[class*="_row"]'); return row === null ? null : getComputedStyle(row).flexWrap })(),
    add: rect(document.querySelector('[class*="_row"] button[class*="_add"]'))
  }
}`

const readSidebar = (page) => page.evaluate(`(${SIDEBAR_READ})()`)
const readColumn = (page) => page.evaluate(`(${COLUMN_READ})()`)
const readPermission = (page) => page.evaluate(`(${PERMISSION_READ})()`)

const result = {
  module: 'm22',
  title: 'P0-10B · 侧栏分隔条跟随 · 输入卡与正文同宽 · 项目名 chip 移除 · 权限选择器',
  generatedAt: new Date().toISOString(),
  url: url.replace(/token=[^&]+/, 'token=***'),
  viewport: { width: 1440, height: 960, dpr: 1 },
  screenshots: {}
}

const context = await browser.newContext({ viewport: { width: 1440, height: 960 }, deviceScaleFactor: 1, locale: 'zh-CN' })
const page = await openPage(context)

// ---------------------------------------------------------------- sidebar ---
/* The list used to be a fixed 288px column, so the Host splitter moved the
   panel and the row background while every row and the scrollbar stayed put. */
await page.evaluate(() => {
  const scroll = document.querySelector('.chatgpt-session-scroll')
  if (scroll !== null) scroll.scrollTop = 60
})
await page.waitForTimeout(150)
const sidebarBefore = await readSidebar(page)
const sidebarClip = await clampClip(page, { x: 0, y: 0, width: sidebarBefore.panel.right + 44, height: 700 })
result.screenshots.sidebarBefore = await shot(page, 'm22-sidebar-before.png', sidebarClip)

const handleBox = await page.locator('[class*="_handle"]').first().boundingBox()
if (handleBox === null) throw new Error('m22-capture: Host splitter handle not found')
await page.mouse.move(handleBox.x + 4, handleBox.y + 120)
await page.mouse.down()
for (let i = 1; i <= 12; i += 1) {
  await page.mouse.move(handleBox.x + 4 + i * 7, handleBox.y + 120)
  await page.waitForTimeout(20)
}
await page.waitForTimeout(200)
const sidebarDuring = await readSidebar(page)
await page.mouse.up()
await page.waitForTimeout(400)
const sidebarAfter = await readSidebar(page)
result.screenshots.sidebarAfter = await shot(page, 'm22-sidebar-after.png', sidebarClip)

const sidebarDelta = round(sidebarAfter.scroll.w - sidebarBefore.scroll.w)
const thumbDelta = round(sidebarAfter.thumb.x - sidebarBefore.thumb.x)
result.sidebar = {
  rootCause: 'lib/client/css/25-sessions.css 把列表写成固定 width: 288px；宿主分隔条只改 frame 的 grid-template-columns（340→420），列表、行和滚动条都不跟随。',
  fix: 'width: calc(100% - 8px)：列表跟随宿主 track（track − 52 rail − 8 滚动条槽），行与滚动条同步重排，宿主不需要新的宽度状态。',
  before: sidebarBefore,
  after: sidebarAfter,
  delta: sidebarDelta,
  scrollbarDelta: thumbDelta,
  rowDelta: round(sidebarAfter.row.w - sidebarBefore.row.w),
  live: sidebarDuring.scroll.w > sidebarBefore.scroll.w,
  hostPersistence: {
    persisted: false,
    key: null,
    note: '宿主 layout store 只保存在内存：刷新后回到 280 初始值，皮肤挂载时再取 340 基线；折叠/展开同样不记住宽度。skin 未另建 localStorage 键。'
  },
  scrollbar: {
    rendered: 'overlay',
    note: '无头 Chromium 的 overlay 滚动条不参与截图绘制；滚动条位置按几何量记录（列表右边 − 4px），并随 track 同步移动。'
  }
}
check('侧栏拖拽后宽度变化 ≥40px', sidebarDelta >= 40, { before: sidebarBefore.scroll.w, after: sidebarAfter.scroll.w, delta: sidebarDelta })
check('侧栏跳变前已实时跟随（拖动过程中）', sidebarDuring.scroll.w > sidebarBefore.scroll.w, { during: sidebarDuring.scroll.w })
check('列表 = 面板 − 8px 滚动条槽（两次）', Math.abs(sidebarAfter.scroll.w - (sidebarAfter.panel.w - 8)) < 1 && Math.abs(sidebarBefore.scroll.w - (sidebarBefore.panel.w - 8)) < 1, { before: sidebarBefore, after: sidebarAfter })
check('滚动条随拖拽移动相同距离', Math.abs(thumbDelta - sidebarDelta) < 1, { thumbDelta, sidebarDelta })
check('会话行随拖拽重排（宽度同步）', Math.abs(sidebarAfter.row.w - sidebarBefore.row.w - sidebarDelta) < 1, { rowBefore: sidebarBefore.row.w, rowAfter: sidebarAfter.row.w })
check('滚动位置不因拖拽丢失', sidebarAfter.scrollTop === sidebarBefore.scrollTop, { before: sidebarBefore.scrollTop, after: sidebarAfter.scrollTop })

// Reload: does the Host keep the dragged width?
await page.reload({ waitUntil: 'domcontentloaded' })
await page.waitForSelector('.chatgpt-session-row', { timeout: 30000 })
await page.waitForTimeout(2500)
const sidebarReload = await readSidebar(page)
result.sidebar.afterReload = sidebarReload
check('宿主刷新后不保留侧栏宽度（记录为宿主行为）', Math.abs(sidebarReload.scroll.w - sidebarBefore.scroll.w) < 1, { reloaded: sidebarReload.scroll.w })

// ----------------------------------------------------------- conversation ---
/* The Work card was a fixed 768px fold while the transcript used the Host
   reading column; the width handle then resized the text but not the card. */
await page.locator('.chatgpt-session-row').filter({ hasNotText: '新会话' }).first().click()
await page.waitForTimeout(3000)
const convBefore = await readColumn(page)
if (convBefore.card === null || convBefore.column === null) throw new Error('m22-capture: composer card / transcript column not found')
const convClip = await clampClip(page, {
  x: convBefore.column.center - 424,
  y: convBefore.column.y - 16,
  width: 848,
  height: convBefore.card.y + convBefore.card.h + 24 - (convBefore.column.y - 16)
})
result.screenshots.conversationBefore = await shot(page, 'm22-conversation-before.png', convClip)

const widthHandle = await page.locator('[class*="_widthHandle"][data-side="right"]').first().boundingBox()
if (widthHandle === null) throw new Error('m22-capture: conversation width handle not found')
await page.mouse.move(widthHandle.x + 4, widthHandle.y + 220)
await page.mouse.down()
for (let i = 1; i <= 10; i += 1) {
  await page.mouse.move(widthHandle.x + 4 - i * 7, widthHandle.y + 220)
  await page.waitForTimeout(20)
}
await page.waitForTimeout(200)
const convDuring = await readColumn(page)
await page.mouse.up()
await page.waitForTimeout(500)
const convAfter = await readColumn(page)
result.screenshots.conversationAfter = await shot(page, 'm22-conversation-after.png', convClip)

const columnDelta = round(convBefore.column.w - convAfter.column.w)
result.conversation = {
  rootCause: '65-work-card.css 把 Work 卡固定为 width: min(768px, 100%) / max-width: 768px，与正文列（--dsh-chat-content-width，拖拽改的是这个变量）脱钩；40-composer.css 还多加了 32px 槽。',
  fix: '卡片 width:100% + max-width: var(--dsh-chat-content-width, var(--cgpt-msg-max, 920px))，与 .EvIC1a_column 读同一个变量；宿主手柄一拖，两者同时变。',
  before: convBefore,
  during: convDuring,
  after: convAfter,
  columnDelta,
  cardDelta: round(convBefore.card.w - convAfter.card.w),
  deltaBefore: round(Math.abs(convBefore.card.w - convBefore.column.w)),
  deltaAfter: round(Math.abs(convAfter.card.w - convAfter.column.w)),
  centerBefore: { card: convBefore.card.center, column: convBefore.column.center },
  centerAfter: { card: convAfter.card.center, column: convAfter.column.center },
  persistence: { key: 'dsh.conversation.contentWidth', stored: convAfter.stored, scope: 'localStorage（宿主）' }
}
check('对话区拖拽后正文列变化 ≥40px', columnDelta >= 40, { before: convBefore.column.w, after: convAfter.column.w })
check('拖拽过程中卡片与正文列实时同宽', Math.abs(convDuring.card.w - convDuring.column.w) <= 1, { card: convDuring.card.w, column: convDuring.column.w })
check('拖拽后卡片与正文列同宽（差 ≤1px）', Math.abs(convAfter.card.w - convAfter.column.w) <= 1, { card: convAfter.card.w, column: convAfter.column.w })
check('拖拽前卡片与正文列同宽（差 ≤1px）', Math.abs(convBefore.card.w - convBefore.column.w) <= 1, { card: convBefore.card.w, column: convBefore.column.w })
check('卡片与正文列同心（差 ≤1px）', Math.abs(convAfter.card.center - convAfter.column.center) <= 1 && Math.abs(convBefore.card.center - convBefore.column.center) <= 1, { before: convBefore.card.center, after: convAfter.card.center })
check('无横向溢出', convAfter.overflow.scrollWidth <= convAfter.overflow.clientWidth + 1, convAfter.overflow)
check('宿主记录对话区宽度（localStorage 键）', convAfter.stored !== null && Math.abs(parseFloat(convAfter.stored) - convAfter.column.w) <= 2, { stored: convAfter.stored, column: convAfter.column.w })

await page.reload({ waitUntil: 'domcontentloaded' })
await page.waitForSelector('[data-composer-card="true"]', { timeout: 30000 })
await page.waitForTimeout(3000)
const convReload = await readColumn(page)
result.conversation.afterReload = convReload
check('刷新后仍保持拖拽后的列宽（卡片跟随）', Math.abs(convReload.column.w - convAfter.column.w) <= 1 && Math.abs(convReload.card.w - convReload.column.w) <= 1, { column: convReload.column.w, card: convReload.card.w })

// ------------------------------------------------------------ project chip ---
/* The chip was deleted from composer.js; the "before" frame re-creates the
   exact removed markup and its two CSS rules so the pair stays comparable. */
const cardRectBefore = await page.evaluate(() => {
  const card = document.querySelector('[data-composer-card="true"]')
  if (card === null) return null
  const b = card.getBoundingClientRect()
  return { x: b.x, y: b.y, width: b.width, height: b.height }
})
const chipClip = await clampClip(page, pad(cardRectBefore, 56, 24, 40, 24))
const chipInjected = await page.evaluate(() => {
  const card = document.querySelector('[data-composer-card="true"]')
  const row = card?.querySelector('[class*="_row"]') ?? card
  if (row === null || row === undefined) return false
  const chip = document.createElement('div')
  chip.className = 'chatgpt-work-project-readonly'
  chip.setAttribute('data-cgpt-project-readonly', 'legacy')
  chip.title = '项目归属由会话创建时决定，不可更改'
  chip.style.cssText = 'display:inline-flex;align-items:center;gap:6px;max-width:100%;margin:0 0 6px 8px;padding:3px 8px 3px 5px;border:1px solid var(--cgpt-border-subtle);border-radius:var(--cgpt-radius-control);color:var(--cgpt-text-tertiary);font-size:12px;line-height:18px;'
  const icon = document.createElement('span')
  icon.className = 'chatgpt-work-tool-icon'
  icon.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M3 7.5h6l2 2.5h10V19H3z"/></svg>'
  const label = document.createElement('span')
  label.className = 'chatgpt-work-project-readonly-label'
  label.style.cssText = 'overflow:hidden;max-width:260px;text-overflow:ellipsis;white-space:nowrap;'
  label.textContent = document.querySelector('.chatgpt-session-row[data-active="true"] .chatgpt-session-project, .chatgpt-session-project')?.textContent?.trim() || '客户门户'
  chip.append(icon, label)
  row.insertBefore(chip, row.firstChild)
  row.style.flexWrap = 'nowrap'
  return true
})
await page.waitForTimeout(300)
result.screenshots.projectChipBefore = await shot(page, 'm22-project-card-before.png', chipClip)
const chipBefore = await page.evaluate(() => {
  const chip = document.querySelector('.chatgpt-work-project-readonly')
  if (chip === null) return null
  const b = chip.getBoundingClientRect()
  return { text: chip.textContent.trim(), rect: { x: +b.x.toFixed(1), y: +b.y.toFixed(1), w: +b.width.toFixed(1), h: +b.height.toFixed(1) } }
})
await page.evaluate(() => {
  document.querySelectorAll('.chatgpt-work-project-readonly').forEach((node) => node.remove())
  const row = document.querySelector('[class*="_row"]')
  if (row !== null) row.style.flexWrap = ''
})
await page.waitForTimeout(250)
const chipAfter = await page.evaluate(() => ({
  nodes: document.querySelectorAll('.chatgpt-work-project-readonly').length,
  attrs: document.querySelectorAll('[data-cgpt-project-readonly]').length,
  rowText: document.querySelector('[class*="_row"]')?.innerText?.replace(/\s+/g, ' ').trim().slice(0, 90) ?? null
}))
result.screenshots.projectChipAfter = await shot(page, 'm22-project-card-after.png', chipClip)
result.projectChip = {
  before: { reconstructed: true, note: 'P0-10B 删除了节点，before 帧按被删的 composer.js JSX + 35-project.css 两条规则重建', chip: chipBefore },
  after: chipAfter,
  sourceRemoved: ['composer.js: chatgpt-work-project-readonly 分支', '35-project.css: .chatgpt-work-project-readonly / -label']
}
check('项目会话输入卡无项目名 chip', chipAfter.nodes === 0 && chipAfter.attrs === 0, chipAfter)
check('before 帧重建出了被删的 chip（对照有效）', chipInjected && chipBefore !== null, { chip: chipBefore })

// --------------------------------------------------------------- permission ---
const permissionBefore = await readPermission(page)
if (permissionBefore.value === null) throw new Error('m22-capture: permission control not found')
await page.locator('[data-cgpt-permission]').click()
await page.waitForTimeout(400)
const permissionOpen = await readPermission(page)
result.screenshots.permissionMenu = await shot(page, 'm22-permission-menu.png', pad(union([permissionOpen.menu, permissionOpen.button]), 36, 36, 36, 36))
const options = permissionOpen.options
const currentIndex = options.findIndex((option) => option.current)
const target = options[(currentIndex + 1) % options.length]
await page.locator(`[data-cgpt-approval-option="${target.value}"]`).click()
await page.waitForTimeout(1200)
const permissionSwitched = await readPermission(page)
await page.reload({ waitUntil: 'domcontentloaded' })
await page.waitForSelector('[data-cgpt-permission]', { timeout: 30000 })
await page.waitForTimeout(3000)
const permissionReload = await readPermission(page)
result.permission = {
  rootCause: '旧实现把审批当工具行的一个按钮，标签永远写死「帮我批准」，且只在空白会话出现；Chat 里没有入口。',
  fix: 'conversation.input.left 独立座位（order 30，附件按钮右侧）：标签 = permissionPresets.catalog 的当前枚举值，菜单 = 同一 catalog，切换走宿主 /permission 命令。',
  before: permissionBefore,
  open: permissionOpen,
  enum: options.map((option) => ({ value: option.value, label: option.label, hostName: option.hostName })),
  switched: permissionSwitched,
  afterReload: permissionReload,
  hostState: {
    derived: 'permissions.currentValue 由宿主 permissionPresets 从 sandbox/mode + approval/policy 派生，皮肤只读该投影，不自己存状态',
    command: '/permission <preset>',
    applies: ['sandbox/mode', 'approval/policy']
  },
  persistence: {
    key: 'session.v4.jsonl: permission/preset (+ sandbox/mode, approval/policy)',
    scope: '服务端会话记录，随会话恢复；刷新页面后仍生效',
    verifiedAfterReload: permissionReload.value === target.value
  }
}
check('权限按钮有可点击菜单', permissionOpen.options.length >= 2 && permissionOpen.menu !== null, { options: permissionOpen.options.length })
check('按钮显示宿主当前审批级别', permissionOpen.label === (options.find((option) => option.current)?.label ?? null), { label: permissionOpen.label, current: options.find((option) => option.current)?.label })
check('菜单列出宿主枚举且只有一项选中', options.length >= 2 && options.filter((option) => option.current).length === 1, options)
check('切换后按钮与宿主状态同步', permissionSwitched.value === target.value && permissionSwitched.label === target.label, { value: permissionSwitched.value, label: permissionSwitched.label })
check('切换结果刷新后仍生效（会话持久化）', permissionReload.value === target.value, { value: permissionReload.value })
check('权限按钮在附件按钮右侧且同一行', permissionOpen.button !== null && permissionOpen.add !== null && permissionOpen.button.x > permissionOpen.add.x + permissionOpen.add.w, { add: permissionOpen.add, button: permissionOpen.button })
check('权限按钮在行内且不换行', permissionOpen.rowWrap === 'nowrap' && permissionOpen.button.x + permissionOpen.button.w <= permissionOpen.row.x + permissionOpen.row.w + 1, { rowWrap: permissionOpen.rowWrap, row: permissionOpen.row })

// ------------------------------------------------------------------ chat ---
/* Chat is pinned read-only by the Host half; the menu still opens and explains
   why the switch cannot take effect. A separate context keeps the project
   session above untouched. */
const chatContext = await browser.newContext({ viewport: { width: 1440, height: 960 }, deviceScaleFactor: 1, locale: 'zh-CN' })
const chatPage = await openPage(chatContext, '[data-composer-card="true"]')
await chatPage.locator('.chatgpt-mode-seg').filter({ hasText: 'Chat' }).first().click()
await chatPage.waitForTimeout(2500)
const chatPermission = await readPermission(chatPage)
await chatPage.locator('[data-cgpt-permission]').click()
await chatPage.waitForTimeout(400)
const chatOpen = await readPermission(chatPage)
const chatOther = chatOpen.options.find((option) => !option.current)
if (chatOther !== undefined) {
  await chatPage.locator(`[data-cgpt-approval-option="${chatOther.value}"]`).click()
  await chatPage.waitForTimeout(900)
}
const chatAfter = await readPermission(chatPage)
result.screenshots.permissionChat = await shot(chatPage, 'm22-permission-chat.png', pad(union([chatOpen.menu, chatAfter.button]), 36, 36, 36, 36))
result.chatMode = {
  fix: 'Chat 会话被宿主 lib/host/chat-policy.js 固定为 sandbox=read-only / approval=never，/permission 提升会被立刻回滚；皮肤因此把菜单原样打开并在底部说明原因，按钮显示宿主给的当前值（自定义/仅可查看）。',
  before: chatPermission,
  open: chatOpen,
  after: chatAfter,
  currentInCatalog: chatOpen.options.some((option) => option.value === chatPermission.value),
  catalogNote: 'Chat 会话被宿主固定为 sandbox=read-only / approval=never；这套组合在本部署没有对应预设，宿主投影给的是 custom，按钮显示「自定义」，所以菜单里没有勾选项——这正是宿主真实状态。',
  noteShown: chatAfter.note !== null
}
check('Chat 模式也有权限选择器', chatPermission.value !== null && chatOpen.options.length >= 2, { value: chatPermission.value, options: chatOpen.options.length })
check('Chat 模式说明只读原因', chatAfter.note !== null && chatAfter.value === chatPermission.value, { note: chatAfter.note, value: chatAfter.value })

// ---------------------------------------------------------------- narrow ---
const narrowContext = await browser.newContext({ viewport: { width: 640, height: 900 }, deviceScaleFactor: 1, locale: 'zh-CN' })
const narrowPage = await openPage(narrowContext, '[data-composer-card="true"]')
const narrow = await readPermission(narrowPage)
const narrowCard = await readColumn(narrowPage)
result.screenshots.permissionNarrow = await shot(narrowPage, 'm22-permission-narrow.png', pad(narrowCard.card, 24, 24, 24, 24))
result.narrow = {
  viewport: 640,
  permission: narrow,
  card: narrowCard,
  overflow: narrowCard.overflow,
  fitsRow: narrow.button !== null && narrow.row !== null && narrow.button.y + narrow.button.h <= narrow.row.y + narrow.row.h + 1,
  clipped: narrow.button !== null && narrow.button.w >= 60
}
check('640px：无横向溢出', narrowCard.overflow.scrollWidth <= narrowCard.overflow.clientWidth + 1, narrowCard.overflow)
check('640px：权限按钮不换行（仍在行内）', result.narrow.fitsRow === true, { row: narrow.row, button: narrow.button })
check('640px：权限按钮未被压扁', result.narrow.clipped === true, { width: narrow.button?.w })
check('640px：卡片宽度跟随可用列', narrowCard.card.w === 545, { card: narrowCard.card.w })

// ------------------------------------------------------------------ write ---
const failed = assertions.filter((row) => row.pass === false).length
result.assertions = assertions
result.meta = { checks: assertions.length, pass: assertions.length - failed, fail: failed }
writeFileSync(join(DOCS, 'm22.json'), `${JSON.stringify(result, null, 2)}\n`)
console.log(`\nm22: ${assertions.length - failed}/${assertions.length} assertions passed, ${Object.keys(result.screenshots).length} frames — docs/m22.json`)
await browser.close()
if (failed > 0) process.exit(1)
