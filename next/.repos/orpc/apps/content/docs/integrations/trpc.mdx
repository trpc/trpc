---
title: "tRPC Integration"
description: "Learn how to integrate tRPC with oRPC by converting tRPC routers into oRPC routers and bridging metadata between the two."
sidebar:
  label: "tRPC"
---

## Installation

```package-install
npm install @orpc/trpc@beta
```

## Router Conversion

`toORPCRouter` converts a [tRPC router](https://trpc.io/docs/server/routers) into an [oRPC router](/docs/router):

```ts
import { toORPCRouter } from '@orpc/trpc'

const orpcRouter = toORPCRouter(trpcRouter)
```

The result is a regular oRPC router that works with any oRPC feature. For example, you can expose it through an [RPC Handler](/docs/rpc/handler) or [OpenAPI Handler](/docs/openapi/handler), or call it directly with [Server-Side Clients](/docs/client/server-side).

### Error Formatting

`toORPCRouter` does not support [tRPC Error Formatting](https://trpc.io/docs/server/error-formatting). Instead, errors thrown by tRPC are wrapped in `ORPCError`.

```ts
const handler = new OpenAPIHandler(orpcRouter, {
  interceptors: [
    async ({ next }) => {
      try {
        return await next()
      }
      catch (error) {
        if (
          error instanceof ORPCError
          && error.cause instanceof TRPCError
          && error.cause.cause instanceof z.ZodError
        ) {
          throw new ORPCError('UNPROCESSABLE_CONTENT', {
            message: z.prettifyError(error.cause.cause),
            data: z.flattenError(error.cause.cause),
            cause: error.cause.cause,
          })
        }

        throw error
      }
    },
  ],
})
```

## Metadata

`toTRPCMeta` bridges [oRPC metadata](/docs/metadata) with tRPC meta. It returns a plain object that you can pass to tRPC `.meta` calls.

```ts
import { openapi } from '@orpc/openapi'
import { toTRPCMeta } from '@orpc/trpc'

export const t = initTRPC.context<Context>().create()

const example = t.procedure
  .meta(toTRPCMeta(openapi({ path: '/hello', summary: 'Hello procedure' }))) // [!code highlight]
  .input(z.object({ name: z.string() }))
  .query(({ input }) => {
    return `Hello, ${input.name}!`
  })

const merged = t.procedure
  .meta({
    ...toTRPCMeta( // [!code highlight]
      openapi({ path: '/hello' }), // [!code highlight]
      openapi({ method: 'POST' }), // [!code highlight]
    ), // [!code highlight]
    other: 'value',
  })
  .input(z.object({ name: z.string() }))
  .mutation(({ input }) => {
    return `Hello, ${input.name}!`
  })
```

:::warning
Chained tRPC `.meta()` calls merge shallowly, so oRPC metadata merge logic (e.g. accumulating `openapi.tags`) only works within a single `toTRPCMeta` call.
:::
