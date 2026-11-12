#!/usr/bin/env node
/**
 * tools/m38-capture.mjs — P0-19f: text-only sidebar header and a mode-independent
 * 项目 section.
 *
 *   node tools/m38-capture.mjs --url "http://127.0.0.1:3130/?token=…" [--out docs]
 *
 * One isolated DSH instance drives both states from a blank new chat:
 *
 *   1. the sidebar header has no logo mark (the Host's mark slot is empty) but
 *      keeps the Host wordmark, left-aligned at the panel's 16px inset and
 *      centred on the 52px header line; search/collapse keep their coordinates.
 *   2. 项目 is visible in Chat and Work with the same section height, same
 *      project order, same rows and the same expanded state.
 *   3. the section DOM node survives a Chat↔Work switch (no remount/reflow).
 *
 * The pre-change search/collapse baseline is read from docs/m34.json; this
 * script does not rewrite m34's historical evidence.
 *
 * Writes docs/m38.json and docs/screenshots/m38-*.png.
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
  console.error('usage: node tools/m38-capture.mjs --url <tokenised-url> [--out docs]')
  process.exit(2)
}
const OUT = resolve(ROOT, typeof args.get('out') === 'string' ? args.get('out') : 'docs')
const SHOTS = join(OUT, 'screenshots')
mkdirSync(SHOTS, { recursive: true })

const playwrightPath = process.env.M38_PLAYWRIGHT ?? 'playwright'
const CHROME =
  process.env.CHATGPT_UI_CHROME ?? process.env.HOME + '/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome'
const { chromium } = await import(playwrightPath)

const round = (value) => Math.round(value * 100) / 100
const redact = (value) => value.replace(/([?&]token=)[^&]+/, '$1***')
const PRODUCT_KEY = 'dsh-chatgpt-ui:product-default'
const PROJECTS_VISIBLE_KEY = 'dsh-chatgpt-ui:projects-visible'
const PROJECT_EXPANSION_KEY = 'dsh-chatgpt-ui:expanded-projects'
const screenshots = []
const assertions = []
const addAssertion = (id, ok, detail) => {
  assertions.push({ id, ok: ok === true, detail })
  if (ok !== true) console.log(`FAIL  ${id} — ${detail}`)
}

const baselineReport = JSON.parse(readFileSync(join(OUT, 'm34.json'), 'utf8'))
const m34Top = baselineReport.sidebar.top
const baseline = {
  source: 'docs/m34.json (P0-19b, before P0-19f)',
  header: m34Top.header,
  wordmark: m34Top.name,
  search: m34Top.search,
  collapse: m34Top.square[0].rect
}

const browser = await chromium.launch({
  headless: true,
  executablePath: CHROME,
  args: ['--no-sandbox', '--disable-dev-shm-usage']
})
const context = await browser.newContext({
  viewport: { width: 1233, height: 850 },
  deviceScaleFactor: 2,
  locale: 'zh-CN',
  colorScheme: 'dark'
})
const page = await context.newPage()
const errors = []
const httpErrors = []
page.on('pageerror', (error) => errors.push(String(error).slice(0, 300)))
page.on('console', (message) => {
  if (message.type() !== 'error') return
  if (/^Failed to load resource/.test(message.text())) return
  errors.push(`console: ${message.text().slice(0, 240)}`)
})
page.on('response', (response) => {
  if (response.status() < 400) return
  httpErrors.push({ status: response.status(), url: redact(response.url()) })
})

await page.goto(url, { waitUntil: 'networkidle' })
await page.waitForTimeout(1600)
await page.evaluate(() => {
  const button = document.querySelector("[role='dialog'] button")
  if (button !== null) button.click()
})
await page.waitForTimeout(300)

const shot = async (name, clip) => {
  const path = join(SHOTS, name)
  await page.screenshot({ path, ...(clip === undefined ? {} : { clip }) })
  screenshots.push({ name, path: `screenshots/${name}`, bytes: readFileSync(path).length })
}

const boxFn = `
  const roundValue = (value) => Math.round(value * 100) / 100
  const box = (node) => {
    if (node === null || node === undefined) return null
    const rect = node.getBoundingClientRect()
    return {
      x: roundValue(rect.x),
      y: roundValue(rect.y),
      w: roundValue(rect.width),
      h: roundValue(rect.height),
      cx: roundValue(rect.x + rect.width / 2),
      cy: roundValue(rect.y + rect.height / 2)
    }
  }
`

/** Header: mark removal, wordmark geometry/ink box, and the fixed right controls. */
const readHeader = () =>
  page.evaluate(`(() => {
    ${boxFn}
    const q = (selector) => document.querySelector(selector)
    const header = q("[data-slot='sidebar'] [data-window-drag]")
    const panel = q("[data-slot='sidebar'] > div")
    const markSlot = q("[data-slot='sidebar.brand.mark']")
    const markWrap = q("[class*='_brandMark']")
    const markSvg = q("[data-slot='sidebar.brand.mark'] svg")
    const nameSvg = q("[data-slot='sidebar.brand.name'] svg")
    const nameSlot = q("[data-slot='sidebar.brand.name']")
    const identity = q("[class*='_brandIdentity']")
    const search = q('.chatgpt-panel-search')
    const collapse = header === null ? null : header.querySelector('button:last-of-type')
    const buttons = header === null
      ? []
      : [...header.querySelectorAll('button')]
          .filter((node) => node.getBoundingClientRect().width > 0)
          .map((node) => ({
            aria: node.getAttribute('aria-label') ?? '',
            title: node.title ?? '',
            rect: box(node)
          }))

    let ink = null
    if (nameSvg !== null) {
      try {
        const rect = nameSvg.getBoundingClientRect()
        const local = nameSvg.getBBox()
        const matrix = nameSvg.getScreenCTM()
        const point = nameSvg.createSVGPoint()
        const map = (x, y) => {
          point.x = x
          point.y = y
          const mapped = point.matrixTransform(matrix)
          return { x: mapped.x, y: mapped.y }
        }
        const a = map(local.x, local.y)
        const z = map(local.x + local.width, local.y + local.height)
        const left = Math.max(rect.left, a.x)
        const top = Math.max(rect.top, a.y)
        const right = Math.min(rect.right, z.x)
        const bottom = Math.min(rect.bottom, z.y)
        ink = {
          x: roundValue(left),
          y: roundValue(top),
          right: roundValue(right),
          bottom: roundValue(bottom),
          w: roundValue(right - left),
          h: roundValue(bottom - top),
          cx: roundValue((left + right) / 2),
          cy: roundValue((top + bottom) / 2)
        }
      } catch {
        ink = null
      }
    }

    return {
      mode: document.body.getAttribute('data-chatgpt-mode'),
      header: box(header),
      panel: box(panel),
      mark: {
        slotChildren: markSlot === null ? null : markSlot.children.length,
        slotSvgCount: document.querySelectorAll("[data-slot='sidebar.brand.mark'] svg").length,
        slotImgCount: document.querySelectorAll("[data-slot='sidebar.brand.mark'] img").length,
        svg: box(markSvg),
        wrapper: box(markWrap),
        wrapperDisplay: markWrap === null ? null : getComputedStyle(markWrap).display,
        wrapperWidth: markWrap === null ? null : getComputedStyle(markWrap).width,
        wrapperHeight: markWrap === null ? null : getComputedStyle(markWrap).height
      },
      wordmark: {
        slot: box(nameSlot),
        svg: box(nameSvg),
        viewBox: nameSvg === null ? null : nameSvg.getAttribute('viewBox'),
        width: nameSvg === null ? null : nameSvg.getAttribute('width'),
        height: nameSvg === null ? null : nameSvg.getAttribute('height'),
        display: nameSvg === null ? null : getComputedStyle(nameSvg).display
      },
      ink,
      identity: identity === null
        ? null
        : { rect: box(identity), gap: getComputedStyle(identity).gap },
      search: box(search),
      collapse: box(collapse),
      buttons,
      textInset: nameSvg === null || panel === null ? null : roundValue(nameSvg.getBoundingClientRect().x - panel.getBoundingClientRect().x),
      headerCy: header === null ? null : roundValue(header.getBoundingClientRect().y + header.getBoundingClientRect().height / 2),
      storage: localStorage.getItem('${PRODUCT_KEY}')
    }
  })()`)

/** 项目 section: visibility, height, rows, order, expansion and DOM identity. */
const readProjects = () =>
  page.evaluate(`(() => {
    ${boxFn}
    const q = (selector) => document.querySelector(selector)
    const section = q('.chatgpt-projects-section')
    const heading = q('.chatgpt-projects-heading')
    const projectNodes = [...document.querySelectorAll('.chatgpt-project')]
    const projects = projectNodes.map((node) => ({
      id: node.querySelector('[data-cgpt-project-head]')?.getAttribute('data-cgpt-project-head') ?? '',
      title: node.querySelector('.chatgpt-project-title')?.textContent ?? '',
      height: box(node)?.h ?? 0,
      rows: [...node.querySelectorAll('[data-cgpt-session-row]')].map((row) =>
        row.getAttribute('data-cgpt-session-row')
      )
    }))
    return {
      present: section !== null,
      rect: box(section),
      height: section === null ? 0 : roundValue(section.getBoundingClientRect().height),
      heading: heading === null
        ? null
        : {
            expanded: heading.getAttribute('aria-expanded'),
            text: heading.textContent.trim(),
            rect: box(heading)
          },
      count: projectNodes.length,
      projects,
      sectionRows: section === null
        ? []
        : [...section.querySelectorAll('[data-cgpt-session-row]')].map((row) =>
            row.getAttribute('data-cgpt-session-row')
          ),
      storageVisible: localStorage.getItem('${PROJECTS_VISIBLE_KEY}'),
      storageExpansion: localStorage.getItem('${PROJECT_EXPANSION_KEY}'),
      marker: section === null ? null : section.getAttribute('data-m38-node'),
      bodyMode: document.body.getAttribute('data-chatgpt-mode')
    }
  })()`)

const waitReady = async (mode) => {
  await page.waitForFunction(
    (target) =>
      document.body.getAttribute('data-chatgpt-mode') === target &&
      document.querySelector('.chatgpt-sessions')?.getAttribute('data-phase') === 'ready',
    mode,
    { timeout: 15000 }
  )
  // The Host may still settle the active blank row after the phase flips.
  await page.waitForTimeout(900)
}

const clickSegment = async (text) => {
  await page.locator('.chatgpt-header-mode .chatgpt-mode-seg', { hasText: text }).first().click()
  await waitReady(text === '聊天' ? 'chat' : 'agent')
}

const clickNewChat = async () => {
  await page.locator('.chatgpt-new-chat').click()
  await page.waitForFunction(
    () => document.querySelector('.chatgpt-sessions')?.getAttribute('data-phase') === 'ready',
    undefined,
    { timeout: 15000 }
  )
  await page.waitForTimeout(1600)
}

// 1) Fresh storage, a blank draft in Work, and the section expanded.
await page.evaluate(
  ({ product, visible, expansion }) => {
    localStorage.removeItem(product)
    localStorage.removeItem(visible)
    localStorage.removeItem(expansion)
  },
  { product: PRODUCT_KEY, visible: PROJECTS_VISIBLE_KEY, expansion: PROJECT_EXPANSION_KEY }
)
await clickNewChat()
if ((await page.evaluate(() => document.body.getAttribute('data-chatgpt-mode'))) !== 'agent') {
  await clickSegment('工作')
}
await waitReady('agent')
const expanded = await page.evaluate(() =>
  document.querySelector('.chatgpt-projects-heading')?.getAttribute('aria-expanded')
)
if (expanded === 'false') {
  await page.locator('.chatgpt-projects-heading').click()
  await page.waitForTimeout(500)
}
await page.waitForTimeout(500)
const work = { header: await readHeader(), projects: await readProjects() }
await shot('m38-header.png', { x: 52, y: 0, width: 288, height: 60 })
await shot('m38-sidebar-work.png', { x: 0, y: 0, width: 340, height: 620 })
await shot('m38-top-switch-work.png', { x: 620, y: 0, width: 340, height: 52 })
await shot('m38-work-full.png')

// 2) Mark the section DOM node, switch to Chat, and read the same node.
await page.evaluate(() => {
  document.querySelector('.chatgpt-projects-section')?.setAttribute('data-m38-node', 'kept')
})
await clickSegment('聊天')
await page.waitForTimeout(400)
const chat = { header: await readHeader(), projects: await readProjects() }
await shot('m38-sidebar-chat.png', { x: 0, y: 0, width: 340, height: 620 })
await shot('m38-top-switch-chat.png', { x: 620, y: 0, width: 340, height: 52 })
await shot('m38-chat-full.png')

// 3) Switch back: the marker and the measurements must survive another pass.
await clickSegment('工作')
await page.waitForTimeout(300)
const workAgain = { header: await readHeader(), projects: await readProjects() }

const normalizedProjects = (state) =>
  state.projects.projects.map((project) => ({ id: project.id, title: project.title, rows: project.rows }))
const sameProjects = JSON.stringify(normalizedProjects(chat)) === JSON.stringify(normalizedProjects(work))
const heightDelta = round(Math.abs(chat.projects.height - work.projects.height))
const nodeKept =
  chat.projects.marker === 'kept' &&
  workAgain.projects.marker === 'kept' &&
  work.projects.present === true
const controlsUnchanged =
  JSON.stringify(work.header.search) === JSON.stringify(baseline.search) &&
  JSON.stringify(work.header.collapse) === JSON.stringify(baseline.collapse)

addAssertion(
  'header.no-logo-icon',
  work.header.mark.slotSvgCount === 0 &&
    work.header.mark.slotImgCount === 0 &&
    work.header.mark.slotChildren === 0 &&
    work.header.mark.wrapperDisplay === 'none',
  JSON.stringify(work.header.mark)
)
addAssertion(
  'header.text-left',
  work.header.wordmark.svg !== null &&
    work.header.wordmark.svg.w > 0 &&
    Math.abs(work.header.wordmark.svg.x - 68) < 0.01 &&
    work.header.textInset === 16,
  JSON.stringify({ svg: work.header.wordmark.svg, inset: work.header.textInset, panel: work.header.panel })
)
addAssertion(
  'header.height-52',
  work.header.header.h === 52 && work.header.header.cy === 26 && chat.header.header.h === 52,
  JSON.stringify({ work: work.header.header, chat: chat.header.header })
)
addAssertion(
  'header.text-vertically-centred',
  work.header.ink !== null &&
    Math.abs(work.header.ink.cy - 26) <= 1 &&
    Math.abs(work.header.wordmark.svg.cy - 26) <= 0.5,
  JSON.stringify({ ink: work.header.ink, svg: work.header.wordmark.svg })
)
addAssertion(
  'header.right-controls-unchanged',
  controlsUnchanged && work.header.search.cy === 26 && work.header.collapse.cy === 26,
  JSON.stringify({ before: baseline, after: { search: work.header.search, collapse: work.header.collapse } })
)
addAssertion(
  'projects.visible-in-work',
  work.projects.present === true && work.projects.count > 0 && work.projects.height > 0,
  JSON.stringify({ present: work.projects.present, count: work.projects.count, height: work.projects.height })
)
addAssertion(
  'projects.visible-in-chat',
  chat.projects.present === true && chat.projects.count > 0 && chat.projects.height > 0,
  JSON.stringify({ present: chat.projects.present, count: chat.projects.count, height: chat.projects.height })
)
addAssertion(
  'projects.height-equal',
  heightDelta <= 0.5,
  JSON.stringify({ work: work.projects.height, chat: chat.projects.height, delta: heightDelta })
)
addAssertion(
  'projects.same-order-and-rows',
  sameProjects,
  JSON.stringify({ work: normalizedProjects(work), chat: normalizedProjects(chat) })
)
addAssertion(
  'projects.same-expanded-state',
  work.projects.heading?.expanded === chat.projects.heading?.expanded &&
    work.projects.storageVisible === chat.projects.storageVisible &&
    work.projects.storageExpansion === chat.projects.storageExpansion,
  JSON.stringify({
    work: work.projects.heading,
    chat: chat.projects.heading,
    visible: [work.projects.storageVisible, chat.projects.storageVisible],
    expansion: [work.projects.storageExpansion, chat.projects.storageExpansion]
  })
)
addAssertion(
  'projects.no-remount-on-mode-switch',
  nodeKept,
  JSON.stringify({ work: work.projects.marker, chat: chat.projects.marker, workAgain: workAgain.projects.marker })
)

// 4) Side-by-side comparison from the two real sidebar crops.
const chatImage = readFileSync(join(SHOTS, 'm38-sidebar-chat.png')).toString('base64')
const workImage = readFileSync(join(SHOTS, 'm38-sidebar-work.png')).toString('base64')
const chatSwitch = readFileSync(join(SHOTS, 'm38-top-switch-chat.png')).toString('base64')
const workSwitch = readFileSync(join(SHOTS, 'm38-top-switch-work.png')).toString('base64')
const comparePage = await context.newPage()
await comparePage.setViewportSize({ width: 700, height: 740 })
await comparePage.setContent(`<!doctype html><html><body style="margin:0;background:#0b0b0b;color:#eee;font:12px/28px system-ui,sans-serif">
  <div style="display:flex;gap:0">
    <section style="width:340px">
      <div style="height:28px;display:flex;align-items:center;justify-content:center;background:#151515;color:#aaa">聊天 · 项目可见</div>
      <img alt="聊天顶部切换" src="data:image/png;base64,${chatSwitch}" style="display:block;width:340px;height:52px">
      <img alt="聊天侧栏" src="data:image/png;base64,${chatImage}" style="display:block;width:340px">
    </section>
    <section style="width:340px;margin-left:20px">
      <div style="height:28px;display:flex;align-items:center;justify-content:center;background:#151515;color:#aaa">工作 · 项目可见</div>
      <img alt="工作顶部切换" src="data:image/png;base64,${workSwitch}" style="display:block;width:340px;height:52px">
      <img alt="工作侧栏" src="data:image/png;base64,${workImage}" style="display:block;width:340px">
    </section>
  </div>
</body></html>`)
await comparePage.waitForTimeout(250)
await comparePage.screenshot({ path: join(SHOTS, 'm38-sidebar-compare.png') })
screenshots.push({
  name: 'm38-sidebar-compare.png',
  path: 'screenshots/m38-sidebar-compare.png',
  bytes: readFileSync(join(SHOTS, 'm38-sidebar-compare.png')).length
})
await comparePage.close()

const product = {
  task: 'P0-19f',
  generatedAt: new Date().toISOString(),
  viewport: { width: 1233, height: 850, dpr: 2 },
  url: redact(url),
  baseline,
  header: {
    work: work.header,
    chat: chat.header,
    textBaseline: work.header.ink === null
      ? null
      : {
          top: work.header.ink.y,
          bottom: work.header.ink.bottom,
          center: work.header.ink.cy,
          headerCenter: work.header.header.cy,
          delta: round(work.header.ink.cy - work.header.header.cy)
        },
    assertion: {
      markRemoved: work.header.mark,
      textLeft: work.header.wordmark.svg,
      textInk: work.header.ink,
      textInset: work.header.textInset,
      headerHeight: work.header.header.h
    }
  },
  projects: {
    membership: 'mode-independent: Chat rows are grouped under their workspace like Work (P0-17 exclusion retired)',
    work: work.projects,
    chat: chat.projects,
    workAgain: workAgain.projects,
    heightDelta,
    sameProjects,
    nodeKept
  },
  assertions,
  screenshots,
  errors,
  httpErrors
}
writeFileSync(join(OUT, 'm38.json'), `${JSON.stringify(product, null, 2)}\n`)

console.log(
  JSON.stringify(
    {
      assertions: assertions.length,
      failed: assertions.filter((entry) => entry.ok !== true).length,
      screenshots: screenshots.length,
      errors,
      httpErrors
    },
    null,
    1
  )
)
await browser.close()
if (assertions.some((entry) => entry.ok !== true)) process.exitCode = 1
