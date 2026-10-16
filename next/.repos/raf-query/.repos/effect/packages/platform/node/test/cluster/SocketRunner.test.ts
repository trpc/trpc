import { NodeClusterSocket, NodeSocketServer } from "@effect/platform-node"
import { assert, describe, it } from "@effect/vitest"
import { BigDecimal, Cause, Deferred, Effect, Exit, Fiber, Layer, Option, PrimaryKey, Schema } from "effect"
import type { Sharding } from "effect/cluster"
import {
  ClusterSchema,
  Entity,
  MessageStorage,
  RunnerAddress,
  RunnerHealth,
  RunnerStorage,
  ShardingConfig,
  SocketRunner
} from "effect/cluster"
import { Rpc, RpcSerialization } from "effect/rpc"
import * as SocketServer from "effect/socket/SocketServer"

const HOST = "127.0.0.1"

class TestPayload extends Schema.Class<TestPayload>("TestPayload")({
  id: Schema.String,
  amount: Schema.BigDecimal
}) {
  [PrimaryKey.symbol]() {
    return this.id
  }
}

const TestEntity = Entity
  .make("TestEntity", [
    Rpc.make("Process", {
      payload: TestPayload,
      success: Schema.Void
    }).annotate(ClusterSchema.Persisted, true),
    Rpc.make("ProcessVolatile", {
      payload: TestPayload,
      success: Schema.Void
    }).annotate(ClusterSchema.Persisted, false)
  ])
  .annotateRpcs(ClusterSchema.Uninterruptible, true)

// Build shared storage instances once, so runner and client see the same state.
// MessageStorage.layerMemory requires ShardingConfig, so we provide a minimal one.
const SharedStorage = Layer.mergeAll(
  RunnerStorage.layerMemory,
  MessageStorage.layerMemory
).pipe(
  Layer.provide(ShardingConfig.layerDefaults)
)

const startRunner = Effect.fnUntraced(function*(
  entities: Layer.Layer<never, never, Sharding.Sharding>,
  serialization: Layer.Layer<RpcSerialization.RpcSerialization> = RpcSerialization.layerSchemaBinary()
) {
  const socketServer = yield* NodeSocketServer.make({ host: HOST, port: 0 })
  if (socketServer.address._tag !== "InetAddressV4") {
    return yield* Effect.die("Expected a TCP socket server")
  }
  const port = socketServer.address.port
  yield* entities.pipe(
    Layer.provideMerge(SocketRunner.layer),
    Layer.provide(RunnerHealth.layerNoop),
    Layer.provide(Layer.succeed(SocketServer.SocketServer, socketServer)),
    Layer.provide(NodeClusterSocket.layerClientProtocol),
    Layer.provide(ShardingConfig.layer({
      runnerAddress: Option.some(RunnerAddress.make(HOST, port)),
      entityTerminationTimeout: 0,
      entityMessagePollInterval: 5000,
      sendRetryInterval: 100
    })),
    Layer.provide(serialization),
    Layer.build
  )
  return port
})

const makeClientLayer = (port: number) =>
  SocketRunner.layerClientOnly.pipe(
    Layer.provide(NodeClusterSocket.layerClientProtocol),
    Layer.provide(ShardingConfig.layer({
      runnerAddress: Option.some(RunnerAddress.make(HOST, port)),
      runnerListenAddress: Option.some(RunnerAddress.make(HOST, port)),
      entityTerminationTimeout: 0,
      entityMessagePollInterval: 5000,
      sendRetryInterval: 100
    })),
    Layer.provide(RpcSerialization.layerSchemaBinary())
  )

const makeConfiguredClientLayer = (
  port: number,
  serialization?: "binary" | "ndjson",
  serializationMaxBufferSize?: number | "unbounded"
) =>
  NodeClusterSocket.layer({
    clientOnly: true,
    storage: "byo",
    ...(serialization === undefined ? undefined : { serialization }),
    ...(serializationMaxBufferSize === undefined ? undefined : { serializationMaxBufferSize }),
    shardingConfig: {
      runnerAddress: Option.some(RunnerAddress.make(HOST, port)),
      runnerListenAddress: Option.some(RunnerAddress.make(HOST, port)),
      entityTerminationTimeout: 0,
      entityMessagePollInterval: 5000,
      sendRetryInterval: 100
    }
  })

const SerializationEntity = Entity
  .make("SerializationEntity", [
    Rpc.make("Ping", {
      success: Schema.String
    })
  ])
  .annotateRpcs(ClusterSchema.Persisted, false)

const SerializationEntityLayer = SerializationEntity.toLayer(
  Effect.succeed({ Ping: () => Effect.succeed("pong") })
)

const assertSerialization = (
  serverSerialization: Layer.Layer<RpcSerialization.RpcSerialization>,
  clientSerialization?: "binary" | "ndjson"
) =>
  Effect.gen(function*() {
    const port = yield* startRunner(SerializationEntityLayer, serverSerialization)

    const result = yield* Effect.gen(function*() {
      const makeClient = yield* SerializationEntity.client
      return yield* makeClient("serialization-entity").Ping()
    }).pipe(
      Effect.provide(makeConfiguredClientLayer(port, clientSerialization)),
      Effect.scoped
    )

    assert.strictEqual(result, "pong")
  }).pipe(Effect.provide(SharedStorage))

// An entity whose reply cannot be serialized: the handler returns a
// non-integer for a `Schema.Int` success schema, so `Reply.serialize` fails
// on the host runner when encoding the reply for the wire.
const IsolationEntity = Entity
  .make("IsolationEntity", [
    Rpc.make("BadReply", {
      payload: { id: Schema.Number },
      success: Schema.Int
    }),
    Rpc.make("Slow", {
      success: Schema.String
    })
  ])
  .annotateRpcs(ClusterSchema.Persisted, false)

// BigDecimal.normalize creates a circular `normalized` self-reference.
// When a persisted message is sent with discard: true, the notify path in Runners.makeRpc
// passes the raw envelope (with circular BigDecimal payload) to the runner,
// causing RangeError: Maximum call stack size exceeded.
//
// Volatile discard should complete after the request is sent, without waiting for the
// host runner to finish handling it.
describe("SocketRunner", () => {
  it.live(
    "uses SchemaBinary by default for TCP connections",
    () => assertSerialization(RpcSerialization.layerSchemaBinary()),
    15_000
  )

  it.live(
    "preserves an explicit binary selection",
    () => assertSerialization(RpcSerialization.layerSchemaBinary(), "binary"),
    15_000
  )

  it.live(
    "applies serializationMaxBufferSize to the default SchemaBinary parser",
    () =>
      Effect.gen(function*() {
        const port = yield* startRunner(SerializationEntityLayer)

        yield* Effect.gen(function*() {
          const makeClient = yield* SerializationEntity.client
          assert.strictEqual(yield* makeClient("serialization-limit-entity").Ping(), "pong")
        }).pipe(
          Effect.provide(makeConfiguredClientLayer(port)),
          Effect.scoped
        )

        const exit = yield* Effect.gen(function*() {
          const makeClient = yield* SerializationEntity.client
          return yield* makeClient("serialization-limit-entity").Ping().pipe(Effect.timeout("1 second"))
        }).pipe(
          Effect.provide(makeConfiguredClientLayer(port, undefined, 1)),
          Effect.scoped,
          Effect.exit
        )

        assert.isTrue(Exit.isFailure(exit), "the configured frame limit must reject the response")
      }).pipe(Effect.provide(SharedStorage)),
    15_000
  )

  it.live(
    "discarded persisted requests serialize circular values and volatile requests do not wait for replies",
    () =>
      Effect.gen(function*() {
        const volatileStarted = yield* Deferred.make<void>()
        const releaseVolatile = yield* Deferred.make<void>()
        const TestEntityLayer = TestEntity.toLayer(
          Effect.succeed({
            Process: () => Effect.void,
            ProcessVolatile: () =>
              Deferred.succeed(volatileStarted, void 0).pipe(
                Effect.andThen(Deferred.await(releaseVolatile))
              )
          })
        )

        // Start the runner (with socket server and entity handler)
        const port = yield* startRunner(TestEntityLayer)
        yield* Effect.log("Before starting the client")

        // Send a message from the client with discard: true.
        // The BigDecimal is normalized to trigger the circular `normalized` self-reference.
        yield* Effect.gen(function*() {
          yield* Effect.log("Starting the client")
          const makeClient = yield* TestEntity.client
          const client = makeClient("entity-1")

          const amount = BigDecimal.fromStringUnsafe("123.45")

          yield* client.Process(
            TestPayload.make({ id: "req-1", amount }),
            { discard: true }
          )

          const volatileFiber = yield* client.ProcessVolatile(
            TestPayload.make({ id: "req-2", amount }),
            { discard: true }
          ).pipe(Effect.forkChild)

          yield* Deferred.await(volatileStarted).pipe(
            Effect.timeoutOrElse({
              duration: "5 seconds",
              orElse: () => Effect.die("the volatile request never reached its handler")
            })
          )
          yield* Fiber.join(volatileFiber).pipe(
            Effect.timeoutOrElse({
              duration: "1 second",
              orElse: () => Effect.die("volatile discard waited for the entity reply")
            })
          )
          yield* Deferred.succeed(releaseVolatile, void 0)
        }).pipe(
          Effect.provide(makeClientLayer(port)),
          Effect.scoped
        )
      }).pipe(Effect.provide(
        SharedStorage
      )),
    30_000
  )

  it.live(
    "a reply serialization failure fails only its own request",
    () =>
      Effect.gen(function*() {
        const slowStarted = yield* Deferred.make<void>()
        const releaseSlow = yield* Deferred.make<void>()
        const IsolationEntityLayer = IsolationEntity.toLayer(
          Effect.succeed({
            BadReply: () => Effect.succeed(1.5),
            Slow: () =>
              Deferred.succeed(slowStarted, void 0).pipe(
                Effect.andThen(Deferred.await(releaseSlow)),
                Effect.as("done")
              )
          })
        )
        const port = yield* startRunner(IsolationEntityLayer)

        yield* Effect.gen(function*() {
          const makeClient = yield* IsolationEntity.client

          // a sibling request in flight on the same runner-to-runner connection
          const slowFiber = yield* makeClient("slow-entity").Slow().pipe(Effect.forkChild)
          yield* Deferred.await(slowStarted).pipe(
            Effect.timeoutOrElse({
              duration: "5 seconds",
              orElse: () => Effect.die("the Slow request never reached its handler")
            })
          )

          const badExit = yield* makeClient("bad-entity").BadReply({ id: 1 }).pipe(
            Effect.exit,
            Effect.ensuring(Deferred.succeed(releaseSlow, void 0))
          )
          assert.isTrue(Exit.isFailure(badExit), "the unencodable reply must fail the request")
          const failure = Exit.isFailure(badExit) ? String(Cause.squash(badExit.cause)) : ""
          assert.include(failure, "MalformedMessage", "the caller must receive the real encode error")
          assert.notInclude(
            failure,
            "AlreadyProcessingMessage",
            "the request must not be re-sent into the entity's dedup guard"
          )

          const slowExit = yield* Fiber.await(slowFiber)
          assert.isTrue(
            Exit.isSuccess(slowExit),
            "a sibling in-flight request on the same connection must be unaffected"
          )
          if (Exit.isSuccess(slowExit)) {
            assert.strictEqual(slowExit.value, "done")
          }
        }).pipe(
          Effect.provide(makeClientLayer(port)),
          Effect.scoped
        )
      }).pipe(Effect.provide(
        SharedStorage
      )),
    30_000
  )
})
