#!/usr/bin/env node
/**
 * P4-b regression guard: the model/effort panel is anchored to its trigger.
 *
 * Four things the user reported, all covered here:
 *   1. the panel's right edge sits on the pill (not the composer card) and its
 *      near edge keeps the 8px reference gap; it overlaps the card when above;
 *   2. the blank hero opens downwards, a started conversation upwards, and the
 *      side flips only when the preferred side has no room (600px / 320px);
 *   3. the nested model list keeps that side and grows from the same edge;
 *   4. the list scrolls inside the panel's gutter and its rows are 32px.
 *
 * Geometry comes from docs/p4b.json + docs/screenshots (local-only evidence,
 * captured by tools/p4b-capture.mjs). Missing evidence skips the suite.
 *
 * Run: node test/p4b.test.mjs
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { exists, loc, skipSuite } from './evidence.mjs'

skipSuite(import.meta.url)

const composer = readFileSync(loc('lib/client/composer.js'), 'utf8')
const css = readFileSync(loc('lib/client/css/65-work-card.css'), 'utf8')
const overlay = readFileSync(loc('lib/client/css/76-overlay.css'), 'utf8')
const report = JSON.parse(readFileSync(loc('docs/p4b.json'), 'utf8'))

let checks = 0
const check = (name, fn) => {
  try {
    fn()
    checks += 1
    console.log(`ok ${checks} - ${name}`)
  } catch (reason) {
    console.error(`not ok ${checks + 1} - ${name}`)
    throw reason
  }
}

const near = (value, target, tolerance = 1) => Math.abs(value - target) <= tolerance
const aligned = (diff) => Math.abs(diff) <= 1
const inGap = (value, min = 7, max = 9) => value >= min && value <= max

// 1. Source contract: the trigger-anchored placement, not the card-anchored one.
check('placement: right edge is the trigger right edge, not the card', () => {
  const helper = composer.slice(composer.indexOf('function chatgptPopoverForTrigger'), composer.indexOf('function chatgptPanelRoom'))
  assert.match(helper, /anchor\.right - width/)
  assert.doesNotMatch(helper, /card\.right|data-composer-card/)
  assert.match(composer, /const CHATGPT_PANEL_GAP = 8/)
})

check('placement: the near edge keeps the 8px gap on either side', () => {
  const helper = composer.slice(composer.indexOf('function chatgptPopoverForTrigger'), composer.indexOf('function chatgptPanelRoom'))
  assert.match(helper, /const gap = CHATGPT_PANEL_GAP/)
  assert.match(helper, /const below = anchor\.bottom \+ gap/)
  assert.match(helper, /anchor\.top - gap - height/)
})

check('placement: flips only when the preferred side has no room, lock keeps it', () => {
  const helper = composer.slice(composer.indexOf('function chatgptPopoverForTrigger'), composer.indexOf('function chatgptPanelRoom'))
  assert.match(helper, /preferred === 'below' && !fitsBelow && fitsAbove/)
  assert.match(helper, /preferred === 'above' && !fitsAbove && fitsBelow/)
  assert.match(helper, /options\.lock !== true/)
})

check('direction: blank hero prefers below, started conversation above', () => {
  assert.match(composer, /function chatgptComposerIsHero\(trigger\)/)
  assert.match(composer, /closest\("\[class\*='_composerHero'\]"\)/)
  assert.match(composer, /direction: chatgptComposerIsHero\(trigger\) \? 'below' : 'above'/)
  assert.match(composer, /'data-cgpt-panel-side'/)
})

check('list: keeps the panel side, capped by the room on that side', () => {
  assert.match(composer, /const direction = position\?\.direction \?\? \(chatgptComposerIsHero\(triggerRef\.current\) \? 'below' : 'above'\)/)
  assert.match(composer, /chatgptPanelRoom\(rect, direction\)/)
  assert.match(composer, /setPanelMax\(room\)/)
  assert.match(composer, /'--cgpt-model-panel-max'/)
})

// 2. CSS contract: the panel clips, the inner list scrolls inside the gutter.
check('css: the panel no longer scrolls itself', () => {
  assert.match(css, /\.chatgpt-model-menu\[data-view='advanced'\] \{[^}]*max-height: var\(--cgpt-model-panel-max, 420px\)[^}]*overflow: hidden/)
  assert.match(overlay, /\.chatgpt-model-menu\[data-view='advanced'\] \{\s*padding: var\(--cgpt-menu-gutter\)/)
})

check('css: the inner list scrolls with a 20px gutter subtraction', () => {
  assert.match(css, /\.chatgpt-model-advanced \{[^}]*padding: 4px 0[^}]*max-height: calc\(var\(--cgpt-model-panel-max, 420px\) - 20px\)[^}]*overflow-y: auto/)
  assert.match(css, /\.chatgpt-model-advanced::-webkit-scrollbar \{[^}]*width: 8px/)
})

check('css: 32px rows (32px hit area) and 26px provider headers', () => {
  assert.match(css, /\.chatgpt-model-choice \{[^}]*height: 32px[^}]*min-height: 32px[^}]*padding: 0 10px/)
  assert.match(css, /\.chatgpt-model-group-title \{[^}]*height: 26px[^}]*padding: 0 10px/)
})

// 3. Measured geometry — existing conversation.
check('evidence: an existing conversation opens above, right edge on the pill', () => {
  const simple = report.existing.simple
  assert.equal(simple.side, 'above')
  assert.ok(aligned(simple.rightDiff), `rightDiff ${simple.rightDiff}`)
  assert.ok(inGap(simple.bottomGap), `bottomGap ${simple.bottomGap}`)
})

check('evidence: the panel overlaps the composer card instead of clearing it', () => {
  assert.ok(report.existing.simple.cardOverlap > 0, `cardOverlap ${report.existing.simple.cardOverlap}`)
  assert.equal(report.existing.simple.panelInsideViewport, true)
})

// 4. Measured geometry — blank hero.
check('evidence: the blank hero opens below with the same right edge', () => {
  const simple = report.blank.simple
  assert.equal(simple.side, 'below')
  assert.ok(aligned(simple.rightDiff), `rightDiff ${simple.rightDiff}`)
  assert.ok(inGap(simple.topGap), `topGap ${simple.topGap}`)
  assert.equal(simple.panelInsideViewport, true)
})

// 5. Nested list: same side, same edge, same right edge.
check('evidence: the list opens on the panel side and shares its anchored edge', () => {
  for (const state of [report.existing, report.blank]) {
    assert.equal(state.list.side, state.simple.side)
    assert.ok(aligned(state.list.rightDiff), `rightDiff ${state.list.rightDiff}`)
    assert.equal(state.list.anchoredToSimpleEdge, true)
    assert.ok(near(state.list.listEdge, state.list.simpleEdge), `${state.list.listEdge} vs ${state.list.simpleEdge}`)
    assert.equal(state.list.rows, 21)
    assert.equal(state.list.groups, 3)
  }
})

check('evidence: rows are 32px high (the pre-change row was 40)', () => {
  assert.equal(report.before.rowHeight, 40)
  for (const state of [report.existing.list, report.blank.list]) {
    assert.equal(state.row.height, '32px')
    assert.equal(state.row.minHeight, '32px')
    assert.equal(state.groupTitle.height, '26px')
  }
})

// 6. Scrollbar containment.
check('evidence: the scroller is 10px inside the panel on both open sides', () => {
  for (const state of [report.existing.list, report.blank.list]) {
    const scroll = state.scroll
    assert.ok(near(state.panel.right - scroll.right, 10), `right inset ${state.panel.right - scroll.right}`)
    assert.ok(near(state.panel.bottom - scroll.bottom, 10), `bottom inset ${state.panel.bottom - scroll.bottom}`)
    assert.ok(near(scroll.x - state.panel.x, 10), `left inset ${scroll.x - state.panel.x}`)
    assert.equal(state.panelOverflow, 'hidden')
    assert.equal(state.panelPadding, '10px')
  }
})

check('evidence: the list really overflows and the scrollbar has a classic width', () => {
  const list = report.existing.list
  assert.ok(list.scroll.scrollHeight > list.scroll.clientHeight)
  assert.equal(list.scroll.scrollbarWidth, 8)
  assert.equal(list.scroll.overflowY, 'auto')
  assert.equal(list.scrolledToEnd.scrollTop, list.scrolledToEnd.maxScrollTop)
  assert.ok(list.scrolledToEnd.maxScrollTop > 0)
})

// 7. Boundary cases.
check('evidence: at 600px the blank panel still opens below and fits', () => {
  const { simple, list } = report.boundary600
  assert.equal(report.boundary600.staysBelow, true)
  assert.equal(simple.side, 'below')
  assert.equal(list.side, 'below')
  assert.equal(simple.panelInsideViewport, true)
  assert.ok(simple.panel.bottom <= 600 - 8, `panel bottom ${simple.panel.bottom}`)
  assert.ok(list.panel.bottom <= 600 - 8, `list bottom ${list.panel.bottom}`)
})

check('evidence: at 320px the downward side has no room and flips above', () => {
  const boundary = report.boundary320
  assert.equal(boundary.flipped, true)
  assert.equal(boundary.simple.side, 'above')
  assert.ok(boundary.roomBelow < boundary.simpleHeight, `room ${boundary.roomBelow} / panel ${boundary.simpleHeight}`)
  assert.ok(boundary.simple.panel.y >= 8)
  assert.ok(aligned(boundary.simple.rightDiff), `rightDiff ${boundary.simple.rightDiff}`)
})

check('evidence: alignment survives the sidebar collapsing and reopening', () => {
  for (const key of ['expanded', 'collapsed', 'reopened']) {
    const state = report.sidebar[key]
    assert.ok(aligned(state.rightDiff), `${key} rightDiff ${state.rightDiff}`)
    assert.equal(state.side, 'above')
    assert.ok(inGap(state.bottomGap), `${key} bottomGap ${state.bottomGap}`)
  }
})

// 8. Evidence completeness: every frame the report claims exists.
check('evidence: all screenshots are present', () => {
  assert.ok(report.screenshots.length >= 8, `screenshots ${report.screenshots.length}`)
  for (const shot of report.screenshots) {
    assert.ok(exists(shot), `missing ${shot}`)
  }
})

check('evidence: no page errors during capture', () => {
  for (const key of ['existing', 'blank', 'boundary600', 'boundary320', 'sidebar']) {
    assert.deepEqual(report[key].errors, [])
  }
})

check('evidence: the capture ran against an isolated instance, not 3080', () => {
  assert.notEqual(report.meta.instance.port, '3080')
  assert.equal(report.meta.instance.host, '127.0.0.1')
})

console.log(`${checks} checks passed`)
