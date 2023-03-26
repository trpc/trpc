---
id: middlewares
title: Middlewares
sidebar_label: Middlewares
slug: /server/middlewares
---

You are able to add middleware(s) to a procedure with the `t.procedure.use()` method. The middleware(s) will wrap the invocation of the procedure and must pass through its return value.

## Authorization

In the example below, any call to a `adminProcedure` will ensure that the user is an "admin" before executing.

```twoslash include admin
import { TRPCError, initTRPC } from '@trpc/server';

interface Context {
  user?: {
    id: string;
    isAdmin: boolean;
    // [..]
  };
}

const t = initTRPC.context<Context>().create();
export const middleware = t.middleware;
export const publicProcedure = t.procedure;
export const router = t.router;

const isAdmin = middleware(async ({ ctx, next }) => {
  if (!ctx.user?.isAdmin) {
    throw new TRPCError({ code: 'UNAUTHORIZED' });
  }
  return next({
    ctx: {
      user: ctx.user,
    },
  });
});

export const adminProcedure = publicProcedure.use(isAdmin);
```

```ts twoslash
// @include: admin
```

```ts twoslash
// @filename: trpc.ts
// @include: admin
// @filename: _app.ts
// ---cut---
import { adminProcedure, publicProcedure, router } from './trpc';

const adminRouter = router({
  secretPlace: adminProcedure.query(() => 'a key'),
});

export const appRouter = router({
  foo: publicProcedure.query(() => 'bar'),
  admin: adminRouter,
});
```

:::tip
See [Error Handling](error-handling.md) to learn more about the `TRPCError` thrown in the above example.
:::

## Logging

In the example below timings for queries are logged automatically.

```twoslash include trpclogger
import { initTRPC } from '@trpc/server';
const t = initTRPC.create();

export const middleware = t.middleware;
export const publicProcedure = t.procedure;
export const router = t.router;

declare function logMock(...args: any[]): void;
// ---cut---
const loggerMiddleware = middleware(async ({ path, type, next }) => {
  const start = Date.now();
  const result = await next();
  const durationMs = Date.now() - start;
  result.ok
    ? logMock('OK request timing:', { path, type, durationMs })
    : logMock('Non-OK request timing', { path, type, durationMs });

  return result;
});

export const loggedProcedure = publicProcedure.use(loggerMiddleware);
```

```ts twoslash
// @include: trpclogger
```

```ts twoslash
// @filename: trpc.ts
// @include: trpclogger
// @filename: _app.ts
// ---cut---
import { loggedProcedure, router } from './trpc';

export const appRouter = router({
  foo: loggedProcedure.query(() => 'bar'),
  abc: loggedProcedure.query(() => 'def'),
});
```

## Context Swapping

Context swapping in tRPC is a very powerful feature that allows you to create base procedures that dynamically infers new context in a flexible and typesafe manner.

Below we have an example of a middleware that changes properties of the context, and procedures will receive the new context value:

```ts twoslash
// @target: esnext
import { TRPCError, initTRPC } from '@trpc/server';

const t = initTRPC.context<Context>().create();
const publicProcedure = t.procedure;
const router = t.router;
const middleware = t.middleware;

// ---cut---

type Context = {
  // user is nullable
  user?: {
    id: string;
  };
};

const isAuthed = middleware(({ ctx, next }) => {
  // `ctx.user` is nullable
  if (!ctx.user) {
    //     ^?
    throw new TRPCError({ code: 'UNAUTHORIZED' });
  }

  return next({
    ctx: {
      // ✅ user value is known to be non-null now
      user: ctx.user,
      // ^?
    },
  });
});

const protectedProcedure = publicProcedure.use(isAuthed);
protectedProcedure.query(({ ctx }) => ctx.user);
//                                        ^?
```

## Extending middlewares

:::info
We have prefixed this as `unstable_` as it's a new API, but you're safe to use it! [Read more](/docs/faq#unstable).
:::

We have a powerful feature called `.pipe()` which allows you to extend middlewares in a typesafe manner.

Below we have an example of a middleware that extends a base middleware(foo). Like the context swapping example above, piping middlewares will change properties of the context, and procedures will receive the new context value.

```ts twoslash
// @target: esnext
import { TRPCError, initTRPC } from '@trpc/server';

const t = initTRPC.create();
const publicProcedure = t.procedure;
const router = t.router;
const middleware = t.middleware;

// ---cut---

const fooMiddleware = middleware(({ next }) => {
  return next({
    ctx: {
      foo: 'foo' as const,
    },
  });
});

const barMiddleware = fooMiddleware.unstable_pipe(({ ctx, next }) => {
  ctx.foo;
  //   ^?
  return next({
    ctx: {
      bar: 'bar' as const,
    },
  });
});

const barProcedure = publicProcedure.use(barMiddleware);
barProcedure.query(({ ctx }) => ctx.bar);
//                              ^?
```

Beware that the order in which you pipe your middlewares matter and that the context must overlap. An example of a forbidden pipe is shown below. Here, the `fooMiddleware` overrides the `ctx.a` while `barMiddleware` still expects the root context from the initialization in `initTRPC` - so piping `fooMiddleware` with `barMiddleware` would not work, while piping `barMiddleware` with `fooMiddleware` does work.

```ts twoslash
import { initTRPC } from '@trpc/server';

const t = initTRPC
  .context<{
    a: {
      b: 'a';
    };
  }>()
  .create();

const fooMiddleware = t.middleware(({ ctx, next }) => {
  ctx.a; // 👈 fooMiddleware expects `ctx.a` to be an object
  //  ^?
  return next({
    ctx: {
      a: 'a' as const, // 👈 `ctx.a` is no longer an object
    },
  });
});

const barMiddleware = t.middleware(({ ctx, next }) => {
  ctx.a; // 👈 barMiddleware expects `ctx.a` to be an object
  //  ^?
  return next({
    ctx: {
      foo: 'foo' as const,
    },
  });
});

// @errors: 2345
// ❌ `ctx.a` does not overlap from `fooMiddleware` to `barMiddleware`
fooMiddleware.unstable_pipe(barMiddleware);

// ✅ `ctx.a` overlaps from `barMiddleware` and `fooMiddleware`
barMiddleware.unstable_pipe(fooMiddleware);
```
