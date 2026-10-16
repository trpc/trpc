import type { Context, ErrorMap, ProcedureClientInterceptor, Schema } from '@orpc/server'
import type { StandardHandlerOptions, StandardHandlerPlugin, StandardHandlerRoutingInterceptor } from '@orpc/server/standard'
import { toArray } from '@orpc/shared'
import { HibernationAsyncIteratorClass } from '@standard-server/peer'

/**
 * A handler plugin that enables the Hibernation APIs, allowing procedures
 * to return a `HibernationAsyncIteratorClass` for hibernation-friendly
 * event streaming.
 *
 * @see {@link https://orpc.dev/docs/integrations/hibernation | Hibernation Integration}
 */
export class HibernationHandlerPlugin<T extends Context> implements StandardHandlerPlugin<T> {
  name = '~hibernation'

  before = ['~batch']

  private readonly CONTEXT_SYMBOL = Symbol('ORPC_HIBERNATION_HANDLER_PLUGIN_CONTEXT')

  init(options: StandardHandlerOptions<T>): StandardHandlerOptions<T> {
    type PluginContext = {
      hibernation?: HibernationAsyncIteratorClass<any>
    }

    const routingInterceptor: StandardHandlerRoutingInterceptor<T> = async (options) => {
      const pluginContext: PluginContext = {}

      const result = await options.next({
        ...options,
        context: {
          ...options.context,
          [this.CONTEXT_SYMBOL]: pluginContext,
        },
      })

      if (!result.matched || !pluginContext.hibernation) {
        return result
      }

      /**
       * The codec serializes async iterator outputs by wrapping them,
       * which loses the `HibernationAsyncIteratorClass` identity the peer
       * relies on. Restore the original iterator as the response body.
       */
      return {
        ...result,
        response: {
          ...result.response,
          body: pluginContext.hibernation,
        },
      }
    }

    const clientInterceptor: ProcedureClientInterceptor<T, Schema<unknown>, ErrorMap> = async (options) => {
      const pluginContext = options.context[this.CONTEXT_SYMBOL] as PluginContext | undefined

      if (!pluginContext) {
        throw new TypeError('[HibernationHandlerPlugin] Hibernation context has been corrupted or modified by another plugin or interceptor')
      }

      const output = await options.next()

      if (output instanceof HibernationAsyncIteratorClass) {
        pluginContext.hibernation = output
        return undefined
      }

      return output
    }

    return {
      ...options,
      routingInterceptors: [
        routingInterceptor,
        ...toArray(options.routingInterceptors),
      ],
      clientInterceptors: [
        ...toArray(options.clientInterceptors),
        clientInterceptor,
      ],
    }
  }
}
