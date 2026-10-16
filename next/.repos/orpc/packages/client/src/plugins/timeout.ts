import type { Value } from '@orpc/shared'
import type { StandardLinkInterceptor, StandardLinkInterceptorOptions, StandardLinkOptions, StandardLinkPlugin } from '../adapters/standard'
import type { ClientContext } from '../types'
import { AbortError, anyAbortSignal, toArray, value } from '@orpc/shared'

export interface TimeoutLinkPluginOptions<T extends ClientContext> {
  /**
   * Timeout in milliseconds before the request is aborted.
   * Use `null` or `undefined` to disable the timeout.
   */
  timeout: Value<number | null | undefined, [options: StandardLinkInterceptorOptions<T>]>
}

/**
 * The Timeout Link Plugin aborts requests that exceed a configured timeout with an `AbortError`.
 *
 * @see {@link https://orpc.dev/docs/plugins/timeout | Timeout Plugin}
 */
export class TimeoutLinkPlugin<T extends ClientContext> implements StandardLinkPlugin<T> {
  private readonly timeout: TimeoutLinkPluginOptions<T>['timeout']

  name = '~timeout'

  /**
   * Should abort if the total retry time exceeds the configured timeout
   */
  after = ['~retry']

  constructor(options: NoInfer<TimeoutLinkPluginOptions<T>>) {
    this.timeout = options.timeout
  }

  init(options: StandardLinkOptions<T>): StandardLinkOptions<T> {
    const interceptor: StandardLinkInterceptor<T> = async (interceptorOptions) => {
      const timeoutMs = value(this.timeout, interceptorOptions)

      if (timeoutMs === null || timeoutMs === undefined) {
        return interceptorOptions.next()
      }

      const controller = new AbortController()
      const timeoutId = setTimeout(() => {
        controller.abort(new AbortError(`Request timed out after ${timeoutMs}ms`))
      }, timeoutMs)

      const signal = anyAbortSignal([interceptorOptions.signal, controller.signal])

      try {
        return await interceptorOptions.next({ ...interceptorOptions, signal })
      }
      finally {
        clearTimeout(timeoutId)
      }
    }

    return { ...options, interceptors: [interceptor, ...toArray(options.interceptors)] }
  }
}
