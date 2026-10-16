---
title: "SvelteKit Adapter"
description: "Use oRPC inside a SvelteKit project by mounting a handler in an endpoint."
sidebar:
  label: "SvelteKit"
---

[SvelteKit](https://svelte.dev/docs/kit/introduction) is a framework for rapidly developing robust, performant web applications using Svelte. Its endpoints follow the [Fetch API](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API), so oRPC integrates through the [Fetch API Adapter](/docs/adapters/fetch-api).

## Server

```ts title="src/routes/rpc/[...rest]/+server.ts"
import type { RequestHandler } from './$types'
import { onError } from '@orpc/server'
import { RPCHandler } from '@orpc/server/fetch'

const handler = new RPCHandler(router, {
  interceptors: [
    onError((error) => {
      console.error(error)
    }),
  ],
})

const handle: RequestHandler = async ({ request }) => {
  const { response } = await handler.handle(request, {
    prefix: '/rpc',
    context: {} // Provide initial context if needed, can be an async function
  })

  return response ?? new Response('Not found', { status: 404 })
}

export const GET = handle
export const POST = handle
export const PUT = handle
export const PATCH = handle
export const DELETE = handle
```

:::info
The `handler` can be any supported oRPC handler, such as [RPCHandler](/docs/rpc/handler), [OpenAPIHandler](/docs/openapi/handler), or another custom handler.
:::

## Client

During SSR, use [SvelteKit's `fetch`](https://svelte.dev/docs/kit/load#Making-fetch-requests), which forwards the `cookie` and `authorization` headers and calls the endpoint directly without an HTTP round trip.

```ts title="src/lib/orpc.ts"
import { RPCLink } from '@orpc/client/fetch'

const link = new RPCLink({
  url: '/rpc',
  fetch: async (url, init) => {
    if (import.meta.env.SSR) {
      const { getRequestEvent } = await import('$app/server')
      return getRequestEvent().fetch(url, init)
    }

    return fetch(url, init)
  },
})
```

:::info
The examples above only show how to configure the link. For examples of creating a typesafe client, see [RPC Link](/docs/rpc/link#typesafe-clients) and [OpenAPI Link](/docs/openapi/link#typesafe-clients).
:::

## Optimize SSR

SvelteKit's `fetch` already skips the HTTP round trip, but requests are still serialized and deserialized. To remove that overhead as well, use a [server-side client](/docs/client/server-side) during SSR as described in [Optimizing SSR](/docs/recipes/optimizing-ssr#using-server-side-client-directly).
