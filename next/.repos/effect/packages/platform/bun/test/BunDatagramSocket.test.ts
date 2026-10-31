import * as BunDatagramSocket from "@effect/platform-bun/BunDatagramSocket"
import { assert, describe, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Fiber from "effect/Fiber"
import * as NetAddress from "effect/net/NetAddress"
import * as DatagramSocket from "effect/socket/DatagramSocket"

const host = "127.0.0.1"
const text = (packet: DatagramSocket.Datagram) => new TextDecoder().decode(packet.payload)
const bounded = <A, E, R>(effect: Effect.Effect<A, E, R>) => effect.pipe(Effect.timeout("5 seconds"))

// pull can return batches, so collect by packet count rather than pull count.
const collect = Effect.fnUntraced(function*(reader: DatagramSocket.Reader, count: number) {
  const packets: Array<DatagramSocket.Datagram> = []
  while (packets.length < count) packets.push(...(yield* reader.pull))
  assert.strictEqual(packets.length, count)
  return packets
})

const assertReason = (error: DatagramSocket.DatagramSocketError, tag: string) => {
  assert.instanceOf(error, DatagramSocket.DatagramSocketError)
  assert.strictEqual(error.reason._tag, tag)
}

describe("BunDatagramSocket", () => {
  it.effect("round trips IPv4 and replies using the received datagram", () =>
    bounded(Effect.scoped(Effect.gen(function*() {
      const server = yield* BunDatagramSocket.make({ bind: { address: host } })
      const client = yield* BunDatagramSocket.make({ bind: { address: host } })
      const serverReader = yield* server.reader
      const clientReader = yield* client.reader
      const serverWriter = yield* server.writer
      const clientWriter = yield* client.writer
      yield* clientWriter.writeAll([
        { payload: "one", address: serverReader.address },
        { payload: "two", address: serverReader.address }
      ])
      const received = yield* collect(serverReader, 2)
      assert.deepStrictEqual(received.map(text), ["one", "two"])
      for (const packet of received) yield* serverWriter.write({ payload: packet.payload, address: packet })
      assert.deepStrictEqual((yield* collect(clientReader, 2)).map(text), ["one", "two"])
    }))))

  it.effect("maps a thrown send once without retrying it", () =>
    bounded(Effect.scoped(Effect.gen(function*() {
      let sends = 0
      const native = {
        address: { address: host, port: 12345, family: "IPv4" },
        closed: false,
        reload: () => {},
        send: () => {
          sends++
          if (sends === 1) throw Object.assign(new Error("too large"), { code: "EMSGSIZE" })
          return true
        },
        close: () => {}
      } as unknown as BunDatagramSocket.UdpSocket
      const socket = yield* BunDatagramSocket.fromUdpSocket(Effect.succeed(native))
      yield* socket.reader
      const writer = yield* socket.writer
      const address = NetAddress.inetAddressFromIpStringUnsafe(host, 12346)
      const error = yield* Effect.flip(writer.write({ payload: "first", address }))
      assertReason(error, "DatagramSocketWriteError")
      if (error.reason._tag === "DatagramSocketWriteError") {
        assert.strictEqual(error.reason.kind, "MessageTooLarge")
        assert.deepStrictEqual(error.reason.address, address)
      }
      assert.strictEqual(sends, 1, "a thrown send must not be retried")
      yield* writer.write({ payload: "second", address })
      assert.strictEqual(sends, 2)
    }))))

  it.effect("stops draining when the socket closes and completes queued writes once", () =>
    bounded(Effect.scoped(Effect.gen(function*() {
      let handlers: Bun.udp.SocketHandler<"buffer"> | undefined
      let sends = 0
      let completions = 0
      let closed = false
      const native = {
        address: { address: host, port: 12345, family: "IPv4" },
        get closed() {
          return closed
        },
        reload: (options: { socket: Bun.udp.SocketHandler<"buffer"> }) => {
          handlers = options.socket
        },
        send: () => {
          sends++
          return false
        },
        sendMany: () => {
          sends++
          closed = true
          throw new Error("Socket is closed")
        },
        close: () => {
          closed = true
        }
      } as unknown as BunDatagramSocket.UdpSocket
      const socket = yield* BunDatagramSocket.fromUdpSocket(Effect.succeed(native))
      yield* socket.reader
      const writer = yield* socket.writer
      const destination = NetAddress.inetAddressFromIpStringUnsafe(host, 12346)
      const writes = ["one", "two", "three", "four"].map((payload) =>
        Effect.runFork(
          Effect.flip(writer.write({ payload, address: destination })).pipe(
            Effect.tap(() =>
              Effect.sync(() => {
                completions++
              })
            )
          )
        )
      )
      assert.strictEqual(sends, 1)
      assert.isFunction(handlers?.drain)
      handlers!.drain!(native)
      for (const write of writes) {
        assertReason(yield* Fiber.join(write), "DatagramSocketClosedError")
      }
      assert.strictEqual(sends, 2, "drain must not retry entries already failed by closure")
      assert.strictEqual(completions, writes.length)
    }))))

  it.effect("adopts a real socket, installs receive handlers, and detects a silent close on write", () =>
    bounded(Effect.scoped(Effect.gen(function*() {
      const native = yield* Effect.promise(() =>
        Bun.udpSocket({
          hostname: host,
          port: 0,
          socket: { data: () => {} }
        })
      )
      // The adopted reader owns the native socket once it has opened.
      const socket = yield* BunDatagramSocket.fromUdpSocket(Effect.succeed(native))
      const reader = yield* socket.reader
      const writer = yield* socket.writer
      const sender = yield* BunDatagramSocket.make({ bind: { address: host } })
      yield* sender.reader
      const senderWriter = yield* sender.writer
      yield* senderWriter.write({ payload: "adopted", address: reader.address })
      assert.deepStrictEqual((yield* collect(reader, 1)).map(text), ["adopted"])
      native.close() // no native error or drain callback
      const error = yield* Effect.flip(writer.write({ payload: "after-close", address: reader.address }))
      assertReason(error, "DatagramSocketClosedError")
      assertReason(yield* Effect.flip(reader.pull), "DatagramSocketClosedError")
    }))))
})
