import { stripVTControlCharacters } from 'node:util'
import { expect, test } from 'vitest'
import { appServerReadyPattern } from '../src/webServer'

test.each([
  '➜  Local:   http://localhost:49152/',
  '\u001b[32m➜\u001b[39m  \u001b[1mLocal\u001b[22m:   \u001b[36mhttp://localhost:\u001b[1m49152\u001b[22m/\u001b[39m',
  'Listening on http://[::]:49152',
  'E2E app: http://localhost:49152',
  'Accepting connections at http://localhost:49152',
  'Local: https://localhost:49152/',
])('captures a bound application port from %s', (line) => {
  expect(
    appServerReadyPattern.exec(stripVTControlCharacters(line))?.groups
      ?.E2E_APP_PORT,
  ).toBe('49152')
})

test('does not confuse an arbitrary URL with app readiness', () => {
  expect(appServerReadyPattern.test('fetching http://localhost:49152')).toBe(
    false,
  )
})
