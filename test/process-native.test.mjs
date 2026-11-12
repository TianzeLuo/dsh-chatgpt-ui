/**
 * M15 gate: the execution-process region is the Host's.
 *
 * docs/m15-process.json is produced by `scripts/m15-process.mjs` on one fixture
 * session (test/fixtures/m15-llm): a native process group with command / search
 * / read rows, a reasoning row that is expanded, and the final answer. The same
 * session is measured in three states:
 *
 *   native   skin off (the plugin mounts nothing)
 *   before   the pre-M15 skin (title pinned to 28px/13px, step-count summary
 *            injected with ::after, rows 28px/4x6/13-18, thinking body 16/26)
 *   after    the skinned page with the M15 CSS
 *
 * Geometry is normalised to the group's left/top edge, because the skinned
 * sidebar is wider than the native one. The gate fails when any icon rectangle,
 * font-size, line-height, gap or relative position differs by more than 1px, or
 * when any rendered text (including CSS generated content) differs.
 *
 * It also statically rejects the rules and DOM writes that caused the
 * regression, so a future edit cannot quietly reintroduce them while the
 * committed evidence still looks green.
 */

import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const CSS_DIR = join(ROOT, 'lib/client/css')
const TOLERANCE = 1
const report = JSON.parse(readFileSync(join(ROOT, 'docs/m15-process.json'), 'utf8'))

const BLANK = (text) => text.replace(/[^\n]/g, ' ')
const withoutComments = (text) => text.replace(/\/\*[\s\S]*?\*\//g, BLANK)
const css = readdirSync(CSS_DIR)
  .filter((name) => name.endsWith('.css'))
  .sort()
  .map((name) => ({ name, text: withoutComments(readFileSync(join(CSS_DIR, name), 'utf8')) }))

test('the fixture compares skin off, pre-M15 and post-M15 in the same region', () => {
  assert.equal(report.meta.tolerance, TOLERANCE)
  assert.equal(report.meta.viewport.width, 1600)
  assert.equal(report.meta.viewport.height, 1000)
  assert.match(report.meta.fixture, /过程区 fixture/)
  assert.match(report.meta.states.native, /skin off/)
  assert.match(report.meta.states.before, /pre-M15/)
  assert.match(report.meta.states.after, /M15/)
  for (const key of ['native', 'before', 'after']) {
    assert.ok(report.meta.states[key], `missing state ${key}`)
  }
})

test('every compared metric is within 1px and every rendered text is identical', () => {
  assert.equal(report.summary.fail, 0, `metric failures: ${JSON.stringify(report.comparisons.filter((row) => !row.pass), null, 2)}`)
  assert.equal(report.summary.textFail, 0, `text failures: ${JSON.stringify(report.texts.filter((row) => !row.equal), null, 2)}`)
  assert.equal(report.summary.passOverall, true)
  assert.equal(report.pass, true)
  assert.ok(report.summary.metrics >= 60, `expected the full surface, got ${report.summary.metrics} metrics`)

  for (const row of report.comparisons) {
    if (typeof row.native === 'number' && typeof row.after === 'number') {
      assert.ok(
        Math.abs(row.native - row.after) <= TOLERANCE,
        `${row.metric}: native ${row.native} vs after ${row.after} (delta ${row.delta})`
      )
    } else {
      assert.deepEqual(row.after, row.native, `${row.metric}: ${JSON.stringify(row.after)} !== ${JSON.stringify(row.native)}`)
    }
  }
  for (const row of report.texts) {
    assert.deepEqual(row.after, row.native, `${row.text} changed: ${JSON.stringify(row.after)} !== ${JSON.stringify(row.native)}`)
  }
})

test('the four named regressions are recorded on the before side', () => {
  const byName = new Map(report.comparisons.map((row) => [row.metric, row]))
  const metric = (name) => {
    const row = byName.get(name)
    assert.ok(row, `missing metric ${name}`)
    return row
  }

  // 1. icon column and title row alignment
  assert.ok(Math.abs(metric('titleIconX').before - metric('titleIconX').native) > TOLERANCE)
  assert.ok(Math.abs(metric('titleTextX').before - metric('titleTextX').native) > TOLERANCE)
  assert.ok(Math.abs(metric('row0IconX').before - metric('row0IconX').native) > TOLERANCE)
  assert.ok(Math.abs(metric('row0TextX').before - metric('row0TextX').native) > TOLERANCE)
  assert.ok(Math.abs(metric('titleHeight').before - metric('titleHeight').native) > TOLERANCE)
  assert.ok(metric('titleHeight').after <= TOLERANCE + metric('titleHeight').native)

  // 2. expanded thinking body used prose 16/26 instead of secondary 13/20
  assert.ok(Math.abs(metric('thinkingParagraphFontSize').before - metric('thinkingParagraphFontSize').native) > TOLERANCE)
  assert.ok(Math.abs(metric('thinkingParagraphLineHeight').before - metric('thinkingParagraphLineHeight').native) > TOLERANCE)
  assert.equal(metric('thinkingBodyFontSize').after, 14)
  assert.equal(metric('thinkingParagraphFontSize').after, 13)
  assert.equal(metric('thinkingParagraphLineHeight').after, 20)

  // 3. the Host's generated summary was replaced with a step count
  const title = report.texts.find((row) => row.text === 'titleRendered')
  assert.ok(title, 'titleRendered text check missing')
  assert.equal(title.native, '执行了命令，已搜索代码，已读取文件')
  assert.equal(title.after, title.native)
  assert.equal(title.before, '已执行 5 个步骤')
  assert.notEqual(title.before, title.native)

  // 4. tool rows were 28px/4x6/13-18 instead of the Host's 24px/0/14-24
  assert.ok(Math.abs(metric('row0Height').before - metric('row0Height').native) > TOLERANCE)
  assert.ok(Math.abs(metric('row0LineHeight').before - metric('row0LineHeight').native) > TOLERANCE)
  assert.equal(metric('row0Height').after, 24)
  assert.equal(metric('row0FontSize').after, 14)
  assert.equal(metric('row0LineHeight').after, 24)
  assert.equal(metric('row0Padding').after, '0px')
})

test('process ink is at rest native and hover paints no surface', () => {
  assert.ok(report.colors, 'colour audit missing')
  for (const key of ['title', 'row', 'thinking']) {
    assert.equal(report.colors.after[key], report.colors.native[key], `${key} ink is not native`)
  }
  assert.equal(report.colors.after.hoverBackground, 'rgba(0, 0, 0, 0)')
  assert.equal(report.colors.after.hoverBackground, report.colors.native.hoverBackground)
  // Hover ink follows the skin's global Host-alias palette; record it rather
  // than gating it (see report.colors.note).
  assert.match(report.colors.note, /alias tokens/)
})

test('the skin no longer ships a process/tool-row rule', () => {
  const offenders = []
  for (const { name, text } of css) {
    for (const match of text.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const selector = match[1].trim().replace(/\s+/g, ' ')
      if (selector.startsWith('@') || selector === '') continue
      if (
        selector.includes('[data-step-process]') ||
        selector.includes("[data-chat-flow-kind='turn-process']") ||
        selector.includes('[data-disclosure-row]') ||
        selector.includes('[class*=\'O_Ebla_') ||
        selector.includes('[class*=\'lcKema_') ||
        selector.includes('.O_Ebla_') ||
        selector.includes('.lcKema_')
      ) {
        offenders.push(`${name}: ${selector}`)
      }
    }
  }
  assert.deepEqual(offenders, [], 'the process region must stay the Host’s')
})

test('the skin no longer rewrites the Host process summary', () => {
  const fragment = readFileSync(join(ROOT, 'lib/client/messages.js'), 'utf8')
  const bundle = readFileSync(join(ROOT, 'lib/client.js'), 'utf8')
  for (const source of [fragment, bundle]) {
    assert.ok(!source.includes('data-cgpt-summary'), 'data-cgpt-summary must be gone')
    assert.ok(!source.includes('chatgptAnnotateProcess'), 'the annotation routine must be gone')
    assert.ok(!source.includes('已执行 ${count} 个步骤'), 'the generated step count must be gone')
    assert.ok(!source.includes('已折叠过程'), 'the generated folded copy must be gone')
  }
  assert.ok(!fragment.includes('[data-step-process]'), 'the fragment must not query process groups')
  assert.ok(fragment.includes('chatgptDefaultCodeWrap'), 'the code-wrap default stays')
  assert.ok(!fragment.includes("setAttribute('aria-label'"), 'the fragment no longer mirrors the title into aria-label')
})

test('assistant prose rules skip process members', () => {
  const chat = css.find((entry) => entry.name === '30-chat.css')
  assert.ok(chat, '30-chat.css missing')
  const selectors = [...chat.text.matchAll(/([^{}]+)\{/g)]
    .map((match) => match[1].trim().replace(/\s+/g, ' '))
    .filter((selector) => !selector.startsWith('@') && selector.includes("[data-chat-flow-kind='assistant-step']"))
  assert.ok(selectors.length > 20, `expected the assistant rules, got ${selectors.length}`)
  const unscoped = selectors.filter((selector) => !selector.includes(':not([data-turn-process-member])'))
  assert.deepEqual(unscoped, [], 'every assistant-step rule must skip `[data-turn-process-member]`')
})

test('native, before and after crops exist for the same region', () => {
  for (const tag of ['native', 'before', 'after']) {
    const path = join(ROOT, 'docs', 'screenshots', `m15-process-${tag}.png`)
    assert.ok(existsSync(path), `missing ${path}`)
    assert.ok(statSync(path).size > 5000, `screenshot looks empty: ${path}`)
    assert.ok(report.screenshots.includes(`screenshots/m15-process-${tag}.png`))
  }
  assert.ok(report.beforeRegression.length >= 10, 'the before state must record the regression')
})
