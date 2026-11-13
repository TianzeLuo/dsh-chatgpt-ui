#!/usr/bin/env node
/**
 * P0-19e — ⋯ hover plate and panel anchoring.
 *
 * Two corrections, both measured live in docs/m37.json:
 *   1. the ⋯ hover plate is the sidebar's 28×28 small button and its 14px
 *      glyph is concentric (centre deviation 0/0 on both paths);
 *   2. a panel's top edge sits on its row's top edge; when it would cross the
 *      viewport's 8px bottom margin it flips to bottom-edge alignment
 *      (panel bottom = row bottom) and stays fully visible, clear of the trigger.
 *
 * Run: node test/m37.test.mjs
 */

import { existsSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chatgptMenuPlacement } from '../lib/shared/sessions-core.mjs'
import { loc, read, skipSuite } from './evidence.mjs'
skipSuite(import.meta.url)

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

const tokens = read('lib/client/css/05-cgpt-tokens.css')
const sessionsCss = read('lib/client/css/25-sessions.css')
const sessions = read('lib/client/sessions.js')
const menuIcons = read('lib/client/menu-icons.js')
const bundle = read('lib/client.js')
const doc = JSON.parse(read('docs/m37.json'))

let checks = 0
let failures = 0
const check = (name, condition, detail) => {
  checks += 1
  if (condition) return
  failures += 1
  console.log(`FAIL  ${name}${detail === undefined ? '' : ` — ${detail}`}`)
}

// ---- 1. hover plate: 28×28, same as the sidebar's other small buttons ----
{
  check('plate: the sidebar small-button token is 28×28', /--cgpt-sidebar-action-size:\s*28px;/.test(tokens))
  check('plate: the session ⋯ takes its width/height from that token', /\.chatgpt-session-more\s*\{[^}]*width:\s*var\(--cgpt-sidebar-action-size\)[^}]*height:\s*var\(--cgpt-sidebar-action-size\)/.test(sessionsCss))
  check('plate: the project actions take the same token', /\.chatgpt-project-new,\s*body\[data-chatgpt-ui\] \.chatgpt-project-more\s*\{[^}]*width:\s*var\(--cgpt-sidebar-action-size\)[^}]*height:\s*var\(--cgpt-sidebar-action-size\)/.test(sessionsCss.replace(/\n/g, ' ')))
  check('plate: both plates are centred in the 36px row via the same token', /\.chatgpt-session-more\s*\{[^}]*top:\s*calc\(\(var\(--cgpt-session-row-height\) - var\(--cgpt-sidebar-action-size\)\) \/ 2\)/.test(sessionsCss) && /\.chatgpt-project-actions\s*\{[^}]*top:\s*calc\(\(var\(--cgpt-section-height\) - var\(--cgpt-sidebar-action-size\)\) \/ 2\)/.test(sessionsCss))
  check('plate: the glyph stays 14px and is blockified for centring', /\.chatgpt-session-more svg,[\s\S]{0,320}display:\s*block;[\s\S]{0,120}width:\s*var\(--cgpt-session-action-icon\);[\s\S]{0,80}height:\s*var\(--cgpt-session-action-icon\);/.test(sessionsCss))
  check('plate: the 14px icon token is unchanged', /--cgpt-session-action-icon:\s*14px;/.test(tokens) && /--cgpt-session-action-size:\s*20px;/.test(tokens))
  check('plate: the circle keeps the measured radius', /--cgpt-session-action-radius:\s*9999px;/.test(tokens) && /\.chatgpt-session-more\s*\{[^}]*border-radius:\s*var\(--cgpt-session-action-radius\)/.test(sessionsCss))
}

// ---- 2. anchoring rule: top edge, bottom flip, unchanged horizontal ------
{
  const trigger = { x: 300, y: 200, width: 28, height: 28 }
  const row = { x: 58, y: 196, width: 272, height: 36 }
  const size = { width: 164.5, height: 180 }
  const viewport = { width: 1233, height: 850 }

  const top = chatgptMenuPlacement(trigger, size, viewport, row)
  check('anchor: default is top-edge alignment with the row', top.top === 196 && top.align === 'top' && top.flipped === false, JSON.stringify(top))
  check('anchor: the corner correction is recorded and is 0px', top.cornerCorrection === 0)
  const noRow = chatgptMenuPlacement(trigger, size, viewport)
  check('anchor: without a row the trigger rect supplies the top edge', noRow.top === 200 && noRow.align === 'top', JSON.stringify(noRow))

  const flip = chatgptMenuPlacement(trigger, size, viewport, { x: 58, y: 800, width: 272, height: 36 })
  check('anchor: no room below flips to bottom-edge alignment', flip.align === 'bottom' && flip.top === 836 - 180, JSON.stringify(flip))
  check('anchor: the bottom-flipped panel opens upward from the row bottom (bottom = row bottom)', flip.top + 180 === 836, JSON.stringify(flip))
  check('anchor: the flipped panel stays 8px right of the trigger, so it cannot cover it', flip.left === 300 + 28 + 8, JSON.stringify(flip))

  const clamped = chatgptMenuPlacement({ x: 300, y: 20, width: 28, height: 28 }, { width: 164.5, height: 900 }, viewport, { x: 58, y: 16, width: 272, height: 36 })
  check('anchor: a panel taller than the viewport is clamped inside it', clamped.align === 'clamped' && clamped.top === 8, JSON.stringify(clamped))

  const right = chatgptMenuPlacement(trigger, size, viewport, row)
  check('anchor: horizontal rule unchanged — 8px right of the trigger', right.left === 336, JSON.stringify(right))
  const tight = chatgptMenuPlacement(trigger, size, { width: 420, height: 850 }, row)
  check('anchor: horizontal flip unchanged (trigger left when the right side is full)', tight.flipped === true && tight.left === Math.round(300 - 164.5 - 8), JSON.stringify(tight))

  check('source: both sidebar ⋯ menus use the shared helper with their row', (sessions.match(/chatgptMenuPlacement\(/g) ?? []).length >= 2 && sessions.includes("closest?.('[data-cgpt-session-row]')") && sessions.includes("closest?.('[data-cgpt-project-head]')"))
  check('source: the hover card keeps its own top-aligned anchor (not the helper)', sessions.includes('left: Math.round(rect.right + 8)') && sessions.includes('top: Math.round(rect.top)'))
}

// ---- 3. the pin glyphs/evidence from P0-19c are still intact ------------
{
  check('regression: the project pin row is still two-way with the slash glyph', sessions.includes("pinned === true ? '取消置顶' : '置顶'") && sessions.includes("icon: pinned === true ? 'unpin' : 'pinOutline'"))
  check('regression: the session pin still uses the solid variant', /icon: pinned \? 'pinSolid' : 'pinOutline'/.test(sessions))
  check('regression: no 分区 row reappeared', !sessions.includes("label: '分区'") && !bundle.includes('section-action'))
  check('regression: both pin sprite states still come from the captured map', /pinOutline:\s*chatgptMenuGlyph\('pinOutline'\)/.test(sessions) && /pinSolid:\s*chatgptMenuGlyph\('pinSolid'\)/.test(sessions) && menuIcons.includes('codex-icon-pin-fill-light-16'))
}

// ---- 4. live evidence: docs/m37.json ------------------------------------
{
  const { hover, alignment } = doc
  check('evidence: every live assertion passed', doc.assertions.length >= 5 && doc.assertions.every((row) => row.ok === true), doc.assertions.filter((row) => row.ok !== true).map((row) => row.id))
  check('evidence: no page errors', doc.errors.length === 0, doc.errors)
  check('evidence: the project plate is 28×28 with a 14px icon', hover.project.plate.w === 28 && hover.project.plate.h === 28 && hover.project.icon.w === 14 && hover.project.icon.h === 14)
  check('evidence: the session plate is the same 28×28 / 14px', hover.session.plate.w === 28 && hover.session.plate.h === 28 && hover.session.icon.w === 14 && hover.session.icon.h === 14)
  check('evidence: both centre deviations are 0/0 (threshold 0.5px)', hover.project.deviation.x === 0 && hover.project.deviation.y === 0 && hover.session.deviation.x === 0 && hover.session.deviation.y === 0 && hover.threshold === 0.5, JSON.stringify({ p: hover.project.deviation, s: hover.session.deviation }))
  check('evidence: the two paths agree on plate, glyph and background', hover.project.plate.radius === hover.session.plate.radius && hover.project.plate.background === hover.session.plate.background && hover.project.icon.viewBox === hover.session.icon.viewBox && hover.project.icon.display === hover.session.icon.display)
  check('evidence: the plate comes from the shared token', hover.plateSpec.token.includes('--cgpt-sidebar-action-size: 28px') && hover.project.token === '28px')
  check('evidence: default top alignment is ≤1px on both paths', alignment.top.project.align === 'top' && alignment.top.session.align === 'top' && Math.abs(alignment.top.project.deltaTop) <= 1 && Math.abs(alignment.top.session.deltaTop) <= 1, JSON.stringify({ p: alignment.top.project.deltaTop, s: alignment.top.session.deltaTop }))
  check('evidence: the top-aligned panels really fit above the bottom margin', alignment.top.project.menu.bottom < alignment.top.project.viewH - 8 && alignment.top.session.menu.bottom < alignment.top.session.viewH - 8)
  check('evidence: near the bottom both paths flip to bottom alignment', alignment.flip.project.align === 'bottom' && alignment.flip.session.align === 'bottom' && alignment.flip.triggerViewportHeight === 440)
  check('evidence: bottom alignment is ≤1px and fully visible', Math.abs(alignment.flip.project.deltaBottom) <= 1 && Math.abs(alignment.flip.session.deltaBottom) <= 1 && alignment.flip.project.fullyVisible && alignment.flip.session.fullyVisible, JSON.stringify({ p: alignment.flip.project, s: alignment.flip.session }))
  check('evidence: the flipped panels do not cover their triggers', alignment.flip.project.triggerCovered === false && alignment.flip.session.triggerCovered === false && alignment.flip.project.menu.left >= alignment.flip.project.trigger.right && alignment.flip.session.menu.left >= alignment.flip.session.trigger.right)
  check('evidence: the rule records the 8px margin and the 0px corner correction', alignment.rule.margin === 8 && alignment.rule.cornerCorrection === 0 && alignment.threshold === 1)
  check('evidence: the flip threshold is viewport height − 8px', alignment.flipThreshold.margin === 8 && alignment.flipThreshold.allowedBottomAt440 === 432 && alignment.flipThreshold.viewportHeights.includes(440))
  check('evidence: both paths are recorded as identical', alignment.consistency.identical === true && alignment.consistency.centreDeviation.includes('0/0'))
  for (const path of doc.screenshots) {
    check(`evidence: ${path} exists`, existsSync(loc(path)) && statSync(loc(path)).size > 3000)
  }
}

console.log(`m37: ${checks - failures}/${checks} checks passed`)
process.exit(failures === 0 ? 0 : 1)
