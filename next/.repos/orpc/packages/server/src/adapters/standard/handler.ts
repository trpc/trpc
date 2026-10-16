import type { ErrorMap, Schema } from '@orpc/contract'
import type { Interceptor, Promisable, Value } from '@orpc/shared'
import type { StandardLazyRequest, StandardResponse } from '@standard-server/core'
import type { Context } from '../../context'
import type { ProcedureClientInterceptor } from '../../procedure-client'
import type { StandardHandlerCodec, StandardHandlerCodecResolvedProcedure } from './codec'
import type { StandardHandlerPlugin } from './plugin'
import { ORPCError, toORPCError } from '@orpc/client'
import { getTracer, intercept, isAsyncIteratorObject, matchesHttpPathPrefix, ORPC_NAME, override, recordSpanError, runWithSpan, toArray, toTracingException, traceAsyncIterator, traceReadableStream, value, wrapAsyncIterator, wrapReadableStream } from '@orpc/shared'
import { ErrorEvent, flattenStandardHeader, parseStandardUrl } from '@standard-server/core'
import { createProcedureClient } from '../../procedure-client'
import { CompositeStandardHandlerPlugin } from './plugin'

export interface StandardHandlerHandleOptions<T extends Context> {
  prefix?: `/${string}` | undefined
  /**
   * The initial context, or a function (sync or async) that receives the request and returns it.
   * The function only runs once the request passes the prefix check.
   */
  context: Value<Promisable<T>, [request: StandardLazyRequest]>
}

/**
 * `StandardHandlerHandleOptions` after the context has been resolved,
 * this is what interceptors and codecs receive.
 */
export interface ResolvedStandardHandlerHandleOptions<T extends Context> extends Omit<StandardHandlerHandleOptions<T>, 'context'> {
  context: T
}

export type StandardHandlerHandleResult = { matched: true, response: StandardResponse } | { matched: false, response?: undefined }

export interface StandardHandlerInterceptorOptions<T extends Context> extends StandardHandlerCodecResolvedProcedure, ResolvedStandardHandlerHandleOptions<T> {
  request: StandardLazyRequest
}
export type StandardHandlerInterceptor<T extends Context> = Interceptor<StandardHandlerInterceptorOptions<T>, Promise<StandardResponse>>

export interface StandardHandlerRoutingInterceptorOptions<T extends Context> extends ResolvedStandardHandlerHandleOptions<T> {
  request: StandardLazyRequest
}
export type StandardHandlerRoutingInterceptor<T extends Context> = Interceptor<StandardHandlerRoutingInterceptorOptions<T>, Promise<StandardHandlerHandleResult>>

export interface StandardHandlerOptions<TContext extends Context> {
  /**
   * Fired on every request before routing, useful when you want
   * to intercept all requests regardless of whether they match a procedure or not.
   *
   * @examples
   * - batch plugins - separate one request into multiple and call multiple next
   * - openapi spec plugin - to intercept a request and early response
   */
  routingInterceptors?: StandardHandlerRoutingInterceptor<TContext>[]

  /**
   * interceptor run after routing and before error handler,
   * useful for error handling, logging, metrics, etc.
   */
  interceptors?: StandardHandlerInterceptor<TContext>[]

  /**
   *
   * ClientInterceptor equivalent with createRouterClient.interceptors / createProcedure.interceptors
   * useful for error handling, logging, metrics, etc. (not counting encoding/decoding)
   */
  clientInterceptors?: ProcedureClientInterceptor<TContext, Schema<unknown>, ErrorMap>[]

  plugins?: StandardHandlerPlugin<TContext>[]
}

export class StandardHandler<T extends Context> {
  private readonly routingInterceptors: StandardHandlerOptions<T>['routingInterceptors']
  private readonly interceptors: StandardHandlerOptions<T>['interceptors']
  private readonly clientInterceptors: StandardHandlerOptions<T>['clientInterceptors']

  constructor(
    private readonly codec: StandardHandlerCodec<T>,
    options: StandardHandlerOptions<T>,
  ) {
    options = new CompositeStandardHandlerPlugin([
      ...toArray(options.plugins),
      new TracingHandlerPlugin(),
    ]).init(options)

    this.routingInterceptors = options.routingInterceptors
    this.interceptors = options.interceptors
    this.clientInterceptors = options.clientInterceptors
  }

  async handle(request: StandardLazyRequest, options: StandardHandlerHandleOptions<T>): Promise<StandardHandlerHandleResult> {
    const { prefix } = options

    if (prefix && !matchesHttpPathPrefix(request.url, prefix)) {
      return { matched: false, response: undefined }
    }

    const context = await value(options.context, request) as T

    return intercept(
      this.routingInterceptors,
      { context, prefix, request },
      async ({ context, prefix, request }) => {
        const span = getTracer()?.getActiveSpan()

        let step: 'decode_input' | 'call_procedure' | undefined

        const matchedOrNot = await runWithSpan('find_procedure', () => this.codec.resolveProcedure(request, { context, prefix }))

        if (!matchedOrNot) {
          /**
           * [Semantic conventions for HTTP spans](https://opentelemetry.io/docs/specs/semconv/http/http-spans/)
           */
          span?.updateName(`${ORPC_NAME}_no_match`)
          span?.setAttribute('http.request.method', request.method)
          span?.setAttribute('url.path', request.url)

          return { matched: false }
        }

        const { path, procedure, decodeInput } = matchedOrNot

        /**
         * [Semantic conventions for RPC spans](https://opentelemetry.io/docs/specs/semconv/rpc/rpc-spans/)
         */
        span?.updateName(`${ORPC_NAME}.${path.join('/')}`)
        span?.setAttribute('rpc.system', ORPC_NAME)
        span?.setAttribute('rpc.method', path.join('.'))

        try {
          const response = await intercept(
            this.interceptors,
            { context, prefix, request, path, procedure, decodeInput },

            async ({ context, prefix, request, path, procedure, decodeInput }) => {
              step = 'decode_input'
              let input = await runWithSpan('decode_input', decodeInput)
              step = undefined

              if (getTracer() && isAsyncIteratorObject(input)) {
                /**
                 * @warning
                 * Remember use `override` for AsyncIteratorObject to remain other special properties
                 */
                input = override(input, traceAsyncIterator('consume_async_iterator_object_input', input))
              }

              else if (getTracer() && input instanceof ReadableStream) {
                /**
                 * @warning
                 * Remember use `override` for ReadableStream to remain other special properties
                 */
                input = override(input, traceReadableStream('consume_octet_stream_input', input))
              }

              const client = createProcedureClient(procedure, {
                context,
                path,
                interceptors: this.clientInterceptors,
              })

              /**
               * No need to use `runWithSpan` here, because the client already has its own span.
               */
              step = 'call_procedure'
              const output = await client(input, {
                signal: request.signal,
                lastEventId: flattenStandardHeader(request.headers['last-event-id']),
              })
              step = undefined

              const response = await this.codec.encodeOutput(output, procedure, path, { context, prefix })

              return response
            },
          )

          return { matched: true, response }
        }
        catch (e) {
          /**
           * Only errors that happen outside of the `call_procedure` step should be set as an error.
           * Because a business logic error should not be considered as a protocol-level error.
           */
          if (step !== 'call_procedure') {
            recordSpanError(span, e)
          }

          const error = step === 'decode_input' && !(e instanceof ORPCError)
            ? new ORPCError('BAD_REQUEST', {
                message: `Malformed request. Ensure the request body is properly formatted and the 'Content-Type' header is set correctly.`,
                cause: e,
              })
            : toORPCError(e)

          const response = await this.codec.encodeError(error, procedure, path, { context, prefix })

          return { matched: true, response }
        }
      },
    )
  }
}

export class TracingHandlerPlugin implements StandardHandlerPlugin<any> {
  name = '~tracing'

  init(options: StandardHandlerOptions<any>): StandardHandlerOptions<any> {
    return {
      ...options,
      routingInterceptors: [
        // Should be placed before user-provided interceptors to help them access the current active span.
        async ({ next, request }) => {
          const tracer = getTracer()

          if (!tracer) {
            return next()
          }

          const parent = tracer.extract?.(request.headers)

          /**
           * The search part is excluded because span names should have low cardinality.
           * The name is replaced with the procedure path once the request is routed.
           */
          const [pathname] = parseStandardUrl(request.url)

          return tracer.startActiveSpan(`${request.method} ${pathname}`, parent, async (span) => {
            try {
              const result = await next()

              if (!result.matched) {
                span.end()
                return result
              }

              const body = result.response.body
              if (isAsyncIteratorObject(body)) {
                return {
                  ...result,
                  response: {
                    ...result.response,
                    /**
                     * @remarks
                     * **Warning**: Remember use `override` for remaining special properties
                     */
                    body: override(body, wrapAsyncIterator(body, {
                      runWith: fn => tracer.withActiveSpan(span, fn),
                      onError(error) {
                        /**
                         * Errors here are internal (interceptor/framework) failures,
                         * except `ErrorEvent`: a business error the protocol delivers
                         * inside the event stream, already logged by the client interceptor.
                         */
                        if (!(error instanceof ErrorEvent)) {
                          span.recordException('error', toTracingException(error))
                        }
                      },
                      onFinish() {
                        span.end()
                      },
                    })),
                  },
                }
              }

              if (body instanceof ReadableStream) {
                return {
                  ...result,
                  response: {
                    ...result.response,
                    /**
                     * @remarks
                     * **Warning**: Remember use `override` for remaining special properties
                     */
                    body: override(body, wrapReadableStream(body, {
                      runWith: fn => tracer.withActiveSpan(span, fn),
                      onError(error) {
                        /**
                         * Any error here is internal (interceptor/framework), not business logic.
                         * Indicates unexpected handler failure.
                         */
                        span.recordException('error', toTracingException(error))
                      },
                      onFinish() {
                        span.end()
                      },
                    })),
                  },
                }
              }

              span.end()
              return result
            }
            catch (e) {
              /**
               * Any error here is internal (interceptor/framework), not business logic.
               * Always recorded as an error, even when it is an abort error.
               */
              span.recordException('error', toTracingException(e))
              span.end()
              throw e
            }
          })
        },
        ...toArray(options.routingInterceptors),
      ],
    }
  }
}
