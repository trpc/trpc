// On-demand backpressure test for transformReadableStreamWithRouter.
//
// NOT run in CI by default. To execute:
//   RUN_BACKPRESSURE_PERF=1 pnpm --filter @tanstack/router-core test:unit -- transformStreamBackpressure
//
// Validates fix for TanStack/router#7402
// without a backpressure gate the read loop in
// transformReadableStreamWithRouter calls controller.enqueue unconditionally,
// allowing controller.[[queue]] to accumulate Uint8Array chunks (external
// memory) when the consumer drains slower than the producer.
import { describe, expect, it } from 'vitest'
import {
  HYDRATION_SCRIPT_BOUNDARY_BYTES,
  HydrationScriptOutputState,
} from '../src/ssr/hydrationScripts'
import { transformReadableStreamWithRouter } from '../src/ssr/transformStreamWithRouter'
import type { HydrationScriptOutput } from '../src/ssr/hydrationScripts'

const enabled = process.env.RUN_BACKPRESSURE_PERF === '1'
const requiresGc = typeof (globalThis as any).gc === 'function'
const SCRIPT_BARRIER_HTML = `<script>document.currentScript.remove()${new TextDecoder().decode(HYDRATION_SCRIPT_BOUNDARY_BYTES).slice(0, -'</script>'.length)}</script>`

function createFastProducer(
  chunkCount: number,
  chunkBytes: number,
  opts: { freshChunks?: boolean } = {},
) {
  let pulls = 0
  let produced = 0
  const reusable = opts.freshChunks
    ? null
    : new Uint8Array(chunkBytes).fill(0x61)
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      pulls++
      if (produced >= chunkCount) {
        controller.close()
        return
      }
      produced++
      // Fresh allocation for external-memory tests: reusing one Uint8Array
      // means the upstream queue never actually retains additional native
      // memory even if our transform held arbitrarily many references.
      controller.enqueue(
        opts.freshChunks ? new Uint8Array(chunkBytes).fill(0x61) : reusable!,
      )
    },
  })
  return {
    stream,
    getPulls: () => pulls,
    getProduced: () => produced,
  }
}

function makeRouter() {
  const output: HydrationScriptOutput = {
    state: HydrationScriptOutputState.Done,
    error: undefined,
    pullChunk() {
      throw new Error('Finished hydration output cannot be pulled')
    },
    subscribe() {
      return () => {}
    },
  }
  return {
    serverSsr: {
      hydrationScripts: {
        reserveFastPath: () => true,
        claimOutput: () => output,
        liftBarrier: () => {},
        isInitialTaken: () => true,
        startSerializationTimeout: () => {},
      },
      setRenderFinished: () => {},
      onCleanup: () => {},
      cleanup: () => {},
    },
  } as any
}

// Main-path router fake: serialization NOT finished synchronously, so the
// transform runs the full scanner + script merger path. Exposes hooks to
// emit router script batches and signal serialization finished.
function makeMainPathRouter(): {
  router: any
  finishSerialization: () => void
} {
  let state: HydrationScriptOutput['state'] = HydrationScriptOutputState.Waiting
  let listener: (() => void) | undefined
  const output: HydrationScriptOutput = {
    get state() {
      return state
    },
    error: undefined,
    pullChunk() {
      throw new Error('No hydration output is ready')
    },
    subscribe(onChange) {
      listener = onChange
      return () => {
        if (listener === onChange) {
          listener = undefined
        }
      }
    },
  }
  const router: any = {
    serverSsr: {
      hydrationScripts: {
        reserveFastPath: () => false,
        claimOutput: () => output,
        liftBarrier: () => {},
        isInitialTaken: () => true,
        startSerializationTimeout: () => {},
      },
      setRenderFinished: () => {},
      onCleanup: () => {},
      cleanup: () => {},
    },
  }
  return {
    router,
    finishSerialization: () => {
      state = HydrationScriptOutputState.Done
      listener?.()
    },
  }
}

describe.runIf(enabled)(
  'transformReadableStreamWithRouter backpressure',
  () => {
    it('does not run producer arbitrarily ahead of slow consumer', async () => {
      const CHUNKS = 200
      const CHUNK_BYTES = 8 * 1024 // 8KB per chunk
      const producer = createFastProducer(CHUNKS, CHUNK_BYTES)
      const router = makeRouter()

      const out = transformReadableStreamWithRouter(router, producer.stream)

      const reader = out.getReader()
      let consumed = 0
      let maxLead = 0
      for (;;) {
        // Throttled consumer: ~5ms per chunk.
        await new Promise((r) => setTimeout(r, 5))
        const { done } = await reader.read()
        if (done) {
          break
        }
        consumed++
        const lead = producer.getProduced() - consumed
        if (lead > maxLead) {
          maxLead = lead
        }
      }

      // Producer should never be more than a small constant number of chunks
      // ahead of the consumer. ReadableStream default HWM is 1 for byte
      // streams; allow generous slack for scheduling jitter.
      expect(maxLead).toBeLessThanOrEqual(8)
      expect(consumed).toBe(CHUNKS)
    })

    it('bounded external memory under sustained load', async () => {
      expect(requiresGc, 'Run with node --expose-gc').toBe(true)
      const CHUNKS = 1000
      const CHUNK_BYTES = 16 * 1024
      const producer = createFastProducer(CHUNKS, CHUNK_BYTES, {
        freshChunks: true,
      })
      const router = makeRouter()

      const out = transformReadableStreamWithRouter(router, producer.stream)
      const reader = out.getReader()

      ;(globalThis as any).gc()
      ;(globalThis as any).gc()
      let consumed = 0
      let peakExternal = 0
      const baseline = process.memoryUsage().external
      for (;;) {
        await new Promise((r) => setTimeout(r, 2))
        const { done } = await reader.read()
        if (done) {
          break
        }
        consumed++
        if (consumed % 50 === 0) {
          ;(globalThis as any).gc()
          const ext = process.memoryUsage().external - baseline
          if (ext > peakExternal) {
            peakExternal = ext
          }
        }
      }

      // Without backpressure, peak external memory scales w/ CHUNKS*CHUNK_BYTES
      // (~16MB). With backpressure, only a few chunks worth.
      expect(peakExternal).toBeLessThan(2 * 1024 * 1024) // 2MB ceiling
      expect(consumed).toBe(CHUNKS)
    })

    it('main path: scanner+inject path also honors backpressure', async () => {
      // Same shape as fast-path test but with a router that forces the
      // scanner+inject code path. Producer emits valid HTML fragments
      // (ending at closing tags) so the scanner can release them.
      const CHUNKS = 200
      const CHUNK_BYTES = 8 * 1024
      const filler = 'a'.repeat(CHUNK_BYTES - '<p></p>'.length)
      const chunkStr = `<p>${filler}</p>`
      const encoded = new TextEncoder().encode(chunkStr)
      const firstFiller = 'a'.repeat(
        CHUNK_BYTES - '<p></p>'.length - SCRIPT_BARRIER_HTML.length,
      )
      const firstEncoded = new TextEncoder().encode(
        `<p>${firstFiller}${SCRIPT_BARRIER_HTML}</p>`,
      )

      let produced = 0
      const stream = new ReadableStream<Uint8Array>({
        pull(controller) {
          if (produced >= CHUNKS) {
            controller.close()
            return
          }
          produced++
          controller.enqueue(produced === 1 ? firstEncoded : encoded)
        },
      })

      const { router, finishSerialization } = makeMainPathRouter()
      const out = transformReadableStreamWithRouter(router, stream)
      // Mark serialization finished immediately so tryFinish() proceeds once
      // upstream closes.
      finishSerialization()

      const reader = out.getReader()
      let consumed = 0
      let bytes = 0
      let maxLead = 0
      for (;;) {
        await new Promise((r) => setTimeout(r, 5))
        const { done, value } = await reader.read()
        if (done) {
          break
        }
        consumed++
        bytes += value.byteLength
        const lead = produced - consumed
        if (lead > maxLead) {
          maxLead = lead
        }
      }

      expect(maxLead).toBeLessThanOrEqual(8)
      // The merger splits the first renderer record at the router boundary.
      expect(consumed).toBe(CHUNKS + 1)
      expect(bytes).toBe(CHUNKS * encoded.byteLength)
    })
  },
)
