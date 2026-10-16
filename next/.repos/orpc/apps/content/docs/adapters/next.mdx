---
title: "Next.js Adapter"
description: "Use oRPC inside a Next.js project by mounting a handler in a route handler."
sidebar:
  label: "Next.js"
---

[Next.js](https://nextjs.org/) is a leading React framework for server-rendered apps. oRPC works with both the [App Router](https://nextjs.org/docs/app/getting-started/installation) and [Pages Router](https://nextjs.org/docs/pages/getting-started/installation) through the [Fetch API Adapter](/docs/adapters/fetch-api) and [Node HTTP Adapter](/docs/adapters/node-http) respectively.

:::info
oRPC also supports [Next.js server functions](/docs/integrations/next) through the dedicated `@orpc/next` integration.
:::

## Server

You set up an oRPC server inside Next.js using its [Route Handlers](https://nextjs.org/docs/app/building-your-application/routing/route-handlers).

```ts title="app/rpc/[[...rest]]/route.ts"
import { onError } from '@orpc/server'
import { RPCHandler } from '@orpc/server/fetch'

const handler = new RPCHandler(router, {
  interceptors: [
    onError((error) => {
      console.error(error)
    }),
  ],
})

async function handleRequest(request: Request) {
  const { response } = await handler.handle(request, {
    prefix: '/rpc',
    context: {} // Provide initial context if needed, can be an async function
  })

  return response ?? new Response('Not found', { status: 404 })
}

export const HEAD = handleRequest
export const GET = handleRequest
export const POST = handleRequest
export const PUT = handleRequest
export const PATCH = handleRequest
export const DELETE = handleRequest
```

:::info
The `handler` can be any supported oRPC handler, such as [RPCHandler](/docs/rpc/handler), [OpenAPIHandler](/docs/openapi/handler), or another custom handler.
:::

<Expandable title="Pages Router Support?">

```ts title="pages/api/rpc/[[...rest]].ts"
import type { NextApiRequest, NextApiResponse } from 'next'
import { onError } from '@orpc/server'
import { RPCHandler } from '@orpc/server/node'

const handler = new RPCHandler(router, {
  interceptors: [
    onError((error) => {
      console.error(error)
    }),
  ],
})

export const config = {
  api: {
    bodyParser: false,
  },
}

export default async (req: NextApiRequest, res: NextApiResponse) => {
  const { matched } = await handler.handle(req, res, {
    prefix: '/api/rpc',
    context: {} // Provide initial context if needed, can be an async function
  })

  if (matched) {
    return
  }

  res.statusCode = 404
  res.end('Not found')
}
```

:::warning
Next.js [body parser](https://nextjs.org/docs/pages/building-your-application/routing/api-routes#custom-config) may handle common request body types, and oRPC will use the parsed body if available. However, it doesn't support features like [Bracket Notation](/docs/openapi/bracket-notation), and in case you upload a file with `application/json`, it may be parsed as plain JSON instead of a `File`. To avoid these issues, disable the body parser with `config.api.bodyParser = false` as shown above.
:::

</Expandable>

## Client

By leveraging `headers` from `next/headers`, you can configure the link to work seamlessly in both browser and server environments:

```ts title="lib/orpc.ts"
import { RPCLink } from '@orpc/client/fetch'

const link = new RPCLink({
  url: '/rpc',
  origin: typeof window === 'undefined' ? 'http://localhost:3000' : undefined, // defaults to the current origin in the browser
  headers: async () => {
    if (typeof window !== 'undefined') {
      return {}
    }

    const { headers } = await import('next/headers')
    return await headers()
  },
})
```

:::info
The examples above only show how to configure the link. For examples of creating a typesafe client, see [RPC Link](/docs/rpc/link#typesafe-clients) and [OpenAPI Link](/docs/openapi/link#typesafe-clients).
:::

## Optimize SSR

To reduce HTTP requests and improve latency during SSR, you can use a [server-side client](/docs/client/server-side) during SSR. Below is a quick setup, see [Optimizing SSR](/docs/recipes/optimizing-ssr) for more details.

<CodeGroup>

```ts title="lib/orpc.ts"
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

```ts title="lib/orpc.server.ts"
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

</CodeGroup>

:::warning
`import.meta.env.SSR` requires [Turbopack](https://nextjs.org/docs/app/api-reference/turbopack), the default bundler since Next.js 16. On webpack builds, guard with `typeof window === 'undefined'` instead, which Next.js also replaces at build time. Either way, do not add `import 'server-only'` to `orpc.server.ts`: it would fail the build.
:::
