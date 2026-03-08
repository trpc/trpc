---
title: Writing your own Link
sidebar_label: Writing your own Link
---

Custom links are ideal when you need cross-cutting behavior that built-in links don't provide (routing, retries with custom policy, telemetry, custom auth flows).

Every link returns an observable. This lets you intercept responses and still preserve cancellation and streaming semantics.

```ts twoslash
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

export const timingLink: TRPCLink<AppRouter> = () => {
  return ({ op, next }) => {
    const startedAt = Date.now();

    return observable((observer) => {
      const subscription = next(op).subscribe({
        next(value) {
          observer.next(value);
        },
        error(error) {
          observer.error(error);
        },
        complete() {
          console.log(`${op.path} finished in ${Date.now() - startedAt}ms`);
          observer.complete();
        },
      });

      return () => {
        subscription.unsubscribe();
      };
    });
  };
};
```

For more internals and link composition details, see [Links Overview](../links/overview.md).
