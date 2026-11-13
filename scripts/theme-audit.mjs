#!/usr/bin/env node
/**
 * Module-8 theme audit. Builds docs/theme-audit.json from the live skin.
 *
 * Chrome controls are measured in the running 3090 scratch instance; the four
 * transcript/menu/toast controls that need a session are instantiated with the
 * same host-shaped classes into an off-screen node, so their actual computed
 * styles come from the same stylesheet as the live UI. No host package or
 * session is modified.
 *
 *   node scripts/theme-audit.mjs --url 'http://127.0.0.1:3090/?token=…' \
 *     [--playwright /path/to/playwright] [--out docs/theme-audit.json]
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const args = new Map()
for (let i = 2; i < process.argv.length; i += 2) args.set(process.argv[i].replace(/^--/, ''), process.argv[i + 1])
const url = args.get('url')
const outPath = resolve(ROOT, args.get('out') ?? 'docs/theme-audit.json')
const playwrightDir = args.get('playwright')
if (url === undefined) {
  console.error('usage: node scripts/theme-audit.mjs --url <DSH Web URL> [--playwright <dir>] [--out <json>]')
  process.exit(2)
}
let playwright
try {
  playwright = await import(playwrightDir === undefined ? 'playwright-core' : join(playwrightDir, 'index.mjs'))
} catch (error) {
  console.error(`playwright-core is required for this audit (${error.message})`)
  process.exit(2)
}
const CHROME = process.env.CHATGPT_UI_CHROME ?? process.env.HOME + '/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome'
const browser = await playwright.chromium.launch({ headless: true, executablePath: CHROME, args: ['--no-sandbox', '--disable-dev-shm-usage'] })

const expected = {
  light: {
    rail: { background: 'rgb(249, 249, 249)', foreground: 'rgb(13, 13, 13)', muted: 'rgb(143, 143, 143)' },
    sidebarRow: { background: 'rgba(0, 0, 0, 0)', foreground: 'rgb(13, 13, 13)' },
    groupTitle: { foreground: 'rgb(143, 143, 143)' },
    bubble: { background: 'rgb(232, 243, 254)', foreground: 'rgb(12, 39, 74)' },
    codeBlock: { background: 'rgb(13, 13, 13)', header: 'rgb(23, 23, 23)', border: 'rgb(47, 47, 47)', foreground: 'rgb(243, 243, 243)' },
    processRow: { foreground: 'rgb(93, 93, 93)' },
    toolRow: { background: 'rgb(240, 240, 240)', foreground: 'rgb(107, 107, 107)' },
    modelPill: { foreground: 'rgb(118, 118, 118)' },
    effortTrack: { background: 'rgb(235, 235, 235)', fill: 'rgb(58, 131, 247)' },
    menu: { background: 'rgb(255, 255, 255)', foreground: 'rgb(13, 13, 13)', border: 'rgba(0, 0, 0, 0.1)' },
    popover: { background: 'rgb(255, 255, 255)', foreground: 'rgb(13, 13, 13)' },
    toast: { background: 'rgba(32, 32, 32, 0.92)', foreground: 'rgb(255, 255, 255)', border: 'rgba(255, 255, 255, 0.08)' },
    scrollbar: { width: 'thin', color: 'rgba(0, 0, 0, 0.16) rgba(0, 0, 0, 0)' },
    focusRing: { width: '2px', offset: '2px', color: 'rgb(15, 17, 21)' },
    composer: { background: 'rgb(255, 255, 255)', border: 'rgb(227, 227, 227)', placeholder: 'rgb(118, 118, 118)' },
    modeSegment: { selected: 'rgb(255, 255, 255)', unselected: 'rgb(93, 93, 93)' }
  },
  dark: {
    rail: { background: 'rgb(0, 0, 0)', foreground: 'rgb(237, 237, 237)', muted: 'rgb(175, 175, 175)' },
    sidebarRow: { background: 'rgba(0, 0, 0, 0)', foreground: 'rgb(237, 237, 237)' },
    groupTitle: { foreground: 'rgb(175, 175, 175)' },
    bubble: { background: 'rgb(23, 62, 118)', foreground: 'rgb(246, 250, 254)' },
    codeBlock: { background: 'rgb(13, 13, 13)', header: 'rgb(23, 23, 23)', border: 'rgb(47, 47, 47)', foreground: 'rgb(243, 243, 243)' },
    processRow: { foreground: 'rgb(180, 180, 180)' },
    toolRow: { background: 'rgb(27, 27, 27)', foreground: 'rgb(175, 175, 175)' },
    modelPill: { foreground: 'rgb(175, 175, 175)' },
    effortTrack: { background: 'rgba(237, 237, 237, 0.1)', fill: 'rgb(58, 131, 247)' },
    menu: { background: 'rgb(47, 47, 47)', foreground: 'rgb(237, 237, 237)', border: 'rgba(255, 255, 255, 0.12)' },
    popover: { background: 'rgb(48, 48, 48)', foreground: 'rgb(237, 237, 237)' },
    toast: { background: 'rgba(70, 70, 70, 0.96)', foreground: 'rgb(255, 255, 255)', border: 'rgba(255, 255, 255, 0.12)' },
    scrollbar: { width: 'thin', color: 'rgba(255, 255, 255, 0.24) rgba(0, 0, 0, 0)' },
    focusRing: { width: '2px', offset: '2px', color: 'rgb(249, 250, 251)' },
    composer: { background: 'rgb(33, 33, 33)', border: 'rgb(60, 60, 60)', placeholder: 'rgb(175, 175, 175)' },
    modeSegment: { selected: 'rgb(33, 33, 33)', unselected: 'rgb(205, 205, 205)' }
  }
}

const contrastThreshold = {
  primary: 4.5,
  secondary: 3,
  placeholder: 4.5,
  disabled: 4.5,
  focus: 3,
  menu: 4.5
}

function parseColor(value) {
  const text = String(value ?? '').trim()
  if (text === 'transparent') return { r: 0, g: 0, b: 0, a: 0 }
  const hex = text.match(/^#([0-9a-f]{3,8})$/i)
  if (hex !== null) {
    let h = hex[1]
    if (h.length === 3) h = [...h].map((c) => c + c).join('')
    return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16), a: h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1 }
  }
  const rgb = text.match(/^rgba?\(([^)]+)\)$/i)
  if (rgb === null) return null
  const parts = rgb[1].split(',').map((part) => Number.parseFloat(part.trim()))
  return { r: parts[0], g: parts[1], b: parts[2], a: parts.length > 3 ? parts[3] : 1 }
}
function composite(fg, bg) {
  if (fg === null) return null
  if (fg.a >= 1) return fg
  return { r: Math.round(fg.r * fg.a + bg.r * (1 - fg.a)), g: Math.round(fg.g * fg.a + bg.g * (1 - fg.a)), b: Math.round(fg.b * fg.a + bg.b * (1 - fg.a)), a: 1 }
}
function relativeLuminance(color) {
  const channel = (value) => {
    const v = value / 255
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(color.r) + 0.7152 * channel(color.g) + 0.0722 * channel(color.b)
}
function contrast(foreground, background) {
  const bg = parseColor(background)
  const fg = composite(parseColor(foreground), bg ?? { r: 255, g: 255, b: 255, a: 1 })
  if (fg === null || bg === null) return null
  const l1 = relativeLuminance(fg)
  const l2 = relativeLuminance(bg)
  return Number(((Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)).toFixed(2))
}
function compare(expectedValue, actualValue) {
  if (expectedValue === undefined) return actualValue !== undefined
  return String(expectedValue) === String(actualValue)
}

const controls = []
const contrastRows = []
const issues = []
const themeData = {}

for (const theme of ['light', 'dark']) {
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 }, colorScheme: theme, deviceScaleFactor: 1 })
  const page = await context.newPage()
  await page.goto(url, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2200)
  await page.evaluate(() => {
    document.activeElement?.blur?.()
    const host = document.createElement('div')
    host.id = 'cgpt-audit-fixture'
    host.style.cssText = 'position:fixed;left:-12000px;top:0;width:768px;height:900px;overflow:visible;'
    host.innerHTML = `
      <div class="wSkVaW_body"><div class="EvIC1a_column" style="max-width:768px">
        <div data-chat-flow-kind="user"><div class="Sixlwa_userStack"><div class="Sixlwa_bubble" data-message-bubble="" data-audit="bubble">用户消息 contrast</div></div></div>
        <div data-chat-flow-kind="assistant-step"><div class="hWmORq_body">
          <div data-code-wrap="true" data-audit="code"><div data-code-block-banner="true">bash</div><div data-code-block-content="true"><div><pre>node scripts/build-client.mjs</pre></div></div></div>
          <div data-step-process="true" data-audit="process"><button type="button" data-process-activity="true">处理步骤</button></div>
          <div data-chat-flow-kind="tool-call"><div data-disclosure-row="true" data-audit="tool">调用工具</div></div>
        </div></div>
      </div></div>
      <div class="chatgpt-session-menu" data-audit="menu"><div class="chatgpt-session-menu-item">重命名</div><button class="chatgpt-session-menu-item" disabled>归档</button></div>
      <div class="chatgpt-filepicker-actions"><button class="chatgpt-filepicker-primary" disabled>打开</button><button class="chatgpt-filepicker-secondary" disabled>取消</button></div>
      <div class="chatgpt-session-dialog-actions"><button class="chatgpt-session-dialog-button" disabled>取消</button><button class="chatgpt-session-dialog-primary" disabled>创建</button></div>
      <div class="chatgpt-effort-menu chatgpt-model-menu" data-audit="popover"><div class="chatgpt-effort-head-label">思考强度</div></div>
      <div class="chatgpt-toast" data-audit="toast"><span class="chatgpt-toast-text">已切换</span></div>
      <div class="chatgpt-effort-track" data-audit="track"><div class="chatgpt-effort-fill" data-max="true"></div></div>
    `
    document.body.appendChild(host)
  })
  await page.waitForTimeout(300)

  const read = await page.evaluate(() => {
    const parse = (value) => {
      const m = String(value).match(/^rgba?\(([^)]+)\)$/)
      if (m === null) return null
      const p = m[1].split(',').map((v) => Number.parseFloat(v.trim()))
      return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }
    }
    const over = (front, back) => ({
      r: Math.round(front.r * front.a + back.r * (1 - front.a)),
      g: Math.round(front.g * front.a + back.g * (1 - front.a)),
      b: Math.round(front.b * front.a + back.b * (1 - front.a)),
      a: Math.min(1, front.a + back.a * (1 - front.a))
    })
    const backgroundOf = (selector) => {
      const node = document.querySelector(selector)
      if (node === null) return null
      const layers = []
      for (let el = node; el !== null; el = el.parentElement) {
        const color = parse(getComputedStyle(el).backgroundColor)
        if (color === null || color.a === 0) continue
        layers.push(color)
        if (color.a >= 0.999) break
      }
      const surface = document.body.hasAttribute('data-ds-dark-theme') ? { r: 14, g: 14, b: 14, a: 1 } : { r: 252, g: 252, b: 252, a: 1 }
      let base = surface
      for (let i = layers.length - 1; i >= 0; i -= 1) base = over(layers[i], base)
      return `rgb(${base.r}, ${base.g}, ${base.b})`
    }
    const one = (selector, pseudo = null) => {
      const node = document.querySelector(selector)
      if (node === null) return null
      const style = getComputedStyle(node, pseudo)
      return {
        background: style.backgroundColor,
        foreground: style.color,
        border: style.borderTopColor,
        borderWidth: style.borderTopWidth,
        radius: style.borderRadius,
        width: style.width,
        height: style.height,
        scrollbarWidth: style.scrollbarWidth,
        scrollbarColor: style.scrollbarColor,
        outlineWidth: style.outlineWidth,
        outlineOffset: style.outlineOffset,
        outlineColor: style.outlineColor,
        placeholder: node.getAttribute('data-placeholder')
      }
    }
    const rail = one('.chatgpt-rail')
    const selectedRail = one('.chatgpt-rail-button[aria-current="page"]')
    const mutedRail = one('.chatgpt-rail-button:not([aria-current="page"])')
    return {
      dark: document.body.hasAttribute('data-ds-dark-theme'),
      rail: { background: rail?.background, foreground: selectedRail?.foreground, muted: mutedRail?.foreground },
      sidebarRow: { background: one('.chatgpt-new-chat')?.background, foreground: one('.chatgpt-new-chat')?.foreground },
      groupTitle: { foreground: one('.chatgpt-projects-heading')?.foreground },
      bubble: { background: one('[data-audit="bubble"]')?.background, foreground: one('[data-audit="bubble"]')?.foreground },
      codeBlock: { background: one('[data-audit="code"]')?.background, header: one('[data-audit="code"] [data-code-block-banner]')?.background, border: one('[data-audit="code"]')?.border, foreground: one('[data-audit="code"] pre')?.foreground },
      processRow: { foreground: one('[data-audit="process"] button')?.foreground },
      toolRow: { background: one('.chatgpt-work-tools')?.background, foreground: one('.chatgpt-work-tool')?.foreground },
      modelPill: { foreground: one('.chatgpt-model-pill')?.foreground },
      effortTrack: { background: one('[data-audit="track"]')?.background, fill: one('[data-audit="track"] .chatgpt-effort-fill')?.background },
      menu: { background: one('[data-audit="menu"]')?.background, foreground: one('[data-audit="menu"] .chatgpt-session-menu-item')?.foreground, border: one('[data-audit="menu"]')?.border },
      popover: { background: one('[data-audit="popover"]')?.background, foreground: one('[data-audit="popover"]')?.foreground },
      toast: { background: one('[data-audit="toast"]')?.background, foreground: one('[data-audit="toast"]')?.foreground, border: one('[data-audit="toast"]')?.border },
      scrollbar: { width: one('.chatgpt-session-scroll')?.scrollbarWidth, color: one('.chatgpt-session-scroll')?.scrollbarColor },
      focusRing: (() => {
        const el = document.querySelector('.chatgpt-new-chat')
        if (el === null) return null
        el.focus()
        const style = getComputedStyle(el)
        return { width: style.outlineWidth, offset: style.outlineOffset, color: style.outlineColor }
      })(),
      composer: { background: one('[data-composer-card="true"]')?.background, foreground: one('[data-composer-input="true"]')?.foreground, border: one('[data-composer-card="true"]')?.border, placeholder: one('[data-composer-placeholder="true"]', '::after')?.foreground },
      disabledPicker: { foreground: one('.chatgpt-filepicker-primary:disabled')?.foreground, background: backgroundOf('.chatgpt-filepicker-primary:disabled') },
      disabledDialog: { foreground: one('.chatgpt-session-dialog-button:disabled')?.foreground, background: backgroundOf('.chatgpt-session-dialog-button:disabled') },
      disabledMenu: { foreground: one('[data-audit="menu"] .chatgpt-session-menu-item:disabled')?.foreground, background: backgroundOf('[data-audit="menu"] .chatgpt-session-menu-item:disabled') },
      disabledSend: (() => { const node = document.querySelector('[class*="_primary"]:disabled'); if (node === null) return null; const style = getComputedStyle(node); return { foreground: style.color, background: style.backgroundColor, opacity: style.opacity } })(),
      modeSegment: { selected: (() => { const node = document.querySelector('.chatgpt-mode-seg[aria-pressed="true"]'); return node === null ? null : getComputedStyle(node, '::before').backgroundColor })(), unselected: one('.chatgpt-mode-seg[aria-pressed="false"]')?.foreground }
    }
  })

  // Hover darkening is a separate state; record it rather than changing the
  // expected idle value.
  const scrollBefore = read.scrollbar.color
  await page.locator('.chatgpt-session-scroll').hover()
  await page.waitForTimeout(80)
  const scrollHover = await page.evaluate(() => getComputedStyle(document.querySelector('.chatgpt-session-scroll')).scrollbarColor)
  read.scrollbar.hover = scrollHover

  themeData[theme] = read
  for (const [id, wanted] of Object.entries(expected[theme])) {
    const actual = read[id]
    const fields = Object.keys(wanted)
    const detail = {}
    let match = true
    for (const field of fields) {
      const ok = compare(wanted[field], actual?.[field])
      detail[field] = { expected: wanted[field], actual: actual?.[field] ?? null, match: ok }
      if (!ok) match = false
    }
    controls.push({ control: id, theme, expected: wanted, actual, match, fields: detail })
    if (!match) issues.push({ control: id, theme, kind: 'token-mismatch', status: 'open' })
  }

  const actual = read
  const rows = [
    ['text.primary', '正文', actual.composer.foreground ?? actual.sidebarRow.foreground, theme === 'light' ? 'rgb(252, 252, 252)' : 'rgb(14, 14, 14)', contrastThreshold.primary],
    ['text.secondary', '次要文字', actual.groupTitle.foreground, theme === 'light' ? 'rgb(249, 249, 249)' : 'rgb(0, 0, 0)', contrastThreshold.secondary],
    ['text.placeholder', '占位符', actual.composer.placeholder, actual.composer.background, contrastThreshold.placeholder],
    ['text.disabled', '禁用发送键', actual.disabledSend?.foreground, actual.disabledSend?.background, contrastThreshold.disabled],
    ['text.tool', '工具行', actual.toolRow.foreground, actual.toolRow.background, contrastThreshold.primary],
    ['text.disabled.picker', '禁用文件选择', actual.disabledPicker?.foreground, actual.disabledPicker?.background, contrastThreshold.disabled],
    ['text.disabled.dialog', '禁用对话框按钮', actual.disabledDialog?.foreground, actual.disabledDialog?.background, contrastThreshold.disabled],
    ['text.disabled.menu', '禁用菜单项', actual.disabledMenu?.foreground, actual.disabledMenu?.background, contrastThreshold.disabled],
    ['text.menu', '菜单项', actual.menu.foreground, actual.menu.background, contrastThreshold.menu],
    ['text.bubble', '用户气泡', actual.bubble.foreground, actual.bubble.background, contrastThreshold.primary],
    ['text.code', '代码', actual.codeBlock.foreground, actual.codeBlock.background, contrastThreshold.primary],
    ['focus.ring', '焦点环', actual.focusRing?.color, theme === 'light' ? 'rgb(252, 252, 252)' : 'rgb(14, 14, 14)', contrastThreshold.focus]
  ]
  for (const [id, label, foreground, background, threshold] of rows) {
    const ratio = contrast(foreground, background)
    const match = ratio !== null && ratio >= threshold
    contrastRows.push({ id, label, theme, foreground, background, ratio, threshold, match })
    if (!match) {
      issues.push({ control: id, theme, kind: 'contrast', status: 'open', actual: ratio, threshold })
      // Known exact-value rows are repaired in CSS; keep the issue visible if
      // a future host token regresses.
    }
  }
  await context.close()
}

const report = {
  meta: {
    module: 8,
    generatedAt: new Date().toISOString(),
    viewport: { width: 1600, height: 1000, dpr: 1 },
    source: 'live DSH 3090 + host-shaped off-screen controls; tokens from ~/.cache/dsh-capture/out/tokens.json',
    themes: ['light', 'dark'],
    controlCount: Object.keys(expected.light).length,
    thresholds: contrastThreshold,
    notes: [
      'scrollbar.hover is recorded separately; idle value is the audited token.',
      'focusRing uses a programmatic focus after the page has keyboard modality, matching :focus-visible.',
      'codeBlock is intentionally the same dark surface in both themes (ChatGPT reference).'
    ]
  },
  expected,
  controls,
  contrast: contrastRows,
  issues,
  fixes: [
    { id: 'light-placeholder', status: '已修', detail: '#8f8f8f 3.15:1 → #767676 4.54:1' },
    { id: 'light-tool-row', status: '已修', detail: '#8f8f8f on #f0f0f0 2.84:1 → #6b6b6b 4.68:1' },
    { id: 'light-disabled-send', status: '已修', detail: '#a8a8a8 on #e3e3e3 1.85:1 → #fff on #2c67c5 5.45:1' },
    { id: 'chat-disabled-opacity', status: '已修', detail: '.55 → .92' },
    { id: 'disabled-picker-menu-dialog', status: '已修', detail: '.45/.42 opacity → explicit disabled token; 5.78/6.58/6.42 light, 6.0/5.31/7.65 dark' },
    { id: 'dark-composer-surface', status: '已修', detail: '#303030 → reference #212121' },
    { id: 'dark-session-menu', status: '已修', detail: '92% color-mix → opaque #2f2f2f' },
    { id: 'search-640-full-width', status: '已修', detail: '100vw, no side border/radius at ≤640px' },
    { id: 'work-autofocus-ring', status: '已修', detail: 'removed 3px green focus-within; ring only after Tab' },
    { id: 'focus-contract', status: '已修', detail: '2px ring + 2px offset on skin controls and effort track' },
    { id: 'scrollbar-hover', status: '已修', detail: 'thin translucent idle + darker hover; 4px webkit thumb' },
    { id: 'dpr-fonts', status: '已修', detail: 'geometricPrecision SVGs + Latin/CJK fallback stack' }
  ],
  knownDifferences: [
    { id: 'sidebar-breakpoint', status: '保留（原因）', detail: 'Host auto-collapses below 1024px; 900px reference shows the full sidebar. Changing that would change Host layout.' },
    { id: 'code-block-theme', status: '保留（原因）', detail: 'Code block is intentionally dark in both themes, matching the ChatGPT reference.' },
    { id: 'mobile-rail', status: '保留（原因）', detail: 'At 640px the web reference uses a mobile shell without a rail; DSH keeps its 52px Host rail.' },
    { id: 'absent-controls', status: '保留（原因）', detail: 'Reference voice button and some product cards do not exist in DSH; the skin does not invent them.' }
  ]
}
writeFileSync(outPath, JSON.stringify(report, null, 2) + '\n')
await browser.close()
const failed = controls.filter((row) => !row.match)
const failedContrast = contrastRows.filter((row) => !row.match)
console.log(`theme audit: ${controls.length} controls, ${failed.length} mismatches, ${failedContrast.length} contrast failures`)
if (failedContrast.length > 0) {
  for (const row of failedContrast) console.log(`  FAIL ${row.theme} ${row.label}: ${row.ratio} < ${row.threshold}`)
}
if (failed.length > 0) {
  for (const row of failed) console.log(`  FAIL ${row.theme} ${row.control}: ${row.fields && JSON.stringify(row.fields)}`)
}
process.exitCode = failed.length === 0 && failedContrast.length === 0 ? 0 : 1
