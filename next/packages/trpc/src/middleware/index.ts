/**
 * Built-in middleware (`@trpc12/trpc/middleware`). Each helper is an ordinary
 * middleware factory, so it nests like any `.use()`: one added first observes
 * everything after it.
 *
 * @example
 * ```ts
 * import { onFinish } from '@trpc12/trpc/middleware';
 *
 * const counted = t.procedure.use(
 *   onFinish((result, { path }) => metrics.increment(path, result.ok)),
 * );
 * ```
 * @module
 */
export { experimental_durable, type DurableOptions } from './durable.ts';
export {
  experimental_lock,
  experimental_LockConflict,
  experimental_Locker,
  experimental_LockTimeout,
  experimental_memoryLocker,
  experimental_redisLocker,
  type experimental_Lock,
  type experimental_LockerShape,
  type experimental_LockMiddlewareOptions,
  type experimental_LockOptions,
  type experimental_RedisLockerOptions,
} from './lock.ts';
export {
  onError,
  onFinish,
  onStart,
  onSuccess,
} from '../server/procedures/index.ts';
export { RateLimited, rateLimit, type RateLimitOptions } from './ratelimit.ts';
export {
  experimental_upstashRateLimiterStore,
  experimental_upstashRedis,
  type experimental_UpstashOptions,
  type experimental_UpstashRateLimiterStoreOptions,
} from './upstash.ts';
