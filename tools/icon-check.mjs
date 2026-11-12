#!/usr/bin/env node
/**
 * tools/icon-check.mjs — the Module 6 icon acceptance gate.
 *
 * This is a thin wrapper around the measured pixel-diff renderer: every rail
 * glyph (default + selected) is drawn from the captured sprite symbol and from
 * the shipped `lib/client/rail-icons.js` at its real 20×20 viewBox, enlarged
 * 4×, then compared pixel by pixel. Output is `docs/icon-check.json` and
 * `docs/screenshots/icon-check-<glyph>[-selected].png` (implementation |
 * reference | heatmap). The renderer is shared with the Phase 5 tool so both
 * checks use exactly the same mask and threshold.
 *
 * Usage: node tools/icon-check.mjs [--url http://127.0.0.1:PORT/?token=…]
 *        [--threshold 2] [--allow-diff] [--playwright /path/to/playwright]
 */

import { spawnSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
const forwarded = []
for (let index = 0; index < args.length; index += 1) {
  const token = args[index]
  if (!token.startsWith('--')) continue
  forwarded.push(token)
  const next = args[index + 1]
  if (next !== undefined && !next.startsWith('--')) {
    forwarded.push(next)
    index += 1
  }
}

const result = spawnSync(
  process.execPath,
  [
    join(ROOT, 'tools/icon-diff.mjs'),
    '--prefix',
    'icon-check',
    '--json',
    'icon-check.json',
    '--scale',
    '4',
    ...forwarded
  ],
  { cwd: ROOT, stdio: 'inherit' }
)

if (result.error !== undefined) {
  console.error(`icon-check: cannot start renderer: ${result.error.message}`)
  process.exit(2)
}
process.exit(result.status ?? 1)
