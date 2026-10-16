import { afterEach, beforeEach, bench, describe } from 'vitest'
import { LINK_CASES } from './cases'
import { createClientScenario, samplingOptions } from './scenario'
import type * as App from './src/client'

const appModulePath = './dist/client/app.js'
const app: typeof App = await import(/* @vite-ignore */ appModulePath)
if (app.serverEnvironment !== false) {
  throw new Error('Link client benchmarks must use the production client build')
}

for (const { id, label } of LINK_CASES) {
  describe(label, () => {
    const scenario = createClientScenario(app, id)
    function finish() {
      try {
        scenario.check()
      } finally {
        scenario.teardown()
      }
    }
    beforeEach(scenario.setup)
    afterEach(finish)

    bench(`client Links: ${id}`, scenario.batch, {
      ...samplingOptions,
      setup: scenario.setup,
      teardown: finish,
    })
  })
}
