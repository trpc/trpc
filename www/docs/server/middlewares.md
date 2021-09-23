---
id: middlewares
title: Middlewares
sidebar_label: Middlewares
slug: /middlewares
---


You are able to add middleware(s) to a whole router with the `middleware()` method. The middleware(s) will wrap the invocation of the procedure and must pass through its return value.

## Authorization

In the example below any call to `admin.*` will ensure that the user is an "admin" before executing any query or mutation.


```ts
trpc
  .router<Context>()
  .query('foo', {
    resolve() {
      return 'bar';
    },
  })
  .merge(
    'admin.',
    trpc
      .router<Context>()
      .middleware(async ({ ctx, next }) => {
        if (!ctx.user?.isAdmin) {
          throw new TRPCError({ code: "UNAUTHORIZED" });
        }
        return next()
      })
      .query('secretPlace', {
        resolve() {
          return 'a key';
        },
      }),
  )
```

:::tip
See [Error Handling](error-handling.md) to learn more about the `TRPCError` thrown in the above example.
:::

## Logging

In the example below timings for queries are logged automatically.

```ts
trpc
  .router<Context>()
  .middleware(async ({ path, type, next }) => {
    const start = Date.now();
    const result = await next();
    const durationMs = Date.now() - start;
    result.ok
      ? logMock('OK request timing:', { path, type, durationMs })
      : logMock('Non-OK request timing', { path, type, durationMs });

    return result;
  })
  .query('foo', {
    resolve() {
      return 'bar';
    },
  })
  .query('abc', {
    resolve() {
      return 'def';
    },
  })
```

## Context Swapping

A middleware can replace the router's context, and downstream procedures will receive the new context value:

```ts
interface Context {
  // user is nullable
  user?: {
    id: string
  }
}

trpc
  .router<Context>()
  .middleware(({ ctx, next }) => {
    if (!ctx.user) {
      throw new TRPCError({ code: 'UNAUTHORIZED' });
    }

    return next({
      ctx: {
        ...ctx,
        user: ctx.user, // user value is known to be non-null now
      },
    });
  })
  .query('userId', {
    async resolve({ctx}) {
      return ctx.user.id;
    }
  });
```

### `createProtectedRouter()`-helper

This helper can be used anywhere in your app tree to enforce downstream procedures to be authorized.

```tsx
import * as trpc from "@trpc/server";
import { Context } from "./context";

export function createProtectedRouter() {
  return trpc
    .router<Context>()
    .middleware(({ ctx, next }) => {
      if (!ctx.user) {
        throw new trpc.TRPCError({ code: "UNAUTHORIZED" });
      }
      return next({
        ctx: {
          ...ctx,
          // infers that `user` is non-nullable to downstream procedures
          user: ctx.user,
        },
      });
    });
}
```
