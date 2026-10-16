import type { Promisable, Value } from '@orpc/shared'
import type { StandardHeaders } from '@standard-server/core'
import type { StandardHandlerOptions, StandardHandlerPlugin, StandardHandlerRoutingInterceptor, StandardHandlerRoutingInterceptorOptions } from '../adapters/standard'
import type { Context } from '../context'
import { toArray } from '@orpc/shared'
import { flattenStandardHeader } from '@standard-server/core'

export interface CORSHandlerPluginOptions<T extends Context> {
  /**
   * Configures the `Access-Control-Allow-Origin` header.
   * Can be a string, an array of allowed origins, or a function (optionally async) that returns the allowed origin(s).
   *
   * A function must only return origins it has validated: returning the incoming origin
   * unchecked allows every origin.
   *
   * @default '*'
   */
  origin?: Value<Promisable<string | readonly string[] | null | undefined>, [origin: string, options: StandardHandlerRoutingInterceptorOptions<T>]>

  /**
   * Configures the `Timing-Allow-Origin` header.
   * Can be a string, an array of allowed origins, or a function (optionally async) that returns the allowed origin(s).
   */
  timingOrigin?: Value<Promisable<string | readonly string[] | null | undefined>, [origin: string, options: StandardHandlerRoutingInterceptorOptions<T>]>

  /**
   * Configures the `Access-Control-Allow-Methods` header for preflight requests.
   *
   * @default ['GET', 'HEAD', 'PUT', 'POST', 'DELETE', 'PATCH', 'QUERY']
   */
  allowMethods?: readonly string[]

  /**
   * Configures the `Access-Control-Allow-Headers` header for preflight requests.
   * Falls back to the request's `Access-Control-Request-Headers` if not set.
   * When set, it replaces that fallback, so include every non-safelisted header
   * clients send, such as `Content-Type`.
   */
  allowHeaders?: readonly string[]

  /**
   * Configures the `Access-Control-Max-Age` header (in seconds) for preflight requests.
   */
  maxAge?: number

  /**
   * Configures the `Access-Control-Allow-Credentials` header.
   *
   * When enabled, `origin` must allow trusted origins only: every allowed origin can send
   * authenticated requests as your users and read the responses.
   */
  credentials?: boolean

  /**
   * Configures the `Access-Control-Expose-Headers` header.
   */
  exposeHeaders?: readonly string[]
}

/**
 * Configures the [CORS Policy](https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS)
 * for your API, including preflight requests.
 *
 * @see {@link https://orpc.dev/docs/plugins/cors | CORS Handler Plugin}
 */
export class CORSHandlerPlugin<T extends Context> implements StandardHandlerPlugin<T> {
  private readonly options: CORSHandlerPluginOptions<T>

  name = '~cors'

  /**
   * - Do not create spans for CORS preflight requests.
   * - Run CORS interceptors before batch interceptors so headers are applied to
   *  the actual response rather than sub-responses.
   */
  after = ['~tracing', '~batch']

  constructor(options: CORSHandlerPluginOptions<T> = {}) {
    const defaults: CORSHandlerPluginOptions<T> = {
      origin: '*',
      allowMethods: ['GET', 'HEAD', 'PUT', 'POST', 'DELETE', 'PATCH', 'QUERY'],
    }

    this.options = {
      ...defaults,
      ...options,
    }
  }

  init(options: StandardHandlerOptions<T>): StandardHandlerOptions<T> {
    const corsHeadersInterceptor: StandardHandlerRoutingInterceptor<T> = async (interceptorOptions) => {
      const result = await interceptorOptions.next()

      if (!result.matched) {
        return result
      }

      const resHeaders = { ...result.response.headers }

      const origin = flattenStandardHeader(interceptorOptions.request.headers.origin)

      const allowOrigin = await this.resolveOrigin(this.options.origin, origin, interceptorOptions)
      const timingAllowOrigin = await this.resolveOrigin(this.options.timingOrigin, origin, interceptorOptions)

      if (allowOrigin.value !== undefined) {
        resHeaders['access-control-allow-origin'] = allowOrigin.value
      }

      if (timingAllowOrigin.value !== undefined) {
        resHeaders['timing-allow-origin'] = timingAllowOrigin.value
      }

      if (allowOrigin.varies || timingAllowOrigin.varies) {
        const existingVary = flattenStandardHeader(resHeaders.vary)
        if (!existingVary?.split(',').some(v => v.trim().toLowerCase() === 'origin')) {
          resHeaders.vary = existingVary ? `${existingVary}, Origin` : 'Origin'
        }
      }

      if (this.options.credentials) {
        resHeaders['access-control-allow-credentials'] = 'true'
      }

      if (this.options.exposeHeaders?.length) {
        resHeaders['access-control-expose-headers'] = flattenStandardHeader(this.options.exposeHeaders)
      }

      return { ...result, response: { ...result.response, headers: resHeaders } }
    }

    const preflightInterceptor: StandardHandlerRoutingInterceptor<T> = async (interceptorOptions) => {
      if (interceptorOptions.request.method === 'OPTIONS') {
        const resHeaders: StandardHeaders = {}

        if (this.options.maxAge !== undefined) {
          resHeaders['access-control-max-age'] = this.options.maxAge.toString()
        }

        if (this.options.allowMethods?.length) {
          resHeaders['access-control-allow-methods'] = flattenStandardHeader(this.options.allowMethods)
        }

        const allowHeaders = this.options.allowHeaders ?? interceptorOptions.request.headers['access-control-request-headers']

        if (typeof allowHeaders === 'string' || allowHeaders?.length) {
          resHeaders['access-control-allow-headers'] = flattenStandardHeader(allowHeaders)
        }

        return {
          matched: true,
          response: {
            status: 204,
            headers: resHeaders,
            body: undefined,
          },
        }
      }

      return interceptorOptions.next()
    }

    return {
      ...options,
      routingInterceptors: [
        corsHeadersInterceptor,
        preflightInterceptor,
        ...toArray(options.routingInterceptors),
      ],
    }
  }

  private async resolveOrigin(
    option: CORSHandlerPluginOptions<T>['origin'],
    origin: string | undefined,
    interceptorOptions: StandardHandlerRoutingInterceptorOptions<T>,
  ): Promise<{ value: string | undefined, varies: boolean }> {
    if (typeof option === 'function') {
      if (origin === undefined) {
        return { value: undefined, varies: true }
      }

      const allowed = toArray(await option(origin, interceptorOptions))

      if (allowed.includes('*')) {
        return { value: '*', varies: true }
      }

      return { value: allowed.includes(origin) ? origin : undefined, varies: true }
    }

    const allowed = toArray(await option)

    if (allowed.includes('*')) {
      return { value: '*', varies: false }
    }

    if (origin !== undefined && allowed.includes(origin)) {
      return { value: origin, varies: true }
    }

    return { value: undefined, varies: allowed.length > 0 }
  }
}
