/**
 * Scope gate.
 *
 * The skin ships one stylesheet into the host document, so a careless selector
 * does not stay inside the plugin: `body[data-chatgpt-ui] *` restyles every host
 * node, and a mode-level `[class*='_row']` matches native tool-call disclosure
 * rows. This test fails when CSS:
 *
 *   - is not gated by `body[data-chatgpt-ui]` (or a plugin-owned root),
 *   - paints a plain `body` / `html` / `:root` rule with anything but variables,
 *   - uses a universal selector,
 *   - targets the native transcript without the skin gate
 *     (`[data-chat-flow-kind]` is allowed only under `[data-cgpt-skin='on']`),
 *   - uses a host class substring without a named slot/composer anchor,
 *   - ends in a bare host element without a plugin/slot anchor.
 *
 * The native conversation is host DOM and must only be affected through alias
 * tokens; see lib/client/css/30-chat.css.
 */

import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

const CSS_DIR = new URL('../lib/client/css/', import.meta.url).pathname
const BLANK = (text) => text.replace(/[^\n]/g, ' ')
const stripComments = (text) => text.replace(/\/\*[\s\S]*?\*\//g, BLANK)

const splitSelectors = (selector) => {
  const parts = []
  let depth = 0
  let quote = ''
  let current = ''
  for (const character of selector) {
    if (quote !== '') {
      current += character
      if (character === quote) quote = ''
      continue
    }
    if (character === '"' || character === "'") {
      quote = character
      current += character
      continue
    }
    if (character === '(' || character === '[') depth += 1
    if (character === ')' || character === ']') depth = Math.max(0, depth - 1)
    if (character === ',' && depth === 0) {
      parts.push(current.trim())
      current = ''
      continue
    }
    current += character
  }
  if (current.trim() !== '') parts.push(current.trim())
  return parts
}

/** Replace @keyframes bodies with blanks while preserving line numbers. */
const blankKeyframes = (css) => {
  let output = ''
  let cursor = 0
  for (const match of css.matchAll(/@keyframes\s+[^{]+\{/g)) {
    const start = match.index + match[0].length
    let depth = 1
    let index = start
    while (index < css.length && depth > 0) {
      if (css[index] === '{') depth += 1
      if (css[index] === '}') depth -= 1
      index += 1
    }
    output += css.slice(cursor, start) + BLANK(css.slice(start, index))
    cursor = index
  }
  return output + css.slice(cursor)
}

const DECLARATION_ONLY_VARIABLES = (body) => body
  .split(';')
  .map((declaration) => declaration.trim())
  .filter(Boolean)
  .every((declaration) => declaration.startsWith('--'))

const SCOPE_MARKER = /\[data-slot=|\[data-composer-card=|\[data-input-scroll=|_composerHero|data-super-agent-panel|\.chatgpt-|\[data-cgpt-|\[data-chatgpt-mode=/
const ELEMENT_TAIL = /(?:^|[\s>+~])(?:p|ul|ol|li|pre|code|h[1-6]|a|button|div|span|svg|section)\s*$/

const audit = (file, css) => {
  const violations = []
  const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
  for (const rule of rules) {
    const rawSelector = rule[1].trim().replace(/\s+/g, ' ')
    if (rawSelector === '' || rawSelector.startsWith('@')) continue
    if (/^@/.test(rawSelector)) continue
    const body = rule[2]
    const line = css.slice(0, rule.index).split('\n').length
    for (const selector of splitSelectors(rawSelector)) {
      const scoped = selector.startsWith('body[data-chatgpt-ui]') || selector.startsWith('[data-cgpt-root]')
      const bareDocument = /^(?::root|html|body)(?:\[[^\]]+\])*$/.test(selector)
      if (bareDocument) {
        if (!DECLARATION_ONLY_VARIABLES(body)) violations.push(`${file}:${line} bare document rule must only declare variables: ${selector}`)
        continue
      }
      if (!scoped) violations.push(`${file}:${line} unscoped selector: ${selector}`)
      if (/(?:^|[\s>+~(,])\*(?=[\s>+~),:{]|$)/.test(selector)) violations.push(`${file}:${line} universal selector: ${selector}`)
      if (selector.includes('[data-chat-flow-kind') && !selector.includes("[data-cgpt-skin='on']")) {
        violations.push(`${file}:${line} native transcript selector without the skin gate: ${selector}`)
      }
      if (selector.includes('[class*=') && !SCOPE_MARKER.test(selector)) violations.push(`${file}:${line} host class substring without a slot/composer anchor: ${selector}`)
      if (ELEMENT_TAIL.test(selector) && !SCOPE_MARKER.test(selector)) violations.push(`${file}:${line} bare host element without a slot/plugin anchor: ${selector}`)
    }
  }
  return violations
}

test('every rule is scoped and native transcript rules carry the skin gate', () => {
  const files = readdirSync(CSS_DIR).filter((file) => file.endsWith('.css')).sort()
  assert.ok(files.length >= 10, 'expected the skin stylesheets to be present')
  const violations = []
  for (const file of files) {
    const css = blankKeyframes(stripComments(readFileSync(join(CSS_DIR, file), 'utf8')))
    violations.push(...audit(file, css))
  }
  assert.deepEqual(violations, [], `unscoped CSS:\n${violations.join('\n')}`)
})

test('the native conversation column knob is never re-pointed', () => {
  const files = readdirSync(CSS_DIR).filter((file) => file.endsWith('.css'))
  const offenders = []
  for (const file of files) {
    const css = stripComments(readFileSync(join(CSS_DIR, file), 'utf8'))
    for (const match of css.matchAll(/--dsh-chat-user-width\s*:/g)) {
      offenders.push(`${file}:${css.slice(0, match.index).split('\n').length}`)
    }
  }
  assert.deepEqual(offenders, [], `--dsh-chat-user-width is a native layout setting and must not be overridden: ${offenders.join(', ')}`)
})

/** Declarations of the first rule whose selector matches `pattern`. */
const ruleBody = (css, pattern, label) => {
  for (const rule of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (pattern.test(rule[1].trim())) return rule[2]
  }
  assert.fail(`missing CSS rule: ${label}`)
  return ''
}

test('answered-question replies use the same capsule recipe as user messages', () => {
  const css = stripComments(readFileSync(join(CSS_DIR, '30-chat.css'), 'utf8'))
  const user = ruleBody(
    css,
    /\[data-chat-flow-kind='user'\][^{]*:is\(\.Sixlwa_bubble, \[data-message-bubble\]\)/,
    'plain user bubble'
  )
  const question = ruleBody(
    css,
    /\[data-chat-flow-kind='question-reply'\] \[data-reply-outcome\] > div:first-child > div:first-child/,
    'question-reply bubble'
  )
  const questionWidth = ruleBody(
    css,
    /\[data-chat-flow-kind='question-reply'\] \[data-reply-outcome\] > div:first-child$/m,
    'question-reply width container'
  )
  const recipe = [
    'background: var(--cgpt-user-bubble-bg)',
    'color: var(--cgpt-user-bubble-fg)',
    'padding: var(--cgpt-user-bubble-padding)',
    'border-radius: var(--cgpt-user-bubble-radius)',
    'font-size: 16px',
    'line-height: 24px'
  ]
  for (const declaration of recipe) {
    assert.ok(user.includes(declaration), `the user bubble no longer declares "${declaration}"`)
    assert.ok(question.includes(declaration), `the question-reply bubble does not share "${declaration}"`)
  }
  assert.match(css, /--cgpt-user-bubble-radius:\s*22px/)
  assert.match(css, /--cgpt-user-bubble-padding:\s*10px 16px/)
  assert.match(css, /--cgpt-user-bubble-max:\s*70%/)
  assert.ok(questionWidth.includes('max-width: var(--cgpt-user-bubble-max)'), 'the answered-question container must cap at 70%')
  assert.ok(!/assistant-step[^{]*question-reply/.test(css), 'answer styling must not capture assistant nodes')
})

test('the sidebar exposes exactly one in-flow scrollport', () => {
  const sidebar = stripComments(readFileSync(join(CSS_DIR, '20-sidebar.css'), 'utf8'))
  const sessions = stripComments(readFileSync(join(CSS_DIR, '25-sessions.css'), 'utf8'))
  const shell = ruleBody(sidebar, /\[data-sidebar-scrollport\]\s*$/, 'host sidebar scrollport')
  assert.ok(shell.includes('overflow: hidden'), 'the host sidebar scrollport must not scroll')
  assert.match(shell, /grid-template-rows:\s*8px 0 2px minmax\(0, 1fr\)/, 'the region row must take the leftover height')
  assert.ok(!/(?:^|\n)[^\n]*overflow-y:\s*(?:auto|scroll)/.test(sidebar), 'no sidebar-shell rule may introduce a second scrollport')
  const fill = ruleBody(sessions, /\[data-sidebar-scrollport\] \.chatgpt-sessions\s*$/, 'sidebar list height fill')
  assert.ok(fill.includes('height: 100%'), 'the list must fill the host region instead of the viewport')
  const root = ruleBody(sessions, /^body\[data-chatgpt-ui\] \.chatgpt-sessions$/m, 'sidebar list root')
  assert.ok(root.includes('overflow: hidden'), 'the list root must clip rather than scroll')
  const list = ruleBody(sessions, /^body\[data-chatgpt-ui\] \.chatgpt-session-scroll$/m, 'session scroll area')
  assert.ok(list.includes('overflow-y: auto') && list.includes('overflow-x: hidden'), 'the session list is the one scrollport')
  const scrollers = [...sessions.matchAll(/([^{}]+)\{[^{}]*overflow-y:\s*(?:auto|scroll)/g)].map((match) => match[1].trim().replace(/\s+/g, ' '))
  const unexpected = scrollers.filter((selector) => ![
    'body[data-chatgpt-ui] .chatgpt-session-scroll',
    'body[data-chatgpt-ui] .chatgpt-session-menu',
    'body[data-chatgpt-ui] .chatgpt-session-search-results'
  ].includes(selector))
  assert.deepEqual(unexpected, [], `unexpected sidebar scrollers: ${unexpected.join(' | ')}`)
})
