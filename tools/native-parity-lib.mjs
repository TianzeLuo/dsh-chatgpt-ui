/**
 * Native-parity measurement shared by `tools/native-parity.mjs` and the
 * `tools/matrix.mjs` gate.
 *
 * The skin may restyle its own chrome (rail, sidebar, composer, popovers) but it
 * must leave the host-rendered conversation transcript alone: turn rails, tool
 * steps, file/output aggregation, todos, goals and closure panels are host DOM.
 * This module measures those nodes in two isolated instances (clean vs skinned),
 * normalises them against the conversation column (so the intentionally wider
 * skinned sidebar cannot masquerade as a layout regression) and reports every
 * metric whose offset exceeds `PARITY_TOLERANCE` px.
 */

export const PARITY_TOLERANCE = 1
export const PARITY_VIEWPORT = { width: 1440, height: 900 }
export const CHROME = process.env.CHATGPT_UI_CHROME ?? process.env.PLAYWRIGHT_CHROMIUM ?? '/home/user/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome'
export const PLAYWRIGHT_CANDIDATES = [
  process.env.PLAYWRIGHT_MODULE,
  '/mnt/f/project/y86/node_modules/playwright/index.mjs',
  'playwright',
  'playwright-core'
].filter((candidate) => typeof candidate === 'string')

const round = (value) => Math.round(value * 10) / 10
const sameText = (a, b) => (a ?? '').replace(/\s+/g, ' ').trim() === (b ?? '').replace(/\s+/g, ' ').trim()

/** Dismiss the host's onboarding dialogs without touching their state. */
export async function dismissDialogs(page) {
  for (let step = 0; step < 8; step += 1) {
    const close = page.locator('[role="dialog"] button[aria-label="Close"]')
    if (await close.count()) {
      await close.first().click()
      await page.waitForTimeout(350)
      continue
    }
    const cont = page.getByRole('button', { name: 'Continue', exact: true })
    if (await cont.count()) {
      await cont.first().click()
      await page.waitForTimeout(700)
      continue
    }
    if ((await page.locator('[role="dialog"]').count()) === 0) return
    await page.keyboard.press('Escape')
    await page.waitForTimeout(350)
  }
}

/** Open one fixture session in either the native or the skinned sidebar. */
export async function openSession(page, sessionId) {
  const nativeRow = page.locator(`[data-row-key="session:${sessionId}"]`)
  const pluginRow = page.locator(`[data-cgpt-session-row="${sessionId}"] button`)
  if (await nativeRow.count()) await nativeRow.first().click()
  else await pluginRow.first().click()
  await page.waitForTimeout(1500)
  await page.evaluate(() => {
    for (const element of document.querySelectorAll('*')) if (element.scrollTop > 0) element.scrollTop = 0
  })
  await page.waitForTimeout(500)
}

/**
 * Measure one instance. Returns the conversation column box, every native flow
 * item and the todo/goal bars, each with its computed style snapshot.
 */
export async function measureInstance(browser, url, sessionId, options = {}) {
  const page = await browser.newPage({ viewport: PARITY_VIEWPORT, deviceScaleFactor: 1 })
  if (options.skinOff === true) {
    // Full-off gate: the plugin's apply() returns before mounting any effect,
    // so the Host renders exactly as if the skin were not installed.
    await page.addInitScript(() => {
      try {
        localStorage.setItem('cgpt-skin', 'off')
      } catch {
        // The measurement then falls back to the skinned page and will fail
        // loudly instead of silently passing.
      }
    })
  }
  await page.goto(url, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1200)
  await dismissDialogs(page)
  await page.evaluate(() => document.body.removeAttribute('data-ds-dark-theme'))
  await openSession(page, sessionId)
  const measurement = await page.evaluate(() => {
    const style = (element) => {
      const computed = getComputedStyle(element)
      return {
        fontSize: computed.fontSize,
        lineHeight: computed.lineHeight,
        display: computed.display,
        flexDirection: computed.flexDirection,
        gap: computed.gap,
        padding: computed.padding,
        margin: computed.margin
      }
    }
    const rect = (element) => {
      const box = element.getBoundingClientRect()
      return { x: box.x, y: box.y, w: box.width, h: box.height }
    }
    const flowNodes = [...document.querySelectorAll('[data-chat-flow-kind]')]
    let column = flowNodes[0]?.parentElement ?? null
    while (column !== null && column !== undefined && column.getBoundingClientRect().width < 1) column = column.parentElement
    const todo = [...document.querySelectorAll('section')].find((element) => (element.innerText ?? '').trim().startsWith('To-dos')) ?? null
    const goal = [...document.querySelectorAll('[class*="_bar"]')].find((element) => (element.innerText ?? '').trim().startsWith('Paused Goal') || (element.innerText ?? '').trim().startsWith('Active Goal')) ?? null
    const composer = document.querySelector('[data-composer-card]')
    const items = []
    for (const node of flowNodes) {
      items.push({
        kind: node.getAttribute('data-chat-flow-kind'),
        text: (node.innerText ?? '').replace(/\s+/g, ' ').trim().slice(0, 120),
        ...rect(node),
        anchorY: column?.getBoundingClientRect().y ?? 0,
        ...style(node)
      })
    }
    const dockY = composer === null ? (column?.getBoundingClientRect().y ?? 0) : composer.getBoundingClientRect().y
    if (todo !== null) items.push({ kind: 'todo-card', text: (todo.innerText ?? '').replace(/\s+/g, ' ').trim().slice(0, 120), ...rect(todo), anchorY: dockY, ...style(todo) })
    if (goal !== null) items.push({ kind: 'goal-card', text: (goal.innerText ?? '').replace(/\s+/g, ' ').trim().slice(0, 120), ...rect(goal), anchorY: dockY, ...style(goal) })
    return {
      column: column === null ? null : rect(column),
      composer: composer === null ? null : rect(composer),
      body: [...document.body.attributes].map((attribute) => attribute.name),
      mode: document.body.getAttribute('data-chatgpt-mode'),
      items
    }
  })
  return { page, measurement }
}

/** Absolute + normalised delta between one A/B pair of items. */
export function compareItem(a, b) {
  const normalise = (item, column) => ({
    relX: item.x - column.x,
    relY: item.y - (item.anchorY ?? column.y),
    relW: item.w / column.w,
    h: item.h,
    style: [item.fontSize, item.lineHeight, item.display, item.flexDirection, item.gap, item.padding]
  })
  const an = normalise(a, a.column)
  const bn = normalise(b, b.column)
  const expectedBWidth = b.w * (a.column.w / b.column.w)
  const delta = {
    relX: round(Math.abs(an.relX - bn.relX)),
    relY: round(Math.abs(an.relY - bn.relY)),
    widthNormalised: round(Math.abs(a.w - expectedBWidth)),
    widthAbsolute: round(Math.abs(a.w - b.w)),
    widthRatio: round(Math.abs(an.relW - bn.relW) * 1000) / 10,
    height: round(Math.abs(a.h - b.h))
  }
  const styleDelta = an.style.map((value, index) => (value === bn.style[index] ? null : { metric: ['fontSize', 'lineHeight', 'display', 'flexDirection', 'gap', 'padding'][index], a: value, b: bn.style[index] })).filter(Boolean)
  const margin = (value) => {
    const parts = value.split(/\s+/).map((part) => Number.parseFloat(part) || 0)
    return [parts[0] ?? 0, parts[1] ?? parts[0] ?? 0, parts[2] ?? parts[0] ?? 0, parts[3] ?? parts[1] ?? 0]
  }
  const marginA = margin(a.margin)
  const marginB = margin(b.margin)
  if (a.kind.endsWith('-card')) {
    // The todo/goal bars are centred with `margin: auto` inside the composer
    // dock. The skin's composer is intentionally narrower, so the computed
    // left/right margin differs even though the declaration and the visual
    // centring are identical. Only vertical margin and symmetry are gated.
    const cardMarginDelta = [Math.abs(marginA[0] - marginB[0]), 0, Math.abs(marginA[2] - marginB[2]), 0]
    if (cardMarginDelta.some((value) => value > PARITY_TOLERANCE) || Math.abs((marginA[1] - marginA[3]) - (marginB[1] - marginB[3])) > PARITY_TOLERANCE) {
      styleDelta.push({ metric: 'margin', a: a.margin, b: b.margin, note: 'horizontal centring follows the skin-owned dock width' })
    }
  } else {
    const marginDelta = marginA.map((value, index) => round(Math.abs(value - marginB[index])))
    if (marginDelta.some((value) => value > PARITY_TOLERANCE)) styleDelta.push({ metric: 'margin', a: a.margin, b: b.margin, delta: marginDelta })
  }
  const maxOffset = Math.max(delta.relX, delta.relY, delta.height, delta.widthNormalised)
  return { delta, styleDelta, maxOffset: round(maxOffset) }
}

/**
 * Compare two measured instances. The kinds and their order must match; a
 * missing/extra node is a diff even when every surviving node is aligned.
 */
export function compareMeasurements(a, b) {
  const elements = []
  const count = Math.max(a.items.length, b.items.length)
  for (let index = 0; index < count; index += 1) {
    const left = a.items[index]
    const right = b.items[index]
    if (left === undefined || right === undefined) {
      elements.push({ index, kind: left?.kind ?? right?.kind ?? 'missing', status: 'diff', reason: left === undefined ? 'missing in A' : 'missing in B', maxOffset: null })
      continue
    }
    if (left.kind !== right.kind || !sameText(left.text, right.text)) {
      elements.push({ index, kind: left.kind, status: 'diff', reason: `kind/text changed (A=${left.kind}/${left.text.slice(0, 40)}, B=${right.kind}/${right.text.slice(0, 40)})`, maxOffset: null, a: left, b: right })
      continue
    }
    const compare = compareItem({ ...left, column: a.column }, { ...right, column: b.column })
    elements.push({
      index,
      kind: left.kind,
      status: compare.maxOffset <= PARITY_TOLERANCE && compare.styleDelta.length === 0 ? 'pass' : 'diff',
      a: left,
      b: right,
      delta: compare.delta,
      styleDelta: compare.styleDelta,
      maxOffset: compare.maxOffset
    })
  }
  const failing = elements.filter((element) => element.status !== 'pass')
  const maxOffset = elements.reduce((max, element) => Math.max(max, element.maxOffset ?? Infinity), 0)
  return {
    tolerance: PARITY_TOLERANCE,
    pass: failing.length === 0,
    counts: { total: elements.length, pass: elements.length - failing.length, diff: failing.length },
    maxOffset: round(maxOffset),
    shell: {
      columnWidth: round(a.column?.w ?? 0),
      columnWidthB: round(b.column?.w ?? 0),
      composerHeight: round(a.composer?.h ?? 0),
      composerHeightB: round(b.composer?.h ?? 0),
      note: 'B uses the skinned 52px rail + 288px panel, so the column is narrower, and the skinned Work card is taller; native nodes are normalised against the column and dock. These shell deltas are recorded, not gated.'
    },
    elements
  }
}

/** Resolve playwright from the same candidates the matrix uses. */
export async function loadPlaywright() {
  let lastError
  for (const candidate of PLAYWRIGHT_CANDIDATES) {
    try {
      const module = await import(candidate)
      return module.chromium ?? module.default?.chromium
    } catch (error) {
      lastError = error
    }
  }
  throw new Error(`playwright is required for the native-parity gate (${lastError?.message ?? 'not found'})`)
}
