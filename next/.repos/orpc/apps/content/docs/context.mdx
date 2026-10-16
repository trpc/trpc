---
title: "Context"
description: "Use oRPC context for type-safe dependency injection, providing initial context explicitly or injecting values through middleware."
---

## Initial Context

Use initial context for values that come from the environment. Declare it with `.$context`, then provide it when executing the procedure:

```ts twoslash
import { os } from '@orpc/server'
// ---cut---
const base = os.$context<{ env: { DB_URL: string } }>()

export const getting = base
  .handler(async ({ context }) => {
    console.log(context.env)
  })
```

:::info
When a procedure requires initial context when calling, you must manually pass it:

```ts twoslash
import { call, os } from '@orpc/server'

const base = os.$context<{ env: { DB_URL: string } }>()
const getting = base.handler(async ({ context }) => {})
// ---cut---
const output = await call(getting, undefined, {
  context: { // <- initial context must be passed when calling
    env: { DB_URL: 'postgres://...' },
  },
})
```

:::

### Default Initial Context

To avoid repeating `.$context` declarations, you can define a default initial context type globally.

```ts
declare module '@orpc/server' {
  interface DefaultInitialContext {
    env: { DB_URL: string }
  }
}
```

## Injected Context

Injected context is injected at runtime through [middleware](/docs/middleware#middleware-context):

```ts twoslash
import { os } from '@orpc/server'

declare const env: { DB_URL: string }
// ---cut---
const base = os.use(async ({ next }) => next({
  context: {
    env: { DB_URL: env.DB_URL },
  },
}))

export const getting = base.handler(async ({ context }) => {
  console.log(context.env)
})
```

:::info
When you use middleware context, you do not need to pass context manually when calling:

```ts twoslash
import { call, os } from '@orpc/server'

declare const env: { DB_URL: string }

const base = os.use(async ({ next }) => next({
  context: {
    env: { DB_URL: env.DB_URL },
  },
}))

const getting = base.handler(async ({ context }) => {})
// ---cut---
// no need to pass context manually when calling
const output = await call(getting)
```

:::

## Combining Initial and Injected Context

In many cases, you will use both. Use initial context for environment-specific values, such as database URLs, and injected context for runtime data, such as authenticated users.

```ts twoslash
import { ORPCError, os } from '@orpc/server'

declare function parseJWT(token: string | undefined, secret: string): { userId: number } | null
// ---cut---
const base = os.$context<{ headers: Headers, env: { JWT_SECRET: string } }>()

const requireAuth = base.middleware(async ({ context, next }) => {
  const user = parseJWT(
    context.headers.get('authorization')?.split(' ')[1],
    context.env.JWT_SECRET
  )

  if (!user) {
    throw new ORPCError('UNAUTHORIZED')
  }

  return next({ context: { user } })
})

const getting = base
  .use(requireAuth)
  .handler(async ({ context }) => {
    console.log(context.env)
    console.log(context.user)
  })
```
