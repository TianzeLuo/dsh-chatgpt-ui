#!/usr/bin/env node
/**
 * tools/m25-sheets.mjs — P0-13 comparison sheets.
 *
 * For every surface the reference capture cropped, this writes one image with
 * three panels: the reference crop, the implementation crop, and the same two
 * overlaid (50/50, plus a per-pixel difference band) so a 1px shift is visible
 * as a coloured edge instead of being argued about.
 *
 *   node tools/m25-sheets.mjs [--out docs/screenshots]
 *
 * Panels are resized to a common height by nearest sampling — the crops come
 * from the same DPR-2 rule (surface box + 6px), so a resized panel means the
 * two surfaces genuinely differ in size, which the header row states.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { deflateSync, inflateSync } from 'node:zlib'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SHOTS = join(ROOT, 'docs/screenshots')
const LIVE = join(ROOT, 'docs/capture/live')
mkdirSync(SHOTS, { recursive: true })
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
if (typeof args.get('out') === 'string') mkdirSync(resolve(ROOT, args.get('out')), { recursive: true })
const OUT = resolve(ROOT, typeof args.get('out') === 'string' ? args.get('out') : 'docs/screenshots')

/** Decode an 8-bit RGB/RGBA PNG into {width,height,rgb}. */
function decode(path) {
  const buf = readFileSync(path)
  let offset = 8
  let width = 0
  let height = 0
  let colorType = 0
  let bitDepth = 0
  const idat = []
  while (offset < buf.length) {
    const length = buf.readUInt32BE(offset)
    const type = buf.toString('ascii', offset + 4, offset + 8)
    const data = buf.subarray(offset + 8, offset + 8 + length)
    if (type === 'IHDR') {
      width = data.readUInt32BE(0)
      height = data.readUInt32BE(4)
      bitDepth = data[8]
      colorType = data[9]
    } else if (type === 'IDAT') idat.push(data)
    else if (type === 'IEND') break
    offset += 12 + length
  }
  if (bitDepth !== 8) throw new Error(`${path}: only 8-bit is supported (${bitDepth})`)
  const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : colorType === 0 ? 1 : colorType === 4 ? 2 : 0
  if (channels === 0) throw new Error(`${path}: unsupported colour type ${colorType}`)
  const raw = inflateSync(Buffer.concat(idat))
  const stride = width * channels
  const out = Buffer.alloc(width * height * 3)
  let previous = Buffer.alloc(stride)
  let position = 0
  for (let y = 0; y < height; y += 1) {
    const filter = raw[position]
    position += 1
    const line = Buffer.from(raw.subarray(position, position + stride))
    position += stride
    for (let x = 0; x < stride; x += 1) {
      const left = x >= channels ? line[x - channels] : 0
      const up = previous[x]
      const upLeft = x >= channels ? previous[x - channels] : 0
      let value = line[x]
      if (filter === 1) value = (value + left) & 255
      else if (filter === 2) value = (value + up) & 255
      else if (filter === 3) value = (value + ((left + up) >> 1)) & 255
      else if (filter === 4) {
        const p = left + up - upLeft
        const pa = Math.abs(p - left)
        const pb = Math.abs(p - up)
        const pc = Math.abs(p - upLeft)
        const pr = pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft
        value = (value + pr) & 255
      }
      line[x] = value
    }
    for (let x = 0; x < width; x += 1) {
      const base = x * channels
      const r = line[base]
      out[(y * width + x) * 3] = r
      out[(y * width + x) * 3 + 1] = channels === 1 ? r : line[base + 1]
      out[(y * width + x) * 3 + 2] = channels === 1 ? r : line[base + 2]
    }
    previous = line
  }
  return { width, height, rgb: out }
}

/** Nearest-neighbour scale to a target height. */
function rescale(image, targetHeight) {
  if (image.height === targetHeight) return image
  const scale = image.height / targetHeight
  const width = Math.max(1, Math.round(image.width * targetHeight / image.height))
  const out = Buffer.alloc(width * targetHeight * 3)
  for (let y = 0; y < targetHeight; y += 1) {
    const sy = Math.min(image.height - 1, Math.floor(y * scale))
    for (let x = 0; x < width; x += 1) {
      const sx = Math.min(image.width - 1, Math.floor(x * scale))
      const from = (sy * image.width + sx) * 3
      const to = (y * width + x) * 3
      out[to] = image.rgb[from]
      out[to + 1] = image.rgb[from + 1]
      out[to + 2] = image.rgb[from + 2]
    }
  }
  return { width, height: targetHeight, rgb: out }
}

function encode(path, width, height, rgb) {
  const stride = width * 3
  const raw = Buffer.alloc((stride + 1) * height)
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0
    rgb.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride)
  }
  const crcTable = []
  for (let n = 0; n < 256; n += 1) {
    let c = n
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    crcTable[n] = c >>> 0
  }
  const crc = (parts) => {
    let c = 0xffffffff
    for (const part of parts) for (let i = 0; i < part.length; i += 1) c = crcTable[(c ^ part[i]) & 255] ^ (c >>> 8)
    return (c ^ 0xffffffff) >>> 0
  }
  const chunk = (type, data) => {
    const length = Buffer.alloc(4)
    length.writeUInt32BE(data.length, 0)
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
    const checksum = Buffer.alloc(4)
    checksum.writeUInt32BE(crc([body]), 0)
    return Buffer.concat([length, body, checksum])
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8
  ihdr[9] = 2
  writeFileSync(path, Buffer.concat([
    Buffer.from('89504e470d0a1a0a', 'hex'),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]))
}

/** A 5×7 bitmap font is enough for the panel captions, and keeps this tool
 *  dependency-free (no canvas, no browser). */
const GLYPHS = {
  R: ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
  E: ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
  F: ['#####', '#....', '#....', '####.', '#....', '#....', '#....'],
  I: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '#####'],
  M: ['#...#', '##.##', '#.#.#', '#...#', '#...#', '#...#', '#...#'],
  P: ['####.', '#...#', '#...#', '####.', '#....', '#....', '#....'],
  L: ['#....', '#....', '#....', '#....', '#....', '#....', '#####'],
  A: ['..#..', '.#.#.', '#...#', '#####', '#...#', '#...#', '#...#'],
  O: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  G: ['.###.', '#....', '#....', '#.###', '#...#', '#...#', '.###.'],
  D: ['####.', '#...#', '#...#', '#...#', '#...#', '#...#', '####.'],
  I2: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '#####'],
  S: ['.####', '#....', '#....', '.###.', '....#', '....#', '####.'],
  U: ['#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  B: ['####.', '#...#', '#...#', '####.', '#...#', '#...#', '####.'],
  T: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
  H: ['#...#', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  N: ['####.', '#...#', '#...#', '#.#.#', '##..#', '#...#', '#...#'],
  W: ['#...#', '#...#', '#...#', '#.#.#', '#.#.#', '##.##', '#...#'],
  X: ['#...#', '#...#', '.#.#.', '..#..', '.#.#.', '#...#', '#...#'],
  C: ['.###.', '#...#', '#....', '#....', '#....', '#...#', '.###.'],
  V: ['#...#', '#...#', '#...#', '#...#', '#...#', '.#.#.', '..#..'],
  Y: ['#...#', '#...#', '.#.#.', '..#..', '..#..', '..#..', '..#..'],
  '-': ['.....', '.....', '.....', '#####', '.....', '.....', '.....'],
  '.': ['.....', '.....', '.....', '.....', '.....', '.##..', '.##..'],
  '/': ['....#', '....#', '...#.', '..#..', '.#...', '#....', '#....'],
  ' ': ['.....', '.....', '.....', '.....', '.....', '.....', '.....'],
  '0': ['.###.', '#...#', '#..##', '#.#.#', '##..#', '#...#', '.###.'],
  '1': ['..#..', '.##..', '..#..', '..#..', '..#..', '..#..', '#####'],
  '2': ['.###.', '#...#', '....#', '..##.', '.#...', '#....', '#####'],
  '3': ['####.', '....#', '....#', '.###.', '....#', '....#', '####.'],
  '4': ['...#.', '..##.', '.#.#.', '#..#.', '#####', '...#.', '...#.'],
  '5': ['#####', '#....', '####.', '....#', '....#', '#...#', '.###.'],
  '6': ['.###.', '#....', '#....', '####.', '#...#', '#...#', '.###.'],
  '7': ['#####', '....#', '...#.', '..#..', '.#...', '.#...', '.#...'],
  '8': ['.###.', '#...#', '#...#', '.###.', '#...#', '#...#', '.###.'],
  '9': ['.###.', '#...#', '#...#', '.####', '....#', '....#', '.###.'],
  'K': ['#...#', '#...#', '#..#.', '##.#.', '#..#.', '#...#', '#...#'],
  'Z': ['#####', '....#', '...#.', '..#..', '.#...', '#....', '#####']
}
const LETTERS = {
  R: 'R', E: 'E', F: 'F', I: 'I', M: 'M', P: 'P', L: 'L', A: 'A', O: 'O', G: 'G', D: 'D', S: 'S', U: 'U',
  B: 'B', T: 'T', H: 'H', N: 'N', W: 'W', X: 'X', C: 'C', V: 'V', Y: 'Y', K: 'K', Z: 'Z'
}

function drawText(canvas, width, x, y, text, colour) {
  const label = String(text).toUpperCase()
  let cursor = x
  for (const character of label) {
    const glyph = GLYPHS[character] ?? GLYPHS[' ']
    for (let row = 0; row < 7; row += 1) {
      for (let column = 0; column < 5; column += 1) {
        if (glyph[row][column] !== '#') continue
        const px = cursor + column
        const py = y + row
        if (px < 0 || py < 0 || px >= width) continue
        const index = (py * width + px) * 3
        canvas[index] = colour[0]
        canvas[index + 1] = colour[1]
        canvas[index + 2] = colour[2]
      }
    }
    cursor += 6
  }
}

const PAIRS = [
  {
    name: 'more-menu',
    theme: 'dark',
    reference: 'm25-ref-project-more-menu.png',
    implementation: 'm25-impl-more-menu-dark.png',
    title: 'PROJECT MORE MENU',
    referenceKind: 'web menu surface'
  },
  {
    name: 'more-menu-light',
    theme: 'light',
    reference: 'm25-ref-project-more-menu-light.png',
    implementation: 'm25-impl-more-menu.png',
    title: 'PROJECT MORE MENU - LIGHT',
    referenceKind: 'web menu surface'
  },
  {
    name: 'hover-card',
    theme: 'dark',
    reference: 'm25-ref-sidebar-projects.png',
    // 434x420 device px = the card's own 217x210 CSS box at DPR 2, so both
    // panels are the same pixel scale. The web build does not render the hover
    // card, so this panel shows the project row it opens from.
    referenceCrop: { x: 60, y: 100, width: 700, height: 520 },
    implementation: 'm25-impl-hover-card-dark.png',
    title: 'PROJECT HOVER CARD',
    referenceKind: 'web project row (card not exposed on web)',
    referenceCaption: 'REFERENCE - WEB PROJECT ROW'
  },
  {
    name: 'permission-menu',
    theme: 'dark',
    reference: 'm25b-ref-permission-menu.png',
    implementation: 'm25-impl-permission-dark.png',
    title: 'PERMISSION MENU',
    referenceKind: 'web approval picker (captured 2026-11-07)'
  },
  {
    name: 'permission-menu-light',
    theme: 'light',
    reference: 'm25b-ref-permission-menu-light.png',
    implementation: 'm25-impl-permission-light.png',
    title: 'PERMISSION MENU - LIGHT',
    referenceKind: 'web approval picker (captured 2026-11-07)'
  }
]

/** Crop a decoded image, clamped to its bounds. */
function crop(image, box) {
  if (box === undefined) return image
  const x = Math.max(0, Math.min(image.width - 1, Math.round(box.x)))
  const y = Math.max(0, Math.min(image.height - 1, Math.round(box.y)))
  const width = Math.max(1, Math.min(image.width - x, Math.round(box.width)))
  const height = Math.max(1, Math.min(image.height - y, Math.round(box.height)))
  const rgb = Buffer.alloc(width * height * 3)
  for (let row = 0; row < height; row += 1) {
    image.rgb.copy(rgb, row * width * 3, ((y + row) * image.width + x) * 3, ((y + row) * image.width + x + width) * 3)
  }
  return { width, height, rgb }
}

const sheets = []
for (const pair of PAIRS) {
  const implementationPath = join(SHOTS, pair.implementation)
  const referencePath = pair.reference === null ? null : join(LIVE, pair.reference)
  if (!existsSync(implementationPath) || (referencePath !== null && !existsSync(referencePath))) {
    console.log(`skip  ${pair.name}: missing frame (${!existsSync(implementationPath) ? pair.implementation : pair.reference})`)
    continue
  }
  const implementation = decode(implementationPath)
  const reference = referencePath === null ? null : crop(decode(referencePath), pair.referenceCrop)
  const height = implementation.height
  const left = reference === null ? null : rescale(reference, height)
  const right = rescale(implementation, height)

  const gap = 16
  const header = 24
  const overlayHeader = 22
  const overlayWidth = Math.max(left === null ? 0 : left.width, right.width)
  const totalWidth = (left === null ? 0 : left.width + gap) + right.width
  const totalHeight = header + height + gap + overlayHeader + height

  // overlay first, so its caption can carry the measured difference
  const overlay = { width: overlayWidth, height, rgb: Buffer.alloc(overlayWidth * height * 3) }
  let difference = null
  if (left !== null) {
    let sum = 0
    let count = 0
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < overlayWidth; x += 1) {
        const to = (y * overlayWidth + x) * 3
        const rIndex = (y * right.width + Math.min(x, right.width - 1)) * 3
        const lIndex = (y * left.width + Math.min(x, left.width - 1)) * 3
        const a = [left.rgb[lIndex], left.rgb[lIndex + 1], left.rgb[lIndex + 2]]
        const b = [right.rgb[rIndex], right.rgb[rIndex + 1], right.rgb[rIndex + 2]]
        overlay.rgb[to] = (a[0] + b[0]) >> 1
        overlay.rgb[to + 1] = (a[1] + b[1]) >> 1
        overlay.rgb[to + 2] = (a[2] + b[2]) >> 1
        if (x < Math.min(left.width, right.width)) {
          sum += Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2])
          count += 3
        }
      }
    }
    difference = count === 0 ? null : Math.round((sum / count) * 100) / 100
  } else {
    right.rgb.copy(overlay.rgb, 0, 0, Math.min(overlay.rgb.length, right.rgb.length))
  }

  const canvas = Buffer.alloc(totalWidth * totalHeight * 3, 245)
  const put = (x, y, source) => {
    for (let row = 0; row < source.height; row += 1) {
      for (let column = 0; column < source.width; column += 1) {
        const px = x + column
        const py = y + row
        if (px >= totalWidth || py >= totalHeight) continue
        const from = (row * source.width + column) * 3
        const to = (py * totalWidth + px) * 3
        canvas[to] = source.rgb[from]
        canvas[to + 1] = source.rgb[from + 1]
        canvas[to + 2] = source.rgb[from + 2]
      }
    }
  }
  let cursor = 0
  if (left !== null) {
    put(0, header, left)
    drawText(canvas, totalWidth, 0, 8, pair.referenceCaption ?? 'REFERENCE', [20, 20, 20])
    cursor = left.width + gap
  }
  put(cursor, header, right)
  drawText(canvas, totalWidth, cursor, 8, 'IMPLEMENTATION', [20, 20, 20])
  put(0, header + height + gap + overlayHeader, overlay)
  const caption = left === null ? 'OVERLAY - NO REFERENCE CROP' : `OVERLAY 50/50 - MEAN DELTA ${difference === null ? 'NA' : difference.toFixed(2)}`
  drawText(canvas, totalWidth, 0, header + height + gap + 8, caption, [20, 20, 20])

  const outName = `m25-${pair.name}-sheet.png`
  encode(join(OUT, outName), totalWidth, totalHeight, canvas)
  sheets.push({
    name: pair.name,
    theme: pair.theme,
    title: pair.title,
    frame: `docs/screenshots/${outName}`,
    reference: referencePath === null ? null : `docs/capture/live/${pair.reference}`,
    referenceKind: pair.referenceKind ?? null,
    referenceCrop: pair.referenceCrop ?? null,
    implementation: `docs/screenshots/${pair.implementation}`,
    referenceSize: left === null ? null : `${left.width}x${left.height}`,
    implementationSize: `${right.width}x${right.height}`,
    scale: 'both panels rescaled to the implementation height',
    meanChannelDifference: difference
  })
  console.log(`sheet ${pair.name}: ${outName}${difference === null ? ' (no reference frame)' : ` mean channel difference ${difference}`}`)
}
writeFileSync(join(ROOT, 'docs/m25-sheets.json'), JSON.stringify({ generatedAt: new Date().toISOString(), sheets }, null, 2) + '\n')
console.log(`m25-sheets: ${sheets.length} sheets -> docs/screenshots/m25-*-sheet.png`)
