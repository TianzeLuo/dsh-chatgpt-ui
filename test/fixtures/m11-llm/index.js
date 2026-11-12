/**
 * dsh-m11-llm — scripted LLM adapter used only by the M11 regression harness.
 *
 * The M11 acceptance needs one deterministic transcript that contains every
 * surface the regression report names: an assistant answer, a native process
 * group with tool rows, two changed files (a large one and an 80-line one) and
 * a settled turn tail ("已完成，用时 X"). A real provider would make the
 * screenshots unrepeatable and cost tokens, so the harness boots an isolated
 * `DSH_HOME` whose default model points at this adapter.
 *
 * NOT part of dsh-chatgpt-ui: `package.json` does not ship `test/`.
 */
const LLM_MODULE =
  'file:///home/user/.nvm/versions/node/v24.21.0/lib/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/dsh-llm/lib/index.js'
const { LlmAdapter } = await import(LLM_MODULE)

function textChunks(text) {
  return [
    { type: 'block-start', index: 0, blockType: 'text' },
    { type: 'text-delta', index: 0, text },
    { type: 'block-end', index: 0, block: { type: 'text', text } }
  ]
}

function toolChunks(id, name, args, index = 0) {
  const json = JSON.stringify(args)
  return [
    { type: 'block-start', index, blockType: 'tool-call' },
    { type: 'tool-call-delta', index, id, name, argumentsDelta: json },
    { type: 'block-end', index, block: { type: 'tool-call', id, name, arguments: json } }
  ]
}

/** 220 lines, some far past the 760px column so the diff needs a scroller. */
const A_LINES = []
for (let index = 1; index <= 220; index += 1) {
  if (index % 17 === 0) {
    A_LINES.push(
      `export const line${index} = await checkout.load({ cartId, customerId, locale: 'zh-CN', coupon: 'M11-REGRESSION-LONG-LINE-WITH-MANY-FIELDS' }) // ${'x'.repeat(60)}`
    )
  } else {
    A_LINES.push(`const line${index} = compute(${index}, 'checkout-step')`)
  }
}
const A_TEXT = `${A_LINES.join('\n')}\n`

const OLD_BLOCK = A_LINES.slice(40, 52).join('\n')
const NEW_BLOCK = [
  '// replaced block: eighteen lines so the unified diff shows both sides',
  'const replaced01 = true',
  'const replaced02 = true',
  'const replaced03 = true',
  'const replaced04 = true',
  'const replaced05 = true',
  'const replaced06 = true',
  'const replaced07 = true',
  'const replaced08 = true',
  'const replaced09 = true',
  'const replaced10 = true',
  'const replaced11 = true',
  'const replaced12 = true',
  'const replaced13 = true',
  'const replaced14 = true',
  'const replaced15 = true',
  'const replaced16 = true',
  'export const replaced = { ok: true }'
].join('\n')

/** 80 lines: the "+80 -0" row of the changed-files card. */
const B_TEXT = `${Array.from({ length: 80 }, (_, index) => `note ${String(index + 1).padStart(2, '0')}: 回归样本行`).join('\n')}\n`

// The acceptance capture needs a deterministic running window rather than a
// 215ms flash. This is test-fixture pacing only: the browser still renders the
// spinner from Host `SessionStatus.running`, never from a plugin timer. Keep the
// default at 0 so the ordinary M11 regression run is unchanged.
const STEP_DELAY_MS = Math.max(0, Number(process.env.DSH_M11_DELAY_MS ?? 0) || 0)
const stepPause = () => new Promise((resolve) => setTimeout(resolve, STEP_DELAY_MS))

class M11Adapter extends LlmAdapter {
  providerInfo(provider) {
    return { id: provider, name: 'M11 Fixture' }
  }

  async listModels(provider) {
    return [{ provider, id: 'm11-fixture', name: 'M11 Fixture' }]
  }

  async resolveModel(provider, model) {
    return {
      provider,
      id: model,
      name: 'M11 Fixture',
      context: { contextWindow: 200000 },
      defaultMaxTokens: 4096
    }
  }

  async *stream(options) {
    const messages = options.messages ?? []
    const toolResults = messages.filter((message) => message.role === 'tool')
    const step = toolResults.length
    if (STEP_DELAY_MS > 0) await stepPause()

    if (step === 0) {
      yield* toolChunks('m11-call-write-a', 'write', { file_path: 'm11-checkout.js', content: A_TEXT }, 0)
      yield { type: 'usage', usage: { inputTokens: 10, outputTokens: 20 } }
      yield { type: 'finish', reason: { kind: 'tool-calls' } }
      return
    }

    if (step === 1) {
      yield* toolChunks('m11-call-write-b', 'write', { file_path: 'm11-notes.md', content: B_TEXT }, 0)
      yield { type: 'usage', usage: { inputTokens: 10, outputTokens: 20 } }
      yield { type: 'finish', reason: { kind: 'tool-calls' } }
      return
    }

    if (step === 2) {
      yield* toolChunks('m11-call-edit-a', 'edit', {
        file_path: 'm11-checkout.js',
        old_string: OLD_BLOCK,
        new_string: NEW_BLOCK
      }, 0)
      yield { type: 'usage', usage: { inputTokens: 10, outputTokens: 20 } }
      yield { type: 'finish', reason: { kind: 'tool-calls' } }
      return
    }

    yield* textChunks(
      '两个文件已就位：`m11-checkout.js` 写出 220 行并替换了 12 行为 18 行，`m11-notes.md` 新增 80 行。' +
        '这段正文用来核对「已完成，用时 X」与下方内容之间的原生间距。'
    )
    yield { type: 'usage', usage: { inputTokens: 10, outputTokens: 12 } }
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
}

export const name = 'm11-llm'
export const inject = ['llm']

export function apply(ctx) {
  ctx.llm.registerAdapter(['m11-fixture'], new M11Adapter())
}
