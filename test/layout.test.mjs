#!/usr/bin/env node
/**
 * Layout panel access test.
 *
 * The super-agent entry used to call `ctx.layout.selectPanel(...)` from a
 * context that never declared `layout`, which threw
 * `cannot get property "layout" without inject` on click. These checks run the
 * exact helper the rail, the sidebar list and the mode switcher now share, so a
 * click path can be verified without a browser: a missing service, a throwing
 * accessor and an unregistered panel id must all return `false` (the callers
 * report a failure) and must never throw.
 *
 * Run: node test/layout.test.mjs
 */

import { readFileSync } from 'node:fs'
import { chatgptResolveLayout, chatgptSelectPanel } from '../lib/shared/layout-core.mjs'

let failures = 0
let checks = 0
const check = (name, condition, detail) => {
  checks += 1
  if (condition) return
  failures += 1
  console.log(`FAIL  ${name}${detail === undefined ? '' : ` — ${detail}`}`)
}

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

/** A context shaped like Cordis: `get(name)` without an inject requirement. */
const contextWith = (service) => ({ get: (name) => (name === 'layout' ? service : undefined) })

// 1. Resolution never throws.
{
  let threw = false
  try {
    chatgptResolveLayout(undefined)
  } catch {
    threw = true
  }
  check('a missing context resolves to undefined', threw === false && chatgptResolveLayout(undefined) === undefined)
  check('a context without layout resolves to undefined', chatgptResolveLayout(contextWith(undefined)) === undefined)
  check(
    'a context whose get() throws still resolves to undefined',
    chatgptResolveLayout({
      get() {
        throw new Error('cannot get property "layout" without inject')
      }
    }) === undefined
  )
  check(
    'the layout service is returned when present',
    chatgptResolveLayout(contextWith({ selectPanel() {} }))?.selectPanel instanceof Function
  )
}

// 2. Selecting a panel is a boolean, never a throw — this is the click path.
{
  const calls = []
  const layout = {
    hasMainPanel: (id) => id === 'agent' || id === 'plugins',
    selectPanel: (id) => calls.push(id)
  }
  const ctx = contextWith(layout)

  check('a registered panel opens', chatgptSelectPanel(ctx, 'agent') === true && calls.at(-1) === 'agent')
  check(
    'the plugin manager panel opens',
    chatgptSelectPanel(ctx, 'plugins') === true && calls.at(-1) === 'plugins'
  )
  check('returning to the conversation is allowed', chatgptSelectPanel(ctx, null) === true && calls.at(-1) === null)

  const before = calls.length
  check('an unregistered panel is refused', chatgptSelectPanel(ctx, 'nope') === false && calls.length === before)
  check('refusal carries no throw', true)

  check('no layout service means no click', chatgptSelectPanel(contextWith(undefined), 'agent') === false)
  check('a null context means no click', chatgptSelectPanel(null, 'agent') === false)
  check(
    'a host without hasMainPanel still selects',
    chatgptSelectPanel(contextWith({ selectPanel: (id) => calls.push(id) }), 'anything') === true &&
      calls.at(-1) === 'anything'
  )
  check(
    'a throwing selectPanel becomes false',
    chatgptSelectPanel(
      { get: () => ({ selectPanel() { throw new Error('layout.selectPanel: main panel "x" is not registered') } }) },
      'x'
    ) === false
  )
}

// 3. Call sites: every panel open goes through the helper, and the session list
//    declares `layout` so its context carries the service too.
{
  const rail = read('lib/client/rail.js')
  const sessions = read('lib/client/sessions.js')
  const mode = read('lib/client/mode.js')
  const entry = read('lib/client/entry.js')
  const client = read('lib/client.js')

  check('rail uses the helper', rail.includes('chatgptSelectPanel(ctx, panelId)') && !rail.includes('ctx.layout.selectPanel'))
  check('sidebar uses the helper', sessions.includes('chatgptSelectPanel(ctx, DOT_PANEL_ID)') && !sessions.includes('ctx.layout'))
  check('mode switcher uses the helper', mode.includes('chatgptSelectPanel(ctx, decision.panelId)') && !mode.includes('ctx.layout.selectPanel'))
  check('the list injects layout', entry.includes("'uiWorkspace', 'layout'"))
  check('the bundle inlines the shared helper', client.includes('function chatgptSelectPanel(ctx, panelId)'))
  check('the plugin manager panel id is the host one', rail.includes("const CHATGPT_PLUGINS_PANEL_ID = 'plugins'"))
  check(
    'plugins no longer opens the Settings modal',
    !rail.includes('chatgptOpenPluginsSettings') && !/plugins[\s\S]{0,200}chatgptOpenSettings\(bridge\)/.test(
      rail.slice(rail.indexOf("id: 'plugins'"), rail.indexOf("id: 'more'"))
    )
  )
  check(
    'settings is a bottom rail entry',
    rail.includes('CHATGPT_RAIL_SETTINGS_ITEM') &&
      rail.indexOf('chatgpt-rail-spacer') < rail.indexOf('item: CHATGPT_RAIL_SETTINGS_ITEM')
  )
}

console.log(`${failures === 0 ? 'PASS' : 'FAIL'}  ${checks - failures}/${checks} layout checks`)
if (failures > 0) process.exitCode = 1
