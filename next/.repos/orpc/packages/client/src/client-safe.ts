import type { AnyNestedClient, Client, ClientRest } from './types'
import type { SafeResult } from './utils'
import { isTypescriptObject } from '@orpc/shared'
import { RECURSIVE_CLIENT_UNWRAP_KEYS } from './consts'
import { safe } from './utils'

export type SafeClient<T extends AnyNestedClient>
  = T extends Client<infer UContext, infer UInput, infer UOutput, infer UError>
    ? (...rest: ClientRest<UContext, UInput>) => Promise<SafeResult<UOutput, UError>>
    : {
        [K in keyof T]: T[K] extends AnyNestedClient ? SafeClient<T[K]> : never
      }

/**
 * Create a safe client that automatically wraps all procedure calls with the `safe` util.
 *
 * @example
 * ```ts
 * const safeClient = createSafeClient(client)
 * const { error, data, definedError, isSuccess } = await safeClient.doSomething({ id: '123' })
 * // or const [error, data, definedError, isSuccess] = await safeClient.doSomething({ id: '123' })
 * ```
 *
 * @see {@link https://orpc.dev/docs/client/error-handling#safe-client | Client Error Handling - Safe Client}
 */
export function createSafeClient<T extends AnyNestedClient>(client: T): SafeClient<T> {
  const cache = new Map<string, SafeClient<AnyNestedClient>>()

  const proxy = new Proxy((...args: any[]) => safe((client as any)(...args)), {
    get(target, prop) {
      if (typeof prop !== 'string' || RECURSIVE_CLIENT_UNWRAP_KEYS.has(prop)) {
        return Reflect.get(target, prop)
      }

      let safeClient = cache.get(prop)

      if (safeClient === undefined) {
        const value = (client as Record<string, unknown>)[prop]

        if (!isTypescriptObject(value)) {
          return value
        }

        safeClient = createSafeClient(value as AnyNestedClient)
        cache.set(prop, safeClient)
      }

      return safeClient
    },
  })

  return proxy as SafeClient<T>
}
