import { assert, describe, it } from "@effect/vitest"
import { Cause, Deferred, Effect, Exit, Fiber, Layer, Queue, Schedule, Schema, Stream } from "effect"
import * as HttpClient from "effect/http/HttpClient"
import * as HttpClientResponse from "effect/http/HttpClientResponse"
import { Rpc, RpcClient, RpcGroup, RpcMessage, RpcSchema, RpcSerialization } from "effect/rpc"
import { RpcClientDefect, RpcClientError } from "effect/rpc/RpcClientError"
import * as Socket from "effect/socket/Socket"
import { TestClock } from "effect/testing"
import * as Worker from "effect/workers/Worker"
import { WorkerError, WorkerReceiveError } from "effect/workers/WorkerError"
import { vi } from "vitest"
import type * as RpcClientErrorModule from "../../src/rpc/RpcClientError.ts"

const TestGroup = RpcGroup.make(
  Rpc.make("Ping", { success: Schema.String }),
  Rpc.make("Events", { success: RpcSchema.Stream(Schema.String, Schema.Never) })
)

const ChunkGroup = RpcGroup.make(
  Rpc.make("Bad", { success: RpcSchema.Stream(Schema.Number, Schema.Never) }),
  Rpc.make("Good", { success: RpcSchema.Stream(Schema.String, Schema.Never) }),
  Rpc.make("Unary", { success: Schema.String })
)

const makeChunkProtocol = (beforeInterrupt: Effect.Effect<void> = Effect.void) =>
  Effect.gen(function*() {
    const received = yield* Deferred.make<Parameters<RpcClient.Protocol["Service"]["run"]>[1]>()
    const sent = yield* Queue.unbounded<Parameters<RpcClient.Protocol["Service"]["send"]>[1]>()
    const protocol = RpcClient.Protocol.of({
      codecFor: RpcSerialization.json.codecFor,
      supportsAck: false,
      supportsTransferables: false,
      run: (_clientId, handle) => Deferred.succeed(received, handle).pipe(Effect.andThen(Effect.never)),
      send: (_clientId, message) =>
        Effect.andThen(
          message._tag === "Interrupt" ? beforeInterrupt : Effect.void,
          Effect.asVoid(Queue.offer(sent, message))
        )
    })
    const client = yield* RpcClient.make(ChunkGroup).pipe(Effect.provideService(RpcClient.Protocol, protocol))
    const handle = yield* Deferred.await(received)
    return { client, handle, sent }
  })

const takeRequestId = (message: Parameters<RpcClient.Protocol["Service"]["send"]>[1]) => {
  assert(message._tag === "Request")
  return message.id
}

const makeHttpClient = (body: string): HttpClient.HttpClient =>
  HttpClient.make((request) =>
    Effect.succeed(
      HttpClientResponse.fromWeb(
        request,
        new Response(body, { status: 200 })
      )
    )
  )

const makeProtocolLayerWithClient = (
  serializationLayer: Layer.Layer<RpcSerialization.RpcSerialization>,
  client: HttpClient.HttpClient
) =>
  RpcClient.layerProtocolHttp({ url: "http://localhost/rpc" }).pipe(
    Layer.provideMerge(serializationLayer),
    Layer.provideMerge(Layer.succeed(HttpClient.HttpClient, client))
  )

const makeProtocolLayer = (
  serializationLayer: Layer.Layer<RpcSerialization.RpcSerialization>,
  body: string
) => makeProtocolLayerWithClient(serializationLayer, makeHttpClient(body))

const assertEmptyResponseFailsRequest = (
  serializationLayer: Layer.Layer<RpcSerialization.RpcSerialization>,
  body: string
) =>
  Effect.gen(function*() {
    const client = yield* RpcClient.make(TestGroup).pipe(
      Effect.provide(makeProtocolLayer(serializationLayer, body))
    )

    const cause = yield* client.Ping().pipe(
      Effect.timeout("1 second"),
      Effect.sandbox,
      Effect.flip
    )

    const error = Cause.squash(cause)
    assert.instanceOf(error, RpcClientError)
    assert.strictEqual(error.reason._tag, "RpcClientDefect")
    assert.strictEqual(error.reason.message, "Received empty HTTP response from RPC server")
  })

describe("RpcClient", () => {
  it.effect("does not fail a new request started synchronously during protocol error delivery", () =>
    Effect.gen(function*() {
      const { client, handle, sent } = yield* makeChunkProtocol()
      const error = new RpcClientError({
        reason: new RpcClientDefect({ message: "connection dropped", cause: undefined })
      })
      const caller = yield* client.Unary().pipe(
        Effect.catch((received) => {
          assert.strictEqual(received, error)
          return client.Unary()
        }),
        Effect.exit,
        Effect.forkChild
      )
      takeRequestId(yield* Queue.take(sent))
      // Let the first call suspend before delivering the error.
      yield* Effect.yieldNow
      yield* handle({ _tag: "ClientProtocolError", error })

      const retryRequestId = takeRequestId(yield* Queue.take(sent))
      yield* handle({ _tag: "Exit", requestId: retryRequestId, exit: { _tag: "Success", value: "ok" } })
      assert.deepStrictEqual(yield* Fiber.join(caller), Exit.succeed("ok"))
    }))

  it.effect("isolates a malformed stream chunk and interrupts its server request", () =>
    Effect.gen(function*() {
      const { client, handle, sent } = yield* makeChunkProtocol()
      const bad = yield* client.Bad().pipe(Stream.runDrain, Effect.exit, Effect.forkChild)
      const badRequestId = takeRequestId(yield* Queue.take(sent))

      const good = yield* client.Good().pipe(Stream.runCollect, Effect.forkChild)
      const goodRequestId = takeRequestId(yield* Queue.take(sent))

      const unary = yield* client.Unary().pipe(Effect.forkChild)
      const unaryRequestId = takeRequestId(yield* Queue.take(sent))

      // A decode defect must not escape into the shared protocol receive loop.
      yield* handle({ _tag: "Chunk", requestId: badRequestId, values: ["not a number"] })
      const badExit = yield* Fiber.join(bad)
      assert(Exit.isFailure(badExit))
      assert.isFalse(Cause.hasInterruptsOnly(badExit.cause))
      assert.deepStrictEqual(yield* Queue.take(sent), { _tag: "Interrupt", requestId: badRequestId })

      yield* handle({ _tag: "Chunk", requestId: goodRequestId, values: ["alive"] })
      yield* handle({ _tag: "Exit", requestId: goodRequestId, exit: { _tag: "Success", value: null } })
      yield* handle({ _tag: "Exit", requestId: unaryRequestId, exit: { _tag: "Success", value: "ok" } })
      assert.deepStrictEqual(Array.from(yield* Fiber.join(good)), ["alive"])
      assert.strictEqual(yield* Fiber.join(unary), "ok")
    }))

  it.effect("preserves cancellation and the server Interrupt during chunk failure cleanup", () =>
    Effect.gen(function*() {
      const sendingInterrupt = yield* Deferred.make<void>()
      const releaseInterrupt = yield* Deferred.make<void>()
      const { client, handle, sent } = yield* makeChunkProtocol(
        Deferred.succeed(sendingInterrupt, void 0).pipe(Effect.andThen(Deferred.await(releaseInterrupt)))
      )
      const reader = yield* client.Bad().pipe(Stream.runDrain, Effect.forkChild)
      const requestId = takeRequestId(yield* Queue.take(sent))
      let observedInterrupt = false
      const receiver = yield* handle({ _tag: "Chunk", requestId, values: ["not a number"] }).pipe(
        Effect.onInterrupt(() => Effect.sync(() => void (observedInterrupt = true))),
        Effect.forkChild
      )
      yield* Deferred.await(sendingInterrupt)
      assert(Exit.isFailure(yield* Fiber.await(reader)))

      // Request cancellation while the Interrupt send is suspended, without waiting for it.
      yield* Effect.withFiber((fiber) => Effect.sync(() => receiver.interruptUnsafe(fiber.id)))
      yield* Deferred.succeed(releaseInterrupt, void 0)
      const receiveExit = yield* Fiber.await(receiver)
      assert.deepStrictEqual(yield* Queue.clear(sent), [{ _tag: "Interrupt", requestId }])
      // The cancelled handler must end interrupted, not with the decode defect it already handled.
      assert(Exit.isFailure(receiveExit) && Cause.hasInterruptsOnly(receiveExit.cause))
      assert.isTrue(observedInterrupt)
    }))

  it.effect("releases a chunk blocked on a full buffer when its stream consumer is interrupted", () =>
    Effect.gen(function*() {
      const consuming = yield* Deferred.make<void>()
      const { client, handle, sent } = yield* makeChunkProtocol()
      const reader = yield* client.Good(undefined, { streamBufferSize: 1 }).pipe(
        Stream.runForEach(() => Deferred.succeed(consuming, void 0).pipe(Effect.andThen(Effect.never))),
        Effect.forkChild
      )
      const requestId = takeRequestId(yield* Queue.take(sent))
      const receiver = yield* handle({ _tag: "Chunk", requestId, values: ["a", "b", "c"] }).pipe(Effect.forkChild)
      yield* Deferred.await(consuming)
      assert.isUndefined(receiver.pollUnsafe())
      yield* Fiber.interrupt(reader)

      assert(Exit.isSuccess(yield* Fiber.await(receiver)))
      assert.deepStrictEqual(yield* Queue.take(sent), { _tag: "Interrupt", requestId })
    }))

  for (const consumer of ["queue", "stream"] as const) {
    it.effect(`releases the ${consumer} consumer when the request write is interrupted`, () =>
      Effect.gen(function*() {
        const writing = yield* Deferred.make<Fiber.Fiber<unknown, unknown>>()
        const { client } = yield* RpcClient.makeNoSerialization(TestGroup, {
          onFromClient: ({ message }) =>
            message._tag === "Request"
              ? Effect.withFiber((fiber) => Deferred.succeed(writing, fiber).pipe(Effect.andThen(Effect.never)))
              : Effect.void
        })
        const reader = yield* (consumer === "queue"
          ? client.Events(undefined, { asQueue: true }).pipe(Effect.flatMap(Queue.take), Effect.asVoid)
          : Stream.runDrain(client.Events())).pipe(Effect.forkChild)
        const writer = yield* Deferred.await(writing)
        yield* Fiber.interrupt(writer)
        const readExit = yield* Fiber.await(reader)
        assert(Exit.isFailure(readExit) && Cause.hasInterruptsOnly(readExit.cause))
      }))
  }

  it.effect("releases a worker pool slot when the worker run fails", () =>
    Effect.gen(function*() {
      const runFailure = yield* Deferred.make<never, WorkerError>()
      const firstRequestSent = yield* Deferred.make<void>()
      const secondRequestSent = yield* Deferred.make<void>()
      const protocolErrorReceived = yield* Deferred.make<void>()
      const sentRequestIds: Array<string | number> = []
      let runCount = 0
      const backing: Worker.Worker<any, any> = {
        send(message) {
          return Effect.sync(() => {
            if (message._tag !== "Request") return
            sentRequestIds.push(message.id)
          }).pipe(
            Effect.andThen(
              message._tag === "Request" && message.id === 1
                ? Deferred.succeed(firstRequestSent, void 0)
                : message._tag === "Request" && message.id === 2
                ? Deferred.succeed(secondRequestSent, void 0)
                : Effect.void
            )
          )
        },
        run() {
          return runCount++ === 0 ? Deferred.await(runFailure) : Effect.never
        }
      }
      const workerPlatform = Worker.WorkerPlatform.of({
        spawn: () => Effect.succeed(backing)
      })
      const protocol = yield* RpcClient.makeProtocolWorker({ size: 1, concurrency: 1 }).pipe(
        Effect.provideService(Worker.WorkerPlatform, workerPlatform),
        Effect.provideService(Worker.Spawner, (() => undefined) as Worker.SpawnerFn)
      )
      yield* protocol.run(0, (response) =>
        response._tag === "ClientProtocolError"
          ? Deferred.succeed(protocolErrorReceived, void 0)
          : Effect.void).pipe(Effect.forkScoped)

      const request = (id: number) => ({
        _tag: "Request" as const,
        id,
        tag: "Test",
        payload: null,
        headers: []
      })
      const first = yield* protocol.send(0, request(1)).pipe(Effect.forkChild)
      yield* Deferred.await(firstRequestSent)
      yield* Deferred.fail(
        runFailure,
        new WorkerError({ reason: new WorkerReceiveError({ message: "worker exited" }) })
      )
      yield* Deferred.await(protocolErrorReceived)

      const firstCompleted = yield* Fiber.join(first).pipe(
        Effect.timeout("1 second"),
        Effect.forkChild
      )
      yield* TestClock.adjust("1 second")
      yield* Fiber.join(firstCompleted)

      const second = yield* protocol.send(0, request(2)).pipe(Effect.forkChild)
      const secondSent = yield* Deferred.await(secondRequestSent).pipe(
        Effect.timeout("1 second"),
        Effect.forkChild
      )
      yield* TestClock.adjust("1 second")
      yield* Fiber.join(secondSent)
      yield* Fiber.interrupt(second)
      assert.deepStrictEqual(sentRequestIds, [1, 2])
    }))

  it("preserves RpcClientError failures from a reloaded module copy", async () => {
    vi.resetModules()
    const ForeignRpcClientError = await vi.importActual<typeof RpcClientErrorModule>(
      "../../src/rpc/RpcClientError.ts"
    )
    const rpcClientError = new ForeignRpcClientError.RpcClientError({
      reason: new ForeignRpcClientError.RpcClientDefect({ message: "boom", cause: undefined })
    })
    assert.isFalse(rpcClientError instanceof RpcClientError)

    const httpClient = HttpClient.make((request) => {
      const response = HttpClientResponse.fromWeb(request, new Response("", { status: 200 }))
      Object.defineProperty(response, "stream", { value: Stream.fail(rpcClientError) })
      return Effect.succeed(response)
    })
    const error = await Effect.gen(function*() {
      const client = yield* RpcClient.make(TestGroup).pipe(
        Effect.provide(makeProtocolLayerWithClient(RpcSerialization.layerNdjson, httpClient))
      )
      return yield* client.Ping().pipe(Effect.flip)
    }).pipe(Effect.scoped, Effect.runPromise)

    assert.strictEqual(error, rpcClientError)
  })

  it.effect("fails request on empty HTTP response for unframed serialization", () =>
    assertEmptyResponseFailsRequest(RpcSerialization.layerJson, "[]"))

  it.effect("fails request on empty HTTP response for framed serialization", () =>
    assertEmptyResponseFailsRequest(RpcSerialization.layerNdjson, ""))

  it.effect("defects request when framed HTTP response closes before request completes", () =>
    Effect.gen(function*() {
      const client = yield* RpcClient.make(TestGroup, {
        generateRequestId: () => RpcMessage.RequestId("0")
      }).pipe(
        Effect.provide(makeProtocolLayer(
          RpcSerialization.layerNdjson,
          JSON.stringify({ _tag: "Chunk", requestId: "0", values: ["event"] }) + "\n"
        ))
      )

      const cause = yield* client.Events().pipe(
        Stream.runDrain,
        Effect.timeout("1 second"),
        Effect.sandbox,
        Effect.flip
      )

      const error = Cause.squash(cause)
      assert.instanceOf(error, RpcClientError)
      assert.strictEqual(error.reason._tag, "RpcClientDefect")
      assert.strictEqual(error.reason.message, "HTTP response ended before RPC request completed")
    }))

  it.effect("reports transient socket open errors without failing in-flight streams", () =>
    Effect.gen(function*() {
      const requestSent = yield* Deferred.make<void>()
      const threeErrors = yield* Deferred.make<void>()
      const errors: Array<RpcClientError> = []
      const socketError = new Socket.SocketError({
        reason: new Socket.SocketOpenError({
          kind: "Unknown",
          cause: new Error("connection refused")
        })
      })
      const socket = Socket.make({
        reader: Effect.succeed({
          pull: Deferred.await(requestSent).pipe(Effect.andThen(Effect.fail(socketError))),
          upgrade: Socket.SocketUpgradeError.unsupported
        }),
        writer: Effect.succeed({
          write: () => Effect.asVoid(Deferred.succeed(requestSent, void 0)),
          writeAll: () => Effect.asVoid(Deferred.succeed(requestSent, void 0))
        })
      })
      const protocol = yield* RpcClient.makeProtocolSocket({
        retryTransientErrors: true,
        retryPolicy: Schedule.spaced("1 millis"),
        onTransientError: (error) =>
          Effect.suspend(() => {
            errors.push(error)
            return errors.length === 3 ? Deferred.succeed(threeErrors, void 0) : Effect.void
          })
      }).pipe(
        Effect.provideService(Socket.Socket, socket),
        Effect.provide(RpcSerialization.layerNdjson)
      )
      const client = yield* RpcClient.make(TestGroup).pipe(
        Effect.provideService(RpcClient.Protocol, protocol)
      )
      const streamFiber = yield* client.Events().pipe(Stream.runDrain, Effect.forkChild)

      yield* TestClock.adjust("2 millis")
      yield* Deferred.await(threeErrors).pipe(Effect.timeout("1 second"))

      assert.lengthOf(errors, 3)
      for (const error of errors) {
        assert.strictEqual(error.reason._tag, "SocketOpenError")
      }
      assert.isUndefined(streamFiber.pollUnsafe())
    }))

  it.effect("fails in-flight streams on a missed pong while retrying socket errors", () =>
    Effect.gen(function*() {
      const requestSent = yield* Deferred.make<void>()
      let writes = 0
      const write = () =>
        Effect.sync(() => writes++).pipe(Effect.andThen(Deferred.succeed(requestSent, void 0)), Effect.asVoid)
      const socket = Socket.make({
        reader: Effect.succeed({
          pull: Effect.never,
          upgrade: Socket.SocketUpgradeError.unsupported
        }),
        writer: Effect.succeed({
          write,
          writeAll: write
        })
      })
      const protocol = yield* RpcClient.makeProtocolSocket({
        retryTransientErrors: true,
        retryPolicy: Schedule.spaced("1 hour")
      }).pipe(
        Effect.provideService(Socket.Socket, socket),
        Effect.provide(RpcSerialization.layerNdjson)
      )
      const client = yield* RpcClient.make(TestGroup).pipe(
        Effect.provideService(RpcClient.Protocol, protocol)
      )
      const streamFiber = yield* client.Events().pipe(
        Stream.runDrain,
        Effect.timeout("11 seconds"),
        Effect.flip,
        Effect.forkChild
      )

      yield* Deferred.await(requestSent)
      yield* TestClock.adjust("11 seconds")
      const error = yield* Fiber.join(streamFiber)

      assert.isAtLeast(writes, 2) // request and unanswered ping
      assert.instanceOf(error, RpcClientError)
      assert.strictEqual(error.reason._tag, "SocketReadError")
    }))

  it.effect("fails in-flight streams when transient retries are exhausted", () =>
    Effect.gen(function*() {
      const requestSent = yield* Deferred.make<void>()
      const socketError = new Socket.SocketError({
        reason: new Socket.SocketOpenError({
          kind: "Unknown",
          cause: new Error("connection refused")
        })
      })
      const socket = Socket.make({
        reader: Effect.succeed({
          pull: Deferred.await(requestSent).pipe(Effect.andThen(Effect.fail(socketError))),
          upgrade: Socket.SocketUpgradeError.unsupported
        }),
        writer: Effect.succeed({
          write: () => Effect.asVoid(Deferred.succeed(requestSent, void 0)),
          writeAll: () => Effect.asVoid(Deferred.succeed(requestSent, void 0))
        })
      })
      const protocol = yield* RpcClient.makeProtocolSocket({
        retryTransientErrors: true,
        retryPolicy: Schedule.recurs(2)
      }).pipe(
        Effect.provideService(Socket.Socket, socket),
        Effect.provide(RpcSerialization.layerNdjson)
      )
      const client = yield* RpcClient.make(TestGroup).pipe(
        Effect.provideService(RpcClient.Protocol, protocol)
      )
      const streamFiber = yield* client.Events().pipe(
        Stream.runDrain,
        Effect.timeout("1 second"),
        Effect.flip,
        Effect.forkChild
      )

      yield* TestClock.adjust("1 second")
      const error = yield* Fiber.join(streamFiber)

      assert.instanceOf(error, RpcClientError)
      assert.strictEqual(error.reason._tag, "SocketOpenError")
    }))

  it.effect("continues retrying when the transient error hook defects", () =>
    Effect.gen(function*() {
      const requestSent = yield* Deferred.make<void>()
      let attempts = 0
      const socketError = new Socket.SocketError({
        reason: new Socket.SocketOpenError({
          kind: "Unknown",
          cause: new Error("connection refused")
        })
      })
      const socket = Socket.make({
        reader: Effect.succeed({
          pull: Deferred.await(requestSent).pipe(
            Effect.tap(() => Effect.sync(() => attempts++)),
            Effect.andThen(Effect.fail(socketError))
          ),
          upgrade: Socket.SocketUpgradeError.unsupported
        }),
        writer: Effect.succeed({
          write: () => Effect.asVoid(Deferred.succeed(requestSent, void 0)),
          writeAll: () => Effect.asVoid(Deferred.succeed(requestSent, void 0))
        })
      })
      const protocol = yield* RpcClient.makeProtocolSocket({
        retryTransientErrors: true,
        retryPolicy: Schedule.recurs(2),
        onTransientError: () => Effect.die("hook defect")
      }).pipe(
        Effect.provideService(Socket.Socket, socket),
        Effect.provide(RpcSerialization.layerNdjson)
      )
      const client = yield* RpcClient.make(TestGroup).pipe(
        Effect.provideService(RpcClient.Protocol, protocol)
      )
      const streamFiber = yield* client.Events().pipe(
        Stream.runDrain,
        Effect.timeout("1 second"),
        Effect.flip,
        Effect.forkChild
      )

      yield* TestClock.adjust("1 second")
      const error = yield* Fiber.join(streamFiber)

      assert.strictEqual(attempts, 3)
      assert.instanceOf(error, RpcClientError)
      assert.strictEqual(error.reason._tag, "SocketOpenError")
    }))
})
