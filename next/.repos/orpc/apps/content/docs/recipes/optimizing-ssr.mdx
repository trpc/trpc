---
title: "Optimizing Server-Side Rendering (SSR) for Fullstack Frameworks"
description: "Optimize server-side rendering with oRPC in Next.js, Nuxt, and SvelteKit by calling API logic directly and avoiding extra HTTP requests."
sidebar:
  label: "Optimizing SSR"
---

## The Problem with Standard SSR Data Fetching

In many fullstack frameworks, SSR still fetches data by making an HTTP request from the server to its own API route.

![Standard SSR: Server calls its own API via HTTP.](/images/standard-ssr-diagram.svg)

This works, but it adds avoidable overhead. The server has to go through the HTTP layer just to reach code that is already running in the same process. That extra hop can increase latency and waste resources.

Ideally, SSR should fetch data by calling the relevant API logic directly in the same process.

![Optimized SSR: Server calls API logic directly.](/images/optimized-ssr-diagram.svg)

With [Fetch API](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API) support, you can easily create an internal link that reaches your API logic without making a real network request. For even lower overhead, you can use the [server-side client](#using-server-side-client-directly) directly.

## Conceptual approach

```ts
// During SSR, use an internal link
const orpc: RouterClient<typeof router> = createORPCClient(internalLink)

// In the browser, use a normal remote link
const orpc: RouterClient<typeof router> = createORPCClient(remoteLink)
```

But how? A naive runtime check with a static import would pull your router into the client bundle. The trick is a conditional import guarded by a flag your bundler resolves at build time, so server-only code never reaches the browser.

## Implementation

We'll use `globalThis` to share an SSR client without bundling server-only code into the browser.

:::info
This setup is not limited to [RPC Link](/docs/rpc/link) or [Next.js](https://nextjs.org/). You can use [OpenAPI Link](/docs/openapi/link) or a custom one, and the same pattern works in SvelteKit, Nuxt, and other fullstack frameworks.
:::

<CodeGroup>

```ts lib/orpc.ts
import type { RouterClient } from '@orpc/server'
import { RPCLink } from '@orpc/client/fetch'
import { createORPCClient } from '@orpc/client'

if (import.meta.env.SSR) {
  await import('./orpc.server')
}

declare global {
  var $client: RouterClient<typeof router> | undefined
}

const link = new RPCLink({
  origin: () => {
    if (typeof window === 'undefined') {
      throw new Error('This link is not allowed on the server side.')
    }

    return window.location.origin
  },
})

/**
 * Fall back to a browser client when no SSR client is registered.
 */
export const client: RouterClient<typeof router> = globalThis.$client ?? createORPCClient(link)
```

```ts lib/orpc.server.ts
import { createORPCClient } from '@orpc/client'
import { RPCLink } from '@orpc/client/fetch'
import type { RouterClient } from '@orpc/server'
import { headers } from 'next/headers'

const internalLink = new RPCLink({
  origin: 'http://localhost',
  fetch: async (url, init) => {
    const request = new Request(url, init)

    // Use a fetch handler here
    const { response } = await handler.handle(request, {
      context: { // provide initial context if needed
        headers: await headers(),
      },
    })

    return response ?? new Response('Not Found', { status: 404 })
  },
})

globalThis.$client = createORPCClient(internalLink)
```

</CodeGroup>

The `import.meta.env.SSR` guard is resolved at build time, so the client bundle never contains `orpc.server.ts`. On webpack builds, guard with `typeof window === 'undefined'` instead, which Next.js also replaces at build time. With this setup, importing `client` from `lib/orpc.ts` uses the internal-link client during SSR and the remote client in the browser.

:::tip
See the [Next.js](/docs/adapters/next#optimize-ssr), [Nuxt](/docs/adapters/nuxt#optimize-ssr), [SolidStart](/docs/adapters/solid-start#optimize-ssr), [SvelteKit](/docs/adapters/svelte-kit#optimize-ssr), and [TanStack Start](/docs/adapters/tanstack-start#optimize-ssr) adapter pages for framework-specific setups.
:::

## Using Server-Side Client Directly

Alternatively, you can use the [server-side client](/docs/client/server-side) directly for SSR. This approach is more efficient and straightforward, as it eliminates serialization and deserialization overhead entirely.

:::info
Both a [fetch-based internal link](#implementation) and the [server-side client](/docs/client/server-side) are valid strategies for optimizing SSR. The fetch-based approach offers greater flexibility and plugin compatibility, while the server-side client is more efficient and easier to set up. Choose whichever best fits your needs.
:::

```ts
import { createRouterClient } from '@orpc/server'
import { headers } from 'next/headers'

globalThis.$client = createRouterClient(router, {
  /**
   * Provide initial context if needed.
   *
   * Because this client instance is shared across all requests,
   * only include context that's safe to reuse globally.
   * For per-request context, use middleware context or pass a function as the initial context.
   */
  context: async () => ({
    headers: await headers(), // provide headers if initial context required
  }),
})
```

## Using the client

The `client` needs no special handling. Use it like any other oRPC client.

```tsx
export default async function PlanetListPage() {
  const planets = await client.planet.list({ limit: 10 })

  return (
    <div>
      {planets.map(planet => (
        <div key={planet.id}>{planet.name}</div>
      ))}
    </div>
  )
}
```

:::info
These examples use Next.js, but the same pattern also works in SvelteKit, Nuxt, and other fullstack frameworks.
:::
