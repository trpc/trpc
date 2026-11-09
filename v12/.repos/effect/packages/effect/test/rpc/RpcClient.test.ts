import { assert, describe, it } from "@effect/vitest"
import {
  Cause,
  Clock,
  Context,
  Deferred,
  Duration,
  Effect,
  Exit,
  Fiber,
  identity,
  Latch,
  Layer,
  Option,
  Queue,
  Request,
  RequestResolver,
  Schedule,
  Schema,
  SchemaTransformation,
  Scope,
  Stream,
  Tracer
} from "effect"
import * as HttpClient from "effect/http/HttpClient"
import * as HttpClientRequest from "effect/http/HttpClientRequest"
import * as HttpClientResponse from "effect/http/HttpClientResponse"
import * as HttpEffect from "effect/http/HttpEffect"
import { Rpc, RpcClient, RpcGroup, RpcMessage, RpcSchema, RpcSerialization, RpcServer, RpcTest } from "effect/rpc"
import { RpcClientDefect, RpcClientError } from "effect/rpc/RpcClientError"
import * as Socket from "effect/socket/Socket"
import { TestClock } from "effect/testing"
import * as Worker from "effect/workers/Worker"
import { WorkerError, WorkerReceiveError } from "effect/workers/WorkerError"
import { vi } from "vitest"
import type * as RpcClientErrorModule from "../../src/rpc/RpcClientError.ts"

class GetUser extends Request.Class<{ id: number }, string> {}

const TestGroup = RpcGroup.make(
  Rpc.make("Ping", { success: Schema.String }),
  Rpc.make("Events", { success: RpcSchema.Stream(Schema.String, Schema.Never) })
)

const ChunkGroup = RpcGroup.make(
  Rpc.make("Bad", { success: RpcSchema.Stream(Schema.Number, Schema.Never) }),
  Rpc.make("Good", { success: RpcSchema.Stream(Schema.String, Schema.Never) }),
  Rpc.make("Unary", { success: Schema.String })
)

const makeChunkProtocol = Effect.fnUntraced(function*(beforeInterrupt: Effect.Effect<void> = Effect.void) {
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

const makeSocketProtocol = Effect.gen(function*() {
  const frames = yield* Queue.unbounded<string>()
  const socket = Socket.make({
    reader: Effect.succeed({
      pull: Queue.take(frames).pipe(Effect.map((frame) => [frame] as const)),
      upgrade: Socket.SocketUpgradeError.unsupported
    }),
    writer: Effect.succeed({ write: () => Effect.void, writeAll: () => Effect.void })
  })
  const protocol = yield* RpcClient.makeProtocolSocket().pipe(
    Effect.provideService(Socket.Socket, socket),
    Effect.provideService(RpcSerialization.RpcSerialization, RpcSerialization.json)
  )
  return { protocol, frames }
})

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

// Runs while the client encodes an Echo payload, so a test can suspend it.
const EchoEncodeGate = Context.Reference<Effect.Effect<void>>("RpcClientTest/EchoEncodeGate", {
  defaultValue: () => Effect.void
})

const EchoGroup = RpcGroup.make(
  Rpc.make("Echo", {
    payload: Schema.Struct({
      value: Schema.String.pipe(Schema.decodeTo(
        Schema.String,
        SchemaTransformation.transformEffect({
          decode: Effect.succeed,
          encode: Effect.fnUntraced(function*(value) {
            yield* yield* EchoEncodeGate
            return value
          })
        })
      ))
    }),
    success: Schema.String
  })
)

// Connects a batching HTTP client to a real RPC server, counting the HTTP
// requests that cross between them.
const makeBatchingClient = Effect.fnUntraced(function*(
  serializationLayer: Layer.Layer<RpcSerialization.RpcSerialization>,
  batch: { readonly window: Duration.Input; readonly maxSize?: number | undefined },
  beforeRequest: Effect.Effect<void> = Effect.void
) {
  const httpEffect = yield* RpcServer.toHttpEffect(EchoGroup).pipe(
    Effect.provide(Layer.mergeAll(
      EchoGroup.toLayer({ Echo: ({ value }) => Effect.succeed(value) }),
      serializationLayer
    ))
  )
  const handler = HttpEffect.toWebHandler(httpEffect)
  let httpRequests = 0
  const httpClient = HttpClient.make((request) =>
    Effect.gen(function*() {
      httpRequests++
      yield* beforeRequest
      const webRequest = yield* Effect.orDie(HttpClientRequest.toWeb(request))
      const response = yield* Effect.promise(() => handler(webRequest))
      return HttpClientResponse.fromWeb(request, response)
    })
  )
  const client = yield* RpcClient.make(EchoGroup).pipe(
    Effect.provide(
      RpcClient.layerProtocolHttp({ url: "http://localhost/rpc", batch }).pipe(
        Layer.provideMerge(serializationLayer),
        Layer.provideMerge(Layer.succeed(HttpClient.HttpClient, httpClient))
      )
    )
  )
  return { client, httpRequests: () => httpRequests }
})

const assertEmptyResponseFailsRequest = Effect.fnUntraced(function*(
  serializationLayer: Layer.Layer<RpcSerialization.RpcSerialization>,
  body: string
) {
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
  it.effect("does not fail a new request started synchronously during connection defect delivery", () =>
    Effect.gen(function*() {
      const { client, handle, sent } = yield* makeChunkProtocol()
      const caller = yield* client.Unary().pipe(
        Effect.catchDefect(() => client.Unary()),
        Effect.exit,
        Effect.forkChild
      )
      takeRequestId(yield* Queue.take(sent))
      // Let the first call suspend before delivering the defect.
      yield* Effect.yieldNow
      yield* handle({ _tag: "Defect", defect: "connection defect" })

      const retryRequestId = takeRequestId(yield* Queue.take(sent))
      yield* handle({ _tag: "Exit", requestId: retryRequestId, exit: { _tag: "Success", value: "ok" } })
      assert.deepStrictEqual(yield* Fiber.join(caller), Exit.succeed("ok"))
    }))

  it.effect("releases pending calls when connection defect delivery is interrupted and the client closes", () =>
    Effect.gen(function*() {
      const scope = yield* Scope.make()
      yield* Effect.addFinalizer((exit) => Scope.close(scope, exit))
      const sent = yield* Queue.unbounded<void>()
      const delivery = yield* Deferred.make<Fiber.Fiber<unknown, unknown>>()
      const { client, write } = yield* RpcClient.makeNoSerialization(TestGroup, {
        onFromClient: ({ message }) =>
          message._tag === "Request" ? Queue.offer(sent, undefined).pipe(Effect.asVoid) : Effect.void
      }).pipe(Effect.provideService(Scope.Scope, scope))

      const first = yield* client.Ping().pipe(
        Effect.catchDefect(() =>
          Effect.gen(function*() {
            const receiver = yield* Deferred.await(delivery)
            yield* Effect.withFiber((fiber) => Effect.sync(() => receiver.interruptUnsafe(fiber.id)))
          })
        ),
        Effect.forkChild
      )
      yield* Queue.take(sent)
      // A queue completion introduces an interruption boundary between the unary calls.
      yield* client.Events(undefined, { asQueue: true })
      yield* Queue.take(sent)
      const last = yield* client.Ping().pipe(Effect.forkChild)
      yield* Queue.take(sent)
      yield* Effect.yieldNow

      const receiver = yield* Effect.withFiber((fiber) =>
        Deferred.succeed(delivery, fiber).pipe(
          Effect.andThen(write({ _tag: "Defect", clientId: 0, defect: "connection defect" }))
        )
      ).pipe(Effect.forkChild)
      const receiveExit = yield* Fiber.await(receiver)
      assert(Exit.isFailure(receiveExit) && Cause.hasInterruptsOnly(receiveExit.cause))
      yield* Fiber.join(first)
      yield* Scope.close(scope, Exit.void)

      const lastExit = last.pollUnsafe()
      assert(lastExit !== undefined, "client shutdown must not leave a pending call stranded")
      assert(Exit.isFailure(lastExit))
    }))

  it.effect("does not fail a new request started synchronously during protocol error delivery", () =>
    Effect.gen(function*() {
      const { client, handle, sent } = yield* makeChunkProtocol()
      const delivery = yield* Deferred.make<Fiber.Fiber<unknown, unknown>>()
      const error = new RpcClientError({
        reason: new RpcClientDefect({ message: "connection dropped", cause: undefined })
      })
      const caller = yield* client.Unary().pipe(
        Effect.catch(Effect.fnUntraced(function*(received) {
          assert.strictEqual(received, error)
          const receiver = yield* Deferred.await(delivery)
          yield* Effect.withFiber((fiber) => Effect.sync(() => receiver.interruptUnsafe(fiber.id)))
          return yield* client.Unary()
        })),
        Effect.exit,
        Effect.forkChild
      )
      takeRequestId(yield* Queue.take(sent))
      // Queue completion introduces an interruption boundary between unary deliveries.
      yield* client.Good(undefined, { asQueue: true })
      takeRequestId(yield* Queue.take(sent))
      const last = yield* client.Unary().pipe(Effect.forkChild)
      takeRequestId(yield* Queue.take(sent))
      yield* Effect.yieldNow
      const receiver = yield* Effect.withFiber((fiber) =>
        Deferred.succeed(delivery, fiber).pipe(
          Effect.andThen(handle({ _tag: "ClientProtocolError", error }))
        )
      ).pipe(Effect.forkChild)
      const receiveExit = yield* Fiber.await(receiver)
      assert(Exit.isFailure(receiveExit) && Cause.hasInterruptsOnly(receiveExit.cause))
      const lastExit = last.pollUnsafe()
      assert(lastExit !== undefined, "all original callers must finish before client shutdown")
      assert(Exit.isFailure(lastExit))
      assert.strictEqual(Cause.squash(lastExit.cause), error)

      const retryRequestId = takeRequestId(yield* Queue.take(sent))
      yield* handle({ _tag: "Exit", requestId: retryRequestId, exit: { _tag: "Success", value: "ok" } })
      assert(caller.pollUnsafe() !== undefined, "the retry must remain reachable after error delivery")
      assert.deepStrictEqual(yield* Fiber.join(caller), Exit.succeed("ok"))
    }))

  it.effect("ignores late replies after terminal failures", () =>
    Effect.gen(function*() {
      let decodedReplies = 0
      const success = Schema.String.pipe(Schema.decodeTo(
        Schema.String,
        SchemaTransformation.transform({
          decode: (value) => {
            decodedReplies++
            return value
          },
          encode: identity
        })
      ))
      const received = yield* Deferred.make<Parameters<RpcClient.Protocol["Service"]["run"]>[1]>()
      const sent = yield* Queue.unbounded<Parameters<RpcClient.Protocol["Service"]["send"]>[1]>()
      let failSend = true
      const error = new RpcClientError({
        reason: new RpcClientDefect({ message: "send failed", cause: undefined })
      })
      const client = yield* RpcClient.make(RpcGroup.make(Rpc.make("Ping", { success }))).pipe(Effect.provideService(
        RpcClient.Protocol,
        RpcClient.Protocol.of({
          codecFor: RpcSerialization.json.codecFor,
          supportsAck: false,
          supportsTransferables: false,
          run: (_clientId, handle) => Deferred.succeed(received, handle).pipe(Effect.andThen(Effect.never)),
          send: (_clientId, message) =>
            Queue.offer(sent, message).pipe(Effect.andThen(failSend ? Effect.fail(error) : Effect.void))
        })
      ))
      const handle = yield* Deferred.await(received)
      assert.strictEqual(yield* client.Ping().pipe(Effect.flip), error)
      const failedRequestId = takeRequestId(yield* Queue.take(sent))
      // A retained request would still decode the late reply using its caller's context.
      yield* handle({ _tag: "Exit", requestId: failedRequestId, exit: { _tag: "Success", value: "late" } })
      assert.strictEqual(decodedReplies, 0)

      failSend = false
      for (
        const terminal of [
          { _tag: "Defect", defect: "connection defect" },
          { _tag: "ClientProtocolError", error }
        ] as const
      ) {
        const caller = yield* client.Ping().pipe(Effect.forkChild)
        const requestId = takeRequestId(yield* Queue.take(sent))
        yield* Effect.yieldNow
        yield* handle(terminal)
        const exit = caller.pollUnsafe()
        assert(exit !== undefined, "terminal delivery must complete the caller before client shutdown")
        assert(Exit.isFailure(exit))
        assert.strictEqual(Cause.squash(exit.cause), terminal._tag === "Defect" ? terminal.defect : error)
        yield* handle({ _tag: "Exit", requestId, exit: { _tag: "Success", value: "late" } })
        assert.strictEqual(decodedReplies, 0, `${terminal._tag} must release the response decoder`)
      }
    }))

  it.effect("decodes responses with the ParseOptions annotation", () =>
    Effect.gen(function*() {
      const batches: Array<ReadonlyArray<number>> = []
      const resolver = RequestResolver.make<GetUser>((entries) =>
        Effect.sync(() => {
          batches.push(entries.map((entry) => entry.request.id))
          for (const entry of entries) entry.completeUnsafe(Exit.succeed(`user-${entry.request.id}`))
        })
      )
      const User = Schema.Number.pipe(Schema.decodeTo(
        Schema.String,
        SchemaTransformation.transformEffect({
          decode: (id) => Effect.request(new GetUser({ id }), resolver),
          encode: (name) => Effect.succeed(Number(name.slice("user-".length)))
        })
      ))
      const received = yield* Deferred.make<Parameters<RpcClient.Protocol["Service"]["run"]>[1]>()
      const sent = yield* Queue.unbounded<Parameters<RpcClient.Protocol["Service"]["send"]>[1]>()
      const client = yield* RpcClient.make(RpcGroup.make(
        Rpc.make("GetUsers", { success: Schema.Array(User) }).annotate(Rpc.ParseOptions, { concurrency: "unbounded" })
      )).pipe(Effect.provideService(
        RpcClient.Protocol,
        RpcClient.Protocol.of({
          codecFor: RpcSerialization.json.codecFor,
          supportsAck: false,
          supportsTransferables: false,
          run: (_clientId, handle) => Deferred.succeed(received, handle).pipe(Effect.andThen(Effect.never)),
          send: (_clientId, message) => Effect.asVoid(Queue.offer(sent, message))
        })
      ))
      const handle = yield* Deferred.await(received)
      const fiber = yield* client.GetUsers().pipe(Effect.forkChild)
      const requestId = takeRequestId(yield* Queue.take(sent))
      yield* handle({ _tag: "Exit", requestId, exit: { _tag: "Success", value: [1, 2, 3] } })

      assert.deepStrictEqual(yield* Fiber.join(fiber), ["user-1", "user-2", "user-3"])
      assert.deepStrictEqual(batches, [[1, 2, 3]])
    }))

  it.effect("releases socket routing after an encoding defect", () =>
    Effect.gen(function*() {
      const { protocol, frames } = yield* makeSocketProtocol
      const received = yield* Queue.unbounded<RpcMessage.FromServerEncoded>()
      yield* protocol.run(2, (message) => Queue.offer(received, message)).pipe(
        Effect.forkChild({ startImmediately: true })
      )
      const defect = new Error("encoding failed")
      const exit = yield* protocol.send(1, {
        _tag: "Request",
        id: "old",
        tag: "Ping",
        payload: {
          toJSON() {
            throw defect
          }
        },
        headers: []
      }).pipe(Effect.exit)
      assert(Exit.isFailure(exit))
      assert.strictEqual(Cause.squash(exit.cause), defect)
      yield* protocol.send(2, { _tag: "Request", id: "healthy", tag: "Ping", payload: undefined, headers: [] })
      const late = { _tag: "Exit", requestId: "old", exit: { _tag: "Success", value: "late" } } as const
      const healthy = { _tag: "Exit", requestId: "healthy", exit: { _tag: "Success", value: "ok" } } as const
      yield* Queue.offer(frames, JSON.stringify([late, healthy]))
      // A stale route delivers the healthy reply first, failing without hanging.
      assert.deepStrictEqual(yield* Queue.take(received), late)
      assert.deepStrictEqual(yield* Queue.take(received), healthy)
    }))

  it.effect("releases socket routing after a connection defect", () =>
    Effect.gen(function*() {
      const { protocol, frames } = yield* makeSocketProtocol
      const received = yield* Queue.unbounded<RpcMessage.FromServerEncoded>()
      yield* protocol.run(2, (message) => Queue.offer(received, message)).pipe(
        Effect.forkChild({ startImmediately: true })
      )
      yield* protocol.send(1, { _tag: "Request", id: "old", tag: "Ping", payload: undefined, headers: [] })
      const defect = { _tag: "Defect", defect: "boom" } as const
      yield* Queue.offer(frames, JSON.stringify(defect))
      assert.deepStrictEqual(yield* Queue.take(received), defect)
      yield* protocol.send(2, { _tag: "Request", id: "healthy", tag: "Ping", payload: undefined, headers: [] })
      const late = { _tag: "Exit", requestId: "old", exit: { _tag: "Success", value: "late" } } as const
      const healthy = { _tag: "Exit", requestId: "healthy", exit: { _tag: "Success", value: "ok" } } as const
      yield* Queue.offer(frames, JSON.stringify([late, healthy]))
      assert.deepStrictEqual(yield* Queue.take(received), late)
      assert.deepStrictEqual(yield* Queue.take(received), healthy)
    }))

  it.effect("does not deliver an earlier socket defect to a client registered during delivery", () =>
    Effect.gen(function*() {
      const { protocol, frames } = yield* makeSocketProtocol
      const received = yield* Queue.unbounded<RpcMessage.FromServerEncoded>()
      yield* protocol.run(1, (message) =>
        message._tag === "Defect"
          ? protocol.run(2, (response) => Queue.offer(received, response)).pipe(
            Effect.forkChild({ startImmediately: true }),
            Effect.asVoid
          )
          : Effect.void).pipe(Effect.forkChild({ startImmediately: true }))
      const reply = { _tag: "Exit", requestId: "new", exit: { _tag: "Success", value: "ok" } } as const
      yield* Queue.offer(frames, JSON.stringify([{ _tag: "Defect", defect: "boom" }, reply]))
      assert.deepStrictEqual(yield* Queue.take(received), reply)
    }))

  it.effect("completes a discarded call on its acknowledgement, not on the write", () =>
    Effect.gen(function*() {
      const { client, handle, sent } = yield* makeChunkProtocol()
      const call = yield* client.Unary(undefined, { discard: true }).pipe(Effect.forkChild)
      const request = yield* Queue.take(sent)
      assert(request._tag === "Request" && request.discard === true)
      yield* Effect.yieldNow
      assert.isUndefined(call.pollUnsafe())

      // an older server replies with the handler result, which also counts as the acknowledgement
      yield* handle({ _tag: "Exit", requestId: request.id, exit: { _tag: "Success", value: "ignored" } })
      assert.isUndefined(yield* Fiber.join(call))
    }))

  it.effect("fails a discarded call on a transport error and interrupts its pending send", () =>
    Effect.gen(function*() {
      const received = yield* Deferred.make<Parameters<RpcClient.Protocol["Service"]["run"]>[1]>()
      const sent = yield* Queue.unbounded<Parameters<RpcClient.Protocol["Service"]["send"]>[1]>()
      const sendInterrupted = yield* Deferred.make<void>()
      const client = yield* RpcClient.make(ChunkGroup).pipe(Effect.provideService(
        RpcClient.Protocol,
        RpcClient.Protocol.of({
          codecFor: RpcSerialization.json.codecFor,
          supportsAck: false,
          supportsTransferables: false,
          run: (_clientId, handle) => Deferred.succeed(received, handle).pipe(Effect.andThen(Effect.never)),
          // a socket write waits while the connection is down
          send: (_clientId, message) =>
            message._tag === "Request" ?
              Queue.offer(sent, message).pipe(
                Effect.andThen(Effect.never),
                Effect.onInterrupt(() => Deferred.succeed(sendInterrupted, undefined))
              ) :
              Effect.void
        })
      ))
      const handle = yield* Deferred.await(received)
      const call = yield* client.Unary(undefined, { discard: true }).pipe(Effect.forkChild)
      yield* Queue.take(sent)
      const error = new RpcClientError({
        reason: new RpcClientDefect({ message: "connection lost", cause: undefined })
      })

      yield* handle({ _tag: "ClientProtocolError", error })

      assert.deepStrictEqual(yield* Fiber.await(call), Exit.fail(error))
      yield* Deferred.await(sendInterrupted)
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

  it.effect("closes the client scope when a malformed chunk arrives as the socket closes for good", () =>
    Effect.gen(function*() {
      const frames = yield* Queue.unbounded<string, Socket.SocketError>()
      const writes = yield* Queue.unbounded<string>()
      // Like a disconnected WebSocket, writes wait for a reconnect that never happens.
      const open = yield* Latch.make()
      let connections = 0
      const socket = Socket.make({
        reader: Effect.suspend(() => {
          if (connections++ > 0) return Effect.never
          open.openUnsafe()
          return Effect.succeed({
            pull: Queue.take(frames).pipe(Effect.map((frame) => [frame] as const)),
            upgrade: Socket.SocketUpgradeError.unsupported
          })
        }),
        writer: Effect.succeed({
          write: (data) => open.whenOpen(Queue.offer(writes, data as string).pipe(Effect.asVoid)),
          writeAll: () => Effect.void
        })
      })
      const scope = yield* Scope.make()
      const client = yield* RpcClient.make(ChunkGroup).pipe(
        Effect.provideServiceEffect(RpcClient.Protocol, RpcClient.makeProtocolSocket()),
        Effect.provideService(Socket.Socket, socket),
        Effect.provideService(RpcSerialization.RpcSerialization, RpcSerialization.json),
        Scope.provide(scope)
      )
      const bad = yield* client.Bad().pipe(Stream.runDrain, Effect.exit, Effect.forkChild)
      const requestId = JSON.parse(yield* Queue.take(writes)).id

      yield* Effect.sync(() => {
        Queue.offerUnsafe(frames, JSON.stringify({ _tag: "Chunk", requestId, values: [null] }))
        open.closeUnsafe()
        Queue.failCauseUnsafe(
          frames,
          Cause.fail(new Socket.SocketError({ reason: new Socket.SocketCloseError({ code: 1012 }) }))
        )
      })
      assert(Exit.isFailure(yield* Fiber.join(bad)))

      // Detached so a hung, uninterruptible close cannot block the test's own teardown.
      const closing = yield* Scope.close(scope, Exit.void).pipe(Effect.forkDetach)
      const closed = yield* Fiber.await(closing).pipe(Effect.timeoutOption("1 second"), Effect.forkChild)
      yield* TestClock.adjust("1 second")
      assert.isTrue(Option.isSome(yield* Fiber.join(closed)))
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

  it.effect("stops the server stream promptly when an acknowledged stream consumer is interrupted", () =>
    Effect.gen(function*() {
      let pulls = 0
      const group = RpcGroup.make(
        Rpc.make("Count", { success: RpcSchema.Stream(Schema.Number, Schema.Never) })
      )
      const client = yield* RpcTest.makeClient(group).pipe(
        Effect.provide(group.toLayer({
          Count: () =>
            Stream.fromIterable(Array.from({ length: 50 }, (_, i) => i), { chunkSize: 1 }).pipe(
              Stream.mapEffect((i) => Effect.sync(() => (pulls++, i)))
            )
        }))
      )

      const values = yield* client.Count(undefined, { streamBufferSize: 1 }).pipe(
        Stream.take(1),
        Stream.runCollect
      )
      yield* Effect.yieldNow

      assert.deepStrictEqual(values, [0])
      assert.isAtMost(pulls, 3)
    }))

  it.effect("does not acknowledge a chunk dropped when its stream consumer is interrupted", () =>
    Effect.gen(function*() {
      const consuming = yield* Deferred.make<void>()
      const sent = yield* Queue.unbounded<RpcMessage.FromClient<RpcGroup.Rpcs<typeof ChunkGroup>>>()
      const { client, write } = yield* RpcClient.makeNoSerialization(ChunkGroup, {
        onFromClient: ({ message }) => Queue.offer(sent, message)
      })
      const reader = yield* client.Good(undefined, { streamBufferSize: 1 }).pipe(
        Stream.runForEach(() => Deferred.succeed(consuming, void 0).pipe(Effect.andThen(Effect.never))),
        Effect.forkChild
      )
      const request = yield* Queue.take(sent)
      assert(request._tag === "Request")
      const requestId = request.id
      yield* write({ _tag: "Chunk", clientId: 0, requestId, values: ["a"] })
      assert.deepStrictEqual(yield* Queue.take(sent), { _tag: "Ack", requestId })
      const receiver = yield* write({ _tag: "Chunk", clientId: 0, requestId, values: ["b", "c"] }).pipe(
        Effect.forkChild({ startImmediately: true })
      )
      yield* Deferred.await(consuming)
      assert.isUndefined(receiver.pollUnsafe())
      yield* Fiber.interrupt(reader)

      assert(Exit.isSuccess(yield* Fiber.await(receiver)))
      assert.deepStrictEqual((yield* Queue.takeAll(sent)).map((message) => message._tag), ["Interrupt"])
    }))

  it.effect("does not send Interrupt when a failed streaming send closes its scope", () =>
    Effect.gen(function*() {
      const sent: Array<string> = []
      const { client } = yield* RpcClient.makeNoSerialization(TestGroup, {
        onFromClient: ({ message }) => {
          sent.push(message._tag)
          return message._tag === "Request" ? Effect.die("send failed") : Effect.void
        }
      })
      const exit = yield* client.Events(undefined, { asQueue: true }).pipe(
        Effect.flatMap(Queue.take),
        Effect.scoped,
        Effect.exit
      )
      assert(Exit.isFailure(exit))
      assert.strictEqual(Cause.squash(exit.cause), "send failed")
      assert.deepStrictEqual(sent, ["Request"])
    }))

  for (const consumer of ["queue", "stream"] as const) {
    it.effect(`releases the ${consumer} consumer when the request write is interrupted`, () =>
      Effect.gen(function*() {
        const writing = yield* Deferred.make<Fiber.Fiber<unknown, unknown>>()
        const sent: Array<string> = []
        const { client } = yield* RpcClient.makeNoSerialization(TestGroup, {
          onFromClient: ({ message }) => {
            sent.push(message._tag)
            return message._tag === "Request"
              ? Effect.withFiber((fiber) => Deferred.succeed(writing, fiber).pipe(Effect.andThen(Effect.never)))
              : Effect.void
          }
        })
        const reader = yield* (consumer === "queue"
          ? client.Events(undefined, { asQueue: true }).pipe(Effect.flatMap(Queue.take), Effect.asVoid)
          : Stream.runDrain(client.Events())).pipe(Effect.scoped, Effect.forkChild)
        const writer = yield* Deferred.await(writing)
        yield* Fiber.interrupt(writer)
        const readExit = yield* Fiber.await(reader)
        assert(Exit.isFailure(readExit) && Cause.hasInterruptsOnly(readExit.cause))
        assert.deepStrictEqual(sent, ["Request", "Interrupt"])
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

  it.effect("fails only the calls on a crashed pooled worker", () =>
    Effect.gen(function*() {
      const sent = yield* Queue.unbounded<{
        readonly id: string | number
        readonly crash: Deferred.Deferred<never, WorkerError>
        readonly replies: Queue.Queue<RpcMessage.FromServerEncoded>
      }>()
      const spawn = Effect.gen(function*() {
        const crash = yield* Deferred.make<never, WorkerError>()
        const replies = yield* Queue.unbounded<RpcMessage.FromServerEncoded>()
        const backing: Worker.Worker<any, any> = {
          send: (message) =>
            message._tag === "Request"
              ? Effect.asVoid(Queue.offer(sent, { id: message.id, crash, replies }))
              : Effect.void,
          run: (handler) =>
            Effect.raceFirst(Deferred.await(crash), Effect.forever(Effect.flatMap(Queue.take(replies), handler)))
        }
        return backing
      })
      const client = yield* RpcClient.make(TestGroup).pipe(
        Effect.provideServiceEffect(RpcClient.Protocol, RpcClient.makeProtocolWorker({ size: 2, concurrency: 1 })),
        Effect.provideService(Worker.WorkerPlatform, Worker.WorkerPlatform.of({ spawn: () => spawn })),
        Effect.provideService(Worker.Spawner, (() => undefined) as Worker.SpawnerFn)
      )

      const crashing = yield* client.Ping().pipe(Effect.forkChild)
      const crashed = yield* Queue.take(sent)
      const healthy = yield* client.Ping().pipe(Effect.forkChild)
      const healthyRequest = yield* Queue.take(sent)

      yield* Deferred.fail(
        crashed.crash,
        new WorkerError({ reason: new WorkerReceiveError({ message: "worker exited" }) })
      )
      const error = yield* Effect.flip(Fiber.join(crashing))
      assert.strictEqual(error.reason._tag, "WorkerReceiveError")

      yield* Queue.offer(healthyRequest.replies, {
        _tag: "Exit",
        requestId: healthyRequest.id,
        exit: { _tag: "Success", value: "pong" }
      })
      assert.strictEqual(yield* Fiber.join(healthy), "pong")
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

  it.effect("sends a discarded call to a worker as a request and waits for its Exit", () =>
    Effect.gen(function*() {
      const sent: Array<unknown> = []
      const requestSent = yield* Deferred.make<void>()
      const reply = yield* Deferred.make<(message: unknown) => Effect.Effect<unknown, unknown>>()
      const backing: Worker.Worker<any, any> = {
        send: (message) =>
          Effect.sync(() => void sent.push(message)).pipe(Effect.andThen(Deferred.succeed(requestSent, void 0))),
        run: (handler: any) => Deferred.succeed(reply, handler).pipe(Effect.andThen(Effect.never))
      }
      const protocol = yield* RpcClient.makeProtocolWorker({ size: 1 }).pipe(
        Effect.provideService(
          Worker.WorkerPlatform,
          Worker.WorkerPlatform.of({ spawn: () => Effect.succeed(backing) })
        ),
        Effect.provideService(Worker.Spawner, (() => undefined) as Worker.SpawnerFn)
      )
      yield* protocol.run(0, () => Effect.void).pipe(Effect.forkScoped)
      const request = { _tag: "Request" as const, id: 1, tag: "Test", payload: null, headers: [] }

      const call = yield* protocol.send(0, { ...request, discard: true }).pipe(Effect.forkChild)
      yield* Deferred.await(requestSent)
      // The pool counts the worker as busy until the Exit, so the worker must be asked for one.
      assert.deepStrictEqual(sent, [request])
      assert.isUndefined(call.pollUnsafe())

      yield* (yield* Deferred.await(reply))({ _tag: "Exit", requestId: 1, exit: { _tag: "Success", value: null } })
      yield* Fiber.join(call)
    }))

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

  describe("HTTP batching", () => {
    for (
      const [name, serializationLayer] of [
        ["json", RpcSerialization.layerJson],
        ["ndjson", RpcSerialization.layerNdjson]
      ] as const
    ) {
      it.effect(`sends ${name} requests made within the batch window as one HTTP request`, () =>
        Effect.gen(function*() {
          const { client, httpRequests } = yield* makeBatchingClient(serializationLayer, { window: "5 millis" })

          const results = yield* Effect.all(
            [client.Echo({ value: "first" }), client.Echo({ value: "second" })],
            { concurrency: "unbounded" }
          ).pipe(Effect.forkChild)
          yield* TestClock.adjust("5 millis")

          assert.deepStrictEqual(yield* Fiber.join(results), ["first", "second"])
          assert.strictEqual(httpRequests(), 1)
        }))
    }

    it.effect("sends a batch as soon as it reaches maxSize", () =>
      Effect.gen(function*() {
        const { client, httpRequests } = yield* makeBatchingClient(RpcSerialization.layerJson, {
          window: "1 hour",
          maxSize: 2
        })

        const results = yield* Effect.all(
          [client.Echo({ value: "first" }), client.Echo({ value: "second" })],
          { concurrency: "unbounded" }
        )

        assert.deepStrictEqual(results, ["first", "second"])
        assert.strictEqual(httpRequests(), 1)
      }))

    it.effect("keeps a batch in flight when one of its callers is interrupted", () =>
      Effect.gen(function*() {
        const release = yield* Deferred.make<void>()
        const { client, httpRequests } = yield* makeBatchingClient(
          RpcSerialization.layerJson,
          { window: "5 millis" },
          Deferred.await(release)
        )

        const interrupted = yield* client.Echo({ value: "interrupted" }).pipe(Effect.forkChild)
        const kept = yield* client.Echo({ value: "kept" }).pipe(Effect.forkChild)
        yield* TestClock.adjust("5 millis")
        yield* Fiber.interrupt(interrupted)
        yield* Deferred.succeed(release, void 0)

        assert.strictEqual(yield* Fiber.join(kept), "kept")
        assert.strictEqual(httpRequests(), 1)
      }))

    it.effect("interrupts batches started while the client is shutting down", () =>
      Effect.gen(function*() {
        const release = yield* Deferred.make<void>()
        const cleanupStarted = yield* Deferred.make<void>()
        const encodeRelease = yield* Deferred.make<void>()
        const interrupted: Array<number> = []
        let started = 0
        // The first HTTP request holds shutdown open while it is interrupted.
        const beforeRequest = Effect.suspend(() => {
          const request = ++started
          return Effect.onInterrupt(Effect.never, () =>
            Effect.andThen(
              request === 1
                ? Deferred.succeed(cleanupStarted, void 0).pipe(Effect.andThen(Deferred.await(release)))
                : Effect.void,
              Effect.sync(() => interrupted.push(request))
            ))
        })
        const scope = yield* Scope.make()
        const { client, httpRequests } = yield* makeBatchingClient(
          RpcSerialization.layerJson,
          { window: "5 millis" },
          beforeRequest
        ).pipe(Scope.provide(scope))

        yield* client.Echo({ value: "first" }).pipe(Effect.forkChild)
        // admitted before shutdown, but still encoding its payload
        yield* client.Echo({ value: "encoding" }).pipe(
          Effect.provideService(EchoEncodeGate, Deferred.await(encodeRelease)),
          Effect.forkChild
        )
        yield* TestClock.adjust("5 millis")
        const closing = yield* Scope.close(scope, Exit.void).pipe(Effect.forkChild)
        yield* Deferred.await(cleanupStarted)
        yield* client.Echo({ value: "second" }).pipe(Effect.forkChild)
        yield* Deferred.succeed(encodeRelease, void 0)
        yield* TestClock.adjust("5 millis")
        yield* Deferred.succeed(release, void 0)
        yield* Fiber.join(closing)

        // every HTTP request that started was interrupted by the shutdown
        assert.strictEqual(interrupted.length, httpRequests())
      }))
  })

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

  it.effect("keeps a slow unary request alive when default ping ticks run slightly late", () =>
    Effect.gen(function*() {
      const clock = yield* Clock.Clock
      const requestSent = yield* Deferred.make<void>()
      const frames = yield* Queue.unbounded<string>()
      let pings = 0
      const write: Socket.Writer["write"] = Effect.fnUntraced(function*(data) {
        if (Socket.isCloseEvent(data)) return
        const message = JSON.parse(typeof data === "string" ? data : new TextDecoder().decode(data))
        if (message._tag === "Ping") {
          pings++
          yield* Queue.offer(frames, JSON.stringify({ _tag: "Pong" }) + "\n")
        } else if (message._tag === "Request") {
          yield* Deferred.succeed(requestSent, void 0)
        }
      })
      const socket = Socket.make({
        reader: Effect.succeed({
          pull: Queue.take(frames).pipe(Effect.map((frame) => [frame] as const)),
          upgrade: Socket.SocketUpgradeError.unsupported
        }),
        writer: Effect.succeed({
          write,
          writeAll: (chunks) => Effect.forEach(chunks, write, { discard: true })
        })
      })
      const protocol = yield* RpcClient.makeProtocolSocket().pipe(
        Effect.provideService(Socket.Socket, socket),
        Effect.provide(RpcSerialization.layerNdjson),
        // Model scheduler overhead deterministically: sleeps resume 1ms late.
        Effect.provideService(Clock.Clock, {
          ...clock,
          sleep: (duration) => clock.sleep(Duration.sum(duration, Duration.millis(1)))
        })
      )
      const client = yield* RpcClient.make(TestGroup, {
        generateRequestId: () => RpcMessage.RequestId("0")
      }).pipe(Effect.provideService(RpcClient.Protocol, protocol))
      const response = yield* client.Ping().pipe(Effect.exit, Effect.forkChild)

      yield* Deferred.await(requestSent)
      yield* TestClock.adjust("12 seconds")
      yield* Queue.offer(
        frames,
        JSON.stringify({
          _tag: "Exit",
          requestId: "0",
          exit: { _tag: "Success", value: "slow result" }
        }) + "\n"
      )
      assert.deepStrictEqual(yield* Fiber.join(response), Exit.succeed("slow result"))
      assert.isAtLeast(pings, 2)
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

  it.effect("keeps in-flight streams alive on non-pong frames without any pongs", () =>
    Effect.gen(function*() {
      const requestSent = yield* Deferred.make<void>()
      const frames = yield* Queue.unbounded<string>()
      const events = yield* Queue.unbounded<string>()
      const write = () => Effect.asVoid(Deferred.succeed(requestSent, void 0))
      const socket = Socket.make({
        reader: Effect.succeed({
          pull: Queue.take(frames).pipe(Effect.map((frame) => [frame] as const)),
          upgrade: Socket.SocketUpgradeError.unsupported
        }),
        writer: Effect.succeed({ write, writeAll: write })
      })
      const protocol = yield* RpcClient.makeProtocolSocket().pipe(
        Effect.provideService(Socket.Socket, socket),
        Effect.provide(RpcSerialization.layerNdjson)
      )
      const client = yield* RpcClient.make(TestGroup, {
        generateRequestId: () => RpcMessage.RequestId("0")
      }).pipe(Effect.provideService(RpcClient.Protocol, protocol))
      const streamFiber = yield* client.Events().pipe(
        Stream.runForEach((event) => Queue.offer(events, event)),
        Effect.forkChild
      )

      yield* Deferred.await(requestSent)
      for (const event of ["first", "second", "third"]) {
        yield* TestClock.adjust("4 seconds")
        assert.isUndefined(streamFiber.pollUnsafe())
        yield* Queue.offer(frames, JSON.stringify({ _tag: "Chunk", requestId: "0", values: [event] }) + "\n")
        assert.strictEqual(yield* Queue.take(events), event)
      }
      // Cross another ping tick after the third frame, still without a pong.
      yield* TestClock.adjust("4 seconds")
      assert.isUndefined(streamFiber.pollUnsafe())
    }))

  it.effect("allows a delayed pong within a custom ping timeout but fails after silence", () =>
    Effect.gen(function*() {
      const requestSent = yield* Deferred.make<void>()
      const frames = yield* Queue.unbounded<string>()
      const frameRead = yield* Deferred.make<void>()
      const write = () => Effect.asVoid(Deferred.succeed(requestSent, void 0))
      const socket = Socket.make({
        reader: Effect.succeed({
          pull: Queue.take(frames).pipe(
            Effect.tap(() => Deferred.succeed(frameRead, void 0)),
            Effect.map((frame) => [frame] as const)
          ),
          upgrade: Socket.SocketUpgradeError.unsupported
        }),
        writer: Effect.succeed({ write, writeAll: write })
      })
      const context = yield* Layer.build(
        RpcClient.layerProtocolSocket({
          pingInterval: "2 seconds",
          pingTimeout: "15 seconds",
          retryPolicy: Schedule.spaced("1 hour")
        }).pipe(
          Layer.provide(RpcSerialization.layerNdjson),
          Layer.provide(Layer.succeed(Socket.Socket, socket))
        )
      )
      const client = yield* RpcClient.make(TestGroup).pipe(Effect.provide(context))
      const streamFiber = yield* client.Events().pipe(Stream.runDrain, Effect.exit, Effect.forkChild)

      yield* Deferred.await(requestSent)
      // The old fixed timeout fails at 10s, before this delayed pong arrives.
      yield* TestClock.adjust("12 seconds")
      assert.isUndefined(streamFiber.pollUnsafe())
      yield* Queue.offer(frames, JSON.stringify({ _tag: "Pong" }) + "\n")
      yield* Deferred.await(frameRead)
      yield* TestClock.adjust("14 seconds")
      assert.isUndefined(streamFiber.pollUnsafe())

      // At 28s the next 2s tick is 16s after the last frame, beyond the 15s timeout.
      yield* TestClock.adjust("2 seconds")
      assert.isDefined(streamFiber.pollUnsafe())
      const exit = yield* Fiber.join(streamFiber)
      assert(Exit.isFailure(exit))
      const error = Cause.squash(exit.cause)
      assert.instanceOf(error, RpcClientError)
      assert.strictEqual(error.reason._tag, "SocketReadError")
    }))

  it.effect("runs onPingTimeout only when a ping timeout drops the socket", () =>
    Effect.gen(function*() {
      const requestSent = yield* Deferred.make<void>()
      const events: Array<string> = []
      const record = (event: string) => Effect.sync(() => events.push(event))
      const closeError = new Socket.SocketError({
        reason: new Socket.SocketCloseError({ code: 1006 })
      })
      let connections = 0
      const write = () => Effect.asVoid(Deferred.succeed(requestSent, void 0))
      const socket = Socket.make({
        // The server closes the first connection; the reconnected one goes silent.
        reader: Effect.sync(() => ({
          pull: ++connections === 1
            ? Deferred.await(requestSent).pipe(Effect.andThen(Effect.fail(closeError)))
            : Effect.never,
          upgrade: Socket.SocketUpgradeError.unsupported
        })),
        writer: Effect.succeed({ write, writeAll: write })
      })
      const protocol = yield* RpcClient.makeProtocolSocket({
        retryPolicy: Schedule.spaced("20 seconds"),
        onPingTimeout: record("ping timeout")
      }).pipe(
        Effect.provideService(Socket.Socket, socket),
        Effect.provideService(RpcClient.ConnectionHooks, {
          onConnect: Effect.asVoid(record("connect")),
          onDisconnect: Effect.asVoid(record("disconnect"))
        }),
        Effect.provide(RpcSerialization.layerNdjson)
      )
      const client = yield* RpcClient.make(TestGroup).pipe(
        Effect.provideService(RpcClient.Protocol, protocol)
      )

      const closedFiber = yield* client.Events().pipe(Stream.runDrain, Effect.flip, Effect.forkChild)
      const closed = yield* Fiber.join(closedFiber)
      assert.strictEqual(closed.reason._tag, "SocketCloseError")

      // Stay disconnected past the ping timeout, then reconnect at 20s.
      yield* TestClock.adjust("20 seconds")
      assert.deepStrictEqual(events, ["connect", "disconnect", "connect"])

      const streamFiber = yield* client.Events().pipe(
        Stream.runDrain,
        Effect.tapError(() => record("stream failed")),
        Effect.flip,
        Effect.forkChild
      )
      yield* TestClock.adjust("10 seconds")
      const timedOut = yield* Fiber.join(streamFiber)

      assert.strictEqual(timedOut.reason._tag, "SocketReadError")
      assert.deepStrictEqual(events, [
        "connect",
        "disconnect",
        "connect",
        "ping timeout",
        "disconnect",
        "stream failed"
      ])
    }))

  it.effect("does not run onPingTimeout when the ping timeout fires before the socket opens", () =>
    Effect.gen(function*() {
      const events: Array<string> = []
      const record = (event: string) => Effect.sync(() => events.push(event))
      const write = () => Effect.void
      const socket = Socket.make({
        reader: Effect.never,
        writer: Effect.succeed({ write, writeAll: write })
      })
      const protocol = yield* RpcClient.makeProtocolSocket({
        retryPolicy: Schedule.spaced("1 hour"),
        onPingTimeout: record("ping timeout")
      }).pipe(
        Effect.provideService(Socket.Socket, socket),
        Effect.provideService(RpcClient.ConnectionHooks, {
          onConnect: Effect.asVoid(record("connect")),
          onDisconnect: Effect.asVoid(record("disconnect"))
        }),
        Effect.provide(RpcSerialization.layerNdjson)
      )
      const client = yield* RpcClient.make(TestGroup).pipe(
        Effect.provideService(RpcClient.Protocol, protocol)
      )
      const streamFiber = yield* client.Events().pipe(Stream.runDrain, Effect.flip, Effect.forkChild)

      yield* TestClock.adjust("11 seconds")
      const error = yield* Fiber.join(streamFiber)

      assert.strictEqual(error.reason._tag, "SocketReadError")
      assert.deepStrictEqual(events, ["disconnect"])
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

  for (const disableFatalDefects of [undefined, true]) {
    it.effect(`RpcTest handler defects with disableFatalDefects: ${disableFatalDefects}`, () =>
      Effect.gen(function*() {
        const started = yield* Deferred.make<void>()
        const release = yield* Deferred.make<void>()
        const group = RpcGroup.make(
          Rpc.make("Block", { success: Schema.String }),
          Rpc.make("Boom")
        )
        const client = yield* RpcTest.makeClient(group, { disableFatalDefects }).pipe(
          Effect.provide(group.toLayer({
            Block: () =>
              Deferred.succeed(started, undefined).pipe(Effect.andThen(Deferred.await(release)), Effect.as("ok")),
            Boom: () => Effect.die("boom")
          }))
        )
        const blocked = yield* client.Block().pipe(Effect.catchDefect(Effect.succeed), Effect.forkChild)
        yield* Deferred.await(started)

        assert.strictEqual(yield* client.Boom().pipe(Effect.catchDefect(Effect.succeed)), "boom")
        yield* Deferred.succeed(release, undefined)
        assert.strictEqual(yield* Fiber.join(blocked), disableFatalDefects ? "ok" : "boom")
      }))
  }

  describe("tracing", () => {
    const SpanGroup = TestGroup.prefix("Echo.")

    const call = (
      method: "Ping" | "Events",
      options: { spanPrefix?: string; spanAttributes?: Record<string, unknown> } = {}
    ) => {
      const spans: Array<Tracer.NativeSpan> = []
      return Effect.gen(function*() {
        // oxlint-disable-next-line prefer-const
        let client!: Effect.Success<
          ReturnType<typeof RpcClient.makeNoSerialization<RpcGroup.Rpcs<typeof SpanGroup>, never>>
        >
        const server = yield* RpcServer.makeNoSerialization(SpanGroup, {
          ...options,
          onFromServer: (response) => client.write(response)
        })
        client = yield* RpcClient.makeNoSerialization(SpanGroup, {
          ...options,
          supportsAck: true,
          onFromClient: ({ message }) => server.write(0, message)
        })
        yield* method === "Ping" ? client.client["Echo.Ping"]() : Stream.runDrain(client.client["Echo.Events"]())
        return spans
      }).pipe(
        Effect.provide(SpanGroup.toLayer({
          "Echo.Ping": () => Effect.succeed("pong"),
          "Echo.Events": () => Stream.make("event")
        })),
        Effect.provideService(
          Tracer.Tracer,
          Tracer.make({
            span(options) {
              const span = new Tracer.NativeSpan(options)
              spans.push(span)
              return span
            }
          })
        )
      )
    }

    it.effect("records RPC span defaults for streaming calls", () =>
      Effect.gen(function*() {
        const spans = yield* call("Events")
        assert.deepStrictEqual(spans.map((span) => span.kind).sort(), ["client", "server"])
        for (const span of spans) {
          assert.strictEqual(span.name, "Echo.Events")
          assert.strictEqual(span.attributes.get("rpc.system.name"), "effect_rpc")
          assert.strictEqual(span.attributes.get("rpc.method"), "Echo.Events")
        }
      }))

    it.effect("uses spanPrefix and spanAttributes for unary calls", () =>
      Effect.gen(function*() {
        const spans = yield* call("Ping", {
          spanPrefix: "Custom",
          spanAttributes: { "rpc.system.name": "custom_rpc", "rpc.method": "custom_method" }
        })
        assert.deepStrictEqual(spans.map((span) => span.kind).sort(), ["client", "server"])
        for (const span of spans) {
          assert.strictEqual(span.name, "Custom.Echo.Ping")
          assert.strictEqual(span.attributes.get("rpc.system.name"), "custom_rpc")
          assert.strictEqual(span.attributes.get("rpc.method"), "custom_method")
        }
      }))
  })
})
