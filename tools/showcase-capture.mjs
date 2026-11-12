#!/usr/bin/env node
/**
 * tools/showcase-capture.mjs — regenerate the README screenshots.
 *
 * The four frames must never show a real workspace, session title, path or
 * avatar, so this script only talks to an ISOLATED DSH instance: its own
 * DSH_HOME, its own port, and demo data created for the purpose (see
 * docs/testing.md → "README screenshots"). It refuses any non-loopback host.
 *
 * Expected demo data — two projects (示例项目 / Demo Project) plus one empty
 * project (Empty Project), one session titled 你好 holding a greeting answer,
 * one session titled 示例会话 B, and one session titled Sample session.
 *
 *   node tools/showcase-capture.mjs --url "http://127.0.0.1:3104/?token=…" \
 *     [--out docs/images] [--port 3104]
 *
 * Every frame is 1440×900 CSS pixels at devicePixelRatio 2, dark theme, zh-CN
 * UI, so the four files share one size and one zoom level:
 *
 *   new-session-effort-dark.png   new Work session, effort slider expanded
 *   new-session-work-dark.png     new Work session with a draft, project bound
 *   session-dark.png              existing session: bubbles + composer + sidebar
 *   project-menu-dark.png         sidebar project ⋯ menu open
 */
import { mkdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const args = new Map()
for (let index = 2; index < process.argv.length; index += 1) {
  const token = process.argv[index]
  if (!token.startsWith('--')) continue
  const next = process.argv[index + 1]
  if (next === undefined || next.startsWith('--')) args.set(token.slice(2), true)
  else { args.set(token.slice(2), next); index += 1 }
}

const url = args.get('url')
if (typeof url !== 'string') {
  console.error('usage: node tools/showcase-capture.mjs --url <tokenised-url> [--out docs/images]')
  process.exit(2)
}
const expectedPort = String(args.get('port') ?? '3104')
const parsed = new URL(url)
if (parsed.hostname !== '127.0.0.1' || parsed.port !== expectedPort) {
  console.error(`showcase: refusing ${parsed.hostname}:${parsed.port} — run it against an isolated instance (127.0.0.1:${expectedPort})`)
  process.exit(2)
}
const OUT = resolve(ROOT, typeof args.get('out') === 'string' ? args.get('out') : 'docs/images')
mkdirSync(OUT, { recursive: true })

const playwrightPath = process.env.SHOWCASE_PLAYWRIGHT ?? 'playwright'
const CHROME = process.env.CHATGPT_UI_CHROME ?? process.env.HOME + '/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome'
const { chromium } = await import(playwrightPath)
const browser = await chromium.launch({ headless: true, executablePath: CHROME, args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'] })
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 2,
  colorScheme: 'dark',
  locale: 'zh-CN'
})
const page = await context.newPage()
const shot = async (name) => {
  await page.screenshot({ path: join(OUT, name) })
  console.log(`showcase: ${name}`)
}
const visibleText = () => page.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').trim())

await page.goto(url, { waitUntil: 'domcontentloaded' })
await page.waitForSelector('[data-cgpt-rail-item]', { timeout: 30000 })
await page.waitForTimeout(2000)

const dismissNotice = page.getByRole('button', { name: 'Continue' })
if (await dismissNotice.count() > 0) {
  await dismissNotice.click()
  await page.waitForTimeout(600)
}

const modeGroup = page.locator('.chatgpt-mode-group')
const chatTab = modeGroup.getByText('聊天', { exact: true })
const workTab = modeGroup.getByText('工作', { exact: true })

// 1 — new Work session inside a project, effort panel open.
await workTab.click()
await page.waitForTimeout(700)
const exampleProject = page.locator('[data-cgpt-project-row]').filter({ hasText: '示例项目' }).first()
await exampleProject.hover()
await page.waitForTimeout(400)
await page.locator('[data-cgpt-project-new]').last().click({ force: true })
await page.waitForTimeout(1500)
const mode = await page.evaluate(() => document.body.getAttribute('data-chatgpt-mode'))
if (mode !== 'agent') throw new Error(`showcase: expected Work mode, got ${mode}`)
await page.locator('[data-cgpt-model-pill]').click()
await page.waitForTimeout(900)
if (await page.locator('.chatgpt-effort-slider').count() === 0) {
  throw new Error('showcase: the effort slider did not open — is the demo model missing reasoning metadata?')
}
await shot('new-session-effort-dark.png')

// 2 — same new session, panel closed, a draft typed into the card.
await page.keyboard.press('Escape')
await page.waitForTimeout(400)
await page.locator('[data-composer-input]').first().click()
await page.keyboard.type('帮我把这个项目的 README 补一版，先列提纲。', { delay: 12 })
await page.waitForTimeout(500)
await shot('new-session-work-dark.png')

// 3 — an existing session: bubbles above, docked composer below.
await page.locator('[data-cgpt-session-row]').filter({ hasText: '你好' }).first().click()
await page.waitForTimeout(2500)
await shot('session-dark.png')

// 4 — sidebar detail: the project ⋯ menu.
const projectForMenu = page.locator('[data-cgpt-project-row]').filter({ hasText: '示例项目' }).first()
await projectForMenu.hover()
await page.waitForTimeout(500)
const more = page.locator('[data-cgpt-project-more]').last()
try {
  await more.click({ timeout: 4000 })
} catch {
  // The row button sits above the ⋯ glyph in the host DOM; the dispatched
  // click reaches the same handler without moving the pointer off the row.
  await more.dispatchEvent('click')
}
await page.waitForTimeout(700)
await shot('project-menu-dark.png')

const text = await visibleText()
await browser.close()
console.log(`showcase: sidebar text for review — ${text.slice(0, 400)}`)
