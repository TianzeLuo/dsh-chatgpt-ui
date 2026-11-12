#!/usr/bin/env node
/**
 * scripts/m23-capture.mjs — P0-11 evidence: rail selected states, one column,
 * the two project menus, and the unified permission overlay.
 *
 *   node scripts/m23-capture.mjs --url "http://127.0.0.1:3136/?token=…"
 *
 * Frames (docs/screenshots):
 *   m23-rail-{home,schedules,plugins,more,projects}.png
 *   m23-project-overview.png, m23-project-detail.png, m23-home-super-agent.png
 *   m23-project-hover-menu.png, m23-project-more-menu.png
 *   m23-permission-{light,dark}.png, m23-width-max.png
 *
 * Writes docs/m23.json and exits non-zero when an assertion fails. The icon
 * ratios are read from docs/icon-check.json (run tools/icon-check.mjs --dpr 4
 * --url … first), so the evidence never restates a number it did not measure.
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
  else {
    args.set(token.slice(2), next)
    i += 1
  }
}
const url = args.get('url')
if (typeof url !== 'string') {
  console.error('usage: node scripts/m23-capture.mjs --url <tokenised-url> [--out docs]')
  process.exit(2)
}
const DOCS = resolve(ROOT, typeof args.get('out') === 'string' ? args.get('out') : 'docs')
const SHOTS = join(DOCS, 'screenshots')
mkdirSync(SHOTS, { recursive: true })

let playwright
for (const candidate of [args.get('playwright'), 'playwright', 'playwright', 'playwright-core'].filter(Boolean)) {
  try {
    playwright = await import(candidate)
    break
  } catch {}
}
if (playwright === undefined) {
  console.error('m23-capture: playwright is required')
  process.exit(2)
}
const CHROME = process.env.M23_CHROME ?? process.env.CHATGPT_UI_CHROME ?? process.env.HOME + '/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome'
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
const maskedUrl = url.replace(/token=[^&]+/, 'token=***')
const screenshots = {}

const shot = async (page, name, clip) => {
  await page.screenshot({ path: join(SHOTS, name), ...(clip === undefined ? {} : { clip }) })
  screenshots[name.replace(/\.png$/, '')] = `docs/screenshots/${name}`
  return `docs/screenshots/${name}`
}

const openPage = async (context) => {
  const page = await context.newPage()
  await page.goto(url, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.chatgpt-session-row', { timeout: 30000 })
  await page.waitForFunction(() => document.body.getAttribute('data-chatgpt-ui') !== null, null, { timeout: 30000 })
  await page.waitForTimeout(1200)
  return page
}

const RAIL_READ = `() => {
  const rect = (el) => { if (el === null) return null; const b = el.getBoundingClientRect(); return { x: +b.x.toFixed(1), y: +b.y.toFixed(1), w: +b.width.toFixed(1), h: +b.height.toFixed(1) } }
  const nav = document.querySelector('.chatgpt-rail')
  return {
    buttons: [...(nav?.querySelectorAll('.chatgpt-rail-button') ?? [])].map((button) => {
      const style = getComputedStyle(button)
      const svg = button.querySelector('svg')
      const path = svg?.querySelector('path')
      return {
        label: button.getAttribute('aria-label'),
        state: button.getAttribute('data-cgpt-rail-state'),
        selected: button.getAttribute('aria-current') === 'page' || button.getAttribute('data-selected') === 'true',
        rect: rect(button),
        radius: style.borderRadius,
        padding: style.padding,
        background: style.backgroundColor,
        color: style.color,
        svg: svg === null ? null : { width: getComputedStyle(svg).width, height: getComputedStyle(svg).height, box: rect(svg) },
        path: path === null ? null : { d: path.getAttribute('d'), length: path.getAttribute('d')?.length ?? 0, fill: path.getAttribute('fill') }
      }
    }),
    projectKind: document.body.getAttribute('data-cgpt-project-kind'),
    projectOpen: document.body.hasAttribute('data-cgpt-project-open'),
    overview: document.querySelector('[data-cgpt-project-overview]') !== null,
    detail: document.querySelector('[data-cgpt-project-page]') !== null
  }
}`

const MENU_READ = `(selector) => {
  const rect = (el) => { if (el === null) return null; const b = el.getBoundingClientRect(); return { x: +b.x.toFixed(1), y: +b.y.toFixed(1), w: +b.width.toFixed(1), h: +b.height.toFixed(1), right: +b.right.toFixed(1), bottom: +b.bottom.toFixed(1) } }
  const menu = document.querySelector(selector)
  if (menu === null) return null
  const style = getComputedStyle(menu)
  const node = (el) => {
    if (el === null) return null
    const s = getComputedStyle(el)
    return {
      className: typeof el.className === 'string' ? el.className : '',
      text: (el.innerText ?? '').trim(),
      rect: rect(el),
      height: +el.getBoundingClientRect().height.toFixed(1),
      paddingLeft: s.paddingLeft,
      paddingTop: s.paddingTop,
      fontSize: s.fontSize,
      fontWeight: s.fontWeight,
      color: s.color,
      background: s.backgroundColor,
      radius: s.borderRadius,
      borderTop: s.borderTopWidth,
      disabled: el.disabled === true || el.getAttribute('aria-disabled') === 'true'
    }
  }
  return {
    rect: rect(menu),
    background: style.backgroundColor,
    color: style.color,
    radius: style.borderRadius,
    padding: style.padding,
    shadow: style.boxShadow,
    items: [...menu.querySelectorAll('.chatgpt-session-menu-item, [data-cgpt-project-menu-item]')].map(node),
    separators: [...menu.querySelectorAll('.chatgpt-session-menu-separator')].map((el) => ({ ...node(el), width: +el.getBoundingClientRect().width.toFixed(1) })),
    card: menu.querySelector('.chatgpt-project-menu-card') === null ? null : {
      rect: rect(menu.querySelector('.chatgpt-project-menu-card')),
      title: node(menu.querySelector('.chatgpt-project-menu-title')),
      icon: rect(menu.querySelector('.chatgpt-project-menu-icon')),
      star: rect(menu.querySelector('.chatgpt-project-menu-star')),
      meta: node(menu.querySelector('.chatgpt-project-menu-meta')),
      path: node(menu.querySelector('.chatgpt-project-menu-path'))
    }
  }
}`

const PERMISSION_READ = `() => {
  const rect = (el) => { if (el === null) return null; const b = el.getBoundingClientRect(); return { x: +b.x.toFixed(1), y: +b.y.toFixed(1), w: +b.width.toFixed(1), h: +b.height.toFixed(1), right: +b.right.toFixed(1), bottom: +b.bottom.toFixed(1) } }
  const menu = document.querySelector('[data-cgpt-work-menu="permission"]')
  if (menu === null) return null
  const style = getComputedStyle(menu)
  const rows = [...menu.querySelectorAll('[data-cgpt-permission-row]')].map((row) => {
    const title = row.querySelector('.chatgpt-work-menu-label')
    const description = row.querySelector('.chatgpt-permission-description')
    const check = row.querySelector('.chatgpt-work-menu-check')
    const s = getComputedStyle(row)
    return {
      value: row.getAttribute('data-cgpt-permission-row'),
      current: row.getAttribute('data-current') === 'true',
      checked: row.getAttribute('aria-checked'),
      title: title?.innerText.trim() ?? '',
      description: description?.innerText.trim() ?? '',
      titleSize: title === null ? null : getComputedStyle(title).fontSize,
      titleWeight: title === null ? null : getComputedStyle(title).fontWeight,
      descriptionSize: description === null ? null : getComputedStyle(description).fontSize,
      descriptionColor: description === null ? null : getComputedStyle(description).color,
      color: s.color,
      rowHeight: +row.getBoundingClientRect().height.toFixed(1),
      padding: s.padding,
      radius: s.borderRadius,
      icon: rect(row.querySelector('.chatgpt-permission-icon')),
      iconSvg: rect(row.querySelector('.chatgpt-permission-icon svg')),
      check: check !== null && check.querySelector('svg') !== null
    }
  })
  return {
    rect: rect(menu),
    background: style.backgroundColor,
    radius: style.borderRadius,
    padding: style.padding,
    shadow: style.boxShadow,
    rows,
    note: menu.querySelector('[data-cgpt-permission-note]')?.innerText.trim() ?? ''
  }
}`

const COLUMN_READ = `() => {
  const rect = (el) => { if (el === null) return null; const b = el.getBoundingClientRect(); return { x: +b.x.toFixed(1), w: +b.width.toFixed(1), right: +b.right.toFixed(1), center: +(b.x + b.width / 2).toFixed(1) } }
  const card = document.querySelector('[data-composer-card="true"]')
  const column = document.querySelector('[class*="EvIC1a_column"]')
  const body = document.querySelector('[class*="wSkVaW_body"]')
  const handle = document.querySelector('[class*="_widthHandle"][data-side="right"]')
  return {
    card: rect(card),
    column: rect(column),
    handle: rect(handle),
    contentWidth: body === null ? null : getComputedStyle(body).getPropertyValue('--dsh-chat-content-width').trim(),
    userWidth: body === null ? null : (body.style.getPropertyValue('--dsh-chat-user-width') || null),
    stored: localStorage.getItem('dsh.conversation.contentWidth'),
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
  }
}`

const capture = JSON.parse(readFileSync(join(ROOT, 'docs/capture/live/m23-rail-icons.json'), 'utf8'))
const iconCheck = JSON.parse(readFileSync(join(ROOT, 'docs/icon-check.json'), 'utf8'))
const expectedPath = (html) => {
  const match = html.match(/d="([^"]+)"/)
  return match === null ? null : match[1]
}
const expected = {
  schedules: expectedPath(capture.states.schedules.selected.inner),
  plugins: expectedPath(capture.states.plugins.selected.inner)
}

const result = {
  module: 'P0-11',
  title: '轨道选中态、单一列宽、双项目菜单、统一浮层（权限菜单为基准）',
  generatedAt: new Date().toISOString(),
  url: maskedUrl,
  viewport: { width: 1440, height: 960, widthPage: { width: 1920, height: 1080 } },
  screenshots,
  rail: {},
  width: {},
  menus: {},
  permission: {},
  meta: {
    iconCapture: 'docs/capture/live/m23-rail-icons.json',
    iconCheck: 'docs/icon-check.json',
    scripts: ['scripts/m23-ref-capture.mjs', 'scripts/m23-icons-merge.mjs', 'scripts/m23-capture.mjs'],
    readOnly: '只读采集：不发送消息、不新建会话、不改设置；只做按钮点击/悬停与宿主宽度手柄拖拽。'
  }
}

// ---------------------------------------------------------------- rail -----
const light = await browser.newContext({ viewport: { width: 1440, height: 960 }, locale: 'zh-CN', colorScheme: 'light' })
const page = await openPage(light)
const readRail = () => page.evaluate(`(${RAIL_READ})()`)

const railHome = await readRail()
result.rail.geometry = {
  button: railHome.buttons[0].rect,
  radius: railHome.buttons[0].radius,
  padding: railHome.buttons[0].padding,
  icon: railHome.buttons[0].svg,
  selectedBackground: railHome.buttons[0].background,
  selectedColor: railHome.buttons[0].color,
  webPadding: capture.geometry.button.skinPadding === undefined ? capture.geometry.button.padding : capture.geometry.button.skinPadding
}
check('轨道：五个入口 + 设置', railHome.buttons.length === 6, railHome.buttons.map((button) => button.label))
check('轨道：按钮 36×36 / 圆角 10 / 内边距 8 / 图标 20', railHome.buttons[0].rect.w === 36 && railHome.buttons[0].rect.h === 36 && railHome.buttons[0].radius === '10px' && railHome.buttons[0].padding === '8px' && railHome.buttons[0].svg.width === '20px' && railHome.buttons[0].svg.height === '20px', result.rail.geometry)
check('轨道：首页初始选中且为实心图标', railHome.buttons[0].state === 'selected' && railHome.buttons[0].selected === true, railHome.buttons[0])
await shot(page, 'm23-rail-home.png', { x: 0, y: 0, width: 52, height: 960 })

// Hover must paint only the background, never swap the glyph.
const pluginsButton = page.locator('.chatgpt-rail-button').nth(2)
const hoverBefore = railHome.buttons[2]
await pluginsButton.hover()
await page.waitForTimeout(240)
const hoverAfter = (await readRail()).buttons[2]
result.rail.hover = { before: { background: hoverBefore.background, color: hoverBefore.color, pathLength: hoverBefore.path.length }, after: { background: hoverAfter.background, color: hoverAfter.color, pathLength: hoverAfter.path.length } }
check('轨道：hover 只换背景，不换图标颜色/路径', hoverAfter.color === hoverBefore.color && hoverAfter.path.length === hoverBefore.path.length && hoverAfter.background !== hoverBefore.background, result.rail.hover)

const clickRail = async (index, wait = 1100) => {
  await page.locator('.chatgpt-rail-button').nth(index).click({ force: true })
  await page.waitForTimeout(wait)
  return readRail()
}

const railSchedules = await clickRail(1)
result.rail.schedules = railSchedules.buttons[1]
await shot(page, 'm23-rail-schedules.png', { x: 0, y: 0, width: 52, height: 960 })
check('轨道：定时任务选中使用实心 captured 路径', railSchedules.buttons[1].state === 'selected' && railSchedules.buttons[1].path.d === expected.schedules, { state: railSchedules.buttons[1].state, actual: railSchedules.buttons[1].path.d?.slice(0, 28), expected: expected.schedules?.slice(0, 28) })
check('轨道：定时任务选中时首页取消选中', railSchedules.buttons[0].state === 'default', railSchedules.buttons[0].state)

const railPlugins = await clickRail(2)
result.rail.plugins = railPlugins.buttons[2]
await shot(page, 'm23-rail-plugins.png', { x: 0, y: 0, width: 52, height: 960 })
check('轨道：插件选中使用实心 captured 路径', railPlugins.buttons[2].state === 'selected' && railPlugins.buttons[2].path.d === expected.plugins, { state: railPlugins.buttons[2].state, actual: railPlugins.buttons[2].path.d?.slice(0, 28), expected: expected.plugins?.slice(0, 28) })
check('轨道：插件选中时定时任务取消选中', railPlugins.buttons[1].state === 'default', railPlugins.buttons[1].state)

const railMore = await clickRail(3)
result.rail.more = railMore.buttons[3]
await shot(page, 'm23-rail-more.png', { x: 0, y: 0, width: 320, height: 960 })
await page.keyboard.press('Escape')
await page.waitForTimeout(300)

const railOverview = await clickRail(4)
result.rail.overview = { kind: railOverview.projectKind, states: railOverview.buttons.map((button) => [button.label, button.state]) }
await shot(page, 'm23-project-overview.png', undefined)
check('首页规则：项目总览页首页仍选中，项目未选中', railOverview.overview === true && railOverview.buttons[0].state === 'selected' && railOverview.buttons[4].state === 'default', result.rail.overview)

const overviewRow = page.locator('[data-cgpt-project-overview-row]').first()
check('项目总览有可进入的项目行', (await overviewRow.count()) > 0)
await overviewRow.click({ force: true })
await page.waitForTimeout(900)
const railDetail = await readRail()
result.rail.detail = { kind: railDetail.projectKind, states: railDetail.buttons.map((button) => [button.label, button.state]), path: railDetail.buttons[4].path }
await shot(page, 'm23-rail-projects.png', { x: 0, y: 0, width: 52, height: 960 })
await shot(page, 'm23-project-detail.png', undefined)
check('首页规则：项目详情页项目选中、首页取消', railDetail.detail === true && railDetail.buttons[4].state === 'selected' && railDetail.buttons[0].state === 'default', result.rail.detail)
check('项目详情页选中项目使用实心图标', railDetail.buttons[4].state === 'selected' && railDetail.buttons[4].path !== null && railDetail.buttons[4].path.d !== railHome.buttons[4].path.d, { selected: railDetail.buttons[4].path, default: railHome.buttons[4].path })

await clickRail(0)
const superRow = page.locator('[data-cgpt-super-agent]').first()
check('侧栏存在 super-agent 入口', (await superRow.count()) > 0)
await superRow.click({ force: true })
await page.waitForTimeout(1400)
const railSuper = await readRail()
result.rail.superAgent = { states: railSuper.buttons.map((button) => [button.label, button.state]) }
await shot(page, 'm23-home-super-agent.png', undefined)
check('首页规则：super-agent 页首页仍选中', railSuper.buttons[0].state === 'selected' && railSuper.buttons[4].state === 'default', result.rail.superAgent)
await clickRail(0)

// ------------------------------------------------------------- two menus ---
const head = page.locator('.chatgpt-project-head').first()
check('侧栏存在项目行', (await head.count()) > 0)
await head.hover()
await page.waitForTimeout(650)
const card = await page.evaluate(`(${MENU_READ})('[data-cgpt-session-menu="project"]')`)
const headRect = await head.boundingBox()
const moreButton = page.locator('.chatgpt-project-more').first()
const moreButtonRect = await moreButton.boundingBox()
result.menus.hover = {
  selector: '[data-cgpt-session-menu="project"]',
  trigger: headRect === null ? null : { x: +headRect.x.toFixed(1), y: +headRect.y.toFixed(1), w: +headRect.width.toFixed(1), h: +headRect.height.toFixed(1), right: +(headRect.x + headRect.width).toFixed(1) },
  card,
  entries: card === null ? [] : [card.card?.title?.text, card.card?.meta?.text, card.card?.path?.text, ...card.items.map((item) => item.text)].filter(Boolean)
}
if (card !== null && headRect !== null) {
  const clip = {
    x: Math.max(0, Math.floor(headRect.x - 8)),
    y: Math.max(0, Math.floor(headRect.y - 8)),
    width: Math.ceil(card.rect.right - headRect.x + 20),
    height: Math.ceil(card.rect.bottom - headRect.y + 16)
  }
  await shot(page, 'm23-project-hover-menu.png', clip)
}
check('悬停菜单：整卡在行右侧、与行顶对齐', card !== null && headRect !== null && Math.abs(card.rect.x - (headRect.x + headRect.width + 8)) <= 1 && Math.abs(card.rect.y - headRect.y) <= 1, { card: card?.rect, row: headRect && { right: headRect.x + headRect.width, top: headRect.y } })
check('悬停菜单：300 宽 / 圆角 16 / 内边距 12', card !== null && Math.abs(card.rect.w - 300) <= 1 && card.radius === '16px' && card.padding === '12px', card === null ? null : { w: card.rect.w, radius: card.radius, padding: card.padding })
check('悬停菜单：项目名 + 聊天数 + 路径 + 编辑项目', card !== null && card.card?.title?.text !== '' && card.card?.meta?.text?.includes('次聊天') && card.card?.path !== null && card.items.some((item) => item.text.includes('编辑项目')), result.menus.hover.entries)

await page.mouse.move(1000, 700)
await page.waitForTimeout(550)
const cardGone = await page.locator('[data-cgpt-session-menu="project"]').count()
check('悬停菜单：移出后收起', cardGone === 0)

await moreButton.click({ force: true })
await page.waitForTimeout(450)
const more = await page.evaluate(`(${MENU_READ})('[data-cgpt-session-menu="project-hover"]')`)
result.menus.more = {
  selector: '[data-cgpt-session-menu="project-hover"]',
  trigger: moreButtonRect === null ? null : { x: +moreButtonRect.x.toFixed(1), y: +moreButtonRect.y.toFixed(1), w: +moreButtonRect.width.toFixed(1), h: +moreButtonRect.height.toFixed(1), right: +(moreButtonRect.x + moreButtonRect.width).toFixed(1), bottom: +(moreButtonRect.y + moreButtonRect.height).toFixed(1) },
  menu: more,
  entries: more === null ? [] : more.items.map((item) => item.text)
}
if (more !== null && moreButtonRect !== null) {
  const clip = {
    x: Math.max(0, Math.floor(headRect.x - 8)),
    y: Math.max(0, Math.floor(headRect.y - 8)),
    width: Math.ceil(more.rect.right - headRect.x + 20),
    height: Math.ceil(more.rect.bottom - headRect.y + 16)
  }
  await shot(page, 'm23-project-more-menu.png', clip)
}
check('更多菜单：锚在 ⋯ 右下（与悬停卡不同锚点）', more !== null && moreButtonRect !== null && Math.abs(more.rect.x - (moreButtonRect.x + moreButtonRect.width + 8)) <= 1 && Math.abs(more.rect.y - (moreButtonRect.y + moreButtonRect.height + 4)) <= 1, { menu: more?.rect, button: moreButtonRect })
check('更多菜单与悬停卡锚点不同', card !== null && more !== null && (Math.abs(card.rect.y - more.rect.y) > 1 || Math.abs(card.rect.x - more.rect.x) > 1), { card: card?.rect, more: more?.rect })
check('更多菜单：六项 + 三条分组分隔线', more !== null && more.items.length === 6 && more.separators.length === 3, result.menus.more.entries)
const moreInset = more === null ? 0 : parseFloat(more.padding) * 2 + 2
check('更多菜单：行高 40 / 图标 20 / 左内边距 12 / 整宽分隔线', more !== null && more.items.every((item) => Math.abs(item.height - 40) <= 1 && item.paddingLeft === '12px') && more.separators.every((separator) => Math.abs(separator.width - (more.rect.w - moreInset)) <= 1), more === null ? null : { heights: more.items.map((item) => item.height), padding: more.items.map((item) => item.paddingLeft), separators: more.separators.map((separator) => separator.width), menuWidth: more.rect.w, borderBoxInset: moreInset })
check('更多菜单条目顺序：置顶/编辑 ─ 分区/打开 ─ 归档 ─ 移除', more !== null && ['置顶', '编辑', '分区', '在资源管理器中打开', '归档聊天', '移除项目'].every((label, index) => more.items[index]?.text.includes(label)) && more.separators.length === 3, result.menus.more.entries)
await page.keyboard.press('Escape')
await page.waitForTimeout(300)

// ------------------------------------------------------------- permission ---
const openPermission = async (target) => {
  const trigger = target.locator('[data-cgpt-permission]').first()
  await trigger.scrollIntoViewIfNeeded()
  await trigger.click({ force: true })
  await target.waitForTimeout(500)
  return target.evaluate(`(${PERMISSION_READ})()`)
}
const permissionLight = await openPermission(page)
result.permission.light = permissionLight
if (permissionLight !== null) {
  await shot(page, 'm23-permission-light.png', {
    x: Math.max(0, Math.floor(permissionLight.rect.x - 16)),
    y: Math.max(0, Math.floor(permissionLight.rect.y - 16)),
    width: Math.ceil(permissionLight.rect.w + 32),
    height: Math.ceil(permissionLight.rect.h + 32)
  })
}
const permissionRows = (entry) => entry === null ? [] : entry.rows
check('权限菜单：三项，标题与描述完整', permissionLight !== null && permissionLight.rows.length === 3 && ['请求批准', '帮我批准', '完全访问权限'].every((title, index) => permissionRows(permissionLight)[index]?.title === title) && permissionRows(permissionLight).every((row) => row.description.length > 6), permissionRows(permissionLight).map((row) => [row.title, row.description]))
check('权限菜单：亮色容器白底 / 圆角 16 / 内边距 8', permissionLight !== null && permissionLight.background === 'rgb(255, 255, 255)' && permissionLight.radius === '16px' && permissionLight.padding === '8px', permissionLight === null ? null : { background: permissionLight.background, radius: permissionLight.radius, padding: permissionLight.padding })
check('权限菜单：标题 15/600、描述 13、行高 ≥52、图标 20', permissionLight !== null && permissionRows(permissionLight).every((row) => row.titleSize === '15px' && row.titleWeight === '600' && row.descriptionSize === '13px' && row.rowHeight >= 52 && row.icon?.w === 20 && row.iconSvg?.w === 20), permissionRows(permissionLight).map((row) => [row.titleSize, row.titleWeight, row.descriptionSize, row.rowHeight, row.icon?.w, row.iconSvg?.w]))
check('权限菜单：当前项右侧有勾', permissionLight !== null && permissionRows(permissionLight).some((row) => row.current === true && row.check === true), permissionRows(permissionLight).map((row) => [row.value, row.current, row.check]))
check('权限菜单：最后一项整行橙色 #F08A5D', permissionRows(permissionLight)[2]?.color === 'rgb(240, 138, 93)' && permissionRows(permissionLight)[2]?.descriptionColor === 'rgb(240, 138, 93)', permissionRows(permissionLight)[2] && { color: permissionRows(permissionLight)[2].color, descriptionColor: permissionRows(permissionLight)[2].descriptionColor })
await page.keyboard.press('Escape')
await page.waitForTimeout(300)

// ---------------------------------------------------------------- width ----
const wide = await browser.newContext({ viewport: { width: 1920, height: 1080 }, locale: 'zh-CN', colorScheme: 'light' })
const widePage = await openPage(wide)
await widePage.locator('.chatgpt-session-row').filter({ hasNotText: '新会话' }).first().click()
await widePage.waitForTimeout(2400)
const before = await widePage.evaluate(`(${COLUMN_READ})()`)
const handle = await widePage.locator('[class*="_widthHandle"][data-side="right"]').first().boundingBox()
if (handle === null) throw new Error('m23-capture: width handle not found')
await widePage.mouse.move(handle.x + 4, handle.y + 200)
await widePage.mouse.down()
for (let i = 1; i <= 20; i += 1) {
  await widePage.mouse.move(handle.x + 4 + i * 25, handle.y + 200)
  await widePage.waitForTimeout(20)
}
const during = await widePage.evaluate(`(${COLUMN_READ})()`)
await widePage.mouse.up()
await widePage.waitForTimeout(450)
const after = await widePage.evaluate(`(${COLUMN_READ})()`)
result.width = {
  before,
  during,
  after,
  gain: round(after.column.w - before.column.w),
  equality: { before: round(Math.abs(before.card.w - before.column.w)), during: round(Math.abs(during.card.w - during.column.w)), after: round(Math.abs(after.card.w - after.column.w)) },
  centers: { before: [before.card.center, before.column.center], after: [after.card.center, after.column.center] },
  textMax: { before: before.column.w, after: after.column.w, capRemoved: before.column.w <= 920 && after.column.w > 920 },
  cardMax: { before: before.card.w, after: after.card.w },
  overflow: after.overflow,
  stored: after.stored,
  rule: '30-chat.css 的正文列 max-width 改为 var(--dsh-chat-content-width, var(--cgpt-msg-max, 920px))，删掉 min(…, 920px) 文本上限；卡片/代码块/附件都读同一条列宽。'
}
await shot(widePage, 'm23-width-max.png', undefined)
check('列宽：拖拽后正文列显著变宽', result.width.gain >= 40, result.width.gain)
check('列宽：最大拖拽后输入卡与正文列同宽（≤1px）', result.width.equality.after <= 1, result.width.equality)
check('列宽：拖拽过程中同宽（≤1px）', result.width.equality.during <= 1, result.width.equality)
check('列宽：正文上限从 920 解除（>920）', result.width.textMax.capRemoved === true, result.width.textMax)
check('列宽：无横向溢出', result.width.overflow <= 1, result.width.overflow)
check('列宽：宿主记录宽度', result.width.stored !== null && Math.abs(Number(result.width.stored) - result.width.after.column.w) <= 2, result.width.stored)

// ------------------------------------------------------------ dark overlay --
const dark = await browser.newContext({ viewport: { width: 1440, height: 960 }, locale: 'zh-CN', colorScheme: 'dark' })
const darkPage = await openPage(dark)
const permissionDark = await openPermission(darkPage)
result.permission.dark = permissionDark
if (permissionDark !== null) {
  await shot(darkPage, 'm23-permission-dark.png', {
    x: Math.max(0, Math.floor(permissionDark.rect.x - 16)),
    y: Math.max(0, Math.floor(permissionDark.rect.y - 16)),
    width: Math.ceil(permissionDark.rect.w + 32),
    height: Math.ceil(permissionDark.rect.h + 32)
  })
}
check('权限菜单：暗色容器 #2B2B2B / 圆角 16 / 内边距 8', permissionDark !== null && permissionDark.background === 'rgb(43, 43, 43)' && permissionDark.radius === '16px' && permissionDark.padding === '8px', permissionDark === null ? null : { background: permissionDark.background, radius: permissionDark.radius, padding: permissionDark.padding })
check('权限菜单：暗色三项与亮色文案一致', permissionDark !== null && permissionRows(permissionDark).length === 3 && permissionRows(permissionDark).every((row, index) => row.title === permissionRows(permissionLight)[index]?.title && row.description === permissionRows(permissionLight)[index]?.description), permissionRows(permissionDark).map((row) => row.title))

// The project card is the other reference surface: #2B2B2B in dark mode,
// 16px corners and the 12px inset the brief calls out.
await darkPage.keyboard.press('Escape')
await darkPage.waitForTimeout(300)
const darkHead = darkPage.locator('.chatgpt-project-head').first()
await darkHead.hover()
await darkPage.waitForTimeout(650)
const darkCard = await darkPage.evaluate(`(${MENU_READ})('[data-cgpt-session-menu="project"]')`)
const darkHeadRect = await darkHead.boundingBox()
result.menus.darkCard = {
  selector: '[data-cgpt-session-menu="project"]',
  card: darkCard,
  trigger: darkHeadRect === null ? null : { x: +darkHeadRect.x.toFixed(1), y: +darkHeadRect.y.toFixed(1), w: +darkHeadRect.width.toFixed(1), h: +darkHeadRect.height.toFixed(1) }
}
if (darkCard !== null && darkHeadRect !== null) {
  await shot(darkPage, 'm23-project-hover-menu-dark.png', {
    x: Math.max(0, Math.floor(darkHeadRect.x - 8)),
    y: Math.max(0, Math.floor(darkHeadRect.y - 8)),
    width: Math.ceil(darkCard.rect.right - darkHeadRect.x + 20),
    height: Math.ceil(darkCard.rect.bottom - darkHeadRect.y + 16)
  })
}
check('悬停菜单暗色：#2B2B2B / 圆角 16 / 内边距 12', darkCard !== null && darkCard.background === 'rgb(43, 43, 43)' && darkCard.radius === '16px' && darkCard.padding === '12px', darkCard === null ? null : { background: darkCard.background, radius: darkCard.radius, padding: darkCard.padding })

// ------------------------------------------------------------- icon gate ---
const iconResult = (glyph) => iconCheck.results.find((entry) => entry.glyph === glyph && entry.variant === 'selected')
result.rail.iconDiff = {
  staticPass: iconCheck.pass,
  staticTotal: iconCheck.glyphs,
  staticDiff: iconCheck.diff,
  schedules: iconResult('schedules')?.ratio ?? null,
  plugins: iconResult('plugins')?.ratio ?? null,
  live: iconCheck.live ?? [],
  liveWorst: Math.max(...(iconCheck.live ?? []).map((entry) => entry.ratio ?? 100)),
  method: 'tools/icon-check.mjs --dpr 4：静态 20×20 放大 4× 逐像素；live 为按钮内真实 20px SVG 在 DPR4 下的截图'
}
check('图标：静态 28 个状态全部 0 差异', iconCheck.pass === 28 && iconCheck.diff === 0 && iconCheck.glyphs === 28, { pass: iconCheck.pass, diff: iconCheck.diff })
check('图标：定时任务选中静态 diff 0%', (iconResult('schedules')?.ratio ?? 100) <= 0, iconResult('schedules'))
check('图标：插件选中静态 diff 0%', (iconResult('plugins')?.ratio ?? 100) <= 0, iconResult('plugins'))
check('图标：live 5 个入口差异 ≤2%', (iconCheck.live ?? []).length === 5 && result.rail.iconDiff.liveWorst <= 2, result.rail.iconDiff.liveWorst)

// -------------------------------------------------------------- evidence ---
const failed = assertions.filter((entry) => entry.pass !== true)
result.assertions = assertions
result.summary = { total: assertions.length, passed: assertions.length - failed.length, failed: failed.length }
writeFileSync(join(DOCS, 'm23.json'), `${JSON.stringify(result, null, 2)}\n`)
console.log(`\nm23: ${result.summary.passed}/${result.summary.total} checks passed → docs/m23.json`)
await browser.close()
if (failed.length > 0) process.exit(1)
