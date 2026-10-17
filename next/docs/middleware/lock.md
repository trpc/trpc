---
title: Locks
description: experimental_lock() runs calls with the same key one at a time, across instances.
section: Middleware
order: 3
---

`experimental_lock()` runs the rest of the call under a lock, so calls with the same key never overlap: the second waits for the first, and fails with `experimental_LockConflict` (`CONFLICT`, 409) if `timeout` (10 seconds) passes first. The resolver gets `ctx.lock.waited`.

```ts
import { NodeRedis } from '@effect/platform-node';
import {
  experimental_lock,
  experimental_redisLocker,
} from '@trpc12/trpc/middleware';

const pay = t.procedure
  .input(z.object({ invoice: z.string() }))
  .use(
    experimental_lock<{ input: { invoice: string } }>({
      key: ({ input }) => `invoice:${input.invoice}`,
    }),
  )
  .mutation(({ input, ctx }) =>
    charge(input.invoice, { retried: ctx.lock.waited }),
  );

createFetchHandler({
  router,
  layer: experimental_redisLocker().pipe(
    Layer.provide(NodeRedis.layer({ url: process.env.REDIS_URL })),
  ),
});
```

A holder loses the lock after `ttl` (30 seconds), so a crashed instance can't hold it forever. A key the call already holds, from an earlier `experimental_lock()` in its chain, isn't taken twice. The lock covers the resolver; a streamed output or a subscription keeps running after it's released.

## Lockers

The locker is an Effect service, `experimental_Locker`, provided as a layer:

- `experimental_memoryLocker()` for one process.
- `experimental_redisLocker()` over Effect's `Redis` for many. Any Redis Effect's `Redis.make({ send, subscribe })` can wrap works, Upstash's REST client included.
- [`experimental_durableLocker()`](../adapters/durable-objects.md#locks) on Workers.

Outside a procedure, take a lock with the service: `yield* (yield* experimental_Locker).acquire(key)` holds it until the surrounding `Effect.scoped` ends.
