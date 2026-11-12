#!/usr/bin/env node
/**
 * Chat-policy test (M2).
 *
 * The policy is the only thing that actually makes a Chat session read-only, so
 * it is tested against a fake host: three behaviours (enter, restore, leave
 * alone), the record it persists, and the fact that it never touches a non-Chat
 * session. The fake records every knob write instead of appending session events,
 * which is exactly what `lib/host/chat-policy.js` maps them onto.
 *
 * Run: node test/chat-policy.test.mjs
 */

import {
  CHAT_SANDBOX_MODE,
  READ_ONLY_PRESET_NAME,
  createChatPolicy,
  enforcementSteps,
  permissionState,
  restoreSteps
} from '../lib/host/chat-policy-core.js'

let failures = 0
let checks = 0
const check = (name, condition, detail) => {
  checks += 1
  if (condition) return
  failures += 1
  console.log(`FAIL  ${name}${detail === undefined ? '' : ` — ${detail}`}`)
}

/**
 * Build a fake host around one session.
 * @param {{ preset?: string, knobs: object, records?: object }} input - initial state.
 * @returns {object} the fake plus the policy.
 */
function fakeHost({ knobs, records = {} }) {
  const session = { id: 's1' }
  const writes = []
  let state = { ...knobs }
  const stored = { ...records }
  const agent = { id: 'a1', session, ctx: { id: 'ctx-a1' }, presetId: 'chat' }
  const policy = createChatPolicy({
    isChat: (candidate) => candidate.presetId === 'chat',
    readPermission: () => ({ ...state }),
    applyPreset: (target, name) => {
      writes.push(['preset', name])
      state = { ...state, preset: name }
    },
    applySandbox: (target, mode) => {
      writes.push(['sandbox', mode])
      state = { ...state, mode }
    },
    applyApproval: (target, approval) => {
      writes.push(['approval', approval])
      state = { ...state, policy: approval }
    },
    permissionPresetNames: () => ['read-only', 'workspace-write', 'danger-full-access'],
    loadRecords: () => stored,
    saveRecords: async (next) => {
      for (const key of Object.keys(stored)) delete stored[key]
      Object.assign(stored, next)
    },
    attach: () => () => writes.push(['detach'])
  })
  return { agent, policy, writes, stored, state: () => state }
}

// 1. Entering Chat pins all three knobs and stores what was there before.
{
  const host = fakeHost({ knobs: { mode: 'workspace-write', policy: 'ask', preset: 'workspace-write' } })
  await host.policy.reconcile(host.agent)
  check(
    'chat pins preset, sandbox and approval',
    JSON.stringify(host.writes.map((write) => write[0])) === JSON.stringify(['preset', 'sandbox', 'approval']),
    JSON.stringify(host.writes)
  )
  check('preset becomes read-only', host.state().preset === READ_ONLY_PRESET_NAME, host.state().preset)
  check('sandbox becomes read-only', host.state().mode === CHAT_SANDBOX_MODE, host.state().mode)
  check('approval stops prompting', host.state().policy === 'never', host.state().policy)
  check('the pre-switch knobs are recorded', JSON.stringify(host.stored.a1) === JSON.stringify({ mode: 'workspace-write', policy: 'ask', preset: 'workspace-write' }), JSON.stringify(host.stored))
}

// 2. Re-reconciling a Chat session is idempotent.
{
  const host = fakeHost({ knobs: { mode: 'workspace-write', policy: 'ask', preset: 'workspace-write' } })
  await host.policy.reconcile(host.agent)
  const first = host.writes.length
  await host.policy.reconcile(host.agent)
  check('second pass writes nothing', host.writes.length === first, `${host.writes.length} vs ${first}`)
}

// 3. Leaving Chat (only possible while blank) restores the record once.
{
  const host = fakeHost({ knobs: { mode: 'workspace-write', policy: 'ask', preset: 'workspace-write' } })
  await host.policy.reconcile(host.agent)
  host.agent.presetId = 'standard'
  await host.policy.reconcile(host.agent)
  check('restores the recorded sandbox', host.state().mode === 'workspace-write', host.state().mode)
  check('restores the recorded approval', host.state().policy === 'ask', host.state().policy)
  check('restores the recorded preset', host.state().preset === 'workspace-write', host.state().preset)
  check('drops the record after restoring', host.stored.a1 === undefined, JSON.stringify(host.stored))
  check('detaches the extra surfaces', host.writes.some((write) => write[0] === 'detach'))
}

// 4. A non-Chat session is never touched.
{
  const host = fakeHost({ knobs: { mode: 'workspace-write', policy: 'ask', preset: 'standard' } })
  host.agent.presetId = 'standard'
  await host.policy.reconcile(host.agent)
  check('non-chat sessions keep every knob', host.writes.length === 0, JSON.stringify(host.writes))
  check('non-chat sessions record nothing', Object.keys(host.stored).length === 0, JSON.stringify(host.stored))
}

// 5. A record surviving a restart is applied to a session that is not Chat now.
{
  const host = fakeHost({
    knobs: { mode: 'read-only', policy: 'never', preset: 'read-only' },
    records: { a1: { mode: 'danger-full-access', policy: 'ask', preset: 'danger-full-access' } }
  })
  host.agent.presetId = 'standard'
  await host.policy.reconcile(host.agent)
  check('boot restores a lingering record', host.state().mode === 'danger-full-access', host.state().mode)
  check('boot clears a lingering record', host.stored.a1 === undefined)
}

// 6. Pure helpers stay honest.
{
  check('enforcementSteps reports drift', JSON.stringify(enforcementSteps(permissionState({ mode: 'workspace-write', policy: 'ask', preset: null }))) === JSON.stringify(['preset', 'sandbox', 'approval']))
  check('enforcementSteps is empty when pinned', enforcementSteps({ mode: 'read-only', policy: 'never', preset: 'read-only' }).length === 0)
  check('restoreSteps keeps a matching knob', restoreSteps({ mode: 'read-only', policy: 'never', preset: 'read-only' }, { mode: 'read-only', policy: 'never', preset: 'read-only' }).mode === null)
  check('permissionState fills defaults', JSON.stringify(permissionState({})) === JSON.stringify({ mode: 'read-only', policy: 'ask', preset: null }))
}

console.log(`${failures === 0 ? 'PASS' : 'FAIL'}  ${checks - failures}/${checks} chat policy checks`)
process.exit(failures === 0 ? 0 : 1)
