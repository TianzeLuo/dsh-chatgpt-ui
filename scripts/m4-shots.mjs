#!/usr/bin/env node
/**
 * Module-4 screenshot pass: reference vs implementation (light/dark), long
 * content, process collapse, attachments and the host image preview.
 *
 * Dev-only, like scripts/screenshots.mjs. It talks to the isolated skinned
 * instance (default :3095) through a token URL and writes docs/screenshots/
 * m4-*.png. Reference captures are the Chat reference at
 * ~/.cache/dsh-capture/out/chat-{light,dark}-conversation.png.
 *
 *   node scripts/m4-shots.mjs --url "http://127.0.0.1:3095/?token=..." \
 *     --fixture session-… --attachments session-… [--file-card session-…] \
 *     [--standard-url "http://127.0.0.1:3106/?token=..."]
 */
import { mkdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'docs/screenshots')
mkdirSync(OUT, { recursive: true })
const args = new Map()
for (let i = 2; i < process.argv.length; i += 2) args.set(process.argv[i].replace(/^--/, ''), process.argv[i + 1])
const URL = args.get('url')
const FIXTURE = args.get('fixture') ?? 'session-14dd901b-f565-4ddd-b398-f5f2b156e804'
const ATTACH = args.get('attachments') ?? 'session-409d2734-65e4-43d8-a76a-a2cceb42ca5a'
const STANDARD_URL = args.get('standard-url')
const FILE_CARD = args.get('file-card')
if (typeof URL !== 'string') {
  console.error('usage: node scripts/m4-shots.mjs --url <token-url> [--fixture <id>] [--attachments <id>] [--file-card <id>] [--standard-url <token-url>]')
  process.exit(2)
}
const REF_DIR = join(process.env.HOME ?? '', '.cache/dsh-capture/out')
const CHROME = process.env.CHATGPT_UI_CHROME ?? process.env.HOME + '/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome'
const browser = await chromium.launch({ headless: true, executablePath: CHROME, args: ['--no-sandbox', '--disable-dev-shm-usage'] })

const sleep = (ms) => new Promise((done) => setTimeout(done, ms))
const closeDialogs = async (page) => {
  for (let i = 0; i < 8; i += 1) {
    if ((await page.locator('[role="dialog"]').count()) === 0) return
    const close = page.locator('[role="dialog"] button[aria-label="Close"]')
    if (await close.count()) await close.first().click({ force: true })
    else await page.keyboard.press('Escape')
    await sleep(350)
  }
}
const open = async (theme, session = FIXTURE) => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, colorScheme: theme })
  await page.goto(URL, { waitUntil: 'networkidle' })
  await sleep(1000)
  await closeDialogs(page)
  const row = page.locator(`[data-cgpt-session-row="${session}"] button.chatgpt-session-row`).first()
  if (await row.count()) {
    await row.click({ force: true })
    await sleep(1400)
  }
  await page.mouse.move(900, 420)
  await page.mouse.wheel(0, -4000)
  await sleep(400)
  return page
}
const shot = async (page, name, clip) => {
  await page.screenshot({ path: join(OUT, `${name}.png`), ...(clip === undefined ? {} : { clip }) })
  console.log(`wrote ${name}.png`)
}
const codeClip = async (page) => {
  await page.evaluate(() => {
    const block = [...document.querySelectorAll('[data-chat-flow-kind="assistant-step"] [data-code-wrap]')].at(-1)
    const scroll = block?.closest('[data-conversation-scroll]')
    if (!(block instanceof HTMLElement) || !(scroll instanceof HTMLElement)) return
    const box = block.getBoundingClientRect()
    const view = scroll.getBoundingClientRect()
    scroll.scrollTop += box.top - view.top - 120
  })
  await page.waitForTimeout(400)
  const block = page.locator('[data-chat-flow-kind="assistant-step"] [data-code-wrap]').last()
  const box = await block.boundingBox()
  if (box === null) return undefined
  return { x: Math.max(0, box.x - 48), y: Math.max(76, box.y - 56), width: Math.min(1000, box.width + 96), height: Math.min(430, box.height + 110) }
}

/* ---- reference crops and side-by-side composites ----------------------- */
const imageData = (path) => `data:image/png;base64,${readFileSync(path).toString('base64')}`
const reference = async (theme) => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 })
  const source = imageData(join(REF_DIR, `chat-${theme}-conversation.png`))
  await page.setContent(`<style>html,body{margin:0;background:#fff}img{display:block;width:1440px;height:900px;object-fit:cover;object-position:center top}</style><img src="${source}">`)
  await page.waitForTimeout(300)
  await shot(page, `m4-${theme}-reference`)
  return source
}
const composite = async (theme, implementation, referenceSource) => {
  const page = await browser.newPage({ viewport: { width: 1600, height: 520 }, deviceScaleFactor: 1 })
  const impl = imageData(join(OUT, `${implementation}.png`))
  await page.setContent(`<style>
    html,body{margin:0;background:#f7f7f7;font:13px/1.4 system-ui,sans-serif;color:#333}
    .row{display:flex;gap:16px;padding:16px}
    figure{margin:0;width:768px}
    figcaption{padding:6px 2px;font-weight:600}
    .shot{width:768px;height:480px;object-fit:cover;object-position:top left;border:1px solid #ddd;border-radius:8px;background:#fff}
  </style>
  <div class="row">
    <figure><figcaption>参考</figcaption><img class="shot" src="${referenceSource}"></figure>
    <figure><figcaption>实现</figcaption><img class="shot" src="${impl}"></figure>
  </div>`)
  await page.waitForTimeout(300)
  await shot(page, `m4-${theme}-compare`)
}

/* ---- light: real transcript ------------------------------------------- */
const lightRef = await reference('light')
const light = await open('light')
// Put the final answer above the Host's sticky composer stack (the native
// transcript scrolls behind it) so the reading column, paragraph gap, code card
// and action row are all visible in one frame.
await light.mouse.move(900, 420)
await light.mouse.wheel(0, 360)
await sleep(350)
await shot(light, 'm4-light-implementation')
await light.mouse.wheel(0, -4000)
await sleep(300)

// User bubble hover shows the copy/time affordance under the bubble.
await light.locator('[data-chat-flow-kind="user"] .Sixlwa_bubble').first().hover()
await sleep(250)
await shot(light, 'm4-light-user-hover')

// Answer typography and the dark code block, without changing the session.
await shot(light, 'm4-light-code', await codeClip(light))

// Chat/Trajectory remain host tab buttons; capture the Trajectory view to show
// that the restyle did not replace its content or its click handler.
await light.getByRole('tab', { name: 'Trajectory' }).click()
await sleep(700)
await shot(light, 'm4-light-trajectory')
await light.getByRole('tab', { name: 'Chat' }).click()
await sleep(400)
await light.close()

// Native process group: the verbose fixture renders it expanded. The second
// isolated instance uses the Host's own `standard` transcript view, so the
// collapsed summary and its expand/collapse interaction are real Host state.
if (typeof STANDARD_URL === 'string') {
  const standard = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 })
  await standard.goto(STANDARD_URL, { waitUntil: 'networkidle' })
  await sleep(1000)
  await closeDialogs(standard)
  await standard.locator(`[data-cgpt-session-row="${FIXTURE}"] button.chatgpt-session-row`).first().click({ force: true })
  await sleep(1400)
  await standard.mouse.move(900, 420)
  await standard.mouse.wheel(0, -4000)
  await sleep(400)
  const processState = await standard.evaluate(() => {
    const button = document.querySelector('[data-step-process] button[data-process-activity], [data-step-process] button[aria-controls]')
    return { steps: button?.getAttribute('data-cgpt-steps'), label: button?.getAttribute('aria-label') }
  })
  await shot(standard, 'm4-light-process-collapsed')
  console.log('process summary:', processState)
  await standard.locator('[data-step-process] button[data-process-activity]').first().click()
  await sleep(500)
  await shot(standard, 'm4-light-process-expanded')
  await standard.close()
}

/* ---- attachments and host preview ------------------------------------- */
const attach = await open('light', ATTACH)
await shot(attach, 'm4-light-attachments')
await attach.locator('[data-slot="conversation.chat.user.images"] button').first().click()
await sleep(500)
await shot(attach, 'm4-light-preview')
await attach.keyboard.press('Escape')
await attach.close()

if (typeof FILE_CARD === 'string') {
  const files = await open('light', FILE_CARD)
  await shot(files, 'm4-light-file-card')
  await files.close()
}

/* ---- long content stress --------------------------------------------- */
const long = await open('light')
await long.evaluate(() => {
  const body = [...document.querySelectorAll('[data-chat-flow-kind="assistant-step"] .hWmORq_body')]
    .find((candidate) => candidate.querySelector('[data-code-wrap]'))
  if (!(body instanceof HTMLElement)) return
  const heading = document.createElement('h2')
  heading.textContent = '长内容压力用例'
  const paragraph = document.createElement('p')
  paragraph.textContent = ('这是一段很长的中文段落，用于验证 768px 阅读列中的换行、行高与段落间距。' +
    '它故意不使用空格，让浏览器只能依靠中日韩断行规则处理；如果容器没有正确的宽度和 word-break，页面会出现横向滚动。').repeat(3)
  body.append(heading, paragraph)
  const template = body.querySelector('[data-code-wrap]')
  if (template instanceof HTMLElement) {
    const code = template.cloneNode(true)
    const pre = code.querySelector('pre')
    if (pre instanceof HTMLElement) pre.textContent = 'const veryLongLine = "' + 'abcdefghij'.repeat(22) + '" // over-wide code line exercises horizontal scrolling'
    body.append(code)
  }
  body.lastElementChild?.scrollIntoView({ block: 'center' })
})
await sleep(400)
await shot(long, 'm4-light-long')

await long.evaluate(() => {
  const body = [...document.querySelectorAll('[data-chat-flow-kind="assistant-step"] .hWmORq_body')]
    .find((candidate) => candidate.querySelector('[data-code-wrap]'))
  const code = body?.querySelectorAll('[data-code-wrap]')
  code?.[code.length - 1]?.scrollIntoView({ block: 'center' })
})
await sleep(300)
await shot(long, 'm4-light-long-code')
const overflow = await long.evaluate(() => {
  const root = document.documentElement
  const bodies = [...document.querySelectorAll('[data-chat-flow-kind="assistant-step"] .hWmORq_body')]
  const body = bodies.find((candidate) => candidate.querySelector('[data-code-wrap]'))
  const blocks = body?.querySelectorAll('[data-code-wrap]') ?? []
  const block = blocks[blocks.length - 1]
  const scroller = block?.querySelector('[data-code-block-content] > div')
  return {
    pageOverflow: root.scrollWidth > root.clientWidth,
    codeScrolls: scroller === null || scroller === undefined ? null : scroller.scrollWidth > scroller.clientWidth
  }
})
console.log('long content:', overflow)
await long.close()
await composite('light', 'm4-light-implementation', lightRef)

/* ---- dark ------------------------------------------------------------- */
const darkRef = await reference('dark')
const dark = await open('dark')
await dark.locator('[data-chat-flow-kind="user"] .Sixlwa_bubble').first().hover()
await sleep(250)
await shot(dark, 'm4-dark-user-hover')
await dark.mouse.move(900, 420)
await dark.mouse.wheel(0, 360)
await sleep(350)
await shot(dark, 'm4-dark-implementation')
await shot(dark, 'm4-dark-code', await codeClip(dark))
await dark.close()
const darkAttach = await open('dark', ATTACH)
await shot(darkAttach, 'm4-dark-attachments')
await darkAttach.close()
await composite('dark', 'm4-dark-implementation', darkRef)

await browser.close()
