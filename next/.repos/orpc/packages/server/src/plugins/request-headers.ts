import type { StandardHandlerOptions, StandardHandlerPlugin } from '../adapters/standard'
import { toArray } from '@orpc/shared'
import { toFetchHeaders } from '@standard-server/fetch'

/**
 * The context shape into which the Request Headers Plugin injects `reqHeaders`.
 *
 * @see {@link https://orpc.dev/docs/plugins/request-headers | Request Headers Plugin}
 */
export interface RequestHeadersHandlerPluginContext {
  /**
   * Request headers as a Headers instance. This is injected by the Request Headers Plugin.
   */
  reqHeaders?: Headers | undefined
}

/**
 * The Request Headers Plugin injects a `reqHeaders` instance into the context,
 * allowing access to request headers in oRPC.
 *
 * @see {@link https://orpc.dev/docs/plugins/request-headers | Request Headers Plugin}
 */
export class RequestHeadersHandlerPlugin<T extends RequestHeadersHandlerPluginContext> implements StandardHandlerPlugin<T> {
  name = '~request-headers'

  init(options: StandardHandlerOptions<T>): StandardHandlerOptions<T> {
    return {
      ...options,
      interceptors: [
        (interceptorOptions) => {
          const reqHeaders = interceptorOptions.context.reqHeaders ?? toFetchHeaders(interceptorOptions.request.headers)

          return interceptorOptions.next({
            ...interceptorOptions,
            context: {
              ...interceptorOptions.context,
              reqHeaders,
            },
          })
        },
        ...toArray(options.interceptors),
      ],
    }
  }
}
