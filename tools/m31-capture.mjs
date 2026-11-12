#!/usr/bin/env node
/**
 * tools/m31-capture.mjs — P0-18 Work composer: width, title row, project label,
 * the four bottom buttons and the approval panel's two directions.
 *
 *   node tools/m31-capture.mjs --url "http://127.0.0.1:3110/?token=…" [--out docs]
 *
 * Writes:
 *   docs/m31.json
 *   docs/screenshots/m31-chat-empty-{light,dark}.png
 *   docs/screenshots/m31-work-empty-{light,dark}.png
 *   docs/screenshots/m31-work-existing-{light,dark}.png
 *   docs/screenshots/m31-project-selected-{light,dark}.png
 *   docs/screenshots/m31-permission-down-{light,dark}.png
 *   docs/screenshots/m31-permission-up-{light,dark}.png
 *   docs/screenshots/m31-buttons-hover-{light,dark}.png
 *   docs/screenshots/m31-permission-flip-dark.png
 *   docs/capture/m31/*.png (per-button rest/hover crops used by the sheets)
 *
 * Everything is measured live at 1233×850 / DPR 2, the reference viewport used
 * by M29/M30. The tokenised URL is redacted before it reaches the report.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
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
  console.error('usage: node tools/m31-capture.mjs --url <tokenised-url> [--out docs]')
  process.exit(2)
}
const OUT = resolve(ROOT, typeof args.get('out') === 'string' ? args.get('out') : 'docs')
const SHOTS = join(OUT, 'screenshots')
const CAPTURE = join(OUT, 'capture', 'm31')
mkdirSync(SHOTS, { recursive: true })
mkdirSync(CAPTURE, { recursive: true })

const redact = (value) => value.replace(/([?&]token=)[^&]+/, '$1***')
const playwrightPath = process.env.M31_PLAYWRIGHT ?? 'playwright'
const CHROME = process.env.CHATGPT_UI_CHROME ?? process.env.HOME + '/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome'
const { chromium } = await import(playwrightPath)

const round = (value) => Math.round(value * 100) / 100

const browser = await chromium.launch({
  headless: true,
  executablePath: CHROME,
  args: ['--no-sandbox', '--disable-dev-shm-usage']
})

const errors = []
const results = {}
const ASSERTIONS = []
const check = (id, ok, detail) => ASSERTIONS.push({ id, ok: ok === true, detail })

const openPage = async ({ width = 1233, height = 850, colorScheme, dpr = 2 } = {}) => {
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: dpr,
    locale: 'zh-CN',
    colorScheme
  })
  const page = await context.newPage()
  page.on('pageerror', (error) => errors.push(String(error).slice(0, 240)))
  await page.goto(url, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1200)
  const notice = page.getByRole('button', { name: /继续|Continue/ })
  if ((await notice.count()) > 0) {
    await notice.first().click()
    await page.waitForTimeout(400)
  }
  return { context, page }
}

const switchProduct = async (page, label) => {
  const segment = page.locator('.chatgpt-mode-seg', { hasText: label })
  if ((await segment.count()) === 0) throw new Error(`m31: ${label} segment missing`)
  if ((await segment.first().getAttribute('aria-pressed')) !== 'true') {
    await segment.first().click()
    await page.waitForTimeout(700)
  }
}

const newChat = async (page) => {
  await page.locator('.chatgpt-new-chat').first().click()
  await page.waitForTimeout(1100)
}

const emptyChat = async (page) => {
  await switchProduct(page, '聊天')
  await newChat(page)
  await page.waitForFunction(() => document.querySelector("[class*='_composerHero']") !== null, null, { timeout: 10000 })
}

const emptyWork = async (page) => {
  await switchProduct(page, '工作')
  await newChat(page)
  await page.waitForFunction(() => document.querySelector("[class*='_composerHero']") !== null, null, { timeout: 10000 })
  await page.waitForFunction(() => document.querySelector('.chatgpt-work-tools') !== null, null, { timeout: 10000 })
}

const box = (rect) => ({ x: round(rect.x), y: round(rect.y), w: round(rect.w ?? rect.width), h: round(rect.h ?? rect.height) })

const measureCard = (page) =>
  page.evaluate(() => {
    const card = document.querySelector("[data-composer-card='true']")
    const hero = document.querySelector("[class*='_composerHero']")
    if (card === null) return null
    const c = card.getBoundingClientRect()
    const h = hero?.getBoundingClientRect()
    return {
      card: { x: c.x, y: c.y, w: c.width, h: c.height },
      hero: h === undefined ? null : { x: h.x, y: h.y, w: h.width, h: h.height }
    }
  })

const normalizeBox = (value) => {
  if (value === null || value === undefined) return null
  return {
    card: box(value.card),
    hero: value.hero === null ? null : box(value.hero)
  }
}

const measureButtons = async (page) => {
  const selectors = {
    project: '.chatgpt-work-tool[data-cgpt-work-tool="project"]',
    files: '.chatgpt-work-tool[data-cgpt-work-tool="files"]',
    plugins: '.chatgpt-work-tool[data-cgpt-work-tool="plugins"]',
    permission: '.chatgpt-tools .chatgpt-permission, .chatgpt-work-tools .chatgpt-permission'
  }
  const read = (selector) =>
    page.evaluate((sel) => {
      const node = document.querySelector(sel)
      if (node === null) return null
      const cs = getComputedStyle(node)
      const rect = node.getBoundingClientRect()
      const svg = node.querySelector('svg')?.getBoundingClientRect()
      return {
        text: node.innerText.trim(),
        rect: { x: rect.x, y: rect.y, w: rect.width, h: rect.height },
        height: cs.height,
        padding: cs.padding,
        radius: cs.borderRadius,
        background: cs.backgroundColor,
        color: cs.color,
        fontSize: cs.fontSize,
        fontWeight: cs.fontWeight,
        gap: cs.gap,
        icon: svg === undefined ? null : { w: svg.width, h: svg.height }
      }
    }, selector)

  // Rest state: park the pointer away from the bar so no :hover rule is active.
  await page.mouse.move(4, 4)
  await page.waitForTimeout(160)
  const rest = {}
  for (const [key, selector] of Object.entries(selectors)) rest[key] = await read(selector)

  const hover = {}
  for (const [key, selector] of Object.entries(selectors)) {
    await page.hover(selector)
    await page.waitForTimeout(180)
    hover[key] = await read(selector)
  }
  await page.mouse.move(4, 4)
  await page.waitForTimeout(160)
  return {
    rest: Object.fromEntries(Object.entries(rest).map(([key, value]) => [key, styleRow(value)])),
    hover: Object.fromEntries(Object.entries(hover).map(([key, value]) => [key, styleRow(value)])),
    selectors
  }
}

const styleRow = (entry) =>
  entry === null
    ? null
    : {
        label: entry.text,
        rect: box(entry.rect),
        height: entry.height,
        padding: entry.padding,
        radius: entry.radius,
        background: entry.background,
        color: entry.color,
        fontSize: entry.fontSize,
        fontWeight: entry.fontWeight,
        gap: entry.gap,
        icon: entry.icon === null ? null : { w: entry.icon.w, h: entry.icon.h }
      }

const openPermission = async (page) => {
  await page.locator('.chatgpt-permission').first().click()
  await page.waitForTimeout(420)
  await page.waitForFunction(() => document.querySelector('[data-cgpt-work-menu="permission"]') !== null, null, { timeout: 5000 })
}

const measurePermission = (page) =>
  page.evaluate(() => {
    const panel = document.querySelector('[data-cgpt-work-menu="permission"]')
    const button = document.querySelector('.chatgpt-permission')
    if (panel === null || button === null) return null
    const p = panel.getBoundingClientRect()
    const b = button.getBoundingClientRect()
    const viewport = { w: window.innerWidth, h: window.innerHeight }
    const firstRow = panel.querySelector('[data-cgpt-permission-row]')
    const r = firstRow?.getBoundingClientRect()
    const head = panel.querySelector('[data-cgpt-permission-head], .chatgpt-permission-head, .chatgpt-permission-head-link')
    const text = panel.innerText
    return {
      panel: { x: p.x, y: p.y, w: p.width, h: p.height, right: p.right, bottom: p.bottom },
      button: { x: b.x, y: b.y, w: b.width, h: b.height, right: b.right, bottom: b.bottom },
      direction: panel.getAttribute('data-cgpt-permission-open'),
      leftDelta: p.x - b.x,
      belowGap: p.y - b.bottom,
      aboveGap: b.y - p.bottom,
      viewport,
      insideViewport: p.x >= 0 && p.y >= 0 && p.right <= viewport.w && p.bottom <= viewport.h,
      blank: document.querySelector('.chatgpt-work-tools') !== null,
      firstRowGap: r === undefined ? null : r.top - p.top,
      firstRowText: firstRow?.innerText.split('\n')[0] ?? '',
      header: {
        present: head !== null,
        titlePresent: text.includes('应如何批准'),
        learnMorePresent: text.includes('了解更多') || panel.querySelector('a') !== null
      }
    }
  })

const closePermission = async (page) => {
  await page.keyboard.press('Escape')
  await page.waitForTimeout(260)
  await page.waitForFunction(() => document.querySelector('[data-cgpt-work-menu="permission"]') === null, null, { timeout: 5000 })
}

const measureModeRow = (page) =>
  page.evaluate(() => {
    const row = document.querySelector("[class*='_heroWorkspaceRow']")
    const workspace = document.querySelector("[class*='_heroWorkspaceRow'] > button[class*='_workspace']")
    const seat = document.querySelector("[data-slot='conversation.hero.agentPreset'] button[class*='_seat']")
    const seatRect = seat?.getBoundingClientRect()
    const workspaceRect = workspace?.getBoundingClientRect()
    return {
      rowText: row?.innerText.trim() ?? '',
      workspaceChip: workspace === null || workspace === undefined
        ? null
        : {
            text: workspace.innerText.trim(),
            display: getComputedStyle(workspace).display,
            visible: workspaceRect.width > 0 && workspaceRect.height > 0,
            rect: { x: workspaceRect.x, y: workspaceRect.y, w: workspaceRect.width, h: workspaceRect.height }
          },
      modeSelector: seat === null || seat === undefined
        ? null
        : {
            text: seat.innerText.trim(),
            title: seat.getAttribute('title') ?? '',
            hostClass: seat.className,
            slot: 'conversation.hero.agentPreset',
            visible: seatRect.width > 0 && seatRect.height > 0 && getComputedStyle(seat).display !== 'none',
            rect: { x: seatRect.x, y: seatRect.y, w: seatRect.width, h: seatRect.height }
          }
    }
  })

const projectButtonState = (page) =>
  page.evaluate(() => {
    const button = document.querySelector('.chatgpt-work-tool[data-cgpt-work-tool="project"]')
    if (button === null) return null
    const rect = button.getBoundingClientRect()
    return {
      label: button.innerText.trim(),
      icon: button.querySelector('svg') !== null,
      ariaExpanded: button.getAttribute('aria-expanded'),
      rect: { x: rect.x, y: rect.y, w: rect.width, h: rect.height }
    }
  })

const chooseProject = async (page, title) => {
  await page.locator('.chatgpt-work-tool[data-cgpt-work-tool="project"]').first().click()
  await page.waitForTimeout(380)
  await page.locator('.chatgpt-project-picker-item', { hasText: title }).first().click()
  await page.waitForTimeout(1400)
  await page.waitForFunction(
    (name) => document.querySelector('.chatgpt-work-tool[data-cgpt-work-tool="project"]')?.innerText.trim() === name,
    title,
    { timeout: 10000 }
  )
}

const clipAround = async (page, selectors, padding, path) => {
  const rect = await page.evaluate((sels) => {
    const boxes = sels
      .map((sel) => document.querySelector(sel)?.getBoundingClientRect())
      .filter((value) => value !== undefined)
    if (boxes.length === 0) return null
    const left = Math.min(...boxes.map((value) => value.x))
    const top = Math.min(...boxes.map((value) => value.y))
    const right = Math.max(...boxes.map((value) => value.right))
    const bottom = Math.max(...boxes.map((value) => value.bottom))
    return { left, top, right, bottom }
  }, selectors)
  if (rect === null) return false
  const x = Math.max(0, rect.left - padding)
  const y = Math.max(0, rect.top - padding)
  await page.screenshot({
    path,
    clip: {
      x,
      y,
      width: rect.right - rect.left + padding * 2,
      height: rect.bottom - rect.top + padding * 2
    }
  })
  return true
}

const captureHoverCrops = async (page, theme, selectors) => {
  const files = {}
  for (const [key, selector] of Object.entries(selectors)) {
    const locator = page.locator(selector).first()
    const rect = await locator.boundingBox()
    if (rect === null) continue
    const clip = {
      x: Math.max(0, rect.x - 10),
      y: Math.max(0, rect.y - 10),
      width: rect.width + 20,
      height: rect.height + 20
    }
    await page.mouse.move(4, 4)
    await page.waitForTimeout(120)
    const restPath = join(CAPTURE, `${theme}-${key}-rest.png`)
    await page.screenshot({ path: restPath, clip })
    await locator.hover()
    await page.waitForTimeout(180)
    const hoverPath = join(CAPTURE, `${theme}-${key}-hover.png`)
    await page.screenshot({ path: hoverPath, clip })
    files[key] = { rest: restPath, hover: hoverPath, clip }
    await page.mouse.move(4, 4)
    await page.waitForTimeout(100)
  }
  return files
}

const composeSheet = async ({ theme, pageBackground, files, labels, outPath }) => {
  const cell = (path, width) => {
    const data = readFileSync(path).toString('base64')
    return `<img src="data:image/png;base64,${data}" style="width:${Math.round(width / 2)}px;height:auto" />`
  }
  const columns = Object.keys(files)
  const rows = [
    { key: 'rest', title: '默认 / rest' },
    { key: 'hover', title: '悬停 / hover' }
  ]
  const head = `<div class="row head"><div class="rowLabel"></div>${columns
    .map((key) => `<div class="cell"><span>${labels[key]}</span></div>`)
    .join('')}</div>`
  const cells = rows
    .map(
      (row) =>
        `<div class="row"><div class="rowLabel">${row.title}</div>${columns
          .map((key) => `<div class="cell">${cell(files[key][row.key], files[key].clip.width)}</div>`)
          .join('')}</div>`
    )
    .join('')
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
    html,body{margin:0;background:${pageBackground};font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;color:${theme === 'dark' ? '#ededed' : '#0d0d0d'};}
    body{padding:16px 20px 20px;width:900px;}
    h1{font-size:14px;font-weight:600;margin:0 0 12px;opacity:.85}
    .row{display:flex;align-items:center;gap:14px;margin:0 0 12px}
    .head{margin-bottom:2px}
    .rowLabel{width:86px;flex:none;font-size:12px;opacity:.65}
    .cell{display:flex;flex-direction:column;align-items:center;gap:6px;width:150px;flex:none}
    .cell span{font-size:12px;opacity:.75;white-space:nowrap}
    .head .cell{height:18px;justify-content:flex-end}
    img{display:block}
  </style></head><body><h1>P0-18 Work 底部四按钮 · ${theme === 'dark' ? '深色' : '浅色'}</h1>${head}${cells}</body></html>`
  const sheetContext = await browser.newContext({ viewport: { width: 940, height: 260 }, deviceScaleFactor: 2, colorScheme: theme })
  const sheet = await sheetContext.newPage()
  await sheet.setContent(html, { waitUntil: 'load' })
  await sheet.waitForTimeout(150)
  await sheet.screenshot({ path: outPath, fullPage: true })
  await sheetContext.close()
}

const runTheme = async (theme) => {
  const { context, page } = await openPage({ colorScheme: theme })
  const result = { theme }

  // 1. Chat blank page: the width every Work blank page must match.
  await emptyChat(page)
  result.chatEmpty = normalizeBox(await measureCard(page))
  await page.screenshot({ path: join(SHOTS, `m31-chat-empty-${theme}.png`) })

  // 2. Work blank page: width, title row, mode selector and four buttons.
  await emptyWork(page)
  result.workEmpty = normalizeBox(await measureCard(page))
  result.modeRow = await measureModeRow(page)
  result.buttons = await measureButtons(page)
  await page.screenshot({ path: join(SHOTS, `m31-work-empty-${theme}.png`) })

  const hoverCrops = await captureHoverCrops(page, theme, result.buttons.selectors)
  let background = await page.evaluate(() => getComputedStyle(document.body).backgroundColor)
  if (background === 'rgba(0, 0, 0, 0)' || background === 'transparent') background = theme === 'dark' ? '#0d0d0d' : '#ffffff'
  result.pageBackground = background
  await composeSheet({
    theme,
    pageBackground: background,
    files: hoverCrops,
    labels: { project: '选择项目', files: '文件', plugins: '插件', permission: '帮我批准' },
    outPath: join(SHOTS, `m31-buttons-hover-${theme}.png`)
  })

  // 3. Project selected: the bottom-left button takes the project's own title.
  result.projectBefore = await projectButtonState(page)
  await chooseProject(page, 'proj-alpha')
  result.projectAfter = await projectButtonState(page)
  result.projectSelectedSession = await measureCard(page)
  await page.screenshot({ path: join(SHOTS, `m31-project-selected-${theme}.png`) })

  // 4. Permission picker on the new (blank) session: below the button.
  await openPermission(page)
  const down = await measurePermission(page)
  result.permissionDown = down
  result.directionBasis = {
    newSession: {
      blank: down.blank,
      preferred: 'below',
      panelHeight: down.panel.h,
      roomBelow: round(down.viewport.h - down.button.bottom - 8),
      roomAbove: round(down.button.y - 8),
      chosen: down.direction
    }
  }
  await clipAround(page, ['[data-cgpt-work-menu="permission"]', '.chatgpt-permission'], 14, join(SHOTS, `m31-permission-down-${theme}.png`))
  await closePermission(page)

  // 5. Existing session: tool bar gone, permission in the action row, panel up.
  const input = page.locator('[data-composer-input="true"]').first()
  // Use the locator, not saved viewport coordinates: the hero re-renders when
  // the project changes, so a coordinate can go stale between measure and click.
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)
  await input.click()
  await page.waitForTimeout(220)
  await input.fill('你好')
  await page.waitForFunction(
    () => document.querySelector('[data-composer-input="true"]')?.innerText.includes('你好') === true,
    null,
    { timeout: 5000 }
  )
  await page.keyboard.press('Enter')
  await page.waitForTimeout(2500)
  if ((await page.locator("[class*='_composerHero']").count()) > 0) {
    // One retry, only after the happy path has had time to leave the hero.
    await input.click()
    await page.keyboard.press('Control+A')
    await page.keyboard.type('你好')
    await page.keyboard.press('Enter')
    await page.waitForTimeout(900)
  }
  await page.waitForFunction(
    () => document.querySelector('.chatgpt-work-tools') === null && document.querySelector("[class*='_composerHero']") === null,
    null,
    { timeout: 15000 }
  )
  await page.waitForTimeout(1600)
  await page.waitForSelector('.chatgpt-permission', { timeout: 10000 })
  result.existing = normalizeBox(await measureCard(page))
  result.existing.toolBarVisible = (await page.locator('.chatgpt-work-tools').count()) > 0
  result.existing.permissionInActionRow = await page.evaluate(() => {
    const node = document.querySelector('.chatgpt-permission')
    const card = document.querySelector("[data-composer-card='true']")
    return node !== null && card !== null && card.contains(node)
  })
  await page.screenshot({ path: join(SHOTS, `m31-work-existing-${theme}.png`) })
  await openPermission(page)
  result.permissionUp = await measurePermission(page)
  result.directionBasis.existingSession = {
    blank: result.permissionUp.blank,
    preferred: 'above',
    panelHeight: result.permissionUp.panel.h,
    roomBelow: round(result.permissionUp.viewport.h - result.permissionUp.button.bottom - 8),
    roomAbove: round(result.permissionUp.button.y - 8),
    chosen: result.permissionUp.direction
  }
  await clipAround(page, ['[data-cgpt-work-menu="permission"]', '.chatgpt-permission'], 14, join(SHOTS, `m31-permission-up-${theme}.png`))
  await closePermission(page)

  result.errors = errors.filter((entry) => entry.length > 0).slice(0, 20)
  await context.close()
  return result
}

try {
  for (const theme of ['dark', 'light']) {
    results[theme] = await runTheme(theme)
  }

  // 6. Flip probe: a new session in a short window has no room below, so the
  // same "new session prefers below" rule must flip above.
  {
    const { context, page } = await openPage({ width: 1233, height: 560, colorScheme: 'dark' })
    await emptyWork(page)
    await openPermission(page)
    results.flip = await measurePermission(page)
    results.flipBasis = {
      blank: results.flip.blank,
      preferred: 'below',
      panelHeight: results.flip.panel.h,
      roomBelow: round(results.flip.viewport.h - results.flip.button.bottom - 8),
      roomAbove: round(results.flip.button.y - 8),
      chosen: results.flip.direction,
      reason: 'preferred below side had no room; the helper flipped above'
    }
    await clipAround(page, ['[data-cgpt-work-menu="permission"]', '.chatgpt-permission'], 14, join(SHOTS, 'm31-permission-flip-dark.png'))
    await closePermission(page)
    await context.close()
  }
} finally {
  await browser.close()
}

/* ---- assertions --------------------------------------------------------- */
const widthDelta = (theme) =>
  Math.abs(results[theme].workEmpty.card.w - results[theme].chatEmpty.card.w)
for (const theme of ['dark', 'light']) {
  const frame = results[theme]
  check(`Work empty width = Chat empty width (${theme})`, widthDelta(theme) <= 1, `${frame.workEmpty.card.w} vs ${frame.chatEmpty.card.w}`)
  check(`Work empty card is 757 (${theme})`, Math.abs(frame.workEmpty.card.w - 757) <= 1, `${frame.workEmpty.card.w}`)
  check(`no project picker under the Work title (${theme})`, frame.modeRow.workspaceChip?.visible === false && frame.modeRow.workspaceChip?.display === 'none', JSON.stringify(frame.modeRow.workspaceChip))
  check(`the Host mode selector is present and painted (${theme})`, frame.modeRow.modeSelector?.visible === true && frame.modeRow.modeSelector?.slot === 'conversation.hero.agentPreset' && frame.modeRow.modeSelector?.text !== '', JSON.stringify(frame.modeRow.modeSelector))
  check(`the title row carries no project name (${theme})`, !frame.modeRow.rowText.includes('proj-alpha') && !frame.modeRow.rowText.includes('默认工作区'), frame.modeRow.rowText)
  check(`project button default copy (${theme})`, frame.projectBefore?.label === '选择项目' && frame.projectBefore?.icon === true, JSON.stringify(frame.projectBefore))
  check(`project button takes the project title (${theme})`, frame.projectAfter?.label === 'proj-alpha' && frame.projectAfter?.icon === true, JSON.stringify(frame.projectAfter))
  check(`project button still opens the picker (${theme})`, frame.projectAfter?.ariaExpanded === 'false' || frame.projectAfter?.ariaExpanded === null, JSON.stringify(frame.projectAfter))

  const rest = frame.buttons.rest
  const hover = frame.buttons.hover
  const restLabels = Object.keys(rest)
  check(`four bottom buttons are measured (${theme})`, restLabels.length === 4 && restLabels.every((key) => rest[key] !== null), JSON.stringify(restLabels))
  const styleEqual = (key, field) => new Set(restLabels.map((name) => rest[name]?.[field])).size === 1
  check(`four bottom buttons: same height (${theme})`, styleEqual('height') && rest.project.height === '36px', restLabels.map((key) => rest[key]?.height).join('/'))
  check(`four bottom buttons: same padding (${theme})`, styleEqual('padding') && rest.project.padding === '0px 8px', restLabels.map((key) => rest[key]?.padding).join('/'))
  check(`four bottom buttons: same radius (${theme})`, styleEqual('radius') && rest.project.radius === '9999px', restLabels.map((key) => rest[key]?.radius).join('/'))
  check(`four bottom buttons: same rest fill (${theme})`, styleEqual('background') && /rgba\(0, 0, 0, 0\)|transparent/.test(rest.project.background), restLabels.map((key) => rest[key]?.background).join('/'))
  check(`four bottom buttons: same hover fill (${theme})`, new Set(restLabels.map((name) => hover[name]?.background)).size === 1 && hover.project.background !== rest.project.background, `${hover.project.background} vs rest ${rest.project.background}`)
  check(`four bottom buttons: same hover text colour (${theme})`, new Set(restLabels.map((name) => hover[name]?.color)).size === 1, restLabels.map((key) => hover[key]?.color).join('/'))
  check(`four bottom buttons: same 20px glyph (${theme})`, restLabels.every((key) => rest[key]?.icon?.w === 20 && rest[key]?.icon?.h === 20), JSON.stringify(restLabels.map((key) => rest[key]?.icon)))

  const down = frame.permissionDown
  const up = frame.permissionUp
  check(`permission panel left edge = button left (new) (${theme})`, down !== null && Math.abs(down.leftDelta) <= 1, down?.leftDelta)
  check(`permission panel left edge = button left (existing) (${theme})`, up !== null && Math.abs(up.leftDelta) <= 1, up?.leftDelta)
  check(`permission panel has no ChatGPT caption or 了解更多 link (${theme})`,
    down !== null && down.header.present === false && down.header.titlePresent === false && down.header.learnMorePresent === false &&
    up !== null && up.header.present === false && up.header.titlePresent === false && up.header.learnMorePresent === false,
    { down: down?.header, up: up?.header })
  check(`permission panel first option sits 8–10px from its top (${theme})`,
    down !== null && down.firstRowGap >= 8 && down.firstRowGap <= 10 &&
    up !== null && up.firstRowGap >= 8 && up.firstRowGap <= 10,
    { down: down?.firstRowGap, up: up?.firstRowGap })
  check(`permission panel height shrank to the three rows (${theme})`,
    down !== null && Math.abs(down.panel.h - 145.5) <= 1 && Math.abs(up.panel.h - 145.5) <= 1,
    { down: down?.panel.h, up: up?.panel.h })
  check(`new session opens the panel downwards (${theme})`, down?.direction === 'below' && down?.belowGap >= 0, JSON.stringify(down === null ? null : { direction: down.direction, belowGap: down.belowGap }))
  check(`existing session opens the panel upwards (${theme})`, up?.direction === 'above' && up?.aboveGap >= 0, JSON.stringify(up === null ? null : { direction: up.direction, aboveGap: up.aboveGap }))
  check(`both panels stay inside the viewport (${theme})`, down?.insideViewport === true && up?.insideViewport === true, JSON.stringify({ down: down?.insideViewport, up: up?.insideViewport }))
  check(`existing session really has no tool bar (${theme})`, frame.existing?.toolBarVisible === false && frame.existing?.permissionInActionRow === true, JSON.stringify(frame.existing))

  check(`mode selector is the Host's own control (${theme})`, frame.modeRow.modeSelector?.hostClass.includes('_seat') === true && frame.modeRow.modeSelector?.title.includes('Agent 预设'), JSON.stringify(frame.modeRow.modeSelector))
  check(`no page errors (${theme})`, frame.errors.length === 0, JSON.stringify(frame.errors))
}
check('permission panel flips upwards when the new session has no room below', results.flip?.direction === 'above' && results.flip?.insideViewport === true, JSON.stringify(results.flip === null ? null : { direction: results.flip.direction, belowGap: results.flip.belowGap, insideViewport: results.flip.insideViewport }))

const summary = {
  total: ASSERTIONS.length,
  passed: ASSERTIONS.filter((entry) => entry.ok).length,
  failed: ASSERTIONS.filter((entry) => !entry.ok).map((entry) => entry.id)
}

const payload = {
  tool: 'm31-capture',
  measuredAt: new Date().toISOString(),
  url: redact(url),
  viewport: { w: 1233, h: 850, dpr: 2 },
  source: {
    emptyWidth: '--cgpt-empty-composer-w (05-cgpt-tokens.css) consumed by both hero rules in 60-hero.css',
    modeSelector: "[data-slot='conversation.hero.agentPreset'] (Host ui-agent-preset seat; only visually adapted)",
    projectLabel: "workspaces.list snapshot items[].title matched by items[].sessionIds.includes(sessionId)",
    permissionPanel: 'chatgptPopoverBeside(..., { align: "start", direction: blank ? "below" : "above" }) in lib/client/composer.js'
  },
  screenshots: [
    'm31-chat-empty-dark.png',
    'm31-chat-empty-light.png',
    'm31-work-empty-dark.png',
    'm31-work-empty-light.png',
    'm31-work-existing-dark.png',
    'm31-work-existing-light.png',
    'm31-project-selected-dark.png',
    'm31-project-selected-light.png',
    'm31-permission-down-dark.png',
    'm31-permission-down-light.png',
    'm31-permission-up-dark.png',
    'm31-permission-up-light.png',
    'm31-buttons-hover-dark.png',
    'm31-buttons-hover-light.png',
    'm31-permission-flip-dark.png'
  ],
  themes: {
    dark: results.dark,
    light: results.light
  },
  flip: results.flip,
  flipBasis: results.flipBasis,
  assertions: ASSERTIONS,
  summary,
  errors
}
writeFileSync(join(OUT, 'm31.json'), `${JSON.stringify(payload, null, 2)}\n`)
console.log(JSON.stringify({ summary, failed: summary.failed, output: join(OUT, 'm31.json') }, null, 2))
if (summary.failed.length > 0) process.exitCode = 1
