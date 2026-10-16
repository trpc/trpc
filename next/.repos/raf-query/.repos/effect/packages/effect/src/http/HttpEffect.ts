/**
 * Runs Effect HTTP server handlers at platform boundaries.
 *
 * This module turns effects that produce `HttpServerResponse` values into Web
 * `Request` handlers and other server adapters. It also applies middleware,
 * converts failures into responses, runs hooks before a response is sent, and
 * manages request scopes for streamed responses.
 *
 * @stability unstable
 * @since 4.0.0
 */
import type * as Cause from "../Cause.ts"
import * as Context from "../Context.ts"
import * as Effect from "../Effect.ts"
import * as Exit from "../Exit.ts"
import * as Fiber from "../Fiber.ts"
import { constVoid, dual } from "../Function.ts"
import { contA, contE } from "../internal/core.ts"
import { effectIsExit, fiberEnterUninterruptibleUnsafe, reportCauseUnsafe } from "../internal/effect.ts"
import * as Layer from "../Layer.ts"
import * as Scope from "../Scope.ts"
import * as Stream from "../Stream.ts"
import { nativeTracer } from "../Tracer.ts"
import * as HttpBody from "./HttpBody.ts"
import { type HttpMiddleware, isTracerDisabledUnsafe, tracer } from "./HttpMiddleware.ts"
import { causeResponse, ClientAbort, HttpServerError, InternalError } from "./HttpServerError.ts"
import { HttpServerRequest } from "./HttpServerRequest.ts"
import * as Request from "./HttpServerRequest.ts"
import type { HttpServerResponse } from "./HttpServerResponse.ts"
import * as Response from "./HttpServerResponse.ts"
import * as preResponseHandler from "./internal/preResponseHandler.ts"

/**
 * Runs an HTTP server effect, sends the produced response with the supplied handler, and converts failures into HTTP responses.
 * On handler failure, the request scope closes with the original cause.
 *
 * @stability unstable
 * @category combinators
 * @since 4.0.0
 */
export const toHandled = <E, R, EH, RH>(
  self: Effect.Effect<HttpServerResponse, E, R>,
  handleResponse: (
    request: HttpServerRequest,
    response: HttpServerResponse
  ) => Effect.Effect<unknown, EH, RH>,
  middleware?: HttpMiddleware | undefined
): Effect.Effect<void, never, Exclude<R | RH | HttpServerRequest, Scope.Scope>> => {
  const handleCause = (frame: RequestFrame, cause: Cause.Cause<E | EH | HttpServerError>) => {
    frame.cause = cause
    const request = frame.request
    return Effect.flatMapEager(causeResponse(cause), ([response, cause]) => {
      const fiber = Fiber.getCurrent()!
      reportCauseUnsafe(fiber, cause)
      const handler = preResponseHandler.requestPreResponseHandlers.get(request.source)
      const cont = cause.reasons.length === 0 ? Effect.succeed(response) : Effect.failCause(cause)
      if (handler === undefined) {
        ;(request as any)[handledSymbol] = true
        return Effect.flatMapEager(
          handleResponse(request, response),
          () => cont
        )
      }

      return Effect.flatMapEager(
        Effect.flatMapEager(handler(request, response), (response) => {
          ;(request as any)[handledSymbol] = true
          return handleResponse(request, response)
        }),
        () => cont
      )
    })
  }

  // Writes the response, applying any registered pre-response handler first.
  // Returns an `Exit` when the write completes synchronously.
  const sendResponse = (
    request: HttpServerRequest,
    response: HttpServerResponse
  ): Effect.Effect<HttpServerResponse, EH | HttpServerError, RH> => {
    const handler = preResponseHandler.requestPreResponseHandlers.get(request.source)
    if (handler === undefined) {
      ;(request as any)[handledSymbol] = true
      return Effect.mapEager(handleResponse(request, response), () => response)
    }
    return Effect.flatMapEager(handler(request, response), (sentResponse) => {
      ;(request as any)[handledSymbol] = true
      return Effect.mapEager(handleResponse(request, sentResponse), () => response)
    })
  }

  const withMiddleware = (frame: RequestFrame): Effect.Effect<
    unknown,
    E | EH | HttpServerError,
    HttpServerRequest | R | RH
  > => {
    const request = frame.request
    const responded = Effect.matchCauseEffect(self, {
      onSuccess: (response) => sendResponse(request, response),
      onFailure: (cause) => handleCause(frame, cause)
    })
    return middleware === undefined ?
      responded :
      Effect.matchCauseEffect(tracer(middleware(responded)), {
        onFailure(cause): Effect.Effect<void, EH, RH> {
          reportCauseUnsafe(Fiber.getCurrent()!, cause)
          if (handledSymbol in request) return Effect.void
          return Effect.matchCauseEffectEager(causeResponse(cause), {
            onFailure(_) {
              return handleResponse(request, Response.empty({ status: 500 }))
            },
            onSuccess([response]) {
              return handleResponse(request, response)
            }
          })
        },
        onSuccess(response): Effect.Effect<void, EH, RH> {
          return handledSymbol in request ? Effect.void : handleResponse(request, response)
        }
      })
  }

  // Apply tracing lazily so disabled requests can use the single-frame path.
  const traced = (frame: RequestFrame) =>
    tracer(
      withMiddleware(frame) as Effect.Effect<
        HttpServerResponse,
        E | EH | HttpServerError,
        HttpServerRequest | R | RH
      >
    )

  // Handle untraced requests without middleware in one continuation frame.
  // Effectful writes use `finishAfter` to restore state and close the scope.
  const finishAfter = (
    frame: RequestFrame,
    fiber: Fiber.Fiber<unknown, unknown>,
    effect: Effect.Effect<unknown, unknown, unknown>
  ) =>
    Effect.onExitPrimitive(effect, (exit) => {
      fiber.setContext(frame.prev)
      if (scopeEjected in frame.scope) return undefined
      return Scope.closeUnsafe(frame.scope, frame.cause === undefined ? exit : Exit.failCause(frame.cause))
    }, true)

  class RequestFrame {
    readonly scope: Scope.Closeable
    readonly prev: Context.Context<never>
    readonly request: HttpServerRequest
    cause: Cause.Cause<E | EH | HttpServerError> | undefined
    constructor(scope: Scope.Closeable, prev: Context.Context<never>, request: HttpServerRequest) {
      this.scope = scope
      this.prev = prev
      this.request = request
    }
    [contA](response: HttpServerResponse, fiber: Fiber.Fiber<unknown, unknown>) {
      const sent = sendResponse(this.request, response)
      // Most response writes complete synchronously.
      if (effectIsExit(sent) && sent._tag === "Success") {
        fiber.setContext(this.prev)
        if (scopeEjected in this.scope) return sent
        const closed = Scope.closeUnsafe(this.scope, sent)
        return closed === undefined ? sent : Effect.flatMap(closed, () => sent)
      }
      return finishAfter(this, fiber, sent)
    }
    [contE](cause: Cause.Cause<E | EH | HttpServerError>, fiber: Fiber.Fiber<unknown, unknown>) {
      return finishAfter(this, fiber, handleCause(this, cause))
    }
  }

  return Effect.withFiber((fiber) => {
    fiberEnterUninterruptibleUnsafe(fiber)
    const scope = Scope.makeUnsafe()
    const frame = new RequestFrame(scope, fiber.context, Context.getUnsafe(fiber.context, HttpServerRequest))
    fiber.setContext(Context.add(frame.prev, Scope.Scope, scope))
    // The native tracer has no backend, so its spans are unobservable.
    const currentTracer = fiber.cache.tracer
    if (
      middleware === undefined &&
      (currentTracer === undefined || currentTracer === nativeTracer || isTracerDisabledUnsafe(fiber, frame.request))
    ) {
      ;(fiber as any)._stack.push(frame)
      return self
    }
    return finishAfter(frame, fiber, middleware === undefined ? traced(frame) : withMiddleware(frame))
  }) as any
}

const handledSymbol = Symbol.for("effect/http/HttpEffect/handled")

/**
 * Disables automatic closing for an HTTP request scope.
 *
 * **Gotchas**
 *
 * Use only when another owner will close the scope; otherwise resources attached
 * to the request scope can leak.
 *
 * @stability unstable
 * @category resource management
 * @since 4.0.0
 */
export const scopeDisableClose = (scope: Scope.Scope): void => {
  ;(scope as any)[scopeEjected] = true
}

/**
 * Returns a streaming server response that closes the request scope when the body stream exits.
 *
 * @stability unstable
 * @category resource management
 * @since 4.0.0
 */
export const scopeTransferToStream = (
  response: HttpServerResponse
): HttpServerResponse => {
  if (response.body._tag !== "Stream") {
    return response
  }
  const fiber = Fiber.getCurrent()!
  const scope = Context.getUnsafe(fiber.context, Scope.Scope) as Scope.Closeable
  scopeDisableClose(scope)
  return Response.setBodyKeepHeaders(
    response,
    HttpBody.stream(
      Stream.onExit(response.body.stream, (exit) => Scope.close(scope, exit)),
      response.body.contentType,
      response.body.contentLength
    )
  )
}

const scopeEjected = Symbol.for("effect/http/HttpEffect/scopeEjected")

/**
 * Function run with the current request and response just before the response is sent, allowing the response to be replaced or failing with `HttpServerError`.
 *
 * @stability unstable
 * @category handlers
 * @since 4.0.0
 */
export type PreResponseHandler = (
  request: HttpServerRequest,
  response: HttpServerResponse
) => Effect.Effect<HttpServerResponse, HttpServerError>

/**
 * Registers an additional pre-response handler for the current HTTP server request.
 *
 * @stability unstable
 * @category handlers
 * @since 4.0.0
 */
export const appendPreResponseHandler = (handler: PreResponseHandler): Effect.Effect<void, never, HttpServerRequest> =>
  HttpServerRequest.use((request) => {
    appendPreResponseHandlerUnsafe(request, handler)
    return Effect.void
  })

/**
 * Registers a pre-response handler for the supplied HTTP server request.
 *
 * @stability unstable
 * @category unsafe
 * @since 4.0.0
 */
export const appendPreResponseHandlerUnsafe: (
  request: HttpServerRequest,
  handler: PreResponseHandler
) => void = preResponseHandler.appendPreResponseHandlerUnsafe

/**
 * Runs an effect after registering a pre-response handler for the current HTTP server request.
 *
 * @stability unstable
 * @category handlers
 * @since 4.0.0
 */
export const withPreResponseHandler: {
  (handler: PreResponseHandler): <A, E, R>(self: Effect.Effect<A, E, R>) => Effect.Effect<A, E, R | HttpServerRequest>
  <A, E, R>(self: Effect.Effect<A, E, R>, handler: PreResponseHandler): Effect.Effect<A, E, R | HttpServerRequest>
} = dual<
  (
    handler: PreResponseHandler
  ) => <A, E, R>(self: Effect.Effect<A, E, R>) => Effect.Effect<A, E, R | HttpServerRequest>,
  <A, E, R>(self: Effect.Effect<A, E, R>, handler: PreResponseHandler) => Effect.Effect<A, E, R | HttpServerRequest>
>(2, (self, handler) =>
  HttpServerRequest.use((request) => {
    appendPreResponseHandlerUnsafe(request, handler)
    return self
  }))

/**
 * Converts an HTTP server effect into a Web `Request` handler using the supplied base context and optional middleware.
 *
 * @stability unstable
 * @category converting
 * @since 4.0.0
 */
export const toWebHandlerWith = <Provided, R = never, ReqR = Exclude<R, Provided | Scope.Scope | HttpServerRequest>>(
  context: Context.Context<Provided>
) =>
<E>(
  self: Effect.Effect<HttpServerResponse, E, R>,
  middleware?: HttpMiddleware | undefined
): [ReqR] extends [never] ?
  (request: Request, context?: Context.Context<never> | undefined) => Promise<globalThis.Response>
  : (request: Request, context: Context.Context<ReqR>) => Promise<globalThis.Response> =>
{
  const resolveSymbol = Symbol.for("@effect/platform/HttpApp/resolve")
  const httpApp = toHandled(self, (request, response) => {
    const withoutBody = request.method === "HEAD"
    if (!Response.omitsBody(response, withoutBody)) {
      response = scopeTransferToStream(response)
    }
    ;(request as any)[resolveSymbol](
      Response.toWeb(response, { withoutBody, context })
    )
    return Effect.void
  }, middleware)
  return (request: Request, _context?: Context.Context<never> | undefined): Promise<globalThis.Response> =>
    new Promise((resolve) => {
      let reqContext = context
      if (Context.isContext(_context)) {
        for (const [key, value] of _context.mapUnsafe) {
          reqContext = Context.addUnsafe(reqContext, key, value)
        }
      }
      const httpServerRequest = Request.fromWeb(request)
      reqContext = Context.add(reqContext, HttpServerRequest, httpServerRequest)
      ;(httpServerRequest as any)[resolveSymbol] = resolve
      const fiber = Effect.runForkWith(reqContext)(httpApp as any)
      if (fiber.pollUnsafe() === undefined) {
        request.signal?.addEventListener("abort", () => {
          fiber.interruptUnsafe(undefined, ClientAbort.annotation)
        }, { once: true })
      }
    })
}

/**
 * Converts an HTTP server effect into a Web `Request` handler using an empty base context.
 *
 * @stability unstable
 * @category converting
 * @since 4.0.0
 */
export const toWebHandler: <E>(
  self: Effect.Effect<HttpServerResponse, E, HttpServerRequest | Scope.Scope>,
  middleware?: HttpMiddleware | undefined
) => (request: Request, context?: Context.Context<never> | undefined) => Promise<globalThis.Response> =
  toWebHandlerWith(Context.empty())

/**
 * Builds a Web `Request` handler from a layer and handler factory, returning the handler with a `dispose` function for the layer scope.
 *
 * **Details**
 *
 * The layer is built immediately, so the cost is paid when the handler is
 * created rather than on the first request. A layer that performs asynchronous
 * work while building may still be in progress when the first request arrives,
 * in which case that request waits for the build to finish. If the build fails,
 * every request rejects with the build error.
 *
 * @stability unstable
 * @category converting
 * @since 4.0.0
 */
export const toWebHandlerLayerWith = <
  E,
  Provided,
  LE,
  R,
  ReqR = Exclude<R, Provided | Scope.Scope | HttpServerRequest>
>(
  layer: Layer.Layer<Provided, LE>,
  options: {
    readonly toHandler: (
      context: Context.Context<Provided>
    ) => Effect.Effect<Effect.Effect<HttpServerResponse, E, R>, LE>
    readonly middleware?: HttpMiddleware | undefined
    readonly memoMap?: Layer.MemoMap | undefined
  }
): {
  readonly dispose: () => Promise<void>
  readonly handler: [ReqR] extends [never] ? (
      request: Request,
      context?: Context.Context<never> | undefined
    ) => Promise<globalThis.Response>
    : (
      request: Request,
      context: Context.Context<ReqR>
    ) => Promise<globalThis.Response>
} => {
  const scope = Scope.makeUnsafe()
  const dispose = () => Effect.runPromise(Scope.close(scope, Exit.void))

  let handlerCache:
    | ((request: Request, context?: Context.Context<ReqR> | undefined) => Promise<globalThis.Response>)
    | undefined
  const handlerPromise = Effect.runPromise(Effect.gen(function*() {
    const context = yield* (options.memoMap
      ? Layer.buildWithMemoMap(layer, options.memoMap, scope)
      : Layer.buildWithScope(layer, scope))
    return handlerCache = toWebHandlerWith<Provided, R>(context)(
      yield* options.toHandler(context),
      options.middleware
    ) as any
  }))
  // A failed build must not become an unhandled rejection at startup. Every
  // request still rejects with the build error below.
  handlerPromise.catch(constVoid)
  function handler(
    request: Request,
    context?: Context.Context<ReqR> | undefined
  ): Promise<globalThis.Response> {
    if (handlerCache) {
      return handlerCache(request, context)
    }
    return handlerPromise.then((f) => f(request, context))
  }
  return { dispose, handler: handler as any } as const
}

/**
 * Builds a Web `Request` handler for an HTTP server effect using a layer to provide its services, returning the handler with a `dispose` function.
 *
 * **Details**
 *
 * The layer is built immediately, so the cost is paid when the handler is
 * created rather than on the first request. A layer that performs asynchronous
 * work while building may still be in progress when the first request arrives,
 * in which case that request waits for the build to finish. If the build fails,
 * every request rejects with the build error.
 *
 * @stability unstable
 * @category converting
 * @since 4.0.0
 */
export const toWebHandlerLayer = <E, R, Provided, LE, ReqR = Exclude<R, Provided | Scope.Scope | HttpServerRequest>>(
  self: Effect.Effect<HttpServerResponse, E, R>,
  layer: Layer.Layer<Provided, LE>,
  options?: {
    readonly middleware?: HttpMiddleware | undefined
    readonly memoMap?: Layer.MemoMap | undefined
  } | undefined
): {
  readonly dispose: () => Promise<void>
  readonly handler: [ReqR] extends [never]
    ? (request: Request, context?: Context.Context<never> | undefined) => Promise<globalThis.Response>
    : (
      request: Request,
      context: Context.Context<ReqR>
    ) => Promise<globalThis.Response>
} =>
  toWebHandlerLayerWith(layer, {
    ...options,
    toHandler: () => Effect.succeed(self)
  })

/**
 * Adapts a Web `Request` handler into an HTTP server effect for the current `HttpServerRequest`.
 *
 * @stability unstable
 * @category converting
 * @since 4.0.0
 */
export const fromWebHandler = (
  handler: (request: Request) => Promise<Response>
): Effect.Effect<HttpServerResponse, HttpServerError, HttpServerRequest> =>
  Effect.callback((resume, signal) => {
    const fiber = Fiber.getCurrent()!
    const request = Context.getUnsafe(fiber.context, HttpServerRequest)
    const requestResult = Request.toWebResult(request, {
      signal,
      context: fiber.context
    })
    if (requestResult._tag === "Failure") {
      return resume(Effect.fail(new HttpServerError({ reason: requestResult.failure })))
    }
    handler(requestResult.success).then(
      (response) => resume(Effect.succeed(Response.fromWeb(response))),
      (cause) =>
        resume(Effect.fail(
          new HttpServerError({
            reason: new InternalError({
              cause,
              request,
              description: "HttpApp.fromWebHandler: Error in handler"
            })
          })
        ))
    )
  })
