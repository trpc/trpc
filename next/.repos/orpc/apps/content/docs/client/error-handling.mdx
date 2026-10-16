---
title: "Client Error Handling"
description: "Handle client-side errors in oRPC with try/catch, or use safe and createSafeClient for fully type-inferred typesafe errors."
sidebar:
  label: "Error Handling"
---

## Using `try/catch`

For most calls, use regular `try/catch`.

```ts
try {
  const data = await client.doSomething({ id: '123' })
}
catch (error) {
  // handle error
}
```

## Using `safe` and `isDefinedError`

When working with [Typesafe Errors](/docs/error-handling#typesafe-errors), use `safe` to preserve error type inference. It behaves like `try/catch`, but returns the typesafe result instead of throwing.

```ts twoslash
import { call, os } from '@orpc/server'
import * as z from 'zod'
// ---cut---
import { isDefinedError, safe } from '@orpc/client'

const exampleProcedure = os
  .input(z.object({ id: z.string() }))
  .errors({
    RATE_LIMIT_EXCEEDED: {
      data: z.object({ retryAfter: z.number() })
    }
  })
  .handler(async ({ input, errors }) => {
    throw errors.RATE_LIMIT_EXCEEDED({ data: { retryAfter: 1000 } })
  })

// or { error, data, definedError }
const [error, data, definedError] = await safe(
  call(exampleProcedure, { id: '123' })
)

if (isDefinedError(error)) { // or definedError
  // handle defined error

  // or definedError.data.retryAfter
  console.log(error.data.retryAfter)
}
else if (error) {
  // handle unknown error
}
else {
  // handle success
  console.log(data)
}
```

:::info
`safe` supports both tuple and object forms:

- `[error, data, definedError]`
- `{ error, data, definedError }`

`definedError` is the same value as `error` when `isDefinedError(error)` returns `true`; otherwise it is `null`.
:::

## Safe Client

If you use `safe` often, `createSafeClient` can reduce repetition by wrapping entire client calls with `safe`.

```ts
import { createSafeClient } from '@orpc/client'

const safeClient = createSafeClient(client)

const [error, data] = await safeClient.doSomething({ id: '123' })
```
