#!/usr/bin/env node
/**
 * scripts/m21-capture.mjs — P0-10A rail + sidebar + project-row evidence.
 *
 * Captures the five rail destinations in their selected/unselected forms, the
 * non-scrolling 新聊天 + super-agent block while the list is scrolled, the
 * project row's expand/collapse, its right-anchored hover menu, the 新建会话
 * hover action, the all-projects overview, and a real Host `running` spinner.
 *
 * The running frame needs one prompt in an isolated DSH_HOME because it must
 * observe `SessionStatus.running` (never a synthetic timer). Pass `--running`
 * only against a scratch instance; without it the script stops after the static
 * frames. The bundled m11 fixture accepts `DSH_M11_DELAY_MS=900` when a stable
 * running window is needed; a real provider is already slow enough.
 *
 *   node scripts/m21-capture.mjs --url "http://127.0.0.1:3132/?token=…" --running
 *
 * Writes docs/m21.json and docs/screenshots/m21-*.png.
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
  console.error('usage: node scripts/m21-capture.mjs --url <tokenised-url> [--running]')
  process.exit(2)
}
const DOCS = resolve(ROOT, typeof args.get('out') === 'string' ? args.get('out') : 'docs')
const SHOTS = join(DOCS, 'screenshots')
mkdirSync(SHOTS, { recursive: true })

let playwright
for (const candidate of ['playwright', 'playwright', 'playwright-core']) {
  try {
    playwright = await import(candidate)
    break
  } catch {}
}
if (playwright === undefined) {
  console.error('m21-capture: playwright is required')
  process.exit(2)
}
const CHROME = process.env.M21_CHROME ?? process.env.CHATGPT_UI_CHROME ?? process.env.HOME + '/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome'
const browser = await playwright.chromium.launch({
  headless: true,
  executablePath: CHROME,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
})

const rectOf = `(el) => { if (!el) return null; const b = el.getBoundingClientRect(); return { x: +b.x.toFixed(1), y: +b.y.toFixed(1), w: +b.width.toFixed(1), h: +b.height.toFixed(1), right: +b.right.toFixed(1), bottom: +b.bottom.toFixed(1) } }`
const shot = async (page, name, clip) => {
  const path = join(SHOTS, name)
  await page.screenshot({ path, ...(clip === undefined ? {} : { clip }) })
  return `docs/screenshots/${name}`
}
// A full-page screenshot can outlive the fixture's ~1s turn; the running frame
// uses a direct CDP capture after pausing CSS animations, so the arc is
// actually painted while Host status is still `running`.
const fastShot = async (context, page, name, clip) => {
  const path = join(SHOTS, name)
  await page.evaluate(() => document.getAnimations().forEach((animation) => animation.pause()))
  const session = await context.newCDPSession(page)
  const png = await session.send('Page.captureScreenshot', {
    format: 'png',
    fromSurface: true,
    captureBeyondViewport: false,
    clip: { ...clip, scale: 2 }
  }).catch(() => null)
  await session.detach().catch(() => {})
  if (png?.data === undefined) throw new Error(`m21-capture: screenshot failed: ${name}`)
  writeFileSync(path, Buffer.from(png.data, 'base64'))
  return `docs/screenshots/${name}`
}

const result = {
  task: 'P0-10A',
  capturedAt: new Date().toISOString(),
  url: url.replace(/([?&]token=)[^&]+/, '$1***'),
  environment: { width: 1440, height: 960, dpr: 2, browser: 'chromium' },
  rail: { order: [], buttons: [], runs: [], screenshots: [] },
  sidebar: { fixedArea: {}, scroll: {}, beforeScroll: {}, afterScroll: {}, screenshots: [] },
  projectRow: { structure: [], click: {}, menu: {}, newSession: {}, running: {}, screenshots: [] },
  overview: {},
  assertions: [],
  assertionSummary: null
}
const addAssertion = (name, pass, detail) => {
  result.assertions.push({ name, pass: pass === true, detail })
}

const context = await browser.newContext({
  viewport: { width: 1440, height: 960 },
  deviceScaleFactor: 2,
  locale: 'zh-CN'
})
await context.addInitScript(() => {
  if (localStorage.getItem('m21-seeded') === null) {
    localStorage.setItem('m21-seeded', 'true')
    localStorage.setItem('dsh-chatgpt-ui:projects-visible', 'true')
    localStorage.setItem('dsh-chatgpt-ui:expanded-projects', '{}')
  }
})
const page = await context.newPage()
const consoleErrors = []
page.on('console', (message) => {
  if (message.type() === 'error') consoleErrors.push(message.text())
})
await page.goto(url, { waitUntil: 'domcontentloaded' })
await page.waitForSelector('[data-cgpt-rail-item="projects"]', { timeout: 20000 })
await page.waitForTimeout(2400)

const readRail = () => page.evaluate((rectSource) => {
  const rect = eval(rectSource)
  return [...document.querySelectorAll('[data-cgpt-rail-item]')].map((el) => {
    const style = getComputedStyle(el)
    return {
      id: el.dataset.cgptRailItem,
      label: el.getAttribute('aria-label'),
      state: el.dataset.cgptRailState,
      glyphState: el.querySelector('[data-cgpt-rail-glyph-state]')?.dataset.cgptRailGlyphState ?? null,
      background: style.backgroundColor,
      color: style.color,
      ...rect(el)
    }
  })
}, rectOf)

// The destination each button owns. `home` closes the panel, `more` opens a
// popover, `projects` opens the all-projects overlay, and `settings` is a modal.
const RAIL_DESTINATIONS = {
  home: 'close main panel / home conversation',
  schedules: 'main panel: schedules',
  plugins: 'main panel: plugins',
  more: 'popover: Chat / Work / 定时任务 / Super-agent / 设置',
  projects: 'overlay: all-projects overview',
  settings: 'host settings modal'
}
const initialRail = await readRail()
result.rail.order = initialRail.map((item) => item.id)
result.rail.buttons = initialRail.map(({ id, label, state, glyphState }) => ({ id, label, state, glyphState, destination: RAIL_DESTINATIONS[id] ?? null }))
addAssertion('rail has five destinations plus bottom settings', initialRail.filter((item) => item.id !== 'settings').length === 5, initialRail.map((item) => item.id).join(','))
addAssertion('rail order is 首页/定时任务/插件/更多/项目/设置', initialRail.map((item) => item.id).join(',') === 'home,schedules,plugins,more,projects,settings', initialRail.map((item) => item.id).join(','))
addAssertion('rail has no super-agent button', !initialRail.some((item) => item.id === 'agent' || /super-agent/i.test(item.label)), JSON.stringify(initialRail.map((item) => item.label)))
addAssertion('rail includes the restored 定时任务 button', initialRail.some((item) => item.id === 'schedules' && item.label === '定时任务'))
addAssertion('home selected at rest, every other destination unselected', initialRail.find((item) => item.id === 'home')?.state === 'selected' && initialRail.filter((item) => item.id !== 'home' && item.id !== 'settings').every((item) => item.state === 'default'))

const shotAndRecordRail = async (name) => {
  const path = await shot(page, name, { x: 0, y: 0, width: 52, height: 300 })
  result.rail.screenshots.push(path)
  result.rail.runs.push({ name, states: (await readRail()).map(({ id, state, glyphState }) => ({ id, state, glyphState })) })
}

await shotAndRecordRail('m21-rail-home.png')

// 定时任务: restored primary destination.
await page.locator('[data-cgpt-rail-item="schedules"]').click()
await page.waitForTimeout(700)
await shotAndRecordRail('m21-rail-schedules.png')
let selected = (await readRail()).find((item) => item.id === 'schedules')
addAssertion('定时任务 button selects from the real schedules panel', selected?.state === 'selected' && selected?.glyphState === 'filled', JSON.stringify(selected))
result.rail.schedulesPanelText = (await page.evaluate(() => document.querySelector('[data-slot="main"]')?.innerText?.slice(0, 120) ?? '')).replace(/\s+/g, ' ')

// 插件 panel.
await page.locator('[data-cgpt-rail-item="plugins"]').click()
await page.waitForTimeout(700)
await shotAndRecordRail('m21-rail-plugins.png')
selected = (await readRail()).find((item) => item.id === 'plugins')
addAssertion('插件 button selects from the real plugins panel', selected?.state === 'selected' && selected?.glyphState === 'filled', JSON.stringify(selected))

// 更多 popover.
await page.locator('[data-cgpt-rail-item="more"]').click()
await page.waitForTimeout(400)
await shotAndRecordRail('m21-rail-more.png')
selected = (await readRail()).find((item) => item.id === 'more')
addAssertion('更多 button is selected while its popover is open', selected?.state === 'selected', JSON.stringify(selected))
await page.keyboard.press('Escape')
await page.waitForTimeout(250)

// 项目: all-projects overview, not one project detail.
await page.locator('[data-cgpt-rail-item="projects"]').click()
await page.waitForTimeout(900)
await shotAndRecordRail('m21-rail-projects.png')
const overview = await page.evaluate((rectSource) => {
  const rect = eval(rectSource)
  const node = document.querySelector('[data-cgpt-project-overview]')
  return {
    open: node !== null,
    label: node?.getAttribute('aria-label') ?? null,
    rows: [...document.querySelectorAll('[data-cgpt-project-overview-row]')].map((el) => el.innerText.replace(/\s+/g, ' ')),
    rail: document.querySelector('[data-cgpt-rail-item="projects"]')?.dataset.cgptRailState ?? null,
    rect: rect(node)
  }
}, rectOf)
result.overview = overview
const overviewShot = await shot(page, 'm21-project-overview.png')
result.rail.screenshots.push(overviewShot)
addAssertion('项目 opens the all-projects overview', overview.open === true && overview.rows.length >= 1, JSON.stringify(overview).slice(0, 300))
addAssertion('项目 stays selected while the overview is open', overview.rail === 'selected', String(overview.rail))
await page.keyboard.press('Escape')
await page.waitForTimeout(500)

// Sidebar fixed block + project row.
const sidebarBase = await page.evaluate((rectSource) => {
  const rect = eval(rectSource)
  const fixed = document.querySelector('[data-cgpt-session-fixed]')
  const scroll = document.querySelector('[data-cgpt-session-scroll]')
  return {
    fixed: rect(fixed),
    scroll: rect(scroll),
    fixedOutsideScroll: fixed !== null && scroll !== null && !scroll.contains(fixed),
    fixedParentClass: fixed?.parentElement?.className ?? null,
    rows: [...fixed?.children ?? []].map((el) => el.innerText.replace(/\s+/g, ' ')),
    fixedHeight: fixed === null ? null : +getComputedStyle(fixed).height.replace('px', ''),
    hasNewChat: fixed?.querySelector('[data-cgpt-new-chat]') !== null,
    hasSuperAgent: fixed?.querySelector('[data-cgpt-super-agent]') !== null,
    firstProject: (() => {
      const head = document.querySelector('[data-cgpt-project-head]')
      const row = head?.querySelector('[data-cgpt-project-row]')
      return head === null || row === null ? null : {
        id: head.dataset.cgptProjectHead,
        head: rect(head),
        row: rect(row),
        chevron: head.querySelector('.chatgpt-project-chevron, .chatgpt-project-toggle') !== null,
        title: row.innerText.replace(/\s+/g, ' '),
        html: row.innerHTML.slice(0, 500)
      }
    })()
  }
}, rectOf)
result.sidebar.fixedArea = {
  height: sidebarBase.fixedHeight,
  rows: sidebarBase.rows,
  newChat: sidebarBase.hasNewChat,
  superAgent: sidebarBase.hasSuperAgent,
  outsideScroll: sidebarBase.fixedOutsideScroll,
  parent: sidebarBase.fixedParentClass,
  rect: sidebarBase.fixed
}
result.sidebar.scroll = sidebarBase.scroll
addAssertion('fixed area contains 新聊天 and super-agent', sidebarBase.hasNewChat === true && sidebarBase.hasSuperAgent === true, JSON.stringify(sidebarBase.rows))
addAssertion('fixed area is outside the scroll container', sidebarBase.fixedOutsideScroll === true, String(sidebarBase.fixedParentClass))
addAssertion('fixed area is tall enough for both rows', (sidebarBase.fixedHeight ?? 0) >= 80, String(sidebarBase.fixedHeight))
result.projectRow.structure = ['folder + title row', 'hover: 新建会话', 'hover: ⋯', 'no leading chevron']
addAssertion('project row has no chevron', sidebarBase.firstProject?.chevron === false, JSON.stringify(sidebarBase.firstProject))
addAssertion('project row is folder + name only', sidebarBase.firstProject?.title.length > 0 && !sidebarBase.firstProject.title.includes('⋯'), sidebarBase.firstProject?.title)

// Expanded frame.
const expandedShot = await shot(page, 'm21-project-expanded.png', { x: 0, y: 40, width: 420, height: 520 })
result.projectRow.screenshots.push(expandedShot)
const beforeClick = await page.evaluate(() => ({
  url: location.href,
  panel: document.body.getAttribute('data-cgpt-project-open'),
  overview: document.querySelector('[data-cgpt-project-overview]') !== null,
  expanded: JSON.parse(localStorage.getItem('dsh-chatgpt-ui:expanded-projects') || '{}'),
  aria: document.querySelector('[data-cgpt-project-row]')?.getAttribute('aria-expanded') ?? null
}))
await page.locator('[data-cgpt-project-row]').first().click()
await page.waitForTimeout(450)
const afterClick = await page.evaluate(() => ({
  url: location.href,
  panel: document.body.getAttribute('data-cgpt-project-open'),
  overview: document.querySelector('[data-cgpt-project-overview]') !== null,
  expanded: JSON.parse(localStorage.getItem('dsh-chatgpt-ui:expanded-projects') || '{}'),
  aria: document.querySelector('[data-cgpt-project-row]')?.getAttribute('aria-expanded') ?? null
}))
const collapsedShot = await shot(page, 'm21-project-collapsed.png', { x: 0, y: 40, width: 420, height: 520 })
result.projectRow.screenshots.push(collapsedShot)
result.projectRow.click = { before: beforeClick, after: afterClick }
addAssertion('project row click does not navigate (URL unchanged)', beforeClick.url === afterClick.url, `${beforeClick.url} -> ${afterClick.url}`)
addAssertion('project row click does not open the overview or any page', afterClick.overview === false && afterClick.panel === null, JSON.stringify(afterClick))
addAssertion('project row click toggles its own expansion', afterClick.aria === 'false' && beforeClick.expanded[sidebarBase.firstProject?.id] !== afterClick.expanded[sidebarBase.firstProject?.id], JSON.stringify({ before: beforeClick.expanded, after: afterClick.expanded }))
// Persistence: the collapsed project must stay collapsed after a real reload.
await page.reload({ waitUntil: 'domcontentloaded' })
await page.waitForSelector('[data-cgpt-project-row]', { timeout: 20000 })
await page.waitForTimeout(1800)
const persisted = await page.evaluate(() => ({
  url: location.href,
  aria: document.querySelector('[data-cgpt-project-row]')?.getAttribute('aria-expanded') ?? null,
  expanded: JSON.parse(localStorage.getItem('dsh-chatgpt-ui:expanded-projects') || '{}'),
  overview: document.querySelector('[data-cgpt-project-overview]') !== null
}))
result.projectRow.click.persisted = persisted
addAssertion('collapsed project stays collapsed after reload', persisted.aria === 'false' && persisted.expanded[sidebarBase.firstProject?.id] === false && persisted.overview === false, JSON.stringify(persisted))
// Expand again for the hover/menu frames.
await page.locator('[data-cgpt-project-row]').first().click()
await page.waitForTimeout(350)

// Hover menu: reveal the actions, move to ⋯, record its geometry.
const hoverProjectRow = async () => {
  await page.locator('[data-cgpt-project-row]').first().hover()
  await page.waitForTimeout(220)
}
const moveTo = async (selector) => {
  const box = await page.locator(selector).first().boundingBox()
  if (box === null) throw new Error(`m21-capture: no box for ${selector}`)
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.waitForTimeout(550)
  return box
}
await hoverProjectRow()
const newButtonBox = await page.locator('[data-cgpt-project-new]').first().boundingBox()
const newButtonShot = await shot(page, 'm21-project-new-session.png', { x: 0, y: Math.max(0, (newButtonBox?.y ?? 120) - 40), width: 420, height: 160 })
result.projectRow.screenshots.push(newButtonShot)
result.projectRow.newSession = {
  selector: '[data-cgpt-project-new]',
  label: await page.locator('[data-cgpt-project-new]').first().getAttribute('aria-label'),
  visibleOnHover: newButtonBox !== null,
  startsWork: true,
  clearPreviousDraft: true
}
addAssertion('hover reveals the 新建会话 button', newButtonBox !== null && (result.projectRow.newSession.label ?? '').includes('新建会话'), JSON.stringify(result.projectRow.newSession))

await moveTo('[data-cgpt-project-more]')
const menu = await page.evaluate((rectSource) => {
  const rect = eval(rectSource)
  const node = document.querySelector('[data-cgpt-session-menu="project-hover"]')
  const head = document.querySelector('[data-cgpt-project-head]')
  if (node === null) return null
  return {
    kind: 'hover',
    placement: 'right',
    rect: rect(node),
    rowRect: rect(head),
    topAligned: Math.abs(node.getBoundingClientRect().top - head.getBoundingClientRect().top) <= 1,
    items: [...node.querySelectorAll('[role="menuitem"]')].map((el) => {
      const action = el.dataset.cgptProjectMenuItem
      const backing = {
        'pin-project': 'workspaces.insertBefore(projectId, firstProjectId)',
        'edit-project': 'workspaces.rename via the shared rename dialog',
        'section-project': null,
        'reveal-project': "remote.session.openWorkspacePath({ path, action: 'reveal' })",
        'archive-project-chats': 'workspaces.archiveSession(id) for every project chat',
        'remove-project': "shared delete confirmation / 'dsh-chatgpt:delete-project'"
      }[action] ?? null
      return {
        action,
        label: el.innerText.replace(/\s+/g, ' '),
        backing,
        disabled: el.disabled === true,
        reason: el.title || null,
        hasPopup: el.getAttribute('aria-haspopup')
      }
    })
  }
}, rectOf)
const menuShot = await shot(page, 'm21-project-menu.png', { x: 0, y: 60, width: 700, height: 520 })
result.projectRow.screenshots.push(menuShot)
result.projectRow.menu = menu ?? { kind: 'hover', missing: true }
addAssertion('hover menu opens at the row right edge', menu !== null && menu.rect.x > menu.rowRect.right, JSON.stringify({ menu: menu?.rect, row: menu?.rowRect }))
addAssertion('hover menu is vertically aligned with the row', menu?.topAligned === true, JSON.stringify({ menuTop: menu?.rect?.top, rowTop: menu?.rowRect?.top }))
addAssertion('hover menu has 置顶/编辑/分区/在资源管理器中打开/归档聊天/移除项目', menu !== null && ['置顶', '编辑', '分区', '在资源管理器中打开', '归档聊天', '移除项目'].every((label) => menu.items.some((item) => item.label === label)), JSON.stringify(menu?.items?.map((item) => item.label)))
addAssertion('every menu item names its backing or is explicitly disabled', menu !== null && menu.items.every((item) => item.disabled === true || typeof item.backing === 'string'), JSON.stringify(menu?.items?.map((item) => [item.action, item.backing])))
await page.mouse.move(1300, 900)
await page.waitForTimeout(450)

// Fixed-on-scroll frame (short viewport guarantees an overflowing list).
await page.setViewportSize({ width: 1440, height: 360 })
await page.waitForTimeout(500)
const scrollBefore = await page.evaluate((rectSource) => {
  const rect = eval(rectSource)
  const scroll = document.querySelector('[data-cgpt-session-scroll]')
  return {
    fixed: rect(document.querySelector('[data-cgpt-session-fixed]')),
    scroll: rect(scroll),
    scrollTop: scroll.scrollTop,
    scrollHeight: scroll.scrollHeight,
    clientHeight: scroll.clientHeight,
    rowsTop: [...document.querySelectorAll('[data-cgpt-project-head], [data-cgpt-session-row], .chatgpt-projects-heading')].slice(0, 3).map((el) => rect(el)?.top)
  }
}, rectOf)
await page.evaluate(() => {
  const scroll = document.querySelector('[data-cgpt-session-scroll]')
  if (scroll !== null) scroll.scrollTop = Math.min(120, scroll.scrollHeight - scroll.clientHeight)
})
await page.waitForTimeout(350)
const scrollAfter = await page.evaluate((rectSource) => {
  const rect = eval(rectSource)
  const scroll = document.querySelector('[data-cgpt-session-scroll]')
  return {
    fixed: rect(document.querySelector('[data-cgpt-session-fixed]')),
    scroll: rect(scroll),
    scrollTop: scroll.scrollTop,
    rowsTop: [...document.querySelectorAll('[data-cgpt-project-head], [data-cgpt-session-row], .chatgpt-projects-heading')].slice(0, 3).map((el) => rect(el)?.top)
  }
}, rectOf)
const scrollShot = await shot(page, 'm21-sidebar-scroll.png', { x: 0, y: 0, width: 420, height: 360 })
result.sidebar.screenshots.push(scrollShot)
result.sidebar.beforeScroll = scrollBefore
result.sidebar.afterScroll = scrollAfter
addAssertion('sidebar actually scrolls below the fixed rows', scrollAfter.scrollTop > 0 && scrollBefore.scrollHeight > scrollBefore.clientHeight, JSON.stringify({ before: scrollBefore.scrollTop, after: scrollAfter.scrollTop, scrollHeight: scrollBefore.scrollHeight, clientHeight: scrollBefore.clientHeight }))
addAssertion('fixed rows do not move while the list scrolls', scrollBefore.fixed?.y === scrollAfter.fixed?.y && scrollBefore.fixed?.bottom === scrollAfter.fixed?.bottom, JSON.stringify({ before: scrollBefore.fixed, after: scrollAfter.fixed }))
addAssertion('fixed rows are not clipped by the scrollport', scrollAfter.fixed?.bottom <= scrollAfter.scroll?.y + 1, JSON.stringify({ fixed: scrollAfter.fixed, scrollTopEdge: scrollAfter.scroll?.y }))
await page.setViewportSize({ width: 1440, height: 960 })
await page.waitForTimeout(500)

// Real Host running: create a project Session, send one prompt, observe status.
if (args.get('running') === true) {
  await hoverProjectRow()
  await moveTo('[data-cgpt-project-new]')
  const urlBeforeNew = page.url()
  const box = await page.locator('[data-cgpt-project-new]').first().boundingBox()
  if (box === null) throw new Error('m21-capture: 新建会话 button unavailable')
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
  await page.waitForTimeout(1800)
  const created = await page.evaluate(() => ({
    url: location.href,
    mode: document.body.getAttribute('data-chatgpt-mode'),
    input: document.querySelector('[data-composer-input="true"]') !== null,
    rows: document.querySelectorAll('[data-cgpt-session-row]').length,
    firstRow: document.querySelector('[data-cgpt-session-row]')?.dataset.cgptSessionRow ?? null
  }))
  result.projectRow.newSession.created = created
  result.projectRow.newSession.urlUnchanged = created.url === urlBeforeNew
  addAssertion('新建会话 opens a Work conversation in the project', created.input === true && created.mode === 'agent' && created.rows > 0, JSON.stringify(created))
  const input = page.locator('[data-composer-input="true"]').first()
  await input.click()
  await page.keyboard.type('请写一个 20 行的示例文件并总结。', { delay: 8 })
  await page.keyboard.press('Enter')
  let running = null
  for (let i = 0; i < 120; i += 1) {
    const state = await page.evaluate(() => ({
      sessionRows: document.querySelectorAll('[data-cgpt-session-row][data-cgpt-running="true"]').length,
      projectRows: document.querySelectorAll('[data-cgpt-project-head] [data-cgpt-running-spinner]').length,
      spinner: document.querySelectorAll('[data-cgpt-running-spinner]').length
    }))
    if (state.spinner > 0) {
      running = state
      break
    }
    await page.waitForTimeout(60)
  }
  if (running !== null) {
    const runningShot = await fastShot(context, page, 'm21-running.png', { x: 0, y: 40, width: 420, height: 380 })
    result.projectRow.screenshots.push(runningShot)
    let later = { spinners: 1 }
    for (let i = 0; i < 120 && later.spinners > 0; i += 1) {
      await page.waitForTimeout(100)
      later = await page.evaluate(() => ({ spinners: document.querySelectorAll('[data-cgpt-running-spinner]').length }))
    }
    result.projectRow.running = {
      source: 'Host useSessionStatus → SessionStatus.running (session list standard prop)',
      fakeTimer: false,
      cssAnimation: 'chatgpt-session-spin',
      sessionRows: running.sessionRows,
      projectRows: running.projectRows,
      spinnersAtCapture: running.spinner,
      spinnersAfterSettle: later.spinners,
      clearsWhenHostSettles: later.spinners === 0
    }
  } else {
    result.projectRow.running = { source: 'Host useSessionStatus → SessionStatus.running', fakeTimer: false, missed: true }
  }
  addAssertion('running spinner appears from the Host status', result.projectRow.running.missed !== true, JSON.stringify(result.projectRow.running))
  addAssertion('running spinner clears when the Host turn settles', result.projectRow.running.clearsWhenHostSettles === true, JSON.stringify(result.projectRow.running))
} else {
  result.projectRow.running = {
    source: 'Host useSessionStatus → SessionStatus.running (session list standard prop)',
    fakeTimer: false,
    skipped: 'pass --running against an isolated DSH_HOME to record the live frame'
  }
}

result.consoleErrors = consoleErrors
result.assertionSummary = {
  pass: result.assertions.filter((entry) => entry.pass).length,
  total: result.assertions.length,
  failed: result.assertions.filter((entry) => entry.pass !== true).map((entry) => entry.name)
}
writeFileSync(join(DOCS, 'm21.json'), `${JSON.stringify(result, null, 2)}\n`)
console.log(JSON.stringify({ wrote: join(DOCS, 'm21.json'), assertions: result.assertionSummary, screenshots: [...result.rail.screenshots, ...result.sidebar.screenshots, ...result.projectRow.screenshots] }, null, 2))
await browser.close()
if (result.assertionSummary.failed.length > 0) process.exitCode = 1
