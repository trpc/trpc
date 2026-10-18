---
title: Rate limiting
description: rateLimit() counts calls with Effect's RateLimiter, in memory or in Redis, and sets the RateLimit headers.
section: Middleware
order: 2
hidden: true
---

`rateLimit()` counts calls with Effect's `RateLimiter` (`effect/persistence`). The store is a layer on the handler: `layerStoreMemory` for one instance, `layerStoreRedis` for many.

```ts
import { RateLimiter } from 'effect/persistence';
import { rateLimit } from '@trpc12/trpc/middleware';

const login = t.procedure
  .use(
    rateLimit<{ ctx: { ip: string } }>({
      key: (opts) => `login:${opts.ctx.ip}`,
      limit: 5,
      window: '1 minute',
    }),
  )
  .mutation(/* … */);

createFetchHandler({
  router,
  layer: RateLimiter.layer.pipe(Layer.provide(RateLimiter.layerStoreMemory)),
});
```

Past the limit it fails with `RateLimited` (`TOO_MANY_REQUESTS`, 429, `data: { limit, retryAfter }` in milliseconds), and it sets `RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset` and `Retry-After`. `onExceeded: 'delay'` waits for capacity instead.

## On the client

`RateLimited` is a typed error, so the client narrows on its code. `retryLink({ retry, delayMs })` gets the error, so it can wait `error.data.retryAfter` ([retryLink](../client/links/retry.md#waiting-out-a-rate-limit)).

## Credits

`rateLimit()` follows [oRPC's rate limit helpers](https://orpc.dev/docs/helpers/ratelimit).
