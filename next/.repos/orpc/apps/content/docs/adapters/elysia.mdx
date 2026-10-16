---
title: "Elysia Adapter"
description: "Use oRPC inside an Elysia project by mounting a handler on a wildcard route."
sidebar:
  label: "Elysia"
---

[Elysia](https://elysiajs.com/) is a high-performance web framework for [Bun](https://bun.com/) that adheres to the [Fetch API](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API), so oRPC integrates through the [Fetch API Adapter](/docs/adapters/fetch-api).

## Basic

```ts
import { onError } from '@orpc/server'
import { RPCHandler } from '@orpc/server/fetch'
import { Elysia } from 'elysia'

const handler = new RPCHandler(router, {
  interceptors: [
    onError((error) => {
      console.error(error)
    }),
  ],
})

const app = new Elysia()
  .all('/rpc*', async ({ request }: { request: Request }) => {
    const { response } = await handler.handle(request, {
      prefix: '/rpc',
      context: {} // Provide initial context if needed, can be an async function
    })

    return response ?? new Response('Not found', { status: 404 })
  }, {
    parse: 'none' // Skip Elysia's body parsing; oRPC reads the raw request itself
  })
  .listen(3000)

console.log('Elysia is running at http://localhost:3000')
```

:::info
The `handler` can be any supported oRPC handler, such as [RPCHandler](/docs/rpc/handler), [OpenAPIHandler](/docs/openapi/handler), or another custom handler.
:::
