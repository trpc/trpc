import { bench, describe } from 'vitest'
import {
  assertControlFlowSanity,
  controlFlowBenchOptions,
  runUnmatchedLoop,
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
    'ssr control-flow unmatched 404 (vue)',
    () => runUnmatchedLoop(handler),
    controlFlowBenchOptions,
  )
})
