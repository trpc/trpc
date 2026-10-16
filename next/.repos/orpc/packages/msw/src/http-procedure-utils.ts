import type { AnyORPCError } from '@orpc/client'
import type { AnyProcedureContract, AnySchema, ErrorMap, InferSchemaInput, InferSchemaOutput, ORPCErrorConstructorMap } from '@orpc/contract'
import type { Context, ProcedureConfig, ProcedureHandler, Router } from '@orpc/server'
import type { FetchHandler, FetchHandlerHandleResult } from '@orpc/server/fetch'
import type { Promisable, Value } from '@orpc/shared'
import type { HttpHandler, HttpRequestResolverExtras, PathParams, ResponseResolverInfo } from 'msw'
import { implement } from '@orpc/server'
import { value } from '@orpc/shared'
import { http, passthrough } from 'msw'

export type HTTPProcedureUtilsOptions<TContext extends Context>
  = & ProcedureConfig
    & {
    /**
     * The origin requests are matched against. Supports MSW wildcards.
     * Set `''` to match only same-origin requests in the browser.
     *
     * @default '*'
     */
      origin?: string

      /**
       * The path prefix procedures are served under, matching the `prefix`
       * the corresponding handler is mounted at in production.
       */
      prefix?: `/${string}`

      /**
       * Creates the fetch handler that serves each mock, using the same
       * configuration as your production handler, such as plugins. Requests are
       * matched entirely by the created handler, so any protocol works.
       *
       * The router passed in contains only the procedure being mocked. Requests
       * the created handler does not match fall through to other MSW handlers.
       *
       * @see {@link https://orpc.dev/docs/integrations/msw#advanced-configuration | MSW Integration - Advanced Configuration}
       */
      handler: (router: Router<TContext>) => NoInfer<FetchHandler<TContext>>
    }
    & (object extends TContext ? {
    /**
     * The context passed to the created handler for each request, resolved
     * with the MSW resolver information. Mock handlers receive it as
     * `context`, enabling context-driven behaviors such as the Response
     * Headers Plugin.
     *
     * Optional when an empty object can satisfy the context type,
     * required otherwise.
     *
     * @see {@link https://orpc.dev/docs/integrations/msw#advanced-configuration | MSW Integration - Advanced Configuration}
     */
      context?: Value<Promisable<TContext>, [info: ResponseResolverInfo<HttpRequestResolverExtras<PathParams>>]>
    } : {
    /**
     * The context passed to the created handler for each request, resolved
     * with the MSW resolver information. Mock handlers receive it as
     * `context`, enabling context-driven behaviors such as the Response
     * Headers Plugin.
     *
     * Optional when an empty object can satisfy the context type,
     * required otherwise.
     *
     * @see {@link https://orpc.dev/docs/integrations/msw#advanced-configuration | MSW Integration - Advanced Configuration}
     */
      context: Value<Promisable<TContext>, [info: ResponseResolverInfo<HttpRequestResolverExtras<PathParams>>]>
    })

/**
 * Creates typed MSW HTTP request handlers for a procedure-contract. Requests
 * are matched and served by a real fetch handler, so routing, serialization,
 * validation, and error envelopes always match the production handler.
 *
 * @see {@link https://orpc.dev/docs/integrations/msw | MSW Integration}
 */
export class HTTPProcedureUtils<
  TContext extends Context,
  TInputSchema extends AnySchema,
  TOutputSchema extends AnySchema,
  TErrorMap extends ErrorMap,
> {
  /**
   * Matches every request under `origin` + `prefix`, the created fetch
   * handler decides whether a request targets this procedure.
   */
  private readonly mswPathPredicate: string

  private readonly prefix: `/${string}` | undefined

  constructor(
    private readonly contract: AnyProcedureContract,
    private readonly path: readonly string[],
    private readonly options: HTTPProcedureUtilsOptions<TContext>,
  ) {
    const origin = this.options.origin ?? '*'
    this.prefix = this.options.prefix === undefined
      ? undefined
      : `/${this.options.prefix.replace(/\/+$/, '').slice(1)}`

    const base = `${origin}${this.prefix === undefined || this.prefix === '/' ? '' : this.prefix}`
    this.mswPathPredicate = base === '*' ? '*' : `${base}/*`
  }

  /**
   * Creates an MSW request handler that resolves the procedure with the given
   * mock implementation.
   *
   * @see {@link https://orpc.dev/docs/integrations/msw#mocking-procedures | MSW Integration - Mocking Procedures}
   */
  handler(
    handler: ProcedureHandler<
      TContext,
      InferSchemaOutput<TInputSchema>,
      AnyORPCError | InferSchemaInput<TOutputSchema>,
      ORPCErrorConstructorMap<TErrorMap>
    >,
  ): HttpHandler {
    const procedure = implement(this.contract, {
      disableInputValidation: this.options.disableInputValidation,
      disableOutputValidation: this.options.disableOutputValidation,
    }).handler(handler as ProcedureHandler<any, any, any, any>)

    return this.toMSWHandler(procedure, ({ matched, response }) => matched ? response : undefined)
  }

  /**
   * Creates an MSW request handler that rejects the procedure with an error
   * defined in the contract, serialized exactly like a server-thrown error.
   *
   * @see {@link https://orpc.dev/docs/integrations/msw#mocking-errors | MSW Integration - Mocking Errors}
   */
  error<TCode extends keyof TErrorMap>(
    code: TCode,
    ...rest: Parameters<ORPCErrorConstructorMap<TErrorMap>[TCode]>
  ): HttpHandler {
    return this.handler(({ errors }) => {
      throw (errors[code] as unknown as (...rest: unknown[]) => AnyORPCError)(...rest)
    })
  }

  /**
   * Creates an MSW request handler that never resolves, useful for testing
   * loading states. It rejects once the request is aborted, releasing the
   * pending request's resources.
   *
   * @see {@link https://orpc.dev/docs/integrations/msw#mocking-loading-states | MSW Integration - Mocking Loading States}
   */
  loading(): HttpHandler {
    return this.handler(({ signal }) => new Promise<never>((_, reject) => {
      if (signal?.aborted) {
        reject(signal.reason)
        return
      }

      signal?.addEventListener('abort', () => reject(signal.reason), { once: true })
    }))
  }

  /**
   * Creates an MSW request handler that performs matching requests against
   * the real server as-is, useful to exempt a procedure from mocking.
   *
   * @see {@link https://orpc.dev/docs/integrations/msw#passthrough | MSW Integration - Passthrough}
   */
  passthrough(): HttpHandler {
    /**
     * A no-op implementation used purely to decide whether the request
     * targets this procedure, its response is discarded.
     */
    const procedure = implement(this.contract, {
      disableInputValidation: true,
      disableOutputValidation: true,
    }).handler(() => undefined)

    return this.toMSWHandler(procedure, ({ matched }) => matched ? passthrough() : undefined, true)
  }

  /**
   * Serves the procedure through the fetch handler created by the `handler`
   * option and resolves the MSW response from its result.
   */
  private toMSWHandler(
    procedure: Router<TContext>,
    resolve: (result: FetchHandlerHandleResult) => Response | undefined,
    /**
     * Passthrough re-sends the original request to the real server, so the
     * matching attempt must consume a clone instead of the original.
     */
    cloneRequest = false,
  ): HttpHandler {
    const router = this.path.reduceRight<Router<TContext>>(
      (acc, segment) => ({ [segment]: acc }),
      procedure,
    )

    const fetchHandler = this.options.handler(router)

    return http.all(this.mswPathPredicate, async (info) => {
      const context = (await value(this.options.context, info) ?? {}) as TContext

      /**
       * Matching never reads the body, so unmatched requests fall through
       * intact. Serving a matched request consumes the body like any MSW
       * resolver, clone the request in `context` if you need to read it.
       */
      const result = await fetchHandler.handle(cloneRequest ? info.request.clone() : info.request, {
        prefix: this.prefix,
        context,
      })

      return resolve(result)
    })
  }
}
