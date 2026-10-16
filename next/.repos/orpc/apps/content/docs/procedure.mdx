---
title: "Procedure"
description: "Learn how oRPC procedures combine input and output validation, middleware, metadata, and typesafe errors through a composable builder."
---

## Overview

```ts twoslash
import { z } from 'zod'
import type { AnyMetaPlugin } from '@orpc/server'

declare const someMeta: AnyMetaPlugin

const requireAuth = os
  .middleware(({ context, next }) => {
    return next({
      context: {
        user: { id: 1 }
      }
    })
  })

const canEdit = os
  .$context<{ user: { id: number } }>()
  .middleware(async ({ next }, id: number) => {
    return next()
  })
// ---cut---
import { os } from '@orpc/server'

const example = os
  .$context<{ something?: string }>() // <- define initial context
  .meta(someMeta) // <- attach metadata
  .errors({ NOT_FOUND: {} }) // <- define errors
  .use(requireAuth) // <- apply middleware
  .input(z.object({ id: z.number(), name: z.string() })) // <- input validation
  .use(canEdit.adaptInput(input => input.id)) // <- middleware with typed input
  .output(z.object({ id: z.number(), name: z.string() })) // <- output validation
  .handler(async ({ input, context, errors }) => { // <- handler logic
    return { id: 1, name: 'example' }
  })
```

:::info
The `.handler` method is the only required step. All other chains are optional.
:::

## Initial Context

Use `.$context` to declare the initial context required for a procedure to execute.
Learn more in the [Context Documentation](/docs/context).

## Metadata

Use `.meta` to attach metadata to a procedure. You can access this metadata later in middleware or plugins. Learn more in the [Metadata Documentation](/docs/metadata).

## Typesafe Errors

Use `.errors` to define error definitions for a procedure. These errors can be thrown in the handler or middleware and will be properly typed on the client. Learn more in the [Typesafe Error Handling documentation](/docs/error-handling#typesafe-errors).

## Input/Output Validation

oRPC supports [Zod](https://zod.dev/), [Valibot](https://valibot.dev/), [Arktype](https://arktype.io/), and any other [Standard Schema](https://standardschema.dev/schema#what-schema-libraries-implement-the-spec) library for validation.

:::tip
By specifying `.output` or the handler's return type, TypeScript can infer the output without analyzing the handler body. This can significantly improve type-checking and IDE suggestion performance for complex handlers.
:::

### Multiple Schemas

`.input` and `.output` can be called multiple times. Each call adds a schema, and the value must pass all of them.

Each `.input` object schema validates the original input with the earlier results applied, then the results are merged. This lets you extend a base procedure without repeating its fields. Fields no schema defines are dropped before the handler runs. [Middleware](/docs/middleware) between schemas receives the fields validated so far plus the raw rest of the input, so whole-input middleware like caching works anywhere in the chain.

```ts
const base = os
  .input(z.object({ params: z.object({ id: z.string() }) }))

const example = base
  .input(z.object({ params: z.object({ slug: z.string() }) }))
  .handler(async ({ input }) => {
    // input is { params: { id: string, slug: string } }
    return input
  })
```

:::warning
Only plain objects are merged, and only two levels deep. Deeper values and anything else, like [`asyncIteratorObject`](/docs/async-iterator-object) or a `z.string()` transform, are piped: each schema validates what the previous one returned. Use `z.looseObject` when two schemas define the same object deeper than that:

```ts
const example = os
  .input(z.object({ user: z.object({ address: z.looseObject({ city: z.string() }) }) }))
  .input(z.object({ user: z.object({ address: z.looseObject({ zip: z.string() }) }) }))
```

:::

:::warning
A field several schemas define is validated by each in turn, so put a type-changing transform like `z.string().transform(s => new Date(s))` in only one. Stacked `.output` schemas have the same limit. Schemas that reject unknown fields, like `z.strictObject`, cannot be stacked.
:::

`.output` schemas are piped, not merged, and run in reverse: the last one validates the handler result, then each earlier one validates what the next returned. Use `z.looseObject` so no schema drops a field another one needs.

```ts
const example = os
  .output(z.looseObject({ name: z.string() }))
  .output(z.looseObject({ id: z.number() }))
  .handler(async () => ({ id: 1, name: 'example' }))
```

### `type` Utility

For simple use cases without external libraries, use oRPC's built-in `type` utility. It takes a mapping function as its first argument:

```ts
import { type } from '@orpc/server'

const example = os
  .input(type<{ value: number }>())
  .output(type<{ value: number }, number>(({ value }) => value))
  .handler(async ({ input }) => input)
```

## Using Middleware

The `.use` method allows you to pass [middleware](/docs/middleware), which must call `next` to continue execution.

```ts
const aMiddleware = os.middleware(async ({ context, next }) => next())

const example = os
  .use(aMiddleware) // Apply middleware
  .use(async ({ context, next }) => next()) // Inline middleware
  .handler(async ({ context }) => { /* logic */ })
```

:::warning
[Middleware](/docs/middleware) can only be applied when the [current context](/docs/context#combining-initial-and-injected-context) satisfies the [middleware's initial context](/docs/middleware#initial-context) and does not conflict with the context the middleware adds.
:::

:::info
You can use [`.adaptInput`](/docs/middleware#middleware-input) when applying middleware to adapt the input to a different shape that the middleware expects.

```ts
const canEdit = os.middleware(async ({ next }, id: string) => {
  if (!canUserEdit(id)) {
    throw new ORPCError('UNAUTHORIZED')
  }

  return next()
})

const example = os
  .input(z.object({ id: z.string(), name: z.string() }))
  .use(canEdit.adaptInput(input => input.id)) // Adapt input to match middleware's expected shape
  .handler(async ({ context }) => { /* logic */ })
```

:::

## Reusability

Each modification to a builder creates a completely new instance, avoiding reference issues. This makes it easy to reuse and extend procedures efficiently.

```ts
const pub = os.use(logMiddleware) // Base setup for procedures that publish
const authed = pub.use(requireAuth) // Extends 'pub' with authentication

const pubExample = pub
  .handler(async ({ context }) => { /* logic */ })

const authedExample = authed
  .handler(async ({ context }) => { /* logic */ })
```

This pattern helps prevent duplication while maintaining flexibility.
