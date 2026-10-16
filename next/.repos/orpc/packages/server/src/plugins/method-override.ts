import type { StandardMethod, StandardUrl } from '@standard-server/core'
import type { StandardHandlerOptions, StandardHandlerPlugin, StandardHandlerRoutingInterceptor } from '../adapters/standard'
import type { Context } from '../context'
import { toArray } from '@orpc/shared'
import { parseStandardUrl } from '@standard-server/core'

export interface MethodOverrideHandlerPluginOptions {
  /**
   * The query parameter carrying the override method.
   *
   * @default 'method'
   */
  param?: string

  /**
   * The methods a POST request may be overridden to.
   *
   * GET and HEAD are excluded by default because they switch input decoding
   * from the request body to the query string and widen the CSRF surface.
   *
   * @default ['PUT', 'PATCH', 'DELETE']
   */
  methods?: readonly StandardMethod[]
}

/**
 * Overrides the HTTP method of a POST request based on a query parameter,
 * so HTML forms (which only support GET and POST) can invoke procedures
 * routed as PUT, PATCH, or DELETE.
 *
 * @see {@link https://orpc.dev/docs/plugins/method-override | Method Override Plugin}
 */
export class MethodOverrideHandlerPlugin<T extends Context> implements StandardHandlerPlugin<T> {
  name = '~method-override'

  /**
   * Should override batch sub-request methods, not the original batch request.
   */
  before = ['~batch']

  private readonly param: string
  private readonly methods: ReadonlySet<string>

  constructor(options: MethodOverrideHandlerPluginOptions = {}) {
    this.param = options.param ?? 'method'
    this.methods = new Set((options.methods ?? ['PUT', 'PATCH', 'DELETE']).map(method => method.toUpperCase()))
  }

  init(options: StandardHandlerOptions<T>): StandardHandlerOptions<T> {
    const routingInterceptor: StandardHandlerRoutingInterceptor<T> = async ({ next, ...interceptorOptions }) => {
      const { request } = interceptorOptions

      if (request.method !== 'POST') {
        return next()
      }

      const [pathname, search, hash] = parseStandardUrl(request.url)
      const params = new URLSearchParams(search)
      const raw = params.getAll(this.param).at(-1)

      if (raw === undefined) {
        return next()
      }

      const method = raw.toUpperCase()

      if (!this.methods.has(method)) {
        return next()
      }

      params.delete(this.param)
      const url = `${pathname}${params.size ? `?${params}` : ''}${hash ?? ''}` as StandardUrl

      return next({
        ...interceptorOptions,
        request: { ...request, method, url },
      })
    }

    return {
      ...options,
      routingInterceptors: [routingInterceptor, ...toArray(options.routingInterceptors)],
    }
  }
}
