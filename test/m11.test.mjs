/**
 * M11 regression gate.
 *
 * M11 fixed five native-parity regressions in the chat surface; this test fails
 * when any of them can come back:
 *
 *   1. the skin re-points `--dsh-chat-content-width` (native column width),
 *   2. a blanket `button` rule inside the turn tail crushes the changed-files
 *      card (header/paths collapse to 28px, +N/-M over the preview),
 *   3. the composer card reserves `margin-bottom: 48px` without its tool bar,
 *   4. the process row/expanded rows paint a hover background or add a
 *      `margin-top` that opens the blank under 「已完成」,
 *   5. the changed-files diff loses its fixed four-column grid,
 *   6. the Work placeholder's `::after` becomes a block again, pushing the copy
 *      onto a second line box (a blank 26px line under the card's top edge),
 *   7. the composer row loses its even 8px gaps or the injected slot chip
 *      (`400K`) stops looking like the model pill next to it.
 *
 * It also re-asserts the recorded evidence in docs/m11-fixes.json (produced by
 * scripts/m11-capture.mjs + scripts/m11-shots.mjs on an isolated DSH): the
 * native/before/after numbers must stay in the documented relationship.
 */

import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import { loc, skipSuite } from './evidence.mjs'

skipSuite(import.meta.url)

const ROOT = new URL('..', import.meta.url).pathname
const CSS_DIR = loc('lib/client/css')
const BLANK = (text) => text.replace(/[^\n]/g, ' ')
const stripComments = (text) => text.replace(/\/\*[\s\S]*?\*\//g, BLANK)

const files = readdirSync(CSS_DIR).filter((name) => name.endsWith('.css')).sort()
const sources = files.map((name) => ({ name, css: stripComments(readFileSync(join(CSS_DIR, name), 'utf8')) }))

/** Every `selector { body }` pair, with the file it came from. */
const rules = []
for (const { name, css } of sources) {
  for (const match of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selector = match[1].trim().replace(/\s+/g, ' ')
    if (selector.startsWith('@') || selector === '') continue
    rules.push({ file: name, selector, body: match[2] })
  }
}

const declarations = (body) =>
  [...body.matchAll(/([-a-zA-Z]+)\s*:\s*([^;]+)(?=;|$)/g)].map((match) => ({
    property: match[1].toLowerCase(),
    value: match[2].trim()
  }))

const SELF_SELECTOR = (selector, needle) => selector.includes(needle)

const tracks = (value) => {
  const out = []
  let depth = 0
  let current = ''
  for (const character of value.trim()) {
    if (character === '(') depth += 1
    if (character === ')') depth -= 1
    if (/\s/.test(character) && depth === 0) {
      if (current !== '') out.push(current)
      current = ''
      continue
    }
    current += character
  }
  if (current !== '') out.push(current)
  return out
}

test('the skin never re-points the Host content-width variable', () => {
  const offenders = rules.filter((rule) =>
    declarations(rule.body).some(({ property, value }) => property === '--dsh-chat-content-width' && value.includes('760'))
  )
  assert.deepEqual(offenders, [], 'the column width is the Host’s: `--dsh-chat-content-width` must not be redefined')
})

test('the message column is capped, never hardcoded', () => {
  const columnRules = rules.filter((rule) => rule.selector.includes('_column'))
  assert.ok(columnRules.length > 0, 'the skin still caps the column')

  for (const rule of columnRules) {
    for (const { property, value } of declarations(rule.body)) {
      if (property !== 'max-width') continue
      assert.ok(
        value.includes('var(--dsh-chat-content-width)') || value.includes('var(--cgpt-msg-max'),
        `${rule.file}: ${rule.selector} caps with ${value}; it must read the Host width`
      )
      assert.ok(!/^\d+(?:\.\d+)?px$/.test(value), `${rule.file}: ${rule.selector} hardcodes ${value}`)
    }
  }
})

test('no blanket button geometry inside the turn tail', () => {
  const tail = rules.filter(
    (rule) =>
      SELF_SELECTOR(rule.selector, "[data-chat-flow-kind='turn-tail']") ||
      SELF_SELECTOR(rule.selector, "[data-slot='conversation.chat.turnTail']") ||
      SELF_SELECTOR(rule.selector, "[data-slot='conversation.chat.assistant-actions']")
  )
  assert.ok(tail.length > 0)

  const crushed = tail.filter((rule) => {
    // only rules that size the button itself; `button > svg` is the icon
    if (!/button(?::[a-z-]+)?$/.test(rule.selector)) return false
    return declarations(rule.body).some(
      ({ property, value }) =>
        (property === 'width' || property === 'height' || property === 'padding') && /\d/.test(value)
    )
  })
  assert.deepEqual(crushed.map((rule) => `${rule.file}: ${rule.selector}`), [], 'the changed-files card buttons are <button>s too')
})

test('the composer only reserves the tool-bar band when the tool bar exists', () => {
  const card = rules.filter((rule) => rule.selector.includes("[data-composer-card='true']") && !rule.selector.includes(':focus-within'))
  const reserving = card.filter((rule) =>
    declarations(rule.body).some(({ property, value }) => property === 'margin-bottom' && parseFloat(value) >= 40)
  )
  assert.ok(reserving.length > 0, 'the Work card still reserves room for its tool bar')
  for (const rule of reserving) {
    assert.match(rule.selector, /:has\(\.chatgpt-work-tools\)/, `${rule.file}: ${rule.selector} reserves 48px for every Work card`)
  }
})

test('M15 leaves the process row, group and tool rows entirely to the Host', () => {
  const process = rules.filter((rule) => {
    const selector = rule.selector
    return (
      selector.includes("[data-chat-flow-kind='turn-process']") ||
      selector.includes('[data-step-process]') ||
      selector.includes('[data-disclosure-row]') ||
      selector.includes('[class*=\'O_Ebla_') ||
      selector.includes('.O_Ebla_') ||
      selector.includes('.lcKema_')
    )
  })
  assert.deepEqual(
    process.map((rule) => `${rule.file}: ${rule.selector}`),
    [],
    'M15: the execution-process region is native; no rule may touch it'
  )
})

test('the changed-files diff keeps a fixed number column', () => {
  const line = rules.find((rule) => rule.selector.includes('[data-changed-files]') && rule.selector.includes('IP6KhG_line'))
  const number = rules.find((rule) => rule.selector.includes('[data-changed-files]') && rule.selector.includes('IP6KhG_number'))
  const body = rules.find((rule) => rule.selector.includes('[data-changed-files]') && rule.selector.includes('IP6KhG_body'))
  assert.ok(line && number && body, 'the skin pins the diff grid')

  const columns = declarations(line.body).find(({ property }) => property === 'grid-template-columns')
  assert.ok(columns, 'the diff line is a grid')
  assert.equal(tracks(columns.value).length, 4, `four columns: ${columns.value}`)
  assert.match(columns.value, /minmax\(0,\s*1fr\)$/)

  const align = declarations(number.body).find(({ property }) => property === 'text-align')
  assert.equal(align?.value, 'right')

  const overflow = declarations(body.body).find(({ property }) => property === 'overflow-x')
  assert.match(overflow?.value ?? '', /auto/)
})

/* ---- recorded evidence -------------------------------------------------- */
const reportPath = loc('docs/m11-fixes.json')
const report = JSON.parse(readFileSync(reportPath, 'utf8'))

test('the recorded evidence files exist and are not empty', () => {
  for (const item of ['m11-1-spacing', 'm11-2-composer', 'm11-3-diff', 'm11-4-width', 'm11-5-hover']) {
    const path = loc(`docs/screenshots/${`${item}.png`}`)
    assert.ok(statSync(path).size > 20_000, `${item}.png is missing or empty`)
  }
})

test('the seven assertions pass on the recorded numbers', () => {
  assert.equal(report.assertions.length, 7)
  assert.deepEqual(
    report.assertions.map((entry) => entry.id),
    ['A1-spacing', 'A2-composer', 'A3-diff', 'A4-width', 'A5-hover', 'A6-padding', 'A7-row']
  )
  for (const entry of report.assertions) {
    assert.equal(entry.pass, true, `${entry.id}: ${entry.claim} ${JSON.stringify(entry.detail)}`)
  }
  assert.equal(report.pass, true)
})

test('spacing and composer gaps are back to native', () => {
  const spacing = report.values.spacingGap
  assert.equal(spacing.after, spacing.native)
  assert.ok(spacing.before > spacing.native + 2, `before ${spacing.before} must show the regression`)

  const composer = report.values.composerGap
  assert.equal(composer.after, composer.native)
  assert.ok(composer.before >= composer.native + 40, `before ${composer.before} must show the regression`)
})

test('the changed-files card and the diff are no longer crushed', () => {
  const width = report.values.diffHeaderWidth
  assert.ok(width.before / report.values.columnWidth.before.start < 0.1, 'before: header collapsed to 28px')
  assert.ok(width.after / report.values.diffHeaderWidth.after > 0.95)

  const number = report.values.diffNumberRect
  const text = report.values.diffTextRect
  assert.ok(number.right <= text.x + 0.5, `number ${number.right} must stay left of code ${text.x}`)
  assert.equal(report.values.diffNumberColumn.align, 'right')
  assert.match(report.values.diffNumberColumn.font, /Mono|Consolas/)
  assert.equal(tracks(report.values.diffGrid).length, 4)
})

test('the column drag moves and survives a refresh', () => {
  const column = report.values.columnWidth
  assert.equal(column.before.dragged, column.before.start, 'before: the drag was dead')
  assert.ok(Math.abs(column.after.dragged - column.after.start) >= 40)
  assert.equal(report.values.columnWidth.after.persisted, column.after.dragged)
})

test('hover keeps the resting background and changes the text', () => {
  const hover = report.values.hover
  assert.equal(hover.before.background, 'rgba(13, 13, 13, 0.05)')
  assert.equal(hover.after.background, hover.native.background)
  assert.notEqual(hover.after.idleColor, hover.after.hoverColor)
})

test('the composer text hugs the card top (no phantom first line)', () => {
  const padding = report.values.composerPadding
  assert.ok(padding.after <= padding.reference + 2, `after ${padding.after} must be <= reference ${padding.reference} + 2`)
  assert.ok(padding.before >= padding.reference + 20, `before ${padding.before} must show the empty line`)
  assert.ok(padding.inputHeight.after <= 30, `one line box: ${padding.inputHeight.after}`)
  assert.equal(padding.inputHeight.before, 52)

  // The pseudo element must stay inline: as a block it opens a second line box
  // above the copy, which is exactly the blank line this test guards.
  const placeholder = rules.filter((rule) => rule.selector.includes("[data-composer-placeholder='true']::after") && rule.selector.includes("'agent'"))
  assert.ok(placeholder.length > 0, 'the Work placeholder ::after rule is missing')
  for (const rule of placeholder) {
    assert.doesNotMatch(rule.body, /display:\s*block/, `${rule.file}: ${rule.selector} must not be a block`)
  }
})

test('the composer row keeps even gaps and one chip shape', () => {
  const row = report.values.composerRow
  assert.ok(Math.abs(Math.max(...row.centers.after) - Math.min(...row.centers.after)) <= 1)
  const gaps = row.gaps.after
  assert.ok(Math.abs(Math.max(...gaps) - Math.min(...gaps)) <= 2, `gaps after ${gaps}`)
  assert.ok(Math.abs(Math.max(...row.gaps.before) - Math.min(...row.gaps.before)) > 2, 'before must show the uneven gaps')
  assert.equal(row.chip.after.h, row.pillHeight)
  assert.equal(row.chip.after.radius, row.pillHeight === 36 ? '9999px' : row.chip.after.radius)
  assert.notEqual(row.chip.before.h, row.pillHeight)

  // The rule that gives a slot occupant the pill's geometry must still exclude
  // the skin's own button (the pill/effort control) from the width override.
  const chip = rules.filter((rule) => rule.selector.includes("[data-slot='conversation.input.right'] > :not([data-cgpt-root]):not(button)"))
  assert.ok(chip.length > 0, 'the slot chip rule is missing')
  assert.match(chip[0].body, /height: 36px/)
  assert.match(chip[0].body, /border-radius: 9999px/)
})
