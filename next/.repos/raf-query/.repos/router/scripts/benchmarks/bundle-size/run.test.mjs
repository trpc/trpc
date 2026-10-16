import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { run } from './run.mjs'

const scriptPath = fileURLToPath(new URL('./run.mjs', import.meta.url))
const measurePath = fileURLToPath(new URL('./measure.mjs', import.meta.url))

/** @param {string} filePath */
function writeCurrent(
  filePath,
  gzipBytes = 100,
  ids = ['react-router.minimal'],
) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(
    filePath,
    JSON.stringify({
      metrics: ids.map((id) => ({
        id,
        gzipBytes,
        initialGzipBytes: gzipBytes,
        rawBytes: gzipBytes * 3,
        brotliBytes: gzipBytes - 10,
      })),
    }),
  )
}

/** @param {import('node:test').TestContext} t */
function fixture(t, measuredIds = ['react-router.minimal']) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bundle-runner-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  /** @type {Array<{command: string, args: string[], options: import('./run.mjs').CommandOptions}>} */
  const calls = []
  /** @type {string[]} */
  const messages = []
  /** @type {string[]} */
  const reports = []
  t.mock.method(
    console,
    'error',
    /** @param {string} message */
    (message) => messages.push(message),
  )

  /** @type {import('./run.mjs').Execute} */
  const execute = (command, args, options) => {
    calls.push({ command, args, options })
    if (args[0] === measurePath) {
      const outputDir = args[args.indexOf('--results-dir') + 1]
      assert.ok(outputDir)
      writeCurrent(path.join(outputDir, 'current.json'), 90, measuredIds)
    }
    if (options.stdio !== 'inherit') {
      fs.writeSync(options.stdio[1], 'noisy stdout\n')
      fs.writeSync(options.stdio[2], 'noisy stderr\n')
      return { status: 0 }
    }
    const result = spawnSync(command, args, {
      ...options,
      stdio: 'pipe',
      encoding: 'utf8',
    })
    reports.push(result.stdout)
    return result
  }

  return { root, calls, messages, reports, execute }
}

test('runs targeted tests before measurement and saves named results and logs', (t) => {
  const { root, calls, messages, reports, execute } = fixture(t)
  const status = run(
    [
      '--results-dir',
      root,
      '--name',
      'baseline',
      '--scenario',
      'react-router.minimal,react-router.full',
      '--test-projects',
      '@tanstack/router-core,@tanstack/react-router',
      '--',
      'tests/path.test.ts',
      'tests/link.test.tsx',
      '-t',
      'links with spaces',
    ],
    execute,
  )

  assert.equal(status, 0)
  assert.equal(calls.length, 3)
  const [tests, measure] = calls
  assert.ok(tests && measure)
  assert.ok(tests.args.includes('--target=test:unit'))
  assert.ok(tests.args.includes('--parallel=1'))
  assert.ok(tests.args.includes('--skipRemoteCache'))
  assert.ok(
    tests.args.includes(
      '--projects=@tanstack/router-core,@tanstack/react-router',
    ),
  )
  assert.deepEqual(tests.args.slice(-5), [
    '--',
    'tests/path.test.ts',
    'tests/link.test.tsx',
    '-t',
    'links with spaces',
  ])
  assert.equal(measure.args[0], measurePath)
  assert.ok(measure.args.includes('react-router.minimal,react-router.full'))
  assert.ok(!measure.args.includes('--skip-package-builds'))
  assert.ok(!measure.args.includes('--timings'))
  assert.ok(!measure.args.includes('tests/path.test.ts'))
  for (const { options } of calls) {
    assert.equal(options.env.CI, '1')
    assert.equal(options.env.NX_DAEMON, 'false')
    assert.ok(!('shell' in options))
  }
  const runDir = path.join(root, 'runs/baseline')
  assert.ok(fs.existsSync(path.join(runDir, 'current.json')))
  for (const step of ['tests', 'measure']) {
    assert.equal(
      fs.readFileSync(path.join(runDir, `${step}.log`), 'utf8'),
      'noisy stdout\nnoisy stderr\n',
    )
  }
  assert.ok(messages.every((message) => !message.includes('noisy')))
  assert.match(reports.join(''), /react-router\.minimal gzip=90/)
})

test('compares a named baseline against current results without changing the baseline', (t) => {
  const { root, reports, execute } = fixture(t)
  const baseline = path.join(root, 'runs/baseline/current.json')
  writeCurrent(baseline)

  assert.equal(
    run(['--results-dir', root, '--baseline', 'baseline'], execute),
    0,
  )
  assert.match(
    reports.join(''),
    /react-router\.minimal 100 -> 90 \(-10\) initial=-10 raw=-30 brotli=-10/,
  )
  assert.equal(
    JSON.parse(fs.readFileSync(baseline, 'utf8')).metrics[0].gzipBytes,
    100,
  )
})

test('accepts an external baseline and forwards measurement options', (t) => {
  const { root, calls, reports, execute } = fixture(t)
  const baseline = path.join(root, 'external baseline.json')
  writeCurrent(baseline)

  assert.equal(
    run(
      [
        '--results-dir',
        root,
        '--baseline',
        baseline,
        '--dist-dir',
        path.join(root, 'dist with spaces'),
        '--analysis',
        '--sourcemap',
        '--timings',
        '--skip-package-builds',
      ],
      execute,
    ),
    0,
  )
  assert.deepEqual(calls[0]?.args.slice(3), [
    '--dist-dir',
    path.join(root, 'dist with spaces'),
    '--analysis',
    '--sourcemap',
    '--timings',
    '--skip-package-builds',
  ])
  assert.ok(calls.slice(1).every(({ args }) => !args.includes('--timings')))
  assert.match(reports.join(''), /100 -> 90 \(-10\)/)
})

test('targeted comparisons omit unrequested scenarios from a broader baseline', async (t) => {
  for (const [
    scenario,
    measuredIds,
  ] of /** @type {Array<[string, string[]]>} */ ([
    ['react-router.minimal', ['react-router.minimal']],
    ['react-router-minimal', ['react-router.minimal']],
    [
      ' solid-router.minimal, react-router.minimal ',
      ['solid-router.minimal', 'react-router.minimal'],
    ],
  ])) {
    await t.test(scenario, (t) => {
      const { root, reports, execute } = fixture(t, measuredIds)
      writeCurrent(path.join(root, 'runs/baseline/current.json'), 100, [
        'react-router.full',
        'react-router.minimal',
        'solid-router.minimal',
      ])

      assert.equal(
        run(
          [
            '--results-dir',
            root,
            '--baseline',
            'baseline',
            '--scenario',
            scenario,
          ],
          execute,
        ),
        0,
      )
      assert.equal(
        reports.join(''),
        [...measuredIds]
          .sort()
          .map((id) => `${id} 100 -> 90 (-10) initial=-10 raw=-30 brotli=-10\n`)
          .join(''),
      )
    })
  }
})

test('targeted comparisons keep measured scenarios missing from the baseline', (t) => {
  const { root, reports, execute } = fixture(t)
  writeCurrent(path.join(root, 'runs/baseline/current.json'), 100, [
    'react-router.full',
  ])

  assert.equal(
    run(
      [
        '--results-dir',
        root,
        '--baseline',
        'baseline',
        '--scenario',
        'react-router.minimal',
      ],
      execute,
    ),
    0,
  )
  assert.equal(
    reports.join(''),
    'react-router.minimal n/a -> 90 (n/a) initial=n/a raw=n/a brotli=n/a\n',
  )
})

test('unfiltered comparisons retain baseline-only scenarios', (t) => {
  const { root, reports, execute } = fixture(t)
  writeCurrent(path.join(root, 'runs/baseline/current.json'), 100, [
    'react-router.full',
  ])

  assert.equal(
    run(['--results-dir', root, '--baseline', 'baseline'], execute),
    0,
  )
  assert.equal(
    reports.join(''),
    'react-router.full 100 -> n/a (n/a) initial=n/a raw=n/a brotli=n/a\n' +
      'react-router.minimal n/a -> 90 (n/a) initial=n/a raw=n/a brotli=n/a\n',
  )
})

test('current-only diffs filter JSON output and preserve explicit ID selection', (t) => {
  const { root } = fixture(t)
  const baseline = path.join(root, 'baseline.json')
  const current = path.join(root, 'current.json')
  writeCurrent(baseline, 100, ['react-router.full', 'react-router.minimal'])
  writeCurrent(current, 90, ['solid-router.minimal', 'react-router.minimal'])
  const args = [
    fileURLToPath(new URL('./diff.mjs', import.meta.url)),
    '--baseline',
    baseline,
    '--current',
    current,
    '--current-only',
    '--json',
  ]
  const result = spawnSync(process.execPath, args, { encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr)
  assert.deepEqual(JSON.parse(result.stdout), [
    {
      id: 'react-router.minimal',
      baseline: 100,
      current: 90,
      delta: -10,
      initialDelta: -10,
      rawDelta: -30,
      brotliDelta: -10,
    },
    { id: 'solid-router.minimal', current: 90 },
  ])

  const selected = spawnSync(
    process.execPath,
    [...args, '--id', 'react-router.full'],
    {
      encoding: 'utf8',
    },
  )
  assert.equal(selected.status, 0, selected.stderr)
  assert.deepEqual(JSON.parse(selected.stdout), [
    { id: 'react-router.full', baseline: 100 },
  ])
})

test('stops on test failure, preserves its exit code, and prints only a bounded log tail', (t) => {
  const { root, messages } = fixture(t)
  let callCount = 0
  const log = `early output\n${'x'.repeat(10_000)}\n${'later output\n'.repeat(60)}last error\n`
  const status = run(
    ['--results-dir', root, '--test-projects', '@tanstack/react-router'],
    (command, args, options) => {
      callCount++
      assert.ok(options.stdio !== 'inherit')
      fs.writeSync(options.stdio[1], log)
      return { status: 42 }
    },
  )

  assert.equal(status, 42)
  assert.equal(callCount, 1)
  assert.equal(fs.readFileSync(path.join(root, 'tests.log'), 'utf8'), log)
  assert.ok(!fs.existsSync(path.join(root, 'measure.log')))
  assert.match(messages.join('\n'), /tests failed: exit 42/)
  assert.match(messages.join('\n'), /last error/)
  assert.doesNotMatch(messages.join('\n'), /early output|xxx/)
  const tail = messages.at(-1)
  assert.ok(tail)
  assert.ok(tail.split('\n').length <= 40)
  assert.ok(tail.length <= 8000)
})

test('bounds failure output even when a log contains one very long line', (t) => {
  const { root, messages } = fixture(t)
  assert.equal(
    run(['--results-dir', root], (command, args, options) => {
      assert.ok(options.stdio !== 'inherit')
      fs.writeSync(options.stdio[1], 'x'.repeat(20_000))
      return { status: 1 }
    }),
    1,
  )
  assert.equal(messages.at(-1), 'x'.repeat(8000))
})

test('does not report stale results after a failed or interrupted measurement', async (t) => {
  for (const result of [
    { status: 17 },
    { status: null, signal: 'SIGTERM' },
    { status: null, error: new Error('spawn failed') },
  ]) {
    await t.test(
      result.error?.message || result.signal || `exit ${result.status}`,
      (t) => {
        const { root, messages } = fixture(t)
        let callCount = 0
        writeCurrent(path.join(root, 'current.json'))
        assert.equal(
          run(['--results-dir', root], () => {
            callCount++
            return result
          }),
          result.status || 1,
        )
        assert.equal(callCount, 1)
        assert.match(messages.join('\n'), /measure failed:/)
      },
    )
  }
})

test('rejects invalid inputs and protects saved results before running commands', (t) => {
  const { root, calls, execute } = fixture(t)
  const current = path.join(root, 'current.json')
  writeCurrent(current)
  writeCurrent(path.join(root, 'runs/baseline/current.json'))
  fs.writeFileSync(path.join(root, 'empty.json'), '{"metrics":[]}')
  fs.writeFileSync(path.join(root, 'invalid.json'), '{')
  /** @type {Array<[string[], RegExp]>} */
  const cases = [
    [['--unknown'], /Unknown option/],
    [['--', 'tests/path.test.ts'], /require --test-projects/],
    [['--test-projects', ' , '], /at least one project/],
    [['--scenario', ' , '], /at least one scenario/],
    [['--name', '../escape'], /Run names/],
    [['--name', 'baseline'], /Named run already exists/],
    [['--baseline', 'missing'], /ENOENT/],
    [['--baseline', current], /baseline cannot be the current output/],
    [['--baseline', path.join(root, 'empty.json')], /no metrics/],
    [['--baseline', path.join(root, 'invalid.json')], /JSON/],
  ]
  for (const [args, error] of cases) {
    assert.throws(() => run(['--results-dir', root, ...args], execute), error)
  }
  assert.equal(calls.length, 0)
  assert.equal(
    JSON.parse(fs.readFileSync(current, 'utf8')).metrics[0].gzipBytes,
    100,
  )
})

test('reports help and argument errors through the CLI entry point', () => {
  const help = spawnSync(process.execPath, [scriptPath, '--help'], {
    encoding: 'utf8',
  })
  assert.equal(help.status, 0)
  assert.match(help.stdout, /Usage: pnpm benchmark:bundle-size:run/)
  assert.match(
    help.stdout,
    /--timings\s+Record fresh phase timings in measure\.log/,
  )
  const invalid = spawnSync(process.execPath, [scriptPath, '--unknown'], {
    encoding: 'utf8',
  })
  assert.equal(invalid.status, 1)
  assert.match(invalid.stderr, /Unknown option/)
})
