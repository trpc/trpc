---
title: Making your own Client
sidebar_label: Making your own Client
---

If your framework expects an observable-first API (for example Angular-style service layers), you can keep tRPC's transport and types, and expose your own client surface.

The key is to call tRPC with an untyped client internally and wrap calls in your own observable abstraction.

```ts twoslash
// @filename: server.ts
import { initTRPC } from '@trpc/server';
const t = initTRPC.create();
export const appRouter = t.router({});
export type AppRouter = typeof appRouter;

// @filename: client.ts
// ---cut---
import { createTRPCUntypedClient, httpBatchLink } from '@trpc/client';
import { observable } from '@trpc/server/observable';
import type { AppRouter } from './server';

const untypedClient = createTRPCUntypedClient<AppRouter>({
  links: [httpBatchLink({ url: 'http://localhost:3000/trpc' })],
});

export function query$(path: string, input: unknown) {
  return observable<unknown>((observer) => {
    untypedClient
      .query(path, input)
      .then((data) => {
        observer.next(data);
        observer.complete();
      })
      .catch((error: Error) => {
        observer.error(error);
      });

    return () => {
      // hook cancellation into your framework if needed
    };
  });
}
```

From here, map `query$` / `mutation$` into your framework's preferred primitives and inject it where needed.
