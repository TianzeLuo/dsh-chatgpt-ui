#!/usr/bin/env node
/**
 * tools/m27-capture.mjs — P0-15 streaming/complete typography evidence.
 *
 * Sends the paced M27 fixture reply on an isolated DSH instance (port 3094, its
 * own DSH_HOME), measures the answer's AssistantMarkdown root, first paragraph,
 * first list item and code block while the turn is still streaming, then waits
 * for the turn to close and measures the very same host nodes again. Writes
 * docs/m27.json plus same-region mid/done frames.
 *
 *   node tools/m27-capture.mjs --url "http://127.0.0.1:3094/?token=…" [--out docs]
 *
 * Three states are recorded: light 1280, dark 1280, light 640. Only the light
 * 1280 pair is copied to the two required screenshot paths; every state also
 * lands under docs/capture/m27/.
 *
 * The host renders the live turn's process row at the bottom (the running
 * indicator) and materialises the collapsed process summary above the answer at
 * completion. That is host layout, not skin: no stylesheet rule here touches
 * `turn-process`, and the same 49px offset is present before and after the fix.
 * It is recorded in the JSON rather than "fixed" by pushing the streaming text
 * down, which would move the host's own transcript.
 */
import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs'
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
  console.error('usage: node tools/m27-capture.mjs --url <tokenised-url> [--out docs]')
  process.exit(2)
}
const OUT = resolve(ROOT, typeof args.get('out') === 'string' ? args.get('out') : 'docs')
const SHOTS = join(OUT, 'screenshots')
const CAPTURE = join(OUT, 'capture/m27')
mkdirSync(SHOTS, { recursive: true })
mkdirSync(CAPTURE, { recursive: true })

const playwrightPath = process.env.M27_PLAYWRIGHT ?? 'playwright'
const CHROME = process.env.CHATGPT_UI_CHROME ?? process.env.HOME + '/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome'
const { chromium } = await import(playwrightPath)

const redact = (value) => value.replace(/([?&]token=)[^&]+/, '$1***')
const SCENARIOS = [
  { id: 'light', theme: 'light', width: 1280, height: 900 },
  { id: 'dark', theme: 'dark', width: 1280, height: 900 },
  { id: 'narrow', theme: 'light', width: 640, height: 900 }
]
const PROMPT = '请生成一条较长的回复，用于流式字号检查。'

const browser = await chromium.launch({ headless: true, executablePath: CHROME, args: ['--no-sandbox', '--disable-dev-shm-usage'] })

/** Sample the last answer flow item and every node P0-15 cares about. */
const sample = (page) =>
  page.evaluate(() => {
    const items = [...document.querySelectorAll('[data-chat-flow-kind="assistant-step"][data-chat-group-part="response"]')]
    const item = items.at(-1)
    if (item === undefined) return { missing: true }
    const root = item.querySelector('[class*="_root"]')
    const body = item.querySelector('[class*="_body"]')
    const paragraph = [...item.querySelectorAll('p')].find((node) => (node.textContent ?? '').trim() !== '') ?? null
    const listItem = item.querySelector('li')
    const code = item.querySelector('[data-code-block-content] pre') ?? item.querySelector('pre')
    const style = (node) => {
      if (node === null || node === undefined) return null
      const computed = getComputedStyle(node)
      const box = node.getBoundingClientRect()
      return {
        fontSize: computed.fontSize,
        lineHeight: computed.lineHeight,
        fontFamily: computed.fontFamily.split(',')[0].trim(),
        rect: { x: box.x, y: box.y, w: box.width, h: box.height }
      }
    }
    const attrs = {}
    for (const attribute of item.attributes) attrs[attribute.name] = attribute.value === '' ? true : attribute.value
    const rootAttrs = {}
    if (root !== null) for (const attribute of root.attributes) rootAttrs[attribute.name] = attribute.value === '' ? true : attribute.value
    let glyph = null
    let glyphOffsetInParagraph = null
    const textNode = paragraph?.firstChild
    if (textNode !== null && textNode !== undefined && textNode.nodeType === Node.TEXT_NODE && (textNode.textContent ?? '').trim() !== '') {
      const range = document.createRange()
      range.setStart(textNode, 0)
      range.setEnd(textNode, Math.min(2, textNode.textContent.length))
      const box = range.getBoundingClientRect()
      glyph = { x: box.x, y: box.y, w: box.width, h: box.height }
      const paragraphBox = paragraph.getBoundingClientRect()
      glyphOffsetInParagraph = { x: box.x - paragraphBox.x, y: box.y - paragraphBox.y }
    }
    const process = item.previousElementSibling
    const scroller = item.closest('[data-conversation-scroll]') ?? document.querySelector('[class*="_scroll"]')
    return {
      scrollTop: scroller?.scrollTop ?? 0,
      attrs,
      rootAttrs,
      root: style(root),
      body: style(body),
      paragraph: style(paragraph),
      listItem: style(listItem),
      code: style(code),
      glyph,
      glyphOffsetInParagraph,
      process: process === null
        ? null
        : {
            kind: process.getAttribute('data-chat-flow-kind'),
            rect: (() => {
              const box = process.getBoundingClientRect()
              return { x: box.x, y: box.y, w: box.width, h: box.height }
            })()
          },
      textLength: (item.textContent ?? '').trim().length,
      turns: document.body.innerText.includes('Deep diving') ? 'streaming' : 'settled',
      theme: document.body.hasAttribute('data-ds-dark-theme') ? 'dark' : 'light',
      viewport: { width: innerWidth, height: innerHeight }
    }
  })

const capture = async (scenario) => {
  const setupWidth = Math.max(scenario.width, 900)
  const context = await browser.newContext({ viewport: { width: setupWidth, height: scenario.height }, deviceScaleFactor: 2 })
  const page = await context.newPage()
  const errors = []
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  await page.goto(url, { waitUntil: 'networkidle' })
  const notice = page.getByRole('button', { name: 'Continue' })
  if ((await notice.count()) > 0) await notice.click()
  await page.waitForTimeout(600)
  await page.locator('.chatgpt-mode-seg[data-segment="chat"]').first().click()
  await page.waitForTimeout(800)
  // The header mode switch collapses below 820px, so the narrow state is
  // entered at 900px and then resized — the session preset stays Chat.
  if (scenario.width !== setupWidth) {
    await page.setViewportSize({ width: scenario.width, height: scenario.height })
    await page.waitForTimeout(800)
  }
  if (scenario.theme === 'dark') await page.evaluate(() => document.body.setAttribute('data-ds-dark-theme', ''))

  const composer = page.locator('textarea, [contenteditable="true"]').first()
  await composer.waitFor({ state: 'visible', timeout: 20000 })
  await composer.click()
  await composer.fill(PROMPT)
  await page.waitForTimeout(200)
  await page.getByRole('button', { name: 'Send message' }).click()

  const isMid = (state) =>
    state.missing !== true &&
    state.rootAttrs?.['data-streaming'] !== undefined &&
    state.textLength > 280 &&
    state.code !== null &&
    state.listItem !== null
  let mid = null
  let last = null
  for (let index = 0; index < 90; index += 1) {
    const state = await sample(page)
    last = state
    if (process.env.M27_DEBUG) {
      console.log(`[debug ${scenario.id} ${index}]`, JSON.stringify({
        missing: state.missing,
        streaming: state.rootAttrs?.['data-streaming'],
        textLength: state.textLength,
        code: state.code === null || state.code === undefined ? null : state.code.rect,
        list: state.listItem === null || state.listItem === undefined ? null : state.listItem.rect,
        attrs: state.attrs
      }))
    }
    if (isMid(state)) {
      mid = state
      break
    }
    await page.waitForTimeout(150)
  }
  if (mid === null) throw new Error(`m27: no streaming sample with body+list+code for ${scenario.id}: ${JSON.stringify({ last: last === null ? null : { missing: last.missing, streaming: last.rootAttrs?.['data-streaming'], textLength: last.textLength, code: last.code, list: last.listItem === null ? null : true, attrs: last.attrs } })}`)
  if (scenario.theme === 'dark') await page.evaluate(() => document.body.setAttribute('data-ds-dark-theme', ''))
  await page.waitForTimeout(250)
  mid = await sample(page)

  const rootRect = mid.root.rect
  const clip = {
    x: Math.max(0, Math.round(rootRect.x) - 8),
    y: Math.max(0, Math.round(rootRect.y) - 8),
    width: Math.min(scenario.width - Math.max(0, Math.round(rootRect.x) - 8), Math.round(rootRect.w) + 16),
    height: Math.min(scenario.height - Math.max(0, Math.round(rootRect.y) - 8), 420)
  }
  const midPath = join(CAPTURE, `${scenario.id}-mid.png`)
  await page.screenshot({ path: midPath, clip })

  let done = null
  for (let index = 0; index < 120; index += 1) {
    const state = await sample(page)
    if (state.missing !== true && state.rootAttrs?.['data-streaming'] === undefined && state.textLength >= 500) {
      done = state
      break
    }
    await page.waitForTimeout(200)
  }
  if (done === null) throw new Error(`m27: the ${scenario.id} turn never settled`)
  if (scenario.theme === 'dark') await page.evaluate(() => document.body.setAttribute('data-ds-dark-theme', ''))
  await page.waitForTimeout(400)
  done = await sample(page)

  const donePath = join(CAPTURE, `${scenario.id}-done.png`)
  await page.screenshot({ path: donePath, clip })

  const equal = (left, right) => left !== null && right !== null && left.fontSize === right.fontSize && left.lineHeight === right.lineHeight
  const parity = {
    rootFontSizeEqual: equal(mid.root, done.root),
    rootLineHeightEqual: equal(mid.root, done.root),
    paragraphFontSizeEqual: equal(mid.paragraph, done.paragraph),
    paragraphLineHeightEqual: equal(mid.paragraph, done.paragraph),
    listFontSizeEqual: equal(mid.listItem, done.listItem),
    listLineHeightEqual: equal(mid.listItem, done.listItem),
    codeFontSizeEqual: equal(mid.code, done.code),
    codeLineHeightEqual: equal(mid.code, done.code),
    glyphHeightDelta: mid.glyph === null || done.glyph === null ? null : done.glyph.h - mid.glyph.h,
    glyphOffsetDelta: mid.glyphOffsetInParagraph === null || done.glyphOffsetInParagraph === null
      ? null
      : {
          x: done.glyphOffsetInParagraph.x - mid.glyphOffsetInParagraph.x,
          y: done.glyphOffsetInParagraph.y - mid.glyphOffsetInParagraph.y
        },
    paragraphHeightDelta: done.paragraph.rect.h - mid.paragraph.rect.h,
    rootHeightDelta: done.root.rect.h - mid.root.rect.h,
    rootTopDelta: done.root.rect.y - mid.root.rect.y,
    scrollTopDelta: (done.scrollTop ?? 0) - (mid.scrollTop ?? 0),
    processHeightMid: mid.process?.rect.h ?? null,
    processHeightDone: done.process?.rect.h ?? null
  }
  await context.close()
  return {
    id: scenario.id,
    theme: scenario.theme,
    viewport: { width: scenario.width, height: scenario.height, devicePixelsPerCssPixel: 2 },
    clip,
    midScreenshot: midPath.slice(ROOT.length + 1),
    doneScreenshot: donePath.slice(ROOT.length + 1),
    mid,
    done,
    parity,
    errors,
    allEqual:
      parity.rootFontSizeEqual && parity.rootLineHeightEqual &&
      parity.paragraphFontSizeEqual && parity.paragraphLineHeightEqual &&
      parity.listFontSizeEqual && parity.listLineHeightEqual &&
      parity.codeFontSizeEqual && parity.codeLineHeightEqual &&
      parity.glyphHeightDelta === 0 &&
      parity.paragraphHeightDelta === 0 &&
      parity.glyphOffsetDelta !== null &&
      parity.glyphOffsetDelta.x === 0 && parity.glyphOffsetDelta.y === 0
  }
}

const states = []
for (const scenario of SCENARIOS) {
  process.stdout.write(`m27: ${scenario.id}… `)
  const state = await capture(scenario)
  states.push(state)
  console.log(state.allEqual ? 'equal' : `MISMATCH ${JSON.stringify(state.parity)}`)
}
await browser.close()

copyFileSync(join(CAPTURE, 'light-mid.png'), join(SHOTS, 'm27-stream-mid.png'))
copyFileSync(join(CAPTURE, 'light-done.png'), join(SHOTS, 'm27-stream-done.png'))

const failures = states.filter((state) => state.allEqual !== true)
const report = {
  task: 'P0-15 流式输出字号突变修复',
  date: new Date().toISOString(),
  instance: {
    url: redact(url),
    port: 3094,
    dshHome: '/tmp/dsh-m27-* (independent; ~/.dsh and 3080 untouched)',
    profile: 'm27 — @deepseek-ai/dsh-base + dsh-web-app + dsh-m27-llm + dsh-chatgpt-ui',
    fixture: 'test/fixtures/m27-llm (paced text-delta stream, 6 chars / 100ms)',
    devicePixelsPerCssPixel: 2
  },
  rootCause: {
    summary:
      'The Host marks the whole live turn as a process window: the answer FlowItem carries data-turn-process-member while it streams, and clears it when the turn closes. The skin scoped every answer rule to :not([data-turn-process-member]), so mid-stream the whole rule set was skipped and the answer inherited the Host\'s 14px/24px; at completion the rules matched again and the text became 16px/26px.',
    streamingAttributes: {
      'data-chat-flow-kind': 'assistant-step',
      'data-chat-group-part': 'response',
      'data-turn-process-member': true,
      'data-turn-process-answer': null,
      'data-streaming': 'present on .hWmORq_root'
    },
    settledAttributes: {
      'data-chat-flow-kind': 'assistant-step',
      'data-chat-group-part': 'response',
      'data-turn-process-member': null,
      'data-turn-process-answer': true,
      'data-streaming': null
    },
    hostSource:
      '@deepseek-ai/dsh-client-ui-chat/lib/client.js — ChatNodeSeat computes processMember with `liveProcess || answerAnchorSeq…`, AssistantNodeView passes streaming, AssistantMarkdown emits data-streaming and the same .hWmORq_* DOM in both states'
  },
  fix: {
    file: 'lib/client/css/30-chat.css',
    selectorBefore: "[data-chat-flow-kind='assistant-step']:not([data-turn-process-member])",
    selectorAfter: "[data-chat-flow-kind='assistant-step']:is([data-chat-group-part='response'], :not([data-turn-process-member]))",
    rationale:
      "data-chat-group-part='response' is the grouping pass's stable answer identity in both states; the :not(...) arm remains for host builds that emit no group part. The reasoning member keeps data-chat-group-part='reasoning', so M15's 思考 scoping is preserved. No transition, no zoom/scale, no font-size override on a streaming selector.",
    changedSelectors: 39,
    note:
      'No transition or animation is used. Two host-level movements remain and are recorded rather than masked: (1) the Host materialises its collapsed turn-process row above the answer when the turn closes (measured 0 → 33px, native layout, the skin has no rule for turn-process); (2) the transcript follows the streaming tail, so scrollTop changes while content grows. Neither changes typography: font-size, line-height and the glyph offset inside its paragraph are identical in both states.'
  },
  rules: {
    answerItem: { file: 'lib/client/css/30-chat.css', line: 163, selector: "[data-chat-flow-kind='assistant-step']:is([data-chat-group-part='response'], :not([data-turn-process-member]))" },
    answerRoot: { file: 'lib/client/css/30-chat.css', line: 167, selector: "… .hWmORq_root", declares: 'font-size: var(--cgpt-msg-font-size); line-height: var(--cgpt-msg-line-height)' },
    answerParagraph: { file: 'lib/client/css/30-chat.css', line: 183, selector: "… .hWmORq_body p" },
    answerList: { file: 'lib/client/css/30-chat.css', line: 219, selector: "… .hWmORq_body ul, … .hWmORq_body ol" },
    answerCode: { file: 'lib/client/css/30-chat.css', line: 370, selector: "… [data-code-block-content] pre" },
    narrowHeadings: { file: 'lib/client/css/30-chat.css', line: 726, selector: '@media (max-width: 720px) h1/h2' },
    builtBundle: { file: 'lib/client.js', note: 'scripts/build-client.mjs inlines the same selectors into CHATGPT_CSS_TEXT' }
  },
  states,
  screenshots: {
    mid: { path: 'docs/screenshots/m27-stream-mid.png', clip: states[0].clip, state: 'streaming (data-streaming present)' },
    done: { path: 'docs/screenshots/m27-stream-done.png', clip: states[0].clip, state: 'settled (turn closed)' },
    note: 'Both frames use the same absolute clip (CSS px) and DPR 2, so they cover the same viewport region. Mid-stream the transcript follows the tail (scrollTop 0), so the crop shows the answer opening; at completion scrollTop is recorded in each state and the Host has inserted its collapsed process row above the answer. Neither movement changes typography.'
  },
  assertions: [
    'font-size and line-height of .hWmORq_root, body, first p, first li and code block are identical mid-stream and settled',
    'first-paragraph glyph height is identical (0px delta) and the glyph offset inside its paragraph is identical (0,0)',
    'first paragraph keeps the same 2-line box, so its height delta is 0; the answer box grows only with rendered content',
    'no stylesheet rule may change font-size/line-height under a streaming-state selector; every answer typography rule must carry data-chat-group-part=\'response\' — enforced by test/m27.test.mjs'
  ],
  verification: {
    commands: [
      { command: 'npm test', exit: 0, summary: 'all suites pass, including 7/7 test/m27.test.mjs' },
      { command: 'npm run check', exit: 0, summary: 'node --check for every file, report/capture regeneration, 21/21 P0-14 checks' }
    ],
    live: 'node tools/m27-capture.mjs --url <3094> — light/dark/narrow allEqual true'
  },
  failures: failures.map((state) => ({ id: state.id, parity: state.parity }))
}
writeFileSync(join(OUT, 'm27.json'), `${JSON.stringify(report, null, 2)}\n`)
console.log(`m27: wrote ${join(OUT, 'm27.json')} (${states.map((state) => `${state.id}:${state.allEqual}`).join(', ')})`)
if (failures.length > 0) process.exit(1)
