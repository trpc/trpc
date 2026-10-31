import * as NodeDatagramSocket from "@effect/platform-node-shared/NodeDatagramSocket"
import { assert, describe, it } from "@effect/vitest"
import * as Deferred from "effect/Deferred"
import * as Effect from "effect/Effect"
import * as NetAddress from "effect/net/NetAddress"
import type * as DatagramSocket from "effect/socket/DatagramSocket"
import * as Dgram from "node:dgram"
import type * as Dns from "node:dns"
import { vi } from "vitest"

// Keep calls outside mock histories, which concurrent tests can clear.
const lookupCalls = vi.hoisted(() => [] as Array<string>)
vi.mock("node:dns", async (importOriginal) => {
  const original = await importOriginal<typeof Dns>()
  const lookup = (...args: Parameters<typeof original.lookup>) => {
    lookupCalls.push(args[0])
    return Reflect.apply(original.lookup, original, args)
  }
  return { ...original, lookup, default: { ...original, lookup } }
})

const loopback = { address: "127.0.0.1", port: 0 }
const decoder = new TextDecoder()
const text = (datagrams: ReadonlyArray<DatagramSocket.Datagram>) =>
  datagrams.map((datagram) => decoder.decode(datagram.payload))

const open = Effect.fnUntraced(function*(options?: NodeDatagramSocket.Options) {
  const socket = yield* NodeDatagramSocket.make(options)
  const reader = yield* socket.reader
  const writer = yield* socket.writer
  return { reader, writer }
})

// Pulls until `count` datagrams arrived. A lost packet fails the timeout
// instead of hanging the test.
const pullN = Effect.fnUntraced(function*(reader: DatagramSocket.Reader, count: number) {
  const received: Array<DatagramSocket.Datagram> = []
  while (received.length < count) received.push(...(yield* reader.pull))
  return received
}, Effect.timeout("2 seconds"))

describe("NodeDatagramSocket", () => {
  it.live("IPv4 round trip, replying through the received datagram", () =>
    Effect.gen(function*() {
      const server = yield* open({ bind: loopback })
      const client = yield* open({ bind: loopback })
      yield* client.writer.writeAll([
        { payload: "a", address: server.reader.address },
        { payload: "b", address: server.reader.address }
      ])
      const received = yield* pullN(server.reader, 2)
      assert.deepStrictEqual(text(received), ["a", "b"])
      assert.strictEqual(NetAddress.formatInet(received[0].address), NetAddress.formatInet(client.reader.address))

      for (const datagram of received) {
        yield* server.writer.write({ payload: datagram.payload, address: datagram })
      }
      const replies = yield* pullN(client.reader, 2)
      assert.deepStrictEqual(text(replies), ["a", "b"])
      assert.strictEqual(NetAddress.formatInet(replies[0].address), NetAddress.formatInet(server.reader.address))
    }), 5_000)

  it.live("resolves a hostname peer once per reader", () =>
    Effect.gen(function*() {
      const lookups = () => lookupCalls.filter((hostname) => hostname === "localhost").length
      const before = lookups()
      const server = yield* open({ bind: loopback })
      const client = yield* open({ peer: { address: "localhost", port: server.reader.address.port } })
      for (const payload of ["a", "b", "c"]) {
        yield* client.writer.write({ payload })
      }
      const received = yield* pullN(server.reader, 3)
      assert.deepStrictEqual(text(received), ["a", "b", "c"])
      assert.strictEqual(lookups() - before, 1)
    }), 5_000)

  it.live("a send error fails the write with DatagramSocketWriteError", () =>
    Effect.gen(function*() {
      const server = yield* open({ bind: loopback })
      const client = yield* open({ bind: loopback })
      const address = server.reader.address
      const tooLarge = new Uint8Array(70_000)

      const error = yield* Effect.flip(client.writer.write({ payload: tooLarge, address }))
      const reason = error.reason
      if (reason._tag !== "DatagramSocketWriteError") return assert.fail("expected a write error")
      assert.strictEqual(reason.kind, "MessageTooLarge")
      assert.strictEqual(reason.address && NetAddress.formatInet(reason.address), NetAddress.formatInet(address))

      // a send error is not terminal
      yield* client.writer.write({ payload: "b", address })
      const received = yield* pullN(server.reader, 1)
      assert.deepStrictEqual(text(received), ["b"])
    }), 5_000)

  it.live("fromSocket adopts a bound socket and closes it with the reader", () =>
    Effect.gen(function*() {
      const server = yield* open({ bind: loopback })
      const adopted: Array<Dgram.Socket> = []
      const closed = yield* Deferred.make<void>()
      const socket = yield* NodeDatagramSocket.fromSocket(
        Effect.callback<Dgram.Socket>((resume) => {
          const native = Dgram.createSocket("udp4")
          native.once("close", () => Deferred.doneUnsafe(closed, Effect.void))
          adopted.push(native)
          native.bind(0, "127.0.0.1", () => resume(Effect.succeed(native)))
        }),
        { peer: server.reader.address }
      )
      yield* Effect.scoped(Effect.gen(function*() {
        const reader = yield* socket.reader
        const writer = yield* socket.writer
        assert.strictEqual(reader.address.port, adopted[0].address().port)
        yield* writer.write({ payload: "a" })
        const received = yield* pullN(server.reader, 1)
        assert.deepStrictEqual(text(received), ["a"])
        assert.strictEqual(received[0].address.port, reader.address.port)
      }))
      yield* Deferred.await(closed).pipe(Effect.timeout("2 seconds"))
    }), 5_000)
})
