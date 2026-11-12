#!/usr/bin/env node
/**
 * scripts/m23-ref-capture.mjs — read-only capture of the two rail glyph pairs
 * the skin used to synthesize: 定时任务 and 插件.
 *
 * The web app renders an unselected rail item through the icon sprite
 * (`<use href="…svg#codex-icon-clock-light-20">`) and a *selected* item as an
 * inline SVG (the filled clock / plugin). The skin shipped a hand-drawn solid
 * circle for 定时任务 and a stroked outline for 插件; both drifted from the
 * reference. This script reads the live pair, verbatim, and writes
 * `docs/capture/live/m23-rail-icons.json`.
 *
 * Read-only: it opens a throwaway tab, navigates it to /automations and clicks
 * the 插件 rail button once to reach /plugins, reads the DOM/sprite and captures
 * the rail. It never creates a conversation, sends a message, or changes a
 * setting. The tab is closed afterwards.
 *
 *   node scripts/m23-ref-capture.mjs [--port 9224] [--out docs/capture/live]
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const args = new Map()
for (let index = 2; index < process.argv.length; index += 1) {
  const key = process.argv[index]
  if (!key.startsWith('--')) continue
  const next = process.argv[index + 1]
  if (next === undefined || next.startsWith('--')) args.set(key.slice(2), true)
  else {
    args.set(key.slice(2), next)
    index += 1
  }
}
const HOST = args.get('host') ?? process.env.DSH_CDP_HOST ?? '127.0.0.1'
const PORT = args.get('port') ?? process.env.DSH_CDP_PORT ?? '9224'
const OUT = resolve(ROOT, typeof args.get('out') === 'string' ? args.get('out') : 'docs/capture/live')
mkdirSync(OUT, { recursive: true })
const BASE = `http://${HOST}:${PORT}`

class Conn {
  static async open(url) {
    const ws = new WebSocket(url)
    await new Promise((ok, fail) => {
      ws.addEventListener('open', ok, { once: true })
      ws.addEventListener('error', () => fail(new Error(`cannot open ${url}`)), { once: true })
    })
    return new Conn(ws)
  }
  constructor(ws) {
    this.ws = ws
    this.seq = 0
    this.pending = new Map()
    ws.addEventListener('message', (event) => {
      let message
      try {
        message = JSON.parse(typeof event.data === 'string' ? event.data : String(event.data))
      } catch {
        return
      }
      const waiter = message.id === undefined ? undefined : this.pending.get(message.id)
      if (waiter === undefined) return
      this.pending.delete(message.id)
      if (message.error) waiter.reject(new Error(`${waiter.method}: ${JSON.stringify(message.error)}`))
      else waiter.resolve(message.result)
    })
  }
  send(method, params = {}, sessionId) {
    const id = ++this.seq
    const payload = { id, method, params }
    if (sessionId !== undefined) payload.sessionId = sessionId
    return new Promise((ok, fail) => {
      this.pending.set(id, { resolve: ok, reject: fail, method })
      this.ws.send(JSON.stringify(payload))
      setTimeout(() => {
        if (!this.pending.has(id)) return
        this.pending.delete(id)
        fail(new Error(`${method}: timed out`))
      }, 40000)
    })
  }
  close() {
    try {
      this.ws.close()
    } catch {}
  }
}

const sleep = (ms) => new Promise((resolve_) => setTimeout(resolve_, ms))

const RAIL_STATE = String.raw`(() => {
  const rail = document.querySelector('[data-app-navigation-rail]')
  if (rail === null) return null
  const data = (svg) => {
    if (svg === null) return null
    const use = svg.querySelector('use')
    return {
      width: svg.getAttribute('width'),
      height: svg.getAttribute('height'),
      viewBox: svg.getAttribute('viewBox'),
      fill: svg.getAttribute('fill'),
      inline: use === null,
      symbol: use === null ? null : (use.getAttribute('href') || '').split('#')[1] ?? null,
      inner: svg.innerHTML.replace(/\s+/g, ' ').trim(),
      outer: svg.outerHTML.replace(/\s+/g, ' ').trim()
    }
  }
  const read = (destination) => {
    const button = rail.querySelector('button[data-sidebar-destination="' + destination + '"]')
    if (button === null) return null
    const svg = button.querySelector('svg')
    const style = getComputedStyle(button)
    const box = button.getBoundingClientRect()
    return {
      destination,
      label: button.querySelector('.sr-only')?.textContent?.trim() ?? button.getAttribute('aria-label') ?? '',
      selected: button.hasAttribute('data-selected') || button.getAttribute('aria-current') === 'page',
      rect: { x: Math.round(box.x), y: Math.round(box.y), width: Math.round(box.width), height: Math.round(box.height) },
      radius: style.borderRadius,
      padding: style.padding,
      background: style.backgroundColor,
      color: style.color,
      icon: data(svg)
    }
  }
  const firstUse = rail.querySelector('use')
  return {
    theme: document.documentElement.getAttribute('data-theme') ?? document.documentElement.className,
    sprite: firstUse === null ? null : (firstUse.getAttribute('href') || '').split('#')[0] ?? null,
    items: ['builtin:automations', 'builtin:customize'].map(read)
  }
})()`

const SPRITE = String.raw`(async (url, ids) => {
  const response = await fetch(url)
  const text = await response.text()
  const doc = new DOMParser().parseFromString(text, 'image/svg+xml')
  const out = {}
  for (const id of ids) {
    const node = doc.querySelector('symbol#' + id.replace(/([^\w-])/g, '\\$1'))
    out[id] = node === null ? null : {
      viewBox: node.getAttribute('viewBox') ?? '0 0 20 20',
      inner: node.innerHTML.replace(/\s+/g, ' ').trim()
    }
  }
  return { bytes: text.length, symbols: out }
})(__URL__, __IDS__)`

const main = async () => {
  const version = await (await fetch(`${BASE}/json/version`)).json()
  const conn = await Conn.open(version.webSocketDebuggerUrl)
  let targetId
  try {
    const created = await conn.send('Target.createTarget', { url: 'https://chatgpt.com/automations', background: true })
    targetId = created.targetId
    const attached = await conn.send('Target.attachToTarget', { targetId, flatten: true })
    const session = attached.sessionId
    const evaluate = async (expression, awaitPromise = false) => {
      const result = await conn.send(
        'Runtime.evaluate',
        { expression, returnByValue: true, awaitPromise },
        session
      )
      if (result.exceptionDetails) {
        throw new Error(result.exceptionDetails.exception?.description ?? 'evaluate failed')
      }
      return result.result.value
    }
    const waitRail = async () => {
      for (let attempt = 0; attempt < 60; attempt += 1) {
        const ok = await evaluate("document.querySelector('[data-app-navigation-rail]') !== null").catch(() => false)
        if (ok) return true
        await sleep(500)
      }
      return false
    }
    if (!(await waitRail())) throw new Error('rail did not render')
    await sleep(1500)

    const automationState = await evaluate(RAIL_STATE)
    if (automationState === null) throw new Error('rail state missing on /automations')

    // Read the two sprite symbols the unselected items use.
    const ids = automationState.items.map((item) => item?.icon?.symbol).filter((id) => typeof id === 'string')
    const spriteData = await evaluate(
      SPRITE.replace('__URL__', JSON.stringify(automationState.sprite)).replace('__IDS__', JSON.stringify(ids)),
      true
    )

    const shot = async (file) => {
      await conn.send('Page.enable', {}, session)
      const image = await conn.send(
        'Page.captureScreenshot',
        { format: 'png', clip: { x: 0, y: 0, width: 52, height: 360, scale: 2 }, captureBeyondViewport: false },
        session
      )
      writeFileSync(resolve(OUT, file), Buffer.from(image.data, 'base64'))
      return `docs/capture/live/${file}`
    }

    const screenshots = {}
    screenshots.automations = await shot('m23-ref-rail-automations.png')

    // Reach /plugins the way a user does: one click on the 插件 rail button.
    const point = await evaluate(`(() => {
      const button = document.querySelector('[data-sidebar-destination="builtin:customize"]')
      if (button === null) return null
      const box = button.getBoundingClientRect()
      return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
    })()`)
    if (point === null) throw new Error('插件 rail button not found')
    await conn.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: point.x, y: point.y }, session)
    await conn.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: point.x, y: point.y, button: 'left', clickCount: 1 }, session)
    await conn.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: point.x, y: point.y, button: 'left', clickCount: 1 }, session)
    let pluginState = null
    for (let attempt = 0; attempt < 40; attempt += 1) {
      await sleep(500)
      const state = await evaluate(RAIL_STATE)
      const plugin = state?.items?.find?.((item) => item?.destination === 'builtin:customize')
      if (plugin?.selected === true && plugin.icon?.inline === true) {
        pluginState = state
        break
      }
    }
    if (pluginState === null) throw new Error('插件 selected state was not reached')
    screenshots.plugins = await shot('m23-ref-rail-plugins.png')

    // Light-mode rail for the same pair (the page follows prefers-color-scheme).
    await conn.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'light' }] }, session)
    await sleep(1200)
    screenshots.light = await shot('m23-ref-rail-plugins-light.png')
    await conn.send('Emulation.setEmulatedMedia', { features: [] }, session)

    const byDestination = (state, destination) => state?.items?.find?.((item) => item?.destination === destination) ?? null
    const clock = byDestination(automationState, 'builtin:automations')
    const clockBefore = byDestination(pluginState, 'builtin:automations')
    const pluginBefore = byDestination(automationState, 'builtin:customize')
    const plugin = byDestination(pluginState, 'builtin:customize')
    const clockSymbol = clockBefore?.icon?.symbol
    if (typeof clockSymbol === 'string' && spriteData.symbols[clockSymbol] === undefined) {
      const second = await evaluate(
        SPRITE.replace('__URL__', JSON.stringify(automationState.sprite)).replace('__IDS__', JSON.stringify([clockSymbol])),
        true
      )
      Object.assign(spriteData.symbols, second.symbols)
    }
    const defaultFor = (item) => {
      const symbol = item?.icon?.symbol
      return symbol === null || symbol === undefined ? null : spriteData.symbols[symbol] ?? null
    }

    const out = {
      meta: {
        generatedBy: 'scripts/m23-ref-capture.mjs',
        source: 'https://chatgpt.com/',
        capturedAt: new Date().toISOString(),
        sprite: automationState.sprite,
        spriteBytes: spriteData.bytes,
        readOnly: true,
        note:
          '一个临时标签页只读打开 /automations，再点一次「插件」到 /plugins；未新建会话、未发送消息、未改任何设置。选中项由 web 端以 inline SVG 渲染，未选中项走 sprite symbol。'
      },
      geometry: {
        button: {
          width: clock.rect.width,
          height: clock.rect.height,
          radius: clock.radius,
          padding: clock.padding
        },
        icon: { width: clock.icon.width, height: clock.icon.height, viewBox: clock.icon.viewBox },
        selected: { background: clock.background, color: clock.color },
        unselected: { background: pluginBefore?.background ?? null, color: pluginBefore?.color ?? null },
        anchor: { x: clock.rect.x, y: clock.rect.y, width: clock.rect.width, height: clock.rect.height }
      },
      states: {
        schedules: {
          label: clock.label,
          destination: clock.destination,
          default: { symbol: clockBefore?.icon?.symbol ?? null, ...defaultFor(clockBefore) },
          selected: {
            inline: true,
            viewBox: clock.icon.viewBox,
            width: clock.icon.width,
            height: clock.icon.height,
            inner: clock.icon.inner
          }
        },
        plugins: {
          label: plugin.label,
          destination: plugin.destination,
          default: { symbol: pluginBefore?.icon?.symbol ?? null, ...defaultFor(pluginBefore) },
          selected: {
            inline: true,
            viewBox: plugin.icon.viewBox,
            width: plugin.icon.width,
            height: plugin.icon.height,
            inner: plugin.icon.inner
          }
        }
      },
      screenshots
    }
    writeFileSync(resolve(OUT, 'm23-rail-icons.json'), `${JSON.stringify(out, null, 2)}\n`, 'utf8')
    console.log(`wrote ${resolve(OUT, 'm23-rail-icons.json')}`)
    console.log(`clock selected: ${clock.icon.inline ? 'inline' : clock.icon.symbol}`)
    console.log(`plugin selected: ${plugin.icon.inline ? 'inline' : plugin.icon.symbol}`)
  } finally {
    if (targetId !== undefined) await conn.send('Target.closeTarget', { targetId }).catch(() => {})
    conn.close()
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
