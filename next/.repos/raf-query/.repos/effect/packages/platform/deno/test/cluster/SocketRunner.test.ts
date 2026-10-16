import { DenoClusterSocket } from "@effect/platform-deno"
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

const RUNNER_PORT = 50_125
const SharedStorage = Layer.mergeAll(
  RunnerStorage.layerMemory,
  MessageStorage.layerMemory
).pipe(
  Layer.provide(ShardingConfig.layerDefaults)
)

const makeRunnerLayer = (port: number, entities: Layer.Layer<never, never, Sharding.Sharding>) =>
  entities.pipe(
    Layer.provideMerge(SocketRunner.layer),
    Layer.provide(RunnerHealth.layerNoop),
    Layer.provide(DenoClusterSocket.layerSocketServer),
    Layer.provide(DenoClusterSocket.layerClientProtocol),
    Layer.provide(ShardingConfig.layer({
      runnerAddress: Option.some(RunnerAddress.make("127.0.0.1", port)),
      entityTerminationTimeout: 0,
      entityMessagePollInterval: 5000,
      sendRetryInterval: 100
    })),
    Layer.provide(RpcSerialization.layerSchemaBinary())
  )

const makeClientLayer = (port: number) =>
  SocketRunner.layerClientOnly.pipe(
    Layer.provide(DenoClusterSocket.layerClientProtocol),
    Layer.provide(ShardingConfig.layer({
      runnerAddress: Option.some(RunnerAddress.make("127.0.0.1", port)),
      runnerListenAddress: Option.some(RunnerAddress.make("127.0.0.1", port)),
      entityTerminationTimeout: 0,
      entityMessagePollInterval: 5000,
      sendRetryInterval: 100
    })),
    Layer.provide(RpcSerialization.layerSchemaBinary())
  )

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

const ISOLATION_PORT = 50_126

// BigDecimal.normalize creates a circular `normalized` self-reference.
// When a persisted message is sent with discard: true, the notify path in Runners.makeRpc
// passes the raw envelope (with circular BigDecimal payload) to the runner,
// causing RangeError: Maximum call stack size exceeded.
//
// Volatile discard should complete after the request is sent, without waiting for the
// host runner to finish handling it.
describe("SocketRunner", () => {
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

        yield* Layer.launch(makeRunnerLayer(RUNNER_PORT, TestEntityLayer)).pipe(Effect.forkScoped)

        yield* Effect.sleep("2 seconds")
        yield* Effect.gen(function*() {
          yield* Effect.sleep("2 seconds")
          const makeClient = yield* TestEntity.client
          yield* Effect.sleep("3 seconds")
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

          yield* Deferred.await(volatileStarted)
          yield* Fiber.join(volatileFiber).pipe(
            Effect.timeoutOrElse({
              duration: "1 second",
              orElse: () => Effect.die("volatile discard waited for the entity reply")
            })
          )
          yield* Deferred.succeed(releaseVolatile, void 0)
        }).pipe(
          Effect.provide(makeClientLayer(RUNNER_PORT)),
          Effect.scoped
        )
      }).pipe(Effect.provide(SharedStorage)),
    30_000
  )

  it.live(
    "a reply serialization failure fails only its own request",
    () =>
      Effect.gen(function*() {
        const slowStarted = yield* Deferred.make<void>()
        const IsolationEntityLayer = IsolationEntity.toLayer(
          Effect.succeed({
            BadReply: () => Effect.succeed(1.5),
            Slow: () =>
              Deferred.succeed(slowStarted, void 0).pipe(
                Effect.andThen(Effect.as(Effect.sleep("2 seconds"), "done"))
              )
          })
        )

        yield* Layer.launch(makeRunnerLayer(ISOLATION_PORT, IsolationEntityLayer)).pipe(Effect.forkScoped)
        yield* Effect.sleep("2 seconds")

        yield* Effect.gen(function*() {
          const makeClient = yield* IsolationEntity.client
          yield* Effect.sleep("3 seconds")

          const slowFiber = yield* makeClient("slow-entity").Slow().pipe(Effect.forkChild)
          yield* Deferred.await(slowStarted)

          const badExit = yield* makeClient("bad-entity").BadReply({ id: 1 }).pipe(Effect.exit)
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
          Effect.provide(makeClientLayer(ISOLATION_PORT)),
          Effect.scoped
        )
      }).pipe(Effect.provide(SharedStorage)),
    30_000
  )
})
