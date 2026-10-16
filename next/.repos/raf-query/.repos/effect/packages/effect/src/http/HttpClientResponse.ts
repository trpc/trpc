/**
 * Represents responses returned by the Effect HTTP client.
 *
 * An `HttpClientResponse` keeps the original request together with the response
 * status, headers, cookies, and body accessors from the shared incoming-message
 * model. This module includes constructors, schema-based decoders, helpers for
 * streaming response bodies, and utilities for matching or filtering by HTTP
 * status.
 *
 * @stability unstable
 * @since 4.0.0
 */
import * as Effect from "../Effect.ts"
import { dual } from "../Function.ts"
import * as Inspectable from "../Inspectable.ts"
import * as Option from "../Option.ts"
import { type Pipeable, pipeArguments } from "../Pipeable.ts"
import * as Schema from "../Schema.ts"
import type { ParseOptions } from "../SchemaAST.ts"
import * as Stream from "../Stream.ts"
import type { Unify } from "../Unify.ts"
import * as Cookies from "./Cookies.ts"
import * as Headers from "./Headers.ts"
import * as Error from "./HttpClientError.ts"
import * as HttpClientRequest from "./HttpClientRequest.ts"
import * as HttpIncomingMessage from "./HttpIncomingMessage.ts"
import * as UrlParams from "./UrlParams.ts"

/**
 * @stability unstable
 */
export {
  /**
   * Creates a decoder that reads a response JSON body and decodes it with the supplied schema.
   *
   * @stability unstable
   * @category schemas
   * @since 4.0.0
   */
  schemaBodyJson,
  /**
   * Creates a decoder that reads response URL-encoded body parameters and decodes them with the supplied schema.
   *
   * @stability unstable
   * @category schemas
   * @since 4.0.0
   */
  schemaBodyUrlParams,
  /**
   * Creates a decoder that validates and decodes response headers with the supplied schema.
   *
   * @stability unstable
   * @category schemas
   * @since 4.0.0
   */
  schemaHeaders
} from "./HttpIncomingMessage.ts"

/**
 * Type identifier for `HttpClientResponse` values.
 *
 * @stability unstable
 * @category type IDs
 * @since 4.0.0
 */
export const TypeId = "~effect/http/HttpClientResponse"

/**
 * Model of an HTTP client response, including the original request, status, cookies, headers, and body accessors.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface HttpClientResponse extends HttpIncomingMessage.HttpIncomingMessage<Error.HttpClientError>, Pipeable {
  readonly [TypeId]: typeof TypeId
  readonly request: HttpClientRequest.HttpClientRequest
  /**
   * The resolved URL, including query parameters and excluding the hash.
   * Uses the final URL when redirects are followed. Empty if unknown.
   */
  readonly url: string
  readonly status: number
  readonly cookies: Cookies.Cookies
  readonly formData: Effect.Effect<FormData, Error.HttpClientError>
}

/**
 * Wraps a Web `Response` and its original `HttpClientRequest` as an `HttpClientResponse`.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const fromWeb = (request: HttpClientRequest.HttpClientRequest, source: Response): HttpClientResponse =>
  new WebHttpClientResponse(request, source)

/**
 * Creates a decoder for a response's status, headers, and JSON body using the supplied schema.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const schemaJson = <
  A,
  I extends {
    readonly status?: number | undefined
    readonly headers?: Readonly<Record<string, string | undefined>> | undefined
    readonly body?: unknown
  },
  RD
>(
  schema: Schema.ConstraintCodec<A, I, RD, unknown>,
  options?: (ParseOptions & HttpIncomingMessage.JsonOptions) | undefined
) => {
  const decode = Schema.decodeEffect(Schema.toCodecJson(schema), options)
  const decodeBody = HttpIncomingMessage.schemaBodyJson(Schema.Unknown, options)
  return (
    self: HttpClientResponse
  ): Effect.Effect<A, Schema.SchemaError | Error.HttpClientError, RD> =>
    Effect.flatMap(decodeBody(self), (body) =>
      decode({
        status: self.status,
        headers: self.headers,
        body: body as Schema.Json
      }))
}

/**
 * Creates a decoder for a response's status and headers without reading a response body.
 *
 * @stability unstable
 * @category schemas
 * @since 4.0.0
 */
export const schemaNoBody = <
  A,
  I extends {
    readonly status?: number | undefined
    readonly headers?: Readonly<Record<string, string>> | undefined
  },
  RD,
  RE
>(
  schema: Schema.Codec<A, I, RD, RE>,
  options?: ParseOptions | undefined
) => {
  const decode = Schema.decodeEffect(schema, options)
  return (self: HttpClientResponse): Effect.Effect<A, Schema.SchemaError, RD> =>
    decode({
      status: self.status,
      headers: self.headers
    } as any as I)
}

/**
 * Converts an effect producing an `HttpClientResponse` into a stream of response body bytes.
 *
 * @stability unstable
 * @category accessors
 * @since 4.0.0
 */
export const stream = <E, R>(
  effect: Effect.Effect<HttpClientResponse, E, R>
): Stream.Stream<Uint8Array, Error.HttpClientError | E, R> => Stream.unwrap(Effect.map(effect, (self) => self.stream))

/**
 * Pattern matches on a response status, checking exact status handlers before status-class handlers and `orElse`.
 *
 * @stability unstable
 * @category pattern matching
 * @since 4.0.0
 */
export const matchStatus: {
  <
    const Cases extends {
      readonly [status: number]: (_: HttpClientResponse) => any
      readonly "2xx"?: (_: HttpClientResponse) => any
      readonly "3xx"?: (_: HttpClientResponse) => any
      readonly "4xx"?: (_: HttpClientResponse) => any
      readonly "5xx"?: (_: HttpClientResponse) => any
      readonly orElse: (_: HttpClientResponse) => any
    }
  >(cases: Cases): (self: HttpClientResponse) => Cases[keyof Cases] extends (_: any) => infer R ? Unify<R> : never
  <
    const Cases extends {
      readonly [status: number]: (_: HttpClientResponse) => any
      readonly "2xx"?: (_: HttpClientResponse) => any
      readonly "3xx"?: (_: HttpClientResponse) => any
      readonly "4xx"?: (_: HttpClientResponse) => any
      readonly "5xx"?: (_: HttpClientResponse) => any
      readonly orElse: (_: HttpClientResponse) => any
    }
  >(self: HttpClientResponse, cases: Cases): Cases[keyof Cases] extends (_: any) => infer R ? Unify<R> : never
} = dual(2, <
  const Cases extends {
    readonly [status: number]: (_: HttpClientResponse) => any
    readonly "2xx"?: (_: HttpClientResponse) => any
    readonly "3xx"?: (_: HttpClientResponse) => any
    readonly "4xx"?: (_: HttpClientResponse) => any
    readonly "5xx"?: (_: HttpClientResponse) => any
    readonly orElse: (_: HttpClientResponse) => any
  }
>(self: HttpClientResponse, cases: Cases) => {
  const status = self.status
  if (cases[status]) {
    return cases[status](self)
  } else if (status >= 200 && status < 300 && cases["2xx"]) {
    return cases["2xx"](self)
  } else if (status >= 300 && status < 400 && cases["3xx"]) {
    return cases["3xx"](self)
  } else if (status >= 400 && status < 500 && cases["4xx"]) {
    return cases["4xx"](self)
  } else if (status >= 500 && status < 600 && cases["5xx"]) {
    return cases["5xx"](self)
  }
  return cases.orElse(self)
})

/**
 * Succeeds with the response when its status satisfies the predicate, otherwise fails with `HttpClientError`.
 *
 * @stability unstable
 * @category filtering
 * @since 4.0.0
 */
export const filterStatus: {
  (
    f: (status: number) => boolean
  ): (self: HttpClientResponse) => Effect.Effect<HttpClientResponse, Error.HttpClientError>
  (self: HttpClientResponse, f: (status: number) => boolean): Effect.Effect<HttpClientResponse, Error.HttpClientError>
} = dual(
  2,
  (self: HttpClientResponse, f: (status: number) => boolean) =>
    Effect.suspend(() =>
      f(self.status) ? Effect.succeed(self) : Effect.fail(
        new Error.HttpClientError({
          reason: new Error.StatusCodeError({
            response: self,
            request: self.request,
            description: "invalid status code"
          })
        })
      )
    )
)

/**
 * Succeeds with the response only when its status is in the 2xx range, otherwise fails with `HttpClientError`.
 *
 * @stability unstable
 * @category filtering
 * @since 4.0.0
 */
export const filterStatusOk = (self: HttpClientResponse): Effect.Effect<HttpClientResponse, Error.HttpClientError> =>
  self.status >= 200 && self.status < 300 ? Effect.succeed(self) : Effect.fail(
    new Error.HttpClientError({
      reason: new Error.StatusCodeError({
        response: self,
        request: self.request,
        description: "non 2xx status code"
      })
    })
  )

// -----------------------------------------------------------------------------
// internal
// -----------------------------------------------------------------------------

class WebHttpClientResponse extends Inspectable.Class implements HttpClientResponse, Pipeable {
  readonly [HttpIncomingMessage.TypeId]: typeof HttpIncomingMessage.TypeId
  readonly [TypeId]: typeof TypeId

  readonly request: HttpClientRequest.HttpClientRequest
  private readonly source: globalThis.Response

  constructor(
    request: HttpClientRequest.HttpClientRequest,
    source: globalThis.Response
  ) {
    super()
    this.request = request
    this.source = source
    this[HttpIncomingMessage.TypeId] = HttpIncomingMessage.TypeId
    this[TypeId] = TypeId
  }

  toJSON(): unknown {
    return HttpIncomingMessage.inspect(this, {
      _id: "HttpClientResponse",
      request: this.request.toJSON(),
      status: this.status
    })
  }

  get status(): number {
    return this.source.status
  }

  get url(): string {
    if (this.source.url) return this.source.url.split("#")[0]
    const url = HttpClientRequest.toUrl(this.request)
    if (Option.isNone(url)) return ""
    url.value.hash = ""
    return url.value.href
  }

  get headers(): Headers.Headers {
    return Headers.fromInput(this.source.headers)
  }

  cachedCookies?: Cookies.Cookies
  get cookies(): Cookies.Cookies {
    if (this.cachedCookies) {
      return this.cachedCookies
    }
    return this.cachedCookies = Cookies.fromSetCookie(this.source.headers.getSetCookie())
  }

  get remoteAddress(): Option.Option<string> {
    return Option.none()
  }

  get stream(): Stream.Stream<Uint8Array, Error.HttpClientError> {
    return this.source.body
      ? Stream.fromReadableStream({
        evaluate: () => this.source.body!,
        onError: (cause) =>
          new Error.HttpClientError({
            reason: new Error.DecodeError({
              request: this.request,
              response: this,
              cause
            })
          })
      })
      : Stream.fail(
        new Error.HttpClientError({
          reason: new Error.EmptyBodyError({
            request: this.request,
            response: this,
            description: "can not create stream from empty body"
          })
        })
      )
  }

  get json(): Effect.Effect<Schema.Json, Error.HttpClientError> {
    return Effect.flatMap(this.text, (text) =>
      Effect.try({
        try: () => text === "" ? null : JSON.parse(text),
        catch: (cause) =>
          new Error.HttpClientError({
            reason: new Error.DecodeError({
              request: this.request,
              response: this,
              cause
            })
          })
      }))
  }

  private textBody?: Effect.Effect<string, Error.HttpClientError>
  get text(): Effect.Effect<string, Error.HttpClientError> {
    return this.textBody ??= Effect.map(this.arrayBuffer, (_) => new TextDecoder().decode(_))
  }

  get urlParamsBody(): Effect.Effect<UrlParams.UrlParams, Error.HttpClientError> {
    return Effect.flatMap(this.text, (_) =>
      Effect.try({
        try: () => UrlParams.fromInput(new URLSearchParams(_)),
        catch: (cause) =>
          new Error.HttpClientError({
            reason: new Error.DecodeError({
              request: this.request,
              response: this,
              cause
            })
          })
      }))
  }

  private formDataBody?: Effect.Effect<FormData, Error.HttpClientError>
  get formData(): Effect.Effect<FormData, Error.HttpClientError> {
    return this.formDataBody ??= Effect.tryPromise({
      try: () => this.source.formData(),
      catch: (cause) =>
        new Error.HttpClientError({
          reason: new Error.DecodeError({
            request: this.request,
            response: this,
            cause
          })
        })
    }).pipe(Effect.cached, Effect.runSync)
  }

  private arrayBufferBody?: Effect.Effect<ArrayBuffer, Error.HttpClientError>
  get arrayBuffer(): Effect.Effect<ArrayBuffer, Error.HttpClientError> {
    if (this.arrayBufferBody) {
      return this.arrayBufferBody
    }
    this.arrayBufferBody = Effect.tryPromise({
      try: () => this.source.arrayBuffer(),
      catch: (cause) =>
        new Error.HttpClientError({
          reason: new Error.DecodeError({
            request: this.request,
            response: this,
            cause
          })
        })
    }).pipe(Effect.cached, Effect.runSync)
    return this.arrayBufferBody
  }

  pipe() {
    return pipeArguments(this, arguments)
  }
}
