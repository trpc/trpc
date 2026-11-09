/**
 * Pull-based UDP sockets with scoped native handles.
 *
 * Acquiring a reader opens and binds a socket owned by its scope. Only one
 * reader is open at a time; another acquisition waits interruptibly for it to
 * close. Use `Effect.retry` around a scoped consume loop to open a new socket
 * on each retry.
 *
 * Writes wait while no reader is open, so a send-only client must still
 * acquire a reader.
 *
 * **Example** (Portable request/reply client)
 *
 * ```ts import.meta.vitest
 * import { Effect } from "effect"
 * import { NetAddress } from "effect/net"
 * import { DatagramSocket } from "effect/socket"
 *
 * const server = NetAddress.inetAddressFromIpStringUnsafe("127.0.0.1", 5353)
 *
 * export const request = (payload: string) =>
 *   Effect.gen(function*() {
 *     const socket = yield* DatagramSocket.DatagramSocket
 *     const reader = yield* socket.reader
 *     const writer = yield* socket.writer
 *     yield* writer.write({ payload, address: server })
 *     const [response] = yield* reader.pull
 *     return response.payload
 *   }).pipe(Effect.scoped)
 * ```
 *
 * @stability experimental
 * @since 4.0.0
 */
import type { NonEmptyReadonlyArray } from "../Array.ts"
import * as Context from "../Context.ts"
import * as Effect from "../Effect.ts"
import * as Fiber from "../Fiber.ts"
import { constVoid } from "../Function.ts"
import { args, contA, contAll, exitSucceed, makePrimitive, type Primitive, withFiber } from "../internal/core.ts"
import type { FiberImpl } from "../internal/effect.ts"
import * as Latch from "../Latch.ts"
import * as NetAddress from "../net/NetAddress.ts"
import * as Predicate from "../Predicate.ts"
import * as Schema from "../Schema.ts"
import * as Scope from "../Scope.ts"

/**
 * Runtime type identifier attached to `DatagramSocket` services.
 *
 * @stability experimental
 * @category type IDs
 * @since 4.0.0
 */
export const TypeId = "~effect/socket/DatagramSocket"

/**
 * Service tag for UDP socket transports.
 *
 * @stability experimental
 * @category services
 * @since 4.0.0
 */
export const DatagramSocket: Context.Service<DatagramSocket, DatagramSocket> = Context.Service<DatagramSocket>(
  "effect/socket/DatagramSocket"
)

/**
 * A UDP socket with a scoped, exclusive reader. Acquiring `reader` opens and
 * binds a native socket; subsequent acquisitions wait for its scope to close.
 * Acquiring `writer` cannot fail, but writes wait for an open reader.
 *
 * @stability experimental
 * @category models
 * @since 4.0.0
 */
export interface DatagramSocket {
  readonly [TypeId]: typeof TypeId
  readonly reader: Effect.Effect<Reader, DatagramSocketError, Scope.Scope>
  readonly writer: Effect.Effect<Writer, never, Scope.Scope>
}

/**
 * A received packet.
 *
 * **Details**
 *
 * The payload is safe to retain. The sender's `address` is parsed on first
 * read and cached.
 *
 * Reply with `writer.write({ payload, address: received })` to reuse the raw
 * sender address without parsing. This requires a datagram from a platform
 * adapter or `makeFromBackingSocket`. For hand-built datagrams or custom
 * readers, use `{ payload, address: received.address }`.
 *
 * @stability experimental
 * @category models
 * @since 4.0.0
 */
export interface Datagram {
  readonly payload: Uint8Array
  readonly address: NetAddress.InetAddress
}

/**
 * A packet to send.
 *
 * **Details**
 *
 * String payloads are encoded as UTF-8. `address` can be omitted when the
 * socket has a `peer` or is connected. On a connected socket an explicit
 * `InetAddress` fails the write, while a received `Datagram` is allowed and
 * goes out on the connected path.
 *
 * Pass a received `Datagram` as the destination to reply, or as the whole
 * argument to echo it. Both reuse the raw sender address and require a
 * datagram from a platform adapter or `makeFromBackingSocket`. Hand-built
 * datagrams and custom readers must pass an explicit `InetAddress` instead.
 *
 * @stability experimental
 * @category models
 * @since 4.0.0
 */
export interface OutgoingDatagram {
  readonly payload: Uint8Array | string
  readonly address?: NetAddress.InetAddress | Datagram | undefined
}

/**
 * The receive side of an open native socket.
 *
 * **Details**
 *
 * `pull` returns everything queued since the last pull, or waits for the next
 * packet. After a terminal error, `pull` first returns the queued packets and
 * then fails with the same error until the reader's scope closes. Closing the
 * scope discards the queue and fails every waiting `pull` with
 * `DatagramSocketClosedError`.
 *
 * Concurrent pulls wait in FIFO order. Each incoming packet goes to the
 * oldest waiter; a terminal error fails all waiters.
 *
 * `address` is the bound local address, parsed on first read and cached.
 *
 * `dropped` counts receive-buffer overflow since this reader opened, not
 * kernel or network loss or packets discarded on scope close.
 *
 * `joinMulticast` joins a group until its scope closes; leave failures are
 * ignored. Its `interface` selects where packets arrive (ingress), not the
 * platform's `multicast.interface` for sending (egress).
 *
 * @stability experimental
 * @category models
 * @since 4.0.0
 */
export interface Reader {
  readonly pull: Effect.Effect<NonEmptyReadonlyArray<Datagram>, DatagramSocketError>
  readonly address: NetAddress.InetAddress
  readonly dropped: () => number
  readonly joinMulticast: <A extends NetAddress.IpAddress>(options: {
    readonly group: NetAddress.MulticastAddress<A>
    readonly interface?: NetAddress.MulticastInterface<A> | undefined
    readonly source?: A | undefined
  }) => Effect.Effect<void, DatagramSocketError, Scope.Scope>
}

/**
 * The send side of a `DatagramSocket`. Writes wait until a reader is open, so
 * a send-only client must still acquire a reader.
 *
 * **Details**
 *
 * A write completes when the runtime reports the send's result, and send
 * errors fail it with a `DatagramSocketWriteError` carrying the destination
 * `address`. After a terminal reader error, writes fail with that error until
 * the reader's scope closes, and then wait for the next reader.
 *
 * `writeAll` fails with the first error, without resending. Partial delivery is
 * unspecified. The error has no packet index, and its `address` is absent on Bun.
 *
 * There is no built-in write timeout; use `Effect.timeout`.
 *
 * @stability experimental
 * @category models
 * @since 4.0.0
 */
export interface Writer {
  readonly write: (datagram: OutgoingDatagram) => Effect.Effect<void, DatagramSocketError>
  readonly writeAll: (datagrams: NonEmptyReadonlyArray<OutgoingDatagram>) => Effect.Effect<void, DatagramSocketError>
}

/**
 * Receive queue options.
 *
 * **Details**
 *
 * The queue is bounded in packets, with no byte cap. `capacity` defaults to
 * 1024 and must be a positive safe integer. The worst-case
 * memory is capacity × 64 KiB, about 64 MiB at the default.
 *
 * When the queue is full, `"dropping"` (the default) discards the incoming
 * packet and `"sliding"` discards the oldest queued one. Both count the
 * packet in `Reader.dropped`.
 *
 * @stability experimental
 * @category models
 * @since 4.0.0
 */
export interface ReceiveBufferOptions {
  readonly capacity?: number | undefined
  readonly strategy?: "dropping" | "sliding" | undefined
}

/**
 * Creates a `DatagramSocket` from its `reader` and `writer` effects.
 *
 * @stability experimental
 * @category constructors
 * @since 4.0.0
 */
export const make = (options: {
  readonly reader: DatagramSocket["reader"]
  readonly writer: DatagramSocket["writer"]
}): DatagramSocket =>
  DatagramSocket.of({
    [TypeId]: TypeId,
    reader: options.reader,
    writer: options.writer
  })

/**
 * A native host and port, parsed on demand.
 *
 * @stability experimental
 * @category models
 * @since 4.0.0
 */
export interface BackingAddress {
  readonly host: string
  readonly port: number
}

/**
 * Native transport contract used by platform adapters.
 *
 * **Details**
 *
 * `address` is the raw bound address, read once at open. `scopeIds` maps IPv6
 * zone names to scope IDs, for parsing named zones and formatting
 * destinations. `peer` is the default destination, and `connected` marks a
 * natively connected socket, whose sends receive no destination.
 *
 * `send` and `sendMany` hand datagrams to the runtime and call `done` exactly
 * once, synchronously or later, when the runtime reports the result. They must
 * not throw. `sendMany` passes the index of the failing datagram to `done`
 * when the runtime knows it, so core can attach its address.
 *
 * Adapters normalize native errors before passing them to core.
 * Read destination `host` and `port` during the call; do not retain the record.
 *
 * `close` must not throw.
 *
 * @stability experimental
 * @category models
 * @since 4.0.0
 */
export interface BackingSocket {
  readonly address: BackingAddress
  readonly scopeIds?: ReadonlyMap<string, number> | undefined
  readonly peer?: BackingAddress | undefined
  readonly connected?: boolean | undefined
  readonly send: (
    payload: Uint8Array,
    destination: BackingAddress | undefined,
    done: (error?: DatagramSocketError) => void
  ) => void
  readonly sendMany: (
    payloads: ReadonlyArray<Uint8Array>,
    destinations: ReadonlyArray<BackingAddress | undefined>,
    done: (error?: DatagramSocketError, index?: number) => void
  ) => void
  readonly joinMulticast: <A extends NetAddress.IpAddress>(options: {
    readonly group: NetAddress.MulticastAddress<A>
    readonly interface?: NetAddress.MulticastInterface<A> | undefined
    readonly source?: A | undefined
  }) => Effect.Effect<() => Effect.Effect<void, never>, DatagramSocketError>
  readonly close: () => void
}

/**
 * Callbacks installed before opening the backing socket; packets may arrive
 * synchronously.
 *
 * **Details**
 *
 * `onPacket` queues a received packet. `onReadError` is a terminal receive
 * error and `onClose` reports the native socket closing underneath the
 * reader; both are sticky. `onError` forwards errors with no write left to
 * fail, such as ICMP reports, to the user's `onError` option.
 *
 * Each callback can be passed on its own, for example as a runtime's event
 * listener.
 *
 * @stability experimental
 * @category models
 * @since 4.0.0
 */
export interface BackingEvents {
  readonly onPacket: (payload: Uint8Array, host: string, port: number) => void
  readonly onReadError: (error: DatagramSocketError) => void
  readonly onError: (error: DatagramSocketError) => void
  readonly onClose: () => void
}

/**
 * The normalized kind of a send or receive failure.
 *
 * @stability experimental
 * @category errors
 * @since 4.0.0
 */
export type IoErrorKind = "MessageTooLarge" | "Unreachable" | "ConnectionRefused" | "PermissionDenied" | "Unknown"

/**
 * Opening or binding the native socket, applying its options, or resolving
 * a name failed.
 *
 * @stability experimental
 * @category errors
 * @since 4.0.0
 */
export class DatagramSocketOpenError
  extends Schema.Error<DatagramSocketOpenError>("effect/socket/DatagramSocket/OpenError")({
    _tag: Schema.tag("DatagramSocketOpenError"),
    kind: Schema.Literals(["AddressInUse", "AddressNotAvailable", "PermissionDenied", "Unknown"]),
    cause: Schema.Defect()
  })
{}

/**
 * A receive failed, or an ICMP report arrived with no write left to fail.
 *
 * @stability experimental
 * @category errors
 * @since 4.0.0
 */
export class DatagramSocketReadError
  extends Schema.Error<DatagramSocketReadError>("effect/socket/DatagramSocket/ReadError")({
    _tag: Schema.tag("DatagramSocketReadError"),
    kind: Schema.Literals(["MessageTooLarge", "Unreachable", "ConnectionRefused", "PermissionDenied", "Unknown"]),
    cause: Schema.Defect()
  })
{}

/**
 * A send failed. `address` is the destination when it is known.
 *
 * @stability experimental
 * @category errors
 * @since 4.0.0
 */
export class DatagramSocketWriteError
  extends Schema.Error<DatagramSocketWriteError>("effect/socket/DatagramSocket/WriteError")({
    _tag: Schema.tag("DatagramSocketWriteError"),
    kind: Schema.Literals(["MessageTooLarge", "Unreachable", "ConnectionRefused", "PermissionDenied", "Unknown"]),
    address: Schema.optional(Schema.InetAddress),
    cause: Schema.Defect()
  })
{}

/**
 * The native socket closed underneath the reader, or the reader's scope
 * closed.
 *
 * @stability experimental
 * @category errors
 * @since 4.0.0
 */
export class DatagramSocketClosedError
  extends Schema.Error<DatagramSocketClosedError>("effect/socket/DatagramSocket/ClosedError")({
    _tag: Schema.tag("DatagramSocketClosedError")
  })
{}

/**
 * The runtime lacks a capability, such as source-specific multicast on Deno.
 *
 * @stability experimental
 * @category errors
 * @since 4.0.0
 */
export class DatagramSocketUnsupportedError
  extends Schema.Error<DatagramSocketUnsupportedError>("effect/socket/DatagramSocket/UnsupportedError")({
    _tag: Schema.tag("DatagramSocketUnsupportedError"),
    capability: Schema.String,
    runtime: Schema.String
  })
{
  /**
   * Names the runtime and the capability it lacks.
   *
   * @stability experimental
   * @since 4.0.0
   */
  override get message() {
    return `${this.runtime} does not support ${this.capability}`
  }
}

/**
 * Schema for the union of `DatagramSocketError` reasons.
 *
 * @stability experimental
 * @category errors
 * @since 4.0.0
 */
export const DatagramSocketErrorReason = Schema.Union([
  DatagramSocketOpenError,
  DatagramSocketReadError,
  DatagramSocketWriteError,
  DatagramSocketClosedError,
  DatagramSocketUnsupportedError
])
/**
 * The union of `DatagramSocketError` reasons.
 *
 * @stability experimental
 * @category errors
 * @since 4.0.0
 */
export type DatagramSocketErrorReason = typeof DatagramSocketErrorReason.Type

/**
 * Runtime type identifier attached to `DatagramSocketError` values.
 *
 * @stability experimental
 * @category errors
 * @since 4.0.0
 */
export const DatagramSocketErrorTypeId = "~effect/socket/DatagramSocket/DatagramSocketError"

/**
 * Returns `true` when a value is a `DatagramSocketError`.
 *
 * @stability experimental
 * @category guards
 * @since 4.0.0
 */
export const isDatagramSocketError = (u: unknown): u is DatagramSocketError =>
  Predicate.hasProperty(u, DatagramSocketErrorTypeId)

/**
 * The error raised by `DatagramSocket` operations, wrapping a specific
 * reason. Its `cause` and `message` come from the reason.
 *
 * @stability experimental
 * @category errors
 * @since 4.0.0
 */
export class DatagramSocketError
  extends Schema.TaggedError<DatagramSocketError>(DatagramSocketErrorTypeId)("DatagramSocketError", {
    _tag: Schema.tag("DatagramSocketError"),
    reason: DatagramSocketErrorReason
  })
{
  // @effect-diagnostics-next-line overriddenSchemaConstructor:off
  constructor(props: { readonly reason: DatagramSocketErrorReason }) {
    if ("cause" in props.reason) {
      super({ ...props, cause: props.reason.cause } as any)
    } else {
      super(props)
    }
  }
  readonly [DatagramSocketErrorTypeId] = DatagramSocketErrorTypeId
  override get message() {
    return this.reason.message
  }
}

/**
 * Builds a `DatagramSocket` over a backing socket, opening a new socket for
 * each reader acquisition.
 *
 * **Details**
 *
 * `open` receives the event callbacks before the handle exists, so packets can
 * be queued while it opens. Core owns the receive queue and its overflow
 * strategy, reader exclusivity, sticky errors, lazy address parsing, the
 * writer latch and destination formatting. The handle is closed when the
 * reader's scope closes. If acquisition is interrupted while `open` is still
 * running, the interruption returns at once, `open` is left to finish, and
 * the handle it produces is closed. The next reader waits until that open has
 * settled, so two native sockets never exist at once. An adopted `acquire`
 * must therefore finish in bounded time.
 *
 * `open` runs in the reader's scope, with the services of the fiber that
 * built the socket, so an adopted `acquire` can use them and register
 * finalizers that run when the reader closes. Where the fiber acquiring the
 * reader has a service with the same tag, its own takes precedence.
 *
 * Concurrent pulls are served in the order they started waiting.
 *
 * `onError` receives errors with no write left to fail. It runs
 * synchronously, and anything it throws is ignored.
 *
 * Invalid `receiveBuffer.capacity` values cause a defect; use a positive
 * safe integer.
 *
 * @stability experimental
 * @category constructors
 * @since 4.0.0
 */
export const makeFromBackingSocket = <R = never>(
  open: (events: BackingEvents) => Effect.Effect<BackingSocket, DatagramSocketError, R>,
  options?: {
    readonly receiveBuffer?: ReceiveBufferOptions | undefined
    readonly onError?: ((error: DatagramSocketError) => void) | undefined
  } | undefined
): Effect.Effect<DatagramSocket, never, Exclude<R, Scope.Scope>> =>
  withFiber((fiber) => {
    const capacity = options?.receiveBuffer?.capacity ?? 1024
    if (!Number.isSafeInteger(capacity) || capacity < 1) {
      throw new RangeError(`DatagramSocket receive buffer capacity must be a positive integer, received ${capacity}`)
    }
    return Effect.succeed(
      makeFromBackingSocketWithContext(
        open,
        fiber.context as Context.Context<R>,
        capacity,
        options?.receiveBuffer?.strategy === "sliding",
        options?.onError
      )
    )
  })

const makeFromBackingSocketWithContext = <R>(
  open: (events: BackingEvents) => Effect.Effect<BackingSocket, DatagramSocketError, R>,
  services: Context.Context<R>,
  capacity: number,
  sliding: boolean,
  onError: ((error: DatagramSocketError) => void) | undefined
): DatagramSocket => {
  const free = Latch.makeUnsafe(true)
  const latch = Latch.makeUnsafe(false)
  let current: ReaderState | undefined

  const abandon = (state: ReaderState, opening: Fiber.Fiber<BackingSocket, DatagramSocketError>) => {
    state.close()
    // Release reader ownership only after the interrupted open settles.
    opening.addObserver((exit) => {
      if (exit._tag === "Success") exit.value.close()
      free.openUnsafe()
    })
  }

  const release = (state: ReaderState) => {
    state.close()
    current = undefined
    latch.closeUnsafe()
    free.openUnsafe()
  }

  const reader: DatagramSocket["reader"] = Effect.uninterruptibleMask(
    Effect.fnUntraced(function*(restore) {
      while (!free.closeUnsafe()) yield* restore(free.await)
      const scope = yield* Effect.scope
      const state = new ReaderState(capacity, sliding, onError)
      // Native opens may be uncancellable. Interrupt only the wait; `abandon`
      // closes any socket returned later.
      const opened = open(state.events).pipe(
        Effect.updateContext((input: Context.Context<never>) =>
          Context.add(Context.merge(services, input), Scope.Scope, scope)
        )
      ) as Effect.Effect<BackingSocket, DatagramSocketError>
      const opening = yield* Effect.forkDetach(opened, { startImmediately: true })
      state.handle = yield* restore(Fiber.join(opening)).pipe(
        Effect.onError(() => Effect.sync(() => abandon(state, opening)))
      )
      current = state
      latch.openUnsafe()
      yield* Effect.addFinalizer(() => Effect.sync(() => release(state)))
      return makeReader(state)
    })
  )

  const write = (datagram: OutgoingDatagram): Effect.Effect<void, DatagramSocketError> =>
    withFiber((fiber) => {
      const state = current
      return state === undefined ? latch.whenOpen(write(datagram)) : state.write(datagram, fiber)
    })
  const writeAll = (datagrams: NonEmptyReadonlyArray<OutgoingDatagram>): Effect.Effect<void, DatagramSocketError> =>
    withFiber((fiber) => {
      const state = current
      return state === undefined ? latch.whenOpen(writeAll(datagrams)) : state.writeAll(datagrams, fiber)
    })
  const writer: DatagramSocket["writer"] = Effect.succeed({ write, writeAll })

  return make({ reader, writer })
}

const encoder = new TextEncoder()
const encode = (payload: Uint8Array | string) => typeof payload === "string" ? encoder.encode(payload) : payload
const emptyScopeIds: ReadonlyMap<string, number> = new Map()

const closedError = () => new DatagramSocketError({ reason: new DatagramSocketClosedError() })

// Rejected writes return this sentinel, avoiding per-packet error type checks.
const rejected: BackingAddress = { host: "", port: 0 }

class DatagramImpl implements Datagram, BackingAddress {
  payload: Uint8Array
  host: string
  port: number
  readonly owner: ReaderState
  #address: NetAddress.InetAddress | undefined
  constructor(payload: Uint8Array, host: string, port: number, owner: ReaderState) {
    this.payload = payload
    this.host = host
    this.port = port
    this.owner = owner
  }
  get address(): NetAddress.InetAddress {
    return this.#address ??= NetAddress.inetAddressFromNativeUnsafe(this.host, this.port, this.owner.scopeIds)
  }
  // only for a queued record, which no pull has returned yet
  reuse(payload: Uint8Array, host: string, port: number) {
    this.payload = payload
    this.host = host
    this.port = port
    this.#address = undefined
  }
}

const targetOf = (datagram: OutgoingDatagram): NetAddress.InetAddress | DatagramImpl | undefined =>
  "host" in datagram ? datagram as DatagramImpl : datagram.address as NetAddress.InetAddress | DatagramImpl | undefined

class ReaderState {
  readonly capacity: number
  readonly sliding: boolean
  readonly listener: ((error: DatagramSocketError) => void) | undefined
  readonly events: BackingEvents = {
    onPacket: (payload, host, port) => this.push(payload, host, port),
    onReadError: (error) => this.fail(error),
    onError: (error) => this.report(error),
    onClose: () => this.fail(closedError())
  }

  // set when `open` completes; packets can arrive before that
  handle: BackingSocket | undefined = undefined
  failure: Effect.Effect<never, DatagramSocketError> | undefined = undefined
  // separate from `failure`: after a sticky read error the socket is still
  // open, so ICMP reports still reach `onError`
  closed = false

  // Sliding overflow turns the full buffer into a ring, oldest at `head`.
  buffer: Array<DatagramImpl> = []
  head = 0
  dropped = 0

  // A single consumer uses the first waiter slot without touching the array.
  waiter: FiberImpl | undefined = undefined
  waiters: Array<FiberImpl> = []
  readonly unpark: Primitive = unpark(this)

  bound: NetAddress.InetAddress | undefined = undefined
  // one-entry cache for `write` to the same explicit address
  lastTarget: NetAddress.InetAddress | undefined = undefined
  lastDestination: BackingAddress | undefined = undefined
  rejection: DatagramSocketError | undefined = undefined

  constructor(capacity: number, sliding: boolean, listener: ((error: DatagramSocketError) => void) | undefined) {
    this.capacity = capacity
    this.sliding = sliding
    this.listener = listener
  }

  push(payload: Uint8Array, host: string, port: number) {
    if (this.failure !== undefined) return
    if (this.buffer.length >= this.capacity) return this.overflow(payload, host, port)
    const datagram = new DatagramImpl(payload, host, port, this)
    if (this.waiter !== undefined) return this.wake(datagram)
    const buffer = this.buffer
    buffer[buffer.length] = datagram
  }

  wake(datagram: DatagramImpl) {
    const fiber = this.waiter!
    this.promoteWaiter()
    fiber.evaluate(exitSucceed([datagram]) as any)
  }

  overflow(payload: Uint8Array, host: string, port: number) {
    this.dropped++
    if (!this.sliding) return
    const buffer = this.buffer
    const head = this.head
    buffer[head].reuse(payload, host, port)
    this.head = head + 1 === buffer.length ? 0 : head + 1
  }

  take(): NonEmptyReadonlyArray<Datagram> {
    const buffer = this.buffer
    const head = this.head
    this.buffer = []
    if (head === 0) return buffer as unknown as NonEmptyReadonlyArray<Datagram>
    this.head = 0
    const length = buffer.length
    const batch = new Array<DatagramImpl>(length)
    let j = 0
    for (let i = head; i < length; i++) batch[j++] = buffer[i]
    for (let i = 0; i < head; i++) batch[j++] = buffer[i]
    return batch as unknown as NonEmptyReadonlyArray<Datagram>
  }

  park(fiber: FiberImpl) {
    if (this.waiter === undefined) this.waiter = fiber
    else this.waiters.push(fiber)
  }

  promoteWaiter() {
    this.waiter = this.waiters.length === 0 ? undefined : this.waiters.shift()
  }

  removeWaiter(fiber: FiberImpl) {
    if (this.waiter === fiber) return this.promoteWaiter()
    if (this.waiters.length === 0) return
    const index = this.waiters.indexOf(fiber)
    if (index !== -1) this.waiters.splice(index, 1)
  }

  failWaiters() {
    const waiter = this.waiter
    if (waiter === undefined) return
    const failure = this.failure!
    const waiters = this.waiters
    this.waiter = undefined
    this.waiters = []
    waiter.evaluate(failure as any)
    for (let i = 0; i < waiters.length; i++) waiters[i].evaluate(failure as any)
  }

  fail(error: DatagramSocketError) {
    if (this.failure !== undefined) return
    this.failure = Effect.fail(error)
    this.failWaiters()
  }

  close() {
    this.closed = true
    this.buffer = []
    this.head = 0
    this.failure = Effect.fail(closedError())
    this.failWaiters()
    this.handle?.close()
  }

  report(error: DatagramSocketError) {
    const listener = this.listener
    if (listener === undefined || this.closed) return
    try {
      listener(error)
    } catch {
      // Listener errors cannot fail native callbacks.
    }
  }

  // packets can arrive before the handle does, so they read this lazily
  get scopeIds(): ReadonlyMap<string, number> {
    return this.handle?.scopeIds ?? emptyScopeIds
  }

  get address(): NetAddress.InetAddress {
    return this.bound ??= NetAddress.inetAddressFromNativeUnsafe(
      this.handle!.address.host,
      this.handle!.address.port,
      this.scopeIds
    )
  }

  // Synchronous sends avoid parking; async completions resume inline.
  // Ignore completions after interruption.
  write(datagram: OutgoingDatagram, fiber: FiberImpl): Effect.Effect<void, DatagramSocketError> {
    if (this.failure !== undefined) return this.failure
    const target = targetOf(datagram)
    const destination = this.destination(target)
    if (destination === rejected) return Effect.fail(this.rejection!)
    const handle = this.handle!
    const payload = encode(datagram.payload)
    let result: Effect.Effect<void, DatagramSocketError> | undefined
    let parked = false
    handle.send(payload, destination, (error) => {
      if (result !== undefined) return
      result = error === undefined ? Effect.void : Effect.fail(this.withAddress(error, target))
      if (parked) fiber.evaluate(result as any)
    })
    if (result !== undefined) return result
    parked = true
    return fiber.yieldWith(() => {
      parked = false
    }) as any
  }

  writeAll(
    datagrams: NonEmptyReadonlyArray<OutgoingDatagram>,
    fiber: FiberImpl
  ): Effect.Effect<void, DatagramSocketError> {
    if (this.failure !== undefined) return this.failure
    const payloads = new Array<Uint8Array>(datagrams.length)
    const destinations = new Array<BackingAddress | undefined>(datagrams.length)
    for (let i = 0; i < datagrams.length; i++) {
      const datagram = datagrams[i]
      const destination = this.destination(targetOf(datagram))
      if (destination === rejected) return Effect.fail(this.rejection!)
      payloads[i] = encode(datagram.payload)
      destinations[i] = destination
    }
    let result: Effect.Effect<void, DatagramSocketError> | undefined
    let parked = false
    this.handle!.sendMany(payloads, destinations, (error, index) => {
      if (result !== undefined) return
      result = error === undefined
        ? Effect.void
        : Effect.fail(index === undefined ? error : this.withAddress(error, targetOf(datagrams[index]!)))
      if (parked) fiber.evaluate(result as any)
    })
    if (result !== undefined) return result
    parked = true
    return fiber.yieldWith(() => {
      parked = false
    }) as any
  }

  // Returns `rejected` on failure, with the error stored in `rejection`.
  destination(target: NetAddress.InetAddress | DatagramImpl | undefined): BackingAddress | undefined {
    const handle = this.handle!
    if (target === undefined) {
      if (handle.connected) return undefined
      return handle.peer ?? this.reject("DatagramSocket write has no destination and the socket has no peer")
    }
    if (!("_tag" in target)) return handle.connected ? undefined : target as DatagramImpl
    if (handle.connected) return this.reject("an explicit address cannot be used on a connected DatagramSocket", target)
    if (target === this.lastTarget) return this.lastDestination
    const destination = { host: NetAddress.formatNativeHost(target, this.scopeIds), port: target.port }
    this.lastTarget = target
    this.lastDestination = destination
    return destination
  }

  reject(message: string, address?: NetAddress.InetAddress): BackingAddress {
    this.rejection = new DatagramSocketError({
      reason: new DatagramSocketWriteError({ kind: "Unknown", address, cause: new Error(message) })
    })
    return rejected
  }

  withAddress(
    error: DatagramSocketError,
    target: NetAddress.InetAddress | DatagramImpl | undefined
  ): DatagramSocketError {
    const reason = error.reason
    if (reason._tag !== "DatagramSocketWriteError" || reason.address !== undefined) return error
    const address = this.addressOf(target)
    if (address === undefined) return error
    return new DatagramSocketError({
      reason: new DatagramSocketWriteError({ kind: reason.kind, address, cause: reason.cause })
    })
  }

  addressOf(target: NetAddress.InetAddress | DatagramImpl | undefined): NetAddress.InetAddress | undefined {
    try {
      if (target !== undefined) return "_tag" in target ? target : (target as DatagramImpl).address
      const peer = this.handle!.peer
      return peer === undefined
        ? undefined
        : NetAddress.inetAddressFromNativeUnsafe(peer.host, peer.port, this.scopeIds)
    } catch {
      // an unknown IPv6 zone leaves the address out
      return undefined
    }
  }
}

// Park the fiber itself and resume it inline, avoiding `Effect.callback` allocations.
const makePull = (state: ReaderState): Reader["pull"] =>
  withFiber((fiber): any => {
    if (state.buffer.length !== 0) {
      const batch = state.take()
      const cont = fiber.getCont(contA)
      return cont ? cont[contA](batch, fiber) : fiber.yieldWith(exitSucceed(batch))
    }
    if (state.failure !== undefined) return state.failure
    state.park(fiber)
    fiber._stack.push(state.unpark)
    return fiber.yieldWith(constVoid)
  })

// `contAll` removes interrupted waiters too; after a wake, removal is a no-op.
const unpark: (state: ReaderState) => Primitive = makePrimitive({
  op: "DatagramSocketUnpark",
  [contAll](fiber) {
    this[args].removeWaiter(fiber)
  }
})

const makeReader = (state: ReaderState): Reader => ({
  pull: makePull(state),
  get address() {
    return state.address
  },
  dropped: () => state.dropped,
  joinMulticast: (options) =>
    Effect.suspend(() => {
      if (state.failure !== undefined) return state.failure
      return Effect.acquireRelease(
        state.handle!.joinMulticast(options),
        (leave) => state.closed ? Effect.void : Effect.ignoreCause(leave())
      )
    })
})
