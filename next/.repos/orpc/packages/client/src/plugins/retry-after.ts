import type { Value } from '@orpc/shared'
import type { StandardLazyResponse } from '@standard-server/core'
import type { StandardLinkOptions, StandardLinkPlugin, StandardLinkTransportInterceptor, StandardLinkTransportInterceptorOptions } from '../adapters/standard'
import type { ClientContext } from '../types'
import { isAsyncIteratorObject, sleep, toArray, value } from '@orpc/shared'
import { flattenStandardHeader } from '@standard-server/core'
import { COMMON_ERROR_STATUS_MAP } from '../error'

export interface RetryAfterLinkPluginOptions<T extends ClientContext> {
  /**
   * Override condition to determine whether to retry or not.
   *
   * @default ((response) => response.status === 429 || response.status === 503)
   */
  condition?: Value<boolean, [
    response: StandardLazyResponse,
    options: StandardLinkTransportInterceptorOptions<T>,
  ]>

  /**
   * Maximum attempts before giving up retries.
   *
   * @default 3
   */
  maxAttempts?: Value<number, [
    response: StandardLazyResponse,
    options: StandardLinkTransportInterceptorOptions<T>,
  ]>

  /**
   * Maximum timeout in milliseconds to wait before giving up retries.
   *
   * @default 5 * 60 * 1000 (5 minutes)
   */
  timeout?: Value<number, [
    response: StandardLazyResponse,
    options: StandardLinkTransportInterceptorOptions<T>,
  ]>
}

/**
 * The Retry After Link Plugin automatically retries requests based on server `retry-after` header.
 * This is particularly useful for handling rate limiting and temporary server unavailability.
 *
 * @remarks
 * **Note**: Requests with a stream or async iterator body are never retried, since the body cannot be resent.
 *
 * @see {@link https://orpc.dev/docs/plugins/retry-after | Retry After Plugin}
 */
export class RetryAfterLinkPlugin<T extends ClientContext> implements StandardLinkPlugin<T> {
  private readonly condition: Exclude<RetryAfterLinkPluginOptions<T>['condition'], undefined>
  private readonly maxAttempts: Exclude<RetryAfterLinkPluginOptions<T>['maxAttempts'], undefined>
  private readonly timeout: Exclude<RetryAfterLinkPluginOptions<T>['timeout'], undefined>

  name = '~retry-after'

  constructor(options: RetryAfterLinkPluginOptions<T> = {}) {
    this.condition = options.condition ?? (
      response =>
        response.status === COMMON_ERROR_STATUS_MAP.TOO_MANY_REQUESTS
        || response.status === COMMON_ERROR_STATUS_MAP.SERVICE_UNAVAILABLE
    )

    this.maxAttempts = options.maxAttempts ?? 3
    this.timeout = options.timeout ?? 5 * 60 * 1000 // 5 minutes
  }

  init(options: StandardLinkOptions<T>): StandardLinkOptions<T> {
    const interceptor: StandardLinkTransportInterceptor<T> = async (interceptorOptions) => {
      const { body } = interceptorOptions.request

      /**
       * A stream or iterator body is consumed by the first attempt and cannot be resent,
       * so return its response as-is instead of retrying with an empty or locked body.
       */
      if (body instanceof ReadableStream || isAsyncIteratorObject(body)) {
        return interceptorOptions.next()
      }

      const startTime = Date.now()
      let attemptCount = 0

      while (true) {
        attemptCount++

        const response = await interceptorOptions.next()

        if (!value(this.condition, response, interceptorOptions)) {
          return response
        }

        const retryAfterHeader = flattenStandardHeader(response.headers['retry-after'])
        const retryAfterMs = parseRetryAfterHeader(retryAfterHeader)
        if (retryAfterMs === undefined) {
          return response
        }

        if (attemptCount >= value(this.maxAttempts, response, interceptorOptions)) {
          return response
        }

        const timeoutMs = value(this.timeout, response, interceptorOptions)
        const elapsedTime = Date.now() - startTime
        if (elapsedTime + retryAfterMs > timeoutMs) {
          return response
        }

        try {
          await sleep(retryAfterMs, { signal: interceptorOptions.signal })
        }
        catch {
          // can throw if the signal is aborted while sleeping
        }

        if (interceptorOptions.signal?.aborted) {
          return response
        }
      }
    }

    return { ...options, transportInterceptors: [interceptor, ...toArray(options.transportInterceptors)] }
  }
}

function parseRetryAfterHeader(value: string | undefined): number | undefined {
  value = value?.trim()

  if (!value) {
    return undefined
  }

  const seconds = Number(value)
  if (Number.isFinite(seconds)) {
    return Math.max(0, seconds * 1000)
  }

  const retryDate = Date.parse(value)
  if (!Number.isNaN(retryDate)) {
    return Math.max(0, retryDate - Date.now())
  }

  return undefined
}
