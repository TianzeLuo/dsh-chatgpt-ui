#!/usr/bin/env node
/**
 * Per-product model memory (Chat / Work decoupling).
 *
 * Two layers:
 *   1. `lib/shared/model-memory-core.mjs` — normalization, the per-product
 *      storage map, request construction and catalog validation, driven with a
 *      memory storage.
 *   2. The fragments and the built bundle — the write path in the model pill,
 *      the restore path on new/blank Sessions, and the headless seat that
 *      applies a product's remembered choice.
 *
 * Run: `node test/model-memory.test.mjs`
 */

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  CHATGPT_MODEL_MEMORY_KEY,
  CHATGPT_MODEL_PRODUCTS,
  chatgptModelSelectRequest,
  chatgptModelSelectionKey,
  chatgptNormalizeModelSelection,
  chatgptReadModelMemory,
  chatgptReadProductModel,
  chatgptSameModelSelection,
  chatgptSelectionOffered,
  chatgptWriteProductModel
} from '../lib/shared/model-memory-core.mjs'
import { MODE_AGENT, MODE_CHAT } from '../lib/shared/mode-core.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (path) => readFileSync(join(ROOT, path), 'utf8')

let checks = 0
let failures = 0
const check = (name, condition, detail) => {
  checks += 1
  if (condition) return
  failures += 1
  console.log(`FAIL  ${name}${detail === undefined ? '' : ` — ${detail}`}`)
}

class MemoryStorage {
  constructor() {
    this.map = new Map()
  }
  getItem(key) {
    return this.map.has(key) ? this.map.get(key) : null
  }
  setItem(key, value) {
    this.map.set(key, String(value))
  }
  removeItem(key) {
    this.map.delete(key)
  }
}

const chatPick = { provider: 'dsh-provider-qoder', model: 'dfmodel', reasoningEffort: 'max' }
const workPick = { provider: 'dsh-provider-qoder', model: 'qfmodel', reasoningEffort: 'medium' }
const choices = [
  {
    provider: 'dsh-provider-qoder',
    model: 'dfmodel',
    name: 'DeepSeek-Flash',
    efforts: [{ id: 'low' }, { id: 'high' }, { id: 'max' }]
  },
  {
    provider: 'dsh-provider-qoder',
    model: 'qfmodel',
    name: 'Qwen3.8-Flash',
    efforts: [{ id: 'low' }, { id: 'medium' }, { id: 'xhigh' }]
  },
  { provider: 'dsh-provider-qoder', model: 'plain', name: 'No effort model', efforts: [] }
]

// 1. Normalization rejects anything that is not a usable selection.
{
  check('normalize: keeps provider, model and effort', chatgptNormalizeModelSelection(chatPick)?.reasoningEffort === 'max')
  check('normalize: trims whitespace', chatgptNormalizeModelSelection({ provider: ' p ', model: ' m ' })?.provider === 'p')
  check('normalize: drops an empty effort', chatgptNormalizeModelSelection({ provider: 'p', model: 'm', reasoningEffort: '' })?.reasoningEffort === undefined)
  check('normalize: missing provider is invalid', chatgptNormalizeModelSelection({ model: 'm' }) === undefined)
  check('normalize: missing model is invalid', chatgptNormalizeModelSelection({ provider: 'p' }) === undefined)
  check('normalize: a string is invalid', chatgptNormalizeModelSelection('dfmodel') === undefined)
  check('normalize: null is invalid', chatgptNormalizeModelSelection(null) === undefined)
  check('key: effort is part of the identity', chatgptModelSelectionKey(chatPick) !== chatgptModelSelectionKey({ ...chatPick, reasoningEffort: 'low' }))
  check('key: empty selection has an empty key', chatgptModelSelectionKey(undefined) === '')
  check('same: equal selections match', chatgptSameModelSelection(chatPick, { ...chatPick }) === true)
  check('same: a different effort does not match', chatgptSameModelSelection(chatPick, { ...chatPick, reasoningEffort: 'low' }) === false)
  check('same: an absent effort is its own value', chatgptSameModelSelection({ provider: 'p', model: 'm' }, { provider: 'p', model: 'm', reasoningEffort: 'high' }) === false)
  check('products: chat and agent are the only keys', CHATGPT_MODEL_PRODUCTS.join(',') === `${MODE_CHAT},${MODE_AGENT}`)
}

// 2. The storage map keeps Chat and Work independent.
{
  const storage = new MemoryStorage()
  check('storage: key is its own entry', CHATGPT_MODEL_MEMORY_KEY === 'dsh-chatgpt-ui:model-selection-by-product')
  check('storage: empty memory reads as empty', Object.keys(chatgptReadModelMemory(storage)).length === 0)
  check('storage: missing product is undefined', chatgptReadProductModel(storage, MODE_CHAT) === undefined)
  chatgptWriteProductModel(storage, MODE_CHAT, chatPick)
  check('storage: Chat round-trips', chatgptSameModelSelection(chatgptReadProductModel(storage, MODE_CHAT), chatPick))
  check('storage: Work is still unset after a Chat pick', chatgptReadProductModel(storage, MODE_AGENT) === undefined)
  chatgptWriteProductModel(storage, MODE_AGENT, workPick)
  check('storage: Work round-trips', chatgptSameModelSelection(chatgptReadProductModel(storage, MODE_AGENT), workPick))
  check('storage: a Work pick does not rewrite Chat', chatgptSameModelSelection(chatgptReadProductModel(storage, MODE_CHAT), chatPick))
  const raw = JSON.parse(storage.getItem(CHATGPT_MODEL_MEMORY_KEY))
  check('storage: both products live in one map', raw.chat.model === 'dfmodel' && raw.agent.model === 'qfmodel')
  chatgptWriteProductModel(storage, MODE_CHAT, { ...chatPick, reasoningEffort: 'high' })
  check('storage: the latest Chat pick wins', chatgptReadProductModel(storage, MODE_CHAT).reasoningEffort === 'high')
  check('storage: Work survives a Chat update', chatgptReadProductModel(storage, MODE_AGENT).reasoningEffort === 'medium')
  chatgptWriteProductModel(storage, MODE_CHAT, null)
  check('storage: clearing Chat removes only Chat', chatgptReadProductModel(storage, MODE_CHAT) === undefined && chatgptSameModelSelection(chatgptReadProductModel(storage, MODE_AGENT), workPick))
  check('storage: unknown product refuses to write', chatgptWriteProductModel(storage, 'dot', chatPick) === undefined)
  chatgptWriteProductModel(storage, MODE_CHAT, { provider: '', model: '' })
  check('storage: an invalid selection is not stored', chatgptReadProductModel(storage, MODE_CHAT) === undefined)
}

// 3. Malformed or unavailable storage degrades to "no memory", never throws.
{
  const brokenRead = { getItem() { throw new Error('denied') } }
  const brokenWrite = { getItem: () => null, setItem() { throw new Error('denied') } }
  check('storage: a throwing getItem reads empty', Object.keys(chatgptReadModelMemory(brokenRead)).length === 0)
  check('storage: malformed JSON reads empty', Object.keys(chatgptReadModelMemory({ getItem: () => '{nope' })).length === 0)
  check('storage: an array is ignored', Object.keys(chatgptReadModelMemory({ getItem: () => '[]' })).length === 0)
  check(
    'storage: unknown/invalid product entries are dropped',
    Object.keys(chatgptReadModelMemory({ getItem: () => JSON.stringify({ chat: { provider: 'p' }, agent: { provider: 'p', model: 'm' } }) })).join(',') === 'agent'
  )
  check('storage: a throwing setItem still returns the normalized selection', chatgptSameModelSelection(chatgptWriteProductModel(brokenWrite, MODE_CHAT, chatPick), chatPick))
  check('storage: no storage at all is safe', chatgptReadProductModel(undefined, MODE_CHAT) === undefined && chatgptWriteProductModel(undefined, MODE_CHAT, chatPick) !== undefined)
}

// 4. Applying a remembered selection only travels when the catalog still has it.
{
  check('offer: exact route + effort is accepted', chatgptSelectionOffered(chatPick, choices) === true)
  check('offer: a route without an effort is accepted', chatgptSelectionOffered({ provider: 'dsh-provider-qoder', model: 'plain' }, choices) === true)
  check('offer: an effort the model no longer publishes is rejected', chatgptSelectionOffered({ ...chatPick, reasoningEffort: 'xhigh' }, choices) === false)
  check('offer: a removed model is rejected', chatgptSelectionOffered({ provider: 'dsh-provider-qoder', model: 'gone' }, choices) === false)
  check('offer: no catalog is rejected', chatgptSelectionOffered(chatPick, undefined) === false)
  check('offer: malformed selection is rejected', chatgptSelectionOffered({ provider: '', model: '' }, choices) === false)
  const request = chatgptModelSelectRequest('session-1', chatPick)
  check('request: carries the session and normalized selection', request?.sessionId === 'session-1' && request?.reasoningEffort === 'max')
  check('request: no session means no request', chatgptModelSelectRequest(undefined, chatPick) === null)
  check('request: no selection means no request', chatgptModelSelectRequest('session-1', undefined) === null)
}

// 5. The fragments write and restore the same per-product entry.
{
  const composer = read('lib/client/composer.js')
  const mode = read('lib/client/mode.js')
  const modeUi = read('lib/client/mode-ui.js')
  const sessions = read('lib/client/sessions.js')
  const project = read('lib/client/project.js')
  const build = read('scripts/build-client.mjs')
  const bundle = read('lib/client.js')

  check('write: the model pill remembers the product it changed', /const product = productOfPreset\(preset\)[\s\S]{0,700}chatgptRememberProductModel\(product, next\)/.test(composer))
  check('write: a rejected pick is rolled back', /const restore = \(\) => \{[\s\S]{0,220}chatgptRememberProductModel\(product, before \?\? null\)/.test(composer))
  check('write: a network rejection also restores', /\.catch\(\(error\) => \{[\s\S]{0,120}restore\(\)/.test(composer))
  check('read: a blank Session paints its product memory', /const remembered = blank \? chatgptStoredProductModel\(product\) : undefined/.test(composer))
  check('read: the remembered choice must still be offered', /chatgptSelectionOffered\(remembered, choices\)/.test(composer))
  check('restore: selects the product model on a blank Session', /async function chatgptApplyProductModel\(ctx, sessionId, preset\)/.test(mode))
  check(
    'restore: reads the remote namespace without requiring a new inject',
    /function chatgptRemoteSession\(ctx\)[\s\S]{0,320}ctx\.get\('remote'\)/.test(mode)
  )
  check(
    'restore: calls selectModel through that namespace',
    /remoteSession\.selectModel\(request\)/.test(mode) && !/ctx\.remote\.session\.selectModel/.test(mode)
  )
  check('restore: skips a selection that is already active', /chatgptSameModelSelection\(chatgptKnownModelSelection\(ctx, sessionId\), remembered\)/.test(mode))
  check(
    'restore: new Chat Sessions start it without blocking the open',
    /chatgptRememberChatSession\(id\)[\s\S]{0,600}void chatgptApplyProductModel\(ctx, id, agentPreset\)/.test(mode)
  )
  check('restore: the headless seat subscribes to the retained main Session', /function chatgptModelMemoryTicket\(list\)/.test(modeUi) && /useSessions\(chatgptModelMemoryTicket\)/.test(modeUi))
  check('restore: the seat is registered on the root header slot', /id: 'chatgpt-model-memory'[\s\S]{0,400}conversation\.header\.leading/.test(modeUi) || /conversation\.header\.leading[\s\S]{0,600}id: 'chatgpt-model-memory'/.test(modeUi))
  check('build: model-memory-core is inlined', build.includes("'model-memory-core.mjs'"))
  check('build: the bundle carries the shared key', bundle.includes(`'${CHATGPT_MODEL_MEMORY_KEY}'`))
  check('build: the bundle carries the write path', bundle.includes('chatgptRememberProductModel(product, next)'))
  check('build: the bundle carries the restore seat', bundle.includes('chatgpt-model-memory'))
  check('build: no old single-model storage key was introduced', !bundle.includes("localStorage.setItem('dsh-chatgpt-ui:model"))
  check('no direct model memory access outside the fragment helpers', !/localStorage\.(?:getItem|setItem)\(CHATGPT_MODEL_MEMORY_KEY/.test(composer) && !/localStorage\.(?:getItem|setItem)\(CHATGPT_MODEL_MEMORY_KEY/.test(mode))
  check('session/project fragments remain chat-aware', sessions.includes('chatgptIsChatSessionId') && project.includes('chatgptIsChatSessionId'))
}

console.log(`${failures === 0 ? 'PASS' : 'FAIL'}  model memory: ${checks - failures}/${checks} checks`)
if (failures > 0) process.exit(1)
