#!/usr/bin/env node
/**
 * scripts/m15-process.mjs — measure the Host's execution-process region.
 *
 * M15 restored the process/step/tool/thinking region to the Host's own design:
 * the skin no longer rewrites the group title, pins row height/padding, changes
 * the icon column, or inflates the expanded reasoning body. This script captures
 * one state of the same fixture session so the gate can compare:
 *
 *   before   the pre-M15 skin (kept as the historical regression)
 *   native   skin off (`cgpt-skin=off`; the plugin mounts nothing)
 *   after    the skinned page with the M15 CSS
 *
 * Everything is measured relative to the process group's left edge, because the
 * skinned sidebar is wider than the native one and the absolute column x moves.
 * The compared surfaces are the ones the regression names: icon rectangle,
 * title/label/row font-size and line-height, rendered text (including CSS
 * generated content), title/row alignment and inter-row gaps.
 *
 *   node scripts/m15-process.mjs --url <tokenised-url> --tag before
 *   node scripts/m15-process.mjs --url <tokenised-url> --tag native --skin-off
 *   node scripts/m15-process.mjs --url <tokenised-url> --tag after
 *   node scripts/m15-process.mjs --report
 *
 * Dev-only tool: needs playwright + Chromium, same as the other capture scripts.
 * Read-only towards the Host: it opens a session, expands native disclosures and
 * writes only browser-local state.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DOCS = join(ROOT, 'docs')
const SHOTS = join(DOCS, 'screenshots')
const DEFAULT_OUT = join(ROOT, '.m15-tmp')
const TOLERANCE = 1
const CHROME = process.env.M15_CHROME ?? process.env.CHATGPT_UI_CHROME ?? process.env.HOME + '/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome'
const VIEWPORT = { width: 1600, height: 1000 }
const SESSION_TEXT = '跑一下过程区 fixture'

const args = new Map()
for (let index = 2; index < process.argv.length; index += 1) {
  const token = process.argv[index]
  if (!token.startsWith('--')) continue
  const key = token.slice(2)
  const next = process.argv[index + 1]
  if (next === undefined || next.startsWith('--')) args.set(key, true)
  else {
    args.set(key, next)
    index += 1
  }
}

const OUT = resolve(ROOT, typeof args.get('out') === 'string' ? args.get('out') : DEFAULT_OUT)
const round = (value) => Math.round(value * 10) / 10
const clean = (value) => (value ?? '').replace(/\s+/g, ' ').trim()

async function loadPlaywright() {
  const explicit = typeof args.get('playwright') === 'string' ? args.get('playwright') : process.env.PLAYWRIGHT_MODULE
  const errors = []
  for (const candidate of [
    explicit,
    process.env.PLAYWRIGHT_DIR,
    'playwright',
    'playwright',
    'playwright-core'
  ].filter(Boolean)) {
    try {
      return candidate.includes('/') ? await import(candidate) : await import(candidate)
    } catch (error) {
      errors.push(`${candidate}: ${error.message}`)
    }
  }
  throw new Error(`Playwright is required. Tried:\n${errors.join('\n')}`)
}

/** Open the fixture transcript in either the native or skinned sidebar. */
async function openFixture(page, skinOff) {
  const rows = page.locator(skinOff ? '[data-row-key^="session:"]' : '[data-cgpt-session-row]')
  const count = await rows.count()
  for (let index = 0; index < count; index += 1) {
    const row = rows.nth(index)
    const text = await row.innerText().catch(() => '')
    if (!text.includes(SESSION_TEXT)) continue
    await row.click({ force: true }).catch(() => {})
    await page.waitForTimeout(1400)
    if ((await page.locator('[data-chat-flow-kind="turn-process"]').count()) > 0) return true
  }
  return false
}

/** Open the native disclosures: process row, group title, first reasoning row. */
async function expand(page) {
  const processRow = page.locator('[data-chat-flow-kind="turn-process"] button').first()
  if (await processRow.count()) {
    const expanded = await processRow.getAttribute('aria-expanded').catch(() => null)
    if (expanded !== 'true') {
      await processRow.click({ force: true }).catch(() => {})
      await page.waitForTimeout(700)
    }
  }
  const groupTitle = page.locator('[data-step-process] button[data-process-activity]').first()
  if (await groupTitle.count()) {
    const expanded = await groupTitle.getAttribute('aria-expanded').catch(() => null)
    if (expanded !== 'true') {
      await groupTitle.click({ force: true }).catch(() => {})
      await page.waitForTimeout(800)
    }
  }
  const reasoning = page.locator('[data-step-process] [class*="lcKema_row"][data-expandable="true"]').first()
  if (await reasoning.count()) {
    const expanded = await reasoning.getAttribute('aria-expanded').catch(() => null)
    if (expanded !== 'true') {
      await reasoning.click({ force: true }).catch(() => {})
      await page.waitForTimeout(900)
    }
  }
}

/** Read every metric the regression report names, relative to the group edge. */
async function measure(page) {
  return page.evaluate(() => {
    const cleanText = (value) => (value ?? '').replace(/\s+/g, ' ').trim()
    const rect = (element) => {
      if (element === null || element === undefined) return null
      const box = element.getBoundingClientRect()
      return { x: +box.x.toFixed(1), y: +box.y.toFixed(1), w: +box.width.toFixed(1), h: +box.height.toFixed(1) }
    }
    const style = (element) => {
      if (element === null || element === undefined) return null
      const computed = getComputedStyle(element)
      return {
        fontSize: computed.fontSize,
        lineHeight: computed.lineHeight,
        display: computed.display,
        alignItems: computed.alignItems,
        justifyContent: computed.justifyContent,
        gap: computed.gap,
        padding: computed.padding,
        margin: computed.margin,
        opacity: computed.opacity,
        color: computed.color,
        backgroundColor: computed.backgroundColor
      }
    }
    const group = document.querySelector('[data-step-process]')
    const origin = group === null ? { x: 0, y: 0 } : group.getBoundingClientRect()
    const rel = (box) => (box === null ? null : { x: +(box.x - origin.x).toFixed(1), y: +(box.y - origin.y).toFixed(1), w: box.w, h: box.h })
    const relative = (element) => {
      const box = rect(element)
      return { rect: box, rel: rel(box) }
    }
    const generated = (element) => {
      if (element === null || element === undefined) return 'none'
      const content = getComputedStyle(element, '::after').content
      if (content === 'none' || content === 'normal' || content === '') return ''
      return content.replace(/^["']|["']$/g, '')
    }
    const iconCenter = (box) => (box === null ? null : +(box.y + box.h / 2).toFixed(1))

    const title = group?.querySelector('button[data-process-activity]')
    const label = title?.querySelector('[class*="_label"]')
    const leading = title?.querySelector('[class*="_leading"]')
    const icon = leading?.querySelector('svg')
    const body = group?.querySelector('[data-step-process-body]')
    const content = group?.querySelector('[data-step-process-content]')
    const labelRect = rect(label)
    const leadingRect = rect(leading)
    const iconRect = rect(icon)
    // The pre-M15 skin set `font-size: 0` on the label and painted the step
    // count through `::after`; the visible text is then only the generated
    // string. Native/after keep the Host label at its own size.
    const labelFontSize = label === null || label === undefined ? 0 : Number.parseFloat(getComputedStyle(label).fontSize)
    const titleRendered = labelFontSize === 0 ? generated(label) : `${cleanText(label?.textContent)}${generated(label)}`.trim()

    const rows = [...(group?.querySelectorAll('[data-disclosure-row]') ?? [])].map((row, index) => {
      const rowRect = rect(row)
      const rowIcon = row.querySelector('svg')
      const rowTitle = row.querySelector('[class*="_title"]')
      const rowSummary = row.querySelector('[class*="_summary"]')
      const rowLeading = row.querySelector('[class*="_leading"]')
      const rowIconRect = rect(rowIcon)
      const rowLeadingRect = rect(rowLeading)
      const rowTitleRect = rect(rowTitle)
      return {
        index,
        text: cleanText(row.textContent),
        title: cleanText(rowTitle?.textContent),
        summary: cleanText(rowSummary?.textContent),
        row: { ...relative(row), ...style(row) },
        icon: { ...relative(rowIcon), centerY: iconCenter(rowIconRect) },
        leading: { ...relative(rowLeading) },
        titleBox: { ...relative(rowTitle), ...style(rowTitle) },
        summaryBox: { ...relative(rowSummary), ...style(rowSummary) },
        iconTextGap: rowIconRect && rowTitleRect ? +(rowTitleRect.x - (rowLeadingRect.x + rowLeadingRect.w)).toFixed(1) : null,
        alignDelta: rowIconRect && rowTitleRect ? +(Math.abs(iconCenter(rowIconRect) - (rowTitleRect.y + (rowTitleRect.h / 2)))).toFixed(1) : null
      }
    })
    for (let index = 0; index < rows.length - 1; index += 1) {
      const current = rows[index].row.rect
      const next = rows[index + 1].row.rect
      rows[index].gapAfter = current && next ? +(next.y - (current.y + current.h)).toFixed(1) : null
    }

    const reasoningRoots = [...document.querySelectorAll('[data-step-process] [class*="lcKema_root"]')]
    const thinking = reasoningRoots.map((root, index) => {
      const thinkBody = root.querySelector('[class*="lcKema_thinkBody"]')
      const firstParagraph = thinkBody?.querySelector('p, [class*="_markdown"] > div')
      const rootRect = rect(root)
      return {
        index,
        root: { ...relative(root), ...style(root) },
        body: { ...relative(thinkBody), ...style(thinkBody) },
        paragraph: { ...relative(firstParagraph), ...style(firstParagraph) },
        text: cleanText(thinkBody?.textContent ?? ''),
        textLeft: thinkBody === null || thinkBody === undefined ? null : +(rect(thinkBody).x - origin.x).toFixed(1)
      }
    })

    const processRowButton = document.querySelector('[data-chat-flow-kind="turn-process"] button')
    const processRowLabel = processRowButton?.querySelector('[class*="_label"]')

    return {
      skin: document.body.getAttribute('data-cgpt-skin'),
      column: rect(document.querySelector('[data-conversation-scroll] .EvIC1a_column')),
      group: { rect: rect(group), ...style(group) },
      title: { ...relative(title), ...style(title), text: titleRendered, nativeText: cleanText(label?.textContent) },
      label: {
        ...relative(label),
        ...style(label),
        text: titleRendered,
        cgptSummary: label?.getAttribute('data-cgpt-summary') ?? null,
        afterContent: generated(label),
        afterFontSize: label ? getComputedStyle(label, '::after').fontSize : null
      },
      leading: { ...relative(leading) },
      icon: { ...relative(icon), centerY: iconCenter(iconRect) },
      titleMetrics: {
        iconTextGap: iconRect && labelRect ? +(labelRect.x - (leadingRect.x + leadingRect.w)).toFixed(1) : null,
        alignDelta: iconRect && labelRect ? +(Math.abs(iconCenter(iconRect) - (labelRect.y + labelRect.h / 2))).toFixed(1) : null,
        iconX: iconRect === null ? null : +(iconRect.x - origin.x).toFixed(1),
        textX: labelRect === null ? null : +(labelRect.x - origin.x).toFixed(1)
      },
      body: { ...relative(body), ...style(body) },
      content: { rect: rect(content) },
      rows,
      thinking,
      processRow: processRowButton === null ? null : {
        ...relative(processRowButton),
        ...style(processRowButton),
        label: processRowLabel === null ? null : { ...relative(processRowLabel), ...style(processRowLabel) },
        text: cleanText(processRowButton.textContent)
      },
      groupMarginTop: group === null ? null : getComputedStyle(group).marginTop
    }
  })
}

async function capture() {
  const url = args.get('url')
  const tag = args.get('tag')
  if (typeof url !== 'string' || typeof tag !== 'string') {
    console.error('usage: node scripts/m15-process.mjs --url <tokenised-url> --tag <before|native|after> [--skin-off] [--out .m15-tmp]')
    process.exit(2)
  }
  const skinOff = args.get('skin-off') === true
  const playwright = await loadPlaywright()
  const browser = await playwright.chromium.launch({
    headless: true,
    executablePath: CHROME,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--disable-software-rasterizer']
  })
  const context = await browser.newContext({ viewport: VIEWPORT, locale: 'zh-CN', deviceScaleFactor: 1 })
  if (skinOff) {
    await context.addInitScript(() => {
      try {
        localStorage.setItem('cgpt-skin', 'off')
      } catch {
        // A hardened context would make the comparison fail loudly below.
      }
    })
  }
  const page = await context.newPage()
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 })
    await page.waitForTimeout(2200)
    for (let step = 0; step < 6; step += 1) {
      const close = page.getByRole('button', { name: 'Close' }).first()
      if (await close.count()) {
        await close.click({ force: true }).catch(() => {})
        await page.waitForTimeout(300)
        continue
      }
      break
    }
    if (!(await openFixture(page, skinOff))) throw new Error(`fixture session not found: ${SESSION_TEXT}`)
    await expand(page)
    await page.waitForTimeout(600)

    if (skinOff && (await page.evaluate(() => document.body.getAttribute('data-cgpt-skin'))) !== null) {
      throw new Error('--skin-off did not disable the skin; the native side would be skinned')
    }
    const measurement = await measure(page)
    if (measurement.group.rect === null) throw new Error('process group missing after expansion')

    // Resting colours are measured with the pointer parked outside the
    // transcript; a click leaves the row under the cursor, and `:hover` would
    // otherwise make the comparison depend on where the layout put the row.
    await page.mouse.move(VIEWPORT.width - 8, VIEWPORT.height - 8)
    await page.waitForTimeout(250)
    Object.assign(measurement, await measure(page))

    // Hover is part of the native contract too: the Host brightens the row and
    // keeps the background at rest. Compare that state with the pointer on the
    // first tool row.
    const firstRow = measurement.rows[0].row.rect
    if (firstRow !== null) {
      await page.mouse.move(firstRow.x + firstRow.w / 2, firstRow.y + firstRow.h / 2)
      await page.waitForTimeout(250)
      measurement.hover = await page.evaluate(() => {
        const row = document.querySelector('[data-step-process] [data-disclosure-row]')
        const title = row?.querySelector('[class*="_title"]')
        const style = (element) => {
          if (element === null || element === undefined) return null
          const computed = getComputedStyle(element)
          return { color: computed.color, backgroundColor: computed.backgroundColor }
        }
        return { row: style(row), title: style(title) }
      })
      await page.mouse.move(VIEWPORT.width - 8, VIEWPORT.height - 8)
      await page.waitForTimeout(200)
    }
    if (measurement.rows.length < 3) throw new Error(`expected at least 3 process rows, got ${measurement.rows.length}`)
    if (measurement.thinking[0]?.body?.rect === null || measurement.thinking[0]?.body?.rect?.h === 0) {
      throw new Error('thinking body did not expand')
    }

    const state = {
      generatedAt: new Date().toISOString(),
      tag,
      url: url.replace(/([?&]token=)[^&]+/, '$1***'),
      viewport: VIEWPORT,
      deviceScaleFactor: 1,
      fixture: SESSION_TEXT,
      measurement
    }
    mkdirSync(OUT, { recursive: true })
    const jsonPath = join(OUT, `${tag}.json`)
    writeFileSync(jsonPath, `${JSON.stringify(state, null, 2)}\n`)

    const group = measurement.group.rect
    const top = Math.max(0, group.y - 10)
    const bottom = Math.min(VIEWPORT.height, group.y + group.h + 10)
    const left = Math.max(0, group.x - 12)
    const width = Math.min(VIEWPORT.width - left, Math.max(640, Math.min(group.w + 24, 790)))
    const shot = join(OUT, `${tag}.png`)
    await page.screenshot({ path: shot, clip: { x: left, y: top, width, height: Math.max(80, bottom - top) } })
    console.log(`m15-process: ${tag}${skinOff ? ' (skin off)' : ''} => ${jsonPath}`)
    console.log(`  group ${group.w}x${group.h} · title ${measurement.title.rect.w}x${measurement.title.rect.h} @${measurement.title.fontSize}/${measurement.title.lineHeight} · rendered "${measurement.title.text}"`)
    console.log(`  rows ${measurement.rows.length} · first ${measurement.rows[0].row.rect.h}px @${measurement.rows[0].row.fontSize}/${measurement.rows[0].row.lineHeight} · thinking body ${measurement.thinking[0].body.fontSize}/${measurement.thinking[0].body.lineHeight} p ${measurement.thinking[0].paragraph.fontSize}/${measurement.thinking[0].paragraph.lineHeight}`)
  } finally {
    await browser.close()
  }
}

/** Flatten one state into the metrics the report and the gate compare. */
function flatten(state) {
  const m = state.measurement
  const px = (value) => (typeof value === 'string' && /^-?\d+(?:\.\d+)?px$/.test(value) ? Number.parseFloat(value) : value)
  const metrics = {
    groupMarginTop: m.groupMarginTop,
    titleHeight: m.title.rect.h,
    titleFontSize: px(m.title.fontSize),
    titleLineHeight: px(m.title.lineHeight),
    titlePadding: m.title.padding,
    titleGap: m.title.gap,
    titleIconX: m.titleMetrics.iconX,
    titleIconY: m.icon.rel.y,
    titleIconW: m.icon.rect.w,
    titleIconH: m.icon.rect.h,
    titleTextX: m.titleMetrics.textX,
    titleIconTextGap: m.titleMetrics.iconTextGap,
    titleAlignDelta: m.titleMetrics.alignDelta,
    labelFontSize: px(m.label.fontSize),
    labelLineHeight: px(m.label.lineHeight),
    labelHeight: m.label.rect.h,
    labelTextX: m.label.rel.x,
    labelTextY: m.label.rel.y,
    processRowHeight: m.processRow?.rect.h ?? null,
    processRowFontSize: px(m.processRow?.fontSize) ?? null,
    processRowLineHeight: px(m.processRow?.lineHeight) ?? null,
    processRowPadding: m.processRow?.padding ?? null,
    thinkingBodyFontSize: px(m.thinking[0].body.fontSize),
    thinkingBodyLineHeight: px(m.thinking[0].body.lineHeight),
    thinkingBodyPadding: m.thinking[0].body.padding,
    thinkingBodyX: m.thinking[0].body.rel.x,
    thinkingBodyY: m.thinking[0].body.rel.y,
    thinkingParagraphFontSize: px(m.thinking[0].paragraph.fontSize),
    thinkingParagraphLineHeight: px(m.thinking[0].paragraph.lineHeight),
    thinkingParagraphHeight: m.thinking[0].paragraph.rect.h,
    // Colour values live in the raw state files. The skin's `theme.js` sets the
    // Host alias tokens globally (ChatGPT palette), so hover ink is deliberately
    // not part of this gate; a painted hover surface is.
    row0BackgroundColor: m.rows[0].row.backgroundColor,
    hoverRowBackgroundColor: m.hover?.row?.backgroundColor ?? null
  }
  m.rows.forEach((row, index) => {
    metrics[`row${index}Height`] = row.row.rect.h
    metrics[`row${index}Y`] = row.row.rel.y
    metrics[`row${index}FontSize`] = px(row.row.fontSize)
    metrics[`row${index}LineHeight`] = px(row.row.lineHeight)
    metrics[`row${index}Padding`] = row.row.padding
    metrics[`row${index}Gap`] = row.row.gap
    metrics[`row${index}IconX`] = row.icon.rel.x
    metrics[`row${index}IconY`] = row.icon.rel.y
    metrics[`row${index}TextX`] = row.titleBox.rel.x
    metrics[`row${index}TextY`] = row.titleBox.rel.y
    metrics[`row${index}IconTextGap`] = row.iconTextGap
    metrics[`row${index}AlignDelta`] = row.alignDelta
    metrics[`row${index}GapAfter`] = row.gapAfter ?? null
  })
  const texts = {
    titleRendered: m.title.text,
    titleNative: m.title.nativeText,
    rows: m.rows.map((row) => row.text),
    thinking: m.thinking.map((entry) => entry.text),
    processRow: m.processRow?.text ?? null
  }
  return { metrics, texts }
}

function compareNumbers(a, b) {
  if (a === null || b === null) return a === b ? 0 : Number.POSITIVE_INFINITY
  return Math.abs(a - b)
}

function report() {
  const read = (tag) => JSON.parse(readFileSync(join(OUT, `${tag}.json`), 'utf8'))
  const before = read('before')
  const native = read('native')
  const after = read('after')
  const flat = { before: flatten(before), native: flatten(native), after: flatten(after) }
  const rows = []
  const keys = new Set([...Object.keys(flat.native.metrics), ...Object.keys(flat.after.metrics)])
  for (const key of [...keys].sort()) {
    const nativeValue = flat.native.metrics[key]
    const beforeValue = flat.before.metrics[key]
    const afterValue = flat.after.metrics[key]
    const numeric = typeof nativeValue === 'number' || typeof afterValue === 'number'
    let delta = null
    let pass = null
    if (numeric) {
      delta = compareNumbers(nativeValue, afterValue)
      pass = delta <= TOLERANCE
    } else {
      delta = nativeValue === afterValue ? 0 : null
      pass = nativeValue === afterValue
    }
    rows.push({
      metric: key,
      native: nativeValue,
      before: beforeValue,
      after: afterValue,
      delta: numeric ? round(delta) : null,
      pass
    })
  }
  const textChecks = []
  for (const key of Object.keys(flat.native.texts)) {
    const nativeValue = flat.native.texts[key]
    const afterValue = flat.after.texts[key]
    const beforeValue = flat.before.texts[key]
    const same = JSON.stringify(nativeValue) === JSON.stringify(afterValue)
    textChecks.push({ text: key, native: nativeValue, before: beforeValue, after: afterValue, equal: same })
  }
  const failures = rows.filter((row) => row.pass !== true)
  const textFailures = textChecks.filter((row) => row.equal !== true)
  const beforeRegressions = rows.filter((row) => {
    if (typeof row.before !== 'number') return false
    return Math.abs(row.before - row.native) > TOLERANCE
  })
  const pass = failures.length === 0 && textFailures.length === 0

  mkdirSync(SHOTS, { recursive: true })
  for (const tag of ['native', 'before', 'after']) {
    const source = join(OUT, `${tag}.png`)
    if (!existsSync(source)) throw new Error(`missing screenshot ${source}`)
    copyFileSync(source, join(SHOTS, `m15-process-${tag}.png`))
  }

  const reportData = {
    meta: {
      module: 15,
      generatedAt: new Date().toISOString(),
      fixture: SESSION_TEXT,
      states: {
        native: 'skin off (cgpt-skin=off; the plugin mounts nothing)',
        before: 'skin on, pre-M15 CSS (title pinned to 28px, 13px label, ::after step count, 13/18 tool rows, 16/26 thinking body)',
        after: 'skin on, M15 CSS (process area is the Host’s)'
      },
      tolerance: TOLERANCE,
      viewport: VIEWPORT,
      measurement: 'getBoundingClientRect + getComputedStyle, x/y normalised against the process group left/top edge',
      palette: 'Host alias tokens (label-primary/secondary/caption) are set globally by lib/client/theme.js. Process ink values are recorded in the raw states but not gated; background, geometry, type and copy are gated.'
    },
    assertions: [
      { id: 'P1-icon', claim: '每行图标矩形与组的相对位置一致（1px）', check: 'titleIconX/titleIconY/titleIconW/titleIconH + row*IconX/row*IconY', pass: rows.filter((row) => /Icon(X|Y|W|H)$/.test(row.metric)).every((row) => row.pass) },
      { id: 'P2-type', claim: '标题、行、思考正文的字号与行高一致（1px）', check: 'titleFontSize/titleLineHeight + row*FontSize/row*LineHeight + thinking*', pass: rows.filter((row) => /(FontSize|LineHeight)$/.test(row.metric)).every((row) => row.pass) },
      { id: 'P3-text', claim: '宿主生成的摘要文案逐字一致', check: 'texts.titleRendered/titleNative', pass: textChecks.every((row) => row.equal) },
      { id: 'P4-align', claim: '图标列与文字列对齐，行距一致（1px）', check: 'titleIconTextGap/titleAlignDelta + row*TextX/row*IconTextGap/row*AlignDelta/row*GapAfter', pass: rows.filter((row) => /(IconTextGap|AlignDelta|TextX|GapAfter|Padding)/.test(row.metric)).every((row) => row.pass) },
      { id: 'P5-native-bounds', claim: '标题行与行的盒模型（高/内边距/外边距）回到宿主默认', check: 'titleHeight/titlePadding/titleGap/groupMarginTop/row*Height/row*Padding/row*Gap', pass: rows.filter((row) => /(titleHeight|titlePadding|titleGap|groupMarginTop|row\w+(Height|Padding|Gap))$/.test(row.metric)).every((row) => row.pass) }
    ],
    colors: {
      note: 'Recorded for audit only: the skin sets the Host label alias tokens globally, so hover ink follows the skin palette while geometry/type/copy stay native.',
      native: {
        title: native.measurement.title.color,
        row: native.measurement.rows[0].row.color,
        thinking: native.measurement.thinking[0].paragraph.color,
        rowHover: native.measurement.hover?.row?.color ?? null,
        hoverBackground: native.measurement.hover?.row?.backgroundColor ?? null
      },
      before: {
        title: before.measurement.title.color,
        row: before.measurement.rows[0].row.color,
        thinking: before.measurement.thinking[0].paragraph.color,
        rowHover: before.measurement.hover?.row?.color ?? null,
        hoverBackground: before.measurement.hover?.row?.backgroundColor ?? null
      },
      after: {
        title: after.measurement.title.color,
        row: after.measurement.rows[0].row.color,
        thinking: after.measurement.thinking[0].paragraph.color,
        rowHover: after.measurement.hover?.row?.color ?? null,
        hoverBackground: after.measurement.hover?.row?.backgroundColor ?? null
      }
    },
    beforeRegression: beforeRegressions.map((row) => ({ metric: row.metric, native: row.native, before: row.before, delta: round(Math.abs(row.before - row.native)) })),
    comparisons: rows,
    texts: textChecks,
    summary: {
      metrics: rows.length,
      pass: rows.filter((row) => row.pass).length,
      fail: failures.length,
      textFail: textFailures.length,
      beforeRegressed: beforeRegressions.length,
      passOverall: pass
    },
    screenshots: ['screenshots/m15-process-native.png', 'screenshots/m15-process-before.png', 'screenshots/m15-process-after.png'],
    pass
  }
  writeFileSync(join(DOCS, 'm15-process.json'), `${JSON.stringify(reportData, null, 2)}\n`)
  console.log(`m15-process: ${rows.length} metrics, pass ${reportData.summary.pass}, fail ${failures.length}, textFail ${textFailures.length}, beforeRegressed ${beforeRegressions.length}`)
  for (const failure of failures) console.log(`  FAIL ${failure.metric}: native=${failure.native} before=${failure.before} after=${failure.after} delta=${failure.delta}`)
  for (const failure of textFailures) console.log(`  FAIL text ${failure.text}: native=${JSON.stringify(failure.native)} before=${JSON.stringify(failure.before)} after=${JSON.stringify(failure.after)}`)
  if (!pass) process.exitCode = 1
}

if (args.get('report') === true) {
  report()
  for (const tag of ['native', 'before', 'after']) {
    const path = join(SHOTS, `m15-process-${tag}.png`)
    if (existsSync(path)) console.log(`  screenshot ${path} (${statSync(path).size} bytes)`)
  }
} else {
  await capture()
}
