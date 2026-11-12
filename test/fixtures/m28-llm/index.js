/**
 * dsh-m28-llm — quiet adapter with four reasoning levels for the P0-16 shots.
 *
 * The empty-state row ends in 「极高 ⌄」, which only exists for a model whose
 * catalog entry carries `reasoning.efforts`. The M27 fixture has no levels, so
 * the empty page would paint the add control and the send disc only. This
 * adapter answers with one short line '好的。' and declares the four levels the
 * reference names (低 / 中 / 高 / 极高), defaulting to the top one.
 *
 * NOT part of dsh-chatgpt-ui: `package.json` does not ship `test/`.
 */
const LLM_MODULE =
  'file:///home/user/.nvm/versions/node/v24.21.0/lib/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/dsh-llm/lib/index.js'
const { LlmAdapter } = await import(LLM_MODULE)

const REPLY = '好的。\n'

const EFFORTS = [
  { id: 'low', name: '低' },
  { id: 'medium', name: '中' },
  { id: 'high', name: '高' },
  { id: 'xhigh', name: '极高' }
]

class M28Adapter extends LlmAdapter {
  providerInfo(provider) {
    return { id: provider, name: 'M28 Fixture' }
  }

  async listModels(provider) {
    return [{ provider, id: 'm28-fixture', name: 'GPT-5.1', reasoning: { efforts: EFFORTS, defaultEffort: 'xhigh' } }]
  }

  async resolveModel(provider, model) {
    return {
      provider,
      id: model,
      name: 'GPT-5.1',
      context: { contextWindow: 200000 },
      defaultMaxTokens: 4096,
      reasoning: { efforts: EFFORTS, defaultEffort: 'xhigh' }
    }
  }

  async *stream() {
    yield { type: 'block-start', index: 0, blockType: 'text' }
    yield { type: 'text-delta', index: 0, text: REPLY }
    yield { type: 'block-end', index: 0, block: { type: 'text', text: REPLY } }
    yield { type: 'usage', usage: { inputTokens: 10, outputTokens: 3 } }
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
}

export const name = 'm28-llm'
export const inject = ['llm']

export function apply(ctx) {
  ctx.llm.registerAdapter(['m28-fixture'], new M28Adapter())
}
