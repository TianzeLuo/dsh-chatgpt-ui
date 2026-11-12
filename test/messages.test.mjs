#!/usr/bin/env node
/**
 * Module 4 — message area contract.
 *
 * These are static assertions over the shipped fragment and stylesheet: the
 * values are the ones in the reference capture (Host-width column, 22px/10×16 user
 * bubble, 16/26 prose, dark 12px code card, 96px image tiles, segmented tabs,
 * process summary). They are deliberately separate from scoped-css.test.mjs,
 * which proves that every selector is gated; this file proves the module's
 * own geometry and the two behaviours that cannot be expressed in CSS:
 * horizontal code scrolling and the native step-count summary.
 *
 * Run: node test/messages.test.mjs
 */

import { existsSync, readFileSync } from 'node:fs'

let failures = 0
let checks = 0
const check = (name, condition, detail) => {
  checks += 1
  if (condition) return
  failures += 1
  console.log(`FAIL  ${name}${detail === undefined ? '' : ` — ${detail}`}`)
}
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
const css = read('lib/client/css/30-chat.css')
const cssRules = css.replace(/\/\*[\s\S]*?\*\//g, '')
const js = read('lib/client/messages.js')
const entry = read('lib/client/entry.js')
const bundle = read('lib/client.js')
const pkg = JSON.parse(read('package.json'))

/* ---- column and user bubble ------------------------------------------- */
{
  // M11: the column is the Host's (its clamp + the native drag handles), so the
  // skin may only cap and centre. Re-pointing the variable or a fixed 760px is
  // the regression that killed the drag.
  check(
    'reading column follows the Host width',
    css.includes('max-width: var(--dsh-chat-content-width, var(--cgpt-msg-max, 920px))') &&
      !css.includes('max-width: min(var(--dsh-chat-content-width), var(--cgpt-msg-max, 920px))') &&
      !css.includes('--dsh-chat-content-width: var(--cgpt-msg-max') &&
      !css.includes('max-width: var(--cgpt-msg-max, 760px)')
  )
  check('user bubble is 22px / 10px 16px', /\.Sixlwa_bubble \{[^}]*padding: 10px 16px;[^}]*border-radius: 22px;/s.test(css))
  check('user stack caps at 70%', /\.Sixlwa_userStack \{[^}]*max-width: 70%;/s.test(css))
  check('user text is 16/24', /\.Sixlwa_bubble \{[^}]*font-size: 16px;[^}]*line-height: 24px;/s.test(css))
  check('light bubble uses the reference blue', css.includes('--cgpt-user-bubble-bg: #e8f3fe') && css.includes('--cgpt-user-bubble-fg: #0c274a'))
  check('dark bubble uses the reference navy', css.includes('--cgpt-user-bubble-bg: #173e76') && css.includes('--cgpt-user-bubble-fg: #f6fafe'))
  // The user-bubble selector now wraps user rows and pending-steering echoes in
  // :is(...); check the action-hiding behaviour, not one literal prefix.
  check('copy/time are hover-or-focus only below the bubble', /\.xzv4MW_actions \{[^}]*opacity: 0/.test(css) && css.includes(':hover .xzv4MW_actions') && css.includes(':focus-within .xzv4MW_actions'))
}

/* ---- assistant prose and code ----------------------------------------- */
{
  check('assistant prose is 16/26', css.includes('--cgpt-msg-font-size: 16px') && css.includes('--cgpt-msg-line-height: 26px'))
  check('paragraph gap is 8px', /\.hWmORq_body p \{[^}]*margin: 8px 0 0;/s.test(css))
  check('h1 is 20/28, h2 18/26, h3 16/24', /h1 \{[^}]*font-size: 20px;[^}]*line-height: 28px;/s.test(css) && /h2 \{[^}]*font-size: 18px;[^}]*line-height: 26px;/s.test(css) && /h3 \{[^}]*font-size: 16px;[^}]*line-height: 24px;/s.test(css))
  check('code card is 12px radius on a dark surface', /\[data-code-wrap\] \{[^}]*border-radius: 12px;[^}]*--cgpt-code-surface/s.test(css))
  check('code banner is 40px and code is 13px', /\[data-code-block-banner\] \{[^}]*height: 40px;/s.test(css) && /\[data-code-block-content\] pre \{[^}]*font-size: 13px;/s.test(css))
  check('the visual code wrapper scrolls horizontally', /\[data-code-block-content\] > div \{[^}]*overflow-x: auto;/s.test(css))
  check('unwrapped code keeps whitespace and max-content width', css.includes("button[aria-label='Wrap lines'][aria-pressed='false']") && /pre \{[^}]*width: max-content;/s.test(css))
}

/* ---- process groups, tabs, attachments, status ------------------------ */
{
  check('the Host process summary is not rewritten', !js.includes('setAttribute(\'data-cgpt-summary\'') && !js.includes('已执行 ${count} 个步骤') && !js.includes('已折叠过程'))
  check('the fragment never reads a process group', !js.includes('[data-step-process]') && !js.includes('data-process-activity'))
  check('no process/tool-row/disclosure rule is shipped', !cssRules.includes('[data-step-process]') && !cssRules.includes("[data-chat-flow-kind='turn-process']") && !cssRules.includes('[data-disclosure-row]') && !cssRules.includes('.O_Ebla_') && !cssRules.includes('.lcKema_'))
  check('assistant prose is scoped away from process members', cssRules.includes(":not([data-turn-process-member])") && !/\.hWmORq_body p \{[^}]*font-size/s.test(cssRules.split(':not([data-turn-process-member])')[0]))
  check('tabs are a fit-content 32px segmented control', /\[data-conversation-tabs\] \{[^}]*width: fit-content !important;[^}]*height: 32px;/s.test(css))
  check('native tab underline is hidden', css.includes("button[role='tab']::after") && css.includes('display: none'))
  check('image tiles are 96px and rounded', /button\[data-variant='tile'\] \{[^}]*width: 96px !important;[^}]*height: 96px !important;/s.test(css) && css.includes('border-radius: 12px'))
  check('host image preview is painted, not replaced', css.includes("aria-label='Original image preview'") && css.includes('button[aria-label^=\'Close original\']'))
  check('file cards share the attachment surface', css.includes('.Sixlwa_fileCard') && css.includes('.Sixlwa_fileMeta'))
  check('status line is a low-key footnote', css.includes("[data-composer-stat]") && css.includes('font-size: 12px'))
}

/* ---- behaviour / wiring ----------------------------------------------- */
{
  check('the wrap default is flipped once per block', js.includes('data-cgpt-wrap-defaulted') && js.includes("toggle.getAttribute('aria-pressed') === 'true'"))
  check('the wrap observer does not fight a later user choice', js.includes('codePending') && js.includes('if (codePending)'))
  check('skin off returns before any effect mounts', entry.includes("config?.skin === 'off'") && entry.includes('storedSkin === \'off\'') && entry.includes("localStorage?.getItem('cgpt-skin')"))
  check('messages fragment is in the bundle without the process annotation', bundle.includes('chatgptDefaultCodeWrap') && !bundle.includes('chatgptAnnotateProcess') && !bundle.includes('data-cgpt-summary'))
  check('messages fragment is checked by npm run check', pkg.scripts.check.includes('node --check lib/client/messages.js'))
  check('reference/implementation pairs exist', ['m4-light-reference', 'm4-light-implementation', 'm4-dark-reference', 'm4-dark-implementation', 'm4-light-compare', 'm4-dark-compare'].every((name) => existsSync(new URL(`../docs/screenshots/${name}.png`, import.meta.url))))
  check('long-content and interaction evidence exists', ['m4-light-long', 'm4-light-long-code', 'm4-light-process-collapsed', 'm4-light-process-expanded', 'm4-light-attachments', 'm4-light-preview', 'm4-light-file-card', 'm4-light-trajectory'].every((name) => existsSync(new URL(`../docs/screenshots/${name}.png`, import.meta.url))))
}

console.log(`messages: ${checks - failures}/${checks} checks passed`)
if (failures > 0) process.exitCode = 1
