#!/usr/bin/env node
/**
 * Preset declaration test (M2).
 *
 * The `chat` preset is a YAML row the host loader parses and its registry
 * validates; a typo there fails at boot, in a log nobody reads. This test reads
 * the same file the loader reads and checks the two things that matter:
 *
 *   1. structure — one `@deepseek-ai/dsh-agent-preset` insert row with
 *      `config.id: chat`, the order/name/description fields, and the child list
 *      the plan specifies;
 *   2. composition — the packages it names exist in the installed DSH, and none
 *      of the coding-oriented packages (shell, file writes, subagents, goals)
 *      appear anywhere in it. That absence IS the preset.
 *
 * The YAML is parsed with a small indentation reader instead of a YAML
 * dependency: the file uses no anchors, flow collections or `!!js` tags, so the
 * subset here is exact, and a rule-breaking edit fails loudly.
 *
 * Run: node test/preset.test.mjs
 */

import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const HOST = process.env.DSH_INSTALL ?? '/home/user/.nvm/versions/node/v24.21.0/lib/node_modules/@deepseek-ai/dsh'
const HOST_PACKAGES = join(HOST, 'node_modules', '@deepseek-ai')

let failures = 0
let checks = 0
const check = (name, condition, detail) => {
  checks += 1
  if (condition) return
  failures += 1
  console.log(`FAIL  ${name}${detail === undefined ? '' : ` — ${detail}`}`)
}

/** Packages that must never appear in the chat preset. */
const FORBIDDEN = [
  'dsh-tool-bash',
  'dsh-tool-pwsh',
  'dsh-tool-bash-persistent',
  'dsh-tool-pwsh-persistent',
  'dsh-tool-fs',
  'dsh-terminal',
  'dsh-tool-subagent',
  'dsh-goal',
  'dsh-plan-mode',
  'dsh-sandbox'
]

/** Packages the preset must declare. */
const REQUIRED = [
  'dsh-persona',
  'dsh-tool-ask-user',
  'dsh-tool-web',
  'dsh-compaction-basic',
  'dsh-command-compact'
]

/**
 * Read the preset row out of the YAML file.
 * @param {string} text - patch file contents.
 * @returns {{ id?: string, name?: string, description?: string, order?: string, plugins: { id?: string, name?: string }[] }} the parsed preset.
 */
function parsePreset(text) {
  const lines = text
    .split('\n')
    .map((line) => line.replace(/\s+#.*$/, '').replace(/^#.*$/, ''))
    .filter((line) => line.trim() !== '')
  const preset = { plugins: [] }
  let inPlugins = false
  let current
  let descriptionLines
  for (const [index, line] of lines.entries()) {
    if (descriptionLines !== undefined) {
      const indent = line.length - line.trimStart().length
      if (indent > 8) {
        descriptionLines.push(line.trim())
        continue
      }
      preset.description = descriptionLines.join(' ')
      descriptionLines = undefined
    }
    const indent = line.length - line.trimStart().length
    const content = line.trim()
    if (/^- insert:$/.test(content)) continue
    if (/^- id: preset-chat$/.test(content)) continue
    if (indent <= 6 && /^name: /.test(content) && preset.name === undefined) {
      preset.name = content.slice('name: '.length).trim()
      continue
    }
    if (indent === 8 && content === 'plugins:') {
      inPlugins = true
      continue
    }
    if (indent <= 8 && content !== 'plugins:' && inPlugins) inPlugins = false
    if (inPlugins && content.startsWith('- id: ')) {
      current = { id: content.slice(6).trim() }
      preset.plugins.push(current)
      continue
    }
    if (inPlugins && current !== undefined && content.startsWith('name: ')) {
      current.name = content.slice(6).trim().replace(/^['"]|['"]$/g, '')
      continue
    }
    if (indent === 8 && content.startsWith('id: ')) preset.id = content.slice(4).trim()
    if (indent === 8 && content.startsWith('order: ')) preset.order = content.slice(7).trim()
    if (indent === 8 && content.startsWith('description: ')) {
      const value = content.slice(13).trim()
      if (value === '>-' || value === '>' || value === '|' || value === '|-') descriptionLines = []
      else preset.description = value
    }
  }
  if (descriptionLines !== undefined) preset.description = descriptionLines.join(' ')
  return preset
}

const patch = readFileSync(join(ROOT, 'presets/chat.patch.yml'), 'utf8')
const preset = parsePreset(patch)

check('preset id is chat', preset.id === 'chat', preset.id)
check('preset declares an order', preset.order === '5', preset.order)
check('preset has a display name', typeof preset.name === 'string' && preset.name.length > 0)
check('preset description is bilingual', /[一-龥]/.test(preset.description ?? '') && /[A-Za-z]{4,}/.test(preset.description ?? ''), preset.description)
check('preset declares plugins', preset.plugins.length >= 4, JSON.stringify(preset.plugins))

const names = preset.plugins.map((plugin) => plugin.name).filter((name) => typeof name === 'string')
for (const required of REQUIRED) {
  check(`declares ${required}`, names.some((name) => name.endsWith(required)), names.join(', '))
}
for (const forbidden of FORBIDDEN) {
  check(`does not declare ${forbidden}`, !names.some((name) => name.includes(forbidden)))
}
check(
  'every named package is shipped by DSH',
  names.filter((name) => name.startsWith('@deepseek-ai/')).every((name) => existsSync(join(HOST_PACKAGES, name.slice('@deepseek-ai/'.length)))),
  names.join(', ')
)
check('compaction group is a cordis group', preset.plugins.some((plugin) => plugin.name === 'cordis:group'))

// Bundle wiring: the manifest must load both patch files, and the policy row
// must resolve to a real export.
const manifest = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))
const patches = manifest.dsh?.bundle?.patch
check('manifest lists the preset patch', Array.isArray(patches) && patches.includes('./presets/chat.patch.yml'), JSON.stringify(patches))
check('manifest lists the skin patch', Array.isArray(patches) && patches.includes('./cordis.patch.yml'), JSON.stringify(patches))
check('chat-policy export resolves to a file', existsSync(join(ROOT, manifest.exports['./chat-policy'].replace('./', ''))))

console.log(`${failures === 0 ? 'PASS' : 'FAIL'}  ${checks - failures}/${checks} preset declaration checks`)
process.exit(failures === 0 ? 0 : 1)
