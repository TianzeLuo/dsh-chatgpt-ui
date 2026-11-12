#!/usr/bin/env node
/**
 * tools/m40-capture.mjs — P0-22: per-project session pagination.
 *
 *   node tools/m40-capture.mjs --url "http://127.0.0.1:3130/?token=…" [--out docs]
 *
 * The fixture has two projects:
 *   A = default-workspace (9 durable sessions, > N)
 *   B = dsh-p22-proj-b     (1 durable session, < N)
 * It switches 当前会话 to B so both projects are expanded and visible, then
 * records A's N-row first page + project-local 显示更多, clicks it once, and
 * verifies that only A grows. It also collapses/re-expands A to prove the
 * retained-limit policy. 最近 is sampled before/after each step and must keep
 * the same ids and count.
 *
 * N comes from the P0-22 fallback: the Host sidebar/workspace bundles expose
 * no per-project first-page descriptor, so N=8 (not a cursor from any list).
 *
 * Writes docs/m40.json and docs/screenshots/m40-*.png.
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
  console.error('usage: node tools/m40-capture.mjs --url <tokenised-url> [--out docs]')
  process.exit(2)
}
const OUT = resolve(ROOT, typeof args.get('out') === 'string' ? args.get('out') : 'docs')
const SHOTS = join(OUT, 'screenshots')
mkdirSync(SHOTS, { recursive: true })

const playwrightPath = process.env.M40_PLAYWRIGHT ?? 'playwright'
const CHROME =
  process.env.CHATGPT_UI_CHROME ?? process.env.HOME + '/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome'
const { chromium } = await import(playwrightPath)

const A_TITLE = 'default-workspace'
const B_TITLE = 'dsh-p22-proj-b'
const B_CWD = '/tmp/dsh-p22-proj-b'
const N = 8
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
  if (/^Failed to load resource/.test(message.text())) return
  errors.push(`console: ${message.text().slice(0, 240)}`)
})
page.on('response', (response) => {
  if (response.status() < 400) return
  httpErrors.push({ status: response.status(), url: response.url().replace(/([?&]token=)[^&]+/, '$1***') })
})

const waitReady = async () => {
  await page.waitForSelector(".chatgpt-sessions[data-phase='ready']", { timeout: 30000 })
  await page.waitForTimeout(700)
}

await page.goto(url, { waitUntil: 'networkidle' })
await waitReady()

// Find B's durable session from the Host catalog rather than guessing an id.
const bSessionId = await page.evaluate(async (cwd) => {
  const rpcId = crypto.randomUUID()
  const response = await fetch('/api/session/list', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ type: 'client-request', rpcId, method: 'session/list', payload: { args: { _request: {} } } })
  })
  const json = await response.json()
  return json?.result?.value?.items?.find((item) => item.cwd === cwd)?.sessionId
}, B_CWD)
if (typeof bSessionId !== 'string') throw new Error(`m40 fixture: no Session under ${B_CWD}`)

// B's blank session must be current for the Host to make B's project visible.
await page.evaluate((sessionId) => {
  localStorage.setItem('dsh.sessions.current', JSON.stringify({ sessionId }))
}, bSessionId)
await page.reload({ waitUntil: 'networkidle' })
await waitReady()

const shot = async (name, target, clip) => {
  const path = join(SHOTS, name)
  if (target !== undefined) await target.screenshot({ path })
  else await page.screenshot({ path, ...(clip === undefined ? {} : { clip }) })
  screenshots.push({ name, path: `screenshots/${name}`, bytes: readFileSync(path).length })
}

const projectLocator = (title) =>
  page.locator('.chatgpt-project').filter({ has: page.locator('.chatgpt-project-title', { hasText: title }) })

const readState = () =>
  page.evaluate(() => {
    const projectOf = (node) => {
      const rows = [...node.querySelectorAll('.chatgpt-project-body button.chatgpt-session-row')]
      const more = node.querySelector('[data-cgpt-project-load-more]')
      return {
        id: node.querySelector('[data-cgpt-project-row]')?.getAttribute('data-cgpt-project-row') ?? '',
        title: node.querySelector('.chatgpt-project-title')?.textContent ?? '',
        total: Number(node.getAttribute('data-cgpt-project-total')),
        visible: Number(node.getAttribute('data-cgpt-project-visible')),
        rows: rows.map((row) => row.getAttribute('data-cgpt-nav')).filter(Boolean),
        expanded: node.querySelector('[data-cgpt-project-row]')?.getAttribute('aria-expanded') === 'true',
        more: more === null ? null : { text: more.textContent ?? '', id: more.getAttribute('data-cgpt-project-load-more') }
      }
    }
    const projects = [...document.querySelectorAll('.chatgpt-project')].map(projectOf)
    const recent = [...document.querySelectorAll('.chatgpt-recent button.chatgpt-session-row')].map((row) => ({
      id: row.getAttribute('data-cgpt-nav') ?? '',
      title: row.title ?? ''
    }))
    const pinned = [...document.querySelectorAll('.chatgpt-pinned button.chatgpt-session-row')].map(
      (row) => row.getAttribute('data-cgpt-nav') ?? ''
    )
    return {
      projects,
      recent,
      pinned,
      currentSessionId: JSON.parse(localStorage.getItem('dsh.sessions.current') ?? '{}').sessionId ?? null,
      placeholder: (document.body.textContent ?? '').includes('加载更多以显示'),
      globalPager: document.querySelector('[data-cgpt-load-more]') !== null
    }
  })

const closeProjectCard = async () => {
  await page.mouse.move(5, 5)
  await page.waitForTimeout(120)
}

const pick = (state, title) => state.projects.find((project) => project.title === title)

await shot('m40-sidebar-before.png', undefined, { x: 52, y: 84, width: 288, height: 746 })
await shot('m40-a-before.png', projectLocator(A_TITLE))
await shot('m40-b-before.png', projectLocator(B_TITLE))
await shot('m40-recent-before.png', page.locator('.chatgpt-recent'))

const before = await readState()
const aBefore = pick(before, A_TITLE)
const bBefore = pick(before, B_TITLE)
addAssertion('N-recorded', N === 8, `N=${N} fallback`)
addAssertion('A-first-page-min-N', aBefore !== undefined && aBefore.visible === Math.min(N, aBefore.total) && aBefore.total > N, JSON.stringify(aBefore))
addAssertion('A-has-project-local-more', aBefore?.more !== null && aBefore?.more?.id === aBefore?.id, JSON.stringify(aBefore?.more))
addAssertion('B-all-rows', bBefore !== undefined && bBefore.visible === Math.min(N, bBefore.total) && bBefore.more === null, JSON.stringify(bBefore))
addAssertion('no-loaded-placeholder-before', before.placeholder === false && before.globalPager === false, JSON.stringify(before.placeholder))

const more = projectLocator(A_TITLE).locator('[data-cgpt-project-load-more]')
await more.click()
await page.waitForTimeout(400)
await closeProjectCard()

const after = await readState()
const aAfter = pick(after, A_TITLE)
const bAfter = pick(after, B_TITLE)
const sameRecent = JSON.stringify(after.recent) === JSON.stringify(before.recent)
addAssertion('A-only-grows', aAfter !== undefined && aAfter.visible === Math.min(aAfter.total, aBefore.visible + N) && aAfter.more === null, JSON.stringify(aAfter))
addAssertion('B-unchanged-after-click', JSON.stringify(bAfter) === JSON.stringify(bBefore), JSON.stringify(bAfter))
addAssertion('recent-unchanged-after-click', sameRecent && after.recent.length === before.recent.length, `${before.recent.length} -> ${after.recent.length}`)
addAssertion('no-loaded-placeholder-after', after.placeholder === false && after.globalPager === false, JSON.stringify(after.placeholder))

await shot('m40-a-after.png', projectLocator(A_TITLE))
await shot('m40-b-after.png', projectLocator(B_TITLE))
await shot('m40-sidebar-after.png', undefined, { x: 52, y: 84, width: 288, height: 746 })
await shot('m40-recent-after.png', page.locator('.chatgpt-recent'))

// Retain policy: collapse/re-expand A; the loaded count must survive.
await projectLocator(A_TITLE).locator('[data-cgpt-project-row]').click()
await page.waitForTimeout(250)
const collapsed = await readState()
await shot('m40-a-collapsed.png', projectLocator(A_TITLE))
await projectLocator(A_TITLE).locator('[data-cgpt-project-row]').click()
await page.waitForTimeout(300)
await closeProjectCard()
const reopened = await readState()
const aReopened = pick(reopened, A_TITLE)
const bReopened = pick(reopened, B_TITLE)
addAssertion('collapse-keeps-more-hidden', collapsed.projects.every((project) => project.expanded === false || project.id !== aBefore?.id), JSON.stringify(collapsed.projects))
addAssertion('reopen-retains-loaded-count', aReopened !== undefined && aReopened.visible === aAfter?.visible && aReopened.more === null, JSON.stringify(aReopened))
addAssertion('reopen-keeps-B-and-recent', JSON.stringify(bReopened) === JSON.stringify(bBefore) && JSON.stringify(reopened.recent) === JSON.stringify(before.recent), `${reopened.recent.length}`)
await shot('m40-a-reopened.png', projectLocator(A_TITLE))

const report = {
  task: 'P0-22',
  title: '项目内会话列表分页隔离',
  n: {
    value: N,
    basis: 'fallback',
    hostProbe:
      'The Host sidebar/workspace client bundles expose no per-project first-page constant; the native project browser renders all members. P0-22 therefore uses the brief\'s explicit fallback N=8.',
    notFrom: 'No 最近 or pinned cursor participates in a project limit.'
  },
  rootCause:
    'chatgptPageSessionSections used one global remaining budget across pinned + all projects. Once earlier rows consumed it, a later project got zero rows with truncated=true; the UI rendered only 加载更多以显示.',
  state: {
    projectLimits: 'Record<projectId, number> in React state; missing id -> N; each project is sliced independently',
    projectPage: 'min(limit, project.total), limit starts at 8 and adds 8 per click',
    recentLimit: 'separate React state, initial 12, +12 per recent 显示更多',
    pinned: 'rendered in full; no project pager',
    persisted: false
  },
  reopen: {
    policy: 'retain',
    reason:
      'A deliberate 显示更多 is not discarded by an accidental collapse; the per-project map stays mounted. Reopening shows the last loaded count. A page reload starts every project at N because the map is component-local.',
    verified: aReopened?.visible === aAfter?.visible
  },
  projects: {
    a: { title: A_TITLE, id: aBefore?.id ?? '', before: aBefore, after: aAfter, reopened: aReopened },
    b: { title: B_TITLE, id: bBefore?.id ?? '', before: bBefore, after: bAfter, reopened: bReopened }
  },
  recent: {
    before: before.recent,
    after: after.recent,
    reopened: reopened.recent,
    unchanged: sameRecent && JSON.stringify(reopened.recent) === JSON.stringify(before.recent)
  },
  pinned: { before: before.pinned, after: after.pinned, reopened: reopened.pinned, unchanged: JSON.stringify(after.pinned) === JSON.stringify(before.pinned) },
  currentSessionId: bSessionId,
  assertions,
  screenshots,
  errors,
  httpErrors
}

writeFileSync(join(OUT, 'm40.json'), JSON.stringify(report, null, 1) + '\n')
await browser.close()

const failed = assertions.filter((assertion) => assertion.ok !== true)
console.log(JSON.stringify({ assertions: assertions.length, failed: failed.length, screenshots: screenshots.length, errors: errors.length }, null, 1))
if (failed.length > 0) process.exitCode = 1
