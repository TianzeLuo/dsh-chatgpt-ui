#!/usr/bin/env node
/**
 * Work composer test (Phase 4B).
 *
 * Two layers:
 *   1. `lib/shared/composer-core.mjs` — the effort/approval policy, called the
 *      way the fragment calls it, against a catalog shaped like the host's.
 *   2. The built bundle and the stylesheets — the three bands, the slider
 *      geometry, the one-shot reveal, the approval mapping, and the three
 *      Phase-4C leftovers in the sidebar.
 *
 * Run: node test/work-composer.test.mjs
 */

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  chatgptActiveSelection,
  chatgptApprovalAvailable,
  chatgptApprovalLabel,
  chatgptApprovalOptions,
  chatgptEffortFill,
  chatgptEffortIndexOf,
  chatgptEffortName,
  chatgptEffortOffset,
  chatgptEffortRequest,
  chatgptEffortStep,
  chatgptEffortsFor,
  chatgptIsMaxEffort,
  chatgptModelChoices,
  chatgptModelGroups,
  chatgptEffortDefaultIndex
} from '../lib/shared/composer-core.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (path) => readFileSync(join(ROOT, path), 'utf8')

const composer = read('lib/client/composer.js')
const core = read('lib/shared/composer-core.mjs')
const css = read('lib/client/css/65-work-card.css')
const tokens = read('lib/client/css/05-cgpt-tokens.css')
const darkTokens = read('lib/client/css/06-cgpt-tokens-dark.css')
const sessions = read('lib/client/sessions.js')
const sessionCss = read('lib/client/css/25-sessions.css')
const locales = read('lib/client/locales.js')
const bundle = read('lib/client.js')
const buildScript = read('scripts/build-client.mjs')

let checks = 0
let failures = 0
const check = (name, condition, detail) => {
  checks += 1
  if (condition) return
  failures += 1
  console.log(`FAIL  ${name}${detail === undefined ? '' : ` — ${detail}`}`)
}

/** The live catalog shape (probed on 2026-11-06 from session/modelCatalog). */
const catalog = {
  default: { provider: 'dsh-provider-qoder', model: 'dfmodel', reasoningEffort: 'max' },
  groups: [
    {
      id: 'dsh-provider-qoder',
      name: 'DeepSeek',
      models: [
        {
          id: 'qfmodel',
          name: 'Qwen3.8-Flash',
          reasoning: { efforts: [{ id: 'low', name: 'low' }, { id: 'medium', name: 'medium' }, { id: 'xhigh', name: 'xhigh' }], defaultEffort: 'medium' }
        },
        {
          id: 'dfmodel',
          name: 'DeepSeek-Flash',
          reasoning: { efforts: [{ id: 'low', name: 'low' }, { id: 'high', name: 'high' }, { id: 'max', name: 'max' }], defaultEffort: 'high' }
        },
        { id: 'plain', name: 'No effort model' }
      ]
    },
    { id: 'other-provider', name: 'commandcode', models: [{ id: 'dm', name: 'DeepSeek', reasoning: { efforts: [{ id: 'high', name: 'high' }, { id: 'max', name: 'max' }] } }] }
  ]
}

const permissions = {
  defaultPreset: 'workspace-write',
  options: [
    { value: 'read-only', name: 'Read Only' },
    { value: 'workspace-write', name: 'Workspace Write' },
    { value: 'danger-full-access', name: 'Full Access' }
  ]
}

// 1. efforts come from the catalog, never from a hard-coded ladder.
{
  const found = chatgptEffortsFor(catalog, 'dsh-provider-qoder', 'dfmodel')
  check('efforts: model levels are read from the catalog', found?.efforts.map((e) => e.id).join(',') === 'low,high,max')
  check('efforts: defaultEffort travels with the levels', found?.defaultEffort === 'high')
  check('efforts: unknown model yields null', chatgptEffortsFor(catalog, 'dsh-provider-qoder', 'nope') === null)
  check('efforts: unknown provider yields null', chatgptEffortsFor(catalog, 'nope', 'dfmodel') === null)
  check('efforts: a model without reasoning yields null', chatgptEffortsFor(catalog, 'dsh-provider-qoder', 'plain') === null)
  check('efforts: a missing catalog yields null', chatgptEffortsFor(undefined, 'p', 'm') === null)
  check('efforts: two-level models are allowed', chatgptEffortsFor(catalog, 'other-provider', 'dm')?.efforts.length === 2)
}

// 2. index / max / stepping.
{
  const efforts = chatgptEffortsFor(catalog, 'dsh-provider-qoder', 'dfmodel').efforts
  check('index: explicit value wins', chatgptEffortIndexOf(efforts, 'high', 'low') === 1)
  check('index: default fills in', chatgptEffortIndexOf(efforts, undefined, 'max') === 2)
  check('index: unknown id falls back to the first level', chatgptEffortIndexOf(efforts, 'nope', 'high') === 0)
  check('index: empty levels yield -1', chatgptEffortIndexOf([], 'low', 'low') === -1)

  check('max: top level of a 3-level model', chatgptIsMaxEffort(efforts, 2) === true)
  check('max: middle level is not max', chatgptIsMaxEffort(efforts, 1) === false)
  check('max: a single level never counts', chatgptIsMaxEffort([{ id: 'high' }], 0) === false)
  check('max: empty levels are not max', chatgptIsMaxEffort([], -1) === false)

  check('step: right moves up', chatgptEffortStep(1, 'ArrowRight', 3) === 2)
  check('step: up is the same as right', chatgptEffortStep(1, 'ArrowUp', 3) === 2)
  check('step: left moves down', chatgptEffortStep(1, 'ArrowLeft', 3) === 0)
  check('step: clamps at the bottom', chatgptEffortStep(0, 'ArrowLeft', 3) === 0)
  check('step: clamps at the top', chatgptEffortStep(2, 'ArrowRight', 3) === 2)
  check('step: Home goes to the first level', chatgptEffortStep(2, 'Home', 3) === 0)
  check('step: End goes to the last level', chatgptEffortStep(0, 'End', 3) === 2)
  check('step: other keys keep the index', chatgptEffortStep(1, 'Enter', 3) === 1)
}

// 3. slider geometry (248×30 track, 17px inset = thumb radius, 34px thumb).
{
  check('geometry: first level sits on the 17px inset', chatgptEffortOffset(0, 3) === 17)
  check('geometry: last level ends on the opposite inset', chatgptEffortOffset(2, 3) === 231)
  check('geometry: the fill reaches the thumb centre', chatgptEffortFill(1, 3) === chatgptEffortOffset(1, 3))
  check('geometry: the top level fills the whole track', chatgptEffortFill(2, 3) === 248)
  check('geometry: a single level sits on the inset', chatgptEffortOffset(0, 1) === 17)
  check('geometry: out-of-range indices clamp', chatgptEffortOffset(9, 3) === 231)
  check('geometry: five levels spread across the full track', chatgptEffortOffset(0, 5) === 17 && chatgptEffortOffset(4, 5) === 231 && chatgptEffortOffset(2, 5) === 124)
  check('geometry: the track is 248 wide', core.includes('const CHATGPT_EFFORT_TRACK = 248'))
  check('geometry: the inset is the 34px thumb radius', core.includes('const CHATGPT_EFFORT_INSET = 17') && core.includes('const CHATGPT_EFFORT_THUMB = 34'))
  check('geometry: the track is 30 high and 15px rounded', /\.chatgpt-effort-track \{[^}]*height: 30px[^}]*border-radius: 15px/.test(css))
  check('geometry: the thumb is 34 in CSS', /\.chatgpt-effort-thumb \{[^}]*width: 34px[^}]*height: 34px/.test(css))
  check('geometry: the thumb is a perfect circle', /\.chatgpt-effort-thumb \{[^}]*border-radius: 50%/.test(css))
  check('geometry: the thumb opts out of the host squircle', /\.chatgpt-effort-thumb[\s\S]*?corner-shape: round/.test(css) || css.includes('corner-shape: round'))
  check('geometry: the 34px thumb stays centred on the 30px track', /\.chatgpt-effort-thumb \{[^}]*top: -2px/.test(css))
  check('geometry: four 4px ticks sit inside the track', /\.chatgpt-effort-tick \{[^}]*width: 4px[^}]*height: 4px[^}]*border-radius: 50%/.test(css))
}

// 4. the write goes through session/selectModel with the catalog level id.
{
  const efforts = chatgptEffortsFor(catalog, 'dsh-provider-qoder', 'dfmodel').efforts
  const request = chatgptEffortRequest('session-1', { provider: 'dsh-provider-qoder', model: 'dfmodel', reasoningEffort: 'high' }, efforts, 2)
  check('request: carries session, provider, model and the new level', JSON.stringify(request) === JSON.stringify({ sessionId: 'session-1', provider: 'dsh-provider-qoder', model: 'dfmodel', reasoningEffort: 'max' }))
  check('request: no session means no request', chatgptEffortRequest(undefined, { provider: 'p', model: 'm' }, efforts, 0) === null)
  check('request: no selection means no request', chatgptEffortRequest('s', undefined, efforts, 0) === null)
  check('request: out-of-range index means no request', chatgptEffortRequest('s', { provider: 'p', model: 'm' }, efforts, 9) === null)
  check('request: the fragment calls selectModel', composer.includes('ctx.remote.session.selectModel(request)'))
  check('request: the catalog is read from the host', composer.includes('ctx.remote.session.modelCatalog()'))
  check('request: a blank session starts from the catalog default', composer.includes('snapshot.value?.default'))
}

// 5. selection projection fallbacks.
{
  check('selection: pending wins', chatgptActiveSelection({ next: { model: 'a' }, lastUsed: { model: 'b' } }).model === 'a')
  check('selection: lastUsed is the fallback', chatgptActiveSelection({ next: null, lastUsed: { model: 'b' } }).model === 'b')
  check('selection: nothing selected yet', chatgptActiveSelection({ next: null, lastUsed: null }) === undefined)
  check('selection: missing projection', chatgptActiveSelection(undefined) === undefined)
}

// 6. effort labels follow the host names with a Chinese fallback table.
{
  check('label: known id is Chinese', chatgptEffortName({ id: 'xhigh', name: 'xhigh' }) === '极高')
  check('label: max is 最高', chatgptEffortName({ id: 'max', name: 'max' }) === '最高')
  check('label: unknown id keeps the host name', chatgptEffortName({ id: 'custom', name: 'Custom' }) === 'Custom')
  check('label: unknown id without a name falls back to the id', chatgptEffortName({ id: 'weird' }) === 'weird')
  check('label: empty level is empty', chatgptEffortName(undefined) === '')
  check('label: the fragment renders the level name', composer.includes('chatgptEffortName(efforts[index])'))
}

// 7. approval menu is the host catalog, mapped to the skin's wording.
{
  const options = chatgptApprovalOptions(permissions)
  check('approval: one entry per host preset', options.length === 3)
  check('approval: read-only is 请求批准', options[0].label === '请求批准')
  check('approval: workspace-write is 帮我批准', options[1].label === '帮我批准')
  check('approval: danger-full-access is 完全访问权限', options[2].label === '完全访问权限')
  check('approval: the host name is kept for the tooltip', options[1].hostName === 'Workspace Write')
  check('approval: unknown presets keep the host name', chatgptApprovalOptions({ options: [{ value: 'auto', name: 'Auto' }] })[0].label === '自动选择')
  check('approval: label of the current value', chatgptApprovalLabel('workspace-write', options) === '帮我批准')
  check('approval: label of an unknown value', chatgptApprovalLabel('bespoke', options) === 'bespoke')
  check('approval: no value', chatgptApprovalLabel(undefined, options) === '')
  check('approval: a catalog of one preset is not a menu', chatgptApprovalAvailable({ options: [{ value: 'workspace-write', name: 'x' }] }) === false)
  check('approval: three presets are a menu', chatgptApprovalAvailable(permissions) === true)
  check('approval: missing catalog', chatgptApprovalAvailable(undefined) === false)
  check('approval: the fragment reads the preset catalog', composer.includes('ctx.remote.permissionPresets.catalog()'))
  check('approval: the switch uses the host command', composer.includes('live.command(`/permission ${value}`)'))
  check('approval: the switch checks command success', composer.includes('result?.ok && result.value?.matched === true'))
}

// 8. the three bands, measured.
{
  check('card: Work mode is scoped to agent, or to the shared super-agent panel', css.includes(":is([data-chatgpt-mode='agent'], :has([data-super-agent-panel]))"))
  check('card: radius 28', /\[data-composer-card='true'\] \{[^}]*border-radius: 28px/.test(css.replace(/\n/g, ' ')))
  check('card: 15/18 padding', css.includes('padding: 15px 18px 8px'))
  check('card: the tool bar hangs 48px below', css.includes('bottom: -48px') && css.includes('margin-bottom: 48px'))
  check('card: the action row is 36 high', css.includes('height: 36px'))
  check('card: the tool bar is 48 high', /height: 48px;[\s\S]{0,200}?border-radius: 0 0 24px 24px/.test(css))
  // The permission seat is relocated into the tool row; the rest of `_modes`
  // (plan mode) is a DSH-only control and stays where the Host renders it.
  check('card: only the relocated permission seat is hidden, not `_modes`', css.includes("div[class*='_modes'] > [data-slot='conversation.input.permission']") && !css.includes("div[class*='_modes'] {"))
  check('card: the model chip is 36 high', css.includes("[data-slot='conversation.input.model'] button {"))
  check('card: the effort chip joins the row via display contents', css.includes('display: contents'))
  check('card: Chat keeps its own fold (no Work rules outside the scope)', !/\.chatgpt-work-tools \{[^}]*\}[\s\S]*?data-chatgpt-mode/.test(css.split(":is([data-chatgpt-mode='agent'], :has([data-super-agent-panel]))")[0]))
  check('card: the tool bar is a registered slot entry', composer.includes("name: 'conversation.input.left'") && composer.includes("id: 'chatgpt-work-tools'"))
  check('card: the effort row is a registered slot entry', composer.includes("name: 'conversation.input.right'") && composer.includes("id: 'chatgpt-work-controls'"))
  check('card: the send seat is one 36 blue round button', /\[class\*='_trailing'\] button\[class\*='_primary'\] \{[^}]*width: 36px;[^}]*height: 36px;[^}]*background: var\(--cgpt-work-voice\)/.test(css.replace(/\n/g, ' ')))
  // M11-7 gives the slot occupant the pill's geometry, but never hides it and
  // never targets the wrapper `div` the Host may mount around it.
  check('card: the host 400K chip is kept and chip-shaped (DSH-only capability)', !css.includes("[data-slot='conversation.input.right'] > div") && !css.includes("[class*='_standardControls'] > div:first-child > div:first-child") && css.includes("[data-slot='conversation.input.right'] > :not([data-cgpt-root]):not(button)"))
  check('card: the Host model seat is hidden in favour of the merged pill', css.includes("[data-slot='conversation.input.model'] > :not([data-cgpt-root])"))
  check('card: the host model seat child is hidden behind the merged pill', css.includes("[data-slot='conversation.input.model'] > :not([data-cgpt-root])"))
  check('card: the narrow-card container query keeps one line', css.includes('@container cgpt-card (max-width: 600px)') && css.includes('flex-wrap: nowrap'))
  check('card: the Work placeholder is Chinese via a token', css.includes('--dsh-chatgpt-placeholder-work') && css.includes("content: var(--dsh-chatgpt-placeholder-work"))
  check('card: the tool bar is not a single-slot shadow', !composer.includes("name: 'conversation.composer.bar'"))
}

// 9. the final desktop form: provider groups, two-line header, reset.
{
  const groups = chatgptModelGroups(chatgptModelChoices(catalog))
  check('groups: one group per provider', groups.length === 2 && groups[0].provider === 'dsh-provider-qoder' && groups[1].provider === 'other-provider')
  check('groups: the header carries the Host provider name', groups[0].name === 'DeepSeek' && groups[1].name === 'commandcode')
  check('groups: rows keep the Host order', groups[0].models.map((model) => model.model).join(',') === 'qfmodel,dfmodel,plain')
  check('groups: a catalog without groups is empty', chatgptModelGroups([]).length === 0)
  check('reset: defaultEffort is the target', chatgptEffortDefaultIndex([{ id: 'low' }, { id: 'high' }, { id: 'max' }], 'high') === 1)
  check('reset: no default falls back to the first level', chatgptEffortDefaultIndex([{ id: 'low' }, { id: 'high' }], undefined) === 0)
  check('reset: no levels yields -1', chatgptEffortDefaultIndex([], 'high') === -1)
  check('header: one block holds the effort name over the model line', composer.includes("className: 'chatgpt-effort-choice-name'") && composer.includes("className: 'chatgpt-effort-choice-model'"))
  check('header: the lightning glyph is gone but its 20px column stays', !composer.includes('CHATGPT_LIGHTNING_SVG') && composer.includes("className: 'chatgpt-effort-head-blank'"))
  check('header: the reset control is on the right', composer.includes("className: 'chatgpt-effort-reset'") && composer.includes('chatgptEffortDefaultIndex'))
  check('header: the effort name uses the blue accent token', css.includes('.chatgpt-effort-choice-name') && css.includes('var(--cgpt-effort-accent)'))
  check('panel: 16px corners and the 12/16/16 rhythm inside the 8px inset', /\.chatgpt-effort-menu \{[^}]*border-radius: var\(--cgpt-overlay-radius\)/.test(css) && /\.chatgpt-model-simple \{[^}]*padding: 4px 8px 8px/.test(css))
  check('panel: 280 wide and 420px list cap', composer.includes("width: '280px'") && css.includes('max-height: var(--cgpt-model-panel-max, 420px)'))
  check('list: provider headers are 26 high and full width', /\.chatgpt-model-group-title \{[^}]*height: 26px[^}]*background: var\(--cgpt-effort-group-bg\)/.test(css))
  check('list: rows are 32 high with a 32px hit area', /\.chatgpt-model-choice \{[^}]*height: 32px[^}]*min-height: 32px[^}]*padding: 0 10px/.test(css))
  check('list: no description is rendered', !composer.includes('chatgpt-model-choice-description') && !composer.includes('chatgpt-model-choice-text'))
  check('list: the current row carries the check', composer.includes("className: 'chatgpt-model-choice-check'") && composer.includes("'data-current': selected"))
  check('pill: opening swaps the caption to 选择推理强度', composer.includes("chooseEffort: '选择推理强度'") && composer.includes("'data-cgpt-pill-placeholder'"))
  check('pill: closing restores model + effort', composer.includes("open || effortLabel === ''") && composer.includes("className: 'chatgpt-model-pill-name'"))
  check('slider: selected segment is #2f7cf6 in both themes', tokens.includes('--cgpt-effort-fill: #2f7cf6') && darkTokens.includes('--cgpt-effort-fill: #2f7cf6'))
  check('slider: dark unselected track is #3f3f3f', darkTokens.includes('--cgpt-effort-track: #3f3f3f'))
  check('slider: one tick per catalog level', composer.includes('const ticks = efforts.map') && composer.includes("'data-cgpt-effort-tick'"))
  check('slider: no gradient or reveal layer survives', !css.includes('chatgpt-effort-reveal') && !composer.includes('chatgpt-effort-reveal') && !css.includes('@property --cgpt-effort-mask'))
  check('slider: the top stop is the three-stop blue→purple gradient', css.includes("chatgpt-effort-fill[data-max='true']") && css.includes('linear-gradient(90deg, var(--cgpt-effort-max-a) 0%, var(--cgpt-effort-max-b) 52%, var(--cgpt-effort-max-c) 100%)'))
  check('light: white overlay and #F7F7F7 group headers', tokens.includes('--cgpt-overlay-bg: #ffffff') && tokens.includes('--cgpt-model-panel-bg: var(--cgpt-overlay-bg)') && tokens.includes('--cgpt-effort-group-bg: #f7f7f7'))
  check('dark: #2B2B2B overlay and #383838 group headers', darkTokens.includes('--cgpt-overlay-bg: #2b2b2b') && darkTokens.includes('--cgpt-model-panel-bg: var(--cgpt-overlay-bg)') && darkTokens.includes('--cgpt-effort-group-bg: #383838'))
}

// 10. Phase 4C leftovers.
{
  check('c1: 新聊天 uses the extracted pen-square', sessions.includes("plus: chatgptRailGlyph('compose')"))
  check('c1: the plus path is gone', !sessions.includes('M10 4.2v11.6M4.2 10h11.6'))
  check('c2: the super-agent mark is the skin\'s own', sessions.includes('CHATGPT_SUPER_AGENT_MARK'))
  check('c2: it is a 20px avatar disc, not dot\'s three dots', sessions.includes('r="8.4"') && !sessions.includes("chatgptRailGlyph('dot', false)"))
  check('c2: the disc is 20px in CSS', /\.chatgpt-super-agent-icon svg \{[^}]*width: 20px/.test(sessionCss))
  check('c3: the tag is only rendered when it differs from the title', sessions.includes("projectLabel === title"))
  check('c3: the tag can shrink but not push the title', /\.chatgpt-session-project \{[^}]*flex: 0 1 auto/.test(sessionCss))
  check('c3: long names ellipsize', /\.chatgpt-session-project \{[^}]*text-overflow: ellipsis/.test(sessionCss))
  check('c3: narrow rows drop the tag', sessionCss.includes('@container cgpt-session-row'))
  check('c3: the row is the query container', sessionCss.includes('container-type: inline-size'))
}

// 11. the fragment is wired into the bundle and the build.
{
  check('build: composer.js is a fragment', buildScript.includes("'composer.js'"))
  check('build: composer-core.mjs is inlined first', buildScript.includes("'composer-core.mjs'"))
  check('build: the bundle carries the tool bar anchors', bundle.includes('data-cgpt-work-tools') && bundle.includes('data-cgpt-effort'))
  check('build: the stylesheet is in the bundle', bundle.includes('.chatgpt-model-group-title') && bundle.includes('.chatgpt-work-tools'))
  check('build: the tool row mounts behind its own inject', read('lib/client/entry.js').includes('mountChatgptWorkComposer'))
  check('build: no probe block survives', !read('lib/client/entry.js').includes('cgpt-probe'))
  check('locales: every Work key exists in both dictionaries', ['work.effort', 'work.approval', 'work.tools.project', 'work.tools.files', 'work.tools.plugins', 'work.dictate', 'work.voice', 'work.unavailable'].every((key) => (locales.match(new RegExp(`'${key.replace('.', '\\.')}'`, 'g')) ?? []).length === 2))
  check('copy: the five visible labels are the reference wording', composer.includes("project: '选择项目'") && composer.includes("files: '文件'") && composer.includes("plugins: '插件'") && composer.includes("approval: '帮我批准'"))
  check('copy: no mic/dictation button anywhere in the composer', !composer.includes('chatgpt-work-media') && !composer.includes('CHATGPT_MIC_SVG') && !composer.includes('data-cgpt-unavailable'))
  check('copy: no voice button of our own (the send seat is blue)', !composer.includes('chatgpt-work-media-voice') && !composer.includes('CHATGPT_VOICE_SVG'))
}

// 12. no raw palette outside the token files (the design contract, locally).
{
  const stripped = css.replace(/\/\*[\s\S]*?\*\//g, '')
  check('palette: no raw white/black in 65-work-card.css', !/#(?:fff|ffffff|000|000000)\b/i.test(stripped) && !/rgba\(\s*(?:255\s*,\s*255\s*,\s*255|0\s*,\s*0\s*,\s*0)\s*,/.test(stripped))
  check('palette: the Work card colour lives in the token files', tokens.includes('--cgpt-work-card-bg') && darkTokens.includes('--cgpt-work-card-bg: #212121'))
  check('palette: the dark card is #212121', darkTokens.includes('--cgpt-work-card-bg: #212121'))
}

// 13. the effort panel grows out of its trigger (P4-b).
{
  const composer = read('lib/client/composer.js')
  const helper = composer.slice(composer.indexOf('function chatgptPopoverForTrigger'), composer.indexOf('function chatgptPanelRoom'))
  check('panel: right edge sits on the trigger right edge, not the card', helper.includes('anchor.right - width') && !helper.includes('card.right'))
  check('panel: keeps the 8px gap on its own side', helper.includes('const gap = CHATGPT_PANEL_GAP') && helper.includes('anchor.bottom + gap') && helper.includes('anchor.top - gap - height'))
  check('panel: flips only when the preferred side has no room', helper.includes("preferred === 'below' && !fitsBelow && fitsAbove") && helper.includes("preferred === 'above' && !fitsAbove && fitsBelow"))
  check('panel: a locked side never flips (the nested list stays put)', helper.includes('if (options.lock !== true)'))
  check('panel: the blank hero prefers below, a started session above', /direction: chatgptComposerIsHero\(trigger\) \? 'below' : 'above'/.test(composer) && composer.includes("closest(\"[class*='_composerHero']\")"))
  check('list: the side is capped to the room on that side, never flipped', composer.includes('chatgptPanelRoom(rect, direction)') && composer.includes("'--cgpt-model-panel-max'"))
  check('list: the panel itself no longer scrolls; the inner list does', /\.chatgpt-model-menu\[data-view='advanced'\] \{[^}]*overflow: hidden/.test(css) && /\.chatgpt-model-advanced \{[^}]*max-height: calc\(var\(--cgpt-model-panel-max, 420px\) - 20px\)[^}]*overflow-y: auto/.test(css))
}

console.log(`${failures === 0 ? 'PASS' : 'FAIL'}  work composer: ${checks - failures}/${checks} checks`)
if (failures > 0) process.exit(1)
