/**
 * dsh-m18-llm — scripted LLM adapter used only by the P0-7 acceptance harness.
 *
 * The bubble-colour gate needs a deterministic send: one prompt, one short
 * answer, no tool calls and no filesystem writes, so the transcript is just
 * `user bubble → short assistant answer`. A real provider would make the frames
 * unrepeatable; the M11 adapter would mutate the workspace.
 *
 * NOT part of dsh-chatgpt-ui: `package.json` does not ship `test/`.
 */
const LLM_MODULE =
  'file://' + process.env.HOME + '/.nvm/versions/node/v24.21.0/lib/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/dsh-llm/lib/index.js'
const { LlmAdapter } = await import(LLM_MODULE)

const REPLY = '收到。这条回复只用来占位，方便对齐用户气泡的三种状态。'

class M18Adapter extends LlmAdapter {
  providerInfo(provider) {
    return { id: provider, name: 'M18 Fixture' }
  }

  async listModels(provider) {
    return [{ provider, id: 'm18-fixture', name: 'M18 Fixture' }]
  }

  async resolveModel(provider, model) {
    return {
      provider,
      id: model,
      name: 'M18 Fixture',
      context: { contextWindow: 200000 },
      defaultMaxTokens: 4096
    }
  }

  async *stream() {
    yield { type: 'block-start', index: 0, blockType: 'text' }
    yield { type: 'text-delta', index: 0, text: REPLY }
    yield { type: 'block-end', index: 0, block: { type: 'text', text: REPLY } }
    yield { type: 'usage', usage: { inputTokens: 8, outputTokens: 16 } }
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
}

export const name = 'm18-llm'
export const inject = ['llm']

export function apply(ctx) {
  ctx.llm.registerAdapter(['m18-fixture'], new M18Adapter())
}
