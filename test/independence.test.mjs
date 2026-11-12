#!/usr/bin/env node
/**
 * Independence: the skin must boot and stay useful without dsh-super-agent.
 * The only coupling is dot's main-slot key, and it is probed at runtime.
 *
 * Run: node test/independence.test.mjs
 */

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
let checks = 0
let failures = 0
const check = (name, condition, detail) => {
  checks += 1
  if (condition === true) {
    console.log(`ok ${checks} - ${name}`)
    return
  }
  failures += 1
  console.error(`not ok ${checks} - ${name}${detail === undefined ? '' : `: ${detail}`}`)
}

function jsFiles(dir) {
  const out = []
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) out.push(...jsFiles(path))
    else if (name.endsWith('.js') || name.endsWith('.mjs')) out.push(path)
  }
  return out
}

// 1. No cross-package import/require.
const crossImports = jsFiles(join(root, 'lib'))
  .map((file) => [file, readFileSync(file, 'utf8')])
  .filter(([, source]) => /(?:from\s+|require\(\s*)['"]dsh-super-agent/.test(source))
check('lib 不 import/require dsh-super-agent', crossImports.length === 0, crossImports.map(([f]) => f).join(', '))

// 2. package.json does not declare it as a dependency.
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const deps = { ...(pkg.dependencies ?? {}), ...(pkg.peerDependencies ?? {}) }
check('package.json 无 dsh-super-agent 依赖', deps['dsh-super-agent'] === undefined)

// 3. The only coupling is the panel key, and availability is probed defensively.
const client = readFileSync(join(root, 'lib', 'client.js'), 'utf8')
check('dot 面板键是唯一耦合', (client.match(/super-agent/g) ?? []).length > 0 && client.includes("const DOT_PANEL_ID = 'super-agent'"))
check('探测失败按「不可用」处理', /function chatgptDotPanelAvailable[\s\S]{0,600}catch \{[\s\S]{0,40}return false/.test(client))
check('未知面板不会调用 selectPanel', client.includes("if (decision.kind === 'panel')") && client.includes('catch (error)'))

// 4. No super-agent service/slot/config is required at apply.
check('浏览器半部 inject 模式切换所需的宿主服务', /const inject = \['slots', 'uiWorkspace', 'remote', 'remote\.agentPresets'\]/.test(client))
check('模式 UI 等宿主服务就绪后再挂', /CHATGPT_MODE_SERVICES = \['locale', 'remote', 'remote\.agentPresets', 'uiWorkspace', 'layout'\]/.test(client))

// 5. Super-agent badge lives on its side; the skin neither registers nor styles it.
check('皮肤不注册 super-agent 徽标槽', !/conversation\.input\.left[\s\S]{0,200}super-agent/.test(client))

console.log(`${failures === 0 ? 'PASS' : 'FAIL'}  ${checks - failures}/${checks} independence checks`)
process.exit(failures === 0 ? 0 : 1)
