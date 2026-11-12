#!/usr/bin/env node
/**
 * extract-icons.mjs — export the REAL rail icons from the ChatGPT web app.
 *
 * Read-only capture over CDP (default port 9224, the read-only Chrome started
 * for the design capture). It never clicks, types, navigates or submits; it
 * only reads the live DOM, the computed styles and the icon sprite the page
 * already references.
 *
 *   node scripts/extract-icons.mjs [--out docs/capture/icons.json]
 *     [--port 9224] [--host 127.0.0.1] [--label 首页 ...]
 *
 * Why a script instead of hand-written glyphs: the rail has to match the
 * reference pixel for pixel, and a hand-drawn gear/house drifts (the gear was
 * asymmetric). The sprite symbols are the source of truth, so they are copied
 * verbatim (path data included) into icons.json. `npm run icons` regenerates the
 * file; `test/icons.test.mjs` fails if lib/client/rail-icons.js drifts from it.
 *
 * The sprite is served from the page's own origin; the fetch below is a plain
 * GET of an already-loaded asset. No credentials are read or written.
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

const args = new Map()
for (let index = 2; index < process.argv.length; index += 2) {
  args.set(process.argv[index].replace(/^--/, ''), process.argv[index + 1])
}

const HOST = args.get('host') ?? process.env.DSH_CDP_HOST ?? '127.0.0.1'
const PORT = args.get('port') ?? process.env.DSH_CDP_PORT ?? '9224'
const OUT = resolve(ROOT, args.get('out') ?? 'docs/capture/icons.json')
const BASE = `http://${HOST}:${PORT}`

/** One WebSocket JSON-RPC connection to the browser endpoint. */
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
    return new Promise((resolve_, reject) => {
      this.pending.set(id, { resolve: resolve_, reject, method })
      this.ws.send(JSON.stringify(payload))
      setTimeout(() => {
        if (!this.pending.has(id)) return
        this.pending.delete(id)
        reject(new Error(`${method}: timed out`))
      }, 20000)
    })
  }
  close() {
    try {
      this.ws.close()
    } catch {
      // closing an already-closed socket is fine
    }
  }
}

/** Read the rail: geometry, colours and the `<use>` reference of every button. */
const RAIL_EXPR = String.raw`(() => {
  const norm = (value) => (value || '').replace(/\s+/g, ' ').trim()
  const box = (el) => { const r = el.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) } }
  const rail = document.querySelector('[data-app-navigation-rail]')
  if (rail === null) return null
  const list = rail.querySelector('[data-appearance="plain"]') ?? rail
  const listStyle = getComputedStyle(list)
  const buttons = [...rail.querySelectorAll('button')].map((button) => {
    const svg = button.querySelector('svg')
    const use = svg === null ? null : svg.querySelector('use')
    const style = getComputedStyle(button)
    const markStyle = svg === null ? null : getComputedStyle(svg)
    return {
      label: norm(button.getAttribute('aria-label') || button.innerText),
      destination: button.getAttribute('data-sidebar-destination'),
      selected: button.hasAttribute('data-selected') || button.getAttribute('aria-current') === 'page',
      rect: box(button),
      radius: style.borderRadius,
      background: style.backgroundColor,
      color: style.color,
      iconSize: svg === null ? null : { width: markStyle.width, height: markStyle.height, fill: markStyle.fill, viewBox: svg.getAttribute('viewBox') },
      symbol: use === null ? null : (use.getAttribute('href') || '').split('#')[1] ?? null,
      inline: svg === null ? null : svg.innerHTML.replace(/\s+/g, ' ').trim()
    }
  })
  return {
    theme: document.documentElement.className,
    dark: matchMedia('(prefers-color-scheme: dark)').matches,
    rail: { rect: box(rail), width: getComputedStyle(rail).width },
    list: { rect: box(list), gap: listStyle.rowGap, padding: listStyle.padding, margin: listStyle.margin, display: listStyle.display, direction: listStyle.flexDirection },
    spriteUrl: (() => {
      const use = rail.querySelector('use')
      return use === null ? null : use.getAttribute('href')?.split('#')[0] ?? null
    })(),
    buttons
  }
})()`

/** Pull the requested `<symbol>` bodies out of the sprite text. */
const SYMBOLS_EXPR = String.raw`(async (spriteUrl) => {
  const response = await fetch(spriteUrl)
  const text = await response.text()
  const doc = new DOMParser().parseFromString(text, 'image/svg+xml')
  const wanted = ${JSON.stringify([
    'codex-icon-home-light-20',
    'codex-icon-home-fill-light-20',
    'codex-icon-clock-light-20',
    'codex-icon-plugin-light-20',
    'codex-icon-ellipsis-horizontal-light-20',
    'codex-icon-gear-light-20',
    'codex-icon-agent-light-20',
    'codex-icon-dot-light-16',
    'codex-icon-chat-bubble-light-20',
    'codex-icon-apps-light-20',
    'codex-icon-folder-light-20',
    'codex-icon-paperclip-light-20',
    'codex-icon-microphone-light-20',
    'codex-icon-voice-regular-20'
  ])}
  const symbols = {}
  for (const id of wanted) {
    const node = doc.querySelector('symbol#' + id.replace(/([^\w-])/g, '\\$1'))
    if (node === null) { symbols[id] = null; continue }
    symbols[id] = {
      viewBox: node.getAttribute('viewBox'),
      fill: node.getAttribute('fill'),
      inner: node.innerHTML.replace(/\s+/g, ' ').trim()
    }
  }
  return { bytes: text.length, symbols }
})(__SPRITE__)`

/**
 * The sidebar's 新聊天 button renders an inline `<svg>` instead of a sprite
 * reference, so its path data is copied from the live node rather than the
 * sprite. Read-only: the node is inspected, never clicked.
 */
const COMPOSE_EXPR = String.raw`(() => {
  const button = [...document.querySelectorAll('button')].find((el) => (el.getAttribute('aria-label') || '') === '新聊天')
  const svg = button === null || button === undefined ? null : button.querySelector('svg')
  if (svg === null) return null
  return {
    viewBox: svg.getAttribute('viewBox') || '0 0 20 20',
    fill: svg.getAttribute('fill') || 'currentColor',
    inner: svg.innerHTML.replace(/\s+/g, ' ').trim()
  }
})()`

const main = async () => {
  const version = await (await fetch(`${BASE}/json/version`)).json()
  const conn = await Conn.open(version.webSocketDebuggerUrl)
  try {
    const { targetInfos } = await conn.send('Target.getTargets')
    const page = targetInfos.filter((entry) => entry.type === 'page').find((entry) => /chatgpt\.com/.test(entry.url))
    if (page === undefined) throw new Error('no chatgpt.com page on the CDP browser')
    const { sessionId } = await conn.send('Target.attachToTarget', { targetId: page.targetId, flatten: true })
    const evaluate = async (expression, awaitPromise = false) => {
      const result = await conn.send(
        'Runtime.evaluate',
        { expression, returnByValue: true, awaitPromise },
        sessionId
      )
      if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? 'page script failed')
      return result.result.value
    }

    const dark = await evaluate(RAIL_EXPR)
    if (dark === null) throw new Error('the rail ([data-app-navigation-rail]) is not on screen')
    await conn.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'light' }] }, sessionId)
    await new Promise((ok) => setTimeout(ok, 900))
    const light = await evaluate(RAIL_EXPR)
    await conn.send('Emulation.setEmulatedMedia', { features: [] }, sessionId)

    const sprite = await evaluate(SYMBOLS_EXPR.replaceAll('__SPRITE__', JSON.stringify(dark.spriteUrl)), true)
    if (!sprite) throw new Error('sprite fetch failed')

    const compose = await evaluate(COMPOSE_EXPR)
    if (compose === null) throw new Error('the sidebar 新聊天 button has no inline svg')

    const pick = (state, label) => state.buttons.find((button) => button.label === label) ?? null
    /** Map our four rail items onto the reference buttons that exist today. */
    const map = {
      home: { referenceLabel: '首页', symbols: ['codex-icon-home-light-20', 'codex-icon-home-fill-light-20'] },
      schedules: { referenceLabel: '定时任务', symbols: ['codex-icon-clock-light-20'] },
      plugins: { referenceLabel: '插件', symbols: ['codex-icon-plugin-light-20'] },
      more: { referenceLabel: '探索', symbols: ['codex-icon-ellipsis-horizontal-light-20'] },
      settings: { referenceLabel: null, symbols: ['codex-icon-gear-light-20'] },
      agent: { referenceLabel: null, symbols: ['codex-icon-agent-light-20'] },
      dot: { referenceLabel: null, symbols: ['codex-icon-dot-light-16'] },
      chat: { referenceLabel: null, symbols: ['codex-icon-chat-bubble-light-20'] },
      work: { referenceLabel: null, symbols: ['codex-icon-apps-light-20'] },
      // Phase 4B: the Work card's tool row and action row use the same sprite,
      // and 新聊天 switches from a plus to the reference's pen-square.
      compose: { referenceLabel: '新聊天', symbols: [null], inline: compose },
      folder: { referenceLabel: null, symbols: ['codex-icon-folder-light-20'] },
      paperclip: { referenceLabel: null, symbols: ['codex-icon-paperclip-light-20'] },
      mic: { referenceLabel: null, symbols: ['codex-icon-microphone-light-20'] },
      voice: { referenceLabel: null, symbols: ['codex-icon-voice-regular-20'] }
    }

    const icons = {}
    for (const [key, entry] of Object.entries(map)) {
      const ref = entry.referenceLabel === null ? null : pick(dark, entry.referenceLabel)
      const [defaultSymbol, selectedSymbol] = entry.symbols
      const shape = (id) => {
        if (id === null) return entry.inline ?? null
        const symbol = sprite.symbols[id] ?? null
        if (symbol === null) return null
        return {
          symbol: id,
          viewBox: symbol.viewBox ?? '0 0 20 20',
          fill: symbol.fill ?? 'currentColor',
          inner: symbol.inner
        }
      }
      icons[key] = {
        referenceLabel: entry.referenceLabel,
        referenceDestination: ref?.destination ?? null,
        default: shape(defaultSymbol),
        // Only the home glyph ships a filled twin; every other sprite symbol is
        // already a solid `fill:currentColor` silhouette, so its selected state
        // is the same shape in the emphasis colour with the rail's grey pill.
        selected: selectedSymbol === undefined ? shape(defaultSymbol) : shape(selectedSymbol),
        selectedEqualsDefault: selectedSymbol === undefined,
        // Every glyph keeps the sprite symbol it was copied from, so a diff
        // can be traced back to the page; only label-mapped ones also carry the
        // measured rect/colour of the button that renders them.
        reference: {
          symbol: defaultSymbol,
          // `compose` has no sprite symbol: the 新聊天 button draws it inline.
          inline: entry.inline !== undefined,
          ...(ref === null
            ? {}
            : { rect: ref.rect, radius: ref.radius, color: ref.color, background: ref.background, iconSize: ref.iconSize })
        }
      }
    }

    const out = {
      meta: {
        generatedBy: 'scripts/extract-icons.mjs',
        source: page.url,
        capturedWith: version.Browser ?? null,
        sprite: dark.spriteUrl,
        spriteBytes: sprite.bytes,
        readOnly: true,
        note: 'Icons are copied verbatim from the icon sprite the page references; nothing was clicked, typed or submitted.'
      },
      geometry: {
        railWidth: dark.rail.width,
        list: { gap: dark.list.gap, padding: dark.list.padding, margin: dark.list.margin, direction: dark.list.direction },
        button: {
          width: dark.buttons[0]?.rect.width ?? null,
          height: dark.buttons[0]?.rect.height ?? null,
          radius: dark.buttons[0]?.radius ?? null
        },
        icon: {
          width: dark.buttons[0]?.iconSize?.width ?? null,
          height: dark.buttons[0]?.iconSize?.height ?? null
        },
        colorDark: {
          default: dark.buttons.find((button) => button.selected !== true)?.color ?? null,
          selected: dark.buttons.find((button) => button.selected === true)?.color ?? null
        },
        colorLight: {
          default: light?.buttons.find((button) => button.selected !== true)?.color ?? null,
          selected: light?.buttons.find((button) => button.selected === true)?.color ?? null
        }
      },
      buttons: dark.buttons.map(({ inline, ...rest }) => rest),
      icons
    }

    mkdirSync(dirname(OUT), { recursive: true })
    writeFileSync(OUT, `${JSON.stringify(out, null, 2)}\n`, 'utf8')
    const got = Object.entries(icons).filter(([, value]) => value.default !== null).map(([key]) => key)
    const filled = Object.entries(icons).filter(([, value]) => value.selected !== null).map(([key]) => key)
    console.log(`wrote ${OUT}`)
    console.log(`icons: ${got.join(', ')}`)
    console.log(`filled/selected: ${filled.join(', ')}`)
    console.log(`geometry: button ${out.geometry.button.width}×${out.geometry.button.height} r${out.geometry.button.radius}, icon ${out.geometry.icon.width}, gap ${out.geometry.list.gap}`)
  } finally {
    conn.close()
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
