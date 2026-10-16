import type { AnyNestedClient, Client } from '@orpc/client'
import type { Public } from '@orpc/shared'
import type { OperationKeyPrefixOptions } from './key'
import { RECURSIVE_CLIENT_UNWRAP_KEYS } from '@orpc/client'
import { bindMethods, isTypescriptObject, toArray } from '@orpc/shared'
import { ProcedureUtils } from './procedure-utils'
import { SharedUtils } from './shared-utils'

export type RouterUtils<T extends AnyNestedClient>
  = T extends Client<infer UClientContext, infer UInput, infer UOutput, infer UError>
    ? Public<ProcedureUtils<UClientContext, UInput, UOutput, UError>>
    : {
      [K in keyof T]: T[K] extends AnyNestedClient ? RouterUtils<T[K]> : never
    } & Public<SharedUtils<unknown>>

export interface RouterUtilsOptions extends OperationKeyPrefixOptions {
  /**
   * Base path for all keys.
   *
   * @internal
   */
  path?: string[] | undefined
}

/**
 * Creates SWR utils from a client, exposing fetcher/mutator/subscriber
 * helpers for every procedure in the router.
 *
 * @remarks
 * **Note**: Both client-side and server-side clients are supported.
 *
 * @see {@link https://orpc.dev/docs/integrations/swr | SWR Integration}
 */
export function createRouterUtils<T extends AnyNestedClient>(
  client: T,
  options: RouterUtilsOptions = {},
): RouterUtils<T> {
  const path = toArray(options.path)

  const utils = typeof client === 'function'
    ? bindMethods(new ProcedureUtils(path, client, { prefix: options.prefix }), { unbound: ['call'] })
    : bindMethods(new SharedUtils(path, { prefix: options.prefix }))

  const cache = new Map<string, unknown>()

  const recursive = new Proxy(utils, {
    get(target, prop) {
      const value = Reflect.get(target, prop)
      const nextClient = Reflect.get(client, prop)

      if (typeof prop !== 'string' || RECURSIVE_CLIENT_UNWRAP_KEYS.has(prop) || !isTypescriptObject(nextClient)) {
        return value
      }

      let result = cache.get(prop)

      if (result === undefined) {
        const nextUtils = createRouterUtils(nextClient as any, { ...options, path: [...path, prop] })

        result = typeof value !== 'function'
          ? nextUtils
          : new Proxy(value, {
              get(target, prop) {
                if (typeof prop !== 'string' || RECURSIVE_CLIENT_UNWRAP_KEYS.has(prop)) {
                  return Reflect.get(target, prop)
                }

                return Reflect.get(nextUtils, prop)
              },
            })

        cache.set(prop, result)
      }

      return result
    },
  })

  return recursive as any
}
