/**
 * Bun UDP adapter for `effect/socket/DatagramSocket`, built on the native
 * `Bun.udpSocket`. Requires Bun 1.4 or later: earlier versions throw `EAGAIN`
 * from `send` instead of returning `false`, and never fire `drain`.
 *
 * `make` opens a new Bun socket for each reader acquisition, `fromUdpSocket`
 * adopts a socket the caller creates, and `layer` provides the
 * `DatagramSocket` service.
 *
 * The reader owns the native socket, so a send-only client must still acquire
 * a reader, or its writes wait forever. Bun sends synchronously: a send error
 * fails the write that caused it, and when the kernel buffer is full the write
 * waits for `drain` and sends what is left.
 *
 * `writeAll` sends the batch with one `sendMany` call and fails with its first
 * error. Which datagrams went out is unspecified, nothing is resent, and the
 * error has no `address`, because Bun reports one error for the whole call.
 *
 * ICMP reports, such as a refused port, arrive after the write has completed,
 * so they go to the `onError` option as a `DatagramSocketReadError` with no
 * address.
 *
 * On macOS and Windows a poll error closes the socket without any event. The
 * adapter notices on the next write, which fails with
 * `DatagramSocketClosedError`, as do the reader and any write waiting for
 * `drain`. Until then those waiting writes and `pull` keep waiting. The same
 * applies when the caller closes a socket adopted with `fromUdpSocket`.
 *
 * **Example** (Echo server)
 *
 * ```ts
 * import { BunDatagramSocket } from "@effect/platform-bun"
 * import { Effect } from "effect"
 *
 * const echo = Effect.gen(function*() {
 *   const socket = yield* BunDatagramSocket.make({ bind: { port: 9000 } })
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
 * import { BunDatagramSocket } from "@effect/platform-bun"
 * import { Effect } from "effect"
 *
 * const send = (payload: string) =>
 *   Effect.gen(function*() {
 *     const socket = yield* BunDatagramSocket.make({
 *       connect: { address: "localhost", port: 9000 }
 *     })
 *     // Required even for send-only clients.
 *     yield* socket.reader
 *     const writer = yield* socket.writer
 *     yield* writer.write({ payload })
 *   }).pipe(Effect.scoped)
 * ```
 *
 * **Example** (Adopting a socket)
 *
 * ```ts
 * import { BunDatagramSocket } from "@effect/platform-bun"
 * import { Effect } from "effect"
 *
 * const receive = Effect.gen(function*() {
 *   // `fromUdpSocket` replaces the socket's handlers with its own
 *   const socket = yield* BunDatagramSocket.fromUdpSocket(
 *     Effect.promise(() => Bun.udpSocket({ hostname: "127.0.0.1", port: 9000 }))
 *   )
 *   const reader = yield* socket.reader
 *   return yield* reader.pull
 * }).pipe(Effect.scoped)
 * ```
 *
 * @stability experimental
 * @since 4.0.0
 */
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as NetAddress from "effect/net/NetAddress"
import * as Predicate from "effect/Predicate"
import type * as Scope from "effect/Scope"
import * as DatagramSocket from "effect/socket/DatagramSocket"
import * as Dns from "node:dns"
import * as Net from "node:net"
import * as Os from "node:os"

/**
 * An open-time endpoint. Hostnames resolve once per reader acquisition via
 * `node:dns.lookup`, avoiding Bun's synchronous `getaddrinfo`.
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
 * Options for `fromUdpSocket`. The caller configures the adopted socket, so
 * only the options that live in JavaScript apply.
 *
 * @stability experimental
 * @category models
 * @since 4.0.0
 */
export interface AdoptOptions {
  readonly peer?: Endpoint | undefined
  readonly receiveBuffer?: DatagramSocket.ReceiveBufferOptions | undefined
  readonly onError?: ((error: DatagramSocket.DatagramSocketError) => void) | undefined
}

/**
 * Options for `make` and `layer`.
 *
 * **Details**
 *
 * `peer` is a default destination and doesn't filter senders. `connect`
 * connects the socket when Bun creates it, so the kernel filters senders. The
 * two can't be combined.
 *
 * Family selection, in order: explicit `family`, a `bind` IP literal, the
 * `peer` or `connect` address, a `bind` hostname, then `"ipv4"`. Hostname
 * lookups use the family selected so far, or prefer IPv4 if none is set.
 *
 * `reuseAddress` means `SO_REUSEADDR` on Linux and `SO_REUSEPORT` on BSD and
 * macOS.
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
 * A native Bun UDP socket, connected or not.
 *
 * @stability experimental
 * @category models
 * @since 4.0.0
 */
export type UdpSocket = Bun.udp.Socket<"buffer"> | Bun.udp.ConnectedSocket<"buffer">

/**
 * Creates a `DatagramSocket` that opens and binds a new Bun UDP socket for
 * each reader acquisition.
 *
 * **Details**
 *
 * Creating the socket never fails. Binding, applying options and resolving
 * names happen on reader acquisition and fail it with a `DatagramSocketError`.
 * Hostnames in `bind`, `peer` and `connect` are resolved once per acquisition;
 * sends never wait for DNS.
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
 * Adopts a Bun UDP socket.
 *
 * **Details**
 *
 * `acquire` runs once per reader acquisition, inside the reader's scope, and
 * the adapter closes the socket when that scope ends. Whether the socket is
 * connected is checked once at open.
 *
 * The adapter installs its own `data`, `drain` and `error` handlers with
 * `socket.reload`, which replaces the ones the caller passed to
 * `Bun.udpSocket`. Packets that arrive before `acquire` completes still go to
 * the caller's handlers.
 *
 * @stability experimental
 * @category constructors
 * @since 4.0.0
 */
export const fromUdpSocket = <R>(
  acquire: Effect.Effect<UdpSocket, DatagramSocket.DatagramSocketError, R>,
  options: AdoptOptions = {}
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
export const layer = (options: Options = {}): Layer.Layer<DatagramSocket.DatagramSocket> =>
  Layer.effect(DatagramSocket.DatagramSocket, make(options))

type Family = "ipv4" | "ipv6"

const noScopeIds: ReadonlyMap<string, number> = new Map()

// Windows reports numeric zones, which parse and format without a map
const scopeIdsFor = (family: Family): ReadonlyMap<string, number> => {
  if (family === "ipv4" || process.platform === "win32") return noScopeIds
  try {
    return NetAddress.scopeIdsFromInterfaces(Object.entries(Os.networkInterfaces()))
  } catch {
    return noScopeIds
  }
}

const familyOf = (address: string | NetAddress.IpAddress): Family | undefined => {
  if (typeof address !== "string") return NetAddress.isIpv4Address(address) ? "ipv4" : "ipv6"
  const version = Net.isIP(address)
  return version === 4 ? "ipv4" : version === 6 ? "ipv6" : undefined
}

// An endpoint may be a whole `InetAddress`, whose IPv6 scope must survive
const formatHost = (
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

// Resolves a hostname with one `lookup`, preferring IPv4 unless `family` is
// fixed. IP literals and `IpAddress` values need no lookup.
const resolve = (
  address: string | NetAddress.IpAddress | undefined,
  family: Family | undefined
): Effect.Effect<Resolved | undefined, DatagramSocket.DatagramSocketError> => {
  if (typeof address !== "string") return Effect.undefined
  const literal = familyOf(address)
  if (literal !== undefined) return Effect.succeed({ host: address, family: literal })
  return Effect.callback((resume) => {
    const fail = (error: unknown) => resume(Effect.fail(openError(error, "AddressNotAvailable")))
    try {
      Dns.lookup(
        address,
        { all: true, family: family === "ipv4" ? 4 : family === "ipv6" ? 6 : 0 },
        (error, results) => {
          if (error) return fail(error)
          const result = results.find((result) => result.family === 4) ?? results[0]
          if (result === undefined) return fail(new Error(`${address} has no addresses`))
          resume(Effect.succeed({ host: result.address, family: result.family === 6 ? "ipv6" : "ipv4" }))
        }
      )
    } catch (error) {
      fail(error)
    }
  })
}

// Picks the family as documented on `Options` and turns `bind` and the remote
// endpoint into IP literals
const resolveOpen = Effect.fnUntraced(function*(options: Options) {
  const bind = options.bind
  const remote = options.connect ?? options.peer
  const fixed = options.family ?? (bind?.address === undefined ? undefined : familyOf(bind.address))
  const resolvedRemote = yield* resolve(remote?.address, fixed)
  const remoteFamily = resolvedRemote?.family ?? (remote === undefined ? undefined : familyOf(remote.address))
  const resolvedBind = yield* resolve(bind?.address, fixed ?? remoteFamily)
  const family = fixed ?? remoteFamily ?? resolvedBind?.family ?? "ipv4"
  const scopeIds = scopeIdsFor(family)
  return {
    scopeIds,
    host: resolvedBind?.host ?? (bind === undefined ? undefined : formatHost(bind, scopeIds)) ??
      (family === "ipv6" ? "::" : "0.0.0.0"),
    remote: remote === undefined ? undefined : {
      host: resolvedRemote?.host ?? formatHost(remote, scopeIds)!,
      port: remote.port
    }
  }
})

const errorCode = (error: unknown): unknown => Predicate.hasProperty(error, "code") ? error.code : undefined

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

const writeError = (error: unknown): DatagramSocket.DatagramSocketError =>
  new DatagramSocket.DatagramSocketError({
    reason: new DatagramSocket.DatagramSocketWriteError({ kind: ioKind(error), cause: error })
  })

const readError = (error: unknown): DatagramSocket.DatagramSocketError =>
  new DatagramSocket.DatagramSocketError({
    reason: new DatagramSocket.DatagramSocketReadError({ kind: ioKind(error), cause: error })
  })

// Bun throws a plain `Error` with this message when sending on a closed socket
const isClosedError = (error: unknown): boolean =>
  Predicate.hasProperty(error, "message") && error.message === "Socket is closed"

// uSockets `LIBUS_SOCKET_*` flags, not part of Bun's public API. Bun's own
// `node:dgram` passes them the same way.
// https://github.com/oven-sh/bun/blob/main/packages/bun-usockets/src/libusockets.h
const LIBUS_SOCKET_REUSE_PORT = 4
const LIBUS_SOCKET_IPV6_ONLY = 8
const LIBUS_SOCKET_REUSE_ADDR = 16

const open = Effect.fnUntraced(function*(options: Options, events: DatagramSocket.BackingEvents) {
  const { host, remote, scopeIds } = yield* resolveOpen(options)
  const backing = new BunBackingSocket(events)
  const flags = (options.reusePort ? LIBUS_SOCKET_REUSE_PORT : 0) |
    (options.ipv6Only ? LIBUS_SOCKET_IPV6_ONLY : 0) |
    (options.reuseAddress ? LIBUS_SOCKET_REUSE_ADDR : 0)
  const connect = options.connect === undefined ? undefined : { hostname: remote!.host, port: remote!.port }
  const socket = yield* Effect.tryPromise({
    try: () =>
      Bun.udpSocket({
        hostname: host,
        port: options.bind?.port ?? 0,
        socket: backing.handlers,
        ...(flags === 0 ? undefined : { flags }),
        ...(connect === undefined ? undefined : { connect })
      } as Bun.udp.SocketOptions<"buffer">),
    catch: (error) => openError(error)
  })
  // closes the new socket if `attach` or an option fails
  backing.socket = socket
  yield* Effect.try({
    try: () => {
      backing.attach(socket, scopeIds, remote, connect !== undefined)
      if (options.broadcast !== undefined) socket.setBroadcast(options.broadcast)
      if (options.ttl !== undefined) socket.setTTL(options.ttl)
      const multicast = options.multicast
      if (multicast?.ttl !== undefined) socket.setMulticastTTL(multicast.ttl)
      if (multicast?.loopback !== undefined) socket.setMulticastLoopback(multicast.loopback)
      if (multicast?.interface !== undefined) {
        socket.setMulticastInterface(NetAddress.formatMulticastInterface(multicast.interface, scopeIds))
      }
    },
    catch: (error) => openError(error)
  }).pipe(Effect.onError(() => Effect.sync(() => backing.close())))
  return backing
})

const adopt = (
  socket: UdpSocket,
  options: AdoptOptions,
  events: DatagramSocket.BackingEvents
): Effect.Effect<DatagramSocket.BackingSocket, DatagramSocket.DatagramSocketError> => {
  const backing = new BunBackingSocket(events)
  backing.socket = socket
  return Effect.gen(function*() {
    if (socket.closed) return yield* Effect.fail(openError(new Error("The adopted Bun UDP socket is closed")))
    const family: Family = yield* Effect.try({
      try: () => {
        // Bun reads `{ socket }`, although the types declare the handler itself
        socket.reload({ socket: backing.handlers } as any)
        return socket.address.family === "IPv6" ? "ipv6" : "ipv4"
      },
      catch: (error) => openError(error)
    })
    const scopeIds = scopeIdsFor(family)
    // an unconnected socket has the property, set to `undefined`
    const remote = "remoteAddress" in socket ? socket.remoteAddress : undefined
    if (remote !== undefined) {
      return backing.attach(socket, scopeIds, { host: remote.address, port: remote.port }, true)
    }
    const peer = options.peer
    const resolved = yield* resolve(peer?.address, family)
    return backing.attach(
      socket,
      scopeIds,
      peer === undefined ? undefined : { host: resolved?.host ?? formatHost(peer, scopeIds)!, port: peer.port },
      false
    )
  }).pipe(Effect.onError(() => Effect.sync(() => backing.close())))
}

// Sends the kernel refused while its buffer was full, in `sendMany`'s flat
// form: `[data, port, host]` per datagram, or plain payloads when connected
interface Waiting {
  entries: ReadonlyArray<Uint8Array | string | number>
  readonly done: (error?: DatagramSocket.DatagramSocketError) => void
}

class BunBackingSocket implements DatagramSocket.BackingSocket {
  readonly events: DatagramSocket.BackingEvents
  // installed when the socket is created, so packets can arrive before `attach`
  readonly handlers: Bun.udp.SocketHandler<"buffer">
  socket: UdpSocket | undefined = undefined
  address: DatagramSocket.BackingAddress = { host: "", port: 0 }
  scopeIds: ReadonlyMap<string, number> = noScopeIds
  peer: DatagramSocket.BackingAddress | undefined = undefined
  connected = false
  // entries per datagram in `sendMany`'s flat list
  stride = 3
  // waiting sends, oldest first; later sends queue behind them to keep order
  waiting: Array<Waiting> = []
  closing = false

  constructor(events: DatagramSocket.BackingEvents) {
    this.events = events
    this.handlers = {
      data: (_socket, payload, port, host) => events.onPacket(payload, host, port),
      // also fires once right after creation, when nothing is waiting
      drain: () => this.flush(),
      // Bun crashes the process without an `error` handler. It passes the
      // error alone, despite the declared `(socket, error)`.
      error: ((first: unknown, second?: unknown) => this.onNativeError(second === undefined ? first : second)) as any
    }
  }

  attach(
    socket: UdpSocket,
    scopeIds: ReadonlyMap<string, number>,
    peer: DatagramSocket.BackingAddress | undefined,
    connected: boolean
  ): this {
    this.socket = socket
    this.address = { host: socket.address.address, port: socket.address.port }
    this.scopeIds = scopeIds
    this.peer = peer
    this.connected = connected
    this.stride = connected ? 1 : 3
    return this
  }

  send(
    payload: Uint8Array,
    destination: DatagramSocket.BackingAddress | undefined,
    done: (error?: DatagramSocket.DatagramSocketError) => void
  ) {
    const entries = destination === undefined ? [payload] : [payload, destination.port, destination.host]
    if (this.waiting.length !== 0) return this.wait(entries, done)
    let sent: boolean
    try {
      sent = destination === undefined
        ? (this.socket as Bun.udp.ConnectedSocket<"buffer">).send(payload)
        : (this.socket as Bun.udp.Socket<"buffer">).send(payload, destination.port, destination.host)
    } catch (error) {
      return done(this.sendError(error))
    }
    if (sent) return done()
    this.wait(entries, done)
  }

  sendMany(
    payloads: ReadonlyArray<Uint8Array>,
    destinations: ReadonlyArray<DatagramSocket.BackingAddress | undefined>,
    done: (error?: DatagramSocket.DatagramSocketError, index?: number) => void
  ) {
    let entries: ReadonlyArray<Uint8Array | string | number> = payloads
    if (!this.connected) {
      const flat = new Array<Uint8Array | string | number>(payloads.length * 3)
      for (let i = 0; i < payloads.length; i++) {
        flat[i * 3] = payloads[i]
        flat[i * 3 + 1] = destinations[i]!.port
        flat[i * 3 + 2] = destinations[i]!.host
      }
      entries = flat
    }
    if (this.waiting.length !== 0) return this.wait(entries, done)
    let sent: number
    try {
      sent = this.socket!.sendMany(entries as any)
    } catch (error) {
      // Bun throws for the whole call, so no index is known
      return done(this.sendError(error))
    }
    if (sent === payloads.length) return done()
    this.wait(entries.slice(sent * this.stride), done)
  }

  joinMulticast<A extends NetAddress.IpAddress>({ group, interface: ingress, source }: {
    readonly group: NetAddress.MulticastAddress<A>
    readonly interface?: NetAddress.MulticastInterface<A> | undefined
    readonly source?: A | undefined
  }): Effect.Effect<() => Effect.Effect<void>, DatagramSocket.DatagramSocketError> {
    return Effect.try({
      try: () => {
        const socket = this.socket!
        const groupHost = NetAddress.formatIp(group)
        const interfaceHost = ingress === undefined
          ? undefined
          : NetAddress.formatMulticastInterface(ingress, this.scopeIds)
        if (source === undefined) {
          if (!socket.addMembership(groupHost, interfaceHost)) throw new Error(`Could not join ${groupHost}`)
          return () => Effect.sync(() => socket.dropMembership(groupHost, interfaceHost))
        }
        const sourceHost = NetAddress.formatIp(source)
        if (!socket.addSourceSpecificMembership(sourceHost, groupHost, interfaceHost)) {
          throw new Error(`Could not join ${groupHost} from ${sourceHost}`)
        }
        return () => Effect.sync(() => socket.dropSourceSpecificMembership(sourceHost, groupHost, interfaceHost))
      },
      catch: (error) => openError(error)
    })
  }

  close() {
    if (this.closing) return
    this.closing = true
    this.failWaiting()
    try {
      this.socket?.close()
    } catch {
      // already closed
    }
  }

  wait(
    entries: ReadonlyArray<Uint8Array | string | number>,
    done: (error?: DatagramSocket.DatagramSocketError) => void
  ) {
    // a closed socket fires no event and never drains
    if (this.socket?.closed) {
      this.closedUnderneath()
      return done(closedError())
    }
    this.waiting.push({ entries, done })
  }

  // on `drain`, send what the kernel refused, in order, until it refuses again
  flush() {
    const socket = this.socket
    if (socket === undefined) return
    // re-read `waiting`: a completion can close the socket and replace it
    while (!this.closing && this.waiting.length !== 0) {
      const next = this.waiting[0]
      let sent: number
      try {
        sent = socket.sendMany(next.entries as any)
      } catch (error) {
        this.waiting.shift()
        next.done(this.sendError(error))
        continue
      }
      const rest = sent * this.stride
      if (rest < next.entries.length) {
        next.entries = next.entries.slice(rest)
        return
      }
      this.waiting.shift()
      next.done()
    }
  }

  sendError(error: unknown): DatagramSocket.DatagramSocketError {
    // on macOS and Windows a poll error closes the socket silently
    if (this.socket?.closed || isClosedError(error)) {
      this.closedUnderneath()
      return closedError()
    }
    return writeError(error)
  }

  onNativeError(error: unknown) {
    if (this.closing) return
    if (this.socket?.closed) return this.closedUnderneath()
    // an ICMP report, with no write left to fail
    this.events.onError(readError(error))
  }

  closedUnderneath() {
    if (this.closing) return
    this.closing = true
    this.failWaiting()
    this.events.onClose()
  }

  failWaiting() {
    const waiting = this.waiting
    this.waiting = []
    for (let i = 0; i < waiting.length; i++) waiting[i].done(closedError())
  }
}
