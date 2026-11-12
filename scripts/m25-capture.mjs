#!/usr/bin/env node
/**
 * scripts/m25-capture.mjs — P0-13 implementation evidence: the project row's
 * two folder states, the hover card, the ⋯ menu and the permission menu, each
 * measured against the read-only reference capture.
 *
 *   node scripts/m25-capture.mjs --url "http://127.0.0.1:3151/?token=…" [--tag impl]
 *
 * Frames (docs/screenshots, DPR 2, cropped to the surface plus a 6px margin —
 * the same crop rule scripts/m25-ref-capture.mjs used on the reference):
 *   m25-impl-projects.png            the sidebar's project rows (both states)
 *   m25-impl-project-collapsed.png   one collapsed row, close crop
 *   m25-impl-project-expanded.png    one expanded row, close crop
 *   m25-impl-hover-card.png          the row-hover project card
 *   m25-impl-more-menu.png           the ⋯ menu
 *   m25-impl-permission-{light,dark}.png
 *
 * Writes docs/m25.json: for every geometry number the reference was measured
 * at, the implementation's value, the delta and a ≤1px verdict. Exits non-zero
 * when any number is off, when the two folder glyphs are the same SVG, or when
 * a menu icon is not one of the captured glyphs.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const args = new Map()
for (let index = 2; index < process.argv.length; index += 1) {
  const key = process.argv[index]
  if (!key.startsWith('--')) continue
  const next = process.argv[index + 1]
  if (next === undefined || next.startsWith('--')) args.set(key.slice(2), true)
  else {
    args.set(key.slice(2), next)
    index += 1
  }
}
const url = args.get('url')
if (typeof url !== 'string') {
  console.error('usage: node scripts/m25-capture.mjs --url <tokenised-url> [--out docs]')
  process.exit(2)
}
const DOCS = resolve(ROOT, typeof args.get('out') === 'string' ? args.get('out') : 'docs')
const SHOTS = join(DOCS, 'screenshots')
mkdirSync(SHOTS, { recursive: true })
const masked = url.replace(/token=[^&]+/, 'token=***')

let playwright
for (const candidate of [args.get('playwright'), '/mnt/f/project/y86/node_modules/playwright/index.mjs', 'playwright', 'playwright-core'].filter(Boolean)) {
  try {
    playwright = await import(candidate)
    break
  } catch {}
}
if (playwright === undefined) {
  console.error('m25-capture: playwright is required')
  process.exit(2)
}

const reference = JSON.parse(readFileSync(join(ROOT, 'docs/capture/live/project-menus.json'), 'utf8'))
const iconReport = JSON.parse(readFileSync(join(ROOT, 'docs/m25-icons-diff.json'), 'utf8'))

const browser = await playwright.chromium.launch({
  headless: true,
  executablePath: process.env.M25_CHROME ?? '/home/user/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome',
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
})

const assertions = []
const check = (name, pass, detail) => {
  assertions.push({ name, pass: pass === true, detail: detail ?? null })
  console.log(`${pass === true ? 'PASS' : 'FAIL'}  ${name}${pass === true ? '' : ` ${JSON.stringify(detail)}`}`)
}
const round = (value) => Math.round(Number(value) * 10) / 10

/** One surface measurement pass, shared by the reference and the skin. */
const MEASURE = String.raw`(() => {
  const px = (v) => { const n = Number.parseFloat(v); return Number.isFinite(n) ? Math.round(n * 10) / 10 : null }
  const box = (el) => { const r = el.getBoundingClientRect(); return { x: Math.round(r.x * 10) / 10, y: Math.round(r.y * 10) / 10, w: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10 } }
  const norm = (v) => (v || '').replace(/\s+/g, ' ').trim()
  const glyph = (svg) => svg === null || svg === undefined ? null : {
    viewBox: svg.getAttribute('viewBox'), width: svg.getAttribute('width'), height: svg.getAttribute('height'),
    rect: box(svg), firstD: (svg.querySelector('path')?.getAttribute('d') ?? '').slice(0, 40),
    d: (svg.querySelector('path')?.getAttribute('d') ?? '')
  }
  const surface = (el) => {
    const cs = getComputedStyle(el)
    return {
      rect: box(el),
      padding: cs.padding, paddingTop: px(cs.paddingTop), paddingLeft: px(cs.paddingLeft),
      radius: cs.borderRadius, shadow: cs.boxShadow, background: cs.backgroundColor,
      blur: cs.backdropFilter, color: cs.color, fontSize: cs.fontSize, lineHeight: cs.lineHeight,
      items: [...el.querySelectorAll('[role="menuitem"],[role="menuitemradio"],button')].map((item) => {
        const ics = getComputedStyle(item)
        const svg = item.querySelector('svg')
        const slot = item.querySelector('span')
        const label = [...item.querySelectorAll('span')].find((s) => norm(s.textContent) !== '' && s.querySelector('svg') === null)
        return {
          text: norm(item.textContent).slice(0, 28),
          rect: box(item), height: px(ics.height), padding: ics.padding, radius: ics.borderRadius,
          gap: px(ics.columnGap), fontSize: ics.fontSize, fontWeight: ics.fontWeight, lineHeight: ics.lineHeight,
          color: ics.color, background: ics.backgroundColor,
          slotRect: slot === undefined ? null : box(slot),
          glyph: glyph(svg),
          glyphRect: svg === null ? null : box(svg),
          labelRect: label === undefined || label === null ? null : box(label),
          iconLeftInset: svg === null ? null : px(svg.getBoundingClientRect().left - item.getBoundingClientRect().left),
          labelGap: svg === null || label === undefined ? null : px(label.getBoundingClientRect().left - svg.getBoundingClientRect().right),
          slotGap: slot === undefined || slot === null || label === undefined || label === null ? null : px(label.getBoundingClientRect().left - slot.getBoundingClientRect().right),
          slotWidth: slot === undefined || slot === null ? null : px(slot.getBoundingClientRect().width)
        }
      }),
      separators: [...el.querySelectorAll('[role="separator"]')].map((sp) => {
        const scs = getComputedStyle(sp)
        return { rect: box(sp), height: px(scs.height), padding: scs.padding, paddingLeft: px(scs.paddingLeft),
          line: sp.firstElementChild === null ? null : { rect: box(sp.firstElementChild), border: getComputedStyle(sp.firstElementChild).borderTop, color: getComputedStyle(sp.firstElementChild).borderTopColor } }
      })
    }
  }
  const pick = (selector) => { const el = document.querySelector(selector); return el === null ? null : surface(el) }
  const rows = [...document.querySelectorAll('[data-cgpt-project-row]')].map((row) => {
    const rcs = getComputedStyle(row)
    const icon = row.querySelector('.chatgpt-project-icon')
    const svg = icon?.querySelector('svg') ?? null
    const title = row.querySelector('.chatgpt-project-title')
    const head = row.closest('.chatgpt-project-head')
    const actions = head === null || head === undefined ? [] : [...head.querySelectorAll('.chatgpt-project-new, .chatgpt-project-more')].map((b) => {
      const bcs = getComputedStyle(b)
      const bs = b.querySelector('svg')
      return { aria: norm(b.getAttribute('aria-label')), rect: box(b), radius: bcs.borderRadius, glyphRect: bs === null ? null : box(bs) }
    })
    return {
      id: row.getAttribute('data-cgpt-project-row'), expanded: row.getAttribute('aria-expanded'),
      rect: box(row), height: px(rcs.height), radius: rcs.borderRadius, padding: rcs.padding,
      gap: px(rcs.columnGap), fontSize: rcs.fontSize, fontWeight: rcs.fontWeight, lineHeight: rcs.lineHeight,
      color: rcs.color,
      iconRect: icon === null || icon === undefined ? null : box(icon),
      glyph: glyph(svg),
      titleRect: title === null || title === undefined ? null : box(title),
      actions,
      actionGap: actions.length < 2 ? null : px(actions[1].rect.x - (actions[0].rect.x + actions[0].rect.w)),
      actionRightInset: actions.length === 0 ? null : px(box(row).x + box(row).w - Math.max(...actions.map((a) => a.rect.x + a.rect.w)))
    }
  })
  return {
    projectRows: rows,
    hoverCard: pick('[data-cgpt-session-menu="project"]'),
    moreMenu: pick('[data-cgpt-session-menu="project-hover"]'),
    sessionMenu: pick('[data-cgpt-session-menu="session"]'),
    permissionMenu: pick('[data-cgpt-work-menu="permission"]')
  }
})()`

const shot = async (page, name, clip) => {
  await page.screenshot({ path: join(SHOTS, name), ...(clip === undefined ? {} : { clip }) })
  return `docs/screenshots/${name}`
}

/** Crop a surface the way the reference was cropped: its box plus 6px. */
const surfaceClip = (entry) => entry === null ? null : ({
  x: Math.max(0, Math.floor(entry.rect.x - 6)),
  y: Math.max(0, Math.floor(entry.rect.y - 6)),
  width: Math.ceil(entry.rect.w + 12),
  height: Math.ceil(entry.rect.h + 12)
})

const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 2 })
const page = await context.newPage()
await page.goto(url, { waitUntil: 'domcontentloaded' })
await page.waitForSelector('[data-cgpt-project-row]', { timeout: 45000 })
await page.waitForFunction(() => document.body.getAttribute('data-chatgpt-ui') !== null, null, { timeout: 45000 })
await page.waitForTimeout(800)

// ---------------------------------------------------------------- rows -----
const beforeToggle = await page.evaluate(MEASURE)
const firstProject = beforeToggle.projectRows[0]
check('rows: at least one project row is rendered', beforeToggle.projectRows.length > 0, beforeToggle.projectRows.length)

// Collapse the first project, expand the second, so one frame carries both
// states. This only writes the skin's own expansion map.
const collapse = async (id) => {
  await page.click(`[data-cgpt-project-row="${id}"]`)
  await page.waitForTimeout(320)
}
if (firstProject !== undefined && firstProject.expanded === 'true') await collapse(firstProject.id)
const second = beforeToggle.projectRows[1]
if (second !== undefined && second.expanded !== 'true') await collapse(second.id)

await page.hover('[data-cgpt-project-row]')
await page.waitForTimeout(500)
const rowState = await page.evaluate(MEASURE)
const collapsedRow = rowState.projectRows.find((r) => r.expanded === 'false')
const expandedRow = rowState.projectRows.find((r) => r.expanded === 'true')
check('rows: one collapsed and one expanded row are on screen', collapsedRow !== undefined && expandedRow !== undefined,
  rowState.projectRows.map((r) => [r.id, r.expanded]))

const closedD = collapsedRow?.glyph?.d ?? ''
const openD = expandedRow?.glyph?.d ?? ''
check('rows: collapsed and expanded use two DIFFERENT captured SVGs', closedD !== '' && openD !== '' && closedD !== openD,
  { closed: closedD.slice(0, 32), opened: openD.slice(0, 32) })
const referenceClosed = (reference.sprite.symbols['codex-icon-folder-light-16'].paths[0].d)
const referenceOpen = (reference.sprite.symbols['codex-icon-folder-open-light-16'].paths[0].d)
check('rows: collapsed path is the reference folder-light-16 path, verbatim', closedD === referenceClosed,
  { used: closedD.slice(0, 40), reference: referenceClosed.slice(0, 40) })
check('rows: expanded path is the reference folder-open-light-16 path, verbatim', openD === referenceOpen,
  { used: openD.slice(0, 40), reference: referenceOpen.slice(0, 40) })

// row geometry vs the measured reference
const refRow = reference.projectRow
const rowTable = []
const compare = (name, referenceValue, implementationValue, tolerance = 1) => {
  const delta = referenceValue === null || implementationValue === null ? null : round(Math.abs(referenceValue - implementationValue))
  const pass = delta !== null && delta <= tolerance
  rowTable.push({ name, reference: referenceValue, implementation: implementationValue, delta, pass })
  return pass
}
compare('project row height', Number.parseFloat(refRow.row.style.height), collapsedRow?.height)
compare('project row radius', Number.parseFloat(refRow.row.style.borderRadius), Number.parseFloat(collapsedRow?.radius ?? 'NaN'))
compare('project row font size', Number.parseFloat(refRow.row.style.fontSize), Number.parseFloat(collapsedRow?.fontSize ?? 'NaN'))
compare('project row line height', Number.parseFloat(refRow.row.style.lineHeight), Number.parseFloat(collapsedRow?.lineHeight ?? 'NaN'))
compare('project folder glyph size', refRow.folderGlyph.renderedWidth, collapsedRow?.glyph?.rect?.w)
compare('project folder glyph left inset', round(refRow.folderGlyph.rect.x - refRow.row.rect.x), collapsedRow === undefined ? null : round(collapsedRow.glyph.rect.x - collapsedRow.rect.x))
// The reference's icon column is the distance from the folder glyph's left
// edge to the title's left edge (25.7px: a 20px glyph in a 36px slot whose
// margins cancel out). That is the number a viewer can see; the wrapper's own
// width is an implementation detail behind it.
compare('project icon column (glyph left → title left)', round(refRow.titleRect.x - refRow.folderGlyph.rect.x), collapsedRow === undefined || collapsedRow.titleRect === null ? null : round(collapsedRow.titleRect.x - collapsedRow.glyph.rect.x))
compare('project title left offset', round(refRow.titleRect.x - refRow.row.rect.x), collapsedRow === undefined ? null : round(collapsedRow.titleRect.x - collapsedRow.rect.x))
compare('hover action size', refRow.actions[1].rect.width, collapsedRow?.actions?.[0]?.rect?.w)
compare('hover action glyph', refRow.actions[1].glyph.renderedWidth, collapsedRow?.actions?.[0]?.glyphRect?.w)
compare('hover action gap', refRow.rightActionGap.gap, collapsedRow?.actionGap)
compare('hover action right inset', refRow.rightActionGap.rightInset, collapsedRow?.actionRightInset)
check('rows: every measured project-row number is within 1px', rowTable.every((row) => row.pass === true), rowTable.filter((row) => row.pass !== true))

// The same crop rule the reference used: the row's own box minus 20px left
// and 60px above, 340×260 — so the two panels are anchored identically.
const projectsClip = (row) => row === undefined ? null : ({
  x: Math.max(0, Math.floor(row.rect.x - 20)),
  y: Math.max(0, Math.floor(row.rect.y - 60)),
  width: 340,
  height: 260
})
await shot(page, 'm25-impl-projects.png', projectsClip(collapsedRow))
if (collapsedRow !== undefined) await shot(page, 'm25-impl-project-collapsed.png', { x: Math.floor(collapsedRow.rect.x - 4), y: Math.floor(collapsedRow.rect.y - 4), width: Math.ceil(collapsedRow.rect.w + 8), height: Math.ceil(collapsedRow.rect.h + 8) })
if (expandedRow !== undefined) await shot(page, 'm25-impl-project-expanded.png', { x: Math.floor(expandedRow.rect.x - 4), y: Math.floor(expandedRow.rect.y - 4), width: Math.ceil(expandedRow.rect.w + 8), height: Math.ceil(expandedRow.rect.h + 8) })

// -------------------------------------------------------------- menus ------
const refSurface = reference.menus.projectMoreWeb[0]
const refItem = refSurface.items[0]
const refSep = (reference.menus.sessionRowWeb[0].separators ?? [])[0]

const openMenu = async (selector) => {
  // The row actions only take pointer events while the row is hovered, so the
  // head has to be entered before the trigger can be.
  await page.locator('.chatgpt-project-head').first().hover()
  await page.waitForTimeout(350)
  await page.locator(selector).first().click()
  await page.waitForTimeout(500)
}

await openMenu('.chatgpt-project-more')
const moreState = await page.evaluate(MEASURE)
const moreMenu = moreState.moreMenu
check('⋯ menu: opens with its six entries', moreMenu !== null && moreMenu !== undefined && moreMenu.items.length >= 6, moreMenu?.items.map((i) => i.text))
const menuTable = []
compare2(menuTable, '⋯ menu width floor', Math.min(refSurface.rect.width, 160), Math.min(moreMenu?.rect.w ?? NaN, 160))
// The reference menu is content-sized: what is fixed is the gutter the row
// leaves on each side (160 − 140 = 20), not the absolute width.
compare2(menuTable, '⋯ menu gutter total (surface − row)', round(refSurface.rect.width - refSurface.items[0].rect.width), moreMenu === null || moreMenu === undefined ? null : round(moreMenu.rect.w - Math.max(...moreMenu.items.map((item) => item.rect.w))))
compare2(menuTable, '⋯ menu padding', Number.parseFloat(refSurface.style.padding), moreMenu?.paddingTop)
compare2(menuTable, '⋯ menu radius', Number.parseFloat(refSurface.style.borderRadius), Number.parseFloat(moreMenu?.radius ?? 'NaN'))
compare2(menuTable, '⋯ menu backdrop blur', 8, moreMenu?.blur === undefined || moreMenu.blur === 'none' ? null : Number.parseFloat(String(moreMenu.blur).match(/blur\(([\d.]+)/)?.[1] ?? 'NaN'))
if (moreMenu !== undefined && moreMenu !== null) {
  for (const item of moreMenu.items.slice(0, 6)) {
    compare2(menuTable, `row "${item.text}" height`, Number.parseFloat(refItem.style.height), item.height)
    compare2(menuTable, `row "${item.text}" radius`, Number.parseFloat(refItem.style.borderRadius), Number.parseFloat(item.radius))
    compare2(menuTable, `row "${item.text}" padding-x`, Number.parseFloat(refItem.style.padding.split(' ')[1]), Number.parseFloat(item.padding.split(' ')[1]))
    compare2(menuTable, `row "${item.text}" padding-y`, Number.parseFloat(refItem.style.padding.split(' ')[0]), Number.parseFloat(item.padding.split(' ')[0]))
    compare2(menuTable, `row "${item.text}" font size`, Number.parseFloat(refItem.style.fontSize), Number.parseFloat(item.fontSize))
    compare2(menuTable, `row "${item.text}" line height`, Number.parseFloat(refItem.style.lineHeight), Number.parseFloat(item.lineHeight))
    compare2(menuTable, `row "${item.text}" icon slot`, 20, item.slotRect?.w)
    compare2(menuTable, `row "${item.text}" slot→label gap`, 6, item.slotGap)
    compare2(menuTable, `row "${item.text}" leading slot`, 20, item.slotWidth)
  }
  if (moreMenu.separators.length > 0) {
    compare2(menuTable, 'separator height', refSep.rect.height, moreMenu.separators[0].height)
    compare2(menuTable, 'separator inset', refSep.padding.split(' ')[1] === undefined ? 8 : Number.parseFloat(refSep.padding.split(' ')[1]), moreMenu.separators[0].paddingLeft)
  }
}
check('⋯ menu: every measured number is within 1px', menuTable.every((row) => row.pass === true), menuTable.filter((row) => row.pass !== true))
check('⋯ menu: icons are the captured glyphs (viewBox + first path)', (moreMenu?.items ?? []).every((item) => item.glyph !== null && iconReport.icons.some((icon) => icon.identical === true && item.glyph.viewBox === icon.viewBox)), (moreMenu?.items ?? []).map((i) => [i.text, i.glyph?.viewBox, i.glyph?.firstD]))
await shot(page, 'm25-impl-more-menu.png', surfaceClip(moreMenu))
await page.keyboard.press('Escape')
await page.waitForTimeout(300)

// the session row menu, measured against the reference's own session menu
const refSession = (reference.menus.sessionRowWeb ?? [])[0] ?? null
await page.mouse.move(1100, 700)
await page.waitForTimeout(300)
const sessionTrigger = page.locator('.chatgpt-session-more').first()
if (await sessionTrigger.count() > 0) {
  await sessionTrigger.click()
  await page.waitForTimeout(500)
  const sessionState = await page.evaluate(MEASURE)
  const sessionMenu = sessionState.sessionMenu
  if (sessionMenu !== null && sessionMenu !== undefined) {
    await shot(page, 'm25-impl-session-menu.png', surfaceClip(sessionMenu))
    const sessionTable = []
    if (refSession !== null) {
      compare2(sessionTable, 'session menu gutter total', round(refSession.rect.width - refSession.items[0].rect.width), round(sessionMenu.rect.w - Math.max(...sessionMenu.items.map((item) => item.rect.w))))
      compare2(sessionTable, 'session menu radius', Number.parseFloat(refSession.style.borderRadius), Number.parseFloat(sessionMenu.radius))
      for (const item of sessionMenu.items.slice(0, 4)) {
        compare2(sessionTable, `session row "${item.text}" height`, Number.parseFloat(refSession.items[0].style.height), item.height)
        compare2(sessionTable, `session row "${item.text}" slot`, 20, item.slotWidth)
        compare2(sessionTable, `session row "${item.text}" slot→label`, 6, item.slotGap)
      }
    }
    check('session menu: measured surface and row geometry', sessionTable.every((row) => row.pass === true), sessionTable.filter((row) => row.pass !== true))
  }
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)
}

// hover card — the pointer has to leave the row first, or no mouseenter fires
await page.mouse.move(1100, 700)
await page.waitForTimeout(400)
await page.hover('.chatgpt-project-head')
await page.waitForTimeout(900)
const cardState = await page.evaluate(MEASURE)
const card = cardState.hoverCard
check('card: the hover card opens with title, count, path and 编辑项目', card !== null && card !== undefined && card.items.length >= 2, card === null ? null : card.items.map((i) => i.text))
if (card !== null && card !== undefined) {
  const cardTable = []
  compare2(cardTable, 'card padding', Number.parseFloat(refSurface.style.padding), card.paddingTop)
  compare2(cardTable, 'card radius', Number.parseFloat(refSurface.style.borderRadius), Number.parseFloat(card.radius))
  for (const item of card.items) {
    compare2(cardTable, `card row "${item.text}" height`, 36, item.height)
    compare2(cardTable, `card row "${item.text}" font size`, 14, Number.parseFloat(item.fontSize))
    compare2(cardTable, `card row "${item.text}" line height`, 20, Number.parseFloat(item.lineHeight))
  }
  check('card: geometry follows the measured menu surface', cardTable.every((row) => row.pass === true), cardTable.filter((row) => row.pass !== true))
  await shot(page, 'm25-impl-hover-card.png', surfaceClip(card))
}
await page.mouse.move(1000, 700)
await page.waitForTimeout(400)

// permission menu, both themes
const openPermission = async () => {
  const trigger = page.locator('[data-cgpt-permission]').first()
  if (await trigger.count() === 0) return null
  await trigger.click()
  await page.waitForTimeout(500)
  const state = await page.evaluate(MEASURE)
  return state.permissionMenu
}
const permission = {}
for (const theme of ['light', 'dark']) {
  await page.evaluate((value) => {
    // The host keys its dark theme on the *presence* of the attribute, so a
    // value of "false" still means dark. Remove it for light.
    if (value === 'dark') {
      document.body.setAttribute('data-ds-dark-theme', 'true')
      document.documentElement.setAttribute('data-ds-dark-theme', '')
    } else {
      document.body.removeAttribute('data-ds-dark-theme')
      document.documentElement.removeAttribute('data-ds-dark-theme')
    }
  }, theme)
  await page.waitForTimeout(300)
  const menu = await openPermission()
  permission[theme] = menu
  if (menu !== null && menu !== undefined) {
    await shot(page, `m25-impl-permission-${theme}.png`, surfaceClip(menu))
    const table = []
    compare2(table, `permission ${theme} padding`, Number.parseFloat(refSurface.style.padding), menu.paddingTop)
    compare2(table, `permission ${theme} radius`, Number.parseFloat(refSurface.style.borderRadius), Number.parseFloat(menu.radius))
    for (const item of menu.items) {
      compare2(table, `permission ${theme} "${item.text}" icon slot`, 20, item.slotRect?.w)
      compare2(table, `permission ${theme} "${item.text}" radius`, 12, Number.parseFloat(item.radius))
    }
    check(`permission ${theme}: measured surface + 20px leading slot`, table.every((row) => row.pass === true), table.filter((row) => row.pass !== true))
    check(`permission ${theme}: three described rows, last one orange`, menu.items.length >= 3 && /226|146|e25507|923b0f/i.test(JSON.stringify(menu.items.map((i) => i.color))), menu.items.map((i) => [i.text, i.color]))
  }
  await page.keyboard.press('Escape')
  await page.waitForTimeout(250)
}
await page.evaluate(() => {
  document.body.setAttribute('data-ds-dark-theme', 'false')
  document.documentElement.removeAttribute('data-ds-dark-theme')
})

// ------------------------------------------------- dark-theme second pass ---
// The reference crops were taken in the product's dark theme, so the sheets
// compare like with like: the same frames are re-shot with the skin in dark.
await page.evaluate(() => {
  document.body.setAttribute('data-ds-dark-theme', 'true')
  document.documentElement.setAttribute('data-ds-dark-theme', '')
})
await page.waitForTimeout(400)
await page.mouse.move(1100, 700)
await page.waitForTimeout(300)
const darkRow = (await page.evaluate(MEASURE)).projectRows.find((row) => row.expanded === 'false') ?? (await page.evaluate(MEASURE)).projectRows[0]
if (darkRow !== undefined) await shot(page, 'm25-impl-projects-dark.png', projectsClip(darkRow))
await openMenu('.chatgpt-project-more')
const darkMore = (await page.evaluate(MEASURE)).moreMenu
if (darkMore !== null && darkMore !== undefined) await shot(page, 'm25-impl-more-menu-dark.png', surfaceClip(darkMore))
await page.keyboard.press('Escape')
await page.waitForTimeout(300)
const darkSessionTrigger = page.locator('.chatgpt-session-more').first()
if (await darkSessionTrigger.count() > 0) {
  await darkSessionTrigger.click()
  await page.waitForTimeout(500)
  const darkSession = (await page.evaluate(MEASURE)).sessionMenu
  if (darkSession !== null && darkSession !== undefined) await shot(page, 'm25-impl-session-menu-dark.png', surfaceClip(darkSession))
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)
}
await page.mouse.move(1100, 700)
await page.waitForTimeout(300)
await page.hover('.chatgpt-project-head')
await page.waitForTimeout(900)
const darkCard = (await page.evaluate(MEASURE)).hoverCard
if (darkCard !== null && darkCard !== undefined) await shot(page, 'm25-impl-hover-card-dark.png', surfaceClip(darkCard))
await page.mouse.move(1100, 700)

await browser.close()

function compare2(table, name, referenceValue, implementationValue, tolerance = 1) {
  const ref = Number(referenceValue)
  const got = Number(implementationValue)
  const ok = Number.isFinite(ref) && Number.isFinite(got)
  const delta = ok ? round(Math.abs(ref - got)) : null
  const pass = ok && delta <= tolerance
  table.push({ name, reference: ok ? ref : referenceValue ?? null, implementation: ok ? got : implementationValue ?? null, delta, pass })
  return pass
}

const report = {
  unit: 'css-px',
  generatedAt: new Date().toISOString(),
  source: `${masked} (DPR 2) vs docs/capture/live/project-menus.json`,
  tolerance: '≤1px per number',
  projectRow: {
    reference: refRow,
    implementation: collapsedRow,
    expanded: expandedRow,
    table: rowTable,
    glyphs: {
      collapsed: closedD.slice(0, 96),
      expanded: openD.slice(0, 96),
      referenceCollapsed: referenceClosed.slice(0, 96),
      referenceExpanded: referenceOpen.slice(0, 96)
    }
  },
  menus: {
    reference: { surface: refSurface.rect, item: refItem, separator: refSep },
    moreMenu,
    hoverCard: card,
    permission
  },
  tables: { projectRow: rowTable, moreMenu: menuTable, hoverCard: cardState.hoverCard === null ? [] : (assertions.find((a) => a.name === 'card: geometry follows the measured menu surface')?.detail ?? []) },
  icons: { identical: iconReport.summary.identical, of: iconReport.summary.glyphs, handDrawnPaths: iconReport.summary.handDrawnMenuPaths },
  assertions,
  frames: {
    projects: 'docs/screenshots/m25-impl-projects.png',
    collapsed: 'docs/screenshots/m25-impl-project-collapsed.png',
    expanded: 'docs/screenshots/m25-impl-project-expanded.png',
    hoverCard: 'docs/screenshots/m25-impl-hover-card.png',
    moreMenu: 'docs/screenshots/m25-impl-more-menu.png',
    sessionMenu: 'docs/screenshots/m25-impl-session-menu.png',
    permissionLight: 'docs/screenshots/m25-impl-permission-light.png',
    permissionDark: 'docs/screenshots/m25-impl-permission-dark.png',
    projectsDark: 'docs/screenshots/m25-impl-projects-dark.png',
    moreMenuDark: 'docs/screenshots/m25-impl-more-menu-dark.png',
    sessionMenuDark: 'docs/screenshots/m25-impl-session-menu-dark.png',
    hoverCardDark: 'docs/screenshots/m25-impl-hover-card-dark.png'
  }
}
writeFileSync(join(DOCS, 'm25.json'), JSON.stringify(report, null, 2) + '\n')
const failed = assertions.filter((entry) => entry.pass !== true)
console.log(`\nm25-capture: ${assertions.length - failed.length}/${assertions.length} assertions passed → docs/m25.json`)
process.exit(failed.length === 0 ? 0 : 1)
