import { Effect, Layer, Queue, Schema } from "effect"
import {
  EventGroup,
  EventJournal,
  EventLog,
  EventLogEncryption,
  EventLogMessage,
  EventLogRemote,
  EventLogServerEncrypted,
  EventLogServerUnencrypted
} from "effect/eventlog"
import { NetAddress } from "effect/net"
import { RpcClient, RpcSerialization, RpcServer } from "effect/rpc"
import { Socket, SocketServer } from "effect/socket"

// Counts the bytes an event log client sends and receives while it writes,
// using the socket RPC protocols over an in-memory socket so that every frame
// is serialized exactly as it would be on a real connection.

const entries = Number(process.argv[2] ?? 1000)
const storeId = EventLogMessage.StoreId.make("default")

const UserGroup = EventGroup.empty.add({
  tag: "UserCreated",
  primaryKey: (payload) => payload.id,
  payload: Schema.Struct({ id: Schema.String, name: Schema.String })
})
const schema = EventLog.schema(UserGroup)

const servers = [
  {
    name: "encrypted",
    handlers: EventLogServerEncrypted.layerRpcHandlers.pipe(
      Layer.provide(EventLogServerEncrypted.layerStorageMemory)
    ),
    remote: EventLogRemote.layerEncrypted
  },
  {
    name: "unencrypted",
    handlers: EventLogServerUnencrypted.layerRpcHandlers.pipe(
      Layer.provide([
        EventLogServerUnencrypted.layerStorageMemory,
        EventLog.layerRegistry,
        EventLogServerUnencrypted.layerStoreMappingStatic({ storeId }),
        Layer.succeed(EventLogServerUnencrypted.EventLogServerAuthorization, {
          authorizeWrite: () => Effect.void,
          authorizeRead: () => Effect.void,
          authorizeIdentity: () => Effect.void
        })
      ])
    ),
    remote: EventLogRemote.layerUnencrypted
  }
] as const

// Event log messages carry binary fields, which JSON serialization rejects.
const serialization = RpcSerialization.layerSchemaBinary()

const encoder = new TextEncoder()

// A connected pair of in-memory sockets. `down` counts the bytes the server
// writes, `up` the bytes the client writes.
const makeSocketPair = Effect.gen(function*() {
  const toServer = yield* Queue.unbounded<Uint8Array | string>()
  const toClient = yield* Queue.unbounded<Uint8Array | string>()
  const bytes = { up: 0, down: 0 }
  const side = (
    incoming: Queue.Queue<Uint8Array | string>,
    outgoing: Queue.Queue<Uint8Array | string>,
    count: (bytes: number) => void
  ) => {
    const write = (chunk: Uint8Array | string | Socket.CloseEvent) => {
      if (Socket.isCloseEvent(chunk)) return Effect.void
      count(typeof chunk === "string" ? encoder.encode(chunk).byteLength : chunk.byteLength)
      return Queue.offer(outgoing, chunk).pipe(Effect.asVoid)
    }
    return Socket.make({
      reader: Effect.succeed({
        pull: Queue.takeAll(incoming),
        upgrade: () => Effect.void
      }),
      writer: Effect.succeed({
        write,
        writeAll: (chunks) => Effect.forEach(chunks, write, { discard: true })
      })
    })
  }
  return {
    bytes,
    client: side(toClient, toServer, (n) => bytes.up += n),
    server: side(toServer, toClient, (n) => bytes.down += n)
  }
})

const makeServer = Effect.fnUntraced(function*(server: (typeof servers)[number]) {
  const sockets = yield* Queue.unbounded<Socket.Socket>()
  const socketServer = SocketServer.SocketServer.of({
    address: NetAddress.inetAddressUnsafe(NetAddress.ipv4Loopback, 0),
    run: (handler) =>
      Queue.take(sockets).pipe(
        Effect.flatMap((socket) => Effect.forkChild(handler(socket))),
        Effect.forever
      )
  })
  yield* Layer.build(
    RpcServer.layer(EventLogMessage.EventLogRemoteRpcs).pipe(
      Layer.provide(server.handlers),
      Layer.provide(Layer.effect(RpcServer.Protocol, RpcServer.makeProtocolSocketServer)),
      Layer.provide(Layer.succeed(SocketServer.SocketServer, socketServer)),
      Layer.provide(serialization)
    )
  )

  // Connects a remote registered with the given registry layer.
  const connectWith = Effect.fnUntraced(function*<A>(
    identity: EventLog.Identity["Service"],
    registry: Layer.Layer<A | EventLog.Registry>
  ) {
    const pair = yield* makeSocketPair
    yield* Queue.offer(sockets, pair.server)
    const context = yield* Layer.build(
      server.remote.pipe(
        Layer.provide(RpcClient.layerProtocolSocket()),
        Layer.provide(Layer.succeed(Socket.Socket, pair.client)),
        Layer.provide(serialization),
        Layer.provideMerge(registry)
      )
    )
    const remote = yield* EventLogRemote.EventLogRemote.pipe(Effect.provide(context))
    yield* remote.whenAuthenticated(Effect.void).pipe(Effect.provideService(EventLog.Identity, identity))
    return { bytes: pair.bytes, context, remote }
  })

  // Connects a device whose event log replicates through the remote.
  const connectDevice = (identity: EventLog.Identity["Service"], journal: EventJournal.EventJournal["Service"]) =>
    connectWith(
      identity,
      EventLog.layer(
        schema,
        EventLog.group(UserGroup, (handlers) => handlers.handle("UserCreated", () => Effect.void)).pipe(
          Layer.provide(EventLog.layerRegistry)
        )
      ).pipe(
        Layer.provide(Layer.succeed(EventJournal.EventJournal, journal)),
        Layer.provide(Layer.succeed(EventLog.Identity, identity))
      )
    )

  // Connects only a remote, without an event log consuming its changes.
  const connectRemote = (identity: EventLog.Identity["Service"]) => connectWith(identity, EventLog.layerRegistry)

  return { connectDevice, connectRemote }
})

const waitUntil = Effect.fnUntraced(function*(check: Effect.Effect<boolean, unknown>) {
  for (let i = 0; i < 6000; i++) {
    if (yield* check) return
    yield* Effect.sleep("5 millis")
  }
  return yield* Effect.die("timed out")
})

// Waits until a byte counter has not moved for a while.
const settle = Effect.fnUntraced(function*(read: () => number) {
  let last = read()
  let still = 0
  while (still < 4) {
    yield* Effect.sleep("50 millis")
    const current = read()
    still = current === last ? still + 1 : 0
    last = current
  }
})

const run = Effect.fnUntraced(function*(server: (typeof servers)[number]) {
  const { connectDevice, connectRemote } = yield* makeServer(server)
  const identity = yield* EventLog.makeIdentity
  const writerJournal = yield* EventJournal.makeMemory
  const readerJournal = yield* EventJournal.makeMemory
  const writer = yield* connectDevice(identity, writerJournal)
  // Another device with the same identity, which receives every write.
  const reader = yield* connectDevice(identity, readerJournal)
  yield* settle(() => writer.bytes.down + reader.bytes.down)
  const writerStart = { ...writer.bytes }
  const readerStart = { ...reader.bytes }

  const log = yield* EventLog.EventLog.pipe(Effect.provide(writer.context))
  for (let i = 0; i < entries; i++) {
    yield* log.write({ schema, event: "UserCreated", payload: { id: `user-${i}`, name: `User ${i}` } })
  }
  yield* waitUntil(Effect.map(readerJournal.entries, (stored) => stored.length === entries))
  yield* settle(() => writer.bytes.down + writer.bytes.up)

  // A fresh connection resumes from the writer's journal.
  const startSequence = yield* writerJournal.nextRemoteSequence(writer.remote.id)
  const resumed = yield* connectRemote(identity)
  const resumedStart = resumed.bytes.down
  yield* resumed.remote.changes({ identity, storeId, startSequence })
  yield* settle(() => resumed.bytes.down)

  return {
    server: server.name,
    entries,
    "writer up": writer.bytes.up - writerStart.up,
    "writer down": writer.bytes.down - writerStart.down,
    "reader down": reader.bytes.down - readerStart.down,
    "resume sequence": startSequence,
    "resume down": resumed.bytes.down - resumedStart
  }
}, Effect.scoped)

const program = Effect.gen(function*() {
  const rows = []
  for (const server of servers) {
    rows.push(yield* run(server))
  }
  console.table(rows)
}).pipe(Effect.provide(EventLogEncryption.layerSubtle))

Effect.runPromise(program).catch((error) => {
  console.error(error)
  process.exitCode = 1
})
