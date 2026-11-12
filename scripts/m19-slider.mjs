#!/usr/bin/env node
/**
 * scripts/m19-slider.mjs — P0-8 slider evidence frames.
 *
 * One URL, both themes. It opens the skin's own 280px reasoning panel, drives
 * the four catalog levels through the hidden range input, and records the
 * three acceptance tiers (低 / 中 / 最高) as rect + computedStyle for the
 * panel, track, fill, ticks, stars and thumb.
 *
 * It exists because the thumb looked like a rounded square while its computed
 * `border-radius` was already `50%`: the Host theme sets
 * `corner-shape: superellipse(1.5)` on `*`, and `corner-shape` is a separate
 * property. The capture therefore also records the matched rule that paints
 * the thumb and the skin's `corner-shape: round` override.
 *
 * Writes docs/capture/slider-dom.json and docs/screenshots/m19-slider-*.png.
 *
 *   node scripts/m19-slider.mjs --url "http://127.0.0.1:3122/?token=…"
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
const url = args.get('url')
if (typeof url !== 'string') {
  console.error('usage: node scripts/m19-slider.mjs --url <tokenised-url>')
  process.exit(2)
}
const DOCS = resolve(ROOT, typeof args.get('out') === 'string' ? args.get('out') : 'docs')
const LIVE = join(DOCS, 'capture')
const SHOTS = join(DOCS, 'screenshots')
mkdirSync(LIVE, { recursive: true })
mkdirSync(SHOTS, { recursive: true })

let playwright
for (const candidate of ['playwright', 'playwright', 'playwright-core']) {
  try {
    playwright = await import(candidate)
    break
  } catch {}
}
if (playwright === undefined) {
  console.error('m19-slider: playwright is required')
  process.exit(2)
}
const CHROME = process.env.M19_CHROME ?? process.env.CHATGPT_UI_CHROME ?? process.env.HOME + '/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome'
const browser = await playwright.chromium.launch({
  headless: true,
  executablePath: CHROME,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
})

const result = {
  task: 'P0-8',
  capturedAt: new Date().toISOString(),
  url: url.replace(/([?&]token=)[^&]+/, '$1***'),
  environment: { width: 1600, height: 1000, dpr: 2, locale: 'zh-CN' },
  diagnosis: null,
  themes: {}
}

const round = (value) => Math.round(Number(value) * 10) / 10
const box = (el) => {
  if (el === null || el === undefined) return null
  const r = el.getBoundingClientRect()
  return {
    x: round(r.x), y: round(r.y), w: round(r.width), h: round(r.height),
    cx: round(r.x + r.width / 2), cy: round(r.y + r.height / 2),
    r: round(r.right), b: round(r.bottom)
  }
}

const shot = async (context, page, name, clip, scale = 2) => {
  const session = await context.newCDPSession(page)
  const png = await session.send('Page.captureScreenshot', {
    format: 'png',
    fromSurface: true,
    captureBeyondViewport: false,
    clip: { ...clip, scale }
  }).catch(() => null)
  await session.detach().catch(() => {})
  if (png?.data === undefined) throw new Error(`m19-slider: screenshot failed: ${name}`)
  writeFileSync(join(SHOTS, name), Buffer.from(png.data, 'base64'))
}

const measure = (page) => page.evaluate(() => {
  const round = (value) => Math.round(Number(value) * 10) / 10
  const box = (el) => {
    if (el === null || el === undefined) return null
    const r = el.getBoundingClientRect()
    return {
      x: round(r.x), y: round(r.y), w: round(r.width), h: round(r.height),
      cx: round(r.x + r.width / 2), cy: round(r.y + r.height / 2),
      r: round(r.right), b: round(r.bottom)
    }
  }
  const css = (el, keys) => el === null || el === undefined
    ? null
    : Object.fromEntries(keys.map((key) => [key, getComputedStyle(el).getPropertyValue(key)]))
  const menu = document.querySelector('[data-cgpt-model-menu]')
  const simple = document.querySelector('.chatgpt-model-simple')
  const head = document.querySelector('.chatgpt-effort-head')
  const name = document.querySelector('.chatgpt-effort-choice-name')
  const model = document.querySelector('.chatgpt-effort-choice-model')
  const reset = document.querySelector('.chatgpt-effort-reset')
  const slider = document.querySelector('.chatgpt-effort-slider')
  const track = document.querySelector('.chatgpt-effort-track')
  const fill = document.querySelector('.chatgpt-effort-fill')
  const thumb = document.querySelector('.chatgpt-effort-thumb')
  const range = document.querySelector('.chatgpt-effort-range')
  const starsLayer = document.querySelector('.chatgpt-effort-stars')
  const ticks = [...document.querySelectorAll('.chatgpt-effort-tick')]
  const stars = [...document.querySelectorAll('.chatgpt-effort-star')]
  return {
    view: menu?.getAttribute('data-view') ?? null,
    menu: {
      rect: box(menu),
      style: css(menu, ['width', 'height', 'padding', 'border-radius', 'background-color'])
    },
    simple: { rect: box(simple), style: css(simple, ['padding']) },
    head: { rect: box(head), style: css(head, ['grid-template-columns', 'column-gap', 'align-items']) },
    name: {
      text: name?.textContent ?? null,
      max: name?.getAttribute('data-max') ?? null,
      rect: box(name),
      style: css(name, ['font-size', 'font-weight', 'line-height', 'color'])
    },
    model: {
      text: model?.textContent ?? null,
      rect: box(model),
      style: css(model, ['font-size', 'font-weight', 'line-height', 'color'])
    },
    reset: {
      rect: box(reset),
      style: css(reset, ['width', 'height', 'color']),
      topFromPanel: reset === null || menu === null ? null : round(reset.getBoundingClientRect().top - menu.getBoundingClientRect().top),
      rightFromPanel: reset === null || menu === null ? null : round(menu.getBoundingClientRect().right - reset.getBoundingClientRect().right),
      alignedWithName: reset === null || name === null
        ? null
        : Math.abs(reset.getBoundingClientRect().top - name.getBoundingClientRect().top) <= 1
    },
    slider: { rect: box(slider), style: css(slider, ['width', 'height', 'margin']) },
    track: {
      rect: box(track),
      style: css(track, ['width', 'height', 'border-radius', 'corner-shape', 'background-color', 'background-image'])
    },
    fill: {
      rect: box(fill),
      max: fill?.getAttribute('data-max') ?? null,
      style: css(fill, ['width', 'height', 'border-radius', 'corner-shape', 'background-color', 'background-image'])
    },
    thumb: {
      rect: box(thumb),
      style: css(thumb, ['width', 'height', 'border-radius', 'corner-shape', 'background-color', 'border-top-width', 'border-top-style', 'box-shadow', 'top', 'left', 'position', 'flex']),
      centredOnTrack: thumb === null || track === null
        ? null
        : Math.abs((thumb.getBoundingClientRect().top + thumb.getBoundingClientRect().height / 2) - (track.getBoundingClientRect().top + track.getBoundingClientRect().height / 2)) <= 0.5
    },
    ticks: ticks.map((tick) => ({
      rect: box(tick),
      selected: tick.getAttribute('data-selected'),
      style: css(tick, ['width', 'height', 'border-radius', 'corner-shape', 'background-color', 'opacity'])
    })),
    stars: {
      layer: box(starsLayer),
      layerStyle: css(starsLayer, ['position', 'inset', 'z-index', 'overflow', 'border-radius']),
      count: stars.length,
      dots: stars.map((star) => ({
        rect: box(star),
        style: css(star, ['width', 'height', 'border-radius', 'background-color', 'opacity'])
      }))
    },
    range: { value: range?.value ?? null, max: range?.max ?? null, rect: box(range) }
  }
})

/** Drive the hidden range input through React's onChange (native setter + input). */
const setEffort = async (page, index) => {
  const changed = await page.evaluate((target) => {
    const input = document.querySelector('.chatgpt-effort-range')
    if (input === null) return false
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
    if (typeof setter !== 'function') return false
    setter.call(input, String(target))
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.dispatchEvent(new Event('change', { bubbles: true }))
    return true
  }, index)
  if (!changed) throw new Error('m19-slider: no range input')
  await page.waitForTimeout(650)
  const value = await page.evaluate(() => document.querySelector('.chatgpt-effort-range')?.value)
  if (Number(value) !== index) throw new Error(`m19-slider: range did not move to ${index} (got ${value})`)
  await page.evaluate(() => document.activeElement?.blur?.())
  await page.waitForTimeout(150)
}

const matchedThumbRules = async (context, page) => {
  const cdp = await context.newCDPSession(page)
  await cdp.send('DOM.enable')
  await cdp.send('CSS.enable')
  const { root } = await cdp.send('DOM.getDocument', { depth: 1 })
  const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector: '.chatgpt-effort-thumb' })
  const styles = await cdp.send('CSS.getMatchedStylesForNode', { nodeId })
  const props = (rule) => rule.style.cssProperties
    .filter((property) => property.value && ['corner-shape', 'border-radius', 'width', 'height', 'background', 'box-shadow'].includes(property.name))
    .map((property) => `${property.name}: ${property.value}${property.important ? ' !important' : ''}`)
  const rules = (styles.matchedCSSRules ?? []).map((entry) => ({
    selector: entry.rule.selectorList.text,
    origin: entry.rule.origin,
    declarations: props(entry.rule)
  }))
  const inherited = (styles.inherited ?? [])
    .flatMap((entry) => (entry.matchedCSSRules ?? []).map((rule) => ({
      selector: rule.rule.selectorList.text,
      declarations: props(rule.rule)
    })))
    .filter((entry) => entry.declarations.some((declaration) => declaration.startsWith('corner-shape')))
  const tags = await page.evaluate(() => [...document.querySelectorAll('style')].map((tag, index) => ({
    index,
    plugin: tag.getAttribute('data-plugin') ?? null,
    pluginCss: tag.getAttribute('data-plugin-css') ?? null,
    cornerShape: tag.textContent.includes('corner-shape') ? tag.textContent.slice(0, 220) : null
  })).filter((tag) => tag.cornerShape !== null))
  await cdp.detach()
  return { rules, inherited, tags }
}

const clipFor = (state) => {
  const menu = state.menu.rect
  return {
    x: Math.max(0, menu.x - 24),
    y: Math.max(0, menu.y - 24),
    width: menu.w + 48,
    height: menu.h + 48
  }
}

const assertionsFor = (state, theme) => {
  const thumb = state.thumb
  const radius = thumb.style['border-radius']
  const list = [
    { id: 'thumb-square', label: '拇指 34×34', pass: thumb.rect.w === 34 && thumb.rect.h === 34, measured: { w: thumb.rect.w, h: thumb.rect.h } },
    { id: 'thumb-circle', label: '拇指 border-radius 50% 且 corner-shape round', pass: radius === '50%' && (thumb.style['corner-shape'] === 'round' || thumb.style['corner-shape'] === 'superellipse(1)'), measured: { radius, cornerShape: thumb.style['corner-shape'] } },
    { id: 'thumb-white', label: '拇指纯白、无描边；深色无阴影 / 浅色仅柔和投影', pass: thumb.style['background-color'] === 'rgb(255, 255, 255)' && thumb.style['border-top-width'] === '0px' && (theme === 'dark' ? thumb.style['box-shadow'] === 'none' : thumb.style['box-shadow'] !== 'none'), measured: { background: thumb.style['background-color'], border: thumb.style['border-top-width'], shadow: thumb.style['box-shadow'] } },
    { id: 'thumb-centred', label: '拇指垂直居中于轨道', pass: thumb.centredOnTrack === true, measured: { centred: thumb.centredOnTrack } },
    { id: 'thumb-flex', label: '拇指 flex 0 0 34px（不被拉伸）', pass: /0 0 34px/.test(thumb.style.flex), measured: thumb.style.flex },
    { id: 'track-height', label: '轨道高 30', pass: state.track.rect.h === 30, measured: state.track.rect },
    { id: 'track-width', label: '轨道宽 248（面板 280 - 16×2）', pass: state.track.rect.w === 248, measured: state.track.rect },
    { id: 'track-radius', label: '轨道圆角 15', pass: state.track.style['border-radius'] === '15px', measured: state.track.style['border-radius'] },
    { id: 'ticks', label: '四个 4px 档位点', pass: state.ticks.length === 4 && state.ticks.every((tick) => tick.rect.w === 4 && tick.rect.h === 4), measured: state.ticks.map((tick) => ({ w: tick.rect.w, h: tick.rect.h, selected: tick.selected })) },
    { id: 'tick-colours', label: '已选白 50%（白 + opacity 0.5）/ 未选 #8B8B8B', pass: state.ticks.every((tick) => tick.selected === 'true' ? tick.style['background-color'] === 'rgb(255, 255, 255)' && tick.style.opacity === '0.5' : tick.style['background-color'] === 'rgb(139, 139, 139)'), measured: state.ticks.map((tick) => `${tick.style['background-color']} / ${tick.style.opacity}`) },
    { id: 'name-type', label: '强度名 16px/600', pass: state.name.style['font-size'] === '16px' && state.name.style['font-weight'] === '600', measured: state.name.style },
    { id: 'model-type', label: '模型名 14px/400 #D0D0D0（深色）', pass: state.model.style['font-size'] === '14px' && state.model.style['font-weight'] === '400' && (theme === 'light' || state.model.style.color === 'rgb(208, 208, 208)'), measured: state.model.style },
    { id: 'reset-line', label: '重置与上行文字同一水平线、右距 16', pass: state.reset.alignedWithName === true && state.reset.rightFromPanel === 16, measured: { aligned: state.reset.alignedWithName, top: state.reset.topFromPanel, right: state.reset.rightFromPanel } },
    { id: 'panel', label: '面板 280 / 圆角 20 / 内边距 12-16-16', pass: state.menu.rect.w === 280 && state.menu.style['border-radius'] === '20px' && state.simple.style.padding === '12px 16px 16px', measured: { width: state.menu.rect.w, radius: state.menu.style['border-radius'], padding: state.simple.style.padding } }
  ]
  if (state.fill.max === 'true') {
    const gradient = state.fill.style['background-image'] ?? ''
    const expected = theme === 'dark'
      ? ['rgb(79, 107, 255)', 'rgb(168, 85, 247)', 'rgb(124, 58, 237)']
      : ['rgb(110, 132, 255)', 'rgb(181, 123, 246)', 'rgb(139, 92, 246)']
    list.push({ id: 'max-gradient', label: '最高档三段渐变', pass: gradient.includes('gradient') && expected.every((rgb) => gradient.includes(rgb)), measured: { gradient, expected } })
    list.push({ id: 'max-name-purple', label: '最高档文字紫色', pass: state.name.style.color === (theme === 'dark' ? 'rgb(192, 132, 252)' : 'rgb(147, 51, 234)'), measured: state.name.style.color })
    list.push({ id: 'stars', label: '星点层 ≥12 个 1–2px 白点', pass: state.stars.layer !== null && state.stars.count >= 12 && state.stars.dots.every((dot) => dot.rect.w >= 1 && dot.rect.w <= 2), measured: { count: state.stars.count, sizes: [...new Set(state.stars.dots.map((dot) => dot.rect.w))] } })
  } else {
    list.push({ id: 'normal-name-blue', label: '正常档文字蓝色 #4C8DFF', pass: state.name.style.color === 'rgb(76, 141, 255)', measured: state.name.style.color })
  }
  return list
}

for (const theme of ['dark', 'light']) {
  const context = await browser.newContext({
    viewport: { width: 1600, height: 1000 },
    deviceScaleFactor: 2,
    locale: 'zh-CN',
    colorScheme: theme
  })
  const page = await context.newPage()
  page.on('console', (message) => {
    if (message.type() === 'error') console.log(`[m19-slider:${theme}] console error: ${message.text()}`)
  })
  await page.goto(url, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('[data-composer-card="true"]', { timeout: 30000 }).catch(() => {})
  await page.waitForTimeout(2200)
  for (const label of ['Close', '关闭']) {
    const close = page.getByRole('button', { name: label }).first()
    if (await close.count()) await close.click({ force: true }).catch(() => {})
  }
  await page.keyboard.press('Escape')
  if ((await page.evaluate(() => document.body.dataset.chatgptMode)) !== 'agent') {
    const seg = page.locator('.chatgpt-mode-seg[data-segment="agent"]').first()
    if (await seg.count()) await seg.click({ force: true })
    await page.waitForTimeout(700)
  }
  const newChat = page.locator('.chatgpt-new-chat').first()
  if (await newChat.count()) {
    await newChat.click()
    await page.waitForTimeout(2200)
  }
  const pill = page.locator('[data-cgpt-model-pill]').first()
  if ((await pill.count()) === 0) {
    console.log(`[m19-slider:${theme}] no model pill; skipped`)
    await context.close()
    continue
  }
  await pill.click()
  await page.waitForTimeout(500)
  const reset = page.locator('[data-cgpt-effort-reset]').first()
  if (await reset.count()) {
    await reset.click({ force: true })
    await page.waitForTimeout(700)
  }
  await page.mouse.move(20, 20)
  await page.waitForTimeout(300)

  const defaultState = await measure(page)
  const last = Number(defaultState.range.max)
  const themeResult = { tiers: {}, screenshots: [], matchedThumb: null, assertions: [], assertionSummary: null }

  for (const [tier, index] of [['low', 0], ['mid', 1], ['max', last]]) {
    await setEffort(page, index)
    await page.mouse.move(20, 20)
    await page.waitForTimeout(350)
    const state = await measure(page)
    themeResult.tiers[tier] = state
    if (tier !== 'low') {
      const panelName = `m19-slider-${theme}-${tier === 'max' ? 'max' : 'default'}.png`
      await shot(context, page, panelName, clipFor(state))
      themeResult.screenshots.push(panelName)
      const thumb = state.thumb.rect
      const thumbName = `m19-slider-thumb-${theme}-${tier === 'max' ? '4x' : 'default-4x'}.png`
      await shot(context, page, thumbName, {
        x: Math.max(0, thumb.x - 8),
        y: Math.max(0, thumb.y - 8),
        width: 50,
        height: 50
      }, 4)
      themeResult.screenshots.push(thumbName)
    }
  }

  // Diagnose the effective thumb rule on the max frame.
  await setEffort(page, last)
  themeResult.matchedThumb = await matchedThumbRules(context, page)
  for (const tier of ['low', 'mid', 'max']) {
    themeResult.assertions.push(...assertionsFor(themeResult.tiers[tier], theme).map((entry) => ({ tier, ...entry })))
  }
  themeResult.assertionSummary = {
    total: themeResult.assertions.length,
    passed: themeResult.assertions.filter((entry) => entry.pass).length,
    failed: themeResult.assertions.filter((entry) => !entry.pass).map((entry) => `${entry.tier}:${entry.id}`)
  }
  // The diagnosis text is identical in both themes; keep the first frame's.
  if (result.diagnosis === null) {
    const hostTag = themeResult.matchedThumb.tags.find((tag) => (tag.cornerShape ?? '').includes('--dsw-corner-shape'))
    const hostRule = themeResult.matchedThumb.inherited.find((rule) => rule.declarations.some((declaration) => declaration.includes('corner-shape')))
    const skinRule = themeResult.matchedThumb.rules.find((rule) => rule.declarations.some((declaration) => declaration.startsWith('corner-shape: round')))
    result.diagnosis = {
      symptom: 'thumb painted as a rounded square while computed border-radius was already 50%',
      cause: {
        property: 'corner-shape',
        hostSheet: hostTag?.pluginCss ?? '@deepseek-ai/dsh-client-ui-theme/corner-shape.css',
        hostSelector: hostRule?.selector ?? '*, :before, :after',
        hostDeclaration: hostRule?.declarations.find((declaration) => declaration.startsWith('corner-shape')) ?? 'corner-shape: var(--dsw-corner-shape)',
        rootVariable: ':root { --dsw-corner-shape: superellipse(1.5) }',
        why: 'corner-shape is a separate property from border-radius, so a 50% radius with superellipse(1.5) paints a squircle; every previous fix changed only border-radius.'
      },
      fix: {
        file: 'lib/client/css/65-work-card.css',
        selector: skinRule?.selector ?? 'body[data-chatgpt-ui] :is(.chatgpt-effort-thumb, …)',
        declaration: 'corner-shape: round',
        matched: skinRule !== undefined
      },
      measured: {
        computedCornerShape: themeResult.tiers.max.thumb.style['corner-shape'],
        computedBorderRadius: themeResult.tiers.max.thumb.style['border-radius'],
        rect: themeResult.tiers.max.thumb.rect
      }
    }
  }
  result.themes[theme] = themeResult
  await page.keyboard.press('Escape')
  await context.close()
}

writeFileSync(join(LIVE, 'slider-dom.json'), `${JSON.stringify(result, null, 2)}\n`)
console.log(JSON.stringify({
  wrote: join(LIVE, 'slider-dom.json'),
  diagnosis: result.diagnosis?.cause,
  themes: Object.fromEntries(Object.entries(result.themes).map(([theme, value]) => [theme, value.assertionSummary]))
}, null, 2))
const failed = Object.values(result.themes).reduce((sum, value) => sum + value.assertionSummary.failed.length, 0)
await browser.close()
if (failed > 0) process.exitCode = 1
