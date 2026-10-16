import type { Promisable, Value } from '@orpc/shared'
import type { StandardLinkInterceptor, StandardLinkInterceptorOptions, StandardLinkOptions, StandardLinkPlugin } from '../adapters/standard'
import type { ClientContext } from '../types'
import { AsyncIteratorClass, isAsyncIteratorObject, override, sleep, toArray, value } from '@orpc/shared'
import { getEventMeta } from '@standard-server/core'

export interface RetryLinkPluginAttemptOptions<T extends RetryLinkPluginContext> extends StandardLinkInterceptorOptions<T> {
  /**
   * Latest retry delay advertised by the server via event metadata.
   */
  lastEventRetry: number | undefined

  /**
   * Current retry attempt number, starting at 1.
   */
  attempt: number

  /**
   * Error that triggered this retry attempt.
   */
  error: unknown
}

/**
 * Client context options that control retry behavior per call
 * when the `RetryLinkPlugin` is enabled.
 *
 * @see {@link https://orpc.dev/docs/plugins/retry | Retry Plugin}
 */
export interface RetryLinkPluginContext {
  /**
   * Maximum retry attempts before throwing.
   * Use `Number.POSITIVE_INFINITY` for infinite retries (e.g. for AsyncIteratorObject).
   *
   * @default 0
   */
  retry?: Value<Promisable<number>, [Omit<StandardLinkInterceptorOptions<RetryLinkPluginContext>, 'next'>]>

  /**
   * Delay (in ms) before retrying.
   *
   * @remarks
   * **Note**: Why 2000ms? The EventSource spec suggests a default retry delay of 2 seconds if it doesn't specify
   *
   * @default (o) => o.lastEventRetry ?? 2000
   */
  retryDelay?: Value<Promisable<number>, [RetryLinkPluginAttemptOptions<RetryLinkPluginContext>]>

  /**
   * Determine whether to retry.
   *
   * @default true
   */
  shouldRetry?: Value<Promisable<boolean>, [RetryLinkPluginAttemptOptions<RetryLinkPluginContext>]>

  /**
   * Hook called before each retry. Can return a cleanup callback.
   */
  onRetry?: (options: RetryLinkPluginAttemptOptions<RetryLinkPluginContext>) => void | ((isSuccess: boolean) => void)
}

export interface RetryLinkPluginOptions<_T extends RetryLinkPluginContext> {
  /**
   * Default retry options. Can be overridden by individual calls via the context.
   */
  default?: RetryLinkPluginContext | undefined
}

/**
 * Automatically retries failed requests based on customizable retry strategies,
 * improving the resilience of your application.
 *
 * @remarks
 * **Note**: Retry behavior is configured through the client context on each call.
 *
 * @see {@link https://orpc.dev/docs/plugins/retry | Retry Plugin}
 */
export class RetryLinkPlugin<T extends RetryLinkPluginContext & ClientContext> implements StandardLinkPlugin<T> {
  private readonly defaultRetry: Exclude<RetryLinkPluginContext['retry'], undefined>
  private readonly defaultRetryDelay: Exclude<RetryLinkPluginContext['retryDelay'], undefined>
  private readonly defaultShouldRetry: Exclude<RetryLinkPluginContext['shouldRetry'], undefined>
  private readonly defaultOnRetry: RetryLinkPluginContext['onRetry']

  name = '~retry'

  constructor(options: RetryLinkPluginOptions<T> = {}) {
    this.defaultRetry = options.default?.retry ?? 0
    this.defaultRetryDelay = options.default?.retryDelay ?? (o => o.lastEventRetry ?? 2000)
    this.defaultShouldRetry = options.default?.shouldRetry ?? true
    this.defaultOnRetry = options.default?.onRetry
  }

  init(options: StandardLinkOptions<T>): StandardLinkOptions<T> {
    const interceptor: StandardLinkInterceptor<T> = async (interceptorOptions) => {
      const { next, ...callOptions } = interceptorOptions
      const maxAttempts = await value(
        callOptions.context.retry ?? this.defaultRetry,
        callOptions,
      )

      const retryDelay = callOptions.context.retryDelay ?? this.defaultRetryDelay
      const shouldRetry = callOptions.context.shouldRetry ?? this.defaultShouldRetry
      const onRetry = callOptions.context.onRetry ?? this.defaultOnRetry

      if (maxAttempts <= 0) {
        return next(callOptions)
      }

      let lastEventId = callOptions.lastEventId
      let lastEventRetry: undefined | number
      let callback: void | ((isSuccess: boolean) => void)
      let attempt = 1
      let isIteratorAborted = false

      const callNext = async (initialError?: { error: unknown }) => {
        let currentError = initialError

        while (true) {
          const updatedCallOptions = { ...callOptions, lastEventId }
          let retryDelayMs = 0

          if (currentError) {
            if (isIteratorAborted || attempt > maxAttempts) {
              throw currentError.error
            }

            const attemptOptions: RetryLinkPluginAttemptOptions<RetryLinkPluginContext> = {
              ...updatedCallOptions,
              attempt,
              error: currentError.error,
              lastEventRetry,
            }

            const shouldRetryBool = await value(
              shouldRetry,
              attemptOptions,
            )

            if (!shouldRetryBool) {
              throw currentError.error
            }

            retryDelayMs = await value(retryDelay, attemptOptions)
            callback = onRetry?.(attemptOptions)
          }

          try {
            if (currentError) {
              await sleep(retryDelayMs, { signal: updatedCallOptions.signal })

              if (isIteratorAborted) {
                throw currentError.error
              }

              attempt++
            }

            currentError = undefined
            return await next(updatedCallOptions)
          }
          catch (error) {
            currentError = { error }

            if (updatedCallOptions.signal?.aborted) {
              throw error
            }
          }
          finally {
            callback?.(!currentError)
            callback = undefined
          }
        }
      }

      const output = await callNext()

      if (!isAsyncIteratorObject(output)) {
        return output
      }

      let current = output

      return override(() => current, new AsyncIteratorClass(
        async () => {
          while (true) {
            try {
              const item = await current.next()
              const meta = getEventMeta(item.value)

              lastEventId = meta?.id ?? lastEventId
              lastEventRetry = meta?.retry ?? lastEventRetry

              return item
            }
            catch (error) {
              const meta = getEventMeta(error)

              lastEventId = meta?.id ?? lastEventId
              lastEventRetry = meta?.retry ?? lastEventRetry

              const asyncIteratorObject = await callNext({ error })
              if (!isAsyncIteratorObject(asyncIteratorObject)) {
                throw new TypeError(
                  'RetryLinkPlugin: Expected an AsyncIteratorObject, got a different type.',
                )
              }

              current = asyncIteratorObject

              if (isIteratorAborted) {
                await current.return?.()
                throw error
              }
            }
          }
        },
        async ({ kind }) => {
          isIteratorAborted = true

          if (kind === 'cancelled') {
            await current.return?.()
          }
        },
      ))
    }

    return { ...options, interceptors: [interceptor, ...toArray(options.interceptors)] }
  }
}
