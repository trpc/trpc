---
id: middlewares
title: Middlewares
sidebar_label: Middlewares
slug: /middlewares
---


You are able to add middleware(s) to a whole router with the `middleware()` method. The middleware(s) will be run before any of the procedures are invoked & can be async or sync.



## Example


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
        next()
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
