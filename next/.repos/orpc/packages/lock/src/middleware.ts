import type { Context, Middleware, MiddlewareOptions } from '@orpc/server'
import type { Promisable, Value } from '@orpc/shared'
import type { Locker } from './types'
import { ORPCError } from '@orpc/server'
import { toArray, value } from '@orpc/shared'
import { LockTimeoutError } from './error'

export const LOCK_MIDDLEWARE_CONTEXT_SYMBOL: unique symbol = Symbol.for('ORPC_LOCK_MIDDLEWARE_CONTEXT')

export interface LockMiddlewareContext {
  [LOCK_MIDDLEWARE_CONTEXT_SYMBOL]?: {
    /**
     * The locks held in this request, mainly for deduplication purposes
     */
    held: { locker: Locker, key: string, waited: boolean }[]
  }
}

export interface LockMiddlewareOutContext {
  /**
   * Whether the lock was acquired only after waiting for another holder to release it.
   * `false` means the lock was acquired immediately.
   */
  ['lock/waited']: boolean
}

export interface LockMiddlewareOptions<
  TInContext extends Context,
  TInput,
> {
  /**
   * The locker to acquire the lock from
   */
  locker: Value<Promisable<Locker>, [options: MiddlewareOptions<TInContext, unknown, Record<never, never>>, input: TInput]>

  /**
   * The key to identify the work that must not run concurrently
   */
  key: Value<Promisable<string>, [options: MiddlewareOptions<TInContext, unknown, Record<never, never>>, input: TInput]>

  /**
   * How long the lock is held before it expires automatically, in milliseconds.
   *
   * @default the adapter default
   */
  ttl?: Value<Promisable<number | undefined>, [options: MiddlewareOptions<TInContext, unknown, Record<never, never>>, input: TInput]>

  /**
   * How long to wait for the lock to become available, in milliseconds.
   *
   * @default the adapter default
   */
  timeout?: Value<Promisable<number | undefined>, [options: MiddlewareOptions<TInContext, unknown, Record<never, never>>, input: TInput]>

  /**
   * If your lock middleware is used multiple times
   * or you invoke a procedure inside another procedure (shared the same context) that also has
   * lock middleware **with the same locker and key**, this option
   * will ensure that the lock is only acquired once per request,
   * instead of waiting for itself until the timeout elapses.
   *
   * @default true
   */
  dedupe?: boolean
}

/**
 * Creates a middleware that runs oRPC procedures under a lock, so that calls
 * sharing the same key never run concurrently. Rejects with a `CONFLICT` error
 * when the lock cannot be acquired before the timeout elapses.
 *
 * @see {@link https://orpc.dev/docs/helpers/lock#lock-middleware | Lock Helpers - Lock Middleware}
 */
export function lock<
  TInContext extends Context,
  TInput,
>(
  { dedupe = true, ...options }: LockMiddlewareOptions<TInContext, TInput>,
): Middleware<TInContext, LockMiddlewareOutContext, TInput, any, object> {
  return async function lock(middlewareOptions, input) {
    const [locker, key, ttl, timeout] = await Promise.all([
      value(options.locker, middlewareOptions, input),
      value(options.key, middlewareOptions, input),
      value(options.ttl, middlewareOptions, input),
      value(options.timeout, middlewareOptions, input),
    ])

    const middlewareContext = (middlewareOptions.context as LockMiddlewareContext)[LOCK_MIDDLEWARE_CONTEXT_SYMBOL]
    const held = middlewareContext?.held.find(l => l.key === key && l.locker === locker)

    if (dedupe && held) {
      return middlewareOptions.next({
        context: {
          'lock/waited': held.waited,
        } satisfies LockMiddlewareOutContext,
      })
    }

    let acquired = false

    try {
      return await locker.lock(key, ({ waited }) => {
        acquired = true

        return middlewareOptions.next({
          context: {
            'lock/waited': waited,
            [LOCK_MIDDLEWARE_CONTEXT_SYMBOL]: {
              ...middlewareContext,
              held: [
                ...toArray(middlewareContext?.held),
                { locker, key, waited },
              ],
            },
          } satisfies LockMiddlewareOutContext & LockMiddlewareContext,
        })
      }, { ttl, timeout, signal: middlewareOptions.signal })
    }
    catch (error) {
      if (!acquired && error instanceof LockTimeoutError) {
        throw new ORPCError('CONFLICT', { cause: error })
      }

      throw error
    }
  }
}
