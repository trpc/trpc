/**
 * Node socket server adapters for Effect's unstable socket server API.
 *
 * This module turns `node:net` TCP or Unix-domain servers, `node:tls` servers,
 * and `ws` WebSocket servers into scoped `SocketServer.SocketServer` services.
 * Use the TCP and TLS constructors when handlers should receive a
 * `Socket.Socket` backed by a Node `net.Socket`; use the WebSocket
 * constructors when handlers should receive a `Socket.Socket` backed by `ws`
 * and have access to the per-connection WebSocket and `IncomingMessage`
 * services.
 *
 * @since 4.0.0
 */
import type { Cause } from "effect/Cause"
import * as Context from "effect/Context"
import * as Deferred from "effect/Deferred"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Fiber from "effect/Fiber"
import { pipe } from "effect/Function"
import * as Function from "effect/Function"
import * as Layer from "effect/Layer"
import * as NetAddress from "effect/net/NetAddress"
import * as References from "effect/References"
import * as Scope from "effect/Scope"
import * as Socket from "effect/socket/Socket"
import * as SocketServer from "effect/socket/SocketServer"
import type * as Http from "node:http"
import * as Net from "node:net"
import * as Tls from "node:tls"
import * as NodeSocket from "./NodeSocket.ts"
import { NodeWS } from "./NodeSocket.ts"

const isDeno = "Deno" in globalThis

const socketAddressFromNode = (
  address: string | Net.AddressInfo
): Effect.Effect<NetAddress.SocketAddress, SocketServer.SocketServerError> =>
  typeof address === "string"
    ? Effect.succeed(NetAddress.unixPathAddress(address))
    : Effect.fromResult(NetAddress.inetAddressFromIpString(address.address, address.port)).pipe(
      Effect.mapError((cause) =>
        new SocketServer.SocketServerError({
          reason: new SocketServer.SocketServerOpenError({ cause })
        })
      )
    )

/**
 * Service tag for the Node `IncomingMessage` associated with the current
 * WebSocket server connection.
 *
 * @category services
 * @since 4.0.0
 */
export class IncomingMessage extends Context.Service<
  IncomingMessage,
  Http.IncomingMessage
>()("@effect/platform-node-shared/NodeSocketServer/IncomingMessage") {}

/**
 * Creates a scoped TCP `SocketServer` from a Node `net.Server`, starts
 * listening with the supplied options, queues pending connections until `run`
 * is called, and closes the server when the scope ends.
 *
 * @category constructors
 * @since 4.0.0
 */
export const make = (
  options: Net.ServerOpts & Net.ListenOptions
): Effect.Effect<
  SocketServer.SocketServer["Service"],
  SocketServer.SocketServerError,
  Scope.Scope
> =>
  makeNetServer({
    listenOptions: options,
    connectionEvent: "connection",
    createServer: () => Net.createServer(options)
  })

/**
 * Provides a TCP `SocketServer` by creating and managing a scoped Node
 * `net.Server` with the supplied server and listen options.
 *
 * @category layers
 * @since 4.0.0
 */
export const layer: (
  options: Net.ServerOpts & Net.ListenOptions
) => Layer.Layer<
  SocketServer.SocketServer,
  SocketServer.SocketServerError
> = Function.flow(make, Layer.effect(SocketServer.SocketServer))

/**
 * Creates a scoped TLS `SocketServer` from a Node `tls.Server`, starts
 * listening with the supplied options, queues pending connections until `run`
 * is called, and closes the server when the scope ends.
 *
 * **Details**
 *
 * Connections reach `run` only once their handshake has completed, and the
 * handler receives a `Socket.Socket` backed by the `tls.TLSSocket`, which is
 * also provided as `NodeSocket.NetSocket`. Connections that fail the handshake
 * are destroyed and the server keeps listening.
 *
 * @category constructors
 * @since 4.0.0
 */
export const makeTls = (
  options: Tls.TlsOptions & Net.ListenOptions
): Effect.Effect<
  SocketServer.SocketServer["Service"],
  SocketServer.SocketServerError,
  Scope.Scope
> =>
  makeNetServer({
    listenOptions: options,
    connectionEvent: "secureConnection",
    createServer: () => {
      const server = Tls.createServer(options)
      server.on("tlsClientError", (_error, socket) => {
        socket.destroy()
      })
      return server
    }
  })

/**
 * Provides a TLS `SocketServer` by creating and managing a scoped Node
 * `tls.Server` with the supplied TLS and listen options.
 *
 * @category layers
 * @since 4.0.0
 */
export const layerTls: (
  options: Tls.TlsOptions & Net.ListenOptions
) => Layer.Layer<
  SocketServer.SocketServer,
  SocketServer.SocketServerError
> = Function.flow(makeTls, Layer.effect(SocketServer.SocketServer))

/**
 * Creates a scoped WebSocket `SocketServer` backed by the `ws` package,
 * providing the WebSocket and its Node `IncomingMessage` to connection
 * handlers and closing the server when the scope ends.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const makeWebSocket: (
  options: NodeWS.ServerOptions<typeof NodeWS.WebSocket, typeof Http.IncomingMessage>
) => Effect.Effect<
  SocketServer.SocketServer["Service"],
  SocketServer.SocketServerError,
  Scope.Scope
> = Effect.fnUntraced(function*(
  options: NodeWS.ServerOptions
) {
  const pendingConnections = new Map<
    NodeWS.WebSocket,
    readonly [request: Http.IncomingMessage, remove: () => void]
  >()
  const server = yield* Effect.acquireRelease(
    Effect.sync(() => new NodeWS.WebSocketServer(options)),
    (server) =>
      Effect.callback<void>((resume) => {
        pendingConnections.forEach(([, remove], conn) => {
          remove()
          conn.terminate()
        })
        server.close(() => resume(Effect.void))
      })
  )
  function defaultHandler(conn: NodeWS.WebSocket, req: Http.IncomingMessage) {
    const remove = () => {
      pendingConnections.delete(conn)
      conn.removeEventListener("close", remove)
    }
    pendingConnections.set(conn, [req, remove])
    conn.addEventListener("close", remove)
  }
  let onConnection = defaultHandler
  server.on("connection", (conn, req) => {
    // pause immediately so nothing is dropped before a handler acquires the
    // socket's reader
    conn.pause()
    onConnection(conn, req as Http.IncomingMessage)
  })

  yield* Effect.callback<void, SocketServer.SocketServerError>((resume) => {
    server.once("error", (error) => {
      resume(Effect.fail(
        new SocketServer.SocketServerError({
          reason: new SocketServer.SocketServerOpenError({
            cause: error
          })
        })
      ))
    })
    server.once("listening", () => {
      resume(Effect.void)
    })
  })

  const run = Effect.fnUntraced(function*<R, E, _>(handler: (socket: Socket.Socket) => Effect.Effect<_, E, R>) {
    const scope = yield* Scope.make()
    const services = Context.omit(Scope.Scope)(yield* Effect.context<R>()) as Context.Context<R>
    const trackFiber = Fiber.runIn(scope)
    const prevOnConnection = onConnection
    onConnection = function(conn: NodeWS.WebSocket, req: Http.IncomingMessage) {
      let context = services
      context = Context.add(context, IncomingMessage, req)
      context = Context.add(context, Socket.WebSocket, conn)
      pipe(
        Socket.fromWebSocket(
          Effect.acquireRelease(
            Effect.succeed(conn),
            (conn) =>
              Effect.sync(() => {
                conn.close()
              })
          )
        ),
        Effect.flatMap(handler),
        Effect.catchCause(reportUnhandledError),
        Effect.runForkWith(context),
        trackFiber
      )
    }
    pendingConnections.forEach(([req, remove], conn) => {
      remove()
      onConnection(conn, req)
    })
    return yield* Effect.callback<never>((_resume) => {
      return Effect.sync(() => {
        onConnection = prevOnConnection
      })
    }).pipe(
      Effect.ensuring(Scope.close(scope, Exit.void))
    )
  })

  const boundAddress = yield* socketAddressFromNode(server.address()!)
  return SocketServer.SocketServer.of({
    address: boundAddress,
    run
  })
})

/**
 * Provides a WebSocket `SocketServer` backed by the `ws` package and managed
 * with the supplied server options.
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const layerWebSocket: (
  options: NodeSocket.NodeWS.ServerOptions<typeof NodeSocket.NodeWS.WebSocket, typeof Http.IncomingMessage>
) => Layer.Layer<
  SocketServer.SocketServer,
  SocketServer.SocketServerError
> = Function.flow(makeWebSocket, Layer.effect(SocketServer.SocketServer))

const reportUnhandledError = <E>(cause: Cause<E>) =>
  Effect.withFiber<void>((fiber) => {
    const unhandledLogLevel = fiber.getRef(References.UnhandledLogLevel)
    if (unhandledLogLevel) {
      return Effect.logWithLevel(unhandledLogLevel)(cause, "Unhandled error in SocketServer")
    }
    return Effect.void
  })

const makeNetServer = Effect.fnUntraced(function*(options: {
  readonly createServer: () => Net.Server
  readonly connectionEvent: "connection" | "secureConnection"
  readonly listenOptions: Net.ListenOptions
}) {
  const errorDeferred = Deferred.makeUnsafe<never, Error>()
  const pending = new Map<Net.Socket, () => void>()
  function defaultOnConnection(conn: Net.Socket) {
    const remove = () => {
      pending.delete(conn)
      conn.off("close", remove)
      conn.off("error", remove)
    }
    pending.set(conn, remove)
    conn.on("close", remove)
    conn.on("error", remove)
  }
  let onConnection = defaultOnConnection
  // oxlint-disable-next-line prefer-const
  let server: Net.Server | undefined
  yield* Effect.addFinalizer(() =>
    Effect.callback<void>((resume) => {
      pending.forEach((remove, conn) => {
        remove()
        conn.destroy()
      })
      server?.close(() => resume(Effect.void))
    })
  )
  server = options.createServer()
  server.on(options.connectionEvent, (conn: Net.Socket) => {
    // pause immediately so nothing is dropped before a handler acquires the
    // socket's reader. Deno's node:net compatibility layer leaves the socket
    // non-flowing but breaks `readable` events after an explicit pause.
    if (!isDeno) conn.pause()
    onConnection(conn)
  })
  server.on("error", (err) => Deferred.doneUnsafe(errorDeferred, Exit.fail(err)))

  yield* Effect.callback<void, SocketServer.SocketServerError>((resume) => {
    server.listen(options.listenOptions, () => resume(Effect.void))
  }).pipe(
    Effect.raceFirst(Effect.mapError(Deferred.await(errorDeferred), (err) =>
      new SocketServer.SocketServerError({
        reason: new SocketServer.SocketServerOpenError({
          cause: err
        })
      })))
  )

  const run = Effect.fnUntraced(function*<R, E, _>(handler: (socket: Socket.Socket) => Effect.Effect<_, E, R>) {
    const scope = yield* Scope.make()
    const services = Context.omit(Scope.Scope)(yield* Effect.context<R>()) as Context.Context<R>
    const trackFiber = Fiber.runIn(scope)
    const prevOnConnection = onConnection
    onConnection = function(conn: Net.Socket) {
      let error: Error | undefined
      conn.on("error", (err) => {
        error = err
      })
      pipe(
        NodeSocket.fromDuplex(
          Effect.acquireRelease(
            Effect.suspend((): Effect.Effect<Net.Socket, Socket.SocketError> => {
              if (error) {
                return Effect.fail(
                  new Socket.SocketError({
                    reason: new Socket.SocketOpenError({
                      kind: "Unknown",
                      cause: error
                    })
                  })
                )
              } else if (conn.closed) {
                return Effect.fail(
                  new Socket.SocketError({
                    reason: new Socket.SocketCloseError({ code: 1000 })
                  })
                )
              }
              return Effect.succeed(conn)
            }),
            (conn) =>
              Effect.sync(() => {
                if (conn.closed === false) {
                  conn.destroySoon()
                }
              })
          ),
          { tlsServer: true }
        ),
        Effect.flatMap(handler),
        Effect.catchCause(reportUnhandledError),
        Effect.runForkWith(Context.add(services, NodeSocket.NetSocket, conn)),
        trackFiber
      )
    }
    pending.forEach((remove, conn) => {
      remove()
      onConnection(conn)
    })
    return yield* Effect.callback<never>((_resume) => {
      return Effect.suspend(() => {
        onConnection = prevOnConnection
        return Scope.close(scope, Exit.void)
      })
    })
  })

  const boundAddress = yield* socketAddressFromNode(server.address()!)
  return SocketServer.SocketServer.of({
    address: boundAddress,
    run
  })
})
