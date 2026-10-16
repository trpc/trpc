import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import test from 'node:test'

const execFileAsync = promisify(execFile)
const reportScript = new URL('./pr-report.mjs', import.meta.url)

function metric(id, gzipBytes, overrides = {}) {
  return {
    id,
    gzipBytes,
    rawBytes: gzipBytes * 3,
    brotliBytes: gzipBytes - 100,
    initialGzipBytes: gzipBytes - 10,
    ...overrides,
  }
}

function historyBench(value) {
  return {
    name: value.id,
    value: value.gzipBytes,
    extra: `raw=${value.rawBytes}; brotli=${value.brotliBytes}; initial_gzip=${value.initialGzipBytes}`,
  }
}

async function generateReport({ current, baseline, history, baseSha }) {
  const fixtureDir = await fs.mkdtemp(
    path.join(os.tmpdir(), 'bundle-size-pr-report-'),
  )

  try {
    const currentPath = path.join(fixtureDir, 'current.json')
    const outputPath = path.join(fixtureDir, 'report.md')
    const args = [
      reportScript.pathname,
      '--current',
      currentPath,
      '--output',
      outputPath,
    ]

    await fs.writeFile(currentPath, JSON.stringify(current))

    if (baseline) {
      const baselinePath = path.join(fixtureDir, 'baseline.json')
      await fs.writeFile(baselinePath, JSON.stringify(baseline))
      args.push('--baseline', baselinePath)
    }

    if (history) {
      const historyPath = path.join(fixtureDir, 'history.json')
      await fs.writeFile(historyPath, JSON.stringify(history))
      args.push('--history', historyPath)
    }

    if (baseSha) {
      args.push('--base-sha', baseSha)
    }

    await execFileAsync(process.execPath, args)
    return await fs.readFile(outputPath, 'utf8')
  } finally {
    await fs.rm(fixtureDir, { recursive: true, force: true })
  }
}

function currentJson(metrics) {
  return {
    benchmarkName: 'Bundle Size (gzip)',
    measuredAt: '2026-07-19T09:45:56.787Z',
    sha: '126aa13f296b1234',
    metrics,
  }
}

test('renders a concise message when no measured scenario changed', async () => {
  const current = currentJson([metric('react-router.minimal', 1_000)])
  const report = await generateReport({ current, baseline: current })

  assert.equal(
    report,
    '<!-- bundle-size-benchmark -->\n## Bundle Size Benchmarks\n\nThis pull request does not affect bundle size in any measured scenario.\n',
  )
})

test('renders only scenarios that changed against the historical baseline', async () => {
  const unchangedMetric = metric('react-router.minimal', 1_000)
  const baselineMetric = metric('react-router.full', 1_100)
  const current = currentJson([
    unchangedMetric,
    metric('react-router.full', 1_200),
  ])
  const history = {
    entries: {
      [current.benchmarkName]: [
        {
          commit: { id: 'baseline-sha' },
          benches: [
            historyBench(unchangedMetric),
            historyBench(baselineMetric),
          ],
        },
      ],
    },
  }
  const report = await generateReport({
    current,
    history,
    baseSha: 'baseline-sha',
  })

  assert.match(
    report,
    /The following scenarios have bundle-size changes compared with the baseline:/,
  )
  assert.doesNotMatch(report, /`react-router\.minimal`/)
  assert.match(
    report,
    /\| Scenario \| Current \(gzip\) \| Initial \(gzip\) \| Raw \| Brotli \| Trend \|/,
  )
  assert.doesNotMatch(report, /Delta vs baseline|%/)
  assert.match(
    report,
    /\| `react-router\.full` \| 1\.2&nbsp;KiB<br>\+100&nbsp;B \| 1\.2&nbsp;KiB<br>\+100&nbsp;B \| 3\.5&nbsp;KiB<br>\+300&nbsp;B \| 1\.1&nbsp;KiB<br>\+100&nbsp;B \| <pre>▁█<\/pre> \|/,
  )
})

test('keeps scenarios that do not have baseline data visible', async () => {
  const current = currentJson([
    metric('react-router.minimal', 1_000),
    metric('new-scenario', 900),
  ])
  const baseline = currentJson([metric('react-router.minimal', 1_000)])
  const report = await generateReport({ current, baseline })

  assert.match(
    report,
    /The following scenarios have bundle-size changes or lack baseline data for comparison:/,
  )
  assert.doesNotMatch(report, /`react-router\.minimal`/)
  assert.match(
    report,
    /\| `new-scenario` \| 900&nbsp;B<br>n\/a \| 890&nbsp;B<br>n\/a \| 2\.6&nbsp;KiB<br>n\/a \| 800&nbsp;B<br>n\/a \|/,
  )
})

test('renders scenarios when only a secondary metric changed', async () => {
  const baselineMetric = metric('react-router.minimal', 1_000)
  const current = currentJson([
    metric('react-router.minimal', 1_000, { rawBytes: 3_002 }),
  ])
  const baseline = currentJson([baselineMetric])
  const report = await generateReport({ current, baseline })

  assert.match(
    report,
    /\| `react-router\.minimal` \| 1,000&nbsp;B<br>0&nbsp;B \| 990&nbsp;B<br>0&nbsp;B \| 2\.9&nbsp;KiB<br>\+2&nbsp;B \| 900&nbsp;B<br>0&nbsp;B \|/,
  )
})
