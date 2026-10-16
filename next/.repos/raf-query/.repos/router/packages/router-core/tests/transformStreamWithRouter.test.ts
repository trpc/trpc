// CI-stable tests for transformReadableStreamWithRouter behavior.
//
// These exercise the deterministic side-effects of the SSR memory fix
// (TanStack/router#7402) without relying on GC, timing of real I/O, or
// process.memoryUsage(). On-demand backpressure/external-memory
// assertions live in transformStreamBackpressure.perf.test.ts.
import { PassThrough, Readable } from 'node:stream'
import { describe, expect, test, vi } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { BaseRootRoute, BaseRoute } from '../src'
import { GLOBAL_TSR } from '../src/ssr/constants'
import {
  HYDRATION_SCRIPT_BOUNDARY_BYTES,
  HydrationScriptOutputState,
  MAX_HYDRATION_OUTPUT_CHUNK_BYTES,
} from '../src/ssr/hydrationScripts'
import {
  createSsrStreamResponse,
  replaceSsrResponse,
} from '../src/ssr/handlerCallback'
import { attachRouterServerSsrUtils } from '../src/ssr/ssr-server'
import {
  transformHtmlStringWithRouter,
  transformPipeableStreamWithRouter,
  transformReadableStreamWithRouter,
} from '../src/ssr/transformStreamWithRouter'
import {
  DOCUMENT_CLOSE_BYTES,
  SCRIPT_CLOSE,
} from '../src/ssr/htmlBoundaryScanner'
import { createTestRouter } from './routerTestUtils'
import type { RouterManagedTag } from '../src/manifest'
import type { HydrationScriptOutput } from '../src/ssr/hydrationScripts'

const decoder = new TextDecoder()
const DOCUMENT_CLOSE = decoder.decode(DOCUMENT_CLOSE_BYTES)
const HYDRATION_SCRIPT_BOUNDARY_SUFFIX = decoder.decode(
  HYDRATION_SCRIPT_BOUNDARY_BYTES,
)
const HYDRATION_SCRIPT_BOUNDARY_SOURCE =
  `document.currentScript.remove()` +
  HYDRATION_SCRIPT_BOUNDARY_SUFFIX.slice(0, -SCRIPT_CLOSE.length)
const SCRIPT_BARRIER_HTML = `<script>${HYDRATION_SCRIPT_BOUNDARY_SOURCE}</script>`

function internalSplitOffsets(value: string) {
  return Array.from({ length: value.length - 1 }, (_, index) => index + 1)
}

type FakeHydrationScripts = {
  reserveFastPath: (output?: HydrationScriptOutput) => boolean
  claimOutput: () => HydrationScriptOutput
  liftBarrier: () => void
  isInitialTaken: () => boolean
  startSerializationTimeout: (timeoutMs: number) => void
}

type FakeServerSsr = {
  hydrationScripts: FakeHydrationScripts
  setRenderFinished: () => void
  onCleanup: (listener: () => void) => void
  cleanup: () => void
}

type MakeRouterOptions = Partial<Omit<FakeServerSsr, 'hydrationScripts'>> &
  Partial<FakeHydrationScripts>

type FakeRouter = {
  serverSsr?: FakeServerSsr
}

type FakeHydrationRecord = {
  bytes: Uint8Array
  offset: number
}

function makeRouter(opts: MakeRouterOptions = {}): {
  router: FakeRouter
  cleanupCalls: { count: number }
  claimCalls: { count: number }
  emitHydrationRecord: (record: string) => void
  emitScriptBatch: (parts: ReadonlyArray<string>) => void
  finishSerialization: () => void
  failHydrationOutput: (error: unknown) => void
} {
  const cleanupCalls = { count: 0 }
  const claimCalls = { count: 0 }
  const cleanupListeners: Array<() => void> = []
  let cleanedUp = false
  let producerDone = false
  let claimed = false
  let failure: unknown
  let activeRecord: FakeHydrationRecord | undefined
  const records: Array<FakeHydrationRecord> = []
  let listener: (() => void) | undefined
  let state: HydrationScriptOutput['state'] = HydrationScriptOutputState.Waiting
  let serializationTimeout: ReturnType<typeof setTimeout> | undefined
  const encoder = new TextEncoder()

  function updateState() {
    const nextState =
      failure !== undefined
        ? HydrationScriptOutputState.Failed
        : activeRecord
          ? HydrationScriptOutputState.Active
          : records.length > 0
            ? HydrationScriptOutputState.Ready
            : producerDone
              ? HydrationScriptOutputState.Done
              : HydrationScriptOutputState.Waiting
    if (state !== nextState) {
      state = nextState
      listener?.()
    }
  }

  const output: HydrationScriptOutput = {
    get state() {
      return state
    },
    get error() {
      return failure
    },
    pullChunk() {
      if (state === HydrationScriptOutputState.Ready) {
        activeRecord = records.shift()!
      } else if (state !== HydrationScriptOutputState.Active) {
        throw new Error('Fake hydration output is not ready')
      }

      const record = activeRecord!
      const end = Math.min(
        record.offset + MAX_HYDRATION_OUTPUT_CHUNK_BYTES,
        record.bytes.length,
      )
      const chunk = record.bytes.subarray(record.offset, end)
      record.offset = end
      if (end === record.bytes.length) {
        activeRecord = undefined
      }
      updateState()
      return chunk
    },
    subscribe(onChange) {
      if (listener) {
        throw new Error('Fake hydration output already has a subscriber')
      }
      listener = onChange
      return () => {
        if (listener === onChange) {
          listener = undefined
        }
      }
    },
  }

  const {
    reserveFastPath = () => false,
    claimOutput = () => {
      claimCalls.count++
      if (claimed) {
        throw new Error('Fake hydration output already has a consumer')
      }
      claimed = true
      return output
    },
    liftBarrier = () => {},
    isInitialTaken = () => true,
    startSerializationTimeout = (timeoutMs: number) => {
      if (
        producerDone ||
        failure !== undefined ||
        serializationTimeout !== undefined
      ) {
        return
      }
      serializationTimeout = setTimeout(() => {
        serializationTimeout = undefined
        failure = new Error('Serialization timeout after app render finished')
        console.error('Serialization timeout after app render finished')
        updateState()
      }, timeoutMs)
    },
    ...serverSsrOverrides
  } = opts

  const router: FakeRouter = {
    serverSsr: {
      hydrationScripts: {
        reserveFastPath,
        claimOutput,
        liftBarrier,
        isInitialTaken,
        startSerializationTimeout,
      },
      setRenderFinished: () => {},
      onCleanup: (cleanupListener: () => void) => {
        if (cleanedUp) {
          return
        }
        cleanupListeners.push(cleanupListener)
      },
      cleanup: () => {
        if (cleanedUp) {
          return
        }
        cleanedUp = true
        cleanupCalls.count++
        if (serializationTimeout !== undefined) {
          clearTimeout(serializationTimeout)
          serializationTimeout = undefined
        }
        records.length = 0
        activeRecord = undefined
        failure = undefined
        listener = undefined
        state = HydrationScriptOutputState.Done
        // Mirror the real implementation: snapshot + clear, then notify.
        const pendingCleanupListeners = cleanupListeners.slice()
        cleanupListeners.length = 0
        for (const cleanupListener of pendingCleanupListeners) {
          cleanupListener()
        }
        router.serverSsr = undefined
      },
      ...serverSsrOverrides,
    },
  }

  function emitHydrationRecord(record: string) {
    records.push({
      bytes: encoder.encode(record),
      offset: 0,
    })
    updateState()
  }

  return {
    router,
    cleanupCalls,
    claimCalls,
    emitHydrationRecord,
    emitScriptBatch: (parts) => emitHydrationRecord(renderScriptBatch(parts)),
    finishSerialization: () => {
      producerDone = true
      if (serializationTimeout !== undefined) {
        clearTimeout(serializationTimeout)
        serializationTimeout = undefined
      }
      updateState()
    },
    failHydrationOutput: (error) => {
      failure = error
      updateState()
    },
  }
}

function makeManualUpstream(): {
  stream: ReadableStream<Uint8Array>
  push: (s: string) => void
  close: () => void
  error: (reason: unknown) => void
  cancelled: { value: boolean; reason: unknown }
} {
  let controllerRef: ReadableStreamDefaultController<Uint8Array> | undefined
  const cancelled = { value: false, reason: undefined as unknown }
  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      controllerRef = c
    },
    cancel(reason) {
      cancelled.value = true
      cancelled.reason = reason
    },
  })
  return {
    stream,
    push: (s) => controllerRef!.enqueue(encoder.encode(s)),
    close: () => controllerRef!.close(),
    error: (reason) => controllerRef!.error(reason),
    cancelled,
  }
}

async function readAll(s: ReadableStream<Uint8Array>): Promise<string> {
  const reader = s.getReader()
  const decoder = new TextDecoder()
  let out = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) {
      break
    }
    out += decoder.decode(value, { stream: true })
  }
  return out + decoder.decode()
}

async function readAllBytes(
  stream: ReadableStream<Uint8Array>,
): Promise<Buffer> {
  const reader = stream.getReader()
  const chunks: Array<Buffer> = []
  for (;;) {
    const { done, value } = await reader.read()
    if (done) {
      break
    }
    chunks.push(Buffer.from(value))
  }
  return Buffer.concat(chunks)
}

async function readAllPipeableChunks(stream: Readable): Promise<Array<Buffer>> {
  const chunks: Array<Buffer> = []
  for await (const chunk of stream) {
    chunks.push(Buffer.from(chunk))
  }
  return chunks
}

async function readAllPipeableBytes(stream: Readable): Promise<Buffer> {
  return Buffer.concat(await readAllPipeableChunks(stream))
}

function makeLargeStringRecord(prefix: string, suffix: string) {
  return (
    prefix +
    'x'.repeat(
      MAX_HYDRATION_OUTPUT_CHUNK_BYTES - 1 - Buffer.byteLength(prefix),
    ) +
    '😀' +
    '漢x'.repeat(20_000) +
    suffix
  )
}

// Yield to the microtask queue a few times so async stream operations can
// drain. Avoids reliance on real timers.
async function flush(n = 5) {
  for (let i = 0; i < n; i++) {
    await Promise.resolve()
  }
}

function createIssuePayload() {
  return 'x'.repeat(17 * 1024 * 1024)
}

function createDeferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

function createControlledStream<T>() {
  let controller!: ReadableStreamDefaultController<T>
  const stream = new ReadableStream<T>({
    start(c) {
      controller = c
    },
  })
  return { stream, controller }
}

function renderManagedScript(tag: RouterManagedTag) {
  const attrs = tag.attrs ?? {}
  const id = attrs.id ? ` id="${attrs.id}"` : ''
  const className = attrs.className ? ` class="${attrs.className}"` : ''
  const nonce = attrs.nonce ? ` nonce="${attrs.nonce}"` : ''
  const streamPart =
    'data-tsr-stream-part' in attrs ? ' data-tsr-stream-part=""' : ''
  return `<script${id}${className}${nonce}${streamPart}>${tag.children ?? ''}</script>`
}

function renderManagedScripts(tags: Array<RouterManagedTag>) {
  return tags.map(renderManagedScript).join('')
}

function renderInitialScripts(scripts: {
  before: Array<RouterManagedTag>
  boundary: RouterManagedTag
}) {
  return renderManagedScripts([...scripts.before, scripts.boundary])
}

function renderScriptBatch(parts: ReadonlyArray<string>) {
  return `<script>${parts.join(';')};document.currentScript.remove()</script>`
}

function createRealSsrRouter(dehydratedData: Record<string, any>) {
  const rootRoute = new BaseRootRoute({})
  const indexRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => null,
  })

  return createTestRouter({
    routeTree: rootRoute.addChildren([indexRoute]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
    isServer: true,
    dehydrate: () => dehydratedData,
  })
}

describe('transformReadableStreamWithRouter — real SSR scripts', () => {
  test('uses pass-through after Scripts takes all eager hydration scripts', async () => {
    const router = createRealSsrRouter({ eager: 'loader-data' })
    attachRouterServerSsrUtils({ router, manifest: undefined })

    await router.load()
    await router.serverSsr!.dehydrate()

    // This is the server-side work performed by <Scripts> during rendering.
    const initialScripts = router.serverSsr!.takeInitialHydrationScriptTags()
    expect(initialScripts).toBeDefined()

    const serverSsr = router.serverSsr!
    const setRenderFinished = vi.spyOn(serverSsr, 'setRenderFinished')
    const upstream = makeManualUpstream()
    const html = `<html><body><main>app</main>${renderInitialScripts(
      initialScripts!,
    )}</body></html>`

    const output = transformReadableStreamWithRouter(router, upstream.stream)

    // Pass-through reservation must not require render completion in advance.
    expect(setRenderFinished).not.toHaveBeenCalled()
    upstream.push(html)
    upstream.close()

    await expect(readAll(output)).resolves.toBe(html)
    expect(setRenderFinished).toHaveBeenCalledOnce()
    expect(router.serverSsr).toBeUndefined()
  })

  test('flushes stream-end scripts before body close when serialization finishes before transform starts', async () => {
    const streamed = createDeferred<string>()
    const router = createRealSsrRouter({ streamed: streamed.promise })
    attachRouterServerSsrUtils({ router, manifest: undefined })

    await router.load()
    await router.serverSsr!.dehydrate()

    const initialScripts = router.serverSsr!.takeInitialHydrationScriptTags()
    expect(initialScripts).toBeDefined()
    const barrierScript = initialScripts!.boundary
    expect(barrierScript.attrs).not.toHaveProperty('id')
    expect(barrierScript).toBeDefined()
    const initialHtml = renderInitialScripts(initialScripts!)
    expect(initialHtml).toContain(`${GLOBAL_TSR}.router=`)
    expect(initialHtml).not.toContain(`${GLOBAL_TSR}.e()`)

    streamed.resolve('done')
    await flush(20)

    const upstream = makeManualUpstream()
    const output = transformReadableStreamWithRouter(
      router as any,
      upstream.stream as any,
    )
    upstream.push(`<html><body><main>app</main>${initialHtml}</body></html>`)
    upstream.close()

    const html = await readAll(output as any)

    expect(html).toContain(`${GLOBAL_TSR}.router=`)
    expect(html).toContain(`${GLOBAL_TSR}.e()`)
    expect(html.indexOf(`${GLOBAL_TSR}.e()`)).toBeLessThan(
      html.indexOf('</body>'),
    )
  })

  test('fuses the final resolver and stream-end scripts', async () => {
    const streamed = createControlledStream<string>()
    const router = createRealSsrRouter({ streamed: streamed.stream })
    attachRouterServerSsrUtils({ router, manifest: undefined })

    await router.load()
    await router.serverSsr!.dehydrate()

    const initialScripts = router.serverSsr!.takeInitialHydrationScriptTags()
    expect(initialScripts).toBeDefined()

    const upstream = makeManualUpstream()
    const output = transformReadableStreamWithRouter(
      router as any,
      upstream.stream as any,
    )
    upstream.push(
      `<html><body><main>app</main>${renderInitialScripts(
        initialScripts!,
      )}</body></html>`,
    )

    streamed.controller.close()
    await flush(20)
    upstream.close()

    const html = await readAll(output as any)
    const resolverIndex = html.indexOf('.return(void 0)')
    const endIndex = html.indexOf(`${GLOBAL_TSR}.e()`)

    expect(resolverIndex).toBeGreaterThan(-1)
    expect(endIndex).toBeGreaterThan(resolverIndex)
    expect(html.slice(resolverIndex, endIndex)).not.toContain('</script>')
    expect(endIndex).toBeLessThan(html.indexOf('</body>'))
  })

  test.each([
    ['completes', false],
    ['is cancelled before the payload finishes', true],
  ] as const)(
    'loader controllers are aborted only when the response %s',
    async (_name, cancelled) => {
      let loaderSignal: AbortSignal | undefined
      const deferred = createDeferred<string>()
      const rootRoute = new BaseRootRoute({})
      const indexRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/',
        component: () => null,
        loader: ({ abortController }) => {
          loaderSignal = abortController.signal
          return { deferred: deferred.promise }
        },
      })
      const router = createTestRouter({
        routeTree: rootRoute.addChildren([indexRoute]),
        history: createMemoryHistory({ initialEntries: ['/'] }),
        isServer: true,
      })
      attachRouterServerSsrUtils({ router, manifest: undefined })
      await router.load()
      await router.serverSsr!.dehydrate()
      const initialScripts = router.serverSsr!.takeInitialHydrationScriptTags()!

      const upstream = makeManualUpstream()
      const output = transformReadableStreamWithRouter(router, upstream.stream)
      upstream.push(
        `<html><body>${renderInitialScripts(initialScripts)}</body></html>`,
      )
      upstream.close()
      expect(loaderSignal?.aborted).toBe(false)

      if (cancelled) {
        await output.cancel(new Error('client gone'))
      } else {
        deferred.resolve('late')
        await readAll(output as any)
      }

      expect(router.serverSsr).toBeUndefined()
      expect(loaderSignal?.aborted).toBe(cancelled)
    },
  )

  test('emits router scripts after the document when no Scripts barrier was rendered', async () => {
    const streamed = createDeferred<string>()
    const router = createRealSsrRouter({ streamed: streamed.promise })
    attachRouterServerSsrUtils({ router, manifest: undefined })

    await router.load()
    await router.serverSsr!.dehydrate()

    streamed.resolve('done')
    await flush(20)

    const upstream = makeManualUpstream()
    const output = transformReadableStreamWithRouter(
      router as any,
      upstream.stream as any,
    )
    upstream.push('<html><body><main>app</main></body></html>')
    upstream.close()

    const html = await readAll(output as any)
    const documentEnd = html.indexOf('</html>') + '</html>'.length
    expect(html.slice(0, documentEnd)).toBe(
      '<html><body><main>app</main></body></html>',
    )
    const tail = html.slice(documentEnd)
    expect(tail).toContain(`${GLOBAL_TSR}.router=`)
    expect(tail).toContain(`${GLOBAL_TSR}.e()`)
    expect(tail).toMatch(/<\/script>$/)
    expect(router.serverSsr).toBeUndefined()
  })

  test('detects a barrier marker split across chunks', async () => {
    let liftCalls = 0
    const { router, finishSerialization } = makeRouter({
      liftBarrier: () => {
        liftCalls++
      },
    })
    const upstream = makeManualUpstream()
    const output = transformReadableStreamWithRouter(
      router as any,
      upstream.stream as any,
    )
    const markerStart = SCRIPT_BARRIER_HTML.indexOf(
      HYDRATION_SCRIPT_BOUNDARY_SUFFIX,
    )
    const splitAt =
      markerStart + Math.floor(HYDRATION_SCRIPT_BOUNDARY_SUFFIX.length / 2)

    upstream.push(`<html><body>${SCRIPT_BARRIER_HTML.slice(0, splitAt)}`)
    upstream.push(`${SCRIPT_BARRIER_HTML.slice(splitAt)}<main>app</main>`)
    upstream.push('</body></html>')
    upstream.close()
    finishSerialization()

    await readAll(output as any)
    expect(liftCalls).toBe(1)
  })

  test('does not inject stream scripts inside a split barrier script', async () => {
    const { router, emitScriptBatch, finishSerialization } = makeRouter({
      liftBarrier: () => {
        emitScriptBatch(['streamed()'])
      },
    })
    const upstream = makeManualUpstream()
    const output = transformReadableStreamWithRouter(
      router as any,
      upstream.stream as any,
    )

    const splitAt =
      SCRIPT_BARRIER_HTML.indexOf(HYDRATION_SCRIPT_BOUNDARY_SUFFIX) + 4
    upstream.push(
      `<html><body><main>app</main>${SCRIPT_BARRIER_HTML.slice(0, splitAt)}`,
    )
    upstream.push(
      `${SCRIPT_BARRIER_HTML.slice(splitAt)}<section>after</section>`,
    )
    finishSerialization()
    upstream.push('</body></html>')
    upstream.close()

    const html = await readAll(output as any)

    expect(html.indexOf(renderScriptBatch(['streamed()']))).toBeGreaterThan(
      html.indexOf(SCRIPT_BARRIER_HTML),
    )
    expect(html.indexOf(renderScriptBatch(['streamed()']))).toBeLessThan(
      html.indexOf('<section>after</section>'),
    )
    expect(html.indexOf(renderScriptBatch(['streamed()']))).toBeLessThan(
      html.indexOf('</body>'),
    )
  })

  test('uses a complete renderer record as an insertion boundary', async () => {
    const { router, emitScriptBatch, finishSerialization } = makeRouter()
    const upstream = makeManualUpstream()
    const output = transformReadableStreamWithRouter(
      router as any,
      upstream.stream as any,
      {
        rendererSafePoint: 'record-end',
      },
    )
    const reader = output.getReader()
    const decoder = new TextDecoder()
    let html = ''

    const rendererRecord = '<body-widget>content</body-widget>'
    upstream.push(`<html><body>${SCRIPT_BARRIER_HTML}${rendererRecord}`)
    for (let index = 0; index < 2; index++) {
      const { value } = await reader.read()
      html += decoder.decode(value, { stream: true })
    }

    emitScriptBatch(['streamed()'])
    upstream.push('<main>after</main></body></html>')
    upstream.close()
    finishSerialization()

    for (;;) {
      const { done, value } = await reader.read()
      if (done) {
        break
      }
      html += decoder.decode(value, { stream: true })
    }
    html += decoder.decode()

    expect(html).toBe(
      `<html><body>${SCRIPT_BARRIER_HTML}${rendererRecord}${renderScriptBatch([
        'streamed()',
      ])}<main>after</main></body></html>`,
    )
  })

  test('does not split a held document close at a record-end safe point', async () => {
    const { router, emitScriptBatch, finishSerialization } = makeRouter()
    const upstream = makeManualUpstream()
    const output = transformReadableStreamWithRouter(
      router as any,
      upstream.stream as any,
      {
        rendererSafePoint: 'record-end',
      },
    )
    const reader = output.getReader()
    const splitAt = 5
    const prefix = `<html><body>${SCRIPT_BARRIER_HTML}`

    upstream.push(prefix + DOCUMENT_CLOSE.slice(0, splitAt))
    expect(Buffer.from((await reader.read()).value!).toString()).toBe(prefix)

    const nextRead = reader.read()
    await flush()
    emitScriptBatch(['streamed()'])
    upstream.push(DOCUMENT_CLOSE.slice(splitAt))
    finishSerialization()
    upstream.close()

    const chunks = [(await nextRead).value!]
    for (;;) {
      const { done, value } = await reader.read()
      if (done) {
        break
      }
      chunks.push(value)
    }

    expect(
      Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))).toString(),
    ).toBe(renderScriptBatch(['streamed()']) + DOCUMENT_CLOSE)
  })

  test('conservative mode waits for EOF instead of using record ends', async () => {
    const { router, emitScriptBatch, finishSerialization } = makeRouter()
    const upstream = makeManualUpstream()
    const output = transformReadableStreamWithRouter(
      router as any,
      upstream.stream as any,
    )
    const reader = output.getReader()

    upstream.push(`${SCRIPT_BARRIER_HTML}<div>first</div>`)
    expect(Buffer.from((await reader.read()).value!).toString()).toBe(
      SCRIPT_BARRIER_HTML,
    )
    expect(Buffer.from((await reader.read()).value!).toString()).toBe(
      '<div>first</div>',
    )

    emitScriptBatch(['streamed()'])
    upstream.push('<div>second</div>')
    expect(Buffer.from((await reader.read()).value!).toString()).toBe(
      '<div>second</div>',
    )

    let pendingReadSettled = false
    const pendingRead = reader.read().then((result) => {
      pendingReadSettled = true
      return result
    })
    await flush()
    expect(pendingReadSettled).toBe(false)

    finishSerialization()
    upstream.close()
    expect(Buffer.from((await pendingRead).value!).toString()).toBe(
      renderScriptBatch(['streamed()']),
    )
    expect((await reader.read()).done).toBe(true)
  })
})

describe('transformReadableStreamWithRouter — cleanup side-effects', () => {
  test('unrefs Node-style lifecycle timer handles', () => {
    const nativeSetTimeout = globalThis.setTimeout
    const { router } = makeRouter()
    const upstream = makeManualUpstream()
    const timerHandle = nativeSetTimeout(() => undefined, 60_000)
    const unref = vi.spyOn(timerHandle, 'unref')
    let output: ReadableStream<Uint8Array> | undefined

    vi.stubGlobal(
      'setTimeout',
      ((_callback: () => void, _delay?: number) =>
        timerHandle) as typeof setTimeout,
    )
    try {
      output = transformReadableStreamWithRouter(
        router as any,
        upstream.stream as any,
      )
      expect(unref).toHaveBeenCalledOnce()
    } finally {
      void output?.cancel()
      router.serverSsr?.cleanup()
      vi.stubGlobal('setTimeout', nativeSetTimeout)
      clearTimeout(timerHandle)
      unref.mockRestore()
    }
  })

  test('supports runtimes whose timer handles are numeric', () => {
    const nativeSetTimeout = globalThis.setTimeout
    const nativeClearTimeout = globalThis.clearTimeout
    const { router } = makeRouter()
    const upstream = makeManualUpstream()
    let output: ReadableStream<Uint8Array> | undefined

    vi.stubGlobal(
      'setTimeout',
      ((_callback: () => void, _delay?: number) => 1) as typeof setTimeout,
    )
    vi.stubGlobal(
      'clearTimeout',
      ((_handle?: number) => undefined) as typeof clearTimeout,
    )
    try {
      expect(() => {
        output = transformReadableStreamWithRouter(
          router as any,
          upstream.stream as any,
        )
      }).not.toThrow()
    } finally {
      void output?.cancel()
      router.serverSsr?.cleanup()
      vi.stubGlobal('setTimeout', nativeSetTimeout)
      vi.stubGlobal('clearTimeout', nativeClearTimeout)
    }
  })

  test.each([
    ['fast', true],
    ['merge', false],
  ] as const)(
    'request abort cleans the %s path without consuming its response body',
    async (_path, reserveStreamFastPath) => {
      const { router, cleanupCalls } = makeRouter({
        reserveFastPath: () => reserveStreamFastPath,
      })
      const upstream = makeManualUpstream()
      const request = new AbortController()

      const responseBody = transformReadableStreamWithRouter(
        router as any,
        upstream.stream as any,
        {
          signal: request.signal,
        },
      )

      expect(responseBody.locked).toBe(false)

      const reason = new Error('request-gone')
      request.abort(reason)
      await flush()

      expect(responseBody.locked).toBe(false)
      expect(upstream.cancelled).toEqual({ value: true, reason })
      expect(cleanupCalls.count).toBe(1)
    },
  )

  test('string rendering uses the eager pass-through path', async () => {
    const setRenderFinished = vi.fn()
    const { router, cleanupCalls, claimCalls } = makeRouter({
      reserveFastPath: () => true,
      setRenderFinished,
    })

    await expect(
      transformHtmlStringWithRouter(
        router as any,
        '<html><body>ready</body></html>',
      ),
    ).resolves.toBe('<!DOCTYPE html><html><body>ready</body></html>')
    expect(setRenderFinished).toHaveBeenCalledOnce()
    expect(claimCalls.count).toBe(0)
    expect(cleanupCalls.count).toBe(1)
  })

  test('string rendering drains merged output without Response byte buffering', async () => {
    const { router, cleanupCalls, emitScriptBatch, finishSerialization } =
      makeRouter()
    const parts = ['streamed("hydration π 🚀")']
    emitScriptBatch(parts)
    finishSerialization()
    const responseText = vi
      .spyOn(Response.prototype, 'text')
      .mockRejectedValue(new Error('Response.text must not be used'))

    try {
      const rendererHtml = makeLargeStringRecord(
        '<html><body><main>eager ',
        `</main>${SCRIPT_BARRIER_HTML}</body></html>`,
      )
      expect(rendererHtml.indexOf('😀')).toBe(
        MAX_HYDRATION_OUTPUT_CHUNK_BYTES - 1,
      )
      await expect(
        transformHtmlStringWithRouter(router as any, rendererHtml),
      ).resolves.toBe(
        '<!DOCTYPE html>' +
          rendererHtml.replace(
            SCRIPT_BARRIER_HTML,
            SCRIPT_BARRIER_HTML + renderScriptBatch(parts),
          ),
      )
      expect(responseText).not.toHaveBeenCalled()
      expect(cleanupCalls.count).toBe(1)
    } finally {
      responseText.mockRestore()
    }
  })

  test('byte-0 pass-through preserves renderer bytes after document closes', async () => {
    const { router, cleanupCalls, claimCalls } = makeRouter({
      reserveFastPath: () => true,
    })
    const upstream = createControlledStream<Uint8Array>()
    const rendererBytes = new TextEncoder().encode(
      '<html><body>shell</body></html><script>rendererPatch()</script>',
    )
    const output = transformReadableStreamWithRouter(
      router as any,
      upstream.stream as any,
    )

    upstream.controller.enqueue(rendererBytes)
    upstream.controller.close()

    await expect(readAllBytes(output)).resolves.toEqual(
      Buffer.from(rendererBytes),
    )
    expect(claimCalls.count).toBe(0)
    expect(cleanupCalls.count).toBe(1)
  })

  test('dynamic pass-through preserves renderer bytes after document closes', async () => {
    let allowFastPath = false
    let reserveCalls = 0
    const { router, cleanupCalls, claimCalls, finishSerialization } =
      makeRouter({
        reserveFastPath: () => {
          reserveCalls++
          return allowFastPath
        },
      })
    finishSerialization()
    const upstream = createControlledStream<Uint8Array>()
    const encoder = new TextEncoder()
    const prefix = '<html><body><main>shell</main>'
    const suffix = '</body></html><script>rendererPatch()</script>'
    const output = transformReadableStreamWithRouter(
      router as any,
      upstream.stream as any,
    )
    const reader = output.getReader()

    expect(reserveCalls).toBe(1)
    allowFastPath = true
    upstream.controller.enqueue(encoder.encode(prefix))
    expect(Buffer.from((await reader.read()).value!).toString()).toBe(prefix)

    // Finishing serialization alone cannot bypass the rendered boundary.
    expect(reserveCalls).toBe(1)
    upstream.controller.enqueue(encoder.encode(SCRIPT_BARRIER_HTML + suffix))
    expect(Buffer.from((await reader.read()).value!).toString()).toBe(
      SCRIPT_BARRIER_HTML,
    )
    expect(reserveCalls).toBe(1)

    // The next pull enters the scanner-free post-boundary pass-through phase.
    expect(Buffer.from((await reader.read()).value!).toString()).toBe(suffix)
    expect(reserveCalls).toBe(2)
    expect(claimCalls.count).toBe(1)
    upstream.controller.close()

    expect((await reader.read()).done).toBe(true)
    expect(cleanupCalls.count).toBe(1)
  })

  test('generic streams wait for the document close before a late batch', async () => {
    const { router, emitScriptBatch, cleanupCalls, finishSerialization } =
      makeRouter()
    const upstream = makeManualUpstream()
    const output = transformReadableStreamWithRouter(
      router as any,
      upstream.stream as any,
    )
    const reader = output.getReader()
    const firstAppChunk = '<div>first</div>'

    upstream.push(`${SCRIPT_BARRIER_HTML}${firstAppChunk}`)
    const barrier = await reader.read()
    const first = await reader.read()
    expect(Buffer.from(barrier.value!).toString()).toBe(SCRIPT_BARRIER_HTML)
    expect(Buffer.from(first.value!).toString()).toBe(firstAppChunk)

    const parts = ['lateBatch()']
    emitScriptBatch(parts)
    upstream.push('<span>next</span></body></html>')
    finishSerialization()
    upstream.close()

    const remaining: Array<Uint8Array> = []
    for (;;) {
      const { done, value } = await reader.read()
      if (done) {
        break
      }
      remaining.push(value)
    }

    expect(
      Buffer.concat([barrier.value!, first.value!, ...remaining]).toString(),
    ).toBe(
      `${SCRIPT_BARRIER_HTML}${firstAppChunk}<span>next</span>${renderScriptBatch(
        parts,
      )}</body></html>`,
    )
    expect(cleanupCalls.count).toBe(1)
  })

  test.each([
    ['record-end safe points', { rendererSafePoint: 'record-end' }],
    ['conservative safe points', undefined],
  ] as const)(
    '%s preserve a non-canonical document close when a batch arrives later',
    async (_, options) => {
      const { router, emitScriptBatch, cleanupCalls, finishSerialization } =
        makeRouter()
      const upstream = makeManualUpstream()
      const output = transformReadableStreamWithRouter(
        router as any,
        upstream.stream as any,
        options,
      )
      const reader = output.getReader()
      const rendererHtml =
        `<html><body><main>app</main>${SCRIPT_BARRIER_HTML}` +
        '</body>\n</html>'

      upstream.push(rendererHtml)
      let received = ''
      while (received.length < rendererHtml.length) {
        const result = await reader.read()
        expect(result.done).toBe(false)
        received += Buffer.from(result.value!).toString()
      }
      expect(received).toBe(rendererHtml)

      const parts = ['lateBatch()']
      emitScriptBatch(parts)
      finishSerialization()
      upstream.close()

      let remaining = ''
      for (;;) {
        const { done, value } = await reader.read()
        if (done) {
          break
        }
        remaining += Buffer.from(value).toString()
      }

      expect(received + remaining).toBe(rendererHtml + renderScriptBatch(parts))
      expect(cleanupCalls.count).toBe(1)
    },
  )

  test('an aborted request stops eager string rendering', async () => {
    const reason = new Error('request aborted')
    const abortController = new AbortController()
    abortController.abort(reason)
    const onAbort = vi.fn()
    const setRenderFinished = vi.fn()
    const { router, cleanupCalls } = makeRouter({
      reserveFastPath: () => true,
      setRenderFinished,
    })

    await expect(
      transformHtmlStringWithRouter(
        router as any,
        '<html><body>ready</body></html>',
        { signal: abortController.signal, onAbort },
      ),
    ).rejects.toBe(reason)
    expect(setRenderFinished).not.toHaveBeenCalled()
    expect(onAbort).toHaveBeenCalledOnce()
    expect(onAbort).toHaveBeenCalledWith(reason)
    expect(cleanupCalls.count).toBe(1)
  })

  test('a locked input stream fails synchronously and cleans SSR state', () => {
    const { router, cleanupCalls } = makeRouter({
      reserveFastPath: () => true,
    })
    const upstream = new ReadableStream<Uint8Array>()
    const upstreamReader = upstream.getReader()
    const onAbort = vi.fn()

    expect(() =>
      transformReadableStreamWithRouter(router as any, upstream as any, {
        onAbort,
      }),
    ).toThrow()
    expect(onAbort).toHaveBeenCalledOnce()
    expect(cleanupCalls.count).toBe(1)

    upstreamReader.releaseLock()
  })

  test('a setup failure cancels an acquired input stream', async () => {
    const { router, cleanupCalls } = makeRouter({
      reserveFastPath: () => {
        throw new Error('setup failed')
      },
    })
    const upstream = makeManualUpstream()
    const onAbort = vi.fn()

    expect(() =>
      transformReadableStreamWithRouter(router as any, upstream.stream as any, {
        onAbort,
      }),
    ).toThrow('setup failed')
    await flush()

    expect(upstream.cancelled.value).toBe(true)
    expect(onAbort).toHaveBeenCalledOnce()
    expect(cleanupCalls.count).toBe(1)
  })

  test('a pre-aborted request fails setup before selecting a stream path', async () => {
    const reserveFastPath = vi.fn(() => true)
    const { router, cleanupCalls } = makeRouter({ reserveFastPath })
    const upstream = makeManualUpstream()
    const requestAbort = new AbortController()
    const reason = new Error('request already ended')
    const onAbort = vi.fn()
    requestAbort.abort(reason)

    expect(() =>
      transformReadableStreamWithRouter(router as any, upstream.stream as any, {
        signal: requestAbort.signal,
        onAbort,
      }),
    ).toThrow(reason)
    await flush()

    expect(reserveFastPath).not.toHaveBeenCalled()
    expect(upstream.cancelled).toEqual({ value: true, reason })
    expect(onAbort).toHaveBeenCalledOnce()
    expect(cleanupCalls.count).toBe(1)
  })

  test('an already-failed hydration channel fails stream setup', async () => {
    const state = makeRouter()
    const upstream = makeManualUpstream()
    const reason = new Error('hydration already failed')
    const onAbort = vi.fn()
    state.failHydrationOutput(reason)

    expect(() =>
      transformReadableStreamWithRouter(
        state.router as any,
        upstream.stream as any,
        {
          onAbort,
        },
      ),
    ).toThrow(reason)
    await flush()

    expect(upstream.cancelled).toEqual({ value: true, reason })
    expect(onAbort).toHaveBeenCalledOnce()
    expect(state.cleanupCalls.count).toBe(1)
  })

  test.each([
    ['fast', true],
    ['merge', false],
  ] as const)(
    'request abort immediately closes the %s path',
    async (_, reserveFastPath) => {
      const { router, cleanupCalls } = makeRouter({
        reserveFastPath: () => reserveFastPath,
      })
      const upstream = makeManualUpstream()
      const requestAbort = new AbortController()
      const onAbort = vi.fn()
      const output = transformReadableStreamWithRouter(
        router as any,
        upstream.stream as any,
        {
          signal: requestAbort.signal,
          onAbort,
        },
      )
      const reader = output.getReader()
      const pendingRead = reader.read()
      const reason = new Error('request ended')

      requestAbort.abort(reason)

      await expect(pendingRead).rejects.toBe(reason)
      await flush()
      expect(upstream.cancelled).toEqual({ value: true, reason })
      expect(onAbort).toHaveBeenCalledOnce()
      expect(cleanupCalls.count).toBe(1)
    },
  )

  test('downstream cancel propagates upstream and calls serverSsr.cleanup once', async () => {
    // Fast path: simpler, no scanner. Verifies cancel + cleanup contract.
    const { router, cleanupCalls } = makeRouter({
      reserveFastPath: () => true,
    })
    const upstream = makeManualUpstream()

    const out = transformReadableStreamWithRouter(
      router as any,
      upstream.stream as any,
    )
    const reader = (
      out as any
    ).getReader() as ReadableStreamDefaultReader<Uint8Array>

    // Cancel before any data flows. Should still trigger upstream cancel
    // and exactly one cleanup invocation.
    await reader.cancel('consumer-gone')
    await flush()

    expect(upstream.cancelled.value).toBe(true)
    expect(cleanupCalls.count).toBe(1)
  })

  test('downstream cancel releases the upstream reader while cancellation settles', async () => {
    const { router, cleanupCalls } = makeRouter({
      reserveFastPath: () => true,
    })

    let resolveCancel!: () => void
    const upstream = new ReadableStream<Uint8Array>({
      pull() {
        // Keep the transform's upstream read pending until cancellation.
      },
      cancel() {
        return new Promise<void>((resolve) => {
          resolveCancel = resolve
        })
      },
    })

    const out = transformReadableStreamWithRouter(
      router as any,
      upstream as any,
    )
    const reader = (
      out as any
    ).getReader() as ReadableStreamDefaultReader<Uint8Array>

    let cancelSettled = false
    const cancelPromise = reader.cancel('consumer-gone').then(() => {
      cancelSettled = true
    })

    await flush()
    expect(cancelSettled).toBe(false)
    expect(upstream.locked).toBe(false)
    expect(cleanupCalls.count).toBe(1)

    resolveCancel()
    await cancelPromise
    expect(cancelSettled).toBe(true)
  })

  test('stream response metadata defers cleanup until body drains', async () => {
    const { router, cleanupCalls } = makeRouter({
      reserveFastPath: () => true,
    })
    const upstream = makeManualUpstream()

    const out = transformReadableStreamWithRouter(
      router as any,
      upstream.stream as any,
    )
    const response = new Response(out as any)
    const result = createSsrStreamResponse(router as any, response)

    expect(result.serverSsrCleanup).toBe('stream')
    expect(cleanupCalls.count).toBe(0)

    upstream.push('<html><body>done</body></html>')
    upstream.close()

    await result.response.text()
    expect(cleanupCalls.count).toBe(1)
  })

  test('stream response dispose cancels body and cleans once', async () => {
    const { router, cleanupCalls } = makeRouter({
      reserveFastPath: () => true,
    })
    const upstream = makeManualUpstream()

    const out = transformReadableStreamWithRouter(
      router as any,
      upstream.stream as any,
    )
    const result = createSsrStreamResponse(
      router as any,
      new Response(out as any),
    )
    expect(result.serverSsrCleanup).toBe('stream')

    await result.dispose('dropped')
    await result.dispose('dropped-again')

    expect(upstream.cancelled.value).toBe(true)
    expect(cleanupCalls.count).toBe(1)
  })

  test('stream response replacement does not wait for cancellation', async () => {
    const { router, cleanupCalls } = makeRouter({
      reserveFastPath: () => true,
    })
    let cancelCalls = 0
    const stream = new ReadableStream({
      cancel() {
        cancelCalls++
        return new Promise<void>(() => {})
      },
    })
    const result = createSsrStreamResponse(
      router as any,
      new Response(stream as any),
    )
    const replacement = new Response('replacement')

    const next = replaceSsrResponse(result, replacement, 'replaced')

    expect(next.response).toBe(replacement)
    expect(cancelCalls).toBe(1)
    expect(cleanupCalls.count).toBe(1)
  })

  test('external serverSsr cleanup releases a never-read merge transform immediately', async () => {
    vi.useFakeTimers()
    try {
      const { router, cleanupCalls } = makeRouter()
      const upstream = makeManualUpstream()
      const aborts: Array<unknown> = []

      const out = transformReadableStreamWithRouter(
        router as any,
        upstream.stream as any,
        {
          onAbort: (reason) => aborts.push(reason),
        },
      )
      expect(vi.getTimerCount()).toBe(1)

      // A discarded response is never read and never cancelled; external
      // cleanup must not leave the transform pinned until the lifetime timer.
      router.serverSsr!.cleanup()

      expect(cleanupCalls.count).toBe(1)
      expect(aborts).toHaveLength(1)
      expect((aborts[0] as Error).name).toBe('AbortError')
      expect(upstream.cancelled.value).toBe(true)
      expect(vi.getTimerCount()).toBe(0)
      await expect(out.getReader().read()).rejects.toMatchObject({
        name: 'AbortError',
      })
    } finally {
      vi.useRealTimers()
    }
  })

  test('external serverSsr cleanup releases a never-read fast-path transform immediately', async () => {
    vi.useFakeTimers()
    try {
      const { router, cleanupCalls } = makeRouter({
        reserveFastPath: () => true,
      })
      const upstream = makeManualUpstream()
      const aborts: Array<unknown> = []

      const out = transformReadableStreamWithRouter(
        router as any,
        upstream.stream as any,
        {
          onAbort: (reason) => aborts.push(reason),
        },
      )
      expect(vi.getTimerCount()).toBe(1)

      router.serverSsr!.cleanup()

      expect(cleanupCalls.count).toBe(1)
      expect(aborts).toHaveLength(1)
      expect(upstream.cancelled.value).toBe(true)
      expect(vi.getTimerCount()).toBe(0)
      await expect(out.getReader().read()).rejects.toMatchObject({
        name: 'AbortError',
      })
    } finally {
      vi.useRealTimers()
    }
  })

  test('external serverSsr cleanup promptly fails a merge stream parked on hydration output', async () => {
    const { router, cleanupCalls } = makeRouter()
    const upstream = makeManualUpstream()
    const aborts: Array<unknown> = []

    const out = transformReadableStreamWithRouter(
      router as any,
      upstream.stream as any,
      {
        onAbort: (reason) => aborts.push(reason),
      },
    )
    const reader = out.getReader()

    upstream.push(`<html><body>${SCRIPT_BARRIER_HTML}`)
    const first = await reader.read()
    expect(first.done).toBe(false)

    // Renderer EOF with hydration output still Waiting parks the pump.
    upstream.close()
    const parked = reader.read()
    await new Promise((resolve) => setTimeout(resolve, 0))

    router.serverSsr!.cleanup()

    await expect(parked).rejects.toMatchObject({ name: 'AbortError' })
    expect(cleanupCalls.count).toBe(1)
    expect(aborts).toHaveLength(1)
  })

  test('SSR byte-0 pass-through is used when explicitly safe', async () => {
    let setRenderFinishedCalls = 0
    const { router, cleanupCalls } = makeRouter({
      reserveFastPath: () => true,
      setRenderFinished: () => {
        setRenderFinishedCalls++
      },
    })
    const upstream = makeManualUpstream()

    const out = transformReadableStreamWithRouter(
      router as any,
      upstream.stream as any,
    )
    upstream.push('<html><body>done</body></html>')
    upstream.close()

    const text = await readAll(out as any)
    expect(text).toBe('<html><body>done</body></html>')
    expect(setRenderFinishedCalls).toBe(1)
    expect(cleanupCalls.count).toBe(1)
  })

  test('SSR pass-through is bypassed when not explicitly safe', async () => {
    const { router, emitScriptBatch, finishSerialization } = makeRouter({
      reserveFastPath: () => false,
    })
    const upstream = makeManualUpstream()

    emitScriptBatch(['pending()'])
    const out = transformReadableStreamWithRouter(
      router as any,
      upstream.stream as any,
    )
    upstream.push(`<html><body>done${SCRIPT_BARRIER_HTML}</body></html>`)
    upstream.close()
    finishSerialization()

    const text = await readAll(out as any)
    expect(text).toContain(renderScriptBatch(['pending()']))
    expect(text.indexOf(renderScriptBatch(['pending()']))).toBeLessThan(
      text.indexOf('</body>'),
    )
  })

  const lifetimeTimeoutCases = [
    {
      name: 'pass-through with an active reader',
      reserveFastPath: true,
      activeReader: true,
    },
    {
      name: 'pass-through without an active reader',
      reserveFastPath: true,
      activeReader: false,
    },
    {
      name: 'main path with an active reader',
      reserveFastPath: false,
      activeReader: true,
    },
    {
      name: 'main path without an active reader',
      reserveFastPath: false,
      activeReader: false,
    },
  ] as const

  test.each(lifetimeTimeoutCases)(
    'lifetime timeout errors $name and cleans up',
    async ({ reserveFastPath, activeReader }) => {
      vi.useFakeTimers()
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      try {
        const { router, cleanupCalls } = makeRouter({
          reserveFastPath: () => reserveFastPath,
        })
        const upstream = makeManualUpstream()
        const out = transformReadableStreamWithRouter(
          router as any,
          upstream.stream as any,
          {
            lifetimeMs: 10,
          },
        )

        if (activeReader) {
          const reader = out.getReader()
          const pendingRead = reader.read()
          const readError = expect(pendingRead).rejects.toThrow(
            'Stream lifetime exceeded',
          )

          await vi.advanceTimersByTimeAsync(15)

          await readError
          reader.releaseLock()
        } else {
          await vi.advanceTimersByTimeAsync(15)

          const reader = out.getReader()
          await expect(reader.read()).rejects.toThrow(
            'Stream lifetime exceeded',
          )
          reader.releaseLock()
        }

        expect(upstream.cancelled.value).toBe(true)
        expect(upstream.cancelled.reason).toEqual(
          new Error('Stream lifetime exceeded'),
        )
        expect(cleanupCalls.count).toBe(1)
        expect(warnSpy).toHaveBeenCalledOnce()
      } finally {
        warnSpy.mockRestore()
        vi.useRealTimers()
      }
    },
  )

  test('serialization timeout fails a completed render exactly once', async () => {
    vi.useFakeTimers()
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const onAbort = vi.fn()
      const { router, cleanupCalls } = makeRouter()
      const upstream = makeManualUpstream()
      const output = transformReadableStreamWithRouter(
        router as any,
        upstream.stream as any,
        {
          timeoutMs: 10,
          lifetimeMs: 1_000,
          onAbort,
        },
      )
      const outputPromise = readAll(output)
      const outputError = expect(outputPromise).rejects.toThrow(
        'Serialization timeout after app render finished',
      )

      upstream.push(`${SCRIPT_BARRIER_HTML}${DOCUMENT_CLOSE}`)
      upstream.close()
      await flush(10)
      await vi.advanceTimersByTimeAsync(15)

      await outputError
      expect(onAbort).toHaveBeenCalledOnce()
      expect(onAbort.mock.calls[0]![0]).toEqual(
        new Error('Serialization timeout after app render finished'),
      )
      expect(cleanupCalls.count).toBe(1)
      expect(errorSpy).toHaveBeenCalledOnce()
      expect(vi.getTimerCount()).toBe(0)
    } finally {
      errorSpy.mockRestore()
      vi.useRealTimers()
    }
  })

  test('upstream cancel() that rejects does not produce an unhandled rejection', async () => {
    // Some upstream sources may reject when cancel() is called (e.g. their
    // own underlying source.cancel throws). safeCancelReader must swallow.
    const unhandled: Array<unknown> = []
    const onUnhandled = (e: PromiseRejectionEvent | any) => {
      unhandled.push(e?.reason ?? e)
    }
    process.on('unhandledRejection', onUnhandled)
    try {
      const { router, cleanupCalls } = makeRouter()

      const stream = new ReadableStream<Uint8Array>({
        start() {},
        cancel() {
          // Simulate a misbehaving upstream whose cancel rejects.
          throw new Error('boom-cancel')
        },
      })

      const out = transformReadableStreamWithRouter(
        router as any,
        stream as any,
      )
      const reader = (
        out as any
      ).getReader() as ReadableStreamDefaultReader<Uint8Array>

      // Consumer goes away → triggers cancelUpstream → upstream cancel throws.
      await reader.cancel('consumer-gone').catch(() => {})
      // Allow microtasks for any rejection to surface.
      await flush(10)

      expect(cleanupCalls.count).toBe(1)
      expect(
        unhandled.find(
          (e: any) => e && String(e.message || e).includes('boom-cancel'),
        ),
      ).toBeUndefined()
    } finally {
      process.off('unhandledRejection', onUnhandled)
    }
  })

  test('an output-channel failure terminates without another downstream pull', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const { router, cleanupCalls, failHydrationOutput } = makeRouter()
      const upstream = makeManualUpstream()
      const out = transformReadableStreamWithRouter(
        router as any,
        upstream.stream as any,
      )
      const reason = new Error('hydration-output-failed')

      failHydrationOutput(reason)
      await flush()

      await expect(readAll(out as any)).rejects.toBe(reason)
      expect(upstream.cancelled.value).toBe(true)
      expect(cleanupCalls.count).toBe(1)
    } finally {
      errorSpy.mockRestore()
    }
  })

  test('places a late router batch after a post-document script patch and before the relocated close', async () => {
    const { router, emitScriptBatch, cleanupCalls, finishSerialization } =
      makeRouter()
    const upstream = makeManualUpstream()
    const output = transformReadableStreamWithRouter(
      router as any,
      upstream.stream as any,
      {
        rendererSafePoint: 'script-close',
      },
    )
    const reader = output.getReader()
    const shell = `<html><body><!--$?--><template id="B:0"></template><p>loading</p><!--/$-->${SCRIPT_BARRIER_HTML}`
    // Minimal resolved segment and replacement call. The runtime helper can be
    // installed by the shell.
    const rendererPatch =
      '<div hidden id="S:0"><p>resolved</p></div>' +
      '<script>applyPatch("B:0","S:0")</script>'
    const appHtml = `${shell}</body></html>${rendererPatch}`

    upstream.push(appHtml)

    const shellChunk = await reader.read()
    expect(shellChunk.done).toBe(false)
    expect(Buffer.from(shellChunk.value!).toString('utf8')).toBe(shell)

    const patchChunk = await reader.read()
    expect(patchChunk.done).toBe(false)
    expect(Buffer.from(patchChunk.value!).toString('utf8')).toBe(rendererPatch)

    // The original close suffix has now been scanned and held. This batch is
    // deliberately emitted afterward to cover the late-arrival ordering.
    const routerParts = ['routerPayload()']
    emitScriptBatch(routerParts)
    finishSerialization()

    const routerChunk = await reader.read()
    expect(routerChunk.done).toBe(false)
    expect(Buffer.from(routerChunk.value!).toString('utf8')).toBe(
      renderScriptBatch(routerParts),
    )

    upstream.close()

    const chunks = [shellChunk.value!, patchChunk.value!, routerChunk.value!]
    for (;;) {
      const { done, value } = await reader.read()
      if (done) {
        break
      }
      chunks.push(value)
    }

    const actual = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)))
    const routerScript = renderScriptBatch(routerParts)
    const expected = Buffer.from(
      `${shell}${rendererPatch}${routerScript}</body></html>`,
    )

    expect(actual).toEqual(expected)
    expect(actual.indexOf(Buffer.from(rendererPatch))).toBeLessThan(
      actual.indexOf(Buffer.from(routerScript)),
    )
    expect(actual.indexOf(Buffer.from(routerScript))).toBeLessThan(
      actual.indexOf(Buffer.from('</body></html>')),
    )
    expect(cleanupCalls.count).toBe(1)
  })

  test.each(internalSplitOffsets(SCRIPT_CLOSE))(
    'waits for a script-close safe point split at byte %s before a router batch',
    async (splitAt) => {
      const { router, emitScriptBatch, finishSerialization } = makeRouter()
      const upstream = makeManualUpstream()
      const output = transformReadableStreamWithRouter(
        router as any,
        upstream.stream as any,
        {
          rendererSafePoint: 'script-close',
        },
      )
      const reader = output.getReader()
      const patchPrefix =
        '<div hidden id="S:0">resolved</div><script>applyPatch()' +
        SCRIPT_CLOSE.slice(0, splitAt)
      const patchSuffix = SCRIPT_CLOSE.slice(splitAt)

      upstream.push(`${SCRIPT_BARRIER_HTML}${DOCUMENT_CLOSE}${patchPrefix}`)
      expect(Buffer.from((await reader.read()).value!).toString()).toBe(
        SCRIPT_BARRIER_HTML,
      )
      expect(Buffer.from((await reader.read()).value!).toString()).toBe(
        patchPrefix,
      )

      emitScriptBatch(['streamed()'])
      upstream.push(`${patchSuffix}<div>later patch</div>`)

      expect(Buffer.from((await reader.read()).value!).toString()).toBe(
        patchSuffix,
      )
      expect(Buffer.from((await reader.read()).value!).toString()).toBe(
        renderScriptBatch(['streamed()']),
      )

      finishSerialization()
      upstream.close()
      let remaining = ''
      for (;;) {
        const { done, value } = await reader.read()
        if (done) {
          break
        }
        remaining += Buffer.from(value).toString()
      }
      expect(remaining).toBe(`<div>later patch</div>${DOCUMENT_CLOSE}`)
    },
  )

  test('does not join a script close across skipped close-carry bytes', async () => {
    const { router, emitScriptBatch, finishSerialization } = makeRouter()
    const upstream = makeManualUpstream()
    const output = transformReadableStreamWithRouter(
      router as any,
      upstream.stream as any,
      {
        rendererSafePoint: 'script-close',
      },
    )
    const reader = output.getReader()
    const patchPrefix = '<script>foo="</scr<'
    const patchSuffix = '12345678901234ipt>";more()</script>'

    upstream.push(`${SCRIPT_BARRIER_HTML}${patchPrefix}`)
    expect(Buffer.from((await reader.read()).value!).toString()).toBe(
      SCRIPT_BARRIER_HTML,
    )
    expect(Buffer.from((await reader.read()).value!).toString()).toBe(
      patchPrefix.slice(0, -1),
    )

    const parts = ['streamed()']
    emitScriptBatch(parts)
    upstream.push(`${patchSuffix}${DOCUMENT_CLOSE}`)
    upstream.close()
    finishSerialization()

    let remaining = ''
    for (;;) {
      const { done, value } = await reader.read()
      if (done) {
        break
      }
      remaining += Buffer.from(value).toString()
    }

    expect(remaining).toBe(
      `<${patchSuffix}${renderScriptBatch(parts)}${DOCUMENT_CLOSE}`,
    )
  })

  test('places a router batch after a script-terminated patch and before its final close', async () => {
    const { router, emitScriptBatch, cleanupCalls, finishSerialization } =
      makeRouter()
    const upstream = makeManualUpstream()
    const output = transformReadableStreamWithRouter(
      router as any,
      upstream.stream as any,
      {
        rendererSafePoint: 'script-close',
      },
    )
    const reader = output.getReader()
    const shell =
      `<html><head></head><body><!--$?--><template id="B:0"></template>` +
      `<p>loading</p><!--/$-->${SCRIPT_BARRIER_HTML}` +
      '<script id="_R_">requestAnimationFrame(function(){})</script>'
    const rendererPatch =
      '<div hidden id="S:0"><p>resolved</p></div>' +
      '<script>applyPatch("B:0","S:0")</script>'

    upstream.push(shell)
    const shellChunks = [await reader.read(), await reader.read()]
    expect(
      Buffer.concat(
        shellChunks.map((chunk) => Buffer.from(chunk.value!)),
      ).toString(),
    ).toBe(shell)

    upstream.push(rendererPatch)
    const patchChunk = await reader.read()
    expect(Buffer.from(patchChunk.value!).toString()).toBe(rendererPatch)

    const routerParts = ['routerPayload()']
    emitScriptBatch(routerParts)
    finishSerialization()
    const routerChunk = await reader.read()
    expect(Buffer.from(routerChunk.value!).toString()).toBe(
      renderScriptBatch(routerParts),
    )

    upstream.push(DOCUMENT_CLOSE)
    upstream.close()

    const closeChunk = await reader.read()
    expect(Buffer.from(closeChunk.value!).toString()).toBe(DOCUMENT_CLOSE)
    expect((await reader.read()).done).toBe(true)
    expect(cleanupCalls.count).toBe(1)
  })

  test.each(['one byte chunk', 'byte chunks', 'one string record'] as const)(
    'relocates the document close after script safe points in %s',
    async (input) => {
      const { router, finishSerialization, cleanupCalls } = makeRouter()
      const upstream = createControlledStream<Uint8Array | string>()
      const output = transformReadableStreamWithRouter(
        router as any,
        upstream.stream,
        { rendererSafePoint: 'script-close' },
      )
      const reader = output.getReader()
      const patch = '<script>firstPatch()</script>'
      const prefix = SCRIPT_BARRIER_HTML + patch
      const filler = 'x'.repeat(
        MAX_HYDRATION_OUTPUT_CHUNK_BYTES - prefix.length,
      )
      const afterClose = '<script>lastPatch("😀")</script>'
      const first = prefix + filler
      const last = DOCUMENT_CLOSE + afterClose
      const encoder = new TextEncoder()

      if (input === 'one string record') {
        upstream.controller.enqueue(first + last)
      } else if (input === 'byte chunks') {
        upstream.controller.enqueue(encoder.encode(first))
        upstream.controller.enqueue(encoder.encode(last))
      } else {
        upstream.controller.enqueue(encoder.encode(first + last))
      }
      upstream.controller.close()

      expect(Buffer.from((await reader.read()).value!).toString()).toBe(
        SCRIPT_BARRIER_HTML,
      )
      // Keep hydration waiting until a script safe point has interrupted the
      // document-close search. The byte/string variants then advance chunks.
      expect(Buffer.from((await reader.read()).value!).toString()).toBe(patch)
      finishSerialization()
      reader.releaseLock()

      await expect(readAll(output)).resolves.toBe(
        filler + afterClose + DOCUMENT_CLOSE,
      )
      expect(cleanupCalls.count).toBe(1)
    },
  )

  test.each(
    ['', '</body>'].flatMap((prefix) =>
      internalSplitOffsets(prefix + DOCUMENT_CLOSE).map((splitAt) => ({
        prefix,
        splitAt,
      })),
    ),
  )(
    'relocates the structural document close after "$prefix" split at byte $splitAt',
    async ({ prefix, splitAt }) => {
      const { router, finishSerialization } = makeRouter()
      const upstream = makeManualUpstream()
      const output = transformReadableStreamWithRouter(
        router as any,
        upstream.stream as any,
        { rendererSafePoint: 'script-close' },
      )
      const shell = `<html><body>${SCRIPT_BARRIER_HTML}`
      const patch = '<script>beforeClose()</script>'
      const beforeClose = `${shell}${patch}<main>app</main>`
      const afterClose = '<script>rendererPatch()</script>'
      const close = prefix + DOCUMENT_CLOSE

      upstream.push(beforeClose + close.slice(0, splitAt))
      upstream.push(close.slice(splitAt) + afterClose)
      upstream.close()
      const reader = output.getReader()
      expect(Buffer.from((await reader.read()).value!).toString()).toBe(shell)
      expect(Buffer.from((await reader.read()).value!).toString()).toBe(patch)
      finishSerialization()
      reader.releaseLock()

      await expect(readAll(output)).resolves.toBe(
        '<main>app</main>' + prefix + afterClose + DOCUMENT_CLOSE,
      )
    },
  )

  test('reconstructs one emoji split across upstream UTF-8 byte chunks', async () => {
    const { router, finishSerialization } = makeRouter()
    const upstream = createControlledStream<Uint8Array>()
    const out = transformReadableStreamWithRouter(
      router as any,
      upstream.stream as any,
    )
    const encoder = new TextEncoder()
    const emoji = encoder.encode('😀')
    const html = `<html><body><p>😀</p>${SCRIPT_BARRIER_HTML}</body></html>`

    upstream.controller.enqueue(encoder.encode('<html><body><p>'))
    upstream.controller.enqueue(emoji.slice(0, 2))
    upstream.controller.enqueue(emoji.slice(2))
    upstream.controller.enqueue(
      encoder.encode(`</p>${SCRIPT_BARRIER_HTML}</body></html>`),
    )
    upstream.controller.close()
    finishSerialization()

    await expect(readAll(out)).resolves.toBe(html)
  })

  test('does not interleave application bytes while an opaque record is active', async () => {
    const { router, emitHydrationRecord, finishSerialization } = makeRouter()
    const upstream = makeManualUpstream()
    const output = transformReadableStreamWithRouter(
      router as any,
      upstream.stream as any,
    )
    const reader = output.getReader()
    const record = 'R'.repeat(MAX_HYDRATION_OUTPUT_CHUNK_BYTES * 2 + 1)
    const patch = '<script>frameworkPatch()</script>'

    upstream.push(`<html><body>${SCRIPT_BARRIER_HTML}`)
    expect(Buffer.from((await reader.read()).value!).toString()).toBe(
      `<html><body>${SCRIPT_BARRIER_HTML}`,
    )

    emitHydrationRecord(record)
    upstream.push(patch + DOCUMENT_CLOSE)
    upstream.close()
    finishSerialization()

    let rest = ''
    for (;;) {
      const { done, value } = await reader.read()
      if (done) {
        break
      }
      rest += Buffer.from(value).toString()
    }

    expect(rest).toBe(record + patch + DOCUMENT_CLOSE)
  })

  test('drains an active opaque record after prefetched renderer EOF', async () => {
    const setRenderFinished = vi.fn()
    const startSerializationTimeout = vi.fn()
    const { router, emitHydrationRecord, finishSerialization } = makeRouter({
      setRenderFinished,
      startSerializationTimeout,
    })
    const upstream = makeManualUpstream()
    const output = transformReadableStreamWithRouter(
      router as any,
      upstream.stream as any,
    )
    const reader = output.getReader()
    const record = 'R'.repeat(MAX_HYDRATION_OUTPUT_CHUNK_BYTES + 1)

    upstream.push(SCRIPT_BARRIER_HTML)
    expect(Buffer.from((await reader.read()).value!).toString()).toBe(
      SCRIPT_BARRIER_HTML,
    )
    emitHydrationRecord(record)
    finishSerialization()
    upstream.close()
    await flush()

    expect(startSerializationTimeout).toHaveBeenCalledOnce()
    expect(startSerializationTimeout).toHaveBeenCalledWith(60_000)
    expect(setRenderFinished).toHaveBeenCalledOnce()

    const first = await reader.read()
    expect(first.done).toBe(false)

    let received = Buffer.from(first.value!).toString()
    for (;;) {
      const { done, value } = await reader.read()
      if (done) {
        break
      }
      received += Buffer.from(value).toString()
    }
    expect(received).toBe(record)
  })

  test('draining a large source does not read more app chunks per transport slice', async () => {
    const { router, emitScriptBatch } = makeRouter()
    const encoder = new TextEncoder()
    let produced = 0
    const appStream = new ReadableStream<Uint8Array>({
      pull(controller) {
        produced++
        controller.enqueue(
          encoder.encode(
            produced === 1
              ? `<html><body><main>app</main>${SCRIPT_BARRIER_HTML}`
              : `<p>app-${produced}</p>`,
          ),
        )
      },
    })
    const out = transformReadableStreamWithRouter(
      router as any,
      appStream as any,
    )
    emitScriptBatch([createIssuePayload()])
    const reader = out.getReader()

    const first = await reader.read()
    expect(first.done).toBe(false)
    await flush()
    const producedBeforeRouterDrain = produced

    for (let index = 0; index < 8; index++) {
      const next = await reader.read()
      expect(next.done).toBe(false)
    }
    await flush()

    expect(produced).toBe(producedBeforeRouterDrain)
    await reader.cancel()
  })

  test('a prefetched upstream error immediately stops an active large-source drain', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const { router, emitScriptBatch, cleanupCalls } = makeRouter()
      const upstream = makeManualUpstream()
      const onAbort = vi.fn()
      const out = transformReadableStreamWithRouter(
        router as any,
        upstream.stream as any,
        { onAbort },
      )
      const reader = out.getReader()
      const upstreamError = new Error('renderer-failed')

      emitScriptBatch([createIssuePayload()])
      upstream.push(`<html><body>${SCRIPT_BARRIER_HTML}`)
      expect((await reader.read()).done).toBe(false)
      expect((await reader.read()).done).toBe(false)

      upstream.error(upstreamError)
      await flush()

      expect(cleanupCalls.count).toBe(1)
      expect(onAbort).toHaveBeenCalledOnce()
      expect(onAbort).toHaveBeenCalledWith(upstreamError)
      await expect(reader.read()).rejects.toBe(upstreamError)
    } finally {
      errorSpy.mockRestore()
    }
  })

  test('cancellation tears down an active large-source drain', async () => {
    const { router, emitScriptBatch, cleanupCalls } = makeRouter()
    const upstream = makeManualUpstream()
    const out = transformReadableStreamWithRouter(
      router as any,
      upstream.stream as any,
    )
    const reader = out.getReader()

    emitScriptBatch([createIssuePayload()])
    upstream.push(`<html><body><main>app</main>${SCRIPT_BARRIER_HTML}`)

    expect((await reader.read()).done).toBe(false)
    expect((await reader.read()).done).toBe(false)
    expect(cleanupCalls.count).toBe(0)

    await reader.cancel('consumer-gone')

    expect(upstream.cancelled.value).toBe(true)
    expect(cleanupCalls.count).toBe(1)
  })

  test('lifetime timeout errors an active large-source drain', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.useFakeTimers()
    try {
      const { router, emitScriptBatch, cleanupCalls } = makeRouter()
      const upstream = makeManualUpstream()
      const out = transformReadableStreamWithRouter(
        router as any,
        upstream.stream as any,
        {
          lifetimeMs: 10,
        },
      )
      const reader = out.getReader()

      emitScriptBatch([createIssuePayload()])
      upstream.push(`<html><body><main>app</main>${SCRIPT_BARRIER_HTML}`)

      expect((await reader.read()).done).toBe(false)
      expect((await reader.read()).done).toBe(false)

      await vi.advanceTimersByTimeAsync(15)

      await expect(reader.read()).rejects.toThrow('Stream lifetime exceeded')
      expect(upstream.cancelled.value).toBe(true)
      expect(upstream.cancelled.reason).toEqual(
        new Error('Stream lifetime exceeded'),
      )
      expect(cleanupCalls.count).toBe(1)
      expect(warnSpy).toHaveBeenCalledOnce()
    } finally {
      vi.useRealTimers()
      warnSpy.mockRestore()
    }
  })

  test('forwards a large application byte chunk unchanged', async () => {
    const { router, finishSerialization } = makeRouter()
    const upstream = makeManualUpstream()
    const out = transformReadableStreamWithRouter(
      router as any,
      upstream.stream as any,
    )
    const reader = (out as any).getReader()
    const text = '😀a'.repeat(50_000)

    upstream.push(text)

    const first = await reader.read()
    expect(first.done).toBe(false)
    const firstText = Buffer.from(first.value).toString('utf8')
    expect(firstText).toBe(text)

    upstream.push(SCRIPT_BARRIER_HTML)
    upstream.close()
    finishSerialization()

    let rest = ''
    for (;;) {
      const { done, value } = await reader.read()
      if (done) {
        break
      }
      rest += Buffer.from(value).toString('utf8')
    }

    expect(firstText + rest).toBe(text + SCRIPT_BARRIER_HTML)
  })

  test('forwards an incomplete document close and drains pending router scripts', async () => {
    const { router, emitScriptBatch, finishSerialization, cleanupCalls } =
      makeRouter()
    const upstream = makeManualUpstream()
    const out = transformReadableStreamWithRouter(
      router as any,
      upstream.stream as any,
    )
    const reader = out.getReader()

    upstream.push(`<html><body>${SCRIPT_BARRIER_HTML}</body></ht`)
    expect(Buffer.from((await reader.read()).value!).toString()).toBe(
      `<html><body>${SCRIPT_BARRIER_HTML}`,
    )

    const pendingRead = reader.read()
    await flush()
    emitScriptBatch(['pending()'])
    finishSerialization()
    upstream.close()

    expect(Buffer.from((await pendingRead).value!).toString()).toBe(
      '</body></ht',
    )
    reader.releaseLock()
    expect(await readAll(out as any)).toBe(
      '<script>pending();document.currentScript.remove()</script>',
    )
    expect(cleanupCalls.count).toBe(1)
  })

  test('downstream backpressure delays close; no chunks are lost', async () => {
    // Consumer reads slowly: all router scripts and relocated closing tags
    // must arrive before the stream ends.
    const { router, emitScriptBatch, finishSerialization } = makeRouter()
    const upstream = makeManualUpstream()

    const out = transformReadableStreamWithRouter(
      router as any,
      upstream.stream as any,
    )

    upstream.push(`<html><body><div>a</div>${SCRIPT_BARRIER_HTML}`)
    // Queue many script batches while app is still rendering.
    for (let i = 0; i < 50; i++) {
      emitScriptBatch([`S${i}`])
    }
    upstream.push('</body></html>')
    upstream.close()
    finishSerialization()

    const full = await readAll(out as any)

    expect(full).toContain('<div>a</div>')
    expect(full).toContain('</body></html>')
    for (let i = 0; i < 50; i++) {
      expect(full).toContain(renderScriptBatch([`S${i}`]))
    }
    // All scripts must appear before </body>.
    expect(full.indexOf(renderScriptBatch(['S49']))).toBeLessThan(
      full.indexOf('</body>'),
    )
  })
})

describe('transformReadableStreamWithRouter — hydration output ordering', () => {
  test('does not scan or lift the barrier before the initial script take', async () => {
    let taken = false
    const { router, emitScriptBatch, finishSerialization } = makeRouter({
      isInitialTaken: () => taken,
    })
    const upstream = makeManualUpstream()
    const out = transformReadableStreamWithRouter(
      router as any,
      upstream.stream as any,
    )
    const reader = out.getReader()
    const injected = 'late()'
    const rendered = renderScriptBatch([injected])
    const decoder = new TextDecoder()

    // A Ready record plus barrier-lookalike bytes rendered before <Scripts>
    // ran (initial take pending) must pass through without lifting.
    emitScriptBatch([injected])
    upstream.push(`<html><body>${SCRIPT_BARRIER_HTML}`)
    const first = await reader.read()
    expect(first.done).toBe(false)
    expect(decoder.decode(first.value)).toBe(
      `<html><body>${SCRIPT_BARRIER_HTML}`,
    )

    // After the take, the real boundary lifts the barrier and the queued
    // record is injected after it.
    taken = true
    upstream.push(`<main>x</main>${SCRIPT_BARRIER_HTML}${DOCUMENT_CLOSE}`)
    upstream.close()
    finishSerialization()

    let rest = ''
    for (;;) {
      const result = await reader.read()
      if (result.done) {
        break
      }
      rest += decoder.decode(result.value, { stream: true })
    }
    const barrierEnd =
      rest.indexOf(SCRIPT_BARRIER_HTML) + SCRIPT_BARRIER_HTML.length
    expect(rest.indexOf(SCRIPT_BARRIER_HTML)).toBeGreaterThanOrEqual(0)
    expect(rest.indexOf(rendered)).toBeGreaterThanOrEqual(barrierEnd)
    expect(rest.endsWith(DOCUMENT_CLOSE)).toBe(true)
  })

  test('does not interpret close-looking bytes before the router boundary', async () => {
    const { router, emitScriptBatch, finishSerialization } = makeRouter()
    const upstream = makeManualUpstream()
    const out = transformReadableStreamWithRouter(
      router as any,
      upstream.stream as any,
    )
    const injected = 'pending()'
    const rendered = renderScriptBatch([injected])
    const inlineScript = '<script>const close = "</body></html>"</script>'

    emitScriptBatch([injected])
    upstream.push(
      `<html><body>${inlineScript}<iframe><p></fake></body></p></iframe><main>x</main>${SCRIPT_BARRIER_HTML}</body></html>`,
    )
    upstream.close()
    finishSerialization()

    const full = await readAll(out as any)
    expect(full).toContain(inlineScript)
    expect(full.indexOf(rendered)).toBeGreaterThan(full.indexOf('</iframe>'))
    expect(full.indexOf(rendered)).toBeLessThan(full.lastIndexOf('</body>'))
  })

  test('keeps queued script batches ordered when lifting the barrier emits synchronously', async () => {
    const beforeLift = 'beforeLift()'
    const duringLift = 'duringLift()'
    const duringLiftEmitter: {
      current?: (html: string) => void
    } = {}
    const { router, emitScriptBatch, finishSerialization } = makeRouter({
      liftBarrier: () => {
        duringLiftEmitter.current!(duringLift)
      },
    })
    duringLiftEmitter.current = (script) => emitScriptBatch([script])
    const upstream = makeManualUpstream()
    const out = transformReadableStreamWithRouter(
      router as any,
      upstream.stream as any,
    )

    emitScriptBatch([beforeLift])
    upstream.push(`<html><body>${SCRIPT_BARRIER_HTML}</body></html>`)
    upstream.close()
    finishSerialization()

    const full = await readAll(out as any)
    expect(full.indexOf(renderScriptBatch([beforeLift]))).toBeGreaterThan(
      full.indexOf(SCRIPT_BARRIER_HTML),
    )
    expect(full.indexOf(renderScriptBatch([beforeLift]))).toBeLessThan(
      full.indexOf(renderScriptBatch([duringLift])),
    )
    expect(full.indexOf(renderScriptBatch([duringLift]))).toBeLessThan(
      full.indexOf('</body>'),
    )
  })

  test('drains queued batches after the exact boundary and before the close', async () => {
    const { router, emitScriptBatch, finishSerialization } = makeRouter()
    const upstream = makeManualUpstream()

    const out = transformReadableStreamWithRouter(
      router as any,
      upstream.stream as any,
    )

    upstream.push(`<html><body><div>app</div>${SCRIPT_BARRIER_HTML}`)
    // Router parts must not move ahead of pending application bytes.
    emitScriptBatch(['X'])
    emitScriptBatch(['Y'])

    // The structural close is held until all router scripts finish.
    upstream.push('</body></html>')
    upstream.close()
    finishSerialization()

    const full = await readAll(out as any)

    // Order: app div → scripts → body close.
    expect(full).toContain('<div>app</div>')
    expect(full).toContain(renderScriptBatch(['X']))
    expect(full).toContain(renderScriptBatch(['Y']))
    expect(full.indexOf('<div>app</div>')).toBeLessThan(
      full.indexOf(renderScriptBatch(['X'])),
    )
    expect(full.indexOf(renderScriptBatch(['Y']))).toBeLessThan(
      full.indexOf('</body>'),
    )
  })

  test('onAbort: fires once when downstream cancels (readable wrapper)', async () => {
    const { router, finishSerialization } = makeRouter()
    finishSerialization()

    let produced = 0
    const upstream = new ReadableStream<Uint8Array>({
      pull(controller) {
        produced++
        controller.enqueue(new TextEncoder().encode('<p>x</p>'))
      },
    })

    let aborts = 0
    const out = transformReadableStreamWithRouter(
      router as any,
      upstream as any,
      {
        onAbort: () => aborts++,
      },
    )

    const reader = (out as any).getReader()
    await reader.read()
    await reader.cancel(new Error('client disconnect'))
    // Allow microtasks to flush.
    await Promise.resolve()
    await Promise.resolve()

    expect(aborts).toBe(1)
    expect(produced).toBeGreaterThan(0)
  })

  test('onAbort: NOT called on natural successful completion', async () => {
    const { router, finishSerialization } = makeRouter({
      reserveFastPath: () => true,
    })

    const upstream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('<p>done</p>'))
        controller.close()
      },
    })

    let aborts = 0
    const out = transformReadableStreamWithRouter(
      router as any,
      upstream as any,
      {
        onAbort: () => aborts++,
      },
    )

    finishSerialization()

    // Drain to completion.
    const reader = (out as any).getReader()
    for (;;) {
      const { done } = await reader.read()
      if (done) {
        break
      }
    }

    expect(aborts).toBe(0)
  })

  test('readable wrapper accepts string chunks', async () => {
    const { router } = makeRouter({ reserveFastPath: () => true })
    const source = '<html><body>string record</body></html>'
    const upstream = new ReadableStream<string>({
      start(controller) {
        controller.enqueue(source)
        controller.close()
      },
    })

    const out = transformReadableStreamWithRouter(router as any, upstream)

    await expect(readAll(out)).resolves.toBe(source)
  })

  test('pipeable byte-0 pass-through encodes string records independently', async () => {
    const { router } = makeRouter({
      reserveFastPath: () => true,
    })
    const highSurrogate = String.fromCharCode(0xd83d)
    const lowSurrogate = String.fromCharCode(0xde00)
    const records = [
      '<html><body>',
      highSurrogate,
      lowSurrogate,
      '</body></html>',
    ]
    const upstream = Readable.from(records)
    const out = transformPipeableStreamWithRouter(router as any, upstream)
    const actual = await readAllPipeableBytes(out)
    const expected = Buffer.concat(records.map((record) => Buffer.from(record)))

    expect(actual).toEqual(expected)
    expect(actual.includes(Buffer.from('😀'))).toBe(false)
  })

  test('pipeable byte-0 pass-through bounds one large string record', async () => {
    const { router, cleanupCalls } = makeRouter({
      reserveFastPath: () => true,
    })
    const source = makeLargeStringRecord('<html><body>', '</body></html>')
    const upstream = Readable.from([source])
    const out = transformPipeableStreamWithRouter(router as any, upstream)
    const chunks = await readAllPipeableChunks(out)
    const actual = Buffer.concat(chunks)

    expect(source.indexOf('😀')).toBe(MAX_HYDRATION_OUTPUT_CHUNK_BYTES - 1)
    expect(actual).toEqual(Buffer.from(source))
    expect(
      Math.max(...chunks.map((chunk) => chunk.byteLength)),
    ).toBeLessThanOrEqual(MAX_HYDRATION_OUTPUT_CHUNK_BYTES)
    expect(cleanupCalls.count).toBe(1)
  })

  test('pipeable pass-through handles an encoding set during the first read', async () => {
    const { router } = makeRouter({
      reserveFastPath: () => true,
    })
    const source = '<html><body>français</body></html>'
    const upstream = new Readable({
      read() {
        this.setEncoding('utf8')
        this.push(Buffer.from(source))
        this.push(null)
      },
    })

    const out = transformPipeableStreamWithRouter(router as any, upstream)
    const actual = await readAllPipeableBytes(out)

    expect(actual).toEqual(Buffer.from(source))
  })

  test('pipeable merge path encodes string records independently', async () => {
    const { router, emitScriptBatch, finishSerialization } = makeRouter()
    const highSurrogate = String.fromCharCode(0xd83d)
    const lowSurrogate = String.fromCharCode(0xde00)
    const prefix = `<html><body>${SCRIPT_BARRIER_HTML}`
    const records = [prefix, highSurrogate, lowSurrogate, DOCUMENT_CLOSE]
    const upstream = Readable.from(records)
    const out = transformPipeableStreamWithRouter(router as any, upstream)
    const parts = ['streamed()']

    emitScriptBatch(parts)
    finishSerialization()

    const actual = await readAllPipeableBytes(out)
    const expected = Buffer.concat(
      [
        prefix,
        renderScriptBatch(parts),
        highSurrogate,
        lowSurrogate,
        DOCUMENT_CLOSE,
      ].map((record) => Buffer.from(record)),
    )

    expect(actual).toEqual(expected)
    expect(actual.includes(Buffer.from('😀'))).toBe(false)
  })

  test('pipeable merge path bounds one large string record', async () => {
    const { router, cleanupCalls, emitScriptBatch, finishSerialization } =
      makeRouter()
    const source = makeLargeStringRecord(
      '<html><body><main>',
      `</main>${SCRIPT_BARRIER_HTML}${DOCUMENT_CLOSE}`,
    )
    const parts = ['streamed()']
    const routerScript = renderScriptBatch(parts)
    const expected =
      source.slice(0, -DOCUMENT_CLOSE.length) + routerScript + DOCUMENT_CLOSE
    const upstream = Readable.from([source])
    const out = transformPipeableStreamWithRouter(router as any, upstream)

    emitScriptBatch(parts)
    finishSerialization()

    const chunks = await readAllPipeableChunks(out)
    const actual = Buffer.concat(chunks)

    expect(source.indexOf('😀')).toBe(MAX_HYDRATION_OUTPUT_CHUNK_BYTES - 1)
    expect(actual).toEqual(Buffer.from(expected))
    expect(actual.indexOf(Buffer.from(routerScript))).toBeGreaterThan(
      actual.indexOf(Buffer.from(SCRIPT_BARRIER_HTML)),
    )
    expect(actual.indexOf(Buffer.from(routerScript))).toBeLessThan(
      actual.lastIndexOf(Buffer.from(DOCUMENT_CLOSE)),
    )
    expect(
      Math.max(...chunks.map((chunk) => chunk.byteLength)),
    ).toBeLessThanOrEqual(MAX_HYDRATION_OUTPUT_CHUNK_BYTES)
    expect(cleanupCalls.count).toBe(1)
  })

  test('record-end does not split one large Node string record', async () => {
    const { router, emitScriptBatch, finishSerialization, cleanupCalls } =
      makeRouter()
    const prefix = `<html><body>${SCRIPT_BARRIER_HTML}`
    const largeRecord = 'x'.repeat(MAX_HYDRATION_OUTPUT_CHUNK_BYTES * 2)
    const parts = ['streamed()']
    const routerScript = renderScriptBatch(parts)
    const upstream = Readable.from([prefix, largeRecord, DOCUMENT_CLOSE])
    const out = transformPipeableStreamWithRouter(router as any, upstream, {
      rendererSafePoint: 'record-end',
    })
    const iterator = out[Symbol.asyncIterator]()
    const chunks = [Buffer.from((await iterator.next()).value)]

    chunks.push(Buffer.from((await iterator.next()).value))
    expect(chunks[0]).toEqual(Buffer.from(prefix))
    expect(chunks[1]).toEqual(
      Buffer.alloc(MAX_HYDRATION_OUTPUT_CHUNK_BYTES, 'x'),
    )

    emitScriptBatch(parts)
    finishSerialization()

    for (;;) {
      const { done, value } = await iterator.next()
      if (done) {
        break
      }
      chunks.push(Buffer.from(value))
    }

    const actual = Buffer.concat(chunks)
    const expected = Buffer.from(
      prefix + largeRecord + routerScript + DOCUMENT_CLOSE,
    )

    expect(actual).toEqual(expected)
    expect(actual.indexOf(Buffer.from(routerScript))).toBe(
      Buffer.byteLength(prefix + largeRecord),
    )
    expect(cleanupCalls.count).toBe(1)
  })

  test('cancelling a large Node string drain tears down once', async () => {
    const { router, cleanupCalls } = makeRouter({
      reserveFastPath: () => true,
    })
    const source = makeLargeStringRecord('', '')
    let upstreamCancellations = 0
    let pushed = false
    const upstream = new Readable({
      objectMode: true,
      read() {
        if (!pushed) {
          pushed = true
          this.push(source)
        }
      },
      destroy(_error, callback) {
        upstreamCancellations++
        callback()
      },
    })
    const upstreamClosed = new Promise<void>((resolve) => {
      upstream.once('close', resolve)
    })
    const onAbort = vi.fn()
    const out = transformReadableStreamWithRouter(
      router as any,
      Readable.toWeb(upstream) as any,
      {
        onAbort,
      },
    )
    const reader = out.getReader()
    const first = await reader.read()

    expect(first.value!.byteLength).toBe(MAX_HYDRATION_OUTPUT_CHUNK_BYTES - 1)

    const reason = new Error('consumer stopped')
    await reader.cancel(reason)
    await upstreamClosed
    await flush()

    expect(upstreamCancellations).toBe(1)
    expect(onAbort).toHaveBeenCalledOnce()
    expect(cleanupCalls.count).toBe(1)
  })

  test('onAbort: fires when pipeable wrapper consumer destroys', async () => {
    const { router, finishSerialization } = makeRouter()
    finishSerialization()

    const pass = new PassThrough()
    let aborts = 0
    const out = transformPipeableStreamWithRouter(router as any, pass, {
      onAbort: () => aborts++,
    })
    // Swallow expected error emission from destroy().
    out.on('error', () => {})

    // Push something so the read loop is engaged.
    pass.write('<p>x</p>')
    // Wait a tick to let reader start.
    await new Promise((r) => setImmediate(r))

    // Destroy downstream — simulates Node response being closed by client.
    out.destroy(new Error('client gone'))
    // Allow microtasks + readable webstream cancel propagation.
    await new Promise((r) => setImmediate(r))
    await Promise.resolve()

    expect(aborts).toBe(1)

    // Cleanup: destroy upstream so we don't leak.
    if (!pass.destroyed) {
      pass.destroy()
    }
  })

  test('onAbort: lifetime timeout triggers abort exactly once', async () => {
    vi.useFakeTimers()
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const { router, finishSerialization } = makeRouter()
      finishSerialization()

      // Upstream that never produces or closes.
      const upstream = new ReadableStream<Uint8Array>({
        pull() {
          // never enqueue, never close
        },
      })

      let aborts = 0

      const out = transformReadableStreamWithRouter(
        router as any,
        upstream as any,
        {
          onAbort: () => aborts++,
          lifetimeMs: 1000,
        },
      )

      // Start reading before the lifetime watchdog errors the stream.
      const reader = (out as any).getReader()
      const readP = reader.read()
      const readError = expect(readP).rejects.toThrow(
        'Stream lifetime exceeded',
      )

      await vi.advanceTimersByTimeAsync(1500)
      await readError

      expect(aborts).toBe(1)
    } finally {
      warnSpy.mockRestore()
      vi.useRealTimers()
    }
  })

  test('default lifetime is derived from timeoutMs', async () => {
    vi.useFakeTimers()
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      const { router, finishSerialization } = makeRouter()
      finishSerialization()
      const upstream = new ReadableStream<Uint8Array>({
        pull() {
          // never enqueue, never close
        },
      })

      let aborts = 0
      const out = transformReadableStreamWithRouter(
        router as any,
        upstream as any,
        {
          onAbort: () => aborts++,
          timeoutMs: 10,
        },
      )

      const reader = (out as any).getReader()
      const readP = reader.read()
      const readError = expect(readP).rejects.toThrow(
        'Stream lifetime exceeded',
      )

      await vi.advanceTimersByTimeAsync(15)
      expect(aborts).toBe(0)

      await vi.advanceTimersByTimeAsync(6)
      await readError
      expect(aborts).toBe(1)
    } finally {
      errorSpy.mockRestore()
      warnSpy.mockRestore()
      vi.useRealTimers()
    }
  })

  test('upstream writable abort surfaces; readable does not hang', async () => {
    const { router, finishSerialization } = makeRouter()
    finishSerialization()

    // Simulate a synchronous producer setup failure: a TransformStream is
    // handed to the router transform, and the producer never writes before
    // aborting the writable side. The router transform's readable must resolve
    // (with done or an error) rather than wait for lifetimeMs.
    const ts = new TransformStream()
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      let aborts = 0
      const out = transformReadableStreamWithRouter(
        router as any,
        ts.readable as any,
        {
          onAbort: () => aborts++,
        },
      )

      void ts.writable.abort(new Error('setup-throw')).catch(() => {})

      const reader = (out as any).getReader()
      // Either the read resolves with done, or it rejects with the abort
      // reason. Both prove non-hang behavior; we just require it terminates.
      const terminated = await reader
        .read()
        .then(() => true)
        .catch(() => true)

      expect(terminated).toBe(true)
      expect(aborts).toBe(1)
    } finally {
      errorSpy.mockRestore()
    }
  })
})
