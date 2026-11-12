#!/usr/bin/env node
/**
 * tools/m26-capture.mjs — P0-14 implementation frames.
 *
 * Renders the skin's own CSS (the exact `CHATGPT_CSS_TEXT` the client builds)
 * with the exact markup `composer.js` / `sessions.js` emit for the three
 * reference surfaces plus the composer's approval chip, at the reference's
 * device scale (2x), and writes:
 *
 *   docs/capture/m26/impl-permission.png   the approval picker
 *   docs/capture/m26/impl-project-menu.png the project ⋯ menu
 *   docs/capture/m26/impl-project-card.png the project hover card
 *   docs/capture/m26/impl-permission-chip.png  the chip over a #363636 card
 *   docs/capture/m26/impl-metrics.json     every measured rect in CSS px
 *
 * The glyphs are pulled out of the built bundle, so this never re-draws an
 * icon: whatever the client ships is what gets measured.
 *
 *   node tools/m26-capture.mjs
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'docs/capture/m26')
mkdirSync(OUT, { recursive: true })

const require = createRequire(import.meta.url)
const bundle = readFileSync(join(ROOT, 'lib/client.js'), 'utf8')

/** Pull the built stylesheet out of the bundle. */
function cssFromBundle() {
  const at = bundle.indexOf('const CHATGPT_CSS_TEXT = ')
  if (at < 0) throw new Error('CHATGPT_CSS_TEXT not found in lib/client.js — run `npm run build` first')
  const start = bundle.indexOf('"', at)
  let index = start + 1
  while (index < bundle.length) {
    if (bundle[index] === '\\') index += 2
    else if (bundle[index] === '"') break
    else index += 1
  }
  return JSON.parse(bundle.slice(start, index + 1))
}

/** Pull one SVG string out of the bundle's glyph table. */
function glyph(key) {
  const at = bundle.indexOf(`${key}: {`)
  if (at < 0) return ''
  const svg = bundle.indexOf('svg: "', at)
  if (svg < 0) return ''
  let index = svg + 6
  while (index < bundle.length) {
    if (bundle[index] === '\\') index += 2
    else if (bundle[index] === '"') break
    else index += 1
  }
  return JSON.parse(bundle.slice(svg + 5, index + 1))
}

const CHECK = glyph('check')

const ICONS = {
  ask: glyph('permissionAsk'),
  auto: glyph('permissionAuto'),
  full: glyph('permissionFull'),
  folderOpen: glyph('folderOpen'),
  star: glyph('star'),
  chatCount: glyph('chatCount'),
  repoPath: glyph('repoPath'),
  pin: glyph('pin'),
  edit: glyph('edit'),
  section: glyph('section'),
  reveal: glyph('reveal'),
  archive: glyph('archive'),
  remove: glyph('remove'),
  submenu: glyph('submenu')
}

const PERMISSION_ROWS = [
  { value: 'read-only', label: '请求批准', description: '编辑外部文件和使用互联网时始终询问', icon: ICONS.ask, current: false },
  { value: 'workspace-write', label: '帮我批准', description: '仅对检测到的风险操作请求批准', icon: ICONS.auto, current: true },
  { value: 'danger-full-access', label: '完全访问权限', description: '可不受限制地访问互联网和你电脑上的任何文件', icon: ICONS.full, current: false, fullAccess: true }
]

const PROJECT_ITEMS = [
  { icon: ICONS.pin, label: '置顶项目' },
  { icon: ICONS.edit, label: '编辑项目' },
  { separator: true },
  { icon: ICONS.section, label: '分区', submenu: true },
  { icon: ICONS.reveal, label: '在资源管理器中打开' },
  { separator: true },
  { icon: ICONS.archive, label: '归档聊天' },
  { separator: true },
  { icon: ICONS.remove, label: '移除项目', danger: true }
]

const style = cssFromBundle()

const permissionMenu = `
  <div class="chatgpt-work-menu chatgpt-permission-menu" data-cgpt-work-menu="permission" role="menu" style="left:24px;top:24px;width:298px">
    <div class="chatgpt-permission-head" data-cgpt-permission-head>
      <span class="chatgpt-permission-head-title">应如何批准 ChatGPT 操作?</span>
      <a class="chatgpt-permission-head-link" data-cgpt-permission-head-link href="https://help.openai.com/en/?q=approvals" target="_blank" rel="noreferrer noopener">了解更多</a>
    </div>
    ${PERMISSION_ROWS.map(
      (row) => `
      <button type="button" role="menuitemradio" aria-checked="${row.current}" class="chatgpt-work-menu-item chatgpt-permission-row${row.fullAccess === true ? ' is-full-access' : ''}" data-cgpt-approval-option="${row.value}" data-cgpt-permission-row="${row.value}" data-current="${row.current}" title="${row.label}">
        <span class="chatgpt-permission-icon" aria-hidden="true">${row.icon}</span>
        <span class="chatgpt-permission-copy">
          <span class="chatgpt-work-menu-label">${row.label}</span>
          <span class="chatgpt-permission-description">${row.description}</span>
        </span>
        ${row.current ? `<span class="chatgpt-work-menu-check" aria-hidden="true">${CHECK}</span>` : ''}
      </button>`
    ).join('')}
  </div>`

const projectMenu = `
  <div class="chatgpt-session-menu chatgpt-project-hover-menu" data-cgpt-session-menu="project-hover" role="menu" style="left:24px;top:240px">
    ${PROJECT_ITEMS.map((item) =>
      item.separator === true
        ? '<div class="chatgpt-session-menu-separator" role="separator"></div>'
        : `
      <button type="button" class="chatgpt-session-menu-item${item.danger === true ? ' is-danger' : ''}" role="menuitem" tabindex="-1">
        <span class="chatgpt-session-menu-icon" aria-hidden="true">${item.icon}</span>
        <span class="chatgpt-session-menu-label">${item.label}</span>
        ${item.submenu === true ? `<span class="chatgpt-session-menu-trailing" aria-hidden="true">${ICONS.submenu}</span>` : ''}
      </button>`
    ).join('')}
  </div>`

const projectCard = `
  <div class="chatgpt-session-menu" data-cgpt-session-menu="project" role="menu" style="left:24px;top:520px">
    <div class="chatgpt-project-menu-card" role="presentation">
      <span class="chatgpt-project-menu-icon" aria-hidden="true">${ICONS.folderOpen}</span>
      <span class="chatgpt-project-menu-title">系统实践</span>
      <span class="chatgpt-project-menu-star" aria-hidden="true">${ICONS.star}</span>
    </div>
    <div class="chatgpt-project-menu-meta" role="presentation">
      <span class="chatgpt-project-menu-meta-icon" aria-hidden="true">${ICONS.chatCount}</span>3 次聊天
    </div>
    <div class="chatgpt-session-menu-separator" role="separator"></div>
    <button type="button" class="chatgpt-project-menu-path" role="menuitem" tabindex="-1" title="打开项目：TianzeLuo/Directed-Research-in-AI-System">
      <span class="chatgpt-project-menu-path-icon" aria-hidden="true" data-cgpt-project-path-kind="repo">${ICONS.repoPath}</span>
      <span class="chatgpt-project-menu-path-text">TianzeLuo/Directed-Research-in-AI-System</span>
    </button>
    <button type="button" class="chatgpt-project-menu-path" role="menuitem" tabindex="-1" title="打开项目：directed-research-in-ai-system">
      <span class="chatgpt-project-menu-path-icon" aria-hidden="true" data-cgpt-project-path-kind="folder">${ICONS.folderOpen}</span>
      <span class="chatgpt-project-menu-path-text">directed-research-in-ai-system</span>
    </button>
    <div class="chatgpt-session-menu-separator" role="separator"></div>
    <button type="button" class="chatgpt-session-menu-item" role="menuitem" tabindex="-1">
      <span class="chatgpt-session-menu-icon" aria-hidden="true">${ICONS.edit}</span>
      <span class="chatgpt-session-menu-label">编辑项目</span>
    </button>
  </div>`

const chip = `
  <div style="position:fixed;left:24px;top:760px;width:320px;height:76px;border-radius:12px;background:#363636;display:flex;align-items:center;padding:0 12px">
    <button type="button" class="chatgpt-permission" data-cgpt-permission="" aria-haspopup="menu" aria-expanded="false">
      <span class="chatgpt-permission-icon" aria-hidden="true">${ICONS.auto}</span>
      <span class="chatgpt-permission-label">帮我批准</span>
    </button>
  </div>`

const html = `<!doctype html><html lang="zh"><head><meta charset="utf-8"><title>m26</title>
<style>${style}</style>
<style>
  /* P0-18 removed the ChatGPT caption row from the product. P0-14's evidence
     is a historical capture of the 2026-11-07 desktop surface, so this frame
     keeps that row (and the old 4.25px inset) by pinning it locally instead of
     re-reading the current picker CSS. */
  body[data-chatgpt-ui] .chatgpt-work-menu.chatgpt-permission-menu { padding: 4.25px 12px; }
  body[data-chatgpt-ui] .chatgpt-permission-head {
    display: flex; align-items: center; justify-content: space-between; gap: 8px;
    height: 28px; color: var(--cgpt-desktop-menu-title);
    font-size: 13px; font-weight: 400; line-height: 18px;
  }
  body[data-chatgpt-ui] .chatgpt-permission-head-title {
    min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  }
  body[data-chatgpt-ui] .chatgpt-permission-head-link {
    flex: none; padding: 0; border: 0; background: none;
    color: var(--cgpt-desktop-menu-muted); font-family: inherit;
    font-size: inherit; font-weight: 400; line-height: inherit;
    text-decoration: underline; text-decoration-thickness: 1px;
    text-underline-offset: 2px; white-space: nowrap; cursor: pointer;
  }
</style>
<style>
  html, body { margin: 0; height: 100%; background: #0e0e0e; }
  body { font-family: 'Noto Sans SC', 'Segoe UI', system-ui, sans-serif; }
</style>
</head><body data-chatgpt-ui data-ds-dark-theme>
${permissionMenu}
${projectMenu}
${projectMenu.replace('chatgpt-project-hover-menu', 'chatgpt-project-hover-menu is-offstage').replace('top:240px', 'top:1400px')}
${projectCard}
${chip}
</body></html>`

const playwrightPath = process.env.M26_PLAYWRIGHT ?? '/mnt/f/project/y86/node_modules/playwright/index.mjs'
const { chromium } = await import(playwrightPath)

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 900, height: 1700 }, deviceScaleFactor: 2, colorScheme: 'dark' })
await page.setContent(html, { waitUntil: 'load' })
await page.evaluate(() => document.fonts.ready)

const surfaces = [
  ['permission', '.chatgpt-permission-menu'],
  ['project-menu', '.chatgpt-project-hover-menu:not(.is-offstage)'],
  ['project-card', '.chatgpt-session-menu[data-cgpt-session-menu="project"]'],
  ['permission-chip', '.chatgpt-permission']
]

const metrics = {}
for (const [name, selector] of surfaces) {
  const locator = page.locator(selector).first()
  await locator.screenshot({ path: join(OUT, `impl-${name}.png`) })
  metrics[name] = await page.evaluate((sel) => {
    const root = document.querySelector(sel)
    const box = (el) => {
      if (el === null || el === undefined) return null
      const r = el.getBoundingClientRect()
      const style = getComputedStyle(el)
      return {
        x: Math.round(r.x * 100) / 100,
        y: Math.round(r.y * 100) / 100,
        width: Math.round(r.width * 100) / 100,
        height: Math.round(r.height * 100) / 100,
        fontSize: style.fontSize,
        lineHeight: style.lineHeight,
        color: style.color,
        padding: style.padding,
        borderRadius: style.borderRadius,
        background: style.backgroundColor
      }
    }
    const out = { box: box(root) }
    const measure = (label, query, all = false) => {
      if (all) out[label] = [...root.querySelectorAll(query)].map(box)
      else out[label] = box(root.querySelector(query))
    }
    measure('head', '.chatgpt-permission-head')
    measure('rows', '.chatgpt-session-menu-item, .chatgpt-permission-row, .chatgpt-project-menu-path', true)
    measure('icons', '.chatgpt-session-menu-icon, .chatgpt-permission-icon', true)
    measure('labels', '.chatgpt-permission-copy, .chatgpt-session-menu-label, .chatgpt-permission-label', true)
    measure('checks', '.chatgpt-work-menu-check', true)
    measure('separators', '.chatgpt-session-menu-separator', true)
    measure('paths', '.chatgpt-project-menu-path', true)
    return out
  }, selector)
}

writeFileSync(join(OUT, 'impl-metrics.json'), JSON.stringify({ generatedAt: new Date().toISOString(), deviceScaleFactor: 2, surfaces: metrics }, null, 2) + '\n')
await browser.close()
console.log(`m26-capture: ${surfaces.length} frames -> docs/capture/m26/impl-*.png`)
for (const [name] of surfaces) console.log(`  ${name}: ${metrics[name].box.width}x${metrics[name].box.height}`)
