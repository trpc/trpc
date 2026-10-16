import type { Context, ErrorMap, ProcedureClientInterceptor, Schema } from '@orpc/server'
import type { StandardHandlerInterceptor, StandardHandlerOptions, StandardHandlerPlugin, StandardHandlerRoutingInterceptor } from '@orpc/server/standard'
import type { StandardRequest } from '@standard-server/core'
import type { LogLevel, RequestLogger } from 'evlog'
import type { BaseEvlogOptions, FrameworkIntegrationHelpers, FrameworkIntegrationSpec } from 'evlog/toolkit'
import { ORPCError, wrapAsyncIteratorPreservingEventMeta } from '@orpc/client'
import { isAbortError, isAsyncIteratorObject, ORPC_NAME, override, sleep, toArray, wrapReadableStream } from '@orpc/shared'
import { ErrorEvent, flattenStandardHeader, parseStandardUrl } from '@standard-server/core'
import { defineFrameworkIntegration } from 'evlog/toolkit'
import { getLogger, LOGGER_CONTEXT_SYMBOL } from './context'

export interface EvlogHandlerPluginOptions<_T extends Context> extends BaseEvlogOptions {
  /**
   * AsyncLocalStorage instance backing `useLogger()`.
   */
  storage?: FrameworkIntegrationSpec<{ request: StandardRequest }>['storage']

  /**
   * If true, this plugin will log when a request signal is aborted.
   *
   * @default false
   */
  logAbort?: boolean

  /**
   * Customizes the log level for errors thrown from procedures;
   * internal handler failures are always logged at error level.
   * Receives the level applied by default; return it to keep the default behavior:
   * 'info' for abort errors, 'warn' for ORPCError except INTERNAL_SERVER_ERROR, 'error' otherwise.
   *
   * @default (error, level) => level
   */
  procedureErrorLevel?: (error: unknown, level: LogLevel) => LogLevel
}

/**
 * Instruments an oRPC handler with Evlog structured logging, request tracking,
 * and error monitoring.
 *
 * @see {@link https://orpc.dev/docs/integrations/evlog | Evlog Integration}
 */
export class EvlogHandlerPlugin<T extends Context> implements StandardHandlerPlugin<T> {
  name = '~evlog'

  /**
   * - Logging interceptors should run after tracing interceptors
   *   so they execute within the active request span.
   * - Logging interceptors should run after batch interceptors
   *   so they log each individual request instead of the batch request.
   */
  before = ['~tracing', '~batch', '~hibernation']

  private readonly logAbort: Exclude<EvlogHandlerPluginOptions<T>['logAbort'], undefined>
  private readonly procedureErrorLevel: Exclude<EvlogHandlerPluginOptions<T>['procedureErrorLevel'], undefined>
  private readonly integration: FrameworkIntegrationHelpers<{ request: StandardRequest }>
  private readonly evlogOptions: BaseEvlogOptions

  constructor(
    { storage, logAbort, procedureErrorLevel, ...evlogOptions }: EvlogHandlerPluginOptions<T> = {},
  ) {
    this.evlogOptions = evlogOptions
    this.logAbort = logAbort ?? false
    this.procedureErrorLevel = procedureErrorLevel ?? ((_, level) => level)
    this.integration = defineFrameworkIntegration({
      name: ORPC_NAME,
      storage,
      extractRequest: ({ request }) => {
        const [pathname] = parseStandardUrl(request.url)

        return {
          method: request.method,
          path: pathname,
          headers: request.headers,
          requestId: flattenStandardHeader(request.headers['x-request-id']),
        }
      },
      attachLogger: () => {
        /* logger is manually injected into the oRPC context */
      },
    })
  }

  init(options: StandardHandlerOptions<T>): StandardHandlerOptions<T> {
    const routingInterceptor: StandardHandlerRoutingInterceptor<T> = async ({ next, ...interceptorOptions }) => {
      const { skipped, finish, runWith, logger } = this.integration.start(interceptorOptions, this.evlogOptions)

      if (skipped) {
        return next()
      }

      try {
        const result = await runWith(() => next({
          ...interceptorOptions,
          context: {
            ...interceptorOptions.context,
            [LOGGER_CONTEXT_SYMBOL]: logger,
          },
        }))

        if (result.matched) {
          if (isAsyncIteratorObject(result.response.body)) {
            return {
              ...result,
              response: {
                ...result.response,
                /**
                 * @remarks
                 * **Warning**: Remember use `override` for AsyncIteratorObject to remain other special properties
                 */
                body: override(result.response.body, wrapAsyncIteratorPreservingEventMeta(result.response.body, {
                  runWith,
                  onError: (error) => {
                    /**
                     * Errors here are internal (interceptor/framework) failures,
                     * except `ErrorEvent`: a business error the protocol delivers
                     * inside the event stream, already logged by the client interceptor.
                     */
                    if (!(error instanceof ErrorEvent)) {
                      logger.error(toErrorOrString(error))
                    }
                  },
                  onFinish: async () => {
                    await sleep(0) // dealing with "log.error() called after the wide event was emitted"
                    await finish({ status: result.response?.status })
                  },
                })),
              },
            }
          }

          if (result.response.body instanceof ReadableStream) {
            return {
              ...result,
              response: {
                ...result.response,
                /**
                 * @remarks
                 * **Warning**: Remember use `override` for ReadableStream to remain other special properties
                 */
                body: override(result.response.body, wrapReadableStream(result.response.body, {
                  runWith,
                  onError: (error) => {
                    /**
                     * Any error here is internal (interceptor/framework), not business logic.
                     * Indicates unexpected handler failure.
                     */
                    logger.error(toErrorOrString(error))
                  },
                  onFinish: async () => {
                    await sleep(0) // dealing with "log.error() called after the wide event was emitted"
                    await finish({ status: result.response?.status })
                  },
                })),
              },
            }
          }
        }
        else {
          logger.set({ message: 'No procedure matched' })
        }

        await finish({ status: result.response?.status })

        return result
      }
      catch (error) {
        /**
         * Any error here is internal (interceptor/framework), not business logic.
         * Indicates unexpected handler failure.
         */
        logger.error(toErrorOrString(error))
        await finish()
        throw error
      }
    }

    const interceptor: StandardHandlerInterceptor<T> = async ({ next, context, path, request }) => {
      const logger = getLogger(context)
      logger?.set({ rpc: { system: ORPC_NAME, method: path.join('.') } })

      if (this.logAbort) {
        const signal = request.signal

        if (signal?.aborted) {
          logger?.set({
            abort: {
              message: `request was aborted before handling`,
              reason: String(signal.reason),
            },
          })
        }
        else {
          signal?.addEventListener('abort', () => {
            logger?.set({
              abort: {
                reason: String(signal.reason),
                abortedAt: new Date().toISOString(),
              },
            })
          }, { once: true })
        }
      }

      try {
        return await next()
      }
      catch (error) {
        logProcedureError(logger, error, this.procedureErrorLevel)
        throw error
      }
    }

    const clientInterceptor: ProcedureClientInterceptor<T, Schema<unknown>, ErrorMap> = async ({ next, context }) => {
      const logger = getLogger(context)
      const output = await next()

      if (isAsyncIteratorObject(output)) {
        /**
         * @remarks
         * **Warning**: Remember use `override` for AsyncIteratorObject to remain other special properties
         */
        return override(output, wrapAsyncIteratorPreservingEventMeta(output, {
          onError: (error) => {
            logProcedureError(logger, error, this.procedureErrorLevel)
          },
        }))
      }

      if (output instanceof ReadableStream) {
        /**
         * @remarks
         * **Warning**: Remember use `override` for ReadableStream to remain other special properties
         */
        return override(output, wrapReadableStream(output, {
          onError: (error) => {
            logProcedureError(logger, error, this.procedureErrorLevel)
          },
        }))
      }

      return output
    }

    return {
      ...options,
      routingInterceptors: [
        routingInterceptor,
        ...toArray(options.routingInterceptors),
      ],
      interceptors: [
        interceptor,
        ...toArray(options.interceptors),
      ],
      clientInterceptors: [
        clientInterceptor,
        ...toArray(options.clientInterceptors),
      ],
    }
  }
}

function toErrorOrString(error: unknown) {
  if (error instanceof Error) {
    return error
  }

  return String(error)
}

function logProcedureError(
  logger: RequestLogger | undefined,
  error: unknown,
  procedureErrorLevel: Exclude<EvlogHandlerPluginOptions<any>['procedureErrorLevel'], undefined>,
) {
  if (!logger) {
    return
  }

  logger.error(toErrorOrString(error))

  const level = procedureErrorLevel(error, defaultProcedureErrorLevel(error))

  if (level !== 'error') {
    logger.setLevel(level)
  }
}

function defaultProcedureErrorLevel(error: unknown): LogLevel {
  // An abort means the client withdrew the request, not that something failed,
  // so record it as normal operation.
  if (isAbortError(error)) {
    return 'info'
  }

  // A thrown ORPCError is a deliberate business rejection delivered to the client,
  // so keep it reviewable without treating it as a failure. INTERNAL_SERVER_ERROR
  // is the exception: it signals a server-side failure (oRPC itself throws it for
  // failures like output validation), so it stays at error level along with
  // anything unexpected.
  if (error instanceof ORPCError && error.code !== 'INTERNAL_SERVER_ERROR') {
    return 'warn'
  }

  return 'error'
}
