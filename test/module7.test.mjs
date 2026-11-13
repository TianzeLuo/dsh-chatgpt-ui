#!/usr/bin/env node
/**
 * Module 7 source contract: empty state, slash command menu, @ groups, global
 * search, and the close/focus/shortcut rules. These are source-level checks:
 * the interaction checks that need a live Host stay in scripts/check-module7.mjs
 * and the screenshot matrices in docs/screenshots/m7-*.png.
 *
 * Run: node test/module7.test.mjs
 */

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (path) => readFileSync(join(ROOT, path), 'utf8')
const tokens = read('lib/client/css/00-tokens.css')
const hero = read('lib/client/css/60-hero.css')
const triggerCss = read('lib/client/css/72-trigger.css')
const searchCss = read('lib/client/css/75-search.css')
const sessionJs = read('lib/client/sessions.js')
const triggerJs = read('lib/client/trigger-ui.js')
const entryJs = read('lib/client/entry.js')
const modeUi = read('lib/client/mode-ui.js')
const build = read('scripts/build-client.mjs')
const pkg = JSON.parse(read('package.json'))

let checks = 0
let failures = 0
const check = (name, condition, detail = '') => {
  checks += 1
  if (condition) return
  failures += 1
  console.log(`FAIL  ${name}${detail === '' ? '' : ` — ${detail}`}`)
}

// 1. Empty state: exact metrics, two product copies, fade and narrow contract.
check('Chat greeting is the reference copy', tokens.includes("--dsh-chatgpt-greeting-zh: '我们从哪里开始？'"))
check('Work greeting overrides Chat copy', /data-chatgpt-mode='agent'[\s\S]*content: '我们要做什么？'/.test(hero))
check('empty title is 24px', /font-size: 24px/.test(hero))
check('empty title line-height is 28.8px', /line-height: 28\.8px/.test(hero))
check('empty title weight is regular', /font-weight: var\(--cgpt-font-weight-regular\)/.test(hero))
check('empty state fade is 180ms', hero.includes('chatgpt-empty-in-chat 180ms') && hero.includes('chatgpt-empty-in-work 180ms'))
check('composer card fades on mode switch', hero.includes('chatgpt-empty-card-chat 180ms') && hero.includes('chatgpt-empty-card-work 180ms'))
check('narrow windows contract title to 21px', /@media \(max-width: 760px\)[\s\S]*font-size: 21px/.test(hero))
check('P0-16: no read-only hint line in the empty state', !modeUi.includes('聊天模式：只读问答，不改文件'))
check('P0-16: no Work hint line either', !modeUi.includes('工作模式：可执行任务，改动需确认'))

// 2. Slash menu: 240px / 16px / 36px / 14px, with no copied command data.
check('command menu is 240px wide', /data-cgpt-trigger-menu='command'\]\s*\{[\s\S]*?width: 240px !important/.test(triggerCss))
check('command menu radius is 16px', /border-radius: 16px/.test(triggerCss))
check('command row is 36px', /height: 36px/.test(triggerCss))
check('command labels are 14px', /font-size: 14px/.test(triggerCss))
check('command descriptions are hidden', /data-cgpt-trigger-menu='command'\] \[class\*='itemDescription'\]/.test(triggerCss))
check('no command names are hard-coded in trigger-ui', !/['\"](Compact|Permission|Export|Goal|Plan|Feedback)['\"]/.test(triggerJs))
check('menu tagging observes the Host portal', triggerJs.includes("querySelectorAll('[data-trigger-menu]')") && triggerJs.includes('MutationObserver'))
check('empty command state exists', triggerJs.includes('没有匹配的命令'))
check('empty mention state exists', triggerJs.includes('没有匹配的文件、项目或会话'))

// 3. @: real workspace source, three sections, native reference insertion.
check('project source reads workspaces.list', triggerJs.includes("ctx.get('workspaces')") && triggerJs.includes('workspaces?.list?.getSnapshot'))
check('project candidates are async', /async candidates\(/.test(triggerJs))
check('project group is labelled 项目', triggerJs.includes("section: '项目'"))
check('project picks insert the Host folder reference', triggerJs.includes("source: 'reference'") && triggerJs.includes("appearance: 'folder'"))
check('project source is registered into inputTriggers', triggerJs.includes('registerSource(chatgptProjectSource(ctx))'))
check('project source is mounted behind Host services', entryJs.includes("ctx.inject(['workspaces', 'inputTriggers']"))
check('reference menu fills the 760px content column', /width: min\(760px, calc\(100vw - 48px\)\) !important/.test(triggerCss) && /height: 32px/.test(triggerCss))
check('reference rows expose group headings', triggerCss.includes('sectionTitle') && triggerCss.includes('groupTitle'))

// 4. Search: floating reference geometry and real Host data sources.
check('search layer is fixed', searchCss.includes('position: fixed') && searchCss.includes('z-index: 80'))
check('search modal is 720px', searchCss.includes('width: min(720px, calc(100vw - 32px))'))
check('search modal is 460px tall', searchCss.includes('height: min(460px, calc(100vh - 120px))'))
check('search input is 16px', searchCss.includes('font-size: 16px'))
check('search groups render session/project/file rows', searchCss.includes('.chatgpt-search-group') && searchCss.includes('.chatgpt-search-row'))
check('search calls Host content search', sessionJs.includes('ctx.sessions.search(text, controller.signal)'))
check('search falls back to local titles with a notice', sessionJs.includes('宿主内容搜索暂不可用，当前显示本地标题匹配'))
check('search projects come from workspaces.list snapshot', sessionJs.includes('workspaceList?.items') && sessionJs.includes('workspaceId'))
check('search files come from workspaceFiles.list', sessionJs.includes('ctx.remote.workspaceFiles.list(authorizingSession, requestPath)'))
check('search caps file traversal', sessionJs.includes('found.length < 120'))
check('search has loading state', sessionJs.includes('chatgpt-search-skeleton'))
check('search has empty state', sessionJs.includes('没有找到匹配结果'))
check('search type tabs exist', sessionJs.includes("tab('all', '全部'") && sessionJs.includes("tab('projects', '项目'") && sessionJs.includes("tab('files', '文件'"))
check('search rows are keyboard options', sessionJs.includes("role: 'option'") && sessionJs.includes("'aria-activedescendant'"))
check('arrow keys move the search selection', sessionJs.includes("event.key === 'ArrowDown'") && sessionJs.includes("event.key === 'ArrowUp'"))
check('Enter opens the selected result', sessionJs.includes("event.key === 'Enter'") && sessionJs.includes('activate(flat[selected])'))
check('Esc closes the dialog from any control', sessionJs.includes("if (event.key !== 'Escape' || event.defaultPrevented) return"))

// 5. Shortcuts and close/focus behavior.
check('Cmd/Ctrl+K opens search', sessionJs.includes("event.key.toLowerCase() !== 'k'"))
check('search shortcut is bubble-phase and respects the Host', sessionJs.includes("document.addEventListener('keydown', onKey)") && sessionJs.includes('if (event.defaultPrevented) return'))
check('search shortcut avoids terminal input', sessionJs.includes("target.closest('[data-terminal]"))
check('closing search restores the composer', sessionJs.includes("querySelector('[data-composer-input=\"true\"]')") && sessionJs.includes('composer.focus()'))
check('outside click closes the search layer', sessionJs.includes('event.target === event.currentTarget'))
check('Escape hides the no-result trigger note', triggerJs.includes("event.key !== 'Escape'") && triggerJs.includes('suppressedRef.current = true') && triggerJs.includes('setState(null)'))
check('outside click hides the no-result trigger note', triggerJs.includes('pointerdown') && triggerJs.includes('chatgpt-trigger-empty'))

// 6. Integration wiring.
check('trigger fragment is in the bundle order', build.includes("'trigger-ui.js'"))
check('trigger fragment is syntax-checked', pkg.scripts.check.includes('lib/client/trigger-ui.js'))
check('module 7 tests are in npm test', pkg.scripts.test === 'node scripts/run-tests.mjs' && read('scripts/run-tests.mjs').includes("'module7.test.mjs'"))
check('feedback overlay is registered on shell.overlay', entryJs.includes('mountChatgptTriggerFeedback'))
check('search menu tag is plugin-scoped', triggerCss.includes("[data-cgpt-trigger-menu]"))

console.log(`module7: ${checks - failures}/${checks} checks passed`)
if (failures > 0) process.exitCode = 1
