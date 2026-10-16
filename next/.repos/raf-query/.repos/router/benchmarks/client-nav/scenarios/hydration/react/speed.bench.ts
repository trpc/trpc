import { afterEach, beforeEach, bench, describe } from 'vitest'
import { setup } from './setup'

describe('client-hydration', () => {
  const scenario = setup()
  // CodSpeed uses suite hooks; ordinary Vitest uses the Tinybench Task hooks
  // installed below. Both prepare and dispose every sample outside timing.
  beforeEach(scenario.before)
  afterEach(scenario.after)
  bench(
    'hydrate restored route state and mixed Links (react)',
    async () => {
      await scenario.run()
    },
    {
      setup: scenario.installIterationHooks,
      time: 5000,
      warmupTime: 1000,
      warmupIterations: 20,
      throws: true,
    },
  )
})
