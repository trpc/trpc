---
title: "Response Headers Plugin"
description: "Use ResponseHeadersHandlerPlugin to set response headers and cookies via context.resHeaders and merge them into the final response."
sidebar:
  label: "Response Headers"
---

## Context Access

```ts twoslash
import { os } from '@orpc/server'
import { setCookie } from '@orpc/server/helpers'
// ---cut---
import type { ResponseHeadersHandlerPluginContext } from '@orpc/server/plugins'

interface ServerContext extends ResponseHeadersHandlerPluginContext {}

const base = os.$context<ServerContext>()

const procedure = base
  .use(({ context, next }) => {
    context.resHeaders?.set('x-request-id', 'req_123')
    return next()
  })
  .handler(({ context }) => {
    setCookie(context.resHeaders, 'session_id', 'abc123', {
      secure: true,
      maxAge: 3600
    })
  })
```

:::info[Why can `resHeaders` be undefined?]
This allows procedures to run safely even without `ResponseHeadersHandlerPlugin`, such as in direct calls.
:::

:::tip
Combine with [Cookie Helpers](/docs/helpers/cookie) for streamlined cookie management.
:::

## Handler Setup

```ts
import { ResponseHeadersHandlerPlugin } from '@orpc/server/plugins'

const handler = new RPCHandler(router, {
  plugins: [
    new ResponseHeadersHandlerPlugin(),
  ],
})
```

:::info
The `handler` can be any supported oRPC handler, such as [RPCHandler](/docs/rpc/handler), [OpenAPIHandler](/docs/openapi/handler), or a custom one.
:::

## Learn More

For implementation details, see the [source code](https://github.com/middleapi/orpc/blob/main/packages/server/src/plugins/response-headers.ts).
