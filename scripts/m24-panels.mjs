#!/usr/bin/env node
/**
 * scripts/m24-panels.mjs — P0-12 evidence: the Host's task (todo) panel and
 * goal bar restored to their native presentation, and pinned to the same
 * inline column as the composer card and the transcript text.
 *
 * Frames per theme (docs/screenshots):
 *   m24-task-native-<theme>.png   skin off, Host untouched (reference)
 *   m24-task-<tag>-<theme>.png    skin on, tag = before | after
 *   m24-goal-native-<theme>.png
 *   m24-goal-<tag>-<theme>.png
 * All three frames of one panel share one clip, so the column edges can be
 * compared; the injected guides mark the composer card (magenta, dashed), the
 * panel (cyan, solid) and the transcript column (green, dotted).
 *
 * Two runs, one JSON:
 *   node scripts/m24-panels.mjs --url "http://127.0.0.1:3141/?token=…" --tag before
 *   # change the stylesheet, npm run build
 *   node scripts/m24-panels.mjs --url "http://127.0.0.1:3141/?token=…" --tag after
 *
 * `--tag after` exits non-zero unless both panels sit within 1px of the card
 * on both edges, in both themes, and their type/padding matches the native
 * reference. `--tag before` records the same measurements as the failing
 * baseline and never fails the run.
 *
 * The two test sessions must expose a todo projection (task) and a live goal
 * (goal). They are selected by title from the sidedock; override with
 * --task-title / --goal-title.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
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
const tag = args.get('tag')
if (typeof url !== 'string' || (tag !== 'before' && tag !== 'after')) {
  console.error('usage: node scripts/m24-panels.mjs --url <tokenised-url> --tag <before|after> [--out docs]')
  process.exit(2)
}
const DOCS = resolve(ROOT, typeof args.get('out') === 'string' ? args.get('out') : 'docs')
const SHOTS = join(DOCS, 'screenshots')
mkdirSync(SHOTS, { recursive: true })
const ORIGIN = new URL(url).origin

let playwright
for (const candidate of ['/mnt/f/project/y86/node_modules/playwright/index.mjs', 'playwright', 'playwright-core']) {
  try {
    playwright = await import(candidate)
    break
  } catch {}
}
if (playwright === undefined) {
  console.error('m24-panels: playwright is required')
  process.exit(2)
}
const CHROME = process.env.M24_CHROME ?? process.env.CHATGPT_UI_CHROME ?? '/home/user/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome'
const browser = await playwright.chromium.launch({
  headless: true,
  executablePath: CHROME,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
})

const TASK_TITLE = typeof args.get('task-title') === 'string' ? args.get('task-title') : '这是一次只读的论文综合报告'
const GOAL_TITLE = typeof args.get('goal-title') === 'string' ? args.get('goal-title') : '参考 dot 全面改进 super-agent'
const TASK_WORKSPACE = 'workspace:ws_m24_paper'
const GOAL_WORKSPACE = 'workspace:ws_m24_plugin'

const round = (value) => Math.round(value * 10) / 10
const rectOf = (box) => ({
  left: round(box.left),
  right: round(box.right),
  width: round(box.width),
  top: round(box.top),
  bottom: round(box.bottom),
  height: round(box.height)
})

/** Guides are drawn inside the page so the shot itself carries the edges. */
const drawGuides = (page, clip, edges) => page.evaluate(({ clip, edges }) => {
  document.querySelectorAll('[data-m24-guide]').forEach((node) => node.remove())
  const layer = document.createElement('div')
  layer.setAttribute('data-m24-guide', '1')
  layer.style.cssText = 'position:fixed;inset:0;z-index:2147483000;pointer-events:none;font:10px/1.2 ui-monospace,SFMono-Regular,Menlo,monospace'
  const background = getComputedStyle(document.body).getPropertyValue('--dsw-alias-bg-base').trim() || '#ffffff'
  const band = document.createElement('div')
  band.style.cssText = `position:absolute;left:${clip.x}px;top:${clip.y}px;width:${clip.width}px;height:54px;background:${background};border-bottom:1px solid rgba(127,127,127,.28);box-sizing:border-box`
  layer.appendChild(band)
  const add = (x, color, dash) => {
    const node = document.createElement('div')
    node.style.cssText = `position:absolute;left:${x}px;top:${clip.y + 54}px;width:1px;height:${clip.height - 54}px;background:${dash ? `repeating-linear-gradient(to bottom,${color} 0 4px,transparent 4px 8px)` : color}`
    layer.appendChild(node)
  }
  const addChip = (text, color, x, row) => {
    const label = document.createElement('span')
    label.textContent = text
    label.style.cssText = `position:absolute;left:${x + 3}px;top:${clip.y + 5 + row * 16}px;padding:1px 4px;background:${color};color:#fff;border-radius:3px;white-space:nowrap`
    layer.appendChild(label)
  }
  add(edges.card.left, '#ff2d95', true)
  add(edges.card.right, '#ff2d95', true)
  add(edges.panel.left, '#00b8ff', false)
  add(edges.panel.right, '#00b8ff', false)
  add(edges.column.left, '#21c55d', false)
  add(edges.column.right, '#21c55d', false)
  addChip('输入卡', '#ff2d95', edges.card.left, 0)
  addChip('面板', '#00b8ff', Math.min(edges.panel.left, edges.panel.right), 1)
  addChip('正文列', '#21c55d', edges.column.left, 2)
  document.body.appendChild(layer)
  return true
}, { clip, edges })

const measure = (page) => page.evaluate(() => {
  const read = (element) => {
    if (element === null || element === undefined) return null
    const box = element.getBoundingClientRect()
    const style = getComputedStyle(element)
    return {
      left: +box.left.toFixed(1),
      right: +box.right.toFixed(1),
      width: +box.width.toFixed(1),
      top: +box.top.toFixed(1),
      bottom: +box.bottom.toFixed(1),
      height: +box.height.toFixed(1),
      fontSize: style.fontSize,
      lineHeight: style.lineHeight,
      fontWeight: style.fontWeight,
      padding: style.padding,
      borderRadius: style.borderRadius,
      border: style.border,
      background: style.backgroundColor,
      color: style.color,
      boxShadow: style.boxShadow
    }
  }
  const todo = document.querySelector('[data-testid="todo-panel"]')
  const bar = document.querySelector('[class*="nLMEza_bar"]')
  const card = document.querySelector('[data-composer-card="true"]')
  const columns = [...document.querySelectorAll('[class*="EvIC1a_column"]')].map((node) => node.getBoundingClientRect())
  const column = columns.sort((a, b) => b.width - a.width)[0] ?? null
  const host = todo ?? bar
  return {
    panelKind: todo !== null ? 'todo' : bar !== null ? 'goal' : 'none',
    panel: read(host),
    card: read(card),
    column: column === null ? null : {
      left: +column.left.toFixed(1), right: +column.right.toFixed(1), width: +column.width.toFixed(1)
    },
    todo: {
      root: read(todo),
      header: read(todo?.querySelector('[class*="lXshSW_header"]') ?? null),
      body: read(todo?.querySelector('[class*="lXshSW_body"]') ?? null),
      title: read(todo?.querySelector('[class*="lXshSW_title"]') ?? null),
      progress: read(todo?.querySelector('[class*="lXshSW_progress"]') ?? null),
      lead: read(todo?.querySelector('[class*="lXshSW_lead"]') ?? null),
      glyph: read(todo?.querySelector('[class*="lXshSW_glyph"]') ?? null),
      chevron: read(todo?.querySelector('[class*="lXshSW_chevron"]') ?? null)
    },
    goal: {
      bar: read(bar),
      dock: read(document.querySelector('[class*="nLMEza_dock"]')),
      label: read(bar?.querySelector('[class*="nLMEza_label"]') ?? null),
      objective: read(bar?.querySelector('[class*="nLMEza_objective"]') ?? null),
      glyph: read(bar?.querySelector('[class*="nLMEza_goalGlyph"]') ?? null),
      actions: read(bar?.querySelector('[class*="nLMEza_actions"]') ?? null)
    }
  }
})

const waitPanel = async (page, kind) => {
  const selector = kind === 'todo' ? '[data-testid="todo-panel"]' : '[class*="nLMEza_bar"]'
  await page.waitForSelector(selector, { timeout: 20000 })
  await page.waitForTimeout(500)
}

const openSkinned = async (page, title, kind) => {
  const row = page.locator('.chatgpt-session-row', { hasText: title }).first()
  await row.click()
  await waitPanel(page, kind)
  await page.waitForTimeout(400)
}

const ensureWorkspace = async (page, key) => {
  const row = page.locator(`[data-row-key="${key}"]`).first()
  const expanded = await row.getAttribute('aria-expanded')
  if (expanded !== 'true') {
    await row.click()
    await page.waitForTimeout(700)
  }
}

const openNative = async (page, title, kind, workspace) => {
  await ensureWorkspace(page, workspace)
  const row = page.locator('[data-row-key^="session:"]', { hasText: title }).first()
  await row.click()
  await waitPanel(page, kind)
  await page.waitForTimeout(500)
}

const newPage = async (context) => {
  const page = await context.newPage()
  await page.goto(url, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.chatgpt-session-row', { timeout: 30000 })
  await page.waitForFunction(() => document.body.getAttribute('data-chatgpt-ui') !== null, null, { timeout: 30000 })
  await page.waitForTimeout(1200)
  return page
}

const newNativePage = async (context) => {
  const page = await context.newPage()
  await page.goto(url, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(800)
  await page.goto(`${ORIGIN}/?skin=off`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('[data-row-key]', { timeout: 30000 })
  await page.waitForFunction(() => document.body.getAttribute('data-cgpt-skin') === null, null, { timeout: 30000 })
  await page.waitForTimeout(1200)
  return page
}

const union = (...boxes) => {
  const list = boxes.filter((box) => box !== null && box !== undefined)
  const vertical = list.filter((box) => Number.isFinite(box.top) && Number.isFinite(box.bottom))
  return {
    left: Math.min(...list.map((box) => box.left)),
    right: Math.max(...list.map((box) => box.right)),
    top: Math.min(...vertical.map((box) => box.top)),
    bottom: Math.max(...vertical.map((box) => box.bottom))
  }
}

const clipFor = (boxes) => {
  const box = union(...boxes)
  const x = Math.max(0, Math.floor(box.left - 26))
  const y = Math.max(0, Math.floor(box.top - 72))
  return {
    x,
    y,
    width: Math.ceil(box.right - box.left + 52),
    height: Math.ceil(box.bottom - box.top + 98)
  }
}

const edgesOf = (measurement) => ({
  panel: { left: measurement.panel.left, right: measurement.panel.right },
  card: { left: measurement.card.left, right: measurement.card.right },
  column: { left: measurement.column.left, right: measurement.column.right }
})

const shot = async (page, name, clip, edges) => {
  await drawGuides(page, clip, edges)
  await page.screenshot({ path: join(SHOTS, name), clip })
  await page.evaluate(() => document.querySelectorAll('[data-m24-guide]').forEach((node) => node.remove()))
  return `docs/screenshots/${name}`
}

const typographyOf = (measurement, kind) => {
  if (kind === 'todo') {
    const t = measurement.todo
    return {
      headerHeight: t.header?.height ?? null,
      bodyPadding: t.body?.padding ?? null,
      title: t.title === null ? null : { fontSize: t.title.fontSize, lineHeight: t.title.lineHeight, fontWeight: t.title.fontWeight },
      progress: t.progress === null ? null : { fontSize: t.progress.fontSize, lineHeight: t.progress.lineHeight, fontWeight: t.progress.fontWeight },
      lead: t.lead === null ? null : { width: t.lead.width, height: t.lead.height },
      chevron: t.chevron === null ? null : { width: t.chevron.width, height: t.chevron.height },
      glyph: t.glyph === null ? null : { width: t.glyph.width, height: t.glyph.height },
      root: { height: t.root?.height ?? null, borderRadius: t.root?.borderRadius ?? null, background: t.root?.background ?? null, border: t.root?.border ?? null }
    }
  }
  const g = measurement.goal
  return {
    barHeight: g.bar?.height ?? null,
    barPadding: g.bar?.padding ?? null,
    label: g.label === null ? null : { fontSize: g.label.fontSize, lineHeight: g.label.lineHeight, fontWeight: g.label.fontWeight },
    objective: g.objective === null ? null : { fontSize: g.objective.fontSize, lineHeight: g.objective.lineHeight, fontWeight: g.objective.fontWeight },
    glyph: g.glyph === null ? null : { width: g.glyph.width, height: g.glyph.height },
    root: { height: g.bar?.height ?? null, borderRadius: g.bar?.borderRadius ?? null, background: g.bar?.background ?? null, border: g.bar?.border ?? null }
  }
}

const FILE = join(DOCS, 'm24.json')
const previous = existsSync(FILE) ? JSON.parse(readFileSync(FILE, 'utf8')) : {}
/** Clips are kept across runs so native / before / after share one crop. */
const mergeClip = (left, right) => {
  if (left === undefined) return right
  if (right === undefined) return left
  const x = Math.min(left.x, right.x)
  const y = Math.min(left.y, right.y)
  return {
    x,
    y,
    width: Math.max(left.x + left.width, right.x + right.width) - x,
    height: Math.max(left.y + left.height, right.y + right.height) - y
  }
}
const knownClips = { ...(previous.clips ?? {}) }
for (const runTag of ['before', 'after']) {
  for (const theme of ['light', 'dark']) {
    for (const key of ['task', 'goal']) {
      const stored = previous.tags?.[runTag]?.[theme]?.[key]?.clip
      if (stored !== undefined) knownClips[`${theme}/${key}`] = mergeClip(knownClips[`${theme}/${key}`], stored)
    }
  }
}
const results = { native: { light: {}, dark: {} }, skin: { light: {}, dark: {} }, clips: {} }

for (const theme of ['light', 'dark']) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    deviceScaleFactor: 2,
    locale: 'zh-CN',
    colorScheme: theme
  })
  const skin = await newPage(context)
  const native = await newNativePage(context)

  for (const entry of [
    { kind: 'todo', title: TASK_TITLE, workspace: TASK_WORKSPACE, key: 'task' },
    { kind: 'goal', title: GOAL_TITLE, workspace: GOAL_WORKSPACE, key: 'goal' }
  ]) {
    await openSkinned(skin, entry.title, entry.kind)
    const skinMeasure = await measure(skin)
    await openNative(native, entry.title, entry.kind, entry.workspace)
    const nativeMeasure = await measure(native)

    const computed = clipFor([
      skinMeasure.panel, skinMeasure.card, skinMeasure.column,
      nativeMeasure.panel, nativeMeasure.card, nativeMeasure.column
    ])
    const clip = mergeClip(knownClips[`${theme}/${entry.key}`], computed)
    knownClips[`${theme}/${entry.key}`] = clip

    const nativeShot = await shot(native, `m24-${entry.key}-native-${theme}.png`, clip, edgesOf(nativeMeasure))
    const skinShot = await shot(skin, `m24-${entry.key}-${tag}-${theme}.png`, clip, edgesOf(skinMeasure))

    const skinRecord = {
      ...skinMeasure,
      typography: typographyOf(skinMeasure, entry.kind),
      delta: {
        left: round(skinMeasure.panel.left - skinMeasure.card.left),
        right: round(skinMeasure.panel.right - skinMeasure.card.right),
        width: round(skinMeasure.panel.width - skinMeasure.card.width),
        columnLeft: round(skinMeasure.column.left - skinMeasure.card.left),
        columnRight: round(skinMeasure.column.right - skinMeasure.card.right)
      },
      screenshot: skinShot,
      clip
    }
    const nativeRecord = {
      ...nativeMeasure,
      typography: typographyOf(nativeMeasure, entry.kind),
      delta: {
        left: round(nativeMeasure.panel.left - nativeMeasure.card.left),
        right: round(nativeMeasure.panel.right - nativeMeasure.card.right),
        width: round(nativeMeasure.panel.width - nativeMeasure.card.width)
      },
      screenshot: nativeShot,
      clip
    }
    results.skin[theme][entry.key] = skinRecord
    results.native[theme][entry.key] = nativeRecord
    console.log(`${theme}/${entry.key} skin delta left=${skinRecord.delta.left} right=${skinRecord.delta.right} width=${skinRecord.delta.width}`)
    console.log(`${theme}/${entry.key} native delta left=${nativeRecord.delta.left} right=${nativeRecord.delta.right} width=${nativeRecord.delta.width}`)
  }
  await context.close()
}

/* ---- splitter: the same variable drives card, column and panel ----------
 * A throwaway context, so the Host's persisted width does not leak into the
 * frames above. Dragging the right handle is the P0-11 path: it writes
 * `--dsh-chat-user-width`, `wSkVaW_body` derives `--dsh-chat-content-width`,
 * and the card, transcript and panels all read that one value. */
results.splitter = {}
for (const theme of ['light', 'dark']) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    deviceScaleFactor: 2,
    locale: 'zh-CN',
    colorScheme: theme
  })
  const page = await newPage(context)
  await openSkinned(page, TASK_TITLE, 'todo')
  const before = await measure(page)
  const handle = await page.locator('[class*="_widthHandle"][data-side="right"]').first().boundingBox()
  if (handle === null) throw new Error('m24-panels: conversation width handle not found')
  await page.mouse.move(handle.x + 4, handle.y + 200)
  await page.mouse.down()
  for (let step = 1; step <= 8; step += 1) {
    await page.mouse.move(handle.x + 4 + step * 10, handle.y + 200)
    await page.waitForTimeout(30)
  }
  await page.mouse.up()
  await page.waitForTimeout(600)
  const after = await measure(page)
  const splitter = {
    theme,
    before: { card: before.card.width, column: before.column.width, panel: before.panel.width },
    after: { card: after.card.width, column: after.column.width, panel: after.panel.width },
    moved: round(after.card.width - before.card.width),
    panelDelta: round(after.panel.width - before.panel.width),
    delta: {
      left: round(after.panel.left - after.card.left),
      right: round(after.panel.right - after.card.right),
      width: round(after.panel.width - after.card.width)
    }
  }
  splitter.pass = splitter.moved >= 40 && Math.abs(splitter.panelDelta - splitter.moved) <= 1 && Math.abs(splitter.delta.left) <= 1 && Math.abs(splitter.delta.right) <= 1 && Math.abs(splitter.delta.width) <= 1
  results.splitter[theme] = splitter
  console.log(`${theme}/splitter card +${splitter.moved}px, panel +${splitter.panelDelta}px, residual ${splitter.delta.left}/${splitter.delta.right}`)
  await context.close()
}
await browser.close()

/* ---- merge into docs/m24.json ----------------------------------------- */
const doc = previous
doc.unit = 'css-px'
doc.generatedAt = new Date().toISOString()
doc.source = `${ORIGIN}/ (token redacted)`
doc.viewport = { width: 1440, height: 1000 }
doc.deviceScaleFactor = 2
doc.sessions = { task: TASK_TITLE, goal: GOAL_TITLE }
doc.native = results.native
doc.tags = doc.tags ?? {}
doc.tags[tag] = results.skin
doc.clips = knownClips
doc.splitter = results.splitter

/* ---- assertions -------------------------------------------------------- */
const assertions = []
const near = (a, b) => Math.abs(a - b) <= 1
for (const runTag of ['before', 'after']) {
  const run = doc.tags[runTag]
  if (run === undefined) continue
  for (const theme of ['light', 'dark']) {
    for (const key of ['task', 'goal']) {
      const item = run[theme][key]
      const pass = near(item.delta.left, 0) && near(item.delta.right, 0) && near(item.delta.width, 0)
      assertions.push({
        tag: runTag,
        theme,
        panel: key,
        name: `${key}/${theme}: panel edges vs composer card ≤1px`,
        pass,
        detail: item.delta,
        expected: runTag === 'after'
      })
      if (runTag === 'after') {
        const ref = doc.native[theme][key].typography
        const impl = item.typography
        // A zero-width border still reports the element's currentColor; the
        // skin's label token may differ from the Host's, which is not a
        // geometry difference. Everything else must match exactly.
        const strip = (value) => JSON.parse(JSON.stringify(value, (name, entry) => (name === 'border' ? undefined : entry)))
        const same = JSON.stringify(strip(ref)) === JSON.stringify(strip(impl))
        assertions.push({
          tag: runTag,
          theme,
          panel: key,
          name: `${key}/${theme}: type / line-height / padding / surface equals native`,
          pass: same,
          detail: same ? 'identical' : { reference: ref, implementation: impl },
          expected: true
        })
      }
    }
  }
}
doc.assertions = assertions
writeFileSync(FILE, `${JSON.stringify(doc, null, 2)}\n`)

const failed = assertions.filter((item) => item.tag === 'after' && !item.pass)
for (const item of assertions) {
  const mark = item.pass ? 'PASS' : item.tag === 'after' ? 'FAIL' : 'DIFF'
  console.log(`${mark}  ${item.tag}  ${item.name}  ${JSON.stringify(item.detail)}`)
}
console.log(`wrote ${FILE} (${doc.assertions.length} assertions, ${failed.length} failures)`)
if (tag === 'after' && failed.length > 0) process.exit(1)
