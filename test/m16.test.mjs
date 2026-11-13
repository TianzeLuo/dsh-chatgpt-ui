#!/usr/bin/env node
/**
 * P0-5 acceptance — sidebar / rail / project list / pasted-image spacing /
 * settings accent. Reads docs/m16.json (live measurements) and cross-checks the
 * shipped fragments so the JSON cannot drift away from the implementation.
 *
 * Run: node test/m16.test.mjs
 */
import { exists, read, skipSuite } from './evidence.mjs'
skipSuite(import.meta.url)

let failures = 0
let checks = 0
const check = (name, condition, detail) => {
  checks += 1
  if (condition) return
  failures += 1
  console.log(`FAIL  ${name}${detail === undefined ? '' : ` — ${detail}`}`)
}
const doc = JSON.parse(read('docs/m16.json'))
const railJs = read('lib/client/rail.js')
const sessionsJs = read('lib/client/sessions.js')
const themeJs = read('lib/client/theme.js')
const tokens = read('lib/client/css/05-cgpt-tokens.css')
const sidebarCss = read('lib/client/css/25-sessions.css')
const composerCss = read('lib/client/css/40-composer.css')
const projectCss = read('lib/client/css/35-project.css')
const darkTokens = read('lib/client/css/06-cgpt-tokens-dark.css')

// 1. Evidence covers all six work items, with reference → implementation.
{
  check('six work items documented', Array.isArray(doc.items) && doc.items.length === 6)
  check('every item has reference and implementation', doc.items.every((item) => typeof item.reference === 'string' && typeof item.implementation === 'string'))
  check('ids cover green/attachment/rail/scrollbar/collapse/project-list', doc.items.map((item) => item.id).join(',') === '1-settings-green,2-attachment-spacing,3-rail-selection,4-sidebar-scrollbar-gap,5-project-collapse,6-project-list')
}

// 2. Settings accent: native neutral, plugin green removed.
{
  const { native, before, after } = doc.settings
  check('native skin-off has zero green elements', native.greenElementCount === 0 && native.brandPrimary === '#0f1115')
  check('old plugin accent was green', before.brandPrimary === '#10a37f' && before.greenElementCount > 0 && before.activeRowBorder === 'rgb(16, 163, 127)')
  check('fixed settings has zero green elements', after.greenElementCount === 0)
  check('fixed selected row is host neutral', after.activeRowBorder === 'rgb(15, 17, 21)' && after.activeDot.background === 'rgb(15, 17, 21)')
  check('fixed web-search choice is host neutral', after.regionBorder === 'rgb(15, 17, 21)' && after.regionColor === 'rgb(15, 17, 21)')
  check('focus ring follows the host brand', after.focusRing === '#0f1115' && tokens.includes('--cgpt-focus-ring: var(--dsw-alias-brand-primary)'))
  check('accent token follows the host brand', tokens.includes('--cgpt-accent: var(--dsw-alias-brand-primary)'))
  check('theme no longer overrides the brand with green', !themeJs.includes('#10a37f') && !themeJs.includes('--dsw-alias-brand-primary'))
  check('skin manifest accent is not green', !read('skin.json').includes('#10a37f') && read('skin.json').includes('"accent": "#0f1115"'))
  check('dark token defines readable on-accent text', darkTokens.includes('--cgpt-text-on-accent: #0d0d0d'))
}

// 3. Pasted-image spacing: 8px single, 8px row gap when wrapping.
{
  const { before, after, multi } = doc.attachment
  check('before gap was negative', before.gapPx === -6 && before.flexWrap === 'nowrap')
  check('single image gap is >= 8px', after.gapPx >= 8 && after.gapPx === 8)
  check('single image margin is 8px', after.outerMarginBottom === '8px')
  check('thumbnails wrap instead of clipping', after.flexWrap === 'wrap')
  check('multi-image row gap is 8px', multi.rowGapPx === 8 && multi.rows === 2)
  check('multi-image outer block to editor is 8px', multi.outerBottomToEditorPx === 8)
  check('Chat mode is 6px card gap + 2px margin', doc.attachment.chatMode.sumPx === 8)
  check('composer CSS declares the 8px attachment spacing', composerCss.includes('margin-bottom: 8px') && composerCss.includes('row-gap: 8px') && composerCss.includes('min-height: 64px'))
}

// 4. Rail: four destinations keep a filled selected state on their real page.
{
  const selected = doc.rail.selected
  check('four destination states captured', selected.length === 4 && selected.map((item) => item.id).join(',') === 'projects,agent,plugins,more')
  check('every destination exposes data-selected=true', selected.every((item) => item.dataSelected === 'true' && item.state === 'selected'))
  check('every destination paints the filled glyph', selected.every((item) => item.glyphState === 'filled'))
  check('every destination uses the 首页 highlight', selected.every((item) => item.background === 'rgb(236, 236, 236)'))
  check('each destination keeps its own page open', doc.rail.selected[0].projectOpen === true && doc.rail.selected[1].agentPanel === true && doc.rail.selected[2].pageText === 'Plugins' && doc.rail.selected[3].menuOpen === true)
  check('project selection derives from the project overlay', doc.rail.projectSelectionSource === 'body[data-cgpt-project-open]' && railJs.includes('data-cgpt-project-open'))
  check('other rail destinations close the project overlay', railJs.includes('chatgptCloseProjectPage()') && doc.rail.selected[0].projectOpen === true)
  check('schedules is now a primary rail panel (P0-10A)', railJs.includes("id: 'schedules'") && /id: 'schedules'[^\n]*kind: 'panel'/.test(railJs))
  check('rail renders data-selected and filled glyphs', railJs.includes("'data-selected': active ? 'true' : undefined") && railJs.includes("'data-cgpt-rail-glyph-state'"))
}

// 5. Sidebar gutter: 22px native-ish gap becomes 4px visual gap.
{
  const { before, after } = doc.project.sidebar
  check('before sidebar gap was 22px', before.paddingRightPx === 22 && before.visualGapPx === 22)
  check('after content padding is 8px', after.paddingRightPx === 8)
  check('after visual gap is within 4–8px', after.visualGapPx >= 4 && after.visualGapPx <= 8)
  check('scrollbar overlays without reserving a gutter', after.scrollOffsetWidth === after.scrollClientWidth)
  check('sidebar CSS carries the 8px padding', sidebarCss.includes('padding: 0 8px 8px 0'))
}

// 6. Project group header only owns list visibility; child state is independent.
{
  const collapse = doc.project.collapse
  check('heading hides the whole list', collapse.afterHeading.visible === 'false' && collapse.afterHeading.headingAria === 'false' && collapse.afterHeading.projectCount === 0)
  check('heading hide does not rewrite child state', JSON.stringify(collapse.afterHeading.expanded) === JSON.stringify(collapse.afterProject.expanded))
  check('single project collapse only flips that project', collapse.afterProject.expanded.ws_m16_alpha === false && collapse.afterProject.expanded.ws_m16_beta === true)
  check('sibling project keeps its state', collapse.afterProject.projectAria.join(',') === 'false,true')
  check('heading stays open while a project is collapsed', collapse.afterProject.headingAria === 'true')
  check('reopen restores the same child states', collapse.afterReopen.projectAria.join(',') === 'false,true')
  check('refresh keeps per-project state', doc.project.persistence.afterReload.projectAria.join(',') === 'false,true' && doc.project.persistence.afterReload.expanded.ws_m16_alpha === false)
  check('refresh keeps the hidden section', doc.project.persistence.afterHideReload.visible === 'false' && doc.project.persistence.afterHideReload.projectCount === 0)
  check('visibility has its own storage key', sessionsJs.includes('CHATGPT_PROJECTS_VISIBLE_KEY') && sessionsJs.includes('chatgptWriteProjectsVisible'))
  check('heading toggle only writes visibility', /const toggleProjects = \(\) => \{[\s\S]*?chatgptWriteProjectsVisible/.test(sessionsJs))
}

// 7. Project list structure and context menu.
{
  const { heading, row, menu } = doc.project
  check('group header keeps the pencil visible', heading.pencilOpacity === 1 && heading.heading === undefined)
  check('group header has title and 36px row', heading.title === '收起项目列表' && heading.box[3] === 36)
  check('project rows are 36px with hover ⋯', row.heightPx === 36 && row.hoverMoreOpacity === 1)
  check('project rows use an 18px chevron and 16px folder', row.chevronPx === 18 && row.folderPx === 16)
  check('project chevron points down when open and right when closed', row.expandedChevron === 'down' && row.collapsedChevron === 'right')
  check('chevron is gone from project rows (P0-10A)', !projectCss.includes('chatgpt-project-toggle') && !projectCss.includes('chatgpt-project-chevron'))
  check('context menu is the compact 252px card', menu.box[2] === 252 && menu.box[3] === 155)
  check('context menu has title / chat count / path', menu.card === 'ChatGPT UI' && menu.meta === '1 次聊天' && menu.path === '/mnt/f/project/tools/plugin/dsh-chatgpt-ui')
  check('context menu main view is path + 编辑项目', menu.mainItems.join(',') === '/mnt/f/project/tools/plugin/dsh-chatgpt-ui,编辑项目')
  check('path row opens the project page', menu.pathClickOpensProject === true && menu.railSelectedAfterPathClick === 'true')
  check('edit submenu keeps 返回/重命名/新建/移到最前/删除', menu.editItems.includes('返回') && menu.editItems.includes('重命名项目') && menu.editItems.includes('在此项目中新建聊天') && menu.editItems.includes('移到最前') && menu.editItems.includes('删除项目'))
  check('sessions fragment renders the project menu card', sessionsJs.includes('chatgpt-project-menu-card') && sessionsJs.includes('chatgpt-project-menu-path') && sessionsJs.includes("action: 'edit-project'"))
}

// 8. Assertions and screenshots are present.
{
  check('all seven assertions pass', doc.assertions.every((item) => item.pass === true))
  const missing = doc.screenshots.map(([path]) => path).filter((path) => !exists(path))
  check('every evidence screenshot exists', missing.length === 0, missing.join(','))
}

if (failures > 0) {
  console.log(`FAIL  ${checks - failures}/${checks} P0-5 acceptance checks passed`)
  process.exit(1)
}
console.log(`PASS  ${checks}/${checks} P0-5 acceptance checks passed`)
