import { bench, describe } from 'vitest'
import {
  assertServerFnScenario,
  runServerFnRedirectRequestLoop,
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
    'ssr server-fn redirect (solid)',
    () => runServerFnRedirectRequestLoop(handler, context),
    serverFnBenchOptions,
  )
})
