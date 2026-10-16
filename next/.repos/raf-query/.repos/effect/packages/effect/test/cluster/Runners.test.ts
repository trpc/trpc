import { assert, describe, it } from "@effect/vitest"
import { Cause, Context, Deferred, Effect, Exit, Layer, Option, Queue, Schema, Stream } from "effect"
import {
  ClusterError,
  ClusterSchema,
  Entity,
  EntityAddress,
  EntityId,
  EntityType,
  Envelope,
  HttpRunner,
  Message,
  MessageStorage,
  type Reply,
  RunnerAddress,
  RunnerHealth,
  Runners,
  RunnerServer,
  RunnerStorage,
  ShardId,
  Sharding,
  ShardingConfig,
  Snowflake
} from "effect/cluster"
import { Headers, HttpClient, HttpClientResponse } from "effect/http"
import { Rpc, RpcClient, RpcGroup, RpcMessage, RpcSerialization, RpcServer, RpcTest } from "effect/rpc"
import { RpcClientError } from "effect/rpc/RpcClientError"
import type { FromClientEncoded, FromServerEncoded } from "effect/rpc/RpcMessage"
import { Socket } from "effect/socket"
import { TestClock } from "effect/testing"

// An entity whose replies cannot be serialized: the handlers return
// non-integers for a `Schema.Int` success schema, so `Reply.serialize` fails
// on encode.
const BadReplyEntity = Entity.make("BadReplyEntity", [
  Rpc.make("BadReply", {
    success: Schema.Int,
    payload: { id: Schema.Number }
  }),
  Rpc.make("BadStream", {
    success: Schema.Int,
    payload: { id: Schema.Number },
    stream: true
  })
]).annotateRpcs(ClusterSchema.Persisted, false)

const BadReplyEntityLayer = BadReplyEntity.toLayer({
  BadReply: () => Effect.succeed(1.5),
  BadStream: () => Stream.make(2.5)
})

const TestShardingConfig = ShardingConfig.layer({
  entityMailboxCapacity: 10,
  entityTerminationTimeout: 0,
  entityMessagePollInterval: 5000,
  sendRetryInterval: 100,
  refreshAssignmentsInterval: 0
})

const layerServerProtocol = (codecFor: RpcSerialization.CodecFor) =>
  Layer.effect(RpcServer.Protocol)(
    Effect.map(Queue.unbounded<number>(), (disconnects) =>
      RpcServer.Protocol.of({
        run: () => Effect.never,
        disconnects,
        send: () => Effect.void,
        end: () => Effect.void,
        clientIds: Effect.succeed(new Set()),
        initialMessage: Effect.succeedNone,
        supportsAck: false,
        supportsTransferables: false,
        supportsSpanPropagation: false,
        supportsNotifications: false,
        codecFor
      }))
  )

const RunnerServerHandlers = RunnerServer.layerHandlers.pipe(
  Layer.provide(layerServerProtocol(Schema.toCodecJson as RpcSerialization.CodecFor)),
  Layer.provideMerge(BadReplyEntityLayer),
  Layer.provideMerge(Sharding.layer),
  Layer.provideMerge(Snowflake.layerGenerator),
  Layer.provide(RunnerStorage.layerMemory),
  Layer.provide(RunnerHealth.layerNoop),
  Layer.provide(Runners.layerNoop),
  Layer.provideMerge(MessageStorage.layerMemory),
  Layer.provide(TestShardingConfig)
)

describe.concurrent("HttpRunner", () => {
  const address = RunnerAddress.make("localhost", 8080)
  const Rpcs = RpcGroup.make(Rpc.make("Ping", { success: Schema.String }))

  it.effect("preserves a leading slash in HTTP client paths", () => {
    let requestUrl: string | undefined
    const httpClient = HttpClient.make((request) => {
      requestUrl = request.url
      return Effect.succeed(HttpClientResponse.fromWeb(
        request,
        new Response("[{\"_tag\":\"Exit\",\"requestId\":\"0\",\"exit\":{\"_tag\":\"Success\",\"value\":\"pong\"}}]")
      ))
    })
    return Effect.gen(function*() {
      const runnerProtocol = yield* Runners.RpcClientProtocol
      const protocol = yield* runnerProtocol.make(address)
      const client = yield* RpcClient.make(Rpcs, {
        generateRequestId: () => RpcMessage.RequestId("0")
      }).pipe(Effect.provideService(RpcClient.Protocol, protocol))

      yield* client.Ping()

      assert.strictEqual(requestUrl, "http://localhost:8080/runner/")
    }).pipe(
      Effect.provide(HttpRunner.layerClientProtocolHttp({ path: "/runner" })),
      Effect.provide(RpcSerialization.layerJson),
      Effect.provideService(HttpClient.HttpClient, httpClient)
    )
  })

  it.effect("preserves a leading slash in WebSocket client paths", () =>
    Effect.gen(function*() {
      const connected = yield* Deferred.make<void>()
      let socketUrl: string | undefined
      const constructor: Socket.WebSocketConstructor["Service"] = (url) => {
        socketUrl = url
        return {
          readyState: 1,
          addEventListener() {},
          removeEventListener() {},
          close() {},
          send() {}
        }
      }

      yield* Effect.gen(function*() {
        const runnerProtocol = yield* Runners.RpcClientProtocol
        const protocol = yield* runnerProtocol.make(address)
        yield* protocol.run(0, () => Effect.void).pipe(Effect.forkScoped)
        yield* Deferred.await(connected)

        assert.strictEqual(socketUrl, "ws://localhost:8080/runner")
      }).pipe(
        Effect.provide(HttpRunner.layerClientProtocolWebsocket({ path: "/runner" })),
        Effect.provide(RpcSerialization.layerJson),
        Effect.provideService(Socket.WebSocketConstructor, constructor),
        Effect.provideService(RpcClient.ConnectionHooks, {
          onConnect: Deferred.succeed(connected, undefined).pipe(Effect.asVoid),
          onDisconnect: Effect.void
        }),
        Effect.scoped
      )
    }))
})

describe.concurrent("RunnerServer", () => {
  const makeRequest = (options: {
    readonly entityId: string
    readonly tag: string
  }) =>
    Effect.gen(function*() {
      const sharding = yield* Sharding.Sharding
      const snowflakeGen = yield* Snowflake.Generator
      const entityId = EntityId.make(options.entityId)
      const address = EntityAddress.make({
        shardId: sharding.getShardId(entityId, BadReplyEntity.getShardGroup(entityId)),
        entityType: EntityType.make("BadReplyEntity"),
        entityId
      })
      return {
        _tag: "Request",
        requestId: snowflakeGen.nextUnsafe(),
        address,
        tag: options.tag,
        payload: { id: 1 },
        headers: Headers.empty
      } as Envelope.PartialRequest
    })

  it.effect("a reply that fails to serialize fails only its own request", () =>
    Effect.gen(function*() {
      yield* TestClock.adjust(1)
      const client = yield* RpcTest.makeClient(Runners.Rpcs)
      const request = yield* makeRequest({ entityId: "bad-1", tag: "BadReply" })

      const exit = yield* Effect.exit(client.Effect({ request, persisted: false }))
      if (!Exit.isSuccess(exit)) {
        return assert.fail("Effect rpc must not defect on a reply serialization failure")
      }
      const reply = exit.value
      if (reply._tag !== "WithExit" || reply.exit._tag !== "Failure") {
        return assert.fail("expected a WithExit reply with a failure exit")
      }
      assert.strictEqual(reply.requestId, String(request.requestId))
      const die = reply.exit.cause.find((entry) => entry._tag === "Die")
      assert.isDefined(die, "the reply exit must carry the encode failure as a defect")
      assert.include(
        JSON.stringify(die),
        "MalformedMessage",
        "the defect must identify the encode failure"
      )
    }).pipe(Effect.provide(RunnerServerHandlers)))

  it.effect("a stream reply that fails to serialize ends the stream with the defect", () =>
    Effect.gen(function*() {
      yield* TestClock.adjust(1)
      const client = yield* RpcTest.makeClient(Runners.Rpcs)
      const request = yield* makeRequest({ entityId: "bad-2", tag: "BadStream" })

      const queue = yield* client.Stream({ request, persisted: false }, { asQueue: true })
      const replies: Array<Reply.Encoded> = []
      yield* Queue.take(queue).pipe(
        Effect.flatMap((reply) =>
          Effect.sync(() => {
            replies.push(reply)
          })
        ),
        Effect.forever,
        Effect.catchTag("Done", () => Effect.void)
      )

      assert.strictEqual(replies.length, 1)
      const last = replies[0]
      if (last._tag !== "WithExit" || last.exit._tag !== "Failure") {
        return assert.fail("expected a terminal WithExit reply with a failure exit")
      }
      assert.strictEqual(last.requestId, String(request.requestId))
      assert.include(
        JSON.stringify(last.exit.cause),
        "MalformedMessage",
        "the defect must identify the encode failure"
      )
    }).pipe(Effect.provide(RunnerServerHandlers)))
})

describe.concurrent("Runners.makeRpc", () => {
  const runnerAddress = RunnerAddress.make("localhost", 42_000)

  const TestRpc = Rpc.make("TestRpc", {
    success: Schema.Number,
    payload: { id: Schema.Number }
  }).annotate(ClusterSchema.Persisted, false)

  const TestRpcPersisted = Rpc.make("TestRpcPersisted", {
    success: Schema.Number,
    payload: { id: Schema.Number }
  }).annotate(ClusterSchema.Persisted, true)

  type SendRpc = typeof TestRpc | typeof TestRpcPersisted

  const makeOutgoingRequest = (
    rpc: SendRpc,
    requestId: Snowflake.Snowflake,
    respond: (reply: Reply.Reply<SendRpc>) => Effect.Effect<void>
  ): Message.OutgoingRequest<SendRpc> =>
    new Message.OutgoingRequest({
      envelope: Envelope.makeRequest<SendRpc>({
        requestId,
        address: EntityAddress.make({
          shardId: ShardId.make("default", 1),
          entityType: EntityType.make("TestRpcEntity"),
          entityId: EntityId.make("1")
        }),
        tag: rpc._tag,
        payload: { id: 1 },
        headers: Headers.empty
      }),
      rpc,
      context: Context.empty(),
      lastReceivedReply: Option.none(),
      respond,
      annotations: Context.empty()
    })

  // A hole codec that is observably different from `Schema.toCodecJson`: the
  // entity payload becomes a JSON string inside the runner envelope.
  const codecForJsonString =
    (<S extends Schema.Top>(schema: S) =>
      Schema.fromJsonString(Schema.toCodecJson(schema as any))) as RpcSerialization.CodecFor

  const layerFakeProtocol = (
    onRequest: (
      request: FromClientEncoded,
      write: (data: FromServerEncoded) => Effect.Effect<void>
    ) => Effect.Effect<void, RpcClientError>,
    codecFor: RpcSerialization.CodecFor = Schema.toCodecJson as RpcSerialization.CodecFor
  ) =>
    Layer.succeed(Runners.RpcClientProtocol)({
      codecFor,
      make: () =>
        Effect.sync(() => {
          let write!: (data: FromServerEncoded) => Effect.Effect<void>
          return RpcClient.Protocol.of({
            run(_clientId, f) {
              write = f
              return Effect.never
            },
            send(_clientId, request) {
              return onRequest(request, write)
            },
            supportsAck: true,
            supportsTransferables: false,
            codecFor
          })
        })
    })

  const layerRunners = (protocol: Layer.Layer<Runners.RpcClientProtocol>) =>
    Runners.layerRpc.pipe(
      Layer.provideMerge(Snowflake.layerGenerator),
      Layer.provide(protocol),
      Layer.provideMerge(MessageStorage.layerNoop),
      Layer.provide(TestShardingConfig)
    )

  it.effect("uses the client protocol codec for simulated remote serialization", () => {
    let codecCalls = 0
    const codecFor = (<S extends Schema.Top>(schema: S) => {
      codecCalls++
      return Schema.fromJsonString(Schema.toCodecJson(schema as any))
    }) as RpcSerialization.CodecFor
    const codecForJson = Schema.toCodecJson as RpcSerialization.CodecFor
    return Effect.gen(function*() {
      const runners = yield* Runners.Runners
      const snowflake = yield* Snowflake.Generator
      const message = makeOutgoingRequest(TestRpc, snowflake.nextUnsafe(), () => Effect.void)

      yield* runners.sendLocal({
        message,
        simulateRemoteSerialization: true,
        send: (incoming) =>
          Effect.sync(() => {
            assert.strictEqual(incoming._tag, "IncomingRequestLocal")
            if (incoming._tag === "IncomingRequestLocal") {
              assert.strictEqual((incoming.envelope.payload as { readonly id: number }).id, 1)
            }
          })
      })

      assert.strictEqual(codecCalls, 2)
      assert.strictEqual(message.encodedCache?.codecFor, codecFor)
      const encodedJson = yield* Message.serialize(message, codecForJson)
      assert.strictEqual(encodedJson._tag, "Request")
      if (encodedJson._tag === "Request") {
        assert.deepStrictEqual(encodedJson.payload, { id: 1 })
      }
      assert.strictEqual(message.encodedCache?.codecFor, codecForJson)
    }).pipe(
      Effect.provide(layerRunners(layerFakeProtocol(() => Effect.void, codecFor)))
    )
  })

  const respondWithDefect = (request: FromClientEncoded, write: (data: FromServerEncoded) => Effect.Effect<void>) =>
    request._tag === "Request" ? write({ _tag: "Defect", defect: "boom" }) : Effect.void

  const failTransport = () =>
    Effect.fail(
      new RpcClientError({
        reason: new Socket.SocketCloseError({ code: 1006 })
      })
    )

  it.effect("a server-delivered defect resolves the request instead of RunnerUnavailable", () =>
    Effect.gen(function*() {
      const runners = yield* Runners.Runners
      const snowflakeGen = yield* Snowflake.Generator
      const replies: Array<Reply.Reply<SendRpc>> = []
      const message = makeOutgoingRequest(TestRpc, snowflakeGen.nextUnsafe(), (reply) =>
        Effect.sync(() => {
          replies.push(reply)
        }))

      const exit = yield* Effect.exit(runners.send({ address: runnerAddress, message }))
      assert.isTrue(Exit.isSuccess(exit), "send must not fail with RunnerUnavailable for a delivered defect")
      assert.strictEqual(replies.length, 1)
      const reply = replies[0]
      if (reply._tag !== "WithExit" || !Exit.isFailure(reply.exit)) {
        return assert.fail("expected a WithExit reply with a failure exit")
      }
      assert.include(
        String(Cause.squash(reply.exit.cause)),
        "boom",
        "the reply must carry the server defect"
      )
    }).pipe(Effect.provide(layerRunners(layerFakeProtocol(respondWithDefect)))))

  it.effect("transport failures still map to RunnerUnavailable", () =>
    Effect.gen(function*() {
      const runners = yield* Runners.Runners
      const snowflakeGen = yield* Snowflake.Generator
      const message = makeOutgoingRequest(TestRpc, snowflakeGen.nextUnsafe(), () => Effect.void)

      const exit = yield* Effect.exit(runners.send({ address: runnerAddress, message }))
      if (!Exit.isFailure(exit)) {
        return assert.fail("send must fail for a transport failure")
      }
      assert.instanceOf(Cause.squash(exit.cause), ClusterError.RunnerUnavailable)
    }).pipe(Effect.provide(layerRunners(layerFakeProtocol(failTransport)))))

  it.effect("volatile notification transport failures map to RunnerUnavailable", () =>
    Effect.gen(function*() {
      const runners = yield* Runners.Runners
      const snowflakeGen = yield* Snowflake.Generator
      const message = makeOutgoingRequest(TestRpc, snowflakeGen.nextUnsafe(), () => Effect.void)

      const exit = yield* Effect.exit(runners.notify({
        address: Option.some(runnerAddress),
        message,
        discard: true
      }))
      if (!Exit.isFailure(exit)) {
        return assert.fail("volatile notification must fail when delivery fails")
      }
      assert.instanceOf(Cause.squash(exit.cause), ClusterError.RunnerUnavailable)
    }).pipe(Effect.provide(layerRunners(layerFakeProtocol(failTransport)))))

  it.effect("persisted notification transport failures are ignored", () =>
    Effect.gen(function*() {
      const runners = yield* Runners.Runners
      const snowflakeGen = yield* Snowflake.Generator
      const message = makeOutgoingRequest(TestRpcPersisted, snowflakeGen.nextUnsafe(), () => Effect.void)

      yield* runners.notify({
        address: Option.some(runnerAddress),
        message,
        discard: true
      })
    }).pipe(Effect.provide(layerRunners(layerFakeProtocol(failTransport)))))

  it.effect("a delivered defect for a persisted request maps to RunnerUnavailable for storage recovery", () =>
    Effect.gen(function*() {
      const runners = yield* Runners.Runners
      const snowflakeGen = yield* Snowflake.Generator
      const message = makeOutgoingRequest(TestRpcPersisted, snowflakeGen.nextUnsafe(), () => Effect.void)

      const exit = yield* Effect.exit(runners.send({ address: runnerAddress, message }))
      if (!Exit.isFailure(exit)) {
        return assert.fail("send must fail for a delivered defect on a persisted request")
      }
      assert.instanceOf(Cause.squash(exit.cause), ClusterError.RunnerUnavailable)
    }).pipe(Effect.provide(layerRunners(layerFakeProtocol(respondWithDefect)))))

  it.effect("encodes the entity payload with the protocol codec and leaves the hole untouched", () => {
    const sent: Array<FromClientEncoded> = []
    const protocol = layerFakeProtocol(
      (request, write) => {
        sent.push(request)
        // the defect hole is filled by the same codec
        return request._tag === "Request"
          ? write({ _tag: "Defect", defect: JSON.stringify("boom") })
          : Effect.void
      },
      codecForJsonString
    )
    return Effect.gen(function*() {
      const runners = yield* Runners.Runners
      const snowflakeGen = yield* Snowflake.Generator
      const message = makeOutgoingRequest(TestRpc, snowflakeGen.nextUnsafe(), () => Effect.void)

      yield* runners.send({ address: runnerAddress, message })

      assert.strictEqual(sent.length, 1)
      const request = sent[0]
      if (request._tag !== "Request") {
        return assert.fail("expected a runner Request")
      }
      // the outer runner payload is filled by the protocol codec
      assert.strictEqual(typeof request.payload, "string")
      const outer = JSON.parse(request.payload as string)
      // the entity payload was encoded with the same codec and carried through
      // the opaque hole without being re-encoded
      assert.strictEqual(outer.request.payload, JSON.stringify({ id: 1 }))
    }).pipe(Effect.provide(layerRunners(protocol)))
  })
})
