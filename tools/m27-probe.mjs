#!/usr/bin/env node
/**
 * tools/m27-probe.mjs — live DOM probe for P0-15 (dev tool, not shipped).
 *
 * Opens one isolated DSH instance, sends the M27 fixture prompt, and samples the
 * last answer flow item plus its AssistantMarkdown root while the reply is
 * streaming and again after it settles. Prints compact JSON so the CSS fix is
 * based on the host's real attributes rather than a guess.
 *
 *   node tools/m27-probe.mjs "http://127.0.0.1:3094/?token=…"
 */
const playwrightPath = process.env.M27_PLAYWRIGHT ?? 'playwright'
const CHROME = process.env.CHATGPT_UI_CHROME ?? process.env.HOME + '/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome'
const { chromium } = await import(playwrightPath)

const url = process.argv[2]
if (url === undefined) {
  console.error('usage: node tools/m27-probe.mjs <url>')
  process.exit(2)
}

const browser = await chromium.launch({ headless: true, executablePath: CHROME, args: ['--no-sandbox', '--disable-dev-shm-usage'] })
const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 })
const errors = []
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text())
})
await page.goto(url, { waitUntil: 'networkidle' })
const notice = page.getByRole('button', { name: 'Continue' })
if ((await notice.count()) > 0) await notice.click()
await page.waitForTimeout(800)
// Chat mode: no workspace/tool round-trips, so the fixture's one text stream is
// the only thing that ever renders.
await page.getByText('Chat', { exact: true }).first().click()
await page.waitForTimeout(600)

const composer = page.locator('textarea, [contenteditable="true"]').first()
await composer.waitFor({ state: 'visible', timeout: 20000 })
await composer.click()
await composer.fill('请生成一条较长的回复，用于流式字号检查。')
await page.waitForTimeout(200)
await page.getByRole('button', { name: 'Send message' }).click()

const sample = () =>
  page.evaluate(() => {
    const items = [...document.querySelectorAll('[data-chat-flow-kind="assistant-step"][data-chat-group-part="response"]')]
    const item = items.at(-1)
    if (item === undefined) return { missing: true }
    const root = item.querySelector('[class*="_root"]')
    const body = item.querySelector('[class*="_body"]')
    const paragraph = [...item.querySelectorAll('p')].find((node) => (node.textContent ?? '').trim().length > 0) ?? null
    const style = (node) => {
      if (node === null) return null
      const computed = getComputedStyle(node)
      const box = node.getBoundingClientRect()
      return {
        fontSize: computed.fontSize,
        lineHeight: computed.lineHeight,
        rect: { x: box.x, y: box.y, w: box.width, h: box.height }
      }
    }
    const attrs = {}
    for (const attribute of item.attributes) attrs[attribute.name] = attribute.value === '' ? true : attribute.value
    const rootAttrs = {}
    if (root !== null) for (const attribute of root.attributes) rootAttrs[attribute.name] = attribute.value === '' ? true : attribute.value
    let glyph = null
    const textNode = paragraph?.firstChild
    if (textNode !== null && textNode !== undefined && textNode.nodeType === Node.TEXT_NODE && (textNode.textContent ?? '').trim() !== '') {
      const range = document.createRange()
      range.setStart(textNode, 0)
      range.setEnd(textNode, Math.min(2, textNode.textContent.length))
      const box = range.getBoundingClientRect()
      glyph = { x: box.x, y: box.y, w: box.width, h: box.height }
    }
    return {
      attrs,
      rootAttrs,
      root: style(root),
      body: style(body),
      paragraph: style(paragraph),
      glyph,
      textContent: paragraph?.textContent?.slice(0, 24) ?? null,
      count: items.length
    }
  })

let mid = null
for (let index = 0; index < 60; index += 1) {
  const current = await sample()
  if (current.missing !== true && current.rootAttrs?.['data-streaming'] === true && (current.textContent ?? '').length > 8) {
    mid = current
    break
  }
  await page.waitForTimeout(200)
}
await page.waitForTimeout(1200)
const mid2 = await sample()

let done = null
for (let index = 0; index < 120; index += 1) {
  const current = await sample()
  if (current.missing !== true && current.rootAttrs?.['data-streaming'] === undefined && (current.paragraph?.rect?.h ?? 0) > 100) {
    done = current
    break
  }
  await page.waitForTimeout(250)
}
console.log(JSON.stringify({ mid, mid2, done, errors }, null, 2))
await browser.close()
