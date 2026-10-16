import { bench, describe } from 'vitest'
import {
  assertServerFnTransportScenario,
  runServerFnRawResponseRequestLoop,
  serverFnTransportBenchOptions,
  setupServerFnTransportBench,
} from '../bench'
import type { StartRequestHandler } from '../bench'

const { default: handler } = (await import(
  /* @vite-ignore */ new URL('./dist/server/server.js', import.meta.url).href
)) as {
  default: StartRequestHandler
}
const context = await setupServerFnTransportBench(handler)

await assertServerFnTransportScenario(handler, context)

describe('ssr', () => {
  bench(
    'ssr server-fn raw-response (react)',
    () => runServerFnRawResponseRequestLoop(handler, context),
    serverFnTransportBenchOptions,
  )
})
