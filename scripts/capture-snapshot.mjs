#!/usr/bin/env node
/**
 * Capture a DOM snapshot of a running DSH Web UI and report whether the skin
 * mounted. Used twice: as the M0 acceptance check and to (re)generate
 * test/fixtures/dom-snapshot.html for test/selectors.contract.mjs.
 *
 * No dependency: the DevTools protocol is spoken over Node's built-in
 * WebSocket (Node >= 22) against a headless Chromium started with
 * --remote-debugging-port.
 *
 * Usage:
 *   node scripts/capture-snapshot.mjs --url "http://127.0.0.1:3099/?token=..." \
 *     [--out test/fixtures/dom-snapshot.html] [--chrome /path/to/chrome] [--port 9333]
 *
 * The URL must be the tokenised one printed by `dsh web` (or an already
 * authenticated session), because the server fences /api behind a cookie.
 */

import { spawn } from 'node:child_process'
import { existsSync, readdirSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const args = new Map()
for (let i = 2; i < process.argv.length; i += 2) args.set(process.argv[i].replace(/^--/, ''), process.argv[i + 1])

const url = args.get('url')
const out = resolve(ROOT, args.get('out') ?? 'test/fixtures/dom-snapshot.html')
const port = Number(args.get('port') ?? 9333)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** Find a Chromium: explicit flag, env override, then the playwright cache, then PATH names. */
function findChrome() {
  const explicit = args.get('chrome') ?? process.env.CHATGPT_UI_CHROME
  if (explicit !== undefined) return explicit
  const cache = join(homedir(), '.cache', 'ms-playwright')
  if (existsSync(cache)) {
    const candidates = readdirSync(cache)
      .filter((name) => name.startsWith('chromium-'))
      .sort()
      .reverse()
    for (const name of candidates) {
      for (const rel of ['chrome-linux64/chrome', 'chrome-linux/chrome']) {
        const path = join(cache, name, rel)
        if (existsSync(path)) return path
      }
    }
  }
  return 'chromium'
}

if (url === undefined) {
  console.error('missing --url (use the tokenised URL printed by `dsh web`)')
  process.exit(2)
}

const chromePath = findChrome()
const profileDir = `/tmp/dsh-chatgpt-ui-chrome-${Date.now()}`
const chrome = spawn(
  chromePath,
  [
    '--headless=new',
    '--no-sandbox',
    '--disable-dev-shm-usage',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--window-size=1600,1000',
    `--user-data-dir=${profileDir}`,
    `--remote-debugging-port=${port}`,
    '--remote-allow-origins=*',
    'about:blank'
  ],
  { stdio: 'ignore' }
)

const fail = async (message) => {
  chrome.kill('SIGKILL')
  console.error(message)
  process.exit(1)
}

/** Wait for one page target and return its websocket URL. */
async function pageTarget() {
  const deadline = Date.now() + 30000
  while (Date.now() < deadline) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
      const page = list.find((target) => target.type === 'page')
      if (page !== undefined) return page.webSocketDebuggerUrl
    } catch {}
    await sleep(300)
  }
  return undefined
}

const wsUrl = await pageTarget()
if (wsUrl === undefined) await fail('chromium did not expose a page target on port ' + port)

const socket = new WebSocket(wsUrl)
await new Promise((res, rej) => {
  socket.addEventListener('open', res, { once: true })
  socket.addEventListener('error', rej, { once: true })
})

let nextId = 1
const pending = new Map()
const consoleLines = []
const errors = []

socket.addEventListener('message', (event) => {
  const message = JSON.parse(event.data)
  if (message.id !== undefined) {
    const entry = pending.get(message.id)
    pending.delete(message.id)
    if (entry !== undefined) entry(message)
    return
  }
  const { method, params } = message
  if (method === 'Runtime.consoleAPICalled') {
    const text = params.args.map((a) => a.value ?? a.description ?? a.type).join(' ')
    consoleLines.push({ level: params.type, text })
  } else if (method === 'Runtime.exceptionThrown') {
    errors.push(params.exceptionDetails?.exception?.description ?? params.exceptionDetails?.text ?? 'exception')
  } else if (method === 'Log.entryAdded' && params.entry.level === 'error') {
    errors.push(`${params.entry.source}: ${params.entry.text}`)
  }
})

const send = (method, params = {}) =>
  new Promise((res, rej) => {
    const id = nextId++
    pending.set(id, (message) => (message.error === undefined ? res(message.result) : rej(new Error(`${method}: ${message.error.message}`))))
    socket.send(JSON.stringify({ id, method, params }))
  })

const evaluate = async (expression) => {
  const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  return result.result?.value
}

await send('Runtime.enable')
await send('Log.enable')
await send('Page.enable')
await send('Page.navigate', { url })

/** Poll until the skin reports itself mounted AND the shell has rendered (or give up). */
const deadline = Date.now() + 60000
let mounted = undefined
while (Date.now() < deadline) {
  mounted = await evaluate(`(() => {
    const body = document.body
    if (body === null) return null
    const attr = body.getAttribute('data-chatgpt-ui')
    const sheet = document.getElementById('dsh-chatgpt-ui-styles')
    const frame = document.querySelector('[data-slot="sidebar"]')
    if (attr === null || sheet === null || frame === null) return null
    const style = getComputedStyle(body)
    return {
      bodyAttr: attr,
      styleSheetId: sheet.id,
      styleSheetBytes: sheet.textContent.length,
      canvas: style.backgroundColor,
      label: style.color,
      colorScheme: document.documentElement.style.colorScheme,
      darkAttr: body.hasAttribute('data-ds-dark-theme'),
      slots: [...new Set([...document.querySelectorAll('[data-slot]')].map((n) => n.getAttribute('data-slot')))].sort(),
      flowKinds: [...new Set([...document.querySelectorAll('[data-chat-flow-kind]')].map((n) => n.getAttribute('data-chat-flow-kind')))],
      sidebarWidth: (document.querySelector('[class*="_sidebarCol"]') ?? frame).getBoundingClientRect().width
    }
  })()`).catch(() => null)
  if (mounted !== undefined && mounted !== null) break
  await sleep(500)
}

const html = await evaluate('document.documentElement.outerHTML')
const title = await evaluate('document.title')

/** Drop inline script/style bodies: noise for the contract, and the boot JSON is large. `--full` keeps them. */
const keepAssets = args.has('full')
const fixtureHtml =
  typeof html === 'string' && !keepAssets
    ? html.replace(/<script[\s\S]*?<\/script>/gi, '<!-- script stripped by capture-snapshot.mjs -->').replace(/<style[\s\S]*?<\/style>/gi, '<!-- style stripped by capture-snapshot.mjs -->')
    : html

if (typeof fixtureHtml === 'string' && args.get('out') !== 'skip') {
  writeFileSync(
    out,
    `<!-- dsh-chatgpt-ui DOM snapshot\n     captured: ${new Date().toISOString()}\n     source: ${url.replace(/token=[^&]+/, 'token=<redacted>')}\n     regenerate: node scripts/capture-snapshot.mjs --url "<tokenised URL>"\n     NOTE: script/style bodies are stripped (pass --full to keep them); the capture runs on a fresh profile, so it holds no message content. -->\n${fixtureHtml}\n`,
    'utf8'
  )
}

console.log(
  JSON.stringify(
    {
      mounted: mounted ?? null,
      title,
      out: args.get('out') === 'skip' ? null : out,
      console: consoleLines.filter((line) => /chatgpt|error|warn/i.test(line.text) || line.level === 'error'),
      errors
    },
    null,
    1
  )
)

socket.close()
chrome.kill('SIGKILL')
process.exit(mounted === null || mounted === undefined ? 1 : 0)
