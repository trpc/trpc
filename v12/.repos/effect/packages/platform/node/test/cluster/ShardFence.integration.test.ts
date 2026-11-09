import { NodeCrypto } from "@effect/platform-node"
import { assert, describe, it } from "@effect/vitest"
import { Clock, Context, Deferred, Effect, Latch, Layer, Option, Schema } from "effect"
import {
  ClusterSchema,
  Entity,
  EntityId,
  MessageStorage,
  RunnerAddress,
  RunnerHealth,
  Runners,
  Sharding,
  ShardingConfig,
  type Snowflake,
  SqlMessageStorage,
  SqlRunnerStorage
} from "effect/cluster"
import { Rpc } from "effect/rpc"
import { SqlClient } from "effect/sql"
import { TestClock } from "effect/testing"
import { PgContainer } from "../fixtures/pg-utils.ts"

const Hold = Entity.make("Hold", [
  Rpc.make("Hold", { success: Schema.String })
]).annotateRpcs(ClusterSchema.Persisted, true)

interface RunnerProbe {
  readonly port: number
  readonly entered: Deferred.Deferred<Snowflake.Snowflake>
  readonly gate: Latch.Latch
  readonly returned: Deferred.Deferred<void>
}

const makeProbe = (port: number): RunnerProbe => ({
  port,
  entered: Deferred.makeUnsafe(),
  gate: Latch.makeUnsafe(false),
  returned: Deferred.makeUnsafe()
})

const HoldLayer = (probe: RunnerProbe) =>
  Hold.toLayer(Effect.gen(function*() {
    const address = yield* Entity.CurrentRunnerAddress
    return Hold.of({
      Hold: Effect.fnUntraced(function*(envelope) {
        yield* Deferred.succeed(probe.entered, envelope.requestId)
        yield* probe.gate.await
        yield* Deferred.succeed(probe.returned, void 0)
        return String(address.port)
      })
    })
  }))

// A clock whose timers stop firing while frozen, as in a paused process: the
// runner's lock refreshes, heartbeats and storage polls stall, while work that
// does not wait on a timer, such as a running handler, carries on.
const makeFreezableClock = () => {
  const live = Clock.Clock.defaultValue()
  const thawed = Latch.makeUnsafe(true)
  const clock: Clock.Clock = {
    currentTimeMillisUnsafe: () => live.currentTimeMillisUnsafe(),
    currentTimeMillis: live.currentTimeMillis,
    currentTimeNanosUnsafe: () => live.currentTimeNanosUnsafe(),
    currentTimeNanos: live.currentTimeNanos,
    monotonicTimeNanosUnsafe: () => live.monotonicTimeNanosUnsafe(),
    monotonicTimeNanos: live.monotonicTimeNanos,
    sleep: (duration) => Effect.andThen(live.sleep(duration), thawed.await)
  }
  return {
    clock,
    freeze: Effect.sync(() => {
      thawed.closeUnsafe()
    }),
    thaw: thawed.open
  }
}

const RunnerLayer = (probe: RunnerProbe, config: Partial<ShardingConfig.ShardingConfig["Service"]>) =>
  HoldLayer(probe).pipe(
    Layer.provideMerge(Sharding.layer),
    Layer.provide([SqlRunnerStorage.layer, RunnerHealth.layerNoop, Runners.layerNoop]),
    Layer.provideMerge(SqlMessageStorage.layer),
    Layer.provide(NodeCrypto.layer),
    Layer.provide(ShardingConfig.layer({
      ...config,
      runnerAddress: Option.some(RunnerAddress.make("localhost", probe.port)),
      shardsPerGroup: 1,
      // Short enough for B to take over quickly, with lock operation deadlines
      // that tolerate CI latency.
      shardLockExpiration: 3000,
      shardLockRefreshInterval: 1000,
      entityMessagePollInterval: 100,
      refreshAssignmentsInterval: 100,
      entityTerminationTimeout: 0
    }))
  )

const waitFor = Effect.fnUntraced(function*<A, E, R>(effect: Effect.Effect<A | undefined, E, R>) {
  while (true) {
    const value = yield* effect
    if (value !== undefined) return value
    yield* Effect.sleep(20)
  }
})

const staleOwnerTest = Effect.fnUntraced(
  function*(options: { readonly advisory: boolean }) {
    const sql = yield* SqlClient.SqlClient
    const config = { shardLockDisableAdvisory: !options.advisory }
    const pauseA = makeFreezableClock()
    const probeA = makeProbe(1234)
    const probeB = makeProbe(5678)

    const contextA = yield* Layer.build(RunnerLayer(probeA, config)).pipe(
      Effect.provideService(Clock.Clock, pauseA.clock)
    )
    const storage = Context.get(contextA, MessageStorage.MessageStorage)
    yield* Hold.client.pipe(
      Effect.flatMap((makeClient) => makeClient("1").Hold(void 0, { discard: true })),
      Effect.provide(contextA)
    )
    const requestId = yield* Deferred.await(probeA.entered).pipe(
      Effect.timeoutOrElse({ duration: 10_000, orElse: () => Effect.die("runner A never started the request") })
    )

    // A is paused, and its lock session is lost.
    yield* pauseA.freeze
    if (options.advisory) {
      yield* sql`SELECT pg_terminate_backend(pid, 10000) FROM pg_locks
        WHERE locktype = 'advisory' AND objsubid = 2
        AND database = (SELECT oid FROM pg_database WHERE datname = current_database())`
    }

    const contextB = yield* Layer.build(RunnerLayer(probeB, config))
    const shardingB = Context.get(contextB, Sharding.Sharding)
    const shardId = shardingB.getShardId(EntityId.make("1"), "default")
    yield* waitFor(Effect.sync(() => shardingB.hasShardId(shardId) || undefined)).pipe(
      Effect.timeoutOrElse({ duration: 15_000, orElse: () => Effect.die("runner B never acquired the shard") })
    )
    yield* Deferred.await(probeB.entered).pipe(
      Effect.timeoutOrElse({ duration: 15_000, orElse: () => Effect.die("runner B never started the request") })
    )

    // A's handler finishes before A's lock refresh has run again.
    yield* probeA.gate.open
    yield* Deferred.await(probeA.returned)

    const storedExit = storage.repliesForUnfiltered([requestId]).pipe(
      Effect.map((replies) => replies.find((reply) => reply._tag === "WithExit"))
    )
    // An unfenced write lands within milliseconds of the handler returning.
    const stale = yield* waitFor(storedExit).pipe(Effect.timeoutOption(2000))
    assert.isTrue(Option.isNone(stale), "the stale owner stored its reply")

    yield* probeB.gate.open
    const reply = yield* waitFor(storedExit).pipe(
      Effect.timeoutOrElse({ duration: 10_000, orElse: () => Effect.die("runner B never stored its reply") })
    )
    assert(reply._tag === "WithExit")
    assert.deepStrictEqual(reply.exit, { _tag: "Success", value: "5678" })

    // Resume A so it can shut down. It may legitimately own the shard again
    // from here, so nothing about it is asserted.
    yield* pauseA.thaw
  },
  // Release both runners before the database.
  Effect.scoped,
  Effect.provide(PgContainer.layerClientDatabase),
  TestClock.withLive
)

describe("Sharding shard fencing", { concurrent: false }, () => {
  // Each test runs two runners against live lock deadlines, so keep them apart.
  it.layer(PgContainer.layer, { concurrent: false, timeout: 120_000 })((it) => {
    it.effect(
      "a runner that lost its advisory lock cannot store a reply",
      () => staleOwnerTest({ advisory: true }),
      60_000
    )

    it.effect("a runner that lost its lease cannot store a reply", () => staleOwnerTest({ advisory: false }), 60_000)
  })
})
