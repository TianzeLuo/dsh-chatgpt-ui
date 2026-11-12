#!/usr/bin/env node
/**
 * Mode decision test (M2).
 *
 * The switcher must never guess: a blank session switches preset in place, a
 * started session asks before creating a new one, dot opens a panel, and a
 * deployment without dot's plugin hides the segment instead of throwing on an
 * unknown main-panel key. All of that is `lib/shared/mode-core.mjs`, which is
 * also inlined into the browser bundle — so this test guards the exact code that
 * runs in the page.
 *
 * Run: node test/mode.test.mjs
 */

import {
  DOT_PANEL_ID,
  MODE_AGENT,
  MODE_CHAT,
  MODE_DOT,
  brandMode,
  decideModeAction,
  isActionable,
  modeAttribute,
  modeOfPreset,
  productLabel,
  productOfPreset,
  visibleSegments
} from '../lib/shared/mode-core.mjs'

let failures = 0
let checks = 0
const check = (name, condition, detail) => {
  checks += 1
  if (condition) return
  failures += 1
  console.log(`FAIL  ${name}${detail === undefined ? '' : ` — ${detail}`}`)
}

const base = { presets: ['chat', 'standard'], agentPreset: 'standard', dotAvailable: true }

// 1. blank session: in-place switch.
{
  const decision = decideModeAction({ ...base, target: MODE_CHAT, currentPreset: 'standard', blank: true })
  check('blank session selects chat', decision.kind === 'select' && decision.preset === 'chat', JSON.stringify(decision))
  const back = decideModeAction({ ...base, target: MODE_AGENT, currentPreset: 'chat', blank: true })
  check('agent means the deployment default preset', back.kind === 'select' && back.preset === 'standard', JSON.stringify(back))
}

// 2. started session: confirmation, then a new session.
{
  const decision = decideModeAction({ ...base, target: MODE_CHAT, currentPreset: 'standard', blank: false })
  check(
    'started session asks for a new session',
    decision.kind === 'confirm-new-session' && decision.preset === 'chat' && decision.reason === 'session-not-blank',
    JSON.stringify(decision)
  )
  check('confirm-new-session is actionable only after confirmation', decideModeAction({ ...base, target: MODE_CHAT, currentPreset: 'standard', blank: false }).kind !== 'new-session')
  // The confirmed click re-enters as an explicit new-session decision.
  const confirmed = { kind: 'new-session', preset: 'chat' }
  check('confirmed new-session is actionable', isActionable(confirmed))
}

// 3. dot: a panel, never a preset.
{
  const decision = decideModeAction({ ...base, target: MODE_DOT, currentPreset: 'standard', blank: true })
  check('dot selects its panel', decision.kind === 'panel' && decision.panelId === DOT_PANEL_ID, JSON.stringify(decision))
  check('dot panel id matches the plugin key', DOT_PANEL_ID === 'super-agent')
}

// 4. dot missing: hidden, no action.
{
  const decision = decideModeAction({ ...base, dotAvailable: false, target: MODE_DOT, currentPreset: 'standard', blank: true })
  check('missing dot panel hides the segment', decision.kind === 'hidden' && isActionable(decision) === false, JSON.stringify(decision))
  check('segment list follows availability', visibleSegments({ ...base, dotAvailable: false }).dot === false)
}

// 5. chat preset missing: hidden.
{
  const decision = decideModeAction({ presets: ['standard'], agentPreset: 'standard', dotAvailable: false, target: MODE_CHAT, currentPreset: 'standard', blank: true })
  check('missing chat preset hides the segment', decision.kind === 'hidden' && decision.reason === 'chat-preset-missing', JSON.stringify(decision))
  check('chat segment hidden without the preset', visibleSegments({ presets: ['standard'] }).chat === false)
}

// 6. already in that mode: no-op, and unknown targets are ignored.
{
  check('same mode is a no-op', decideModeAction({ ...base, target: MODE_CHAT, currentPreset: 'chat', blank: true }).kind === 'noop')
  check('chat preset maps to the Chat product', productOfPreset('chat') === 'chat' && productLabel('chat') === 'Chat')
  check('agent presets map to Work', productOfPreset('standard') === 'agent' && productLabel('standard') === 'Work')
  check('missing preset defaults to Work', productOfPreset(undefined) === 'agent' && productLabel(null) === 'Work')
  check('brand config can still hide the switcher', brandMode('hidden') === 'hidden' && brandMode('whale') === 'dot')
  check('agent without a default preset is hidden', decideModeAction({ presets: ['chat'], dotAvailable: false, target: MODE_AGENT, currentPreset: 'chat', blank: true }).kind === 'hidden')
  check('agent no-op when it is already the default', decideModeAction({ ...base, target: MODE_AGENT, currentPreset: 'standard', blank: true }).kind === 'noop')
  check('null preset reads as agent', modeOfPreset(null) === MODE_AGENT && modeOfPreset(undefined) === MODE_AGENT)
  check('unknown target is hidden', decideModeAction({ ...base, target: 'nope', currentPreset: null }).kind === 'hidden')
}

// 7. the display attribute mirrors the preset only.
{
  check('attribute is chat for the chat preset', modeAttribute('chat') === 'chat')
  check('attribute is agent otherwise', modeAttribute('standard') === 'agent' && modeAttribute(null) === 'agent')
  check('agent segment always visible', visibleSegments({}).agent === true)
}

console.log(`${failures === 0 ? 'PASS' : 'FAIL'}  ${checks - failures}/${checks} mode decision checks`)
process.exit(failures === 0 ? 0 : 1)
