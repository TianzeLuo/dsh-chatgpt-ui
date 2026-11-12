#!/usr/bin/env node
/**
 * tools/p1e-probe.mjs — P1-e click/connection timeline recorder.
 *
 * Opens a tokenised DSH Web URL in Chromium, dismisses the first-run API-key
 * overlay, optionally puts the page in Chat, then records a Unix-free timeline:
 * WebSocket open/close/readyState, fetch start/end/status, every click target,
 * console errors, unhandled rejections, visibility/online events, and the skin's
 * own `window.__dshChatgptConnection` ring. It finally clicks 新聊天 and the
 * mode segment and reports whether each click changed the UI.
 *
 * Scenarios:
 *   offline  CDP offline for N seconds, then online, then click (the Host's own
 *            offline/online recovery handles this one — the control case).
 *   freeze   CDP Page.setWebLifecycleState frozen for N seconds.
 *   silent   POST /cut to tools/p1e-proxy.mjs: the mux socket is left OPEN on
 *            the browser side while its upstream half dies (the P1-e bug).
 *
 * Usage:
 *   node tools/p1e-probe.mjs --url "http://127.0.0.1:3280/?token=…" \
 *     --scenario=silent --offline=120 --mode=chat \
 *     --control=http://127.0.0.1:3281 --label=plugin-silent120
 *
 * Playwright is not a package dependency: point P1E_PLAYWRIGHT at a checkout
 * that has it (same convention as tools/m27-capture.mjs).
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
const { chromium } = await import(process.env.P1E_PLAYWRIGHT ?? 'playwright')
const CHROME = process.env.HOME + '/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome'
const args = process.argv.slice(2)
const opt = Object.fromEntries(args.filter(a => a.startsWith('--')).map(a => { const s = a.slice(2); const i = s.indexOf('='); return i < 0 ? [s, true] : [s.slice(0, i), s.slice(i + 1)] }))

const url = opt.url
const label = opt.label ?? 'run'
const offlineSec = Number(opt.offline ?? 90)
const freezeSec = Number(opt.freeze ?? 0)
const scenario = opt.scenario ?? (freezeSec > 0 ? 'freeze' : 'offline')
const out = opt.out ?? `docs/capture/p1e/${label}.json`
const mode = opt.mode ?? 'agent'
const control = opt.control ?? 'http://127.0.0.1:3281'

const browser = await chromium.launch({ headless: true, executablePath: CHROME, args: ['--no-sandbox', '--disable-dev-shm-usage'] })
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
await context.addInitScript(() => {
  const p = { t0: Date.now(), marks: [], ws: [], fetches: [], clicks: [], errors: [], rejections: [], online: [], visibility: [] }
  window.__p1e = p
  const now = () => Date.now() - p.t0
  p.mark = (name, extra) => p.marks.push({ t: now(), name, ...(extra ?? {}) })
  const sessionIds = () => {
    const hostRows = [...document.querySelectorAll('[data-row-key^="session:"]')].map(r => r.getAttribute('data-row-key').slice(8))
    const pluginRows = [...document.querySelectorAll('[data-cgpt-nav^="session-"]')].map(r => r.getAttribute('data-cgpt-nav'))
    const currentPlugin = [...document.querySelectorAll('[data-cgpt-nav^="session-"][aria-current="page"]')].map(r => r.getAttribute('data-cgpt-nav'))[0]
    const currentHost = [...document.querySelectorAll('[data-row-key^="session:"].YDXeBa_selected, [data-row-key^="session:"][class*="selected"]')].map(r => r.getAttribute('data-row-key').slice(8))[0]
    return { hostRows, pluginRows, current: currentPlugin ?? currentHost ?? null }
  }
  p.snapshot = () => {
    const s = sessionIds()
    return {
      t: now(),
      online: navigator.onLine,
      visibility: document.visibilityState,
      mode: document.body.getAttribute('data-chatgpt-mode'),
      sessionIds: [...new Set([...s.hostRows, ...s.pluginRows])],
      current: s.current,
      rows: [...new Set([...s.hostRows, ...s.pluginRows])].length,
      mainText: (document.querySelector('[data-slot="main"]')?.innerText ?? '').slice(0, 120),
      ws: p.ws.map(w => ({ url: w.url, state: w.socket?.readyState ?? null, opened: w.openedAt ?? null, closed: w.closedAt ?? null, closeCode: w.closeCode ?? null })),
      pendingFetches: p.fetches.filter(f => f.end === undefined).map(f => ({ url: f.url, start: f.start, method: f.method })),
      fetchCount: p.fetches.length,
      conn: (window.__dshChatgptConnection?.events ?? []).slice(-6)
    }
  }
  p.mark('init')
  for (const type of ['online', 'offline']) window.addEventListener(type, () => { p.online.push({ t: now(), type }); p.mark(type) })
  document.addEventListener('visibilitychange', () => { p.visibility.push({ t: now(), state: document.visibilityState }); p.mark('visibility:' + document.visibilityState) })
  document.addEventListener('click', (e) => {
    const t = e.target
    p.clicks.push({ t: now(), tag: t?.tagName, cls: String(t?.className ?? '').slice(0, 80), text: (t?.innerText ?? '').trim().slice(0, 30), aria: t?.getAttribute?.('aria-label') ?? null })
  }, true)
  window.addEventListener('error', (e) => { p.errors.push({ t: now(), msg: String(e.message), src: e.filename, line: e.lineno }) })
  window.addEventListener('unhandledrejection', (e) => { p.rejections.push({ t: now(), reason: String(e.reason?.stack ?? e.reason).slice(0, 600) }) })
  const OrigWS = window.WebSocket
  window.WebSocket = new Proxy(OrigWS, {
    construct(target, argList) {
      const socket = new target(...argList)
      const rec = { url: String(argList[0]), socket, openedAt: undefined, closedAt: undefined, closeCode: undefined }
      p.ws.push(rec)
      socket.addEventListener('open', () => { rec.openedAt = now(); p.mark('ws-open', { url: rec.url }) })
      socket.addEventListener('close', (e) => { rec.closedAt = now(); rec.closeCode = e.code; p.mark('ws-close', { url: rec.url, code: e.code, reason: String(e.reason) }) })
      socket.addEventListener('error', () => { p.mark('ws-error', { url: rec.url }) })
      return socket
    }
  })
  const origFetch = window.fetch
  window.fetch = function (...a) {
    const input = a[0]
    const u = typeof input === 'string' ? input : (input?.url ?? String(input))
    const rec = { url: String(u).slice(0, 160), start: now(), method: (a[1]?.method ?? input?.method ?? 'GET'), end: undefined, status: undefined, error: undefined }
    p.fetches.push(rec)
    return origFetch.apply(this, a).then((r) => { rec.end = now(); rec.status = r.status; return r }, (e) => { rec.end = now(); rec.error = String(e).slice(0, 200); throw e })
  }
})
const page = await context.newPage()
const cdp = await context.newCDPSession(page)
const consoleLines = []
page.on('console', m => consoleLines.push({ t: Date.now(), type: m.type(), text: m.text().slice(0, 500) }))
page.on('pageerror', e => consoleLines.push({ t: Date.now(), type: 'pageerror', text: String(e.message).slice(0, 500) }))

const log = { label, url: url.replace(/([?&]token=)[^&]+/, '$1***'), scenario, seconds: scenario === 'freeze' ? freezeSec : offlineSec, steps: [] }
const snap = async (name) => { const s = await page.evaluate((n) => { window.__p1e.mark(n); return window.__p1e.snapshot() }, name); log.steps.push({ name, ...s }); return s }

const clickIf = async (locator) => { if (await locator.count()) { await locator.first().click({ timeout: 8000 }); return true } return false }

try {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForTimeout(5000)
  const closeOverlay = page.getByRole('button', { name: 'Close' }).first()
  if (await closeOverlay.count()) { await closeOverlay.click().catch(() => {}); await page.waitForTimeout(800); log.overlayDismissed = true }
  if (opt.clock) {
    await page.clock.install()
    log.clockInstalled = true
  }
  const initial = await snap('initial')
  log.initial = initial

  // Put the page in Chat so a fresh new-chat creates a new Session and the
  // mode segment has a real target to toggle to.
  if (mode === 'chat' && initial.mode !== 'chat') {
    if (await clickIf(page.locator('.chatgpt-mode-seg[aria-pressed="false"]', { hasText: '聊天' }))) {
      await page.waitForTimeout(3000)
      log.initialChat = await snap('initial-chat')
    }
  }

  await page.evaluate(() => window.__p1e.mark('away-begin'))
  if (scenario === 'offline') {
    await context.setOffline(true)
    await page.waitForTimeout(offlineSec * 1000)
  } else if (scenario === 'freeze') {
    await cdp.send('Page.setWebLifecycleState', { state: 'frozen' })
    await page.waitForTimeout(freezeSec * 1000)
    await cdp.send('Page.setWebLifecycleState', { state: 'active' })
    await page.waitForTimeout(500)
  } else if (scenario === 'silent') {
    const res = await fetch(`${control}/cut`, { method: 'POST' })
    log.cut = await res.json()
    if (opt.clock) await page.clock.fastForward(Number(opt.clock) * 1000)
    else await page.waitForTimeout(offlineSec * 1000)
  } else if (scenario === 'none') {
    await page.waitForTimeout(offlineSec * 1000)
  }
  log.awayEnd = await snap('away-end')
  if (scenario === 'offline') {
    await context.setOffline(false)
    await page.evaluate(() => window.__p1e.mark('online-restored'))
  }
  await page.waitForTimeout(Number(opt.grace ?? 1000))
  log.afterRestore = await snap('after-restore')

  const dismissOverlay = async () => {
    const close = page.getByRole('button', { name: 'Close' }).first()
    if (await close.count()) { await close.click({ timeout: 3000 }).catch(() => {}); await page.waitForTimeout(500) }
  }
  const clickAndCheck = async (kind) => {
    await dismissOverlay()
    const before = await snap(`before-${kind}`)
    let clicked = false
    if (kind === 'newchat') {
      clicked = await clickIf(page.locator('.chatgpt-new-chat')) || await clickIf(page.locator('button[aria-label="New session"]'))
    } else if (kind === 'mode') {
      const pressed = before.mode === 'chat' ? '工作' : '聊天'
      clicked = await clickIf(page.locator('.chatgpt-mode-seg', { hasText: pressed }))
    }
    await page.waitForTimeout(Number(opt.wait ?? 6000))
    const after = await snap(`after-${kind}`)
    const newIds = after.sessionIds.filter(id => !before.sessionIds.includes(id))
    const changed = kind === 'newchat'
      ? (newIds.length > 0 || after.current !== before.current || after.fetchCount > before.fetchCount)
      : (after.mode !== before.mode)
    log[kind] = { before, after, clicked, newIds, changed, fetchesAfterClick: after.fetchCount - before.fetchCount }
    return { clicked, changed, newIds }
  }
  log.newChat = await clickAndCheck('newchat')
  log.mode = await clickAndCheck('mode')
  log.final = await snap('final')
  log.page = await page.evaluate(() => ({ marks: window.__p1e.marks, clicks: window.__p1e.clicks, online: window.__p1e.online, visibility: window.__p1e.visibility, errors: window.__p1e.errors, rejections: window.__p1e.rejections, fetches: window.__p1e.fetches.map(f => ({ url: f.url, start: f.start, end: f.end, status: f.status, error: f.error })) }))
} catch (error) {
  log.failure = String(error?.stack ?? error)
} finally {
  if (log.page === undefined) {
    try { log.page = await page.evaluate(() => ({ marks: window.__p1e?.marks ?? [], conn: window.__dshChatgptConnection ?? null })) } catch {}
  }
  log.console = consoleLines
  mkdirSync(dirname(out), { recursive: true })
  writeFileSync(out, JSON.stringify(log, null, 2))
  await browser.close()
  console.log(JSON.stringify({ out, newChat: log.newChat, mode: log.mode, failure: log.failure, initial: log.initial && { mode: log.initial.mode, rows: log.initial.rows, ws: log.initial.ws }, afterRestore: log.afterRestore && { mode: log.afterRestore.mode, ws: log.afterRestore.ws } }, null, 1))
}
