#!/usr/bin/env node
/**
 * P0-8 contract: the reasoning slider is a 100% × 30 pill with four 4px stops,
 * a 34px perfect white circle, a three-stop #4F6BFF → #A855F7 → #7C3AED top
 * tier with 14 star specks, 16/600 effort names (purple at the top), 14/400
 * model names, and the reset on the first text line.
 *
 * The circle check is deliberately about `corner-shape` as well as
 * `border-radius`: the Host theme paints `superellipse(1.5)` on `*`, which
 * turns a 50% radius into a squircle. The evidence group reads
 * docs/capture/slider-dom.json (three tiers × both themes) and the 4× thumb
 * crops in docs/screenshots/.
 *
 * Run: node test/m19.test.mjs
 */
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { read, exists, size, skipSuite } from './evidence.mjs'
skipSuite(import.meta.url)

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

const composer = read('lib/client/composer.js')
const core = read('lib/shared/composer-core.mjs')
const css = read('lib/client/css/65-work-card.css')
const bundle = read('lib/client.js')
const evidence = JSON.parse(read('docs/capture/slider-dom.json'))
const packageJson = JSON.parse(read('package.json'))

let checks = 0
let failures = 0
const check = (name, condition, detail) => {
  checks += 1
  if (condition) return
  failures += 1
  console.log(`FAIL  ${name}${detail === undefined ? '' : ` — ${detail}`}`)
}

// 1. Source: the circle cannot be a squircle any more.
check('css: the thumb is 34×34', /\.chatgpt-effort-thumb \{[^}]*width: 34px[^}]*height: 34px/.test(css))
check('css: the thumb radius is 50%', /\.chatgpt-effort-thumb \{[^}]*border-radius: 50%/.test(css))
check('css: the thumb opts out of the host squircle', /body\[data-chatgpt-ui\] :is\([\s\S]*?\.chatgpt-effort-thumb[\s\S]*?\)\s*\{\s*corner-shape: round;/.test(css))
check('css: the thumb is flex: 0 0 34px (never stretched)', /\.chatgpt-effort-thumb \{[^}]*flex: 0 0 34px/.test(css))
check('css: the thumb has no border', /\.chatgpt-effort-thumb \{[^}]*border: 0;/.test(css))
check('css: the thumb is centred on the 30px track with top -2px', /\.chatgpt-effort-thumb \{[^}]*top: -2px/.test(css))
check('css: the track is 100% wide, 30 high, 15px rounded', /\.chatgpt-effort-track \{[^}]*width: 100%[^}]*height: 30px[^}]*border-radius: 15px/.test(css))
check('css: the fill is 30 high and 15px rounded', /\.chatgpt-effort-fill \{[^}]*height: 30px[^}]*border-radius: 15px/.test(css))
check('css: the top fill is the three-stop gradient', css.includes("chatgpt-effort-fill[data-max='true']") && css.includes('linear-gradient(90deg, var(--cgpt-effort-max-a) 0%, var(--cgpt-effort-max-b) 52%, var(--cgpt-effort-max-c) 100%)'))
check('css: gradient stops are #4F6BFF/#A855F7/#7C3AED', css.includes('--cgpt-effort-max-a: #4f6bff') && css.includes('--cgpt-effort-max-b: #a855f7') && css.includes('--cgpt-effort-max-c: #7c3aed'))
check('css: light gradient is paler', css.includes('--cgpt-effort-max-a: #6e84ff') && css.includes('--cgpt-effort-max-b: #b57bf6') && css.includes('--cgpt-effort-max-c: #8b5cf6'))
check('css: star layer clips to the track', /\.chatgpt-effort-stars \{[^}]*overflow: hidden[^}]*border-radius: 15px/.test(css))
check('css: star dots are round white 1–2px', /\.chatgpt-effort-star \{[^}]*border-radius: 50%[^}]*background: var\(--cgpt-effort-thumb\)/.test(css))
check('css: ticks are 4px, selected 50% white', /\.chatgpt-effort-tick \{[^}]*width: 4px[^}]*height: 4px[^}]*border-radius: 50%/.test(css) && /\.chatgpt-effort-tick\[data-selected='true'\] \{[^}]*opacity: 0.5/.test(css))
check('css: the effort name is 16px/600', /\.chatgpt-effort-choice-name \{[^}]*font-size: 16px[^}]*font-weight: 600/.test(css))
check('css: the top name is purple', /\.chatgpt-effort-choice-name\[data-max='true'\] \{[^}]*color: var\(--cgpt-effort-accent-max\)/.test(css))
check('css: the model line is 14px/400', /\.chatgpt-effort-choice-model \{[^}]*font-size: 14px[^}]*font-weight: 400/.test(css))
check('css: the reset starts on the first text line', /\.chatgpt-effort-head \{[^}]*align-items: start/.test(css) && /\.chatgpt-effort-reset \{[^}]*align-self: start/.test(css))
check('css: the panel keeps the 12/16/16 rhythm inside an 8px overlay inset and 16px corners', /\.chatgpt-model-simple \{[^}]*padding: 4px 8px 8px/.test(css) && /\.chatgpt-effort-menu \{[^}]*border-radius: var\(--cgpt-overlay-radius\)/.test(css))
check('core: geometry is 248 / 17 / 34', core.includes('const CHATGPT_EFFORT_TRACK = 248') && core.includes('const CHATGPT_EFFORT_INSET = 17') && core.includes('const CHATGPT_EFFORT_THUMB = 34'))
check('core: the top fill covers the whole track', core.includes('if (Number.isFinite(length) && length > 1 && index >= length - 1) return CHATGPT_EFFORT_TRACK'))
check('composer: 14 star specks', /const CHATGPT_EFFORT_STARS = \[[\s\S]*?\]/.test(composer) && (composer.match(/\{ x: \d+, y: \d+, s: [12], o: [\d.]+ \}/g) ?? []).length === 14)
check('composer: stars render only at the top tier', composer.includes("'data-cgpt-effort-stars': ''") && composer.includes('maxEffort') && composer.includes('CHATGPT_EFFORT_STARS.map'))
check('composer: the name carries data-max', composer.includes("'data-max': maxEffort ? 'true' : 'false'"))
check('composer: ticks are centred with a 2px offset', composer.includes('tick.x - 2'))
check('bundle: the built client carries the fix', bundle.includes('chatgpt-effort-star') && bundle.includes('corner-shape: round') && bundle.includes('width: 34px'))

// 2. Evidence: three tiers × both themes.
for (const theme of ['dark', 'light']) {
  const frame = evidence.themes?.[theme]
  check(`evidence: ${theme} has low/mid/max`, ['low', 'mid', 'max'].every((tier) => frame?.tiers?.[tier] !== undefined))
  for (const tier of ['low', 'mid', 'max']) {
    const state = frame?.tiers?.[tier]
    if (state === undefined) continue
    check(`evidence: ${theme}/${tier} thumb is 34×34`, state.thumb.rect.w === 34 && state.thumb.rect.h === 34, JSON.stringify(state.thumb?.rect))
    check(`evidence: ${theme}/${tier} thumb radius is 50%`, state.thumb.style['border-radius'] === '50%')
    check(`evidence: ${theme}/${tier} thumb paints round, not the host squircle`, ['round', 'superellipse(1)'].includes(state.thumb.style['corner-shape']), state.thumb.style['corner-shape'])
    check(`evidence: ${theme}/${tier} thumb is white, borderless`, state.thumb.style['background-color'] === 'rgb(255, 255, 255)' && state.thumb.style['border-top-width'] === '0px')
    check(`evidence: ${theme}/${tier} thumb flex 0 0 34px`, /0 0 34px/.test(state.thumb.style.flex))
    check(`evidence: ${theme}/${tier} track is 248×30`, state.track.rect.w === 248 && state.track.rect.h === 30, JSON.stringify(state.track?.rect))
    check(`evidence: ${theme}/${tier} four 4px ticks`, state.ticks.length === 4 && state.ticks.every((tick) => tick.rect.w === 4 && tick.rect.h === 4))
    check(`evidence: ${theme}/${tier} text sizes`, state.name.style['font-size'] === '16px' && state.name.style['font-weight'] === '600' && state.model.style['font-size'] === '14px' && state.model.style['font-weight'] === '400')
    check(`evidence: ${theme}/${tier} reset shares the first line`, state.reset.alignedWithName === true && state.reset.rightFromPanel === 16, JSON.stringify(state.reset))
    check(`evidence: ${theme}/${tier} panel is 280 / 20 / 12-16-16`, state.menu.rect.w === 280 && state.menu.style['border-radius'] === '20px' && state.simple.style.padding === '12px 16px 16px')
    if (tier === 'max') {
      check(`evidence: ${theme} top fill has the gradient`, state.fill.max === 'true' && (state.fill.style['background-image'] ?? '').includes('gradient'))
      check(`evidence: ${theme} top name is purple`, state.name.style.color === (theme === 'dark' ? 'rgb(192, 132, 252)' : 'rgb(147, 51, 234)'))
      check(`evidence: ${theme} star layer has ≥12 dots`, state.stars.count >= 12 && state.stars.layer !== null && state.stars.dots.every((dot) => dot.rect.w >= 1 && dot.rect.w <= 2), `${state.stars.count}`)
    } else {
      check(`evidence: ${theme}/${tier} normal name is blue`, state.name.style.color === 'rgb(76, 141, 255)')
    }
  }
  check(`evidence: ${theme} assertions all pass`, (frame?.assertionSummary?.failed ?? []).length === 0, JSON.stringify(frame?.assertionSummary))
}

// 3. The diagnosis points at the host rule that actually painted the thumb.
check('diagnosis: corner-shape is named as the cause', evidence.diagnosis?.cause?.property === 'corner-shape')
check('diagnosis: the host sheet is recorded', /dsh-client-ui-theme\/corner-shape\.css/.test(evidence.diagnosis?.cause?.hostSheet ?? ''))
check('diagnosis: the universal host selector is recorded', evidence.diagnosis?.cause?.hostSelector?.includes('*'))
check('diagnosis: superellipse(1.5) is recorded', /superellipse\(1\.5\)/.test(evidence.diagnosis?.cause?.rootVariable ?? ''))
check('diagnosis: the fix is our scoped corner-shape: round', evidence.diagnosis?.fix?.file === 'lib/client/css/65-work-card.css' && evidence.diagnosis?.fix?.declaration === 'corner-shape: round' && evidence.diagnosis?.fix?.matched === true)

// 4. Screenshots: both themes × normal/max, plus 4× thumb crops.
for (const name of [
  'm19-slider-dark-default.png', 'm19-slider-dark-max.png',
  'm19-slider-light-default.png', 'm19-slider-light-max.png',
  'm19-slider-thumb-dark-4x.png', 'm19-slider-thumb-dark-default-4x.png',
  'm19-slider-thumb-light-4x.png', 'm19-slider-thumb-light-default-4x.png'
]) {
  check(`screenshots: ${name} exists`, exists(`docs/screenshots/${name}`) && size(`docs/screenshots/${name}`) > 2000)
}

// 5. Wiring.
check('wiring: npm test runs m19', packageJson.scripts?.test === 'node scripts/run-tests.mjs' && read('scripts/run-tests.mjs').includes("'m19.test.mjs'"))
check('wiring: npm run check parses the capture script', /node --check scripts\/m19-slider\.mjs/.test(packageJson.scripts?.check ?? ''))

if (failures > 0) {
  console.log(`\n${failures}/${checks} checks failed`)
  process.exitCode = 1
} else {
  console.log(`m19: ${checks} checks passed`)
}
