import type { Context, Middleware, MiddlewareOptions } from '@orpc/server'
import type { Promisable, Value } from '@orpc/shared'
import type { RateLimitHandlerPluginContext } from './handler-plugin'
import type { RateLimiter } from './types'
import { ORPCError } from '@orpc/server'
import { toArray, value } from '@orpc/shared'
import { RATELIMIT_HANDLER_PLUGIN_CONTEXT_SYMBOL } from './handler-plugin'

export const RATELIMIT_MIDDLEWARE_CONTEXT_SYMBOL: unique symbol = Symbol.for('ORPC_RATELIMIT_MIDDLEWARE_CONTEXT')

export interface RateLimitMiddlewareContext {
  [RATELIMIT_MIDDLEWARE_CONTEXT_SYMBOL]?: {
    /**
     * The applied limits in this request, mainly for deduplication purposes
     */
    applied: { limiter: RateLimiter, key: string }[]
  }
}

export interface RateLimitMiddlewareOptions<
  TInContext extends Context,
  TInput,
> {
  /**
   * The rule set to use for rate limiting
   */
  limiter: Value<Promisable<RateLimiter>, [options: MiddlewareOptions<TInContext, unknown, Record<never, never>>, input: TInput]>

  /**
   * The key to identify the user/requester
   */
  key: Value<Promisable<string>, [options: MiddlewareOptions<TInContext, unknown, Record<never, never>>, input: TInput]>

  /**
   * The weight of the request. Determines how many tokens or quota
   * units are consumed by this request. Must be an integer greater than 0.
   *
   * @default 1
   */
  weight?: Value<Promisable<number>, [options: MiddlewareOptions<TInContext, unknown, Record<never, never>>, input: TInput]>

  /**
   * If your ratelimit middleware is used multiple times
   * or you invoke a procedure inside another procedure (shared the same context) that also has
   * ratelimit middleware **with the same limiter and key**, this option
   * will ensure that the limit is only applied once per request.
   *
   * @default true
   */
  dedupe?: boolean
}

/**
 * Creates a middleware that enforces rate limits in oRPC procedures.
 * Supports per-request deduplication and integrates with the ratelimit handler plugin.
 *
 * @see {@link https://orpc.dev/docs/helpers/ratelimit#ratelimit-middleware | Rate Limit Helpers - Ratelimit Middleware}
 */
export function ratelimit<
  TInContext extends Context,
  TInput,
>(
  { dedupe = true, ...options }: RateLimitMiddlewareOptions<TInContext, TInput>,
): Middleware<TInContext, object, TInput, any, object> {
  return async function ratelimit(middlewareOptions, input) {
    const [limiter, key, weight] = await Promise.all([
      value(options.limiter, middlewareOptions, input),
      value(options.key, middlewareOptions, input),
      value(options.weight, middlewareOptions, input),
    ])

    const middlewareContext = (middlewareOptions.context as RateLimitMiddlewareContext)[RATELIMIT_MIDDLEWARE_CONTEXT_SYMBOL]
    if (dedupe && middlewareContext?.applied.some(l => l.key === key && l.limiter === limiter)) {
      return middlewareOptions.next()
    }

    const result = await limiter.limit(key, { weight })

    const pluginContext = (middlewareOptions.context as RateLimitHandlerPluginContext)[RATELIMIT_HANDLER_PLUGIN_CONTEXT_SYMBOL]
    if (pluginContext) {
      pluginContext.checks.push({ path: middlewareOptions.path, procedure: middlewareOptions.procedure, result })
    }

    if (!result.success) {
      throw new ORPCError('TOO_MANY_REQUESTS', {
        data: {
          limit: result.limit,
          remaining: result.remaining,
          reset: result.reset,
        },
      })
    }

    return middlewareOptions.next({
      context: {
        [RATELIMIT_MIDDLEWARE_CONTEXT_SYMBOL]: {
          ...middlewareContext,
          applied: [
            ...toArray(middlewareContext?.applied),
            { limiter, key },
          ],
        },
      } satisfies RateLimitMiddlewareContext,
    })
  }
}
