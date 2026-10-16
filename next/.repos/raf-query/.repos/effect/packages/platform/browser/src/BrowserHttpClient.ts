/**
 * Browser implementations of the Effect `HttpClient`.
 *
 * This module exposes HTTP client layers for code that runs in a browser. It
 * re-exports the fetch-based `Fetch`, `RequestInit`, and `layerFetch` APIs for
 * the common case where requests use the platform `fetch` implementation. It
 * also provides an `XMLHttpRequest`-backed client, including controls for the
 * XHR response type, an overridable `XMLHttpRequest` constructor service, and
 * the `layerXMLHttpRequest` layer.
 *
 * @since 4.0.0
 */
import * as Cause from "effect/Cause"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import type { LazyArg } from "effect/Function"
import * as Cookies from "effect/http/Cookies"
import * as Headers from "effect/http/Headers"
import * as HttpClient from "effect/http/HttpClient"
import * as HttpClientError from "effect/http/HttpClientError"
import type * as HttpClientRequest from "effect/http/HttpClientRequest"
import * as HttpClientResponse from "effect/http/HttpClientResponse"
import * as HttpIncomingMessage from "effect/http/HttpIncomingMessage"
import * as HeaderParser from "effect/http/MultipartParser/HeadersParser"
import * as UrlParams from "effect/http/UrlParams"
import * as Inspectable from "effect/Inspectable"
import type * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import { type Pipeable, pipeArguments } from "effect/Pipeable"
import * as Queue from "effect/Queue"
import type * as Schema from "effect/Schema"
import * as Stream from "effect/Stream"

// =============================================================================
// Fetch
// =============================================================================

export {
  /**
   * Context reference for the `fetch` implementation used by the fetch-based HTTP client.
   *
   * @category services
   * @since 4.0.0
   */
  Fetch,
  /**
   * Layer that provides an `HttpClient` implementation backed by the configured `Fetch` function.
   *
   * @category layers
   * @since 4.0.0
   */
  layer as layerFetch,
  /**
   * Service that contains default fetch options for the browser fetch client.
   *
   * **When to use**
   *
   * Use to provide default credentials, cache, redirect, integrity, or other
   * fetch options for browser HTTP requests.
   *
   * @category services
   * @since 4.0.0
   */
  RequestInit
} from "effect/http/FetchHttpClient"

// =============================================================================
// XML Http Request
// =============================================================================

/**
 * Allowed response body modes for the browser XHR HTTP client.
 *
 * @category models
 * @since 4.0.0
 */
export type XHRResponseType = "arraybuffer" | "text"

/**
 * Context reference for the `XMLHttpRequest.responseType` used by the browser XHR HTTP client, defaulting to `"text"`.
 *
 * **When to use**
 *
 * Use when you need XHR-backed HTTP requests to receive response bodies as text
 * or raw `ArrayBuffer` values.
 *
 * @see {@link XHRResponseType} for the allowed response body modes
 * @see {@link withXHRArrayBuffer} for scoping XHR response handling to `ArrayBuffer`
 *
 * @category services
 * @since 4.0.0
 */
export const CurrentXHRResponseType: Context.Reference<XHRResponseType> = Context.Reference(
  "@effect/platform-browser/BrowserHttpClient/CurrentXHRResponseType",
  { defaultValue: (): XHRResponseType => "text" }
)

/**
 * Runs an effect with `CurrentXHRResponseType` set to `"arraybuffer"` so the XHR HTTP client receives response bodies as `ArrayBuffer` values.
 *
 * @category providing services
 * @since 4.0.0
 */
export const withXHRArrayBuffer = <A, E, R>(
  self: Effect.Effect<A, E, R>
): Effect.Effect<A, E, R> =>
  Effect.provideService(
    self,
    CurrentXHRResponseType,
    "arraybuffer"
  )

/**
 * Service tag for the `XMLHttpRequest` constructor used by the browser XHR HTTP client.
 *
 * @category services
 * @since 4.0.0
 */
export class XMLHttpRequest extends Context.Service<
  XMLHttpRequest,
  LazyArg<globalThis.XMLHttpRequest>
>()("@effect/platform-browser/BrowserHttpClient/XMLHttpRequest") {}

const makeXhrRequest = () => new globalThis.XMLHttpRequest()

const makeXmlHttpRequest = HttpClient.make(
  (request, url, signal, fiber) =>
    Effect.suspend(() => {
      const xhr = Context.getOrElse(
        fiber.context,
        XMLHttpRequest,
        () => makeXhrRequest
      )()
      signal.addEventListener("abort", () => {
        xhr.abort()
        xhr.onreadystatechange = null
      }, { once: true })
      xhr.open(request.method, url.toString(), true)
      xhr.responseType = fiber.getRef(CurrentXHRResponseType)
      Object.entries(request.headers).forEach(([k, v]) => {
        xhr.setRequestHeader(k, v)
      })
      return Effect.andThen(
        sendBody(xhr, request),
        Effect.callback<ClientResponseImpl, HttpClientError.HttpClientError>((resume) => {
          let sent = false
          const onChange = () => {
            if (!sent && xhr.readyState >= 2) {
              sent = true
              resume(Effect.succeed(new ClientResponseImpl(request, xhr, url.href)))
            }
          }
          xhr.onreadystatechange = onChange
          xhr.onerror = (_event) => {
            resume(Effect.fail(
              new HttpClientError.HttpClientError({
                reason: new HttpClientError.TransportError({
                  request,
                  cause: xhr.statusText
                })
              })
            ))
          }
          onChange()
          return Effect.void
        })
      )
    })
)

const sendBody = (
  xhr: globalThis.XMLHttpRequest,
  request: HttpClientRequest.HttpClientRequest
): Effect.Effect<void, HttpClientError.HttpClientError> => {
  const body = request.body
  switch (body._tag) {
    case "Empty":
      return Effect.sync(() => xhr.send())
    case "Raw":
      return Effect.sync(() => xhr.send(body.body as any))
    case "Uint8Array":
      return Effect.sync(() => xhr.send(body.body as any))
    case "FormData":
      return Effect.sync(() => xhr.send(body.formData))
    case "Stream":
      return Effect.matchEffect(
        Stream.runFold(body.stream, () => new Uint8Array(0), (acc, chunk) => {
          const next = new Uint8Array(acc.length + chunk.length)
          next.set(acc, 0)
          next.set(chunk, acc.length)
          return next
        }),
        {
          onFailure: (cause) =>
            Effect.fail(
              new HttpClientError.HttpClientError({
                reason: new HttpClientError.EncodeError({
                  request,
                  cause
                })
              })
            ),
          onSuccess: (body) => Effect.sync(() => xhr.send(body))
        }
      )
  }
}

const encoder = new TextEncoder()

abstract class IncomingMessageImpl<E> extends Inspectable.Class implements HttpIncomingMessage.HttpIncomingMessage<E> {
  readonly [HttpIncomingMessage.TypeId]: typeof HttpIncomingMessage.TypeId
  readonly source: globalThis.XMLHttpRequest
  readonly onError: (error: unknown) => E

  constructor(source: globalThis.XMLHttpRequest, onError: (error: unknown) => E) {
    super()
    this[HttpIncomingMessage.TypeId] = HttpIncomingMessage.TypeId
    this.source = source
    this.onError = onError
    this._rawHeaderString = source.getAllResponseHeaders()
  }

  private _rawHeaderString: string
  private _rawHeaders: Record<string, string | Array<string>> | undefined
  private _headers: Headers.Headers | undefined
  get headers() {
    if (this._headers) {
      return this._headers
    }
    if (this._rawHeaderString === "") {
      return this._headers = Headers.empty
    }
    const parser = HeaderParser.make()
    const result = parser(encoder.encode(this._rawHeaderString + "\r\n"), 0)
    this._rawHeaders = result._tag === "Headers" ? result.headers : undefined
    const parsed = result._tag === "Headers" ? Headers.fromInput(result.headers) : Headers.empty
    return this._headers = parsed
  }

  cachedCookies: Cookies.Cookies | undefined
  get cookies() {
    if (this.cachedCookies) {
      return this.cachedCookies
    }
    if (this._rawHeaders === undefined) {
      return Cookies.empty
    } else if (this._rawHeaders["set-cookie"] === undefined) {
      return this.cachedCookies = Cookies.empty
    }
    return this.cachedCookies = Cookies.fromSetCookie(this._rawHeaders["set-cookie"])
  }

  get remoteAddress() {
    return Option.none()
  }

  _textEffect: Effect.Effect<string, E> | undefined
  get text(): Effect.Effect<string, E> {
    if (this._textEffect) {
      return this._textEffect
    }
    if (this.source.responseType === "arraybuffer") {
      return this._textEffect = this.arrayBuffer.pipe(
        Effect.map((buffer) => new TextDecoder().decode(buffer)),
        Effect.cached,
        Effect.runSync
      )
    }
    return this._textEffect = Effect.callback<string, E>((resume) => {
      if (this.source.readyState === 4) {
        resume(Effect.succeed(this.source.responseText))
        return
      }

      const onReadyStateChange = () => {
        if (this.source.readyState === 4) {
          resume(Effect.succeed(this.source.responseText))
        }
      }
      const onError = () => {
        resume(Effect.fail(this.onError(this.source.statusText)))
      }
      this.source.addEventListener("readystatechange", onReadyStateChange)
      this.source.addEventListener("error", onError)
      return Effect.sync(() => {
        this.source.removeEventListener("readystatechange", onReadyStateChange)
        this.source.removeEventListener("error", onError)
      })
    }).pipe(
      Effect.cached,
      Effect.runSync
    )
  }

  get json(): Effect.Effect<Schema.Json, E> {
    return Effect.flatMap(this.text, (text) =>
      Effect.try({
        try: () => text === "" ? null : JSON.parse(text),
        catch: this.onError
      }))
  }

  get urlParamsBody(): Effect.Effect<UrlParams.UrlParams, E> {
    return Effect.flatMap(this.text, (text) =>
      Effect.try({
        try: () => UrlParams.fromInput(new URLSearchParams(text)),
        catch: this.onError
      }))
  }

  get stream(): Stream.Stream<Uint8Array, E> {
    if (this.source.responseType === "arraybuffer") {
      return Stream.fromEffect(Effect.map(this.arrayBuffer, (buffer) => new Uint8Array(buffer)))
    }
    return Stream.callback<Uint8Array, E>((queue) => {
      let offset = 0
      const onReadyStateChange = () => {
        if (this.source.readyState === 3) {
          const encoded = encoder.encode(this.source.responseText.slice(offset))
          Queue.offerUnsafe(queue, encoded)
          offset = this.source.responseText.length
        } else if (this.source.readyState === 4) {
          const encoded = encoder.encode(this.source.responseText.slice(offset))
          if (offset < this.source.responseText.length) {
            Queue.offerUnsafe(queue, encoded)
          }
          Queue.endUnsafe(queue)
        }
      }
      const onError = () => {
        Queue.failCauseUnsafe(queue, Cause.fail(this.onError(this.source.statusText)))
      }
      this.source.addEventListener("readystatechange", onReadyStateChange)
      this.source.addEventListener("error", onError)
      onReadyStateChange()
      return Effect.sync(() => {
        this.source.removeEventListener("readystatechange", onReadyStateChange)
        this.source.removeEventListener("error", onError)
      })
    })
  }

  _arrayBufferEffect: Effect.Effect<ArrayBuffer, E> | undefined
  get arrayBuffer(): Effect.Effect<ArrayBuffer, E> {
    if (this._arrayBufferEffect) {
      return this._arrayBufferEffect
    }
    return this._arrayBufferEffect = Effect.callback<ArrayBuffer, E>((resume) => {
      if (this.source.readyState === 4) {
        resume(Effect.succeed(this.source.response))
        return
      }

      const onReadyStateChange = () => {
        if (this.source.readyState === 4) {
          resume(Effect.succeed(this.source.response))
        }
      }
      const onError = () => {
        resume(Effect.fail(this.onError(this.source.statusText)))
      }
      this.source.addEventListener("readystatechange", onReadyStateChange)
      this.source.addEventListener("error", onError)
      return Effect.sync(() => {
        this.source.removeEventListener("readystatechange", onReadyStateChange)
        this.source.removeEventListener("error", onError)
      })
    }).pipe(
      Effect.map((response) => {
        if (typeof response === "string") {
          const arr = encoder.encode(response)
          return arr.byteLength !== arr.buffer.byteLength
            ? arr.buffer.slice(arr.byteOffset, arr.byteOffset + arr.byteLength)
            : arr.buffer
        }
        return response
      }),
      Effect.cached,
      Effect.runSync
    )
  }
}

class ClientResponseImpl extends IncomingMessageImpl<HttpClientError.HttpClientError>
  implements HttpClientResponse.HttpClientResponse, Pipeable
{
  readonly [HttpClientResponse.TypeId]: typeof HttpClientResponse.TypeId
  readonly request: HttpClientRequest.HttpClientRequest
  private readonly requestUrl: string

  constructor(
    request: HttpClientRequest.HttpClientRequest,
    source: globalThis.XMLHttpRequest,
    requestUrl: string
  ) {
    super(source, (cause) =>
      new HttpClientError.HttpClientError({
        reason: new HttpClientError.DecodeError({
          request,
          response: this,
          cause
        })
      }))
    this.request = request
    this.requestUrl = requestUrl
    this[HttpClientResponse.TypeId] = HttpClientResponse.TypeId
  }

  get status() {
    return this.source.status
  }

  get url() {
    return (this.source.responseURL || this.requestUrl).split("#")[0]
  }

  get formData(): Effect.Effect<FormData, HttpClientError.HttpClientError> {
    return Effect.flatMap(this.arrayBuffer, (body) =>
      Effect.tryPromise({
        try: () => new globalThis.Response(body, { headers: this.headers }).formData(),
        catch: this.onError
      }))
  }

  override toString(): string {
    return `ClientResponse(${this.status})`
  }

  toJSON(): unknown {
    return HttpIncomingMessage.inspect(this, {
      _id: "@effect/platform/HttpClientResponse",
      request: this.request.toJSON(),
      status: this.status
    })
  }

  pipe() {
    return pipeArguments(this, arguments)
  }
}

/**
 * Layer that provides an `HttpClient` implementation backed by the browser `XMLHttpRequest` API.
 *
 * @category layers
 * @since 4.0.0
 */
export const layerXMLHttpRequest: Layer.Layer<HttpClient.HttpClient> = HttpClient.layerMergedContext(
  Effect.succeed(makeXmlHttpRequest)
)
