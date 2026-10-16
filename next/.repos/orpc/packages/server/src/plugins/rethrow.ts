import type { ThrowableError } from '@orpc/shared'
import type { StandardHandlerInterceptor, StandardHandlerInterceptorOptions, StandardHandlerOptions, StandardHandlerPlugin, StandardHandlerRoutingInterceptor } from '../adapters/standard'
import type { Context } from '../context'
import { toArray } from '@orpc/shared'

export interface RethrowHandlerPluginOptions<T extends Context> {
  /**
   * Decide which errors should be rethrown.
   *
   * @example
   * ```ts
   * const rethrowPlugin = new RethrowHandlerPlugin({
   *   filter: (error) => {
   *     // Rethrow all non-ORPCError errors
   *     return !(error instanceof ORPCError)
   *   }
   * })
   * ```
   */
  filter: (error: ThrowableError, options: StandardHandlerInterceptorOptions<T>) => boolean
}

/**
 * The plugin can bypass oRPC's built-in error handling
 * and rethrow matching errors directly to your framework's error handling mechanism
 * (e.g., NestJS exception filters, Express error middleware).
 *
 * @see {@link https://orpc.dev/docs/plugins/rethrow | Rethrow Handler Plugin}
 */
export class RethrowHandlerPlugin<T extends Context> implements StandardHandlerPlugin<T> {
  name = '~rethrow'

  private readonly filter: RethrowHandlerPluginOptions<T>['filter']
  private readonly CONTEXT_SYMBOL = Symbol('ORPC_RETHROW_HANDLER_PLUGIN_CONTEXT')

  constructor(options: RethrowHandlerPluginOptions<T>) {
    this.filter = options.filter
  }

  init(options: StandardHandlerOptions<T>): StandardHandlerOptions<T> {
    type PluginContext = { error?: { value: ThrowableError } }

    const routingInterceptor: StandardHandlerRoutingInterceptor<T> = async (options) => {
      const pluginContext: PluginContext = {}

      const result = await options.next({
        ...options,
        context: {
          ...options.context,
          [this.CONTEXT_SYMBOL]: pluginContext,
        },
      })

      if (pluginContext.error) {
        throw pluginContext.error.value
      }

      return result
    }

    const interceptor: StandardHandlerInterceptor<T> = async (options) => {
      const pluginContext = options.context[this.CONTEXT_SYMBOL] as PluginContext | undefined

      if (!pluginContext) {
        throw new TypeError('[RethrowHandlerPlugin] Rethrow handler context has been corrupted or modified by another plugin or interceptor')
      }

      try {
        // await is important here to catch both sync and async errors
        return await options.next()
      }
      catch (error) {
        if (this.filter(error as ThrowableError, options)) {
          pluginContext.error = { value: error as ThrowableError }
        }

        throw error
      }
    }

    return {
      ...options,
      routingInterceptors: [
        ...toArray(options.routingInterceptors),
        routingInterceptor, // rethrow as early as possible and keep it close to `interceptor` to avoid a corrupted or modified context
      ],
      interceptors: [
        interceptor, // catch as many errors as possible
        ...toArray(options.interceptors),
      ],
    }
  }
}
