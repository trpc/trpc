import {
  dehydrateQuery,
  hydrate as hydrateQueryClient,
} from '@tanstack/query-core'
import { isRedirect } from '@tanstack/router-core'
import { isServer } from '@tanstack/router-core/isServer'
import type { AnyRouter } from '@tanstack/router-core'
import type {
  DehydrateOptions,
  HydrateOptions,
  Query,
  QueryClient,
} from '@tanstack/query-core'

type DehydratedQuery = ReturnType<typeof dehydrateQuery>

const shouldDehydrateAllQueries = () => true

type QueryStreamState = {
  controller: ReadableStreamDefaultController<Array<DehydratedQuery>>
  sentQueries: Set<string>
  unsubscribe: () => void
  pendingQueries?: Map<string, Query>
}

export type RouterSsrQueryOptions<TRouter extends AnyRouter> = {
  router: TRouter
  queryClient: QueryClient
  dehydrateOptions?: DehydrateOptions
  hydrateOptions?: HydrateOptions

  /**
   * If `true`, the QueryClient will handle errors thrown by `redirect()` inside of mutations and queries.
   *
   * @default true
   * @link [Guide](https://tanstack.com/router/latest/docs/framework/react/api/router/redirectFunction)
   */
  handleRedirects?: boolean
}

type DehydratedRouterQueryState = {
  query: {
    initial?: Array<DehydratedQuery>
    stream: ReadableStream<Array<DehydratedQuery>>
  }
}

export function setupCoreRouterSsrQueryIntegration<TRouter extends AnyRouter>({
  router,
  queryClient,
  dehydrateOptions,
  hydrateOptions,
  handleRedirects = true,
}: RouterSsrQueryOptions<TRouter>) {
  if (isServer ?? router.isServer) {
    const originalDehydrate = router.options.dehydrate
    let streamState: QueryStreamState | undefined
    let cleanedUp = false

    const finalizeQueryStream = (failure?: { error: unknown }) => {
      const state = streamState
      streamState = undefined
      if (!state) {
        return
      }

      state.unsubscribe()

      try {
        if (failure) {
          state.controller.error(failure.error)
        } else {
          state.controller.close()
        }
      } catch {
        // The stream consumer can already have cancelled the stream.
      }
    }

    const teardown = () => {
      cleanedUp = true
      finalizeQueryStream()
      // Clearing destroys queries, aborts in-flight work, and cancels gcTime
      // handles that would otherwise retain request state for up to 5 minutes.
      queryClient.clear()
    }

    // Register teardown as soon as SSR attaches. attachRouterServerSsrUtils()
    // runs before router.load(), so this covers redirects/errors thrown before
    // router.options.dehydrate() can run.
    router.serverSsrLifecycle = {
      ...router.serverSsrLifecycle,
      onServerSsrAttach: [
        ...(router.serverSsrLifecycle?.onServerSsrAttach ?? []),
        (serverSsr) => serverSsr.onCleanup(teardown),
      ],
    }

    router.options.dehydrate = async (): Promise<
      DehydratedRouterQueryState | undefined
    > => {
      let originalDehydrated: Awaited<
        ReturnType<NonNullable<typeof originalDehydrate>>
      >
      try {
        originalDehydrated = await originalDehydrate?.()
      } finally {
        if (cleanedUp) {
          queryClient.clear()
        }
      }

      if (cleanedUp) {
        return
      }

      const currentDehydrateOptions = queryClient.getDefaultOptions().dehydrate
      const shouldDehydrateQuery =
        dehydrateOptions?.shouldDehydrateQuery ??
        currentDehydrateOptions?.shouldDehydrateQuery ??
        shouldDehydrateAllQueries
      const serializeData =
        dehydrateOptions?.serializeData ??
        currentDehydrateOptions?.serializeData
      const shouldRedactErrors =
        dehydrateOptions?.shouldRedactErrors ??
        currentDehydrateOptions?.shouldRedactErrors
      const initialQueries = new Array<DehydratedQuery>()
      const sentQueries = new Set<string>()

      for (const query of queryClient.getQueryCache().getAll()) {
        if (shouldDehydrateQuery(query)) {
          initialQueries.push(
            dehydrateQuery(query, serializeData, shouldRedactErrors),
          )
          sentQueries.add(query.queryHash)
        }
      }

      let controller!: ReadableStreamDefaultController<Array<DehydratedQuery>>
      const stream = new ReadableStream<Array<DehydratedQuery>>({
        start(value) {
          controller = value
        },
      })
      const flushPendingQueries = () => {
        const state = streamState
        const queries = state?.pendingQueries
        if (!state || !queries) {
          return
        }
        state.pendingQueries = undefined

        const dehydratedQueries = new Array<DehydratedQuery>()

        for (const query of queries.values()) {
          if (
            state.sentQueries.has(query.queryHash) ||
            !shouldDehydrateQuery(query)
          ) {
            continue
          }

          dehydratedQueries.push(
            dehydrateQuery(query, serializeData, shouldRedactErrors),
          )
          state.sentQueries.add(query.queryHash)
        }

        if (dehydratedQueries.length > 0) {
          state.controller.enqueue(dehydratedQueries)
        }
      }
      const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
        const state = streamState
        if (!state) {
          return
        }
        if (
          state.sentQueries.has(event.query.queryHash) ||
          // The promise is not set yet for the first query-cache event.
          !event.query.promise
        ) {
          return
        }

        if (!state.pendingQueries) {
          state.pendingQueries = new Map()
          // Flush before React resumes resolved Suspense boundaries while
          // still batching queries that settle in the same turn.
          queueMicrotask(() => {
            try {
              flushPendingQueries()
            } catch (error) {
              finalizeQueryStream({ error })
            }
          })
        }
        state.pendingQueries.set(event.query.queryHash, event.query)
      })
      streamState = { controller, sentQueries, unsubscribe }

      const finishRendering = () => {
        try {
          flushPendingQueries()
        } catch (error) {
          finalizeQueryStream({ error })
          return
        }
        finalizeQueryStream()
      }

      router.serverSsr!.onRenderFinished(finishRendering)
      return {
        ...originalDehydrated,
        query: {
          ...(initialQueries.length > 0 && {
            initial: initialQueries,
          }),
          stream,
        },
      }
    }
    return
  }
  const originalHydrate = router.options.hydrate
  router.options.hydrate = async (dehydrated: DehydratedRouterQueryState) => {
    const query = dehydrated.query
    try {
      await originalHydrate?.(dehydrated)

      if (query.initial) {
        hydrateQueryClient(
          queryClient,
          { queries: query.initial },
          hydrateOptions,
        )
      }
    } catch (error) {
      void query.stream.cancel(error).catch(() => {})
      throw error
    }

    const reader = query.stream.getReader()
    void (async () => {
      try {
        for (;;) {
          const { done, value } = await reader.read()
          if (done) {
            return
          }
          hydrateQueryClient(queryClient, { queries: value }, hydrateOptions)
        }
      } catch (error) {
        console.error('Error reading query stream:', error)
        void reader.cancel(error).catch(() => {})
      } finally {
        reader.releaseLock()
      }
    })()
  }
  if (handleRedirects) {
    const originalMutationCacheConfig = queryClient.getMutationCache().config
    queryClient.getMutationCache().config = {
      ...originalMutationCacheConfig,
      onError: (error, ...rest) => {
        if (isRedirect(error)) {
          error.options._fromLocation = router.stores.location.get()
          return router.navigate(router.resolveRedirect(error).options)
        }

        return originalMutationCacheConfig.onError?.(error, ...rest)
      },
    }

    const originalQueryCacheConfig = queryClient.getQueryCache().config
    queryClient.getQueryCache().config = {
      ...originalQueryCacheConfig,
      onError: (error, ...rest) => {
        if (isRedirect(error)) {
          error.options._fromLocation = router.stores.location.get()
          return router.navigate(router.resolveRedirect(error).options)
        }

        return originalQueryCacheConfig.onError?.(error, ...rest)
      },
    }
  }
}
