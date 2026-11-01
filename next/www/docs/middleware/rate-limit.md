---
title: Rate limiting
description: "`experimental_rateLimit()` counts calls with Effect's `RateLimiter`, in memory, Redis, Upstash or Durable Objects, and sets the `RateLimit` headers."
section: Middleware
order: 2
experiment: middleware
---

`experimental_rateLimit()` counts calls with Effect's `RateLimiter` (`effect/persistence`). The store is a layer on the handler: `layerStoreMemory` for one instance, `layerStoreRedis` for many.

```ts
import { RateLimiter } from 'effect/persistence';
import { experimental_rateLimit } from '@trpc12/trpc/middleware';

const login = t.procedure
  .use(
    experimental_rateLimit<{ ctx: { ip: string } }>({
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

Past the limit it fails with `experimental_RateLimited` (`TOO_MANY_REQUESTS`, 429, `data: { limit, retryAfter }` in milliseconds), and it sets `RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset` and `Retry-After`. `onExceeded: 'delay'` waits for capacity instead.

## Stores

The store is Effect's `RateLimiterStore`, under `RateLimiter.layer`. A store that fails (the network, the database) is a defect: the call fails with a masked 500, not the caller's 429.

| Store                                           | From                      | Counts across                   |
| ----------------------------------------------- | ------------------------- | ------------------------------- |
| `RateLimiter.layerStoreMemory`                  | `effect/persistence`      | one process                     |
| `RateLimiter.layerStoreRedis()`                 | `effect/persistence`      | everything sharing the Redis    |
| `experimental_upstashRateLimiterStore()`        | `@trpc12/trpc/middleware` | everything sharing the database |
| `experimental_durableRateLimiterStore(binding)` | `@trpc12/trpc/cloudflare` | every Worker instance           |

`layerStoreRedis()` needs Effect's `Redis` service, e.g. `NodeRedis.layer({ url })` from `@effect/platform-node`.

### Upstash

`experimental_upstashRateLimiterStore({ url, token })` is Effect's Redis store over Upstash's REST API, so it runs where TCP doesn't (Workers, edge functions). Each call is one `fetch`, two the first time a Lua script runs. `experimental_upstashRedis({ url, token })` is the `Redis` service underneath, for anything else built on it (`experimental_redisLocker()`); its `subscribe` fails, since Upstash's REST API has no pub/sub.

```ts twoslash
// ---cut-start---
import { createFetchHandler, initTrpc } from '@trpc12/trpc/server';
const t = initTrpc();
const router = t.router({ health: t.procedure.query(() => 'ok') });
declare const env: {
  UPSTASH_REDIS_REST_URL: string;
  UPSTASH_REDIS_REST_TOKEN: string;
};
// ---cut-end---
import { Layer } from 'effect';
import { RateLimiter } from 'effect/persistence';
import { experimental_upstashRateLimiterStore } from '@trpc12/trpc/middleware';

createFetchHandler({
  router,
  layer: RateLimiter.layer.pipe(
    Layer.provide(
      experimental_upstashRateLimiterStore({
        url: env.UPSTASH_REDIS_REST_URL,
        token: env.UPSTASH_REDIS_REST_TOKEN,
      }),
    ),
  ),
});
```

### Cloudflare

`experimental_durableRateLimiterStore(env.RATE_LIMITS)` counts each key in its own Durable Object, with the object's clock and storage, so a limit holds across Worker instances and evictions, and each call can pass its own `limit`, `window` and algorithm. It's one subrequest per call. The object delegates to `experimental_durableRateLimitObject(this.ctx)`, whose alarm deletes the counters once they expire ([Cloudflare](../adapters/cloudflare.md#rate-limits)).

Cloudflare's Rate Limiting binding (`env.LIMITER.limit({ key })`) isn't a store. Its limit and period (10 or 60 seconds) are fixed in `wrangler.jsonc`, it counts per Cloudflare location and settles eventually, and it answers only `{ success }`. So it can't take `experimental_rateLimit()`'s `limit` and `window`, run a token bucket, or fill in `RateLimit-Remaining` and `Retry-After`. To use it, call it from your own middleware and fail with `experimental_RateLimited`.

## On the client

`experimental_RateLimited` is a typed error, so the client narrows on its code. `retryLink({ retry, delay })` gets the error, so it can wait `error.data.retryAfter` ([`retryLink`](../client/links/retry.md#waiting-out-a-rate-limit)).

## Credits

`experimental_rateLimit()` follows [oRPC's rate limit helpers](https://orpc.dev/docs/helpers/ratelimit).
