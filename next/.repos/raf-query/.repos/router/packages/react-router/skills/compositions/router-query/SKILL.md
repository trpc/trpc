---
name: router-query
description: >-
  Integrating TanStack Router with TanStack Query: queryClient
  in router context, static queries and fire-and-forget queries in loaders,
  useSuspenseQuery in components, defaultPreloadStaleTime: 0,
  setupRouterSsrQueryIntegration for SSR dehydration/hydration
  and streaming, per-request QueryClient isolation.
metadata:
  type: composition
  library: tanstack-router
  library_version: '1.166.2'
requires:
  - router-core
  - router-core/data-loading
  - react-router
sources:
  - TanStack/router:docs/router/guide/external-data-loading.md
  - TanStack/router:docs/router/integrations/query.md
---

# TanStack Router + TanStack Query Integration

This skill requires familiarity with both TanStack Router and TanStack Query. Read [router-core](../../../../router-core/skills/router-core/SKILL.md) and [react-router](../../react-router/SKILL.md) first.

This skill covers coordinating TanStack Query as an external data cache with TanStack Router's loader system. The router acts as a **coordinator** — it triggers data fetching during navigation, while Query manages caching, background refetching, and data lifecycle.

> **CRITICAL**: Set `defaultPreloadStaleTime: 0` when using TanStack Query. Without this, Router's built-in preload cache (30s default) prevents Query from controlling data freshness.

> **CRITICAL**: For SSR, create `QueryClient` inside the `createRouter` factory function. A module-level singleton leaks data between server requests.

## Setup: QueryClient in Router Context

### Basic (Client-Only)

```tsx
// src/main.tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  RouterProvider,
  createRouter,
  createRootRouteWithContext,
} from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'

// Root route declares that router context includes queryClient
// (root route file creates it with createRootRouteWithContext — see below)

const queryClient = new QueryClient()

const router = createRouter({
  routeTree,
  defaultPreloadStaleTime: 0, // Let Query manage caching
  context: { queryClient },
  Wrap: ({ children }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  ),
})

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

function App() {
  return <RouterProvider router={router} />
}
```

### Root Route with Context

```tsx
// src/routes/__root.tsx
import { createRootRouteWithContext, Outlet } from '@tanstack/react-router'
import type { QueryClient } from '@tanstack/react-query'

// Double parentheses: factory pattern
export const Route = createRootRouteWithContext<{
  queryClient: QueryClient
}>()({
  component: () => <Outlet />,
})
```

### SSR-Safe Setup

```tsx
// src/router.tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'

export function createAppRouter() {
  // Fresh QueryClient per request — prevents data leaking between SSR requests
  const queryClient = new QueryClient()

  return createRouter({
    routeTree,
    defaultPreloadStaleTime: 0,
    context: { queryClient },
    Wrap: ({ children }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ),
  })
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof createAppRouter>
  }
}
```

### SSR with `setupRouterSsrQueryIntegration`

For automatic SSR dehydration/hydration and streaming:

```bash
npm install @tanstack/react-router-ssr-query
```

```tsx
// src/router.tsx
import { QueryClient } from '@tanstack/react-query'
import { createRouter } from '@tanstack/react-router'
import { setupRouterSsrQueryIntegration } from '@tanstack/react-router-ssr-query'
import { routeTree } from './routeTree.gen'

export function createAppRouter() {
  const queryClient = new QueryClient()

  const router = createRouter({
    routeTree,
    defaultPreloadStaleTime: 0,
    context: { queryClient },
  })

  setupRouterSsrQueryIntegration({
    router,
    queryClient,
    // wrapQueryClient: true (default — wraps with QueryClientProvider)
    // handleRedirects: true (default — handles redirect() from queries)
  })

  return router
}
```

The integration:

- Dehydrates query state on the server and hydrates on the client automatically
- Streams queries that resolve during server render to the client
- Handles `redirect()` thrown from queries/mutations

### Manual SSR Dehydration/Hydration (Without SSR Query Package)

```tsx
// src/router.tsx
import { QueryClient, dehydrate, hydrate } from '@tanstack/react-query'
import { QueryClientProvider } from '@tanstack/react-query'
import { createRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'

export function createAppRouter() {
  const queryClient = new QueryClient()

  return createRouter({
    routeTree,
    defaultPreloadStaleTime: 0,
    context: { queryClient },
    dehydrate: () => ({
      queryClientState: dehydrate(queryClient),
    }),
    hydrate: (dehydrated) => {
      hydrate(queryClient, dehydrated.queryClientState)
    },
    Wrap: ({ children }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ),
  })
}
```

## Core Pattern: Static `query` in Loader + `useSuspenseQuery` in Component

This is the recommended pattern. The loader queries data before render (no loading flash), using `staleTime: 'static'` to reuse cached data without a stale refetch. The component subscribes to the cache for updates.

```tsx
// src/routes/posts.tsx
import { queryOptions, useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'

interface Post {
  id: string
  title: string
}

const postsQueryOptions = queryOptions({
  queryKey: ['posts'],
  queryFn: (): Promise<Array<Post>> =>
    fetch('/api/posts').then((r) => r.json()),
})

export const Route = createFileRoute('/posts')({
  loader: ({ context }) => {
    // query returns cached data when available and fetches when it is missing
    // Keep this query static so a stale refetch does not block navigation
    return context.queryClient.query({
      ...postsQueryOptions,
      staleTime: 'static',
    })
  },
  component: PostsPage,
})

function PostsPage() {
  // useSuspenseQuery subscribes to cache — gets background updates
  const { data: posts } = useSuspenseQuery(postsQueryOptions)

  return (
    <ul>
      {posts.map((post) => (
        <li key={post.id}>{post.title}</li>
      ))}
    </ul>
  )
}
```

### With Dynamic Params

```tsx
// src/routes/posts/$postId.tsx
import { queryOptions, useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'

interface Post {
  id: string
  title: string
  content: string
}

const postQueryOptions = (postId: string) =>
  queryOptions({
    queryKey: ['posts', postId],
    queryFn: () => fetch(`/api/posts/${postId}`).then((r) => r.json()),
  })

export const Route = createFileRoute('/posts/$postId')({
  loader: ({ context, params }) => {
    return context.queryClient.query({
      ...postQueryOptions(params.postId),
      staleTime: 'static',
    })
  },
  component: PostPage,
})

function PostPage() {
  const { postId } = Route.useParams()
  const { data: post } = useSuspenseQuery(postQueryOptions(postId))

  return <article>{post.title}</article>
}
```

## Streaming Pattern: Fire-and-Forget `query` (Not Awaited)

For non-critical data, start a query without blocking navigation. Handle its rejection with `noop` so a background failure does not become an unhandled rejection:

```tsx
import { noop, useQuery, useSuspenseQuery } from '@tanstack/react-query'

export const Route = createFileRoute('/dashboard')({
  loader: ({ context }) => {
    // Await critical data
    const user = context.queryClient.query({
      ...userQueryOptions,
      staleTime: 'static',
    })

    // Start non-critical query without awaiting — streams during SSR
    void context.queryClient.query({ ...analyticsQueryOptions }).catch(noop)

    return user
  },
  component: Dashboard,
})

function Dashboard() {
  // Critical: suspense (data ready immediately)
  const { data: user } = useSuspenseQuery(userQueryOptions)

  // Non-critical: regular query (shows loading state)
  const { data: analytics, isLoading } = useQuery(analyticsQueryOptions)

  return (
    <div>
      <h1>Welcome {user.name}</h1>
      {isLoading ? <Skeleton /> : <AnalyticsChart data={analytics} />}
    </div>
  )
}
```

## Error Handling with `useQueryErrorResetBoundary`

```tsx
import { useEffect } from 'react'
import { useQueryErrorResetBoundary } from '@tanstack/react-query'
import { useRouter } from '@tanstack/react-router'

export const Route = createFileRoute('/posts')({
  loader: ({ context }) =>
    context.queryClient.query({
      ...postsQueryOptions,
      staleTime: 'static',
    }),
  errorComponent: PostsErrorComponent,
  component: PostsPage,
})

function PostsErrorComponent({
  error,
  reset,
}: {
  error: unknown
  reset: () => void
}) {
  const router = useRouter()
  const queryErrorResetBoundary = useQueryErrorResetBoundary()

  useEffect(() => {
    queryErrorResetBoundary.reset()
  }, [queryErrorResetBoundary])

  return (
    <div>
      <p>{error instanceof Error ? error.message : String(error)}</p>
      <button onClick={() => router.invalidate()}>Retry</button>
    </div>
  )
}
```

## Common Mistakes

### 1. HIGH: Not setting `defaultPreloadStaleTime` to 0

Router has a built-in preload cache (default `staleTime` for preloads is 30s). This prevents Query from controlling data freshness during preloading.

```tsx
// WRONG — Router's preload cache serves stale data, Query never refetches
const router = createRouter({ routeTree })

// CORRECT — disable Router's preload cache, let Query manage freshness
const router = createRouter({
  routeTree,
  defaultPreloadStaleTime: 0,
})
```

### 2. HIGH: Creating QueryClient outside `createRouter` for SSR

A module-level singleton `QueryClient` is shared across all server requests, leaking user data between requests.

```tsx
// WRONG — shared across SSR requests
const queryClient = new QueryClient()
export function createAppRouter() {
  return createRouter({
    routeTree,
    context: { queryClient },
  })
}

// CORRECT — new QueryClient per createAppRouter call
export function createAppRouter() {
  const queryClient = new QueryClient()
  return createRouter({
    routeTree,
    context: { queryClient },
  })
}
```

### 3. MEDIUM: Awaiting a fire-and-forget query in a loader blocks rendering

A query used for streaming should start in the background and handle errors with `catch(noop)`. Awaiting it blocks the navigation transition until the data resolves, defeating the purpose of streaming.

```tsx
import { noop } from '@tanstack/react-query'

// WRONG — blocks navigation, no streaming benefit
loader: async ({ context }) => {
  await context.queryClient.query({ ...analyticsQueryOptions }).catch(noop)
}

// CORRECT — fire and forget for streaming, with handled rejection
loader: ({ context }) => {
  void context.queryClient.query({ ...analyticsQueryOptions }).catch(noop)
}

// If you need to block (critical data), use a static query instead:
loader: ({ context }) => {
  return context.queryClient.query({
    ...criticalQueryOptions,
    staleTime: 'static',
  })
}
```

### 4. HIGH: Missing double parentheses on `createRootRouteWithContext`

`createRootRouteWithContext<Type>()` is a factory — it returns a function. The second call passes route options.

```tsx
// WRONG — passing options to the factory, not the returned function
const rootRoute = createRootRouteWithContext<{ queryClient: QueryClient }>({
  component: RootComponent,
})

// CORRECT — double call: factory()({options})
const rootRoute = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  component: RootComponent,
})
```

## Tension: Built-In SWR Cache vs External Cache

TanStack Router has its own SWR cache (`staleTime`, `gcTime`, `defaultPreloadStaleTime`). When using Query as an external cache:

- Set `defaultPreloadStaleTime: 0` to prevent Router's cache from short-circuiting Query's freshness logic
- Router's `staleTime`/`gcTime` still apply to the loader return value. For pure Query patterns, return nothing from the loader (just a static `query` for the side effect) and read data exclusively from `useSuspenseQuery`
- `router.invalidate()` re-runs loaders (which call `query` with `staleTime: 'static'`), so the cached Query data remains the freshness authority

## Cross-References

- [router-core/data-loading](../../../../router-core/skills/router-core/data-loading/SKILL.md) — built-in loader caching fundamentals
- [router-core/ssr](../../../../router-core/skills/router-core/ssr/SKILL.md) — SSR setup for dehydration/hydration
