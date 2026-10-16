/**
 * Native Deno socket adapters for Effect sockets.
 *
 * This module uses Deno-specific names: `makeTcp`, `makeTcpChannel`,
 * `layerTcp`, and `fromConn` correspond to the Node platform's net and duplex
 * APIs. Deno does not support `keepAliveInitialDelay`, and the `noDelay` and
 * `keepAlive` options have no effect on Unix connections. A `CloseEvent` always
 * closes gracefully because Deno has no equivalent of Node's reset-on-close.
 *
 * @since 4.0.0
 */
import * as Arr from "effect/Array"
import * as Channel from "effect/Channel"
import * as Context from "effect/Context"
import type * as Duration from "effect/Duration"
import * as Effect from "effect/Effect"
import * as Function from "effect/Function"
import { constVoid } from "effect/Function"
import * as Latch from "effect/Latch"
import * as Layer from "effect/Layer"
import * as Scope from "effect/Scope"
import * as Socket from "effect/socket/Socket"

/**
 * Options for opening a TCP or Unix connection.
 *
 * @category options
 * @since 4.0.0
 */
export type ConnectOptions = (Deno.ConnectOptions | Deno.UnixConnectOptions) & {
  readonly noDelay?: boolean | undefined
  readonly keepAlive?: boolean | undefined
}

/**
 * Options for opening a TCP or Unix connection.
 *
 * @category options
 * @since 4.0.0
 */
export type TcpOptions = ConnectOptions & {
  readonly openTimeout?: Duration.Input | undefined
}

/**
 * Service tag for the underlying Deno connection.
 *
 * @category services
 * @since 4.0.0
 */
export class Conn extends Context.Service<Conn, Deno.Conn>()(
  "@effect/platform-deno/DenoSocket/Conn"
) {}

/**
 * Adapts a Deno connection into an Effect socket.
 *
 * **Details**
 *
 * Readers over TCP connections can upgrade in place with `Deno.startTls`.
 * Deno exposes only the client side of this transition; Unix connections fail
 * the upgrade with a `SocketUpgradeError`.
 *
 * `Deno.startTls` does not support client certificates, so `key`, `cert`,
 * `passphrase`, and `requestCert` do not affect Deno upgrades. Setting
 * `rejectUnauthorized` to `false` disables hostname verification only;
 * certificate-chain validation still applies.
 *
 * @category constructors
 * @since 4.0.0
 */
export const fromConn = <RO>(
  open: Effect.Effect<Deno.Conn, Socket.SocketError, RO>
): Effect.Effect<Socket.Socket, never, Exclude<RO, Scope.Scope>> =>
  Effect.withFiber<Socket.Socket, never, Exclude<RO, Scope.Scope>>((fiber) => {
    let current: {
      readonly conn: Deno.Conn
      readonly writer: WritableStreamDefaultWriter<Uint8Array>
      readonly fail: (error: Socket.SocketError) => void
    } | undefined
    let tearingDown = false
    let writeClosed = false
    const latch = Latch.makeUnsafe(false)
    const openServices = fiber.context as Context.Context<RO>

    const reader: Socket.Socket["reader"] = Effect.gen(function*() {
      const scope = yield* Effect.scope
      let conn: Deno.Conn | undefined
      let upgradeAvailable = true
      yield* Scope.addFinalizer(
        scope,
        Effect.suspend(() => {
          tearingDown = true
          latch.closeUnsafe()
          current = undefined
          upgradeAvailable = false
          return conn === undefined ? Effect.void : close(conn)
        })
      )
      conn = yield* Scope.provide(open, scope)
      let readerHandle = conn.readable.getReader()
      let writerHandle = conn.writable.getWriter()

      let error: Socket.SocketError | undefined
      const fail = (err: Socket.SocketError) => {
        if (error === undefined) error = err
        tearingDown = true
        readerHandle.cancel().catch(constVoid)
      }
      current = {
        conn,
        writer: writerHandle,
        fail
      }
      tearingDown = false
      if (writeClosed) {
        writeClosed = false
        writerHandle.releaseLock()
        yield* closeWrite(conn)
      }
      latch.openUnsafe()

      const read = Effect.tryPromise({
        try: () => readerHandle.read(),
        catch: (cause) =>
          tearingDown && isTeardownError(cause)
            ? error ?? new Socket.SocketError({
              reason: new Socket.SocketCloseError({ code: 1000 })
            })
            : new Socket.SocketError({
              reason: new Socket.SocketReadError({ cause })
            })
      })
      const upgrade: Socket.Reader["upgrade"] = (options = {}) =>
        Effect.suspend(() => {
          if (!upgradeAvailable) {
            return Effect.fail(
              new Socket.SocketError({
                reason: new Socket.SocketUpgradeError({
                  cause: new Error("socket is already upgraded or closed")
                })
              })
            )
          }
          if (conn!.remoteAddr.transport !== "tcp") {
            return Effect.fail(
              new Socket.SocketError({
                reason: new Socket.SocketUpgradeError({
                  cause: new Error("TLS upgrade requires a TCP connection")
                })
              })
            )
          }
          upgradeAvailable = false
          const raw = conn as Deno.TcpConn
          readerHandle.releaseLock()
          writerHandle.releaseLock()
          return Effect.tryPromise({
            try: async () => {
              const tls = await Deno.startTls(raw, {
                hostname: raw.remoteAddr.hostname,
                caCerts: options.ca === undefined ? [] : toStrings(options.ca),
                unsafelyDisableHostnameVerification: options.rejectUnauthorized === false,
                ...(options.alpnProtocols === undefined ? {} : { alpnProtocols: [...options.alpnProtocols] })
              })
              await tls.handshake()
              return tls
            },
            catch: (cause) =>
              new Socket.SocketError({
                reason: new Socket.SocketUpgradeError({ cause })
              })
          }).pipe(
            Effect.tap((tls) =>
              Effect.sync(() => {
                conn = tls
                readerHandle = tls.readable.getReader()
                writerHandle = tls.writable.getWriter()
                current = { conn: tls, writer: writerHandle, fail }
              })
            ),
            Effect.tapError((upgradeError) => Effect.sync(() => fail(upgradeError))),
            Effect.asVoid
          )
        })
      return {
        pull: Effect.suspend(() => {
          if (error !== undefined) return Effect.fail(error)
          return Effect.flatMap(read, ({ done, value }) =>
            done
              ? Effect.fail(
                error ?? new Socket.SocketError({
                  reason: new Socket.SocketCloseError({ code: 1000 })
                })
              )
              : Effect.succeed([value] as const))
        }),
        upgrade
      }
    }).pipe(
      Effect.updateContext((input: Context.Context<Scope.Scope>) => Context.merge(openServices, input))
    ) as Socket.Socket["reader"]

    const write = (chunk: Uint8Array | string | Socket.CloseEvent) =>
      latch.whenOpen(Effect.suspend(() => {
        const { conn, fail, writer } = current!
        if (Socket.isCloseEvent(chunk)) {
          fail(
            new Socket.SocketError({
              reason: new Socket.SocketCloseError({ code: chunk.code, closeReason: chunk.reason })
            })
          )
          return close(conn)
        }
        const bytes = typeof chunk === "string" ? encoder.encode(chunk) : chunk
        return Effect.tryPromise({
          try: () => writer.ready.then(() => writer.write(bytes)),
          catch: (cause) =>
            new Socket.SocketError({
              reason: new Socket.SocketWriteError({ cause })
            })
        })
      }))

    const writeAll = (chunks: Arr.NonEmptyReadonlyArray<Uint8Array | string>) =>
      latch.whenOpen(Effect.tryPromise({
        try: async () => {
          const { writer } = current!
          for (let i = 0; i < chunks.length; i++) {
            const chunk = chunks[i]
            const bytes = typeof chunk === "string" ? encoder.encode(chunk) : chunk
            await writer.ready
            await writer.write(bytes)
          }
        },
        catch: (cause) =>
          new Socket.SocketError({
            reason: new Socket.SocketWriteError({ cause })
          })
      }))

    const writer: Socket.Socket["writer"] = Effect.acquireRelease(
      Effect.sync(() => {
        writeClosed = false
        return { write, writeAll }
      }),
      () =>
        Effect.suspend(() => {
          if (current === undefined) {
            writeClosed = true
            return Effect.void
          }
          const { conn, writer } = current
          writer.releaseLock()
          return closeWrite(conn)
        })
    )

    return Effect.succeed(Socket.make({ reader, writer }))
  })

/**
 * Opens a native Deno TCP or Unix connection as an Effect socket.
 *
 * **Details**
 *
 * An `openTimeout` interrupts acquisition but cannot cancel the in-flight
 * `Deno.connect` promise. The scope finalizer closes a connection that arrives
 * after the timeout.
 *
 * @category constructors
 * @since 4.0.0
 */
export const makeTcp = (options: TcpOptions): Effect.Effect<Socket.Socket> => {
  const { keepAlive, noDelay, openTimeout, ...connectOptions } = options
  const acquire = Effect.contextWith((context: Context.Context<Scope.Scope>) => {
    let conn: Deno.Conn | undefined
    let finalized = false
    return Scope.addFinalizer(
      Context.get(context, Scope.Scope),
      Effect.suspend(() => {
        finalized = true
        return conn === undefined ? Effect.void : close(conn)
      })
    ).pipe(
      Effect.andThen(Effect.tryPromise({
        try: () => {
          const connecting = connectOptions.transport === "unix"
            ? Deno.connect(connectOptions)
            : Deno.connect(connectOptions)
          return connecting.then((connection) => {
            conn = connection
            if (finalized) connection.close()
            return connection
          })
        },
        catch: (cause) =>
          new Socket.SocketError({
            reason: new Socket.SocketOpenError({ kind: "Unknown", cause })
          })
      })),
      Effect.tap((connection) =>
        Effect.sync(() => {
          if ("setNoDelay" in connection && noDelay !== undefined) {
            connection.setNoDelay(noDelay)
          }
          if ("setKeepAlive" in connection && keepAlive !== undefined) {
            connection.setKeepAlive(keepAlive)
          }
        })
      )
    )
  }).pipe(
    openTimeout === undefined
      ? Function.identity
      : Effect.timeoutOrElse({
        duration: openTimeout,
        orElse: () =>
          Effect.fail(
            new Socket.SocketError({
              reason: new Socket.SocketOpenError({ kind: "Timeout", cause: new Error("Connection timed out") })
            })
          )
      })
  )
  return fromConn(acquire)
}

/**
 * Creates a channel over a native Deno TCP or Unix connection.
 *
 * @category constructors
 * @since 4.0.0
 */
export const makeTcpChannel = <IE = never>(
  options: ConnectOptions
): Channel.Channel<
  Arr.NonEmptyReadonlyArray<Uint8Array>,
  Socket.SocketError | IE,
  void,
  Arr.NonEmptyReadonlyArray<Uint8Array | string | Socket.CloseEvent>,
  IE
> => Channel.unwrap(Effect.map(makeTcp(options), Socket.toChannelWith<IE>()))

/**
 * Provides a socket by opening a native Deno TCP or Unix connection.
 *
 * @category layers
 * @since 4.0.0
 */
export const layerTcp: (options: ConnectOptions) => Layer.Layer<
  Socket.Socket,
  Socket.SocketError
> = Function.flow(makeTcp, Layer.effect(Socket.Socket))

/**
 * Creates a socket layer connected to a URL with Deno's global WebSocket.
 *
 * @category layers
 * @since 4.0.0
 */
export const layerWebSocket = (url: string, options?: {
  readonly openTimeout?: Duration.Input | undefined
  readonly protocols?: string | globalThis.Array<string> | undefined
  readonly highWaterMark?: number | undefined
}): Layer.Layer<Socket.Socket> =>
  Layer.effect(Socket.Socket, Socket.makeWebSocket(url, options)).pipe(
    Layer.provide(layerWebSocketConstructor)
  )

/**
 * Provides the WebSocket constructor backed by `globalThis.WebSocket`.
 *
 * @category layers
 * @since 4.0.0
 */
export const layerWebSocketConstructor: Layer.Layer<Socket.WebSocketConstructor> =
  Socket.layerWebSocketConstructorGlobal

const encoder = new TextEncoder()
const decoder = new TextDecoder()

const toStrings = (values: string | Uint8Array | ReadonlyArray<string | Uint8Array>): Array<string> =>
  Arr.map(Arr.ensure(values), (value) => typeof value === "string" ? value : decoder.decode(value))

const isBadResource = (cause: unknown): cause is Deno.errors.BadResource => cause instanceof Deno.errors.BadResource

const isTeardownError = (cause: unknown): boolean => cause instanceof Deno.errors.Interrupted || isBadResource(cause)

const close = (conn: Deno.Conn): Effect.Effect<void> =>
  Effect.try(() => conn.close()).pipe(
    Effect.catch(({ cause }) => isBadResource(cause) ? Effect.void : Effect.die(cause))
  )

const closeWrite = (conn: Deno.Conn): Effect.Effect<void> =>
  Effect.tryPromise(() => conn.closeWrite()).pipe(
    Effect.catch((error) => isBadResource(error) ? Effect.void : Effect.die(error))
  )
