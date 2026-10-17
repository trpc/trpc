---
title: Middleware
description: Base procedures that add to the context, replace the input or short-circuit a call.
section: Server
order: 3
---

Middleware runs before a procedure's resolver. `.use()` adds one to a procedure builder, and the builder becomes a base procedure to share:

```ts twoslash
// ---cut-start---
import { t } from './server.ts';
// ---cut-end---
import { error } from '@trpc12/trpc/server';

const authed = t.procedure.use((opts) =>
  opts.ctx.user
    ? opts.next({ ctx: { user: opts.ctx.user } })
    : error({ code: 'UNAUTHORIZED' }),
);

const me = authed.query((opts) => opts.ctx.user);
//                                         ^?
```

`next({ ctx })` adds to the ctx; `ok(value)` short-circuits with a result. An `error()` returned from a middleware joins the procedure's typed errors ([Errors](./errors.md)).

Middleware is per procedure: build base procedures and share them. Routers take none. `t.middleware(fn)` types a middleware once for reuse.

## Replacing the input

`next({ input })` replaces the input for the steps after it, and the resolver's `input` takes its type:

```ts twoslash
// ---cut-start---
import { db, t } from './server.ts';
// ---cut-end---
import { z } from 'zod';

const byId = t.procedure
  .input(z.object({ id: z.string() }))
  .use(async (opts) =>
    opts.next({ input: { post: db.post.find(opts.input.id) } }),
  )
  .query((opts) => opts.input.post?.title);
//                           ^?
```

The client still sends the schema's input. A later `.input()` parses the raw call input again, merged over the replaced one when both are objects.

## Middleware for packages

`middleware<{ ctx }>()(fn)` (and `middleware.effect`) declares one outside any `t`, typed by the ctx it needs, for a package to publish. Used on a procedure that lacks a key it needs, the key becomes a requirement of the procedure's ctx, the way an Effect requirement moves to whoever runs it: the handler's `createContext` (or an in-process caller's `ctx`) must supply it. A key the procedure has with another type is a type error.

```ts
const withTenant = middleware<{ ctx: { tenant: string } }>()(({ ctx, next }) =>
  next({ ctx: { db: dbFor(ctx.tenant) } }),
);
const router = {
  posts: t.procedure.use(withTenant).query(({ ctx }) => ctx.db.posts()),
};
createFetchHandler({
  router,
  createContext: ({ request }) => ({ tenant: tenantOf(request) }),
});
```

`.concat(plugin)` stays strict: a plugin builder's ctx must already be there.

## Running once

When the plugin starts with the same middleware as the builder (the same function, in the same order), `.concat()` runs it once, on a builder or on `t`. Elsewhere, middleware applied twice runs twice. For work that should happen once per request, an Effect service in the handler's `layer` is built once, and a middleware can reuse what ctx already has, so nested `call(other, input, { ctx })`s skip it:

```ts
const withDb = middleware<{ ctx: { db?: Db } }>()(async ({ ctx, next }) =>
  next({ ctx: { db: ctx.db ?? (await connect()) } }),
);
```

## Effect middleware

`t.middleware.effect<{ provides: S }>()(fn)` writes a middleware whose `next()` is an `Effect`, so it can provide services ([Effect](./effect.md#middleware-that-provides-services)).

## Built-in middleware

`@trpc12/trpc/middleware` has ordinary middleware for common jobs:

- [Lifecycle hooks](../middleware/lifecycle.md): `onStart`, `onSuccess`, `onError`, `onFinish`.
- [Rate limiting](../middleware/rate-limit.md): `rateLimit()`.
- [Locks](../middleware/lock.md): `experimental_lock()`.
- [Durable calls](../middleware/durable.md): `experimental_durable()`.

To add middleware, ctx, meta and errors to every procedure of an app from a package, see [Extensions](./extensions.md).
