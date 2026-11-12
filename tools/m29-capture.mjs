#!/usr/bin/env node
/**
 * tools/m29-capture.mjs — P0-17 Chat composer evidence and assertions.
 *
 * Opens the isolated DSH instance (the M28 four-level fixture), enters Chat,
 * starts a fresh Chat conversation and records:
 *
 *   • docs/m29.json                 every measured number, both themes
 *   • docs/screenshots/m29-*.png    empty / existing / hover-+ (4×) / focus
 *
 *   node tools/m29-capture.mjs --url "http://127.0.0.1:3107/?token=…" [--out docs]
 *
 * Reference: docs/reference/m28-chat-empty-desktop-dark.webp is the desktop 2x
 * capture (2467×1700 → 1233.5×850 CSS). Measured with a canvas pixel scan:
 * card x 478..1991 device → 239..995.5 CSS, width 1514 device = 757 CSS,
 * height 104 device = 52 CSS, radius = height/2 = 26. The same scan reads
 * page #0e0e0e and card #212121.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
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
const url = args.get('url')
if (typeof url !== 'string') {
  console.error('usage: node tools/m29-capture.mjs --url <tokenised-url> [--out docs]')
  process.exit(2)
}
const OUT = resolve(ROOT, typeof args.get('out') === 'string' ? args.get('out') : 'docs')
const SHOTS = join(OUT, 'screenshots')
mkdirSync(SHOTS, { recursive: true })

const playwrightPath = process.env.M29_PLAYWRIGHT ?? 'playwright'
const CHROME = process.env.CHATGPT_UI_CHROME ?? process.env.HOME + '/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome'
const { chromium } = await import(playwrightPath)

const redact = (value) => value.replace(/([?&]token=)[^&]+/, '$1***')
const round = (value) => Math.round(value * 100) / 100

/** Desktop reference, measured from the 2x WebP (see the header comment). */
const REFERENCE = {
  file: 'docs/reference/m28-chat-empty-desktop-dark.webp',
  device: { w: 2467, h: 1700 },
  window: { w: 1233.5, h: 850 },
  scale: 2,
  card: { x0: 478, x1: 1991, y0: 796, y1: 899, w: 1514, h: 104 },
  css: { x0: 239, x1: 995.5, y0: 398, y1: 449.5, w: 757, h: 52, radius: 26, background: '#212121', page: '#0e0e0e' }
}

const browser = await chromium.launch({ headless: true, executablePath: CHROME, args: ['--no-sandbox', '--disable-dev-shm-usage'] })

const rect = (box) => ({ x: round(box.x), y: round(box.y), w: round(box.width), h: round(box.height), right: round(box.right), bottom: round(box.bottom) })

/** The handful of in-card controls the Chat reference keeps. */
const measure = (page) =>
  page.evaluate(() => {
    const round = (value) => Math.round(value * 100) / 100
    const box = (el) => {
      if (el === null || el === undefined) return null
      const b = el.getBoundingClientRect()
      return { x: round(b.x), y: round(b.y), w: round(b.width), h: round(b.height), right: round(b.right), bottom: round(b.bottom) }
    }
    const q = (selector) => document.querySelector(selector)
    const card = q("[data-composer-card='true']")
    const stack = card?.closest("[class*='_composerStack']")
    const hero = Boolean(q("[class*='_composerHero']"))
    const input = q("[data-composer-input='true']")
    const placeholder = q('[data-composer-placeholder="true"]')
    const plus = q('.chatgpt-chat-files')
    const plusSvg = plus?.querySelector('svg')
    const pill = q('[data-cgpt-pill-compact="true"]')
    const send = q("[data-composer-card='true'] button[class*='_primary']")
    const style = (el) => (el === null || el === undefined ? null : getComputedStyle(el))
    const cardStyle = style(card)
    const plusStyle = style(plus)
    const svgBox = box(plusSvg)
    const plusBox = box(plus)
    const contextInCard = [...document.querySelectorAll("[data-composer-card='true'] [aria-label*='上下文'], [data-composer-card='true'] [aria-label*='工作区'], [data-composer-card='true'] [class*='_workspace']")]
    const forbiddenSelectors = [
      ["host context-size seat", "[data-composer-card='true'] [data-slot='conversation.input.right'] > :not([data-cgpt-model-pill])"],
      ["host model seat", "[data-composer-card='true'] [data-slot='conversation.input.model'] > :not([data-cgpt-model-pill])"],
      ["host add-files button", "[data-composer-card='true'] button[class*='_add']"],
      ["host access-mode chip", "[data-composer-card='true'] [data-slot='conversation.input.permission'] button"],
      ["plugin permission chip", "[data-composer-card='true'] .chatgpt-permission"],
      ["read-only note", "[data-composer-card='true'] .chatgpt-readonly"]
    ]
    const hiddenControls = forbiddenSelectors.map(([name, selector]) => {
      const nodes = [...document.querySelectorAll(selector)]
      const visible = nodes.filter((node) => {
        const cs = getComputedStyle(node)
        return cs.display !== 'none' && cs.visibility !== 'hidden' && node.getBoundingClientRect().width > 0
      })
      return { name, selector, domCount: nodes.length, visibleCount: visible.length }
    })
    const heroRow = q("[class*='_heroWorkspaceRow']")
    hiddenControls.push({
      name: 'hero workspace chip (above the card)',
      selector: "[class*='_heroWorkspaceRow'] button[class*='_workspace']",
      domCount: heroRow === null ? 0 : heroRow.querySelectorAll("button[class*='_workspace']").length,
      visibleCount: heroRow === null ? 0 : [...heroRow.querySelectorAll("button[class*='_workspace']")].filter((node) => getComputedStyle(node).display !== 'none').length
    })
    const buttons = card === null ? [] : [...card.querySelectorAll('button')].map((button) => {
      const cs = getComputedStyle(button)
      return {
        aria: button.getAttribute('aria-label'),
        text: (button.innerText ?? '').trim().slice(0, 20),
        className: String(button.className).slice(0, 60),
        box: box(button),
        visible: cs.display !== 'none' && button.getBoundingClientRect().width > 0
      }
    })
    // Resolve the Host's reading-column width at the card (the custom property
    // holds an unresolved clamp on purpose; a probe box is the used value).
    let columnWidth = null
    if (card !== null) {
      const probe = document.createElement('div')
      probe.setAttribute('data-cgpt-measure', 'column')
      probe.style.cssText = 'position:absolute;left:0;top:0;visibility:hidden;pointer-events:none;width:var(--dsh-chat-content-width, 0px);height:0'
      card.appendChild(probe)
      columnWidth = round(probe.getBoundingClientRect().width)
      probe.remove()
    }
    return {
      theme: document.body.hasAttribute('data-ds-dark-theme') ? 'dark' : 'light',
      mode: document.body.getAttribute('data-chatgpt-mode'),
      hero,
      viewport: { w: innerWidth, h: innerHeight, dpr: devicePixelRatio },
      card: box(card),
      columnWidth,
      cardStyle: cardStyle === null ? null : {
        width: cardStyle.width,
        height: cardStyle.height,
        maxWidth: cardStyle.maxWidth,
        radius: cardStyle.borderRadius,
        background: cardStyle.backgroundColor,
        border: `${cardStyle.borderTopWidth} ${cardStyle.borderTopColor}`,
        padding: cardStyle.padding,
        gap: cardStyle.gap
      },
      stackClass: stack?.className ?? null,
      input: input === null ? null : {
        box: box(input),
        contenteditable: input.getAttribute('contenteditable'),
        aria: input.getAttribute('aria-label'),
        padding: getComputedStyle(input).padding,
        fontSize: getComputedStyle(input).fontSize,
        lineHeight: getComputedStyle(input).lineHeight
      },
      placeholder: placeholder === null ? null : {
        box: box(placeholder),
        text: placeholder.textContent,
        fontSize: getComputedStyle(placeholder).fontSize,
        after: getComputedStyle(placeholder, '::after').content,
        afterSize: getComputedStyle(placeholder, '::after').fontSize,
        afterColor: getComputedStyle(placeholder, '::after').color
      },
      plus: plusBox === null ? null : {
        box: plusBox,
        svg: svgBox,
        centerDelta: svgBox === null ? null : { x: round(svgBox.x + svgBox.w / 2 - (plusBox.x + plusBox.w / 2)), y: round(svgBox.y + svgBox.h / 2 - (plusBox.y + plusBox.h / 2)) },
        radius: plusStyle.borderRadius,
        background: plusStyle.backgroundColor,
        color: plusStyle.color,
        svgSize: svgBox === null ? null : { w: svgBox.w, h: svgBox.h }
      },
      pill: box(pill) === null ? null : { box: box(pill), text: (pill.innerText ?? '').trim(), fontSize: getComputedStyle(pill).fontSize, color: getComputedStyle(pill).color, padding: getComputedStyle(pill).padding },
      send: send === null ? null : { box: box(send), background: getComputedStyle(send).backgroundColor, radius: getComputedStyle(send).borderRadius },
      buttons,
      contextOrWorkspaceInCard: contextInCard.length,
      hiddenControls
    }
  })

/** Focus the editor and leave a collapsed selection after one typed character. */
const focusEditor = async (page) => {
  const input = page.locator('[data-composer-input="true"]').first()
  const box = await input.boundingBox()
  if (box === null) return null
  const point = { x: box.x + Math.min(80, box.width / 2), y: box.y + box.height / 2 }
  const hit = await page.evaluate(({ x, y }) => {
    const node = document.elementFromPoint(x, y)
    return {
      tag: node?.tagName ?? null,
      className: String(node?.className ?? '').slice(0, 80),
      aria: node?.getAttribute?.('aria-label') ?? null,
      contenteditable: node?.getAttribute?.('contenteditable') ?? null,
      insideComposer: node?.closest?.("[data-composer-input='true']") !== null
    }
  }, point)
  await page.mouse.click(point.x, point.y)
  await page.waitForTimeout(120)
  await page.keyboard.type('你好')
  await page.waitForTimeout(80)
  const focus = await page.evaluate(() => {
    const active = document.activeElement
    const selection = window.getSelection()
    return {
      activeTag: active?.tagName ?? null,
      activeAria: active?.getAttribute?.('aria-label') ?? null,
      isComposer: active?.getAttribute?.('data-composer-input') === 'true',
      cardFocusWithin: document.querySelector("[data-composer-card='true']")?.matches(':focus-within') === true,
      selectionType: selection?.type ?? null,
      selectionText: selection?.toString() ?? '',
      caretColor: active === null ? null : getComputedStyle(active).caretColor
    }
  })
  // Chromium's screenshot path never paints the native caret (six frames 120ms
  // apart hash identically). Leave a same-colour, same-height marker at the real
  // collapsed selection so the evidence frame shows where the caret is; remove
  // it before the next interaction. `nativeCaretPainted: false` records this.
  const caretMarker = await page.evaluate(() => {
    const active = document.activeElement
    const selection = window.getSelection()
    if (active === null || selection === null || selection.rangeCount === 0) return null
    const range = selection.getRangeAt(0).cloneRange()
    const rect = range.getBoundingClientRect()
    const height = rect.height || parseFloat(getComputedStyle(active).lineHeight) || 26
    const color = getComputedStyle(active).caretColor
    const bar = document.createElement('div')
    bar.setAttribute('data-cgpt-evidence-caret', '')
    bar.style.cssText = `position:fixed;left:${rect.left}px;top:${rect.top}px;width:2px;height:${height}px;background:${color};border-radius:1px;pointer-events:none;z-index:2147483647`
    document.body.appendChild(bar)
    return { synthetic: true, reason: 'Chromium screenshots omit the native caret', rect: { x: rect.left, y: rect.top, w: 2, h: height }, color }
  })
  return { ...focus, hit, caretMarker, nativeCaretPainted: false }
}

const clearCaretMarker = (page) =>
  page.evaluate(() => {
    for (const node of document.querySelectorAll('[data-cgpt-evidence-caret]')) node.remove()
  })

const openPage = async ({ width, height, colorScheme, dpr = 2 }) => {
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: dpr, locale: 'zh-CN', colorScheme })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(String(error).slice(0, 200)))
  await page.goto(url, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1000)
  const notice = page.getByRole('button', { name: /继续|Continue/ })
  if ((await notice.count()) > 0) {
    await notice.first().click()
    await page.waitForTimeout(400)
  }
  const chatSegment = page.locator('.chatgpt-mode-seg', { hasText: '聊天' })
  if ((await chatSegment.count()) === 0) throw new Error('m29: Chat segment missing (is the page a hero?)')
  if ((await chatSegment.first().getAttribute('aria-pressed')) !== 'true') {
    await chatSegment.first().click()
    await page.waitForTimeout(700)
  }
  return { context, page, errors }
}

/** A fresh Chat conversation. Before P0-17 this left the composer inert. */
const newChat = async (page) => {
  await page.locator('.chatgpt-new-chat').first().click()
  await page.waitForTimeout(1000)
}

const results = {}
const assertions = []
const check = (id, ok, detail) => assertions.push({ id, ok: ok === true, detail })

for (const theme of ['light', 'dark']) {
  const { context, page, errors } = await openPage({ width: 1233, height: 850, colorScheme: theme })
  await newChat(page)
  const empty = await measure(page)
  await page.screenshot({ path: join(SHOTS, `m29-chat-empty-${theme}.png`) })

  const focus = await focusEditor(page)
  await page.screenshot({ path: join(SHOTS, `m29-focus-${theme}.png`) })
  await clearCaretMarker(page)
  await page.keyboard.press('Enter')
  await page.waitForTimeout(2600)
  const existing = await measure(page)
  await page.screenshot({ path: join(SHOTS, `m29-chat-existing-${theme}.png`) })

  const clickExisting = await (async () => {
    const input = page.locator('[data-composer-input="true"]').first()
    const box = await input.boundingBox()
    if (box === null) return null
    await page.mouse.click(box.x + Math.min(120, box.width / 2), box.y + box.height / 2)
    await page.waitForTimeout(120)
    return page.evaluate(() => {
      const active = document.activeElement
      const selection = window.getSelection()
      return {
        activeTag: active?.tagName ?? null,
        activeAria: active?.getAttribute?.('aria-label') ?? null,
        isComposer: active?.getAttribute?.('data-composer-input') === 'true',
        cardFocusWithin: document.querySelector("[data-composer-card='true']")?.matches(':focus-within') === true,
        selectionType: selection?.type ?? null
      }
    })
  })()

  // Hover geometry, measured while the pointer is on the `+`.
  const plus = page.locator('.chatgpt-chat-files').first()
  await plus.hover()
  await page.waitForTimeout(160)
  const hover = await plus.evaluate((node) => {
    const b = node.getBoundingClientRect()
    const svg = node.querySelector('svg')
    const s = svg.getBoundingClientRect()
    const cs = getComputedStyle(node)
    return {
      background: cs.backgroundColor,
      radius: cs.borderRadius,
      diameter: Math.round(b.width * 100) / 100,
      icon: { w: Math.round(s.width * 100) / 100, h: Math.round(s.height * 100) / 100 },
      centerDelta: {
        x: Math.round((s.x + s.width / 2 - (b.x + b.width / 2)) * 100) / 100,
        y: Math.round((s.y + s.height / 2 - (b.y + b.height / 2)) * 100) / 100
      }
    }
  })
  await context.close()

  // 4× hover frame: same page state, deviceScaleFactor 4, tight clip.
  const zoomed = await openPage({ width: 1233, height: 850, colorScheme: theme, dpr: 4 })
  await newChat(zoomed.page)
  const zoomPlus = zoomed.page.locator('.chatgpt-chat-files').first()
  await zoomPlus.hover()
  await zoomed.page.waitForTimeout(160)
  const zoomBox = await zoomPlus.boundingBox()
  if (zoomBox !== null) {
    await zoomed.page.screenshot({
      path: join(SHOTS, `m29-plus-hover-${theme}.png`),
      clip: { x: zoomBox.x - 10, y: zoomBox.y - 10, width: zoomBox.width + 20, height: zoomBox.height + 20 }
    })
  }
  await zoomed.context.close()

  results[theme] = { empty, focus, existing, clickExisting, hover, errors }
}

/** Widths only, for the fixed-empty / column-minus-60 sweep. */
const measureWidths = (page) =>
  page.evaluate(() => {
    const round = (value) => Math.round(value * 100) / 100
    const card = document.querySelector("[data-composer-card='true']")
    const box = card.getBoundingClientRect()
    const probe = document.createElement('div')
    probe.style.cssText = 'position:absolute;left:0;top:0;visibility:hidden;pointer-events:none;width:var(--dsh-chat-content-width, 0px);height:0'
    card.appendChild(probe)
    const column = round(probe.getBoundingClientRect().width)
    probe.remove()
    return { x: round(box.x), w: round(box.width), h: round(box.height), column }
  })

const responsive = []
for (const width of [1233, 1440, 1600, 1920]) {
  const run = await openPage({ width, height: 900, colorScheme: 'dark', dpr: 1 })
  await newChat(run.page)
  const empty = await measureWidths(run.page)
  const input = run.page.locator('[data-composer-input="true"]').first()
  const inputBox = await input.boundingBox()
  if (inputBox !== null) {
    await run.page.mouse.click(inputBox.x + Math.min(80, inputBox.width / 2), inputBox.y + inputBox.height / 2)
    await run.page.keyboard.type('宽')
    await run.page.keyboard.press('Enter')
    await run.page.waitForTimeout(2200)
  }
  const existing = await measureWidths(run.page)
  responsive.push({ width, empty, existing })
  await run.context.close()
}

// ---- assertions -----------------------------------------------------------
const refWidth = REFERENCE.css.w
for (const theme of ['light', 'dark']) {
  const frame = results[theme]
  const emptyWidth = frame.empty.card?.w ?? 0
  check(`empty width ${theme}`, Math.abs(emptyWidth - refWidth) / refWidth <= 0.005, `${emptyWidth}px vs reference ${refWidth}px (${round((Math.abs(emptyWidth - refWidth) / refWidth) * 10000) / 100}%)`)
  const column = frame.existing.columnWidth
  const cardWidth = frame.existing.card?.w ?? 0
  check(`existing width = column − 60 (${theme})`, column !== null && Math.abs(cardWidth - (column - 60)) <= 1, `card ${cardWidth}px, column ${column}px`)
  check(`existing inset 30px (${theme})`, column !== null && Math.abs((column - cardWidth) / 2 - 30) <= 0.5, `(${column} − ${cardWidth}) / 2 = ${round((column - cardWidth) / 2)}px`)
  check(`+ centre delta ≤ 0.5px (${theme})`, frame.hover.centerDelta.x <= 0.5 && frame.hover.centerDelta.y <= 0.5, JSON.stringify(frame.hover.centerDelta))
  check(`+ hover diameter 32–36 (${theme})`, frame.hover.diameter >= 32 && frame.hover.diameter <= 36, `${frame.hover.diameter}px`)
  check(`click empty composer focuses textbox (${theme})`, frame.focus?.isComposer === true && frame.focus?.selectionType === 'Caret', JSON.stringify(frame.focus))
  check(`click lands on the composer input (${theme})`, frame.focus?.hit?.insideComposer === true, JSON.stringify(frame.focus?.hit))
  check(`click established composer focuses textbox (${theme})`, frame.clickExisting?.isComposer === true, JSON.stringify(frame.clickExisting))
  const visibleForbidden = [...frame.empty.hiddenControls, ...frame.existing.hiddenControls].filter((entry) => entry.visibleCount > 0 && !entry.name.startsWith('hero workspace chip'))
  check(`no visible context/workspace control in the card (${theme})`, visibleForbidden.length === 0, visibleForbidden.map((entry) => entry.name).join(', ') || 'none')
  check(`no context/workspace element in the card DOM (${theme})`, frame.empty.contextOrWorkspaceInCard === 0 && frame.existing.contextOrWorkspaceInCard === 0, `empty ${frame.empty.contextOrWorkspaceInCard}, existing ${frame.existing.contextOrWorkspaceInCard}`)
  check(`existing placeholder is the shared Chat placeholder (${theme})`, frame.existing.placeholder?.after === frame.empty.placeholder?.after && String(frame.existing.placeholder?.after ?? '').includes('随便问点什么'), `${frame.empty.placeholder?.after} vs ${frame.existing.placeholder?.after}`)
  check(`existing capsule is fully rounded (${theme})`, frame.existing.cardStyle?.radius === '9999px' && frame.existing.card?.h === 52, `${frame.existing.cardStyle?.radius}, ${frame.existing.card?.h}px`)
  check(`existing surface is dark in dark theme (${theme})`, theme !== 'dark' || /rgb\((?:2\d|3[0-9]), (?:2\d|3[0-9]), (?:2\d|3[0-9])\)/.test(String(frame.existing.cardStyle?.background ?? '')), String(frame.existing.cardStyle?.background ?? ''))
}

// The old `61vw` grew to 976px at 1600; the desktop reference does not scale.
for (const frame of responsive) {
  check(`empty width stays 757 at ${frame.width}`, Math.abs(frame.empty.w - refWidth) / refWidth <= 0.005, `${frame.empty.w}px at ${frame.width}`)
  check(`existing width = column − 60 at ${frame.width}`, Math.abs(frame.existing.w - (frame.existing.column - 60)) <= 1, `card ${frame.existing.w}px, column ${frame.existing.column}px`)
}

const visibleButtons = (frame) => (frame.card === null ? [] : frame.buttons.filter((button) => button.visible).map((button) => button.aria ?? button.text))
for (const theme of ['light', 'dark']) {
  const labels = [...visibleButtons(results[theme].empty), ...visibleButtons(results[theme].existing)]
  check(`card controls are + / effort / send only (${theme})`, labels.every((label) => ['添加文件', '推理强度: 极高', '推理强度: 高', '发送消息'].includes(label) || label === ''), labels.join(' | '))
}

const report = {
  tool: 'm29-capture',
  measuredAt: new Date().toISOString(),
  url: redact(url),
  viewport: { w: 1233, h: 850, dpr: 2 },
  reference: REFERENCE,
  clickDiagnosis: {
    symptom: 'Clicking the Chat input opened the Host workspace picker instead of placing a caret.',
    previousHit: 'Host InputBar `workspaceTrigger` (role=textbox, aria-label=选择工作区, contenteditable=false)',
    cause: 'A blank Chat Session was created without a Workspace. Once workspaces.phase === ready, the Host ignores cwd, so chipTitle stayed undefined and the hero mounted the inert trigger instead of a Lexical editor.',
    fix: 'Open Chat in the deployment default (first) Workspace for an editable editor, hide that Workspace chip in Chat, keep Chat out of project groups in the sidebar, and claim legacy trigger clicks.',
    nowHit: { light: results.light.focus?.hit ?? null, dark: results.dark.focus?.hit ?? null }
  },
  notes: [
    'No context-size / workspace button exists inside the Chat card DOM. The Host workspace chip lives above the card and is display:none in Chat (domCount 1, visibleCount 0); it is listed in hiddenControls for transparency.',
    'Chromium screenshots omit the native caret. m29-focus-*.png carries a 2px marker at the real collapsed selection (same caret colour and line height); m29.json records nativeCaretPainted: false.',
    'The desktop reference wins over the web measurement: 757 CSS px from the 2x WebP, not the 768px live capsule. The old 61vw grew with the window (976px at 1600); the fixed 757px is the reference at every width, checked at 1233/1440/1600/1920.'
  ],
  screenshots: [
    'm29-chat-empty-light.png', 'm29-chat-empty-dark.png',
    'm29-chat-existing-light.png', 'm29-chat-existing-dark.png',
    'm29-plus-hover-light.png', 'm29-plus-hover-dark.png',
    'm29-focus-light.png', 'm29-focus-dark.png'
  ],
  themes: results,
  responsive,
  assertions,
  summary: {
    total: assertions.length,
    passed: assertions.filter((entry) => entry.ok).length,
    failed: assertions.filter((entry) => !entry.ok).map((entry) => entry.id)
  }
}
writeFileSync(join(OUT, 'm29.json'), `${JSON.stringify(report, null, 2)}\n`)
console.log(JSON.stringify(report.summary, null, 2))
for (const entry of assertions) if (!entry.ok) console.log(`FAIL ${entry.id}: ${entry.detail}`)
await browser.close()
if (report.summary.failed.length > 0) process.exit(1)
