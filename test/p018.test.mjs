#!/usr/bin/env node
/**
 * P0-18 — the Work composer: one empty width, the Host mode selector in the
 * title row, the project name on the bottom-left button, four bottom buttons
 * on one visual spec, and the approval panel anchored left + opening down for
 * a new session / up for an existing one. P0-18 additionally removes the
 * ChatGPT caption row from the panel (no title, no 了解更多 link).
 *
 * The live numbers come from docs/m31.json (tools/m31-capture.mjs, 1233×850
 * DPR 2, dark + light). These checks re-read the source rules and then enforce
 * the measured values, so a passing build cannot hide a CSS/JS mismatch.
 *
 * Run: node test/p018.test.mjs
 */
import { existsSync, readFileSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (path) => readFileSync(join(ROOT, path), 'utf8')
const m31 = JSON.parse(read('docs/m31.json'))

const heroCss = read('lib/client/css/60-hero.css')
const workCss = read('lib/client/css/65-work-card.css')
const composerCss = read('lib/client/css/40-composer.css')
const overlayCss = read('lib/client/css/76-overlay.css')
const tokens = read('lib/client/css/05-cgpt-tokens.css')
const composerJs = read('lib/client/composer.js')
const clientJs = read('lib/client.js')

let checks = 0
let failures = 0
const check = (name, condition, detail) => {
  checks += 1
  if (condition === true) {
    console.log(`ok ${checks} - ${name}`)
    return
  }
  failures += 1
  console.error(`not ok ${checks} - ${name}${detail === undefined ? '' : ` — ${JSON.stringify(detail)}`}`)
}

const agentHero = /body\[data-chatgpt-ui\]\[data-chatgpt-mode='agent'\] \[class\*='_composerHero'\]\s*\{([^}]*)\}/s.exec(heroCss)
const chatHero = /body\[data-chatgpt-ui\]\[data-chatgpt-mode='chat'\] \[class\*='_composerHero'\]\s*\{([^}]*)\}/s.exec(heroCss)
const agentChunk = agentHero === null ? '' : agentHero[1]
const chatChunk = chatHero === null ? '' : chatHero[1]

// ---- source: one width token, consumed by both faces ----------------------
check('P0-18: --cgpt-empty-composer-w is the single 757px empty width',
  /--cgpt-empty-composer-w:\s*757px/.test(tokens))
check('P0-18: Chat empty hero reads --cgpt-empty-composer-w',
  /--dsh-composer-card-max-width:\s*var\(--cgpt-empty-composer-w\)/.test(chatChunk) &&
  /--dsh-composer-side-clearance:\s*0px/.test(chatChunk))
check('P0-18: Work empty hero reads the same --cgpt-empty-composer-w',
  /--dsh-composer-card-max-width:\s*var\(--cgpt-empty-composer-w\)/.test(agentChunk) &&
  /--dsh-composer-side-clearance:\s*0px/.test(agentChunk))
check('P0-18: neither hero hard-codes a second empty width',
  !/\[class\*='_composerHero'\][^{]*\{[^}]*width:\s*757px/s.test(heroCss))
check('P0-18: the blank Work card fills the hero (no second width value)',
  /\[data-chatgpt-mode='agent'\][\s\S]{0,240}?\[class\*='_composerHero'\] \[data-composer-card='true'\]\s*\{[^}]*width:\s*100%[^}]*max-width:\s*100%/s.test(workCss))

// ---- source: title row = Host mode selector, not the workspace chip -------
check('P0-18: Work hides the hero workspace button and its slot wrapper',
  /\[data-chatgpt-mode='agent'\][^{]*\[class\*='_heroWorkspaceRow'\]\s*>\s*button\[class\*='_workspace'\][\s\S]{0,260}?\[class\*='_heroWorkspaceRow'\]\s*>\s*div:nth-child\(2\)/s.test(heroCss))
check('P0-18: Work does NOT hide the Host agent-preset seat',
  !/\[data-chatgpt-mode='agent'\][^{]*\[data-slot='conversation\.hero\.agentPreset'\][^{]*\{[^}]*display:\s*none/s.test(heroCss))
check('P0-18: Chat still hides the Host agent-preset seat',
  /\[data-chatgpt-mode='chat'\][^{]*\[data-slot='conversation\.hero\.agentPreset'\]\s*>\s*:first-child\s*\{[^}]*display:\s*none/s.test(heroCss))

// ---- source: four bottom buttons share one spec ---------------------------
const permissionBlock = /body\[data-chatgpt-ui\] \.chatgpt-permission\s*\{([^}]*)\}/s.exec(composerCss)
const permissionChunk = permissionBlock === null ? '' : permissionBlock[1]
check('P0-18: the permission button is 36px high with the tools’ 0/8 padding',
  /height:\s*36px/.test(permissionChunk) && /padding:\s*0 8px/.test(permissionChunk) && /border-radius:\s*9999px/.test(permissionChunk))
check('P0-18: the permission button is a transparent 14px/400 chip',
  /background:\s*transparent/.test(permissionChunk) &&
  /font-size:\s*14px/.test(permissionChunk) && /font-weight:\s*400/.test(permissionChunk) &&
  /gap:\s*6px/.test(permissionChunk))
check('P0-18: permission hover uses the shared hover fill + primary text',
  /\.chatgpt-permission:hover,[\s\S]{0,80}\.chatgpt-permission\[aria-expanded='true'\]\s*\{[^}]*background:\s*var\(--cgpt-work-hover\)[^}]*color:\s*var\(--cgpt-text-primary\)/s.test(composerCss))
check('P0-18: the permission glyph is the tools’ 20px slot',
  /\.chatgpt-permission-icon\s*\{[^}]*width:\s*20px[^}]*height:\s*20px/s.test(composerCss) &&
  /\.chatgpt-permission \.chatgpt-permission-icon\s*\{[^}]*width:\s*20px !important[^}]*height:\s*20px !important/s.test(overlayCss))
check('P0-18/P0-18b: permission has one left-slot seat for both Work states',
  // P0-18 first moved the blank instance into the tool bar; P0-18b brings it
  // back into the card action row. Either way it is a left-hand seat and no
  // right-hand cluster exists.
  /ChatgptPermissionControl/.test(composerJs) &&
  !composerJs.includes("placement: 'toolbar'") &&
  !composerJs.includes("data-cgpt-work-tool': 'plugins'") &&
  !/chatgpt-work-tools-right/.test(composerJs))

// ---- source: project label from the live workspace title ------------------
check('P0-18: the project button defaults to 选择项目',
  /currentProject === undefined \|\| currentProject\.title === 'default-workspace'[\s\S]{0,120}?CHATGPT_WORK_LABELS\.project/.test(composerJs))
check('P0-18: the project button otherwise prints the project title',
  /: currentProject\.title \?\? currentProject\.workspaceId/.test(composerJs) &&
  /chatgpt-work-tool-label'[\s\S]{0,40}?projectLabel/.test(composerJs))

// ---- source: panel caption removed, inset tightened ---------------------
check('P0-18: the ChatGPT caption row and 了解更多 link are gone',
  !composerJs.includes('chatgpt-permission-head') &&
  !composerJs.includes('应如何批准 ChatGPT 操作?') &&
  !composerJs.includes('了解更多') &&
  !clientJs.includes('应如何批准 ChatGPT 操作?') &&
  !clientJs.includes('了解更多') &&
  !/\.chatgpt-permission-head\s*\{/.test(workCss))
check('P0-18: the picker top/bottom inset is 9px (inside the 8–10px budget)',
  /--cgpt-desktop-permission-pad-y:\s*9px/.test(tokens) &&
  /\.chatgpt-permission-menu\s*\{[^}]*padding:\s*var\(--cgpt-desktop-permission-pad-y\)/s.test(workCss))
check('P0-18: the picker height no longer reserves a caption row',
  /chatgptPopoverBeside\(rect, 298, 18 \+ options\.length \* 42\.5/.test(composerJs) &&
  !/36 \+ options\.length \* 42\.5/.test(composerJs))

// ---- source: panel alignment / direction helper ---------------------------
check('P0-18: the picker is left-aligned to its button',
  /function chatgptPopoverBeside\(anchor, width, height, options = \{\}\)[\s\S]{0,320}?options\.align === 'end' \? anchor\.right - width : anchor\.left/.test(composerJs))
check('P0-18: new sessions prefer below, existing sessions above',
  /align:\s*'start',\s*direction:\s*blank \? 'below' : 'above'/s.test(composerJs))
check('P0-18: the picker flips when a side has no room and clamps to the viewport',
  /const fitsBelow = below \+ height <= viewport\.innerHeight - margin/.test(composerJs) &&
  /const fitsAbove = above >= margin/.test(composerJs) &&
  /Math\.max\(margin, Math\.min\(viewport\.innerWidth - width - margin, aligned\)\)/.test(composerJs))
check('P0-18: the toolbar seat only renders on a blank session',
  /if \(!blank\) return null/.test(composerJs))
check('P0-18: the built client carries the P0-18 markup and helper',
  clientJs.includes('chatgpt-work-tools-left') && clientJs.includes('data-cgpt-permission-open') && clientJs.includes('chatgptPopoverBeside'))

// ---- evidence: live measurements -----------------------------------------
check('P0-18: evidence exists and the capture passed every check',
  m31.summary.total === m31.assertions.length && m31.summary.failed.length === 0 && m31.assertions.every((row) => row.ok === true),
  m31.summary)
check('P0-18: the report does not leak the URL token', !m31.url.includes('token=_'))

for (const theme of ['dark', 'light']) {
  const frame = m31.themes[theme]
  const prefix = `P0-18[${theme}]`
  check(`${prefix}: Work empty width equals Chat empty width and 757`,
    Math.abs(frame.workEmpty.card.w - frame.chatEmpty.card.w) <= 1 && Math.abs(frame.workEmpty.card.w - 757) <= 1,
    { chat: frame.chatEmpty.card.w, work: frame.workEmpty.card.w })
  check(`${prefix}: no workspace chip under the title; the row is the Host mode selector`,
    frame.modeRow.workspaceChip.visible === false &&
    frame.modeRow.workspaceChip.display === 'none' &&
    frame.modeRow.modeSelector.visible === true &&
    frame.modeRow.modeSelector.slot === 'conversation.hero.agentPreset' &&
    frame.modeRow.modeSelector.text !== '' &&
    !frame.modeRow.rowText.includes('proj-alpha'),
    frame.modeRow)
  check(`${prefix}: project button 选择项目 → project title, icon kept`,
    frame.projectBefore.label === '选择项目' && frame.projectBefore.icon === true &&
    frame.projectAfter.label === 'proj-alpha' && frame.projectAfter.icon === true,
    { before: frame.projectBefore, after: frame.projectAfter })

  const keys = ['project', 'files', 'permission']
  const rest = frame.buttons.rest
  const hover = frame.buttons.hover
  check(`${prefix}: shared tool buttons — same 36px height / 0 8 padding / 9999 radius`,
    keys.every((key) => rest[key].height === '36px' && rest[key].padding === '0px 8px' && rest[key].radius === '9999px'),
    keys.map((key) => rest[key]))
  check(`${prefix}: shared tool buttons — transparent rest fill, same hover fill/text`,
    keys.every((key) => rest[key].background === 'rgba(0, 0, 0, 0)') &&
    new Set(keys.map((key) => hover[key].background)).size === 1 &&
    new Set(keys.map((key) => hover[key].color)).size === 1 &&
    hover.project.background !== rest.project.background,
    { rest: keys.map((key) => rest[key].background), hover: keys.map((key) => hover[key].background) })
  check(`${prefix}: shared tool buttons — 20px glyphs`,
    keys.every((key) => rest[key].icon.w === 20 && rest[key].icon.h === 20),
    keys.map((key) => rest[key].icon))

  check(`${prefix}: panel left edge sits on the button (≤1px), both directions`,
    Math.abs(frame.permissionDown.leftDelta) <= 1 && Math.abs(frame.permissionUp.leftDelta) <= 1,
    { down: frame.permissionDown.leftDelta, up: frame.permissionUp.leftDelta })
  check(`${prefix}: new opens down / existing opens up and both stay in the viewport`,
    frame.permissionDown.direction === 'below' && frame.permissionDown.insideViewport === true &&
    frame.permissionUp.direction === 'above' && frame.permissionUp.insideViewport === true,
    { down: frame.permissionDown.direction, up: frame.permissionUp.direction })
  check(`${prefix}: panel has no caption text or 了解更多 link`,
    frame.permissionDown.header.present === false && frame.permissionDown.header.titlePresent === false && frame.permissionDown.header.learnMorePresent === false &&
    frame.permissionUp.header.present === false && frame.permissionUp.header.titlePresent === false && frame.permissionUp.header.learnMorePresent === false,
    { down: frame.permissionDown.header, up: frame.permissionUp.header })
  check(`${prefix}: first option sits 8–10px from the panel top`,
    frame.permissionDown.firstRowGap >= 8 && frame.permissionDown.firstRowGap <= 10 &&
    frame.permissionUp.firstRowGap >= 8 && frame.permissionUp.firstRowGap <= 10,
    { down: frame.permissionDown.firstRowGap, up: frame.permissionUp.firstRowGap })
  check(`${prefix}: panel height shrank to three rows + 18px insets`,
    Math.abs(frame.permissionDown.panel.h - 145.5) <= 1 && Math.abs(frame.permissionUp.panel.h - 145.5) <= 1,
    { down: frame.permissionDown.panel.h, up: frame.permissionUp.panel.h })
  check(`${prefix}: existing session uses the card action row`,
    frame.existing.permissionInActionRow === true,
    frame.existing)
  check(`${prefix}: direction basis is recorded for both states`,
    frame.directionBasis.newSession.blank === true &&
    frame.directionBasis.newSession.preferred === 'below' &&
    frame.directionBasis.newSession.chosen === 'below' &&
    frame.directionBasis.existingSession.blank === false &&
    frame.directionBasis.existingSession.preferred === 'above' &&
    frame.directionBasis.existingSession.chosen === 'above',
    frame.directionBasis)
}

check('P0-18: a short viewport makes the same new-session rule flip above',
  m31.flip.direction === 'above' && m31.flip.insideViewport === true &&
  m31.flipBasis.preferred === 'below' && m31.flipBasis.chosen === 'above' &&
  m31.flipBasis.roomBelow < m31.flipBasis.panelHeight,
  { flip: m31.flip.direction, basis: m31.flipBasis })

// ---- evidence: files ------------------------------------------------------
const shots = [
  'm31-chat-empty-dark.png', 'm31-chat-empty-light.png',
  'm31-work-empty-dark.png', 'm31-work-empty-light.png',
  'm31-work-existing-dark.png', 'm31-work-existing-light.png',
  'm31-project-selected-dark.png', 'm31-project-selected-light.png',
  'm31-permission-down-dark.png', 'm31-permission-down-light.png',
  'm31-permission-up-dark.png', 'm31-permission-up-light.png',
  'm31-buttons-hover-dark.png', 'm31-buttons-hover-light.png',
  'm31-permission-flip-dark.png'
]
const missing = shots.filter((name) => {
  const path = join(ROOT, 'docs/screenshots', name)
  return !existsSync(path) || statSync(path).size < 8000
})
check('P0-18: every acceptance screenshot exists and is non-trivial', missing.length === 0, missing)

console.log(`\n${checks - failures}/${checks} P0-18 checks passed`)
if (failures > 0) process.exit(1)
