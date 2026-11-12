/**
 * dsh-m27-llm — paced streaming adapter for the P0-15 font-stability check.
 *
 * The P0-15 bug only exists while the answer is still streaming, so the M27
 * harness needs a reply that stays `running` for several seconds and grows one
 * character at a time. A real provider is not repeatable (and would cost
 * tokens), so the isolated M27 profile points its default model at this
 * adapter. Each text-delta is paced by `DSH_M27_CHUNK_MS` (default 80ms).
 *
 * NOT part of dsh-chatgpt-ui: `package.json` does not ship `test/`.
 */
const LLM_MODULE =
  'file:///home/user/.nvm/versions/node/v24.21.0/lib/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/dsh-llm/lib/index.js'
const { LlmAdapter } = await import(LLM_MODULE)

const CHUNK_MS = Math.max(0, Number(process.env.DSH_M27_CHUNK_MS ?? 100) || 0)
const CHUNK_SIZE = Math.max(1, Number(process.env.DSH_M27_CHUNK_SIZE ?? 6) || 6)

const MARKDOWN = [
  '## 流式字号检查',
  '',
  '这是一个用于验证流式输出期间字号不变的样例回复。正文使用与完成态相同的字体、字号与行高，`行内代码`也不应改变基线。',
  '',
  '- 第一项：正文与列表共用同一套排版',
  '- 第二项：包含一段较长的中文说明，用来让这一行折行，从而检查行高是否在流式期间发生跳变，以及折行后的字符位置是否保持一致。',
  '- 第三项：**加粗内容**与普通内容并排。',
  '',
  '第二段正文继续补充内容，确保回复足够长，让流式窗口覆盖正文、列表和代码块三种排版。这里再写一些中文，使段落自然折行，并保持与完成态相同的字号和行高。',
  '',
  '第三段正文：字号、行高和字符基线在 running 与完成两种状态下必须完全一致，不能依赖过渡动画掩盖。',
  '',
  '```js',
  'const fontSize = computedStyle.fontSize',
  'const lineHeight = computedStyle.lineHeight',
  'console.log({ fontSize, lineHeight })',
  '```',
  '',
  '- 续列表一：代码块之后的列表仍使用正文排版',
  '- 续列表二：行内 `code` 不改变基线，也不改变字号',
  '',
  '结尾段落：以上内容全部由脚本逐块写入，页面在生成过程中持续处于 running 状态；结束时不应出现任何字号或行高的突变。',
  '',
  '最后一段补充：如果修复正确，流式中抓取的 font-size、line-height 与字符高度应与完成后逐项相等，页面只用更多内容换来更高的文本块。',
  ''
].join('\n')

function chunks(text, size) {
  const parts = []
  for (let index = 0; index < text.length; index += size) parts.push(text.slice(index, index + size))
  return parts
}

const pause = () => new Promise((resolve) => setTimeout(resolve, CHUNK_MS))

class M27Adapter extends LlmAdapter {
  providerInfo(provider) {
    return { id: provider, name: 'M27 Fixture' }
  }

  async listModels(provider) {
    return [{ provider, id: 'm27-fixture', name: 'M27 Fixture' }]
  }

  async resolveModel(provider, model) {
    return {
      provider,
      id: model,
      name: 'M27 Fixture',
      context: { contextWindow: 200000 },
      defaultMaxTokens: 4096
    }
  }

  async *stream() {
    yield { type: 'block-start', index: 0, blockType: 'text' }
    let written = ''
    for (const chunk of chunks(MARKDOWN, CHUNK_SIZE)) {
      if (CHUNK_MS > 0) await pause()
      written += chunk
      yield { type: 'text-delta', index: 0, text: chunk }
    }
    yield { type: 'block-end', index: 0, block: { type: 'text', text: written } }
    yield { type: 'usage', usage: { inputTokens: 10, outputTokens: 80 } }
    yield { type: 'finish', reason: { kind: 'stop' } }
  }
}

export const name = 'm27-llm'
export const inject = ['llm']

export function apply(ctx) {
  ctx.llm.registerAdapter(['m27-fixture'], new M27Adapter())
}
