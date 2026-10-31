import { NodeCrypto, NodeFileSystem } from "@effect/platform-node"
import { PgClient } from "@effect/sql-pg"
import { SqliteClient } from "@effect/sql-sqlite-node"
import { assert, describe, expect, it } from "@effect/vitest"
import {
  Cause,
  Clock,
  Duration,
  Effect,
  Exit,
  Fiber,
  FileSystem,
  Latch,
  Layer,
  Logger,
  Redacted,
  Result,
  Schedule
} from "effect"
import {
  ClusterError,
  MessageStorage,
  Runner,
  RunnerAddress,
  RunnerStorage,
  ShardId,
  ShardingConfig,
  Snowflake,
  SqlMessageStorage,
  SqlRunnerStorage
} from "effect/cluster"
import { Migrator, SqlClient, type SqlConnection, SqlError } from "effect/sql"
import { TestClock } from "effect/testing"
import { MysqlContainer } from "../fixtures/mysql2-utils.ts"
import { PgContainer } from "../fixtures/pg-utils.ts"

const appRole = "cluster_app"

const AppClient = Layer.unwrap(
  Effect.gen(function*() {
    const container = yield* PgContainer
    return PgClient.layer({
      host: container.getHost(),
      port: container.getPort(),
      database: container.getDatabase(),
      username: appRole,
      password: Redacted.make(appRole)
    })
  })
)

const asApp = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  Effect.provide(effect, [AppClient, ShardingConfig.layerDefaults, NodeCrypto.layerDigest, Snowflake.layerGenerator])

const assertMigrationDefect = (exit: Exit.Exit<unknown, unknown>) => {
  assert(Exit.isFailure(exit))
  assert.isFalse(Cause.hasFails(exit.cause))
  assert.isFalse(Cause.hasInterrupts(exit.cause))
  const error = Cause.findDefect(exit.cause)
  assert(Result.isSuccess(error))
  assert(error.success instanceof Migrator.MigrationError)
  assert.strictEqual(error.success.kind, "Failed")
  assertAuthorizationError(error.success.cause)
}

const assertAuthorizationError = (error: unknown) => {
  assert(SqlError.isSqlError(error), `expected a SqlError, got ${error}`)
  assert.strictEqual(error.reason._tag, "AuthorizationError")
}

const TestLayer = Layer.effectDiscard(Effect.gen(function*() {
  const sql = yield* SqlClient.SqlClient
  yield* sql.unsafe(`CREATE ROLE ${appRole} LOGIN PASSWORD '${appRole}'`)
  yield* sql.unsafe(`REVOKE CREATE ON SCHEMA public FROM PUBLIC`)
  yield* sql.unsafe(`GRANT USAGE ON SCHEMA public TO ${appRole}`)
})).pipe(Layer.provideMerge(PgContainer.layerClient), Layer.provideMerge(PgContainer.layer))

describe("cluster SQL storage with a DML-only role", () => {
  // The tests grant on and provision tables in the same schema.
  it.layer(TestLayer, { concurrent: false, timeout: 120_000 })("pg", (it) => {
    it.effect("starts from tables migrated by an owner connection", () =>
      Effect.gen(function*() {
        yield* Effect.scoped(Layer.build(Layer.mergeAll(
          SqlMessageStorage.layerMigrations({}),
          SqlRunnerStorage.layerMigrations({})
        )))
        const sql = yield* SqlClient.SqlClient
        yield* sql.unsafe(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${appRole}`)
        yield* sql.unsafe(`GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ${appRole}`)

        yield* asApp(
          Effect.gen(function*() {
            const runners = yield* RunnerStorage.RunnerStorage
            const runner = Runner.make({
              address: RunnerAddress.make("localhost", 1234),
              groups: ["default"],
              weight: 1
            })
            yield* runners.register(runner, true)
            expect(yield* runners.getRunners).toEqual([[runner, true]])

            const messages = yield* MessageStorage.MessageStorage
            expect(yield* messages.unprocessedMessages([ShardId.make("default", 1)])).toEqual([])
          }).pipe(
            Effect.provide(Layer.mergeAll(SqlMessageStorage.layerStorage({}), SqlRunnerStorage.layerStorage({})))
          )
        )
      }))

    it.effect("surfaces errors inside a migration as defects", () =>
      Effect.gen(function*() {
        // Empty history tables the role can use, so the migrator gets past its
        // own table and fails inside the first migration.
        for (const table of ["inside_migrations", "inside_runner_migrations"]) {
          yield* Migrator.make({})({ loader: Migrator.fromRecord({}), table })
          const sql = yield* SqlClient.SqlClient
          yield* sql.unsafe(`GRANT SELECT, INSERT, UPDATE, DELETE ON ${table} TO ${appRole}`)
        }

        assertMigrationDefect(
          yield* asApp(Effect.scoped(Layer.build(SqlMessageStorage.layerMigrations({ prefix: "inside" })))).pipe(
            Effect.exit
          )
        )
        assertMigrationDefect(
          yield* asApp(Effect.scoped(Layer.build(SqlRunnerStorage.layerWith({ prefix: "inside" })))).pipe(Effect.exit)
        )
      }).pipe(Effect.timeout("20 seconds"), TestClock.withLive), 30_000)
  })
})

const StorageLayer = SqlRunnerStorage.layer

// Allow for CI latency in healthy PostgreSQL queries.
const lockOperationInterval = 1000
const partitionConfig = {
  // Keep expiration / 3 above the operation deadline.
  shardLockExpiration: lockOperationInterval * 10,
  shardLockRefreshInterval: lockOperationInterval
}

describe("SqlRunnerStorage", () => {
  // These tests each get an empty database on one shared container, so
  // container startup counts against the hook timeout, not each test's.
  it.layer(PgContainer.layer, { timeout: 120_000 })((it) => {
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
          // the replacement session lost the previous session's lock, so recovery reacquires it
          expect(
            yield* storage.acquire(runnerAddress1, shards).pipe(
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
        // the replacement session lost the previous session's lock, so recovery reacquires it
        expect(
          yield* storage.acquire(runnerAddress1, shards).pipe(
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

        // the replacement session lost the previous session's lock, so recovery reacquires it
        expect(
          yield* storage.acquire(runnerAddress1, shards).pipe(
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
            // count before retrying: a retry that misses its deadline under load
            // rightly replaces the connection again
            yield* Effect.sleep(lockOperationInterval / 2)
            expect(partitioned.reservedConnections, partitionDiagnostics(partitioned)).toEqual(reserved + 1)
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
        Effect.provide(PgContainer.layerClientDatabase),
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
        Effect.provide(PgContainer.layerClientDatabase),
        Effect.provide(ShardingConfig.layer())
      ), 60_000)

    it.effect("releases a frozen runner's advisory shard locks after shardLockExpiration", () => {
      const shardLockExpiration = lockOperationInterval * 3
      return Effect.gen(function*() {
        const storageA = yield* SqlRunnerStorage.make({ prefix: "cluster" })
        const storageB = yield* SqlRunnerStorage.make({ prefix: "cluster" })
        const shard = ShardId.make("default", 1)

        expect(yield* storageA.acquire(runnerAddress1, [shard])).toEqual([shard])
        // storageA freezes: it stops refreshing, but its lock session stays open
        const frozenAt = yield* Clock.currentTimeMillis
        expect(yield* storageB.acquire(runnerAddress2, [shard])).toEqual([])

        yield* storageB.acquire(runnerAddress2, [shard]).pipe(
          Effect.repeat({
            until: (acquired) => acquired.length > 0,
            schedule: Schedule.spaced(100)
          }),
          Effect.timeoutOrElse({
            duration: shardLockExpiration * 3,
            orElse: () => Effect.die("the frozen runner still holds its advisory shard lock")
          })
        )
        const elapsed = (yield* Clock.currentTimeMillis) - frozenAt
        assert.isAtLeast(elapsed, shardLockExpiration * 0.9)
        assert.isBelow(elapsed, shardLockExpiration * 2)
      }).pipe(
        // Release the advisory-lock connections before the PostgreSQL layer.
        Effect.scoped,
        Effect.provide(PgContainer.layerClientDatabase),
        Effect.provide(ShardingConfig.layer({ shardLockExpiration })),
        TestClock.withLive
      )
    }, 60_000)

    it.effect("acquires cleanly after the server ends the lock session of a runner without shards", () => {
      const logs: Array<string> = []
      const logger = Logger.make((options) => {
        if (options.logLevel !== "Debug" && options.logLevel !== "Trace") {
          logs.push(Logger.formatJson.log(options))
        }
      })
      return Effect.gen(function*() {
        const sql = yield* SqlClient.SqlClient
        const storage = yield* SqlRunnerStorage.make({ prefix: "cluster" })
        const runner = Runner.make({
          address: runnerAddress1,
          groups: ["default"],
          weight: 1
        })
        const shard = ShardId.make("default", 1)

        yield* storage.register(runner, true)
        // Stands in for idle_session_timeout ending the idle lock session.
        // Every other session on this database is the lock session.
        const terminated = yield* sql`SELECT pg_terminate_backend(pid, 5000) FROM pg_stat_activity
          WHERE datname = current_database() AND pid <> pg_backend_pid()`.values
        expect(terminated).toEqual([[true]])

        expect(yield* storage.acquire(runnerAddress1, [shard])).toEqual([shard])
        expect(yield* storage.refresh(runnerAddress1, [shard])).toEqual([shard])
        yield* storage.release(runnerAddress1, shard)
        expect(logs).toEqual([])
      }).pipe(
        // Release the advisory-lock connections before the PostgreSQL layer.
        Effect.scoped,
        Effect.provide(PgContainer.layerClientDatabase),
        Effect.provide(ShardingConfig.layer()),
        Effect.provide(Logger.layer([logger])),
        TestClock.withLive
      )
    }, 60_000)

    it.effect(
      "restores idle_session_timeout before returning the lock connection to the pool",
      () =>
        Effect.gen(function*() {
          const sql = yield* SqlClient.SqlClient

          const lockPid = yield* Effect.gen(function*() {
            const storage = yield* SqlRunnerStorage.make({ prefix: "cluster" })
            const shard = ShardId.make("default", 1)
            expect(yield* storage.acquire(runnerAddress1, [shard])).toEqual([shard])
            const holders = yield* sql`SELECT DISTINCT pid FROM pg_locks
            WHERE locktype = 'advisory' AND granted
            AND database = (SELECT oid FROM pg_database WHERE datname = current_database())`.values
            expect(holders).toHaveLength(1)
            return Number(holders[0][0])
          }).pipe(Effect.scoped)

          // Hold pooled connections until the pool hands out the former lock connection.
          const [timeout, resetTimeout] = yield* Effect.gen(function*() {
            for (let i = 0; i < 10; i++) {
              const conn = yield* sql.reserve
              const [[pid, setting, resetVal]] = yield* conn.executeValues(
                "SELECT pg_backend_pid(), setting, reset_val FROM pg_settings WHERE name = 'idle_session_timeout'",
                []
              )
              if (Number(pid) === lockPid) return [setting, resetVal]
            }
            return yield* Effect.die("the pool did not hand out the former lock connection")
          }).pipe(Effect.scoped)
          expect(timeout).toEqual(resetTimeout)
        }).pipe(
          Effect.provide(PgContainer.layerClientDatabase),
          Effect.provide(ShardingConfig.layer())
        ),
      60_000
    )

    it.effect("reports a shard lost when a failed acquisition replaces the lock session holding it", () => {
      const partitioned = makePartitionState()
      return Effect.gen(function*() {
        const storageA = yield* SqlRunnerStorage.make({ prefix: "cluster" }).pipe(
          Effect.provide(wrapReservedConnections(partitioned, true))
        )
        const storageB = yield* SqlRunnerStorage.make({ prefix: "cluster" })
        const held = ShardId.make("default", 1)
        const other = ShardId.make("default", 2)

        expect(yield* storageA.acquire(runnerAddress1, [held])).toEqual([held])
        // the connection is lost while acquiring another shard, taking the
        // session's lock on the held shard with it
        partitioned.failNextQueries = 1
        yield* storageA.acquire(runnerAddress1, [other]).pipe(Effect.exit)

        yield* acquireHandoff(storageB, held, lockOperationInterval * 10)
        expect(yield* refreshLikeSharding(storageA, held)).toEqual([])
      }).pipe(
        // Release the advisory-lock connections before the PostgreSQL layer.
        Effect.scoped,
        Effect.provide(PgContainer.layerClientDatabase),
        Effect.provide(ShardingConfig.layer(partitionConfig)),
        TestClock.withLive
      )
    }, 60_000)

    for (const acquireFirst of [true, false]) {
      it.effect(
        `a resumed frozen runner reports a shard lost after it was handed off (${
          acquireFirst ? "acquire" : "refresh"
        } first)`,
        () => {
          const shardLockExpiration = lockOperationInterval * 3
          return Effect.gen(function*() {
            const storageA = yield* SqlRunnerStorage.make({ prefix: "cluster" })
            const storageB = yield* SqlRunnerStorage.make({ prefix: "cluster" })
            const held = ShardId.make("default", 1)
            const other = ShardId.make("default", 2)

            expect(yield* storageA.acquire(runnerAddress1, [held])).toEqual([held])
            // storageA freezes until the shard has passed through storageB
            yield* acquireHandoff(storageB, held, shardLockExpiration * 3)

            if (acquireFirst) {
              yield* storageA.acquire(runnerAddress1, [other]).pipe(Effect.exit)
            }
            expect(yield* refreshLikeSharding(storageA, held)).toEqual([])
          }).pipe(
            // Release the advisory-lock connections before the PostgreSQL layer.
            Effect.scoped,
            Effect.provide(PgContainer.layerClientDatabase),
            Effect.provide(ShardingConfig.layer({ shardLockExpiration })),
            TestClock.withLive
          )
        },
        60_000
      )
    }

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
          Effect.provide(PgContainer.layerClientDatabase),
          Effect.provide(ShardingConfig.layer({ shardLockDisableAdvisory: true })),
          TestClock.withLive
        ),
      60_000
    )
  })
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

      it.effect("releases a shard reacquired after releasing all shards", () =>
        Effect.gen(function*() {
          const storage = yield* SqlRunnerStorage.make({})
          const shards = [ShardId.make("default", 12)]

          yield* storage.releaseAll(runnerAddress1)
          expect(yield* storage.acquire(runnerAddress1, shards)).toEqual(shards)
          // Refreshing must not take the lock a second time.
          expect(yield* storage.refresh(runnerAddress1, shards)).toEqual(shards)
          yield* storage.release(runnerAddress1, shards[0])

          const other = yield* SqlRunnerStorage.make({})
          expect(yield* other.acquire(runnerAddress2, shards)).toEqual(shards)
        }).pipe(
          Effect.scoped,
          Effect.provide(ShardingConfig.layer({ shardLockDisableAdvisory: label.endsWith("(no advisory)") }))
        ))

      it.effect("refresh reports a shard lost after it was handed off", () =>
        Effect.gen(function*() {
          const storage = yield* SqlRunnerStorage.make({})
          const other = yield* SqlRunnerStorage.make({})
          const shards = [ShardId.make("default", 11)]

          expect(yield* storage.acquire(runnerAddress1, shards)).toEqual(shards)
          yield* storage.release(runnerAddress1, shards[0])
          expect(yield* other.acquire(runnerAddress2, shards)).toEqual(shards)
          yield* other.release(runnerAddress2, shards[0])

          // Refreshing must not take back a lock that is no longer held.
          expect(yield* storage.refresh(runnerAddress1, shards)).toEqual([])
          expect(yield* storage.acquire(runnerAddress1, shards)).toEqual(shards)
        }).pipe(
          Effect.scoped,
          Effect.provide(ShardingConfig.layer({ shardLockDisableAdvisory: label.endsWith("(no advisory)") }))
        ))

      if (label === "pg") {
        it.effect("runner migrations adopt existing tables without migration records", () =>
          Effect.gen(function*() {
            const sql = yield* SqlClient.SqlClient

            // Advisory-lock deployments had no locks table or migration history.
            yield* sql`CREATE TABLE legacy_runners (
              machine_id SERIAL PRIMARY KEY,
              address VARCHAR(255) NOT NULL,
              runner TEXT NOT NULL,
              healthy BOOLEAN NOT NULL DEFAULT TRUE,
              last_heartbeat TIMESTAMP NOT NULL DEFAULT NOW(),
              UNIQUE(address)
            )`
            yield* sql`INSERT INTO legacy_runners (address, runner) VALUES ('legacy:1', 'legacy')`
            const rows = yield* sql`SELECT machine_id, address, runner, healthy FROM legacy_runners`

            yield* Effect.scoped(Layer.build(SqlRunnerStorage.layerMigrations({ prefix: "legacy" })))

            expect(yield* sql`SELECT machine_id, address, runner, healthy FROM legacy_runners`).toEqual(rows)
            expect(yield* sql`SELECT * FROM legacy_locks`).toEqual([])
          }))
      }

      if (label === "mysql" || label === "vitess") {
        // MySQL session timeouts are whole seconds.
        const shardLockExpiration = lockOperationInterval * 3

        // vtgate ignores SET SESSION wait_timeout and keeps its own lock
        // connection alive, so behind Vitess a frozen runner keeps its locks.
        if (label === "mysql") {
          it.effect(
            "releases a frozen runner's named shard locks after shardLockExpiration",
            () =>
              Effect.gen(function*() {
                const storageA = yield* SqlRunnerStorage.make({ prefix: "frozen" })
                const storageB = yield* SqlRunnerStorage.make({ prefix: "frozen" })
                const shard = ShardId.make("default", 1)

                expect(yield* storageA.acquire(runnerAddress1, [shard])).toEqual([shard])
                // storageA freezes: it stops refreshing, but its lock connection stays open
                const frozenAt = yield* Clock.currentTimeMillis
                expect(yield* storageB.acquire(runnerAddress2, [shard])).toEqual([])

                yield* storageB.acquire(runnerAddress2, [shard]).pipe(
                  Effect.repeat({
                    until: (acquired) => acquired.length > 0,
                    schedule: Schedule.spaced(100)
                  }),
                  Effect.timeoutOrElse({
                    duration: shardLockExpiration * 3,
                    orElse: () => Effect.die("the frozen runner still holds its named shard lock")
                  })
                )
                const elapsed = (yield* Clock.currentTimeMillis) - frozenAt
                assert.isAtLeast(elapsed, shardLockExpiration * 0.9)
                assert.isBelow(elapsed, shardLockExpiration * 2)
              }).pipe(
                Effect.scoped,
                Effect.provide(ShardingConfig.layer({ shardLockExpiration })),
                TestClock.withLive
              ),
            60_000
          )

          it.effect(
            "restores wait_timeout before returning the lock connection to the pool",
            () =>
              Effect.gen(function*() {
                const sql = yield* SqlClient.SqlClient
                const [[defaultTimeout]] = yield* sql`SELECT @@GLOBAL.wait_timeout`.values

                const lockConnectionId = yield* Effect.gen(function*() {
                  const storage = yield* SqlRunnerStorage.make({ prefix: "pooled" })
                  const shard = ShardId.make("default", 1)
                  expect(yield* storage.acquire(runnerAddress1, [shard])).toEqual([shard])
                  const [[id]] = yield* sql`SELECT IS_USED_LOCK(${`pooled.${shard.toString()}`})`.values
                  return Number(id)
                }).pipe(Effect.scoped)

                // The pool hands out the connection released last first.
                const [[id, timeout]] = yield* sql.reserve.pipe(
                  Effect.flatMap((conn) => conn.executeValues("SELECT CONNECTION_ID(), @@SESSION.wait_timeout", [])),
                  Effect.scoped
                )
                expect(Number(id)).toEqual(lockConnectionId)
                expect(Number(timeout)).toEqual(Number(defaultTimeout))
              }).pipe(
                Effect.provide(ShardingConfig.layer({ shardLockExpiration })),
                TestClock.withLive
              ),
            60_000
          )
        }

        it.effect("acquires cleanly after a runner without shards leaves its lock connection idle", () => {
          const logs: Array<string> = []
          const logger = Logger.make((options) => {
            if (options.logLevel !== "Debug" && options.logLevel !== "Trace") {
              logs.push(Logger.formatJson.log(options))
            }
          })
          return Effect.gen(function*() {
            const storage = yield* SqlRunnerStorage.make({ prefix: "idle" })
            const runner = Runner.make({
              address: runnerAddress1,
              groups: ["default"],
              weight: 1
            })
            const shard = ShardId.make("default", 1)

            yield* storage.register(runner, true)
            // Without shards, only the liveness probe runs, and it uses the shared
            // pool, so the lock connection stays idle past shardLockExpiration.
            const idleUntil = (yield* Clock.currentTimeMillis) + shardLockExpiration * 1.5
            while ((yield* Clock.currentTimeMillis) < idleUntil) {
              expect(yield* storage.refresh(runnerAddress1, [])).toEqual([])
              yield* Effect.sleep(lockOperationInterval)
            }

            expect(yield* storage.acquire(runnerAddress1, [shard])).toEqual([shard])
            expect(yield* storage.refresh(runnerAddress1, [shard])).toEqual([shard])
            yield* storage.release(runnerAddress1, shard)
            expect(logs).toEqual([])
          }).pipe(
            Effect.scoped,
            Effect.provide(ShardingConfig.layer({ shardLockExpiration })),
            Effect.provide(Logger.layer([logger])),
            TestClock.withLive
          )
        }, 60_000)
      }
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

// Another runner takes the shard once it becomes free and hands it off again,
// so it is free when the previous owner next checks it.
const acquireHandoff = Effect.fnUntraced(function*(
  storage: RunnerStorage.RunnerStorage["Service"],
  shard: ShardId.ShardId,
  timeout: number
) {
  yield* storage.acquire(runnerAddress2, [shard]).pipe(
    Effect.repeat({
      until: (acquired) => acquired.length > 0,
      schedule: Schedule.spaced(100)
    }),
    Effect.timeoutOrElse({
      duration: timeout,
      orElse: () => Effect.die("the previous owner still holds the shard lock")
    })
  )
  yield* storage.release(runnerAddress2, shard)
})

// Sharding retries a failed refresh before acting on its result.
const refreshLikeSharding = (storage: RunnerStorage.RunnerStorage["Service"], shard: ShardId.ShardId) =>
  storage.refresh(runnerAddress1, [shard]).pipe(
    Effect.retry({ times: 5, schedule: Schedule.spaced(50) })
  )

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
  wrapReservedConnections(partitioned, resumePending).pipe(Layer.provide(PgContainer.layerClientDatabase))

// Wraps the reserved connections of the SqlClient in context.
const wrapReservedConnections = (partitioned: PartitionState, resumePending: boolean) =>
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
  )

const SqliteLayer = Effect.gen(function*() {
  const fs = yield* FileSystem.FileSystem
  const dir = yield* fs.makeTempDirectoryScoped()
  return SqliteClient.layer({
    filename: dir + "/test.db"
  })
}).pipe(Layer.unwrap, Layer.provide(NodeFileSystem.layer))
