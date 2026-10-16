/**
 * Built-in middleware (`trpcdev/middleware`). Each helper is an ordinary
 * middleware factory, so it nests like any `.use()`: one added first observes
 * everything after it.
 *
 * @example
 * ```ts
 * import { onFinish } from 'trpcdev/middleware';
 *
 * const counted = t.procedure.use(
 *   onFinish((result, { path }) => metrics.increment(path, result.ok)),
 * );
 * ```
 * @module
 */
export { onError, onFinish, onStart, onSuccess } from '../server/middleware.ts';
export {
  RateLimited,
  rateLimit,
  type RateLimitOptions,
} from '../server/ratelimit.ts';
