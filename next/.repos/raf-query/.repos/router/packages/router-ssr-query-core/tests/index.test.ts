import { QueryClient } from '@tanstack/query-core'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { setupCoreRouterSsrQueryIntegration } from '../src'

type TestRouter = {
  isServer: boolean
  options: {
    dehydrate?: () => unknown | Promise<unknown>
    hydrate?: (dehydrated: any) => unknown | Promise<unknown>
  }
  serverSsr?: {
    onRenderFinished: (listener: () => void) => void
    onCleanup: (listener: () => void) => void
  }
  serverSsrLifecycle?: {
    onServerSsrAttach: Array<
      (serverSsr: NonNullable<TestRouter['serverSsr']>) => void
    >
  }
}

function createServerRouter() {
  const renderFinishedListeners = new Array<() => void>()
  const cleanupListeners = new Array<() => void>()
  let cleanedUp = false
  const serverSsr = {
    onRenderFinished: (listener: () => void) => {
      if (!cleanedUp) {
        renderFinishedListeners.push(listener)
      }
    },
    onCleanup: (listener: () => void) => {
      if (!cleanedUp) {
        cleanupListeners.push(listener)
      }
    },
  }
  const router: TestRouter = {
    isServer: true,
    options: {},
  }

  return {
    router,
    attachServerSsr() {
      router.serverSsr = serverSsr
      router.serverSsrLifecycle?.onServerSsrAttach.forEach((listener) => {
        listener(serverSsr)
      })
    },
    finishRender() {
      if (!cleanedUp) {
        renderFinishedListeners.splice(0).forEach((listener) => listener())
      }
    },
    triggerCleanup() {
      if (cleanedUp) {
        return
      }
      cleanedUp = true
      cleanupListeners.splice(0).forEach((listener) => listener())
      renderFinishedListeners.length = 0
      router.serverSsr = undefined
    },
  }
}

async function readStream<T>(stream: ReadableStream<T>): Promise<Array<T>> {
  const reader = stream.getReader()
  const chunks = new Array<T>()

  while (true) {
    const result = await reader.read()
    if (result.done) {
      return chunks
    }
    chunks.push(result.value)
  }
}

function createDeferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((res) => {
    resolve = res
  })
  return { promise, resolve }
}

function createDehydratedQueryState(data: string) {
  return {
    data,
    dataUpdateCount: 1,
    dataUpdatedAt: 1,
    error: null,
    errorUpdateCount: 0,
    errorUpdatedAt: 0,
    fetchFailureCount: 0,
    fetchFailureReason: null,
    fetchMeta: null,
    fetchStatus: 'idle' as const,
    isInvalidated: false,
    status: 'success' as const,
  }
}

const trackedQueryClients = new Set<QueryClient>()
function track<T extends QueryClient>(client: T): T {
  trackedQueryClients.add(client)
  return client
}

afterEach(() => {
  vi.restoreAllMocks()
  for (const client of trackedQueryClients) {
    client.clear()
  }
  trackedQueryClients.clear()
})

describe('setupCoreRouterSsrQueryIntegration', () => {
  it('uses custom dehydration options for initial and streamed queries', async () => {
    const queryClient = track(
      new QueryClient({
        defaultOptions: {
          dehydrate: { shouldDehydrateQuery: () => false },
        },
      }),
    )
    const { router, attachServerSsr, finishRender, triggerCleanup } =
      createServerRouter()

    setupCoreRouterSsrQueryIntegration({
      router: router as any,
      queryClient,
      dehydrateOptions: {
        serializeData: (data) => `${data}-serialized`,
        shouldDehydrateQuery: (query) =>
          !String(query.queryKey[0]).startsWith('skip'),
      },
    })
    attachServerSsr()
    queryClient.setQueryData(['include'], 'initial')
    queryClient.setQueryData(['skip'], 'ignored')

    const dehydrated = (await router.options.dehydrate?.()) as {
      query: {
        initial?: Array<{
          queryKey: Array<unknown>
          state: { data: unknown }
        }>
        stream: ReadableStream<
          Array<{ queryKey: Array<unknown>; state: { data: unknown } }>
        >
      }
    }

    expect(dehydrated.query.initial).toMatchObject([
      { queryKey: ['include'], state: { data: 'initial-serialized' } },
    ])

    const streamedQueriesPromise = readStream(dehydrated.query.stream)
    const includedDeferred = createDeferred<string>()
    const skippedDeferred = createDeferred<string>()
    const included = queryClient.fetchQuery({
      queryKey: ['streamed'],
      queryFn: () => includedDeferred.promise,
    })
    const skipped = queryClient.fetchQuery({
      queryKey: ['skip-streamed'],
      queryFn: () => skippedDeferred.promise,
    })

    includedDeferred.resolve('next')
    skippedDeferred.resolve('ignored')
    await Promise.all([included, skipped])
    finishRender()

    expect(await streamedQueriesPromise).toMatchObject([
      [{ queryKey: ['streamed'], state: { data: 'next-serialized' } }],
    ])
    triggerCleanup()
  })

  it('dehydrates pending queries by default', async () => {
    const queryClient = track(new QueryClient())
    const { router, attachServerSsr, finishRender, triggerCleanup } =
      createServerRouter()
    const queryStarted = createDeferred<void>()
    const queryData = createDeferred<string>()

    setupCoreRouterSsrQueryIntegration({
      router: router as any,
      queryClient,
    })
    attachServerSsr()
    const pendingQuery = queryClient.fetchQuery({
      queryKey: ['pending'],
      queryFn: () => {
        queryStarted.resolve()
        return queryData.promise
      },
    })
    await queryStarted.promise

    const dehydrated = (await router.options.dehydrate?.()) as {
      query: {
        initial: Array<{
          promise?: Promise<unknown>
          queryKey: Array<unknown>
          state: { status: string }
        }>
        stream: ReadableStream<Array<unknown>>
      }
    }

    expect(dehydrated.query.initial).toMatchObject([
      { queryKey: ['pending'], state: { status: 'pending' } },
    ])
    expect(dehydrated.query.initial[0]?.promise).toBeInstanceOf(Promise)

    const streamedQueriesPromise = readStream(dehydrated.query.stream)
    queryData.resolve('data')
    await pendingQuery
    finishRender()

    expect(await streamedQueriesPromise).toEqual([])
    triggerCleanup()
  })

  it('uses custom hydration options for initial and streamed queries', async () => {
    const queryClient = track(new QueryClient())
    const router: TestRouter = { isServer: false, options: {} }
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue([
          {
            queryHash: '["streamed"]',
            queryKey: ['streamed'],
            state: createDehydratedQueryState('stream'),
          },
          {
            queryHash: '["streamed-batch"]',
            queryKey: ['streamed-batch'],
            state: createDehydratedQueryState('batch'),
          },
        ])
        controller.close()
      },
    })

    setupCoreRouterSsrQueryIntegration({
      router: router as any,
      queryClient,
      hydrateOptions: {
        defaultOptions: {
          deserializeData: (data) => `${String(data)}-hydrated`,
        },
      },
    })
    await router.options.hydrate?.({
      query: {
        initial: [
          {
            queryHash: '["initial"]',
            queryKey: ['initial'],
            state: createDehydratedQueryState('initial'),
          },
        ],
        stream,
      },
    })
    await Promise.resolve()
    await Promise.resolve()

    expect(queryClient.getQueryData(['initial'])).toBe('initial-hydrated')
    expect(queryClient.getQueryData(['streamed'])).toBe('stream-hydrated')
    expect(queryClient.getQueryData(['streamed-batch'])).toBe('batch-hydrated')
    expect(stream.locked).toBe(false)
  })

  it('releases a failed query stream reader', async () => {
    const queryClient = track(new QueryClient())
    const router: TestRouter = { isServer: false, options: {} }
    const error = new Error('stream failed')
    const stream = new ReadableStream<Array<never>>({
      start(controller) {
        controller.error(error)
      },
    })
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined)

    setupCoreRouterSsrQueryIntegration({
      router: router as any,
      queryClient,
    })
    await router.options.hydrate?.({ query: { stream } })
    await vi.waitFor(() => {
      expect(stream.locked).toBe(false)
    })

    expect(consoleError).toHaveBeenCalledWith(
      'Error reading query stream:',
      error,
    )
  })

  it('cancels the query stream when hydration fails', async () => {
    const queryClient = track(new QueryClient())
    const router: TestRouter = { isServer: false, options: {} }
    const error = new Error('hydration failed')
    const cancel = vi.fn(() => new Promise<void>(() => {}))
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue([
          {
            queryHash: '["streamed"]',
            queryKey: ['streamed'],
            state: createDehydratedQueryState('stream'),
          },
        ])
      },
      cancel,
    })
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined)

    setupCoreRouterSsrQueryIntegration({
      router: router as any,
      queryClient,
      hydrateOptions: {
        defaultOptions: {
          deserializeData: () => {
            throw error
          },
        },
      },
    })
    await router.options.hydrate?.({ query: { stream } })
    await vi.waitFor(() => {
      expect(cancel).toHaveBeenCalledWith(error)
      expect(stream.locked).toBe(false)
    })

    expect(consoleError).toHaveBeenCalledWith(
      'Error reading query stream:',
      error,
    )
  })

  it('cancels the query stream when initial hydration fails', async () => {
    const queryClient = track(new QueryClient())
    const router: TestRouter = { isServer: false, options: {} }
    const error = new Error('initial hydration failed')
    const cancel = vi.fn(() => new Promise<void>(() => {}))
    const stream = new ReadableStream({ cancel })

    setupCoreRouterSsrQueryIntegration({
      router: router as any,
      queryClient,
      hydrateOptions: {
        defaultOptions: {
          deserializeData: () => {
            throw error
          },
        },
      },
    })
    await expect(
      router.options.hydrate?.({
        query: {
          initial: [
            {
              queryHash: '["initial"]',
              queryKey: ['initial'],
              state: createDehydratedQueryState('initial'),
            },
          ],
          stream,
        },
      }),
    ).rejects.toBe(error)

    expect(cancel).toHaveBeenCalledWith(error)
    expect(stream.locked).toBe(false)
  })

  it('subscribes after initial dehydration and releases after rendering', async () => {
    const queryClient = track(new QueryClient())
    const { router, attachServerSsr, finishRender, triggerCleanup } =
      createServerRouter()

    setupCoreRouterSsrQueryIntegration({
      router: router as any,
      queryClient,
    })
    expect(queryClient.getQueryCache().hasListeners()).toBe(false)

    attachServerSsr()
    const dehydrated = (await router.options.dehydrate?.()) as {
      query: { stream: ReadableStream<Array<unknown>> }
    }
    expect(queryClient.getQueryCache().hasListeners()).toBe(true)

    const streamedQueriesPromise = readStream(dehydrated.query.stream)
    finishRender()
    expect(await streamedQueriesPromise).toEqual([])
    expect(queryClient.getQueryCache().hasListeners()).toBe(false)
    triggerCleanup()
  })

  it('does not read or dehydrate mutations during initial dehydration', async () => {
    const shouldDehydrateMutation = vi.fn(() => true)
    const queryClient = track(
      new QueryClient({
        defaultOptions: {
          dehydrate: { shouldDehydrateMutation },
        },
      }),
    )
    const { router, attachServerSsr, finishRender, triggerCleanup } =
      createServerRouter()
    const getAllMutations = vi.spyOn(queryClient.getMutationCache(), 'getAll')

    queryClient.getMutationCache().build(
      queryClient,
      { mutationKey: ['paused'] },
      {
        context: undefined,
        data: undefined,
        error: null,
        failureCount: 0,
        failureReason: null,
        isPaused: true,
        status: 'pending',
        variables: undefined,
        submittedAt: 1,
      },
    )
    queryClient.setQueryData(['query'], 'data')
    setupCoreRouterSsrQueryIntegration({
      router: router as any,
      queryClient,
    })
    attachServerSsr()

    const dehydrated = (await router.options.dehydrate?.()) as {
      query: {
        initial: Array<{ queryKey: Array<unknown> }>
        stream: ReadableStream<Array<unknown>>
      }
    }
    const streamedQueriesPromise = readStream(dehydrated.query.stream)
    finishRender()

    expect(dehydrated.query.initial).toMatchObject([{ queryKey: ['query'] }])
    expect(getAllMutations).not.toHaveBeenCalled()
    expect(shouldDehydrateMutation).not.toHaveBeenCalled()
    expect(await streamedQueriesPromise).toEqual([])
    triggerCleanup()
  })

  it('returns no query data when cleanup occurs during dehydration', async () => {
    const queryClient = track(new QueryClient())
    const { router, attachServerSsr, triggerCleanup } = createServerRouter()
    const deferred = createDeferred<void>()

    router.options.dehydrate = async () => {
      await deferred.promise
      queryClient.setQueryData(['late'], 'data')
      return { original: true }
    }
    setupCoreRouterSsrQueryIntegration({
      router: router as any,
      queryClient,
    })
    attachServerSsr()

    const dehydrating = router.options.dehydrate?.()
    triggerCleanup()
    deferred.resolve()

    await expect(dehydrating).resolves.toBeUndefined()
    expect(queryClient.getQueryCache().getAll()).toEqual([])
    expect(queryClient.getQueryCache().hasListeners()).toBe(false)
  })

  it('batches same-turn query settlements without scanning the cache', async () => {
    const queryClient = track(new QueryClient())
    const { router, attachServerSsr, finishRender, triggerCleanup } =
      createServerRouter()

    setupCoreRouterSsrQueryIntegration({
      router: router as any,
      queryClient,
    })
    attachServerSsr()
    const dehydrated = (await router.options.dehydrate?.()) as {
      query: {
        stream: ReadableStream<
          Array<{ queryHash: string; queryKey: Array<unknown> }>
        >
      }
    }
    const getAll = vi.spyOn(queryClient.getQueryCache(), 'getAll')
    const streamedQueriesPromise = readStream(dehydrated.query.stream)
    const firstDeferred = createDeferred<string>()
    const secondDeferred = createDeferred<string>()
    const laterDeferred = createDeferred<string>()

    const first = queryClient.fetchQuery({
      queryKey: ['first'],
      queryFn: () => firstDeferred.promise,
    })
    const second = queryClient.fetchQuery({
      queryKey: ['second'],
      queryFn: () => secondDeferred.promise,
    })
    firstDeferred.resolve('first-data')
    secondDeferred.resolve('second-data')
    await Promise.all([first, second])
    await new Promise((resolve) => setTimeout(resolve, 0))

    const later = queryClient.fetchQuery({
      queryKey: ['later'],
      queryFn: () => laterDeferred.promise,
    })
    laterDeferred.resolve('later-data')
    await later
    finishRender()

    expect(getAll).not.toHaveBeenCalled()
    expect(await streamedQueriesPromise).toMatchObject([
      [{ queryKey: ['first'] }, { queryKey: ['second'] }],
      [{ queryKey: ['later'] }],
    ])
    triggerCleanup()
  })

  it('snapshots QueryClient dehydration defaults after Router dehydration', async () => {
    const queryClient = track(new QueryClient())
    const { router, attachServerSsr, finishRender, triggerCleanup } =
      createServerRouter()

    setupCoreRouterSsrQueryIntegration({
      router: router as any,
      queryClient,
    })
    attachServerSsr()
    queryClient.setDefaultOptions({
      ...queryClient.getDefaultOptions(),
      dehydrate: {
        ...queryClient.getDefaultOptions().dehydrate,
        serializeData: (data) => `${data}-current`,
      },
    })
    queryClient.setQueryData(['initial'], 'initial')

    const dehydrated = (await router.options.dehydrate?.()) as {
      query: {
        initial: Array<{ state: { data: unknown } }>
        stream: ReadableStream<Array<{ state: { data: unknown } }>>
      }
    }
    const streamedQueriesPromise = readStream(dehydrated.query.stream)
    queryClient.setDefaultOptions({
      ...queryClient.getDefaultOptions(),
      dehydrate: {
        ...queryClient.getDefaultOptions().dehydrate,
        serializeData: (data) => `${data}-later`,
      },
    })
    await queryClient.fetchQuery({
      queryKey: ['streamed'],
      queryFn: () => 'streamed',
    })
    finishRender()

    expect(dehydrated.query.initial[0]?.state.data).toBe('initial-current')
    expect((await streamedQueriesPromise)[0]?.[0]?.state.data).toBe(
      'streamed-current',
    )
    triggerCleanup()
  })

  it('errors and unsubscribes when streamed serialization throws', async () => {
    const queryClient = track(new QueryClient())
    const { router, attachServerSsr, finishRender, triggerCleanup } =
      createServerRouter()
    const error = new Error('serialize failed')

    setupCoreRouterSsrQueryIntegration({
      router: router as any,
      queryClient,
      dehydrateOptions: {
        serializeData: () => {
          throw error
        },
      },
    })
    attachServerSsr()
    const dehydrated = (await router.options.dehydrate?.()) as {
      query: { stream: ReadableStream<Array<unknown>> }
    }
    const streamedQueriesPromise = readStream(dehydrated.query.stream)
    await queryClient.fetchQuery({
      queryKey: ['throws'],
      queryFn: () => 'data',
    })
    finishRender()

    await expect(streamedQueriesPromise).rejects.toBe(error)
    expect(queryClient.getQueryCache().hasListeners()).toBe(false)
    triggerCleanup()
  })

  it('closes the stream and aborts an in-flight render query on cleanup', async () => {
    const queryClient = track(new QueryClient())
    const { router, attachServerSsr, triggerCleanup } = createServerRouter()
    const queryStarted = createDeferred<void>()
    let aborted = false

    setupCoreRouterSsrQueryIntegration({
      router: router as any,
      queryClient,
    })
    attachServerSsr()
    const dehydrated = (await router.options.dehydrate?.()) as {
      query: { stream: ReadableStream<Array<unknown>> }
    }
    const streamedQueriesPromise = readStream(dehydrated.query.stream)
    const query = queryClient.fetchQuery({
      queryKey: ['in-flight'],
      queryFn: ({ signal }) =>
        new Promise<string>((_resolve, reject) => {
          signal.addEventListener('abort', () => {
            aborted = true
            reject(new Error('aborted'))
          })
          queryStarted.resolve()
        }),
    })
    query.catch(() => {})
    await queryStarted.promise
    triggerCleanup()

    expect(await streamedQueriesPromise).toEqual([])
    expect(queryClient.getQueryCache().getAll()).toEqual([])
    expect(queryClient.getQueryCache().hasListeners()).toBe(false)
    expect(aborted).toBe(true)
  })

  it('clears the QueryClient when the stream is already cancelled', async () => {
    const queryClient = track(new QueryClient())
    const { router, attachServerSsr, triggerCleanup } = createServerRouter()

    setupCoreRouterSsrQueryIntegration({
      router: router as any,
      queryClient,
    })
    attachServerSsr()
    queryClient.setQueryData(['cancelled-stream'], 'data')
    const dehydrated = (await router.options.dehydrate?.()) as {
      query: { stream: ReadableStream<Array<unknown>> }
    }
    await dehydrated.query.stream.cancel()

    expect(() => triggerCleanup()).not.toThrow()
    expect(queryClient.getQueryCache().getAll()).toEqual([])
    expect(queryClient.getQueryCache().hasListeners()).toBe(false)
  })
})

describe('SSR cleanup', () => {
  it('clears queries when a request ends before dehydration', () => {
    const queryClient = track(new QueryClient())
    const { router, attachServerSsr, triggerCleanup } = createServerRouter()

    setupCoreRouterSsrQueryIntegration({
      router: router as any,
      queryClient,
    })
    attachServerSsr()
    queryClient.setQueryData(['loader'], 'data')
    triggerCleanup()

    expect(queryClient.getQueryCache().getAll()).toEqual([])
  })

  it('aborts in-flight queries', async () => {
    const queryClient = track(new QueryClient())
    const { router, attachServerSsr, triggerCleanup } = createServerRouter()
    const queryStarted = createDeferred<void>()
    let aborted = false

    setupCoreRouterSsrQueryIntegration({
      router: router as any,
      queryClient,
    })
    attachServerSsr()
    const query = queryClient.fetchQuery({
      queryKey: ['slow'],
      queryFn: ({ signal }) =>
        new Promise<string>((_resolve, reject) => {
          signal.addEventListener('abort', () => {
            aborted = true
            reject(new Error('aborted'))
          })
          queryStarted.resolve()
        }),
    })
    query.catch(() => {})
    await queryStarted.promise

    triggerCleanup()
    await Promise.resolve()

    expect(aborted).toBe(true)
  })

  it('registers cleanup when Router attaches server SSR', () => {
    const queryClient = track(new QueryClient())
    const { router, attachServerSsr, triggerCleanup } = createServerRouter()

    setupCoreRouterSsrQueryIntegration({
      router: router as any,
      queryClient,
    })
    queryClient.setQueryData(['before-attach'], 'data')
    attachServerSsr()
    triggerCleanup()

    expect(queryClient.getQueryCache().getAll()).toEqual([])
  })
})

const gcAvailable = typeof (globalThis as any).gc === 'function'
const gcTestsEnabled = process.env.RUN_SSR_GC_TESTS === '1' && gcAvailable

async function forceGc() {
  for (let index = 0; index < 6; index++) {
    ;(globalThis as any).gc()
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
}

describe.runIf(gcTestsEnabled)('SSR memory', () => {
  it('releases the request QueryClient and Router after cleanup', async () => {
    let queryClient: QueryClient | null = new QueryClient({
      defaultOptions: { queries: { gcTime: 5 * 60 * 1000 } },
    })
    let fixture: ReturnType<typeof createServerRouter> | null =
      createServerRouter()

    setupCoreRouterSsrQueryIntegration({
      router: fixture.router as any,
      queryClient,
    })
    fixture.attachServerSsr()
    queryClient.setQueryData(['data'], 'value')
    const dehydrated = (await fixture.router.options.dehydrate?.()) as {
      query: { stream: ReadableStream<Array<unknown>> }
    }
    const streamedQueriesPromise = readStream(dehydrated.query.stream)
    fixture.finishRender()
    await streamedQueriesPromise

    const queryClientRef = new WeakRef(queryClient)
    const routerRef = new WeakRef(fixture.router)
    fixture.triggerCleanup()
    queryClient = null
    fixture = null

    await forceGc()

    expect(queryClientRef.deref()).toBeUndefined()
    expect(routerRef.deref()).toBeUndefined()
  })
})
