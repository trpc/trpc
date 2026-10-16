import assert from 'node:assert/strict'
import test from 'node:test'
import { createTimings } from './timings.mjs'

test('emits labelled JSON timing lines with scenario context when supplied', (t) => {
  let now = 100
  t.mock.method(performance, 'now', () => now)
  const lines = []
  const timings = createTimings((line) => lines.push(line))
  timings.record('gzip', 1.234567, 'react-router.minimal')
  const finishOverall = timings.start('overall')
  now = 112.345678
  const finishScenario = timings.start('scenario-build', 'react-router.minimal')
  now = 123.456789
  finishScenario()
  now = 150.123456
  finishOverall()

  const records = lines.map((line) => {
    assert.ok(line.startsWith('[bundle-size:timing] '))
    assert.ok(line.endsWith('\n'))
    return JSON.parse(line.slice('[bundle-size:timing] '.length))
  })
  assert.deepEqual(records[0], {
    phase: 'gzip',
    scenario: 'react-router.minimal',
    durationMs: 1.235,
  })
  assert.deepEqual(records[1], {
    phase: 'scenario-build',
    scenario: 'react-router.minimal',
    durationMs: 11.111,
  })
  assert.deepEqual(records[2], { phase: 'overall', durationMs: 50.123 })
})
