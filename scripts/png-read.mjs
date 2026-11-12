// Minimal PNG reader for 8-bit RGB/RGBA, non-interlaced captures.
// Used by the M10 pixel-alignment step to measure committed reference frames
// without launching a browser (and therefore without writing outside the repo).
import { inflateSync } from 'node:zlib'
import { readFileSync } from 'node:fs'

export function readPng(path) {
  const buf = readFileSync(path)
  if (buf.slice(0, 8).toString('hex') !== '89504e470d0a1a0a') throw new Error(`not a png: ${path}`)
  let offset = 8
  let width = 0
  let height = 0
  let bitDepth = 0
  let colorType = 0
  let interlace = 0
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
      interlace = data[12]
    } else if (type === 'IDAT') {
      idat.push(data)
    } else if (type === 'IEND') {
      break
    }
    offset += length + 12
  }
  if (bitDepth !== 8 || interlace !== 0 || (colorType !== 2 && colorType !== 6)) {
    throw new Error(`unsupported png (depth=${bitDepth} color=${colorType} interlace=${interlace})`)
  }
  const channels = colorType === 6 ? 4 : 3
  const raw = inflateSync(Buffer.concat(idat))
  const stride = width * channels
  const out = Buffer.alloc(stride * height)
  let source = 0
  for (let y = 0; y < height; y += 1) {
    const filter = raw[source]
    source += 1
    const rowStart = y * stride
    const prevStart = (y - 1) * stride
    for (let x = 0; x < stride; x += 1) {
      const value = raw[source + x]
      const left = x >= channels ? out[rowStart + x - channels] : 0
      const up = y > 0 ? out[prevStart + x] : 0
      const upLeft = y > 0 && x >= channels ? out[prevStart + x - channels] : 0
      let result
      if (filter === 0) result = value
      else if (filter === 1) result = value + left
      else if (filter === 2) result = value + up
      else if (filter === 3) result = value + ((left + up) >> 1)
      else if (filter === 4) {
        const p = left + up - upLeft
        const pa = Math.abs(p - left)
        const pb = Math.abs(p - up)
        const pc = Math.abs(p - upLeft)
        result = value + (pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft)
      } else throw new Error(`bad filter ${filter}`)
      out[rowStart + x] = result & 0xff
    }
    source += stride
  }
  return {
    width,
    height,
    channels,
    data: out,
    pixel(x, y) {
      const at = (y * width + x) * channels
      return [out[at], out[at + 1], out[at + 2]]
    }
  }
}

// Bounding box of pixels matching `match`, scanned inside an optional window.
export function findBox(image, match, window = null) {
  const x0 = window?.x0 ?? 0
  const y0 = window?.y0 ?? 0
  const x1 = window?.x1 ?? image.width - 1
  const y1 = window?.y1 ?? image.height - 1
  let minX = Infinity
  let minY = Infinity
  let maxX = -1
  let maxY = -1
  let count = 0
  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      if (match(image.pixel(x, y), x, y)) {
        count += 1
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }
  if (!count) return null
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1, count }
}

export const isWhite = ([r, g, b]) => r >= 250 && g >= 250 && b >= 250
export const isNear = (rgb, target, tolerance = 3) =>
  Math.abs(rgb[0] - target[0]) <= tolerance &&
  Math.abs(rgb[1] - target[1]) <= tolerance &&
  Math.abs(rgb[2] - target[2]) <= tolerance

// Minimal RGB PNG encoder (filter 0) for evidence crops and composites.
import { deflateSync } from 'node:zlib'
import { writeFileSync } from 'node:fs'

function crc32(buffer) {
  let crc = 0xffffffff
  for (const byte of buffer) {
    crc ^= byte
    for (let k = 0; k < 8; k += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1))
  }
  return (crc ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length, 0)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body), 0)
  return Buffer.concat([length, body, crc])
}

export function writePng(path, width, height, rgb) {
  const stride = width * 3
  const raw = Buffer.alloc((stride + 1) * height)
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0
    rgb.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride)
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8
  ihdr[9] = 2
  const png = Buffer.concat([
    Buffer.from('89504e470d0a1a0a', 'hex'),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ])
  writeFileSync(path, png)
  return png.length
}
