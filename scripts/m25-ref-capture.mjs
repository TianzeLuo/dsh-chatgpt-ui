#!/usr/bin/env node
/**
 * scripts/m25-ref-capture.mjs — P0-13 reference capture: the project row's
 * folder glyphs in BOTH states, every menu icon, and the menu geometry.
 *
 * STRICTLY READ-ONLY against the live ChatGPT web app. It attaches to a tab
 * that is already open; it never navigates, never types, never sends a
 * message, never creates/renames/deletes anything and never touches a
 * setting. The only inputs it dispatches are (a) mouse *moves* for hover and
 * (b) a click on a menu *trigger* (the ⋯ button), immediately closed again
 * with Escape. Opening a menu mutates nothing.
 *
 * Every glyph is copied verbatim: the live `<svg>` outerHTML from the DOM and
 * the `<symbol>` bodies from the icon sprite the page already loaded
 * (`/cdn/assets/icons-*.svg`, a plain GET of an already-cached asset). Nothing
 * here is drawn by hand, which is the whole point of the milestone.
 *
 * Output: docs/capture/live/project-menus.json plus the reference crops
 *         docs/capture/live/m25-ref-*.png
 *
 *   node scripts/m25-ref-capture.mjs [--port 9224] [--out docs/capture/live]
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

/** The glyph families the project rows and the three menus need. */
const WANTED_SYMBOLS = [
  'codex-icon-folder-light-16',
  'codex-icon-folder-light-20',
  'codex-icon-folder-open-light-16',
  'codex-icon-pin-light-16',
  'codex-icon-pin-fill-light-16',
  'codex-icon-pin-slash-light-16',
  'codex-icon-gear-light-16',
  'codex-icon-gear-light-20',
  'codex-icon-list-bullet-light-16',
  'codex-icon-list-checkmark-circle-light-16',
  'codex-icon-list-circle-light-16',
  'codex-icon-archive-light-16',
  'codex-icon-xmark-md-light-16',
  'codex-icon-xmark-lg-light-16',
  'codex-icon-circle-xmark-light-16',
  'codex-icon-trash-light-16',
  'codex-icon-chat-bubble-light-16',
  'codex-icon-chat-bubble-light-20',
  'codex-icon-chevron-left-md-light-16',
  'codex-icon-chevron-right-md-light-16',
  'codex-icon-checkmark-md-light-16',
  'codex-icon-checkmark-lg-light-16',
  'codex-icon-hand-light-16',
  'codex-icon-hand-palm-regular-24',
  'codex-icon-shield-light-16',
  'codex-icon-shield-checkmark-light-16',
  'codex-icon-shield-exclamationmark-light-16',
  'codex-icon-lock-shield-light-20',
  'codex-icon-folder-badge-branch-light-16',
  'codex-icon-branch-light-16',
  'codex-icon-code-light-16',
  'codex-icon-star-fill-light-16',
  'codex-icon-plus-md-light-16',
  'codex-icon-ellipsis-horizontal-light-16',
  'codex-icon-desktop-light-16',
  'codex-icon-sliders-light-16',
  'codex-icon-pen-tip-light-20',
  'codex-icon-document-light-16',
  'codex-icon-page-text-light-16',
  'codex-icon-document-pdf-light-16',
  'codex-icon-photo-light-16',
  'codex-icon-spreadsheet-light-16',
  'codex-icon-lock-light-16',
  'codex-icon-magnifying-glass-lg-light-16',
  'codex-icon-share-light-16'
]

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
      }, 45000)
    })
  }
  close() {
    try {
      this.ws.close()
    } catch {}
  }
}

const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms))

/** Shared DOM reader: geometry + computed style + every svg it can find. */
const HELPERS = String.raw`
  const norm = (v) => (v || '').replace(/\s+/g, ' ').trim()
  const px = (v) => { const n = Number.parseFloat(v); return Number.isFinite(n) ? Math.round(n * 10) / 10 : null }
  const box = (el) => { const r = el.getBoundingClientRect(); return { x: px(r.x), y: px(r.y), width: px(r.width), height: px(r.height) } }
  const styleOf = (el, keys) => {
    const cs = getComputedStyle(el)
    const out = {}
    for (const key of keys) out[key] = cs[key]
    return out
  }
  const STYLE_KEYS = ['width','height','padding','paddingLeft','paddingRight','paddingTop','paddingBottom','margin','marginLeft','marginRight','gap','rowGap','columnGap','borderRadius','borderTopWidth','borderColor','boxShadow','backgroundColor','color','fontSize','fontWeight','lineHeight','fontFamily','textAlign','display','flexDirection','opacity']
  const VARS = ['--icon-leading-size','--spacing','--spacing-menu-item-content','--app-menu-gutter','--height-token-row','--shadow-dropdown-overlay','--color-border-overlay','--dropdown-overlay-ring-width','--color-danger','--color-text','--color-text-tertiary','--color-surface-elevated-secondary']
  const varsOf = (el) => {
    const cs = getComputedStyle(el)
    const out = {}
    for (const name of VARS) { const value = cs.getPropertyValue(name); if (value !== '') out[name] = value.trim() }
    return out
  }
  /**
   * The reference renders menu glyphs as CSS mask-image with the SVG inlined
   * as a data: URL. Decoding it gives the exact path data the product ships —
   * the same source of truth as the sprite, and the only way to read the
   * icons of menus the web build never opens for us.
   */
  const maskOf = (el, limit = 4) => {
    const out = []
    const nodes = [el, ...el.querySelectorAll('*')]
    for (const node of nodes) {
      const cs = getComputedStyle(node)
      const raw = cs.maskImage !== 'none' ? cs.maskImage : (cs.webkitMaskImage ?? 'none')
      if (!raw.includes('data:image/svg')) continue
      const inner = raw.replace(/^url\(["']?/, '').replace(/["']?\)$/, '')
      let decoded = inner
      try { decoded = decodeURIComponent(inner) } catch {}
      const r = node.getBoundingClientRect()
      out.push({
        rect: { x: px(r.x), y: px(r.y), width: px(r.width), height: px(r.height) },
        renderedWidth: px(cs.width),
        renderedHeight: px(cs.height),
        maskSize: cs.maskSize,
        maskRepeat: cs.maskRepeat,
        maskPosition: cs.maskPosition,
        color: cs.backgroundColor,
        svg: decoded.replace(/\s+/g, ' ').trim()
      })
      if (out.length >= limit) break
    }
    return out
  }
  const glyph = (svg) => {
    if (svg === null || svg === undefined) return null
    const use = svg.querySelector('use')
    const rect = box(svg)
    const cs = getComputedStyle(svg)
    return {
      outerHTML: svg.outerHTML.replace(/\s+/g, ' ').trim(),
      viewBox: svg.getAttribute('viewBox'),
      width: svg.getAttribute('width'),
      height: svg.getAttribute('height'),
      fill: svg.getAttribute('fill'),
      symbol: use === null ? null : (use.getAttribute('href') || '').split('#')[1] ?? null,
      spriteUrl: use === null ? null : (use.getAttribute('href') || '').split('#')[0] ?? null,
      paths: [...svg.querySelectorAll('path')].map((p) => ({ d: p.getAttribute('d'), fillRule: p.getAttribute('fill-rule'), clipRule: p.getAttribute('clip-rule'), opacity: p.getAttribute('opacity') })),
      rect,
      renderedWidth: px(cs.width),
      renderedHeight: px(cs.height),
      color: cs.color
    }
  }
  const itemOf = (el) => {
    const cs = getComputedStyle(el)
    return {
      tag: el.tagName,
      role: el.getAttribute('role'),
      text: norm(el.textContent),
      aria: norm(el.getAttribute('aria-label')),
      title: norm(el.getAttribute('title')),
      disabled: el.getAttribute('aria-disabled') === 'true' || el.disabled === true,
      checked: el.getAttribute('aria-checked'),
      rect: box(el),
      style: {
        height: px(cs.height), minHeight: px(cs.minHeight), padding: cs.padding, gap: cs.columnGap,
        borderRadius: cs.borderRadius, fontSize: cs.fontSize, fontWeight: cs.fontWeight,
        lineHeight: cs.lineHeight, color: cs.color, backgroundColor: cs.backgroundColor,
        display: cs.display, alignItems: cs.alignItems
      },
      glyphs: [...el.querySelectorAll('svg')].map(glyph),
      masks: maskOf(el),
      vars: varsOf(el),
      leadingRect: (() => { const s = el.querySelector('svg'); if (s === null) return null; const b = box(s); return { leftInset: px(b.x - el.getBoundingClientRect().x), topOffset: px(b.y - el.getBoundingClientRect().y) } })(),
      trailingRect: (() => { const list = [...el.querySelectorAll('svg')]; if (list.length === 0) return null; const b = box(list[list.length - 1]); return { rightInset: px(el.getBoundingClientRect().right - b.right), topOffset: px(b.y - el.getBoundingClientRect().y) } })(),
      labelRect: (() => { const spans = [...el.querySelectorAll('span,div')].filter((s) => norm(s.textContent) !== '' && s.querySelector('svg') === null); return spans.length === 0 ? null : box(spans[0]) })()
    }
  }
  const surfaceOf = (el) => {
    const cs = getComputedStyle(el)
    return {
      rect: box(el),
      style: {
        width: px(cs.width), height: px(cs.height), padding: cs.padding, gap: cs.rowGap,
        borderRadius: cs.borderRadius, boxShadow: cs.boxShadow, backgroundColor: cs.backgroundColor,
        borderTopWidth: cs.borderTopWidth, borderLeftWidth: cs.borderLeftWidth, borderColor: cs.borderColor,
        fontSize: cs.fontSize, lineHeight: cs.lineHeight, color: cs.color, backdropFilter: cs.backdropFilter
      },
      items: [...el.querySelectorAll('[role="menuitem"],[role="menuitemradio"],button,a')].map(itemOf),
      vars: varsOf(el),
      allMasks: maskOf(el, 40),
      separators: [...el.querySelectorAll('[role="separator"],[class*="separator"]')].map((sp) => { const line = sp.matches('[role="separator"]') ? sp : sp.firstElementChild; const lcs = line === null || line === undefined ? null : getComputedStyle(line); return { rect: box(sp), padding: getComputedStyle(sp).padding, line: line === null || line === undefined ? null : { rect: box(line), height: lcs.height, backgroundColor: lcs.backgroundColor, cls: String(line.className).slice(0, 80) } } }),
      text: norm(el.textContent).slice(0, 240)
    }
  }
`

const PROJECT_ROW_EXPR = String.raw`(() => {
  ${HELPERS}
  const row = document.querySelector('[class*="folder-row"]')
  if (row === null) return null
  const slot = row.querySelector('[role="presentation"]') ?? row.querySelector('span')
  const title = [...row.querySelectorAll('span,div')].find((s) => norm(s.textContent) !== '' && s.querySelector('svg') === null)
  const buttons = [...row.querySelectorAll('button,[role="button"]')].map((b) => ({
    aria: norm(b.getAttribute('aria-label')),
    rect: box(b),
    style: { opacity: getComputedStyle(b).opacity, width: getComputedStyle(b).width, height: getComputedStyle(b).height, padding: getComputedStyle(b).padding, borderRadius: getComputedStyle(b).borderRadius, color: getComputedStyle(b).color },
    glyph: glyph(b.querySelector('svg')),
    visible: b.getBoundingClientRect().width > 0
  }))
  const rowRect = row.getBoundingClientRect()
  return {
    selector: '[class*="folder-row"]',
    expanded: row.getAttribute('aria-expanded'),
    title: norm(title === undefined || title === null ? row.textContent : title.textContent).slice(0, 40),
    row: { rect: box(row), style: styleOf(row, ['height','minHeight','padding','paddingLeft','paddingRight','gap','borderRadius','fontSize','fontWeight','lineHeight','color','backgroundColor','display','alignItems']), vars: varsOf(row) },
    iconSlot: slot === null || slot === undefined ? null : { rect: box(slot), style: styleOf(slot, ['width','height','padding','marginLeft','marginRight','display','alignItems','justifyContent','opacity']) },
    folderGlyph: glyph(row.querySelector('svg')),
    allGlyphs: [...row.querySelectorAll('svg')].map(glyph),
    titleRect: title === undefined || title === null ? null : box(title),
    titleStyle: title === undefined || title === null ? null : styleOf(title, ['fontSize','fontWeight','lineHeight','color','marginLeft','paddingLeft']),
    actions: buttons,
    rightActionGap: (() => {
      const visible = buttons.filter((b) => b.visible && b.rect.width > 0).sort((a, b) => a.rect.x - b.rect.x)
      if (visible.length < 2) return null
      const last = visible[visible.length - 1]
      const prev = visible[visible.length - 2]
      return { gap: px(last.rect.x - (prev.rect.x + prev.rect.width)), rightInset: px(rowRect.right - (last.rect.x + last.rect.width)) }
    })()
  }
})()`

const SPRITE_EXPR = String.raw`(async (wanted) => {
  const probe = document.querySelector('use')
  const url = probe === null ? null : (probe.getAttribute('href') || '').split('#')[0]
  if (url === null) return { error: 'no sprite reference on the page' }
  const response = await fetch(url)
  const text = await response.text()
  const doc = new DOMParser().parseFromString(text, 'image/svg+xml')
  const symbols = {}
  for (const id of wanted) {
    const node = doc.querySelector('symbol#' + id.replace(/([^\w-])/g, '\\$1'))
    if (node === null) { symbols[id] = null; continue }
    symbols[id] = {
      viewBox: node.getAttribute('viewBox'),
      fill: node.getAttribute('fill'),
      inner: node.innerHTML.replace(/\s+/g, ' ').trim(),
      paths: [...node.querySelectorAll('path')].map((p) => ({ d: p.getAttribute('d'), fillRule: p.getAttribute('fill-rule'), clipRule: p.getAttribute('clip-rule') }))
    }
  }
  return { spriteUrl: url, status: response.status, bytes: text.length, totalSymbols: doc.querySelectorAll('symbol').length, symbols }
})(__WANTED__)`

const TOKENS_EXPR = String.raw`(() => {
  const cs = getComputedStyle(document.documentElement)
  const wanted = ['--color-text','--color-text-tertiary','--color-text-danger','--color-text-warning','--color-orange',
    '--color-surface-elevated-secondary','--color-border','--color-border-overlay','--shadow-dropdown-overlay',
    '--dropdown-overlay-ring-width','--app-menu-gutter','--icon-leading-size','--spacing-menu-item-content',
    '--app-menu-separator-inset','--app-menu-separator-gutter','--padding-row-x','--padding-row-y','--height-token-row',
    '--spacing','--color-secondary-ghost-hover','--color-secondary-ghost-active']
  const out = {}
  for (const name of wanted) { const value = cs.getPropertyValue(name).trim(); if (value !== '') out[name] = value }
  return out
})()`

/** The sidebar row's own resting/hover colours, read from the live node. */
const ROW_STATE_EXPR = String.raw`(() => {
  const row = document.querySelector('[class*="folder-row"]')
  if (row === null) return null
  const cs = getComputedStyle(row)
  const title = [...row.querySelectorAll('span,div')].find((s) => (s.textContent || '').trim() !== '' && s.querySelector('svg') === null)
  const tcs = title === undefined ? null : getComputedStyle(title)
  const slot = row.querySelector('[role="presentation"]')
  const scs = slot === null ? null : getComputedStyle(slot)
  const svg = row.querySelector('svg')
  return {
    background: cs.backgroundColor, color: cs.color, height: cs.height, radius: cs.borderRadius,
    fontSize: cs.fontSize, lineHeight: cs.lineHeight, fontWeight: cs.fontWeight,
    paddingLeft: cs.paddingLeft, paddingRight: cs.paddingRight, marginLeft: cs.marginLeft,
    titleColor: tcs === null ? null : tcs.color, titleSize: tcs === null ? null : tcs.fontSize,
    slotWidth: scs === null ? null : scs.width, slotHeight: scs === null ? null : scs.height,
    glyphColor: svg === null ? null : getComputedStyle(svg).color
  }
})()`

/** Find a visible menu surface (Radix portal) and describe it. */
const MENU_EXPR = String.raw`(() => {
  ${HELPERS}
  const candidates = [...document.querySelectorAll('[role="menu"],[role="dialog"],[data-radix-popper-content-wrapper] > *,[class*="MenuContent"],[class*="PopoverContent"],[class*="HoverCardContent"]')]
    .filter((el) => { const r = el.getBoundingClientRect(); return r.width > 40 && r.height > 20 })
  const seen = new Set()
  const surfaces = []
  for (const el of candidates) {
    const inner = el.getAttribute('role') === 'menu' || el.getAttribute('role') === 'dialog' ? el : el.querySelector('[role="menu"],[role="dialog"]') ?? el
    const key = inner.className?.toString?.().slice(0, 60) + '|' + norm(inner.textContent).slice(0, 40)
    if (seen.has(key)) continue
    seen.add(key)
    const described = surfaceOf(inner)
    described.selector = String(inner.className || '').slice(0, 120)
    described.outerRect = box(el === inner ? inner : el)
    surfaces.push(described)
  }
  return surfaces
})()`

/** Locate a control by a regex over its aria-label / text, read-only. */
const locate = (pattern, scopeText) => String.raw`(() => {
  const norm = (v) => (v || '').replace(/\s+/g, ' ').trim()
  const re = ${pattern}
  const scope = document
  const els = [...scope.querySelectorAll('button,[role="button"],a')]
  const hit = els.find((el) => re.test(norm(el.getAttribute('aria-label'))) || re.test(norm(el.textContent)))
  if (hit === undefined || hit === null) return null
  const r = hit.getBoundingClientRect()
  return { aria: norm(hit.getAttribute('aria-label')), text: norm(hit.textContent).slice(0, 30), scope: ${JSON.stringify(scopeText ?? '')},
    x: r.x + r.width / 2, y: r.y + r.height / 2, rect: { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) } }
})()`

const main = async () => {
  const version = await (await fetch(`${BASE}/json/version`)).json()
  const conn = await Conn.open(version.webSocketDebuggerUrl)
  const report = {
    meta: {
      source: 'live ChatGPT web app over CDP (read-only)',
      cdp: `${HOST}:${PORT}`,
      capturedAt: new Date().toISOString(),
      unit: 'css-px',
      readOnly: {
        navigated: false,
        typed: false,
        sent: false,
        clicked: 'menu triggers only (⋯), closed with Escape immediately',
        settingsChanged: false
      }
    },
    page: null,
    projectRow: null,
    menus: {},
    notCapturedFromWeb: [],
    sprite: null
  }
  try {
    const { targetInfos } = await conn.send('Target.getTargets')
    const candidates = targetInfos.filter((entry) => entry.type === 'page' && /chatgpt\.com/.test(entry.url))
    if (candidates.length === 0) throw new Error('no chatgpt.com page on the CDP browser')
    // Prefer the tab that actually renders the project sidebar; never navigate.
    let sessionId = null
    let rowFound = null
    for (const entry of candidates) {
      const attached = await conn.send('Target.attachToTarget', { targetId: entry.targetId, flatten: true })
      await conn.send('Runtime.enable', {}, attached.sessionId)
      await conn.send('Page.enable', {}, attached.sessionId)
      const row = await evaluate(conn, attached.sessionId, PROJECT_ROW_EXPR)
      if (row !== null) {
        sessionId = attached.sessionId
        rowFound = row
        break
      }
    }
    if (sessionId === null) throw new Error('no chatgpt.com tab currently renders a project row ([class*="folder-row"])')
    report.page = await evaluate(conn, sessionId, '({ url: location.href, title: document.title, dpr: window.devicePixelRatio, viewport: { width: window.innerWidth, height: window.innerHeight }, theme: document.documentElement.className, dark: matchMedia("(prefers-color-scheme: dark)").matches })')

    // 1. the project row (folder glyph in its current, expanded state)
    report.projectRow = rowFound

    // 2. the sprite: verbatim symbol bodies for every glyph the menus need
    report.sprite = await evaluate(conn, sessionId, SPRITE_EXPR.replace('__WANTED__', JSON.stringify(WANTED_SYMBOLS)), true)

    // 2b. the CLOSED folder glyph, read from live DOM nodes that render it
    //     without touching the project's expansion state (the composer's
    //     project chip and the rail's 项目 entry both use folder-light-*).
    report.closedFolderEvidence = await evaluate(conn, sessionId, String.raw`(() => {
      ${HELPERS}
      const picks = []
      const chip = [...document.querySelectorAll('button')].find((b) => /更改项目/.test(norm(b.getAttribute('aria-label'))))
      if (chip !== undefined) picks.push({ where: 'composer project chip [aria-label^=更改项目]', glyph: glyph(chip.querySelector('svg')), rect: box(chip) })
      const rail = [...document.querySelectorAll('button')].find((b) => norm(b.textContent) === '项目' && /rail/i.test(String(b.closest('[data-app-navigation-rail]')?.className ?? 'rail')))
      if (rail !== undefined) picks.push({ where: 'rail 项目 entry', glyph: glyph(rail.querySelector('svg')), rect: box(rail) })
      const uses = [...document.querySelectorAll('use')]
        .filter((u) => /folder/.test(u.getAttribute('href') || ''))
        .map((u) => { const svg = u.closest('svg'); const host = svg?.closest('button,[role="button"],[role="presentation"]') ?? svg
          return { symbol: (u.getAttribute('href') || '').split('#')[1], hostAria: norm(host?.getAttribute('aria-label')), hostText: norm(host?.textContent).slice(0, 24), glyph: glyph(svg) } })
      return { picks, folderUses: uses }
    })()`)

    /**
     * Hover (and only hover) the row when its trigger only exists on hover,
     * re-read the trigger position (the row re-lays-out on hover), click it,
     * dump every open surface, crop it, and close it again with Escape.
     */
    const openMenu = async (triggerPattern, key, cropName, { hoverRow = false } = {}) => {
      if (hoverRow === true) {
        const rowPoint = await evaluate(conn, sessionId, String.raw`(() => { const r = document.querySelector('[class*="folder-row"]')?.getBoundingClientRect(); return r === undefined ? null : { x: r.x + 120, y: r.y + r.height / 2 } })()`)
        if (rowPoint !== null) {
          await conn.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: rowPoint.x, y: rowPoint.y }, sessionId)
          await sleep(500)
        }
      }
      const trigger = await evaluate(conn, sessionId, locate(triggerPattern))
      if (trigger === null) {
        report.notCapturedFromWeb.push({ menu: key, reason: 'the trigger is not on screen', alternative: 'official sprite symbols + the web menu surface tokens measured in this file' })
        return null
      }
      await conn.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: trigger.x, y: trigger.y }, sessionId)
      await sleep(150)
      const settled = (await evaluate(conn, sessionId, locate(triggerPattern))) ?? trigger
      await conn.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: settled.x, y: settled.y, button: 'left', clickCount: 1 }, sessionId)
      await conn.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: settled.x, y: settled.y, button: 'left', clickCount: 1 }, sessionId)
      await sleep(900)
      let surfaces = await evaluate(conn, sessionId, MENU_EXPR)
      // Hover the first row so the reference's own hover colour is measured
      // rather than guessed. Hovering changes nothing in the product.
      const first = surfaces?.[0]?.items?.[0]
      if (first !== undefined && first.rect !== undefined) {
        await conn.send('Input.dispatchMouseEvent', {
          type: 'mouseMoved',
          x: first.rect.x + first.rect.width / 2,
          y: first.rect.y + first.rect.height / 2
        }, sessionId)
        await sleep(400)
        surfaces = await evaluate(conn, sessionId, MENU_EXPR)
      }
      report.menus[key] = surfaces
      await crop(conn, sessionId, cropName, surfaces?.[0]?.rect)
      await pressEscape(conn, sessionId)
      await sleep(300)
      return surfaces
    }

    // 3. the project ⋯ menu (web has three entries; the desktop has six)
    await openMenu('/项目操作/', 'projectMoreWeb', 'm25-ref-project-more-menu.png', { hoverRow: true })

    // 4. a session row menu (⋯ on a chat) — the same surface tokens
    await openMenu('/(会话操作|聊天操作|更多操作|More options)/', 'sessionRowWeb', 'm25-ref-session-menu.png')

    // 5. the projects-section header menu (⋯ next to the 项目 heading)
    await openMenu('/项目侧边栏选项/', 'projectsHeaderWeb', 'm25-ref-projects-header-menu.png')

    // 6. hover card: does the web app show one at all?
    const rowPoint = await evaluate(conn, sessionId, String.raw`(() => { const r = document.querySelector('[class*="folder-row"]')?.getBoundingClientRect(); return r === undefined ? null : { x: r.x + 120, y: r.y + r.height / 2 } })()`)
    if (rowPoint !== null) {
      await conn.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 400, y: 400 }, sessionId)
      await sleep(200)
      for (const dx of [-6, -3, 0]) {
        await conn.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: rowPoint.x + dx, y: rowPoint.y }, sessionId)
        await sleep(120)
      }
      await sleep(2200)
      const hovered = await evaluate(conn, sessionId, MENU_EXPR)
      report.menus.projectHoverCardWeb = hovered
      const card = (hovered ?? []).find((surface) => /次聊天|chats|Chat/i.test(surface.text))
      if (card === undefined) {
        report.notCapturedFromWeb.push({
          menu: 'projectHoverCard',
          reason: 'the web build does not open a project hover card on hover (2.2s dwell, staged mouse moves); the desktop app does',
          alternative: 'icons from the official sprite (codex-icon-folder-open-light-16 / codex-icon-pin-light-16 / codex-icon-chat-bubble-light-16 / codex-icon-folder-badge-branch-light-16 / codex-icon-gear-light-16), geometry from the web menu surfaces measured in this file'
        })
      } else {
        await crop(conn, sessionId, 'm25-ref-project-hover-card.png', card.rect)
      }
      await pressEscape(conn, sessionId)
    }

    // 7. permission menu: present on the web at all?
    const permission = await evaluate(conn, sessionId, String.raw`(() => {
      const norm = (v) => (v || '').replace(/\s+/g, ' ').trim()
      const els = [...document.querySelectorAll('button,[role="button"]')]
      const hit = els.find((el) => /批准|权限|完全访问|Approval|permission|Access/i.test(norm(el.getAttribute('aria-label')) + ' ' + norm(el.textContent)))
      if (hit === undefined) return null
      const r = hit.getBoundingClientRect()
      return { aria: norm(hit.getAttribute('aria-label')), text: norm(hit.textContent).slice(0, 40), x: r.x + r.width / 2, y: r.y + r.height / 2 }
    })()`)
    if (permission === null) {
      report.notCapturedFromWeb.push({
        menu: 'permission',
        reason: 'the web build exposes no approval/permission selector in the composer for this account',
        alternative: 'icons from the official sprite (codex-icon-hand-light-16 / codex-icon-shield-checkmark-light-16 / codex-icon-shield-exclamationmark-light-16 / codex-icon-checkmark-md-light-16), geometry from the web menu surfaces measured in this file'
      })
    } else {
      await conn.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: permission.x, y: permission.y, button: 'left', clickCount: 1 }, sessionId)
      await conn.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: permission.x, y: permission.y, button: 'left', clickCount: 1 }, sessionId)
      await sleep(900)
      report.menus.permissionWeb = await evaluate(conn, sessionId, MENU_EXPR)
      await pressEscape(conn, sessionId)
    }

    // 8. light-theme colours for the same surface (emulated, restored after)
    await conn.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'light' }] }, sessionId)
    await sleep(900)
    report.menus.projectMoreWebLight = await openMenu('/项目操作/', 'projectMoreWebLight', 'm25-ref-project-more-menu-light.png', { hoverRow: true })
    report.projectRowLight = await evaluate(conn, sessionId, PROJECT_ROW_EXPR)
    await conn.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'dark' }] }, sessionId)
    await sleep(600)

    // 8b. the product's own colour tokens for the surfaces we restyle.
    report.tokens = {
      dark: await evaluate(conn, sessionId, TOKENS_EXPR),
      rowDark: await evaluate(conn, sessionId, ROW_STATE_EXPR)
    }
    await conn.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'light' }] }, sessionId)
    await sleep(700)
    report.tokens.light = await evaluate(conn, sessionId, TOKENS_EXPR)
    report.tokens.rowLight = await evaluate(conn, sessionId, ROW_STATE_EXPR)
    await conn.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'dark' }] }, sessionId)
    await sleep(500)

    // 9. the sidebar region crop (project rows, folder glyphs in place)
    const rowBox = report.projectRow.row.rect
    await crop(conn, sessionId, 'm25-ref-sidebar-projects.png', {
      x: Math.max(0, rowBox.x - 20),
      y: Math.max(0, rowBox.y - 60),
      width: 340,
      height: 260
    })
  } finally {
    writeFileSync(resolve(OUT, 'project-menus.json'), JSON.stringify(report, null, 2) + '\n')
    console.log(`m25-ref-capture: wrote ${resolve(OUT, 'project-menus.json')}`)
    console.log(`  project row: ${report.projectRow?.folderGlyph?.symbol ?? 'n/a'} / expanded=${report.projectRow?.expanded ?? 'n/a'}`)
    console.log(`  sprite: ${report.sprite?.bytes ?? 0} bytes, ${Object.keys(report.sprite?.symbols ?? {}).filter((k) => report.sprite.symbols[k] !== null).length}/${WANTED_SYMBOLS.length} wanted symbols`)
    console.log(`  menus: ${Object.entries(report.menus).map(([k, v]) => `${k}=${Array.isArray(v) ? v.length : 0}`).join(' ')}`)
    console.log(`  not captured from web: ${report.notCapturedFromWeb.map((e) => e.menu).join(', ') || 'none'}`)
    conn.close()
  }

  async function evaluate(c, s, expression, awaitPromise = false) {
    const result = await c.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise }, s)
    if (result.exceptionDetails !== undefined) throw new Error(result.exceptionDetails.exception?.description ?? 'page script failed')
    return result.result.value
  }
  async function pressEscape(c, s) {
    await c.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }, s)
    await c.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }, s)
  }
  async function crop(c, s, name, rect) {
    if (rect === undefined || rect === null) return
    const clip = {
      x: Math.max(0, rect.x - 6),
      y: Math.max(0, rect.y - 6),
      width: Math.min(1200, rect.width + 12),
      height: Math.min(1200, rect.height + 12),
      scale: 2
    }
    const shot = await c.send('Page.captureScreenshot', { format: 'png', clip }, s)
    writeFileSync(resolve(OUT, name), Buffer.from(shot.data, 'base64'))
    console.log(`  crop ${name} ${Math.round(clip.width)}x${Math.round(clip.height)}`)
  }
}

await main()
