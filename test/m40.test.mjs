#!/usr/bin/env node
/**
 * P0-22 regression guard: project pagination is project-local.
 *
 * Run: node test/m40.test.mjs
 */
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const core = readFileSync(join(ROOT, 'lib/shared/sessions-core.mjs'), 'utf8')
const sessions = readFileSync(join(ROOT, 'lib/client/sessions.js'), 'utf8')
const report = JSON.parse(readFileSync(join(ROOT, 'docs/m40.json'), 'utf8'))
const stripComments = (text) => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

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

check('N=8 and +8 are the project-local constants', () => {
  assert.match(core, /CHATGPT_PROJECT_INITIAL_LIMIT\s*=\s*8/)
  assert.match(core, /CHATGPT_PROJECT_PAGE_SIZE\s*=\s*8/)
  assert.doesNotMatch(core, /CHATGPT_SESSION_INITIAL_LIMIT|CHATGPT_SESSION_PAGE_SIZE|chatgptNextSessionLimit/)
})

check('core slices each project by its own id', () => {
  const source = stripComments(core)
  assert.match(source, /chatgptProjectLimit\(limits\[project\.id\], total\)/)
  assert.match(source, /const rows = project\.rows\.slice\(0, limit\)/)
  assert.match(source, /hidden: total - rows\.length/)
  assert.doesNotMatch(source, /let remaining|const take =|remaining -=/)
})

check('UI owns a per-project map and a project-local button', () => {
  const source = stripComments(sessions)
  assert.match(source, /const \[projectLimits, setProjectLimits\] = chatgptReact\.useState\(\{\}\)/)
  assert.match(source, /chatgptPageSessionSections\(sections, projectLimits, recentLimit\)/)
  assert.match(source, /'data-cgpt-project-load-more': project\.id/)
  assert.match(source, /\[project\.id\]: chatgptNextProjectLimit\(current\[project\.id\], project\.total\)/)
  assert.match(source, /chatgpt-project-load-more/)
  assert.doesNotMatch(source, /data-cgpt-load-more|page\.hidden|加载更多以显示|加载更多项目|setLimit/)
})

check('report records N, isolation shape, and retain policy', () => {
  assert.equal(report.n.value, 8)
  assert.equal(report.n.basis, 'fallback')
  assert.match(report.n.hostProbe, /no per-project first-page constant/)
  assert.match(report.state.projectLimits, /Record<projectId, number>/)
  assert.equal(report.reopen.policy, 'retain')
  assert.equal(report.reopen.verified, true)
})

check('A shows N while B below N is complete; click only grows A', () => {
  const a = report.projects.a
  const b = report.projects.b
  assert.equal(a.before.visible, Math.min(8, a.before.total))
  assert.equal(a.before.total, 9)
  assert.ok(a.before.more !== null)
  assert.equal(a.before.more.id, a.before.id)
  assert.equal(b.before.visible, Math.min(8, b.before.total))
  assert.equal(b.before.more, null)
  assert.equal(a.after.visible, a.before.visible + 1)
  assert.equal(a.after.more, null)
  assert.deepEqual(b.after, b.before)
  assert.deepEqual(report.recent.after, report.recent.before)
  assert.deepEqual(report.pinned.after, report.pinned.before)
})

check('no project has rows but only a load-more placeholder', () => {
  assert.equal(report.errors.length, 0)
  for (const project of [report.projects.a, report.projects.b]) {
    for (const phase of ['before', 'after', 'reopened']) {
      const view = project[phase]
      assert.ok(view.total > 0 ? view.visible > 0 : view.visible === 0)
      assert.ok(view.visible === Math.min(8, view.total) || view.visible > 8)
    }
  }
  assert.equal(report.projects.a.before.more.text, '显示更多（剩余 1）')
  assert.ok(report.assertions.every((entry) => entry.ok === true))
})

check('collapse/reopen retains A and leaves B/recent alone', () => {
  assert.equal(report.projects.a.reopened.visible, report.projects.a.after.visible)
  assert.equal(report.projects.a.reopened.more, null)
  assert.deepEqual(report.projects.b.reopened, report.projects.b.before)
  assert.deepEqual(report.recent.reopened, report.recent.before)
  assert.equal(report.recent.unchanged, true)
})

check('m40 evidence images exist and are not empty', () => {
  const required = [
    'm40-sidebar-before.png',
    'm40-a-before.png',
    'm40-b-before.png',
    'm40-recent-before.png',
    'm40-a-after.png',
    'm40-b-after.png',
    'm40-sidebar-after.png',
    'm40-recent-after.png',
    'm40-a-collapsed.png',
    'm40-a-reopened.png'
  ]
  assert.deepEqual(report.screenshots.map((shot) => shot.name), required)
  for (const shot of report.screenshots) {
    const path = join(ROOT, 'docs', shot.path)
    assert.ok(existsSync(path), path)
    assert.ok(readFileSync(path).length > 1000, path)
  }
})

console.log(`m40: ${checks}/${checks} checks passed`)
