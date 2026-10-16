---
title: "Effect Integration"
description: "Write effectful oRPC handlers with Effect generators, call oRPC clients as effects, provide services through context, and use Effect Schema for input and output validation."
sidebar:
  label: "Effect"
---

:::warning
This guide assumes familiarity with [Effect](https://effect.website/). Review the official documentation if needed.
:::

## Installation

```package-install
npm install @orpc/experimental-effect@beta effect
```

## Effectful Handlers

`handlerGen` allows you to write effectful handlers using generator functions. Inside the generator, you can yield Effect operations, and `handlerGen` will handle the execution and error handling for you.

```ts twoslash
import { os } from '@orpc/server'
// ---cut---
import { handlerGen } from '@orpc/experimental-effect'
import { Effect } from 'effect'

const procedure = os.handler(handlerGen(function* ({ input, context }) {
  // You can use Effect's features here, such as concurrency, error handling, etc.
  const result = yield* Effect.promise(() => Promise.resolve(5))
  return result
}))
```

### `.effect` extension

Import `@orpc/experimental-effect/extensions/effect` from a module that always runs during initialization, such as the file where you define your base builder or create your server. This adds an `.effect` method to the builder so you can write effectful handlers directly.

<CodeGroup>

```ts usage
const procedure = base.effect(function* ({ input, context }) {
  // You can use Effect's features here, such as concurrency, error handling, etc.
  const result = yield* Effect.promise(() => Promise.resolve(5))
  return result
})
```

```ts setup
import '@orpc/experimental-effect/extensions/effect'

import { os } from '@orpc/server'

export const base = os
```

</CodeGroup>

### Effect Services

You can provide Effect services through the oRPC context in a typesafe way with `WithEffectContext` and `effect/context`:

```ts twoslash
import { call, os } from '@orpc/server'
// ---cut---
import { handlerGen, WithEffectContext } from '@orpc/experimental-effect'
import { Context, Effect } from 'effect'

class Random extends Context.Service<
  Random,
  {
    readonly next: Effect.Effect<number>
  }
>()('MyRandomService') {}

interface ServerContext extends WithEffectContext<Random> {}

const procedure = os
  .$context<ServerContext>()
  .handler(handlerGen(function* ({ input, context }) {
    const random = yield* Random
    const result = yield* random.next
    return result
  }))

const random = await call(procedure, undefined, {
  context: {
    'effect/context': Context.empty().pipe(
      Context.add(Random, {
        next: Effect.succeed(Math.random()),
      }),
    )
  }
})
```

:::info
You can also extend the Effect context with [middleware](/docs/middleware):

```ts
const procedure = os
  .$context<ServerContext>()
  .use(({ context, next }) => {
    return next({
      context: {
        'effect/context': context['effect/context'].pipe(
          Context.add(AdditionService, {}),
        )
      }
    })
  })
  .handler(handlerGen(function* ({ input, context }) {
    const additionService = yield* AdditionService
  }))
```

:::

### Error Handling

This integration preserves the original error whenever possible. If you call `Effect.fail(error)`, the error is forwarded to [middleware](/docs/middleware) and interceptors, just like a regular thrown error.

To customize this behavior, wrap the effect before execution using `effect/wrap` in the context:

```ts
import { Context, Effect } from 'effect'

interface ServerContext extends WithEffectContext<never> {}

export async function fetch(request: Request) {
  const { matched, response } = await handler.handle(request, {
    context: {
      'effect/context': Context.empty(),
      'effect/wrap': (effect, opts) => effect.pipe(
        Effect.catchCause((cause) => {

        })
      ),
    }
  })

  if (matched) {
    return response
  }

  return new Response('Not Found', { status: 404 })
}
```

:::info
For app level error handling, we recommend [middleware](/docs/middleware) or interceptors.
:::

### Typesafe Errors

An `ORPCError` that fails the effect, such as `yield* Effect.fail(new ORPCError(...))`, is thrown from the handler exactly like a thrown `ORPCError` in a regular handler. Define your errors with `.errors` and fail with `errors.X(...)` to make them [typesafe](/docs/error-handling#typesafe-errors) on the client:

```ts
const procedure = os
  .errors({
    NOT_FOUND: {
      message: 'The resource you are looking for does not exist',
    },
  })
  .handler(handlerGen(function* ({ errors }) {
    if (resourceNotFound) {
      yield* Effect.fail(errors.NOT_FOUND())
    }

    return 'Success'
  }))

const [error, result] = await safe(call(procedure))

if (isDefinedError(error)) {
  // typesafe error handling
}
```

### Catching ORPCErrors

Use `catchORPCError` to recover from every `ORPCError` failure in the error channel of an effect, or `catchORPCErrorCode` and `catchORPCErrorCodes` to recover from specific codes only. Recovered errors are excluded from the resulting effect, and other failures re-fail with their original cause:

```ts
import { catchORPCError, catchORPCErrorCode, catchORPCErrorCodes } from '@orpc/experimental-effect'
import { Effect } from 'effect'

const recovered = program.pipe(
  catchORPCError(error => Effect.succeed(`caught ${error.code}`)),
)

const fallback = program.pipe(
  catchORPCErrorCode('NOT_FOUND', error => Effect.succeed(null)),
)

const handled = program.pipe(
  catchORPCErrorCodes({
    NOT_FOUND: error => Effect.succeed(null),
    CONFLICT: error => Effect.succeed(error.message),
  }),
)
```

`error.data` is typed only when the error channel holds nothing but declared `ORPCError`s. Otherwise, as with [client calls](#client-calls), it is `unknown`.

:::info
All utilities support data-first `catchORPCError(program, handler)` and data-last `program.pipe(catchORPCError(handler))` styles.
:::

## Effectful Middleware

`middlewareGen` allows you to write effectful middleware using generator functions. Inside the generator, you can yield Effect operations and `yield* next()` to continue the chain. Downstream failures land in the error channel of `next`, so you can recover from them with Effect.

```ts twoslash
import { os } from '@orpc/server'
// ---cut---
import { middlewareGen } from '@orpc/experimental-effect'
import { Effect } from 'effect'

const procedure = os
  .$context<{ auth: boolean }>()
  .use(middlewareGen(function* ({ context, next }) {
    const startedAt = yield* Effect.sync(() => Date.now())
    return yield* next({ context: { startedAt } })
  }))
  .handler(({ context }) => context.startedAt)
```

## Client Calls

`createEffectClient` wraps any oRPC client, whether [server-side](/docs/client/server-side) or [client-side](/docs/client/client-side), so every procedure returns a lazy Effect instead of a promise, ready to `yield*` inside Effect generators. The output becomes the success value, and errors land in the error channel with their original types preserved, ready for utilities like `catchORPCErrorCodes`:

```ts
import { catchORPCErrorCodes, createEffectClient } from '@orpc/experimental-effect'
import { Effect } from 'effect'

const effectClient = createEffectClient(client)

const program = Effect.gen(function* () {
  const planet = yield* effectClient.planet.find({ id: 1 })
  return planet.name
}).pipe(
  catchORPCErrorCodes({
    NOT_FOUND: error => Effect.succeed('unknown'),
  }),
)
```

For typed `error.data`, combine `Effect.catchIf` with [isDefinedError](/docs/client/error-handling#using-safe-and-isdefinederror):

```ts
import { isDefinedError } from '@orpc/client'
import { Effect } from 'effect'

const recovered = effectClient.planet.find({ id: 1 }).pipe(
  Effect.catchIf(isDefinedError, (error) => {
    // error and error.data are fully typed here
    return Effect.succeed(null)
  }),
)
```

:::info
The effects are lazy: the client is invoked each time the effect runs, so they work naturally with `Effect.retry`. Interrupting the effect aborts the underlying call.
:::

## Effect Schema

oRPC natively supports [Standard Schema](https://standardschema.dev/schema#what-schema-libraries-implement-the-spec), and [Effect Schema](https://effect.website/docs/schema/introduction/) implements that spec through [Schema.toStandardSchemaV1](https://effect.website/docs/schema/standard-schema/):

```ts
import { Schema } from 'effect'

const procedure = os
  .input(Schema.toStandardSchemaV1(Schema.Struct({ name: Schema.String })))
  .handler(handlerGen(function* ({ input, context }) {
    return `Hello ${input.name}!`
  }))
```

### `.input` and `.output` Extensions

Import `@orpc/experimental-effect/extensions/input-output` from a module that always runs during initialization, such as the file where you define your base builder or create your server. This lets you define `.input` and `.output` directly with Effect Schema:

<CodeGroup>

```ts usage
const procedure = base
  .input(Schema.Struct({ name: Schema.String }))
  .output(Schema.Struct({ greeting: Schema.String }))
  .handler(handlerGen(function* ({ input, context }) {
    return { greeting: `Hello ${input.name}!` }
  }))
```

```ts setup
import '@orpc/experimental-effect/extensions/input-output'

import { os } from '@orpc/server'

export const base = os
```

</CodeGroup>

:::info
You can also use these extensions with the [contract builder](/docs/contract/procedure).
:::

### JSON Schema Converter

This integration also provides `EffectSchemaToJsonSchemaConverter`, which wraps Effect's built-in [Schema.toJsonSchemaDocument](https://effect.website/docs/schema/json-schema/). Use it with tools such as the [OpenAPI Generator](/docs/openapi/specification#openapi-generator). It accepts the same options as `Schema.toJsonSchemaDocument`, such as `onExcessProperty`, `generateDescriptions`, `includeAnnotationKey`, and `referencePolicy`:

```ts
import { EffectSchemaToJsonSchemaConverter } from '@orpc/experimental-effect'

const generator = new OpenAPIGenerator({
  converters: [
    new EffectSchemaToJsonSchemaConverter({
      onExcessProperty: 'error',
    }),
  ],
})
```

Schemas with an `identifier` annotation, including `Schema.Class` and recursive schemas, are preserved in `$defs`, which `OpenAPIGenerator` can then [hoist](/docs/openapi/specification#hoisting-defs) into `components.schemas`.

:::tip
Enable the `cache` option to reuse conversion results when the same schema instance is converted repeatedly. When enabled, repeated conversions return the same JSON schema object, so treat the results as immutable.

```ts
const converter = new EffectSchemaToJsonSchemaConverter({ cache: true })
```

:::

## OpenTelemetry Integration

First, set up the [oRPC OpenTelemetry integration](/docs/integrations/opentelemetry). Then instrument your Effect to work seamlessly with OpenTelemetry by providing `TracingLive` through `effect/wrap` in the context. This makes Effect tracing equivalent to OpenTelemetry tracing:

```ts
import { Resource, Tracer } from '@effect/opentelemetry'
import { Context, Effect, Layer } from 'effect'

interface ServerContext extends WithEffectContext<never> {}

const TracingLive = Tracer.layerGlobal.pipe(
  Layer.provide(Resource.layerFromEnv()),
)

export async function fetch(request: Request) {
  const { matched, response } = await handler.handle(request, {
    context: {
      'effect/context': Context.empty(),
      'effect/wrap': (effect, opts) => effect.pipe(Effect.provide(TracingLive)),
    }
  })

  if (matched) {
    return response
  }

  return new Response('Not Found', { status: 404 })
}
```
