#!/usr/bin/env node
/**
 * scripts/m12-ref-capture.mjs — read-only reference capture for P0-2.
 *
 * Attaches to the user's already-open ChatGPT tab over CDP (default :9224) and
 * records the composer + model/effort panel geometry, colours and behaviour in
 * both themes. It never creates a conversation, sends a message, or changes a
 * setting. The only DOM mutation is a local `data-theme` override so the dark
 * palette can be photographed without touching the account preference; it is
 * restored before the script exits.
 *
 *   node scripts/m12-ref-capture.mjs [--cdp http://127.0.0.1:9224] [--out docs/capture/live]
 *
 * Writes model-panel.json plus m12-ref-*.png under docs/capture/live/.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const args = new Map()
for (let i = 2; i < process.argv.length; i += 1) {
  const token = process.argv[i]
  if (!token.startsWith('--')) continue
  const next = process.argv[i + 1]
  if (next === undefined || next.startsWith('--')) args.set(token.slice(2), true)
  else {
    args.set(token.slice(2), next)
    i += 1
  }
}
const CDP = typeof args.get('cdp') === 'string' ? args.get('cdp') : 'http://127.0.0.1:9224'
const OUT = resolve(ROOT, typeof args.get('out') === 'string' ? args.get('out') : 'docs/capture/live')
mkdirSync(OUT, { recursive: true })

let playwright
for (const candidate of ['playwright', 'playwright', 'playwright-core']) {
  try {
    playwright = await import(candidate)
    break
  } catch {}
}
if (playwright === undefined) {
  console.error('m12-ref-capture: playwright is required')
  process.exit(2)
}

const browser = await playwright.chromium.connectOverCDP(CDP)
const context = browser.contexts()[0]
const page = context.pages().find((candidate) => /^https:\/\/chatgpt\.com(\/|$)/.test(candidate.url()))
if (page === undefined) {
  console.error('m12-ref-capture: no chatgpt.com page in the CDP browser')
  process.exit(2)
}
await page.bringToFront()
await page.waitForTimeout(600)

const ROUND = (value) => Math.round(value * 10) / 10
const measured = { source: 'chatgpt.com', capturedAt: new Date().toISOString(), viewport: null, themes: {} }

/** Screenshot through raw CDP so a background tab cannot stall Playwright. */
async function shot(name, clip) {
  const session = await context.newCDPSession(page)
  const result = await session.send('Page.captureScreenshot', {
    format: 'png',
    fromSurface: true,
    captureBeyondViewport: false,
    ...(clip === undefined ? {} : { clip: { ...clip, scale: 1 } })
  }).catch(() => null)
  await session.detach().catch(() => {})
  if (result?.data !== undefined) writeFileSync(join(OUT, name), Buffer.from(result.data, 'base64'))
  return result !== null
}

async function setTheme(theme) {
  await page.emulateMedia({ colorScheme: theme })
  await page.evaluate((value) => {
    const root = document.documentElement
    if (root.dataset.m12OriginalTheme === undefined) root.dataset.m12OriginalTheme = root.dataset.theme ?? ''
    root.dataset.theme = value
  }, theme)
  await page.waitForTimeout(450)
}

async function closeMenu() {
  await page.keyboard.press('Escape')
  await page.waitForTimeout(250)
}

async function openTrigger() {
  const trigger = page.getByRole('button', { name: /选择 ChatGPT 模型/ }).first()
  if ((await trigger.count()) === 0) return false
  await trigger.click()
  await page.waitForTimeout(1400)
  return true
}

const measureComposer = () => page.evaluate(() => {
  const visible = (el) => {
    if (el === null || el === undefined) return false
    const style = getComputedStyle(el)
    const box = el.getBoundingClientRect()
    return style.display !== 'none' && style.visibility !== 'hidden' && box.width > 1 && box.height > 1
  }
  const round = (value) => Math.round(value * 10) / 10
  const rect = (el) => {
    if (el === null || el === undefined) return null
    const box = el.getBoundingClientRect()
    return { x: round(box.x), y: round(box.y), w: round(box.width), h: round(box.height), b: round(box.bottom), r: round(box.right), cx: round(box.x + box.width / 2), cy: round(box.y + box.height / 2) }
  }
  const style = (el, keys) => el === null || el === undefined ? null : Object.fromEntries(keys.map((key) => [key, getComputedStyle(el).getPropertyValue(key)]))
  const findButton = (label) => [...document.querySelectorAll('button')].find((button) => button.getAttribute('aria-label') === label && visible(button))
  const card = document.querySelector('[class*="ComposerLayoutBody"]')
  const editor = document.querySelector('.ProseMirror')
  const paragraph = editor?.querySelector('p')
  const plus = findButton('添加文件等内容')
  const model = [...document.querySelectorAll('button')].find((button) => /选择 ChatGPT 模型/.test(button.getAttribute('aria-label') ?? '') && visible(button))
  const mic = findButton('听写')
  const voice = findButton('开始语音')
  const line = paragraph === null || paragraph === undefined ? null : Number.parseFloat(getComputedStyle(paragraph).lineHeight)
  const font = paragraph === null || paragraph === undefined ? null : Number.parseFloat(getComputedStyle(paragraph).fontSize)
  const paragraphRect = paragraph === null || paragraph === undefined ? null : paragraph.getBoundingClientRect()
  return {
    card: { rect: rect(card), style: style(card, ['background-color', 'border-radius', 'padding', 'box-shadow']) },
    editor: { rect: rect(editor), style: style(editor, ['font-size', 'line-height', 'min-height', 'padding']) },
    line: {
      paragraph: rect(paragraph),
      glyphTop: paragraphRect === null ? null : round(paragraphRect.top + (line - font) / 2),
      glyphBaseline: paragraphRect === null ? null : round(paragraphRect.top + (line - font) / 2 + font * 0.8)
    },
    topGap: {
      cardToEditor: card === null || editor === null ? null : round(editor.getBoundingClientRect().top - card.getBoundingClientRect().top),
      cardToGlyphTop: card === null || paragraphRect === null ? null : round(paragraphRect.top + (line - font) / 2 - card.getBoundingClientRect().top),
      cardToBaseline: card === null || paragraphRect === null ? null : round(paragraphRect.top + (line - font) / 2 + font * 0.8 - card.getBoundingClientRect().top)
    },
    row: {
      plus: rect(plus),
      model: rect(model),
      mic: rect(mic),
      voice: rect(voice),
      plusLabel: style(plus, ['font-size', 'color', 'border-radius']),
      modelLabel: style(model, ['font-size', 'font-weight', 'color', 'border-radius']),
      modelCenterDelta: plus === null || model === null ? null : round(Math.abs((plus.getBoundingClientRect().y + plus.getBoundingClientRect().height / 2) - (model.getBoundingClientRect().y + model.getBoundingClientRect().height / 2)))
    }
  }
})

const measurePanel = () => page.evaluate(() => {
  const round = (value) => Math.round(value * 10) / 10
  const rect = (el) => {
    if (el === null || el === undefined) return null
    const box = el.getBoundingClientRect()
    return { x: round(box.x), y: round(box.y), w: round(box.width), h: round(box.height), b: round(box.bottom), r: round(box.right) }
  }
  const style = (el, keys) => el === null || el === undefined ? null : Object.fromEntries(keys.map((key) => [key, getComputedStyle(el).getPropertyValue(key)]))
  const menu = document.querySelector('[role="menu"]')
  if (menu === null) return null
  const group = menu.querySelector('[data-model-picker-view]')
  const view = group?.getAttribute('data-model-picker-view') ?? null
  const active = menu.querySelector('[data-active="true"] [class*="ViewPanel"]') ?? menu.querySelector('[class*="ViewPanel"]')
  const menuStyle = style(menu, ['background-color', 'border-radius', 'padding', 'box-shadow', 'overflow-y', 'max-height', 'height'])
  // The reference's hashed class names change between builds; find the
  // slider parts by their measured geometry instead. `[class*="Track-"]`
  // matched the 280×84 view track, not the 256×24 effort track.
  const descendants = [...menu.querySelectorAll('*')]
  const boxed = (width, height) => descendants.find((el) => {
    const box = el.getBoundingClientRect()
    return Math.round(box.width) === width && Math.round(box.height) === height
  })
  const visiblePaint = (el) => {
    const computed = getComputedStyle(el)
    return computed.opacity !== '0' && computed.backgroundColor !== 'rgba(0, 0, 0, 0)'
  }
  const track = descendants.find((el) => {
    const box = el.getBoundingClientRect()
    return Math.round(box.width) === 256 && Math.round(box.height) === 24 && visiblePaint(el)
  }) ?? boxed(256, 24)
  const range = menu.querySelector('input[type="range"]') ?? boxed(256, 24)
  const thumb = descendants.find((el) => {
    const box = el.getBoundingClientRect()
    return Math.round(box.width) === 28 && Math.round(box.height) === 28 && getComputedStyle(el).borderRadius === '50%'
  }) ?? boxed(28, 28)
  const tick = descendants.find((el) => {
    const box = el.getBoundingClientRect()
    return Math.round(box.width) === 4 && Math.round(box.height) === 4
  })
  const fill = descendants.find((el) => getComputedStyle(el).backgroundColor === 'rgb(58, 131, 247)' && visiblePaint(el))
  const section = menu.querySelector('[data-menu-section-label]')
  const rows = [...menu.querySelectorAll('[role="menuitemradio"]')].map((row) => {
    const name = row.querySelector('[data-menu-row-content] > span, [data-menu-row-content] > div > span')
    return {
      text: (row.innerText ?? '').replace(/\s+/g, ' ').trim(),
      checked: row.getAttribute('aria-checked') === 'true',
      rect: rect(row),
      padding: getComputedStyle(row).padding,
      radius: getComputedStyle(row).borderRadius,
      font: getComputedStyle(row).fontSize,
      weight: getComputedStyle(row).fontWeight,
      nameRect: rect(name),
      nameFont: name === null ? null : getComputedStyle(name).fontSize
    }
  })
  const toggle = menu.querySelector('[data-model-picker-view-toggle]')
  return {
    menu: { rect: rect(menu), style: menuStyle },
    activePanel: rect(active),
    view,
    section: section === null ? null : { text: (section.innerText ?? '').trim(), rect: rect(section), font: getComputedStyle(section).fontSize, color: getComputedStyle(section).color },
    toggle: toggle === null ? null : { text: (toggle.innerText ?? '').replace(/\s+/g, ' ').trim(), rect: rect(toggle), font: getComputedStyle(toggle).fontSize },
    rows,
    slider: track === null ? null : {
      track: { rect: rect(track), style: style(track, ['width', 'height', 'border-radius', 'background-color']) },
      range: { rect: rect(range), style: style(range, ['background-color', 'border-radius']) },
      thumb: { rect: rect(thumb), style: style(thumb, ['width', 'height', 'border-radius', 'background-color', 'box-shadow']) },
      tick: { rect: rect(tick), style: style(tick, ['width', 'height', 'border-radius', 'background-color']) },
      fill: { rect: rect(fill), style: style(fill, ['background-color', 'width', 'height', 'border-radius']) }
    }
  }
})

const originalTheme = await page.evaluate(() => document.documentElement.dataset.theme ?? null)
for (const theme of ['light', 'dark']) {
  await closeMenu()
  await setTheme(theme)
  const themeState = await page.evaluate(() => ({ theme: document.documentElement.dataset.theme, colorScheme: getComputedStyle(document.body).colorScheme }))
  measured.viewport = await page.evaluate(() => ({ w: innerWidth, h: innerHeight, dpr: devicePixelRatio }))
  measured.themes[theme] = { themeState, composer: await measureComposer() }

  const composer = measured.themes[theme].composer
  if (composer.card !== null) {
    const clip = { x: composer.card.rect.x - 12, y: composer.card.rect.y - 12, width: composer.card.rect.w + 24, height: composer.card.rect.h + 32 }
    await shot(`m12-ref-composer-${theme}.png`, clip)
  }

  if (!(await openTrigger())) {
    measured.themes[theme].panel = null
    continue
  }
  measured.themes[theme].panel = { simple: await measurePanel() }
  const simple = measured.themes[theme].panel.simple
  if (simple !== null) {
    const clip = { x: simple.menu.rect.x - 10, y: simple.menu.rect.y - 10, width: simple.menu.rect.w + 20, height: Math.max(simple.menu.rect.h, 100) + 20 }
    await shot(`m12-ref-panel-simple-${theme}.png`, clip)
  }

  const toggle = page.locator('[data-model-picker-view-toggle]').first()
  if (await toggle.count()) {
    await toggle.click()
    await page.waitForTimeout(1500)
    measured.themes[theme].panel.advanced = await measurePanel()
    const advanced = measured.themes[theme].panel.advanced
    if (advanced !== null) {
      const clip = { x: advanced.menu.rect.x - 10, y: advanced.menu.rect.y - 10, width: advanced.menu.rect.w + 20, height: (advanced.activePanel?.h ?? advanced.menu.rect.h) + 20 }
      await shot(`m12-ref-panel-advanced-${theme}.png`, clip)
    }
    const second = page.locator('[role="menuitemradio"]').nth(1)
    if (await second.count()) {
      await second.hover()
      await page.waitForTimeout(250)
      measured.themes[theme].panel.hoverBackground = await second.evaluate((el) => getComputedStyle(el).backgroundColor)
      await page.mouse.move(10, 10)
    }
  }
  await closeMenu()
}

// Behaviour: Esc and outside click close; the trigger toggles. No model is
// selected here (that would write the account preference).
await closeMenu()
const trigger = page.getByRole('button', { name: /选择 ChatGPT 模型/ }).first()
await trigger.click()
await page.waitForTimeout(900)
const opened = await page.evaluate(() => document.querySelectorAll('[role="menu"]').length)
await page.keyboard.press('Escape')
await page.waitForTimeout(300)
const afterEscape = await page.evaluate(() => document.querySelectorAll('[role="menu"]').length)
await trigger.click()
await page.waitForTimeout(700)
await page.mouse.click(Math.round(measured.viewport.w / 2), Math.round(measured.viewport.h - 40))
await page.waitForTimeout(400)
const afterOutside = await page.evaluate(() => document.querySelectorAll('[role="menu"]').length)

measured.behaviour = {
  escapeCloses: opened === 1 && afterEscape === 0,
  outsideClickCloses: afterOutside === 0,
  selectModelCloses: false,
  selectModelNote: '实测：点选非当前模型行后面板不关闭，而是切回强度视图；模型随后已恢复为“默认”。'
}

// Restore the page to the theme and closed state it had before the capture.
await page.evaluate((value) => {
  const root = document.documentElement
  if (value === null) delete root.dataset.theme
  else root.dataset.theme = value
  delete root.dataset.m12OriginalTheme
}, originalTheme)
await page.emulateMedia({ colorScheme: originalTheme === 'dark' ? 'dark' : 'light' })
await closeMenu()

writeFileSync(join(OUT, 'model-panel.json'), `${JSON.stringify(measured, null, 2)}\n`)
console.log(`m12-ref-capture: wrote ${join(OUT, 'model-panel.json')}`)
await browser.close()
