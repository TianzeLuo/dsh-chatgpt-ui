/**
 * dsh-m19-llm — deterministic four-level catalog for the P0-8 slider harness.
 *
 * The P0-8 reference panel shows four evenly spread stops (低 / 中 / 高 / 最高)
 * and the plugin renders one tick per catalog level, so the harness needs a
 * four-level model. Real providers would make the shots depend on account
 * state and cost tokens; this adapter advertises one provider in the Host's
 * own shape.
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
  { id: 'max', name: 'max' }
]

const PROVIDERS = {
  'm19-account': {
    name: 'DeepSeek 账号',
    models: [
      { id: 'gpt-5.1', name: 'GPT-5.1', reasoning: { efforts: EFFORTS, defaultEffort: 'medium' } }
    ]
  }
}

class M19Adapter extends LlmAdapter {
  providerInfo(provider) {
    return { id: provider, name: PROVIDERS[provider]?.name ?? provider }
  }

  listModels(provider) {
    return Promise.resolve(
      (PROVIDERS[provider]?.models ?? []).map((model) => ({
        provider,
        id: model.id,
        name: model.name
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
      context: { contextWindow: 400000 },
      defaultMaxTokens: 8192,
      reasoning: { efforts: entry.reasoning.efforts, defaultEffort: entry.reasoning.defaultEffort }
    })
  }
}

export const name = 'm19-llm'
export const inject = ['llm']

export function apply(ctx) {
  ctx.llm.registerAdapter(Object.keys(PROVIDERS), new M19Adapter())
}
