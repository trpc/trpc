import { afterEach, beforeEach, bench, describe } from 'vitest'
import { benchOptions, ticksPerIteration } from '../shared'
import { setup } from './setup'

describe('client-route-tree-scale', () => {
  const test = setup()

  /**
   * Running `vitest bench` ignores suite hooks, so Tinybench uses the `setup`
   * and `teardown` options below. CodSpeed bypasses those options but supports
   * `beforeEach` and `afterEach`. Only one lifecycle path runs in either
   * environment, and every measured invocation receives fresh application state.
   */

  beforeEach(test.before)
  afterEach(test.after)

  bench(
    'client-route-tree-scale navigation loop (vue)',
    async () => {
      for (let i = 0; i < ticksPerIteration; i++) {
        await test.tick()
      }
      await test.finishBatch()
    },
    {
      ...benchOptions,
      setup: test.before,
      teardown: test.after,
    },
  )
})
