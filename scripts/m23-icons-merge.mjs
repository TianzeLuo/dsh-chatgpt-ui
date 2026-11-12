#!/usr/bin/env node
/**
 * scripts/m23-icons-merge.mjs — merge the P0-11 live rail capture into
 * docs/capture/icons.json, then `npm run icons` regenerates rail-icons.js.
 *
 * Only the two destinations that used to be hand-synthesized are touched:
 * 定时任务 and 插件. The selected twin is the inline SVG the web app renders
 * for the selected route; the default twin is the sprite symbol it renders
 * when the route is not selected. Path data is copied verbatim.
 *
 *   node scripts/m23-icons-merge.mjs [--capture docs/capture/live/m23-rail-icons.json]
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
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
const capturePath = resolve(
  ROOT,
  typeof args.get('capture') === 'string' ? args.get('capture') : 'docs/capture/live/m23-rail-icons.json'
)
const iconsPath = resolve(ROOT, 'docs/capture/icons.json')
const live = JSON.parse(readFileSync(capturePath, 'utf8'))
const capture = JSON.parse(readFileSync(iconsPath, 'utf8'))

if (live.meta?.readOnly !== true) throw new Error('refusing to merge a capture that is not marked read-only')

const pair = {
  schedules: '定时任务',
  plugins: '插件'
}

for (const [name, label] of Object.entries(pair)) {
  const state = live.states?.[name]
  const entry = capture.icons?.[name]
  if (entry === undefined) throw new Error(`icons.json has no ${name} entry`)
  if (state?.default?.inner === undefined || state?.selected?.inner === undefined) {
    throw new Error(`${name}: capture is missing a default or selected inner SVG`)
  }
  entry.referenceLabel = label
  entry.referenceDestination = state.destination
  entry.default = {
    symbol: state.default.symbol,
    viewBox: state.default.viewBox ?? '0 0 20 20',
    fill: 'currentColor',
    inner: state.default.inner
  }
  entry.selected = {
    inline: true,
    viewBox: state.selected.viewBox ?? '0 0 20 20',
    fill: 'currentColor',
    inner: state.selected.inner
  }
  entry.selectedEqualsDefault = false
  entry.selectedReference = {
    inline: true,
    capturedAt: live.meta.capturedAt,
    note: 'web 端选中项以 inline SVG 渲染；无 sprite 填充 twin'
  }
}

capture.geometry.button.referencePadding = live.geometry?.button?.padding ?? null
capture.geometry.button.skinPadding = '8px'
capture.geometry.selected = live.geometry?.selected ?? null
capture.geometry.unselected = live.geometry?.unselected ?? null
capture.meta = {
  ...capture.meta,
  sprite: live.meta.sprite ?? capture.meta?.sprite ?? '',
  railSelectedCapture: {
    generatedBy: live.meta.generatedBy,
    capturedAt: live.meta.capturedAt,
    readOnly: true,
    screenshots: live.screenshots
  }
}

writeFileSync(iconsPath, `${JSON.stringify(capture, null, 2)}\n`, 'utf8')
console.log(`merged ${Object.keys(pair).join(', ')} into docs/capture/icons.json`)
