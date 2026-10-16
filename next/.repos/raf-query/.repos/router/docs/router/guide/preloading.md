---
title: Preloading
---

Preloading in TanStack Router is a way to load a route before the user actually navigates to it. This is useful for routes that are likely to be visited by the user next. For example, if you have a list of posts and the user is likely to click on one of them, you can preload the post route so that it's ready to go when the user clicks on it.

## Supported Preloading Strategies

- Intent
  - Preloading by **"intent"** works by using hover and touch start events on `<Link>` components to preload the dependencies for the destination route.
  - This strategy is useful for preloading routes that the user is likely to visit next.
- Viewport Visibility
  - Preloading by **"viewport**" works by using the Intersection Observer API to preload the dependencies for the destination route when the `<Link>` component is in the viewport.
  - This strategy is useful for preloading routes that are below the fold or off-screen.
- Render
  - Preloading by **"render"** works by preloading the dependencies for the destination route as soon as the `<Link>` component is rendered in the DOM.
  - This strategy is useful for preloading routes that are always needed.

## How long does preloaded data stay in memory?

Successful preloaded loader results can enter the router's in-memory cache with
two independent policies:

- **Freshness defaults to 30 seconds.** Configure it with
  `defaultPreloadStaleTime` or a route's `preloadStaleTime`.
- **The unused retention window defaults to 5 minutes.** Configure it with
  `defaultPreloadGcTime` or a route's `preloadGcTime`. Older unused entries
  are eligible for pruning during a later cache reconciliation.
- **The speculative lane is never promoted into router state.** Navigation
  creates its own presentation and runs its own `beforeLoad` chain. It can reuse
  cached loader data or join a loader that is still in flight.

If you need more control over preloading, caching and/or garbage collection of preloaded data, you should use an external caching library like [TanStack Query](https://tanstack.com/query).

The simplest way to preload routes for your application is to set the `defaultPreload` option to `intent` for your entire router:

<!-- ::start:framework -->

# React

```tsx
import { createRouter } from '@tanstack/react-router'

const router = createRouter({
  // ...
  defaultPreload: 'intent',
})
```

# Solid

```tsx
import { createRouter } from '@tanstack/solid-router'

const router = createRouter({
  // ...
  defaultPreload: 'intent',
})
```

<!-- ::end:framework -->

This will turn on `intent` preloading by default for all `<Link>` components in your application. You can also set the `preload` prop on individual `<Link>` components to override the default behavior.

## Preload Delay

By default, intent focus/hover and viewport preloading start after **50ms**. Pending preloads are cancelled if focus or hover ends, or the link leaves the viewport. Touch intent preloads immediately. You can change this delay by setting the `defaultPreloadDelay` option on your router:

<!-- ::start:framework -->

# React

```tsx
import { createRouter } from '@tanstack/react-router'

const router = createRouter({
  // ...
  defaultPreloadDelay: 100,
})
```

# Solid

```tsx
import { createRouter } from '@tanstack/solid-router'

const router = createRouter({
  // ...
  defaultPreloadDelay: 100,
})
```

<!-- ::end:framework -->

You can also set the `preloadDelay` prop on individual `<Link>` components to override the default behavior on a per-link basis.

## Built-in Preloading, Freshness, and Retention

If you're using the built-in loaders, you can control how long preloaded data is considered fresh by setting either `routerOptions.defaultPreloadStaleTime` or `routeOptions.preloadStaleTime` to a number of milliseconds. **By default, preloaded data is considered fresh for 30 seconds.**

Freshness and retention are separate. `preloadStaleTime` controls whether the
retained loader result can be reused without another loader call.
`preloadGcTime` (or `defaultPreloadGcTime`) controls when an unused preload
result becomes eligible for pruning during a later cache reconciliation; it
does not schedule a timer to evict the result at that exact moment. Both preload
GC options default to 5 minutes.

To change this, you can set the `defaultPreloadStaleTime` option on your router:

<!-- ::start:framework -->

# React

```tsx
import { createRouter } from '@tanstack/react-router'

const router = createRouter({
  // ...
  defaultPreloadStaleTime: 10_000,
})
```

# Solid

```tsx
import { createRouter } from '@tanstack/solid-router'

const router = createRouter({
  // ...
  defaultPreloadStaleTime: 10_000,
})
```

<!-- ::end:framework -->

Or, you can use the `routeOptions.preloadStaleTime` option on individual routes:

```tsx
// src/routes/posts.$postId.tsx
export const Route = createFileRoute('/posts/$postId')({
  loader: async ({ params }) => fetchPost(params.postId),
  // Reload preloaded data when it is more than 10 seconds old
  preloadStaleTime: 10_000,
})
```

Client-side preloading runs each route's `beforeLoad` with `preload: true`.
Every later preload or navigation runs its own `beforeLoad` chain, so a
navigation observes `preload: false` even when an identical preload is still
active. A later lane can reuse successful settled loader data or join loader
work that is still in flight, but it never reuses `beforeLoad` context or an
already-settled redirect, error, or not-found result. If joined loader work
later produces a terminal outcome, all current consumers of that flight observe
it. The `shouldReload` option remains loader-only.

If a route has `preload: false`, its speculative lane still runs `beforeLoad`,
but skips that route's loader. Navigation runs `beforeLoad` again and performs
the skipped loader work.

## Preloading with External Libraries

When integrating external caching libraries like React Query, which have their own mechanisms for determining stale data, you may want to override the default preloading and stale-while-revalidate logic of TanStack Router. These libraries often use options like staleTime to control the freshness of data.

To let an external cache make the freshness decision, set
`routerOptions.defaultPreloadStaleTime` or `routeOptions.preloadStaleTime` to
`0`. Settled preload data then becomes immediately stale in the Router, while
retention still follows `preloadGcTime`. Overlapping preload or navigation
consumers can still share in-flight loader work, and `shouldReload` can still
suppress a loader call.

For example:

<!-- ::start:framework -->

# React

```tsx
import { createRouter } from '@tanstack/react-router'

const router = createRouter({
  // ...
  defaultPreloadStaleTime: 0,
})
```

# Solid

```tsx
import { createRouter } from '@tanstack/solid-router'

const router = createRouter({
  // ...
  defaultPreloadStaleTime: 0,
})
```

<!-- ::end:framework -->

This would then allow you, for instance, to use an option like React Query's `staleTime` to control the freshness of your preloads.

## Preloading Manually

If you need to manually preload a route, use the router's `preloadRoute` method.
It accepts a standard TanStack `NavigateOptions` object and returns the
speculative match lane. An ordinary error or not-found thrown while loading is
represented in that returned lane; cancellation or control flow that produces
no reusable lane can return `undefined`.

<!-- ::start:framework -->

# React

```tsx
import { isNotFound } from '@tanstack/react-router'

function Component() {
  const router = useRouter()

  useEffect(() => {
    async function preload() {
      const matches = await router.preloadRoute({
        to: postRoute,
        params: { id: 1 },
      })

      const routeFailure = matches?.find(
        (match) =>
          match.status === 'error' ||
          match.status === 'notFound' ||
          isNotFound(match.error),
      )

      if (routeFailure) {
        // Inspect routeFailure.error
      }
    }

    preload()
  }, [router])

  return <div />
}
```

# Solid

```tsx
import { isNotFound } from '@tanstack/solid-router'

function Component() {
  const router = useRouter()

  createEffect(() => {
    async function preload() {
      const matches = await router.preloadRoute({
        to: postRoute,
        params: { id: 1 },
      })

      const routeFailure = matches?.find(
        (match) =>
          match.status === 'error' ||
          match.status === 'notFound' ||
          isNotFound(match.error),
      )

      if (routeFailure) {
        // Inspect routeFailure.error
      }
    }

    preload()
  })

  return <div />
}
```

<!-- ::end:framework -->

If you need to preload only the JS chunk of a route, you can use the router's `loadRouteChunk` method. It accepts a route object and returns a promise that resolves when the route chunk is loaded.

<!-- ::start:framework -->

# React

```tsx
function Component() {
  const router = useRouter()

  useEffect(() => {
    async function preloadRouteChunks() {
      try {
        const postsRoute = router.routesByPath['/posts']
        await Promise.all([
          router.loadRouteChunk(router.routesByPath['/']),
          router.loadRouteChunk(postsRoute),
          router.loadRouteChunk(postsRoute.parentRoute),
        ])
      } catch (err) {
        // Failed to preload route chunk
      }
    }

    preloadRouteChunks()
  }, [router])

  return <div />
}
```

# Solid

```tsx
function Component() {
  const router = useRouter()

  createEffect(() => {
    async function preloadRouteChunks() {
      try {
        const postsRoute = router.routesByPath['/posts']
        await Promise.all([
          router.loadRouteChunk(router.routesByPath['/']),
          router.loadRouteChunk(postsRoute),
          router.loadRouteChunk(postsRoute.parentRoute),
        ])
      } catch (err) {
        // Failed to preload route chunk
      }
    }

    preloadRouteChunks()
  })

  return <div />
}
```

<!-- ::end:framework -->
