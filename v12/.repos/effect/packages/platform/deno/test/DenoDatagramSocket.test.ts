import * as DenoDatagramSocket from "@effect/platform-deno/DenoDatagramSocket"
import { assert, describe, it } from "@effect/vitest"
import { Effect } from "effect"
import * as NetAddress from "effect/net/NetAddress"
import type * as DatagramSocket from "effect/socket/DatagramSocket"

const host = "127.0.0.1"
const address = (host: string, port: number) => NetAddress.inetAddressFromIpStringUnsafe(host, port)
const text = (payload: Uint8Array) => new TextDecoder().decode(payload)
const bounded = <A, E, R>(effect: Effect.Effect<A, E, R>) => effect.pipe(Effect.scoped, Effect.timeout("3 seconds"))
const take = (reader: DatagramSocket.Reader, count: number) =>
  Effect.gen(function*() {
    const packets: Array<DatagramSocket.Datagram> = []
    while (packets.length < count) packets.push(...(yield* reader.pull))
    return packets
  })

describe("DenoDatagramSocket", () => {
  it.effect("round trips IPv4 and replies through the received datagram", () =>
    bounded(Effect.gen(function*() {
      const server = yield* DenoDatagramSocket.make({ bind: { address: host } })
      const client = yield* DenoDatagramSocket.make({ bind: { address: host } })
      const incoming = yield* server.reader
      const sender = yield* client.reader
      const serverWriter = yield* server.writer
      const clientWriter = yield* client.writer
      yield* clientWriter.writeAll([
        { payload: "ping-1", address: incoming.address },
        { payload: "ping-2", address: incoming.address }
      ])
      const requests = yield* take(incoming, 2)
      assert.deepStrictEqual(requests.map((packet) => text(packet.payload)), ["ping-1", "ping-2"])
      for (const request of requests) yield* serverWriter.write({ payload: "pong", address: request })
      const replies = yield* take(sender, 2)
      assert.deepStrictEqual(replies.map((packet) => text(packet.payload)), ["pong", "pong"])
      assert.strictEqual(replies[0].address.port, incoming.address.port)
    })))

  it("waits for each Deno batch send to finish on a warm socket", async () => {
    const sends: Array<{ payload: string; complete: () => void }> = []
    const waiters: Array<() => void> = []
    const conn = {
      addr: { transport: "udp", hostname: host, port: 12345 },
      receive: () => new Promise<never>(() => {}),
      send: (payload: Uint8Array) =>
        new Promise<number>((resolve) => {
          sends.push({ payload: text(payload), complete: () => resolve(payload.length) })
          waiters.shift()?.()
        }),
      close: () => {}
    } as unknown as Deno.DatagramConn
    const sent = (count: number) =>
      sends.length >= count
        ? Promise.resolve()
        : new Promise<void>((resolve) => waiters.push(resolve))
    const socket = Effect.runSync(DenoDatagramSocket.fromDatagramConn(Effect.succeed(conn)))

    await Effect.runPromise(Effect.scoped(Effect.gen(function*() {
      yield* socket.reader
      const writer = yield* socket.writer
      const destination = address(host, 12345)
      yield* Effect.promise(async () => {
        const warming = Effect.runPromise(writer.write({ payload: "warm", address: destination }))
        await sent(1)
        sends[0].complete()
        await warming

        const batch = Effect.runPromise(writer.writeAll([
          { payload: "first", address: destination },
          { payload: "second", address: destination }
        ]))
        try {
          for (let i = 0; i < 2; i++) {
            await sent(i + 2)
            assert.strictEqual(sends.length, i + 2, "a send started before the previous one completed")
            assert.strictEqual(sends[i + 1].payload, ["first", "second"][i])
            sends[i + 1].complete()
          }
          await batch
        } finally {
          for (const send of sends) send.complete()
        }
      })
    })))
  })

  it.effect("maps an occupied port to an open error", () =>
    bounded(Effect.gen(function*() {
      const first = yield* DenoDatagramSocket.make({ bind: { address: host } })
      const reader = yield* first.reader
      const second = yield* DenoDatagramSocket.make({ bind: { address: host, port: reader.address.port } })
      const error = yield* second.reader.pipe(Effect.scoped, Effect.flip)
      assert.strictEqual(error.reason._tag, "DatagramSocketOpenError")
      assert.strictEqual(error.reason._tag === "DatagramSocketOpenError" && error.reason.kind, "AddressInUse")
    })))

  it.effect("maps an oversized native send to a write error", () =>
    bounded(Effect.gen(function*() {
      const socket = yield* DenoDatagramSocket.make({ bind: { address: host } })
      const reader = yield* socket.reader
      const writer = yield* socket.writer
      const error = yield* writer.write({ payload: new Uint8Array(65508), address: reader.address }).pipe(Effect.flip)
      assert.strictEqual(error.reason._tag, "DatagramSocketWriteError")
      assert.strictEqual(error.reason._tag === "DatagramSocketWriteError" && error.reason.kind, "MessageTooLarge")
    })))
})
