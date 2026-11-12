#!/usr/bin/env node
/**
 * scripts/m25b-permission-capture.mjs — P0-13b reference capture for the
 * approval / permission picker.
 *
 * STRICTLY READ-ONLY. It attaches to an already-open chatgpt.com conversation,
 * scrolls nothing, types nothing, sends nothing, and creates/deletes nothing.
 * The only input it dispatches is a click on the composer's「更改权限」chip
 * (the picker trigger) — opening the menu mutates no state — and Escape to
 * close it again. It never clicks a menu row.
 *
 * It writes:
 *   docs/capture/live/m25b-permission.json        (DOM + computed styles + glyphs)
 *   docs/capture/live/m25b-ref-permission-menu.png        (dark crop, DPR 2)
 *   docs/capture/live/m25b-ref-permission-menu-light.png  (light crop, DPR 2)
 *
 *   node scripts/m25b-permission-capture.mjs [--port 9224]
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'docs/capture/live')
mkdirSync(OUT, { recursive: true })
const PORT = process.env.DSH_CDP_PORT ?? '9224'
const BASE = `http://127.0.0.1:${PORT}`

const targets = await (await fetch(`${BASE}/json/list`)).json()
const page = targets.find((t) => t.type === 'page' && /^https:\/\/chatgpt\.com\/(local\/|$)/.test(t.url) && t.url !== 'https://chatgpt.com/')
  ?? targets.find((t) => t.type === 'page' && t.url.startsWith('https://chatgpt.com/'))
if (page === undefined) throw new Error('m25b-permission-capture: no chatgpt.com tab')
const ws = new WebSocket(page.webSocketDebuggerUrl)
await new Promise((ok, fail) => {
  ws.addEventListener('open', ok, { once: true })
  ws.addEventListener('error', () => fail(new Error('ws error')), { once: true })
})
let seq = 0
const pending = new Map()
ws.addEventListener('message', (event) => {
  const message = JSON.parse(typeof event.data === 'string' ? event.data : String(event.data))
  const waiter = message.id === undefined ? undefined : pending.get(message.id)
  if (waiter === undefined) return
  pending.delete(message.id)
  if (message.error) waiter.reject(new Error(`${waiter.method}: ${JSON.stringify(message.error)}`))
  else waiter.resolve(message.result)
})
const send = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const id = ++seq
    pending.set(id, { resolve, reject, method })
    ws.send(JSON.stringify({ id, method, params }))
    setTimeout(() => {
      if (!pending.has(id)) return
      pending.delete(id)
      reject(new Error(`${method}: timeout`))
    }, 25000)
  })
const evaluate = async (expression) => {
  const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails).slice(0, 800))
  return result.result.value
}
const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms))

const READ_DOM = String.raw`(() => {
  const norm = (v) => (v || '').replace(/\s+/g, ' ').trim()
  const box = (el) => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height } }
  const chip = (() => {
    for (const el of document.querySelectorAll('button,[role="button"]')) {
      const label = norm(el.getAttribute('aria-label'))
      if (label !== '更改权限') continue
      const r = el.getBoundingClientRect()
      if (r.width === 0) continue
      return {
        aria: label,
        rect: box(el),
        style: (() => { const cs = getComputedStyle(el); return { height: cs.height, padding: cs.padding, radius: cs.borderRadius, fontSize: cs.fontSize, color: cs.color } })(),
        svg: el.querySelector('svg')?.outerHTML ?? null,
        text: norm(el.innerText)
      }
    }
    return null
  })()
  const surfaces = []
  for (const el of document.querySelectorAll('[role="menu"]')) {
    const r = el.getBoundingClientRect()
    if (r.width === 0) continue
    const cs = getComputedStyle(el)
    const items = []
    for (const item of el.querySelectorAll('[role="menuitem"],[role="menuitemradio"]')) {
      const ir = item.getBoundingClientRect()
      const ics = getComputedStyle(item)
      const iconSlot = item.querySelector('[data-leading-icon-slot]')
      const icon = iconSlot?.querySelector('svg') ?? null
      const check = [...item.querySelectorAll('svg')].find((svg) => (svg.querySelector('use')?.getAttribute('href') ?? '').includes('checkmark')) ?? null
      items.push({
        text: norm(item.innerText),
        role: item.getAttribute('role'),
        checked: item.getAttribute('aria-checked'),
        rect: { x: ir.x, y: ir.y, width: ir.width, height: ir.height },
        style: { height: ics.height, padding: ics.padding, radius: ics.borderRadius, background: ics.backgroundColor, fontSize: ics.fontSize, fontWeight: ics.fontWeight, color: ics.color },
        icon: icon === null ? null : { html: icon.outerHTML, rect: box(icon) },
        iconSlot: iconSlot === null ? null : { rect: box(iconSlot), size: getComputedStyle(iconSlot).width },
        check: check === null ? null : { html: check.outerHTML, rect: box(check) },
        trailing: (() => {
          const spans = [...item.querySelectorAll(':scope > div > *')]
          const last = spans[spans.length - 1]
          return last === undefined ? null : { text: norm(last.innerText), rect: box(last) }
        })(),
        html: item.outerHTML
      })
    }
    surfaces.push({
      rect: { x: r.x, y: r.y, width: r.width, height: r.height },
      style: { padding: cs.padding, radius: cs.borderRadius, background: cs.backgroundColor, boxShadow: cs.boxShadow, backdropFilter: cs.backdropFilter, color: cs.color, fontSize: cs.fontSize, lineHeight: cs.lineHeight },
      items
    })
  }
  return { chip, surfaces, theme: document.documentElement.className, dpr: devicePixelRatio }
})()`

const openPicker = async () => {
  const chip = await evaluate(`(() => {
    const norm = (v) => (v || '').replace(/\\s+/g, ' ').trim()
    for (const el of document.querySelectorAll('button,[role="button"]')) {
      if (norm(el.getAttribute('aria-label')) !== '更改权限') continue
      const r = el.getBoundingClientRect()
      if (r.width === 0) continue
      return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
    }
    return null
  })()`)
  if (chip === null) throw new Error('m25b-permission-capture: 更改权限 chip not found')
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: chip.x, y: chip.y })
  await sleep(120)
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: chip.x, y: chip.y, button: 'left', clickCount: 1 })
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: chip.x, y: chip.y, button: 'left', clickCount: 1 })
  await sleep(650)
}
const closePicker = async () => {
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 })
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 })
  await sleep(350)
}
const cropShot = async (surface, path) => {
  const clip = {
    x: Math.max(0, surface.rect.x - 6),
    y: Math.max(0, surface.rect.y - 6),
    width: surface.rect.width + 12,
    height: surface.rect.height + 12,
    scale: 2
  }
  const shot = await send('Page.captureScreenshot', { format: 'png', fromSurface: true, clip })
  writeFileSync(path, Buffer.from(shot.data, 'base64'))
  return clip
}

await send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 865, deviceScaleFactor: 2, mobile: false })
await sleep(700)

const themes = {}
for (const theme of ['dark', 'light']) {
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: theme }] })
  await sleep(800)
  await openPicker()
  const dom = await evaluate(READ_DOM)
  if (dom.surfaces.length === 0) throw new Error(`m25b-permission-capture: menu did not open (${theme})`)
  const clip = await cropShot(dom.surfaces[0], join(OUT, `m25b-ref-permission-menu${theme === 'light' ? '-light' : ''}.png`))
  await closePicker()
  themes[theme] = { ...dom, clip }
  console.log(`${theme}: menu ${Math.round(dom.surfaces[0].rect.width)}x${Math.round(dom.surfaces[0].rect.height)}, ${dom.surfaces[0].items.length} rows, crop ${clip.width * clip.scale}x${clip.height * clip.scale}`)
}

await send('Emulation.setEmulatedMedia', { features: [] })
await send('Emulation.clearDeviceMetricsOverride')

const evidence = {
  generatedAt: new Date().toISOString(),
  source: `CDP ${BASE} → ${page.url} (read-only: open the 更改权限 menu, Escape; no row clicked)`,
  readOnly: { navigated: false, typed: false, sent: false, settingsChanged: false, rowClicked: false },
  themes
}
writeFileSync(join(OUT, 'm25b-permission.json'), JSON.stringify(evidence, null, 2) + '\n')
console.log('wrote docs/capture/live/m25b-permission.json')
ws.close()
