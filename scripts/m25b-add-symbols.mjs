#!/usr/bin/env node
/**
 * scripts/m25b-add-symbols.mjs — P0-13b: add the two reference glyphs the
 * desktop menus use but the P0-13 capture did not request.
 *
 *   codex-icon-pencil-light-20   → project ⋯ menu「编辑」(reference: pencil, not the
 *                                  web 项目设置 gear)
 *
 * The permission menu's three glyphs are NOT sprite symbols: the live menu
 * renders inline 20-viewBox SVGs, captured verbatim in
 * `docs/capture/live/m25b-permission.json` and consumed by
 * `scripts/build-menu-icons.mjs` as `kind: 'menuIcon'`.
 *
 * Read-only: it only GETs the sprite file the reference page itself loads
 * (`capture.sprite.spriteUrl`, a public, content-hashed asset) and copies the
 * two `<symbol>` bodies verbatim into `docs/capture/live/project-menus.json`.
 * Nothing is drawn or edited by hand; the paths stay byte-identical.
 *
 *   node scripts/m25b-add-symbols.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const CAPTURE = join(ROOT, 'docs/capture/live/project-menus.json')
const WANTED = ['codex-icon-pencil-light-20']

const capture = JSON.parse(readFileSync(CAPTURE, 'utf8'))
const spriteUrl = capture.sprite.spriteUrl
if (typeof spriteUrl !== 'string' || spriteUrl === '') {
  throw new Error('m25b-add-symbols: capture.sprite.spriteUrl is missing')
}
const url = new URL(spriteUrl, 'https://chatgpt.com').toString()
const response = await fetch(url)
if (!response.ok) throw new Error(`m25b-add-symbols: GET ${url} → ${response.status}`)
const text = await response.text()

const symbols = capture.sprite.symbols
const added = []
for (const id of WANTED) {
  if (symbols[id] !== undefined) {
    console.log(`skip   ${id}: already captured`)
    continue
  }
  const match = text.match(new RegExp(`<symbol\\b[^>]*id="${id}"[^>]*>([\\s\\S]*?)</symbol>`))
  if (match === null) throw new Error(`m25b-add-symbols: ${id} is not in ${url}`)
  const tag = text.slice(text.indexOf(match[0]), text.indexOf(match[0]) + match[0].indexOf('>'))
  const viewBox = (tag.match(/viewBox="([^"]+)"/) ?? [])[1]
  const fill = (tag.match(/\bfill="([^"]+)"/) ?? [])[1] ?? null
  if (viewBox === undefined) throw new Error(`m25b-add-symbols: ${id} has no viewBox`)
  const inner = match[1].trim()
  const paths = [...inner.matchAll(/<path\b[^>]*?\sd="([^"]+)"[^>]*>/g)].map((path) => {
    const attrs = path[0]
    return {
      d: path[1],
      fillRule: (attrs.match(/fill-rule="([^"]+)"/) ?? [])[1] ?? null,
      clipRule: (attrs.match(/clip-rule="([^"]+)"/) ?? [])[1] ?? null
    }
  })
  if (paths.length === 0) throw new Error(`m25b-add-symbols: ${id} has no <path d>`)
  symbols[id] = { viewBox, fill, inner, paths }
  added.push({ id, viewBox, fetchedAt: new Date().toISOString(), url })
  console.log(`add    ${id} (${viewBox})`)
}
if (added.length === 0) {
  console.log('m25b-add-symbols: nothing to do')
} else {
  capture.sprite.addedSymbols = [...(capture.sprite.addedSymbols ?? []), ...added]
  writeFileSync(CAPTURE, JSON.stringify(capture, null, 2) + '\n')
  console.log(`m25b-add-symbols: ${added.length} symbol(s) → docs/capture/live/project-menus.json`)
}
