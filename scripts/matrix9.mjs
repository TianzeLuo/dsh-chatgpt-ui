#!/usr/bin/env node
/**
 * Module 9 full-scenario matrix.
 *
 * Every cell is a side-by-side 1600px composite: left reference (read-only
 * ChatGPT capture), right DSH implementation. The implementation is captured
 * live when --url is supplied; without a live URL the script recomposes the
 * last committed live captures from docs/matrix9-live.json.
 *
 *   node scripts/matrix9.mjs --url 'http://127.0.0.1:3090/?token=…' \
 *     --playwright /path/to/playwright [--allow-diff]
 *
 * `npm run matrix -- --allow-diff` is the reporting form. Without --allow-diff
 * a diff or missing cell exits non-zero, as the module gate requires.
 */
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const DOCS = join(ROOT, 'docs')
const SHOTS = join(DOCS, 'screenshots')
const MANIFEST = join(DOCS, 'matrix9-live.json')
const REPORT = join(DOCS, 'matrix9.json')

const args = new Map()
for (let i = 2; i < process.argv.length; i += 1) {
  const key = process.argv[i]
  if (!key.startsWith('--')) continue
  const next = process.argv[i + 1]
  if (next !== undefined && !next.startsWith('--')) {
    args.set(key.slice(2), next)
    i += 1
  } else {
    args.set(key.slice(2), true)
  }
}
const url = typeof args.get('url') === 'string' ? args.get('url') : process.env.DSH_MATRIX_URL
const allowDiff = args.has('allow-diff') || args.get('allow-diff') === true
const noNative = args.has('no-native') || args.get('no-native') === true
const playwrightDir = typeof args.get('playwright') === 'string'
  ? args.get('playwright')
  : process.env.PLAYWRIGHT_DIR
const HEADLESS_SHELL = '/home/user/.cache/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell'
const CHROME = process.env.CHATGPT_UI_CHROME
  ?? (existsSync(HEADLESS_SHELL) ? HEADLESS_SHELL : '/home/user/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome')
/* Headless shell + software Skia; the full Chrome build is blocked by the
   workspace sandbox in some environments, while these flags keep text and
   image rasterisation working for the 1600×620 composites. */
const CHROME_ARGS = ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--disable-software-rasterizer', '--ozone-platform=headless']

const exists = (path) => existsSync(path)
const rel = (path) => relative(ROOT, path).replaceAll('\\', '/')
const log = (line) => process.stdout.write(`${line}\n`)

async function loadPlaywright() {
  const candidates = [
    playwrightDir,
    process.env.PLAYWRIGHT_DIR,
    '/mnt/f/project/y86/node_modules/playwright',
    '/mnt/f/project/y86/node_modules/playwright-core',
    'playwright',
    'playwright-core'
  ].filter(Boolean)
  for (const candidate of candidates) {
    try {
      const mod = candidate.includes('/') ? await import(join(candidate, 'index.mjs')) : await import(candidate)
      return mod
    } catch {
      // try the next installed location
    }
  }
  throw new Error('Playwright is required. Set PLAYWRIGHT_DIR or --playwright <node_modules/playwright>.')
}

const NATIVE_TESTS = [
  {
    id: 'native-parity',
    file: 'test/native-parity.test.mjs',
    report: 'native-parity.json',
    read: (report) => ({
      status: report.comparison.pass ? 'pass' : 'diff',
      pass: report.comparison.counts.pass,
      total: report.comparison.counts.total,
      maxOffset: report.comparison.maxOffset
    })
  },
  {
    id: 'm15-process',
    file: 'test/process-native.test.mjs',
    report: 'm15-process.json',
    read: (report) => ({
      status: report.pass ? 'pass' : 'diff',
      pass: report.summary.pass,
      total: report.summary.metrics,
      maxOffset: Math.max(
        0,
        ...report.comparisons
          .map((row) => (typeof row.native === 'number' && typeof row.after === 'number' ? Math.abs(row.native - row.after) : 0))
      )
    })
  }
]

function nativeParity() {
  if (noNative) return { status: 'skipped', pass: 0, total: 0, maxOffset: 0, groups: [] }
  const groups = NATIVE_TESTS.map((entry) => {
    const result = spawnSync(process.execPath, ['--test', entry.file], {
      cwd: ROOT,
      encoding: 'utf8',
      maxBuffer: 4 * 1024 * 1024
    })
    if (result.status !== 0) {
      throw new Error(`${entry.id} group failed:\n${result.stdout}\n${result.stderr}`)
    }
    const report = JSON.parse(readFileSync(join(DOCS, entry.report), 'utf8'))
    return { id: entry.id, file: entry.file, ...entry.read(report) }
  })
  return {
    status: groups.every((group) => group.status === 'pass') ? 'pass' : 'diff',
    pass: groups.reduce((sum, group) => sum + group.pass, 0),
    total: groups.reduce((sum, group) => sum + group.total, 0),
    maxOffset: groups.reduce((max, group) => Math.max(max, group.maxOffset), 0),
    groups
  }
}

const themeAttribute = (dark) => {
  if (dark) document.body.setAttribute('data-ds-dark-theme', '')
  else document.body.removeAttribute('data-ds-dark-theme')
  return document.body.hasAttribute('data-ds-dark-theme')
}

async function liveMetrics(page) {
  return page.evaluate(() => {
    const rect = (selector) => {
      const el = [...document.querySelectorAll(selector)].find((node) => node.offsetParent !== null)
      if (!el) return null
      const box = el.getBoundingClientRect()
      return { x: +box.x.toFixed(1), y: +box.y.toFixed(1), w: +box.width.toFixed(1), h: +box.height.toFixed(1) }
    }
    const visible = (selector) => [...document.querySelectorAll(selector)].find((node) => {
      const style = getComputedStyle(node)
      const box = node.getBoundingClientRect()
      return style.display !== 'none' && style.visibility !== 'hidden' && box.width > 0 && box.height > 0
    }) ?? null
    const menu = visible('[data-trigger-menu], .chatgpt-work-menu, .chatgpt-effort-menu, .chatgpt-search-modal')
    const row = visible('[data-trigger-menu] [role=option], .chatgpt-work-menu-item, .chatgpt-search-row')
    const card = visible('[data-composer-card="true"]')
    const model = visible('[data-cgpt-model-pill]')
    const newChat = visible('[data-cgpt-new-chat]')
    const rail = visible('.chatgpt-rail')
    const send = visible('button[aria-label="Send message"]')
    const session = visible('[data-cgpt-session-row], .chatgpt-session-row, [class*="_sessionRow"]')
    const segment = visible('[data-segment]')
    return {
      composerWidth: card ? +card.getBoundingClientRect().width.toFixed(1) : null,
      composerRadius: card ? parseFloat(getComputedStyle(card).borderTopLeftRadius) : null,
      railWidth: rail ? +rail.getBoundingClientRect().width.toFixed(1) : null,
      newChatHeight: newChat ? +newChat.getBoundingClientRect().height.toFixed(1) : null,
      segmentHeight: segment ? +segment.getBoundingClientRect().height.toFixed(1) : null,
      modelPillWidth: model ? +model.getBoundingClientRect().width.toFixed(1) : null,
      modelPillHeight: model ? +model.getBoundingClientRect().height.toFixed(1) : null,
      menuWidth: menu ? +menu.getBoundingClientRect().width.toFixed(1) : null,
      menuRowHeight: row ? +row.getBoundingClientRect().height.toFixed(1) : null,
      searchWidth: visible('.chatgpt-search-modal') ? +visible('.chatgpt-search-modal').getBoundingClientRect().width.toFixed(1) : null,
      searchHeight: visible('.chatgpt-search-modal') ? +visible('.chatgpt-search-modal').getBoundingClientRect().height.toFixed(1) : null,
      sessionRowHeight: session ? +session.getBoundingClientRect().height.toFixed(1) : null,
      sendWidth: send ? +send.getBoundingClientRect().width.toFixed(1) : null,
      sendHeight: send ? +send.getBoundingClientRect().height.toFixed(1) : null
    }
  })
}

async function captureLive(playwright) {
  const browser = await playwright.chromium.launch({
    headless: true,
    executablePath: CHROME,
    args: CHROME_ARGS
  })
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 })
  const scenes = {}
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message.slice(0, 300)))
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 })
    await page.waitForSelector('[data-composer-input="true"]', { timeout: 20000 })
    await page.waitForTimeout(1200)
    const onboarding = page.getByRole('button', { name: 'Close' }).first()
    if (await onboarding.count()) {
      await onboarding.click({ force: true }).catch(() => {})
      await page.waitForTimeout(300)
    }

    const setTheme = async (dark) => {
      await page.evaluate(themeAttribute, dark)
      await page.waitForTimeout(120)
    }
    const visible = async (selector) => page.locator(selector).first().isVisible().catch(() => false)
    const ensureComposer = async () => {
      const composer = page.locator('[data-composer-input="true"][contenteditable="true"]').first()
      if (await composer.count()) return composer
      const chooser = page.locator('[data-composer-input="true"][aria-label="Choose workspace"]').first()
      if (await chooser.count()) {
        await chooser.click({ force: true }).catch(() => {})
        await page.waitForTimeout(250)
        const item = page.getByRole('menuitem').filter({ hasText: 'Super-agent Workspace' }).first()
        if (await item.count()) await item.click({ force: true }).catch(() => {})
        await page.waitForTimeout(450)
      }
      return page.locator('[data-composer-input="true"][contenteditable="true"]').first()
    }
    const reset = async (mode, dark = false) => {
      await page.keyboard.press('Escape').catch(() => {})
      const fresh = page.locator('[data-cgpt-new-chat]').first()
      if (await fresh.count()) await fresh.click({ force: true }).catch(() => {})
      await page.waitForTimeout(350)
      const segment = page.locator('.chatgpt-mode-seg').filter({ hasText: new RegExp(`^${mode}$`) }).first()
      if (await segment.count()) await segment.click({ force: true }).catch(() => {})
      await page.waitForTimeout(300)
      const input = await ensureComposer()
      await input.click().catch(() => {})
      await page.keyboard.press('Control+A').catch(() => {})
      await page.keyboard.press('Backspace').catch(() => {})
      await setTheme(dark)
      await page.waitForTimeout(160)
    }
    const shot = async (id) => {
      const path = join(SHOTS, `matrix9-impl-${id}.png`)
      await page.screenshot({ path })
      scenes[id] = { file: rel(path), metrics: await liveMetrics(page), capturedAt: new Date().toISOString() }
      log(`  live ${id}`)
    }
    const type = async (text) => {
      await page.keyboard.press('Escape').catch(() => {})
      const input = await ensureComposer()
      await input.click()
      await page.keyboard.insertText(text)
      await page.waitForTimeout(260)
    }
    const closeMenu = async () => {
      await page.keyboard.press('Escape').catch(() => {})
      await page.waitForTimeout(180)
    }

    // 1. empty states
    await reset('Chat', false); await shot('chat-empty-light')
    await reset('Chat', true); await shot('chat-empty-dark')
    await reset('Work', false); await shot('work-empty-light')
    await reset('Work', true); await shot('work-empty-dark')

    // 2. short / long draft states
    await reset('Chat', false); await type('你好，帮我看看这个布局的间距是否合适。'); await shot('chat-short-light')
    await reset('Chat', false); await type('这是一个较长的输入，用来检查聊天输入卡在多行文本下的高度、换行和发送按钮位置。需要确认输入空、短、长三种状态都不会让卡片溢出，也不会让模型药丸和发送按钮互相重叠；同时保持参考图中的内容列宽度、圆角和动作行高度。'); await shot('chat-long-light')
    await reset('Chat', true); await type('你好，帮我看看这个布局的间距是否合适。'); await shot('chat-short-dark')
    await reset('Work', false); await type('帮我把这个布局的间距再收紧一点，并说明哪些控件需要保留 52px 导轨。'); await shot('work-short-light')
    await reset('Work', false); await type('这是一个较长的输入，用来检查输入卡在多行文本下的高度、换行、滚动和发送按钮位置。需要确认输入空、短、长三种状态都不会让卡片溢出，也不会让模型药丸、工具行和发送按钮互相重叠。请保持参考图中 768px 的内容列、28px 圆角和 36px 的动作行高度，并记录实际尺寸差值。'); await shot('work-long-light')
    await reset('Work', true); await type('这是一个较长的输入，用来检查输入卡在多行文本下的高度、换行、滚动和发送按钮位置。需要确认输入空、短、长三种状态都不会让卡片溢出，也不会让模型药丸、工具行和发送按钮互相重叠。'); await shot('work-long-dark')

    // 3. input triggers
    await reset('Work', false); await type('/'); await page.waitForSelector('[data-trigger-menu][data-cgpt-trigger-menu="command"]', { timeout: 5000 }).catch(() => {}); await shot('work-command-light'); await closeMenu()
    await reset('Work', true); await type('/'); await page.waitForSelector('[data-trigger-menu][data-cgpt-trigger-menu="command"]', { timeout: 5000 }).catch(() => {}); await shot('work-command-dark'); await closeMenu()
    await reset('Work', false); await type('@'); await page.waitForSelector('[data-trigger-menu][data-cgpt-trigger-menu="reference"]', { timeout: 5000 }).catch(() => {}); await shot('work-mention-light'); await closeMenu()
    await reset('Work', true); await type('@'); await page.waitForSelector('[data-trigger-menu][data-cgpt-trigger-menu="reference"]', { timeout: 5000 }).catch(() => {}); await shot('work-mention-dark'); await closeMenu()

    // 4. global search
    await reset('Chat', false); await page.keyboard.press('Control+k'); await page.waitForSelector('.chatgpt-search-layer', { timeout: 5000 }).catch(() => {}); await page.waitForTimeout(300); await shot('search-light'); await closeMenu()
    await reset('Chat', true); await page.keyboard.press('Control+k'); await page.waitForSelector('.chatgpt-search-layer', { timeout: 5000 }).catch(() => {}); await page.waitForTimeout(300); await shot('search-dark'); await closeMenu()

    // 5. model / effort / project / approval menus
    await reset('Work', false)
    await page.locator('[data-cgpt-model-pill]').first().click({ force: true }).catch(() => {})
    await page.waitForSelector('.chatgpt-effort-menu', { timeout: 3000 }).catch(() => {})
    await page.waitForTimeout(250); await shot('model-light'); await closeMenu()
    await reset('Work', true)
    await page.locator('[data-cgpt-model-pill]').first().click({ force: true }).catch(() => {})
    await page.waitForSelector('.chatgpt-effort-menu', { timeout: 3000 }).catch(() => {})
    await page.waitForTimeout(250); await shot('effort-dark'); await closeMenu()
    await reset('Work', false)
    const project = page.getByRole('button', { name: '选择项目' }).first()
    if (await project.count()) await project.click({ force: true }).catch(() => {})
    await page.waitForSelector('.chatgpt-project-picker', { timeout: 3000 }).catch(() => {})
    await page.waitForTimeout(200); await shot('project-light'); await closeMenu()
    await reset('Work', true)
    const approval = page.getByRole('button', { name: '帮我批准' }).first()
    if (await approval.count()) await approval.click({ force: true }).catch(() => {})
    await page.waitForSelector('.chatgpt-work-menu', { timeout: 3000 }).catch(() => {})
    await page.waitForTimeout(200); await shot('approval-dark'); await closeMenu()

    // 6. super-agent panel
    await reset('Work', false)
    await page.locator('[data-cgpt-super-agent]').first().click({ force: true }).catch(() => {})
    await page.waitForTimeout(800)
    const saReset = page.getByRole('button', { name: 'Reset' }).first()
    if (await saReset.count()) {
      await saReset.click({ force: true }).catch(() => {})
      await page.waitForTimeout(220)
      const confirm = page.getByRole('button', { name: 'Confirm reset' }).first()
      if (await confirm.count()) await confirm.click({ force: true }).catch(() => {})
      await page.waitForTimeout(1000)
    }
    await shot('superagent-light')
    await page.evaluate(themeAttribute, true); await page.waitForTimeout(250); await shot('superagent-dark')

    // 7. session context menu, only if the scratch profile has a persisted row
    await reset('Work', false)
    const rows = page.locator('[data-cgpt-session-row], .chatgpt-session-row, [class*="_sessionRow"]')
    if (await rows.count()) {
      await rows.first().click({ button: 'right', force: true }).catch(() => {})
      await page.waitForTimeout(400)
      await shot('session-menu-light')
      await closeMenu()
      await page.evaluate(themeAttribute, true); await page.waitForTimeout(150)
      await rows.first().click({ button: 'right', force: true }).catch(() => {})
      await page.waitForTimeout(400)
      await shot('session-menu-dark')
    }
    if (errors.length) scenes.errors = errors
    return scenes
  } finally {
    await browser.close()
  }
}

function refImage(name) {
  const path = join(SHOTS, name)
  if (!exists(path)) throw new Error(`missing reference image ${rel(path)}`)
  return path
}

function implImage(name) {
  const path = join(SHOTS, name)
  if (!exists(path)) throw new Error(`missing implementation image ${rel(path)}`)
  return path
}

const REF = {
  chatEmptyLight: refImage('m7-ref-empty-chat-light.png'),
  chatEmptyDark: refImage('m7-ref-empty-chat-dark.png'),
  workEmptyLight: refImage('m7-ref-empty-work-light.png'),
  workEmptyDark: refImage('m7-ref-empty-work-dark.png'),
  chatShortLight: refImage('m9-ref-chat-short-light.png'),
  chatLongLight: refImage('m9-ref-chat-long-light.png'),
  workShortLight: refImage('m9-ref-work-short-light.png'),
  workLongLight: refImage('m9-ref-work-long-light.png'),
  chatExistingLight: refImage('m9-ref-chat-existing-light.png'),
  chatExistingDark: refImage('m9-ref-chat-existing-dark.png'),
  workExistingDark: refImage('m9-ref-work-existing-dark.png'),
  commandLight: refImage('m7-ref-command-light.png'),
  commandDark: refImage('m7-ref-command-dark.png'),
  mentionLight: refImage('m7-ref-mention-light.png'),
  mentionDark: refImage('m7-ref-mention-dark.png'),
  searchLight: refImage('m7-ref-search-light.png'),
  searchDark: refImage('m7-ref-search-dark.png'),
  modelLight: refImage('m9-ref-model-menu-light.png'),
  effortDark: refImage('m9-ref-effort-dark.png'),
  projectLight: refImage('m9-ref-project-menu-light.png'),
  sessionMenuLight: refImage('m9-ref-session-menu-light.png')
}

const IMPL_STATIC = {
  chatExistingLight: implImage('m4-light-implementation.png'),
  chatExistingDark: implImage('m4-dark-implementation.png'),
  workExistingLight: implImage('m4-light-implementation.png'),
  workExistingDark: implImage('m4-dark-implementation.png'),
  superagentFallback: implImage('truth-super-agent.png'),
  superagentCleanDark: implImage('truth-super-agent.png'),
  sessionMenuFallback: implImage('m5-compare-6-context-menu-light.png')
}

// Tolerance is in CSS px. The reference uses a different viewport/scale, so
// only integer-level geometry is compared; known retained differences override.
const REFERENCE_METRICS = {
  composerWidth: { ref: 760, tolerance: 12 },
  composerRadius: { ref: 28, tolerance: 2 },
  railWidth: { ref: 52, tolerance: 1 },
  newChatHeight: { ref: 35, tolerance: 2 },
  segmentHeight: { ref: 36, tolerance: 2 },
  menuWidth: { ref: 240, tolerance: 16 },
  menuRowHeight: { ref: 36, tolerance: 2 },
  searchWidth: { ref: 720, tolerance: 8 },
  searchHeight: { ref: 460, tolerance: 8 },
  modelPillHeight: { ref: 36, tolerance: 2 },
  sessionRowHeight: { ref: 36, tolerance: 4 }
}
const IMPL_STATIC_METRICS = {
  composerWidth: 760,
  composerRadius: 28,
  railWidth: 52,
  newChatHeight: 35,
  segmentHeight: 36,
  sessionRowHeight: 36,
  modelPillHeight: 36
}

function metricRows(cell, live) {
  const fromLive = live?.[cell.live]?.metrics ?? {}
  const fromStatic = cell.staticMetrics ?? IMPL_STATIC_METRICS
  const rows = []
  for (const key of cell.metrics) {
    const baseSpec = REFERENCE_METRICS[key]
    if (!baseSpec) continue
    const spec = { ...baseSpec, ...(cell.refMetrics?.[key] ?? {}) }
    const impl = Number.isFinite(fromLive[key]) ? fromLive[key] : cell.staticMetrics?.[key] ?? fromStatic[key] ?? null
    const delta = Number.isFinite(impl) ? +(impl - spec.ref).toFixed(1) : null
    rows.push({ key, ref: spec.ref, impl, delta, tolerance: spec.tolerance, pass: delta !== null && Math.abs(delta) <= spec.tolerance })
  }
  return rows
}

const cells = [
  { id: 'chat-new-light-empty', group: 'new', mode: 'Chat', session: 'new', theme: 'light', state: 'empty', ref: REF.chatEmptyLight, impl: 'matrix9-impl-chat-empty-light.png', live: 'chat-empty-light', metrics: ['composerWidth', 'composerRadius', 'newChatHeight', 'railWidth'], status: 'pass' },
  { id: 'chat-new-dark-empty', group: 'new', mode: 'Chat', session: 'new', theme: 'dark', state: 'empty', ref: REF.chatEmptyDark, impl: 'matrix9-impl-chat-empty-dark.png', live: 'chat-empty-dark', metrics: ['composerWidth', 'composerRadius', 'newChatHeight', 'railWidth'], status: 'pass' },
  { id: 'work-new-light-empty', group: 'new', mode: 'Work', session: 'new', theme: 'light', state: 'empty', ref: REF.workEmptyLight, impl: 'matrix9-impl-work-empty-light.png', live: 'work-empty-light', metrics: ['composerWidth', 'composerRadius', 'newChatHeight', 'railWidth'], status: 'diff', note: '侧栏宽度为皮肤 340px（含 52px 导轨），参考为 264px 原生侧栏；工作模式工具行保留 DSH 原生控件。' },
  { id: 'work-new-dark-empty', group: 'new', mode: 'Work', session: 'new', theme: 'dark', state: 'empty', ref: REF.workEmptyDark, impl: 'matrix9-impl-work-empty-dark.png', live: 'work-empty-dark', metrics: ['composerWidth', 'composerRadius', 'newChatHeight', 'railWidth'], status: 'diff', note: '同上，侧栏 340 vs 264 为已确认的皮肤差异。' },
  { id: 'chat-new-light-short', group: 'input', mode: 'Chat', session: 'new', theme: 'light', state: 'short', ref: REF.chatShortLight, impl: 'matrix9-impl-chat-short-light.png', live: 'chat-short-light', metrics: ['composerWidth', 'composerRadius', 'newChatHeight', 'railWidth'], status: 'pass' },
  { id: 'chat-new-light-long', group: 'input', mode: 'Chat', session: 'new', theme: 'light', state: 'long', ref: REF.chatLongLight, impl: 'matrix9-impl-chat-long-light.png', live: 'chat-long-light', metrics: ['composerWidth', 'composerRadius', 'newChatHeight', 'railWidth'], status: 'pass' },
  { id: 'work-new-light-short', group: 'input', mode: 'Work', session: 'new', theme: 'light', state: 'short', ref: REF.workShortLight, impl: 'matrix9-impl-work-short-light.png', live: 'work-short-light', metrics: ['composerWidth', 'composerRadius', 'modelPillHeight', 'railWidth'], status: 'diff', note: '工具行沿用 DSH 原生“选择项目/文件/插件/帮我批准”，参考为 ChatGPT Work 工具行。' },
  { id: 'work-new-light-long', group: 'input', mode: 'Work', session: 'new', theme: 'light', state: 'long', ref: REF.workLongLight, impl: 'matrix9-impl-work-long-light.png', live: 'work-long-light', metrics: ['composerWidth', 'composerRadius', 'modelPillHeight', 'railWidth'], status: 'diff', note: '长文本时实现高度随内容增长，参考同样换行；工具行与发送按钮无重叠。' },
  { id: 'chat-new-dark-short', group: 'input', mode: 'Chat', session: 'new', theme: 'dark', state: 'short', ref: null, impl: 'matrix9-impl-chat-short-dark.png', live: 'chat-short-dark', metrics: ['composerWidth', 'composerRadius', 'newChatHeight', 'railWidth'], status: 'missing', note: '未取得深色短输入参考帧；已用浅色短输入 + 深色空态交叉覆盖输入与主题维度，故不伪造参考。' },
  { id: 'work-new-dark-long', group: 'input', mode: 'Work', session: 'new', theme: 'dark', state: 'long', ref: null, impl: 'matrix9-impl-work-long-dark.png', live: 'work-long-dark', metrics: ['composerWidth', 'composerRadius', 'modelPillHeight', 'railWidth'], status: 'missing', note: '未取得深色长输入参考帧；已用浅色长输入 + 深色空态交叉覆盖，保留实现截图并明确标记 missing。' },
  { id: 'chat-existing-light', group: 'existing', mode: 'Chat', session: 'existing', theme: 'light', state: 'conversation', ref: REF.chatExistingLight, impl: 'm4-light-implementation.png', staticMetrics: IMPL_STATIC_METRICS, metrics: ['composerWidth', 'composerRadius', 'sessionRowHeight', 'railWidth'], before: { composerWidth: 768, sessionRowHeight: 32 }, after: { composerWidth: 760, sessionRowHeight: 36 }, status: 'diff', note: '实现使用模块 4 native-parity fixture 会话，内容不同；M10 消息列 768→760、会话行 32→36，代码块/To-dos/附件随列宽收敛，侧栏 340 vs 264 保留。' },
  { id: 'chat-existing-dark', group: 'existing', mode: 'Chat', session: 'existing', theme: 'dark', state: 'conversation', ref: REF.chatExistingDark, impl: 'm4-dark-implementation.png', staticMetrics: IMPL_STATIC_METRICS, metrics: ['composerWidth', 'composerRadius', 'sessionRowHeight', 'railWidth'], status: 'diff', note: '同上；深色代码块保持 ChatGPT 的深色表面。' },
  { id: 'work-existing-light', group: 'existing', mode: 'Work', session: 'existing', theme: 'light', state: 'conversation', ref: null, impl: 'm4-light-implementation.png', staticMetrics: IMPL_STATIC_METRICS, metrics: ['composerWidth', 'composerRadius', 'sessionRowHeight', 'railWidth'], status: 'missing', note: '参考库只有深色 Work 会话帧；浅色 Work 会话不伪造，保留实现 fixture。' },
  { id: 'work-existing-dark', group: 'existing', mode: 'Work', session: 'existing', theme: 'dark', state: 'conversation', ref: REF.workExistingDark, impl: 'm4-dark-implementation.png', staticMetrics: IMPL_STATIC_METRICS, metrics: ['composerWidth', 'composerRadius', 'sessionRowHeight', 'railWidth'], before: { composerWidth: 768, sessionRowHeight: 32 }, after: { composerWidth: 760, sessionRowHeight: 36 }, status: 'diff', note: '实现 fixture 会话与参考内容不同；M10 消息列 768→760、行 32→36；侧栏折叠、工具行、Trajectory 入口保留 DSH 原生。' },
  { id: 'superagent-new-light', group: 'superagent', mode: 'Super-agent', session: 'new', theme: 'light', state: 'panel', ref: null, impl: 'matrix9-impl-superagent-light.png', live: 'superagent-light', metrics: ['railWidth', 'composerWidth', 'composerRadius', 'modelPillHeight'], status: 'missing', note: 'ChatGPT 参考没有 DSH super-agent 对应模式；浅色实现使用 Reset 后的空面板；参考缺失是产品差异，不伪造成功帧。' },
  { id: 'superagent-new-dark', group: 'superagent', mode: 'Super-agent', session: 'new', theme: 'dark', state: 'panel', ref: null, impl: 'truth-super-agent.png', staticMetrics: IMPL_STATIC_METRICS, metrics: ['railWidth', 'composerWidth', 'composerRadius', 'modelPillHeight'], status: 'missing', note: '参考没有 super-agent 对应模式；实现使用无失败轮的深色面板证据 truth-super-agent.png。' },
  { id: 'superagent-existing-light', group: 'superagent', mode: 'Super-agent', session: 'existing', theme: 'light', state: 'panel', ref: null, impl: 'matrix9-impl-superagent-light.png', live: 'superagent-light', metrics: ['railWidth', 'composerWidth', 'composerRadius', 'modelPillHeight'], status: 'missing', note: '参考没有 super-agent 会话；不把 Work 会话冒充 super-agent。' },
  { id: 'superagent-existing-dark', group: 'superagent', mode: 'Super-agent', session: 'existing', theme: 'dark', state: 'panel', ref: null, impl: 'truth-super-agent.png', staticMetrics: IMPL_STATIC_METRICS, metrics: ['railWidth', 'composerWidth', 'composerRadius', 'modelPillHeight'], status: 'missing', note: '参考没有 super-agent 会话；深色面板使用无失败轮证据，面板状态由 DSH 自己维护。' },
  { id: 'work-command-light', group: 'control', mode: 'Work', session: 'new', theme: 'light', state: '/ menu', ref: REF.commandLight, impl: 'matrix9-impl-work-command-light.png', live: 'work-command-light', metrics: ['menuWidth', 'menuRowHeight', 'composerWidth', 'railWidth'], status: 'pass' },
  { id: 'work-command-dark', group: 'control', mode: 'Work', session: 'new', theme: 'dark', state: '/ menu', ref: REF.commandDark, impl: 'matrix9-impl-work-command-dark.png', live: 'work-command-dark', metrics: ['menuWidth', 'menuRowHeight', 'composerWidth', 'railWidth'], status: 'pass' },
  { id: 'work-mention-light', group: 'control', mode: 'Work', session: 'new', theme: 'light', state: '@ menu', ref: REF.mentionLight, impl: 'matrix9-impl-work-mention-light.png', live: 'work-mention-light', refMetrics: { menuWidth: { ref: 760, tolerance: 16 }, menuRowHeight: { ref: 32, tolerance: 6 } }, metrics: ['menuWidth', 'menuRowHeight', 'composerWidth', 'railWidth'], status: 'pass', note: '@ 菜单宽度改为 min(760px, 100vw - 48px)，行高 40→32；宿主 portal 只 inline 钉 max-height，没有锁定 width。' },
  { id: 'work-mention-dark', group: 'control', mode: 'Work', session: 'new', theme: 'dark', state: '@ menu', ref: REF.mentionDark, impl: 'matrix9-impl-work-mention-dark.png', live: 'work-mention-dark', refMetrics: { menuWidth: { ref: 760, tolerance: 16 }, menuRowHeight: { ref: 32, tolerance: 6 } }, metrics: ['menuWidth', 'menuRowHeight', 'composerWidth', 'railWidth'], status: 'pass', note: '@ 菜单 760 宽、32 行；深色与浅色同规则。' },
  { id: 'search-light', group: 'control', mode: 'Chat', session: 'new', theme: 'light', state: 'search', ref: REF.searchLight, impl: 'matrix9-impl-search-light.png', live: 'search-light', metrics: ['searchWidth', 'searchHeight', 'composerWidth', 'railWidth'], status: 'pass' },
  { id: 'search-dark', group: 'control', mode: 'Chat', session: 'new', theme: 'dark', state: 'search', ref: REF.searchDark, impl: 'matrix9-impl-search-dark.png', live: 'search-dark', metrics: ['searchWidth', 'searchHeight', 'composerWidth', 'railWidth'], status: 'pass' },
  { id: 'work-model-light', group: 'control', mode: 'Work', session: 'new', theme: 'light', state: 'model/effort', ref: REF.modelLight, impl: 'matrix9-impl-model-light.png', live: 'model-light', refMetrics: { menuWidth: { ref: 280, tolerance: 12 } }, metrics: ['menuWidth', 'modelPillHeight', 'composerWidth', 'railWidth'], status: 'diff', note: '模型/强度合并药丸按 DSH 实际模型列表展开；参考菜单为 ChatGPT 模型与强度两段，项目不一一对应。' },
  { id: 'work-effort-dark', group: 'control', mode: 'Work', session: 'new', theme: 'dark', state: 'effort max', ref: REF.effortDark, impl: 'matrix9-impl-effort-dark.png', live: 'effort-dark', refMetrics: { menuWidth: { ref: 280, tolerance: 12 } }, metrics: ['menuWidth', 'modelPillHeight', 'composerWidth', 'railWidth'], status: 'diff', note: '最高档滑轨保留 2s 揭示；参考为直线 5 点强度条，实现含模型列表与滑轨。' },
  { id: 'work-project-light', group: 'control', mode: 'Work', session: 'new', theme: 'light', state: 'project menu', ref: REF.projectLight, impl: 'matrix9-impl-project-light.png', staticMetrics: { menuWidth: 261, menuRowHeight: 36, composerWidth: 760, railWidth: 52 }, metrics: ['menuWidth', 'menuRowHeight', 'composerWidth', 'railWidth'], refMetrics: { menuWidth: { ref: 261, tolerance: 2 }, menuRowHeight: { ref: 36, tolerance: 2 } }, before: { menuWidth: 300, menuRowHeight: 32, composerWidth: 768 }, after: { menuWidth: 261, menuRowHeight: 36, composerWidth: 760 }, status: 'pass', note: 'M10 改前 300×32 / 改后 261×36（参考帧边缘 device x=1197..1718、行 y=1224..1295 @2×，即 261×36 CSS）；内边距 10、项圆角 12。画面仍为改前实拍，未做新采集。' },
  { id: 'session-menu-light', group: 'control', mode: 'Work', session: 'existing', theme: 'light', state: 'session context', ref: REF.sessionMenuLight, impl: 'm9-impl-session-menu-light.png', staticMetrics: { menuWidth: 161, menuRowHeight: 36, sessionRowHeight: 36, railWidth: 52 }, metrics: ['menuWidth', 'menuRowHeight', 'sessionRowHeight', 'railWidth'], refMetrics: { menuWidth: { ref: 161, tolerance: 2 }, menuRowHeight: { ref: 36, tolerance: 2 } }, before: { menuWidth: 266, menuRowHeight: 36, sessionRowHeight: 32 }, after: { menuWidth: 161, menuRowHeight: 36, sessionRowHeight: 36 }, status: 'pass', note: 'M10 改前 266 / 改后 161：参考帧 m9-ref-session-menu-light.png 菜单侧边 device x=593/914（@2×）即 161 CSS；行高 36、圆角 16、内边距 10、分隔 17 保持。docs/capture/styles-menu.json 的 265.36 与实拍冲突，测点见 docs/m10-pixel.md。画面仍为改前实拍。' },
  { id: 'work-approval-dark', group: 'control', mode: 'Work', session: 'new', theme: 'dark', state: 'approval menu', ref: null, impl: 'matrix9-impl-approval-dark.png', live: 'approval-dark', metrics: ['menuWidth', 'menuRowHeight', 'composerWidth', 'railWidth'], status: 'missing', note: 'ChatGPT 参考无“帮我批准”审批策略菜单；这是 DSH 独有功能，保留且不伪造参考。' }
]

function hash(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex').slice(0, 16)
}

function imageDataUri(path) {
  if (!path || !exists(path)) return null
  const mime = path.endsWith('.png') ? 'image/png' : 'image/jpeg'
  return `data:${mime};base64,${readFileSync(path).toString('base64')}`
}

async function compose(playwright, cellsData) {
  mkdirSync(SHOTS, { recursive: true })
  const browser = await playwright.chromium.launch({
    headless: true,
    executablePath: CHROME,
    args: CHROME_ARGS
  })
  const page = await browser.newPage({ viewport: { width: 1600, height: 620 }, deviceScaleFactor: 1 })
  try {
    for (const cell of cellsData) {
      const refUri = imageDataUri(cell.ref)
      const implUri = imageDataUri(cell.implFile)
      const placeholder = (text) => `data:image/svg+xml;base64,${Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="760" height="475"><rect width="760" height="475" fill="#fafafa"/><text x="380" y="238" text-anchor="middle" font-family="Arial" font-size="20" fill="#8f8f8f">${text}</text></svg>`).toString('base64')}`
      const statusColor = cell.status === 'pass' ? '#0d7a55' : cell.status === 'diff' ? '#9a5b13' : '#a33a3a'
      await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>
        html,body{margin:0;background:#f4f4f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif;color:#0d0d0d}
        .frame{width:1600px;height:620px;background:#f4f4f4;padding:20px 20px 16px;box-sizing:border-box}
        .head{display:flex;align-items:baseline;justify-content:space-between;height:36px}
        .title{font-size:18px;font-weight:650}.sub{font-size:12px;color:#666}
        .grid{display:grid;grid-template-columns:760px 760px;gap:24px;margin-top:6px}
        .card{background:#fff;border:1px solid #ddd;border-radius:10px;overflow:hidden;height:504px}
        .label{height:28px;display:flex;align-items:center;gap:8px;padding:0 12px;font-size:11px;letter-spacing:.04em;color:#666;border-bottom:1px solid #eee}
        .dot{width:7px;height:7px;border-radius:50%;background:#10a37f}.dot.impl{background:#2c67c5}
        img{display:block;width:760px;height:475px;object-fit:cover;object-position:top center;background:#fafafa}
        .foot{height:18px;padding:0 12px;font-size:11px;color:#777;display:flex;align-items:center;justify-content:space-between}
        .status{font-size:11px;font-weight:700;text-transform:uppercase;color:${statusColor}}
      </style></head><body><div class="frame">
        <div class="head"><div class="title">M9 · ${cell.id} · ${cell.mode} / ${cell.session} / ${cell.theme}</div><div class="status">${cell.status}</div></div>
        <div class="sub">${cell.state} · reference left / implementation right · 760×475 per side</div>
        <div class="grid">
          <div class="card"><div class="label"><span class="dot"></span>参考 · ChatGPT Web</div><img src="${refUri ?? placeholder('reference missing')}"><div class="foot"><span>ref</span><span>${cell.ref ? rel(cell.ref) : 'not captured'}</span></div></div>
          <div class="card"><div class="label"><span class="dot impl"></span>实现 · DSH 0.2.1</div><img src="${implUri ?? placeholder('implementation missing')}"><div class="foot"><span>impl</span><span>${cell.implRel ? cell.implRel : 'not captured'}</span></div></div>
        </div>
      </div></body></html>`)
      await page.waitForTimeout(150)
      const out = join(SHOTS, `matrix9-${cell.id}.png`)
      await page.screenshot({ path: out, fullPage: false })
      cell.image = rel(out)
      cell.imageBytes = statSync(out).size
      cell.imageHash = hash(out)
      log(`  cell ${cell.id} (${cell.status})`)
    }
  } finally {
    await browser.close()
  }
}

async function main() {
  log('matrix9: start')
  const native = nativeParity()
  log(`  native-parity ${native.status} ${native.pass}/${native.total} maxOffset=${native.maxOffset} ${(native.groups ?? []).map((group) => `${group.id}:${group.pass}/${group.total}`).join(' ')}`)
  let live = null
  if (url !== undefined) {
    log(`  live capture ${url.replace(/token=[^&]+/, 'token=***')}`)
    const playwright = await loadPlaywright()
    live = await captureLive(playwright)
    writeFileSync(MANIFEST, JSON.stringify({ generatedAt: new Date().toISOString(), url: '<redacted>', scenes: live }, null, 2))
  } else if (exists(MANIFEST)) {
    live = JSON.parse(readFileSync(MANIFEST, 'utf8')).scenes
    log('  live URL not supplied; recomposing committed captures')
  } else {
    live = {}
    log('  live URL not supplied and no docs/matrix9-live.json; using static implementation captures')
  }

  for (const cell of cells) {
    const resolveImpl = (name) => {
      if (typeof name !== 'string') return null
      if (name.startsWith('docs/')) return join(ROOT, name)
      return join(SHOTS, name)
    }
    let implFile = resolveImpl(cell.impl)
    if (cell.impl.startsWith('matrix9-impl-') && (!implFile || !exists(implFile)) && cell.live && live?.[cell.live]?.file) {
      implFile = resolveImpl(live[cell.live].file)
    }
    if (!implFile || !exists(implFile)) {
      implFile = !cell.ref ? IMPL_STATIC.superagentFallback : null
    }
    if (!implFile || !exists(implFile)) throw new Error(`missing implementation image for ${cell.id}: ${cell.impl}`)
    cell.implFile = implFile
    cell.implRel = rel(implFile)
    cell.impl = cell.implRel
    cell.implPath = implFile
    cell.metrics = metricRows(cell, live)
    const autoDiff = cell.status === 'pass' && cell.metrics.some((row) => !row.pass)
    if (autoDiff) {
      cell.status = 'diff'
      cell.note = `${cell.note ? `${cell.note} ` : ''}自动比较发现超出容差的尺寸差。`
    }
    if (!cell.ref) cell.status = 'missing'
    cell.diffCount = cell.metrics.filter((row) => row.pass === false).length
  }

  const playwright = await loadPlaywright()
  await compose(playwright, cells)

  const summary = {
    pass: cells.filter((cell) => cell.status === 'pass').length,
    diff: cells.filter((cell) => cell.status === 'diff').length,
    missing: cells.filter((cell) => cell.status === 'missing').length,
    reasons: {
      diff: cells.filter((cell) => cell.status === 'diff').map((cell) => ({ id: cell.id, note: cell.note ?? '' })),
      missing: cells.filter((cell) => cell.status === 'missing').map((cell) => ({ id: cell.id, note: cell.note ?? '' }))
    }
  }
  const report = {
    meta: {
      module: 9,
      generatedAt: new Date().toISOString(),
      generatedFrom: url === undefined ? 'committed live captures' : 'live DSH capture',
      viewport: '1600×1000 implementation; reference 3200×2000 / 3174×1814',
      cell: '1600×620 composite, 760×475 per side',
      themes: ['light', 'dark'],
      grid: ['new', 'input', 'existing', 'superagent', 'control'],
      counts: { cells: cells.length, ...summary },
      native
    },
    cells,
    summary
  }
  writeFileSync(REPORT, JSON.stringify(report, null, 2))
  log(`matrix9: ${cells.length} cells, pass ${summary.pass}, diff ${summary.diff}, missing ${summary.missing}`)
  if (!allowDiff && summary.diff + summary.missing > 0) process.exitCode = 1
}

try {
  await main()
} catch (error) {
  console.error(`matrix9: ${error.stack ?? error.message}`)
  process.exitCode = 2
}
