/**
 * Node.js implementation of the Effect `HttpServer`.
 *
 * This module adapts a supplied Node `http.Server` into Effect's
 * platform-independent HTTP server service. It starts the server with Node
 * `listen` options, converts `request` events into `HttpServerRequest` values,
 * writes `HttpServerResponse` bodies through Node's `ServerResponse`, and
 * handles `upgrade` events by exposing the upgraded socket through
 * `HttpServerRequest.upgrade`. It also exports request and upgrade handler
 * constructors plus layers for the server alone, HTTP support services, the
 * combined server, configurable options, and tests.
 *
 * @since 4.0.0
 */
import * as Cause from "effect/Cause"
import * as Config from "effect/Config"
import * as Context from "effect/Context"
import * as Duration from "effect/Duration"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Fiber from "effect/Fiber"
import type * as FileSystem from "effect/FileSystem"
import { flow, type LazyArg } from "effect/Function"
import * as Cookies from "effect/http/Cookies"
import * as Etag from "effect/http/Etag"
import * as FetchHttpClient from "effect/http/FetchHttpClient"
import type * as Headers from "effect/http/Headers"
import type { HttpClient } from "effect/http/HttpClient"
import * as HttpEffect from "effect/http/HttpEffect"
import * as HttpIncomingMessage from "effect/http/HttpIncomingMessage"
import type { HttpMethod } from "effect/http/HttpMethod"
import type * as Middleware from "effect/http/HttpMiddleware"
import type * as HttpPlatform from "effect/http/HttpPlatform"
import * as HttpServer from "effect/http/HttpServer"
import {
  causeResponse,
  ClientAbort,
  HttpServerError,
  RequestParseError,
  ResponseError,
  ServeError
} from "effect/http/HttpServerError"
import * as Request from "effect/http/HttpServerRequest"
import { HttpServerRequest } from "effect/http/HttpServerRequest"
import type { HttpServerResponse } from "effect/http/HttpServerResponse"
import type * as Multipart from "effect/http/Multipart"
import * as Latch from "effect/Latch"
import * as Layer from "effect/Layer"
import * as NetAddress from "effect/net/NetAddress"
import type * as Option from "effect/Option"
import type * as Path from "effect/Path"
import type * as Record from "effect/Record"
import * as Scope from "effect/Scope"
import * as Socket from "effect/socket/Socket"
import * as Stream from "effect/Stream"
import * as Http from "node:http"
import type * as Net from "node:net"
import type { Duplex } from "node:stream"
import { Readable } from "node:stream"
import { pipeline } from "node:stream/promises"
import { NodeHttpIncomingMessage } from "./NodeHttpIncomingMessage.ts"
import * as NodeHttpPlatform from "./NodeHttpPlatform.ts"
import * as NodeMultipart from "./NodeMultipart.ts"
import * as NodeServices from "./NodeServices.ts"
import { NodeWS } from "./NodeSocket.ts"

/**
 * Options accepted by the Node `HttpServer` constructors and layers.
 *
 * @category options
 * @since 4.0.0
 */
export interface Options extends Net.ListenOptions {
  readonly disablePreemptiveShutdown?: boolean | undefined
  readonly gracefulShutdownTimeout?: Duration.Input | undefined
  /**
   * Options forwarded to the underlying `ws` `WebSocketServer`, minus the
   * wiring options the server manages itself. Use this to enable
   * `permessage-deflate` compression or tune payload limits, e.g.
   * `websocket: { perMessageDeflate: true }`.
   *
   * @stability unstable
   */
  readonly websocket?:
    | Omit<NodeWS.ServerOptions, "noServer" | "server" | "host" | "port" | "path">
    | undefined
}

/**
 * Creates a scoped `HttpServer` from a Node `http.Server`, starts listening
 * with the supplied options, registers request and upgrade handling, and closes
 * the server during scope finalization with optional graceful-shutdown control.
 *
 * @category constructors
 * @since 4.0.0
 */
export const make = Effect.fnUntraced(function*(
  evaluate: LazyArg<Http.Server>,
  options: Options
) {
  const scope = yield* Effect.scope
  const server = evaluate()

  const shutdown = yield* Effect.callback<void>((resume) => {
    if (!server.listening) {
      return resume(Effect.void)
    }
    server.close((error) => {
      if (error) {
        resume(Effect.die(error))
      } else {
        resume(Effect.void)
      }
    })
  }).pipe(Effect.cached)

  const preemptiveShutdown = options.disablePreemptiveShutdown ?
    Effect.void :
    Effect.timeoutOrElse(shutdown, {
      duration: options.gracefulShutdownTimeout ?? Duration.seconds(20),
      orElse: () => Effect.void
    })

  yield* Scope.addFinalizer(scope, shutdown)

  yield* Effect.callback<void, ServeError>((resume) => {
    function onError(cause: Error) {
      resume(Effect.fail(new ServeError({ cause })))
    }
    server.on("error", onError)
    server.listen(options, () => {
      server.off("error", onError)
      resume(Effect.void)
    })
  })

  const address = server.address()!
  const effectAddress = typeof address === "string"
    ? Effect.succeed(NetAddress.unixPathAddress(address))
    : Effect.fromResult(NetAddress.inetAddressFromIpString(address.address, address.port)).pipe(
      Effect.mapError((cause) => new ServeError({ cause }))
    )
  const boundAddress = yield* effectAddress

  const wss = yield* Effect.acquireRelease(
    Effect.sync(() => new NodeWS.WebSocketServer({ ...options.websocket, noServer: true })),
    (wss) =>
      Effect.callback<void>((resume) => {
        wss.close(() => resume(Effect.void))
      })
  ).pipe(
    Scope.provide(scope),
    Effect.cached
  )

  return HttpServer.make({
    address: boundAddress,
    serve: Effect.fnUntraced(function*(httpApp, middleware) {
      const serveScope = yield* Effect.scope
      const scope = Scope.forkUnsafe(serveScope, "parallel")
      const handler = yield* (makeHandler(httpApp, {
        middleware: middleware as any,
        scope
      }) as Effect.Effect<(nodeRequest: Http.IncomingMessage, nodeResponse: Http.ServerResponse) => void>)
      const upgradeHandler = yield* makeUpgradeHandler(wss, httpApp, {
        middleware: middleware as any,
        scope
      })
      yield* Scope.addFinalizerExit(serveScope, () => {
        server.off("request", handler)
        server.off("upgrade", upgradeHandler)
        return preemptiveShutdown
      })
      server.on("request", handler)
      server.on("upgrade", upgradeHandler)
    })
  })
})

/**
 * Creates a Node `request` event handler for an Effect HTTP application,
 * injecting a `HttpServerRequest` and interrupting the request fiber if the
 * client closes the response before it finishes.
 *
 * @category handlers
 * @since 4.0.0
 */
export const makeHandler = <
  R,
  E,
  App extends Effect.Effect<HttpServerResponse, any, any> = Effect.Effect<HttpServerResponse, E, R>
>(
  httpEffect: Effect.Effect<HttpServerResponse, E, R>,
  options: {
    readonly scope: Scope.Scope
    readonly middleware?: Middleware.HttpMiddleware.Applied<App, E, R> | undefined
  }
): Effect.Effect<
  (nodeRequest: Http.IncomingMessage, nodeResponse: Http.ServerResponse) => void,
  never,
  Exclude<Effect.Services<App>, HttpServerRequest | Scope.Scope>
> => {
  const handled = HttpEffect.toHandled(httpEffect, handleResponse, options.middleware as any)
  return Effect.withFiber((parent) => {
    const services = parent.context
    return Effect.succeed(function handler(
      nodeRequest: Http.IncomingMessage,
      nodeResponse: Http.ServerResponse
    ) {
      const context = Context.add(services, HttpServerRequest, new ServerRequestImpl(nodeRequest, nodeResponse))
      const fiber = Fiber.runIn(Effect.runForkWith(context as Context.Context<any>)(handled), options.scope)
      if (fiber.pollUnsafe() === undefined) {
        nodeResponse.on("close", () => {
          if (!nodeResponse.writableEnded) {
            fiber.interruptUnsafe(parent.id, ClientAbort.annotation)
          }
        })
      }
    })
  })
}

/**
 * Creates a Node `upgrade` event handler for an Effect HTTP application,
 * exposing the upgraded WebSocket as the request's `upgrade` effect and
 * interrupting the request fiber when the socket closes early.
 *
 * @stability unstable
 * @category handlers
 * @since 4.0.0
 */
export const makeUpgradeHandler = <
  R,
  E,
  App extends Effect.Effect<HttpServerResponse, any, any> = Effect.Effect<HttpServerResponse, E, R>
>(
  lazyWss: Effect.Effect<NodeWS.WebSocketServer>,
  httpEffect: Effect.Effect<HttpServerResponse, E, R>,
  options: {
    readonly scope: Scope.Scope
    readonly middleware?: Middleware.HttpMiddleware.Applied<App, E, R> | undefined
  }
): Effect.Effect<
  (nodeRequest: Http.IncomingMessage, socket: Duplex, head: Buffer) => void,
  never,
  Exclude<Effect.Services<App>, HttpServerRequest | Scope.Scope>
> => {
  const handledApp = HttpEffect.toHandled(httpEffect, handleResponse, options.middleware as any)
  return Effect.withFiber((parent) => {
    const services = parent.context
    return Effect.succeed(function handler(
      nodeRequest: Http.IncomingMessage,
      socket: Duplex,
      head: Buffer
    ) {
      let upgraded = false
      let nodeResponse_: Http.ServerResponse | undefined = undefined
      const nodeResponse = () => {
        if (nodeResponse_ === undefined) {
          nodeResponse_ = new Http.ServerResponse(nodeRequest)
          if (upgraded || socket.destroyed) {
            // End without assigning the socket so handleResponse skips HTTP writes.
            nodeResponse_.end()
          } else {
            nodeResponse_.assignSocket(socket as any)
            nodeResponse_.on("finish", () => {
              socket.end()
            })
          }
        }
        return nodeResponse_
      }
      const upgradeEffect = Socket.fromWebSocket(Effect.flatMap(
        lazyWss,
        (wss) =>
          Effect.acquireRelease(
            Effect.callback<NodeWS.WebSocket, Socket.SocketError>((resume) => {
              // A refused handshake never invokes the callback, so fail on close instead.
              const onClose = () =>
                resume(Effect.fail(
                  new Socket.SocketError({
                    reason: new Socket.SocketOpenError({
                      kind: "Unknown",
                      cause: new Error("The socket closed before the upgrade")
                    })
                  })
                ))
              if (socket.destroyed) return onClose()
              socket.once("close", onClose)
              wss.handleUpgrade(nodeRequest, socket, head, (ws) => {
                socket.off("close", onClose)
                upgraded = true
                resume(Effect.succeed(ws))
              })
            }),
            (ws, exit) => Effect.sync(() => ws.close(closeCode(exit)))
          )
      ))
      const context = Context.add(
        services,
        HttpServerRequest,
        new ServerRequestImpl(nodeRequest, nodeResponse, upgradeEffect)
      )
      const fiber = Fiber.runIn(Effect.runForkWith(context as Context.Context<any>)(handledApp), options.scope)
      socket.on("error", () => {})
      socket.on("close", () => {
        if (!socket.writableEnded) {
          fiber.interruptUnsafe(parent.id, ClientAbort.annotation)
        }
      })
    })
  })
}

class ServerRequestImpl extends NodeHttpIncomingMessage<HttpServerError> implements HttpServerRequest {
  readonly [Request.TypeId]: typeof Request.TypeId
  readonly response: Http.ServerResponse | LazyArg<Http.ServerResponse>
  private upgradeEffect?: Effect.Effect<Socket.Socket, HttpServerError> | undefined
  readonly url: string
  private headersOverride?: Headers.Headers | undefined

  constructor(
    source: Http.IncomingMessage,
    response: Http.ServerResponse | LazyArg<Http.ServerResponse>,
    upgradeEffect?: Effect.Effect<Socket.Socket, HttpServerError>,
    url = source.url!,
    headersOverride?: Headers.Headers,
    remoteAddressOverride?: Option.Option<string>
  ) {
    super(source, (cause) =>
      new HttpServerError({
        reason: new RequestParseError({
          request: this,
          cause
        })
      }), remoteAddressOverride)
    this[Request.TypeId] = Request.TypeId
    this.response = response
    this.upgradeEffect = upgradeEffect
    this.url = url
    this.headersOverride = headersOverride
  }

  private cachedCookies: Record.ReadonlyRecord<string, string> | undefined
  get cookies() {
    if (this.cachedCookies) {
      return this.cachedCookies
    }
    return this.cachedCookies = Cookies.parseHeader(this.headers.cookie ?? "")
  }

  get resolvedResponse(): Http.ServerResponse {
    return typeof this.response === "function" ? this.response() : this.response
  }

  modify(
    options: {
      readonly url?: string | undefined
      readonly headers?: Headers.Headers | undefined
      readonly remoteAddress?: Option.Option<string> | undefined
    }
  ) {
    return new ServerRequestImpl(
      this.source,
      this.response,
      this.upgradeEffect,
      options.url ?? this.url,
      options.headers ?? this.headersOverride,
      "remoteAddress" in options ? options.remoteAddress : this.remoteAddressOverride
    )
  }

  get originalUrl(): string {
    return this.source.url!
  }

  private cachedMethod: HttpMethod | undefined
  get method(): HttpMethod {
    return this.cachedMethod ??= this.source.method!.toUpperCase() as HttpMethod
  }

  override get headers(): Headers.Headers {
    this.headersOverride ??= this.source.headers as Headers.Headers
    return this.headersOverride
  }

  private multipartEffect:
    | Effect.Effect<
      Multipart.Persisted,
      Multipart.MultipartError,
      Scope.Scope | FileSystem.FileSystem | Path.Path
    >
    | undefined
  get multipart(): Effect.Effect<
    Multipart.Persisted,
    Multipart.MultipartError,
    Scope.Scope | FileSystem.FileSystem | Path.Path
  > {
    if (this.multipartEffect) {
      return this.multipartEffect
    }
    this.multipartEffect = Effect.runSync(Effect.cached(
      NodeMultipart.persisted(this.source, this.source.headers)
    ))
    return this.multipartEffect
  }

  get multipartStream(): Stream.Stream<Multipart.Part, Multipart.MultipartError> {
    return NodeMultipart.stream(this.source, this.source.headers)
  }

  get upgrade(): Effect.Effect<Socket.Socket, HttpServerError> {
    return this.upgradeEffect ?? Effect.fail(
      new HttpServerError({
        reason: new RequestParseError({
          request: this,
          description: "not an upgradeable ServerRequest"
        })
      })
    )
  }

  override toString(): string {
    return `ServerRequest(${this.method} ${this.url})`
  }

  toJSON(): unknown {
    return HttpIncomingMessage.inspect(this, {
      _id: "HttpServerRequest",
      method: this.method,
      url: this.originalUrl
    })
  }
}

/**
 * Provides an `HttpServer` by creating and managing a scoped Node
 * `http.Server` with the supplied listen and shutdown options.
 *
 * @category layers
 * @since 4.0.0
 */
export const layerServer: (
  evaluate: LazyArg<Http.Server<typeof Http.IncomingMessage, typeof Http.ServerResponse>>,
  options: Options
) => Layer.Layer<HttpServer.HttpServer, ServeError> = flow(make, Layer.effect(HttpServer.HttpServer))

/**
 * Provides the Node HTTP support services used by `NodeHttpServer`, including
 * the HTTP platform, ETag generator, and core Node platform services.
 *
 * @category layers
 * @since 4.0.0
 */
export const layerHttpServices: Layer.Layer<
  NodeServices.NodeServices | HttpPlatform.HttpPlatform | Etag.Generator
> = Layer.mergeAll(
  NodeHttpPlatform.layer,
  Etag.layerWeak,
  NodeServices.layer
)

/**
 * Provides a Node `HttpServer` together with the Node HTTP platform, ETag, and
 * core platform services required to serve requests.
 *
 * @category layers
 * @since 4.0.0
 */
export const layer = (
  evaluate: LazyArg<Http.Server>,
  options: Options
): Layer.Layer<
  HttpServer.HttpServer | NodeServices.NodeServices | HttpPlatform.HttpPlatform | Etag.Generator,
  ServeError
> =>
  Layer.mergeAll(
    layerServer(evaluate, options),
    layerHttpServices
  )

/**
 * Provides a Node `HttpServer` together with the Node HTTP platform, ETag,
 * and core Node platform services, reading the listen and shutdown options from
 * a `Config` value.
 *
 * @category layers
 * @since 4.0.0
 */
export const layerConfig = (
  evaluate: LazyArg<Http.Server>,
  options: Config.Wrap<Options>
): Layer.Layer<
  HttpServer.HttpServer | NodeServices.NodeServices | HttpPlatform.HttpPlatform | Etag.Generator,
  ServeError | Config.ConfigError
> =>
  Layer.mergeAll(
    Layer.effect(HttpServer.HttpServer)(
      Effect.flatMap(Config.unwrap(options), (options) => make(evaluate, options))
    ),
    layerHttpServices
  )

/**
 * Provides a test HTTP server listening on an ephemeral port together with a
 * Fetch-backed `HttpClient` configured for server integration tests.
 *
 * @category testing
 * @since 4.0.0
 */
export const layerTest: Layer.Layer<
  | HttpServer.HttpServer
  | FileSystem.FileSystem
  | Path.Path
  | HttpPlatform.HttpPlatform
  | Etag.Generator
  | HttpClient,
  ServeError,
  never
> = HttpServer.layerTestClient.pipe(
  Layer.provide(
    Layer.fresh(FetchHttpClient.layer).pipe(
      Layer.provide(Layer.succeed(FetchHttpClient.RequestInit)({ keepalive: false }))
    )
  ),
  Layer.provideMerge(layer(Http.createServer, { port: 0 }))
)

// -----------------------------------------------------------------------------
// Internal
// -----------------------------------------------------------------------------

const closeCode = (exit: Exit.Exit<unknown, unknown>): number =>
  Exit.isSuccess(exit) ? 1000 : Cause.hasInterruptsOnly(exit.cause) ? 1001 : 1011

const handleResponse = (
  request: HttpServerRequest,
  response: HttpServerResponse
): Effect.Effect<void, HttpServerError> => {
  const nodeResponse = (request as ServerRequestImpl).resolvedResponse
  if (nodeResponse.writableEnded) {
    return Effect.void
  }

  let headers: Record<string, string | Array<string>> = response.headers
  if (!Cookies.isEmpty(response.cookies)) {
    headers = { ...headers }
    const toSet = Cookies.toSetCookieHeaders(response.cookies)
    if (headers["set-cookie"] !== undefined) {
      toSet.push(headers["set-cookie"] as string)
    }
    headers["set-cookie"] = toSet
  }

  if (request.method === "HEAD") {
    nodeResponse.writeHead(response.status, response.statusText, headers)
    return Effect.andThen(
      cancelResponseBody(response.body),
      Effect.callback<void>((resume) => {
        let completed = false
        const done = () => {
          if (completed) return
          completed = true
          nodeResponse.off("close", done)
          resume(Effect.void)
        }
        nodeResponse.once("close", done)
        nodeResponse.end(done)
      })
    )
  }
  const body = response.body
  switch (body._tag) {
    case "Empty": {
      nodeResponse.writeHead(response.status, response.statusText, headers)
      nodeResponse.end()
      return Effect.void
    }
    case "Raw": {
      nodeResponse.writeHead(response.status, response.statusText, headers)
      if (
        typeof body.body === "object" && body.body !== null && "pipe" in body.body &&
        typeof body.body.pipe === "function"
      ) {
        return Effect.tryPromise({
          try: (signal) => pipeline(body.body as any, nodeResponse, { signal, end: true }),
          catch: (cause) =>
            new HttpServerError({
              reason: new ResponseError({
                request,
                response,
                description: "Error writing raw response",
                cause
              })
            })
        }).pipe(
          Effect.interruptible,
          Effect.tapCause(handleCause(nodeResponse, response))
        )
      }
      return Effect.callback<void>((resume) => {
        nodeResponse.end(body.body, () => resume(Effect.void))
      })
    }
    case "Uint8Array": {
      nodeResponse.writeHead(response.status, response.statusText, headers)
      // If the body is less than 1MB, we skip the callback
      if (body.contentLength < 1024 * 1024) {
        // Writing text directly lets Node flush headers and body together.
        nodeResponse.end(body.text ?? body.body)
        return Effect.void
      }
      return Effect.callback<void>((resume) => {
        nodeResponse.end(body.text ?? body.body, () => resume(Effect.void))
      })
    }
    case "FormData": {
      return Effect.suspend(() => {
        const r = new globalThis.Response(body.formData)
        nodeResponse.writeHead(response.status, response.statusText, {
          ...headers,
          ...Object.fromEntries(r.headers)
        })
        return Effect.callback<void, HttpServerError>((resume, signal) => {
          Readable.fromWeb(r.body as any, { signal })
            .pipe(nodeResponse)
            .on("error", (cause) => {
              resume(Effect.fail(
                new HttpServerError({
                  reason: new ResponseError({
                    request,
                    response,
                    description: "Error writing FormData response",
                    cause
                  })
                })
              ))
            })
            .once("finish", () => {
              resume(Effect.void)
            })
        }).pipe(
          Effect.interruptible,
          Effect.tapCause(handleCause(nodeResponse, response))
        )
      })
    }
    case "Stream": {
      nodeResponse.writeHead(response.status, response.statusText, headers)
      const drainLatch = Latch.makeUnsafe()
      nodeResponse.on("drain", () => drainLatch.openUnsafe())
      return body.stream.pipe(
        Stream.orDie,
        Stream.runForEachArray((array) => {
          const chunk = array.length > 1 ? Buffer.concat(array) : array[0]
          if (nodeResponse.write(chunk)) return Effect.void
          drainLatch.closeUnsafe()
          return drainLatch.await
        }),
        Effect.interruptible,
        Effect.matchCauseEffect({
          onSuccess: () => Effect.sync(() => nodeResponse.end()),
          onFailure: handleCause(nodeResponse, response)
        })
      )
    }
  }
}

const cancelResponseBody = (body: HttpServerResponse["body"]): Effect.Effect<void> => {
  const stream = body._tag === "Raw" ? body.body : undefined
  if (stream instanceof Readable) {
    return Effect.sync(() => stream.destroy())
  }
  return Effect.void
}

const handleCause = (
  nodeResponse: Http.ServerResponse,
  originalResponse: HttpServerResponse
) =>
<E>(originalCause: Cause.Cause<E>) =>
  Effect.flatMap(causeResponse(originalCause), ([response, cause]) => {
    const headersSent = nodeResponse.headersSent
    if (!headersSent) {
      nodeResponse.writeHead(response.status, response.statusText)
    }
    if (!nodeResponse.writableEnded) {
      nodeResponse.end()
    }
    return Effect.failCause(
      headersSent
        ? Cause.combine(originalCause, Cause.die(originalResponse))
        : cause
    )
  })
