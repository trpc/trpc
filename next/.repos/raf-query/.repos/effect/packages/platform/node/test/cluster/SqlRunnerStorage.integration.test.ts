import { NodeFileSystem } from "@effect/platform-node"
import { SqliteClient } from "@effect/sql-sqlite-node"
import { assert, describe, expect, it } from "@effect/vitest"
import { Cause, Duration, Effect, Exit, Fiber, FileSystem, Latch, Layer, Schedule } from "effect"
import {
  ClusterError,
  Runner,
  RunnerAddress,
  RunnerStorage,
  ShardId,
  ShardingConfig,
  SqlRunnerStorage
} from "effect/cluster"
import { SqlClient, type SqlConnection, SqlError } from "effect/sql"
import { TestClock } from "effect/testing"
import { MysqlContainer } from "../fixtures/mysql2-utils.ts"
import { PgContainer } from "../fixtures/pg-utils.ts"

const StorageLayer = SqlRunnerStorage.layer

// Allow for CI latency in healthy PostgreSQL queries.
const lockOperationInterval = 1000
const partitionConfig = {
  // Keep expiration / 3 above the operation deadline.
  shardLockExpiration: lockOperationInterval * 10,
  shardLockRefreshInterval: lockOperationInterval
}

describe("SqlRunnerStorage", () => {
  it.effect("bounds shard lock operations and rebuilds an unresponsive reserved connection", () => {
    const partitioned = makePartitionState()
    const layer = StorageLayer.pipe(
      Layer.provideMerge(blackholeReservedConnection(partitioned, true)),
      Layer.provide(ShardingConfig.layer(partitionConfig))
    )

    return Effect.gen(function*() {
      const storage = yield* RunnerStorage.RunnerStorage
      const runner = Runner.make({
        address: runnerAddress1,
        groups: ["default"],
        weight: 1
      })
      const shards = [ShardId.make("default", 1)]

      yield* storage.register(runner, true)
      yield* storage.acquire(runnerAddress1, shards)
      partitionConnection(partitioned)

      const expectDeadline = Effect.fnUntraced(function*(operation: Effect.Effect<unknown, unknown>) {
        const [elapsed, exit] = yield* operation.pipe(
          Effect.exit,
          Effect.timed
        )
        assert(Exit.isFailure(exit))
        const error = Cause.squash(exit.cause)
        assert(error instanceof ClusterError.PersistenceError)
        assert.isBelow(Duration.toMillis(elapsed), lockOperationInterval * 5)
        yield* Effect.sleep(20)
      })

      const expectRecovery = Effect.fnUntraced(function*() {
        restoreConnection(partitioned)
        expect(
          yield* storage.refresh(runnerAddress1, shards).pipe(
            Effect.retry({ times: 5, schedule: Schedule.spaced(20) })
          )
        ).toEqual(shards)
      })

      yield* expectDeadline(storage.refresh(runnerAddress1, shards))
      yield* expectDeadline(storage.refresh(runnerAddress1, shards))
      yield* expectDeadline(storage.refresh(runnerAddress1, shards))

      assert.isAtLeast(partitioned.interruptedQueries, 1)
      assert.isAtMost(partitioned.maxActiveQueries, 1)

      yield* expectRecovery()

      partitionConnection(partitioned)
      yield* expectDeadline(storage.acquire(runnerAddress1, [ShardId.make("default", 2)]))
      yield* expectRecovery()

      partitionConnection(partitioned)
      yield* expectDeadline(storage.release(runnerAddress1, shards[0]))
      yield* expectRecovery()
      yield* storage.release(runnerAddress1, shards[0])

      assert.strictEqual(partitioned.activeQueries, 0)
    }).pipe(
      Effect.timeoutOrElse({
        duration: 30_000,
        orElse: () =>
          Effect.die(
            `timed out exercising shard lock rebuilds (${partitionDiagnostics(partitioned)})`
          )
      }),
      // Ensure layer teardown cannot mask a body failure with Vitest's timeout.
      Effect.ensuring(Effect.sync(() => {
        restoreConnection(partitioned)
      })),
      Effect.provide(layer),
      TestClock.withLive
    )
  }, 60_000)

  it.effect("empty liveness probe bypasses a wedged reserved connection", () => {
    const partitioned = makePartitionState()
    const layer = StorageLayer.pipe(
      Layer.provideMerge(blackholeReservedConnection(partitioned, true)),
      Layer.provide(ShardingConfig.layer(partitionConfig))
    )

    return Effect.gen(function*() {
      const storage = yield* RunnerStorage.RunnerStorage
      const runner = Runner.make({
        address: runnerAddress1,
        groups: ["default"],
        weight: 1
      })
      const shards = [ShardId.make("default", 1)]

      yield* storage.register(runner, true)
      yield* storage.acquire(runnerAddress1, shards)
      partitionConnection(partitioned)

      // shard lock operations are stuck behind the wedged reserved connection
      const exit = yield* storage.refresh(runnerAddress1, shards).pipe(Effect.exit)
      assert(Exit.isFailure(exit))

      // the liveness probe runs on the shared pool, so it must succeed while
      // the reserved connection stays wedged
      expect(yield* storage.refresh(runnerAddress1, [])).toEqual([])

      restoreConnection(partitioned)
      expect(
        yield* storage.refresh(runnerAddress1, shards).pipe(
          Effect.retry({ times: 20, schedule: Schedule.spaced(20) })
        )
      ).toEqual(shards)
    }).pipe(
      Effect.ensuring(Effect.sync(() => {
        restoreConnection(partitioned)
      })),
      Effect.provide(layer),
      TestClock.withLive
    )
  }, 60_000)

  it.effect("recovers when a blackholed query cannot resume after the partition clears", () => {
    const partitioned = makePartitionState()
    const layer = StorageLayer.pipe(
      Layer.provideMerge(blackholeReservedConnection(partitioned, false)),
      Layer.provide(ShardingConfig.layer({
        shardLockDisableAdvisory: true,
        ...partitionConfig
      }))
    )

    return Effect.gen(function*() {
      const storage = yield* RunnerStorage.RunnerStorage
      const runner = Runner.make({
        address: runnerAddress1,
        groups: ["default"],
        weight: 1
      })
      const shards = [ShardId.make("default", 1)]

      yield* storage.register(runner, true)
      yield* storage.acquire(runnerAddress1, shards)
      partitionConnection(partitioned)
      yield* storage.refresh(runnerAddress1, shards).pipe(Effect.exit)
      yield* waitUntil(() => partitioned.activeQueries === 0)

      restoreConnection(partitioned)
      expect(
        yield* storage.refresh(runnerAddress1, shards).pipe(
          Effect.retry({ times: 20, schedule: Schedule.spaced(20) })
        )
      ).toEqual(shards)
      assert.isAtLeast(partitioned.interruptedQueries, 1)
      assert.isAtMost(partitioned.maxActiveQueries, 1)
    }).pipe(
      Effect.ensuring(Effect.sync(() => {
        restoreConnection(partitioned)
      })),
      Effect.provide(layer),
      TestClock.withLive
    )
  }, 60_000)

  it.effect("rebuilds the reserved connection again when a rebuilt connection stops responding", () => {
    const partitioned = makePartitionState()
    const layer = StorageLayer.pipe(
      Layer.provideMerge(blackholeReservedConnection(partitioned, false)),
      Layer.provide(ShardingConfig.layer(partitionConfig))
    )

    return Effect.gen(function*() {
      const storage = yield* RunnerStorage.RunnerStorage
      const runner = Runner.make({
        address: runnerAddress1,
        groups: ["default"],
        weight: 1
      })
      const shards = [ShardId.make("default", 1)]

      yield* storage.register(runner, true)
      yield* storage.acquire(runnerAddress1, shards)

      // a failing lock operation rebuilds the reserved connection
      partitioned.failNextQueries = 1
      yield* storage.refresh(runnerAddress1, shards).pipe(Effect.exit)
      yield* waitUntil(() => partitioned.usableConnections === 2)

      // the rebuilt connection then wedges, without any lock operation
      // succeeding in between - a further rebuild still has to be attempted
      const reserved = partitioned.reservedConnections
      partitionConnection(partitioned)
      yield* storage.refresh(runnerAddress1, shards).pipe(Effect.exit)
      yield* storage.refresh(runnerAddress1, shards).pipe(Effect.exit)
      restoreConnection(partitioned)
      yield* waitUntil(() => partitioned.reservedConnections > reserved)

      expect(
        yield* storage.refresh(runnerAddress1, shards).pipe(
          Effect.retry({ times: 5, schedule: Schedule.spaced(20) })
        )
      ).toEqual(shards)
    }).pipe(
      Effect.ensuring(Effect.sync(() => {
        restoreConnection(partitioned)
      })),
      Effect.provide(layer),
      TestClock.withLive
    )
  }, 60_000)

  it.effect(
    "rebuilds the reserved connection when releasing the previous one hangs",
    () =>
      withStalledRelease((storage, shards, partitioned) =>
        Effect.gen(function*() {
          yield* Effect.sleep(lockOperationInterval * 1.5)

          // the stalled release must not disable further rebuilds
          restoreConnection(partitioned)
          const reserved = partitioned.reservedConnections
          yield* storage.refresh(runnerAddress1, shards).pipe(Effect.exit)
          yield* waitUntil(() => partitioned.reservedConnections > reserved)

          expect(
            yield* storage.refresh(runnerAddress1, shards).pipe(
              Effect.retry({ times: 20, schedule: Schedule.spaced(20) })
            )
          ).toEqual(shards)
        })
      ),
    60_000
  )

  it.effect(
    "replaces a pending reserved connection once when operations waiting on it fail",
    () =>
      withStalledRelease((storage, shards, partitioned) =>
        Effect.gen(function*() {
          restoreConnection(partitioned)
          const reserved = partitioned.reservedConnections

          // both operations wait on the pending connection and time out together,
          // but only one of them may replace it
          const exits = yield* Effect.all([
            storage.refresh(runnerAddress1, shards).pipe(Effect.exit),
            storage.refresh(runnerAddress1, shards).pipe(Effect.exit)
          ], { concurrency: "unbounded" })
          assert(exits.every(Exit.isFailure))
          yield* waitUntil(() => partitioned.reservedConnections > reserved)
          expect(
            yield* storage.refresh(runnerAddress1, shards).pipe(
              Effect.retry({ times: 20, schedule: Schedule.spaced(20) })
            )
          ).toEqual(shards)
          yield* Effect.sleep(lockOperationInterval / 2)
          expect(partitioned.reservedConnections, partitionDiagnostics(partitioned)).toEqual(reserved + 1)
        })
      ),
    60_000
  )

  it.effect(
    "replaces a connection that fails an operation which waited for it",
    () =>
      withStalledRelease((storage, shards, partitioned) =>
        Effect.gen(function*() {
          restoreConnection(partitioned)
          const waiting = yield* storage.refresh(runnerAddress1, shards).pipe(Effect.exit, Effect.forkChild)
          yield* Effect.sleep(lockOperationInterval / 10)

          // the waiting operation runs on the replacement, which then fails it
          const reserved = partitioned.reservedConnections
          partitioned.failNextQueries = 1
          partitioned.blockRelease = false
          yield* waitUntil(() => partitioned.reservedConnections > reserved)
          assert(Exit.isFailure(yield* Fiber.join(waiting)))

          // the failing replacement is replaced without another operation failing on it
          yield* waitUntil(() => partitioned.reservedConnections > reserved + 1)
          expect(
            yield* storage.refresh(runnerAddress1, shards).pipe(
              Effect.retry({ times: 20, schedule: Schedule.spaced(20) })
            )
          ).toEqual(shards)
        })
      ),
    60_000
  )

  it.effect("isolates advisory shard locks by prefix", () =>
    Effect.gen(function*() {
      const storageA = yield* SqlRunnerStorage.make({ prefix: "cluster" })
      const storageB = yield* SqlRunnerStorage.make({ prefix: "other" })
      const shard = ShardId.make("default", 1)

      expect(yield* storageA.acquire(runnerAddress1, [shard])).toEqual([shard])
      expect(yield* storageB.acquire(runnerAddress2, [shard])).toEqual([shard])
    }).pipe(
      // Release the advisory-lock connections before the PostgreSQL layer.
      Effect.scoped,
      Effect.provide(PgContainer.layerClient),
      Effect.provide(ShardingConfig.layer())
    ), 60_000)

  it.effect("excludes other storages using the same prefix", () =>
    Effect.gen(function*() {
      const storageA = yield* SqlRunnerStorage.make({ prefix: "cluster" })
      const storageB = yield* SqlRunnerStorage.make({ prefix: "cluster" })
      const shard = ShardId.make("default", 1)

      expect(yield* storageA.acquire(runnerAddress1, [shard])).toEqual([shard])
      expect(yield* storageB.acquire(runnerAddress2, [shard])).toEqual([])
    }).pipe(
      // Release the advisory-lock connections before the PostgreSQL layer.
      Effect.scoped,
      Effect.provide(PgContainer.layerClient),
      Effect.provide(ShardingConfig.layer())
    ), 60_000)

  it.effect(
    "pg (no advisory) does not deadlock acquisition with refresh or bulk release",
    () =>
      Effect.gen(function*() {
        const sql = yield* SqlClient.SqlClient
        const storageA = yield* SqlRunnerStorage.make({ prefix: "cluster" })
        const storageB = yield* SqlRunnerStorage.make({ prefix: "cluster" })
        const shards = Array.from({ length: 12 }, (_, i) => ShardId.make("default", i + 1))
        const reversed = [...shards].reverse()
        // Rewrite each lease in reverse so the physical row order differs from
        // the sorted lock order.
        const acquireShuffled = Effect.gen(function*() {
          yield* storageA.acquire(runnerAddress1, shards)
          for (const shard of reversed) {
            yield* storageA.refresh(runnerAddress1, [shard])
          }
        })

        // Slow each row write so the concurrent statements overlap.
        yield* sql`CREATE FUNCTION delay_row() RETURNS trigger LANGUAGE plpgsql AS $$
          BEGIN PERFORM pg_sleep(0.003); RETURN COALESCE(NEW, OLD); END $$`
        yield* sql`CREATE TRIGGER delay_row BEFORE UPDATE OR DELETE ON cluster_locks
          FOR EACH ROW EXECUTE FUNCTION delay_row()`

        for (let i = 0; i < 8; i++) {
          yield* acquireShuffled
          yield* sql`UPDATE cluster_locks SET acquired_at = NOW() - INTERVAL '1 hour'`
          yield* Effect.all([
            storageA.refresh(runnerAddress1, shards),
            storageB.acquire(runnerAddress2, reversed)
          ], { concurrency: 2 })
          yield* storageA.releaseAll(runnerAddress1)
          yield* storageB.releaseAll(runnerAddress2)

          yield* acquireShuffled
          yield* Effect.all([
            storageA.releaseAll(runnerAddress1),
            storageB.acquire(runnerAddress2, reversed)
          ], { concurrency: 2 })
          yield* storageB.releaseAll(runnerAddress2)
        }
      }).pipe(
        Effect.scoped,
        Effect.provide(PgContainer.layerClient),
        Effect.provide(ShardingConfig.layer({ shardLockDisableAdvisory: true })),
        TestClock.withLive
      ),
    60_000
  )
  ;([
    ["pg", Layer.orDie(PgContainer.layerClient)],
    ["mysql", Layer.orDie(MysqlContainer.layerClient)],
    ["vitess", Layer.orDie(MysqlContainer.layerClientVitess)],
    ["sqlite", Layer.orDie(SqliteLayer)]
  ] as const).flatMap(([label, layer]) =>
    [
      [label, StorageLayer.pipe(Layer.provideMerge(layer), Layer.provide(ShardingConfig.layer()))],
      [
        label + " (no advisory)",
        StorageLayer.pipe(
          Layer.provideMerge(layer),
          Layer.provide(ShardingConfig.layer({
            shardLockDisableAdvisory: true
          }))
        )
      ]
    ] as const
  ).forEach(([label, layer]) => {
    // Both tests update the same runner rows.
    it.layer(layer, {
      concurrent: false,
      timeout: 60000
    })(label, (it) => {
      it.effect("getRunners", () =>
        Effect.gen(function*() {
          const storage = yield* RunnerStorage.RunnerStorage

          const runner = Runner.make({
            address: runnerAddress1,
            groups: ["default"],
            weight: 1
          })
          const machineId = yield* storage.register(runner, true)
          yield* storage.register(runner, true)
          expect(machineId).toEqual(1)
          expect(yield* storage.getRunners).toEqual([[runner, true]])

          yield* storage.setRunnerHealth(runnerAddress1, false)
          expect(yield* storage.getRunners).toEqual([[runner, false]])

          yield* storage.unregister(runnerAddress1)
          expect(yield* storage.getRunners).toEqual([])
        }), { timeout: 30_000 })

      it.effect("acquireShards", () =>
        Effect.gen(function*() {
          const storage = yield* RunnerStorage.RunnerStorage

          let acquired = yield* storage.acquire(runnerAddress1, [
            ShardId.make("default", 1),
            ShardId.make("default", 2),
            ShardId.make("default", 3)
          ])
          expect(acquired.map((_) => _.id)).toEqual([1, 2, 3])
          acquired = yield* storage.acquire(runnerAddress1, [
            ShardId.make("default", 1),
            ShardId.make("default", 2),
            ShardId.make("default", 3)
          ])
          expect(acquired.map((_) => _.id)).toEqual([1, 2, 3])
          acquired = yield* storage.acquire(runnerAddress1, [ShardId.make("default", 4)])
          expect(acquired.map((_) => _.id)).toEqual([4])

          const refreshed = yield* storage.refresh(runnerAddress1, [
            ShardId.make("default", 1),
            ShardId.make("default", 2),
            ShardId.make("default", 3)
          ])
          expect(refreshed.map((_) => _.id).sort((a, b) => a - b)).toEqual([1, 2, 3])

          // smoke test release
          yield* storage.release(runnerAddress1, ShardId.make("default", 2))
        }))
    })
  })
})

const runnerAddress1 = RunnerAddress.make("localhost", 1234)
const runnerAddress2 = RunnerAddress.make("localhost", 5678)

interface PartitionState {
  connectionAvailable: Latch.Latch
  blockRelease: boolean
  activeQueries: number
  maxActiveQueries: number
  interruptedQueries: number
  failNextQueries: number
  reservedConnections: number
  usableConnections: number
}

// Registers a runner holding one shard, then wedges the reserved connection
// and blocks its release, so the first rebuild stalls closing the previous
// scope. `body` runs with the stall in place and may lift it through
// `partitioned`; it is lifted afterwards so the layer can be torn down.
const withStalledRelease = (
  body: (
    storage: RunnerStorage.RunnerStorage["Service"],
    shards: ReadonlyArray<ShardId.ShardId>,
    partitioned: PartitionState
  ) => Effect.Effect<void, unknown>
) => {
  const partitioned = makePartitionState()
  const layer = StorageLayer.pipe(
    Layer.provideMerge(blackholeReservedConnection(partitioned, false)),
    Layer.provide(ShardingConfig.layer({
      shardLockDisableAdvisory: true,
      ...partitionConfig
    }))
  )
  return Effect.gen(function*() {
    const storage = yield* RunnerStorage.RunnerStorage
    const runner = Runner.make({
      address: runnerAddress1,
      groups: ["default"],
      weight: 1
    })
    const shards = [ShardId.make("default", 1)]
    yield* storage.register(runner, true)
    yield* storage.acquire(runnerAddress1, shards)
    partitionConnection(partitioned)
    partitioned.blockRelease = true
    yield* storage.refresh(runnerAddress1, shards).pipe(Effect.exit)
    yield* body(storage, shards, partitioned)
  }).pipe(
    Effect.ensuring(Effect.sync(() => {
      restoreConnection(partitioned)
      partitioned.blockRelease = false
    })),
    Effect.provide(layer),
    TestClock.withLive
  )
}

const makePartitionState = (): PartitionState => ({
  connectionAvailable: Latch.makeUnsafe(true),
  blockRelease: false,
  activeQueries: 0,
  maxActiveQueries: 0,
  interruptedQueries: 0,
  failNextQueries: 0,
  reservedConnections: 0,
  usableConnections: 0
})

const partitionConnection = (partitioned: PartitionState) => {
  Latch.closeUnsafe(partitioned.connectionAvailable)
}

const restoreConnection = (partitioned: PartitionState) => {
  Latch.openUnsafe(partitioned.connectionAvailable)
}

const partitionDiagnostics = (partitioned: PartitionState) =>
  [
    `active=${partitioned.activeQueries}`,
    `interrupted=${partitioned.interruptedQueries}`,
    `reserved=${partitioned.reservedConnections}`,
    `usable=${partitioned.usableConnections}`
  ].join(", ")

const waitUntil = Effect.fnUntraced(
  function*(predicate: () => boolean) {
    while (!predicate()) {
      yield* Effect.sleep(20)
    }
  },
  Effect.timeoutOrElse({
    duration: 10_000,
    orElse: () => Effect.die("timed out waiting for condition")
  })
)

const blackholeReservedConnection = (partitioned: PartitionState, resumePending: boolean) =>
  Layer.effect(
    SqlClient.SqlClient,
    Effect.gen(function*() {
      const sql = yield* SqlClient.SqlClient
      const wrapConnection = (connection: SqlConnection.Connection): SqlConnection.Connection => {
        let usable = false
        const execute = <A, E extends SqlError.SqlError, R>(effect: Effect.Effect<A, E, R>) =>
          Effect.suspend((): Effect.Effect<A, E | SqlError.SqlError, R> => {
            if (partitioned.failNextQueries > 0) {
              partitioned.failNextQueries--
              return Effect.fail(
                new SqlError.SqlError({
                  reason: new SqlError.ConnectionError({ cause: new Error("connection lost") })
                })
              )
            }
            partitioned.activeQueries++
            partitioned.maxActiveQueries = Math.max(partitioned.maxActiveQueries, partitioned.activeQueries)
            return (!Latch.isOpen(partitioned.connectionAvailable)
              ? resumePending
                ? Effect.andThen(Latch.await(partitioned.connectionAvailable), effect)
                : Effect.never
              : effect).pipe(
                Effect.onExit((exit) =>
                  Effect.sync(() => {
                    partitioned.activeQueries--
                    if (Exit.hasInterrupts(exit)) {
                      partitioned.interruptedQueries++
                    }
                    if (Exit.isSuccess(exit) && !usable) {
                      usable = true
                      partitioned.usableConnections++
                    }
                  })
                )
              )
          })
        return {
          ...connection,
          execute: (...args) => execute(connection.execute(...args)),
          executeRaw: (...args) => execute(connection.executeRaw(...args)),
          executeValues: (...args) => execute(connection.executeValues(...args)),
          executeValuesUnprepared: (...args) => execute(connection.executeValuesUnprepared(...args)),
          executeUnprepared: (...args) => execute(connection.executeUnprepared(...args))
        }
      }
      let client: SqlClient.SqlClient
      client = new Proxy(sql, {
        get(target, property, receiver) {
          if (property === "reserve") {
            return Effect.andThen(
              // simulates a driver that stalls uninterruptibly while tearing
              // down a reserved connection, so closing its scope cannot be
              // interrupted
              Effect.addFinalizer(() =>
                Effect.uninterruptible(Effect.suspend(function waitForRelease(): Effect.Effect<void> {
                  if (!partitioned.blockRelease) return Effect.void
                  return Effect.andThen(
                    Effect.promise(() => new Promise<void>((resolve) => setTimeout(resolve, 5))),
                    waitForRelease
                  )
                }))
              ),
              Effect.map(target.reserve, (connection) => {
                partitioned.reservedConnections++
                return wrapConnection(connection)
              })
            )
          }
          if (property === "withoutTransforms") {
            return () => client
          }
          return Reflect.get(target, property, receiver)
        }
      })
      return client
    })
  ).pipe(Layer.provide(PgContainer.layerClient))

const SqliteLayer = Effect.gen(function*() {
  const fs = yield* FileSystem.FileSystem
  const dir = yield* fs.makeTempDirectoryScoped()
  return SqliteClient.layer({
    filename: dir + "/test.db"
  })
}).pipe(Layer.unwrap, Layer.provide(NodeFileSystem.layer))
