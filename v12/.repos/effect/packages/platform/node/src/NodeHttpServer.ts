/**
 * Node.js implementation of the Effect `HttpServer`.
 *
 * This module adapts a supplied Node `http.Server` or `node:http2` server into
 * Effect's platform-independent HTTP server service. It starts the server with
 * Node `listen` options, converts `request` events into `HttpServerRequest`
 * values, writes `HttpServerResponse` bodies through Node's `ServerResponse`,
 * and handles `upgrade` events by exposing the upgraded socket through
 * `HttpServerRequest.upgrade`. It also exports request and upgrade handler
 * constructors plus layers for the server alone, HTTP support services, the
 * combined server, configurable options, and tests.
 *
 * **HTTP/2**
 *
 * Pass `Http2.createServer()` for cleartext HTTP/2 (h2c), or
 * `Http2.createSecureServer({ key, cert, allowHTTP1: true })` to negotiate
 * HTTP/2 over TLS and fall back to HTTP/1.1 for clients that do not support
 * it. The protocol is detected per request, so the application sees the same
 * `HttpServerRequest` either way:
 *
 * - pseudo-headers are removed from `headers`, and `host` is taken from
 *   `:authority`
 * - `originalUrl` and `HttpServerRequest.toURL` use the `:scheme` the client
 *   sent, which a client can set as freely as `x-forwarded-proto`
 * - connection-specific response headers that HTTP/2 forbids, such as
 *   `connection`, `keep-alive` and `transfer-encoding`, are dropped silently
 * - a response that fails after its headers were sent resets the stream with
 *   `INTERNAL_ERROR`, so clients do not mistake a truncated body for a
 *   complete one
 *
 * WebSockets and other upgrades only work over HTTP/1.1, which needs
 * `allowHTTP1` on a TLS server. Trailers are only available through the Node
 * objects from `NodeHttpServerRequest`. Tune HTTP/2 limits, such as
 * `maxSessionMemory` and `settings.maxConcurrentStreams`, through the Node
 * server options.
 *
 * @stability unstable
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
import * as Headers from "effect/http/Headers"
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
  InternalError,
  RequestParseError,
  ResponseError,
  ServeError
} from "effect/http/HttpServerError"
import * as Request from "effect/http/HttpServerRequest"
import { HttpServerRequest } from "effect/http/HttpServerRequest"
import type { HttpServerResponse } from "effect/http/HttpServerResponse"
import * as Response from "effect/http/HttpServerResponse"
import type * as Multipart from "effect/http/Multipart"
import * as UrlParams from "effect/http/UrlParams"
import * as Latch from "effect/Latch"
import * as Layer from "effect/Layer"
import * as NetAddress from "effect/net/NetAddress"
import type * as Option from "effect/Option"
import type * as Path from "effect/Path"
import type * as Record from "effect/Record"
import * as Scope from "effect/Scope"
import * as Socket from "effect/socket/Socket"
import * as Stream from "effect/Stream"
import type * as Http from "node:http"
import type * as Http2 from "node:http2"
import type * as Net from "node:net"
import type { Duplex } from "node:stream"
import { Readable, Transform } from "node:stream"
import { pipeline } from "node:stream/promises"
import type * as Tls from "node:tls"
import { http } from "./internal/http.ts"
import * as Upgrade from "./internal/upgrade.ts"
import { NodeHttpIncomingMessage } from "./NodeHttpIncomingMessage.ts"
import * as NodeHttpPlatform from "./NodeHttpPlatform.ts"
import * as NodeMultipart from "./NodeMultipart.ts"
import * as NodeServices from "./NodeServices.ts"
import * as NodeStream from "./NodeStream.ts"
import * as NodeWS from "./NodeWS.ts"

/**
 * Options accepted by the Node `HttpServer` constructors and layers.
 *
 * @stability unstable
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
 * Creates a scoped `HttpServer` from a Node `http.Server` or `node:http2`
 * server, starts listening with the supplied options, registers request and
 * upgrade handling, and closes the server during scope finalization with
 * optional graceful-shutdown control.
 *
 * **Details**
 *
 * Node's own timeouts are set on the server you create, for example
 * `createServer({ requestTimeout: 0, headersTimeout: 60_000 })`:
 *
 * - `requestTimeout` (default 300 seconds) bounds receiving the whole request,
 *   headers and body. On expiry Node answers `408`, or closes the connection
 *   if the response has started. It is checked every
 *   `connectionsCheckingInterval` (default 30 seconds). `0` disables it.
 * - `headersTimeout` (default 60 seconds) bounds receiving the headers. Left
 *   unset, it is lowered to a smaller `requestTimeout`, so `requestTimeout: 0`
 *   alone disables both. When both are nonzero it may not exceed
 *   `requestTimeout`.
 * - `keepAliveTimeout` (default 5 seconds) closes connections idle between
 *   requests.
 * - `server.timeout`, socket inactivity, is off by default, so a quiet
 *   response stream is never cut once the request is received.
 *
 * Use `Stream` and `Effect` timeouts in handlers or middleware for per-route
 * limits on reading the body or producing the response.
 *
 * **Gotchas**
 *
 * A request counts as received once Node has parsed the whole body, so a
 * handler that streams a response without reading a large body is still under
 * `requestTimeout` and is cut when it expires.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const make = Effect.fnUntraced(function*(
  evaluate: LazyArg<Http.Server | Http2.Http2Server | Http2.Http2SecureServer>,
  options: Options
) {
  const scope = yield* Effect.scope
  // The members used here exist on every server kind, with listener types that differ per kind.
  const server = evaluate() as Http.Server

  // Node 22 `close` waits for idle HTTP/2 sessions, and no version closes a session whose TLS
  // handshake finishes after `close`. Closing them still lets open streams finish.
  let closing = false
  const sessions = new Set<Http2.ServerHttp2Session>()
  server.on("session", (session: Http2.ServerHttp2Session) => {
    if (closing) {
      return session.close()
    }
    sessions.add(session)
    session.once("close", () => sessions.delete(session))
  })

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
    closing = true
    for (const session of sessions) {
      session.close()
    }
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
      const checkContinueHandler = (request: Http.IncomingMessage, response: Http.ServerResponse) => {
        pendingContinue.add(request)
        handler(request, response)
      }
      yield* Scope.addFinalizerExit(serveScope, () =>
        Effect.ensuring(
          preemptiveShutdown,
          Effect.sync(() => {
            server.off("request", handler)
            server.off("checkContinue", checkContinueHandler)
            server.off("upgrade", upgradeHandler)
          })
        ))
      server.on("request", handler)
      server.on("checkContinue", checkContinueHandler)
      server.on("upgrade", upgradeHandler)
    })
  })
})

/**
 * Creates a Node `request` event handler for an Effect HTTP application,
 * injecting a `HttpServerRequest` and interrupting the request fiber if the
 * client closes the response before it finishes. It accepts both HTTP/1.1 and
 * HTTP/2 compatibility requests.
 *
 * @stability unstable
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
  (
    nodeRequest: Http.IncomingMessage | Http2.Http2ServerRequest,
    nodeResponse: Http.ServerResponse | Http2.Http2ServerResponse
  ) => void,
  never,
  Exclude<Effect.Services<App>, HttpServerRequest | Scope.Scope>
> => {
  const handled = HttpEffect.toHandled(httpEffect, handleResponse, options.middleware as any)
  return Effect.withFiber((parent) => {
    const services = parent.context
    return Effect.succeed(function handler(
      request: Http.IncomingMessage | Http2.Http2ServerRequest,
      response: Http.ServerResponse | Http2.Http2ServerResponse
    ) {
      // The HTTP/2 compatibility API mirrors the members the adapter uses.
      const nodeRequest = request as Http.IncomingMessage
      const nodeResponse = response as Http.ServerResponse
      if (nodeRequest.httpVersionMajor === 1) {
        // Prepended so it runs before Node's own `finish` listener drains or destroys.
        nodeResponse.prependListener("finish", () => teardownBody(nodeRequest, nodeResponse))
      }
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
 * exposing the upgraded connection as the request's `upgrade` effect and
 * interrupting the request fiber when the socket closes early.
 *
 * **Details**
 *
 * `Upgrade: websocket` requests complete the WebSocket handshake. Any other
 * protocol answers `101 Switching Protocols` with the requested protocol and
 * the headers given to `upgradeWith`, and exposes the raw connection, with
 * bytes the client sent after the request body first on the reader. Either
 * response is sent when the socket's reader is acquired. A handler that never
 * asks for `upgrade` answers with its response as usual.
 *
 * The request body can be read before the upgrade. The `101` waits for the
 * body to end, discarding any unread rest up to the maximum body size. Node 25
 * and older do not parse the body of an upgrade request, so it is read from
 * the connection with `Content-Length`; chunked bodies get
 * `411 Length Required` there. `Expect: 100-continue` is not answered on
 * upgrade requests.
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
      const protocol = nodeRequest.headers.upgrade
      const isWebSocket = protocol === undefined || protocol.toLowerCase() === "websocket"
      let body: Readable | undefined
      if (!isWebSocket && legacyUpgradeBody) {
        if (nodeRequest.headers["transfer-encoding"] !== undefined) {
          socket.on("error", () => {})
          socket.end("HTTP/1.1 411 Length Required\r\nConnection: close\r\nContent-Length: 0\r\n\r\n")
          return
        }
        const framed = Upgrade.frameBody(socket, head, Number(nodeRequest.headers["content-length"] ?? 0))
        body = framed.body
        head = framed.rest
      }
      let nodeResponse_: Http.ServerResponse | undefined = undefined
      const nodeResponse = () => {
        if (nodeResponse_ === undefined) {
          nodeResponse_ = new http.ServerResponse(nodeRequest)
          if (state.response !== undefined || socket.destroyed) {
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
      const webSocketUpgrade = Socket.fromWebSocket(Effect.flatMap(
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
                state.response = upgradedResponse
                resume(Effect.succeed(ws))
              })
            }),
            (ws, exit) => Effect.sync(() => ws.close(closeCode(exit)))
          )
      ))
      const state: UpgradeState = {
        body,
        response: undefined,
        upgradeWith(request, headers) {
          if (isWebSocket) {
            return Object.keys(headers).length === 0
              ? webSocketUpgrade
              : Effect.fail(upgradeError(request, "WebSocket upgrades do not support custom response headers"))
          }
          const invalid = validateUpgradeHeaders(request, headers)
          if (invalid !== undefined) return Effect.fail(invalid)
          return Upgrade.toSocket(
            socket,
            Effect.withFiber((fiber) => {
              const maxBytes = fiber.getRef(HttpIncomingMessage.MaxBodySize)
              return Upgrade.drainBody(body ?? nodeRequest, maxBytes === undefined ? undefined : Number(maxBytes))
            }).pipe(Effect.andThen(Effect.sync(() => {
              if (state.response !== undefined) return
              state.response = Response.empty({
                status: 101,
                headers: { ...headers, connection: "Upgrade", upgrade: protocol! }
              })
              if (head.length > 0) socket.unshift(head)
              // Node rejects CR/LF in header values, so protocol cannot inject response headers.
              let responseHead = `HTTP/1.1 101 Switching Protocols\r\nConnection: Upgrade\r\nUpgrade: ${protocol}\r\n`
              for (const name in headers) responseHead += `${name}: ${headers[name]}\r\n`
              // Node writes header values as Latin-1, which is what peers decode them as.
              socket.write(responseHead + "\r\n", "latin1")
            })))
          )
        }
      }
      const request = new ServerRequestImpl(nodeRequest, nodeResponse, state)
      const context = Context.add(services, HttpServerRequest, request)
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

// Node 26 parses the body of an upgrade request (nodejs/node#60016).
const legacyUpgradeBody = Number(process.versions.node.split(".")[0]) < 26

// Shared by an upgrade request and the views `modify` creates.
interface UpgradeState {
  readonly upgradeWith: (
    request: HttpServerRequest,
    headers: Headers.Headers
  ) => Effect.Effect<Socket.Socket, HttpServerError>
  // The body read from the connection on Node 25 and older.
  readonly body: Readable | undefined
  // The response reported to middleware once the connection is upgraded.
  response: HttpServerResponse | undefined
}

// The transport sets these, and a body cannot follow the `101`.
const reservedUpgradeHeaders = new Set(["connection", "upgrade", "content-length", "transfer-encoding"])

const validateUpgradeHeaders = (
  request: HttpServerRequest,
  headers: Headers.Headers
): HttpServerError | undefined => {
  for (const name in headers) {
    if (reservedUpgradeHeaders.has(name)) {
      return upgradeError(request, `Upgrade responses cannot set the ${name} header`)
    }
    try {
      http.validateHeaderName(name)
      http.validateHeaderValue(name, headers[name])
    } catch (cause) {
      return upgradeError(request, `Invalid upgrade response header: ${name}`, cause)
    }
  }
}

const upgradeError = (request: HttpServerRequest, description: string, cause?: unknown) =>
  new HttpServerError({ reason: new InternalError({ request, description, cause }) })

const isHttp2 = (request: Http.IncomingMessage | undefined): boolean => request?.httpVersionMajor === 2

// HTTP/2 sends the authority as `:authority`, which takes precedence over a Host header.
// Pseudo-headers are not valid header names elsewhere, such as in a web `Request`.
const requestHeaders = (source: Http.IncomingMessage): Http.IncomingHttpHeaders => {
  if (!isHttp2(source)) {
    return source.headers
  }
  const headers: Http.IncomingHttpHeaders = {}
  for (const name in source.headers) {
    if (name[0] !== ":") headers[name] = source.headers[name]
  }
  const authority = source.headers[":authority"]
  if (typeof authority === "string") headers.host = authority
  return headers
}

const absoluteTarget = (url: string): URL | undefined => {
  if (!/^https?:\/\//i.test(url)) {
    return undefined
  }
  try {
    return new URL(url)
  } catch {
    return undefined
  }
}

// Requests dispatched by our checkContinue listener that have not been
// acknowledged yet. Standalone makeHandler users leave acknowledgement to Node
// or their own listener. Keyed by the Node request so modified requests share
// the entry and body readers acknowledge only once.
const pendingContinue = new WeakSet<Http.IncomingMessage>()

// Body bytes pulled through `stream`, shared by modified requests.
const bodyBytesRead = new WeakMap<Http.IncomingMessage, number>()

class ServerRequestImpl extends NodeHttpIncomingMessage<HttpServerError> implements HttpServerRequest {
  protected override readonly destroyOnOverflow = false
  // The adapter tears the body down after the response instead.
  protected override readonly closeOnDone = false
  readonly [Request.TypeId]: typeof Request.TypeId
  readonly response: Http.ServerResponse | LazyArg<Http.ServerResponse>
  private upgradeState?: UpgradeState | undefined
  readonly url: string
  private headersOverride?: Headers.Headers | undefined
  private peerAddressOverride?: Option.Option<string> | undefined
  readonly protocol: "http" | "https" | undefined

  constructor(
    source: Http.IncomingMessage,
    response: Http.ServerResponse | LazyArg<Http.ServerResponse>,
    upgradeState?: UpgradeState,
    url?: string,
    headersOverride?: Headers.Headers,
    remoteAddressOverride?: Option.Option<string>,
    peerAddressOverride?: Option.Option<string>,
    protocol?: "http" | "https"
  ) {
    super(source, (cause) =>
      new HttpServerError({
        reason: new RequestParseError({
          request: this,
          reason: cause instanceof NodeStream.MaxBytesError ? "BodyTooLarge" : "Parse",
          cause
        })
      }), remoteAddressOverride)
    this[Request.TypeId] = Request.TypeId
    this.response = response
    this.upgradeState = upgradeState
    if (url === undefined) {
      const target = absoluteTarget(source.url!)
      if (target === undefined) {
        url = source.url!
      } else {
        // RFC 9112 §3.2.2: the request-target authority takes precedence over Host.
        url = target.pathname + target.search
        const headers: Http.IncomingHttpHeaders = { ...requestHeaders(source), host: target.host }
        headersOverride = Headers.fromInput(headers)
      }
    }
    this.url = url
    this.headersOverride = headersOverride
    this.peerAddressOverride = peerAddressOverride
    this.protocol = protocol
  }

  get peerAddress(): Option.Option<string> {
    return this.peerAddressOverride ?? this.remoteAddress
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

  private writeContinue(): void {
    if (pendingContinue.delete(this.source) && !this.resolvedResponse.headersSent) {
      this.resolvedResponse.writeContinue()
    }
  }

  override get stream(): Stream.Stream<Uint8Array, HttpServerError> {
    return Stream.suspend(() => {
      this.writeContinue()
      const source = this.source
      return Stream.mapArray(super.stream, (chunk) => {
        let bytes = bodyBytesRead.get(source) ?? 0
        for (const item of chunk) bytes += item.length
        bodyBytesRead.set(source, bytes)
        return chunk
      })
    })
  }

  override get arrayBuffer(): Effect.Effect<ArrayBuffer, HttpServerError> {
    return Effect.suspend(() => {
      this.writeContinue()
      return super.arrayBuffer
    })
  }

  modify(
    options: {
      readonly url?: string | undefined
      readonly headers?: Headers.Headers | undefined
      readonly remoteAddress?: Option.Option<string> | undefined
      readonly peerAddress?: Option.Option<string> | undefined
      readonly protocol?: "http" | "https" | undefined
    }
  ) {
    return new ServerRequestImpl(
      this.source,
      this.response,
      this.upgradeState,
      options.url ?? this.url,
      options.headers ?? this.headersOverride,
      "remoteAddress" in options ? options.remoteAddress : this.remoteAddressOverride,
      options.peerAddress ?? this.peerAddressOverride,
      options.protocol ?? this.protocol
    )
  }

  get originalUrl(): string {
    const url = this.source.url!
    const headers = this.source.headers as Http2.IncomingHttpHeaders
    const http2 = isHttp2(this.source)
    const host = (http2 ? headers[":authority"] : undefined) ?? headers.host
    if (url[0] !== "/" || host === undefined) {
      return url
    }
    // `:scheme` is the target URI scheme, which also covers h2c behind a TLS terminator
    const scheme = http2 ? headers[":scheme"] : undefined
    const encrypted = (this.source.socket as Tls.TLSSocket | undefined)?.encrypted
    return `${scheme ?? (encrypted ? "https" : "http")}://${host}${url}`
  }

  private cachedMethod: HttpMethod | undefined
  get method(): HttpMethod {
    return this.cachedMethod ??= this.source.method!.toUpperCase() as HttpMethod
  }

  override get headers(): Headers.Headers {
    this.headersOverride ??= Headers.fromInput(requestHeaders(this.source))
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
      Effect.suspend(() => {
        this.writeContinue()
        return NodeMultipart.persisted(this.bodySource, this.source.headers)
      })
    ))
    return this.multipartEffect
  }

  get multipartStream(): Stream.Stream<Multipart.Part, Multipart.MultipartError> {
    return Stream.suspend(() => {
      this.writeContinue()
      return NodeMultipart.stream(this.bodySource, this.source.headers)
    })
  }

  get upgrade(): Effect.Effect<Socket.Socket, HttpServerError> {
    return this.upgradeWith({})
  }

  upgradeWith(
    options: { readonly headers?: Headers.Input | undefined }
  ): Effect.Effect<Socket.Socket, HttpServerError> {
    const state = this.upgradeState
    if (state === undefined) {
      return Effect.fail(
        new HttpServerError({
          reason: new RequestParseError({
            request: this,
            description: "not an upgradeable ServerRequest"
          })
        })
      )
    }
    return state.upgradeWith(this, Headers.fromInput(options.headers))
  }

  // The response reported to middleware once the connection is upgraded.
  get upgradedResponse(): HttpServerResponse | undefined {
    return this.upgradeState?.response
  }

  protected override get bodySource(): Readable {
    return this.upgradeState?.body ?? this.source
  }

  override toString(): string {
    return `ServerRequest(${this.method} ${UrlParams.redactUrl(this.url)})`
  }

  toJSON(): unknown {
    return HttpIncomingMessage.inspect(this, {
      _id: "HttpServerRequest",
      method: this.method,
      url: UrlParams.redactUrl(this.originalUrl)
    })
  }
}

/**
 * Provides an `HttpServer` by creating and managing a scoped Node
 * `http.Server` or `node:http2` server with the supplied listen and shutdown
 * options.
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const layerServer: (
  evaluate: LazyArg<Http.Server | Http2.Http2Server | Http2.Http2SecureServer>,
  options: Options
) => Layer.Layer<HttpServer.HttpServer, ServeError> = flow(make, Layer.effect(HttpServer.HttpServer))

/**
 * Provides the Node HTTP support services used by `NodeHttpServer`, including
 * the HTTP platform, ETag generator, and core Node platform services.
 *
 * @stability unstable
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
 * **Details**
 *
 * Node's timeouts are set on the server returned by `evaluate`; see `make`.
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const layer = (
  evaluate: LazyArg<Http.Server | Http2.Http2Server | Http2.Http2SecureServer>,
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
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const layerConfig = (
  evaluate: LazyArg<Http.Server | Http2.Http2Server | Http2.Http2SecureServer>,
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
 * @stability unstable
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
  Layer.provideMerge(layer(http.createServer, { port: 0 }))
)

// -----------------------------------------------------------------------------
// Internal
// -----------------------------------------------------------------------------

const closeCode = (exit: Exit.Exit<unknown, unknown>): number =>
  Exit.isSuccess(exit) ? 1000 : Cause.hasInterruptsOnly(exit.cause) ? 1001 : 1011

// Reported to middleware in place of the handler's discarded response.
const upgradedResponse = Response.empty({ status: 101 })

const handleResponse = (
  request: HttpServerRequest,
  response: HttpServerResponse
): Effect.Effect<unknown, HttpServerError> => {
  const upgraded = (request as ServerRequestImpl).upgradedResponse
  if (upgraded !== undefined) {
    return Effect.succeed(upgraded)
  }
  const nodeResponse = (request as ServerRequestImpl).resolvedResponse
  if (nodeResponse.writableEnded) {
    return Effect.void
  }

  let headers: Record<string, string | Array<string>> = response.headers
  if (response.status === 204 || response.status === 205) {
    const { "content-length": _, ...rest } = headers
    headers = rest
  }
  if (!Cookies.isEmpty(response.cookies)) {
    headers = { ...headers }
    const toSet = Cookies.toSetCookieHeaders(response.cookies)
    if (headers["set-cookie"] !== undefined) {
      toSet.push(headers["set-cookie"] as string)
    }
    headers["set-cookie"] = toSet
  }

  try {
    return writeResponse(request, response, nodeResponse, headers)
  } catch (defect) {
    // `writeHead` throws synchronously on headers Node rejects and on statuses outside 200-599
    return Effect.andThen(
      cancelResponseBody(response.body),
      handleCause(nodeResponse, response)(Cause.die(defect))
    )
  }
}

const writeResponse = (
  request: HttpServerRequest,
  response: HttpServerResponse,
  nodeResponse: Http.ServerResponse,
  headers: Record<string, string | Array<string>>
): Effect.Effect<unknown, HttpServerError> => {
  // Nothing can reach a disconnected client, and writing would throw or never finish
  if (nodeResponse.destroyed) {
    return cancelResponseBody(response.body)
  }
  if (request.method === "HEAD") {
    writeHead(nodeResponse, response, headers)
    return Effect.andThen(cancelResponseBody(response.body), endAndAwait(nodeResponse))
  }
  if (Response.omitsBody(response)) {
    writeHead(nodeResponse, response, headers)
    nodeResponse.end()
    return cancelResponseBody(response.body)
  }
  nodeResponse.strictContentLength = true
  const body = response.body
  switch (body._tag) {
    case "Empty": {
      writeHead(nodeResponse, response, headers)
      return end(nodeResponse, response)
    }
    case "Raw": {
      const piped = typeof body.body === "object" && body.body !== null && "pipe" in body.body &&
        typeof body.body.pipe === "function"
      writeHead(nodeResponse, response, headers, piped)
      if (piped) {
        return Effect.tryPromise({
          try: (signal) => pipeTo(body.body as Readable, nodeResponse, headers, signal),
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
      return endAndAwait(nodeResponse, body.body).pipe(Effect.tapCause(handleCause(nodeResponse, response)))
    }
    case "Uint8Array": {
      writeHead(nodeResponse, response, headers)
      // If the body is less than 1MB, we skip the callback
      if (body.contentLength < 1024 * 1024) {
        // Writing text directly lets Node flush headers and body together.
        return end(nodeResponse, response, body.text ?? body.body)
      }
      return endAndAwait(nodeResponse, body.text ?? body.body).pipe(
        Effect.tapCause(handleCause(nodeResponse, response))
      )
    }
    case "FormData": {
      const r = new globalThis.Response(body.formData)
      const formHeaders = { ...headers, ...Object.fromEntries(r.headers) }
      writeHead(nodeResponse, response, formHeaders)
      return Effect.tryPromise({
        try: (signal) => pipeTo(Readable.fromWeb(r.body as any), nodeResponse, formHeaders, signal),
        catch: (cause) =>
          new HttpServerError({
            reason: new ResponseError({
              request,
              response,
              description: "Error writing FormData response",
              cause
            })
          })
      }).pipe(
        Effect.interruptible,
        Effect.tapCause(handleCause(nodeResponse, response))
      )
    }
    case "Stream": {
      writeHead(nodeResponse, response, headers, true)
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
          onSuccess: () => end(nodeResponse, response),
          onFailure: handleCause(nodeResponse, response)
        })
      )
    }
  }
}

// On HTTP/1.1 Node sends a 1xx as an interim response, so the client never gets a final one
const isFinalStatus = (status: number): boolean => status >= 200 && status <= 599

const internalServerError = Response.empty({ status: 500 })

const invalidStatusError = (status: number) => new RangeError(`Invalid final response status: ${status}`)

const writeHead = (
  nodeResponse: Http.ServerResponse,
  response: HttpServerResponse,
  headers: Record<string, string | Array<string>>,
  streaming = false
): void => {
  if (!isFinalStatus(response.status)) {
    throw invalidStatusError(response.status)
  }
  if (isHttp2(nodeResponse.req)) {
    // HTTP/2 has no status message
    nodeResponse.writeHead(response.status, withoutConnectionHeaders(headers))
    return
  }
  nodeResponse.writeHead(
    response.status,
    response.statusText,
    closesConnection(nodeResponse.req, streaming) ? { ...headers, connection: "close" } : headers
  )
}

// RFC 9113 §8.2.2: HTTP/2 forbids connection-specific headers, and Node rejects them. They
// mostly come from proxied HTTP/1.1 responses, so they are dropped rather than failing the response.
const connectionHeaders = new Set([
  "connection",
  "keep-alive",
  "proxy-connection",
  "transfer-encoding",
  "upgrade",
  "http2-settings"
])

const withoutConnectionHeaders = (
  headers: Record<string, string | Array<string>>
): Record<string, string | Array<string>> => {
  let result: Record<string, string | Array<string>> | undefined
  for (const name in headers) {
    if (connectionHeaders.has(name) || (name === "te" && headers[name] !== "trailers")) {
      result ??= { ...headers }
      delete result[name]
    }
  }
  return result ?? headers
}

// Unread request body discarded after the response to keep the connection alive. Past this it closes.
const maxDrainBytes = 256 * 1024

// Time the client gets to read the response after the FIN, before a destroy can reset the connection.
const closeGracePeriod = 500

// Decided when the headers are written, while `Connection: close` can still be sent. A streaming
// response may still read the body, so only a pending 100 Continue closes it here.
const closesConnection = (request: Http.IncomingMessage | undefined, streaming: boolean): boolean => {
  if (request === undefined || request.httpVersionMajor !== 1 || request.complete) {
    return false
  }
  if (pendingContinue.has(request)) {
    return true
  }
  const contentLength = request.headers["content-length"]
  return !streaming && contentLength !== undefined &&
    Number(contentLength) - (bodyBytesRead.get(request) ?? 0) > maxDrainBytes
}

// Node internals read by its own `finish` listener, which runs right after `teardownBody`.
interface IncomingMessageInternals {
  _consuming: boolean
}
interface ServerResponseInternals {
  _last: boolean
}

// Node drains an untouched body in full, leaves a partly read one unread, and
// destroys a closing socket as soon as the response is flushed, which resets the
// connection while body bytes are queued and can lose the response.
const teardownBody = (request: Http.IncomingMessage, response: Http.ServerResponse): void => {
  if (request.complete || request.destroyed) {
    return
  }
  const socket = request.socket
  if ((response as unknown as ServerResponseInternals)._last) {
    // Skips Node's `_dump`. Unlike `_dumped`, it keeps the parser applying backpressure.
    ;(request as unknown as IncomingMessageInternals)._consuming = true
    ;(response as unknown as ServerResponseInternals)._last = false
    return closeSocket(socket)
  }
  let bytes = 0
  request.on("data", (chunk: Buffer) => {
    bytes += chunk.length
    if (bytes > maxDrainBytes) {
      // Pausing stops further `data` events, so this runs once.
      request.pause()
      closeSocket(socket)
    }
  })
  request.resume()
}

const closeSocket = (socket: Net.Socket): void => {
  if (socket.destroyed) {
    return
  }
  socket.end()
  const timer = setTimeout(() => socket.destroy(), closeGracePeriod)
  socket.once("close", () => clearTimeout(timer))
}

const cancelResponseBody = (body: HttpServerResponse["body"]): Effect.Effect<void> => {
  const stream = body._tag === "Raw" ? body.body : undefined
  if (stream instanceof Readable) {
    return Effect.sync(() => stream.destroy())
  }
  return Effect.void
}

// `end`'s callback only runs on `finish`, which a disconnect replaces with `close`.
// A response that is already destroyed emits neither.
const endAndAwait = (nodeResponse: Http.ServerResponse, chunk?: unknown): Effect.Effect<void> =>
  Effect.callback<void>((resume) => {
    if (nodeResponse.destroyed) return resume(Effect.void)
    let completed = false
    const done = () => {
      if (completed) return
      completed = true
      nodeResponse.off("close", done)
      resume(Effect.void)
    }
    nodeResponse.once("close", done)
    if (chunk === undefined) {
      nodeResponse.end(done)
    } else {
      nodeResponse.end(chunk, done)
    }
  })

const end = (
  nodeResponse: Http.ServerResponse,
  response: HttpServerResponse,
  chunk?: string | Uint8Array
): Effect.Effect<void> => {
  try {
    nodeResponse.end(chunk)
    return Effect.void
  } catch (defect) {
    return handleCause(nodeResponse, response)(Cause.die(defect))
  }
}

// Check lengths before writing: Node's strictContentLength throws uncaught inside pipeline.
const pipeTo = (
  readable: Readable,
  nodeResponse: Http.ServerResponse,
  headers: Record<string, string | Array<string>>,
  signal: AbortSignal
): Promise<void> => {
  const contentLength = headers["content-length"]
  if (typeof contentLength !== "string") {
    return pipeline(readable, nodeResponse, { signal })
  }
  let remaining = Number(contentLength)
  const mismatch = () => new Error(`Response body doesn't match content-length of ${contentLength}`)
  return pipeline(
    readable,
    new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        remaining -= chunk.length
        callback(remaining < 0 ? mismatch() : null, chunk)
      },
      flush(callback) {
        callback(remaining > 0 ? mismatch() : null)
      }
    }),
    nodeResponse,
    { signal }
  )
}

const handleCause = (
  nodeResponse: Http.ServerResponse,
  originalResponse: HttpServerResponse
) =>
<E>(originalCause: Cause.Cause<E>) =>
  Effect.flatMap(causeResponse(originalCause), ([response, cause]) => {
    const headersSent = nodeResponse.headersSent
    let abort = headersSent
    if (!headersSent) {
      if (!isFinalStatus(response.status)) {
        cause = Cause.combine(cause, Cause.die(invalidStatusError(response.status)))
        response = internalServerError
      }
      try {
        writeHead(nodeResponse, response, {})
      } catch {
        // HTTP/2 keeps the headers of a rejected `writeHead`, so the fallback can throw too
        abort = true
      }
    }
    if (!nodeResponse.writableEnded) {
      // Ending a started response normally would make a partial body look complete
      if (abort) {
        // An error resets an HTTP/2 stream with INTERNAL_ERROR rather than NO_ERROR. On
        // HTTP/1.1 it could reach `clientError` listeners, and the socket closes either way.
        nodeResponse.destroy(isHttp2(nodeResponse.req) ? new Error("The response was aborted") : undefined)
      } else {
        nodeResponse.end()
      }
    }
    return Effect.failCause(
      headersSent
        ? Cause.combine(originalCause, Cause.die(originalResponse))
        : cause
    )
  })
