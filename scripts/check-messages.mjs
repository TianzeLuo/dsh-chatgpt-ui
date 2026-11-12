#!/usr/bin/env node
/**
 * Module-4 message-area check: apply the plugin stylesheets to the host-shaped
 * fixture, measure the reference values, and optionally write screenshots.
 *
 * Dev-only, like scripts/screenshots.mjs. The fixture is a layout contract, not
 * a real session; live-session evidence lives in docs/screenshots/m4-*.png.
 *
 *   node scripts/check-messages.mjs --playwright /path/to/playwright [--out docs/screenshots]
 */
import { readdirSync, readFileSync, mkdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const args = new Map()
for (let i = 2; i < process.argv.length; i += 2) args.set(process.argv[i].replace(/^--/, ''), process.argv[i + 1])
const playwrightDir = args.get('playwright')
let playwright
try {
  playwright = await import(playwrightDir === undefined ? 'playwright-core' : join(playwrightDir, 'index.mjs'))
} catch (error) {
  console.error(`playwright-core is required for this check (${error.message})`)
  process.exit(2)
}
const CHROME = process.env.CHATGPT_UI_CHROME ?? '/home/user/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome'
const css = readdirSync(join(ROOT, 'lib/client/css'))
  .filter((name) => name.endsWith('.css'))
  .sort()
  .map((name) => readFileSync(join(ROOT, 'lib/client/css', name), 'utf8'))
  .join('\n')
const browser = await playwright.chromium.launch({ headless: true, executablePath: CHROME, args: ['--no-sandbox', '--disable-dev-shm-usage'] })
const page = await browser.newPage({ viewport: { width: 1000, height: 900 }, deviceScaleFactor: 1 })
await page.goto(pathToFileURL(join(ROOT, 'test/fixtures/messages.html')).href, { waitUntil: 'load' })
await page.addStyleTag({ content: css })

const read = () => page.evaluate(() => {
  const style = (selector, properties) => {
    const node = document.querySelector(selector)
    if (node === null) return null
    const computed = getComputedStyle(node)
    return Object.fromEntries(properties.map((property) => [property, computed.getPropertyValue(property)]))
  }
  return {
    bubble: style('#fixture-user-bubble', ['border-radius', 'background-color', 'padding-top', 'padding-left', 'font-size', 'line-height']),
    columnWidth: document.querySelector('.EvIC1a_column').getBoundingClientRect().width,
    assistant: style('#fixture-assistant-body', ['font-size', 'line-height', 'row-gap']),
    paragraph: style('#fixture-assistant-body p', ['margin-top']),
    heading: style('#fixture-assistant-body h1', ['font-size', 'line-height']),
    codeWrap: style('#fixture-code-wrap', ['border-radius', 'background-color']),
    banner: style('#fixture-code-wrap [data-code-block-banner]', ['height']),
    code: style('#fixture-code-wrap pre', ['font-size', 'white-space']),
    scroller: style('#fixture-code-wrap [data-code-block-content] > div', ['overflow-x'])
  }
})

const light = await read()
const checks = [
  ['column is 760px', light.columnWidth === 760],
  ['bubble radius is 22px', light.bubble?.['border-radius'] === '22px'],
  ['bubble fill is #E8F3FE', light.bubble?.['background-color'] === 'rgb(232, 243, 254)'],
  ['bubble padding is 10px 16px', light.bubble?.['padding-top'] === '10px' && light.bubble?.['padding-left'] === '16px'],
  ['bubble font is 16/24', light.bubble?.['font-size'] === '16px' && light.bubble?.['line-height'] === '24px'],
  ['assistant prose is 16/26', light.assistant?.['font-size'] === '16px' && light.assistant?.['line-height'] === '26px'],
  ['assistant gap is 0 and paragraph is 8px', light.assistant?.['row-gap'] === '0px' && light.paragraph?.['margin-top'] === '8px'],
  ['h1 is 20/28', light.heading?.['font-size'] === '20px' && light.heading?.['line-height'] === '28px'],
  ['code card radius is 12px', light.codeWrap?.['border-radius'] === '12px'],
  ['code banner is 40px', light.banner?.['height'] === '40px'],
  ['code is 13px, unwrapped', light.code?.['font-size'] === '13px' && light.code?.['white-space'] === 'pre'],
  ['code wrapper scrolls horizontally', light.scroller?.['overflow-x'] === 'auto']
]

await page.evaluate(() => document.body.setAttribute('data-ds-dark-theme', ''))
const dark = await read()
checks.push(
  ['dark bubble is #173E76', dark.bubble?.['background-color'] === 'rgb(23, 62, 118)'],
  ['dark code surface is #0D0D0D', dark.codeWrap?.['background-color'] === 'rgb(13, 13, 13)']
)

const outDir = args.get('out')
if (outDir !== undefined) {
  mkdirSync(resolve(ROOT, outDir), { recursive: true })
  await page.evaluate(() => document.body.removeAttribute('data-ds-dark-theme'))
  await page.screenshot({ path: resolve(ROOT, outDir, 'm4-fixture-light.png') })
  await page.evaluate(() => document.body.setAttribute('data-ds-dark-theme', ''))
  await page.screenshot({ path: resolve(ROOT, outDir, 'm4-fixture-dark.png') })
}

await browser.close()
const failed = checks.filter(([, ok]) => !ok)
for (const [label, ok] of checks) console.log(`${ok ? 'ok  ' : 'FAIL'}  ${label}`)
console.log(failed.length === 0 ? `PASS  ${checks.length} message-area assertions` : `FAIL  ${failed.length}/${checks.length}`)
process.exit(failed.length === 0 ? 0 : 1)
