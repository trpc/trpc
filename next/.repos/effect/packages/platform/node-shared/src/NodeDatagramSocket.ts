/**
 * Node UDP adapter for `effect/socket/DatagramSocket`, built on `node:dgram`.
 *
 * `make` opens a new `dgram.Socket` for each reader acquisition, `fromSocket`
 * adopts a socket the caller creates, and `layer` provides the
 * `DatagramSocket` service.
 *
 * The reader owns the native socket, so a send-only client must still acquire
 * a reader, or its writes wait forever. Every write waits for Node's send
 * callback, so send errors fail the write that caused them.
 *
 * `writeAll` fails with the first send error. Which of the other datagrams
 * went out is unspecified and nothing is resent; the error carries the failed
 * datagram's `address`.
 *
 * **Example** (Ingest server)
 *
 * ```ts
 * import { NodeDatagramSocket } from "@effect/platform-node-shared"
 * import { Effect } from "effect"
 * import { DatagramSocket } from "effect/socket"
 *
 * const ingest = Effect.gen(function*() {
 *   const socket = yield* DatagramSocket.DatagramSocket
 *   const reader = yield* socket.reader
 *   while (true) {
 *     const datagrams = yield* reader.pull
 *     yield* Effect.log(`received ${datagrams.length}, dropped ${reader.dropped()}`)
 *   }
 * }).pipe(
 *   Effect.scoped,
 *   Effect.provide(NodeDatagramSocket.layer({
 *     bind: { port: 9000 },
 *     receiveBuffer: { capacity: 4096, strategy: "sliding" }
 *   }))
 * )
 * ```
 *
 * **Example** (Echo server)
 *
 * ```ts
 * import { NodeDatagramSocket } from "@effect/platform-node-shared"
 * import { Effect } from "effect"
 *
 * const echo = Effect.gen(function*() {
 *   const socket = yield* NodeDatagramSocket.make({ bind: { port: 9000 } })
 *   const reader = yield* socket.reader
 *   const writer = yield* socket.writer
 *   while (true) {
 *     for (const received of yield* reader.pull) {
 *       yield* writer.write({ payload: received.payload, address: received })
 *     }
 *   }
 * }).pipe(Effect.scoped)
 * ```
 *
 * **Example** (Send-only client with a connected socket)
 *
 * ```ts
 * import { NodeDatagramSocket } from "@effect/platform-node-shared"
 * import { Effect } from "effect"
 *
 * const send = (payload: string) =>
 *   Effect.gen(function*() {
 *     const socket = yield* NodeDatagramSocket.make({
 *       connect: { address: "localhost", port: 9000 }
 *     })
 *     // Required even for send-only clients.
 *     yield* socket.reader
 *     const writer = yield* socket.writer
 *     yield* writer.write({ payload })
 *   }).pipe(Effect.scoped)
 * ```
 *
 * **Example** (Multicast receiver and sender)
 *
 * ```ts
 * import { NodeDatagramSocket } from "@effect/platform-node-shared"
 * import { Effect } from "effect"
 * import { NetAddress } from "effect/net"
 *
 * const group = NetAddress.ipFromStringUnsafe("239.255.0.1")
 *
 * const receive = Effect.gen(function*() {
 *   if (!NetAddress.isMulticast(group) || !NetAddress.isIpv4Address(group)) return
 *   const socket = yield* NodeDatagramSocket.make({
 *     bind: { address: "0.0.0.0", port: 5000 },
 *     reuseAddress: true
 *   })
 *   const reader = yield* socket.reader
 *   yield* reader.joinMulticast({ group, interface: NetAddress.ipv4Loopback })
 *   return yield* reader.pull
 * }).pipe(Effect.scoped)
 *
 * const announce = Effect.gen(function*() {
 *   const socket = yield* NodeDatagramSocket.make({
 *     peer: { address: group, port: 5000 },
 *     // Egress interface, independent of the join's ingress interface.
 *     multicast: { interface: NetAddress.ipv4Loopback, ttl: 1, loopback: true }
 *   })
 *   yield* socket.reader
 *   const writer = yield* socket.writer
 *   yield* writer.write({ payload: "hello" })
 * }).pipe(Effect.scoped)
 * ```
 *
 * @stability experimental
 * @since 4.0.0
 */
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as NetAddress from "effect/net/NetAddress"
import type * as Scope from "effect/Scope"
import * as DatagramSocket from "effect/socket/DatagramSocket"
import * as Dgram from "node:dgram"
import * as Dns from "node:dns"
import * as Net from "node:net"
import * as Os from "node:os"

/**
 * An open-time endpoint. Hostnames resolve once per reader acquisition via
 * `node:dns.lookup`.
 * An `InetAddress` can be passed directly.
 *
 * @stability experimental
 * @category models
 * @since 4.0.0
 */
export interface Endpoint {
  readonly address: string | NetAddress.IpAddress
  readonly port: number
}

/**
 * The local address and port to bind. Defaults to `0.0.0.0` (or `::` for
 * `family: "ipv6"`) and an ephemeral port.
 *
 * @stability experimental
 * @category models
 * @since 4.0.0
 */
export interface BindOptions {
  readonly address?: string | NetAddress.IpAddress | undefined
  readonly port?: number | undefined
}

/**
 * Options for `make` and `layer`.
 *
 * **Details**
 *
 * `peer` is a default destination and doesn't filter senders. `connect` calls
 * `connect(2)` after binding, so the kernel filters senders and ICMP errors
 * reach `onError`. The two can't be combined.
 *
 * Family selection, in order: explicit `family`, a `bind` IP literal, the
 * `peer` or `connect` address, a `bind` hostname, then `"ipv4"`. Hostname
 * lookups use the family selected so far, or prefer IPv4 if none is set.
 *
 * `reuseAddress` means `SO_REUSEADDR` on Linux and `SO_REUSEPORT` on BSD and
 * macOS. `kernelReceiveBufferSize` and `kernelSendBufferSize` are in bytes;
 * Linux doubles the value and caps it at `rmem_max` / `wmem_max`.
 *
 * `multicast.interface` is the egress interface for datagrams sent to a group,
 * which is a different socket option from the ingress `interface` of
 * `Reader.joinMulticast`.
 *
 * @stability experimental
 * @category models
 * @since 4.0.0
 */
export type Options =
  & {
    readonly bind?: BindOptions | undefined
    readonly family?: "ipv4" | "ipv6" | undefined
    readonly reuseAddress?: boolean | undefined
    readonly reusePort?: boolean | undefined
    readonly ipv6Only?: boolean | undefined
    readonly kernelReceiveBufferSize?: number | undefined
    readonly kernelSendBufferSize?: number | undefined
    readonly broadcast?: boolean | undefined
    readonly ttl?: number | undefined
    readonly multicast?: {
      readonly interface?: NetAddress.MulticastInterface | undefined
      readonly loopback?: boolean | undefined
      readonly ttl?: number | undefined
    } | undefined
    readonly receiveBuffer?: DatagramSocket.ReceiveBufferOptions | undefined
    readonly onError?: ((error: DatagramSocket.DatagramSocketError) => void) | undefined
  }
  & (
    | { readonly peer?: Endpoint | undefined; readonly connect?: undefined }
    | { readonly connect: Endpoint; readonly peer?: undefined }
  )

/**
 * Options for `fromSocket`. The caller configures the adopted socket, so only
 * the options that live in JavaScript apply.
 *
 * @stability experimental
 * @category models
 * @since 4.0.0
 */
export interface FromSocketOptions {
  readonly peer?: Endpoint | undefined
  readonly receiveBuffer?: DatagramSocket.ReceiveBufferOptions | undefined
  readonly onError?: ((error: DatagramSocket.DatagramSocketError) => void) | undefined
}

/**
 * Creates a `DatagramSocket` that opens and binds a new `dgram.Socket` for
 * each reader acquisition.
 *
 * **Details**
 *
 * Creating the socket never fails. Binding, applying options and resolving
 * names happen when a reader is acquired, and fail that acquisition with a
 * `DatagramSocketError`. Hostnames in `bind`, `peer` and `connect` are
 * resolved once per acquisition, so the native socket only sees IP literals
 * and no send waits for DNS.
 *
 * Invalid `receiveBuffer.capacity` values cause a defect; use a positive
 * safe integer.
 *
 * @stability experimental
 * @category constructors
 * @since 4.0.0
 */
export const make = (options: Options = {}): Effect.Effect<DatagramSocket.DatagramSocket> =>
  DatagramSocket.makeFromBackingSocket((events) => open(options, events), options)

/**
 * Adopts a `dgram.Socket`.
 *
 * **Details**
 *
 * `acquire` runs once per reader acquisition, inside the reader's scope, and
 * the adapter closes the socket when that scope ends. The socket must be bound
 * by the time `acquire` completes. Whether it is connected is checked once at
 * open.
 *
 * @stability experimental
 * @category constructors
 * @since 4.0.0
 */
export const fromSocket = <R>(
  acquire: Effect.Effect<Dgram.Socket, DatagramSocket.DatagramSocketError, R>,
  options: FromSocketOptions = {}
): Effect.Effect<DatagramSocket.DatagramSocket, never, Exclude<R, Scope.Scope>> =>
  DatagramSocket.makeFromBackingSocket(
    (events) => Effect.flatMap(acquire, (socket) => adopt(socket, options, events)),
    options
  )

/**
 * Provides a `DatagramSocket` built with `make`.
 *
 * @stability experimental
 * @category layers
 * @since 4.0.0
 */
export const layer = (options?: Options): Layer.Layer<DatagramSocket.DatagramSocket> =>
  Layer.effect(DatagramSocket.DatagramSocket, make(options))

type Family = "ipv4" | "ipv6"

const noScopeIds: ReadonlyMap<string, number> = new Map()

// Windows reports numeric zones, which parse and format without a map
const interfaceScopeIds = (): ReadonlyMap<string, number> => {
  if (process.platform === "win32") return noScopeIds
  try {
    return NetAddress.scopeIdsFromInterfaces(Object.entries(Os.networkInterfaces()))
  } catch {
    return noScopeIds
  }
}

const scopeIdsFor = (family: Family): ReadonlyMap<string, number> =>
  family === "ipv6" ? interfaceScopeIds() : noScopeIds

const familyOfLiteral = (address: string | NetAddress.IpAddress): Family | undefined => {
  if (typeof address !== "string") return NetAddress.isIpv4Address(address) ? "ipv4" : "ipv6"
  const version = Net.isIP(address)
  return version === 4 ? "ipv4" : version === 6 ? "ipv6" : undefined
}

// `endpoint` may be a whole `InetAddress`, whose IPv6 scope must survive
const formatEndpoint = (
  endpoint: { readonly address?: string | NetAddress.IpAddress | undefined },
  scopeIds: ReadonlyMap<string, number>
): string | undefined =>
  NetAddress.isInetAddress(endpoint)
    ? NetAddress.formatNativeHost(endpoint, scopeIds)
    : endpoint.address === undefined || typeof endpoint.address === "string"
    ? endpoint.address
    : NetAddress.formatIp(endpoint.address)

interface Resolved {
  readonly host: string
  readonly family: Family
}

// Prefer IPv4 unless the family is fixed; IP literals resolve synchronously.
const resolve = (
  address: string | NetAddress.IpAddress | undefined,
  family: Family | undefined,
  onError: (error: unknown) => void,
  next: (resolved: Resolved | undefined) => void
): void => {
  if (typeof address !== "string") return next(undefined)
  const literal = familyOfLiteral(address)
  if (literal !== undefined) return next({ host: address, family: literal })
  try {
    Dns.lookup(address, { all: true, family: family === "ipv4" ? 4 : family === "ipv6" ? 6 : 0 }, (error, results) => {
      if (error) return onError(error)
      const result = results.find((result) => result.family === 4) ?? results[0]
      if (result === undefined) return onError(new Error(`${address} has no addresses`))
      next({ host: result.address, family: result.family === 6 ? "ipv6" : "ipv4" })
    })
  } catch (error) {
    onError(error)
  }
}

interface OpenPlan {
  readonly family: Family
  readonly scopeIds: ReadonlyMap<string, number>
  readonly bindHost: string
  readonly remote: DatagramSocket.BackingAddress | undefined
}

/**
 * Picks the socket's family and resolves `bind` and the remote endpoint
 * (`peer` or `connect`) to IP literals. The family is the explicit `family`,
 * else an IP literal in `bind`, else the remote's family, else a `bind`
 * hostname's, else `"ipv4"`. IP literals answer synchronously.
 */
const planOpen = (
  options: {
    readonly family?: Family | undefined
    readonly bind?: { readonly address?: string | NetAddress.IpAddress | undefined } | undefined
    readonly remote?: { readonly address: string | NetAddress.IpAddress; readonly port: number } | undefined
  },
  scopeIdsOf: (family: Family) => ReadonlyMap<string, number>,
  onLookupError: (error: unknown) => void,
  next: (plan: OpenPlan) => void
): void => {
  const { bind, remote } = options
  const fixed = options.family ?? (bind?.address === undefined ? undefined : familyOfLiteral(bind.address))
  resolve(remote?.address, fixed, onLookupError, (resolvedRemote) => {
    const remoteFamily = resolvedRemote?.family ?? (remote === undefined ? undefined : familyOfLiteral(remote.address))
    resolve(bind?.address, fixed ?? remoteFamily, onLookupError, (resolvedBind) => {
      const family = fixed ?? remoteFamily ?? resolvedBind?.family ?? "ipv4"
      const scopeIds = scopeIdsOf(family)
      next({
        family,
        scopeIds,
        bindHost: resolvedBind?.host ??
          (bind === undefined ? undefined : formatEndpoint(bind, scopeIds)) ??
          (family === "ipv6" ? "::" : "0.0.0.0"),
        remote: remote === undefined ? undefined : {
          host: resolvedRemote?.host ?? formatEndpoint(remote, scopeIds)!,
          port: remote.port
        }
      })
    })
  })
}

/**
 * Resolves an adopted socket's `peer` in the family the socket is bound to.
 */
const resolvePeer = (
  peer: { readonly address: string | NetAddress.IpAddress; readonly port: number } | undefined,
  family: Family,
  scopeIds: ReadonlyMap<string, number>,
  onLookupError: (error: unknown) => void,
  next: (peer: DatagramSocket.BackingAddress | undefined) => void
): void => {
  if (peer === undefined) return next(undefined)
  if (typeof peer.address !== "string") return next({ host: formatEndpoint(peer, scopeIds)!, port: peer.port })
  resolve(peer.address, family, onLookupError, (resolved) => next({ host: resolved!.host, port: peer.port }))
}

const errorCode = (error: unknown): unknown =>
  typeof error === "object" && error !== null ? (error as NodeJS.ErrnoException).code : undefined

const openError = (
  error: unknown,
  kind?: DatagramSocket.DatagramSocketOpenError["kind"]
): DatagramSocket.DatagramSocketError => {
  if (kind === undefined) {
    const code = errorCode(error)
    kind = code === "EADDRINUSE"
      ? "AddressInUse"
      : code === "EADDRNOTAVAIL"
      ? "AddressNotAvailable"
      : code === "EACCES" || code === "EPERM"
      ? "PermissionDenied"
      : "Unknown"
  }
  return new DatagramSocket.DatagramSocketError({
    reason: new DatagramSocket.DatagramSocketOpenError({ kind, cause: error })
  })
}

const ioKind = (error: unknown): DatagramSocket.IoErrorKind => {
  switch (errorCode(error)) {
    case "EMSGSIZE":
      return "MessageTooLarge"
    case "EHOSTUNREACH":
    case "ENETUNREACH":
    case "EHOSTDOWN":
    case "ENETDOWN":
      return "Unreachable"
    case "ECONNREFUSED":
      return "ConnectionRefused"
    case "EACCES":
    case "EPERM":
      return "PermissionDenied"
    default:
      return "Unknown"
  }
}

const closedError = (): DatagramSocket.DatagramSocketError =>
  new DatagramSocket.DatagramSocketError({ reason: new DatagramSocket.DatagramSocketClosedError() })

const ioWriteError = (
  error: unknown,
  kind: DatagramSocket.IoErrorKind = ioKind(error)
): DatagramSocket.DatagramSocketError =>
  new DatagramSocket.DatagramSocketError({
    reason: new DatagramSocket.DatagramSocketWriteError({ kind, cause: error })
  })

const readError = (
  error: unknown,
  kind: DatagramSocket.IoErrorKind = ioKind(error)
): DatagramSocket.DatagramSocketError =>
  new DatagramSocket.DatagramSocketError({
    reason: new DatagramSocket.DatagramSocketReadError({ kind, cause: error })
  })

// Every address reaching the socket is an IP literal, so answer at once. This
// also skips the `process.nextTick` Node's default `lookup` adds to each send.
const immediateLookup = (
  hostname: string,
  family: unknown,
  callback: (error: NodeJS.ErrnoException | null, address: string, family: number) => void
) => callback(null, hostname, family === 6 ? 6 : 4)

const writeError = (error: unknown): DatagramSocket.DatagramSocketError =>
  errorCode(error) === "ERR_SOCKET_DGRAM_NOT_RUNNING" ? closedError() : ioWriteError(error)

const open = (
  options: Options,
  events: DatagramSocket.BackingEvents
): Effect.Effect<DatagramSocket.BackingSocket, DatagramSocket.DatagramSocketError> =>
  // Core lets uncancellable lookups finish and closes abandoned sockets.
  Effect.callback((resume) => {
    planOpen(
      { family: options.family, bind: options.bind, remote: options.connect ?? options.peer },
      scopeIdsFor,
      (error) => resume(Effect.fail(openError(error, "AddressNotAvailable"))),
      (plan) => bind(options, events, plan, resume)
    )
  })

const bind = (
  options: Options,
  events: DatagramSocket.BackingEvents,
  { bindHost: host, family, remote, scopeIds }: OpenPlan,
  resume: (effect: Effect.Effect<DatagramSocket.BackingSocket, DatagramSocket.DatagramSocketError>) => void
) => {
  let socket: Dgram.Socket
  try {
    socket = Dgram.createSocket({
      type: family === "ipv6" ? "udp6" : "udp4",
      reuseAddr: options.reuseAddress,
      reusePort: options.reusePort,
      ipv6Only: options.ipv6Only,
      lookup: immediateLookup as any
    })
  } catch (error) {
    return resume(Effect.fail(openError(error)))
  }
  const native = new NativeSocket(socket, events)
  const fail = (error: DatagramSocket.DatagramSocketError) => {
    native.close()
    resume(Effect.fail(error))
  }
  native.onOpenError = (error) => fail(openError(error))
  try {
    socket.bind({ address: host, port: options.bind?.port ?? 0 }, () => {
      try {
        if (options.kernelReceiveBufferSize !== undefined) socket.setRecvBufferSize(options.kernelReceiveBufferSize)
        if (options.kernelSendBufferSize !== undefined) socket.setSendBufferSize(options.kernelSendBufferSize)
        if (options.broadcast !== undefined) socket.setBroadcast(options.broadcast)
        if (options.ttl !== undefined) socket.setTTL(options.ttl)
        const multicast = options.multicast
        if (multicast?.ttl !== undefined) socket.setMulticastTTL(multicast.ttl)
        if (multicast?.loopback !== undefined) socket.setMulticastLoopback(multicast.loopback)
        if (multicast?.interface !== undefined) {
          socket.setMulticastInterface(
            NetAddress.formatMulticastInterface(multicast.interface, scopeIds)
          )
        }
      } catch (error) {
        return fail(openError(error))
      }
      if (options.connect === undefined) return resume(Effect.succeed(native.open(scopeIds, remote, false)))
      try {
        socket.connect(remote!.port, remote!.host, (error?: Error) => {
          if (error) return fail(openError(error))
          resume(Effect.succeed(native.open(scopeIds, remote, true)))
        })
      } catch (error) {
        fail(openError(error))
      }
    })
  } catch (error) {
    fail(openError(error))
  }
}

const adopt = (
  socket: Dgram.Socket,
  options: FromSocketOptions,
  events: DatagramSocket.BackingEvents
): Effect.Effect<DatagramSocket.BackingSocket, DatagramSocket.DatagramSocketError> =>
  Effect.callback((resume) => {
    const native = new NativeSocket(socket, events)
    const fail = (error: DatagramSocket.DatagramSocketError) => {
      native.close()
      resume(Effect.fail(error))
    }
    let family: Family
    let remote: Dgram.RemoteInfo | undefined
    try {
      family = socket.address().family === "IPv6" ? "ipv6" : "ipv4"
    } catch (error) {
      return fail(openError(error))
    }
    try {
      remote = socket.remoteAddress() as Dgram.RemoteInfo
    } catch {
    }
    const scopeIds = scopeIdsFor(family)
    if (remote !== undefined) {
      return resume(Effect.succeed(native.open(scopeIds, { host: remote.address, port: remote.port }, true)))
    }
    resolvePeer(
      options.peer,
      family,
      scopeIds,
      (error) => fail(openError(error, "AddressNotAvailable")),
      (peer) => resume(Effect.succeed(native.open(scopeIds, peer, false)))
    )
  })

class NativeSocket {
  readonly socket: Dgram.Socket
  onOpenError: ((error: unknown) => void) | undefined = undefined
  closing = false

  constructor(socket: Dgram.Socket, events: DatagramSocket.BackingEvents) {
    this.socket = socket
    socket.on("message", (payload, info) => events.onPacket(payload, info.address, info.port))
    // Node throws without an `'error'` listener, so one is always attached.
    // Once open, errors have no write left to fail, such as ICMP reports on a
    // connected socket.
    socket.on("error", (error) => {
      if (this.onOpenError !== undefined) return this.onOpenError(error)
      events.onError(readError(error))
    })
    socket.on("close", () => {
      if (!this.closing) events.onClose()
    })
  }

  open(
    scopeIds: ReadonlyMap<string, number>,
    peer: DatagramSocket.BackingAddress | undefined,
    connected: boolean
  ): DatagramSocket.BackingSocket {
    this.onOpenError = undefined
    const socket = this.socket
    // `address()` throws after close, so it is read once here
    const bound = socket.address()
    const send = (
      payload: Uint8Array,
      destination: DatagramSocket.BackingAddress | undefined,
      done: (error: unknown) => void
    ) => {
      try {
        // the callback is the only signal of a send's result, and on
        // `EAGAIN`/`ENOBUFS` it waits until libuv has sent the datagram
        if (destination === undefined) socket.send(payload, done)
        else socket.send(payload, destination.port, destination.host, done)
      } catch (error) {
        done(error)
      }
    }
    return {
      address: { host: bound.address, port: bound.port },
      scopeIds,
      peer,
      connected,
      send: (payload, destination, done) =>
        send(payload, destination, (error) => done(error == null ? undefined : writeError(error))),
      sendMany: (payloads, destinations, done) => {
        let remaining = payloads.length
        let failure: DatagramSocket.DatagramSocketError | undefined
        let failedAt: number | undefined
        const report = (error: unknown, index: number) => {
          if (error != null && failure === undefined) {
            failure = writeError(error)
            failedAt = index
          }
          if (--remaining === 0) done(failure, failedAt)
        }
        for (let i = 0; i < payloads.length; i++) {
          send(payloads[i], destinations[i], (error) => report(error, i))
        }
      },
      joinMulticast: ({ group, interface: ingress, source }) =>
        Effect.try({
          try: () => {
            const groupHost = NetAddress.formatIp(group)
            const interfaceHost = ingress === undefined
              ? undefined
              : NetAddress.formatMulticastInterface(ingress, scopeIds)
            if (source === undefined) {
              socket.addMembership(groupHost, interfaceHost)
              return () => Effect.sync(() => socket.dropMembership(groupHost, interfaceHost))
            }
            const sourceHost = NetAddress.formatIp(source)
            socket.addSourceSpecificMembership(sourceHost, groupHost, interfaceHost)
            return () => Effect.sync(() => socket.dropSourceSpecificMembership(sourceHost, groupHost, interfaceHost))
          },
          catch: (error) => openError(error)
        }),
      close: () => this.close()
    }
  }

  close() {
    if (this.closing) return
    this.closing = true
    try {
      this.socket.close()
    } catch {
    }
  }
}
