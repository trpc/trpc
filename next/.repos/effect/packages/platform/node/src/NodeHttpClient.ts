/**
 * Node.js implementations of the Effect `HttpClient`.
 *
 * This module supplies Node runtime backends for the platform-independent
 * Effect HTTP client API. It re-exports the fetch-based `Fetch`, `RequestInit`,
 * and `layerFetch` APIs, defines an Undici-backed client with dispatcher
 * services and request options, and defines a lower-level `node:http` /
 * `node:https` client with scoped HTTP agent layers.
 *
 * @stability unstable
 * @since 4.0.0
 */
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Fiber from "effect/Fiber"
import { constVoid, flow } from "effect/Function"
import * as Cookies from "effect/http/Cookies"
import * as Headers from "effect/http/Headers"
import type * as Body from "effect/http/HttpBody"
import * as Client from "effect/http/HttpClient"
import * as Error from "effect/http/HttpClientError"
import type { HttpClientRequest } from "effect/http/HttpClientRequest"
import * as Response from "effect/http/HttpClientResponse"
import type { HttpClientResponse } from "effect/http/HttpClientResponse"
import * as IncomingMessage from "effect/http/HttpIncomingMessage"
import * as UrlParams from "effect/http/UrlParams"
import * as Inspectable from "effect/Inspectable"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import { type Pipeable, pipeArguments } from "effect/Pipeable"
import type * as Schema from "effect/Schema"
import type * as Scope from "effect/Scope"
import type * as Socket from "effect/socket/Socket"
import * as Stream from "effect/Stream"
import type * as Http from "node:http"
import type * as Https from "node:https"
import { type Duplex, Readable } from "node:stream"
import * as Consumers from "node:stream/consumers"
import { http, https } from "./internal/http.ts"
import { NodeHttpIncomingMessage } from "./NodeHttpIncomingMessage.ts"
import * as NodeSink from "./NodeSink.ts"
import * as NodeStream from "./NodeStream.ts"
import type * as Undici from "./Undici.ts"

// -----------------------------------------------------------------------------
// Fetch
// -----------------------------------------------------------------------------

export {
  /**
   * Provides a fetch-based HTTP client implementation for Node.js.
   *
   * **When to use**
   *
   * Use to access or override the fetch implementation used by the Node
   * fetch-based HTTP client.
   *
   * @stability unstable
   * @category services
   * @since 4.0.0
   */
  Fetch,
  /**
   * Layer that provides the fetch-based HTTP client implementation.
   *
   * @stability unstable
   * @category layers
   * @since 4.0.0
   */
  layer as layerFetch,
  /**
   * Provides request initialization options accepted by the fetch-based HTTP client.
   *
   * **When to use**
   *
   * Use to provide default fetch request options for Node HTTP requests.
   *
   * @stability unstable
   * @category services
   * @since 4.0.0
   */
  RequestInit
} from "effect/http/FetchHttpClient"

// -----------------------------------------------------------------------------
// Undici
// -----------------------------------------------------------------------------

/**
 * Service tag for the Undici `Dispatcher` used by the Undici-backed HTTP
 * client.
 *
 * @stability unstable
 * @category services
 * @since 4.0.0
 */
export class Dispatcher extends Context.Service<Dispatcher, Undici.Dispatcher>()(
  "@effect/platform-node/NodeHttpClient/Dispatcher"
) {}

const loadUndici = Effect.promise(() => import("./Undici.ts"))

/**
 * Acquires a new Undici `Agent` dispatcher configured with the supplied
 * options and destroys it when the enclosing scope is finalized.
 *
 * **When to use**
 *
 * Use to control how the Undici client connects, for example to send every
 * request over a unix domain socket or to present a client certificate.
 *
 * **Details**
 *
 * The options are passed to `new Agent(options)`. Connection settings live
 * under `connect`:
 *
 * - `connect: { socketPath }` dials a unix domain socket (or a Windows named
 *   pipe) instead of TCP. The request URL still supplies the `Host` header
 *   and path, so any origin such as `http://localhost` works.
 * - `connect: { ca, cert, key, servername, rejectUnauthorized }` configures
 *   TLS for `https:` origins, including mutual TLS.
 *
 * `makeUndici` sets `headersTimeout` and `bodyTimeout` on every request, so
 * timeouts given here are overridden. Use `Effect.timeout` instead.
 *
 * @stability unstable
 * @category resource management
 * @since 4.0.5
 */
export const makeDispatcherOptions = (
  options?: Undici.Agent.Options | undefined
): Effect.Effect<Undici.Dispatcher, never, Scope.Scope> =>
  Effect.acquireRelease(
    Effect.map(loadUndici, (_) => new _.Agent(options)),
    (dispatcher) => Effect.promise(() => dispatcher.destroy())
  )

/**
 * Acquires a new Undici `Agent` dispatcher and destroys it when the enclosing
 * scope is finalized.
 *
 * @stability unstable
 * @category resource management
 * @since 4.0.0
 */
export const makeDispatcher: Effect.Effect<Undici.Dispatcher, never, Scope.Scope> = makeDispatcherOptions()

/**
 * Provides the `Dispatcher` service using a scoped Undici `Agent` configured
 * with the supplied options.
 *
 * **Details**
 *
 * See `makeDispatcherOptions` for the unix socket and TLS settings.
 *
 * @stability unstable
 * @category layers
 * @since 4.0.5
 */
export const layerDispatcherOptions: (options?: Undici.Agent.Options | undefined) => Layer.Layer<Dispatcher> = flow(
  makeDispatcherOptions,
  Layer.effect(Dispatcher)
)

/**
 * Provides the `Dispatcher` service using a scoped Undici `Agent`.
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const layerDispatcher: Layer.Layer<Dispatcher> = layerDispatcherOptions()

/**
 * Provides the `Dispatcher` service from Undici's process-global dispatcher,
 * without creating or owning a new agent.
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const dispatcherLayerGlobal: Layer.Layer<Dispatcher> = Layer.effect(Dispatcher)(
  Effect.map(loadUndici, (_) => _.getGlobalDispatcher())
)

/**
 * Fiber reference containing default Undici request options applied to requests
 * sent by `makeUndici`.
 *
 * @stability unstable
 * @category services
 * @since 4.0.0
 */
export const UndiciOptions = Context.Reference<Partial<Undici.Dispatcher.RequestOptions>>(
  "@effect/platform-node/NodeHttpClient/UndiciOptions",
  { defaultValue: () => ({}) }
)

/**
 * Creates an `HttpClient` that sends requests through the current Undici
 * `Dispatcher`, converts Effect HTTP bodies to Undici bodies, and maps
 * transport and decode failures to `HttpClientError`.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const makeUndici = Effect.gen(function*() {
  const dispatcher = yield* Dispatcher
  return Client.make((request, url, signal, fiber) =>
    convertBody(request).pipe(
      Effect.flatMap(({ body, headers }): Effect.Effect<UndiciResponseSource, Error.HttpClientError> => {
        const options = {
          ...fiber.getRef(UndiciOptions),
          method: request.method,
          headers,
          origin: url.origin,
          path: url.pathname + url.search,
          body,
          // leave timeouts to Effect.timeout etc
          headersTimeout: 60 * 60 * 1000,
          bodyTimeout: 0
        }
        if (request.headers.upgrade !== undefined) {
          return dispatchUpgrade(dispatcher, request, signal, {
            ...options,
            // undici writes the connection and upgrade headers itself
            headers: Headers.removeMany(headers, ["connection", "upgrade"]),
            upgrade: request.headers.upgrade
          })
        }
        return Effect.tryPromise({
          try: () => dispatcher.request({ ...options, signal }),
          catch: (cause) =>
            new Error.HttpClientError({
              reason: new Error.TransportError({
                request,
                cause
              })
            })
        })
      }),
      Effect.map((response) => new UndiciResponse(request, response, url.href.split("#")[0]))
    )
  )
})

interface UndiciResponseSource {
  readonly statusCode: number
  readonly headers: Undici.Dispatcher.ResponseData["headers"]
  readonly body: Readable & { arrayBuffer(): Promise<ArrayBuffer> }
  readonly upgraded?: Duplex | undefined
}

// Dispatch directly to support both upgrades and readable refusal bodies.
// Dispatcher.request rejects upgrades; Dispatcher.upgrade rejects non-101 responses.
const dispatchUpgrade = (
  dispatcher: Undici.Dispatcher,
  request: HttpClientRequest,
  signal: AbortSignal,
  options: Undici.Dispatcher.DispatchOptions
) =>
  Effect.callback<UndiciResponseSource, Error.HttpClientError>((resume) => {
    let controller: Undici.Dispatcher.DispatchController | undefined
    let body: UpgradeResponseBody | undefined
    let reason: globalThis.Error | undefined
    const abort = (error: globalThis.Error) => {
      reason ??= error
      if (body !== undefined) body.destroy(error)
      else controller?.abort(error)
    }
    const onAbort = () => abort(signal.reason)
    const fail = (cause: unknown) =>
      resume(Effect.fail(
        new Error.HttpClientError({
          reason: new Error.TransportError({ request, cause })
        })
      ))
    if (signal.aborted) onAbort()
    else signal.addEventListener("abort", onAbort, { once: true })
    const done = () => signal.removeEventListener("abort", onAbort)
    try {
      dispatcher.dispatch(options, {
        onRequestStart(c) {
          controller = c
          if (reason !== undefined) c.abort(reason)
        },
        onRequestUpgrade(_, statusCode, headers, socket) {
          done()
          const body = new UpgradeResponseBody(undefined)
          body.push(null)
          // undici has already pushed back the bytes past the response head
          resume(Effect.succeed({ statusCode, headers, body, upgraded: takeOver(socket, undefined, signal) }))
        },
        onResponseStart(c, statusCode, headers) {
          if (statusCode < 200) return
          body = new UpgradeResponseBody(c)
          resume(Effect.succeed({ statusCode, headers, body }))
        },
        onResponseData(c, chunk) {
          if (!body!.push(chunk)) c.pause()
        },
        onResponseEnd() {
          done()
          body!.push(null)
        },
        onResponseError(_, cause) {
          done()
          if (body === undefined) fail(cause)
          else body.destroy(cause)
        }
      })
    } catch (cause) {
      done()
      fail(cause)
    }
    return Effect.sync(() => {
      done()
      abort(new globalThis.Error("The request was interrupted"))
    })
  })

class UpgradeResponseBody extends Readable {
  readonly controller: Undici.Dispatcher.DispatchController | undefined
  constructor(controller: Undici.Dispatcher.DispatchController | undefined) {
    super()
    this.controller = controller
  }
  override _read() {
    this.controller?.resume()
  }
  override _destroy(error: globalThis.Error | null, callback: (error?: globalThis.Error | null) => void) {
    if (!this.readableEnded) this.controller?.abort(error ?? new globalThis.Error("The response body was destroyed"))
    callback(error)
  }
  arrayBuffer(): Promise<ArrayBuffer> {
    return Consumers.arrayBuffer(this)
  }
}

function convertBody(request: HttpClientRequest): Effect.Effect<{
  readonly body: Exclude<Undici.Dispatcher.DispatchOptions["body"], undefined>
  readonly headers: Headers.Headers
}> {
  const { body, headers } = request
  switch (body._tag) {
    case "Empty": {
      return Effect.succeed({ body: null, headers })
    }
    case "Uint8Array":
    case "Raw": {
      return Effect.succeed({ body: body.body as Uint8Array, headers })
    }
    case "FormData": {
      return Effect.map(loadUndici, (undici) => ({
        body: convertFormData(body.formData, undici),
        headers: Headers.remove(headers, "content-type")
      }))
    }
    case "Stream": {
      return Effect.map(NodeStream.toReadable(body.stream), (body) => ({ body, headers }))
    }
  }
}

const convertFormData = (formData: FormData, undici: typeof Undici): Undici.FormData => {
  const converted = new undici.FormData()
  for (const [key, value] of formData) {
    converted.append(key, value)
  }
  return converted
}

function noopErrorHandler(_: any) {}

const formDecoder = new TextDecoder("utf-8", { ignoreBOM: true })

class UndiciResponse extends Inspectable.Class implements HttpClientResponse, Pipeable {
  readonly [IncomingMessage.TypeId]: typeof IncomingMessage.TypeId
  readonly [Response.TypeId]: typeof Response.TypeId
  readonly request: HttpClientRequest
  readonly source: UndiciResponseSource
  readonly url: string

  constructor(
    request: HttpClientRequest,
    source: UndiciResponseSource,
    url: string
  ) {
    super()
    this[IncomingMessage.TypeId] = IncomingMessage.TypeId
    this[Response.TypeId] = Response.TypeId
    this.request = request
    this.source = source
    this.url = url
    source.body.on("error", noopErrorHandler)
  }

  get status() {
    return this.source.statusCode!
  }

  get statusText() {
    return undefined
  }

  get headers(): Headers.Headers {
    return Headers.fromInput(this.source.headers)
  }

  cachedCookies?: Cookies.Cookies
  get cookies(): Cookies.Cookies {
    if (this.cachedCookies !== undefined) {
      return this.cachedCookies
    }
    const header = this.source.headers["set-cookie"]
    return this.cachedCookies = header ? Cookies.fromSetCookie(header) : Cookies.empty
  }

  get remoteAddress(): Option.Option<string> {
    return Option.none()
  }

  get stream(): Stream.Stream<Uint8Array, Error.HttpClientError> {
    return NodeStream.fromReadable({
      evaluate: () => this.source.body,
      onError: (cause) =>
        new Error.HttpClientError({
          reason: new Error.DecodeError({
            request: this.request,
            response: this,
            cause
          })
        })
    })
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
    if (this.textBody) {
      return this.textBody
    }
    this.textBody = Effect.map(this.arrayBuffer, (_) => new TextDecoder().decode(_))
    return this.textBody
  }

  get urlParamsBody(): Effect.Effect<UrlParams.UrlParams, Error.HttpClientError> {
    return Effect.flatMap(this.arrayBuffer, (bytes) =>
      Effect.try({
        // A leading "?" is form data; URLSearchParams would drop it as a query prefix.
        try: () => UrlParams.fromInput(new URLSearchParams(formDecoder.decode(bytes).replace(/^\?/, "%3F"))),
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
    return this.formDataBody ??= Effect.flatMap(this.arrayBuffer, (body) =>
      Effect.tryPromise({
        try: () => new globalThis.Response(body, { headers: this.headers }).formData(),
        catch: (cause) =>
          new Error.HttpClientError({
            reason: new Error.DecodeError({
              request: this.request,
              response: this,
              cause
            })
          })
      })).pipe(Effect.cached, Effect.runSync)
  }

  private arrayBufferBody?: Effect.Effect<ArrayBuffer, Error.HttpClientError>
  get arrayBuffer(): Effect.Effect<ArrayBuffer, Error.HttpClientError> {
    if (this.arrayBufferBody) {
      return this.arrayBufferBody
    }
    this.arrayBufferBody = Effect.tryPromise({
      try: () => this.source.body.arrayBuffer(),
      catch: (cause) =>
        new Error.HttpClientError({
          reason: new Error.DecodeError({
            request: this.request,
            response: this,
            cause
          })
        })
    }).pipe(Effect.cached, Effect.runSync)
    this.textBody = Effect.map(this.arrayBufferBody, (_) => new TextDecoder().decode(_))
    return this.arrayBufferBody
  }

  get upgrade(): Effect.Effect<Socket.Socket, Error.HttpClientError> {
    return upgradeSocket(this, this.source.upgraded)
  }

  toJSON(): unknown {
    return IncomingMessage.inspect(this, {
      _id: "effect/http/HttpClientResponse",
      request: this.request.toJSON(),
      status: this.status
    })
  }

  pipe() {
    return pipeArguments(this, arguments)
  }
}

/**
 * Provides an Undici-backed `HttpClient` using the current `Dispatcher`
 * service.
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const layerUndiciNoDispatcher: Layer.Layer<
  Client.HttpClient,
  never,
  Dispatcher
> = Client.layerMergedContext(makeUndici)

/**
 * Provides an Undici-backed `HttpClient` together with a scoped default
 * Undici `Agent` dispatcher.
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const layerUndici: Layer.Layer<Client.HttpClient> = Layer.provide(layerUndiciNoDispatcher, layerDispatcher)

/**
 * Provides an Undici-backed `HttpClient` together with a scoped Undici
 * `Agent` dispatcher configured with the supplied options.
 *
 * **When to use**
 *
 * Use to send every request over a unix domain socket with
 * `{ connect: { socketPath } }`, or over TLS with a custom CA and client
 * certificate with `{ connect: { ca, cert, key, servername, rejectUnauthorized } }`.
 *
 * **Details**
 *
 * See `makeDispatcherOptions` for how the options are applied.
 *
 * @stability unstable
 * @category layers
 * @since 4.0.5
 */
export const layerUndiciOptions = (options?: Undici.Agent.Options | undefined): Layer.Layer<Client.HttpClient> =>
  Layer.provide(layerUndiciNoDispatcher, layerDispatcherOptions(options))

// -----------------------------------------------------------------------------
// Upgrades
// -----------------------------------------------------------------------------

// Loaded on demand, as it depends on node:net and ws.
const loadUpgrade = Effect.promise(() => import("./internal/upgrade.ts"))

const takeOver = (conn: Duplex, head: Uint8Array | undefined, signal: AbortSignal): Duplex => {
  if (head !== undefined && head.length > 0) conn.unshift(head)
  conn.on("error", constVoid)
  if (signal.aborted) {
    conn.destroy()
  } else {
    const onAbort = () => conn.destroy()
    signal.addEventListener("abort", onAbort, { once: true })
    conn.once("close", () => signal.removeEventListener("abort", onAbort))
  }
  return conn
}

const upgradeSocket = (
  response: HttpClientResponse,
  upgraded: Duplex | undefined
): Effect.Effect<Socket.Socket, Error.HttpClientError> => {
  if (upgraded !== undefined) {
    return Effect.flatMap(loadUpgrade, (_) => _.toSocket(upgraded))
  }
  return Effect.fail(
    new Error.HttpClientError({
      reason: response.status === 101
        // Bun before 1.4 reports 101 without handing over the connection.
        ? new Error.TransportError({
          request: response.request,
          description: "the runtime did not hand over the connection of the upgrade"
        })
        : new Error.StatusCodeError({
          request: response.request,
          response,
          description: "expected 101 Switching Protocols"
        })
    })
  )
}

// -----------------------------------------------------------------------------
// node:http
// -----------------------------------------------------------------------------

/**
 * Service tag for the paired Node `http` and `https` agents used by the
 * node:http-backed HTTP client.
 *
 * @stability unstable
 * @category services
 * @since 4.0.0
 */
export class HttpAgent extends Context.Service<HttpAgent, {
  readonly http: Http.Agent
  readonly https: Https.Agent
}>()("@effect/platform-node/NodeHttpClient/HttpAgent") {}

/**
 * Options for the Node `http` and `https` agents created by `makeAgent`.
 *
 * **Details**
 *
 * Extends `https.AgentOptions` with `socketPath`. Node agents merge their
 * options into every request they create, so:
 *
 * - `socketPath` dials a unix domain socket (or a Windows named pipe) instead
 *   of TCP. The request URL still supplies the `Host` header and path.
 * - `ca`, `cert`, `key`, `servername` and `rejectUnauthorized` configure TLS
 *   for `https:` URLs, including mutual TLS.
 *
 * Both agents receive the same options.
 *
 * @stability unstable
 * @category models
 * @since 4.0.5
 */
export interface HttpAgentOptions extends Https.AgentOptions {
  /**
   * Path of a unix domain socket or Windows named pipe to connect through
   * instead of TCP.
   */
  readonly socketPath?: string | undefined
}

/**
 * Acquires Node `http` and `https` agents with the supplied options and
 * destroys both agents when the enclosing scope is finalized.
 *
 * @stability unstable
 * @category resource management
 * @since 4.0.0
 */
export const makeAgent = (options?: HttpAgentOptions): Effect.Effect<HttpAgent["Service"], never, Scope.Scope> =>
  Effect.zipWith(
    Effect.acquireRelease(
      Effect.sync(() => new http.Agent(options)),
      (agent) => Effect.sync(() => agent.destroy())
    ),
    Effect.acquireRelease(
      Effect.sync(() => new https.Agent(options)),
      (agent) => Effect.sync(() => agent.destroy())
    ),
    (http, https) => ({ http, https })
  )

/**
 * Provides the `HttpAgent` service using scoped Node `http` and `https`
 * agents configured with the supplied options.
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const layerAgentOptions: (options?: HttpAgentOptions | undefined) => Layer.Layer<
  HttpAgent
> = flow(makeAgent, Layer.effect(HttpAgent))

/**
 * Provides the `HttpAgent` service using default scoped Node `http` and
 * `https` agents.
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const layerAgent: Layer.Layer<HttpAgent> = layerAgentOptions()

/**
 * Creates an `HttpClient` backed by Node `http` and `https`, using the
 * current `HttpAgent`, streaming request bodies, and wrapping Node responses
 * as `HttpClientResponse` values.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const makeNodeHttp = Effect.gen(function*() {
  const agent = yield* HttpAgent
  return Client.make((request, url, signal) => {
    const nodeRequest = url.protocol === "https:" ?
      https.request(url, {
        agent: agent.https,
        method: request.method,
        headers: request.headers,
        signal
      }) :
      http.request(url, {
        agent: agent.http,
        method: request.method,
        headers: request.headers,
        signal
      })
    // Response headers must not interrupt the upload: a bidirectional server
    // answers before it has read the whole body. The upload runs detached and
    // is stopped once the request or the response closes.
    return sendBody(nodeRequest, request, request.body).pipe(
      Effect.onError(() => Effect.sync(() => nodeRequest.destroy())),
      Effect.forkDetach,
      Effect.flatMap((upload) => {
        const stopUpload = () => upload.interruptUnsafe()
        nodeRequest.once("close", stopUpload)
        return Effect.raceFirst(
          waitForResponse(nodeRequest, request, signal),
          Fiber.join(upload).pipe(Effect.andThen(Effect.never))
        ).pipe(
          Effect.map((result) => {
            // A keep-alive request stays open while its upload is unfinished,
            // even after the response has been fully consumed.
            result[0].once("close", stopUpload)
            return result
          })
        )
      }),
      Effect.onError(() => Effect.sync(() => nodeRequest.destroy())),
      Effect.map(([response, upgraded]) => new NodeHttpResponse(request, response, url.href.split("#")[0], upgraded))
    )
  })
})

const sendBody = (
  nodeRequest: Http.ClientRequest,
  request: HttpClientRequest,
  body: Body.HttpBody
): Effect.Effect<void, Error.HttpClientError> =>
  Effect.suspend((): Effect.Effect<void, Error.HttpClientError> => {
    switch (body._tag) {
      case "Empty": {
        nodeRequest.end()
        return waitForFinish(nodeRequest, request)
      }
      case "Uint8Array":
      case "Raw": {
        nodeRequest.end(body.body)
        return waitForFinish(nodeRequest, request)
      }
      case "FormData": {
        const { contentType, stream } = formDataBody(body.formData, request)
        nodeRequest.setHeader("content-type", contentType)
        return sendStream(nodeRequest, request, stream)
      }
      case "Stream": {
        return sendStream(
          nodeRequest,
          request,
          Stream.mapError(body.stream, (cause) =>
            new Error.HttpClientError({
              reason: new Error.EncodeError({
                request,
                cause
              })
            }))
        )
      }
    }
  })

const sendStream = (
  nodeRequest: Http.ClientRequest,
  request: HttpClientRequest,
  stream: Stream.Stream<Uint8Array, Error.HttpClientError>
): Effect.Effect<void, Error.HttpClientError> =>
  Stream.run(
    stream,
    NodeSink.fromWritable({
      evaluate: () => nodeRequest,
      // The upload fiber owns destruction after observing body failures.
      endOnDone: false,
      onError: (cause) =>
        new Error.HttpClientError({
          reason: new Error.TransportError({
            request,
            cause
          })
        })
    })
  ).pipe(Effect.andThen(() => {
    nodeRequest.end()
    return waitForFinish(nodeRequest, request)
  }))

/**
 * Encodes form data as multipart with the global `Response`, so the encoding
 * comes from the runtime instead of the external undici package.
 *
 * Some Node.js versions read every file eagerly when encoding and never report
 * read failures. Files are therefore encoded as empty placeholders and their
 * contents are streamed into the placeholder parts.
 */
const formDataBody = (formData: FormData, request: HttpClientRequest) => {
  const transportError = (cause: unknown) =>
    new Error.HttpClientError({ reason: new Error.TransportError({ request, cause }) })
  const entries = Array.from(formData)
  const placeholders = new globalThis.FormData()
  for (const [key, value] of entries) {
    if (typeof value === "string") placeholders.append(key, value)
    // A `Blob` with a file name, as the global `File` is missing on Node 18.
    else placeholders.append(key, new Blob([], { type: value.type }), value.name)
  }
  const response = new globalThis.Response(placeholders)
  const contentType = response.headers.get("content-type")!
  const delimiter = `--${contentType.slice(contentType.indexOf("boundary=") + 9)}`
  const stream = Stream.unwrap(Effect.map(Effect.promise(() => response.arrayBuffer()), (buffer) => {
    const encoded = Buffer.from(buffer)
    const streams: Array<Stream.Stream<Uint8Array, Error.HttpClientError>> = []
    let start = 0
    let delimiterAt = 0
    for (const [, value] of entries) {
      delimiterAt = encoded.indexOf(delimiter, delimiterAt + delimiter.length)
      if (typeof value === "string") continue
      // The file contents go before the CRLF that ends its empty placeholder part.
      const end = delimiterAt - 2
      streams.push(
        Stream.succeed(encoded.subarray(start, end)),
        Stream.unwrap(Effect.map(
          Effect.try({ try: () => value.stream(), catch: transportError }),
          (readable) => Stream.fromReadableStream({ evaluate: () => readable, onError: transportError })
        ))
      )
      start = end
    }
    streams.push(Stream.succeed(encoded.subarray(start)))
    return Stream.flatten(Stream.fromArray(streams))
  }))
  return { contentType, stream } as const
}

const waitForResponse = (nodeRequest: Http.ClientRequest, request: HttpClientRequest, signal: AbortSignal) =>
  Effect.callback<readonly [Http.IncomingMessage, Duplex?], Error.HttpClientError>((resume) => {
    function onError(cause: Error) {
      resume(Effect.fail(
        new Error.HttpClientError({
          reason: new Error.TransportError({
            request,
            cause
          })
        })
      ))
    }
    nodeRequest.on("error", onError)

    function onResponse(response: Http.IncomingMessage) {
      nodeRequest.off("error", onError)
      resume(Effect.succeed([response]))
    }
    nodeRequest.on("response", onResponse)

    function onUpgrade(response: Http.IncomingMessage, socket: Duplex, head: Buffer) {
      nodeRequest.off("error", onError)
      resume(Effect.succeed([response, takeOver(socket, head, signal)]))
    }
    nodeRequest.on("upgrade", onUpgrade)

    return Effect.sync(() => {
      nodeRequest.off("error", onError)
      nodeRequest.off("upgrade", onUpgrade)
      nodeRequest.off("response", onResponse)
    })
  })

const waitForFinish = (nodeRequest: Http.ClientRequest, request: HttpClientRequest) =>
  Effect.callback<void, Error.HttpClientError>((resume) => {
    function onError(cause: Error) {
      resume(Effect.fail(
        new Error.HttpClientError({
          reason: new Error.TransportError({
            request,
            cause
          })
        })
      ))
    }
    nodeRequest.once("error", onError)

    function onFinish() {
      nodeRequest.off("error", onError)
      resume(Effect.void)
    }
    nodeRequest.once("finish", onFinish)

    return Effect.sync(() => {
      nodeRequest.off("error", onError)
      nodeRequest.off("finish", onFinish)
    })
  })

class NodeHttpResponse extends NodeHttpIncomingMessage<Error.HttpClientError> implements HttpClientResponse, Pipeable {
  readonly [Response.TypeId]: typeof Response.TypeId
  readonly request: HttpClientRequest
  readonly url: string
  readonly upgraded: Duplex | undefined

  constructor(
    request: HttpClientRequest,
    source: Http.IncomingMessage,
    url: string,
    upgraded: Duplex | undefined
  ) {
    super(source, (cause) =>
      new Error.HttpClientError({
        reason: new Error.DecodeError({
          request,
          response: this,
          cause
        })
      }))
    this[Response.TypeId] = Response.TypeId
    this.request = request
    this.url = url
    this.upgraded = upgraded
  }

  get status() {
    return this.source.statusCode!
  }

  get upgrade(): Effect.Effect<Socket.Socket, Error.HttpClientError> {
    return upgradeSocket(this, this.upgraded)
  }

  cachedCookies?: Cookies.Cookies
  get cookies(): Cookies.Cookies {
    if (this.cachedCookies !== undefined) {
      return this.cachedCookies
    }
    const header = this.source.headers["set-cookie"]
    return this.cachedCookies = header ? Cookies.fromSetCookie(header) : Cookies.empty
  }

  get formData(): Effect.Effect<FormData, Error.HttpClientError> {
    return Effect.tryPromise({
      try: () => {
        const init: {
          headers: HeadersInit
          status?: number
          statusText?: string
        } = {
          headers: new globalThis.Headers(this.source.headers as any)
        }

        if (this.source.statusCode) {
          init.status = this.source.statusCode
        }

        if (this.source.statusMessage) {
          init.statusText = this.source.statusMessage
        }

        return new globalThis.Response(Readable.toWeb(this.source) as any, init).formData()
      },
      catch: this.onError
    })
  }

  toJSON(): unknown {
    return IncomingMessage.inspect(this, {
      _id: "effect/http/HttpClientResponse",
      request: this.request.toJSON(),
      status: this.status
    })
  }

  pipe() {
    return pipeArguments(this, arguments)
  }
}

/**
 * Provides a node:http-backed `HttpClient` using the current `HttpAgent`
 * service.
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const layerNodeHttpNoAgent: Layer.Layer<
  Client.HttpClient,
  never,
  HttpAgent
> = Client.layerMergedContext(makeNodeHttp)

/**
 * Provides a node:http-backed `HttpClient` together with default scoped Node
 * `http` and `https` agents.
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const layerNodeHttp: Layer.Layer<Client.HttpClient> = Layer.provide(layerNodeHttpNoAgent, layerAgent)

/**
 * Provides a node:http-backed `HttpClient` together with scoped Node `http`
 * and `https` agents configured with the supplied options.
 *
 * **When to use**
 *
 * Use to send every request over a unix domain socket with `{ socketPath }`,
 * or over TLS with a custom CA and client certificate with
 * `{ ca, cert, key, servername, rejectUnauthorized }`.
 *
 * **Details**
 *
 * See `HttpAgentOptions` for how the options are applied.
 *
 * @stability unstable
 * @category layers
 * @since 4.0.5
 */
export const layerNodeHttpOptions = (options?: HttpAgentOptions | undefined): Layer.Layer<Client.HttpClient> =>
  Layer.provide(layerNodeHttpNoAgent, layerAgentOptions(options))
