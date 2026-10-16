/**
 * Node.js implementations of the Effect `HttpClient`.
 *
 * This module supplies Node runtime backends for the platform-independent
 * Effect HTTP client API. It re-exports the fetch-based `Fetch`, `RequestInit`,
 * and `layerFetch` APIs, defines an Undici-backed client with dispatcher
 * services and request options, and defines a lower-level `node:http` /
 * `node:https` client with scoped HTTP agent layers.
 *
 * @since 4.0.0
 */
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import { flow } from "effect/Function"
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
import * as Stream from "effect/Stream"
import * as Http from "node:http"
import * as Https from "node:https"
import { Readable } from "node:stream"
import { pipeline } from "node:stream/promises"
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
   * @category services
   * @since 4.0.0
   */
  Fetch,
  /**
   * Layer that provides the fetch-based HTTP client implementation.
   *
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
 * Acquires a new Undici `Agent` dispatcher and destroys it when the enclosing
 * scope is finalized.
 *
 * @stability unstable
 * @category resource management
 * @since 4.0.0
 */
export const makeDispatcher: Effect.Effect<Undici.Dispatcher, never, Scope.Scope> = Effect.acquireRelease(
  Effect.map(loadUndici, (_) => new _.Agent()),
  (dispatcher) => Effect.promise(() => dispatcher.destroy())
)

/**
 * Provides the `Dispatcher` service using a scoped Undici `Agent`.
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const layerDispatcher: Layer.Layer<Dispatcher> = Layer.effect(Dispatcher)(makeDispatcher)

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
    convertBody(request.body).pipe(
      Effect.flatMap((body) =>
        Effect.tryPromise({
          try: () =>
            dispatcher.request({
              ...fiber.getRef(UndiciOptions),
              signal,
              method: request.method,
              headers: request.headers,
              origin: url.origin,
              path: url.pathname + url.search,
              body,
              // leave timeouts to Effect.timeout etc
              headersTimeout: 60 * 60 * 1000,
              bodyTimeout: 0
            }),
          catch: (cause) =>
            new Error.HttpClientError({
              reason: new Error.TransportError({
                request,
                cause
              })
            })
        })
      ),
      Effect.map((response) => new UndiciResponse(request, response, url.href.split("#")[0]))
    )
  )
})

function convertBody(
  body: Body.HttpBody
): Effect.Effect<Exclude<Undici.Dispatcher.DispatchOptions["body"], undefined>> {
  switch (body._tag) {
    case "Empty": {
      return Effect.succeed(null)
    }
    case "Uint8Array":
    case "Raw": {
      return Effect.succeed(body.body as Uint8Array)
    }
    case "FormData": {
      return Effect.succeed(body.formData as any)
    }
    case "Stream": {
      return NodeStream.toReadable(body.stream)
    }
  }
}

function noopErrorHandler(_: any) {}

class UndiciResponse extends Inspectable.Class implements HttpClientResponse, Pipeable {
  readonly [IncomingMessage.TypeId]: typeof IncomingMessage.TypeId
  readonly [Response.TypeId]: typeof Response.TypeId
  readonly request: HttpClientRequest
  readonly source: Undici.Dispatcher.ResponseData
  readonly url: string

  constructor(
    request: HttpClientRequest,
    source: Undici.Dispatcher.ResponseData,
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

// -----------------------------------------------------------------------------
// node:http
// -----------------------------------------------------------------------------

/**
 * Service tag for the paired Node `http` and `https` agents used by the
 * node:http-backed HTTP client.
 *
 * @category services
 * @since 4.0.0
 */
export class HttpAgent extends Context.Service<HttpAgent, {
  readonly http: Http.Agent
  readonly https: Https.Agent
}>()("@effect/platform-node/NodeHttpClient/HttpAgent") {}

/**
 * Acquires Node `http` and `https` agents with the supplied options and
 * destroys both agents when the enclosing scope is finalized.
 *
 * @category resource management
 * @since 4.0.0
 */
export const makeAgent = (options?: Https.AgentOptions): Effect.Effect<HttpAgent["Service"], never, Scope.Scope> =>
  Effect.zipWith(
    Effect.acquireRelease(
      Effect.sync(() => new Http.Agent(options)),
      (agent) => Effect.sync(() => agent.destroy())
    ),
    Effect.acquireRelease(
      Effect.sync(() => new Https.Agent(options)),
      (agent) => Effect.sync(() => agent.destroy())
    ),
    (http, https) => ({ http, https })
  )

/**
 * Provides the `HttpAgent` service using scoped Node `http` and `https`
 * agents configured with the supplied options.
 *
 * @category layers
 * @since 4.0.0
 */
export const layerAgentOptions: (options?: Https.AgentOptions | undefined) => Layer.Layer<
  HttpAgent
> = flow(makeAgent, Layer.effect(HttpAgent))

/**
 * Provides the `HttpAgent` service using default scoped Node `http` and
 * `https` agents.
 *
 * @category layers
 * @since 4.0.0
 */
export const layerAgent: Layer.Layer<HttpAgent> = layerAgentOptions()

/**
 * Creates an `HttpClient` backed by Node `http` and `https`, using the
 * current `HttpAgent`, streaming request bodies, and wrapping Node responses
 * as `HttpClientResponse` values.
 *
 * @category constructors
 * @since 4.0.0
 */
export const makeNodeHttp = Effect.gen(function*() {
  const agent = yield* HttpAgent
  return Client.make((request, url, signal) => {
    const nodeRequest = url.protocol === "https:" ?
      Https.request(url, {
        agent: agent.https,
        method: request.method,
        headers: request.headers,
        signal
      }) :
      Http.request(url, {
        agent: agent.http,
        method: request.method,
        headers: request.headers,
        signal
      })
    return Effect.raceFirst(
      waitForResponse(nodeRequest, request),
      sendBody(nodeRequest, request, request.body).pipe(Effect.andThen(Effect.never))
    ).pipe(
      Effect.onError(() => Effect.sync(() => nodeRequest.destroy())),
      Effect.map((_) => new NodeHttpResponse(request, _, url.href.split("#")[0]))
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
        const response = new globalThis.Response(body.formData)

        response.headers.forEach((value, key) => {
          nodeRequest.setHeader(key, value)
        })

        return Effect.tryPromise({
          try: () => pipeline(Readable.fromWeb(response.body! as any), nodeRequest),
          catch: (cause) =>
            new Error.HttpClientError({
              reason: new Error.TransportError({
                request,
                cause
              })
            })
        })
      }
      case "Stream": {
        return Stream.run(
          Stream.mapError(body.stream, (cause) =>
            new Error.HttpClientError({
              reason: new Error.EncodeError({
                request,
                cause
              })
            })),
          NodeSink.fromWritable({
            evaluate: () => nodeRequest,
            onError: (cause) =>
              new Error.HttpClientError({
                reason: new Error.TransportError({
                  request,
                  cause
                })
              })
          })
        )
      }
    }
  })

const waitForResponse = (nodeRequest: Http.ClientRequest, request: HttpClientRequest) =>
  Effect.callback<Http.IncomingMessage, Error.HttpClientError>((resume) => {
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
      resume(Effect.succeed(response))
    }
    nodeRequest.on("upgrade", onResponse)
    nodeRequest.on("response", onResponse)

    return Effect.sync(() => {
      nodeRequest.off("error", onError)
      nodeRequest.off("upgrade", onResponse)
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

  constructor(
    request: HttpClientRequest,
    source: Http.IncomingMessage,
    url: string
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
  }

  get status() {
    return this.source.statusCode!
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
 * @category layers
 * @since 4.0.0
 */
export const layerNodeHttp: Layer.Layer<Client.HttpClient> = Layer.provide(layerNodeHttpNoAgent, layerAgent)
