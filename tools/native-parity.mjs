#!/usr/bin/env node
/**
 * tools/native-parity.mjs — the "with / without the skin" pixel gate.
 *
 * Two isolated instances, one fixture session, one viewport, one theme:
 *   A  clean DSH_HOME (no plugins)            http://127.0.0.1:3094
 *   B  DSH_HOME with dsh-chatgpt-ui           http://127.0.0.1:3095
 *
 * It writes `<out>/native-parity-A-*.png`, `<out>/native-parity-B-*.png` and
 * `<out>/native-parity.json`. Every native transcript node (turn rail, tool
 * steps, file/output aggregation, todo bar, goal bar) is measured with
 * getBoundingClientRect + computed font/line-height/margin/padding/display/
 * flex, normalised against the conversation column, and compared. Any offset
 * over `PARITY_TOLERANCE` (1px) is a diff and makes the process exit 1.
 *
 * Usage:
 *   node tools/native-parity.mjs \
 *     --a "http://127.0.0.1:3094/?token=…" \
 *     --b "http://127.0.0.1:3095/?token=…" \
 *     --session session-… [--out docs] [--prefix native-parity] [--allow-diff]
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { CHROME, PARITY_TOLERANCE, PARITY_VIEWPORT, compareMeasurements, loadPlaywright, measureInstance } from './native-parity-lib.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const args = new Map()
for (let index = 2; index < process.argv.length; index += 1) {
  const token = process.argv[index]
  if (!token.startsWith('--')) continue
  const key = token.slice(2)
  const next = process.argv[index + 1]
  if (next === undefined || next.startsWith('--')) args.set(key, true)
  else {
    args.set(key, next)
    index += 1
  }
}

const urlA = args.get('a')
const urlB = args.get('b')
const session = args.get('session')
if (typeof urlA !== 'string' || typeof urlB !== 'string' || typeof session !== 'string') {
  console.error('usage: node tools/native-parity.mjs --a <clean-url> --b <skinned-url> --session <id> [--out docs] [--prefix native-parity] [--allow-diff]')
  process.exit(2)
}
const OUT = resolve(ROOT, typeof args.get('out') === 'string' ? args.get('out') : 'docs')
const PREFIX = typeof args.get('prefix') === 'string' ? args.get('prefix') : 'native-parity'
const SHOTS = join(OUT, 'screenshots')
mkdirSync(SHOTS, { recursive: true })

const redact = (value) => value.replace(/([?&]token=)[^&]+/, '$1***')
const chromium = await loadPlaywright()
const browser = await chromium.launch({ headless: true, executablePath: CHROME, args: ['--no-sandbox', '--disable-dev-shm-usage'] })

const shots = async (prefix, page) => {
  const boxes = await page.evaluate(() => {
    const first = document.querySelector('[data-chat-flow-kind]')
    let column = first?.parentElement ?? null
    while (column !== null && column !== undefined && column.getBoundingClientRect().width < 1) column = column.parentElement
    column?.setAttribute('data-parity-column', 'true')
    const todo = [...document.querySelectorAll('section')].find((element) => (element.innerText ?? '').trim().startsWith('To-dos'))
    const goal = [...document.querySelectorAll('[class*="_bar"]')].find((element) => (element.innerText ?? '').trim().startsWith('Paused Goal') || (element.innerText ?? '').trim().startsWith('Active Goal'))
    todo?.setAttribute('data-parity-todo', 'true')
    goal?.setAttribute('data-parity-goal', 'true')
    const rect = (element) => {
      if (element === null || element === undefined) return null
      const box = element.getBoundingClientRect()
      return { x: box.x, y: box.y, w: box.width, h: box.height }
    }
    return { column: rect(column), todo: rect(todo), goal: rect(goal) }
  })
  await page.screenshot({ path: join(SHOTS, `${prefix}-full.png`) })
  if (boxes.column !== null) {
    await page.locator('[data-parity-column="true"]').first().screenshot({ path: join(SHOTS, `${prefix}-transcript.png`) }).catch(() => {})
  }
  if (boxes.todo !== null) {
    const top = Math.max(0, Math.min(boxes.todo.y, boxes.goal?.y ?? boxes.todo.y) - 10)
    const bottom = Math.min(PARITY_VIEWPORT.height, Math.max(boxes.todo.y + boxes.todo.h, (boxes.goal?.y ?? 0) + (boxes.goal?.h ?? 0)) + 10)
    await page.screenshot({ path: join(SHOTS, `${prefix}-cards.png`), clip: { x: Math.max(0, boxes.column?.x ?? 0), y: top, width: Math.min(boxes.column?.w ?? PARITY_VIEWPORT.width, PARITY_VIEWPORT.width), height: Math.max(20, bottom - top) } }).catch(() => {})
  }
  const answer = page.locator('[data-chat-flow-kind="assistant-step"]').last()
  if (await answer.count()) {
    await answer.evaluate((element) => {
      let scroller = element
      while (scroller !== null && scroller !== undefined && scroller.scrollHeight <= scroller.clientHeight + 2) scroller = scroller.parentElement
      if (scroller !== null && scroller !== undefined) scroller.scrollTop = scroller.scrollHeight
    }).catch(() => {})
    await page.waitForTimeout(250)
    await page.screenshot({ path: join(SHOTS, `${prefix}-answer.png`) })
  }
}

const left = await measureInstance(browser, urlA, session)
await shots(`${PREFIX}-A`, left.page)
const right = await measureInstance(browser, urlB, session, { skinOff: args.get('b-skin-off') === true })
await shots(`${PREFIX}-B`, right.page)

const comparison = compareMeasurements(left.measurement, right.measurement)
const previousPath = join(OUT, `${PREFIX}.json`)
const previous = existsSync(previousPath) ? JSON.parse(readFileSync(previousPath, 'utf8')) : null
const report = {
  generatedAt: new Date().toISOString(),
  fixture: {
    session,
    viewport: PARITY_VIEWPORT,
    theme: 'light',
    transcriptView: 'verbose',
    bSkin: args.get('b-skin-off') === true ? 'off' : 'on',
    urls: { a: redact(urlA), b: redact(urlB) }
  },
  tolerance: PARITY_TOLERANCE,
  a: { column: left.measurement.column, items: left.measurement.items },
  b: { column: right.measurement.column, items: right.measurement.items },
  comparison,
  screenshots: [`screenshots/${PREFIX}-A-full.png`, `screenshots/${PREFIX}-A-transcript.png`, `screenshots/${PREFIX}-A-cards.png`, `screenshots/${PREFIX}-A-answer.png`, `screenshots/${PREFIX}-B-full.png`, `screenshots/${PREFIX}-B-transcript.png`, `screenshots/${PREFIX}-B-cards.png`, `screenshots/${PREFIX}-B-answer.png`],
  history: previous?.history ?? undefined
}
if (report.history === undefined) delete report.history
writeFileSync(join(OUT, `${PREFIX}.json`), `${JSON.stringify(report, null, 2)}\n`)

console.log(`NATIVE PARITY ${comparison.counts.total} elements: pass=${comparison.counts.pass} diff=${comparison.counts.diff} maxOffset=${comparison.maxOffset}px (tolerance ${PARITY_TOLERANCE}px)`)
for (const element of comparison.elements.filter((entry) => entry.status !== 'pass')) {
  console.log(`  diff ${element.index} ${element.kind} max=${element.maxOffset ?? 'n/a'}px ${element.reason ?? ''}${element.delta === undefined ? '' : ` ${JSON.stringify(element.delta)}`}${element.styleDelta?.length ? ` style=${JSON.stringify(element.styleDelta)}` : ''}`)
}

await browser.close()
if (!comparison.pass && args.get('allow-diff') !== true) process.exit(1)
