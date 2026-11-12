#!/usr/bin/env node
/**
 * tools/m26-measure.mjs — P0-14 reference ↔ implementation deltas.
 *
 * Both sides are decoded from PNG and measured identically: the surface is
 * cropped to its own box, then the rows that carry ink are grouped into bands
 * (a band merges a row's title and description when they touch, exactly as
 * they do in the capture). Each band reports its baseline position, height and
 * horizontal ink extent in CSS px, so the vertical rhythm and the left/right
 * insets of both frames can be compared without hand-picked windows.
 *
 * The approval picker's reference frame is cut off at the top by the desktop
 * screenshot, so that pair is aligned on the surface's bottom-left corner and
 * the implementation frame is cropped to the reference's visible height.
 *
 *   node tools/m26-measure.mjs
 *
 * Writes docs/capture/m26/measure.json and prints one row per band.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readPng } from '../scripts/png-read.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const REF = join(ROOT, 'docs/reference')
const OUT = join(ROOT, 'docs/capture/m26')
const SCALE = 2

const luminance = (png, x, y) => {
  const at = (y * png.width + x) * png.channels
  return 0.2126 * png.data[at] + 0.7152 * png.data[at + 1] + 0.0722 * png.data[at + 2]
}

function crop(png, box) {
  const width = Math.max(1, Math.min(box.width, png.width - box.x))
  const height = Math.max(1, Math.min(box.height, png.height - box.y))
  const data = Buffer.alloc(width * height * png.channels)
  for (let row = 0; row < height; row += 1) {
    const from = ((box.y + row) * png.width + box.x) * png.channels
    png.data.copy(data, row * width * png.channels, from, from + width * png.channels)
  }
  return { width, height, channels: png.channels, data }
}

/** Ink rows grouped into bands, each with its horizontal extent. */
function bands(png, threshold = 120, span = null) {
  const x0 = span === null ? 0 : Math.max(0, span[0])
  const x1 = span === null ? png.width - 1 : Math.min(png.width - 1, span[1])
  const rows = []
  for (let y = 0; y < png.height; y += 1) {
    let left = -1
    let right = -1
    for (let x = x0; x <= x1; x += 1) {
      if (luminance(png, x, y) < threshold) continue
      if (left < 0) left = x
      right = x
    }
    rows.push({ count: left < 0 ? 0 : right - left + 1, left, right })
  }
  const out = []
  let current = null
  for (let y = 0; y < rows.length; y += 1) {
    if (rows[y].count > 0) {
      if (current === null) current = { top: y, bottom: y, left: rows[y].left, right: rows[y].right }
      else {
        current.bottom = y
        current.left = Math.min(current.left, rows[y].left)
        current.right = Math.max(current.right, rows[y].right)
      }
    } else if (current !== null) {
      out.push(current)
      current = null
    }
  }
  if (current !== null) out.push(current)
  return out.map((band) => {
    const logical = (value) => Math.round((value / SCALE) * 100) / 100
    return { y: logical(band.top), height: logical(band.bottom - band.top + 1), left: logical(band.left), right: logical(band.right), width: logical(band.right - band.left + 1) }
  })
}

const SURFACES = [
  {
    name: 'permission',
    title: '权限菜单 (approval picker)',
    reference: { file: '屏幕截图 2026-11-07 090156.png', box: { x: 108, y: 0, width: 596, height: 310 } },
    implementation: 'impl-permission.png',
    anchor: 'bottom',
    scan: [16, 584],
    bands: ['标题行', '「了解更多」下划线', '第1行 (请求批准)', '第2行 (帮我批准)', '第3行 (完全访问权限)']
  },
  {
    name: 'project-menu',
    title: '项目行 ⋯ 菜单',
    reference: { file: '屏幕截图 2026-11-07 061024.png', box: { x: 348, y: 246, width: 329, height: 416 } },
    implementation: 'impl-project-menu.png',
    anchor: 'top',
    scan: [60, 322],
    bands: ['置顶项目', '编辑项目', '分区 (归档项目)', '在资源管理器中打开', '归档聊天', '移除项目']
  },
  {
    name: 'project-card',
    title: '项目行悬停信息卡',
    reference: { file: '屏幕截图 2026-11-07 060946.png', box: { x: 462, y: 190, width: 642, height: 311 } },
    implementation: 'impl-project-card.png',
    anchor: 'top',
    scan: [30, 630],
    bands: ['标题', '聊天数', '仓库路径', '本地路径', '编辑项目']
  },
  {
    name: 'permission-chip',
    title: '输入卡权限按钮',
    reference: { file: '屏幕截图 2026-11-07 090156.png', box: { x: 106, y: 322, width: 172, height: 50 } },
    implementation: 'impl-permission-chip.png',
    anchor: 'top',
    scan: [0, 170],
    bands: ['图标 + 文字']
  }
]

const report = { generatedAt: new Date().toISOString(), scale: SCALE, surfaces: [] }
const round = (value) => Math.round(value * 100) / 100

for (const surface of SURFACES) {
  const reference = readPng(join(REF, surface.reference.file))
  const implementation = readPng(join(OUT, surface.implementation))
  const refBox = surface.reference.box
  // Ink is measured one device px inside the surface so the 1px border ring and
  // the page text showing through the rounded corners cannot look like content.
  const inset = (box) => ({ x: box.x + 2, y: box.y + 2, width: box.width - 4, height: box.height - 4 })
  const refInner = inset(refBox)
  const ref = crop(reference, refInner)
  const implHeight = Math.min(ref.height, implementation.height)
  const impl = crop(implementation, {
    x: 2,
    y: surface.anchor === 'bottom' ? implementation.height - implHeight - 2 : 2,
    width: Math.min(ref.width, implementation.width - 4),
    height: implHeight
  })
  const refBands = bands(ref, 120, surface.scan)
  const implBands = bands(impl, 120, surface.scan)
  const rows = []
  const count = Math.max(refBands.length, implBands.length)
  for (let index = 0; index < count; index += 1) {
    const a = refBands[index] ?? null
    const b = implBands[index] ?? null
    rows.push({
      index,
      label: surface.bands[index] ?? `band ${index + 1}`,
      reference: a,
      implementation: b,
      error: a === null || b === null ? null : {
        y: round(Math.abs(a.y - b.y)),
        height: round(Math.abs(a.height - b.height)),
        left: round(Math.abs(a.left - b.left)),
        right: round(Math.abs(a.right - b.right))
      }
    })
  }
  const surfaceError = { width: round(Math.abs(refBox.width / SCALE - implementation.width / SCALE)), height: round(Math.abs(refBox.height / SCALE - implementation.height / SCALE)) }
  report.surfaces.push({
    name: surface.name,
    title: surface.title,
    reference: { file: surface.reference.file, box: refBox, visible: { width: round(refBox.width / SCALE), height: round(refBox.height / SCALE) }, inner: { width: round(ref.width / SCALE), height: round(ref.height / SCALE), inset: 1 } },
    implementation: { file: `docs/capture/m26/${surface.implementation}`, box: { width: round(implementation.width / SCALE), height: round(implementation.height / SCALE) } },
    anchor: surface.anchor,
    surfaceError,
    bands: rows
  })
  console.log(`\n${surface.name} — ${surface.title}`)
  console.log(`  surface: reference ${round(refBox.width / SCALE)}x${round(refBox.height / SCALE)} · implementation ${round(implementation.width / SCALE)}x${round(implementation.height / SCALE)} · Δ ${surfaceError.width}x${surfaceError.height}`)
  for (const row of rows) {
    const fmt = (band) => (band === null ? '—' : `y${band.y} h${band.height} x${band.left}..${band.right}`)
    const err = row.error === null ? '—' : `Δy${row.error.y} Δh${row.error.height} Δleft${row.error.left} Δright${row.error.right}`
    console.log(`  ${row.label.padEnd(22)} ref ${fmt(row.reference).padEnd(30)} impl ${fmt(row.implementation).padEnd(30)} ${err}`)
  }
}

writeFileSync(join(OUT, 'measure.json'), JSON.stringify(report, null, 2) + '\n')
console.log('\nm26-measure: docs/capture/m26/measure.json')
