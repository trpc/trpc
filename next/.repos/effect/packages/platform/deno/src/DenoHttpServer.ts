/**
 * Native Deno implementation of the Effect `HttpServer`.
 *
 * `Deno.serve` can only upgrade requests to WebSocket, so other HTTP/1.1
 * upgrades fail. Serve them with `NodeHttpServer` from
 * `@effect/platform-node`, which runs on Deno's `node:http`.
 *
 * Over HTTP/1.1, `Deno.serve` can stop delivering the request body once the
 * handler has returned a streamed response, so a handler that streams its
 * response while still reading the request payload can stall
 * (denoland/deno#36966).
 *
 * `Deno.serve` negotiates HTTP/2 on its own: over TLS with browsers, and in
 * cleartext with clients that request it. Deno 2.8.3 to 2.9.2 panic and exit
 * when an HTTP/2 client cancels a request while its handler is still running
 * (denoland/deno#36053), so this package requires Deno 2.9.3 or newer.
 *
 * @stability unstable
 * @since 4.0.0
 */
import * as Channel from "effect/Channel"
import * as Config from "effect/Config"
import type { ConfigError } from "effect/Config"
import * as Context from "effect/Context"
import * as Duration from "effect/Duration"
import * as Effect from "effect/Effect"
import * as Fiber from "effect/Fiber"
import type * as FileSystem from "effect/FileSystem"
import { constVoid, flow } from "effect/Function"
import * as Cookies from "effect/http/Cookies"
import * as Etag from "effect/http/Etag"
import * as FetchHttpClient from "effect/http/FetchHttpClient"
import * as Headers from "effect/http/Headers"
import type * as HttpBody from "effect/http/HttpBody"
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
import type * as Schema from "effect/Schema"
import * as Scope from "effect/Scope"
import * as Socket from "effect/socket/Socket"
import * as Stream from "effect/Stream"
import * as Platform from "./DenoHttpPlatform.ts"
import * as DenoMultipart from "./DenoMultipart.ts"
import * as DenoServices from "./DenoServices.ts"

/**
 * Native Deno TCP, TLS, or Unix serve options managed by the scoped server.
 *
 * **Details**
 *
 * `signal` and `onError` are omitted because the scope and Effect HTTP handler
 * own server and failure lifecycles. Server constructors additionally accept
 * WebSocket settings that apply to every upgrade; `protocol` therefore cannot
 * vary per request.
 *
 * @stability unstable
 * @category options
 * @since 4.0.0
 */
export type ServeOptions =
  | (Omit<Deno.ServeTcpOptions, "signal" | "onError"> & Partial<Deno.TlsCertifiedKeyPem>)
  | Omit<Deno.ServeUnixOptions, "signal" | "onError">

/**
 * Creates a scoped native Deno HTTP server.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const make = Effect.fnUntraced(function*(
  options: ServeOptions & {
    readonly disablePreemptiveShutdown?: boolean | undefined
    readonly gracefulShutdownTimeout?: Duration.Input | undefined
    readonly websocket?: Deno.UpgradeWebSocketOptions | undefined
  }
) {
  const scope = yield* Effect.scope
  type Handler = (request: Request, info: Deno.ServeHandlerInfo<Deno.NetAddr | Deno.UnixAddr>) => Promise<Response>
  const notFound: Handler = (_request, _info) => Promise.resolve(new Response("not found", { status: 404 }))
  const handlerStack: Array<Handler> = [notFound]
  let currentHandler = notFound
  const {
    disablePreemptiveShutdown,
    gracefulShutdownTimeout,
    websocket,
    ...serveOptions
  } = options
  const server = Deno.serve(
    serveOptions as Deno.ServeTcpOptions,
    (request, info) =>
      request.method === "CONNECT"
        ? Promise.resolve(new Response(null, { status: 501 }))
        : currentHandler(request, info)
  ) as Deno.HttpServer<Deno.NetAddr | Deno.UnixAddr>

  const shutdown = yield* Effect.promise(() => server.shutdown()).pipe(Effect.cached)
  const preemptiveShutdown = disablePreemptiveShutdown ? Effect.void : Effect.timeoutOrElse(shutdown, {
    duration: gracefulShutdownTimeout ?? Duration.seconds(20),
    orElse: () => Effect.void
  })

  yield* Scope.addFinalizer(scope, shutdown)

  const serverAddress = server.addr
  const address = yield* (serverAddress.transport === "unix"
    ? Effect.succeed(NetAddress.unixPathAddress(serverAddress.path))
    : Effect.fromResult(NetAddress.inetAddressFromIpString(
      (serverAddress as Deno.NetAddr).hostname,
      (serverAddress as Deno.NetAddr).port
    )).pipe(Effect.mapError((cause) => new Error.ServeError({ cause }))))

  return Server.make({
    address,
    serve: Effect.fnUntraced(function*(httpApp, middleware) {
      const parent = yield* Effect.fiber
      const services = parent.context
      const serveScope = Context.getUnsafe(services, Scope.Scope)
      const scope = Scope.forkUnsafe(serveScope, "parallel")

      const httpEffect = HttpEffect.toHandled(httpApp, (request, response) => {
        const denoRequest = request as DenoServerRequest
        if (upgradedSources.has(denoRequest.source)) {
          return Effect.as(cancelResponseBody(response.body), upgradedResponse)
        }
        return Effect.matchCauseEffect(makeResponse(request, response, services, scope), {
          onSuccess: (webResponse) => Effect.sync(() => denoRequest.resolve(webResponse)),
          // Answer the request without waiting for body cleanup, which may never settle
          onFailure: (cause) => {
            denoRequest.resolve(new Response(undefined, { status: 500 }))
            if (response.body._tag === "Raw" && response.body.body instanceof ReadableStream) {
              cancelStreamUnsafe(response.body.body)
            }
            return Effect.failCause(cause)
          }
        })
      }, middleware)

      function handler(
        request: Request,
        info: Deno.ServeHandlerInfo<Deno.NetAddr | Deno.UnixAddr>
      ): Promise<Response> {
        return new Promise<Response>((resolve) => {
          const context = Context.add(
            services,
            ServerRequest.HttpServerRequest,
            new DenoServerRequest(request, info.remoteAddr, resolve, removeHost(request.url), websocket)
          )
          const fiber = Fiber.runIn(Effect.runForkWith(context)(httpEffect), scope)
          request.signal.addEventListener("abort", () => {
            fiber.interruptUnsafe(parent.id, Error.ClientAbort.annotation)
          }, { once: true })
        })
      }

      yield* Scope.addFinalizerExit(serveScope, () => {
        const index = handlerStack.lastIndexOf(handler)
        if (index !== -1) handlerStack.splice(index, 1)
        currentHandler = handlerStack[handlerStack.length - 1] ?? notFound
        return preemptiveShutdown
      })
      handlerStack.push(handler)
      currentHandler = handler
    })
  })
})

const makeResponse = Effect.fnUntraced(function*(
  request: ServerRequest.HttpServerRequest,
  response: ServerResponse.HttpServerResponse,
  context: Context.Context<never>,
  scope: Scope.Scope
) {
  if (ServerResponse.omitsBody(response, request.method === "HEAD")) {
    yield* cancelResponseBody(response.body)
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
  if (response.statusText !== undefined) fields.statusText = response.statusText

  const body = response.body
  switch (body._tag) {
    case "Empty":
      return new Response(undefined, fields)
    case "Uint8Array":
    case "Raw": {
      if (body.body instanceof Response) {
        return ServerResponse.toWeb(response)
      }
      return new Response(body.body as any, fields)
    }
    case "FormData":
      return new Response(body.formData as any, fields)
    case "Stream": {
      // Validate the fields before the stream takes over the request scope, as only reading it would close the scope
      // oxlint-disable-next-line no-new
      new Response(new ReadableStream(), fields)
      const stream = (HttpEffect.scopeTransferToStream(response).body as HttpBody.Stream).stream
      return new Response(
        Stream.toReadableStreamWith(
          // Attach before transforming: startup can suspend. Register the request finalizer before the first pull.
          Stream.fromChannel(Channel.fromTransform((upstream, streamScope) =>
            Effect.withFiber((fiber) => {
              Fiber.runIn(fiber, scope)
              return Channel.toTransform(stream.channel)(upstream, streamScope)
            })
          )),
          context
        ),
        fields
      )
    }
  }
})

/**
 * Provides only the native Deno HTTP server.
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const layerServer: (
  options: ServeOptions & {
    readonly disablePreemptiveShutdown?: boolean | undefined
    readonly gracefulShutdownTimeout?: Duration.Input | undefined
    readonly websocket?: Deno.UpgradeWebSocketOptions | undefined
  }
) => Layer.Layer<Server.HttpServer, Error.ServeError> = flow(
  make,
  Layer.effect(Server.HttpServer)
)

/**
 * Provides Deno HTTP platform services and the standard Deno service set.
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const layerHttpServices: Layer.Layer<HttpPlatform | Etag.Generator | DenoServices.DenoServices> = Layer.mergeAll(
  Platform.layer,
  Etag.layerWeak,
  DenoServices.layer
)

/**
 * Provides a native Deno HTTP server together with Deno HTTP services.
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const layer = (
  options: ServeOptions & {
    readonly disablePreemptiveShutdown?: boolean | undefined
    readonly gracefulShutdownTimeout?: Duration.Input | undefined
    readonly websocket?: Deno.UpgradeWebSocketOptions | undefined
  }
): Layer.Layer<Server.HttpServer | HttpPlatform | Etag.Generator | DenoServices.DenoServices, Error.ServeError> =>
  Layer.mergeAll(layerServer(options), layerHttpServices)

/**
 * Starts a Deno HTTP server on an ephemeral loopback port for tests.
 *
 * @stability unstable
 * @category testing
 * @since 4.0.0
 */
export const layerTest: Layer.Layer<
  Server.HttpServer | HttpPlatform | FileSystem.FileSystem | Etag.Generator | Path.Path | HttpClient
> = Server.layerTestClient.pipe(
  Layer.provide(FetchHttpClient.layer.pipe(
    Layer.provide(Layer.succeed(FetchHttpClient.RequestInit)({ keepalive: false }))
  )),
  Layer.provideMerge(Layer.orDie(layer({ hostname: "127.0.0.1", port: 0, onListen: () => {} })))
)

/**
 * Creates the Deno HTTP server and support-services layer from configurable options.
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const layerConfig = (
  options: Config.Wrap<
    ServeOptions & {
      readonly disablePreemptiveShutdown?: boolean | undefined
      readonly gracefulShutdownTimeout?: Duration.Input | undefined
      readonly websocket?: Deno.UpgradeWebSocketOptions | undefined
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

const formDecoder = new TextDecoder("utf-8", { ignoreBOM: true })

class DenoServerRequest extends Inspectable.Class implements ServerRequest.HttpServerRequest {
  readonly [ServerRequest.TypeId]: typeof ServerRequest.TypeId
  readonly [IncomingMessage.TypeId]: typeof IncomingMessage.TypeId
  readonly source: Request
  readonly remoteAddr: Deno.NetAddr | Deno.UnixAddr
  readonly url: string
  readonly websocketOptions: Deno.UpgradeWebSocketOptions | undefined
  public resolve: (response: Response) => void
  public headersOverride?: Headers.Headers | undefined
  private remoteAddressOverride?: Option.Option<string> | undefined
  private peerAddressOverride?: Option.Option<string> | undefined
  readonly protocol: "http" | "https" | undefined

  constructor(
    source: Request,
    remoteAddr: Deno.NetAddr | Deno.UnixAddr,
    resolve: (response: Response) => void,
    url: string,
    websocketOptions: Deno.UpgradeWebSocketOptions | undefined,
    headersOverride?: Headers.Headers,
    remoteAddressOverride?: Option.Option<string>,
    peerAddressOverride?: Option.Option<string>,
    protocol?: "http" | "https"
  ) {
    super()
    this[ServerRequest.TypeId] = ServerRequest.TypeId
    this[IncomingMessage.TypeId] = IncomingMessage.TypeId
    this.source = source
    this.remoteAddr = remoteAddr
    this.resolve = resolve
    this.url = url
    this.websocketOptions = websocketOptions
    this.headersOverride = headersOverride
    this.remoteAddressOverride = remoteAddressOverride
    this.peerAddressOverride = peerAddressOverride
    this.protocol = protocol
  }
  toJSON(): unknown {
    return IncomingMessage.inspect(this, {
      _id: "HttpServerRequest",
      method: this.method,
      url: UrlParams.redactUrl(this.originalUrl)
    })
  }
  modify(options: {
    readonly url?: string | undefined
    readonly headers?: Headers.Headers | undefined
    readonly remoteAddress?: Option.Option<string> | undefined
    readonly peerAddress?: Option.Option<string> | undefined
    readonly protocol?: "http" | "https" | undefined
  }) {
    return new DenoServerRequest(
      this.source,
      this.remoteAddr,
      this.resolve,
      options.url ?? this.url,
      this.websocketOptions,
      options.headers ?? this.headersOverride,
      "remoteAddress" in options ? options.remoteAddress : this.remoteAddressOverride,
      options.peerAddress ?? this.peerAddressOverride,
      options.protocol ?? this.protocol
    )
  }
  get method(): HttpMethod {
    return this.source.method.toUpperCase() as HttpMethod
  }
  get originalUrl() {
    return this.source.url
  }
  get remoteAddress(): Option.Option<string> {
    return this.remoteAddressOverride ?? (this.remoteAddr.transport === "tcp"
      ? Option.some(this.remoteAddr.hostname)
      : Option.none())
  }
  get peerAddress(): Option.Option<string> {
    return this.peerAddressOverride ?? this.remoteAddress
  }
  get headers(): Headers.Headers {
    if (this.headersOverride === undefined) {
      const headers = Headers.fromInput(this.source.headers)
      // Deno builds the URL from the request authority, ahead of Host.
      // Preserve its raw form; URL.host lowercases names and strips default ports.
      const host = urlAuthority(this.source.url)
      this.headersOverride = host === undefined || headers.host === host ? headers : Headers.set(headers, "host", host)
    }
    return this.headersOverride
  }

  private cachedCookies: Record.ReadonlyRecord<string, string> | undefined
  get cookies() {
    return this.cachedCookies ??= Cookies.parseHeader(this.headers.cookie ?? "")
  }

  get stream(): Stream.Stream<Uint8Array, Error.HttpServerError> {
    return this.source.body
      ? Stream.fromReadableStream({
        evaluate: () => this.source.body ?? emptyReadableStream,
        onError: (cause) =>
          new Error.HttpServerError({
            reason: new Error.RequestParseError({ request: this, cause })
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
    return this.textEffect ??= Effect.map(this.arrayBuffer, (buffer) => new TextDecoder().decode(buffer))
  }
  get json(): Effect.Effect<Schema.Json, Error.HttpServerError> {
    return Effect.flatMap(this.text, (_) =>
      Effect.try({
        try: () => JSON.parse(_) as Schema.Json,
        catch: (cause) =>
          new Error.HttpServerError({
            reason: new Error.RequestParseError({ request: this, cause })
          })
      }))
  }
  get urlParamsBody(): Effect.Effect<UrlParams.UrlParams, Error.HttpServerError> {
    return Effect.flatMap(this.arrayBuffer, (bytes) =>
      Effect.try({
        // A leading "?" is form data; URLSearchParams would drop it as a query prefix.
        try: () => UrlParams.fromInput(new URLSearchParams(formDecoder.decode(bytes).replace(/^\?/, "%3F"))),
        catch: (cause) =>
          new Error.HttpServerError({
            reason: new Error.RequestParseError({ request: this, cause })
          })
      }))
  }

  private multipartEffect:
    | Effect.Effect<Multipart.Persisted, Multipart.MultipartError, Scope.Scope | FileSystem.FileSystem | Path.Path>
    | undefined
  get multipart(): Effect.Effect<
    Multipart.Persisted,
    Multipart.MultipartError,
    Scope.Scope | FileSystem.FileSystem | Path.Path
  > {
    return this.multipartEffect ??= Effect.runSync(Effect.cached(DenoMultipart.persisted(this.source)))
  }
  get multipartStream(): Stream.Stream<Multipart.Part, Multipart.MultipartError> {
    return DenoMultipart.stream(this.source)
  }

  private arrayBufferEffect: Effect.Effect<ArrayBuffer, Error.HttpServerError> | undefined
  get arrayBuffer(): Effect.Effect<ArrayBuffer, Error.HttpServerError> {
    if (this.arrayBufferEffect) return this.arrayBufferEffect
    this.arrayBufferEffect = Effect.runSync(Effect.cached(
      // Reuse the Web reader so that MaxBodySize is enforced.
      Effect.mapError(ServerRequest.fromWeb(this.source).arrayBuffer, (error) => {
        if (error.reason._tag !== "RequestParseError") return error
        const { cause, reason } = error.reason
        return new Error.HttpServerError({
          reason: new Error.RequestParseError({ request: this, cause, ...(reason && { reason }) })
        })
      })
    ))
    return this.arrayBufferEffect
  }

  upgradeWith(
    options: { readonly headers?: Headers.Input | undefined }
  ): Effect.Effect<Socket.Socket, Error.HttpServerError> {
    if (Object.keys(Headers.fromInput(options.headers)).length === 0) return this.upgrade
    return Effect.fail(
      new Error.HttpServerError({
        reason: new Error.InternalError({
          request: this,
          description: "WebSocket upgrades do not support custom response headers"
        })
      })
    )
  }

  get upgrade(): Effect.Effect<Socket.Socket, Error.HttpServerError> {
    return Effect.flatMap(
      Effect.try({
        try: () => Deno.upgradeWebSocket(this.source, this.websocketOptions),
        catch: (cause) =>
          new Error.HttpServerError({
            reason: new Error.RequestParseError({
              request: this,
              cause,
              description: isRawUpgrade(this.source)
                ? "Deno.serve only supports WebSocket upgrades"
                : "Not an upgradeable ServerRequest"
            })
          })
      }),
      (upgrade) => {
        const ws = bufferedWebSocket(upgrade.socket)
        upgradedSources.add(this.source)
        this.resolve(upgrade.response)
        return Socket.fromWebSocket(
          Effect.acquireRelease(
            Effect.succeed(ws),
            () => Effect.sync(() => upgrade.socket.close(1000))
          )
        )
      }
    )
  }
}

// Deno's WebSocket cannot be paused, so events that arrive between the
// upgrade and the first reader acquisition would be lost. This facade buffers
// message, error, and close events until listeners attach, then replays them
// so they come out of the first pull.
const bufferedWebSocket = (ws: WebSocket): Socket.WebSocketLike => {
  interface Entry {
    readonly listener: (event: Socket.WebSocketEvent) => void
    readonly once: boolean
  }
  const listeners = new Map<string, Array<Entry>>()
  const buffered: Array<[string, Socket.WebSocketEvent]> = []
  let buffering = true

  ws.binaryType = "arraybuffer"

  function removeListener(type: string, listener: (event: Socket.WebSocketEvent) => void) {
    const entries = listeners.get(type)
    if (!entries) return
    const index = entries.findIndex((entry) => entry.listener === listener)
    if (index >= 0) entries.splice(index, 1)
  }
  function dispatch(type: string, event: Socket.WebSocketEvent) {
    const entries = listeners.get(type)
    if (!entries || entries.length === 0) return
    for (const entry of entries.slice()) {
      if (entry.once) removeListener(type, entry.listener)
      entry.listener(event)
    }
  }
  function onEvent(type: string) {
    return (event: Event) => {
      const wsEvent = event as unknown as Socket.WebSocketEvent
      if (buffering) {
        buffered.push([type, wsEvent])
      } else {
        dispatch(type, wsEvent)
      }
    }
  }
  ws.addEventListener("message", onEvent("message"))
  ws.addEventListener("error", onEvent("error"))
  ws.addEventListener("close", onEvent("close"))

  function replay() {
    if (!buffering) return
    buffering = false
    for (const [type, event] of buffered.splice(0)) {
      dispatch(type, event)
    }
  }

  return {
    get readyState() {
      return ws.readyState
    },
    addEventListener(type, listener, options) {
      if (type === "open") {
        ws.addEventListener(type, listener as EventListener, options as AddEventListenerOptions)
        return
      }
      let entries = listeners.get(type)
      if (!entries) {
        entries = []
        listeners.set(type, entries)
      }
      entries.push({ listener, once: options?.once === true })
      if (buffering) queueMicrotask(replay)
    },
    removeEventListener(type, listener) {
      if (type === "open") {
        ws.removeEventListener(type, listener as EventListener)
        return
      }
      removeListener(type, listener)
    },
    close: (code, reason) => ws.close(code, reason),
    send: (data) => ws.send(data)
  }
}

// Reported to middleware in place of the handler's discarded response.
const upgradedResponse = ServerResponse.empty({ status: 101 })

// Keyed by source so request copies from `modify` share the upgrade state.
const upgradedSources = new WeakSet<Request>()

const isRawUpgrade = (request: Request): boolean => {
  const protocol = request.headers.get("upgrade")
  return protocol !== null && protocol.toLowerCase() !== "websocket"
}

const cancelResponseBody = (body: HttpBody.HttpBody): Effect.Effect<void> => {
  if (body._tag === "Raw" && typeof ReadableStream !== "undefined" && body.body instanceof ReadableStream) {
    const stream = body.body
    return Effect.ignoreCause(Effect.promise(() => stream.cancel()))
  }
  return Effect.void
}

const cancelStreamUnsafe = (stream: ReadableStream): void => {
  void stream.cancel().catch(constVoid)
}

const emptyReadableStream = new ReadableStream<Uint8Array>({
  start(controller) {
    controller.enqueue(new Uint8Array())
    controller.close()
  }
})

const authorityPattern = /^[^:/?#]+:\/\/([^/?#]*)/
const urlAuthority = (url: string): string | undefined => authorityPattern.exec(url)?.[1]

const removeHost = (url: string) => {
  if (url[0] === "/") return url
  const index = url.indexOf("/", url.indexOf("//") + 2)
  return index === -1 ? "/" : url.slice(index)
}
