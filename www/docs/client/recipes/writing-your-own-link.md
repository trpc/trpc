---
title: Writing your own Link
sidebar_label: Writing your own Link
---

Custom links are ideal when you need cross-cutting behavior that built-in links don't provide (routing, retries with custom policy, telemetry, custom auth flows).

Every link returns an observable. This lets you intercept responses and still preserve cancellation and streaming semantics.

## When to write a custom link

Reach for a custom link when built-in links cannot express your behavior clearly, for example:

- Operation-aware routing (multi-backend dispatch)
- Organization-specific telemetry/tracing envelopes
- Custom retry or circuit-breaker logic
- App-specific request metadata propagation

If a built-in link already solves it, prefer composition before custom code.

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

## Design guidelines

- Keep each link focused on one responsibility.
- Put non-terminating links before your terminating transport link.
- Avoid mutating unrelated operation fields; prefer adding to `op.context`.
- Always return a cleanup function to preserve cancellation behavior.

## Debugging checklist

- Confirm link order in the `links` array.
- Verify that your link forwards all events (`next`, `error`, `complete`).
- Add operation IDs/timestamps to logs to trace request lifecycles.

## References

- [Links overview](../links/overview.md)
- [Built-in link implementations](https://github.com/trpc/trpc/tree/main/packages/client/src/links)
