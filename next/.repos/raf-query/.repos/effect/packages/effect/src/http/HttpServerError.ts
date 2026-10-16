/**
 * Describes failures raised while handling HTTP server requests.
 *
 * `HttpServerError` covers failures that happen while accepting a request,
 * matching a route, running a handler, or building and sending a response.
 * Request-scoped failures keep the request that caused them, and response
 * failures keep the response being produced. This module also includes helpers
 * for turning failed causes or exits into HTTP responses and an annotation for
 * interrupts caused by client aborts.
 *
 * @stability unstable
 * @since 4.0.0
 */
import * as Cause from "../Cause.ts"
import * as Context from "../Context.ts"
import * as Data from "../Data.ts"
import * as Effect from "../Effect.ts"
import * as ErrorReporter from "../ErrorReporter.ts"
import type * as Exit from "../Exit.ts"
import { constUndefined } from "../Function.ts"
import * as Option from "../Option.ts"
import { hasProperty } from "../Predicate.ts"
import type * as Request from "./HttpServerRequest.ts"
import * as Respondable from "./HttpServerRespondable.ts"
import * as Response from "./HttpServerResponse.ts"

const TypeId = "~effect/http/HttpServerError"

/**
 * Tagged error for failures that occur while handling an HTTP server request.
 *
 * **Details**
 *
 * It wraps a `HttpServerErrorReason`, exposes the associated request and optional
 * response, and can be converted to an HTTP response through the `Respondable`
 * protocol.
 *
 * @stability unstable
 * @category errors
 * @since 4.0.0
 */
export class HttpServerError extends Data.TaggedError("HttpServerError")<{
  readonly reason: HttpServerErrorReason
}> implements Respondable.Respondable {
  constructor(props: {
    readonly reason: HttpServerErrorReason
  }) {
    if ("cause" in props.reason) {
      super({
        ...props,
        cause: props.reason.cause
      } as any)
    } else {
      super(props)
    }
  }

  readonly [TypeId] = TypeId

  override stack = `${this.name}: ${this.message}`

  get request(): Request.HttpServerRequest {
    return this.reason.request
  }

  get response(): Response.HttpServerResponse | undefined {
    return "response" in this.reason ? this.reason.response : undefined
  }

  [Respondable.symbol]() {
    return this.reason[Respondable.symbol]()
  }

  override get [ErrorReporter.ignore](): boolean {
    return this.reason[ErrorReporter.ignore] ?? false
  }

  override get message(): string {
    return this.reason.message
  }
}

/**
 * Error describing a failure to parse or read an incoming request.
 *
 * **Details**
 *
 * When converted to a response it produces an empty `400` response.
 *
 * @stability unstable
 * @category errors
 * @since 4.0.0
 */
export class RequestParseError extends Data.TaggedError("RequestParseError")<{
  readonly request: Request.HttpServerRequest
  readonly description?: string
  readonly cause?: unknown
}> implements Respondable.Respondable {
  /**
   * Converts the request error into a `400 Bad Request` response.
   *
   * @stability unstable
   * @since 4.0.0
   */
  [Respondable.symbol]() {
    return Effect.succeed(Response.empty({ status: 400 }))
  }

  get methodAndUrl() {
    return `${this.request.method} ${this.request.url}`
  }

  override get message() {
    return formatRequestMessage(this._tag, this.description, this.methodAndUrl)
  }
}

/**
 * Error indicating that no route matched the incoming request.
 *
 * **Details**
 *
 * When converted to a response it produces an empty `404` response, and it is
 * ignored by the error reporter.
 *
 * @stability unstable
 * @category errors
 * @since 4.0.0
 */
export class RouteNotFound extends Data.TaggedError("RouteNotFound")<{
  readonly request: Request.HttpServerRequest
  readonly description?: string
  readonly cause?: unknown
}> implements Respondable.Respondable {
  [Respondable.symbol]() {
    return Effect.succeed(Response.empty({ status: 404 }))
  }

  override readonly [ErrorReporter.ignore] = true

  get methodAndUrl() {
    return `${this.request.method} ${this.request.url}`
  }

  override get message() {
    return formatRequestMessage(this._tag, this.description, this.methodAndUrl)
  }
}

/**
 * Error describing an unexpected server-side failure while handling a request.
 *
 * **Details**
 *
 * When converted to a response it produces an empty `500` response.
 *
 * @stability unstable
 * @category errors
 * @since 4.0.0
 */
export class InternalError extends Data.TaggedError("InternalError")<{
  readonly request: Request.HttpServerRequest
  readonly description?: string
  readonly cause?: unknown
}> implements Respondable.Respondable {
  /**
   * Converts the server error into a `500 Internal Server Error` response.
   *
   * @stability unstable
   * @since 4.0.0
   */
  [Respondable.symbol]() {
    return Effect.succeed(Response.empty({ status: 500 }))
  }

  get methodAndUrl() {
    return `${this.request.method} ${this.request.url}`
  }

  override get message() {
    return formatRequestMessage(this._tag, this.description, this.methodAndUrl)
  }
}

/**
 * Returns `true` when the supplied value is an `HttpServerError`.
 *
 * @stability unstable
 * @category guards
 * @since 4.0.0
 */
export const isHttpServerError = (u: unknown): u is HttpServerError => hasProperty(u, TypeId)

/**
 * Error describing a failure related to an HTTP response.
 *
 * **Details**
 *
 * It carries the request and response involved in the failure. When converted to
 * a response it produces an empty `500` response.
 *
 * @stability unstable
 * @category errors
 * @since 4.0.0
 */
export class ResponseError extends Data.TaggedError("ResponseError")<{
  readonly request: Request.HttpServerRequest
  readonly response: Response.HttpServerResponse
  readonly description?: string
  readonly cause?: unknown
}> implements Respondable.Respondable {
  [Respondable.symbol]() {
    return Effect.succeed(Response.empty({ status: 500 }))
  }

  get methodAndUrl() {
    return `${this.request.method} ${this.request.url}`
  }

  override get message() {
    const info = `${this._tag} (${this.response.status} ${this.methodAndUrl})`
    return this.description ? `${info}: ${this.description}` : info
  }
}

/**
 * Union of errors that are tied directly to an incoming server request.
 *
 * @stability unstable
 * @category errors
 * @since 4.0.0
 */
export type RequestError = RequestParseError | RouteNotFound | InternalError

/**
 * Reason carried by an `HttpServerError`, either a request-level error or a response-level error.
 *
 * @stability unstable
 * @category errors
 * @since 4.0.0
 */
export type HttpServerErrorReason = RequestError | ResponseError

/**
 * Error wrapping a low-level failure from the HTTP server implementation.
 *
 * @stability unstable
 * @category errors
 * @since 4.0.0
 */
export class ServeError extends Data.TaggedError("ServeError")<{
  readonly cause: unknown
}> {}

/**
 * Context annotation used to mark an interrupt as caused by the client aborting
 * the request.
 *
 * **Details**
 *
 * `causeResponse` uses this annotation to map a pure client abort to a `499`
 * response instead of a server abort response.
 *
 * @stability unstable
 * @category services
 * @since 4.0.0
 */
export class ClientAbort extends Context.Service<ClientAbort, true>()("effect/http/HttpServerError/ClientAbort") {
  static annotation = this.context(true).pipe(
    Context.add(Cause.StackTrace, {
      name: "ClientAbort",
      stack: constUndefined,
      parent: undefined
    })
  )
}

const formatRequestMessage = (reason: string, description: string | undefined, info: string) => {
  const prefix = `${reason} (${info})`
  return description ? `${prefix}: ${description}` : prefix
}

/**
 * Converts a failed handler cause into the HTTP response that should be sent and
 * the cause that should be reported.
 *
 * **Details**
 *
 * Respondable failures and defects can choose their own response, defects that
 * are already `HttpServerResponse` values are used directly, and pure interrupts
 * produce either `499` for client aborts or `503` for server aborts.
 *
 * @stability unstable
 * @category error handling
 * @since 4.0.0
 */
export const causeResponse = <E>(
  cause: Cause.Cause<E>
): Effect.Effect<readonly [Response.HttpServerResponse, Cause.Cause<E>]> => {
  let response: Response.HttpServerResponse | undefined
  let effect = succeedInternalServerError
  const failures: Array<Cause.Reason<E>> = []
  let interrupts: Array<Cause.Interrupt> = []
  let isClientInterrupt = false
  for (let i = 0; i < cause.reasons.length; i++) {
    const reason = cause.reasons[i]
    switch (reason._tag) {
      case "Fail": {
        effect = Respondable.toResponseOrElse(reason.error, internalServerError)
        failures.push(reason)
        break
      }
      case "Die": {
        if (Response.isHttpServerResponse(reason.defect)) {
          response = reason.defect
        } else {
          effect = Respondable.toResponseOrElseDefect(reason.defect, internalServerError)
          failures.push(reason)
        }
        break
      }
      case "Interrupt": {
        isClientInterrupt = reason.annotations.has(ClientAbort.key)
        if (failures.length > 0) break
        interrupts.push(reason)
        break
      }
    }
  }
  if (response) {
    return Effect.succeed([response, Cause.fromReasons(failures)] as const)
  } else if (interrupts.length > 0 && failures.length === 0) {
    failures.push(...interrupts)
    effect = isClientInterrupt ? clientAbortError : serverAbortError
  }
  return Effect.mapEager(effect, (response) => {
    failures.push(Cause.makeDieReason(response))
    return [response, Cause.fromReasons(failures)] as const
  })
}

/**
 * Derives an HTTP response from a failed handler cause synchronously.
 *
 * **Details**
 *
 * If the cause contains a defect that is already an `HttpServerResponse`, that
 * response is used and removed from the remaining cause. Otherwise the response
 * defaults to `500`.
 *
 * @stability unstable
 * @category error handling
 * @since 4.0.0
 */
export const causeResponseStripped = <E>(
  cause: Cause.Cause<E>
): readonly [response: Response.HttpServerResponse, cause: Option.Option<Cause.Cause<E>>] => {
  let response: Response.HttpServerResponse | undefined
  const failures = cause.reasons.filter((f) => {
    if (f._tag === "Die" && Response.isHttpServerResponse(f.defect)) {
      response = f.defect
      return false
    }
    return true
  })
  return [
    response ?? internalServerError,
    failures.length > 0 ? Option.some(Cause.fromReasons(failures)) : Option.none()
  ]
}

const internalServerError = Response.empty({ status: 500 })
const succeedInternalServerError = Effect.succeed(internalServerError)
const clientAbortError = Effect.succeed(Response.empty({ status: 499 }))
const serverAbortError = Effect.succeed(Response.empty({ status: 503 }))

/**
 * Extracts the response from a successful handler exit, or derives a response
 * from the failure cause.
 *
 * @stability unstable
 * @category error handling
 * @since 4.0.0
 */
export const exitResponse = <E>(exit: Exit.Exit<Response.HttpServerResponse, E>): Response.HttpServerResponse => {
  if (exit._tag === "Success") {
    return exit.value
  }
  return causeResponseStripped(exit.cause)[0]
}
