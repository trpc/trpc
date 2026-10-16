import { bench, describe } from 'vitest'
import {
  assertServerFnScenario,
  runServerFnPostRequestLoop,
  serverFnBenchOptions,
  setupServerFnBench,
} from '../bench'
import type { StartRequestHandler } from '../bench'

const { default: handler } = (await import(
  /* @vite-ignore */ new URL('./dist/server/server.js', import.meta.url).href
)) as {
  default: StartRequestHandler
}
const context = await setupServerFnBench(handler)

await assertServerFnScenario(handler, context)

describe('ssr', () => {
  bench(
    'ssr server-fn POST (react)',
    () => runServerFnPostRequestLoop(handler, context),
    serverFnBenchOptions,
  )
})
