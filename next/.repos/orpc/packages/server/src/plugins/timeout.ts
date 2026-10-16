import type { Value } from '@orpc/shared'
import type { StandardHandlerInterceptor, StandardHandlerInterceptorOptions, StandardHandlerOptions, StandardHandlerPlugin } from '../adapters/standard'
import type { Context } from '../context'
import { AbortError, anyAbortSignal, isAsyncIteratorObject, override, toArray, value, wrapAsyncIterator, wrapReadableStream } from '@orpc/shared'

export interface TimeoutHandlerPluginOptions<T extends Context> {
  /**
   * Timeout in milliseconds before the request signal is aborted.
   * This only covers producing the response, use `streamingTimeout`
   * to limit streaming response bodies.
   * Use `null` or `undefined` to disable the timeout.
   */
  timeout: Value<number | null | undefined, [options: StandardHandlerInterceptorOptions<T>]>

  /**
   * Timeout in milliseconds for the full duration of a streaming response body
   * (async iterator object or readable stream), measured from when the response is produced.
   * When exceeded, the request signal is aborted and the body ends
   * once its producer honors the signal.
   * Usually higher than `timeout`.
   * Use `null` or `undefined` to disable the timeout.
   *
   * @default undefined (streaming responses run without limit)
   */
  streamingTimeout?: Value<number | null | undefined, [options: StandardHandlerInterceptorOptions<T>]>
}

/**
 * The Timeout Handler Plugin aborts the request signal with an `AbortError`
 * when handling exceeds a configured timeout. It only aborts the signal,
 * the procedure must honor it to stop early and produce the response.
 *
 * @see {@link https://orpc.dev/docs/plugins/timeout | Timeout Plugin}
 */
export class TimeoutHandlerPlugin<T extends Context> implements StandardHandlerPlugin<T> {
  private readonly timeout: TimeoutHandlerPluginOptions<T>['timeout']
  private readonly streamingTimeout: TimeoutHandlerPluginOptions<T>['streamingTimeout']

  name = '~timeout'

  constructor(options: NoInfer<TimeoutHandlerPluginOptions<T>>) {
    this.timeout = options.timeout
    this.streamingTimeout = options.streamingTimeout
  }

  init(options: StandardHandlerOptions<T>): StandardHandlerOptions<T> {
    const interceptor: StandardHandlerInterceptor<T> = async (interceptorOptions) => {
      const timeoutMs = value(this.timeout, interceptorOptions)
      const streamingTimeoutMs = value(this.streamingTimeout, interceptorOptions)

      const hasTimeout = timeoutMs !== null && timeoutMs !== undefined
      const hasStreamingTimeout = streamingTimeoutMs !== null && streamingTimeoutMs !== undefined

      if (!hasTimeout && !hasStreamingTimeout) {
        return interceptorOptions.next()
      }

      const controller = new AbortController()

      const abortWithTimeout = (ms: number) => {
        controller.abort(new AbortError(`Request timed out after ${ms}ms`))
      }

      const timeoutId = hasTimeout ? setTimeout(abortWithTimeout, timeoutMs, timeoutMs) : undefined
      const signal = anyAbortSignal([interceptorOptions.request.signal, controller.signal])

      try {
        const response = await interceptorOptions.next({
          ...interceptorOptions,
          request: { ...interceptorOptions.request, signal },
        })

        if (hasStreamingTimeout) {
          const body = response.body
          const isIterator = isAsyncIteratorObject(body)

          if (isIterator || body instanceof ReadableStream) {
            const streamingTimeoutId = setTimeout(abortWithTimeout, streamingTimeoutMs, streamingTimeoutMs)
            const onFinish = () => clearTimeout(streamingTimeoutId)

            return {
              ...response,
              body: isIterator
                ? override(body, wrapAsyncIterator(body, { onFinish }))
                : override(body, wrapReadableStream(body, { onFinish })),
            }
          }
        }

        return response
      }
      finally {
        clearTimeout(timeoutId)
      }
    }

    return { ...options, interceptors: [interceptor, ...toArray(options.interceptors)] }
  }
}
