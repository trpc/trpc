---
title: "Validation Customization"
description: "Learn how to customize validation in oRPC, including disabling runtime validation and shaping custom validation errors."
---

## Disable Validation

You can disable runtime validation with the `.$config`.

```ts
const base = os.$config({
  /**
   * When enabled, input schemas are not validated at runtime.
   * Schemas are still used for type inference and OpenAPI generation.
   *
   * @warning Do not disable validation for schemas that transform values.
   *
   * @default false
   */
  disableInputValidation: true,

  /**
   * When enabled, output schemas are not validated at runtime.
   * Schemas are still used for type inference and OpenAPI generation.
   *
   * Useful when output schemas exist only for specification generation.
   *
   * @warning Do not disable validation for schemas that transform values.
   *
   * @default false
   */
  disableOutputValidation: true
})
```

:::warning
Do not disable validation for schemas that transform values.
For example, the following schema accepts a `number` but returns a `string`:

```ts
z.object({
  value: z.number().transform(value => String(value)),
})
```

If runtime validation is disabled, the transformation is skipped. As a result, the server returns a `number` while the client expects a `string`, leading to unexpected behavior.
:::

## Custom Validation Errors

You can catch validation errors with [interceptors](/docs/rpc/handler#interceptors), [client interceptors](/docs/rpc/handler#client-interceptors), or [middleware](/docs/middleware) applied before `.input` or `.output` and then throw a custom error. This is useful if you want to change the error message or shape.

```ts twoslash
import { RPCHandler } from '@orpc/server/fetch'
import { router } from './shared/planet'
// ---cut---
import * as z from 'zod'
import { ORPCError, ValidationError } from '@orpc/server'

const handler = new RPCHandler(router, {
  interceptors: [
    async ({ next }) => {
      try {
        return await next()
      }
      catch (error) {
        if (
          error instanceof ORPCError
          && error.code === 'BAD_REQUEST'
          && error.cause instanceof ValidationError
        ) {
          // If you only use Zod you can safely cast to ZodIssue[]
          const zodError = new z.ZodError(error.cause.issues as z.core.$ZodIssue[])

          throw new ORPCError('INPUT_VALIDATION_FAILED', {
            message: z.prettifyError(zodError),
            data: z.flattenError(zodError),
            cause: error,
          })
        }

        if (
          error instanceof ORPCError
          && error.code === 'INTERNAL_SERVER_ERROR'
          && error.cause instanceof ValidationError
        ) {
          // do not expose validation details for output validation errors
          throw new ORPCError('OUTPUT_VALIDATION_FAILED', {
            cause: error,
          })
        }

        throw error
      }
    },
  ],
})
```

### Typesafe Validation Errors

As explained in the [error handling guide](/docs/error-handling#orpcerror-compatibility), if you throw an `ORPCError` whose `code` and `data` match an error defined with `.errors`, oRPC treats it the same as `errors.[code]`.

This does not work in [interceptors](/docs/rpc/handler#interceptors). Use [client interceptors](/docs/rpc/handler#client-interceptors) or [middleware](/docs/middleware) applied before `.input` or `.output` instead.

```ts twoslash
import { RPCHandler } from '@orpc/server/fetch'
// ---cut---
import { ORPCError, os, ValidationError } from '@orpc/server'
import * as z from 'zod'

const base = os.errors({
  INPUT_VALIDATION_FAILED: {
    data: z.object({
      formErrors: z.array(z.string()),
      fieldErrors: z.record(z.string(), z.array(z.string()).optional()),
    }),
  },
})

const example = base
  .input(z.object({ id: z.uuid() }))
  .handler(() => { /** do something */ })

const handler = new RPCHandler({ example }, {
  clientInterceptors: [
    async ({ next }) => {
      try {
        return await next()
      }
      catch (error) {
        if (
          error instanceof ORPCError
          && error.code === 'BAD_REQUEST'
          && error.cause instanceof ValidationError
        ) {
          // If you only use Zod you can safely cast to ZodIssue[]
          const zodError = new z.ZodError(error.cause.issues as z.core.$ZodIssue[])

          throw new ORPCError('INPUT_VALIDATION_FAILED', {
            message: z.prettifyError(zodError),
            data: z.flattenError(zodError),
            cause: error,
          })
        }

        throw error
      }
    },
  ],
})
```
