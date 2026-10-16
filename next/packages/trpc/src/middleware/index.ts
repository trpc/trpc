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
export {
  experimental_durable,
  type DurableOptions,
} from '../server/durable.ts';
export { onError, onFinish, onStart, onSuccess } from '../server/middleware.ts';
export {
  RateLimited,
  rateLimit,
  type RateLimitOptions,
} from '../server/ratelimit.ts';
