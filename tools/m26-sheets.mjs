#!/usr/bin/env node
/**
 * tools/m26-sheets.mjs — P0-14 same-scale overlays.
 *
 * For each of the three reference surfaces plus the composer's approval chip
 * this writes one image with three panels, all at the reference's own device
 * scale (2x, no rescaling anywhere):
 *
 *   left   the 2026-11-07 desktop capture, cropped to the surface box
 *   middle the implementation frame from tools/m26-capture.mjs
 *   right  the two blended 50/50
 *
 * A 1px shift therefore shows up as a doubled edge in the blend panel instead
 * of being argued about. The picks the approval picker needs are explained in
 * docs/m26.json: its reference frame is cut off at the top by the desktop
 * screenshot, so both sides are cropped to the visible height and aligned on
 * the surface's bottom-left corner.
 *
 *   node tools/m26-sheets.mjs [--out docs/screenshots]
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { deflateSync } from 'node:zlib'
import { readPng } from '../scripts/png-read.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'docs/screenshots')
mkdirSync(OUT, { recursive: true })

const SURFACES = [
  {
    name: 'permission',
    title: '权限菜单 / approval picker',
    reference: { file: '屏幕截图 2026-11-07 090156.png', box: { x: 108, y: 0, width: 596, height: 310 } },
    implementation: 'impl-permission.png',
    anchor: 'bottom'
  },
  {
    name: 'project-menu',
    title: '项目行 ⋯ 菜单 / project ⋯ menu',
    reference: { file: '屏幕截图 2026-11-07 061024.png', box: { x: 348, y: 246, width: 329, height: 416 } },
    implementation: 'impl-project-menu.png',
    anchor: 'top'
  },
  {
    name: 'project-card',
    title: '项目行悬停信息卡 / project hover card',
    reference: { file: '屏幕截图 2026-11-07 060946.png', box: { x: 462, y: 190, width: 642, height: 311 } },
    implementation: 'impl-project-card.png',
    anchor: 'top'
  },
  {
    name: 'permission-chip',
    title: '输入卡权限按钮 / composer approval chip',
    reference: { file: '屏幕截图 2026-11-07 090156.png', box: { x: 106, y: 322, width: 172, height: 50 } },
    implementation: 'impl-permission-chip.png',
    anchor: 'top'
  }
]

const BLEND_GAP = 8

const toRgb = (png) => {
  const rgb = Buffer.alloc(png.width * png.height * 3)
  for (let index = 0; index < png.width * png.height; index += 1) {
    const from = index * png.channels
    rgb[index * 3] = png.data[from]
    rgb[index * 3 + 1] = png.data[from + 1]
    rgb[index * 3 + 2] = png.data[from + 2]
  }
  return { width: png.width, height: png.height, rgb }
}

function crop(image, box) {
  const x = Math.max(0, Math.min(image.width - 1, box.x))
  const y = Math.max(0, Math.min(image.height - 1, box.y))
  const width = Math.max(1, Math.min(image.width - x, box.width))
  const height = Math.max(1, Math.min(image.height - y, box.height))
  const rgb = Buffer.alloc(width * height * 3)
  for (let row = 0; row < height; row += 1) {
    image.rgb.copy(rgb, row * width * 3, ((y + row) * image.width + x) * 3, ((y + row) * image.width + x + width) * 3)
  }
  return { width, height, rgb }
}

const crcTable = (() => {
  const table = new Int32Array(256)
  for (let n = 0; n < 256; n += 1) {
    let c = n
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c
  }
  return table
})()

function crc32(buffer) {
  let c = -1
  for (let index = 0; index < buffer.length; index += 1) c = crcTable[(c ^ buffer[index]) & 0xff] ^ (c >>> 8)
  return (c ^ -1) >>> 0
}

function chunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length, 0)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body), 0)
  return Buffer.concat([length, body, crc])
}

function writePng(path, width, height, rgb) {
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header[8] = 8
  header[9] = 2
  const raw = Buffer.alloc((width * 3 + 1) * height)
  for (let row = 0; row < height; row += 1) {
    raw[row * (width * 3 + 1)] = 0
    rgb.copy(raw, row * (width * 3 + 1) + 1, row * width * 3, (row + 1) * width * 3)
  }
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ])
  writeFileSync(path, png)
}

const report = { generatedAt: new Date().toISOString(), scale: 2, panels: ['reference', 'implementation', 'blend 50/50'], sheets: [] }

for (const surface of SURFACES) {
  const reference = crop(toRgb(readPng(join(ROOT, 'docs/reference', surface.reference.file))), surface.reference.box)
  const implementation = toRgb(readPng(join(ROOT, 'docs/capture/m26', surface.implementation)))
  const height = Math.min(reference.height, implementation.height)
  const width = Math.min(reference.width, implementation.width)
  const top = surface.anchor === 'bottom' ? implementation.height - height : 0
  const left = reference
  const right = crop(implementation, { x: 0, y: top, width, height })
  const blend = { width, height, rgb: Buffer.alloc(width * height * 3) }
  let sum = 0
  for (let index = 0; index < width * height * 3; index += 1) {
    const a = left.rgb[index]
    const b = right.rgb[index]
    blend.rgb[index] = (a + b) >> 1
    sum += Math.abs(a - b)
  }
  const totalWidth = width * 3 + BLEND_GAP * 2
  const canvas = Buffer.alloc(totalWidth * height * 3, 250)
  const put = (x, source) => {
    for (let row = 0; row < Math.min(height, source.height); row += 1) {
      const from = row * source.width * 3
      source.rgb.copy(canvas, (row * totalWidth + x) * 3, from, from + Math.min(width, source.width) * 3)
    }
  }
  put(0, left)
  put(width + BLEND_GAP, right)
  put((width + BLEND_GAP) * 2, blend)
  const outName = `m26-${surface.name}-overlay.png`
  writePng(join(OUT, outName), totalWidth, height, canvas)
  report.sheets.push({
    name: surface.name,
    title: surface.title,
    file: `docs/screenshots/${outName}`,
    reference: { file: `docs/reference/${surface.reference.file}`, box: surface.reference.box },
    implementation: `docs/capture/m26/${surface.implementation}`,
    panelSize: { width: Math.round((width / 2) * 100) / 100, height: Math.round((height / 2) * 100) / 100 },
    align: surface.anchor === 'bottom' ? 'surface bottom-left corner' : 'surface top-left corner',
    meanChannelDifference: Math.round((sum / (width * height * 3)) * 100) / 100
  })
  console.log(`sheet ${surface.name}: docs/screenshots/${outName}  ${width}x${height} device px, mean |Δ| ${report.sheets.at(-1).meanChannelDifference}`)
}

writeFileSync(join(ROOT, 'docs/m26-sheets.json'), JSON.stringify(report, null, 2) + '\n')
console.log('m26-sheets: docs/m26-sheets.json')
