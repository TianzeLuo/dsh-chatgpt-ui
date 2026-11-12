#!/usr/bin/env node
/**
 * tools/m34-capture.mjs — P0-19b (corrected): keep the page-top Chat/Work
 * segment, restore the Host's native sidebar brand, and verify the two
 * new-session defaults.
 *
 *   node tools/m34-capture.mjs --url "http://127.0.0.1:3130/?token=…" [--out docs]
 *
 * One isolated DSH instance drives every state; the browser context starts with
 * an empty `localStorage`, which is what makes the first-time default (Chat)
 * observable:
 *
 *   1. sidebar top: the Host's own mark (24×17.66) + wordmark, no Chat/Work
 *      switcher, no placeholder and the same 26px line as the header buttons.
 *   2. new-chat page top: the centred Chat/Work segment (224×36) is present and
 *      switches the blank session in place; the hero row has no second switch.
 *   3. first 新聊天 with nothing remembered → Chat; every actual switch writes
 *      `dsh-chatgpt-ui:product-default`.
 *   4. 新聊天 with Work remembered → Work; with Chat remembered → Chat; the
 *      values survive a reload.
 *   5. project 新建 → a Work session bound to that project (the Host may reuse
 *      the current blank draft in that workspace; the resulting session is Work
 *      and belongs to the project group), while the remembered mode is kept.
 *   6. an existing session → no Chat/Work switch in the page header and none in
 *      the sidebar; the native brand mark is still there.
 *
 * Writes docs/m34.json and docs/screenshots/m34-*.png.
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
  console.error('usage: node tools/m34-capture.mjs --url <tokenised-url> [--out docs]')
  process.exit(2)
}
const OUT = resolve(ROOT, typeof args.get('out') === 'string' ? args.get('out') : 'docs')
const SHOTS = join(OUT, 'screenshots')
mkdirSync(SHOTS, { recursive: true })

const playwrightPath = process.env.M34_PLAYWRIGHT ?? 'playwright'
const CHROME =
  process.env.CHATGPT_UI_CHROME ?? process.env.HOME + '/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome'
const { chromium } = await import(playwrightPath)

const round = (value) => Math.round(value * 100) / 100
const redact = (value) => value.replace(/([?&]token=)[^&]+/, '$1***')
const STORAGE_KEY = 'dsh-chatgpt-ui:product-default'
const STORED = {
  chat: JSON.stringify({ mode: 'chat', preset: 'chat' }),
  work: JSON.stringify({ mode: 'agent', preset: 'standard' })
}
const screenshots = []
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
const httpErrors = []
page.on('pageerror', (error) => errors.push(String(error).slice(0, 300)))
page.on('console', (message) => {
  if (message.type() !== 'error') return
  // Chrome logs one generic line per failed fetch; the URL is kept in
  // `httpErrors` below, so the report does not carry the same noise twice.
  if (/^Failed to load resource/.test(message.text())) return
  errors.push(`console: ${message.text().slice(0, 240)}`)
})
page.on('response', (response) => {
  if (response.status() < 400) return
  httpErrors.push({ status: response.status(), url: redact(response.url()) })
})

await page.goto(url, { waitUntil: 'networkidle' })
await page.waitForTimeout(1600)
await page.evaluate(() => {
  const button = document.querySelector("[role='dialog'] button")
  if (button !== null) button.click()
})
await page.waitForTimeout(300)

const shot = async (name, clip) => {
  const path = join(SHOTS, name)
  await page.screenshot({ path, ...(clip === undefined ? {} : { clip }) })
  screenshots.push({ name, path: `screenshots/${name}`, bytes: readFileSync(path).length })
}

const boxFn = `
  const roundValue = (value) => Math.round(value * 100) / 100
  const box = (node) => {
    if (node === null || node === undefined) return null
    const rect = node.getBoundingClientRect()
    return {
      x: roundValue(rect.x),
      y: roundValue(rect.y),
      w: roundValue(rect.width),
      h: roundValue(rect.height),
      cx: roundValue(rect.x + rect.width / 2),
      cy: roundValue(rect.y + rect.height / 2)
    }
  }
`

/** Page-top segment, its seat, the hero row and the current session. */
const readHeader = () =>
  page.evaluate(`(() => {
    ${boxFn}
    const q = (selector) => document.querySelector(selector)
    const pill = q('.chatgpt-header-mode')
    const seat = pill?.closest('[data-slot]')?.getAttribute('data-slot') ?? null
    const segments = [...document.querySelectorAll('.chatgpt-header-mode .chatgpt-mode-seg')]
    const preset = q("[data-slot='conversation.hero.agentPreset'] button")
    const header = q("[data-slot='conversation.header'] header")
    return {
      pill: box(pill),
      count: document.querySelectorAll('.chatgpt-header-mode').length,
      seat,
      firstSwitch: pill?.getAttribute('data-chatgpt-mode-switch') ?? null,
      allSeats: [...document.querySelectorAll('[data-chatgpt-mode-switch]')].map((node) =>
        node.getAttribute('data-chatgpt-mode-switch')
      ),
      heroSwitchCount: document.querySelectorAll("[data-chatgpt-mode-switch='hero']").length,
      heroCapsuleCount: document.querySelectorAll('.chatgpt-hero-mode').length,
      segments: segments.map((node) => ({
        text: node.textContent,
        pressed: node.getAttribute('aria-pressed'),
        rect: box(node),
        fontSize: getComputedStyle(node).fontSize,
        fontFamily: getComputedStyle(node).fontFamily,
        letterSpacing: getComputedStyle(node).letterSpacing
      })),
      preset: preset === null
        ? null
        : {
            text: preset.textContent.trim(),
            rect: box(preset),
            visible: getComputedStyle(preset).display !== 'none' && preset.getBoundingClientRect().width > 0
          },
      header: box(header),
      bodyMode: document.body.getAttribute('data-chatgpt-mode'),
      storage: localStorage.getItem('${STORAGE_KEY}'),
      sessionId: document.querySelector("[data-cgpt-session-row] button[aria-current='page']")
        ?.closest('[data-cgpt-session-row]')
        ?.getAttribute('data-cgpt-session-row') ?? null,
      projectGroups: [...document.querySelectorAll('.chatgpt-project')].map((project) => ({
        id: project.querySelector('[data-cgpt-project-head]')?.getAttribute('data-cgpt-project-head') ?? '',
        title: project.querySelector('.chatgpt-project-title')?.textContent ?? '',
        sessionIds: [...project.querySelectorAll('[data-cgpt-session-row]')].map((node) =>
          node.getAttribute('data-cgpt-session-row')
        )
      }))
    }
  })()`)

/** Sidebar top: the native brand (mark + wordmark) and the header controls. */
const readSidebar = () =>
  page.evaluate(`(() => {
    ${boxFn}
    const q = (selector) => document.querySelector(selector)
    const header = q("[data-slot='sidebar'] [data-window-drag]")
    const mark = q("[data-slot='sidebar.brand.mark'] svg")
    const name = q("[data-slot='sidebar.brand.name'] svg")
    const brandButton = mark?.closest('button') ?? name?.closest('button')
    const buttons = header === null
      ? []
      : [...header.querySelectorAll('button')]
          .filter((node) => node.getBoundingClientRect().width > 0)
          .map((node) => ({
            aria: node.getAttribute('aria-label') ?? '',
            title: node.title ?? '',
            rect: box(node)
          }))
    const square = buttons.filter((entry) => entry.rect !== null && entry.rect.w === 36 && entry.rect.h === 36)
    const panelLeft = box(q("[data-slot='sidebar'] > div"))?.x ?? null
    return {
      header: box(header),
      switcherCount: document.querySelectorAll('[data-chatgpt-brand-switcher]').length,
      mark: mark === null
        ? null
        : {
            rect: box(mark),
            viewBox: mark.getAttribute('viewBox'),
            width: mark.getAttribute('width'),
            height: mark.getAttribute('height'),
            display: getComputedStyle(mark).display,
            pathCount: mark.querySelectorAll('path').length,
            pathHead: mark.querySelector('path')?.getAttribute('d')?.slice(0, 60) ?? ''
          },
      name: box(name),
      brandButton: box(brandButton),
      search: box(q('.chatgpt-panel-search')),
      buttons,
      square,
      panelLeft,
      markInset: box(mark) !== null && panelLeft !== null ? roundValue(box(mark).x - panelLeft) : null
    }
  })()`)

const sessionOf = (state) => ({
  sessionId: state.sessionId,
  preset: state.preset?.text ?? null,
  presetVisible: state.preset?.visible ?? null,
  mode: state.bodyMode,
  storage: state.storage,
  headerSwitch: state.pill !== null,
  headerSeat: state.seat,
  heroSwitchCount: state.heroSwitchCount
})

const clickSegment = async (text) => {
  await page.locator('.chatgpt-header-mode .chatgpt-mode-seg', { hasText: text }).first().click()
  await page.waitForTimeout(1200)
}

const openExisting = async () => {
  await page
    .locator('[data-cgpt-session-row]')
    .filter({ hasNotText: '新会话' })
    .first()
    .locator('button.chatgpt-session-row')
    .click()
  await page.waitForTimeout(1300)
}

const clickNewChat = async () => {
  await page.locator('.chatgpt-new-chat').click()
  await page.waitForTimeout(1600)
}

const clickProjectNew = async () => {
  await page.locator('[data-cgpt-project-head]').first().hover()
  await page.waitForTimeout(300)
  await page.locator('[data-cgpt-project-new]').first().click()
  await page.waitForTimeout(2200)
  await page.mouse.move(980, 720)
  await page.waitForTimeout(400)
}

const reload = async () => {
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForTimeout(1800)
}

// 1) An empty localStorage, then the first 新聊天: Chat is the fallback.
await page.evaluate((key) => localStorage.removeItem(key), STORAGE_KEY)
await clickNewChat()
const firstNewChat = await readHeader()
const firstSidebar = await readSidebar()
await shot('m34-first-new-chat.png')

// 2) Switch the blank draft to Work in place; every real pick is remembered.
await clickSegment('工作')
const workHeader = await readHeader()
const workSidebar = await readSidebar()
await shot('m34-new-chat-work.png')
await shot('m34-sidebar-top.png', { x: 0, y: 0, width: 340, height: 60 })
await shot('m34-top-detail-work.png', { x: 340, y: 0, width: 893, height: 52 })

// 3) The same blank draft switches to Chat.
await clickSegment('聊天')
const chatHeader = await readHeader()
await shot('m34-new-chat-chat.png')
await shot('m34-top-detail-chat.png', { x: 340, y: 0, width: 893, height: 52 })

// 4) Top 新聊天 follows the remembered mode: Work, then Chat.
await clickSegment('工作')
await clickNewChat()
const topNewWork = await readHeader()
await shot('m34-top-new-work.png')
await clickSegment('聊天')
await clickNewChat()
const topNewChat = await readHeader()
await shot('m34-top-new-chat.png')

// 5) Reload keeps the value and the next 新聊天 still follows it.
await reload()
const reloadChat = await readHeader()
await clickNewChat()
const topNewChatAfterReload = await readHeader()
await clickSegment('工作')
await reload()
const reloadWork = await readHeader()
await clickNewChat()
const topNewWorkAfterReload = await readHeader()

// 6) An existing session: no switch on the page and none in the sidebar.
await openExisting()
const existing = await readHeader()
const existingSidebar = await readSidebar()
await shot('m34-existing-session.png')
await shot('m34-existing-sidebar-top.png', { x: 0, y: 0, width: 340, height: 60 })
await shot('m34-existing-top-detail.png', { x: 340, y: 0, width: 893, height: 52 })

// 7) Project 新建: remember Chat, start from an existing conversation, then use
//    the project head's new-session button. The result is Work and bound, and
//    the remembered Chat must stay untouched.
await clickNewChat()
await clickSegment('聊天')
const chatBeforeProject = await readHeader()
await openExisting()
await clickProjectNew()
const projectNew = await readHeader()
await shot('m34-project-new.png')

const projectTitle = projectNew.projectGroups[0]?.title ?? ''
const projectSessionIds = projectNew.projectGroups[0]?.sessionIds ?? []
const bound = projectNew.sessionId !== null && projectSessionIds.includes(projectNew.sessionId)
const workSegments = workHeader.segments
const chatSegments = chatHeader.segments
const workPressed = workSegments.find((segment) => segment.text === '工作')
const chatPressed = chatSegments.find((segment) => segment.text === '聊天')
const squareButtons = workSidebar.square

addAssertion(
  'sidebar.no-switcher',
  workSidebar.switcherCount === 0 && existingSidebar.switcherCount === 0,
  JSON.stringify({ work: workSidebar.switcherCount, existing: existingSidebar.switcherCount })
)
addAssertion(
  'sidebar.native-mark',
  workSidebar.mark !== null &&
    workSidebar.mark.rect.w === 24 &&
    Math.abs(workSidebar.mark.rect.h - 17.66) <= 0.05 &&
    workSidebar.mark.rect.cx === 80 &&
    workSidebar.mark.rect.cy === 26 &&
    workSidebar.mark.viewBox === '0 0 23.16 17.04' &&
    workSidebar.mark.pathCount === 1 &&
    workSidebar.mark.pathHead.startsWith('M22.9168 1.43018'),
  JSON.stringify(workSidebar.mark)
)
addAssertion(
  'sidebar.native-wordmark',
  workSidebar.name !== null &&
    workSidebar.name.w === 156 &&
    workSidebar.name.h === 24 &&
    workSidebar.name.x === 100 &&
    workSidebar.name.cy === 26,
  JSON.stringify(workSidebar.name)
)
addAssertion(
  'sidebar.brand-button',
  workSidebar.brandButton !== null &&
    workSidebar.brandButton.w === 212 &&
    workSidebar.brandButton.h === 24 &&
    workSidebar.brandButton.x === 68 &&
    workSidebar.brandButton.cy === 26,
  JSON.stringify(workSidebar.brandButton)
)
addAssertion(
  'sidebar.header-aligned',
  workSidebar.header !== null &&
    workSidebar.header.h === 52 &&
    squareButtons.length >= 1 &&
    squareButtons.every((entry) => entry.rect.cy === 26) &&
    workSidebar.search !== null &&
    workSidebar.search.w === 36 &&
    workSidebar.search.h === 36 &&
    workSidebar.search.cy === 26 &&
    workSidebar.mark !== null &&
    workSidebar.mark.rect.cy === 26 &&
    workSidebar.name !== null &&
    workSidebar.name.cy === 26,
  JSON.stringify({ header: workSidebar.header, square: squareButtons, search: workSidebar.search, mark: workSidebar.mark?.rect })
)
addAssertion(
  'sidebar.native-inset',
  workSidebar.panelLeft === 52 && workSidebar.markInset === 16,
  JSON.stringify({ panelLeft: workSidebar.panelLeft, markInset: workSidebar.markInset })
)

addAssertion(
  'header.switch-work',
  workHeader.pill !== null &&
    workHeader.count === 1 &&
    workHeader.seat === 'conversation.header.leading' &&
    workHeader.pill.w === 224 &&
    workHeader.pill.h === 36 &&
    workHeader.pill.cx === 786.5 &&
    workHeader.pill.cy === 26 &&
    workSegments.map((segment) => segment.text).join('|') === '聊天|工作' &&
    workSegments.every((segment) => segment.rect.w === 112 && segment.rect.h === 36) &&
    workPressed?.pressed === 'true' &&
    workHeader.preset?.text === '标准模式' &&
    workHeader.preset.visible === true &&
    workHeader.bodyMode === 'agent',
  JSON.stringify({ pill: workHeader.pill, segments: workSegments, preset: workHeader.preset })
)
addAssertion(
  'header.switch-chat',
  chatHeader.count === 1 &&
    chatHeader.pill.cx === 786.5 &&
    chatPressed?.pressed === 'true' &&
    chatHeader.bodyMode === 'chat' &&
    (chatHeader.preset === null || chatHeader.preset.visible === false),
  JSON.stringify({ pill: chatHeader.pill, segments: chatSegments, preset: chatHeader.preset })
)
addAssertion(
  'header.hero-empty',
  workHeader.heroSwitchCount === 0 && workHeader.heroCapsuleCount === 0 && chatHeader.heroSwitchCount === 0,
  JSON.stringify({ work: workHeader.heroSwitchCount, chat: chatHeader.heroSwitchCount })
)
addAssertion(
  'existing.no-header-switch',
  existing.count === 0 && existing.allSeats.length === 0 && existing.heroSwitchCount === 0,
  JSON.stringify({ count: existing.count, seats: existing.allSeats })
)
addAssertion(
  'existing.native-brand',
  existingSidebar.switcherCount === 0 && existingSidebar.mark !== null && existingSidebar.mark.rect.w === 24,
  JSON.stringify({ switcher: existingSidebar.switcherCount, mark: existingSidebar.mark?.rect })
)
addAssertion(
  'first.new-chat-chat',
  firstNewChat.preset?.text === 'Chat' &&
    firstNewChat.bodyMode === 'chat' &&
    firstNewChat.storage === null &&
    firstNewChat.pill !== null &&
    firstNewChat.segments.find((segment) => segment.text === '聊天')?.pressed === 'true',
  JSON.stringify({ preset: firstNewChat.preset?.text, body: firstNewChat.bodyMode, storage: firstNewChat.storage })
)
addAssertion(
  'memory.work-written',
  workHeader.storage === STORED.work,
  String(workHeader.storage)
)
addAssertion(
  'memory.chat-written',
  chatHeader.storage === STORED.chat,
  String(chatHeader.storage)
)
addAssertion(
  'path.top-new-work',
  topNewWork.preset?.text === '标准模式' &&
    topNewWork.bodyMode === 'agent' &&
    topNewWork.segments.find((segment) => segment.text === '工作')?.pressed === 'true',
  JSON.stringify({ preset: topNewWork.preset?.text, body: topNewWork.bodyMode })
)
addAssertion(
  'path.top-new-chat',
  topNewChat.preset?.text === 'Chat' &&
    topNewChat.bodyMode === 'chat' &&
    topNewChat.segments.find((segment) => segment.text === '聊天')?.pressed === 'true',
  JSON.stringify({ preset: topNewChat.preset?.text, body: topNewChat.bodyMode })
)
addAssertion(
  'path.reload-chat',
  reloadChat.storage === STORED.chat && topNewChatAfterReload.preset?.text === 'Chat',
  JSON.stringify({ reload: reloadChat.storage, preset: topNewChatAfterReload.preset?.text })
)
addAssertion(
  'path.reload-work',
  reloadWork.storage === STORED.work && topNewWorkAfterReload.bodyMode === 'agent',
  JSON.stringify({ reload: reloadWork.storage, body: topNewWorkAfterReload.bodyMode })
)
addAssertion(
  'path.project-new-work',
  projectNew.preset?.text === '标准模式' && projectNew.bodyMode === 'agent',
  JSON.stringify({ preset: projectNew.preset?.text, body: projectNew.bodyMode })
)
addAssertion(
  'path.project-new-bound',
  bound === true && projectTitle !== '',
  JSON.stringify({ id: projectNew.sessionId, projectTitle, projectSessionIds })
)
addAssertion(
  'path.project-new-keeps-memory',
  projectNew.storage === chatBeforeProject.storage && projectNew.storage === STORED.chat,
  `${chatBeforeProject.storage} -> ${projectNew.storage}`
)
addAssertion('errors.empty', errors.length === 0, JSON.stringify(errors.slice(0, 4)))

const report = {
  task: 'P0-19b',
  title: '新聊天页顶部保留 Chat/Work 切换；侧栏顶部恢复宿主原生品牌；两条新建路径的默认模式',
  correction:
    'P0-19b 方向修正：页面顶部居中的 Chat/Work 切换保留（新会话选模式入口），删除的是侧栏顶部品牌位里的 Chat/Work 切换；侧栏改回宿主原生标识，无占位、无额外高度。',
  generatedAt: new Date().toISOString(),
  url: redact(url),
  viewport: { width: 1233, height: 850, deviceScaleFactor: 2, locale: 'zh-CN', colorScheme: 'dark' },
  sidebar: {
    before: 'sidebar.brand.name 里是皮肤自绘的产品图标 + Chat/Work 名称 + ⌄ 菜单；brand.mark 被清空',
    after: '不再注册品牌位；宿主原生 FishLogo（24×17.66）+ deepseek HARNESS 字标，无切换器',
    top: workSidebar,
    existing: existingSidebar,
    screenshots: ['screenshots/m34-sidebar-top.png', 'screenshots/m34-existing-sidebar-top.png']
  },
  header: {
    before: '顶部居中 Chat/Work 胶囊（224×36），空白会话可切换，已有会话不显示',
    after: '保持不变；hero.options 恢复为空（没有第二枚切换）',
    seat: 'conversation.header.leading',
    work: workHeader,
    chat: chatHeader,
    first: firstNewChat,
    existing,
    screenshots: [
      'screenshots/m34-top-detail-work.png',
      'screenshots/m34-top-detail-chat.png',
      'screenshots/m34-new-chat-work.png',
      'screenshots/m34-new-chat-chat.png'
    ]
  },
  paths: {
    firstNewChat: sessionOf(firstNewChat),
    topNewWork: sessionOf(topNewWork),
    topNewChat: sessionOf(topNewChat),
    topNewWorkAfterReload: sessionOf(topNewWorkAfterReload),
    topNewChatAfterReload: sessionOf(topNewChatAfterReload),
    projectNew: {
      ...sessionOf(projectNew),
      projectTitle,
      projectSessionIds,
      bound,
      rememberedBefore: chatBeforeProject.storage,
      rememberedAfter: projectNew.storage
    },
    existing: sessionOf(existing)
  },
  memory: {
    key: STORAGE_KEY,
    valueFormat: 'JSON {mode:"chat"|"agent", preset:"chat"|"standard"}',
    firstTime: {
      removed: true,
      afterNewChat: firstNewChat.storage,
      resultPreset: firstNewChat.preset?.text ?? null
    },
    work: { value: workHeader.storage, resultPreset: topNewWork.preset?.text ?? null },
    chat: { value: chatHeader.storage, resultPreset: topNewChat.preset?.text ?? null },
    afterReload: {
      chat: { value: reloadChat.storage, resultPreset: topNewChatAfterReload.preset?.text ?? null },
      work: { value: reloadWork.storage, resultPreset: topNewWorkAfterReload.preset?.text ?? null }
    }
  },
  screenshots,
  assertions,
  errors,
  httpErrors
}

writeFileSync(join(OUT, 'm34.json'), `${JSON.stringify(report, null, 2)}\n`)
console.log(
  `wrote ${join(OUT, 'm34.json')} (${assertions.filter((entry) => entry.ok).length}/${assertions.length} assertions, ${screenshots.length} screenshots)`
)
await browser.close()
if (assertions.some((entry) => entry.ok !== true)) process.exitCode = 1
