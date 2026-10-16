/**
 * Models bidirectional socket connections in Effect.
 *
 * A `Socket` exposes a pull-based `reader` and a scoped `writer`. Acquiring
 * the reader dials the connection and returns an `Effect` that yields batches
 * of incoming frames with end-to-end backpressure: nothing is read from the
 * transport until the consumer pulls. Every termination, including clean
 * closes, surfaces as a `SocketError`, so reconnecting is a plain
 * `Effect.retry` around the scoped consume loop.
 *
 * @stability unstable
 * @since 4.0.0
 */
import type { NonEmptyArray, NonEmptyReadonlyArray } from "../Array.ts"
import type * as Cause from "../Cause.ts"
import * as Channel from "../Channel.ts"
import * as Context from "../Context.ts"
import type * as Duration from "../Duration.ts"
import * as Effect from "../Effect.ts"
import * as Exit from "../Exit.ts"
import { constVoid, dual, flow } from "../Function.ts"
import * as Latch from "../Latch.ts"
import * as Layer from "../Layer.ts"
import * as Predicate from "../Predicate.ts"
import * as Pull from "../Pull.ts"
import type * as Redacted from "../Redacted.ts"
import * as Schema from "../Schema.ts"
import * as Scope from "../Scope.ts"
import * as Stream from "../Stream.ts"

/**
 * Runtime type identifier attached to `Socket` services.
 *
 * @stability unstable
 * @category type IDs
 * @since 4.0.0
 */
export const TypeId = "~effect/socket/Socket"

/**
 * Returns `true` when a value is a `Socket`.
 *
 * @stability unstable
 * @category guards
 * @since 4.0.0
 */
export const isSocket = (u: unknown): u is Socket => Predicate.hasProperty(u, TypeId)

/**
 * Service tag for bidirectional socket transports.
 *
 * **When to use**
 *
 * Use to access or provide the socket implementation used by programs that
 * read and write frames through the Effect environment.
 *
 * @stability unstable
 * @category services
 * @since 4.0.0
 */
export const Socket: Context.Service<Socket, Socket> = Context.Service<Socket>("effect/socket/Socket")

/**
 * Effect-based socket abstraction exposing a pull-based read side and a
 * scoped writer.
 *
 * **Details**
 *
 * Acquiring `reader` establishes the connection; the scope of the acquisition
 * owns the connection lifecycle. Its `pull` yields non-empty batches of incoming
 * frames and never completes via `Cause.Done`: every termination, clean close
 * included, fails with a `SocketError` wrapping the close reason. Code placed
 * between the acquisition and the first pull runs exactly once per
 * (re)connection, which makes handshakes plain code placement.
 *
 * Closing the acquisition scope must fail a pull that is currently suspended,
 * rather than leaving it blocked. Consumers such as `toChannel` rely on this
 * to shut a connection down without racing every pull against a separate
 * failure signal.
 *
 * The writer is detached from any single connection: acquiring it cannot
 * fail, and writes made while disconnected suspend until the next connection
 * is established. Releasing the writer scope half-closes the write side
 * where the transport supports it.
 *
 * **Example** (Consuming with automatic reconnect)
 *
 * ```ts skip-type-checking
 * Effect.gen(function*() {
 *   const { pull } = yield* socket.reader
 *   while (true) {
 *     yield* handle(yield* pull)
 *   }
 * }).pipe(
 *   Effect.scoped,
 *   Effect.retry({ schedule: Schedule.exponential(200) })
 * )
 * ```
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface Socket {
  readonly [TypeId]: typeof TypeId
  readonly reader: Effect.Effect<Reader, SocketError, Scope.Scope>
  readonly writer: Effect.Effect<Writer, never, Scope.Scope>
}

/**
 * The read side of a live `Socket` connection.
 *
 * **Details**
 *
 * `pull` reads the next non-empty batch. `upgrade` wraps this connection with
 * TLS when the transport supports it. Unsupported readers fail with a
 * `SocketUpgradeError`. The upgrade also fails with `SocketUpgradeError` when
 * the selected TLS role requires an identity but `key` and `cert` are not both
 * provided. Calling `upgrade()` without an options object uses the adapter's
 * client defaults.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface Reader<A extends Uint8Array | string = Uint8Array | string> {
  readonly pull: Effect.Effect<NonEmptyReadonlyArray<A>, SocketError>
  readonly upgrade: (options?: TlsUpgradeOptions) => Effect.Effect<void, SocketError>
}

/**
 * The write side of a `Socket`.
 *
 * **Details**
 *
 * `write` sends a single frame or a `CloseEvent`; `writeAll` sends a batch of
 * frames, allowing transports to coalesce them into a single flush. Both
 * apply the transport's native backpressure before succeeding.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface Writer {
  readonly write: (chunk: Uint8Array | string | CloseEvent) => Effect.Effect<void, SocketError>
  readonly writeAll: (chunks: NonEmptyReadonlyArray<Uint8Array | string>) => Effect.Effect<void, SocketError>
}

/**
 * TLS credentials and handshake settings used to upgrade a live socket.
 *
 * **Details**
 *
 * `key` and `cert` are optional for client upgrades that do not present a
 * client certificate. Server upgrades require both, and providing only one is
 * invalid. Missing or incomplete credentials fail the upgrade with a
 * `SocketUpgradeError` when the adapter needs an identity.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface TlsUpgradeOptions {
  readonly key?:
    | Redacted.Redacted<string | Uint8Array>
    | ReadonlyArray<Redacted.Redacted<string | Uint8Array>>
    | undefined
  readonly cert?: string | Uint8Array | ReadonlyArray<string | Uint8Array> | undefined
  readonly ca?: string | Uint8Array | ReadonlyArray<string | Uint8Array> | undefined
  readonly passphrase?: Redacted.Redacted<string> | undefined
  readonly alpnProtocols?: ReadonlyArray<string> | undefined
  readonly requestCert?: boolean | undefined
  readonly rejectUnauthorized?: boolean | undefined
}

/**
 * Constructs a `Socket` from a reader acquisition and a scoped writer.
 *
 * **Details**
 *
 * The reader must fail a suspended pull when its acquisition scope closes; see
 * `Socket` for why. A reader that leaves a pull blocked forever will hang any
 * consumer that shuts the socket down by closing that scope.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const make = (options: {
  readonly reader: Socket["reader"]
  readonly writer: Socket["writer"]
}): Socket =>
  Socket.of({
    [TypeId]: TypeId,
    reader: options.reader,
    writer: options.writer
  })

const encoder = new TextEncoder()

/**
 * Acquires the socket's binary `pull`, encoding any string frames as UTF-8
 * bytes.
 *
 * **Details**
 *
 * When a pulled batch contains no string frames it is returned as-is, so
 * transports that only emit bytes (TCP) pay no per-chunk cost.
 *
 * @stability unstable
 * @category combinators
 * @since 4.0.0
 */
export const readerBytes = (
  self: Socket
): Effect.Effect<
  Effect.Effect<NonEmptyReadonlyArray<Uint8Array>, SocketError>,
  SocketError,
  Scope.Scope
> =>
  Effect.map(self.reader, ({ pull }) =>
    Effect.map(pull, (chunk) => {
      for (let i = 0; i < chunk.length; i++) {
        if (typeof chunk[i] === "string") {
          const out = new Array<Uint8Array>(chunk.length) as NonEmptyArray<Uint8Array>
          for (let j = 0; j < chunk.length; j++) {
            const item = chunk[j]
            out[j] = typeof item === "string" ? encoder.encode(item) : item
          }
          return out
        }
      }
      return chunk as NonEmptyReadonlyArray<Uint8Array>
    }))

/**
 * Acquires the socket's string `pull`, decoding binary frames with the optional
 * text encoding.
 *
 * **Details**
 *
 * The `TextDecoder` is created once per acquisition.
 *
 * @stability unstable
 * @category combinators
 * @since 4.0.0
 */
export const readerString = (
  self: Socket,
  encoding?: string | undefined
): Effect.Effect<
  Effect.Effect<NonEmptyReadonlyArray<string>, SocketError>,
  SocketError,
  Scope.Scope
> =>
  Effect.map(self.reader, ({ pull }) => {
    const decoder = new TextDecoder(encoding)
    return Effect.map(pull, (chunk) => {
      const out = new Array<string>(chunk.length)
      for (let i = 0; i < chunk.length; i++) {
        const item = chunk[i]
        out[i] = typeof item === "string" ? item : decoder.decode(item)
      }
      return out as unknown as NonEmptyReadonlyArray<string>
    })
  })

const CloseEventTypeId = "~effect/socket/Socket/CloseEvent"

/**
 * Represents a socket close event value carrying a close code and optional
 * reason.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export class CloseEvent {
  /**
   * Marks this value as a socket close event for runtime guards.
   *
   * @stability unstable
   * @since 4.0.0
   */
  readonly [CloseEventTypeId]: typeof CloseEventTypeId
  readonly code: number
  readonly reason?: string | undefined

  constructor(code = 1000, reason?: string) {
    this[CloseEventTypeId] = CloseEventTypeId
    this.code = code
    this.reason = reason
  }
  /**
   * Formats the close code and optional reason for display.
   *
   * @stability unstable
   * @since 4.0.0
   */
  toString() {
    return this.reason ? `${this.code}: ${this.reason}` : `${this.code}`
  }
}

/**
 * Returns `true` when a value is a `CloseEvent`.
 *
 * @stability unstable
 * @category guards
 * @since 4.0.0
 */
export const isCloseEvent = (u: unknown): u is CloseEvent => Predicate.hasProperty(u, CloseEventTypeId)

/**
 * Type-level identifier used to mark `SocketError` values.
 *
 * @stability unstable
 * @category type IDs
 * @since 4.0.0
 */
export type SocketErrorTypeId = "~effect/socket/Socket/SocketError"

/**
 * Runtime type identifier attached to `SocketError` values.
 *
 * @stability unstable
 * @category type IDs
 * @since 4.0.0
 */
export const SocketErrorTypeId: SocketErrorTypeId = "~effect/socket/Socket/SocketError"

/**
 * Returns `true` when a value is a `SocketError`.
 *
 * @stability unstable
 * @category guards
 * @since 4.0.0
 */
export const isSocketError = (u: unknown): u is SocketError => Predicate.hasProperty(u, SocketErrorTypeId)

/**
 * Typed error for failures that occur while reading from a socket.
 *
 * @stability unstable
 * @category errors
 * @since 4.0.0
 */
export class SocketReadError extends Schema.Error<SocketReadError>("effect/socket/Socket/SocketReadError")({
  _tag: Schema.tag("SocketReadError"),
  cause: Schema.Defect()
}) {
  /**
   * Default message used for socket read failures.
   *
   * @stability unstable
   * @since 4.0.0
   */
  override readonly message = `An error occurred during Read`
}

/**
 * Typed error for failures that occur while writing to a socket.
 *
 * @stability unstable
 * @category errors
 * @since 4.0.0
 */
export class SocketWriteError extends Schema.Error<SocketWriteError>("effect/socket/Socket/SocketWriteError")({
  _tag: Schema.tag("SocketWriteError"),
  cause: Schema.Defect()
}) {
  /**
   * Default message used for socket write failures.
   *
   * @stability unstable
   * @since 4.0.0
   */
  override readonly message = `An error occurred during Write`
}

/**
 * Typed error for failures that occur while opening a socket, including
 * unknown open failures and open timeouts.
 *
 * @stability unstable
 * @category errors
 * @since 4.0.0
 */
export class SocketOpenError extends Schema.Error<SocketOpenError>("effect/socket/Socket/SocketOpenError")({
  _tag: Schema.tag("SocketOpenError"),
  kind: Schema.Literals(["Unknown", "Timeout"]),
  cause: Schema.Defect()
}) {
  /**
   * Formats timeout and unknown open failures for display.
   *
   * @stability unstable
   * @since 4.0.0
   */
  override get message() {
    return this.kind === "Timeout"
      ? `timeout waiting for "open"`
      : `An error occurred during Open`
  }
}

/**
 * Typed error for an unsupported or failed in-place TLS upgrade.
 *
 * @stability unstable
 * @category errors
 * @since 4.0.0
 */
export class SocketUpgradeError extends Schema.Error<SocketUpgradeError>(
  "effect/socket/Socket/SocketUpgradeError"
)({
  _tag: Schema.tag("SocketUpgradeError"),
  cause: Schema.optional(Schema.Defect())
}) {
  /**
   * An upgrade implementation for transports that cannot wrap the connection
   * with TLS.
   *
   * @stability unstable
   * @since 4.0.0
   */
  static readonly unsupported: Reader["upgrade"] = () =>
    Effect.fail(new SocketError({ reason: new SocketUpgradeError({}) }))

  override get message() {
    return this.cause === undefined
      ? `Socket does not support TLS upgrade`
      : `An error occurred during TLS upgrade`
  }
}

/**
 * Typed error for a socket close, carrying the close code and optional close
 * reason.
 *
 * **Details**
 *
 * Sockets never classify closes: any close, whatever the code, fails the
 * reader with a `SocketError` wrapping this reason. Consumers that treat a
 * close as normal catch it.
 *
 * @stability unstable
 * @category errors
 * @since 4.0.0
 */
export class SocketCloseError extends Schema.Error<SocketCloseError>("effect/socket/Socket/SocketCloseError")({
  _tag: Schema.tag("SocketCloseError"),
  code: Schema.Int,
  closeReason: Schema.optional(Schema.String)
}) {
  override get message() {
    if (this.closeReason) {
      return `${this.code}: ${this.closeReason}`
    }
    return `${this.code}`
  }
}

/**
 * Schema for all socket-specific error reasons.
 *
 * @stability unstable
 * @category errors
 * @since 4.0.0
 */
export const SocketErrorReason = Schema.Union([
  SocketReadError,
  SocketWriteError,
  SocketOpenError,
  SocketUpgradeError,
  SocketCloseError
])

/**
 * Union of socket-specific read, write, open, upgrade, and close error reasons.
 *
 * @stability unstable
 * @category errors
 * @since 4.0.0
 */
export type SocketErrorReason =
  | SocketReadError
  | SocketWriteError
  | SocketOpenError
  | SocketUpgradeError
  | SocketCloseError

/**
 * Tagged error that wraps socket read, write, open, upgrade, and close failures
 * while preserving the underlying reason.
 *
 * @stability unstable
 * @category errors
 * @since 4.0.0
 */
export class SocketError extends Schema.TaggedError<SocketError>(SocketErrorTypeId)("SocketError", {
  _tag: Schema.tag("SocketError"),
  reason: SocketErrorReason
}) {
  // @effect-diagnostics-next-line overriddenSchemaConstructor:off
  constructor(props: {
    readonly reason: SocketReadError | SocketWriteError | SocketOpenError | SocketUpgradeError | SocketCloseError
  }) {
    if ("cause" in props.reason) {
      super({
        ...props,
        cause: props.reason.cause
      } as any)
    } else {
      super(props)
    }
  }

  /**
   * Marks this value as a socket error wrapper for runtime guards.
   *
   * @stability unstable
   * @since 4.0.0
   */
  readonly [SocketErrorTypeId]: SocketErrorTypeId = SocketErrorTypeId

  /**
   * Returns `true` when the value is a `SocketError`.
   *
   * @stability unstable
   * @since 4.0.0
   */
  static is(u: unknown): u is SocketError {
    return isSocketError(u)
  }

  override readonly message = this.reason.message
}

const closeError = (code: number, closeReason?: string | undefined) =>
  new SocketError({ reason: new SocketCloseError({ code, closeReason }) })

const writeChunk = (
  writer: Writer,
  chunk: NonEmptyReadonlyArray<Uint8Array | string | CloseEvent>
): Effect.Effect<void, SocketError> => {
  for (let i = 0; i < chunk.length; i++) {
    if (isCloseEvent(chunk[i])) {
      return Effect.gen(function*() {
        for (let index = 0; index <= i; index++) {
          yield* writer.write(chunk[index])
        }
      })
    }
  }
  return writer.writeAll(chunk as NonEmptyReadonlyArray<Uint8Array | string>)
}

const toChannelWithReader = <A extends Uint8Array | string, IE>(
  self: Socket,
  reader: Effect.Effect<
    Effect.Effect<NonEmptyReadonlyArray<A>, SocketError>,
    SocketError,
    Scope.Scope
  >
): Channel.Channel<
  NonEmptyReadonlyArray<A>,
  SocketError | IE,
  void,
  NonEmptyReadonlyArray<Uint8Array | string | CloseEvent>,
  IE
> =>
  Channel.fromTransform(Effect.fnUntraced(function*(upstream, scope) {
    const readScope = yield* Scope.fork(scope)
    const pull = yield* Scope.provide(reader, readScope)
    const writeScope = yield* Scope.fork(scope)
    const writer = yield* Scope.provide(self.writer, writeScope)

    let writeFailure: Cause.Cause<SocketError | IE> | undefined

    yield* upstream.pipe(
      Effect.flatMap((chunk) => writeChunk(writer, chunk)),
      Effect.forever({ disableYield: true }),
      Effect.catchCauseFilter(
        Pull.filterNoDone,
        (cause) =>
          Effect.suspend(() => {
            writeFailure = cause as Cause.Cause<SocketError | IE>
            // closing the read scope fails a suspended pull, which is the
            // reader contract, so the read side needs no per-pull failure race
            return Scope.close(readScope, Exit.void)
          })
      ),
      Effect.ensuring(Scope.close(writeScope, Exit.void)),
      Effect.forkIn(scope)
    )

    // @effect-diagnostics-next-line returnEffectInGen:off
    return Effect.catchCause(
      Effect.suspend(
        (): Pull.Pull<NonEmptyReadonlyArray<A>, SocketError | IE> =>
          writeFailure !== undefined ? Effect.failCause(writeFailure) : pull
      ),
      (cause) =>
        Effect.failCause(
          (writeFailure ?? cause) as Cause.Cause<SocketError | IE | Cause.Done<void>>
        )
    )
  }))

/**
 * Converts a `Socket` into a bidirectional binary `Channel`, encoding
 * incoming string frames as UTF-8 bytes and writing outgoing frame batches to
 * the socket.
 *
 * **Details**
 *
 * The read side is the socket's pull, so the channel is backpressured
 * end-to-end.
 *
 * @stability unstable
 * @category combinators
 * @since 4.0.0
 */
export const toChannel = <IE = never>(
  self: Socket
): Channel.Channel<
  NonEmptyReadonlyArray<Uint8Array>,
  SocketError | IE,
  void,
  NonEmptyReadonlyArray<Uint8Array | string | CloseEvent>,
  IE
> => toChannelWithReader<Uint8Array, IE>(self, readerBytes(self))

/**
 * Converts a `Socket` into a bidirectional string `Channel`, decoding binary
 * frames with the optional text encoding.
 *
 * @stability unstable
 * @category combinators
 * @since 4.0.0
 */
export const toChannelString: {
  (encoding?: string | undefined): <IE>(self: Socket) => Channel.Channel<
    NonEmptyReadonlyArray<string>,
    SocketError | IE,
    void,
    NonEmptyReadonlyArray<Uint8Array | string | CloseEvent>,
    IE
  >
  <IE>(
    self: Socket,
    encoding?: string | undefined
  ): Channel.Channel<
    NonEmptyReadonlyArray<string>,
    SocketError | IE,
    void,
    NonEmptyReadonlyArray<Uint8Array | string | CloseEvent>,
    IE
  >
} = dual((args) => isSocket(args[0]), <IE>(
  self: Socket,
  encoding?: string | undefined
): Channel.Channel<
  NonEmptyReadonlyArray<string>,
  SocketError | IE,
  void,
  NonEmptyReadonlyArray<Uint8Array | string | CloseEvent>,
  IE
> => toChannelWithReader<string, IE>(self, readerString(self, encoding)))

/**
 * Creates a `Socket` to binary `Channel` adapter with a fixed upstream error
 * type.
 *
 * @stability unstable
 * @category combinators
 * @since 4.0.0
 */
export const toChannelWith = <IE = never>() =>
(
  self: Socket
): Channel.Channel<
  NonEmptyReadonlyArray<Uint8Array>,
  SocketError | IE,
  void,
  NonEmptyReadonlyArray<Uint8Array | string | CloseEvent>,
  IE
> => toChannel(self)

/**
 * Converts a `Socket` into a read-only binary `Stream` backed by the socket's
 * pull, so consumption is backpressured end-to-end.
 *
 * @stability unstable
 * @category combinators
 * @since 4.0.0
 */
export const toStream = (self: Socket): Stream.Stream<Uint8Array, SocketError> =>
  Stream.fromChannel(
    Channel.fromTransform((_, scope) => Scope.provide(readerBytes(self), scope))
  )

/**
 * Creates a binary socket `Channel` from the `Socket` service in the
 * environment.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const makeChannel = <IE = never>(): Channel.Channel<
  NonEmptyReadonlyArray<Uint8Array>,
  SocketError | IE,
  void,
  NonEmptyReadonlyArray<Uint8Array | string | CloseEvent>,
  IE,
  unknown,
  Socket
> => Channel.unwrap(Effect.map(Socket, toChannelWith<IE>()))

/**
 * Event payload exposed by a WebSocket implementation.
 *
 * **Details**
 *
 * The socket adapter only reads `data`, `code`, and `reason`; implementations
 * may expose additional fields.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface WebSocketEvent {
  readonly type?: string
  readonly data?: unknown
  readonly code?: number
  readonly reason?: string
}

/**
 * The subset of the WebSocket API required by `Socket`.
 *
 * **Details**
 *
 * This structural interface is intentionally independent of the DOM
 * `WebSocket` type. Node implementations such as `ws` expose the same
 * event-target methods, but are not assignable to `globalThis.WebSocket`
 * because their event payload types are runtime-specific.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface WebSocketLike {
  readonly readyState: number
  addEventListener(
    type: "open" | "message" | "error" | "close",
    listener: (event: WebSocketEvent) => void,
    options?: {
      readonly once?: boolean
    }
  ): void
  removeEventListener(
    type: "open" | "message" | "error" | "close",
    listener: (event: WebSocketEvent) => void
  ): void
  close(code?: number, reason?: string): void
  send(data: string | Uint8Array<ArrayBuffer>): void
}

/**
 * Common options understood by a WebSocket client implementation.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface WebSocketClientOptions {
  /**
   * Headers to include in the opening handshake.
   *
   * **Details**
   *
   * This is supported by Node and Bun WebSocket clients. Browser constructors
   * cannot set arbitrary handshake headers and must reject this option.
   */
  readonly headers?: Readonly<Record<string, string>> | undefined
}

/**
 * Options accepted by a `WebSocketConstructor`.
 *
 * **Details**
 *
 * Browser-compatible constructors accept a protocol string or list. Node and
 * Bun constructors additionally accept `WebSocketClientOptions`.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type WebSocketConstructorOptions = string | Array<string> | WebSocketClientOptions

/**
 * Context service for the active `WebSocket` instance.
 *
 * @stability unstable
 * @category services
 * @since 4.0.0
 */
export class WebSocket extends Context.Service<WebSocket, WebSocketLike>()(
  "~effect/socket/Socket/WebSocket"
) {}

/**
 * Context service for constructing `WebSocket` instances from a URL and
 * optional protocols or platform-specific options.
 *
 * @stability unstable
 * @category services
 * @since 4.0.0
 */
export class WebSocketConstructor extends Context.Service<
  WebSocketConstructor,
  (url: string, options?: WebSocketConstructorOptions | undefined) => WebSocketLike
>()("@effect/platform/Socket/WebSocketConstructor") {}

/**
 * Layer that provides `WebSocketConstructor` using `globalThis.WebSocket`.
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const layerWebSocketConstructorGlobal: Layer.Layer<WebSocketConstructor> = Layer.succeed(WebSocketConstructor)(
  (url, options) => {
    if (options !== undefined && typeof options !== "string" && !Array.isArray(options)) {
      throw new TypeError("WebSocket client options are not supported by the global WebSocket constructor")
    }
    return new globalThis.WebSocket(url, options)
  }
)

/**
 * Creates a `Socket` backed by a `WebSocketConstructor`, dialing the
 * WebSocket for each reader acquisition.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const makeWebSocket = (url: string | Effect.Effect<string>, options?: {
  readonly openTimeout?: Duration.Input | undefined
  readonly protocols?: string | Array<string> | undefined
  readonly highWaterMark?: number | undefined
}): Effect.Effect<Socket, never, WebSocketConstructor> =>
  WebSocketConstructor.use((makeWs) =>
    fromWebSocket(
      Effect.acquireRelease(
        (typeof url === "string" ? Effect.succeed(url) : url).pipe(
          Effect.map((url) => makeWs(url, options?.protocols))
        ),
        (ws) => Effect.sync(() => ws.close(1000))
      ),
      options
    )
  )

interface Pausable {
  pause(): void
  resume(): void
}

const isPausable = (ws: WebSocketLike): ws is WebSocketLike & Pausable =>
  "pause" in ws && typeof (ws as any).pause === "function"

/**
 * Builds a `Socket` from a scoped WebSocket acquisition effect.
 *
 * **Details**
 *
 * Reader acquisition runs `acquire`, attaches event listeners, then waits for
 * the socket to open. Implementations exposing `pause`/`resume` (the `ws`
 * package) remain flowing until buffered frames reach the configured
 * `highWaterMark` (64 KiB by default). Draining the buffer resumes the
 * transport. Incoming frames that arrive in the same tick are coalesced into
 * one batch. Implementations without pause (browsers) buffer incoming frames,
 * optionally failing the socket with a `SocketReadError` when `highWaterMark`
 * bytes are exceeded (default unbounded). Message boundaries survive: each
 * pulled batch contains one element per frame.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const fromWebSocket = <RO, WS extends WebSocketLike>(
  acquire: Effect.Effect<WS, SocketError, RO>,
  options?: {
    readonly openTimeout?: Duration.Input | undefined
    readonly highWaterMark?: number | undefined
  } | undefined
): Effect.Effect<Socket, never, Exclude<RO, Scope.Scope>> =>
  Effect.withFiber((fiber) => {
    let currentWS: WebSocketLike | undefined
    const latch = Latch.makeUnsafe(false)
    const acquireContext = fiber.context as Context.Context<RO>

    const reader: Socket["reader"] = Effect.gen(function*() {
      const scope = yield* Effect.scope
      const ws = yield* Scope.provide(acquire, scope)
      if ("binaryType" in ws) {
        ;(ws as { binaryType: string }).binaryType = "arraybuffer"
      }
      const pausable = isPausable(ws)
      const highWaterMark = options?.highWaterMark ?? (pausable ? defaultHighWaterMark : undefined)

      type ReadResume = (
        effect: Effect.Effect<NonEmptyReadonlyArray<Uint8Array | string>, SocketError>
      ) => void

      let open = ws.readyState === 1
      let paused = pausable && "isPaused" in ws && ws.isPaused === true
      let buffer: Array<Uint8Array | string> = []
      let bufferSize = 0
      let error: SocketError | undefined
      let waiter: ReadResume | undefined
      let openWaiter:
        | {
          readonly resume: (effect: Effect.Effect<void, SocketError>) => void
          readonly cleanup: () => void
        }
        | undefined

      function pauseWebSocket() {
        if (!pausable || paused) return
        ws.pause()
        paused = true
      }

      function resumeWebSocket() {
        if (!pausable || !paused) return
        ws.resume()
        paused = false
      }

      function takeBuffer(): NonEmptyReadonlyArray<Uint8Array | string> {
        const chunk = buffer
        buffer = []
        bufferSize = 0
        if (error === undefined) resumeWebSocket()
        return chunk as unknown as NonEmptyReadonlyArray<Uint8Array | string>
      }

      function deliver() {
        if (waiter === undefined || buffer.length === 0) return
        const resume = waiter
        waiter = undefined
        resume(Effect.succeed(takeBuffer()))
      }

      function push(data: Uint8Array | string) {
        buffer.push(data)
        if (highWaterMark !== undefined) {
          bufferSize += typeof data === "string" ? encoder.encode(data).byteLength : data.byteLength
        }
        if (waiter !== undefined) deliver()
        if (pausable && bufferSize >= highWaterMark!) {
          pauseWebSocket()
        } else if (!pausable && !waiter && highWaterMark !== undefined && bufferSize > highWaterMark) {
          fail(
            new SocketError({
              reason: new SocketReadError({
                cause: new Error(`Socket highWaterMark of ${highWaterMark} bytes exceeded`)
              })
            })
          )
        }
      }

      function fail(err: SocketError) {
        if (error === undefined) error = err
        if (openWaiter !== undefined) {
          const { cleanup, resume } = openWaiter
          openWaiter = undefined
          cleanup()
          resume(Effect.fail(error))
        }
        if (waiter !== undefined) {
          const resume = waiter
          waiter = undefined
          resume(buffer.length > 0 ? Effect.succeed(takeBuffer()) : Effect.fail(error))
        }
      }

      function onMessage(event: WebSocketEvent) {
        const data = event.data as Uint8Array | ArrayBuffer | Blob | string
        if (typeof Blob !== "undefined" && data instanceof Blob) {
          data.arrayBuffer().then((buf) => push(new Uint8Array(buf)), (cause) => {
            fail(new SocketError({ reason: new SocketReadError({ cause }) }))
          })
          return
        }
        push(data instanceof ArrayBuffer ? new Uint8Array(data) : data as Uint8Array | string)
      }
      function onError(event: WebSocketEvent) {
        fail(
          new SocketError({
            reason: open
              ? new SocketReadError({ cause: event })
              : new SocketOpenError({ kind: "Unknown", cause: event })
          })
        )
      }
      function onClose(event: WebSocketEvent) {
        fail(closeError(typeof event.code === "number" ? event.code : 1006, event.reason))
      }

      ws.addEventListener("message", onMessage)
      ws.addEventListener("error", onError, { once: true })
      ws.addEventListener("close", onClose, { once: true })
      yield* Scope.addFinalizer(
        scope,
        Effect.sync(() => {
          // resume a pull blocked in another fiber before detaching
          fail(closeError(1006))
          ws.removeEventListener("message", onMessage)
          ws.removeEventListener("error", onError)
          ws.removeEventListener("close", onClose)
          // let the close handshake proceed once nothing is pulling
          if (pausable) {
            try {
              resumeWebSocket()
            } catch {
              // the underlying stream may already be gone
            }
          }
          latch.closeUnsafe()
          currentWS = undefined
        })
      )

      if (ws.readyState >= 2) {
        // @effect-diagnostics-next-line unnecessaryFailYieldableError:off
        return yield* Effect.fail(error ?? closeError(1006))
      }

      if (!open) {
        yield* Effect.callback<void, SocketError>((resume) => {
          const onOpen = () => {
            if (openWaiter?.resume !== resume) return
            openWaiter = undefined
            ws.removeEventListener("open", onOpen)
            resume(Effect.void)
          }
          const cleanup = () => ws.removeEventListener("open", onOpen)
          openWaiter = { resume, cleanup }
          ws.addEventListener("open", onOpen, { once: true })
          return Effect.sync(() => {
            if (openWaiter?.resume === resume) openWaiter = undefined
            cleanup()
          })
        }).pipe(
          Effect.timeoutOrElse({
            duration: options?.openTimeout ?? 10000,
            orElse: () =>
              Effect.fail(
                new SocketError({
                  reason: new SocketOpenError({
                    kind: "Timeout",
                    cause: new Error("timeout waiting for \"open\"")
                  })
                })
              )
          })
        )
        open = true
      }

      if (error === undefined && bufferSize < highWaterMark!) resumeWebSocket()
      currentWS = ws
      latch.openUnsafe()

      return {
        pull: Effect.callback<NonEmptyReadonlyArray<Uint8Array | string>, SocketError>((resume) => {
          if (buffer.length > 0) return resume(Effect.succeed(takeBuffer()))
          if (error !== undefined) return resume(Effect.fail(error))
          waiter = resume
          return Effect.sync(() => {
            if (waiter === resume) waiter = undefined
          })
        }),
        upgrade: SocketUpgradeError.unsupported
      }
    }).pipe(
      Effect.updateContext((input: Context.Context<Scope.Scope>) => Context.merge(acquireContext, input))
    ) as Socket["reader"]

    const write = (chunk: Uint8Array | string | CloseEvent): Effect.Effect<void, SocketError> =>
      Effect.suspend(() => {
        const ws = currentWS
        if (ws === undefined) return latch.whenOpen(write(chunk))
        try {
          if (isCloseEvent(chunk)) {
            ws.close(chunk.code, chunk.reason)
          } else {
            ws.send(chunk as string | Uint8Array<ArrayBuffer>)
          }
          return Effect.void
        } catch (cause) {
          return Effect.fail(new SocketError({ reason: new SocketWriteError({ cause }) }))
        }
      })
    const writeAll = (
      chunks: NonEmptyReadonlyArray<Uint8Array | string>
    ): Effect.Effect<void, SocketError> =>
      Effect.suspend(() => {
        const ws = currentWS
        if (ws === undefined) return latch.whenOpen(writeAll(chunks))
        try {
          for (let i = 0; i < chunks.length; i++) {
            ws.send(chunks[i] as string | Uint8Array<ArrayBuffer>)
          }
          return Effect.void
        } catch (cause) {
          return Effect.fail(new SocketError({ reason: new SocketWriteError({ cause }) }))
        }
      })
    const writer: Socket["writer"] = Effect.succeed({ write, writeAll })

    return Effect.succeed(make({ reader, writer }))
  })

const defaultHighWaterMark = 64 * 1024

/**
 * Creates a binary `Channel` backed by a WebSocket URL, requiring a
 * `WebSocketConstructor` service.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const makeWebSocketChannel = <IE = never>(
  url: string,
  options?: {
    readonly openTimeout?: Duration.Input | undefined
    readonly protocols?: string | Array<string> | undefined
    readonly highWaterMark?: number | undefined
  }
): Channel.Channel<
  NonEmptyReadonlyArray<Uint8Array>,
  SocketError | IE,
  void,
  NonEmptyReadonlyArray<Uint8Array | string | CloseEvent>,
  IE,
  unknown,
  WebSocketConstructor
> =>
  Channel.unwrap(
    Effect.map(makeWebSocket(url, options), toChannelWith<IE>())
  )

/**
 * Layer that provides a `Socket` service backed by a WebSocket URL or URL
 * effect.
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const layerWebSocket: (
  url: string | Effect.Effect<string>,
  options?: {
    readonly openTimeout?: Duration.Input | undefined
    readonly protocols?: string | Array<string> | undefined
    readonly highWaterMark?: number | undefined
  } | undefined
) => Layer.Layer<Socket, never, WebSocketConstructor> = flow(makeWebSocket, Layer.effect(Socket))

/**
 * Readable and writable stream pair used to adapt transform-style streams into
 * a `Socket`.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface InputTransformStream {
  readonly readable: ReadableStream<Uint8Array> | ReadableStream<string> | ReadableStream<Uint8Array | string>
  readonly writable: WritableStream<Uint8Array>
}

/**
 * Builds a `Socket` from a scoped `InputTransformStream`, pulling incoming
 * chunks from the readable side and writing outgoing chunks to the writable
 * stream, encoding strings as UTF-8.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const fromTransformStream = <R>(
  acquire: Effect.Effect<InputTransformStream, SocketError, R>
): Effect.Effect<Socket, never, Exclude<R, Scope.Scope>> =>
  Effect.withFiber((fiber) => {
    const latch = Latch.makeUnsafe(false)
    let currentStream: {
      readonly stream: InputTransformStream
      readonly fail: (error: SocketError) => void
    } | undefined
    const acquireContext = fiber.context as Context.Context<R>

    const writers = new WeakMap<InputTransformStream, WritableStreamDefaultWriter<Uint8Array>>()
    const getWriter = (stream: InputTransformStream) => {
      let writer = writers.get(stream)
      if (!writer) {
        writer = stream.writable.getWriter()
        writers.set(stream, writer)
      }
      return writer
    }

    const reader: Socket["reader"] = Effect.gen(function*() {
      const scope = yield* Effect.scope
      const stream = yield* Scope.provide(acquire, scope)
      const readerHandle = (stream.readable as ReadableStream<Uint8Array | string>).getReader()
      let error: SocketError | undefined
      yield* Scope.addFinalizer(
        scope,
        Effect.suspend(() => {
          latch.closeUnsafe()
          currentStream = undefined
          return Effect.promise(() => readerHandle.cancel().catch(constVoid))
        })
      )
      currentStream = {
        stream,
        fail(err) {
          if (error === undefined) error = err
          readerHandle.cancel().catch(constVoid)
        }
      }
      latch.openUnsafe()

      const read = Effect.tryPromise({
        try: () => readerHandle.read(),
        catch: (cause) =>
          error ?? new SocketError({
            reason: new SocketReadError({ cause })
          })
      })
      return {
        pull: Effect.suspend(() => {
          if (error !== undefined) return Effect.fail(error)
          return Effect.flatMap(read, ({ done, value }) =>
            done
              ? Effect.fail(error ?? closeError(1000))
              : Effect.succeed([value] as unknown as NonEmptyReadonlyArray<Uint8Array | string>))
        }),
        upgrade: SocketUpgradeError.unsupported
      }
    }).pipe(
      Effect.updateContext((input: Context.Context<Scope.Scope>) => Context.merge(acquireContext, input))
    ) as Socket["reader"]

    const write = (chunk: Uint8Array | string | CloseEvent) =>
      latch.whenOpen(Effect.suspend(() => {
        const current = currentStream!
        if (isCloseEvent(chunk)) {
          return Effect.sync(() => {
            current.fail(closeError(chunk.code, chunk.reason))
          })
        }
        return Effect.tryPromise({
          try: () => getWriter(current.stream).write(typeof chunk === "string" ? encoder.encode(chunk) : chunk),
          catch: (cause) => new SocketError({ reason: new SocketWriteError({ cause }) })
        })
      }))
    const writeAll = (chunks: NonEmptyReadonlyArray<Uint8Array | string>) =>
      latch.whenOpen(Effect.tryPromise({
        try: async () => {
          const writer = getWriter(currentStream!.stream)
          for (let i = 0; i < chunks.length; i++) {
            const chunk = chunks[i]
            await writer.write(typeof chunk === "string" ? encoder.encode(chunk) : chunk)
          }
        },
        catch: (cause) => new SocketError({ reason: new SocketWriteError({ cause }) })
      }))
    const writer: Socket["writer"] = Effect.acquireRelease(
      Effect.succeed({ write, writeAll }),
      () =>
        Effect.promise(async () => {
          if (!currentStream) return
          await getWriter(currentStream.stream).close().catch(constVoid)
        })
    )

    return Effect.succeed(make({ reader, writer }))
  })
