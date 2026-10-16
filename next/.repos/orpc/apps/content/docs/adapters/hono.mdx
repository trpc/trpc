---
title: "Hono Adapter"
description: "Use oRPC inside a Hono project by mounting a handler as a middleware."
sidebar:
  label: "Hono"
---

[Hono](https://hono.dev/) is a high-performance web framework built on top of the [Fetch API](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API), so oRPC integrates through the [Fetch API Adapter](/docs/adapters/fetch-api).

## Basic

```ts
import { onError } from '@orpc/server'
import { RPCHandler } from '@orpc/server/fetch'
import { Hono } from 'hono'

const app = new Hono()

const handler = new RPCHandler(router, {
  interceptors: [
    onError((error) => {
      console.error(error)
    }),
  ],
})

app.use('/rpc/*', async (c, next) => {
  const { matched, response } = await handler.handle(c.req.raw, {
    prefix: '/rpc',
    context: {} // Provide initial context if needed, can be an async function
  })

  if (matched) {
    return c.newResponse(response.body, response)
  }

  await next()
})

export default app
```

<Expandable title="Body Already Used Error?">

If Hono middleware reads the request body before the oRPC handler processes it, an error will occur. You can solve this by using a proxy to intercept the request body parsers with Hono parsers.

```ts
const BODY_PARSER_METHODS = new Set(['arrayBuffer', 'blob', 'formData', 'json', 'text'] as const)

type BodyParserMethod = typeof BODY_PARSER_METHODS extends Set<infer T> ? T : never

app.use('/rpc/*', async (c, next) => {
  const request = new Proxy(c.req.raw, {
    get(target, prop) {
      if (prop === 'bodyUsed') {
        return false // Hono can still provide the body from its parser cache
      }
      if (BODY_PARSER_METHODS.has(prop as BodyParserMethod)) {
        return () => c.req[prop as BodyParserMethod]()
      }
      return Reflect.get(target, prop, target)
    }
  })

  const { matched, response } = await handler.handle(request, {
    prefix: '/rpc',
    context: {} // Provide initial context if needed, can be an async function
  })

  if (matched) {
    return c.newResponse(response.body, response)
  }

  await next()
})
```

</Expandable>

:::info
The `handler` can be any supported oRPC handler, such as [RPCHandler](/docs/rpc/handler), [OpenAPIHandler](/docs/openapi/handler), or another custom handler.
:::
