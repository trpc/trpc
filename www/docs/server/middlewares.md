---
id: middlewares
title: Middlewares
sidebar_label: Middlewares
slug: /middlewares
---


You are able to add middleware(s) to a whole router with the `middleware()` method. The middleware(s) will wrap the invocation of the procedure and must pass through its return value.

## Examples

### Authorization

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
          resolverMock();

          return 'a key';
        },
      }),
  )
```

:::tip
See [Error Handling](error-handling.md) to learn more about the `TRPCError` thrown in the above example.
:::

### Logging

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
