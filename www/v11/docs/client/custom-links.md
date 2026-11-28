---
id: custom-links
title: Custom links
description: Write a link of your own, and declare the call options it reads
slug: /client/custom-links
section: "Client Usage"
parent: "client/links"
order: 40
---

A link is a function that follows the `TRPCLink` type. Each link is composed of three parts:

1. The link returns a function that has no parameters. This is the setup phase where the link is initialized — it happens once per app and is useful for storing caches or other state.
2. The function in step 1 returns another function that receives an object with two properties: `op` which is the `Operation` that is being executed by the client, and `next` which is the function we use to call the next link down the chain.
3. The function in step 2 returns a final function that returns the `observable` function provided by `@trpc/server`. The `observable` accepts a function that receives an `observer` which helps our link notify the next link up the chain how they should handle the operation result. In this function, we can just return `next(op)` and leave it as is, or we can subscribe to `next`, which enables our link to handle the operation result.

## Example

```tsx twoslash title='utils/customLink.ts'
// @filename: server.ts
import { initTRPC } from '@trpc/server';
const t = initTRPC.create();
export const appRouter = t.router({});
export type AppRouter = typeof appRouter;

// @filename: customLink.ts
// ---cut---
import { TRPCLink } from '@trpc/client';
import { observable } from '@trpc/server/observable';
import type { AppRouter } from './server';

export const customLink: TRPCLink<AppRouter> = () => {
  // here we just got initialized in the app - this happens once per app
  // useful for storing cache for instance
  return ({ next, op }) => {
    // this is when passing the result to the next link

    // each link needs to return an observable which propagates results
    return observable((observer) => {
      console.log('performing operation:', op);
      const unsubscribe = next(op).subscribe({
        next(value) {
          console.log('we received value', value);
          observer.next(value);
        },
        error(err) {
          console.log('we received error', err);
          observer.error(err);
        },
        complete() {
          observer.complete();
        },
      });

      return unsubscribe;
    });
  };
};
```

## References

If you need a more real reference for creating your custom link, you can check out some of the built-in links tRPC provides on [GitHub](https://github.com/trpc/trpc/tree/main/packages/client/src/links).

## Typing call options

Create the client with `router: routerType<AppRouter>()` and the `context` each call takes is typed from the links. A link declares what it reads with the second type argument of `TRPCLink`. Built-in links declare theirs: [`retryLink`](./links/retryLink.md#changing-retries-for-one-call) reads `retry`.

```ts twoslash
// @filename: server.ts
import { initTRPC } from '@trpc/server';
const t = initTRPC.create();
export const appRouter = t.router({
  greeting: t.procedure.query(() => 'hello'),
});
export type AppRouter = typeof appRouter;

// @filename: client.ts
// ---cut---
import type { TRPCLink } from '@trpc/client';
import { createTRPCClient, httpBatchLink, routerType } from '@trpc/client';
import type { AppRouter } from './server';

const traceLink: TRPCLink<AppRouter, { context: { traceId?: string } }> =
  () =>
  ({ op, next }) => {
    console.log(op.context.traceId);
    return next(op);
  };

const client = createTRPCClient({
  router: routerType<AppRouter>(),
  links: [traceLink, httpBatchLink({ url: 'http://localhost:3000' })],
});

await client.greeting.query(undefined, { context: { traceId: 'abc' } });
// @errors: 2322
await client.greeting.query(undefined, { context: { traceId: 123 } });
```

- Declared fields are type-checked, and always optional.
- A link that declares nothing, such as `TRPCLink<AppRouter>`, may read any field, so calls can pass any `context`. Declare `{ context: {} }` for a link that reads none. When every link reads none, passing a field is an error.
- Links that hand the operation to your code, such as the HTTP links' `headers` or `retryLink`'s `retry`, declare only the fields added to `OperationContext`.

To pass a field that such a callback reads, add it to `OperationContext`:

```ts twoslash
// @filename: server.ts
import { initTRPC } from '@trpc/server';
const t = initTRPC.create();
export const appRouter = t.router({
  greeting: t.procedure.query(() => 'hello'),
});
export type AppRouter = typeof appRouter;

// @filename: client.ts
// ---cut---
import { createTRPCClient, httpBatchLink, routerType } from '@trpc/client';
import type { AppRouter } from './server';

declare module '@trpc/client' {
  interface OperationContext {
    token?: string;
  }
}

const client = createTRPCClient({
  router: routerType<AppRouter>(),
  links: [
    httpBatchLink({
      url: 'http://localhost:3000',
      headers: ({ opList }) => ({
        authorization: opList[0].context.token ?? '',
      }),
    }),
  ],
});

await client.greeting.query(undefined, { context: { token: 'abc' } });
```
