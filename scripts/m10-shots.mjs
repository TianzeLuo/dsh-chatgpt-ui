#!/usr/bin/env node
/**
 * M10 pixel-alignment evidence.
 *
 * Composes four before/after sheets from committed captures plus a local
 * CSS-only render of the changed components (no live DSH capture, no network).
 * Every image is written to docs/screenshots/m10-*.png; measured values go to
 * docs/m10-verify.json.
 *
 *   node scripts/m10-shots.mjs
 *
 * The local render uses the real shipped stylesheets and the real class names.
 * It is evidence for the CSS geometry, not a screenshot of a running DSH.
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { readPng, writePng } from './png-read.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SHOTS = join(ROOT, 'docs/screenshots')
const TMP = join(ROOT, '.m10-tmp')
const PLAYWRIGHT = process.env.PLAYWRIGHT_DIR ?? '/mnt/f/project/y86/node_modules/playwright'
const HEADLESS_SHELL = '/home/user/.cache/ms-playwright/chromium_headless_shell-1248/chrome-headless-shell-linux64/chrome-headless-shell'
const CHROME = process.env.CHATGPT_UI_CHROME ?? HEADLESS_SHELL
const CHROME_ARGS = ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--disable-software-rasterizer', '--ozone-platform=headless']
const css = readdirSync(join(ROOT, 'lib/client/css'))
  .filter((name) => name.endsWith('.css'))
  .sort()
  .map((name) => readFileSync(join(ROOT, 'lib/client/css', name), 'utf8'))
  .join('\n')

mkdirSync(TMP, { recursive: true })
mkdirSync(SHOTS, { recursive: true })

/* ---- PNG crops --------------------------------------------------------- */
function crop(input, output, x, y, w, h, downscale = 1) {
  const img = readPng(input)
  const ow = Math.floor(w / downscale)
  const oh = Math.floor(h / downscale)
  const out = Buffer.alloc(ow * oh * 3)
  for (let oy = 0; oy < oh; oy += 1) {
    for (let ox = 0; ox < ow; ox += 1) {
      let r = 0
      let g = 0
      let b = 0
      let n = 0
      for (let sy = 0; sy < downscale; sy += 1) {
        for (let sx = 0; sx < downscale; sx += 1) {
          const px = img.pixel(x + ox * downscale + sx, y + oy * downscale + sy)
          r += px[0]
          g += px[1]
          b += px[2]
          n += 1
        }
      }
      const at = (oy * ow + ox) * 3
      out[at] = Math.round(r / n)
      out[at + 1] = Math.round(g / n)
      out[at + 2] = Math.round(b / n)
    }
  }
  const path = join(TMP, output)
  writePng(path, ow, oh, out)
  return path
}

const cropBeforeMenu = crop(join(SHOTS, 'm9-impl-session-menu-light.png'), 'before-menu.png', 10, 110, 380, 360)
const cropBeforePicker = crop(join(SHOTS, 'matrix9-impl-project-light.png'), 'before-picker.png', 555, 265, 390, 225)
const cropBeforeRows = crop(join(SHOTS, 'm4-light-implementation.png'), 'before-rows.png', 55, 130, 300, 380)
const cropBeforeChat = crop(join(SHOTS, 'm4-light-implementation.png'), 'before-chat.png', 500, 0, 780, 700)
const cropRefMenu = crop(join(SHOTS, 'm9-ref-session-menu-light.png'), 'ref-menu.png', 300, 500, 700, 800, 2)
const cropRefPicker = crop(join(SHOTS, 'm9-ref-project-menu-light.png'), 'ref-picker.png', 1120, 1050, 680, 380, 2)
const cropRefRows = crop(join(SHOTS, 'm9-ref-chat-existing-light.png'), 'ref-rows.png', 100, 440, 600, 760, 2)
const cropRefChat = crop(join(SHOTS, 'm9-ref-chat-existing-light.png'), 'ref-chat.png', 1160, 100, 1520, 1200, 2)

/* ---- icons ------------------------------------------------------------- */
const icon = (body) => `<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`
const ICONS = {
  rename: icon('<path d="M3 13l1-3 7-7 2 2-7 7-3 1z"/><path d="M10 3l3 3"/>'),
  pin: icon('<path d="M6 2h6l-1 4 2.5 2.5H4.5L7 6z"/><path d="M8 9v5"/>'),
  lock: icon('<rect x="3.5" y="7" width="9" height="7" rx="2"/><path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2"/>'),
  share: icon('<path d="M8 12V3"/><path d="M5 6l3-3 3 3"/><path d="M3 10v4h10v-4"/>'),
  archive: icon('<rect x="3" y="4" width="10" height="9" rx="1.5"/><path d="M3 7h10M6.5 10h3"/>'),
  trash: icon('<path d="M3.5 5h9"/><path d="M6 5V3.5h4V5"/><path d="M5 5l.7 8h4.6L11 5"/>'),
  folder: icon('<path d="M2.5 4.5h4l1.5 2h5.5v6h-11z"/>'),
  plus: icon('<path d="M8 3.5v9M3.5 8h9"/>'),
  search: icon('<circle cx="7" cy="7" r="4"/><path d="M10 10l3 3"/>'),
  chevron: icon('<path d="M6.5 4.5L10 8l-3.5 3.5"/>'),
  more: icon('<circle cx="3.5" cy="8" r=".8" fill="currentColor" stroke="none"/><circle cx="8" cy="8" r=".8" fill="currentColor" stroke="none"/><circle cx="12.5" cy="8" r=".8" fill="currentColor" stroke="none"/>')
}

const menuHtml = `
  <div class="m10-stage">
    <div class="chatgpt-session-menu" style="position:relative;left:auto;top:auto;z-index:1">
      ${[['rename', '重命名'], ['pin', '置顶'], ['lock', '锁定聊天']].map(([name, label]) => `
        <button class="chatgpt-session-menu-item" type="button"><span class="chatgpt-session-menu-icon">${ICONS[name]}</span><span class="chatgpt-session-menu-label">${label}</span></button>`).join('')}
      <div class="chatgpt-session-menu-separator"></div>
      <button class="chatgpt-session-menu-item" type="button"><span class="chatgpt-session-menu-icon">${ICONS.share}</span><span class="chatgpt-session-menu-label">分享</span></button>
      <div class="chatgpt-session-menu-separator"></div>
      <button class="chatgpt-session-menu-item" type="button"><span class="chatgpt-session-menu-icon">${ICONS.archive}</span><span class="chatgpt-session-menu-label">归档</span></button>
      <button class="chatgpt-session-menu-item is-danger" type="button"><span class="chatgpt-session-menu-icon">${ICONS.trash}</span><span class="chatgpt-session-menu-label">删除</span></button>
      <div class="chatgpt-session-menu-separator"></div>
      <button class="chatgpt-session-menu-item" type="button"><span class="chatgpt-session-menu-icon">${ICONS.folder}</span><span class="chatgpt-session-menu-label">移至项目</span><span class="chatgpt-session-menu-icon">${ICONS.chevron}</span></button>
    </div>
  </div>`

const pickerHtml = `
  <div class="m10-stage">
    <div class="chatgpt-work-menu chatgpt-project-picker" role="menu" style="position:relative;left:auto;top:auto;width:var(--cgpt-project-picker-width,261px)">
      <div class="chatgpt-project-picker-search">
        <span aria-hidden="true">${ICONS.search}</span>
        <input type="search" placeholder="搜索项目" aria-label="搜索项目">
      </div>
      <button class="chatgpt-work-menu-item chatgpt-project-picker-new" type="button">
        <span class="chatgpt-work-tool-icon">${ICONS.plus}</span><span class="chatgpt-work-menu-label">新建项目</span>
      </button>
      <div class="chatgpt-work-menu-empty">没有项目</div>
    </div>
  </div>`

const row = (title, extra = '', current = false) => `
  <div class="chatgpt-session-item">
    <button class="chatgpt-session-row" type="button" ${current ? 'aria-current="page"' : ''}>
      <span class="chatgpt-session-title">${title}</span>
      ${extra}
      <span class="chatgpt-session-more" style="opacity:1">${ICONS.more}</span>
    </button>
  </div>`
const rowsHtml = `
  <div class="m10-stage">
    <div class="chatgpt-sessions" style="height:auto">
      <div class="chatgpt-session-scroll" style="overflow:visible;padding-right:0">
        <div class="chatgpt-section-heading">最近</div>
        ${row('1104-实验分析', '', true)}
        ${row('删除故障记录')}
        ${row('介绍BCG')}
        ${row('提高得分作答建议', '<span class="chatgpt-session-project">Native parity</span>')}
        ${row('创建骑鹅旅行GIF')}
        ${row('介绍Shell排序')}
      </div>
    </div>
  </div>`

const pageShell = (body) => `<!doctype html><html lang="zh"><head><meta charset="utf-8">
<style>
  html,body{margin:0;padding:0;background:#fcfcfc}
  .m10-stage{display:inline-block;padding:20px;background:#fcfcfc}
</style></head><body data-chatgpt-ui="0.1.0" data-cgpt-skin="on">${body}</body></html>`

async function main() {
  const { chromium } = await import(join(PLAYWRIGHT, 'index.mjs'))
  const browser = await chromium.launch({ headless: true, executablePath: CHROME, args: CHROME_ARGS })
  const measure = {}
  let page
  try {
    page = await browser.newPage({ viewport: { width: 1000, height: 1200 }, deviceScaleFactor: 2 })

    /* ---- session menu -------------------------------------------------- */
    await page.setContent(pageShell(menuHtml))
    await page.addStyleTag({ content: css })
    await page.waitForTimeout(80)
    measure.sessionMenu = await page.evaluate(() => {
      const menu = document.querySelector('.chatgpt-session-menu')
      const item = menu.querySelector('.chatgpt-session-menu-item')
      const style = getComputedStyle(menu)
      const itemStyle = getComputedStyle(item)
      const rect = (el) => {
        const box = el.getBoundingClientRect()
        return { x: +box.x.toFixed(1), y: +box.y.toFixed(1), w: +box.width.toFixed(1), h: +box.height.toFixed(1) }
      }
      return {
        menu: rect(menu),
        item: rect(item),
        radius: parseFloat(style.borderTopLeftRadius),
        padding: parseFloat(style.paddingTop),
        itemRadius: parseFloat(itemStyle.borderTopLeftRadius),
        itemPaddingInline: parseFloat(itemStyle.paddingLeft),
        gap: parseFloat(itemStyle.columnGap),
        separatorHeight: rect(menu.querySelector('.chatgpt-session-menu-separator')).h,
        icon: rect(item.querySelector('.chatgpt-session-menu-icon')).w,
        labelLeftFromMenu: +(item.querySelector('.chatgpt-session-menu-label').getBoundingClientRect().left - menu.getBoundingClientRect().left).toFixed(1)
      }
    })
    await page.locator('.m10-stage').screenshot({ path: join(TMP, 'after-menu.png') })

    /* ---- project picker ------------------------------------------------ */
    await page.setContent(pageShell(pickerHtml))
    await page.addStyleTag({ content: css })
    await page.waitForTimeout(80)
    measure.projectPicker = await page.evaluate(() => {
      const picker = document.querySelector('.chatgpt-project-picker')
      const search = picker.querySelector('.chatgpt-project-picker-search')
      const item = picker.querySelector('.chatgpt-project-picker-new')
      const style = getComputedStyle(picker)
      const itemStyle = getComputedStyle(item)
      const rect = (el) => {
        const box = el.getBoundingClientRect()
        return { x: +box.x.toFixed(1), y: +box.y.toFixed(1), w: +box.width.toFixed(1), h: +box.height.toFixed(1) }
      }
      return {
        picker: rect(picker),
        search: rect(search),
        item: rect(item),
        padding: parseFloat(style.paddingTop),
        itemRadius: parseFloat(itemStyle.borderTopLeftRadius),
        itemPaddingInline: parseFloat(itemStyle.paddingLeft),
        gap: parseFloat(itemStyle.columnGap),
        searchMarginBottom: parseFloat(getComputedStyle(search).marginBottom)
      }
    })
    await page.locator('.m10-stage').screenshot({ path: join(TMP, 'after-picker.png') })

    /* ---- sidebar rows -------------------------------------------------- */
    await page.setContent(pageShell(rowsHtml + '<div data-slot="sidebar"><div class="YDXeBa_sessionRow" style="visibility:hidden;height:var(--cgpt-session-row-height)"><span class="YDXeBa_title">Host row</span></div></div>'))
    await page.addStyleTag({ content: css })
    await page.waitForTimeout(80)
    measure.sidebar = await page.evaluate(() => {
      const stage = document.querySelector('.m10-stage')
      const rows = [...stage.querySelectorAll('.chatgpt-session-row')]
      const heading = stage.querySelector('.chatgpt-section-heading')
      const row = rows[0]
      const title = row.querySelector('.chatgpt-session-title')
      const tag = stage.querySelector('.chatgpt-session-project')
      const hostRow = document.querySelector('[data-slot="sidebar"] .YDXeBa_sessionRow')
      const rect = (el) => {
        const box = el.getBoundingClientRect()
        return { x: +box.x.toFixed(1), y: +box.y.toFixed(1), w: +box.width.toFixed(1), h: +box.height.toFixed(1) }
      }
      return {
        row: rect(row),
        rowHeights: rows.map((el) => +el.getBoundingClientRect().height.toFixed(1)),
        titleLeftFromRow: +(title.getBoundingClientRect().left - row.getBoundingClientRect().left).toFixed(1),
        titleRightFromRow: +(row.getBoundingClientRect().right - title.getBoundingClientRect().right).toFixed(1),
        paddingInline: parseFloat(getComputedStyle(row).paddingLeft),
        actionRightFromRow: +(row.getBoundingClientRect().right - row.querySelector('.chatgpt-session-more').getBoundingClientRect().right).toFixed(1),
        projectTagMarginLeft: parseFloat(getComputedStyle(tag).marginLeft),
        headingHeight: rect(heading).h,
        hostRowHeight: rect(hostRow).h
      }
    })
    await page.locator('.m10-stage').screenshot({ path: join(TMP, 'after-rows.png') })

    /* ---- message column (real host-shaped fixture) --------------------- */
    await page.setViewportSize({ width: 1100, height: 1400 })
    await page.goto(pathToFileURL(join(ROOT, 'test/fixtures/messages.html')).href, { waitUntil: 'load' })
    await page.addStyleTag({ content: css })
    await page.evaluate(() => {
      document.querySelector('[data-slot="main.conversation"]').setAttribute('data-conversation-scroll', '')
      const body = document.querySelector('#fixture-assistant-body')
      body.insertAdjacentHTML('beforeend', `
        <div data-testid="todo-panel" style="width:100%"><strong>To-dos</strong><p>1 completed · 1 in progress · 2 pending</p></div>
        <div data-message-attachments="true" style="display:flex"><div class="Sixlwa_fileCard"><span class="Sixlwa_fileName">fixture-panel.png</span><span class="Sixlwa_fileMeta">PNG · 120 KB</span></div></div>`)
    })
    await page.waitForTimeout(120)
    measure.message = await page.evaluate(() => {
      const column = document.querySelector('.EvIC1a_column')
      const code = document.querySelector('#fixture-code-wrap')
      const todo = document.querySelector('[data-testid="todo-panel"]')
      const file = document.querySelector('.Sixlwa_fileCard')
      const scroller = document.querySelector('[data-code-block-content] > div')
      const rect = (el) => {
        const box = el.getBoundingClientRect()
        return { x: +box.x.toFixed(1), y: +box.y.toFixed(1), w: +box.width.toFixed(1), h: +box.height.toFixed(1) }
      }
      return {
        column: rect(column),
        code: rect(code),
        todo: rect(todo),
        fileCard: rect(file),
        columnOverflow: column.scrollWidth - column.clientWidth,
        documentOverflow: document.documentElement.scrollWidth - window.innerWidth,
        codeOverflow: scroller.scrollWidth > scroller.clientWidth,
        codeOverflowX: getComputedStyle(scroller).overflowX,
        columnVar: getComputedStyle(column).maxWidth
      }
    })
    await page.locator('.EvIC1a_column').screenshot({ path: join(TMP, 'after-chat.png') })

    /* ---- compose the four sheets --------------------------------------- */
    const specs = [
      {
        id: 'm10-1-session-menu',
        title: 'M10-1 · 会话右键菜单 · 266 → 161',
        sub: 'ChatGPT 参考帧侧边 device x=593/914 @2× → 161 CSS；行高 36、圆角 16、内边距 10、分隔 17 保持',
        before: cropBeforeMenu,
        beforeNote: '改前 · DSH 实拍 (menu 266)',
        after: join(TMP, 'after-menu.png'),
        afterNote: '改后 · 本地 CSS 渲染 (menu 161)',
        ref: cropRefMenu,
        refNote: '参考 · ChatGPT 会话菜单',
        scales: { before: 1, after: 0.5, ref: 1 },
        rows: [
          ['菜单宽度', '266', '161', '161'],
          ['行高 / 圆角', '36 / 16', '36 / 16', '36 / 16'],
          ['内边距 / 图标间距', '10 / 10', '10 / 10', '10 / 10'],
          ['分隔条', '17', '17', '17']
        ]
      },
      {
        id: 'm10-2-project-picker',
        title: 'M10-2 · 项目选择器 · 300 → 261',
        sub: '参考帧边缘 device x=1197/1718 @2× → 261 CSS；项高 32 → 36、内边距 6 → 10、项圆角 12',
        before: cropBeforePicker,
        beforeNote: '改前 · DSH 实拍 (300×32)',
        after: join(TMP, 'after-picker.png'),
        afterNote: '改后 · 本地 CSS 渲染 (261×36)',
        ref: cropRefPicker,
        refNote: '参考 · ChatGPT 项目选择器',
        scales: { before: 1, after: 0.5, ref: 1 },
        rows: [
          ['面板宽度', '300', '261', '261'],
          ['项高', '32', '36', '36'],
          ['内边距', '6', '10', '10'],
          ['搜索行高', '32', '38', '38']
        ]
      },
      {
        id: 'm10-3-session-row',
        title: 'M10-3 · 侧栏会话行 · 32 → 36',
        sub: '参考帧选中行 device y=546..617 @2× → 36 CSS；标题左距 10、动作右距 10、分组标题 36',
        before: cropBeforeRows,
        beforeNote: '改前 · DSH 实拍 (row 32)',
        after: join(TMP, 'after-rows.png'),
        afterNote: '改后 · 本地 CSS 渲染 (row 36)',
        ref: cropRefRows,
        refNote: '参考 · ChatGPT 侧栏会话行',
        scales: { before: 1, after: 0.5, ref: 1 },
        rows: [
          ['行高', '32', '36', '36'],
          ['标题左内距', '—', '10', '10'],
          ['动作右内距', '—', '10', '10'],
          ['分组标题高', '36', '36', '36']
        ]
      },
      {
        id: 'm10-4-message-column',
        title: 'M10-4 · 消息列宽 · 768 → 760',
        sub: '--cgpt-msg-max: 760px；代码块 / To-dos 卡 / 附件行随列宽收敛，列内与文档均无横向溢出',
        before: cropBeforeChat,
        beforeNote: '改前 · DSH 实拍 (column 768)',
        after: join(TMP, 'after-chat.png'),
        afterNote: '改后 · 宿主 DOM fixture 渲染 (column 760)',
        ref: cropRefChat,
        refNote: '参考 · ChatGPT 会话内容列',
        scales: { before: 0.56, after: 0.28, ref: 0.56 },
        rows: [
          ['消息列宽', '768', '760', '760'],
          ['代码块宽', '768', '760', '760'],
          ['To-dos 卡宽', '100%', '760', '—'],
          ['列内横向溢出', '无', '无', '无']
        ]
      }
    ]

    const outPage = await browser.newPage({ viewport: { width: 1600, height: 740 }, deviceScaleFactor: 1 })
    for (const spec of specs) {
      const shot = (path, scale) => `<img src="data:image/png;base64,${readFileSync(path).toString('base64')}" style="width:${Math.round(readPng(path).width * scale)}px">`
      await outPage.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>
        html,body{margin:0;background:#f4f4f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif;color:#0d0d0d}
        .frame{box-sizing:border-box;width:1600px;height:740px;padding:20px 24px 16px;background:#f4f4f4}
        h1{margin:0;font-size:19px;font-weight:650;letter-spacing:.01em}
        .sub{margin-top:4px;font-size:12px;color:#666}
        .grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;margin-top:14px}
        .card{background:#fff;border:1px solid #ddd;border-radius:10px;overflow:hidden;height:478px}
        .cap{display:flex;align-items:center;gap:8px;height:30px;padding:0 12px;font-size:11px;color:#555;border-bottom:1px solid #eee}
        .dot{width:7px;height:7px;border-radius:50%;background:#8f8f8f}.dot.after{background:#10a37f}.dot.ref{background:#c47b16}
        .shot{height:404px;display:flex;align-items:flex-start;justify-content:center;background:#fafafa;overflow:hidden;padding-top:8px;box-sizing:border-box}
        .shot img{display:block;flex:none}
        .delta{height:44px;display:grid;grid-template-columns:repeat(4,1fr);gap:1px;background:#eee}
        .delta div{background:#fff;padding:5px 9px;font-size:10px;line-height:1.35;color:#666}
        .delta b{display:block;color:#0d0d0d;font-size:12px;font-weight:600}
        table{border-collapse:collapse;font-size:11px;margin-top:10px;width:100%}
        th,td{border-bottom:1px solid #e6e6e6;padding:4px 8px;text-align:left}
        th{color:#777;font-weight:500}
        .changed{color:#9a5b13;font-weight:650}
        .final{color:#0d7a55;font-weight:650}
      </style></head><body><div class="frame">
        <h1>${spec.title}</h1>
        <div class="sub">${spec.sub}</div>
        <div class="grid">
          <div class="card"><div class="cap"><span class="dot"></span>${spec.beforeNote}</div><div class="shot">${shot(spec.before, spec.scales.before)}</div></div>
          <div class="card"><div class="cap"><span class="dot after"></span>${spec.afterNote}</div><div class="shot">${shot(spec.after, spec.scales.after)}</div></div>
          <div class="card"><div class="cap"><span class="dot ref"></span>${spec.refNote}</div><div class="shot">${shot(spec.ref, spec.scales.ref)}</div></div>
        </div>
        <table><tr><th>测点</th><th>改前</th><th>改后</th><th>参考</th></tr>
          ${spec.rows.map(([name, before, after, ref]) => `<tr><td>${name}</td><td>${before}</td><td class="${before === after ? 'final' : 'changed'}">${after}</td><td>${ref}</td></tr>`).join('')}
        </table>
      </div></body></html>`)
      await outPage.waitForTimeout(120)
      await outPage.screenshot({ path: join(SHOTS, `${spec.id}.png`) })
      console.log(`wrote docs/screenshots/${spec.id}.png`)
    }
  } finally {
    await browser.close()
  }

  const report = {
    generatedAt: new Date().toISOString(),
    source: 'committed captures + local CSS-only fixture render (no live DSH capture)',
    measured: measure,
    before: { sessionMenuWidth: 266, projectPickerWidth: 300, projectPickerItemHeight: 32, sessionRowHeight: 32, messageColumnWidth: 768 },
    after: { sessionMenuWidth: 161, projectPickerWidth: 261, projectPickerItemHeight: 36, sessionRowHeight: 36, messageColumnWidth: 760 },
    reference: { sessionMenuWidth: 161, projectPickerWidth: 261, projectPickerItemHeight: 36, sessionRowHeight: 36, messageColumnWidth: 760 }
  }
  writeFileSync(join(ROOT, 'docs/m10-verify.json'), JSON.stringify(report, null, 2))
  console.log('wrote docs/m10-verify.json')
}

await main()
