/**
 * P1-e — connection recovery: pure decisions plus the source wiring that makes
 * them reachable from a click.
 *
 * The live evidence (timeline, with/without-skin matrix, before/after click
 * counts) is docs/p1e.json; this file gates the policy numbers and the two
 * wiring contracts a future edit must not drop:
 *
 *   - `entry.js` mounts the watchdog;
 *   - a mode switch checks both the HTTP result and the projection that
 *     arrives over the mux socket.
 *
 * Run: node test/m31.test.mjs
 */
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import {
  CONNECTION_ACTION_TIMEOUT_MS,
  CONNECTION_AWAY_MS,
  CONNECTION_RECONNECT_COOLDOWN_MS,
  CONNECTION_RELOAD_COOLDOWN_MS,
  presetApplied,
  shouldAutoReload,
  shouldReconnectAfterAway
} from '../lib/shared/connection-core.mjs'
import { loc, read, skipSuite } from './evidence.mjs'

skipSuite(import.meta.url)

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

test('away threshold is five minutes and only a connected generation is rebuilt', () => {
  assert.equal(CONNECTION_AWAY_MS, 5 * 60 * 1000)
  assert.equal(shouldReconnectAfterAway({ hiddenMs: CONNECTION_AWAY_MS - 1, state: 'connected' }), false)
  assert.equal(shouldReconnectAfterAway({ hiddenMs: CONNECTION_AWAY_MS, state: 'connected' }), true)
  assert.equal(shouldReconnectAfterAway({ idleMs: CONNECTION_AWAY_MS, state: 'connected' }), true)
  assert.equal(shouldReconnectAfterAway({ hiddenMs: 0, idleMs: CONNECTION_AWAY_MS - 1, state: 'connected' }), false)
})

test('a reconnect in flight or an offline browser is left to the Host', () => {
  assert.equal(shouldReconnectAfterAway({ hiddenMs: CONNECTION_AWAY_MS, state: 'connecting' }), false)
  assert.equal(shouldReconnectAfterAway({ hiddenMs: CONNECTION_AWAY_MS, state: 'disconnected' }), false)
  assert.equal(shouldReconnectAfterAway({ hiddenMs: CONNECTION_AWAY_MS, state: null }), false)
})

test('the reconnect cooldown stops a visibility event and a click from rebuilding twice', () => {
  assert.equal(CONNECTION_RECONNECT_COOLDOWN_MS, 30 * 1000)
  assert.equal(
    shouldReconnectAfterAway({ hiddenMs: CONNECTION_AWAY_MS, state: 'connected', sinceReconnectMs: CONNECTION_RECONNECT_COOLDOWN_MS - 1 }),
    false
  )
  assert.equal(
    shouldReconnectAfterAway({ hiddenMs: CONNECTION_AWAY_MS, state: 'connected', sinceReconnectMs: CONNECTION_RECONNECT_COOLDOWN_MS }),
    true
  )
})

test('the automatic reload has a ten-minute, one-shot budget', () => {
  assert.equal(CONNECTION_RELOAD_COOLDOWN_MS, 10 * 60 * 1000)
  assert.equal(shouldAutoReload({ now: 1_000_000, lastReloadAt: 0 }), true)
  assert.equal(shouldAutoReload({ now: 1_000_000, lastReloadAt: 1_000_000 - 60_000 }), false)
  assert.equal(shouldAutoReload({ now: 1_000_000, lastReloadAt: 1_000_000 - CONNECTION_RELOAD_COOLDOWN_MS }), true)
})

test('an in-place preset switch is only confirmed by the projection, not by the HTTP answer', () => {
  assert.equal(presetApplied({ agentPreset: 'chat' }, 'chat'), true)
  assert.equal(presetApplied({ agentPreset: 'standard' }, 'chat'), false)
  assert.equal(presetApplied(undefined, 'chat'), false)
})

test('the action timeout exists and is longer than a healthy host call', () => {
  assert.ok(CONNECTION_ACTION_TIMEOUT_MS >= 5000)
  assert.ok(CONNECTION_ACTION_TIMEOUT_MS <= 30000)
})

test('entry.js mounts the watchdog alongside the stylesheet', () => {
  const entry = read('lib/client/entry.js')
  assert.match(entry, /mountChatgptConnectionWatchdog\(ctx\)/)
  assert.match(entry, /dsh-chatgpt-ui: connection watchdog/)
})

test('mode switches verify result.ok and the projection that arrives over the socket', () => {
  const mode = read('lib/client/mode.js')
  assert.match(mode, /chatgptRunHostCall\(ctx, 'agentPresets\.select'/)
  assert.match(mode, /result\?\.ok === false/)
  assert.match(mode, /chatgptConfirmPresetApplied\(ctx/)
  assert.match(mode, /chatgptRunHostCall\(ctx, 'session\.create \(chat\)'/)
})

test('the bundle ships the watchdog and the shared policy', () => {
  const bundle = read('lib/client.js')
  assert.match(bundle, /function mountChatgptConnectionWatchdog/)
  assert.match(bundle, /function chatgptRunHostCall/)
  assert.match(bundle, /const CONNECTION_AWAY_MS = 5 \* 60 \* 1000/)
  assert.match(bundle, /__dshChatgptConnection/)
})

test('the evidence document exists', () => {
  assert.ok(existsSync(loc('docs/p1e.json')))
})
