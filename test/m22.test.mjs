#!/usr/bin/env node
/**
 * P0-10B — splitter follow-through, one composer column, the removed project
 * chip, and the permission selector.
 *
 * Source checks pin the contract the live evidence proves:
 *   - the sidebar list follows the Host track (no fixed 288px column);
 *   - the Work/Chat card reads `--dsh-chat-content-width`, the same variable the
 *     transcript column and the Host width handles use;
 *   - the started-session project chip is gone from JSX and CSS;
 *   - the permission chip is its own `conversation.input.left` seat, right of the
 *     attachment control, and switches through the Host `/permission` command.
 *
 * It also validates docs/m22.json and every screenshot it names.
 *
 * Run: node test/m22.test.mjs
 */

import { existsSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loc, read, skipSuite } from './evidence.mjs'
skipSuite(import.meta.url)

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const sessionsCss = read('lib/client/css/25-sessions.css')
const workCss = read('lib/client/css/65-work-card.css')
const composerCss = read('lib/client/css/40-composer.css')
const projectCss = read('lib/client/css/35-project.css')
const composer = read('lib/client/composer.js')
const locales = read('lib/client/locales.js')
const doc = JSON.parse(read('docs/m22.json'))

let checks = 0
let failures = 0
const check = (name, condition, detail) => {
  checks += 1
  if (condition) return
  failures += 1
  console.log(`FAIL  ${name}${detail === undefined ? '' : ` — ${detail}`}`)
}

// 1. Sidebar: the list follows the Host track.
check('sidebar list follows the track instead of a fixed width', /\.chatgpt-sessions \{[\s\S]*?width: calc\(100% - 8px\);/.test(sessionsCss) && !/\.chatgpt-sessions \{[\s\S]*?width: 288px;/.test(sessionsCss))
check('sidebar keeps the 8px scrollbar gutter in the scrollport', /\.chatgpt-session-scroll \{[\s\S]*?padding: 0 8px 8px 0;/.test(sessionsCss))

// 2. One reading column for the transcript and the input card.
check('Work card is the Host reading column', /width: 100%;[\s\S]*?max-width: var\(--dsh-chat-content-width, var\(--cgpt-msg-max, 920px\)\);/.test(workCss.slice(workCss.indexOf("[data-composer-card='true']"))))
check('Work card no longer folds at 768px', !workCss.includes('width: min(768px, 100%)') && !workCss.includes('max-width: 768px'))
check('Chat card is the same column, without the +32px gutter', /max-width: var\(--dsh-chat-content-width, var\(--cgpt-msg-max, 920px\)\);/.test(composerCss) && !composerCss.includes('max-width: calc(var(--dsh-chat-content-width, var(--cgpt-msg-max, 920px)) + 32px)'))
check('permission chip is styled for both modes', /\.chatgpt-permission \{/.test(composerCss) && /\.chatgpt-permission-menu \{/.test(composerCss))

// 3. The project-name chip is gone.
check('composer renders no project chip', !composer.includes('chatgpt-work-project-readonly') && !composer.includes('data-cgpt-project-readonly'))
check('project chip CSS is gone', !projectCss.includes('chatgpt-work-project-readonly'))

// 4. Permission selector.
check('permission control is its own input.left seat', /name: 'conversation\.input\.left',[\s\S]{0,120}id: 'chatgpt-permission',[\s\S]{0,80}order: 30/.test(composer))
check('permission caption comes from the Host catalog', composer.includes('chatgptApprovalLabel(permissions?.currentValue, options)'))
check('permission menu lists the Host catalog', composer.includes("chatgptApprovalOptions(snapshot.value)"))
check('permission switch uses the Host command', composer.includes('live.command(`/permission ${value}`)'))
check('permission chip exposes its value for evidence', composer.includes("'data-cgpt-permission-value': permissions?.currentValue ?? ''"))
check('Chat explains the read-only pin instead of faking a switch', composer.includes("t('work.permission.chatLocked')"))
check('permission copy exists in both locales', /'work\.permission':\s*'Permissions'/.test(locales) && /'work\.permission':\s*'权限'/.test(locales))

// 5. Live evidence.
check('evidence was generated', typeof doc.generatedAt === 'string' && doc.meta.checks >= 25)
check('every evidence assertion passed', doc.meta.fail === 0 && doc.assertions.every((row) => row.pass === true))
check('sidebar moved at least 40px', doc.sidebar.delta >= 40, String(doc.sidebar.delta))
check('scrollbar followed the splitter', Math.abs(doc.sidebar.scrollbarDelta - doc.sidebar.delta) < 1)
check('sidebar rows reflowed with the track', Math.abs(doc.sidebar.rowDelta - doc.sidebar.delta) < 1)
check('Host does not persist the sidebar width (recorded)', doc.sidebar.hostPersistence.persisted === false && doc.sidebar.hostPersistence.key === null)
check('conversation column changed at least 40px', doc.conversation.columnDelta >= 40, String(doc.conversation.columnDelta))
check('card equals the transcript column within 1px', doc.conversation.deltaBefore <= 1 && doc.conversation.deltaAfter <= 1 && doc.conversation.centerBefore.card === doc.conversation.centerBefore.column && doc.conversation.centerAfter.card === doc.conversation.centerAfter.column)
check('card and column move together while dragging', Math.abs(doc.conversation.during.card.w - doc.conversation.during.column.w) <= 1)
check('conversation width is persisted by the Host key', typeof doc.conversation.persistence.key === 'string' && doc.conversation.afterReload.card.w === doc.conversation.afterReload.column.w)
check('no project-name chip in the live DOM', doc.projectChip.after.nodes === 0 && doc.projectChip.after.attrs === 0)
check('the before frame is labelled as a reconstruction', doc.projectChip.before.reconstructed === true)
check('permission menu carries the Host enum', doc.permission.enum.length >= 2 && doc.permission.enum.every((row) => typeof row.value === 'string' && row.label !== '') && doc.permission.open.options.filter((row) => row.current).length === 1)
check('permission switch changed the Host value and label', doc.permission.switched.value !== doc.permission.before.value && doc.permission.switched.label === doc.permission.open.options.find((row) => row.value === doc.permission.switched.value)?.label)
check('permission switch persisted with the session', doc.permission.persistence.verifiedAfterReload === true && doc.permission.afterReload.value === doc.permission.switched.value)
check('permission chip sits right of the attachment control', doc.permission.open.button.x > doc.permission.open.add.x + doc.permission.open.add.w && doc.permission.open.rowWrap === 'nowrap')
check('Chat has the selector and states why it cannot escalate', doc.chatMode.before.value !== null && doc.chatMode.noteShown === true && doc.chatMode.after.value === doc.chatMode.before.value)
check('Chat value outside the catalog is explained, not faked', doc.chatMode.currentInCatalog !== false || (typeof doc.chatMode.catalogNote === 'string' && doc.chatMode.catalogNote.length > 20))
check('the switch is described as the Host deriving sandbox + approval', typeof doc.permission.hostState.derived === 'string' && doc.permission.hostState.applies.includes('approval/policy'))
check('640px has no overflow and keeps the chip inline', doc.narrow.overflow.scrollWidth <= doc.narrow.overflow.clientWidth + 1 && doc.narrow.fitsRow === true && doc.narrow.clipped === true)

const shots = Object.values(doc.screenshots)
check('all nine frames are recorded', shots.length === 9, String(shots.length))
for (const path of shots) {
  check(`screenshot exists: ${path}`, existsSync(loc(path)) && statSync(loc(path)).size > 3000)
}

console.log(`${failures === 0 ? 'PASS' : 'FAIL'}  ${checks - failures}/${checks} P0-10B checks passed`)
process.exit(failures === 0 ? 0 : 1)
