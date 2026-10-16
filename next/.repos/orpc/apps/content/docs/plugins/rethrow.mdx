---
title: "Rethrow Handler Plugin"
description: "Bypass oRPC's built-in error handling and rethrow matching errors to your framework, such as NestJS filters or Express error middleware."
sidebar:
  label: "Rethrow"
---

## Usage

```ts
import { RethrowHandlerPlugin } from '@orpc/server/plugins'

const handler = new RPCHandler(router, {
  plugins: [
    new RethrowHandlerPlugin({
      filter: (error, options) => {
        // Example: Rethrow all non-ORPCError errors
        return !(error instanceof ORPCError)
      },
    }),
  ],
})

try {
  await handler.handle(request)
}
catch (error) {
  // If the filter returns true, the error can be caught here
}
```

:::info
The `handler` can be any supported oRPC handler, such as [RPCHandler](/docs/rpc/handler), [OpenAPIHandler](/docs/openapi/handler), or a custom one.
:::
