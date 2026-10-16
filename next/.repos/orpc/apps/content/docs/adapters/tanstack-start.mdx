---
title: "TanStack Start Adapter"
description: "Use oRPC inside a TanStack Start project by mounting a handler in a server route."
sidebar:
  label: "TanStack Start"
---

[TanStack Start](https://tanstack.com/start) is a full-stack React framework built on [Vite](https://vite.dev/) and the [Fetch API](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API), so oRPC integrates through the [Fetch API Adapter](/docs/adapters/fetch-api).

## Server

You set up an oRPC server inside TanStack Start using its [Server Routes](https://tanstack.com/start/latest/docs/framework/react/guide/server-routes).

```ts title="src/routes/api/rpc.$.ts"
import { onError } from '@orpc/server'
import { RPCHandler } from '@orpc/server/fetch'
import { createFileRoute } from '@tanstack/react-router'

const handler = new RPCHandler(router, {
  interceptors: [
    onError((error) => {
      console.error(error)
    }),
  ],
})

export const Route = createFileRoute('/api/rpc/$')({
  server: {
    handlers: {
      ANY: async ({ request }) => {
        const { response } = await handler.handle(request, {
          prefix: '/api/rpc',
          context: {} // Provide initial context if needed, can be an async function
        })

        return response ?? new Response('Not found', { status: 404 })
      },
    },
  },
})
```

:::info
The `handler` can be any supported oRPC handler, such as [RPCHandler](/docs/rpc/handler), [OpenAPIHandler](/docs/openapi/handler), or another custom handler.
:::

## Client

Use `createIsomorphicFn` to configure the link with environment-specific settings for both browser and SSR environments:

```ts
import { RPCLink } from '@orpc/client/fetch'
import { createIsomorphicFn } from '@tanstack/react-start'
import { getRequest, getRequestHeaders } from '@tanstack/react-start/server'

const getClientLink = createIsomorphicFn()
  .client(() => new RPCLink({
    url: '/api/rpc',
  }))
  .server(() => new RPCLink({
    url: '/api/rpc',
    origin: () => new URL(getRequest().url).origin, // resolve from the incoming request
    headers: () => getRequestHeaders(),
  }))
```

:::info
The examples above only show how to configure the link. For examples of creating a typesafe client, see [RPC Link](/docs/rpc/link#typesafe-clients) and [OpenAPI Link](/docs/openapi/link#typesafe-clients).
:::

## Optimize SSR

To reduce HTTP requests and improve latency during SSR, you can use a [server-side client](/docs/client/server-side) during SSR. Below is a quick setup, see [Optimizing SSR](/docs/recipes/optimizing-ssr) for more details.

```ts title="src/lib/orpc.ts"
import type { RouterClient } from '@orpc/server'
import { createORPCClient } from '@orpc/client'
import { RPCLink } from '@orpc/client/fetch'
import { createRouterClient } from '@orpc/server'
import { createIsomorphicFn } from '@tanstack/react-start'
import { getRequestHeaders } from '@tanstack/react-start/server'

const getORPCClient = createIsomorphicFn()
  .server(() => createRouterClient(router, {
    /**
     * Provide initial context if needed.
     *
     * Because this client instance is shared across all requests,
     * only include context that's safe to reuse globally.
     * For per-request context, use middleware context or pass a function as the initial context.
     */
    context: async () => ({
      headers: getRequestHeaders(), // provide headers if initial context required
    }),
  }))
  .client((): RouterClient<typeof router> => {
    const link = new RPCLink({
      url: '/api/rpc',
    })

    return createORPCClient(link)
  })

export const client: RouterClient<typeof router> = getORPCClient()
```
