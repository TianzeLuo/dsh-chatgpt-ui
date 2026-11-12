#!/usr/bin/env node
/**
 * tools/matrix.mjs — Phase 5b acceptance matrix for the shared composer.
 *
 * One command sweeps the product surface that Phase 5b touches:
 *
 *   scenario      Chat / Work / super-agent
 *   session       new (blank) / existing (a turn was attempted)
 *   theme         dark / light
 *   interaction   collapsed / model+effort pill open / narrow panel
 *   input         empty / short / long (14 lines)
 *
 * Every cell is a clipped screenshot plus assertions on the live DOM. A cell
 * is `pass`, `diff` (mounted but a Phase 5b expectation is violated, with the
 * reason) or `missing` (the screen itself could not be reached — e.g. the
 * super-agent panel never activated). It writes:
 *
 *   docs/screenshots/matrix-cells/<cell>.png   one shot per cell
 *   docs/screenshots/matrix-*.png              five contact sheets
 *   docs/matrix.json                           every cell + totals
 *
 * Exit code is 1 when any cell is diff/missing, unless --allow-diff is passed.
 *
 * Dev-only tool: needs playwright-core + a Chromium build (not a package
 * dependency). Point it at one or two isolated instances:
 *
 *   node tools/matrix.mjs \
 *     --url-dark  "http://127.0.0.1:3095/?token=..." \
 *     --url-light "http://127.0.0.1:3094/?token=..." \
 *     --playwright /path/to/node_modules/playwright
 *
 * With one --url both themes run against that instance. The super-agent cell
 * needs DSH_SUPER_AGENT_HOME on a writable directory; without it the panel cell
 * is reported `missing` (not silently skipped).
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const args = new Map()
for (let index = 2; index < process.argv.length; index += 1) {
  const token = process.argv[index]
  if (!token.startsWith('--')) continue
  const key = token.slice(2)
  const next = process.argv[index + 1]
  if (next === undefined || next.startsWith('--')) {
    args.set(key, true)
  } else {
    args.set(key, next)
    index += 1
  }
}

const urlDark = args.get('url-dark') ?? args.get('url')
const urlLight = args.get('url-light') ?? urlDark
if (typeof urlDark !== 'string' || typeof urlLight !== 'string') {
  console.error('usage: node tools/matrix.mjs --url <tokenised-url> [--url-light <url>] [--out docs] [--allow-diff]')
  process.exit(2)
}

const OUT = resolve(ROOT, typeof args.get('out') === 'string' ? args.get('out') : 'docs')
// The sidebar row hover/menu and project-scoped cells belong to the Phase-4C
// leftovers, not Phase 5b. They need an existing session/project and are opt-in
// so the Phase 5b matrix stays 30 cells on a clean instance.
const includeSidebar = args.get('include-sidebar') === true
const SHOTS = join(OUT, 'screenshots')
const CELLS = join(SHOTS, 'matrix-cells')
mkdirSync(CELLS, { recursive: true })

const playwrightArg = typeof args.get('playwright') === 'string' ? args.get('playwright') : undefined
let playwright
try {
  const candidates = []
  if (playwrightArg !== undefined) candidates.push(playwrightArg)
  candidates.push('/mnt/f/project/y86/node_modules/playwright/index.mjs', 'playwright', 'playwright-core')
  let lastError
  for (const candidate of candidates) {
    try {
      playwright = await import(candidate)
      break
    } catch (error) {
      lastError = error
    }
  }
  if (playwright === undefined) throw lastError ?? new Error('playwright not found')
} catch (error) {
  console.error(`playwright is required for the matrix (${error.message})`)
  console.error('pass --playwright /path/to/node_modules/playwright')
  process.exit(2)
}

const chromium = playwright.chromium ?? playwright.default?.chromium
const CHROME =
  process.env.CHATGPT_UI_CHROME ?? process.env.PLAYWRIGHT_CHROMIUM ?? '/home/user/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome'
const browser = await chromium.launch({
  headless: true,
  executablePath: CHROME,
  args: ['--no-sandbox', '--disable-dev-shm-usage']
})

const cells = []
const consoleByTheme = {}
const record = (cell) => {
  cells.push(cell)
  const reason = cell.reason === '' ? '' : ` — ${cell.reason}`
  console.log(`${cell.status.toUpperCase().padEnd(7)} ${cell.id}${reason}`)
  return cell
}

/** Absolute geometry + the Phase 5b controls, measured in one evaluate. */
const measure = () => {
  const card = document.querySelector('[data-composer-card]')
  if (card === null) {
    return { card: null, mode: document.body.getAttribute('data-chatgpt-mode'), panel: document.querySelector('[data-super-agent-panel]') !== null }
  }
  const rect = (el) => {
    if (el === null || el === undefined) return null
    const box = el.getBoundingClientRect()
    return {
      x: Math.round(box.x),
      y: Math.round(box.y),
      w: Math.round(box.width),
      h: Math.round(box.height),
      right: Math.round(box.right),
      bottom: Math.round(box.bottom)
    }
  }
  const visible = (el) => {
    if (el === null || el === undefined) return false
    const style = getComputedStyle(el)
    const box = el.getBoundingClientRect()
    return style.display !== 'none' && style.visibility !== 'hidden' && box.width > 1 && box.height > 1
  }
  const text = (el) => (el === null || el === undefined ? '' : (el.textContent ?? '').replace(/\s+/g, ' ').trim())
  const pill = document.querySelector('[data-cgpt-model-pill]')
  const send = card.querySelector("[class*='_trailing'] button[class*='_primary']")
  const hostModel = card.querySelector("[data-slot='conversation.input.model'] button")
  const tools = document.querySelector('[data-cgpt-work-tools]')
  const row = card.querySelector("[class*='_row']")
  const four = [...document.querySelectorAll('*')].filter((el) => el.childElementCount === 0 && text(el) === '400K' && visible(el))
  const mic = [...card.querySelectorAll('button')].filter((button) => {
    const className = typeof button.className === 'string' ? button.className : ''
    const label = button.getAttribute('aria-label') ?? ''
    return /dictate|microphone|voice|听写|语音/i.test(`${className} ${label}`)
  })
  const editor = card.querySelector('[data-composer-input]')
  const menu = document.querySelector('[data-cgpt-model-menu]')
  const range = menu === null ? null : menu.querySelector('[data-cgpt-effort-range]')
  const thumb = menu === null ? null : menu.querySelector('.chatgpt-effort-thumb')
  const session = document.querySelector('[data-slot="conversation.session"]')
  return {
    mode: document.body.getAttribute('data-chatgpt-mode'),
    panel: document.querySelector('[data-super-agent-panel]') !== null,
    cards: document.querySelectorAll('[data-composer-card]').length,
    card: rect(card),
    row: rect(row),
    tools: visible(tools) ? rect(tools) : null,
    pill: visible(pill) ? rect(pill) : null,
    pillText: text(pill),
    hostModel: visible(hostModel),
    fourHundred: four.length > 0 ? rect(four[0]) : null,
    send: visible(send)
      ? {
          rect: rect(send),
          background: getComputedStyle(send).backgroundColor,
          radius: getComputedStyle(send).borderRadius,
          disabled: send.disabled === true || send.getAttribute('aria-disabled') === 'true'
        }
      : null,
    mic: mic.map((button) => text(button) || button.getAttribute('aria-label') || button.className),
    editor: rect(editor),
    text: text(editor).slice(0, 80),
    lines: (editor?.innerText ?? '').split('\n').length,
    over: Math.max(0, card.scrollWidth - card.clientWidth),
    menu:
      menu === null
        ? null
        : {
            rect: rect(menu),
            title: text(menu.querySelector('.chatgpt-model-menu-title')),
            models: [...menu.querySelectorAll('[data-cgpt-model-choice]')].map((el) => el.dataset.cgptModelChoice),
            current: menu.querySelector("[data-cgpt-model-choice][data-current='true']")?.dataset.cgptModelChoice ?? null,
            levels: [...menu.querySelectorAll('[data-cgpt-effort-level]')].map((el) => el.dataset.cgptEffortLevel),
            range: rect(range),
            thumb: rect(thumb),
            text: text(menu).slice(0, 120)
          },
    sessionText: text(session).slice(0, 160)
  }
}

const round = (value) => (value === null || value === undefined ? null : Math.round(value * 10) / 10)

/** Assertion collector: returns the failed checks' reasons. */
const checks = (list) => list.filter((check) => !check.ok).map((check) => check.reason)

const EXPECT = {
  send: (m, size = 36) => ({
    ok: m.send !== null && Math.abs(m.send.rect.w - size) <= 1 && Math.abs(m.send.rect.h - size) <= 1,
    reason: m.send === null ? 'send button missing' : `send is ${m.send.rect.w}x${m.send.rect.h}, expected ${size}x${size}`
  }),
  blue: (m) => ({
    ok: m.send !== null && /rgb\(44,\s*103,\s*197\)/.test(m.send.background),
    reason: m.send === null ? 'send button missing' : `send background is ${m.send.background}`
  }),
  round: (m) => ({
    ok: m.send !== null && /(9999px|9999em|50%)/.test(m.send.radius),
    reason: m.send === null ? 'send button missing' : `send radius is ${m.send.radius}`
  }),
  noMic: (m) => ({ ok: m.mic.length === 0, reason: m.mic.length === 0 ? '' : `mic/voice buttons present: ${m.mic.join(' | ')}` }),
  fourHundred: (m) => ({ ok: m.fourHundred !== null, reason: m.fourHundred === null ? '400K context chip not visible' : '' }),
  hostHidden: (m) => ({ ok: m.hostModel === false, reason: m.hostModel ? 'host model seat still visible next to the merged pill' : '' }),
  noTools: (m) => ({ ok: m.tools === null, reason: m.tools === null ? '' : 'tool row is still visible outside the new-session state' }),
  tools: (m) => ({ ok: m.tools !== null, reason: m.tools === null ? 'tool row missing in the new-session state' : '' }),
  pill: (m) => ({ ok: m.pill !== null, reason: m.pill === null ? 'merged model+effort pill missing' : '' }),
  noPill: (m) => ({ ok: m.pill === null, reason: m.pill === null ? '' : 'merged pill appears on the Chat card' }),
  pillText: (m) => {
    const label = m.pillText.replace(/\s+/g, '')
    return {
      ok: m.pill !== null && /(最高|高|中|低|极低|极高|max|high|medium|low)/i.test(label),
      reason: m.pill === null ? 'pill missing' : `pill text has no effort level: ${m.pillText}`
    }
  },
  noOverflow: (m) => ({ ok: m.over <= 1, reason: m.over <= 1 ? '' : `card overflows by ${m.over}px` })
}

const clip = (m, above = 18, below = 78) => {
  if (m.card === null) return undefined
  const viewport = { w: 1600, h: 1000 }
  const x = Math.max(0, m.card.x - 24)
  const width = Math.min(m.card.w + 48, viewport.w - x)
  const y = Math.max(0, m.card.y - above)
  const height = Math.min(m.card.h + above + below, 1400)
  return { x, y, width, height }
}

const clipMenu = (m) => (m.card === null ? undefined : clip(m, 430, 70))

const shot = async (page, id, clipBox) => {
  const file = join(CELLS, `${id}.png`)
  await page.screenshot({ path: file, clip: clipBox })
  return file
}

const add = async (page, meta, assertionList, options = {}) => {
  const m = await page.evaluate(measure)
  const failed = checks(assertionList(m))
  const unreachable = options.unreachable ?? ''
  const status = unreachable !== '' ? 'missing' : m.card === null ? 'missing' : failed.length > 0 ? 'diff' : 'pass'
  const reason = unreachable !== '' ? unreachable : m.card === null ? 'composer card did not mount' : failed.join('; ')
  const file = unreachable !== '' ? null : await shot(page, meta.id, options.clip ?? clip(m))
  return record({ ...meta, status, reason, shot: file, observed: m })
}

const dismissModals = async (page) => {
  for (let step = 0; step < 10; step += 1) {
    const closed = await page.evaluate(() => {
      const scope = document.querySelector('[role="presentation"], [role="dialog"]')
      if (scope === null) return false
      const close = scope.querySelector('button[aria-label="Close"]')
      if (close !== null) {
        close.click()
        return true
      }
      return false
    })
    if (!closed) break
    await page.waitForTimeout(350)
  }
}

const waitForCard = async (page) => {
  await page.waitForFunction(() => document.querySelector('[data-composer-card]') !== null, null, { timeout: 30000 })
  await page.waitForTimeout(500)
}

const newSession = async (page, mode) => {
  await page.click('[data-cgpt-new-chat]')
  await page.waitForTimeout(1500)
  // The product a fresh instance opens with is sticky, not necessarily the one
  // this scenario needs (a clean light home opened Chat). Pick the segment
  // explicitly; it is visible on the blank conversation.
  const segment = page.locator(`[data-segment="${mode}"]`).first()
  if ((await segment.count()) > 0 && (await segment.isVisible().catch(() => false))) {
    await segment.click()
    await page.waitForTimeout(1400)
  }
  await waitForCard(page)
  await page.waitForTimeout(700)
}

const fill = async (page, value) => {
  const editor = page.locator('[data-composer-input]').first()
  await editor.click()
  await editor.fill(value)
  await page.waitForTimeout(300)
}

const sendTurn = async (page, value) => {
  await fill(page, value)
  await page.keyboard.press('Enter')
  for (let step = 0; step < 15; step += 1) {
    await page.waitForTimeout(1000)
    const state = await page.evaluate(measure)
    const failed = state.sessionText.includes('Failed') || state.sessionText.includes('failed')
    if (state.tools === null && (state.sessionText.length > 10 || failed)) return state
  }
  return page.evaluate(measure)
}

const openPanel = async (page) => {
  const row = page.locator('[data-cgpt-super-agent]').first()
  if ((await row.count()) === 0) return false
  await row.click()
  for (let step = 0; step < 16; step += 1) {
    await page.waitForTimeout(500)
    const state = await page.evaluate(() => ({
      panel: document.querySelector('[data-super-agent-panel]') !== null,
      cards: document.querySelectorAll('[data-composer-card]').length,
      preparing: (document.body.innerText ?? '').includes('Preparing Super-agent')
    }))
    if (state.panel && state.cards > 0 && !state.preparing) return true
  }
  return false
}

const pageErrors = []
const watch = (page, theme) => {
  consoleByTheme[theme] = consoleByTheme[theme] ?? { pageErrors: [], consoleErrors: [] }
  page.on('pageerror', (error) => consoleByTheme[theme].pageErrors.push(String(error).slice(0, 200)))
  page.on('console', (message) => {
    if (message.type() !== 'error') return
    const text = message.text()
    if (/Failed to load resource.*(?:404|400)/i.test(text)) return
    if (/MISSING_CREDENTIAL|Qoder Personal Access Token/i.test(text)) return
    consoleByTheme[theme].consoleErrors.push(text.slice(0, 200))
  })
}

/** Sidebar rows: hover + the right-click menu, clipped to the sidebar. */
const sidebarClip = async (page) => {
  const box = await page.evaluate(() => {
    const sidebar = document.querySelector('[data-slot="sidebar"]')
    if (sidebar === null) return null
    const r = sidebar.getBoundingClientRect()
    return { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.min(760, Math.round(r.height)) }
  })
  return box ?? { x: 0, y: 0, width: 320, height: 760 }
}

const rowCells = async (page, theme) => {
  const rows = page.locator('[data-cgpt-session-row]')
  const count = await rows.count()
  if (count === 0) {
    record({ id: `row-hover-${theme}`, scenario: 'sidebar', state: 'existing', theme, interaction: 'row-hover', input: 'empty', status: 'missing', reason: 'no session row in the sidebar to hover', shot: null, observed: null })
    record({ id: `row-menu-${theme}`, scenario: 'sidebar', state: 'existing', theme, interaction: 'row-menu', input: 'empty', status: 'missing', reason: 'no session row in the sidebar to right-click', shot: null, observed: null })
    return
  }
  const row = rows.first()
  await row.hover()
  await page.waitForTimeout(500)
  const clip = await sidebarClip(page)
  const hover = await page.evaluate(() => {
    const row = document.querySelector('[data-cgpt-session-row]')
    const more = row?.querySelector('[data-cgpt-row-more]')
    const style = row === null ? null : getComputedStyle(row)
    return {
      row: row === null ? null : row.getBoundingClientRect().height,
      background: style?.backgroundColor ?? null,
      moreVisible: more !== null && more !== undefined && getComputedStyle(more).opacity !== '0',
      moreLabel: more?.getAttribute('aria-label') ?? null
    }
  })
  const hoverShot = join(CELLS, `row-hover-${theme}.png`)
  await page.screenshot({ path: hoverShot, clip })
  record({
    id: `row-hover-${theme}`, scenario: 'sidebar', state: 'existing', theme, interaction: 'row-hover', input: 'empty',
    status: hover.moreVisible ? 'pass' : 'diff',
    reason: hover.moreVisible ? '' : 'the row does not reveal its 更多 action on hover',
    shot: hoverShot, observed: hover
  })

  await row.click({ button: 'right' })
  await page.waitForTimeout(600)
  const menu = await page.evaluate(() => {
    const el = document.querySelector('[data-cgpt-session-menu]')
    if (el === null) return null
    const r = el.getBoundingClientRect()
    return {
      kind: el.dataset.cgptSessionMenu,
      rect: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)],
      items: [...el.querySelectorAll('[data-cgpt-menu-item]')].map((item) => item.dataset.cgptMenuItem)
    }
  })
  const menuShot = join(CELLS, `row-menu-${theme}.png`)
  await page.screenshot({ path: menuShot, clip })
  record({
    id: `row-menu-${theme}`, scenario: 'sidebar', state: 'existing', theme, interaction: 'row-menu', input: 'empty',
    status: menu !== null && menu.items.length > 0 ? 'pass' : 'diff',
    reason: menu === null ? 'right-click did not open a session menu' : menu.items.length === 0 ? 'session menu has no items' : '',
    shot: menuShot, observed: menu
  })
  await page.keyboard.press('Escape')
  await page.waitForTimeout(400)
}

/** A session that lives inside a project: open it from the project group. */
const projectCells = async (page, theme) => {
  const group = page.locator('[data-cgpt-nav^="project-"]').first()
  const groups = await group.count()
  if (groups === 0) {
    record({ id: `project-existing-${theme}`, scenario: 'project', state: 'existing', theme, interaction: 'collapsed', input: 'empty', status: 'missing', reason: 'no project group in the sidebar (no workspace was adopted as a project)', shot: null, observed: null })
    return
  }
  await group.click()
  await page.waitForTimeout(900)
  const row = page.locator('[data-cgpt-session-row]').first()
  if ((await row.count()) === 0) {
    record({ id: `project-existing-${theme}`, scenario: 'project', state: 'existing', theme, interaction: 'collapsed', input: 'empty', status: 'missing', reason: 'the project group has no session row', shot: null, observed: null })
    return
  }
  await row.click()
  await page.waitForTimeout(1800)
  await waitForCard(page)
  const projectName = await page.evaluate(() => {
    const label = document.querySelector('[data-cgpt-nav^="project-"] .chatgpt-project-name, [data-cgpt-nav^="project-"]')
    return (label?.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 40)
  })
  await add(page, { id: `project-existing-${theme}`, scenario: 'project', state: 'existing', theme, interaction: 'collapsed', input: 'empty', project: projectName }, (m) => [
    { ok: m.card !== null, reason: 'project session did not mount a composer' },
    EXPECT.pill(m),
    EXPECT.fourHundred(m),
    EXPECT.noMic(m),
    EXPECT.send(m, 36)
  ])
}

const runTheme = async (theme, url) => {
  const page = await browser.newPage({ viewport: { width: 1587, height: 907 }, colorScheme: theme, deviceScaleFactor: 1 })
  watch(page, theme)
  await page.goto(url, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('[data-slot="sidebar"]', { timeout: 60000 })
  await page.waitForFunction(() => document.body.getAttribute('data-chatgpt-ui') !== null, null, { timeout: 60000 })
  await page.waitForTimeout(2200)
  await dismissModals(page)

  // A clean DSH home has no project yet, so Work's composer asks to choose a
  // workspace. Opening the super-agent panel once registers its workspace as a
  // project; closing it before any turn leaves the panel router blank, so the
  // super-agent-new cell later still starts from the empty state.
  const warmed = await openPanel(page)
  if (warmed) {
    await page.keyboard.press('Escape')
    await page.waitForTimeout(1200)
  }
  await dismissModals(page)

  // ---- Work · new --------------------------------------------------------
  await newSession(page, 'agent')
  await add(page, { id: `work-new-${theme}`, scenario: 'work', state: 'new', theme, interaction: 'collapsed', input: 'empty' }, (m) => [
    { ok: m.mode === 'agent', reason: `body mode is ${m.mode}` },
    EXPECT.tools(m),
    EXPECT.pill(m),
    EXPECT.pillText(m),
    EXPECT.hostHidden(m),
    EXPECT.fourHundred(m),
    EXPECT.noMic(m),
    EXPECT.send(m, 36),
    EXPECT.blue(m),
    EXPECT.round(m),
    EXPECT.noOverflow(m)
  ])

  // pill open + keyboard reachability
  const pillLocator = page.locator('[data-cgpt-model-pill]').first()
  let pillFocusable = false
  try {
    await pillLocator.focus({ timeout: 3000 })
    pillFocusable = true
  } catch {
    pillFocusable = false
  }
  if (!pillFocusable) {
    record({ id: `work-pill-${theme}`, scenario: 'work', state: 'new', theme, interaction: 'model-pill-open', input: 'empty', status: 'diff', reason: 'merged pill missing, cannot exercise the popover', shot: null, observed: null })
  } else {
    await page.keyboard.press('ArrowDown')
    await page.waitForTimeout(700)
    const open = await add(page, { id: `work-pill-${theme}`, scenario: 'work', state: 'new', theme, interaction: 'model-pill-open', input: 'empty' }, (m) => [
      { ok: m.menu !== null, reason: 'popover did not open from ArrowDown on the pill' },
      { ok: (m.menu?.models.length ?? 0) >= 1, reason: 'popover has no model list' },
      { ok: (m.menu?.levels.length ?? 0) >= 2, reason: 'popover has no effort level list' },
      { ok: m.menu?.range !== null && Math.abs(m.menu.range.w - 256) <= 1 && Math.abs(m.menu.range.h - 24) <= 1, reason: 'effort track is not 256x24' },
      { ok: m.menu?.thumb !== null && Math.abs(m.menu.thumb.w - 28) <= 1, reason: 'effort thumb is not 28px' },
      { ok: m.menu?.rect !== null && m.menu.rect.bottom <= m.pill.y + 8, reason: 'popover is not above the pill' }
    ], { clip: clipMenu(await page.evaluate(measure)) })
    await page.keyboard.press('Escape')
    await page.waitForTimeout(300)
    const closed = await page.evaluate(() => document.querySelector('[data-cgpt-model-menu]') === null)
    if (!closed) open.reason = `${open.reason}${open.reason === '' ? '' : '; '}Escape did not close the popover`
    if (!closed) open.status = 'diff'
  }

  // ---- Work · input lengths ---------------------------------------------
  await fill(page, '给这个仓库加一个 README 校验')
  await add(page, { id: `work-short-${theme}`, scenario: 'work', state: 'new', theme, interaction: 'collapsed', input: 'short' }, (m) => [
    { ok: m.lines >= 1, reason: `short input rendered ${m.lines} line(s)` },
    { ok: m.row !== null && m.row.h <= 44, reason: `action row is ${m.row?.h ?? 'missing'}px tall` }
  ])

  const longText = Array.from({ length: 14 }, (_, index) => `第 ${index + 1} 行：检查长输入下的卡片高度、内部滚动和动作行。`).join('\n')
  await fill(page, longText)
  await add(page, { id: `work-long-${theme}`, scenario: 'work', state: 'new', theme, interaction: 'collapsed', input: 'long' }, (m) => [
    { ok: m.lines >= 10, reason: `long input rendered ${m.lines} lines` },
    { ok: m.card.h > 140, reason: `card did not grow for long input (${m.card.h}px)` },
    { ok: m.row !== null && m.row.h <= 44, reason: `action row is ${m.row?.h ?? 'missing'}px tall` },
    EXPECT.noOverflow(m)
  ])

  // ---- Work · existing ---------------------------------------------------
  const existing = await sendTurn(page, '/help')
  const existingReached = existing.tools === null
  await add(page, { id: `work-existing-${theme}`, scenario: 'work', state: 'existing', theme, interaction: 'collapsed', input: 'empty' }, (m) => [
    { ok: m.tools === null, reason: 'tool row is still visible in an opened Work session' },
    EXPECT.pill(m),
    EXPECT.hostHidden(m),
    EXPECT.fourHundred(m),
    EXPECT.noMic(m),
    EXPECT.send(m, 36),
    EXPECT.blue(m),
    EXPECT.noOverflow(m)
  ], { unreachable: existingReached ? '' : 'Work session never left the blank state (turn did not commit)' })

  if (existingReached) {
    await fill(page, longText)
    await add(page, { id: `work-existing-long-${theme}`, scenario: 'work', state: 'existing', theme, interaction: 'collapsed', input: 'long' }, (m) => [
      EXPECT.noTools(m),
      { ok: m.lines >= 10, reason: `long input rendered ${m.lines} lines` },
      { ok: m.row !== null && m.row.h <= 44, reason: `action row is ${m.row?.h ?? 'missing'}px tall` }
    ])
  }

  // ---- Chat ---------------------------------------------------------------
  await newSession(page, 'chat')
  await add(page, { id: `chat-new-${theme}`, scenario: 'chat', state: 'new', theme, interaction: 'collapsed', input: 'empty' }, (m) => [
    { ok: m.mode === 'chat', reason: `body mode is ${m.mode}` },
    EXPECT.noTools(m),
    EXPECT.noPill(m),
    EXPECT.noMic(m),
    EXPECT.send(m, 32),
    EXPECT.round(m)
  ])

  await fill(page, '给这个仓库加一个 README 校验')
  await add(page, { id: `chat-short-${theme}`, scenario: 'chat', state: 'new', theme, interaction: 'collapsed', input: 'short' }, (m) => [
    { ok: m.lines >= 1, reason: `short input rendered ${m.lines} line(s)` },
    EXPECT.noTools(m),
    EXPECT.noMic(m),
    EXPECT.send(m, 32),
    EXPECT.blue(m),
    EXPECT.round(m)
  ])

  const chatExisting = await sendTurn(page, '/help')
  await add(page, { id: `chat-existing-${theme}`, scenario: 'chat', state: 'existing', theme, interaction: 'collapsed', input: 'empty' }, (m) => [
    { ok: m.mode === 'chat', reason: `body mode is ${m.mode}` },
    EXPECT.noTools(m),
    EXPECT.noPill(m),
    EXPECT.noMic(m),
    EXPECT.fourHundred(m),
    EXPECT.send(m, 32)
  ], { unreachable: chatExisting.tools === null ? '' : 'Chat session never left the blank state' })

  await fill(page, longText)
  await add(page, { id: `chat-existing-long-${theme}`, scenario: 'chat', state: 'existing', theme, interaction: 'collapsed', input: 'long' }, (m) => [
    { ok: m.lines >= 10, reason: `long input rendered ${m.lines} lines` },
    EXPECT.noTools(m),
    EXPECT.noMic(m)
  ])

  // ---- optional Phase-4C coverage (needs an existing session/project) -----
  if (includeSidebar) {
    await rowCells(page, theme)
    await projectCells(page, theme)
  }

  // ---- super-agent panel --------------------------------------------------
  await newSession(page, 'agent')
  const panel = await openPanel(page)
  if (!panel) {
    record({
      id: `super-agent-new-${theme}`,
      scenario: 'super-agent',
      state: 'new',
      theme,
      interaction: 'collapsed',
      input: 'empty',
      status: 'missing',
      reason: 'super-agent panel did not activate (ensure failed or composer never mounted)',
      shot: null,
      observed: null
    })
    record({
      id: `super-agent-existing-${theme}`,
      scenario: 'super-agent',
      state: 'existing',
      theme,
      interaction: 'collapsed',
      input: 'empty',
      status: 'missing',
      reason: 'no panel composer to open a session in',
      shot: null,
      observed: null
    })
  } else {
    await add(page, { id: `super-agent-new-${theme}`, scenario: 'super-agent', state: 'new', theme, interaction: 'collapsed', input: 'empty' }, (m) => [
      { ok: m.panel, reason: 'super-agent panel root missing' },
      { ok: m.cards === 1, reason: `expected one shared composer, found ${m.cards}` },
      EXPECT.tools(m),
      EXPECT.pill(m),
      EXPECT.pillText(m),
      EXPECT.hostHidden(m),
      EXPECT.fourHundred(m),
      EXPECT.noMic(m),
      EXPECT.send(m, 36),
      EXPECT.blue(m),
      EXPECT.noOverflow(m)
    ])

    // narrow panel: 1200 leaves ~540px for the card because the activity rail
    // is still open; this is the width the Phase 5b brief calls out.
    await page.setViewportSize({ width: 1200, height: 900 })
    await page.waitForTimeout(900)
    const narrow = await add(page, { id: `super-agent-narrow-${theme}`, scenario: 'super-agent', state: 'new', theme, interaction: 'narrow', input: 'empty' }, (m) => [
      { ok: m.card.w >= 480 && m.card.w <= 620, reason: `narrow card is ${m.card.w}px, expected ~520` },
      { ok: m.row !== null && m.row.h <= 44, reason: `action row wrapped to ${m.row?.h ?? 'missing'}px` },
      { ok: m.pill !== null && m.send !== null && m.pill.right <= m.send.rect.x - 2, reason: 'pill overlaps or touches the send button' },
      { ok: m.tools !== null, reason: 'narrow empty panel lost the tool row' },
      { ok: m.tools !== null && m.tools.right <= m.card.right + 1, reason: 'tool row leaks past the card' },
      EXPECT.fourHundred(m),
      EXPECT.noOverflow(m)
    ])
    await page.setViewportSize({ width: 1587, height: 907 })
    await page.waitForTimeout(700)

    await page.locator('[data-cgpt-model-pill]').first().click()
    await page.waitForTimeout(700)
    await add(page, { id: `super-agent-pill-${theme}`, scenario: 'super-agent', state: 'new', theme, interaction: 'model-pill-open', input: 'empty' }, (m) => [
      { ok: m.menu !== null, reason: 'super-agent popover did not open' },
      { ok: (m.menu?.models.length ?? 0) >= 1 && (m.menu?.levels.length ?? 0) >= 2, reason: 'super-agent popover lacks models/levels' }
    ], { clip: clipMenu(await page.evaluate(measure)) })
    await page.keyboard.press('Escape')
    await page.waitForTimeout(300)

    await fill(page, '帮我看看这个仓库的结构')
    await add(page, { id: `super-agent-short-${theme}`, scenario: 'super-agent', state: 'new', theme, interaction: 'collapsed', input: 'short' }, (m) => [
      { ok: m.lines >= 1, reason: `short input rendered ${m.lines} lines` },
      EXPECT.noMic(m)
    ])

    const panelExisting = await sendTurn(page, '你好')
    await add(page, { id: `super-agent-existing-${theme}`, scenario: 'super-agent', state: 'existing', theme, interaction: 'collapsed', input: 'empty' }, (m) => [
      { ok: m.tools === null, reason: 'tool row is still visible in an opened super-agent session' },
      EXPECT.pill(m),
      EXPECT.hostHidden(m),
      EXPECT.fourHundred(m),
      EXPECT.noMic(m),
      EXPECT.send(m, 36)
    ], { unreachable: panelExisting.tools === null ? '' : 'super-agent session never left the blank state' })
  }

  consoleByTheme[theme].pageErrors = consoleByTheme[theme].pageErrors.slice(0, 20)
  consoleByTheme[theme].consoleErrors = consoleByTheme[theme].consoleErrors.slice(0, 20)
  await page.close()
}

const themes = String(args.get('themes') ?? 'dark,light')
  .split(',')
  .map((entry) => entry.trim())
  .filter((entry) => entry === 'dark' || entry === 'light')
for (const theme of themes) {
  await runTheme(theme, theme === 'dark' ? urlDark : urlLight)
}

// ---- native-parity cell --------------------------------------------------
// Optional: point the matrix at a clean instance and a skinned instance that
// both hold the same fixture session. This is the same gate as
// tools/native-parity.mjs, run inside the matrix so a geometry leak shows up as
// a normal `diff` cell and makes the matrix exit non-zero.
let parityReport = null
if (args.get('parity-clean') !== undefined && args.get('parity-skinned') !== undefined && args.get('parity-session') !== undefined) {
  const { compareMeasurements, measureInstance } = await import('./native-parity-lib.mjs')
  const clean = await measureInstance(browser, args.get('parity-clean'), args.get('parity-session'))
  const skinned = await measureInstance(browser, args.get('parity-skinned'), args.get('parity-session'))
  parityReport = compareMeasurements(clean.measurement, skinned.measurement)
  const parityShot = join(SHOTS, 'matrix-native-parity.png')
  await skinned.page.screenshot({ path: parityShot }).catch(() => {})
  record({
    id: 'native-parity',
    scenario: 'native-parity',
    state: 'existing',
    theme: 'light',
    interaction: 'verbose',
    input: 'fixture',
    status: parityReport.pass ? 'pass' : 'diff',
    reason: parityReport.pass ? '' : `${parityReport.counts.diff} native nodes moved by more than ${parityReport.tolerance}px (max ${parityReport.maxOffset}px)`,
    shot: parityShot,
    observed: parityReport
  })
  await clean.page.close()
  await skinned.page.close()
}

// ---- contact sheets ------------------------------------------------------
const byId = (id) => cells.find((cell) => cell.id === id)
const image = (cell, width = 300) => {
  if (cell === undefined || cell.shot === null) return ''
  const data = readFileSync(cell.shot).toString('base64')
  const label = `${cell.id} · ${cell.status === 'pass' ? '通过' : cell.status === 'diff' ? '差异' : '缺失'}`
  const color = cell.status === 'pass' ? '#3fb950' : cell.status === 'diff' ? '#d29922' : '#f85149'
  return `<figure><img src="data:image/png;base64,${data}" style="width:${width}px"><figcaption style="color:${color}">${label}</figcaption></figure>`
}

const sheet = async (name, title, figures) => {
  const sheetPage = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 })
  const html = `<!doctype html><meta charset="utf-8"><style>
    body{margin:0;padding:24px;background:#0d1117;color:#e6edf3;font:14px system-ui,sans-serif}
    h1{font-size:18px;margin:0 0 18px;font-weight:600}
    .grid{display:flex;flex-wrap:wrap;gap:14px;align-items:flex-start}
    figure{margin:0;border:1px solid #30363d;border-radius:10px;overflow:hidden;background:#161b22}
    figcaption{padding:7px 9px;font:12px ui-monospace,monospace;border-top:1px solid #30363d}
    img{display:block;max-width:100%}
  </style><h1>${title}</h1><div class="grid">${figures.join('')}</div>`
  await sheetPage.setContent(html, { waitUntil: 'load' })
  await sheetPage.evaluate(() => Promise.all([...document.images].map((img) => img.decode().catch(() => {}))))
  await sheetPage.waitForTimeout(250)
  const height = await sheetPage.evaluate(() => Math.max(300, Math.min(6000, document.body.scrollHeight + 20)))
  await sheetPage.setViewportSize({ width: 1600, height })
  await sheetPage.screenshot({ path: join(SHOTS, `${name}.png`), fullPage: true })
  await sheetPage.close()
  console.log('sheet', `${name}.png`)
}

const scenarioFigures = []
for (const scenario of ['work', 'chat', 'super-agent']) {
  for (const state of ['new', 'existing']) {
    for (const theme of ['dark', 'light']) {
      const cell = byId(`${scenario}-${state}-${theme}`)
      if (cell !== undefined) scenarioFigures.push(image(cell, 290))
    }
  }
}
await sheet('matrix-scenario', '场景矩阵：Chat / Work / super-agent × 新会话·已有会话 × 深色·浅色', scenarioFigures)

if (parityReport !== null) await sheet('matrix-native-parity', '原生会话一致性：clean vs skinned（逐节点 ≤1px）', [image(byId('native-parity'), 520)])

await sheet(
  'matrix-theme',
  '主题矩阵：深色 / 浅色 × Chat·Work·super-agent（新会话）',
  ['dark', 'light'].flatMap((theme) => ['chat', 'work', 'super-agent'].map((scenario) => image(byId(`${scenario}-new-${theme}`), 380))).filter(Boolean)
)

await sheet(
  'matrix-state',
  '会话状态矩阵：新会话（空态）/ 已有会话（有消息）',
  ['new', 'existing'].flatMap((state) => ['chat', 'work', 'super-agent'].map((scenario) => image(byId(`${scenario}-${state}-dark`), 380)).filter(Boolean)
  )
)

await sheet(
  'matrix-interaction',
  '控件交互矩阵：药丸展开（模型列表 + 强度轨道）/ 窄面板 520px',
  ['dark', 'light']
    .flatMap((theme) => ['work-pill', 'super-agent-pill', 'super-agent-narrow'].map((prefix) => image(byId(`${prefix}-${theme}`), 380)))
    .filter(Boolean)
)

await sheet(
  'matrix-input',
  '输入内容矩阵：空 / 短（1 行）/ 长（14 行、超一屏）',
  ['dark', 'light']
    .flatMap((theme) => ['work-new', 'work-short', 'work-long'].map((prefix) => image(byId(`${prefix}-${theme}`), 380)))
    .filter(Boolean)
)

// ---- per-theme-per-scene sheets（docs/screenshots/matrix-<theme>-<scene>.png）
// One file per theme+scene so a reviewer can open exactly the surface they care
// about (the five dimension sheets above answer "which dimension differs", these
// answer "what does dark Work look like in every state").
for (const theme of themes) {
  for (const scenario of ['work', 'chat', 'super-agent', 'project', 'sidebar']) {
    const group = cells.filter((cell) => cell.theme === theme && cell.scenario === scenario && cell.shot !== null)
    if (group.length === 0) continue
    await sheet(
      `matrix-${theme}-${scenario}`,
      `${theme} · ${scenario} — ${group.length} 格（状态 / 交互 / 输入长度）`,
      group.map((cell) => image(cell, 360))
    )
  }
}

// ---- per-theme-per-scene sheets（matrix-<theme>-<scene>.png）---------------
for (const theme of themes) {
  for (const scenario of ['work', 'chat', 'super-agent', 'project', 'sidebar']) {
    const group = cells.filter((cell) => cell.theme === theme && cell.scenario === scenario && cell.shot !== null)
    if (group.length === 0) continue
    await sheet(
      `matrix-${theme}-${scenario}`,
      `${theme} · ${scenario} — ${group.length} 格（状态 / 交互 / 输入长度）`,
      group.map((cell) => image(cell, 360))
    )
  }
}

// ---- JSON + exit code ----------------------------------------------------
const totals = {
  cells: cells.length,
  pass: cells.filter((cell) => cell.status === 'pass').length,
  diff: cells.filter((cell) => cell.status === 'diff').length,
  missing: cells.filter((cell) => cell.status === 'missing').length
}
const redact = (value) => value.replace(/([?&]token=)[^&]+/, '$1***')
const report = {
  generatedAt: new Date().toISOString(),
  urls: { dark: redact(urlDark), light: redact(urlLight) },
  dimensions: {
    scenario: includeSidebar ? ['chat', 'work', 'super-agent', 'project', 'sidebar'] : ['chat', 'work', 'super-agent'],
    state: ['new', 'existing'],
    theme: ['dark', 'light'],
    interaction: includeSidebar ? ['collapsed', 'model-pill-open', 'narrow', 'row-hover', 'row-menu'] : ['collapsed', 'model-pill-open', 'narrow'],
    input: ['empty', 'short', 'long']
  },
  totals,
  parity: parityReport,
  console: consoleByTheme,
  cells
}
writeFileSync(join(OUT, 'matrix.json'), JSON.stringify(report, null, 1))
console.log(`MATRIX ${totals.cells} cells: pass=${totals.pass} diff=${totals.diff} missing=${totals.missing}`)
for (const cell of cells.filter((entry) => entry.status !== 'pass')) console.log(`  ${cell.status} ${cell.id}: ${cell.reason}`)

await browser.close()
if ((totals.diff > 0 || totals.missing > 0) && args.get('allow-diff') !== true) process.exit(1)
