/**
 * dsh-p4b-llm — quiet adapter with three providers, 21 models and four
 * reasoning levels, for the P4-b panel captures.
 *
 * The reference's model list needs enough rows to overflow the 420px panel cap
 * (that is what makes the inner scrollbar measurable), and the simple view needs
 * a multi-level model so the effort value and slider paint. This adapter answers
 * with one short line '好的。' and declares the four levels the reference names
 * (低 / 中 / 高 / 极高), defaulting to 高.
 *
 * NOT part of dsh-chatgpt-ui: `package.json` does not ship `test/`.
 */
const LLM_MODULE =
  'file://' + process.env.HOME + '/.nvm/versions/node/v24.21.0/lib/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/dsh-llm/lib/index.js'
const { LlmAdapter } = await import(LLM_MODULE)

const REPLY = '好的。\n'

const EFFORTS = [
  { id: 'low', name: '低' },
  { id: 'medium', name: '中' },
  { id: 'high', name: '高' },
  { id: 'xhigh', name: '极高' }
]

const PROVIDERS = [
  {
    id: 'p4b-openai',
    name: 'OpenAI',
    models: [
      ['gpt-5.1', 'GPT-5.1'],
      ['gpt-5.1-mini', 'GPT-5.1 mini'],
      ['gpt-5', 'GPT-5'],
      ['gpt-5-mini', 'GPT-5 mini'],
      ['gpt-4.1', 'GPT-4.1'],
      ['gpt-4.1-mini', 'GPT-4.1 mini'],
      ['gpt-4o', 'GPT-4o'],
      ['o4', 'o4']
    ]
  },
  {
    id: 'p4b-anthropic',
    name: 'Anthropic',
    models: [
      ['claude-opus-4.1', 'Claude Opus 4.1'],
      ['claude-sonnet-4.1', 'Claude Sonnet 4.1'],
      ['claude-haiku-3.5', 'Claude Haiku 3.5'],
      ['claude-3.7-sonnet', 'Claude 3.7 Sonnet'],
      ['claude-3.5-sonnet', 'Claude 3.5 Sonnet'],
      ['claude-3-opus', 'Claude 3 Opus'],
      ['claude-3-haiku', 'Claude 3 Haiku']
    ]
  },
  {
    id: 'p4b-google',
    name: 'Google',
    models: [
      ['gemini-2.5-pro', 'Gemini 2.5 Pro'],
      ['gemini-2.5-flash', 'Gemini 2.5 Flash'],
      ['gemini-2.0-pro', 'Gemini 2.0 Pro'],
      ['gemini-2.0-flash', 'Gemini 2.0 Flash'],
      ['gemini-1.5-pro', 'Gemini 1.5 Pro'],
      ['gemini-1.5-flash', 'Gemini 1.5 Flash']
    ]
  }
]

const modelEntry = (provider, [id, name]) => ({
  provider,
  id,
  name,
  reasoning: { efforts: EFFORTS, defaultEffort: 'high' }
})

class P4bAdapter extends LlmAdapter {
  providerInfo(provider) {
    const group = PROVIDERS.find((entry) => entry.id === provider)
    return { id: provider, name: group?.name ?? provider }
  }

  async listModels(provider) {
    const group = PROVIDERS.find((entry) => entry.id === provider)
    return (group?.models ?? []).map((model) => modelEntry(provider, model))
  }

  async resolveModel(provider, model) {
    const group = PROVIDERS.find((entry) => entry.id === provider)
    const found = group?.models.find(([id]) => id === model)
    if (found === undefined) return null
    return {
      ...modelEntry(provider, found),
      context: { contextWindow: 200000 },
      defaultMaxTokens: 4096
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

export const name = 'p4b-llm'
export const inject = ['llm']

export function apply(ctx) {
  ctx.llm.registerAdapter(
    PROVIDERS.map((group) => group.id),
    new P4bAdapter()
  )
}
