#!/usr/bin/env node
/**
 * Module 8 source/evidence contract: theme audit, contrast, responsive
 * matrices, collapse/density, focus/motion, DPR/fonts.
 *
 * The live probes live in scripts/theme-audit.mjs and
 * scripts/check-responsive.mjs; this test validates their committed evidence
 * and the source rules that keep them honest.
 *
 * Run: node test/module8.test.mjs
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (path) => readFileSync(join(ROOT, path), 'utf8')
const exists = (path) => existsSync(join(ROOT, path))
const json = (path) => JSON.parse(read(path))
const tokens = read('lib/client/css/05-cgpt-tokens.css')
const darkTokens = read('lib/client/css/06-cgpt-tokens-dark.css')
const composer = read('lib/client/css/40-composer.css')
const projects = read('lib/client/css/35-project.css')
const work = read('lib/client/css/65-work-card.css')
const hero = read('lib/client/css/60-hero.css')
const sessions = read('lib/client/css/25-sessions.css')
const search = read('lib/client/css/75-search.css')
const trigger = read('lib/client/css/72-trigger.css')
const a11y = read('lib/client/css/85-a11y.css')
const entry = read('lib/client/entry.js')
const client = read('lib/client.js')
const audit = json('docs/theme-audit.json')
const responsive = json('docs/responsive-audit.json')
const motion = read('docs/motion.md')
const pkg = JSON.parse(read('package.json'))
const build = read('scripts/build-client.mjs')

let checks = 0
let failures = 0
const check = (name, condition, detail = '') => {
  checks += 1
  if (condition) return
  failures += 1
  console.log(`FAIL  ${name}${detail === '' ? '' : ` — ${detail}`}`)
}

// 1. Committed evidence and schema.
check('theme audit exists', exists('docs/theme-audit.json'))
check('responsive audit exists', exists('docs/responsive-audit.json'))
check('motion report exists', exists('docs/motion.md'))
check('audit covers both themes', audit.meta.themes.join(',') === 'light,dark')
check('audit has at least 14 controls', audit.meta.controlCount >= 14, String(audit.meta.controlCount))
check('audit records every control twice', audit.controls.length === audit.meta.controlCount * 2, String(audit.controls.length))
check('audit has no token mismatches', audit.controls.every((row) => row.match === true) && audit.controls.every((row) => row.expected !== undefined && row.actual !== undefined && row.fields !== undefined))
check('audit issue list is empty', Array.isArray(audit.issues) && audit.issues.length === 0)
check('audit records the fixed issues', Array.isArray(audit.fixes) && audit.fixes.length >= 10 && audit.fixes.every((row) => row.status === '已修'))
check('audit records retained differences with reasons', Array.isArray(audit.knownDifferences) && audit.knownDifferences.length >= 3 && audit.knownDifferences.every((row) => row.status.startsWith('保留') && typeof row.detail === 'string' && row.detail.length > 0))
const requiredControls = ['rail', 'sidebarRow', 'groupTitle', 'bubble', 'codeBlock', 'processRow', 'toolRow', 'modelPill', 'effortTrack', 'menu', 'popover', 'toast', 'scrollbar', 'focusRing']
check('audit covers rail/sidebar/group/bubble/code/process/tool/pill', requiredControls.slice(0, 8).every((id) => audit.controls.some((row) => row.control === id)))
check('audit covers effort/menu/popover/toast/scroll/focus', requiredControls.slice(8).every((id) => audit.controls.some((row) => row.control === id)))
check('audit also covers composer and mode segment', audit.controls.some((row) => row.control === 'composer') && audit.controls.some((row) => row.control === 'modeSegment'))

// 2. Contrast: no failure, thresholds and explicit repaired values.
check('contrast has light and dark rows', audit.contrast.some((row) => row.theme === 'light') && audit.contrast.some((row) => row.theme === 'dark'))
check('all contrast rows pass', audit.contrast.every((row) => row.match === true && row.ratio >= row.threshold))
check('body text is 4.5:1', audit.contrast.filter((row) => row.id === 'text.primary').every((row) => row.threshold === 4.5 && row.ratio >= 4.5))
check('secondary text is at least 3:1', audit.contrast.filter((row) => row.id === 'text.secondary').every((row) => row.threshold === 3 && row.ratio >= 3))
check('placeholder is 4.5:1', audit.contrast.filter((row) => row.id === 'text.placeholder').every((row) => row.threshold === 4.5 && row.ratio >= 4.5))
check('disabled control is 4.5:1', audit.contrast.filter((row) => row.id === 'text.disabled').every((row) => row.threshold === 4.5 && row.ratio >= 4.5))
check('disabled picker/menu/dialog pass 4.5:1', ['text.disabled.picker', 'text.disabled.dialog', 'text.disabled.menu'].every((id) => audit.contrast.filter((row) => row.id === id).every((row) => row.ratio >= 4.5)))
check('disabled states use explicit colours, not low opacity', !/opacity:\s*0\.(45|42|62)/.test(sessions + projects))
check('focus ring is at least 3:1', audit.contrast.filter((row) => row.id === 'focus.ring').every((row) => row.threshold === 3 && row.ratio >= 3))
check('light placeholder token fixes 3.15:1', tokens.includes('--cgpt-text-placeholder: #767676'))
check('dark placeholder token exists', darkTokens.includes('--cgpt-text-placeholder: #afafaf'))
check('light tool text is 4.5:1 on 240', tokens.includes('--cgpt-work-tool-fg: #6b6b6b'))
check('disabled send text token is #5d5d5d', tokens.includes('--cgpt-send-disabled-fg: #5d5d5d'))
check('Chat disabled send opacity is at least .92', /:disabled\s*\{[^}]*opacity:\s*0\.92;/.test(composer))
check('Work send uses a white glyph', work.includes('color: var(--cgpt-work-send-fg);') && tokens.includes('--cgpt-work-send-fg: #ffffff;') && darkTokens.includes('--cgpt-work-send-fg: #ffffff;'))

// 3. Theme surfaces: no dead-white dark surface, visible light borders.
const darkRows = audit.controls.filter((row) => row.theme === 'dark')
check('dark has no white control surface', darkRows.every((row) => !Object.values(row.actual).some((value) => value && typeof value === 'object' && value.background === 'rgb(255, 255, 255)')))
check('dark composer is #212121', darkRows.find((row) => row.control === 'composer')?.actual.background === 'rgb(33, 33, 33)')
check('dark menu is opaque #2f2f2f', darkRows.find((row) => row.control === 'menu')?.actual.background === 'rgb(47, 47, 47)')
check('dark tool row is not a light grey box', darkRows.find((row) => row.control === 'toolRow')?.actual.background === 'rgb(27, 27, 27)')
check('light composer border is explicit', audit.controls.find((row) => row.theme === 'light' && row.control === 'composer')?.actual.border === 'rgb(227, 227, 227)')
check('light menu border is explicit', audit.controls.find((row) => row.theme === 'light' && row.control === 'menu')?.actual.border === 'rgba(0, 0, 0, 0.1)')
// P0-13: the dark menu surface is the measured one — the product's own
// #212121 at 90% over an 8px backdrop blur — not the old opaque #2b2b2b.
check('dark menu is the measured translucent surface', darkTokens.includes('--cgpt-menu-bg: rgba(33, 33, 33, 0.9);') && darkTokens.includes('--cgpt-session-menu-bg: var(--cgpt-menu-bg);') && tokens.includes('--cgpt-menu-blur: 8px;'))
check('light mode never sees a transparent menu border', audit.controls.find((row) => row.theme === 'light' && row.control === 'menu')?.actual.border !== 'rgba(0, 0, 0, 0)')

// 4. Responsive matrix and geometry.
check('responsive probe passes all checks', responsive.meta.fail === 0 && responsive.checks.every((row) => row.pass === true))
check('responsive covers six widths', responsive.meta.widths.join(',') === '640,768,900,1024,1280,1600')
check('rail is constant 52px at every width', responsive.widths.every((row) => Math.abs(row.base.rail.width - 52) < 0.6))
check('no horizontal overflow at any width', responsive.widths.every((row) => row.base.scrollWidth <= row.width + 1))
check('sidebar list follows the 340 track (panel 288 + rail + scrollbar gutter)', responsive.widths.filter((row) => row.base.sidebarVisible).every((row) => Math.abs(row.base.panel.width - 340) < 1 && Math.abs(row.base.sessionScroll.width - 280) < 1))
check('search paints outside a hidden sidebar', /visibility:\s*visible/.test(search) && responsive.widths.every((row) => row.search?.visibility === 'visible'))
check('search is full-width at 640', responsive.widths.find((row) => row.width === 640)?.search?.x === 0 && responsive.widths.find((row) => row.width === 640)?.search?.width === 640)
check('menus stay inside the viewport', responsive.widths.every((row) => row.menu !== null && row.menu.x >= 0 && row.menu.right <= row.width + 1))
check('composer follows the reading column (545 at 640, 806.4 at 1600)', responsive.widths.find((row) => row.width === 640)?.base.card.width === 545 && Math.abs((responsive.widths.find((row) => row.width === 1600)?.base.card.width ?? 0) - 806.39) < 0.5)
check('pill and send do not overlap', responsive.checks.filter((row) => row.name.endsWith('pill and send do not overlap')).every((row) => row.pass))
check('collapsed panel is rail-only', responsive.checks.find((row) => row.name === 'collapsed panel is rail only (<=56px)')?.pass === true)
check('600px height has no document overflow', responsive.checks.find((row) => row.name === '600px: no document overflow')?.pass === true)
check('reduced motion disables empty fade/reveal', responsive.checks.filter((row) => row.name.startsWith('reduced-motion disables')).every((row) => row.pass))
check('DPR 2 and font fallback pass', responsive.checks.filter((row) => row.name.startsWith('DPR 2') || row.name.startsWith('font stack')).every((row) => row.pass))

// 5. Focus and motion source contract.
check('focus ring is 2px', /outline:\s*2px solid var\(--cgpt-focus-ring\)/.test(a11y))
check('focus offset is 2px', /outline-offset:\s*2px/.test(a11y))
check('focus ring uses the host brand token', tokens.includes('--cgpt-focus-ring: var(--dsw-alias-brand-primary)'))
check('keyboard marker is Tab-only and pointer-cleared', entry.includes("event.key === 'Tab'") && entry.includes("setAttribute('data-cgpt-keyboard', 'true')") && entry.includes("removeAttribute('data-cgpt-keyboard')") && entry.includes("addEventListener('pointerdown', onPointer, true)"))
check('composer ring requires keyboard marker', a11y.includes("body[data-chatgpt-ui][data-cgpt-keyboard='true']") && a11y.includes(':has([data-composer-input=\'true\']:focus-visible)'))
check('Work card no longer paints a 3px green autofocus ring', !work.includes('0 0 0 3px var(--dsh-chatgpt-focus-ring)'))
check('no skin rule paints the old 3px focus shadow', !composer.includes('0 0 0 3px var(--dsh-chatgpt-focus-ring)') && !work.includes('0 0 0 3px var(--dsh-chatgpt-focus-ring)'))
check('effort ring is transferred to the track', a11y.includes(':has(.chatgpt-effort-range:focus-visible)'))
check('reduced motion disables empty fade', /prefers-reduced-motion: reduce[\s\S]*_composerHero[\s\S]*animation: none/.test(a11y) && hero.includes('@media (prefers-reduced-motion: reduce)'))
check('reduced motion disables the slider transition', a11y.includes('.chatgpt-effort-fill') && a11y.includes('.chatgpt-effort-thumb') && a11y.includes('transition: none !important'))
check('motion report records 180ms and the slider transition', motion.includes('180ms') && motion.includes('120ms'))
check('motion report records reduced-motion behavior', /reduced-motion/i.test(motion) && motion.includes('关闭'))

// 6. Density, scrollbars, search breakpoint, fonts and build.
check('session scrollbar is thin with a hover colour', sessions.includes('.chatgpt-session-scroll:hover') && sessions.includes('scrollbar-color') && sessions.includes('scrollbar-width: thin'))
check('menu scrollbar has a hover colour', trigger.includes(':hover') && trigger.includes('scrollbar-color'))
check('search scrollbar has a hover colour', search.includes('.chatgpt-search-body:hover') && search.includes('scrollbar-color'))
check('narrow search is edge-to-edge', /@media \(max-width: 640px\)[\s\S]*width: 100vw;[\s\S]*max-width: 100vw;/.test(search) && /@media \(max-width: 640px\)[\s\S]*border-left: 0;[\s\S]*border-right: 0;/.test(search))
check('search modal keeps 720px default', search.includes('width: min(720px, calc(100vw - 32px))'))
check('font token has Latin and CJK fallbacks', tokens.includes('--cgpt-font-body:') && /PingFang SC/.test(tokens) && /Microsoft YaHei/.test(tokens))
check('DPR 2 shape rendering rule exists', a11y.includes('shape-rendering: geometricPrecision'))
check('85-a11y stylesheet is in the build', build.includes("'85-a11y.css'") || readdirSync(join(ROOT, 'lib/client/css')).filter((name) => name.endsWith('.css')).length === 19)
check('stylesheet directory has 19 files', readdirSync(join(ROOT, 'lib/client/css')).filter((name) => name.endsWith('.css')).length === 19, String(readdirSync(join(ROOT, 'lib/client/css')).filter((name) => name.endsWith('.css')).length))
check('client bundle contains the keyboard marker code', client.includes('data-cgpt-keyboard'))

// 7. Evidence files and package wiring.
for (const width of [640, 768, 900, 1024, 1280, 1600]) {
  for (const theme of ['light', 'dark']) {
    const path = `docs/screenshots/m8-${width}-${theme}.png`
    check(`matrix ${width}/${theme} exists`, exists(path) && statSync(join(ROOT, path)).size > 5000, path)
  }
}
check('collapsed screenshot exists', exists('docs/screenshots/m8-collapsed-light.png'))
check('600px screenshot exists', exists('docs/screenshots/m8-height600-light.png'))
check('DPR2 screenshot exists', exists('docs/screenshots/m8-dpr2-dark.png'))
check('reduced-motion screenshot exists', exists('docs/screenshots/m8-reduced-motion-light.png'))
check('module 8 test is in npm test', pkg.scripts.test.includes('test/module8.test.mjs'))
check('module 8 test runs before native parity', pkg.scripts.test.indexOf('test/module8.test.mjs') < pkg.scripts.test.indexOf('test/native-parity.test.mjs'))
check('theme audit script is syntax-checked', pkg.scripts.check.includes('scripts/theme-audit.mjs'))
check('responsive script is syntax-checked', pkg.scripts.check.includes('scripts/check-responsive.mjs'))

console.log(`module8: ${checks - failures}/${checks} checks passed`)
if (failures > 0) process.exitCode = 1
