import { NodeRedis } from "@effect/platform-node"
import { describe, it } from "@effect/vitest"
import { Deferred, Effect, Fiber, Layer } from "effect"
import { Redis } from "effect/persistence"
import * as Net from "node:net"

// A loopback peer that accepts a connection and, unless `onData` replies,
// never answers.
const makePeer = Effect.fnUntraced(function*(onData?: (socket: Net.Socket, data: string) => void) {
  const received = yield* Deferred.make<void>()
  const closed = yield* Deferred.make<void>()
  const sockets = new Set<Net.Socket>()
  const server = Net.createServer((socket) => {
    sockets.add(socket)
    socket.on("error", () => {})
    socket.once("data", () => Deferred.doneUnsafe(received, Effect.void))
    if (onData) socket.on("data", (data) => onData(socket, data.toString()))
    socket.once("close", () => Deferred.doneUnsafe(closed, Effect.void))
  })
  yield* Effect.acquireRelease(
    Effect.callback<void>((resume) => {
      server.listen(0, "127.0.0.1", () => resume(Effect.void))
    }),
    () =>
      Effect.callback<void>((resume) => {
        for (const socket of sockets) socket.destroy()
        server.close(() => resume(Effect.void))
      })
  )
  const port = (server.address() as Net.AddressInfo).port
  return { port, received, closed } as const
})

// A peer that answers every command with `+OK`, except those `stall` matches,
// which never get a reply. Connections are numbered in the order they first
// send data, so the shared client is connection 0.
const makeStallingPeer = Effect.fnUntraced(function*(stall: (connection: number, command: string) => boolean) {
  const stalled = yield* Deferred.make<void>()
  const closed = yield* Deferred.make<void>()
  const connections = new Map<Net.Socket, number>()
  const { port } = yield* makePeer((socket, data) => {
    if (!connections.has(socket)) connections.set(socket, connections.size)
    for (const [, command] of data.matchAll(/\*\d+\r\n\$\d+\r\n(\w+)\r\n/g)) {
      if (stall(connections.get(socket)!, command.toUpperCase())) {
        socket.once("close", () => Deferred.doneUnsafe(closed, Effect.void))
        Deferred.doneUnsafe(stalled, Effect.void)
      } else {
        socket.write("+OK\r\n")
      }
    }
  })
  const layer = NodeRedis.layer({
    socket: { host: "127.0.0.1", port },
    // Keep every connection's handshake to `SELECT`.
    database: 1,
    RESP: 2,
    disableClientInfo: true,
    maintNotifications: "disabled"
  })
  return { layer, stalled, closed } as const
})

describe("NodeRedis", () => {
  for (const tls of [false, true]) {
    it.live(`interrupts a stalled ${tls ? "TLS" : "Redis"} handshake`, () =>
      Effect.gen(function*() {
        const peer = yield* makePeer()
        const fiber = yield* Layer.build(NodeRedis.layer({
          socket: tls ? { host: "127.0.0.1", port: peer.port, tls } : { host: "127.0.0.1", port: peer.port },
          // `SELECT` guarantees a handshake on every node-redis version.
          database: 1
        })).pipe(Effect.scoped, Effect.forkChild)
        yield* Deferred.await(peer.received)
        yield* Fiber.interrupt(fiber).pipe(Effect.timeout("2 seconds"))
        yield* Deferred.await(peer.closed)
      }))
  }

  it.live("bounds shutdown while a command is stalled", () =>
    Effect.gen(function*() {
      const stalled = yield* Deferred.make<void>()
      const ended = yield* Deferred.make<void>()
      const peer = yield* makePeer((socket, data) => {
        // Complete the connection handshake, but never reply to PING.
        for (const [, command] of data.matchAll(/\*\d+\r\n\$\d+\r\n(\w+)\r\n/g)) {
          if (command === "PING") Deferred.doneUnsafe(stalled, Effect.void)
          else socket.write("+OK\r\n")
        }
      })
      const fiber = yield* Effect.gen(function*() {
        const { client } = yield* NodeRedis.NodeRedis
        client.once("end", () => Deferred.doneUnsafe(ended, Effect.void))
        const redis = yield* Redis.Redis
        yield* redis.send("PING")
      }).pipe(
        Effect.provide(NodeRedis.layer({
          socket: { host: "127.0.0.1", port: peer.port },
          // Keep the connection handshake to at most `HELLO`.
          RESP: 2,
          disableClientInfo: true,
          maintNotifications: "disabled"
        })),
        Effect.forkChild
      )
      yield* Deferred.await(stalled)
      yield* Fiber.interrupt(fiber).pipe(Effect.timeout("2 seconds"))
      yield* Deferred.await(peer.closed)
      // The client is fully destroyed, not just disconnected by the abort signal.
      yield* Deferred.await(ended)
    }))

  for (const command of ["SELECT", "SUBSCRIBE"]) {
    it.live(`interrupts a subscriber stalled on ${command}`, () =>
      Effect.gen(function*() {
        const peer = yield* makeStallingPeer((connection, received) => connection > 0 && received === command)
        const fiber = yield* Effect.gen(function*() {
          const redis = yield* Redis.Redis
          yield* redis.subscribe("channel")
        }).pipe(Effect.scoped, Effect.provide(peer.layer), Effect.forkChild)
        yield* Deferred.await(peer.stalled)
        yield* Fiber.interrupt(fiber).pipe(Effect.timeout("2 seconds"))
        yield* Deferred.await(peer.closed)
      }))
  }

  it.live("interrupts a stalled reserved connection", () =>
    Effect.gen(function*() {
      const peer = yield* makeStallingPeer((connection, received) => connection > 0 && received === "SELECT")
      const fiber = yield* Effect.gen(function*() {
        const redis = yield* Redis.Redis
        yield* redis.reserve
      }).pipe(Effect.scoped, Effect.provide(peer.layer), Effect.forkChild)
      yield* Deferred.await(peer.stalled)
      yield* Fiber.interrupt(fiber).pipe(Effect.timeout("2 seconds"))
      // The connection attempt is aborted rather than left to open later.
      yield* Deferred.await(peer.closed)
    }))
})
