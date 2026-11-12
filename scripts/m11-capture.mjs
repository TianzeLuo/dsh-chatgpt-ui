#!/usr/bin/env node
/**
 * scripts/m11-capture.mjs — measure the M11 regression surfaces on one live DSH.
 *
 * The script drives an isolated DSH Web instance that carries the deterministic
 * transcript from `test/fixtures/m11-llm` (see `docs/m11-fixes.md`), and writes
 * one skin state to `<out>/<tag>.json` plus per-item crops under `<out>/<tag>/`.
 *
 *   node scripts/m11-capture.mjs --url "http://127.0.0.1:3101/?token=..." --tag before
 *
 * Read-only towards the Host: it never sends a message or writes a Host file.
 * The only mutations are the browser's own `cgpt-skin` and
 * `dsh.conversation.contentWidth` keys, restored before the run ends. The
 * native (skin-off) reading comes from the same session in the same context,
 * so both sides describe identical transcript DOM.
 *
 * Dev-only tool: needs playwright + Chromium, same as tools/matrix.mjs.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
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
  console.error('usage: node scripts/m11-capture.mjs --url <tokenised-url> [--tag before] [--out .m11-tmp]')
  process.exit(2)
}
const TAG = typeof args.get('tag') === 'string' ? args.get('tag') : 'state'
const ONLY = typeof args.get('only') === 'string' ? args.get('only') : null
if (ONLY !== null && ONLY !== 'on' && ONLY !== 'off') {
  console.error('m11-capture: --only takes on|off')
  process.exit(2)
}
const OUT = resolve(ROOT, typeof args.get('out') === 'string' ? args.get('out') : '.m11-tmp')
const SHOTS = join(OUT, TAG)
mkdirSync(SHOTS, { recursive: true })

const playwrightArg = typeof args.get('playwright') === 'string' ? args.get('playwright') : undefined
let playwright
for (const candidate of [
  ...(playwrightArg === undefined ? [] : [playwrightArg]),
  '/mnt/f/project/y86/node_modules/playwright/index.mjs',
  'playwright',
  'playwright-core'
]) {
  try {
    playwright = await import(candidate)
    break
  } catch {}
}
if (playwright === undefined) {
  console.error('m11-capture: playwright is required (pass --playwright <dir>)')
  process.exit(2)
}
const CHROME =
  process.env.M11_CHROME ?? '/home/user/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome'

const browser = await playwright.chromium.launch({
  headless: true,
  executablePath: CHROME,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--disable-software-rasterizer']
})

const VIEWPORT = { width: 1600, height: 1000 }
const WIDTH_PREF = 'dsh.conversation.contentWidth'
const SKIN_KEY = 'cgpt-skin'

const context = await browser.newContext({ viewport: VIEWPORT, locale: 'zh-CN', deviceScaleFactor: 1 })
const page = await context.newPage()

async function waitForApp() {
  await page.waitForSelector('[data-composer-input]', { timeout: 30000 }).catch(() => {})
  await page.waitForTimeout(600)
  const close = page.getByRole('button', { name: 'Close' }).first()
  if (await close.count()) await close.click({ force: true }).catch(() => {})
  await page.waitForTimeout(500)
}

/** Selects the fixture transcript (the one with a changed-files card). */
async function selectFixture() {
  if (await page.locator('[data-changed-files]').count()) return true
  const fold = page.getByRole('button', { name: /展开其余/ }).first()
  if (await fold.count()) await fold.click({ force: true }).catch(() => {})
  const ids = await page.evaluate(() =>
    [...document.querySelectorAll('[data-cgpt-session-row]')].map((node) => node.getAttribute('data-cgpt-session-row'))
  )
  for (const id of ids) {
    const row = page.locator(`[data-cgpt-session-row="${id}"]`).first()
    if ((await row.count()) === 0) continue
    if ((await row.innerText()).includes('新会话')) continue
    await row.click({ force: true }).catch(() => {})
    await page.waitForTimeout(650)
    if (await page.locator('[data-changed-files]').count()) return true
  }
  return false
}

async function scrollToBottom() {
  await page.evaluate(() => {
    const scroller = document.querySelector('[data-conversation-scroll]')
    if (scroller !== null) scroller.scrollTop = scroller.scrollHeight
  })
  await page.waitForTimeout(250)
}

async function measure() {
  return await page.evaluate(() => {
    const round = (value) => Math.round(value * 10) / 10
    const rect = (el) => {
      if (el === null || el === undefined) return null
      const box = el.getBoundingClientRect()
      return { x: round(box.x), y: round(box.y), w: round(box.width), h: round(box.height), bottom: round(box.bottom), right: round(box.right) }
    }
    const q = (selector) => document.querySelector(selector)
    const qa = (selector) => [...document.querySelectorAll(selector)]
    const style = (el, keys) => {
      if (el === null) return null
      const computed = getComputedStyle(el)
      return Object.fromEntries(keys.map((key) => [key, computed.getPropertyValue(key)]))
    }

    const proc = q("[data-chat-flow-kind='turn-process']")
    const procRow = q("[data-chat-flow-kind='turn-process'] button")
    const step = q("[data-chat-flow-kind='assistant-step']")
    const processBody = q('[data-step-process-body]') ?? q('[data-step-process]')
    const card = q('[data-changed-files]')
    const composer = q('[data-composer-card]')
    const stat = q('[data-composer-stat]')
    const seat = q('[class*="_composerSeat"]')
    const column = q('[data-conversation-scroll] [class*="_column"]')
    const handle = q('[data-width-handle="right"]')
    const body = q('[class*="_body"]')
    const diffBody = q('[class*="IP6KhG_body"]')
    const preview = q('[data-changed-files] [class*="hz8-rW_preview"]')

    return {
      skin: document.body.dataset.cgptSkin ?? 'off',
      viewport: { w: innerWidth, h: innerHeight },
      spacing: {
        proc: rect(proc),
        procRow: rect(procRow),
        step: rect(step),
        gapProcToStep: proc === null || step === null ? null : round(step.getBoundingClientRect().top - proc.getBoundingClientRect().bottom),
        gapRowToStep: procRow === null || step === null ? null : round(step.getBoundingClientRect().top - procRow.getBoundingClientRect().bottom),
        processBody: rect(processBody)
      },
      composer: {
        card: rect(composer),
        stat: rect(stat),
        seat: rect(seat),
        gapCardToStat: composer === null || stat === null ? null : round(stat.getBoundingClientRect().top - composer.getBoundingClientRect().bottom),
        gapStatToBottom: stat === null ? null : round(innerHeight - stat.getBoundingClientRect().bottom),
        cardStyle: style(composer, ['margin-bottom', 'padding-bottom'])
      },
      diff: {
        card: rect(card),
        header: rect(card?.querySelector('button')),
        headerStyle: style(card?.querySelector('button'), ['width', 'height', 'padding']),
        buttonWidths: qa('[data-changed-files] button').map((el) => round(el.getBoundingClientRect().width)),
        pathWidths: qa('[data-changed-files] [class*="_path"]').map((el) => round(el.getBoundingClientRect().width)),
        titleText: card?.querySelector('[class*="_title"]')?.textContent ?? null,
        preview: rect(preview),
        lines: qa('[class*="IP6KhG_line"]').slice(0, 4).map((el) => ({
          rect: rect(el),
          display: getComputedStyle(el).display,
          grid: getComputedStyle(el).gridTemplateColumns,
          background: getComputedStyle(el).backgroundColor
        })),
        numbers: qa('[class*="IP6KhG_number"]').slice(0, 4).map((el) => ({ rect: rect(el), align: getComputedStyle(el).textAlign, font: getComputedStyle(el).fontFamily, color: getComputedStyle(el).color })),
        texts: qa('[class*="IP6KhG_text"]').slice(0, 4).map((el) => ({ rect: rect(el) })),
        addedRows: qa('[class*="IP6KhG_add"]').length,
        deletedRows: qa('[class*="IP6KhG_del"]').length,
        diffLineCount: qa('[class*="IP6KhG_line"]').length,
        body: rect(diffBody),
        bodyOverflow: diffBody === null ? null : getComputedStyle(diffBody).overflowX
      },
      width: {
        column: rect(column),
        handle: rect(handle),
        contentWidth: body === null ? null : getComputedStyle(body).getPropertyValue('--dsh-chat-content-width').trim(),
        composerWidth: composer === null ? null : round(composer.getBoundingClientRect().width)
      },
      composerRow: (() => {
        const input = q('[data-composer-input]')
        const placeholder = q('[data-composer-placeholder]')
        const scroll = q('[data-input-scroll="true"]')
        const row = composer === null ? null : composer.querySelector('[class*="_row"]')
        // Every visible chip in the row, at any depth: the `+` disc, the slot
        // occupant (the DSH 400K chip), the merged model pill, the send disc.
        const candidates = row === null ? [] : [...row.querySelectorAll('button, [data-cgpt-probe-budget], [data-cgpt-model-pill], [data-slot] > *')]
        const seen = new Set()
        const items = candidates
          .filter((el) => {
            const box = el.getBoundingClientRect()
            if (box.width === 0 || box.height === 0) return false
            if (seen.has(el)) return false
            seen.add(el)
            // drop wrappers that only re-expose a child we already measure
            return !candidates.some((other) => other !== el && el.contains(other) && other.getBoundingClientRect().width > 0)
          })
          .map((el) => {
            const box = el.getBoundingClientRect()
            return {
              tag: el.tagName,
              cls: (el.className || '').toString().slice(0, 40),
              text: (el.innerText || '').replace(/\s+/g, ' ').slice(0, 20),
              probe: el.hasAttribute('data-cgpt-probe-budget'),
              rect: rect(el),
              center: round(box.top + box.height / 2),
              style: style(el, ['height', 'padding', 'border-radius', 'font-size', 'line-height', 'color', 'background-color', 'display', 'align-items'])
            }
          })
          .sort((a, b) => a.rect.x - b.rect.x)
        const gaps = []
        for (let index = 1; index < items.length; index += 1) gaps.push(round(items[index].rect.x - items[index - 1].rect.right))
        return {
          card: rect(composer),
          cardStyle: style(composer, ['padding', 'gap', 'border-radius']),
          scroll: rect(scroll),
          input: { rect: rect(input), style: style(input, ['min-height', 'padding', 'font-size', 'line-height']) },
          placeholder: { rect: rect(placeholder), style: style(placeholder, ['font-size', 'line-height', 'top', 'position']) },
          row: { rect: rect(row), style: style(row, ['height', 'gap', 'align-items', 'margin-top', 'padding']) },
          items,
          gaps,
          centers: items.map((item) => item.center),
          gapCardToText: composer === null || placeholder === null ? null : round(placeholder.getBoundingClientRect().top - composer.getBoundingClientRect().top),
          gapTextToRow: placeholder === null || row === null ? null : round(row.getBoundingClientRect().top - placeholder.getBoundingClientRect().bottom)
        }
      })()
    }
  })
}

async function hoverReading() {
  const row = page.locator("[data-chat-flow-kind='turn-process'] button").first()
  const read = () =>
    page.evaluate(() => {
      const el = document.querySelector("[data-chat-flow-kind='turn-process'] button")
      const computed = getComputedStyle(el)
      const svg = el.querySelector('svg')
      return {
        background: computed.backgroundColor,
        color: computed.color,
        svg: svg === null ? null : getComputedStyle(svg).color
      }
    })
  await page.mouse.move(20, 960)
  await page.waitForTimeout(200)
  const idle = await read()
  await row.scrollIntoViewIfNeeded()
  const box = await row.boundingBox()
  await page.mouse.move(box.x + Math.min(80, box.width / 2), box.y + box.height / 2)
  await page.waitForTimeout(350)
  const hovered = await read()
  return { idle, hovered, backgroundUnchanged: idle.background === hovered.background, colorChanged: idle.color !== hovered.color }
}

async function expandedReading() {
  const toggle = page.locator("[data-chat-flow-kind='turn-process'] button").first()
  await toggle.click({ force: true })
  await page.waitForTimeout(500)
  return await page.evaluate(() => {
    const round = (value) => Math.round(value * 10) / 10
    const step = document.querySelector("[data-chat-flow-kind='assistant-step']")
    const rows = [...document.querySelectorAll('[data-step-process] button')]
    const last = rows.length > 0 ? rows[rows.length - 1] : document.querySelector('[data-step-process-body]')
    if (step === null || last === null) return null
    return {
      stepTop: round(step.getBoundingClientRect().top),
      lastRowBottom: round(last.getBoundingClientRect().bottom),
      gap: round(step.getBoundingClientRect().top - last.getBoundingClientRect().bottom),
      processCount: rows.length
    }
  })
}

async function collapseProcess() {
  const toggle = page.locator("[data-chat-flow-kind='turn-process'] button").first()
  await toggle.click({ force: true }).catch(() => {})
  await page.waitForTimeout(350)
}

async function dragReading() {
  const readColumn = () =>
    page.evaluate(() => {
      const column = document.querySelector('[data-conversation-scroll] [class*="_column"]')
      const body = document.querySelector('[class*="_body"]')
      return {
        width: column === null ? null : Math.round(column.getBoundingClientRect().width * 10) / 10,
        contentWidth: body === null ? null : getComputedStyle(body).getPropertyValue('--dsh-chat-content-width').trim(),
        pref: window.localStorage.getItem('dsh.conversation.contentWidth')
      }
    })
  const before = await readColumn()
  const handle = page.locator('[data-width-handle="right"]').first()
  const box = await handle.boundingBox()
  if (box === null) return { before, after: null, delta: null, error: 'no width handle' }
  const startX = box.x + box.width / 2
  const startY = box.y + box.height / 2
  await page.mouse.move(startX, startY)
  await page.mouse.down()
  for (let step = 1; step <= 5; step += 1) {
    await page.mouse.move(startX - step * 24, startY, { steps: 2 })
    await page.waitForTimeout(50)
  }
  await page.mouse.up()
  await page.waitForTimeout(450)
  const after = await readColumn()
  return { before, after, delta: before.width === null || after.width === null ? null : Math.round((after.width - before.width) * 10) / 10 }
}

/**
 * M11-6/7 need the DSH-only `400K` context chip in the row. It is rendered by a
 * slot occupant the fixture provider does not feed (its model declares no
 * context window), so the probe mounts a bare <span> into the Host's own slot:
 * whatever the skin does to slot children, it does to this one too.
 */
async function mountBudgetProbe() {
  return await page.evaluate(() => {
    // Skin off: leave the Host's own rendering untouched for the native panel.
    if (document.body.dataset.cgptSkin !== 'on') return false
    const slot = document.querySelector("[data-slot='conversation.input.right']")
    if (slot === null) return false
    if (slot.querySelector('[data-cgpt-probe-budget]') !== null) return true
    const chip = document.createElement('span')
    chip.setAttribute('data-cgpt-probe-budget', '')
    chip.textContent = '400K'
    slot.prepend(chip)
    return true
  })
}

async function captureState(label) {
  const probeBudget = await mountBudgetProbe()
  await scrollToBottom()
  const base = await measure()
  await page.screenshot({ path: join(SHOTS, `full-${label}.png`) })

  // Column-aware clips: the native column is wider (no skin sidebar), so a
  // fixed x would shave its left edge in the comparison sheets.
  const colX = Math.max(0, Math.round(base.width.column.x) - 24)
  const colW = Math.min(VIEWPORT.width - colX, Math.round(base.width.column.w) + 48)
  const within = (y, h) => ({ x: colX, y: Math.max(0, Math.round(y)), width: colW, height: Math.min(Math.round(h), VIEWPORT.height - Math.max(0, Math.round(y))) })

  await page.screenshot({ path: join(SHOTS, `item1-spacing-${label}.png`), clip: within(base.spacing.procRow.y - 22, 132) })

  const expanded = await expandedReading()
  await page.screenshot({ path: join(SHOTS, `item1-spacing-expanded-${label}.png`), clip: within(base.spacing.procRow.y - 22, 300) })
  await collapseProcess()

  const hover = await hoverReading()
  await page.screenshot({ path: join(SHOTS, `item5-hover-${label}.png`), clip: within(base.spacing.procRow.y - 34, 104) })
  await page.mouse.move(20, 960)
  await page.waitForTimeout(250)

  // Hover the changed-files card → the Host's preview folds over the rows.
  await page.locator('[data-changed-files]').hover({ force: true })
  await page.waitForTimeout(900)
  const diffHover = await measure()
  await page.screenshot({ path: join(SHOTS, `item3-diff-${label}.png`), clip: within(base.diff.card.y - 16, 440) })
  await page.mouse.move(20, 960)
  await page.waitForTimeout(300)

  const cardY = Math.max(0, Math.round(base.composer.card.y) - 12)
  await page.screenshot({
    path: join(SHOTS, `item2-composer-${label}.png`),
    clip: { x: Math.max(0, Math.round(base.composer.card.x) - 16), y: cardY, width: Math.round(base.composer.card.w) + 32, height: VIEWPORT.height - cardY }
  })

  // M11-6/7: the card from its own top edge, so both states frame the same
  // element even though the fixed card is 26px shorter.
  const rowTop = Math.max(0, Math.round(base.composerRow.card.y) - 8)
  const rowBox = {
    x: Math.max(0, Math.round(base.composerRow.card.x) - 10),
    y: rowTop,
    width: Math.round(base.composerRow.card.w) + 20,
    height: Math.min(VIEWPORT.height - rowTop, Math.round(base.composerRow.card.h) + 16)
  }
  await page.screenshot({ path: join(SHOTS, `item6-composer-padding-${label}.png`), clip: rowBox })
  await page.screenshot({
    path: join(SHOTS, `item7-composer-row-${label}.png`),
    clip: {
      x: rowBox.x,
      y: Math.max(0, Math.round(base.composerRow.row.rect.y) - 10),
      width: rowBox.width,
      height: Math.min(VIEWPORT.height - Math.round(base.composerRow.row.rect.y) + 10, Math.round(base.composerRow.row.rect.h) + 20)
    }
  })

  const drag = await dragReading()
  await page.screenshot({ path: join(SHOTS, `item4-width-${label}.png`), clip: { x: 340, y: 60, width: 1258, height: 330 } })

  return { label, base, expanded, hover, diffHover, drag, probeBudget }
}

/** Reloads and waits for the app; the Host restores its own session selection. */
async function reload() {
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(3000)
  await waitForApp()
}

await page.goto(url, { waitUntil: 'domcontentloaded' })
await page.waitForTimeout(3000)
await waitForApp()
if (!(await selectFixture())) {
  console.error(JSON.stringify({ rows: await page.locator('[data-cgpt-session-row]').count(), body: (await page.evaluate(() => document.body.innerText)).slice(0, 300) }, null, 1))
  throw new Error('m11-capture: no session with [data-changed-files]')
}
await page.waitForTimeout(700)

// 1) current skin (on): spacing / composer / diff / hover / drag.
await page.evaluate((key) => window.localStorage.setItem('cgpt-skin', 'on'), SKIN_KEY)
const on = ONLY === 'off' ? null : await captureState('on')

if (ONLY === 'on') {
  writeFileSync(join(OUT, `${TAG}.json`), `${JSON.stringify({ url: url.replace(/token=[^&]+/, 'token=REDACTED'), viewport: VIEWPORT, on, off: null }, null, 2)}\n`)
  console.log(JSON.stringify({ tag: TAG, only: 'on', gap: on.base.spacing.gapProcToStep, card: on.base.composer.card?.w }, null, 1))
  await context.close()
  await browser.close()
  process.exit(0)
}

if (ONLY === 'off') {
  await page.evaluate((key) => window.localStorage.removeItem(key), WIDTH_PREF)
  await reload()
  if (!(await selectFixture())) await selectFixture()
  await page.evaluate((key) => window.localStorage.setItem('cgpt-skin', 'off'), SKIN_KEY)
  await reload()
  if (!(await selectFixture())) throw new Error('m11-capture: session lost after skin-off reload')
  await page.waitForTimeout(700)
  const offOnly = await captureState('off')

  // Native persistence probe: the Host writes localStorage on drop, so a plain
  // refresh must come back at the dragged width.
  await reload()
  if (!(await selectFixture())) await selectFixture()
  const persisted = await page.evaluate(() => {
    const column = document.querySelector('[data-conversation-scroll] [class*="_column"]')
    return { width: column === null ? null : Math.round(column.getBoundingClientRect().width * 10) / 10, pref: window.localStorage.getItem('dsh.conversation.contentWidth') }
  })

  await page.evaluate((key) => window.localStorage.setItem('cgpt-skin', 'on'), SKIN_KEY)
  writeFileSync(join(OUT, `${TAG}.json`), `${JSON.stringify({ url: url.replace(/token=[^&]+/, 'token=REDACTED'), viewport: VIEWPORT, on: null, off: offOnly, persisted }, null, 2)}\n`)
  console.log(JSON.stringify({ tag: TAG, only: 'off', off: offOnly.base.skin, gap: offOnly.base.spacing.gapProcToStep, card: offOnly.base.composer.card?.w }, null, 1))
  await context.close()
  await browser.close()
  process.exit(0)
}

// 2) refresh keeps the dragged width; then restore the default for the native read.
await reload()
if (!(await selectFixture())) await selectFixture()
const persisted = await page.evaluate(() => {
  const column = document.querySelector('[data-conversation-scroll] [class*="_column"]')
  return { width: column === null ? null : Math.round(column.getBoundingClientRect().width * 10) / 10, pref: window.localStorage.getItem('dsh.conversation.contentWidth') }
})
await page.evaluate((key) => window.localStorage.removeItem(key), WIDTH_PREF)
await reload()
if (!(await selectFixture())) await selectFixture()
await page.waitForTimeout(500)

// 3) native (skin off): same session, same DOM.
await page.evaluate((key) => window.localStorage.setItem('cgpt-skin', 'off'), SKIN_KEY)
await reload()
if (!(await selectFixture())) throw new Error('m11-capture: session lost after skin-off reload')
await page.waitForTimeout(700)
const off = await captureState('off')

// leave the profile as found
await page.evaluate((key) => window.localStorage.setItem('cgpt-skin', 'on'), SKIN_KEY)

const payload = { url: url.replace(/token=[^&]+/, 'token=REDACTED'), viewport: VIEWPORT, on, off, persisted }
writeFileSync(join(OUT, `${TAG}.json`), `${JSON.stringify(payload, null, 2)}\n`)

const summary = (record) => ({
  skin: record.base.skin,
  gapProcToStep: record.base.spacing.gapProcToStep,
  gapExpanded: record.expanded?.gap,
  gapCardToStat: record.base.composer.gapCardToStat,
  gapStatToBottom: record.base.composer.gapStatToBottom,
  diffHeaderWidth: record.base.diff.header?.w,
  diffCardWidth: record.base.diff.card?.w,
  diffRows: record.base.diff.diffLineCount,
  columnWidth: record.base.width.column?.w,
  draggedTo: record.drag.after?.width,
  dragDelta: record.drag.delta,
  hover: record.hover
})
console.log(JSON.stringify({ tag: TAG, on: summary(on), off: summary(off), persisted }, null, 1))

await context.close()
await browser.close()
