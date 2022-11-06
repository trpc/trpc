---
id: middlewares
title: Middlewares
sidebar_label: Middlewares
slug: /middlewares
---

You are able to add middleware(s) to a procedure with the `t.procedure.use()` method. The middleware(s) will wrap the invocation of the procedure and must pass through its return value.

## Authorization

In the example below any call to a `protectedProcedure` will ensure that the user is an "admin" before executing.

```ts
import { initTRPC } from '@trpc/server';

interface Context {
  user?: {
    id: string;
    isAdmin: boolean;
    // [..]
  };
}

export const t = initTRPC.context<Context>().create();

const isAdmin = t.middleware(async ({ ctx, next }) => {
  if (!ctx.user?.isAdmin) {
    throw new TRPCError({ code: 'UNAUTHORIZED' });
  }
  return next({
    ctx: {
      user: ctx.user,
    }
  });
});

const adminProcedure = t.procedure.use(isAdmin);

const adminRouter = t.router({
  secretPlace: adminProcedure.query(() => 'a key'),
});

export const appRouter = t.router({
  foo: t.procedure.query(() => 'bar'),
  admin: adminRouter,
});
```

:::tip
See [Error Handling](error-handling.md) to learn more about the `TRPCError` thrown in the above example.
:::

## Logging

In the example below timings for queries are logged automatically.

```ts
import { initTRPC } from '@trpc/server';

export const t = initTRPC.context<Context>().create();

const logger = t.middleware(async ({ path, type, next }) => {
  const start = Date.now();
  const result = await next();
  const durationMs = Date.now() - start;
  result.ok
    ? logMock('OK request timing:', { path, type, durationMs })
    : logMock('Non-OK request timing', { path, type, durationMs });

  return result;
});

const loggedProcedure = t.procedure.use(logger);

export const appRouter = t.router({
  foo: loggedProcedure.query(() => 'bar'),
  abc: loggedProcedure.query(() => 'def'),
});
```

## Context Swapping

A middleware can change properties of the context, and procedures will receive the new context value:

```ts twoslash
// @target: esnext
import { initTRPC, TRPCError } from '@trpc/server';


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
}

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

export const appRouter = router({
  userId: protectedProcedure.query(({ ctx }) => ctx.user.id),
  //                                                 ^?
});
```



<!-- Commented out this section as I don't think it's needed anymore now that we can have multiple input parsers -->
<!--


## Raw input

A middleware can access the raw input that will be passed to a procedure. This can be used for authentication / other preprocessing in the middleware that requires access to the procedure input, and can be especially useful when used in conjunction with Context Swapping.

:::caution
The `rawInput` passed to a middleware has not yet been validated by a procedure's `input` schema / validator, so be careful when using it! Because of this, `rawInput` has type `unknown`. For more info see [#1059](https://github.com/trpc/trpc/pull/1059#issuecomment-932985023).
:::

```ts
import { initTRPC } from '@trpc/server';

export const t = initTRPC.create();

const inputSchema = z.object({ userId: z.string() });

const isUserIdChecked = t.middleware(async ({ next, rawInput, ctx }) => {
  const result = inputSchema.safeParse(rawInput);
  if (!result.success) {
    throw new TRPCError({ code: 'BAD_REQUEST' });
  }
  const { userId } = result.data;
  // Check user id auth
  return next({
    ctx: { 
      userId,
    },
  });
});

export const userProtectedProcedure = t.procedure.use(isUserIdChecked);

export const appRouter = t.router({
  userId: userProtectedProcedure
    .input(inputSchema)
    .query(({ ctx }) => ctx.userId),
});
```

-->