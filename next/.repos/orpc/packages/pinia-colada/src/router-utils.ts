import type { AnyNestedClient, Client, InferClientContext, InferClientError } from '@orpc/client'
import type { Public } from '@orpc/shared'
import type { OperationKeyPrefixOptions } from './key'
import type { RouterUtilsPlugin } from './plugin'
import type { ProcedureUtilsInfiniteInterceptor, ProcedureUtilsLiveInterceptor, ProcedureUtilsMutationInterceptor, ProcedureUtilsOptions, ProcedureUtilsQueryInterceptor, ProcedureUtilsStreamedInterceptor } from './procedure-utils'
import { RECURSIVE_CLIENT_UNWRAP_KEYS } from '@orpc/client'
import { bindMethods, isTypescriptObject, pick, toArray } from '@orpc/shared'
import { CompositeRouterUtilsPlugin } from './plugin'
import { isProcedureUtilsOptions, mergeProcedureUtilsOptions, ProcedureUtils } from './procedure-utils'
import { SharedUtils } from './shared-utils'

/**
 * The utils shape derived from a client: procedure clients map to procedure
 * utils, and routers map recursively to nested utils.
 *
 * @see {@link https://orpc.dev/docs/integrations/pinia-colada | Pinia Colada Integration}
 */
export type RouterUtils<T extends AnyNestedClient>
  = T extends Client<infer UClientContext, infer UInput, infer UOutput, infer UError>
    ? Public<ProcedureUtils<UClientContext, UInput, UOutput, UError>>
    : {
      [K in keyof T]: T[K] extends AnyNestedClient ? RouterUtils<T[K]> : never
    } & Public<SharedUtils<unknown>>

export type RouterUtilsScoped<T extends AnyNestedClient>
  = T extends Client<infer UClientContext, infer UInput, infer UOutput, infer UError>
    ? ProcedureUtilsOptions<UClientContext, UInput, UOutput, UError>
    : {
        [K in keyof T]?: T[K] extends AnyNestedClient ? RouterUtilsScoped<T[K]> : never
      }

export interface RouterUtilsOptions<T extends AnyNestedClient> extends OperationKeyPrefixOptions {
  /**
   * Base path for all query keys.
   *
   * @internal
   */
  path?: string[] | undefined

  /**
   * Interceptors that intercept query inside .queryOptions
   */
  queryInterceptors?: ProcedureUtilsQueryInterceptor<InferClientContext<T>, unknown, unknown, InferClientError<T>>[]

  /**
   * Interceptors that intercept query inside .streamedOptions
   */
  streamedInterceptors?: ProcedureUtilsStreamedInterceptor<InferClientContext<T>, unknown, unknown, InferClientError<T>>[]

  /**
   * Interceptors that intercept query inside .liveOptions
   */
  liveInterceptors?: ProcedureUtilsLiveInterceptor<InferClientContext<T>, unknown, unknown, InferClientError<T>>[]

  /**
   * Interceptors that intercept query inside .infiniteOptions
   */
  infiniteInterceptors?: ProcedureUtilsInfiniteInterceptor<InferClientContext<T>, unknown, unknown, InferClientError<T>>[]

  /**
   * Interceptors that intercept mutation inside .mutationOptions
   */
  mutationInterceptors?: ProcedureUtilsMutationInterceptor<InferClientContext<T>, unknown, unknown, InferClientError<T>>[]

  /**
   * Per-procedure options following the shape of the router.
   * Allows fine-grained configuration of individual procedure utils
   * without affecting the rest of the router.
   */
  scoped?: RouterUtilsScoped<T> | undefined

  /**
   * Plugins to extend router utils behavior.
   */
  plugins?: RouterUtilsPlugin<T>[] | undefined
}

/**
 * Creates Pinia Colada utils from a client, exposing query/mutation
 * option builders for every procedure in the router.
 *
 * @remarks
 * **Note**: Both client-side and server-side clients are supported.
 *
 * @see {@link https://orpc.dev/docs/integrations/pinia-colada | Pinia Colada Integration}
 */
export function createRouterUtils<T extends AnyNestedClient>(
  client: T,
  options: NoInfer<RouterUtilsOptions<T>> = {},
): RouterUtils<T> {
  const plugin = new CompositeRouterUtilsPlugin<T>(options.plugins)
  options = plugin.init(options)

  return createRouterUtilsInternal(client, options, plugin)
}

function createRouterUtilsInternal<T extends AnyNestedClient>(
  client: T,
  options: RouterUtilsOptions<T>,
  plugin: CompositeRouterUtilsPlugin<any>,
): RouterUtils<T> {
  const path = toArray(options.path)

  const utils = typeof client === 'function' && (options.scoped === undefined || isProcedureUtilsOptions(options.scoped))
    ? bindMethods(new ProcedureUtils(
        path,
        client,
        plugin.initProcedureOptions(path, mergeProcedureUtilsOptions(
          pick(options, [
            'prefix',
            'queryInterceptors',
            'streamedInterceptors',
            'liveInterceptors',
            'infiniteInterceptors',
            'mutationInterceptors',
          ]) as ProcedureUtilsOptions<any, any, any, any>,
          options.scoped ?? {},
        )),
      ), { unbound: ['call'] })
    : bindMethods(new SharedUtils(path, options))

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
        const nextUtils = createRouterUtilsInternal(nextClient as any, {
          ...options,
          path: [...path, prop],
          scoped: (options.scoped as undefined | Record<string, RouterUtilsOptions<T>['scoped']>)?.[prop],
        }, plugin)

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
