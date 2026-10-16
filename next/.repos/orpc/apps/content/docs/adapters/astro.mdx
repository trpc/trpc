---
title: "Astro Adapter"
description: "Use oRPC inside an Astro project by mounting a handler in an API route."
sidebar:
  label: "Astro"
---

[Astro](https://astro.build/) is a JavaScript web framework optimized for building fast, content-driven websites. Its endpoints follow the [Fetch API](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API), so oRPC integrates through the [Fetch API Adapter](/docs/adapters/fetch-api).

## Basic

```ts title="src/pages/rpc/[...rest].ts"
import type { APIRoute } from 'astro'
import { onError } from '@orpc/server'
import { RPCHandler } from '@orpc/server/fetch'

const handler = new RPCHandler(router, {
  interceptors: [
    onError((error) => {
      console.error(error)
    }),
  ],
})

export const prerender = false

export const ALL: APIRoute = async ({ request }) => {
  const { response } = await handler.handle(request, {
    prefix: '/rpc',
    context: {} // Provide initial context if needed, can be an async function
  })

  return response ?? new Response('Not found', { status: 404 })
}
```

:::info
`prerender = false` makes this an on-demand route, so building your site requires an [adapter](https://docs.astro.build/en/guides/on-demand-rendering/) such as `@astrojs/node`.
:::

:::warning
Astro's [CSRF protection](https://docs.astro.build/en/reference/configuration-reference/#securitycheckorigin) can reject oRPC requests from non-browser or cross-origin clients, such as file uploads, with a `403` response before the route runs.
:::

:::info
The `handler` can be any supported oRPC handler, such as [RPCHandler](/docs/rpc/handler), [OpenAPIHandler](/docs/openapi/handler), or another custom handler.
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

globalThis.$client = createRouterClient(router, {
  context: {} // Provide initial context if needed, can be an async function
})
```

</CodeGroup>
