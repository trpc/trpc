---
title: "Dedupe Middleware"
description: "Learn how to use context to prevent the same middleware from repeating expensive work when it runs multiple times in a single call."
---

## Problem

The same middleware can run more than once during a single call. This often happens when:

- a procedure [calls](/docs/client/server-side#one-off-calls) another procedure that both use the same middleware
- you use `.use(authProvider).router(router)`, and some procedures in `router` already use `authProvider`

:::warning
Repeated middleware work can hurt performance, especially for expensive operations such as opening a database connection.
:::

## Solution

Store the computed value in [`context`](/docs/context) and reuse it when the [middleware](/docs/middleware) runs again.

For example, this middleware loads auth at most once per call:

```ts twoslash
import { os } from '@orpc/server'

declare function loadAuth(headers: Headers): Promise<{ id: string } | undefined>
// ---cut---
const authProvider = os
  .$context<{ headers: Headers, auth?: { id: string } | undefined, authLoaded?: boolean | undefined }>()
  .middleware(async ({ context, next }) => {
    // reuse the loaded auth value if it was already loaded
    const auth = context.authLoaded
      ? context.auth
      : await loadAuth(context.headers)

    return next({ context: { auth, authLoaded: true } })
  })
```

You can now apply `authProvider` multiple times without loading auth again:

```ts twoslash
import { call, os } from '@orpc/server'

declare function loadAuth(headers: Headers): Promise<{ id: string } | undefined>
const authProvider = os
  .$context<{ headers: Headers, auth?: { id: string } | undefined, authLoaded?: boolean | undefined }>()
  .middleware(async ({ context, next }) => {
    // reuse the loaded auth value if it was already loaded
    const auth = context.authLoaded
      ? context.auth
      : await loadAuth(context.headers)

    return next({ context: { auth, authLoaded: true } })
  })
// ---cut---
const base = os.$context<{ headers: Headers }>()

const foo = base.use(authProvider).handler(({ context }) => 'Hello World')

const bar = base.use(authProvider).handler(({ context }) => {
  // Reuse the auth value that is already stored in context.
  return call(foo, undefined, { context }) // [!code highlight]
})

// Applying authProvider again does not load auth a second time.
const router = base
  .use(authProvider) // [!code highlight]
  .use(({ next }) => {
    // Additional middleware logic
    return next()
  })
  .router({
    foo,
    bar,
  })
```
