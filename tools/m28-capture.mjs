#!/usr/bin/env node
/**
 * tools/m28-capture.mjs — P0-16 empty-Chat evidence and assertions.
 *
 * Opens an isolated DSH instance (its own DSH_HOME, the m28 fixture model with
 * four reasoning levels), selects Chat, and records:
 *
 *   • docs/m28.json            every measured number, both themes, both windows
 *   • docs/m27b.json           the reference↔implementation table
 *   • docs/screenshots/m28-*   full page light/dark, the reference-sized window,
 *                              the switch in four states, focus, placeholder
 *   • docs/capture/m28/*       the same frames without the acceptance names
 *
 *   node tools/m28-capture.mjs --url "http://127.0.0.1:3105/?token=…" [--out docs]
 *        [--web docs/m28-web.json]
 *
 * `--web` is the read-only measurement of the live ChatGPT page produced by
 * tools/m28-ref-probe.mjs; its 「网页实测」 column is copied verbatim. The desktop
 * column is the 2x capture (2467×1700 → 1233.5×850) measured pixel by pixel; the
 * constants below cite the device-pixel numbers they come from.
 */
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
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
  console.error('usage: node tools/m28-capture.mjs --url <tokenised-url> [--out docs] [--web docs/m28-web.json]')
  process.exit(2)
}
const OUT = resolve(ROOT, typeof args.get('out') === 'string' ? args.get('out') : 'docs')
const SHOTS = join(OUT, 'screenshots')
const CAPTURE = join(OUT, 'capture/m28')
mkdirSync(SHOTS, { recursive: true })
mkdirSync(CAPTURE, { recursive: true })

const webPath = resolve(ROOT, typeof args.get('web') === 'string' ? args.get('web') : 'docs/m28-web.json')
let web = null
try {
  web = JSON.parse(readFileSync(webPath, 'utf8'))
} catch (error) {
  console.error(`m28: cannot read ${webPath}: ${String(error).slice(0, 160)}`)
  process.exit(2)
}

const playwrightPath = process.env.M28_PLAYWRIGHT ?? 'playwright'
const CHROME = process.env.CHATGPT_UI_CHROME ?? process.env.HOME + '/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome'
const { chromium } = await import(playwrightPath)

const redact = (value) => value.replace(/([?&]token=)[^&]+/, '$1***')
const round = (value) => Math.round(value * 100) / 100

/** Desktop capture constants: device pixels from the 2467×1700 @2x reference. */
const DESKTOP = {
  window: { w: 1233.5, h: 850 },
  device: { w: 2467, h: 1700 },
  composer: { x0: 964, x1: 3970, y0: 796, y1: 898, w: 1504, h: 102, radius: 51 }, // pill: h/2
  titleInk: { x0: 710, x1: 1420, y0: 677, y1: 723 },
  titleGap: 73, // 796 − 723 device = 36.5 CSS
  plusInk: { x0: 32, y0: 30, w: 30, h: 31 },
  effortInk: { x0: 1687, x1: 1749, y0: 830, y1: 862, text: '极高' },
  placeholderInk: { x0: 580, x1: 783 },
  switch: { x0: 1012, x1: 1452, y0: 14, y1: 80, pillX0: 1015, pillX1: 1245 },
  fill: { page: '#0e0e0e', card: '#212121', border: '#3a3a3a', track: '#1b1b1b', pill: '#212121', selected: '#ffffff', unselected: '#cdcdcd', effort: '#afafaf', plus: '#ededed', accent: '#2c67c5' }
}

const toCss = (device) => round(device / 2)

const browser = await chromium.launch({ headless: true, executablePath: CHROME, args: ['--no-sandbox', '--disable-dev-shm-usage'] })

/** Focus the composer without typing; the placeholder hides while focused. */
const focusComposer = async (page) => {
  const input = page.locator('[data-composer-input="true"]').first()
  await input.click()
  await page.waitForTimeout(250)
}

const measure = (page) =>
  page.evaluate(() => {
    const rect = (el) => {
      if (el === null || el === undefined) return null
      const box = el.getBoundingClientRect()
      return { x: Math.round(box.x * 100) / 100, y: Math.round(box.y * 100) / 100, w: Math.round(box.width * 100) / 100, h: Math.round(box.height * 100) / 100, right: Math.round(box.right * 100) / 100, bottom: Math.round(box.bottom * 100) / 100 }
    }
    const q = (selector) => document.querySelector(selector)
    const style = (el, pseudo) => (el === null || el === undefined ? null : getComputedStyle(el, pseudo))
    const hero = q("[class*='_composerHero']")
    // Empty page: the card sits inside the hero. Started session: no hero wrapper,
    // so fall back to the card itself (only the sent-column check uses that state).
    const card = q("[class*='_composerHero'] [data-composer-card='true']") ?? q("[data-composer-card='true']")
    const stack = q("[class*='_composerHero'] [class*='_stack']")
    const placeholder = q("[data-composer-placeholder='true']")
    const pill = q("[data-cgpt-pill-compact='true']")
    const plus = q('.chatgpt-chat-files')
    const send = q("[class*='_composerHero'] button[class*='_primary']")
    const track = q('.chatgpt-mode-group')
    const segments = [...document.querySelectorAll('.chatgpt-mode-seg')]
    const selected = q(".chatgpt-mode-seg[aria-pressed='true']")
    const sendPath = send === null ? null : send.querySelector('path')
    const titlePseudo = style(stack, '::before')
    const cardStyle = style(card)
    const placeholderPseudo = style(placeholder, '::after')
    return {
      theme: document.body.hasAttribute('data-ds-dark-theme') ? 'dark' : 'light',
      lang: document.documentElement.lang,
      viewport: { w: innerWidth, h: innerHeight, dpr: devicePixelRatio },
      ratio: card === null ? null : Math.round((card.getBoundingClientRect().width / innerWidth) * 10000) / 10000,
      hero: rect(hero),
      card: rect(card),
      cardStyle: cardStyle === null ? null : { radius: cardStyle.borderRadius, background: cardStyle.backgroundColor, border: `${cardStyle.borderTopWidth} ${cardStyle.borderTopColor}`, shadow: cardStyle.boxShadow, maxWidth: cardStyle.maxWidth, height: cardStyle.height },
      cardMaxWidth: cardStyle === null ? null : cardStyle.maxWidth,
      scrollHeight: card === null ? null : card.scrollHeight,
      title: rect(stack),
      titleInk: titlePseudo === null ? null : {
        content: titlePseudo.content,
        fontSize: titlePseudo.fontSize,
        fontWeight: titlePseudo.fontWeight,
        lineHeight: titlePseudo.lineHeight,
        padding: titlePseudo.padding,
        color: titlePseudo.color
      },
      placeholder: rect(placeholder),
      placeholderInk: placeholderPseudo === null ? null : { content: placeholderPseudo.content, fontSize: placeholderPseudo.fontSize, color: placeholderPseudo.color, lineHeight: placeholderPseudo.lineHeight },
      input: rect(q("[data-composer-input='true']")),
      inputPadding: style(q("[data-composer-input='true']"))?.padding ?? null,
      plus: rect(plus),
      plusColor: style(plus)?.color ?? null,
      pill: rect(pill),
      pillStyle: style(pill) === null ? null : { text: pill.textContent, fontSize: style(pill).fontSize, fontWeight: style(pill).fontWeight, color: style(pill).color, padding: style(pill).padding, gap: style(pill).gap, radius: style(pill).borderRadius, background: style(pill).backgroundColor },
      send: rect(send),
      sendStyle: style(send) === null ? null : { background: style(send).backgroundColor, color: style(send).color, path: sendPath === null ? null : style(sendPath).fill, radius: style(send).borderRadius },
      switch: rect(track),
      switchTrack: style(track, '::before') === null ? null : { background: style(track, '::before').backgroundColor, radius: style(track, '::before').borderRadius, inset: style(track, '::before').inset },
      segments: segments.map((node) => ({
        text: node.textContent,
        pressed: node.getAttribute('aria-pressed'),
        box: rect(node),
        color: style(node).color,
        fontFamily: style(node).fontFamily,
        fontSize: style(node).fontSize,
        fontWeight: style(node).fontWeight,
        thumb: style(node, '::before') === null ? null : { w: style(node, '::before').width, h: style(node, '::before').height, background: style(node, '::before').backgroundColor, radius: style(node, '::before').borderRadius, border: `${style(node, '::before').borderTopWidth} ${style(node, '::before').borderTopColor}`, shadow: style(node, '::before').boxShadow }
      })),
      selectedThumb: selected === null ? null : { w: style(selected, '::before').width, h: style(selected, '::before').height },
      heroText: hero === null ? '' : hero.innerText,
      hasHintRow: q('.chatgpt-hero-hint') !== null || q('[data-chatgpt-hero-hint]') !== null,
      presetChip: (() => {
        const seat = q("[data-slot='conversation.hero.agentPreset'] > *")
        if (seat === null) return null
        return { box: rect(seat), display: style(seat).display }
      })(),
      standardSlot: rect(q("[data-slot='conversation.hero.agentPreset']")),
      // A started conversation's card, used for the "sent column unchanged" check.
      sentCard: q("[data-composer-card='true']") === null ? null : rect(q("[data-composer-card='true']")),
      cardMaxVariable: style(card)?.getPropertyValue('--dsh-composer-card-max-width').trim() ?? null
    }
  })

const openPage = async ({ width, height, colorScheme }) => {
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, locale: 'zh-CN', colorScheme })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(String(error).slice(0, 200)))
  await page.goto(url, { waitUntil: 'networkidle' })
  await page.waitForTimeout(900)
  const notice = page.getByRole('button', { name: '继续' })
  if ((await notice.count()) > 0) {
    await notice.first().click()
    await page.waitForTimeout(600)
  }
  const seg = page.locator('.chatgpt-mode-seg[data-segment="chat"]').first()
  if ((await seg.count()) > 0 && (await seg.getAttribute('aria-pressed')) !== 'true') {
    await seg.click()
    await page.waitForTimeout(900)
  }
  return { context, page, errors }
}

const states = []
const assertions = []
let errors = []
const assert = (name, ok, actual, expected) => {
  assertions.push({ name, ok: ok === true, actual, expected })
}

// 1. Light 1440×900 — the acceptance frame.
{
  const { context, page, errors: pageErrors } = await openPage({ width: 1440, height: 900, colorScheme: 'light' })
  const state = await measure(page)
  states.push({ id: 'light-1440', ...state })

  await page.screenshot({ path: join(SHOTS, 'm28-empty-chat-light.png'), fullPage: false })
  copyFileSync(join(SHOTS, 'm28-empty-chat-light.png'), join(CAPTURE, 'empty-chat-light-1440.png'))

  // Placeholder state: unfocused, the hint copy visible.
  await page.screenshot({ path: join(SHOTS, 'm28-placeholder-chat-light.png'), clip: { x: 0, y: Math.max(0, state.card.y - 120), width: 1440, height: 240 } })
  // Focus state: the card's focus ring with the caret in the editor.
  await focusComposer(page)
  await page.waitForTimeout(220)
  await page.screenshot({ path: join(SHOTS, 'm28-focus-chat-light.png'), clip: { x: 0, y: Math.max(0, state.card.y - 120), width: 1440, height: 240 } })
  await page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur())
  await page.waitForTimeout(200)

  // Mode switch: selected/unselected in this theme.
  const group = page.locator('.chatgpt-mode-group')
  await group.screenshot({ path: join(SHOTS, 'm28-switch-light-chat.png') })
  errors = [...errors, ...pageErrors]
  await context.close()
}

// 2. Dark 1440×900.
{
  const { context, page, errors: pageErrors } = await openPage({ width: 1440, height: 900, colorScheme: 'dark' })
  const state = await measure(page)
  states.push({ id: 'dark-1440', ...state })
  await page.screenshot({ path: join(SHOTS, 'm28-empty-chat-dark.png') })
  copyFileSync(join(SHOTS, 'm28-empty-chat-dark.png'), join(CAPTURE, 'empty-chat-dark-1440.png'))
  await page.locator('.chatgpt-mode-group').screenshot({ path: join(SHOTS, 'm28-switch-dark-chat.png') })
  errors = [...errors, ...pageErrors]
  await context.close()
}

// 3. Reference window 1233×850 — the width/height comparison frame.
{
  const { context, page } = await openPage({ width: 1233, height: 850, colorScheme: 'light' })
  const state = await measure(page)
  states.push({ id: 'light-1233', ...state })
  await page.screenshot({ path: join(SHOTS, 'm28-empty-chat-1233.png') })
  copyFileSync(join(SHOTS, 'm28-empty-chat-1233.png'), join(CAPTURE, 'empty-chat-light-1233.png'))
  await context.close()
}

// 4. The other two switch states (Work selected, both themes) + the sent column.
{
  const { context, page } = await openPage({ width: 1440, height: 900, colorScheme: 'light' })
  const work = page.locator('.chatgpt-mode-seg[data-segment="agent"]').first()
  if ((await work.count()) > 0 && (await work.getAttribute('aria-pressed')) !== 'true') {
    await work.click()
    await page.waitForTimeout(1100)
  }
  await page.locator('.chatgpt-mode-group').screenshot({ path: join(SHOTS, 'm28-switch-light-work.png') })
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.waitForTimeout(900)
  const workDark = await measure(page)
  await page.locator('.chatgpt-mode-group').screenshot({ path: join(SHOTS, 'm28-switch-dark-work.png') })
  const chat = page.locator('.chatgpt-mode-seg[data-segment="chat"]').first()
  await chat.click()
  await page.waitForTimeout(1200)
  const chatDark = await measure(page)
  states.push({ id: 'dark-work-selected', switchOnly: true, segments: workDark.segments })
  states.push({ id: 'dark-chat-selected', switchOnly: true, segments: chatDark.segments })
  await context.close()
}

// 5. A started Chat conversation: the composer keeps the Host column.
{
  const { context, page } = await openPage({ width: 1440, height: 900, colorScheme: 'light' })
  const input = page.locator('[data-composer-input="true"]').first()
  await input.click()
  await page.keyboard.type('你好')
  await page.waitForTimeout(200)
  await page.keyboard.press('Enter')
  await page.waitForTimeout(2500)
  const sent = await measure(page)
  states.push({ id: 'light-sent', ...sent })
  await page.screenshot({ path: join(CAPTURE, 'chat-sent-1440.png') })
  await context.close()
}

await browser.close()

// ---- assertions ---------------------------------------------------------
const byId = (id) => states.find((state) => state.id === id)
const light1440 = byId('light-1440')
const dark1440 = byId('dark-1440')
const light1233 = byId('light-1233')
const sent = byId('light-sent')

assert('空态输入框宽度/视口 ∈ [0.60, 0.62]（1440）', light1440.ratio >= 0.6 && light1440.ratio <= 0.62, light1440.ratio, '0.60–0.62')
assert('空态输入框宽度/视口 ∈ [0.60, 0.62]（1233，参考窗口）', light1233.ratio >= 0.6 && light1233.ratio <= 0.62, light1233.ratio, '0.60–0.62')
assert('1233 窗口下宽度 = 752px（参考 752）', Math.abs(light1233.card.w - 752) <= 1, light1233.card.w, '752 ±1')
assert('输入框高度 52（参考 51）', Math.abs(light1440.card.h - 52) <= 1, light1440.card.h, '52 ±1')
assert('输入框圆角 26 = 高度/2', light1440.cardStyle.radius === '26px', light1440.cardStyle.radius, '26px')
assert('标题 24px/400，行高 28.8', light1440.titleInk.fontSize === '24px' && light1440.titleInk.fontWeight === '400' && light1440.titleInk.lineHeight === '28.8px', `${light1440.titleInk.fontSize}/${light1440.titleInk.fontWeight}/${light1440.titleInk.lineHeight}`, '24px/400/28.8px')
assert('标题墨迹到输入框上沿 ≈36.5（参考 36.5）', Math.abs((light1440.card.y - (light1440.title.y + 2.4 + 24)) - 36.5) <= 2, round(light1440.card.y - (light1440.title.y + 2.4 + 24)), '36.5 ±2')
assert('模式切换 224×36，两段各 112×36', light1440.switch.w === 224 && light1440.switch.h === 36 && light1440.segments.every((segment) => segment.box.w === 112 && segment.box.h === 36), `${light1440.switch.w}×${light1440.switch.h}`, '224×36 / 112×36')
assert('选中胶囊 112×36（不再溢出邻段）', light1440.selectedThumb.w === '112px' && light1440.selectedThumb.h === '36px', `${light1440.selectedThumb.w}×${light1440.selectedThumb.h}`, '112×36')
assert('模式文案为中文「聊天/工作」', light1440.segments.map((segment) => segment.text).join('/') === '聊天/工作', light1440.segments.map((segment) => segment.text).join('/'), '聊天/工作')
assert('模式字体 14px/500 常规无衬线', light1440.segments.every((segment) => segment.fontSize === '14px' && segment.fontWeight === '500' && !/mono/i.test(segment.fontFamily)), light1440.segments[0].fontFamily.slice(0, 48), '14/500 sans')
assert('选中文字在深色为白色、未选中为灰色', dark1440.segments[0].color === 'rgb(255, 255, 255)' && dark1440.segments[1].color === 'rgb(205, 205, 205)', `${dark1440.segments[0].color} / ${dark1440.segments[1].color}`, '#fff / #cdcdcd')
assert('发送键箭头白色（明/暗）', light1440.sendStyle.path === 'rgb(255, 255, 255)' && dark1440.sendStyle.path === 'rgb(255, 255, 255)' && dark1440.sendStyle.color === 'rgb(255, 255, 255)', `${light1440.sendStyle.path} / ${dark1440.sendStyle.path}`, 'rgb(255, 255, 255)')
assert('空态无「标准模式」chip', !light1440.heroText.includes('标准模式') && (light1440.presetChip === null || light1440.presetChip.display === 'none'), light1440.presetChip, 'null/隐藏')
assert('空态无「聊天模式：」说明行', !light1440.heroText.includes('聊天模式') && light1440.hasHintRow === false, light1440.hasHintRow, 'false')
assert('单行结构：卡片无第二行（scrollHeight ≤ 53）', light1440.scrollHeight <= 53, light1440.scrollHeight, '≤53')
assert('左侧 + 为 36×36，文字起点 52', Math.abs(light1440.plus.w - 36) <= 1 && Math.abs(light1440.plus.x - light1440.card.x - 9) <= 2, `${light1440.plus.w} @ ${round(light1440.plus.x - light1440.card.x)}`, '36 @ 9')
assert('右侧「极高 ⌄」16px、32 字宽、36 高', light1440.pillStyle.fontSize === '16px' && Math.abs(light1440.pill.w - 82) <= 4 && Math.abs(light1440.pill.h - 36) <= 1, `${light1440.pill.w}×${light1440.pill.h} @ ${light1440.pillStyle.fontSize}`, '82×36 @16')
assert('「极高」颜色 #8f8f8f（明）/ #afafaf（暗）', light1440.pillStyle.color === 'rgb(143, 143, 143)' && dark1440.pillStyle.color === 'rgb(175, 175, 175)', `${light1440.pillStyle.color} / ${dark1440.pillStyle.color}`, '#8f8f8f / #afafaf')
assert('占位文案 16px，色 #8f8f8f/#afafaf', light1440.placeholderInk.fontSize === '16px' && light1440.placeholderInk.color === 'rgb(143, 143, 143)' && dark1440.placeholderInk.color === 'rgb(175, 175, 175)', `${light1440.placeholderInk.fontSize} ${light1440.placeholderInk.color}`, '16px #8f8f8f')
assert(
  '已发送会话的输入框列宽不变（704，未读到 61vw）',
  sent !== null && sent.sentCard !== null && Math.abs(sent.sentCard.w - 704) <= 1 && sent.cardMaxWidth === '704px' && Math.abs(sent.sentCard.w - light1440.card.w) > 100,
  sent === null || sent.sentCard === null ? null : `${sent.sentCard.w} (max-width ${sent.cardMaxWidth})，空态 ${light1440.card.w}`,
  '704，与空态不同'
)
assert('空态宽度只由 --cgpt-empty-composer-w（61vw）驱动', /61vw/.test(light1440.cardMaxVariable ?? ''), light1440.cardMaxVariable, '61vw')
assert('已发送会话仍用 Host 的列宽变量', sent !== null && !/61vw/.test(sent.cardMaxVariable ?? ''), sent?.cardMaxVariable, '非 61vw')

// ---- docs/m28.json ------------------------------------------------------
const report = {
  tool: 'm28-capture',
  generatedAt: new Date().toISOString(),
  url: redact(url),
  fixture: 'm28-llm（m28-fixture / GPT-5.1，四档推理：低/中/高/极高，默认极高）',
  viewport: '1440×900 与 1233×850，DPR 2，locale zh-CN',
  assertions,
  states,
  errors
}
writeFileSync(join(OUT, 'm28.json'), JSON.stringify(report, null, 2) + '\n')

// ---- docs/m27b.json -----------------------------------------------------
/** One table row; `error` is |implementation − reference| in px or ratio. */
const row = (element, webValue, desktopValue, implValue, error) => ({ 元素: element, 网页实测: webValue, 桌面比例换算: desktopValue, 实现值: implValue, 误差: error })
const webComposer = web.composer?.capsule?.box
const table = {
  tool: 'm28-capture',
  generatedAt: new Date().toISOString(),
  sources: {
    web: { file: 'docs/m28-web.json', measuredAt: web.measuredAt, url: web.url, viewport: web.viewport, dpr: web.dpr, note: 'CDP 只读测量，未导航/未输入' },
    desktop: { file: 'docs/reference/m28-chat-empty-desktop-dark.webp', device: DESKTOP.device, logical: DESKTOP.window, note: '2x 截图逐像素测量，除以 2 得 CSS px' },
    implementation: { file: 'docs/screenshots/m28-empty-chat-1233.png', viewport: '1233×850', dpr: 2 }
  },
  rows: [
    row(
      '空态输入框宽度（占视口）',
      `${webComposer?.w ?? '—'}px / ${web.viewport?.width ?? '—'} = ${webComposer === undefined ? '—' : round(webComposer.w / web.viewport.width)}（网页上限 768，窄窗才等价）`,
      `${toCss(DESKTOP.composer.w)} / ${DESKTOP.window.w} = ${round(DESKTOP.composer.w / 2 / DESKTOP.window.w)}`,
      `${light1233.card.w} / 1233 = ${light1233.ratio}`,
      `${round(Math.abs(light1233.card.w - toCss(DESKTOP.composer.w)))}px`
    ),
    row('空态输入框高度', `${webComposer?.h ?? '—'}px`, `${toCss(DESKTOP.composer.h)}px（101–103 设备px）`, `${light1233.card.h}px`, `${round(Math.abs(light1233.card.h - toCss(DESKTOP.composer.h)))}px`),
    row('圆角（胶囊）', `${web.composer?.capsule?.radius ?? '—'}`, `${toCss(DESKTOP.composer.h) / 2}px（高/2）`, light1233.cardStyle.radius, '0px'),
    row('标题字号/字重', `${web.title?.fontSize ?? '—'}/${web.title?.fontWeight ?? '—'}`, '24px/400（墨迹 355×47 设备px）', `${light1233.titleInk.fontSize}/${light1233.titleInk.fontWeight}`, '0px'),
    row('标题行高', `${web.title?.lineHeight ?? '—'}`, '28.8px（1.2×24）', light1233.titleInk.lineHeight, '0px'),
    row('标题墨迹→输入框上沿', '—（网页带动画/滚动，未作为基准）', `${toCss(DESKTOP.titleGap)}px`, `${round(light1233.card.y - (light1233.title.y + 2.4 + 24))}px`, `${round(Math.abs(light1233.card.y - (light1233.title.y + 2.4 + 24) - toCss(DESKTOP.titleGap)))}px`),
    row('模式切换轨道', `${web.modeSwitch?.track?.box?.w ?? '—'}×${web.modeSwitch?.track?.box?.h ?? '—'}`, `${toCss(DESKTOP.switch.x1 - DESKTOP.switch.x0)}×${toCss(DESKTOP.switch.y1 - DESKTOP.switch.y0)}（≈3% 差异，属桌面构建缩放）`, `${light1233.switch.w}×${light1233.switch.h}`, `${round(Math.abs(light1233.switch.w - (web.modeSwitch?.track?.box?.w ?? light1233.switch.w)))}px（对网页）`),
    row('模式切换单项', `${web.modeSwitch?.segments?.[0]?.box?.w ?? '—'}×${web.modeSwitch?.segments?.[0]?.box?.h ?? '—'}`, `${toCss(DESKTOP.switch.pillX1 - DESKTOP.switch.pillX0)}×${toCss(DESKTOP.switch.y1 - DESKTOP.switch.y0)}`, `${light1233.segments[0].box.w}×${light1233.segments[0].box.h}`, '0px（对网页）'),
    row('模式字号/字重', `${web.modeSwitch?.segments?.[0]?.fontSize ?? '—'}/${web.modeSwitch?.segments?.[0]?.fontWeight ?? '—'}`, '14/500（中文两字，无法从墨迹反推）', `${light1233.segments[0].fontSize}/${light1233.segments[0].fontWeight}`, '0px'),
    row('选中胶囊底色', `网页用 Tailwind 变量（${web.modeSwitch?.segments?.[0]?.background ?? '—'}），按桌面取样`, `${DESKTOP.fill.pill}（轨道 ${DESKTOP.fill.track}）`, `${light1233.segments[0].thumb.background}（明）/ ${dark1440.segments[0].thumb.background}（暗）`, '0（暗）/ 明色为参考浅色方案'),
    row('选中文字色 / 未选中', `明：#0d0d0d / #5d5d5d（实测 ${web.modeSwitch?.segments?.[0]?.color ?? '—'}）`, `暗：${DESKTOP.fill.selected} / ${DESKTOP.fill.unselected}`, `明：${light1233.segments[0].color} / ${light1233.segments[1].color}；暗：${dark1440.segments[0].color} / ${dark1440.segments[1].color}`, '0px'),
    row('「极高」字号/颜色', `${web.composer?.effort?.fontSize ?? '—'} / ${web.composer?.effort?.color ?? '—'}`, `墨迹 ${DESKTOP.effortInk.x1 - DESKTOP.effortInk.x0} 设备px / 2 字 = ${round((DESKTOP.effortInk.x1 - DESKTOP.effortInk.x0) / 4)}px 每字 → 16px，取样 ${DESKTOP.fill.effort}`, `${light1233.pillStyle.fontSize} / ${light1233.pillStyle.color}（明）· ${dark1440.pillStyle.color}（暗）`, '0px'),
    row('「极高」触发器尺寸', `${web.composer?.effort?.box?.w ?? '—'}×${web.composer?.effort?.box?.h ?? '—'}，padding ${web.composer?.effort?.padding ?? '—'}`, '—（桌面被麦克风挤开，仅同高 36）', `${light1233.pill.w}×${light1233.pill.h}，padding ${light1233.pillStyle.padding}`, `${round(Math.abs(light1233.pill.w - (web.composer?.effort?.box?.w ?? light1233.pill.w)))}px（对网页）`),
    row('左侧 + 按钮', `${web.composer?.plus?.box?.w ?? '—'}×${web.composer?.plus?.box?.h ?? '—'}，aria「${web.composer?.plus?.aria ?? '—'}」`, `${toCss(DESKTOP.plusInk.w)}×${toCss(DESKTOP.plusInk.h)} 墨迹（20px 图标）`, `${light1233.plus.w}×${light1233.plus.h}`, `${round(Math.abs(light1233.plus.w - (web.composer?.plus?.box?.w ?? 0)))}px`),
    row('占位文案', `${web.composer?.placeholder?.text ?? '—'} ${web.composer?.placeholder?.fontSize ?? '—'} ${web.composer?.placeholder?.color ?? '—'}`, '字形墨迹 580–783 设备px（起点 ≈49）', `随便问点什么 ${light1233.placeholderInk.fontSize} ${light1233.placeholderInk.color}`, '品牌词按产品改名，字号/颜色 0px'),
    row('发送键', `参考该位置为语音圆钮 ${web.composer?.trailing?.box?.w ?? '—'}（${web.composer?.trailing?.background ?? '—'}）`, `${toCss(68)}px 蓝盘 ${DESKTOP.fill.accent}`, `${light1233.send.w}×${light1233.send.h} ${light1233.sendStyle.background}`, '沿用既有 32px 发送键；仅箭头改白')
  ],
  notes: [
    '网页在 1600 宽下把空态输入框限制在 768px（48%），因此 61% 只能由桌面 2x 截图反推；1233.5 宽窗口下两者一致（752px）。',
    '桌面截图为 2x（2467×1700 → 1233.5×850），所有设备px 除以 2 换算；误差列以 1233×850 实现帧对比。',
    '深色取样：底色 #0e0e0e、卡片 #212121、轨道 #1b1b1b、选中胶囊 #212121、箭头/选中文字 #ffffff、未选中 #cdcdcd、极高 ≈#afafaf、+ ≈#ededed。'
  ]
}
writeFileSync(join(OUT, 'm27b.json'), JSON.stringify(table, null, 2) + '\n')

const failed = assertions.filter((assertion) => assertion.ok !== true)
console.log(`${failed.length === 0 ? 'PASS' : 'FAIL'}  ${assertions.length - failed.length}/${assertions.length} P0-16 assertions`)
for (const assertion of assertions) console.log(`${assertion.ok === true ? 'ok  ' : 'FAIL'} ${assertion.name} — ${JSON.stringify(assertion.actual)} (want ${assertion.expected})`)
process.exit(failed.length === 0 ? 0 : 1)
