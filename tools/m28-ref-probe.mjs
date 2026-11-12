#!/usr/bin/env node
/**
 * tools/m28-ref-probe.mjs — read-only measurement of the live ChatGPT empty page.
 *
 * P0-16 compares the skin's empty Chat state against two references: the desktop
 * capture (2x) and the live web page. This probe records the web numbers into
 * docs/m28-web.json, from which `m28-capture.mjs` fills the 「网页实测」 column of
 * docs/m27b.json.
 *
 *   node tools/m28-ref-probe.mjs [--cdp http://127.0.0.1:9224] [--out docs/m28-web.json]
 *
 * Hard rule: it only measures. It never navigates, types, clicks or opens a new
 * chat, so the browser tab keeps whatever conversation the user left open.
 * When the attached browser has no ChatGPT tab (or the tab is not on the empty
 * page) the probe still exits 0 and records `"found": false` — the committed JSON
 * stays the last known-good measurement.
 */
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const args = new Map()
for (let index = 2; index < process.argv.length; index += 1) {
  const token = process.argv[index]
  if (!token.startsWith('--')) continue
  const next = process.argv[index + 1]
  if (next === undefined || next.startsWith('--')) args.set(token.slice(2), true)
  else {
    args.set(token.slice(2), next)
    index += 1
  }
}
const CDP = typeof args.get('cdp') === 'string' ? args.get('cdp') : process.env.M28_CDP ?? 'http://127.0.0.1:9224'
const OUT = resolve(ROOT, typeof args.get('out') === 'string' ? args.get('out') : 'docs/m28-web.json')

const playwrightPath = process.env.M28_PLAYWRIGHT ?? '/mnt/f/project/y86/node_modules/playwright/index.mjs'
const { chromium } = await import(playwrightPath)

const measure = () => {
  // Everything here reads the page; the only calls are getComputedStyle and
  // getBoundingClientRect. Helpers are declared inside because this function is
  // serialised into the page.
  const rect = (box) => {
    const round = (value) => Math.round(value * 100) / 100
    return { x: round(box.x), y: round(box.y), w: round(box.width), h: round(box.height), right: round(box.right), bottom: round(box.bottom) }
  }
  const capsule = document.querySelector('[data-composer-body]')
  const buttons = capsule === null ? [] : [...capsule.querySelectorAll('button')]
  // The effort trigger is a div with role=button, not a <button>: find the
  // 「极高」 label and walk out to the interactive ancestor.
  const effortLabel = [...document.querySelectorAll('span')].find((el) => /^(极低|低|中|高|极高|最高)$/.test((el.innerText ?? '').trim()))
  const effort = effortLabel?.closest('button, [role="button"]') ?? undefined
  const pillButtons = buttons.filter((button) => Math.round(button.getBoundingClientRect().width) === 36)
  const placeholder = document.querySelector('p[class*="placeholder"]')
  const segments = [...document.querySelectorAll('button[aria-pressed]')].filter((node) => {
    const box = node.getBoundingClientRect()
    return Math.round(box.width) === 112 && Math.round(box.height) === 36
  })
  const track = segments.length === 0 ? null : segments[0].parentElement
  const title = [...document.querySelectorAll('div,span')].find((el) => {
    const style = getComputedStyle(el)
    return style.fontSize === '24px' && style.fontWeight === '400' && (el.textContent ?? '').trim().length > 0 && (el.textContent ?? '').trim().length < 24
  })
  return {
    found: true,
    url: location.origin + location.pathname,
    viewport: { width: innerWidth, height: innerHeight },
    dpr: devicePixelRatio,
    lang: document.documentElement.lang,
    title: title === undefined ? null : { text: (title.textContent ?? '').trim(), box: rect(title.getBoundingClientRect()), fontSize: getComputedStyle(title).fontSize, fontWeight: getComputedStyle(title).fontWeight, lineHeight: getComputedStyle(title).lineHeight, color: getComputedStyle(title).color },
    composer: {
      capsule: capsule === null ? null : { box: rect(capsule.getBoundingClientRect()), radius: getComputedStyle(capsule).borderRadius, background: getComputedStyle(capsule).backgroundColor, shadow: getComputedStyle(capsule).boxShadow },
      placeholder: placeholder === null ? null : (() => {
        const pseudo = getComputedStyle(placeholder, '::before')
        return { text: pseudo.content.replace(/^"|"$/g, ''), fontSize: pseudo.fontSize, color: pseudo.color, box: rect(placeholder.getBoundingClientRect()) }
      })(),
      plus: pillButtons.length === 0 ? null : { box: rect(pillButtons[0].getBoundingClientRect()), aria: pillButtons[0].getAttribute('aria-label') },
      effort: effort === null || effort === undefined ? null : (() => {
        const style = getComputedStyle(effort)
        const label = effortLabel === undefined ? null : getComputedStyle(effortLabel)
        return { text: (effortLabel?.innerText ?? '').trim(), fontSize: label?.fontSize ?? style.fontSize, color: label?.color ?? style.color, box: rect(effort.getBoundingClientRect()), padding: style.padding, gap: style.gap, radius: style.borderRadius }
      })(),
      trailing: pillButtons.length < 2 ? null : { box: rect(pillButtons.at(-1).getBoundingClientRect()), background: getComputedStyle(pillButtons.at(-1)).backgroundColor, aria: pillButtons.at(-1).getAttribute('aria-label') }
    },
    modeSwitch: track === null ? null : {
      track: { box: rect(track.getBoundingClientRect()), radius: getComputedStyle(track).borderRadius, background: getComputedStyle(track).backgroundColor },
      segments: segments.map((node) => {
        const computed = getComputedStyle(node)
        return { text: (node.textContent ?? '').trim(), pressed: node.getAttribute('aria-pressed'), box: rect(node.getBoundingClientRect()), fontSize: computed.fontSize, fontWeight: computed.fontWeight, fontFamily: computed.fontFamily.split(',')[0].trim(), color: computed.color, background: computed.backgroundColor, radius: computed.borderRadius }
      })
    }
  }
}

let browser = null
let result
try {
  browser = await chromium.connectOverCDP(CDP)
  let page = null
  for (const context of browser.contexts()) {
    for (const candidate of context.pages()) {
      if (/^https:\/\/(chatgpt\.com|chat\.openai\.com)\//.test(candidate.url())) page = candidate
    }
  }
  if (page === null) result = { found: false, reason: 'no ChatGPT tab in the attached browser', cdp: CDP }
  else {
    const text = await page.evaluate(() => document.body.innerText.slice(0, 4000))
    const empty = !/You said:|ChatGPT said:|你说：|ChatGPT 说：/.test(text)
    result = await page.evaluate(measure)
    result.emptyState = empty
    result.cdp = CDP
  }
} catch (error) {
  result = { found: false, reason: String(error).slice(0, 300), cdp: CDP }
} finally {
  if (browser !== null) await browser.close().catch(() => {})
}

// A closed CDP connection must never leave the committed measurement half-written.
if (result.found !== true) {
  console.log(JSON.stringify(result, null, 1))
  process.exit(0)
}
mkdirSync(dirname(OUT), { recursive: true })
writeFileSync(OUT, JSON.stringify({ tool: 'm28-ref-probe', measuredAt: new Date().toISOString(), ...result }, null, 2) + '\n')
console.log(`wrote ${OUT}`)
console.log(JSON.stringify(result, null, 1))
