---
title: "SolidStart Adapter"
description: "Use oRPC inside a SolidStart project by mounting a handler in an API route."
sidebar:
  label: "SolidStart"
---

[SolidStart](https://start.solidjs.com/) is a full stack JavaScript framework for building web applications with SolidJS. Its API routes follow the [Fetch API](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API), so oRPC integrates through the [Fetch API Adapter](/docs/adapters/fetch-api).

## Server

<CodeGroup>

```ts title="src/routes/rpc/[...rest].ts"
import type { APIEvent } from '@solidjs/start/server'
import { onError } from '@orpc/server'
import { RPCHandler } from '@orpc/server/fetch'

const handler = new RPCHandler(router, {
  interceptors: [
    onError((error) => {
      console.error(error)
    }),
  ],
})

async function handle({ request }: APIEvent) {
  const { response } = await handler.handle(request, {
    prefix: '/rpc',
    context: {} // Provide initial context if needed, can be an async function
  })

  return response ?? new Response('Not found', { status: 404 })
}

export const HEAD = handle
export const GET = handle
export const POST = handle
export const PUT = handle
export const PATCH = handle
export const DELETE = handle
```

```ts title="src/routes/rpc/index.ts"
export { DELETE, GET, HEAD, PATCH, POST, PUT } from './[...rest]'
```

</CodeGroup>

:::info
The `handler` can be any supported oRPC handler, such as [RPCHandler](/docs/rpc/handler), [OpenAPIHandler](/docs/openapi/handler), or another custom handler.
:::

## Client

On the client, use `getRequestEvent` to resolve the request origin and forward headers during SSR. This enables usage in both server and browser environments.

```ts
import { RPCLink } from '@orpc/client/fetch'
import { getRequestEvent } from 'solid-js/web'

const link = new RPCLink({
  url: '/rpc',
  // Resolve the origin from the incoming request during SSR; defaults to the current origin in the browser.
  origin: () => {
    const event = getRequestEvent()
    return event ? new URL(event.request.url).origin : undefined
  },
  headers: () => getRequestEvent()?.request.headers ?? {},
})
```

:::info
The examples above only show how to configure the link. For examples of creating a typesafe client, see [RPC Link](/docs/rpc/link#typesafe-clients) and [OpenAPI Link](/docs/openapi/link#typesafe-clients).
:::

## Optimize SSR

To reduce HTTP requests and improve latency during SSR, you can use a [server-side client](/docs/client/server-side) during SSR. Below is a quick setup, see [Optimizing SSR](/docs/recipes/optimizing-ssr) for more details.

<CodeGroup>

```ts title="src/lib/orpc.ts"
import type { RouterClient } from '@orpc/server'
import { createORPCClient } from '@orpc/client'
import { RPCLink } from '@orpc/client/fetch'

if (import.meta.env.SSR) {
  await import('./orpc.server')
}

declare global {
  var $client: RouterClient<typeof router> | undefined
}

const link = new RPCLink({
  url: '/rpc',
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

```ts title="src/lib/orpc.server.ts"
import { createRouterClient } from '@orpc/server'
import { getRequestEvent } from 'solid-js/web'

if (typeof window !== 'undefined') {
  throw new Error('This file should not be imported in the browser')
}

globalThis.$client = createRouterClient(router, {
  /**
   * Provide initial context if needed.
   *
   * Because this client instance is shared across all requests,
   * only include context that's safe to reuse globally.
   * For per-request context, use middleware context or pass a function as the initial context.
   */
  context: async () => {
    const headers = getRequestEvent()?.request.headers

    return {
      headers, // provide headers if initial context required
    }
  },
})
```

</CodeGroup>

:::warning
Guard the import with `import.meta.env.SSR`, which Vite replaces at build time, so the server module is stripped from client bundles. A `typeof window` check is not enough: the bundler would still emit your router as a publicly downloadable client chunk.
:::
