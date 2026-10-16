---
title: "Better Auth Integration"
description: "Use Better Auth sessions in oRPC context and protect procedures with typed middleware."
sidebar:
  label: "Better Auth"
---

Use your [Better Auth](https://better-auth.com/) instance with oRPC's [context](/docs/context) and [middleware](/docs/middleware). No extra package is needed.

:::tip
You may need to forward Better Auth's [response headers](https://better-auth.com/docs/concepts/api#getting-headers), such as a refreshed session cookie. The [Response Headers Plugin](/docs/plugins/response-headers) can help unless you use the [Batch Plugin](/docs/plugins/batch).
:::

## Resolve the Session in Middleware

The [Request Headers Plugin](/docs/plugins/request-headers) exposes request headers as `context.reqHeaders`. The middleware loads the session from them and rejects unauthenticated calls. Public procedures use the base directly. Each protected call performs its own lookup, including every sub-request of a [batch](/docs/plugins/batch).

```ts
import type { RequestHeadersHandlerPluginContext } from '@orpc/server/plugins'
import { ORPCError, os } from '@orpc/server'

interface ServerContext extends RequestHeadersHandlerPluginContext {}

const base = os.$context<ServerContext>()

const requireSession = base.middleware(async ({ context, next }) => {
  const session = await auth.api.getSession({
    headers: context.reqHeaders ?? new Headers(),
  })

  if (!session) {
    throw new ORPCError('UNAUTHORIZED')
  }

  return next({ context: { session } })
})

const protectedProcedure = base.use(requireSession)

const router = {
  ping: base.handler(() => ({ message: 'pong' })),
  me: protectedProcedure.handler(({ context }) => ({
    id: context.session.user.id,
    name: context.session.user.name,
  })),
}
```

`context.session` is Better Auth's full result with `user` and `session`. Its type is inferred from your auth instance, so additional fields stay available.

Only a missing session becomes `UNAUTHORIZED`. Other errors from `getSession` propagate to oRPC's [error handling](/docs/error-handling).

`reqHeaders` is `undefined` without the plugin, such as in [server-side calls](/docs/client/server-side). The empty `Headers` fallback carries no session cookie, so `getSession` returns `null` and protected calls return `UNAUTHORIZED`. Pass `reqHeaders` in the initial context to authenticate such calls.

## Lazily Load and Share the Session

If your server resolves the session itself, pass a lazy getter into the initial context instead of the session. The lookup runs at most once per request and only when a procedure asks for it. This includes [batch](/docs/plugins/batch) requests, where every sub-request shares the getter. The same getter can also serve the rest of your request handling.

```ts
import { ORPCError, os } from '@orpc/server'
import { RPCHandler } from '@orpc/server/fetch'

type Session = Awaited<ReturnType<typeof auth.api.getSession>>

function once<T>(fn: () => Promise<T>): () => Promise<T> {
  let promise: Promise<T> | undefined

  return () => {
    promise ??= fn()
    return promise
  }
}

const base = os.$context<{ getSession: () => Promise<Session> }>()

const requireSession = base.middleware(async ({ context, next }) => {
  const session = await context.getSession()

  if (!session) {
    throw new ORPCError('UNAUTHORIZED')
  }

  return next({ context: { session } })
})

const protectedProcedure = base.use(requireSession)

const router = {
  greeting: base.handler(async ({ context }) => {
    const session = await context.getSession()

    return { message: `Hello, ${session?.user.name ?? 'guest'}` }
  }),
  me: protectedProcedure.handler(({ context }) => ({
    id: context.session.user.id,
    name: context.session.user.name,
  })),
}

const handler = new RPCHandler(router)

export async function fetch(request: Request): Promise<Response> {
  const getSession = once(() => auth.api.getSession({ headers: request.headers }))

  const { matched, response } = await handler.handle(request, {
    prefix: '/rpc',
    context: { getSession },
  })

  return matched ? response : new Response('Not Found', { status: 404 })
}
```
