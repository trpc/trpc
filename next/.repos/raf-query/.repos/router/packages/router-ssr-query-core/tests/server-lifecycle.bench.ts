// @vitest-environment node

import { QueryClient } from '@tanstack/query-core'
import { afterAll, bench, describe } from 'vitest'
import { setupCoreRouterSsrQueryIntegration } from '../src'

let benchmarkSink = 0

describe('server request lifecycle', () => {
  bench('create and close a ReadableStream', () => {
    let controller!: ReadableStreamDefaultController<unknown>
    const stream = new ReadableStream({
      start(value) {
        controller = value
      },
    })
    controller.close()
    benchmarkSink += stream.locked ? 1 : 0
  })

  const subscriptionClient = new QueryClient()
  const queryCache = subscriptionClient.getQueryCache()
  const listener = () => {}
  afterAll(() => subscriptionClient.clear())

  bench('subscribe and unsubscribe from QueryCache', () => {
    const unsubscribe = queryCache.subscribe(listener)
    unsubscribe()
  })

  bench('setup and cleanup before dehydrate', () => {
    const queryClient = new QueryClient()
    const fixture = createServerRouter()

    setupCoreRouterSsrQueryIntegration({
      router: fixture.router as any,
      queryClient,
    })
    fixture.attach()
    fixture.cleanup()
    benchmarkSink += fixture.cleanupListenerCount()
  })

  bench('setup and dehydrate an empty request', async () => {
    const queryClient = new QueryClient()
    const fixture = createServerRouter()

    setupCoreRouterSsrQueryIntegration({
      router: fixture.router as any,
      queryClient,
    })
    fixture.attach()
    const dehydrated = await fixture.router.options.dehydrate?.()
    fixture.finishRender()
    fixture.cleanup()
    benchmarkSink += dehydrated?.query.stream.locked ? 1 : 0
  })

  bench('write 100 loader queries without integration', () => {
    const queryClient = new QueryClient()
    populateQueryClient(queryClient, 100)
    benchmarkSink += queryClient.getQueryCache().getAll().length
    queryClient.clear()
  })

  bench('write 100 loader queries before dehydrate', () => {
    const queryClient = new QueryClient()
    const fixture = createServerRouter()

    setupCoreRouterSsrQueryIntegration({
      router: fixture.router as any,
      queryClient,
    })
    fixture.attach()
    populateQueryClient(queryClient, 100)
    benchmarkSink += queryClient.getQueryCache().getAll().length
    fixture.cleanup()
  })
})

function populateQueryClient(queryClient: QueryClient, queryCount: number) {
  for (let index = 0; index < queryCount; index++) {
    queryClient.setQueryData(['query', index], `data-${index}`)
  }
}

function createServerRouter() {
  const renderFinishedListeners = new Array<() => void>()
  const cleanupListeners = new Array<() => void>()
  const serverSsr = {
    onRenderFinished: (listener: () => void) => {
      renderFinishedListeners.push(listener)
    },
    onCleanup: (listener: () => void) => {
      cleanupListeners.push(listener)
    },
  }
  const router = {
    isServer: true,
    options: {} as {
      dehydrate?: () =>
        | {
            query: { stream: ReadableStream<unknown> }
          }
        | Promise<{
            query: { stream: ReadableStream<unknown> }
          }>
    },
    serverSsr: undefined as typeof serverSsr | undefined,
    serverSsrLifecycle: undefined as
      | {
          onServerSsrAttach: Array<(value: typeof serverSsr) => void>
        }
      | undefined,
  }

  return {
    router,
    attach() {
      router.serverSsr = serverSsr
      router.serverSsrLifecycle?.onServerSsrAttach.forEach((listener) => {
        listener(serverSsr)
      })
    },
    finishRender() {
      for (const listener of renderFinishedListeners.splice(0)) {
        listener()
      }
    },
    cleanup() {
      for (const listener of cleanupListeners.splice(0)) {
        listener()
      }
    },
    cleanupListenerCount() {
      return cleanupListeners.length
    },
  }
}

void benchmarkSink
