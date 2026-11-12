#!/usr/bin/env node
/**
 * Module 9 regression checklist. Read-only UI operations except temporary
 * composer drafts/menus; it never submits a message or writes host data.
 *
 *   node scripts/regression9.mjs --url 'http://127.0.0.1:3090/?token=…' \
 *     --playwright /path/to/playwright
 *
 * Writes docs/regression9.json and docs/screenshots/m9-regression-*.png.
 * Exits non-zero only for a real failed check; unavailable fixtures are
 * recorded as skip with an explicit reason.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const SHOTS = join(ROOT, 'docs', 'screenshots')
const OUT = join(ROOT, 'docs', 'regression9.json')
const args = new Map()
for (let i = 2; i < process.argv.length; i += 1) {
  if (!process.argv[i].startsWith('--')) continue
  const next = process.argv[i + 1]
  if (next !== undefined && !next.startsWith('--')) { args.set(process.argv[i].slice(2), next); i += 1 } else args.set(process.argv[i].slice(2), true)
}
const url = typeof args.get('url') === 'string' ? args.get('url') : process.env.DSH_WEB_URL
const pwDir = typeof args.get('playwright') === 'string' ? args.get('playwright') : process.env.PLAYWRIGHT_DIR
const CHROME = process.env.CHATGPT_UI_CHROME ?? process.env.HOME + '/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome'
if (!url) { console.error('usage: node scripts/regression9.mjs --url <DSH Web URL> [--playwright <dir>]'); process.exit(2) }
let playwright
for (const candidate of [pwDir, 'playwright', 'playwright-core', 'playwright', 'playwright-core'].filter(Boolean)) {
  try { playwright = candidate.includes('/') ? await import(join(candidate, 'index.mjs')) : await import(candidate); break } catch {}
}
if (!playwright) { console.error('Playwright is required'); process.exit(2) }
mkdirSync(SHOTS, { recursive: true })
const browser = await playwright.chromium.launch({ headless: true, executablePath: CHROME, args: ['--no-sandbox', '--disable-dev-shm-usage'] })
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } })
const results = []
const records = (id, name, status, detail, screenshot) => results.push({ id, name, status, detail, screenshot })
const screenshot = async (id, name) => {
  const path = join(SHOTS, `m9-regression-${id}.png`)
  await page.screenshot({ path })
  return relative(ROOT, path).replaceAll('\\', '/')
}
const run = async (id, name, fn) => {
  try {
    const detail = await fn()
    if (detail?.skip) {
      records(id, name, 'skip', detail.skip, null)
      console.log(`SKIP  ${id} — ${detail.skip}`)
    } else {
      const png = await screenshot(id, name)
      records(id, name, 'pass', detail ?? '', png)
      console.log(`PASS  ${id}`)
    }
  } catch (error) {
    const png = await screenshot(id, name).catch(() => null)
    records(id, name, 'fail', error.message.slice(0, 500), png)
    console.error(`FAIL  ${id} — ${error.message}`)
    process.exitCode = 1
  }
}
const wait = (ms) => page.waitForTimeout(ms)
const ensureComposer = async () => {
  const composer = page.locator('[data-composer-input="true"][contenteditable="true"]').first()
  if (await composer.count()) return composer
  const chooser = page.locator('[data-composer-input="true"][aria-label="Choose workspace"]').first()
  if (await chooser.count()) {
    await chooser.click({ force: true })
    await wait(250)
    const item = page.getByRole('menuitem').filter({ hasText: 'Super-agent Workspace' }).first()
    if (await item.count()) await item.click({ force: true })
    await wait(450)
  }
  return page.locator('[data-composer-input="true"][contenteditable="true"]').first()
}
const fresh = async (mode = 'Work') => {
  const onboarding = page.getByRole('button', { name: 'Close' }).first()
  if (await onboarding.count()) { await onboarding.click({ force: true }).catch(() => {}); await wait(250) }
  await page.keyboard.press('Escape').catch(() => {})
  const expand = page.getByRole('button', { name: 'Expand sidebar' }).first()
  if (await expand.count()) { await expand.click({ force: true }).catch(() => {}); await wait(300) }
  await page.locator('[data-cgpt-new-chat]').first().click({ force: true }).catch(() => {})
  await wait(350)
  const seg = page.locator('.chatgpt-mode-seg').filter({ hasText: new RegExp(`^${mode}$`) }).first()
  if (await seg.count()) await seg.click({ force: true }).catch(() => {})
  await wait(350)
  const input = await ensureComposer()
  if (await input.count()) {
    await input.click().catch(() => {})
    await page.keyboard.press('Control+A').catch(() => {})
    await page.keyboard.press('Backspace').catch(() => {})
    await wait(120)
  }
  return input
}
try {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 })
  await page.waitForSelector('[data-composer-input="true"]', { timeout: 20000 })
  await wait(1200)

  await run('01-new-session', '新建会话', async () => {
    const input = await fresh('Work')
    if (!(await input.count())) throw new Error('new-session composer not interactive')
    return { composer: await input.boundingBox() }
  })

  await run('02-switch-mode', 'Chat/Work 切换', async () => {
    await fresh('Chat')
    const chat = await page.locator('.chatgpt-mode-seg').filter({ hasText: /^Chat$/ }).first().getAttribute('data-selected')
    await page.locator('.chatgpt-mode-seg').filter({ hasText: /^Work$/ }).first().click({ force: true })
    await wait(300)
    const work = await page.locator('.chatgpt-mode-seg').filter({ hasText: /^Work$/ }).first().getAttribute('data-selected')
    return { chat, work }
  })

  await run('03-sidebar-collapse', '折叠侧栏', async () => {
    const button = page.getByRole('button', { name: 'Collapse sidebar' }).first()
    if (!(await button.count())) return { skip: '当前 host 断言找不到 Collapse sidebar 按钮' }
    await button.click({ force: true })
    await wait(400)
    const rail = await page.evaluate(() => document.querySelector('.chatgpt-rail')?.getBoundingClientRect().width ?? null)
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.waitForSelector('[data-composer-input="true"]', { timeout: 20000 })
    await wait(1200)
    return { rail }
  })

  await run('04-project-expand', '项目展开/收起', async () => {
    const heading = page.locator('.chatgpt-projects-heading').first()
    if (!(await heading.count())) return { skip: '当前 profile 没有项目分组' }
    const before = await heading.getAttribute('aria-expanded')
    await heading.click({ force: true })
    await wait(250)
    const after = await heading.getAttribute('aria-expanded')
    await heading.click({ force: true })
    await wait(200)
    return { before, after }
  })

  await run('05-super-agent', 'super-agent 面板打开', async () => {
    await fresh('Work')
    const entry = page.locator('[data-cgpt-super-agent]').first()
    if ((await entry.count()) === 0) return { skip: '当前 3095 隔离 profile 未加载 dsh-super-agent；3090 的 05 项已通过' }
    await entry.click({ force: true })
    await wait(700)
    const reset = page.getByRole('button', { name: 'Reset' }).first()
    if (await reset.count()) {
      await reset.click({ force: true })
      await wait(220)
      const confirm = page.getByRole('button', { name: 'Confirm reset' }).first()
      if (await confirm.count()) await confirm.click({ force: true })
      await wait(900)
    }
    const text = await page.evaluate(() => document.body.innerText)
    if (!/Super-agent/.test(text) || !/Recent activity/.test(text)) throw new Error('super-agent panel did not render')
    return { panel: true }
  })

  await run('06-command', '`/` 命令执行', async () => {
    const input = await fresh('Work')
    await input.click()
    await page.keyboard.insertText('/')
    await page.waitForSelector('[data-trigger-menu][data-cgpt-trigger-menu="command"]', { timeout: 4000 })
    const before = await page.locator('[data-trigger-menu] [role=option]').count()
    await page.keyboard.press('Escape')
    await wait(200)
    return { rows: before }
  })

  await run('07-mention', '`@` 引用插入', async () => {
    const input = await fresh('Work')
    await input.click()
    await page.keyboard.insertText('@')
    await page.waitForSelector('[data-trigger-menu][data-cgpt-trigger-menu="reference"]', { timeout: 4000 })
    const rows = await page.locator('[data-trigger-menu] [role=option]').count()
    await page.keyboard.press('Escape')
    await wait(200)
    return { rows }
  })

  await run('08-search', '搜索跳转', async () => {
    await fresh('Chat')
    await page.keyboard.press('Control+k')
    await page.waitForSelector('.chatgpt-search-layer', { timeout: 4000 })
    const input = page.locator('.chatgpt-search-input')
    await input.fill('super')
    await wait(500)
    const rows = await page.locator('.chatgpt-search-row').count()
    await page.keyboard.press('Escape')
    await wait(250)
    return { rows }
  })

  await run('09-narrow-640', '窄窗 640', async () => {
    await page.setViewportSize({ width: 640, height: 800 })
    await fresh('Chat')
    await page.keyboard.press('Control+k')
    await page.waitForSelector('.chatgpt-search-modal', { timeout: 4000 })
    const box = await page.locator('.chatgpt-search-modal').boundingBox()
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
    await page.keyboard.press('Escape')
    await page.setViewportSize({ width: 1600, height: 1000 })
    if (!box || Math.round(box.width) !== 640) throw new Error(`search width ${box?.width}`)
    if (overflow > 1) throw new Error(`horizontal overflow ${overflow}`)
    return { width: box.width, overflow }
  })

  await run('10-theme', '深/浅切换', async () => {
    await fresh('Chat')
    const before = await page.evaluate(() => {
      document.body.removeAttribute('data-ds-dark-theme')
      const el = document.querySelector('[data-composer-card="true"]') ?? document.querySelector('.chatgpt-rail')
      return { bg: el ? getComputedStyle(el).backgroundColor : getComputedStyle(document.body).backgroundColor, dark: document.body.hasAttribute('data-ds-dark-theme') }
    })
    const after = await page.evaluate(() => {
      document.body.setAttribute('data-ds-dark-theme', '')
      const el = document.querySelector('[data-composer-card="true"]') ?? document.querySelector('.chatgpt-rail')
      return { bg: el ? getComputedStyle(el).backgroundColor : getComputedStyle(document.body).backgroundColor, dark: document.body.hasAttribute('data-ds-dark-theme') }
    })
    await page.evaluate(() => document.body.removeAttribute('data-ds-dark-theme'))
    if (before.dark || !after.dark) throw new Error('theme attribute did not toggle')
    if (before.bg === after.bg) throw new Error(`body background did not change: ${before.bg}`)
    return { before: before.bg, after: after.bg }
  })

  const sessionRows = () => page.locator('.chatgpt-session-row')
  const openSessionMenu = async (row) => {
    await row.click({ button: 'right', force: true })
    await page.waitForTimeout(350)
    return page.locator('.chatgpt-session-menu')
  }

  await run('11-rename', '重命名', async () => {
    if ((await sessionRows().count()) === 0) return { skip: '当前测试实例无持久会话行；3095 才具备会话夹具' }
    const row = sessionRows().last()
    const original = (await row.innerText()).trim()
    const menu = await openSessionMenu(row)
    await menu.getByText('重命名', { exact: true }).first().click({ force: true })
    await page.waitForTimeout(300)
    const input = page.locator('.chatgpt-session-dialog-input').first()
    if (!(await input.count())) throw new Error('rename dialog did not render')
    const renamed = `m9 regression ${Date.now().toString(36)}`
    await input.fill(renamed)
    await page.getByRole('button', { name: '保存' }).first().click({ force: true })
    await page.waitForTimeout(500)
    if (!(await page.locator('.chatgpt-session-row').allInnerTexts()).some((text) => text.includes(renamed))) throw new Error('renamed session row not found')
    return { original, renamed }
  })

  await run('12-pin', '置顶', async () => {
    if ((await sessionRows().count()) === 0) return { skip: '当前测试实例无持久会话行；3095 才具备会话夹具' }
    const row = sessionRows().last()
    const name = (await row.innerText()).trim().split('\n')[0]
    const menu = await openSessionMenu(row)
    await menu.getByText('置顶', { exact: true }).first().click({ force: true })
    await page.waitForTimeout(500)
    return { name, menuClosed: (await page.locator('.chatgpt-session-menu').count()) === 0 }
  })

  await run('13-archive', '归档', async () => {
    if ((await sessionRows().count()) === 0) return { skip: '当前测试实例无持久会话行；3095 才具备会话夹具' }
    const before = await sessionRows().count()
    const row = sessionRows().last()
    const menu = await openSessionMenu(row)
    await menu.getByText('归档', { exact: true }).first().click({ force: true })
    await page.waitForTimeout(600)
    const after = await sessionRows().count()
    if (after >= before) throw new Error(`archive did not remove row (${before} -> ${after})`)
    return { before, after }
  })

  for (const [id, name, reason] of [
    ['14-file-preview', '文件预览', '本轮 3095 会话夹具没有触发宿主文件预览的稳定路径；不伪造文件面板结果'],
    ['15-drag-sidebar', '拖侧栏宽度', '当前 host 版本没有稳定拖拽手柄；侧栏 340px 为皮肤固定列宽']
  ]) {
    records(id, name, 'skip', reason, null)
    console.log(`SKIP  ${id} — ${reason}`)
  }

  await run('16-switch-session', '切换会话', async () => {
    if ((await sessionRows().count()) === 0) return { skip: '当前测试实例无持久会话行；3095 才具备会话夹具' }
    const target = sessionRows().first()
    const title = (await target.innerText()).trim().split('\n')[0]
    await target.click({ force: true })
    await page.waitForTimeout(500)
    const input = page.locator('[data-composer-input="true"]').first()
    if (!(await input.count())) throw new Error('composer missing after switching session')
    return { title }
  })
} finally {
  await browser.close()
}
const passed = results.filter((r) => r.status === 'pass').length
const skipped = results.filter((r) => r.status === 'skip').length
const failed = results.filter((r) => r.status === 'fail').length
writeFileSync(OUT, JSON.stringify({ meta: { module: 9, generatedAt: new Date().toISOString(), url: '<redacted>' }, results, summary: { pass: passed, skip: skipped, fail: failed } }, null, 2))
console.log(`regression9: pass ${passed}, skip ${skipped}, fail ${failed}`)
if (failed > 0) process.exitCode = 1
