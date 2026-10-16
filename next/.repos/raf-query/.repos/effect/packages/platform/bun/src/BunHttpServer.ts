/**
 * Bun implementation of the Effect `HttpServer`.
 *
 * `make` creates a scoped HTTP server from `Bun.serve`, converting Bun
 * `Request` values into `HttpServerRequest` values and Effect
 * `HttpServerResponse` values back into Web `Response` values. The server
 * supports streaming bodies, multipart requests, file responses through
 * `BunHttpPlatform`, and WebSocket upgrades. This module also provides layers
 * for the server alone, the Bun HTTP support services, the combined server,
 * configurable server options, and a test server with an HTTP client.
 *
 * @since 4.0.0
 */
import type { Server as BunServer, ServerWebSocket } from "bun"
import type * as Arr from "effect/Array"
import * as Cause from "effect/Cause"
import * as Config from "effect/Config"
import type { ConfigError } from "effect/Config"
import * as Context from "effect/Context"
import * as Deferred from "effect/Deferred"
import * as Duration from "effect/Duration"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Fiber from "effect/Fiber"
import type * as FileSystem from "effect/FileSystem"
import { constVoid, flow } from "effect/Function"
import * as Cookies from "effect/http/Cookies"
import * as Etag from "effect/http/Etag"
import * as FetchHttpClient from "effect/http/FetchHttpClient"
import * as Headers from "effect/http/Headers"
import type { HttpClient } from "effect/http/HttpClient"
import * as HttpEffect from "effect/http/HttpEffect"
import * as IncomingMessage from "effect/http/HttpIncomingMessage"
import type { HttpMethod } from "effect/http/HttpMethod"
import type { HttpPlatform } from "effect/http/HttpPlatform"
import * as Server from "effect/http/HttpServer"
import * as Error from "effect/http/HttpServerError"
import * as ServerRequest from "effect/http/HttpServerRequest"
import * as ServerResponse from "effect/http/HttpServerResponse"
import type * as Multipart from "effect/http/Multipart"
import * as UrlParams from "effect/http/UrlParams"
import * as Inspectable from "effect/Inspectable"
import * as Layer from "effect/Layer"
import * as NetAddress from "effect/net/NetAddress"
import * as Option from "effect/Option"
import type * as Path from "effect/Path"
import type * as Record from "effect/Record"
import * as Result from "effect/Result"
import * as Scheduler from "effect/Scheduler"
import type * as Schema from "effect/Schema"
import * as Scope from "effect/Scope"
import * as Semaphore from "effect/Semaphore"
import * as Socket from "effect/socket/Socket"
import * as Stream from "effect/Stream"
import * as Platform from "./BunHttpPlatform.ts"
import * as BunMultipart from "./BunMultipart.ts"
import * as BunServices from "./BunServices.ts"
import * as BunStream from "./BunStream.ts"

/**
 * Bun serve options accepted by the HTTP server, extended with typed route definitions.
 *
 * @category options
 * @since 4.0.0
 */
export type ServeOptions<R extends string> =
  & (
    | Bun.Serve.UnixServeOptions<WebSocketContext>
    | Bun.Serve.HostnamePortServeOptions<WebSocketContext>
  )
  & { readonly routes?: Bun.Serve.Routes<WebSocketContext, R> }

/**
 * WebSocket tuning options forwarded to `Bun.serve`'s `websocket` handler.
 *
 * **Details**
 *
 * The lifecycle handlers (`open`, `message`, `close`, ...) are managed by the
 * server and cannot be overridden; everything else — such as
 * `perMessageDeflate` compression, payload limits, and idle timeouts — passes
 * through, e.g.
 * `BunHttpServer.layer({ port: 3000, websocket: { perMessageDeflate: true } })`.
 *
 * The `compressionThreshold` option controls the minimum message size in bytes
 * that is compressed when per-message deflate is negotiated. It defaults to
 * 1024, matching the default threshold of Node's `ws` server.
 *
 * @category options
 * @since 4.0.0
 */
export type WebSocketOptions =
  & Omit<
    Bun.WebSocketHandler<WebSocketContext>,
    "open" | "message" | "close" | "drain" | "ping" | "pong" | "data" | "binaryType"
  >
  & {
    /**
     * The minimum message size in bytes that is compressed when per-message
     * deflate is negotiated.
     *
     * @default 1024
     */
    readonly compressionThreshold?: number | undefined
  }

/**
 * Creates a scoped Bun `HttpServer` from `Bun.serve` options, stopping the server on scope finalization with optional graceful shutdown settings.
 *
 * @category constructors
 * @since 4.0.0
 */
export const make = Effect.fnUntraced(
  function*<R extends string>(
    options: ServeOptions<R> & {
      readonly disablePreemptiveShutdown?: boolean | undefined
      readonly gracefulShutdownTimeout?: Duration.Input | undefined
      readonly websocket?: WebSocketOptions | undefined
    }
  ) {
    const scope = yield* Effect.scope
    let listenOptions = options
    if (!("unix" in options) || options.unix === undefined) {
      const internetOptions = options as Bun.Serve.HostnamePortServeOptions<WebSocketContext>
      let hostname = internetOptions.hostname ?? "::"
      if (Result.isFailure(NetAddress.ipFromString(hostname))) {
        hostname = yield* Effect.tryPromise({
          try: async () => {
            const result = await Bun.dns.lookup(hostname, { socketType: "tcp" })
            if (result.length === 0) throw new globalThis.Error(`Could not resolve hostname: ${hostname}`)
            return result[0].address
          },
          catch: (cause) => new Error.ServeError({ cause })
        })
      }
      listenOptions = { ...options, hostname }
    }
    const { compressionThreshold = MIN_COMPRESSIBLE_SIZE, ...websocket } = options.websocket ?? {}
    const handlerStack: Array<(request: Request, server: BunServer<WebSocketContext>) => Response | Promise<Response>> =
      [
        function(_request, _server) {
          return new Response("not found", { status: 404 })
        }
      ]
    const server = Bun.serve<WebSocketContext, R>({
      ...listenOptions as ServeOptions<R>,
      fetch: handlerStack[0],
      websocket: {
        ...websocket,
        open(ws) {
          Deferred.doneUnsafe(ws.data.deferred, Exit.succeed(ws))
        },
        message(ws, message) {
          ws.data.run(message)
        },
        close(ws, code, closeReason) {
          code = typeof code === "number" ? code : 1001
          const error = new Socket.SocketError({
            reason: new Socket.SocketCloseError({ code, closeReason })
          })
          ws.data.closeError = error
          ws.data.onClose(error)
        }
      }
    })

    const shutdown = yield* Effect.promise(() => server.stop()).pipe(
      Effect.cached
    )
    const preemptiveShutdown = options.disablePreemptiveShutdown ? Effect.void : Effect.timeoutOrElse(shutdown, {
      duration: options.gracefulShutdownTimeout ?? Duration.seconds(20),
      orElse: () => Effect.void
    })

    yield* Scope.addFinalizer(scope, shutdown)

    const address = "unix" in options && options.unix !== undefined
      ? NetAddress.unixPathAddress(options.unix)
      : yield* Effect.fromResult(NetAddress.inetAddressFromIpString(server.hostname!, server.port!)).pipe(
        Effect.mapError((cause) => new Error.ServeError({ cause }))
      )

    return Server.make({
      address,
      serve: Effect.fnUntraced(function*(httpApp, middleware) {
        const parent = yield* Effect.fiber
        const services = parent.context
        const serveScope = Context.getUnsafe(services, Scope.Scope)
        const scope = Scope.forkUnsafe(serveScope, "parallel")

        const httpEffect = HttpEffect.toHandled(httpApp, (request, response) =>
          Effect.sync(() => {
            ;(request as BunServerRequest).resolve(makeResponse(request, response, services, scope))
          }), middleware)

        function handler(request: Request, server: BunServer<WebSocketContext>) {
          return new Promise<Response>((resolve, _reject) => {
            const context = Context.add(
              services,
              ServerRequest.HttpServerRequest,
              new BunServerRequest(request, resolve, removeHost(request.url), server, compressionThreshold)
            )
            const fiber = Fiber.runIn(Effect.runForkWith(context)(httpEffect), scope)
            request.signal.addEventListener("abort", () => {
              fiber.interruptUnsafe(parent.id, Error.ClientAbort.annotation)
            }, { once: true })
          })
        }

        yield* Scope.addFinalizerExit(serveScope, () => {
          const index = handlerStack.indexOf(handler)
          if (index !== -1) handlerStack.splice(index, 1)
          server.reload({
            fetch: handlerStack[handlerStack.length - 1],
            ...(options.routes === undefined ? undefined : { routes: options.routes })
          })
          return handlerStack.length === 1 ? preemptiveShutdown : Effect.void
        })
        handlerStack.push(handler)
        server.reload({
          fetch: handler,
          ...(options.routes === undefined ? undefined : { routes: options.routes })
        })
      })
    })
  }
)

const MIN_COMPRESSIBLE_SIZE = 1024

const makeResponse = (
  request: ServerRequest.HttpServerRequest,
  response: ServerResponse.HttpServerResponse,
  context: Context.Context<never>,
  scope: Scope.Scope
): Response => {
  if (ServerResponse.omitsBody(response, request.method === "HEAD")) {
    return ServerResponse.toWeb(response, { withoutBody: true })
  }
  const fields: {
    headers: globalThis.Headers
    status?: number
    statusText?: string
  } = {
    headers: new globalThis.Headers(response.headers),
    status: response.status
  }

  if (!Cookies.isEmpty(response.cookies)) {
    for (const header of Cookies.toSetCookieHeaders(response.cookies)) {
      fields.headers.append("set-cookie", header)
    }
  }

  if (response.statusText !== undefined) {
    fields.statusText = response.statusText
  }

  response = HttpEffect.scopeTransferToStream(response)
  const body = response.body
  switch (body._tag) {
    case "Empty": {
      return new Response(undefined, fields)
    }
    case "Uint8Array": {
      return new Response(body.text ?? body.body as any, fields)
    }
    case "Raw": {
      if (body.body instanceof Response) {
        for (const [key, value] of fields.headers.entries()) {
          body.body.headers.set(key, value)
        }
        return body.body
      }
      return new Response(body.body as any, fields)
    }
    case "FormData": {
      return new Response(body.formData as any, fields)
    }
    case "Stream": {
      return new Response(
        Stream.toReadableStreamWith(
          Stream.unwrap(Effect.withFiber((fiber) => {
            Fiber.runIn(fiber, scope)
            return Effect.succeed(body.stream)
          })),
          context
        ),
        fields
      )
    }
  }
}

/**
 * Layer that provides only `HttpServer` by constructing a scoped Bun server from the supplied serve options.
 *
 * @category layers
 * @since 4.0.0
 */
export const layerServer: <R extends string>(
  options: ServeOptions<R> & {
    readonly disablePreemptiveShutdown?: boolean | undefined
    readonly gracefulShutdownTimeout?: Duration.Input | undefined
    readonly websocket?: WebSocketOptions | undefined
  }
) => Layer.Layer<Server.HttpServer, Error.ServeError> = flow(make, Layer.effect(Server.HttpServer)) as any

/**
 * Layer that provides Bun HTTP support services: `HttpPlatform`, weak ETag generation, and `BunServices`.
 *
 * @category layers
 * @since 4.0.0
 */
export const layerHttpServices: Layer.Layer<
  | HttpPlatform
  | Etag.Generator
  | BunServices.BunServices
> = Layer.mergeAll(
  Platform.layer,
  Etag.layerWeak,
  BunServices.layer
)

/**
 * Layer that provides a Bun `HttpServer` together with the Bun HTTP platform, ETag generator, and Bun services.
 *
 * @category layers
 * @since 4.0.0
 */
export const layer = <R extends string>(
  options: ServeOptions<R> & {
    readonly disablePreemptiveShutdown?: boolean | undefined
    readonly gracefulShutdownTimeout?: Duration.Input | undefined
    readonly websocket?: WebSocketOptions | undefined
  }
): Layer.Layer<
  | Server.HttpServer
  | HttpPlatform
  | Etag.Generator
  | BunServices.BunServices,
  Error.ServeError
> => Layer.mergeAll(layerServer(options), layerHttpServices)

/**
 * Layer that starts a Bun HTTP server on an ephemeral port for tests.
 *
 * @category testing
 * @since 4.0.0
 */
export const layerTest: Layer.Layer<
  Server.HttpServer | HttpPlatform | FileSystem.FileSystem | Etag.Generator | Path.Path | HttpClient
> = Server.layerTestClient.pipe(
  Layer.provide(FetchHttpClient.layer.pipe(
    Layer.provide(Layer.succeed(FetchHttpClient.RequestInit)({ keepalive: false }))
  )),
  Layer.provideMerge(Layer.orDie(layer({ hostname: "127.0.0.1", port: 0 })))
)

/**
 * Creates the Bun HTTP server and support-services layer from configurable serve options.
 *
 * @category layers
 * @since 4.0.0
 */
export const layerConfig = <R extends string>(
  options: Config.Wrap<
    ServeOptions<R> & {
      readonly disablePreemptiveShutdown?: boolean | undefined
      readonly gracefulShutdownTimeout?: Duration.Input | undefined
      readonly websocket?: WebSocketOptions | undefined
    }
  >
): Layer.Layer<
  Server.HttpServer | HttpPlatform | FileSystem.FileSystem | Etag.Generator | Path.Path,
  ConfigError | Error.ServeError
> =>
  Layer.mergeAll(
    Layer.effect(Server.HttpServer)(Effect.flatMap(Config.unwrap(options), make)),
    layerHttpServices
  )

// -----------------------------------------------------------------------------
// Internal
// -----------------------------------------------------------------------------

interface WebSocketContext {
  readonly deferred: Deferred.Deferred<ServerWebSocket<WebSocketContext>>
  readonly buffer: Array<Uint8Array | string>
  closeError: Socket.SocketError | undefined
  run: (_: Uint8Array | string) => void
  onClose: (error: Socket.SocketError) => void
}

function wsDefaultRun(this: WebSocketContext, _: Uint8Array | string) {
  this.buffer.push(_)
}

class BunServerRequest extends Inspectable.Class implements ServerRequest.HttpServerRequest {
  readonly [ServerRequest.TypeId]: typeof ServerRequest.TypeId
  readonly [IncomingMessage.TypeId]: typeof IncomingMessage.TypeId
  readonly source: Request
  public resolve: (response: Response) => void
  readonly url: string
  private bunServer: BunServer<WebSocketContext>
  private compressionThreshold: number
  public headersOverride?: Headers.Headers | undefined
  private remoteAddressOverride?: Option.Option<string> | undefined

  constructor(
    source: Request,
    resolve: (response: Response) => void,
    url: string,
    bunServer: BunServer<WebSocketContext>,
    compressionThreshold: number,
    headersOverride?: Headers.Headers,
    remoteAddressOverride?: Option.Option<string>
  ) {
    super()
    this[ServerRequest.TypeId] = ServerRequest.TypeId
    this[IncomingMessage.TypeId] = IncomingMessage.TypeId
    this.source = source
    this.resolve = resolve
    this.url = url
    this.bunServer = bunServer
    this.compressionThreshold = compressionThreshold
    this.headersOverride = headersOverride
    this.remoteAddressOverride = remoteAddressOverride
  }
  toJSON(): unknown {
    return IncomingMessage.inspect(this, {
      _id: "HttpServerRequest",
      method: this.method,
      url: this.originalUrl
    })
  }
  modify(
    options: {
      readonly url?: string | undefined
      readonly headers?: Headers.Headers | undefined
      readonly remoteAddress?: Option.Option<string> | undefined
    }
  ) {
    return new BunServerRequest(
      this.source,
      this.resolve,
      options.url ?? this.url,
      this.bunServer,
      this.compressionThreshold,
      options.headers ?? this.headersOverride,
      "remoteAddress" in options ? options.remoteAddress : this.remoteAddressOverride
    )
  }
  get method(): HttpMethod {
    return this.source.method.toUpperCase() as HttpMethod
  }
  get originalUrl() {
    return this.source.url
  }
  get remoteAddress(): Option.Option<string> {
    return this.remoteAddressOverride ?? Option.fromNullishOr(this.bunServer.requestIP(this.source)?.address)
  }
  get headers(): Headers.Headers {
    this.headersOverride ??= Headers.fromInput(this.source.headers)
    return this.headersOverride
  }

  private cachedCookies: Record.ReadonlyRecord<string, string> | undefined
  get cookies() {
    if (this.cachedCookies) {
      return this.cachedCookies
    }
    return this.cachedCookies = Cookies.parseHeader(this.headers.cookie ?? "")
  }

  get stream(): Stream.Stream<Uint8Array, Error.HttpServerError> {
    return this.source.body
      ? BunStream.fromReadableStream({
        evaluate: () => this.source.body ?? emptyReadbleStream,
        onError: (cause) =>
          new Error.HttpServerError({
            reason: new Error.RequestParseError({
              request: this,
              cause
            })
          })
      })
      : Stream.fail(
        new Error.HttpServerError({
          reason: new Error.RequestParseError({
            request: this,
            description: "can not create stream from empty body"
          })
        })
      )
  }

  private textEffect: Effect.Effect<string, Error.HttpServerError> | undefined
  get text(): Effect.Effect<string, Error.HttpServerError> {
    if (this.textEffect) {
      return this.textEffect
    }
    this.textEffect = Effect.runSync(Effect.cached(
      Effect.tryPromise({
        try: () => this.source.text(),
        catch: (cause) =>
          new Error.HttpServerError({
            reason: new Error.RequestParseError({
              request: this,
              cause
            })
          })
      })
    ))
    return this.textEffect
  }

  get json(): Effect.Effect<Schema.Json, Error.HttpServerError> {
    return Effect.flatMap(this.text, (_) =>
      Effect.try({
        try: () => JSON.parse(_) as Schema.Json,
        catch: (cause) =>
          new Error.HttpServerError({
            reason: new Error.RequestParseError({
              request: this,
              cause
            })
          })
      }))
  }

  get urlParamsBody(): Effect.Effect<UrlParams.UrlParams, Error.HttpServerError> {
    return Effect.flatMap(this.text, (_) =>
      Effect.try({
        try: () => UrlParams.fromInput(new URLSearchParams(_)),
        catch: (cause) =>
          new Error.HttpServerError({
            reason: new Error.RequestParseError({
              request: this,
              cause
            })
          })
      }))
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
      BunMultipart.persisted(this.source)
    ))
    return this.multipartEffect
  }

  get multipartStream(): Stream.Stream<Multipart.Part, Multipart.MultipartError> {
    return BunMultipart.stream(this.source)
  }

  private arrayBufferEffect: Effect.Effect<ArrayBuffer, Error.HttpServerError> | undefined
  get arrayBuffer(): Effect.Effect<ArrayBuffer, Error.HttpServerError> {
    if (this.arrayBufferEffect) {
      return this.arrayBufferEffect
    }
    this.arrayBufferEffect = Effect.runSync(Effect.cached(
      Effect.tryPromise({
        try: () => this.source.arrayBuffer(),
        catch: (cause) =>
          new Error.HttpServerError({
            reason: new Error.RequestParseError({
              request: this,
              cause
            })
          })
      })
    ))
    this.textEffect = Effect.map(this.arrayBufferEffect, (_) => new TextDecoder().decode(_))
    return this.arrayBufferEffect
  }

  get upgrade(): Effect.Effect<Socket.Socket, Error.HttpServerError> {
    return Effect.callback<Socket.Socket, Error.HttpServerError>((resume) => {
      const deferred = Deferred.makeUnsafe<ServerWebSocket<WebSocketContext>>()
      const semaphore = Semaphore.makeUnsafe(1)

      const success = this.bunServer.upgrade(this.source, {
        data: {
          deferred,
          buffer: [],
          closeError: undefined,
          run: wsDefaultRun,
          onClose: constVoid
        }
      })
      if (!success) {
        resume(Effect.fail(
          new Error.HttpServerError({
            reason: new Error.RequestParseError({
              request: this,
              description: "Not an upgradeable ServerRequest"
            })
          })
        ))
        return
      }
      const compressionThreshold = this.compressionThreshold
      resume(Effect.map(Deferred.await(deferred), (ws) => {
        const write = (chunk: Uint8Array | string | Socket.CloseEvent) =>
          Effect.sync(() => {
            if (typeof chunk === "string") {
              ws.sendText(chunk, chunk.length >= compressionThreshold)
            } else if (Socket.isCloseEvent(chunk)) {
              ws.close(chunk.code, chunk.reason)
            } else {
              ws.sendBinary(chunk, chunk.byteLength >= compressionThreshold)
            }
          })
        const writeAll = (chunks: ReadonlyArray<Uint8Array | string>) =>
          Effect.sync(() => {
            for (let i = 0; i < chunks.length; i++) {
              const chunk = chunks[i]
              if (typeof chunk === "string") {
                ws.sendText(chunk, chunk.length >= compressionThreshold)
              } else {
                ws.sendBinary(chunk, chunk.byteLength >= compressionThreshold)
              }
            }
          })
        const writer: Socket.Socket["writer"] = Effect.succeed({ write, writeAll })

        const reader: Socket.Socket["reader"] = Effect.gen(function*() {
          const dispatcher = (yield* Scheduler.Scheduler).makeDispatcher()
          yield* Effect.acquireRelease(semaphore.take(1), () => semaphore.release(1))
          const closeError = ws.data.closeError ?? (ws.readyState >= 2
            ? new Socket.SocketError({
              reason: new Socket.SocketCloseError({ code: 1006 })
            })
            : undefined)
          if (closeError !== undefined && ws.data.buffer.length === 0) {
            return yield* closeError
          }
          const scope = yield* Effect.scope

          type ReadResume = (
            effect: Effect.Effect<Arr.NonEmptyReadonlyArray<Uint8Array | string>, Socket.SocketError>
          ) => void

          let buffer: Array<Uint8Array | string> = ws.data.buffer.splice(0)
          let error: Socket.SocketError | undefined = closeError
          let waiter: ReadResume | undefined
          let flushScheduled = false

          function takeBuffer(): Arr.NonEmptyReadonlyArray<Uint8Array | string> {
            const chunk = buffer
            buffer = []
            return chunk as unknown as Arr.NonEmptyReadonlyArray<Uint8Array | string>
          }
          function deliver() {
            flushScheduled = false
            if (waiter === undefined || buffer.length === 0) return
            const resumeRead = waiter
            waiter = undefined
            resumeRead(Effect.succeed(takeBuffer()))
          }
          function push(data: Uint8Array | string) {
            buffer.push(data)
            if (waiter !== undefined && !flushScheduled) {
              flushScheduled = true
              dispatcher.scheduleTask(deliver, 0)
            }
          }
          function fail(err: Socket.SocketError) {
            if (error === undefined) error = err
            if (waiter !== undefined) {
              const resumeRead = waiter
              waiter = undefined
              resumeRead(buffer.length > 0 ? Effect.succeed(takeBuffer()) : Effect.fail(error))
            }
          }

          ws.data.run = push
          ws.data.onClose = fail
          yield* Scope.addFinalizerExit(
            scope,
            (exit) =>
              Effect.suspend(() => {
                // resume a pull blocked in another fiber before detaching
                fail(
                  new Socket.SocketError({
                    reason: new Socket.SocketCloseError({ code: 1006 })
                  })
                )
                ws.data.run = wsDefaultRun
                ws.data.onClose = constVoid
                ws.close(closeCode(exit))
                return Effect.void
              })
          )

          return {
            pull: Effect.callback<
              Arr.NonEmptyReadonlyArray<Uint8Array | string>,
              Socket.SocketError
            >((resumeRead) => {
              if (buffer.length > 0) return resumeRead(Effect.succeed(takeBuffer()))
              if (error !== undefined) return resumeRead(Effect.fail(error))
              waiter = resumeRead
              return Effect.sync(() => {
                if (waiter === resumeRead) waiter = undefined
              })
            }),
            upgrade: Socket.SocketUpgradeError.unsupported
          }
        })

        return Socket.make({ reader, writer })
      }))
    })
  }
}

const closeCode = (exit: Exit.Exit<unknown, unknown>): number =>
  Exit.isSuccess(exit) ? 1000 : Cause.hasInterruptsOnly(exit.cause) ? 1001 : 1011

const emptyReadbleStream = new ReadableStream({
  start(controller) {
    controller.enqueue(new Uint8Array())
    controller.close()
  }
})

const removeHost = (url: string) => {
  if (url[0] === "/") {
    return url
  }
  const index = url.indexOf("/", url.indexOf("//") + 2)
  return index === -1 ? "/" : url.slice(index)
}
