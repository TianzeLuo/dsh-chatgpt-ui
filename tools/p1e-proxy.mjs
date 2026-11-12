#!/usr/bin/env node
/**
 * tools/p1e-proxy.mjs — P1-e silent-socket-loss harness.
 *
 * The Host's mux WebSocket can die without a browser-visible `close`: the
 * socket stays `readyState === 1`, the Host still reports `connected`, and only
 * the socket-delivered projections stop. `Network.emulateNetworkConditions`
 * cannot reproduce that (it fires offline/online, which the Host already
 * handles), so this proxy models the missing event instead:
 *
 *   browser ──:3280──▶ proxy ──:3095──▶ dsh web
 *
 *   POST :3281/cut  keeps every browser-side socket OPEN but destroys its
 *                   upstream half. The browser never sees a close; the Host's
 *                   own 2s heartbeat pings the proxy and gives up server-side.
 *                   New connections still work, exactly like "the network came
 *                   back but the old connection is gone".
 *
 * Usage:
 *   P1E_PROXY_PORT=3280 P1E_TARGET_PORT=3095 P1E_CONTROL_PORT=3281 \
 *     node tools/p1e-proxy.mjs
 *
 * Evidence: docs/p1e.json; the matching browser side is tools/p1e-probe.mjs.
 */
import net from 'node:net'
import http from 'node:http'

const LISTEN = Number(process.env.P1E_PROXY_PORT ?? 3280)
const TARGET = Number(process.env.P1E_TARGET_PORT ?? 3095)
const CONTROL = Number(process.env.P1E_CONTROL_PORT ?? 3281)
const pairs = new Set()
let cutCount = 0

const server = net.createServer((client) => {
  const upstream = net.connect(TARGET, '127.0.0.1')
  const pair = { client, upstream, dead: false, bytesUp: 0, bytesDown: 0 }
  pairs.add(pair)
  const cleanup = () => { pairs.delete(pair) }
  client.on('data', (chunk) => { pair.bytesUp += chunk.length; if (!pair.dead && upstream.writable) upstream.write(chunk) })
  upstream.on('data', (chunk) => { pair.bytesDown += chunk.length; if (!pair.dead && client.writable) client.write(chunk) })
  client.on('end', () => { if (!pair.dead) upstream.end() })
  client.on('close', () => { cleanup(); if (!pair.dead) upstream.destroy() })
  client.on('error', () => { if (!pair.dead) upstream.destroy(); cleanup() })
  upstream.on('end', () => { if (!pair.dead) client.end() })
  upstream.on('close', () => { cleanup(); if (!pair.dead) client.destroy() })
  upstream.on('error', () => { if (!pair.dead) client.destroy(); cleanup() })
})

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x')
  if (url.pathname === '/cut') {
    let n = 0
    for (const pair of pairs) {
      pair.dead = true
      cutCount += 1
      n += 1
      try { pair.upstream.destroy() } catch {}
      // client socket intentionally left OPEN: the browser must keep thinking
      // the WebSocket is healthy, which is exactly the silent-loss failure.
    }
    res.end(JSON.stringify({ ok: true, cut: n, pairs: pairs.size }))
    return
  }
  if (url.pathname === '/status') {
    res.end(JSON.stringify({ pairs: [...pairs].map(p => ({ dead: p.dead, bytesUp: p.bytesUp, bytesDown: p.bytesDown })) }))
    return
  }
  res.statusCode = 404
  res.end('no')
}).listen(CONTROL, '127.0.0.1', () => console.log(`control ${CONTROL}, proxy ${LISTEN} -> ${TARGET}`))

server.listen(LISTEN, '127.0.0.1', () => console.log(`proxy ${LISTEN} -> ${TARGET}`))
