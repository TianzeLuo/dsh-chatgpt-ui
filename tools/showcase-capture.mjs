#!/usr/bin/env node
/**
 * tools/showcase-capture.mjs — regenerate the README screenshots.
 *
 * The four frames must never show a real workspace, session title, path or
 * avatar, so this script only talks to an ISOLATED DSH instance: its own
 * DSH_HOME, its own port, and demo data created for the purpose (see
 * docs/testing.md → "README screenshots"). It refuses any non-loopback host.
 *
 * Expected demo data — all English, so the frames carry no Chinese demo text
 * next to the zh-CN chrome: three projects (Demo Project with three sessions,
 * Personal Notes with three, Marketing Site with two), and a real transcript in
 * "Draft the README outline" (user bubble + assistant answer).
 *
 *   node tools/showcase-capture.mjs --url "http://127.0.0.1:3105/?token=…" \
 *     [--out docs/images] [--port 3105]
 *
 * Every frame is 1440×900 CSS pixels at devicePixelRatio 2, dark theme, zh-CN
 * UI, so the four files share one size and one zoom level:
 *
 *   new-session-effort-dark.png   new Chat session, effort slider expanded below the pill
 *   new-session-work-dark.png     new Work session, project bound, one bottom row
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
const expectedPort = String(args.get('port') ?? '3105')
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
  const text = await page.evaluate(() => document.body.innerText.replace(/\s+/g, ' '))
  const leak = text.match(PATH_LEAK)
  if (leak !== null) throw new Error(`showcase: ${name} shows a host path — ${leak[0]}`)
  await page.screenshot({ path: join(OUT, name) })
  console.log(`showcase: ${name}`)
}

/* Demo data must stay English: the frames sit next to a zh-CN chrome, and a
   mixed sidebar reads like a real workspace rather than a demo one. */
const CJK = /[\u3400-\u9fff]/
const auditSidebar = async () => {
  const rows = await page.evaluate(() => ({
    projects: [...document.querySelectorAll('[data-cgpt-project-row]')].map((el) => el.innerText.replace(/\s+/g, ' ').trim()),
    sessions: [...document.querySelectorAll('[data-cgpt-session-row]')].map((el) => el.innerText.replace(/\s+/g, ' ').trim())
  }))
  const offending = [...rows.projects, ...rows.sessions].filter((text) => CJK.test(text))
  if (offending.length > 0) throw new Error(`showcase: sidebar demo data is not English — ${offending.join(' | ')}`)
  return rows
}

/* No frame may show a host path (`/tmp/…`, `/mnt/…`, `F:\…`) — the demo
   projects use synthetic paths and the audit keeps it that way. */
const PATH_LEAK = /(\/tmp\/|\/mnt\/|[A-Za-z]:\\|\/home\/)/

/* P4-b: on the blank Chat hero the panel grows out of the pill downwards, its
   right edge on the pill's right edge and 8px below it. The frame only reads as
   the reference when that anchor holds, so the capture refuses to save one that
   drifted. */
const openEffortPanel = async () => {
  await page.locator('[data-cgpt-model-pill]').click()
  await page.waitForTimeout(800)
  if (await page.locator('.chatgpt-effort-slider').count() === 0) {
    throw new Error('showcase: the effort slider did not open — is the demo model missing reasoning metadata?')
  }
  const geometry = await page.evaluate(() => {
    const pill = document.querySelector('[data-cgpt-model-pill]').getBoundingClientRect()
    const menu = document.querySelector('.chatgpt-effort-menu').getBoundingClientRect()
    return {
      pillRight: Math.round(pill.right),
      pillBottom: Math.round(pill.bottom),
      menuTop: Math.round(menu.top),
      menuRight: Math.round(menu.right),
      side: document.querySelector('.chatgpt-effort-menu').getAttribute('data-cgpt-panel-side'),
      pills: document.querySelectorAll('[data-cgpt-model-pill]').length,
      open: document.querySelectorAll('[data-cgpt-model-pill][data-open="true"]').length
    }
  })
  if (Math.abs(geometry.menuRight - geometry.pillRight) > 1) {
    throw new Error(`showcase: the effort panel is not right-aligned to its pill — ${JSON.stringify(geometry)}`)
  }
  const gap = geometry.menuTop - geometry.pillBottom
  if (geometry.side !== 'below' || gap < 6 || gap > 10) {
    throw new Error(`showcase: the blank-hero panel is not 8px below the pill — ${JSON.stringify({ ...geometry, gap })}`)
  }
  if (geometry.pills !== 1 || geometry.open !== 1) {
    throw new Error(`showcase: expected exactly one open trigger — ${JSON.stringify(geometry)}`)
  }
  return geometry
}

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

// 1 — new Chat session, effort panel open below the pill.
await page.locator('[data-cgpt-new-chat]').first().click()
await page.waitForTimeout(1200)
await chatTab.click()
await page.waitForTimeout(900)
const mode = await page.evaluate(() => document.body.getAttribute('data-chatgpt-mode'))
if (mode !== 'chat') throw new Error(`showcase: expected Chat mode, got ${mode}`)
const geometry = await openEffortPanel()
await shot('new-session-effort-dark.png')

// 2 — new Work session, project bound, permission chip and the single bottom row.
await page.keyboard.press('Escape')
await page.waitForTimeout(400)
await workTab.click()
await page.waitForTimeout(900)
await page.locator('[data-cgpt-work-tool="project"]').click()
await page.waitForTimeout(500)
await page.locator('[data-cgpt-project-option="demo-project"]').click()
await page.waitForTimeout(800)
const bound = await page.locator('[data-cgpt-work-tool="project"]').innerText()
if (!bound.includes('Demo Project')) throw new Error(`showcase: the project chip does not name the demo project — ${bound}`)
await shot('new-session-work-dark.png')

// 3 — an existing session: bubbles above, docked composer below.
await page.locator('[data-cgpt-session-row]').filter({ hasText: 'Draft the README outline' }).first().click()
await page.waitForTimeout(2500)
// Park the pointer over empty canvas: a resting hover on a project row opens
// the project card on top of the transcript.
await page.mouse.move(1400, 860)
await page.waitForTimeout(400)
if (await page.locator('.chatgpt-project-card').count() > 0 && await page.locator('.chatgpt-project-card').first().isVisible()) {
  throw new Error('showcase: the project hover card is covering the transcript')
}
await shot('session-dark.png')

// 4 — sidebar detail: the project ⋯ menu.
const projectRow = page.locator('[data-cgpt-project-row]').filter({ hasText: 'Demo Project' }).first()
await projectRow.hover()
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

const rows = await auditSidebar()
await browser.close()
console.log(`showcase: panel right ${geometry.menuRight} / pill right ${geometry.pillRight}; gap ${geometry.menuTop - geometry.pillBottom}; sidebar — ${rows.projects.join(', ')}; ${rows.sessions.length} sessions`)
