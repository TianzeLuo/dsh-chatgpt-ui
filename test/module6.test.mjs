#!/usr/bin/env node
/**
 * Module 6 — rail entries, sidebar cleanup, accessibility and icon gate.
 *
 * The browser rail itself is exercised against the running Web GUI in the
 * manual evidence (`docs/screenshots/m6-entry-*.png`); this suite pins the
 * source-level contract so a future refactor cannot silently swap the
 * schedules/plugins/settings destinations or put duplicate entries back in the
 * sidebar. It also checks the generated pixel measurement (`docs/icon-check.json`)
 * so the report's 0% claim stays tied to a reproducible artifact.
 *
 * Run: node test/module6.test.mjs
 */

import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { exists, read, skipSuite } from './evidence.mjs'
skipSuite(import.meta.url)

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const rail = read('lib/client/rail.js')
const sidebarCss = read('lib/client/css/20-sidebar.css')
const railCss = read('lib/client/css/21-rail.css')
const checkJson = JSON.parse(read('docs/icon-check.json'))
const capture = JSON.parse(read('docs/capture/icons.json'))

let checks = 0
let failures = 0
const check = (name, condition, detail) => {
  checks += 1
  if (condition) return
  failures += 1
  console.log(`FAIL  ${name}${detail === undefined ? '' : ` — ${detail}`}`)
}

// 1. 首页 + four destinations + bottom Settings.
{
  const block = rail.slice(rail.indexOf('const CHATGPT_RAIL_ITEMS = ['), rail.indexOf('const CHATGPT_RAIL_SETTINGS_ITEM'))
  const ids = [...block.matchAll(/id: '([a-z]+)'/g)].map((match) => match[1])
  check('首页 and four destinations in P0-10A order', ids.join(',') === 'home,schedules,plugins,more,projects', ids.join(','))
  check('settings is pinned below the spacer', rail.indexOf('chatgpt-rail-spacer') < rail.indexOf('item: CHATGPT_RAIL_SETTINGS_ITEM'))
  check('settings is not another main panel', !rail.includes('panelId: CHATGPT_SETTINGS') && rail.includes("id: 'settings', label: '设置'"))
}

// 2. Destinations must be distinct and real host registrations.
{
  check('schedules is a primary host panel button', /id: 'schedules'[^\n]*panelId: 'schedules'/.test(rail))
  check('projects opens the all-projects overview', /onProjects\s*=\s*\(\)/.test(rail) && /chatgptOpenProjectPage\(''\)/.test(rail))
  check('super-agent is not in the rail items', !/const CHATGPT_RAIL_ITEMS = \[[\s\S]*?\n\]/.test(rail) || !/const CHATGPT_RAIL_ITEMS = \[[\s\S]*?DOT_PANEL_ID[\s\S]*?\n\]/.test(rail))
  check('plugins maps to plugin-manager main panel', rail.includes("const CHATGPT_PLUGINS_PANEL_ID = 'plugins'") && /id: 'plugins'[^\n]*panelId: CHATGPT_PLUGINS_PANEL_ID/.test(rail))
  check('settings opens the host modal bridge', rail.includes('chatgptOpenSettings(bridge)') && rail.includes('data-shortcut-modal="settings"'))
  check('panel opens are guarded by chatgptSelectPanel', rail.includes('chatgptSelectPanel(ctx, panelId)'))
  check('home and panel destinations use different helpers', rail.includes('chatgptSelectPanel(ctx, null)') && rail.includes('onPanel = (panelId)'))
}

// 3. Home is the empty home, not the previously open conversation.
{
  check('home starts a product session', rail.includes('chatgptStartProductSession(ctx, { agentPreset: chatgptDefaultPreset() })'))
  check('home starts only from a started session', rail.includes('session.sessionId !== undefined && session.blank !== true'))
  check('home closes the panel first', /const onHome = \(\) => \{[\s\S]*?chatgptSelectPanel\(ctx, null\)/.test(rail))
}

// 4. More menu: all requested products, conditional super-agent, settings.
{
  const block = rail.slice(rail.indexOf('const moreItems = ['), rail.indexOf('  ]\n\n  return chatgptH'))
  check('more menu offers Chat', block.includes("id: 'chat', label: 'Chat'"))
  check('more menu offers Work', block.includes("id: 'work', label: 'Work'"))
  check('more menu offers super-agent only when registered', block.includes('panelKeys.has(DOT_PANEL_ID)') && block.includes("id: 'agent', label: 'Super-agent'"))
  check('more menu offers Settings last', block.indexOf("id: 'settings', label: '设置'") > block.indexOf("id: 'work', label: 'Work'"))
  check('more menu closes before opening settings', rail.includes('onSelect: onSettings') && rail.includes('setMoreMenu(null)'))
}

// 5. One selected entry at a time; Settings wins over a panel underneath it.
{
  check('settings modal suppresses panel highlight', rail.includes("if (item.kind === 'panel')") && rail.includes('settingsOpen !== true') && rail.includes('activePanel === item.panelId'))
  check('open menu suppresses home highlight', rail.includes("if (item.kind === 'home')") && rail.includes('activePanel === null') && rail.includes('moreMenu === null'))
  check('project overlay owns the 项目 highlight', rail.includes("if (item.kind === 'projects') return projectOpen === true"))
  check('selected state is reflected in data attribute', rail.includes("'data-cgpt-rail-state': active ? 'selected' : 'default'"))
  check('selected state uses a filled glyph', rail.includes('chatgptRailItemGlyph(item.glyph, active)') && rail.includes("'data-cgpt-rail-glyph-state'"))
  check('selected pill is the light grey token', railCss.includes("[data-cgpt-rail-state='selected']") && railCss.includes('background: var(--cgpt-rail-active-bg)'))
}

// 6. Accessibility: labels, tooltip timing/content, native keyboard buttons.
{
  check('every rail button exposes aria-label', rail.includes("'aria-label': item.label"))
  check('more button exposes menu state', rail.includes("'aria-haspopup': item.kind === 'menu' ? 'menu' : undefined") && rail.includes("'aria-expanded'"))
  check('tooltip waits 500ms on hover', rail.includes('setTimeout(() => setTip(true), delay)') && rail.includes('show(500)'))
  check('tooltip is a labelled tooltip', rail.includes("className: 'chatgpt-rail-tooltip'") && rail.includes("role: 'tooltip'"))
  check('buttons are native type=button and Enter activates', rail.includes("type: 'button'") && rail.includes('onClick: onActivate'))
}

// 7. Sidebar residues: host nav and footer Settings trigger are gone.
{
  check('host panel nav is removed', sidebarCss.includes("[data-slot='sidebar'] > div > nav") && sidebarCss.includes('display: none'))
  check('host footer settings row is removed', sidebarCss.includes("[data-slot='sidebar'] > div > div:last-child") && sidebarCss.includes('display: none'))
  check('sidebar no longer styles panel rows as visible entries', !sidebarCss.includes("[class*='_panelRow'] {\n  display: flex"))
}

// 8. Pixel gate: every glyph state generated at 4x from the real 20x20 viewBox.
{
  check('icon-check is a 4x measurement', checkJson.size === 20 && checkJson.scale === 4)
  check('icon-check threshold is 2%', checkJson.threshold === 2)
  check('icon-check covers all 14 glyphs both states', checkJson.glyphs === 28 && checkJson.results.length === 28)
  check('icon-check has no diff or missing state', checkJson.pass === 28 && checkJson.diff === 0 && checkJson.missing === 0)
  const worst = Math.max(...checkJson.results.map((entry) => entry.ratio ?? 100))
  check('worst static icon difference is <=2%', worst <= 2, String(worst))
  if (Array.isArray(checkJson.live)) {
    check('live rail measurement covers all five entries', checkJson.live.length === 5)
    const worstLive = Math.max(...checkJson.live.map((entry) => entry.ratio ?? 100))
    check('worst dpr4 live icon difference is <=2%', worstLive <= 2, String(worstLive))
    check('gear live difference is <=2%', checkJson.live.find((entry) => entry.glyph === 'settings')?.ratio <= 2)
  }
  for (const name of ['home', 'schedules', 'plugins', 'more', 'settings']) {
    const state = checkJson.results.find((entry) => entry.glyph === name && entry.variant === 'selected')
    check(`${name} selected state is measured`, state !== undefined && state.ratio <= 2)
    check(`icon-check shot exists for ${name}`, exists(`docs/screenshots/icon-check-${name}.png`))
  }
  check('gear is byte-identical to its sprite symbol', capture.icons.settings.selectedEqualsDefault === true && checkJson.results.find((entry) => entry.glyph === 'settings')?.ratio === 0)
  check('home has a distinct filled selected path', capture.icons.home.selectedEqualsDefault !== true && capture.icons.home.selected.inner !== capture.icons.home.default.inner)
}

if (failures > 0) {
  console.log(`FAIL  ${checks - failures}/${checks} Module 6 checks passed`)
  process.exit(1)
}
console.log(`PASS  ${checks}/${checks} Module 6 checks passed`)
