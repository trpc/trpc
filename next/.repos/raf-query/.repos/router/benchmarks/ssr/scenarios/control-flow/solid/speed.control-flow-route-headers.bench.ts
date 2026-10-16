import { bench, describe } from 'vitest'
import {
  assertControlFlowSanity,
  controlFlowBenchOptions,
  runRouteHeadersLoop,
} from '../shared'
import type { StartRequestHandler } from '../shared'

const appModuleUrl = new URL('./dist/server/server.js', import.meta.url).href

const { default: handler } = (await import(
  /* @vite-ignore */ appModuleUrl
)) as {
  default: StartRequestHandler
}

await assertControlFlowSanity(handler)

describe('ssr', () => {
  bench(
    'ssr control-flow route headers (solid)',
    () => runRouteHeadersLoop(handler),
    controlFlowBenchOptions,
  )
})
