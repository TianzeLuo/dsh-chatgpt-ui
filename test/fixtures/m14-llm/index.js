/**
 * dsh-m14-llm — deterministic multi-provider catalog for the P0-4 harness.
 *
 * The desktop model list groups by Host provider and the panel is measured
 * with five effort stops, so the harness needs a catalog with more than one
 * provider and a five-level reasoning model. Real providers would make the
 * screenshots depend on account state and would cost tokens; this adapter
 * advertises three providers in the Host's own shape.
 *
 * NOT part of dsh-chatgpt-ui: `package.json` does not ship `test/`.
 */
const LLM_MODULE =
  'file://' + process.env.HOME + '/.nvm/versions/node/v24.21.0/lib/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/dsh-llm/lib/index.js'
const { LlmAdapter } = await import(LLM_MODULE)

const EFFORTS = [
  { id: 'low', name: 'low' },
  { id: 'medium', name: 'medium' },
  { id: 'high', name: 'high' },
  { id: 'xhigh', name: 'xhigh' },
  { id: 'max', name: 'max' }
]

const PROVIDERS = {
  'm14-account': {
    name: 'DeepSeek 账号',
    models: [
      { id: 'account-v4-pro', name: 'DeepSeek-V4-Pro', description: '旗舰推理模型', reasoning: { efforts: EFFORTS, defaultEffort: 'high' } },
      // P0-6: a five-level model whose display name fits the reference's 126px
      // block without ellipsis (the real catalog's longer names truncate). The
      // name mirrors the model in the user's reference screenshot.
      { id: 'gpt-6.1-sol', name: 'GPT-6.1 Sol', reasoning: { efforts: EFFORTS, defaultEffort: 'high' } },
      { id: 'account-v4-lite', name: 'DeepSeek-V4-Lite', reasoning: { efforts: EFFORTS, defaultEffort: 'medium' } }
    ]
  },
  deepseek: {
    name: 'DeepSeek',
    models: [
      { id: 'deepseek-reasoner', name: 'DeepSeek-Reasoner', description: '长思考', reasoning: { efforts: EFFORTS, defaultEffort: 'xhigh' } },
      { id: 'deepseek-chat', name: 'DeepSeek-Chat' }
    ]
  },
  commandcode: {
    name: 'commandcode',
    models: [
      { id: 'commandcode-pro', name: 'CommandCode Pro', reasoning: { efforts: EFFORTS, defaultEffort: 'high' } },
      { id: 'commandcode-lite', name: 'CommandCode Lite' }
    ]
  }
}

class M14Adapter extends LlmAdapter {
  providerInfo(provider) {
    return { id: provider, name: PROVIDERS[provider]?.name ?? provider }
  }

  listModels(provider) {
    return Promise.resolve(
      (PROVIDERS[provider]?.models ?? []).map((model) => ({
        provider,
        id: model.id,
        name: model.name,
        ...model.description === undefined ? {} : { description: model.description }
      }))
    )
  }

  resolveModel(provider, model) {
    const entry = (PROVIDERS[provider]?.models ?? []).find((item) => item.id === model)
    if (entry === undefined) return Promise.resolve({ provider, id: model, name: model })
    return Promise.resolve({
      provider,
      id: entry.id,
      name: entry.name,
      ...entry.description === undefined ? {} : { description: entry.description },
      context: { contextWindow: 400000 },
      defaultMaxTokens: 8192,
      ...entry.reasoning === undefined ? {} : { reasoning: { efforts: entry.reasoning.efforts, defaultEffort: entry.reasoning.defaultEffort } }
    })
  }
}

export const name = 'm14-llm'
export const inject = ['llm']

export function apply(ctx) {
  ctx.llm.registerAdapter(Object.keys(PROVIDERS), new M14Adapter())
}
