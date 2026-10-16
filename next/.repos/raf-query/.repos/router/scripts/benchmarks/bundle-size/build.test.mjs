import assert from 'node:assert/strict'
import path from 'node:path'
import test from 'node:test'
import { build } from './build.mjs'

test('generates a fresh report after a successful Nx run, including cache hits', () => {
  /** @type {string[][]} */
  const calls = []
  const status = build(
    ['--outputStyle=stream', '--skipRemoteCache'],
    (_command, args, options) => {
      calls.push(args)
      assert.equal(options.stdio, 'inherit')
      assert.ok(!('shell' in options))
      return { status: 0 }
    },
  )
  assert.equal(status, 0)
  assert.equal(calls.length, 2)
  assert.deepEqual(calls[0]?.slice(-5), [
    'nx',
    'run',
    '@benchmarks/bundle-size:build',
    '--outputStyle=stream',
    '--skipRemoteCache',
  ])
  assert.equal(path.basename(calls[1]?.[0] || ''), 'report.mjs')
})

test('does not report stale measurements after a failed or interrupted build', () => {
  for (const exitCode of [2, null]) {
    let calls = 0
    assert.equal(
      build([], () => {
        calls++
        return { status: exitCode }
      }),
      exitCode || 1,
    )
    assert.equal(calls, 1)
  }
})

test('propagates report failures', () => {
  let calls = 0
  assert.equal(
    build([], () => ({ status: ++calls === 1 ? 0 : 3 })),
    3,
  )
})
