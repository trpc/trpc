import type { AnyNestedClient, ClientContext } from '@orpc/client'
import type { ErrorMap, Schema } from '@orpc/contract'
import type { MaybeOptionalOptions } from '@orpc/shared'
import type { Lazyable } from './lazy'
import type { ProcedureClient, ProcedureClientOptions } from './procedure-client'
import type { AnyRouter, InferRouterInitialContext } from './router'
import { RECURSIVE_CLIENT_UNWRAP_KEYS } from '@orpc/client'
import { resolveMaybeOptionalOptions, toArray } from '@orpc/shared'
import { Lazy } from './lazy'
import { Procedure } from './procedure'
import { createProcedureClient } from './procedure-client'
import { createGuardedProcedureLazy } from './procedure-utils'
import { getRouter } from './router-utils'

/**
 * The client type derived from a router, exposing every procedure as a callable
 * function while preserving the router's shape.
 *
 * @see {@link https://orpc.dev/docs/client/client-side#creating-a-client | Client-Side Clients - Creating a Client}
 */
export type RouterClient<TRouter extends AnyRouter, TClientContext extends ClientContext = object>
  = TRouter extends Procedure<any, any, infer $InputSchema, infer $OutputSchema, infer $ErrorMap>
    ? ProcedureClient<TClientContext, $InputSchema, $OutputSchema, $ErrorMap>
    : {
        [K in keyof TRouter]: TRouter[K] extends Lazyable<infer U extends AnyRouter> ? RouterClient<U, TClientContext> : never
      }

/**
 * Creates a server-side client that calls the router's procedures directly,
 * within the same process, without any network layer.
 *
 * @see {@link https://orpc.dev/docs/client/server-side#router-clients | Server-Side Clients - Router Clients}
 */
export function createRouterClient<T extends AnyRouter, TClientContext extends ClientContext = object>(
  router: Lazyable<T | undefined>,
  ...rest: MaybeOptionalOptions<
    ProcedureClientOptions<
      InferRouterInitialContext<T>,
      Schema<unknown>,
      ErrorMap,
      TClientContext
    >
  >
): RouterClient<T, TClientContext> {
  const options = resolveMaybeOptionalOptions(rest)

  if (router instanceof Procedure) {
    return createProcedureClient(router, options) as any
  }

  const procedureCaller = router instanceof Lazy
    ? createProcedureClient(createGuardedProcedureLazy(router), options)
    : {}

  const cache = new Map<string, AnyNestedClient>()

  const recursive = new Proxy(procedureCaller, {
    get(target, key) {
      if (typeof key !== 'string' || (router instanceof Lazy && RECURSIVE_CLIENT_UNWRAP_KEYS.has(key))) {
        return Reflect.get(target, key)
      }

      let nextClient = cache.get(key)

      if (nextClient === undefined) {
        const next = getRouter(router, [key])

        if (!next) {
          return Reflect.get(target, key)
        }

        nextClient = createRouterClient(next as any, {
          ...options,
          path: [...toArray(options.path), key],
        })

        cache.set(key, nextClient)
      }

      return nextClient
    },
  })

  return recursive as any
}
