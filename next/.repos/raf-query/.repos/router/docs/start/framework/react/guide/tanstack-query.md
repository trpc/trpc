---
id: tanstack-query
title: TanStack Query
description: Use TanStack Query with TanStack Start for request-isolated SSR, hydration, route preloading, streaming, and mutation invalidation.
---

TanStack Start uses Router loaders to coordinate navigation. TanStack Query can own the fetched data, freshness, and mutation state. Use them together when your application needs a query cache across routes, background updates, or mutation-driven invalidation.

The [React Query example](../examples/start-basic-react-query) includes a `/preferences` page that reads and updates a display name stored in a cookie. Its [tests](https://github.com/TanStack/router/blob/main/examples/react/start-basic-react-query/tests/preferences.spec.ts) check server-rendered data, isolation between requests, hydration without a duplicate read, and invalidation after a server function. The preference cookie is not an authentication mechanism.

## Install and create a QueryClient per router

Install `@tanstack/react-query` and `@tanstack/react-router-ssr-query`. The example uses Query 5.102 or newer, including `queryClient.query`. See the [integration reference](/router/latest/docs/integrations/query) for its options.

```tsx title="src/router.tsx"
import { QueryClient } from '@tanstack/react-query'
import { createRouter } from '@tanstack/react-router'
import { setupRouterSsrQueryIntegration } from '@tanstack/react-router-ssr-query'
import { routeTree } from './routeTree.gen'

export function getRouter() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { staleTime: 30_000 } },
  })
  const router = createRouter({
    routeTree,
    context: { queryClient },
    defaultPreload: 'intent',
    defaultPreloadStaleTime: 0,
  })

  setupRouterSsrQueryIntegration({ router, queryClient })
  return router
}
```

Create the client inside `getRouter`, not at module scope. Start creates a router for each SSR request. A process-wide QueryClient could reuse one reader's cached data in another reader's HTML. The browser then keeps the client attached to its router during navigation.

Declare `queryClient: QueryClient` in the root route's `createRootRouteWithContext` type so child loaders can access it. The integration supplies the Query provider and handles SSR dehydration, hydration, and streaming. Do not add a second QueryClient or independently dehydrate the same cache. If you already own the provider wrapper, use the integration's `wrapQueryClient: false` option.

`defaultPreloadStaleTime: 0` lets Query decide whether a preload needs data. The example's 30-second Query `staleTime` prevents an immediate repeat read when the browser receives fresh SSR data. Choose the freshness window for your application, rather than treating 30 seconds as a universal setting.

## Share query options between the loader and component

Keep a query's key and function together. Privileged reads belong in a server function, because a normal route loader can also run in the browser during navigation.

```tsx title="src/utils/preferences.ts"
import { queryOptions } from '@tanstack/react-query'
import { createServerFn } from '@tanstack/react-start'
import { getCookie, setResponseHeader } from '@tanstack/react-start/server'

export const getReaderName = createServerFn({ method: 'GET' }).handler(() => {
  setResponseHeader('Cache-Control', 'private, no-store')
  return getCookie('reader-name') || 'Guest'
})

export const readerNameOptions = queryOptions({
  queryKey: ['reader-name'],
  queryFn: () => getReaderName(),
})
```

The route awaits the query for content that must appear in the initial HTML:

```tsx title="src/routes/preferences.tsx"
import { useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { readerNameOptions } from '../utils/preferences'

export const Route = createFileRoute('/preferences')({
  loader: async ({ context }) => {
    await context.queryClient.query(readerNameOptions)
  },
  headers: () => ({ 'Cache-Control': 'private, no-store' }),
  component: Preferences,
})

function Preferences() {
  const { data: name } = useSuspenseQuery(readerNameOptions)
  return <p>Hello, {name}</p>
}
```

Both calls use the same query key and options. The loader populates the request's cache; the component reads it; the integration transfers it to the browser. The component does not need to call the server function again in an effect.

For a parameterized resource, include its identity in the key, such as `['post', postId]`. If search values affect the result, validate them and include them in both `loaderDeps` and the query key. Keep secrets out of keys and serialized query data.

## Await critical data and stream secondary data

Await queries that determine the page's main content, title, authorization, redirects, or whether it exists. Return title and description data from the loader when a route's `head` needs them, as the example's post route does.

Secondary content can begin loading without blocking the loader, then render inside a Suspense boundary. Keep that query under the SSR integration so its result can stream to the browser. Handle the imperative query promise's rejection as well as the component's error boundary; a fire-and-forget promise should not become an unhandled server rejection.

The example's existing `/deferred` route shows a separate Suspense boundary. See [streaming and prefetching](/router/latest/docs/integrations/query#prefetching-and-streaming) for the integration's behavior. A plain `useQuery` that has no loader prefetch is not a guarantee that its data will be in the server-rendered HTML.

## Invalidate Query after a server mutation

The preference example validates the display name and writes its cookie inside a POST server function. Its `src/start.ts` enables Start's CSRF middleware for server-function requests. The component calls that function through `useServerFn`, then invalidates the query that reads the cookie:

```tsx
const queryClient = useQueryClient()
const save = useServerFn(saveReaderName)
const mutation = useMutation({
  mutationFn: (name: string) => save({ data: name }),
  onSuccess: () =>
    queryClient.invalidateQueries({ queryKey: readerNameOptions.queryKey }),
})
```

Returning the invalidation promise keeps the mutation pending until its active query's refetch finishes. The form can use `mutation.isPending` and `mutation.isError` for feedback. The example also disables its JavaScript-dependent form until hydration and uses a POST method so a native submission cannot put form values in the URL.

Invalidate the data's actual owner. `queryClient.invalidateQueries` refreshes Query data; `router.invalidate()` reloads Router-owned loader data and route context. Use both only when the mutation changes both, such as a login that changes root authentication context and private queries. Neither call purges your CDN or invalidates a database cache.

If a mutation returns the complete updated resource, `setQueryData` can update that cache entry directly instead. Optimistic updates need cancellation, rollback on failure, and reconciliation with the server result. This example uses a confirmed write followed by invalidation, not an optimistic update.

## Keep account data isolated beyond SSR

Request-scoped QueryClients prevent cross-request cache sharing on the server. They do not authorize reads or automatically clear a browser cache when its account changes.

For authenticated applications, authorize every private read and mutation on the server, including resource-level permissions. On sign-out or account switching, cancel and remove the previous account's private queries, then reload the relevant route context. Include account or tenant identity in keys when that is part of the resource's identity, but do not treat a key as an access-control check.

The `/preferences` route and its server functions return `Cache-Control: private, no-store` because their output varies by cookie. Verify the final response through your hosting provider and CDN. Do not publicly cache personalized HTML merely because the QueryClient itself is isolated.

## Diagnose extra requests

Check when and where each request occurs. A background refresh after the freshness window, a reconnect, or a deliberate invalidation can be expected.

| Symptom                                             | Check                                                                                         |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| A read repeats immediately after hydration          | Query `staleTime`, hydration configuration, matching keys, and accidental extra QueryClients  |
| Navigation loads different data than a direct visit | Search validation, `loaderDeps`, query keys, and server-only boundaries                       |
| A mutation succeeds but old data stays visible      | Which cache owns the displayed value and which keys were invalidated                          |
| A second account sees the first account's data      | Module-scoped server clients, browser cache cleanup, account keys, and shared HTTP caches     |
| SSR contains only a loading state                   | Whether the loader awaited critical data and whether the component reads the prefetched query |

Start with the same options object in the loader and component. Avoid adding manual hydration code or disabling all refetching to hide a duplicate request.

## Run the example's checks

From the repository root, install dependencies and build the framework packages as described in [Contributing](https://github.com/TanStack/router/blob/main/CONTRIBUTING.md). Then:

```sh
cd examples/react/start-basic-react-query
pnpm exec playwright install chromium
pnpm test:e2e
pnpm build
QUERY_EXAMPLE_PRODUCTION=1 pnpm test:e2e
```

The tests send concurrent SSR requests with different preference cookies while using the same query key. Each HTML response must contain only its own reader's value. The browser test then requires zero additional reads during hydration, exactly one read after mutation invalidation, and no extra read after a reload hydrates fresh data.

The post and user demos use JSONPlaceholder. The preference tests run without that external API.
