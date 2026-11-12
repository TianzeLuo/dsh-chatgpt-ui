/**
 * dsh-m15-llm — scripted LLM adapter for the "process area is native" gate.
 *
 * One deterministic transcript that contains the three surfaces the M15
 * regression names: a native process group with command/search/read rows, a
 * reasoning row whose expanded body must keep the Host's secondary typography,
 * and a final answer. It exists so the process/step region can be compared
 * skin-on vs skin-off without a provider, tokens, or a real workspace.
 *
 * NOT part of dsh-chatgpt-ui: `package.json` does not ship `test/`.
 */
const LLM_MODULE =
  'file://' + process.env.HOME + '/.nvm/versions/node/v24.21.0/lib/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/dsh-llm/lib/index.js'
const { LlmAdapter } = await import(LLM_MODULE)

const REASONING = [
  '先确认工作区里有哪些文件，再执行一条命令、搜索一段代码并读取结果。',
  '',
  '这一步只用于核对过程区的原生排版：图标列、标题行、展开后的正文字号与行距。'
].join('\n')

const ANSWER =
  '过程区已经跑完：执行了命令、搜索了代码、读取了文件。' +
  '这段正文位于过程组之后，用于确认「已完成」与答案之间的原生间距没有被子类规则改动。'

function block(index, blockType, text) {
  const chunk = { type: 'block-start', index, blockType }
  if (blockType === 'text') return [chunk, { type: 'text-delta', index, text }, { type: 'block-end', index, block: { type: 'text', text } }]
  return [chunk, { type: 'reasoning-delta', index, text }, { type: 'block-end', index, block: { type: 'reasoning', text } }]
}

function toolChunks(id, name, args) {
  const json = JSON.stringify(args)
  // The helper always follows a reasoning block at index 0, so the call owns
  // index 1: two blocks on the same index would be ignored as a closed block.
  return [
    { type: 'block-start', index: 1, blockType: 'tool-call' },
    { type: 'tool-call-delta', index: 1, id, name, argumentsDelta: json },
    { type: 'block-end', index: 1, block: { type: 'tool-call', id, name, arguments: json } }
  ]
}

class M15Adapter extends LlmAdapter {
  providerInfo(provider) {
    return { id: provider, name: 'M15 Fixture' }
  }

  async listModels(provider) {
    return [{ provider, id: 'm15-fixture', name: 'M15 Fixture' }]
  }

  async resolveModel(provider, model) {
    return {
      provider,
      id: model,
      name: 'M15 Fixture',
      context: { contextWindow: 200000 },
      defaultMaxTokens: 4096
    }
  }

  async *stream(options) {
    const messages = options.messages ?? []
    const toolResults = messages.filter((message) => message.role === 'tool')
    const step = toolResults.length

    if (step === 0) {
      // A reasoning block and a command in one assistant turn: the reasoning row
      // sits inside the native process group, the command row below it.
      yield* block(0, 'reasoning', REASONING)
      yield* toolChunks('m15-call-bash', 'bash', {
        command: "printf 'm15 fixture line\\n' > m15-process.txt && ls m15-process.txt",
        description: 'Write the M15 fixture file'
      })
      yield { type: 'usage', usage: { inputTokens: 10, outputTokens: 20 } }
      yield { type: 'finish', reason: { kind: 'tool-calls' } }
      return
    }

    if (step === 1) {
      yield* toolChunks('m15-call-grep', 'grep', {
        pattern: 'm15 fixture line',
        path: 'm15-process.txt'
      })
      yield { type: 'usage', usage: { inputTokens: 10, outputTokens: 20 } }
      yield { type: 'finish', reason: { kind: 'tool-calls' } }
      return
    }

    if (step === 2) {
      yield* toolChunks('m15-call-read', 'read', { file_path: 'm15-process.txt' })
      yield { type: 'usage', usage: { inputTokens: 10, outputTokens: 20 } }
      yield { type: 'finish', reason: { kind: 'tool-calls' } }
      return
    }

    yield* block(0, 'reasoning', '过程行已经完成，现在给出最终答复。')
    yield* block(1, 'text', ANSWER)
    yield { type: 'usage', usage: { inputTokens: 10, outputTokens: 12 } }
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
}

export const name = 'm15-llm'
export const inject = ['llm']

export function apply(ctx) {
  ctx.llm.registerAdapter(['m15-fixture'], new M15Adapter())
}
