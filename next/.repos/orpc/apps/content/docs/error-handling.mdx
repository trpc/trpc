---
title: "Error Handling"
description: "Handle errors in oRPC with the ORPCError class, typesafe error definitions, reusable error factories, and custom error conversion."
---

## `ORPCError` Class

`ORPCError` is the standard error type in oRPC. It includes a `code`, plus optional `message` and `data` fields.

:::danger
`message` and `data` are sent to the client. Do not include sensitive information in either field.
:::

```ts twoslash
declare const notFound: boolean
// ---cut---
import { ORPCError, os } from '@orpc/server'

const rateLimitMiddleware = os.middleware(async ({ next }) => {
  throw new ORPCError('RATE_LIMITED', {
    message: 'You are being rate limited',
    data: { retryAfter: 60 }
  })

  return next()
})

const example = os
  .use(rateLimitMiddleware)
  .handler(async ({ input }) => {
    if (notFound) {
      throw new ORPCError('NOT_FOUND')
    }
  })
```

## Typesafe Errors

For end-to-end type safety, define your errors with `.errors`. This lets the client infer each error's shape and handle it safely. You can use any [Standard Schema](https://standardschema.dev/schema#what-schema-libraries-implement-the-spec) library to validate error data.

:::danger
`message` and `data` are sent to the client. Do not include sensitive information in either field.
:::

```ts twoslash
import { os } from '@orpc/server'
import * as z from 'zod'

declare const notFound: boolean
// ---cut---
const rateLimitMiddleware = os
  .errors({
    RATE_LIMITED: {
      data: z.object({
        retryAfter: z.number(),
      }),
    },
  })
  .middleware(async ({ next, errors }) => {
    throw errors.RATE_LIMITED({
      message: 'You are being rate limited',
      data: { retryAfter: 60 }
    })

    return next()
  })

const exampleProcedure = os
  .use(rateLimitMiddleware)
  .errors({
    NOT_FOUND: {
      message: 'The resource was not found', // <- default message
    },
  })
  .handler(async ({ input, errors }) => {
    if (notFound) {
      throw errors.NOT_FOUND()
    }
  })
```

:::tip
You can use typesafe errors across your entire project, but we recommend reserving them for application-specific cases. For common errors like `UNAUTHORIZED` or `RATE_LIMITED`, the client usually already understands the meaning. Skipping explicit schemas for those errors can also reduce type complexity and improve TypeScript performance.
:::

### ORPCError Compatibility

If you cannot access the `errors` object, for example in a utility function or another module, you can still throw `ORPCError`. oRPC will try to convert it to the matching typesafe error when its `code` and `data` match a defined error. If no match is found, it is treated as an unknown error.

```ts
const exampleProcedure = os
  .errors({
    NOT_FOUND: {
      message: 'The resource was not found',
    },
  })
  .handler(async ({ errors }) => {
    throw errors.NOT_FOUND()

    // Treated as errors.NOT_FOUND because the code and data match
    throw new ORPCError('NOT_FOUND')

    // Treated as an unknown error because it does not match any defined error
    throw new ORPCError('BAD_REQUEST')
  })
```

## Error Factory

An error factory lets you define an error once and reuse it anywhere, keeping error handling consistent across your project.

```ts
import { error } from '@orpc/server'

const RateLimitedError = error('RATE_LIMITED', {
  /**
   * Optional default message, can be overridden when constructing an error.
   */
  message: 'You are being rate limited',
  /**
   * Optional schema used to type and validate the error data.
   * Must be a synchronous schema.
   */
  data: z.object({
    retryAfter: z.number(),
  }),
})

const procedure = os
  .handler(async () => {
    throw new RateLimitedError({ data: { retryAfter: 60 } })
  })
```

:::tip
You can also register error factories in `.errors`. This makes them part of the [typesafe errors](#typesafe-errors) flow and visible in generated specifications.

```ts
const procedure = os
  .errors({
    [RateLimitedError.code]: RateLimitedError,
  })
```

:::

### `instanceof` Support

An error factory class supports `instanceof` checks with full type narrowing. It matches any `ORPCError` with the same `code` whose `data` passes the schema.

```ts
if (err instanceof RateLimitedError) {
  console.log(err.data.retryAfter)
}
```

## ORPC Error Codes

By default, oRPC allows any string as an error code and suggests common HTTP codes like `NOT_FOUND` and `UNAUTHORIZED`. You can override this with your own set of allowed error codes for better type safety and consistency.

```ts
declare module '@orpc/server' { // or '@orpc/client'
  interface Registry {
    ORPCErrorCode: 'NOT_FOUND' | 'UNAUTHORIZED' | 'RATE_LIMITED' | 'MY_CUSTOM_ERROR' | (string & {})
  }
}
```

With this configuration, only `NOT_FOUND`, `UNAUTHORIZED`, `RATE_LIMITED`, and `MY_CUSTOM_ERROR` will be suggested as error codes. The `(string & {})` fallback ensures you can still use any string value when needed.

## Using Custom Error Classes

You do not have to use `ORPCError` directly in your business logic. You can throw your own error classes and convert them to `ORPCError` in middleware or interceptors.

:::info
By default, oRPC can convert non-`ORPCError` into an `ORPCError` with code `INTERNAL_SERVER_ERROR`, or leave them unchanged depending on the client you are using.
:::

```ts
class MyCustomError extends Error {
}

const customErrorConverterMiddleware = os.middleware(async ({ next }) => {
  try {
    return await next()
  }
  catch (err) {
    if (err instanceof MyCustomError) {
      throw new ORPCError('MY_CUSTOM_ERROR', { message: err.message, cause: err })
    }

    throw err
  }
})
```

## Client Error Handling

To learn how to handle errors on the client side, see the [Client Error Handling documentation](/docs/client/error-handling).
