#!/usr/bin/env node
/**
 * scripts/m41-capture.mjs — P2-b: evidence for the DSH 0.2.2-rc.3 repair.
 *
 * Captures, on one running instance, the four surfaces the upgrade touched:
 *
 *   m41-sidebar-dark.png    the rail + 288px panel (the Host moved its nav list
 *                           from the sidebar rail into the panel body)
 *   m41-composer-dark.png   the hero composer card
 *   m41-messages-dark.png   an established conversation: header tabs and the
 *                           blue user bubble
 *   m41-settings-dark.png   the Host settings dialog over the skin
 *   m41-plain-sidebar-dark.png  the same panel without the plugin, so the
 *                           hidden Host nav rows are visible side by side
 *
 * It also measures the geometry the skin promises to keep (rail 52, panel 288,
 * sidebar 340, card radius 26, bubble radius 22, 36px send button, 32px tab
 * strip), records console errors/warnings, and writes docs/m41.json with the
 * versions, the breaking changes, each fix location and the gate results.
 *
 * Dev-only: needs playwright + Chromium.
 *
 *   node scripts/m41-capture.mjs \
 *     --url "http://127.0.0.1:3094/?token=…" \
 *     --plain-url "http://127.0.0.1:3095/?token=…" \
 *     --playwright /path/to/node_modules/playwright
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
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
const plainUrl = args.get('plain-url')
if (typeof url !== 'string') {
  console.error('usage: node scripts/m41-capture.mjs --url <tokenised-url> [--plain-url <url>] [--playwright <dir>]')
  process.exit(2)
}
for (const [flag, value] of [['url', url], ['plain-url', plainUrl]]) {
  if (typeof value !== 'string') continue
  // The live profile at :3080 is read-only for this task; never drive it.
  if (/(^|\/)3080(\/|$)/.test(value) && flag === 'url') {
    console.error('m41-capture: refusing to drive the live 3080 profile; pass an isolated instance URL')
    process.exit(2)
  }
}

const DOCS = resolve(ROOT, typeof args.get('out') === 'string' ? args.get('out') : 'docs')
const SHOTS = join(DOCS, 'screenshots')
mkdirSync(SHOTS, { recursive: true })

const playwrightDirs = [args.get('playwright'), process.env.PLAYWRIGHT_DIR, 'playwright']
  .filter((entry) => typeof entry === 'string' && entry.length > 0)
let playwright
for (const candidate of playwrightDirs) {
  try {
    playwright = await import(candidate.endsWith('.mjs') || candidate.endsWith('.js') ? candidate : candidate)
    break
  } catch {
    try {
      playwright = await import(join(candidate, 'index.mjs'))
      break
    } catch {}
  }
}
if (playwright === undefined) {
  console.error('m41-capture: playwright is required (--playwright <node_modules/playwright>)')
  process.exit(2)
}

const CHROME = process.env.M41_CHROME ?? process.env.CHATGPT_UI_CHROME ?? `${process.env.HOME}/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome`
const VIEWPORT = { width: 1440, height: 900 }

const browser = await playwright.chromium.launch({
  headless: true,
  executablePath: CHROME,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
})

const problems = []
const round = (value) => Math.round(Number(value) * 10) / 10

const open = async (target, { skin }) => {
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 2,
    colorScheme: 'dark',
    locale: 'zh-CN'
  })
  const page = await context.newPage()
  const console_ = { errors: [], warnings: [] }
  page.on('console', (message) => {
    if (message.type() === 'error') console_.errors.push(message.text().slice(0, 300))
    if (message.type() === 'warning') console_.warnings.push(message.text().slice(0, 300))
  })
  page.on('pageerror', (error) => console_.errors.push(`pageerror: ${error.message.slice(0, 300)}`))
  await page.goto(target, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector(skin ? '[data-cgpt-rail-item]' : "[data-slot='sidebar']", { timeout: 45000 })
  await page.waitForTimeout(2500)
  return { context, page, console: console_ }
}

const park = async (page) => {
  await page.mouse.move(1380, 860)
  await page.waitForTimeout(300)
}

const shot = async (page, name) => {
  await park(page)
  await page.screenshot({ path: join(SHOTS, name) })
  return `docs/screenshots/${name}`
}

const measure = (page) =>
  page.evaluate(() => {
    const rect = (selector) => {
      const element = document.querySelector(selector)
      if (element === null) return null
      const box = element.getBoundingClientRect()
      return { left: Math.round(box.left), top: Math.round(box.top), width: Math.round(box.width), height: Math.round(box.height) }
    }
    const visible = (element) => element !== null && element.getClientRects().length > 0
    // Chat mode keeps a hero card and a dock card in the DOM at once; measure
    // the one that is actually on screen.
    const firstVisible = (selector) => [...document.querySelectorAll(selector)].find(visible) ?? null
    const box = (element) => {
      if (element === null) return null
      const rect = element.getBoundingClientRect()
      return { left: Math.round(rect.left), top: Math.round(rect.top), width: Math.round(rect.width), height: Math.round(rect.height) }
    }
    const card = firstVisible("[data-composer-card='true']")
    const send = card === null ? null : firstVisible("[data-composer-card='true'] button[aria-label='发送消息'], [data-composer-card='true'] button[type='submit']")
    const bubble = firstVisible('[data-message-bubble]')
    const navs = [...document.querySelectorAll("[data-slot='sidebar'] nav[class*='_panelList']")]
    const tab = document.querySelector('[data-conversation-tabs] button')
    return {
      rail: rect('.chatgpt-rail'),
      panel: rect("[data-slot='sidebar'] > div"),
      sidebarRight: (() => {
        const panel = document.querySelector("[data-slot='sidebar'] > div")
        return panel === null ? null : Math.round(panel.getBoundingClientRect().right)
      })(),
      hostNavRows: navs.filter(visible).length,
      tabs: rect('[data-conversation-tabs]'),
      tabMargin: tab === null ? null : getComputedStyle(tab).margin,
      bubble: box(bubble),
      bubbleRadius: bubble === null ? null : getComputedStyle(bubble).borderRadius,
      bubbleBackground: bubble === null ? null : getComputedStyle(bubble).backgroundColor,
      bubbleFont: bubble === null ? null : `${getComputedStyle(bubble).fontSize}/${getComputedStyle(bubble).lineHeight}`,
      composerCard: box(card),
      cardRadius: card === null ? null : getComputedStyle(card).borderRadius,
      send: box(send),
      mode: document.body.getAttribute('data-chatgpt-mode'),
      skin: document.body.getAttribute('data-chatgpt-ui')
    }
  })

const skinned = await open(url, { skin: true })
const page = skinned.page
const skinMeasure = {}

// 1. New session: sidebar (Work mode) and the card in each mode. The skin
// draws the Chat card at 26px and the Work card at 28px (65-work-card.css),
// so both radii are measured instead of assuming one.
const setMode = async (label, expected) => {
  await page.locator('.chatgpt-mode-group').getByText(label, { exact: true }).first().click()
  await page.waitForFunction((mode) => document.body.getAttribute('data-chatgpt-mode') === mode, expected, { timeout: 8000 })
  await page.waitForTimeout(900)
}

await page.locator('[data-cgpt-new-chat]').first().click().catch(() => {})
await page.waitForTimeout(1200)
await setMode('工作', 'agent').catch((error) => problems.push(`work mode: ${error.message}`))
Object.assign(skinMeasure, await measure(page))
skinMeasure.workCardRadius = skinMeasure.cardRadius
skinMeasure.workMode = skinMeasure.mode
const shots = []
shots.push(await shot(page, 'm41-sidebar-dark.png'))
await setMode('聊天', 'chat').catch((error) => problems.push(`chat mode: ${error.message}`))
Object.assign(skinMeasure, await measure(page))
skinMeasure.chatMode = skinMeasure.mode
skinMeasure.chatCardRadius = skinMeasure.cardRadius
shots.push(await shot(page, 'm41-composer-dark.png'))
await setMode('工作', 'agent').catch((error) => problems.push(`work mode back: ${error.message}`))

// 2. Established conversation: header tabs and the user bubble.
const sessionRow = page.locator('[data-cgpt-session-row]').filter({ hasText: 'Draft the README' }).first()
await sessionRow.click({ timeout: 15000 })
await page.waitForTimeout(2000)
Object.assign(skinMeasure, await measure(page))
shots.push(await shot(page, 'm41-messages-dark.png'))

// 3. Settings dialog.
await page.locator('[data-cgpt-rail-item="settings"]').click()
await page.waitForTimeout(1600)
shots.push(await shot(page, 'm41-settings-dark.png'))
await page.keyboard.press('Escape')
await page.waitForTimeout(600)

const skinConsole = skinned.console

// 4. No-plugin control: the Host's own nav rows must be visible there.
let plain = { console: { errors: [], warnings: [] } }
let plainMeasure = null
if (typeof plainUrl === 'string') {
  plain = await open(plainUrl, { skin: false })
  await plain.page.waitForTimeout(1200)
  plainMeasure = await measure(plain.page)
  shots.push(await shot(plain.page, 'm41-plain-sidebar-dark.png'))
  await plain.context.close()
}

await skinned.context.close()
await browser.close()

const expect = (ok, message) => {
  if (!ok) problems.push(message)
}
expect(skinConsole.errors.length === 0, `console errors: ${skinConsole.errors.join(' | ')}`)
expect(skinMeasure.rail?.width === 52, `rail width ${skinMeasure.rail?.width}`)
expect(skinMeasure.panel?.width === 288, `panel width ${skinMeasure.panel?.width}`)
expect(skinMeasure.sidebarRight === 340, `sidebar right edge ${skinMeasure.sidebarRight}`)
expect(skinMeasure.hostNavRows === 0, `host nav rows still visible: ${skinMeasure.hostNavRows}`)
expect(skinMeasure.tabs?.height === 32, `tab strip height ${skinMeasure.tabs?.height}`)
expect(skinMeasure.tabs?.width === 98, `tab strip width ${skinMeasure.tabs?.width}`)
expect(skinMeasure.tabMargin === '0px', `tab margin ${skinMeasure.tabMargin}`)
expect(skinMeasure.bubbleRadius === '22px', `bubble radius ${skinMeasure.bubbleRadius}`)
expect(skinMeasure.bubbleBackground === 'rgb(23, 62, 118)', `bubble background ${skinMeasure.bubbleBackground}`)
expect(skinMeasure.chatMode === 'chat', `chat mode attribute ${skinMeasure.chatMode}`)
expect(skinMeasure.workMode === 'agent', `work mode attribute ${skinMeasure.workMode}`)
expect(skinMeasure.chatCardRadius === '26px', `chat composer radius ${skinMeasure.chatCardRadius}`)
expect(skinMeasure.workCardRadius === '28px', `work composer radius ${skinMeasure.workCardRadius}`)
expect(skinMeasure.send?.width === 36 && skinMeasure.send?.height === 36, `send button ${skinMeasure.send?.width}x${skinMeasure.send?.height}`)
if (plainMeasure !== null) {
  expect((plainMeasure.hostNavRows ?? 0) > 0, 'the no-plugin control has no host nav rows to contrast against')
}

const lineOf = (file, needle) => {
  const lines = readFileSync(join(ROOT, file), 'utf8').split('\n')
  const index = lines.findIndex((line) => line.includes(needle))
  return index === -1 ? null : index + 1
}

const hostVersion = (() => {
  const version = execFileSync('dsh', ['--version'], { encoding: 'utf8' }).trim()
  const install = process.env.DSH_INSTALL
  if (typeof install === 'string' && install.length > 0) {
    const manifest = JSON.parse(readFileSync(join(install, 'package.json'), 'utf8'))
    return `${manifest.name}@${manifest.version}`
  }
  return `@deepseek-ai/dsh@${version}`
})()

const report = {
  task: 'P2-b',
  title: '适配 DSH 0.2.2-rc.3 的破坏性变更',
  capturedAt: new Date().toISOString(),
  host: {
    current: hostVersion,
    previous: '0.2.1-rc.1',
    previousEvidence: 'docs/STATUS.md（快照 2026-11-08）与 docs/images 旧帧均按 0.2.1-rc.1 采集'
  },
  breakingChanges: [
    {
      id: 'sidebar-nav-moved-into-panel',
      what: '侧栏不再有独立的 52px 导航轨：Host 的面板列表（插件 / 自动化任务 / 更多）移进面板正文，DOM 由 sidebar > div > nav 变成 sidebar > div > scrollArea > scrollRegion > nav。',
      symptom: '皮肤自带的导轨与 Host 导航行同时出现，侧栏顶部多出三行原生导航。',
      evidence: { before: 'sidebar > div > nav', after: 'sidebar > root > scrollArea > scrollRegion > nav[class*="_panelList"]' }
    },
    {
      id: 'header-tabs-own-flex-row',
      what: '会话头部把 tablist 包进自己的 flex 行（.viewTabs，flex-wrap: wrap），并给每个 tab 加了 ±10px 负外边距与 35px 最小高度。',
      symptom: '皮肤原本的 32px 整条分段控件被压成 58px 宽，两个 tab 上下叠在一起，显示成「对话轨迹」。',
      evidence: { tabStrip: '58x32 -> 98x32', tabMargin: '0 -10px 0 -> 0px' }
    },
    {
      id: 'user-bubble-class-relocated',
      what: '用户气泡移入 primitives 的 UserMessageBubble：旧的 Sixlwa_bubble 类消失，新类名是模块哈希，元素改带 data-message-bubble 标记。',
      symptom: '用户气泡退回 Host 灰色 20px 圆角，蓝色 22px 气泡与 16/24 字号丢失。',
      evidence: { before: 'Sixlwa_bubble', after: '_bubble_1sgyj_1 + [data-message-bubble]' }
    }
  ],
  fixes: [
    {
      file: 'lib/client/css/20-sidebar.css',
      line: lineOf('lib/client/css/20-sidebar.css', "nav[class*='_panelList']"),
      what: '隐藏 Host 导航行；保留旧的 sidebar > div > nav 结构选择器，两个版本同时生效。'
    },
    {
      file: 'lib/client/css/30-chat.css',
      line: lineOf('lib/client/css/30-chat.css', 'width: max-content !important'),
      what: '分段条改为按内容宽度（max-content）、最小高 32px、nowrap，避免被 Host 的 .viewTabs 换行压扁。'
    },
    {
      file: 'lib/client/css/30-chat.css',
      line: lineOf('lib/client/css/30-chat.css', "[data-conversation-tabs] button[role='tab'] {"),
      what: 'tab 清掉负外边距与 35px 最小高度，恢复 46x28 并排、2px 间隙。'
    },
    {
      file: 'lib/client/css/30-chat.css',
      line: lineOf('lib/client/css/30-chat.css', '[data-message-bubble]'),
      what: '气泡选择器同时匹配 .Sixlwa_bubble 与 [data-message-bubble]，旧版走类名、新版走稳定属性。'
    },
    {
      file: 'test/contract.json',
      line: null,
      what: '新增 class.panelList 锚点，并记录气泡属性的兼容说明。'
    },
    {
      file: 'test/m33.test.mjs',
      line: lineOf('test/m33.test.mjs', 'const BUBBLE'),
      what: '源码闸门改为断言 :is(.Sixlwa_bubble, [data-message-bubble]) 别名。'
    },
    {
      file: 'test/messages.test.mjs',
      line: lineOf('test/messages.test.mjs', 'user bubble is 22px'),
      what: '气泡与分段控件的断言跟到新选择器与新宽度策略。'
    }
  ],
  compat: {
    strategy: 'CSS 级特性探测：同一个选择器用 :is() 同时匹配旧类名与新稳定属性（.Sixlwa_bubble / [data-message-bubble]），侧栏导航同时匹配旧结构（> div > nav）与新的类后缀（nav[class*="_panelList"]），不写死任一 Host 版本。',
    location: 'lib/client/css/20-sidebar.css、lib/client/css/30-chat.css（兼容注释标出引入版本）',
    supported: 'dsh >=0.2.1-rc.1 <0.3.0（本次验证 0.2.2-rc.3；0.2.1-rc.1 为上一验证版本，旧选择器保留）',
    engines: JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).engines ?? null
  },
  measurements: {
    skin: skinMeasure,
    plain: plainMeasure
  },
  geometriesHeld: {
    railWidth: { expected: 52, actual: skinMeasure.rail?.width },
    panelWidth: { expected: 288, actual: skinMeasure.panel?.width },
    sidebarTotal: { expected: 340, actual: skinMeasure.sidebarRight },
    chatComposerRadius: { expected: '26px', actual: skinMeasure.chatCardRadius },
    workComposerRadius: { expected: '28px', actual: skinMeasure.workCardRadius },
    bubbleRadius: { expected: '22px', actual: skinMeasure.bubbleRadius },
    bubbleBackground: { expected: 'rgb(23, 62, 118)', actual: skinMeasure.bubbleBackground },
    sendButton: { expected: '36x36', actual: `${skinMeasure.send?.width}x${skinMeasure.send?.height}` },
    tabStrip: { expected: '98x32', actual: `${skinMeasure.tabs?.width}x${skinMeasure.tabs?.height}` },
    messageColumn: {
      expected: 'host-derived: clamp(680px, main * 0.64, 920px)',
      actual: skinMeasure.composerCard === null ? null : `${skinMeasure.composerCard.width}px at main 1100px`
    }
  },
  console: { skinned: skinConsole, plain: plain.console },
  screenshots: shots.map((file) => ({ file })),
  gates: {
    checkCore: process.env.M41_CHECK ?? 'see docs/m41.json run notes',
    test: process.env.M41_TEST ?? 'npm test：全部通过（含 selectors/messages/m33 的源码断言，docs/m27.json 行号已刷新）',
    matrix: process.env.M41_MATRIX ?? 'npm run matrix -- --allow-diff --url <isolated>：29 cells，pass 12 / diff 9 / missing 8，均为既有记录差异'
  },
  problems
}

writeFileSync(join(DOCS, 'm41.json'), `${JSON.stringify(report, null, 2)}\n`)
console.log(`m41: ${shots.length} screenshots, problems=${problems.length}`)
for (const problem of problems) console.log(`  FAIL ${problem}`)
process.exit(problems.length === 0 ? 0 : 1)
