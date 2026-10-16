import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { writeReport } from './report.mjs'

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url))
const scriptPath = fileURLToPath(new URL('./report.mjs', import.meta.url))

/** @param {import('node:test').TestContext} t */
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bundle-report-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const measurements = {
    schemaVersion: 1,
    benchmarkName: 'Bundle Size (gzip)',
    measuredAt: '2026-01-01T00:00:00.000Z',
    status: {
      state: 'success',
      durationMs: 123,
      measuredScenarios: ['react-router.minimal'],
    },
    metrics: [{ id: 'react-router.minimal', gzipBytes: 100 }],
  }
  const serialized = JSON.stringify(measurements)
  fs.writeFileSync(path.join(root, 'measurements.json'), serialized)
  fs.writeFileSync(path.join(root, 'benchmark-action.json'), '[]\n')
  return { root, measurements, serialized }
}

test('refreshes commit metadata without modifying cached measurements or their timestamps', (t) => {
  const { root, measurements, serialized } = fixture(t)
  writeReport(root, { sha: 'old-commit' })
  const startedAt = Date.now()
  const report = writeReport(root, { sha: 'new-commit' })
  assert.equal(report.sha, 'new-commit')
  assert.deepEqual(report.status.git, {
    sha: 'new-commit',
    branch: execFileSync('git', ['branch', '--show-current'], {
      cwd: repoRoot,
      encoding: 'utf8',
    }).trim(),
    dirty:
      execFileSync('git', ['status', '--porcelain'], {
        cwd: repoRoot,
        encoding: 'utf8',
      }).trim().length > 0,
  })
  assert.equal(report.measuredAt, measurements.measuredAt)
  assert.equal(report.status.durationMs, measurements.status.durationMs)
  assert.deepEqual(report.metrics, measurements.metrics)
  assert.ok(Date.parse(report.generatedAt) >= startedAt)
  assert.deepEqual(
    JSON.parse(fs.readFileSync(path.join(root, 'current.json'), 'utf8')),
    report,
  )
  assert.equal(
    fs.readFileSync(path.join(root, 'measurements.json'), 'utf8'),
    serialized,
  )
  assert.equal(
    fs.readFileSync(path.join(root, 'benchmark-action.json'), 'utf8'),
    '[]\n',
  )
})

test('CLI uses the current CI SHA, an explicit override, or the checkout SHA', (t) => {
  const { root } = fixture(t)
  const checkoutSha = execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: repoRoot,
    encoding: 'utf8',
  }).trim()
  /** @type {Array<[string, string[], string]>} */
  const cases = [
    ['ci-commit', [], 'ci-commit'],
    ['ci-commit', ['--sha', 'explicit-commit'], 'explicit-commit'],
    ['', [], checkoutSha],
  ]
  for (const [githubSha, args, expected] of cases) {
    const result = spawnSync(
      process.execPath,
      [scriptPath, '--results-dir', root, ...args],
      {
        env: { ...process.env, GITHUB_SHA: githubSha },
        encoding: 'utf8',
      },
    )
    assert.equal(result.status, 0, result.stderr)
    const report = JSON.parse(
      fs.readFileSync(path.join(root, 'current.json'), 'utf8'),
    )
    assert.equal(report.sha, expected)
    assert.equal(report.status.git.sha, expected)
  }
})

test('fails when cached measurements are missing instead of reusing an old report', (t) => {
  const { root } = fixture(t)
  fs.rmSync(path.join(root, 'measurements.json'))
  fs.writeFileSync(path.join(root, 'current.json'), '{"sha":"old-commit"}')
  const result = spawnSync(
    process.execPath,
    [scriptPath, '--results-dir', root],
    { encoding: 'utf8' },
  )
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /measurements\.json/)
})
