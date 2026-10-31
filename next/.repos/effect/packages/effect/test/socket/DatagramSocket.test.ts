import { assert, describe, it } from "@effect/vitest"
import * as Deferred from "effect/Deferred"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Fiber from "effect/Fiber"
import * as NetAddress from "effect/net/NetAddress"
import * as Scope from "effect/Scope"
import * as DatagramSocket from "effect/socket/DatagramSocket"

const bytes = (text: string) => new TextEncoder().encode(text)
const address = NetAddress.inetAddressFromNativeUnsafe("127.0.0.1", 1234)
const failure = () =>
  new DatagramSocket.DatagramSocketError({
    reason: new DatagramSocket.DatagramSocketReadError({ kind: "Unknown", cause: new Error("read") })
  })

class TestHandle implements DatagramSocket.BackingSocket {
  readonly address = { host: "127.0.0.1", port: 1234 }
  peer: DatagramSocket.BackingAddress | undefined = undefined
  connected = false
  events!: DatagramSocket.BackingEvents
  sends: Array<{ payload: Uint8Array; destination?: DatagramSocket.BackingAddress | undefined }> = []
  closes = 0
  leaves = 0
  joins = 0
  failAt = 0
  sendCount = 0
  deferSends = false
  pending: Array<() => void> = []
  private sendError() {
    return new DatagramSocket.DatagramSocketError({
      reason: new DatagramSocket.DatagramSocketWriteError({ kind: "Unknown", cause: new Error("send") })
    })
  }
  readonly send: DatagramSocket.BackingSocket["send"] = (payload, destination, done) => {
    this.sends.push({ payload, destination })
    done()
  }
  readonly sendMany: DatagramSocket.BackingSocket["sendMany"] = (payloads, destinations, done) => {
    let error: DatagramSocket.DatagramSocketError | undefined
    let index: number | undefined
    for (let i = 0; i < payloads.length; i++) {
      if (++this.sendCount === this.failAt) {
        error = this.sendError()
        index = i
        break
      }
      this.sends.push({ payload: payloads[i]!, destination: destinations[i] })
    }
    if (this.deferSends) this.pending.push(() => done(error, index))
    else done(error, index)
  }
  readonly joinMulticast: DatagramSocket.BackingSocket["joinMulticast"] = () =>
    Effect.sync(() => {
      this.joins++
      return () =>
        Effect.sync(() => {
          this.leaves++
        })
    })
  close() {
    this.closes++
  }
  packet(text: string, host = "127.0.0.1", port = 9876) {
    this.events.onPacket(bytes(text), host, port)
  }
  error(error = failure()) {
    this.events.onReadError(error)
  }
}

const fixture = (options?: DatagramSocket.ReceiveBufferOptions) => {
  const handles: Array<TestHandle> = []
  return Effect.map(
    DatagramSocket.makeFromBackingSocket((events) =>
      Effect.sync(() => {
        const handle = new TestHandle()
        handle.events = events
        handles.push(handle)
        return handle
      }), { receiveBuffer: options }),
    (socket) => ({ socket, handles })
  )
}

const texts = (batch: ReadonlyArray<DatagramSocket.Datagram>) =>
  batch.map((packet) => new TextDecoder().decode(packet.payload))

const writeReason = (error: DatagramSocket.DatagramSocketError): DatagramSocket.DatagramSocketWriteError => {
  assert.strictEqual(error.reason._tag, "DatagramSocketWriteError")
  return error.reason as DatagramSocket.DatagramSocketWriteError
}

const delayedOpen = Effect.gen(function*() {
  const firstStarted = yield* Deferred.make<void>()
  const secondStarted = yield* Deferred.make<void>()
  const pending: Array<{ resolve: (handle: TestHandle) => void }> = []
  const socket = yield* DatagramSocket.makeFromBackingSocket((events) =>
    Effect.promise(() =>
      new Promise<TestHandle>((resolve) => {
        const count = pending.push({
          resolve: (handle) => {
            handle.events = events
            resolve(handle)
          }
        })
        Effect.runSync(Deferred.succeed(count === 1 ? firstStarted : secondStarted, undefined))
      })
    )
  )
  return { socket, pending, firstStarted, secondStarted }
})

describe("DatagramSocket native handle", () => {
  it.effect(
    "waits for an orphaned open before rebinding",
    () =>
      Effect.scoped(Effect.gen(function*() {
        const { socket, pending, firstStarted, secondStarted } = yield* delayedOpen
        const first = yield* socket.reader.pipe(Effect.forkChild({ startImmediately: true }))
        yield* Deferred.await(firstStarted)
        const interrupted = yield* Fiber.interrupt(first).pipe(Effect.forkChild({ startImmediately: true }))
        yield* Effect.yieldNow
        assert.isDefined(interrupted.pollUnsafe(), "interruption must finish before open resolves")
        const second = yield* socket.reader.pipe(Effect.forkChild({ startImmediately: true }))
        yield* Effect.yieldNow
        assert.strictEqual(pending.length, 1, "a retry must not overlap an orphaned open")
        const old = new TestHandle()
        pending[0]!.resolve(old)
        yield* Deferred.await(secondStarted)
        assert.strictEqual(pending.length, 2)
        assert.strictEqual(old.closes, 1)
        pending[1]!.resolve(new TestHandle())
        yield* Fiber.join(second)
      }))
  )

  it.effect("resumes an already-parked pull before the native packet callback returns", () =>
    Effect.scoped(Effect.gen(function*() {
      const { socket, handles } = yield* fixture()
      const reader = yield* socket.reader
      const received: Array<string> = []
      const pull = yield* reader.pull.pipe(
        Effect.tap((batch) =>
          Effect.sync(() => {
            received.push(...texts(batch))
          })
        ),
        Effect.forkChild({ startImmediately: true })
      )
      yield* Effect.yieldNow
      assert.isUndefined(pull.pollUnsafe(), "the pull must be parked before delivery")
      const handle = handles[0]!
      handle.packet("inline")
      // No yield or await between the native callback and this assertion:
      // a scheduled wake cannot run until this synchronous stack returns.
      assert.deepStrictEqual(received, ["inline"])
      assert.deepStrictEqual(texts(yield* Fiber.join(pull)), ["inline"])
    })))

  it.effect("fails every parked pull on scope close", () =>
    Effect.gen(function*() {
      const { socket, handles } = yield* fixture()
      const scope = yield* Scope.make()
      const reader = yield* socket.reader.pipe(Scope.provide(scope))
      const first = yield* reader.pull.pipe(Effect.exit, Effect.forkChild({ startImmediately: true }))
      yield* Effect.yieldNow
      const second = yield* reader.pull.pipe(Effect.exit, Effect.forkChild({ startImmediately: true }))
      yield* Effect.yieldNow
      yield* Scope.close(scope, Exit.void)
      assert.strictEqual(handles[0]!.closes, 1)
      yield* Effect.yieldNow
      assert.isDefined(first.pollUnsafe(), "scope close must wake the first waiter")
      assert.isDefined(second.pollUnsafe(), "scope close must wake the second waiter")
      assert.include(JSON.stringify(yield* Fiber.join(first)), "DatagramSocketClosedError")
      assert.include(JSON.stringify(yield* Fiber.join(second)), "DatagramSocketClosedError")
    }))

  it.effect("fails the slot and queued waiters with the same terminal read error", () =>
    Effect.scoped(Effect.gen(function*() {
      const { socket, handles } = yield* fixture()
      const reader = yield* socket.reader
      const first = yield* reader.pull.pipe(Effect.exit, Effect.forkChild({ startImmediately: true }))
      yield* Effect.yieldNow
      assert.isUndefined(first.pollUnsafe(), "the first pull occupies the waiter slot")
      const second = yield* reader.pull.pipe(Effect.exit, Effect.forkChild({ startImmediately: true }))
      yield* Effect.yieldNow
      assert.isUndefined(second.pollUnsafe(), "the second pull waits behind the slot")
      const error = failure()
      handles[0]!.error(error)
      yield* Effect.yieldNow
      assert.isDefined(first.pollUnsafe(), "read error must wake the first waiter")
      assert.isDefined(second.pollUnsafe(), "read error must wake the second waiter")
      const a = yield* Fiber.join(first)
      const b = yield* Fiber.join(second)
      assert.isTrue(Exit.isFailure(a))
      assert.deepStrictEqual(a, b)
      assert.deepStrictEqual(yield* Effect.exit(reader.pull), a)
      assert.include(JSON.stringify(a), "DatagramSocketReadError")
    })))

  it.effect("keeps FIFO order when a waiting pull is promoted", () =>
    Effect.scoped(Effect.gen(function*() {
      const { socket, handles } = yield* fixture()
      const reader = yield* socket.reader
      const cancelled = yield* reader.pull.pipe(Effect.forkChild({ startImmediately: true }))
      yield* Effect.yieldNow
      const first = yield* reader.pull.pipe(Effect.forkChild({ startImmediately: true }))
      yield* Effect.yieldNow
      const second = yield* reader.pull.pipe(Effect.forkChild({ startImmediately: true }))
      yield* Effect.yieldNow
      yield* Fiber.interrupt(cancelled)
      const third = yield* reader.pull.pipe(Effect.forkChild({ startImmediately: true }))
      yield* Effect.yieldNow
      const handle = handles[0]!
      handle.packet("first")
      assert.deepStrictEqual(texts(yield* Fiber.join(first)), ["first"])
      assert.isUndefined(second.pollUnsafe())
      assert.isUndefined(third.pollUnsafe())
      handle.packet("second")
      assert.deepStrictEqual(texts(yield* Fiber.join(second)), ["second"])
      handle.packet("third")
      assert.deepStrictEqual(texts(yield* Fiber.join(third)), ["third"])
    })))

  for (const strategy of ["dropping", "sliding"] as const) {
    it.effect(`overflow using ${strategy}`, () =>
      Effect.scoped(Effect.gen(function*() {
        const { socket, handles } = yield* fixture({ capacity: 2, strategy })
        const reader = yield* socket.reader
        const handle = handles[0]!
        handle.packet("retained", "127.0.0.2", 1001)
        const [retained] = yield* reader.pull
        handle.packet("a")
        handle.packet("b")
        handle.packet("c")
        assert.deepStrictEqual(texts(yield* reader.pull), strategy === "dropping" ? ["a", "b"] : ["b", "c"])
        assert.strictEqual(reader.dropped(), 1)
        assert.deepStrictEqual(texts([retained]), ["retained"])
        assert.strictEqual(retained.address.port, 1001)
      })))
  }

  it.effect("delivers queued packets before a sticky read error", () =>
    Effect.scoped(Effect.gen(function*() {
      const { socket, handles } = yield* fixture()
      const reader = yield* socket.reader
      const error = failure()
      const { onPacket, onReadError } = handles[0]!.events
      onPacket(bytes("queued"), "127.0.0.1", 9876)
      onReadError(error)
      assert.deepStrictEqual(texts(yield* reader.pull), ["queued"])
      assert.strictEqual(Exit.isFailure(yield* Effect.exit(reader.pull)), true)
      assert.deepStrictEqual(yield* Effect.exit(reader.pull), yield* Effect.exit(reader.pull))
    })))

  it.effect("rejects a write with no destination and no peer before sending", () =>
    Effect.scoped(Effect.gen(function*() {
      const { socket, handles } = yield* fixture()
      yield* socket.reader
      const writer = yield* socket.writer
      const handle = handles[0]!
      const single = writeReason(yield* Effect.flip(writer.write({ payload: "one" })))
      assert.isUndefined(single.address)
      assert.include(String(single.cause), "no peer")
      const batch = writeReason(yield* Effect.flip(writer.writeAll([{ payload: "a", address }, { payload: "b" }])))
      assert.isUndefined(batch.address)
      assert.strictEqual(handle.sends.length, 0)
      // with a peer, the same writes go out
      handle.peer = { host: "10.0.0.1", port: 53 }
      yield* writer.write({ payload: "one" })
      yield* writer.writeAll([{ payload: "a", address }, { payload: "b" }])
      assert.deepStrictEqual(handle.sends.map((send) => send.destination?.port), [53, 1234, 53])
    })))

  it.effect("rejects an explicit address on a connected socket and sends the rest without one", () =>
    Effect.scoped(Effect.gen(function*() {
      const { socket, handles } = yield* fixture()
      const reader = yield* socket.reader
      const writer = yield* socket.writer
      const handle = handles[0]!
      handle.connected = true
      handle.peer = { host: "10.0.0.1", port: 53 }
      const single = writeReason(yield* Effect.flip(writer.write({ payload: "one", address })))
      assert.deepStrictEqual(single.address, address)
      const batch = writeReason(yield* Effect.flip(writer.writeAll([{ payload: "a" }, { payload: "b", address }])))
      assert.deepStrictEqual(batch.address, address)
      assert.strictEqual(handle.sends.length, 0)
      handle.packet("hello", "127.0.0.2", 3000)
      const [packet] = yield* reader.pull
      yield* writer.write({ payload: "one" })
      yield* writer.write({ payload: packet.payload, address: packet })
      yield* writer.writeAll([{ payload: "a" }, { payload: "b", address: packet }])
      assert.strictEqual(handle.sends.length, 4)
      assert.isTrue(handle.sends.every((send) => send.destination === undefined))
    })))

  it.effect("resumes a parked writeAll and reports a deferred batch failure's destination", () =>
    Effect.scoped(Effect.gen(function*() {
      const { socket, handles } = yield* fixture()
      yield* socket.reader
      const writer = yield* socket.writer
      const handle = handles[0]!
      handle.deferSends = true
      const first = yield* writer.writeAll([{ payload: "a", address }, { payload: "b", address }]).pipe(
        Effect.exit,
        Effect.forkChild({ startImmediately: true })
      )
      yield* Effect.yieldNow
      assert.isUndefined(first.pollUnsafe(), "writeAll must wait for the runtime to report the batch")
      assert.strictEqual(handle.pending.length, 1)
      handle.pending.shift()!()
      assert.isTrue(Exit.isSuccess(yield* Fiber.join(first)))
      handle.failAt = 4
      const destination = NetAddress.inetAddressFromNativeUnsafe("127.0.0.2", 2345)
      const second = yield* writer.writeAll([
        { payload: "c", address },
        { payload: "d", address: destination },
        { payload: "not sent", address }
      ]).pipe(
        Effect.exit,
        Effect.forkChild({ startImmediately: true })
      )
      yield* Effect.yieldNow
      assert.isUndefined(second.pollUnsafe())
      handle.pending.shift()!()
      const exit = yield* Fiber.join(second)
      assert.isTrue(Exit.isFailure(exit))
      assert.include(JSON.stringify(exit), "127.0.0.2")
      assert.strictEqual(handle.sends.length, 3, "the batch must stop at the first failure")
    })))

  it.effect("leaves a multicast group when its scope closes", () =>
    Effect.scoped(Effect.gen(function*() {
      const { socket, handles } = yield* fixture()
      const reader = yield* socket.reader
      const group = NetAddress.ipv4FromBytesUnsafe(new Uint8Array([224, 0, 0, 1])) as NetAddress.MulticastAddress<
        NetAddress.Ipv4Address
      >
      yield* Effect.scoped(reader.joinMulticast({ group }))
      assert.strictEqual(handles[0]!.joins, 1)
      assert.strictEqual(handles[0]!.leaves, 1)
    })))
})
