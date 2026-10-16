---
title: "Lock Helpers"
description: "Prevent the same work from running concurrently in oRPC with a unified Locker interface, storage adapters, and procedure middleware."
sidebar:
  label: "Lock"
---

## Installation

```package-install
npm install @orpc/experimental-lock@beta
```

## Basic Usage

The core concept is the `Locker` interface, which defines a standard way to run work under a lock, so that work sharing the same key never runs concurrently. You can create your own custom locker or use one of the provided [adapters](#adapters):

| Name                           | Adapter for                                                                      |
| ------------------------------ | -------------------------------------------------------------------------------- |
| [`MemoryLocker`](#memory)      | In-memory storage                                                                |
| [`RedisLocker`](#redis)        | [Redis](https://github.com/redis/redis)                                          |
| [`UpstashLocker`](#upstash)    | [Upstash Redis](https://upstash.com/docs/redis)                                  |
| [`BunRedisLocker`](#bun-redis) | [Bun's Redis](https://bun.com/docs/runtime/redis)                                |
| [`DurableLocker`](#cloudflare) | [Cloudflare Durable Objects](https://developers.cloudflare.com/durable-objects/) |

The `lock` method runs a callback while holding the lock for a key, and releases the lock afterwards, even when the callback throws. The callback receives `waited`, which tells whether the lock was acquired immediately (`false`) or only after waiting for another holder to release it (`true`).

```ts twoslash
import { MemoryLocker } from '@orpc/experimental-lock/memory'
declare function generateReport(id: string): Promise<{ url: string }>
declare const cache: { get: (key: string) => Promise<{ url: string } | undefined> }
// ---cut---
const locker = new MemoryLocker()

const report = await locker.lock('report:123', async ({ waited }) => {
  if (waited) {
    // Another holder just finished the same work, so its result may already be available
    const cached = await cache.get('report:123')

    if (cached) {
      return cached
    }
  }

  return await generateReport('123')
})
```

### Options

- `ttl`: how long the lock is held before it expires automatically, in milliseconds. Guards against holders that never release the lock. Each adapter has its own default.
- `timeout`: how long to wait for the lock to become available, in milliseconds. `lock` rejects with a `LockTimeoutError` once it elapses.
- `signal`: stops waiting early and rejects with the abort reason. Has no effect once the lock is acquired.

```ts
await locker.lock('report:123', () => generateReport('123'), {
  ttl: 30_000,
  timeout: 5_000,
  signal: request.signal,
})
```

## Lock Middleware

The `lock` helper creates middleware that runs [procedures](/docs/procedure) under a lock, so that calls sharing the same key never run concurrently. When the lock cannot be acquired before the timeout elapses, the procedure rejects with a `CONFLICT` error. The request `signal` is forwarded, so a call stops waiting as soon as the client disconnects.

```ts
import { lock, Locker } from '@orpc/experimental-lock'

const procedure = os
  .$context<{ locker: Locker }>()
  .input(z.object({ id: z.string() }))
  .use(
    lock({
      locker: ({ context }) => context.locker,
      key: ({ context }, input) => `report:${input.id}`,
      /**
       * How long the lock is held before it expires automatically, in milliseconds.
       *
       * @default the adapter default
       */
      ttl: 30_000,

      /**
       * How long to wait for the lock to become available, in milliseconds.
       * The procedure rejects with a `CONFLICT` error when it elapses before the lock is acquired.
       *
       * @default the adapter default
       */
      timeout: 5_000,
    }),
  )
  .handler(async ({ context, input }) => {
    if (context['lock/waited']) {
      // Another call with the same key just finished, so its result may already be available
    }

    return await generateReport(input.id)
  })

const locker = new MemoryLocker()

const result = await call(
  procedure,
  { id: '123' },
  { context: { locker } }
)
```

:::info[Automatic Deduplication]
When the same `locker` and `key` combination is used multiple times in a single request chain, the `lock` middleware acquires the lock only once, so a procedure never waits for a lock it already holds. This behavior follows the [Dedupe Middleware](/docs/recipes/dedupe-middleware) recipe. To disable deduplication, set `dedupe: false`.
:::

## Adapters

### Memory

Keeps locks in the memory of the current process, so they are not shared between instances. A good fit for development, tests, and single-process servers.

```ts
import { MemoryLocker } from '@orpc/experimental-lock/memory'

const locker = new MemoryLocker({
  /**
   * How long a lock is held before it expires automatically, in milliseconds.
   * Can be overridden per call.
   *
   * @default undefined (held until released)
   */
  ttl: 30_000,

  /**
   * How long to wait for a lock to become available, in milliseconds.
   * Can be overridden per call.
   *
   * @default 10000
   */
  timeout: 5_000,
})
```

### Redis

Stores locks in Redis, so every instance using the same server shares the same locks.

```ts
import { RedisLocker } from '@orpc/experimental-lock/redis'
import { createClient } from 'redis'

const client = createClient({ url: 'redis://localhost:6379' })

// RedisLocker lazily connects to Redis when needed.
// You can still call `client.connect()` manually, but it is optional.
await client.connect()

const locker = new RedisLocker(client, {
  /**
   * The prefix to use for Redis keys.
   *
   * @default ''
   */
  prefix: '',

  /**
   * How long a lock is held before it expires automatically, in milliseconds.
   * Can be overridden per call.
   */
  ttl: 30_000,

  /**
   * How long to wait for a lock to become available, in milliseconds.
   * Can be overridden per call.
   *
   * @default 10000
   */
  timeout: 5_000,

  /**
   * How long to wait between acquisition attempts while the lock
   * is held by someone else, in milliseconds.
   *
   * @default 100
   */
  retryInterval: 100,
})
```

### Upstash

Stores locks in Upstash Redis, so it shares locks with `RedisLocker`. A good fit for serverless and edge runtimes, keeping in mind that every acquisition attempt is a REST request.

```ts
import { UpstashLocker } from '@orpc/experimental-lock/upstash'
import { Redis } from '@upstash/redis'

const redis = Redis.fromEnv()

const locker = new UpstashLocker(redis, {
  /**
   * The prefix to use for Redis keys.
   *
   * @default ''
   */
  prefix: '',

  /**
   * How long a lock is held before it expires automatically, in milliseconds.
   * Can be overridden per call.
   */
  ttl: 30_000,

  /**
   * How long to wait for a lock to become available, in milliseconds.
   * Can be overridden per call.
   *
   * @default 10000
   */
  timeout: 5_000,

  /**
   * How long to wait between acquisition attempts while the lock
   * is held by someone else, in milliseconds.
   *
   * @default 100
   */
  retryInterval: 100,
})
```

### Bun Redis

The Redis adapter for Bun's built-in Redis client, with no extra dependency. It shares locks with `RedisLocker`.

```ts
import { experimental_BunRedisLocker as BunRedisLocker } from '@orpc/bun'
import { redis } from 'bun'

const locker = new BunRedisLocker(redis, {
  /**
   * The prefix to use for Redis keys.
   *
   * @default ''
   */
  prefix: '',

  /**
   * How long a lock is held before it expires automatically, in milliseconds.
   * Can be overridden per call.
   */
  ttl: 30_000,

  /**
   * How long to wait for a lock to become available, in milliseconds.
   * Can be overridden per call.
   *
   * @default 10000
   */
  timeout: 5_000,

  /**
   * How long to wait between acquisition attempts while the lock
   * is held by someone else, in milliseconds.
   *
   * @default 100
   */
  retryInterval: 100,
})
```

### Cloudflare

Stores locks in Durable Objects, so every Worker instance shares the same locks. Export a class extending `DurableLockObject`, bind it in your Wrangler config, and pass the namespace to `DurableLocker`.

```jsonc title="wrangler.jsonc"
{
  "durable_objects": {
    "bindings": [{ "name": "LOCK_DON", "class_name": "LockDO" }]
  },
  "migrations": [{ "tag": "v1", "new_sqlite_classes": ["LockDO"] }]
}
```

```ts cloudflare
import { experimental_DurableLocker as DurableLocker, experimental_DurableLockObject as DurableLockObject } from '@orpc/cloudflare'

export class LockDO extends DurableLockObject {}

export default {
  async fetch(request, env) {
    const locker = new DurableLocker(env.LOCK_DON, {
      /**
       * The prefix to use for Durable Object names.
       *
       * @default ''
       */
      prefix: '',

      /**
       * How long a lock is held before it expires automatically, in milliseconds.
       * Can be overridden per call.
       */
      ttl: 30_000,

      /**
       * How long to wait for a lock to become available, in milliseconds.
       * Can be overridden per call.
       *
       * @default 10000
       */
      timeout: 5_000,

      /**
       * Custom function to get the Durable Object stub for a lock key.
       *
       * @default ((namespace, key) => namespace.getByName(key))
       */
      getStubByName: (namespace, key) => namespace.getByName(key),
    })
  },
}
```
