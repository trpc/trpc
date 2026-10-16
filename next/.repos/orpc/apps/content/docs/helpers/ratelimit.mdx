---
title: "Rate Limit Helpers"
description: "Add rate limiting to oRPC with a unified RateLimiter interface, storage adapters, procedure middleware, and a handler plugin for HTTP headers."
sidebar:
  label: "Rate Limit"
---

## Installation

```package-install
npm install @orpc/ratelimit@beta
```

## Basic Usage

The core concept is the `RateLimiter` interface, which defines a standard way to check and enforce rate limits. You can create your own custom limiter or use one of the provided [adapters](#adapters):

| Name                                   | Blocking Mode | Adapter for                                                                                               |
| -------------------------------------- | ------------- | --------------------------------------------------------------------------------------------------------- |
| [`MemoryRateLimiter`](#memory)         | ✅            | In-memory storage                                                                                         |
| [`RedisRateLimiter`](#redis)           | ✅            | [Redis](https://github.com/redis/redis)                                                                   |
| [`UpstashRateLimiter`](#upstash)       | ✅            | [Upstash Rate Limit](https://www.npmjs.com/package/@upstash/ratelimit)                                    |
| [`BunRedisRateLimiter`](#bun-redis)    | ✅            | [Bun's Redis](https://bun.com/docs/runtime/redis)                                                         |
| [`CloudflareRateLimiter`](#cloudflare) | ❌            | [Cloudflare's Rate Limiting](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/) |

The `limit` method accepts a key and an optional `weight` value, which defaults to `1`, so a single request can consume multiple points.

```ts twoslash
import { MemoryRateLimiter } from '@orpc/ratelimit/memory'
// ---cut---
import { ORPCError } from '@orpc/server'

const limiter = new MemoryRateLimiter({
  maxRequests: 5,
  window: 60000,
})

const result = await limiter.limit('user:123', { weight: 2 })

if (!result.success) {
  throw new ORPCError('TOO_MANY_REQUESTS', {
    data: {
      limit: result.limit,
      remaining: result.remaining,
      reset: result.reset,
    },
  })
}
```

### Blocking Mode

Some adapters support blocking mode, which waits until capacity becomes available instead of rejecting requests immediately.

```ts
const limiter = new MemoryRateLimiter({
  maxRequests: 10,
  window: 60000,
  blockingUntilReady: {
    enabled: true, // Disabled by default
    timeout: 5000, // Wait up to 5 seconds
  },
})
```

## Ratelimit Middleware

The `ratelimit` helper creates middleware that enforces rate limits for [procedures](/docs/procedure).

```ts
import { ratelimit, RateLimiter } from '@orpc/ratelimit'

const procedure = os
  .$context<{ ratelimiter: RateLimiter }>()
  .input(z.object({ email: z.email() }))
  .use(
    ratelimit({
      limiter: ({ context }) => context.ratelimiter,
      key: ({ context }, input) => `login:${input.email}`,
      weight: 1, // Optional weight for each request, default is 1
    }),
  )
  .handler(({ input }) => {
    return { success: true }
  })

const ratelimiter = new MemoryRateLimiter({
  maxRequests: 10,
  window: 60000,
})

const result = await call(
  procedure,
  { email: 'user@example.com' },
  { context: { ratelimiter } }
)
```

:::info[Automatic Deduplication]
When the same `limiter` and `key` combination is used multiple times in a single request chain, the `ratelimit` middleware performs the rate limit check only once. This behavior follows the [Dedupe Middleware](/docs/recipes/dedupe-middleware) recipe. To disable deduplication, set `dedupe: false`.
:::

:::tip[Conditional Limiter]
You can choose different limiters dynamically based on the request context:

```ts
const premiumLimiter = new MemoryRateLimiter({
  maxRequests: 100,
  window: 60000,
})

const standardLimiter = new MemoryRateLimiter({
  maxRequests: 10,
  window: 60000,
})

const result = await call(
  procedure,
  { email: 'user@example.com' },
  {
    context: {
      ratelimiter: isPremiumUser ? premiumLimiter : standardLimiter,
    },
  },
)
```

:::

## Handler Plugin

The `RateLimitHandlerPlugin` automatically adds HTTP rate limiting headers (`RateLimit-*` and `Retry-After`) to responses when used with [Ratelimit Middleware](#ratelimit-middleware). This lets clients inspect the current limit state and know when they can retry after hitting a limit.

```ts
import { RateLimitHandlerPlugin } from '@orpc/ratelimit'

const handler = new RPCHandler(router, {
  plugins: [
    new RateLimitHandlerPlugin(),
  ],
})
```

:::info
You can combine this plugin with [Retry After Plugin](/docs/plugins/retry-after) to enable automatic client-side retries based on server rate limiting headers.
:::

:::info
The `handler` can be any supported oRPC handler, such as [RPCHandler](/docs/rpc/handler), [OpenAPIHandler](/docs/openapi/handler), or a custom one.
:::

## Adapters

### Memory

Keeps counters in the memory of the current process, so limits are not shared between instances. A good fit for development, tests, and single-process servers.

```ts
import { MemoryRateLimiter } from '@orpc/ratelimit/memory'

const limiter = new MemoryRateLimiter({
  /**
   * Maximum number of requests allowed within the window.
   */
  maxRequests: 10,

  /**
   * The duration of the fixed window in milliseconds.
   */
  window: 60000,

  blockingUntilReady: {
    /**
     * Block until the request may pass or timeout is reached.
     *
     * @default false
     */
    enabled: false,

    /**
     * milliseconds
     */
    timeout: 5000
  },
})
```

### Redis

Stores counters in Redis, so every instance using the same server enforces the same limits.

```ts
import { RedisRateLimiter } from '@orpc/ratelimit/redis'
import { createClient } from 'redis'

const client = createClient({ url: 'redis://localhost:6379' })

// RedisRateLimiter lazily connects to Redis when needed.
// You can still call `client.connect()` manually, but it is optional.
await client.connect()

const limiter = new RedisRateLimiter(client, {
  /**
   * The prefix to use for Redis keys.
   *
   * @default ''
   */
  prefix: '',

  /**
   * Maximum number of requests allowed within the window.
   */
  maxRequests: 10,

  /**
   * The duration of the fixed window in milliseconds.
   */
  window: 60000,

  blockingUntilReady: {
    /**
     * Block until the request may pass or timeout is reached.
     *
     * @default false
     */
    enabled: false,

    /**
     * milliseconds
     */
    timeout: 5000
  },
})
```

### Upstash

Delegates to an `@upstash/ratelimit` instance, so the algorithm and limits are configured there. A good fit for serverless and edge runtimes.

````ts
import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'
import { UpstashRateLimiter } from '@orpc/ratelimit/upstash'

const redis = Redis.fromEnv()
const ratelimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(10, '60 s'),
  prefix: 'orpc:', // Optional key prefix
})

const limiter = new UpstashRateLimiter(ratelimit, {
  blockingUntilReady: {
    /**
     * Block until the request may pass or timeout is reached.
     *
     * @default false
     */
    enabled: false,

    /**
     * milliseconds
     */
    timeout: 5000
  },

  /**
   * For the MultiRegion setup we do some synchronizing in the background, after returning the current limit.
   * Or when analytics is enabled, we send the analytics asynchronously after returning the limit.
   * In most case you can simply ignore this.
   *
   * On Vercel Edge or Cloudflare workers, you might need `.bind` before assign:
   * ```ts
   * const ratelimiter = new UpstashRateLimiter(ratelimit, {
   *   waitUntil: ctx.waitUntil.bind(ctx),
   * })
   * ```
   */
  waitUntil: undefined
})
````

### Bun Redis

The Redis adapter for Bun's built-in Redis client, with no extra dependency. It shares counters with `RedisRateLimiter`.

```ts
import { BunRedisRateLimiter } from '@orpc/bun'
import { redis } from 'bun'

const limiter = new BunRedisRateLimiter(redis, {
  /**
   * The prefix to use for Redis keys.
   *
   * @default ''
   */
  prefix: '',

  /**
   * Maximum number of requests allowed within the window.
   */
  maxRequests: 10,

  /**
   * The duration of the fixed window in milliseconds.
   */
  window: 60000,

  blockingUntilReady: {
    /**
     * Block until the request may pass or timeout is reached.
     *
     * @default false
     */
    enabled: false,

    /**
     * milliseconds
     */
    timeout: 5000
  },
})
```

### Cloudflare

Uses the Workers Rate Limiting binding, so limits are configured in your Worker settings rather than in the adapter.

```ts
import { CloudflareRateLimiter } from '@orpc/cloudflare'

export default {
  async fetch(request, env) {
    const limiter = new CloudflareRateLimiter(env.MY_RATE_LIMITER, {
      /**
       * The prefix to use for cloudflare ratelimit.
       *
       * @default ''
       */
      prefix: ''
    })
  }
}
```
