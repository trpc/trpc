/**
 * Stores cluster runner registration and shard ownership in SQL.
 *
 * The SQL-backed `RunnerStorage` records runners, health flags, machine ids,
 * and shard locks so multiple processes can coordinate which runner owns each
 * shard. This module creates the required runner and lock tables, supports an
 * optional table prefix, uses advisory locks for PostgreSQL and MySQL when
 * enabled, and provides constructors and layers for the storage service.
 *
 * @stability unstable
 * @since 4.0.0
 */
import * as Arr from "../Array.ts"
import * as Cause from "../Cause.ts"
import * as Duration from "../Duration.ts"
import * as Effect from "../Effect.ts"
import * as Fiber from "../Fiber.ts"
import * as Layer from "../Layer.ts"
import * as Scope from "../Scope.ts"
import * as SqlClient from "../sql/SqlClient.ts"
import type { Connection } from "../sql/SqlConnection.ts"
import type { SqlError } from "../sql/SqlError.ts"
import type * as Statement from "../sql/Statement.ts"
import { PersistenceError } from "./ClusterError.ts"
import { ResourceRef } from "./internal/resourceRef.ts"
import { effectiveInterval } from "./internal/shardLock.ts"
import * as RunnerStorage from "./RunnerStorage.ts"
import * as ShardId from "./ShardId.ts"
import * as ShardingConfig from "./ShardingConfig.ts"

const withTracerDisabled = Effect.withTracerEnabled(false)

// This exact FNV-1a hash, including its tag and UTF-8 encoding, is a persistent
// advisory-lock wire format and must never change.
const postgresLockNamespace = (prefix: string): number => {
  const bytes = new TextEncoder().encode(`effect-cluster:${prefix}`)
  let hash = 0x811c9dc5
  for (let i = 0; i < bytes.length; i++) {
    hash = Math.imul(hash ^ bytes[i], 0x01000193)
  }
  return hash | 0
}

/**
 * Creates a SQL-backed `RunnerStorage` implementation for registered runners and
 * shard locks, using the configured table prefix and advisory locks where
 * supported and enabled.
 *
 * **When to use**
 *
 * Use to create a SQL-backed `RunnerStorage` value directly when building
 * custom service or layer composition around the storage implementation.
 *
 * **Details**
 *
 * When `prefix` is omitted, `make` uses the `cluster` prefix, creating
 * `cluster_runners` and `cluster_locks`. PostgreSQL and MySQL use advisory
 * locks unless `ShardingConfig.shardLockDisableAdvisory` is enabled; other
 * dialects use rows in the locks table.
 *
 * **Gotchas**
 *
 * Changing `prefix` changes both generated table names, so runners using
 * different prefixes do not share registrations or shard locks.
 *
 * @see {@link layer} for the default SQL-backed storage layer
 * @see {@link layerWith} for a SQL-backed storage layer with a custom table prefix
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const make = Effect.fnUntraced(function*(options: {
  readonly prefix?: string | undefined
}) {
  const config = yield* ShardingConfig.ShardingConfig
  const shardGroups = ShardingConfig.shardGroupConfig(config)
  const availableShardGroups = Array.from(shardGroups.available)
  const disableAdvisoryLocks = config.shardLockDisableAdvisory
  const lockOperationInterval = effectiveInterval(config)
  const sql = (yield* SqlClient.SqlClient).withoutTransforms()
  const layerScope = yield* Effect.scope
  const prefix = options?.prefix ?? "cluster"
  const table = (name: string) => `${prefix}_${name}`
  const pgLockNamespace = postgresLockNamespace(prefix)
  // PostgreSQL exposes the signed int4 lock key through pg_locks as an unsigned oid.
  const pgLockNamespaceOid = pgLockNamespace >>> 0

  // Keep all PostgreSQL and MySQL shard-lock operations on a rebuildable
  // reserved connection, including when advisory locks are disabled.
  const acquireLockConn = sql.onDialectOrElse({
    pg: () =>
      Effect.fnUntraced(function*(scope: Scope.Scope) {
        const conn = yield* Effect.orDie(sql.reserve).pipe(
          Scope.provide(scope)
        )
        const pid = disableAdvisoryLocks
          ? 0
          : (yield* conn.executeValues("SELECT pg_backend_pid()", []))[0][0] as number
        if (!disableAdvisoryLocks) {
          yield* Scope.addFinalizerExit(scope, () =>
            conn.executeRaw("SELECT pg_advisory_unlock_all()", []).pipe(
              Effect.timeout(lockOperationInterval),
              Effect.interruptible,
              Effect.ignoreCause
            ))
        }
        return [conn, pid] as const
      }, Effect.orDie),
    mysql: () =>
      Effect.fnUntraced(function*(scope: Scope.Scope) {
        const conn = yield* Effect.orDie(sql.reserve).pipe(
          Scope.provide(scope)
        )
        if (disableAdvisoryLocks) return [conn, 0] as const
        // we need to get the connection id using IS_USED_LOCK to properly
        // support vitess
        let pid: number | undefined = undefined
        while (pid === undefined) {
          const address = `cluster:pid:${(Math.random() * Number.MAX_SAFE_INTEGER) | 0}`
          const taken = (yield* conn.executeValues(
            `SELECT GET_LOCK('${address}', 10), IS_USED_LOCK('${address}')`,
            []
          ))[0] as [1 | null, number]
          if (taken[0] === null) continue
          pid = taken[1]
        }
        if (!disableAdvisoryLocks) {
          yield* Scope.addFinalizerExit(scope, () =>
            conn.executeRaw("SELECT RELEASE_ALL_LOCKS()", []).pipe(
              Effect.timeout(lockOperationInterval),
              Effect.interruptible,
              Effect.ignoreCause
            ))
        }
        return [conn, pid] as const
      }, Effect.orDie),
    orElse: () => undefined
  })
  const lockConn = acquireLockConn && (yield* ResourceRef.from(layerScope, acquireLockConn))

  // `Effect.timeout` waits for the timed-out effect to finish interrupting, so
  // an operation stuck in an uninterruptible region (such as a scope finalizer
  // releasing an unresponsive connection) can outlive its deadline. Fork the
  // operation and timeout the join instead, leaving stalled cleanup to finish
  // detached in the layer scope.
  const withDeadline = Effect.fnUntraced(function*<A, E, R>(operation: Effect.Effect<A, E, R>) {
    const fiber = yield* Effect.forkIn(operation, layerScope, { startImmediately: true })
    return yield* Fiber.join(fiber).pipe(
      Effect.timeout(lockOperationInterval),
      Effect.ensuring(Effect.suspend(() =>
        fiber.pollUnsafe() !== undefined ? Effect.void : Fiber.interrupt(fiber).pipe(
          Effect.forkIn(layerScope, { startImmediately: true }),
          Effect.asVoid
        )
      ))
    )
  })

  const rebuildLockConn = (from?: readonly [Connection, number]) => {
    const rebuild = lockConn?.rebuildUnsafe({ from })
    if (!rebuild) return Effect.void
    // Bound release so a stalled connection cannot block subsequent rebuilds.
    return withDeadline(rebuild).pipe(
      Effect.exit,
      Effect.forkIn(layerScope, { startImmediately: true }),
      Effect.asVoid
    )
  }
  // SQL failures replace the held connection; deadlines are handled by withLockOperationDeadline.
  const useLockConn = <A, E, R>(
    f: (conn: Connection, pid: number) => Effect.Effect<A, E, R>
  ): Effect.Effect<A, E, R> =>
    Effect.flatMap(
      lockConn!.await,
      (held) =>
        Effect.onError(
          f(held[0], held[1]),
          (cause) => Cause.hasInterruptsOnly(cause) ? Effect.void : rebuildLockConn(held)
        )
    )

  const runnersTable = table("runners")
  const runnersTableSql = sql(runnersTable)

  yield* sql.onDialectOrElse({
    mssql: () =>
      sql`
        IF OBJECT_ID(N'${runnersTableSql}', N'U') IS NULL
        CREATE TABLE ${runnersTableSql} (
          machine_id INT IDENTITY PRIMARY KEY,
          address VARCHAR(255) NOT NULL,
          runner TEXT NOT NULL,
          healthy BIT NOT NULL DEFAULT 1,
          last_heartbeat DATETIME NOT NULL DEFAULT GETDATE(),
          UNIQUE(address)
        )
      `,
    mysql: () =>
      sql`
        CREATE TABLE IF NOT EXISTS ${runnersTableSql} (
          machine_id INT AUTO_INCREMENT PRIMARY KEY,
          address VARCHAR(255) NOT NULL,
          runner TEXT NOT NULL,
          healthy BOOLEAN NOT NULL DEFAULT TRUE,
          last_heartbeat DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(address)
        )
      `,
    pg: () =>
      sql`
        CREATE TABLE IF NOT EXISTS ${runnersTableSql} (
          machine_id SERIAL PRIMARY KEY,
          address VARCHAR(255) NOT NULL,
          runner TEXT NOT NULL,
          healthy BOOLEAN NOT NULL DEFAULT TRUE,
          last_heartbeat TIMESTAMP NOT NULL DEFAULT NOW(),
          UNIQUE(address)
        )
      `,
    orElse: () =>
      // sqlite
      sql`
        CREATE TABLE IF NOT EXISTS ${runnersTableSql} (
          machine_id INTEGER PRIMARY KEY AUTOINCREMENT,
          address TEXT NOT NULL,
          runner TEXT NOT NULL,
          healthy INTEGER NOT NULL DEFAULT 1,
          last_heartbeat DATETIME NOT NULL DEFAULT (CURRENT_TIMESTAMP),
          UNIQUE(address)
        )
      `
  })

  const locksTable = table("locks")
  const locksTableSql = sql(locksTable)

  yield* sql.onDialectOrElse({
    mssql: () =>
      sql`
        IF OBJECT_ID(N'${locksTableSql}', N'U') IS NULL
        CREATE TABLE ${locksTableSql} (
          shard_id VARCHAR(50) PRIMARY KEY,
          address VARCHAR(255) NOT NULL,
          acquired_at DATETIME NOT NULL
        )
      `,
    mysql: () =>
      disableAdvisoryLocks ?
        sql`
          CREATE TABLE IF NOT EXISTS ${locksTableSql} (
            shard_id VARCHAR(50) PRIMARY KEY,
            address VARCHAR(255) NOT NULL,
            acquired_at DATETIME NOT NULL
          )
        ` :
        Effect.void,
    pg: () =>
      disableAdvisoryLocks ?
        sql`
          CREATE TABLE IF NOT EXISTS ${locksTableSql} (
            shard_id VARCHAR(50) PRIMARY KEY,
            address VARCHAR(255) NOT NULL,
            acquired_at TIMESTAMP NOT NULL
          )
        ` :
        Effect.void,
    orElse: () =>
      // sqlite
      sql`
        CREATE TABLE IF NOT EXISTS ${locksTableSql} (
          shard_id TEXT PRIMARY KEY,
          address TEXT NOT NULL,
          acquired_at DATETIME NOT NULL
        )
      `
  })

  const sqlNowString = sql.onDialectOrElse({
    pg: () => "NOW()",
    mysql: () => "NOW()",
    mssql: () => "GETDATE()",
    orElse: () => "CURRENT_TIMESTAMP"
  })
  const sqlNow = sql.literal(sqlNowString)

  // Use the same shard ID order for all multi-row PostgreSQL lease locks to
  // avoid deadlocks between acquisition, refresh and bulk release.
  const pgLockOrder = sql.literal(`ORDER BY shard_id COLLATE "C"`)

  const expiresSeconds = sql.literal(
    Math.ceil(Duration.toSeconds(
      Duration.fromInputUnsafe(config.shardLockExpiration)
    )).toString()
  )
  const lockExpiresAt = sql.onDialectOrElse({
    pg: () => sql`${sqlNow} - INTERVAL '${expiresSeconds} seconds'`,
    mysql: () => sql`DATE_SUB(${sqlNow}, INTERVAL ${expiresSeconds} SECOND)`,
    mssql: () => sql`DATEADD(SECOND, -${expiresSeconds}, ${sqlNow})`,
    orElse: () => sql`datetime(${sqlNow}, '-${expiresSeconds} seconds')`
  })

  const encodeBoolean = sql.onDialectOrElse({
    mssql: () => (b: boolean) => (b ? 1 : 0),
    sqlite: () => (b: boolean) => (b ? 1 : 0),
    orElse: () => (b: boolean) => b
  })

  // Upsert runner and return machine_id
  const insertRunner = sql.onDialectOrElse({
    mssql: () => (address: string, runner: string, healthy: boolean) =>
      sql`
        MERGE ${runnersTableSql} AS target
        USING (SELECT ${address} AS address, ${runner} AS runner, ${sqlNow} AS last_heartbeat, ${
        encodeBoolean(healthy)
      } AS healthy) AS source
        ON target.address = source.address
        WHEN MATCHED THEN
          UPDATE SET runner = source.runner, last_heartbeat = source.last_heartbeat, healthy = source.healthy
        WHEN NOT MATCHED THEN
          INSERT (address, runner, last_heartbeat, healthy)
          VALUES (source.address, source.runner, source.last_heartbeat, source.healthy)
        OUTPUT INSERTED.machine_id;
      `.values,
    mysql: () => (address: string, runner: string, healthy: boolean) =>
      sql<{ machine_id: number }>`
        INSERT INTO ${runnersTableSql} (address, runner, last_heartbeat, healthy)
        VALUES (${address}, ${runner}, ${sqlNow}, ${healthy})
        ON DUPLICATE KEY UPDATE
          runner = VALUES(runner),
          last_heartbeat = VALUES(last_heartbeat),
          healthy = VALUES(healthy);
        SELECT machine_id FROM ${runnersTableSql} WHERE address = ${address};
      `.unprepared.pipe(
        Effect.map((results: any) => [[results[1][0].machine_id]])
      ),
    pg: () => (address: string, runner: string, healthy: boolean) =>
      sql`
        INSERT INTO ${runnersTableSql} (address, runner, last_heartbeat, healthy)
        VALUES (${address}, ${runner}, ${sqlNow}, ${healthy})
        ON CONFLICT (address) DO UPDATE
        SET runner = EXCLUDED.runner,
            last_heartbeat = EXCLUDED.last_heartbeat,
            healthy = EXCLUDED.healthy
        RETURNING machine_id
      `.values,
    orElse: () => (address: string, runner: string, healthy: boolean) =>
      // sqlite
      sql`
        INSERT INTO ${runnersTableSql} (address, runner, last_heartbeat, healthy)
        VALUES (${address}, ${runner}, ${sqlNow}, ${encodeBoolean(healthy)})
        ON CONFLICT(address) DO UPDATE SET
          runner = excluded.runner,
          last_heartbeat = excluded.last_heartbeat,
          healthy = excluded.healthy
        RETURNING machine_id;
      `.values
  })

  const execWithLockConn = <A>(effect: Statement.Statement<A>): Effect.Effect<unknown, SqlError> => {
    if (!lockConn) return effect
    const [query, params] = effect.compile()
    return useLockConn((conn) => conn.executeRaw(query, params))
  }
  const execWithLockConnUnprepared = <A>(
    effect: Statement.Statement<A>
  ): Effect.Effect<ReadonlyArray<ReadonlyArray<any>>, SqlError> => {
    if (!lockConn) return effect.values
    const [query, params] = effect.compile()
    return useLockConn((conn) => conn.executeUnprepared(query, params, undefined))
  }
  const execWithLockConnValues = <A>(
    effect: Statement.Statement<A>
  ): Effect.Effect<ReadonlyArray<ReadonlyArray<any>>, SqlError> => {
    if (!lockConn) return effect.values
    const [query, params] = effect.compile()
    return useLockConn((conn) => conn.executeValues(query, params))
  }

  const acquireLock = sql.onDialectOrElse({
    pg: () => {
      if (disableAdvisoryLocks) {
        return (address: string, shardIds: ReadonlyArray<string>) => {
          const values = shardIds.map((shardId) =>
            sql`(${stringLiteral(shardId)}, ${stringLiteral(address)}, ${sqlNow})`
          )
          return sql`
            INSERT INTO ${locksTableSql} (shard_id, address, acquired_at)
            SELECT * FROM (VALUES ${sql.csv(values)}) AS requested (shard_id, address, acquired_at)
            ${pgLockOrder}
            ON CONFLICT (shard_id) DO UPDATE
            SET address = ${address}, acquired_at = ${sqlNow}
            WHERE ${locksTableSql}.address = ${address}
              OR ${locksTableSql}.acquired_at < ${lockExpiresAt}
`.pipe(
            execWithLockConn,
            Effect.andThen(acquiredLocks(address, shardIds))
          )
        }
      }
      return (_address: string, shardIds: ReadonlyArray<string>) =>
        useLockConn(Effect.fnUntraced(function*(conn, pid) {
          const acquiredShardIds: Array<string> = []
          const toAcquire = new Map(shardIds.map((shardId) => [lockNumbers.get(shardId)!, shardId]))
          const takenLocks = yield* conn.executeValues(
            `SELECT objid FROM pg_locks WHERE locktype = 'advisory' AND granted = true AND classid = ${pgLockNamespaceOid} AND objsubid = 2 AND pid = ${pid} ORDER BY objid`,
            []
          )
          for (let i = 0; i < takenLocks.length; i++) {
            const lockNum = takenLocks[i][0] as number
            const shardId = toAcquire.get(lockNum)
            if (shardId === undefined) continue
            acquiredShardIds.push(shardId)
            toAcquire.delete(lockNum)
          }
          if (toAcquire.size === 0) {
            return acquiredShardIds
          }
          const rows = yield* conn.executeUnprepared(`SELECT ${pgLocks(toAcquire)}`, [], undefined)
          const results = rows[0] as Record<string, boolean>
          for (const shardId in results) {
            if (results[shardId]) {
              acquiredShardIds.push(shardId)
            }
          }
          return acquiredShardIds
        }))
    },

    mysql: () => {
      if (disableAdvisoryLocks) {
        return (address: string, shardIds: ReadonlyArray<string>) => {
          const values = shardIds.map((shardId) =>
            sql`(${stringLiteral(shardId)}, ${stringLiteral(address)}, ${sqlNow})`
          )
          return sql`
            INSERT INTO ${locksTableSql} (shard_id, address, acquired_at) VALUES ${sql.csv(values)}
            ON DUPLICATE KEY UPDATE
            address = IF(address = VALUES(address) OR acquired_at < ${lockExpiresAt}, VALUES(address), address),
            acquired_at = IF(address = VALUES(address) OR acquired_at < ${lockExpiresAt}, VALUES(acquired_at), acquired_at)
`.pipe(
            execWithLockConnUnprepared,
            Effect.andThen(acquiredLocks(address, shardIds))
          )
        }
      }
      return (_address: string, shardIds: ReadonlyArray<string>) =>
        useLockConn(Effect.fnUntraced(function*(conn, pid) {
          const takenLocks = (yield* conn.executeValues(`SELECT ${allMySqlTakenLocks}`, []))[0] as Array<number | null>
          const acquiredShardIds: Array<string> = []
          const toAcquire: Array<string> = []
          for (let i = 0; i < shardIds.length; i++) {
            const shardId = shardIds[i]
            const lockTakenBy = takenLocks[shardIdsIndex.get(shardId)!]
            if (lockTakenBy === pid) {
              acquiredShardIds.push(shardId)
            } else if (shardIds.includes(shardId)) {
              toAcquire.push(shardId)
            }
          }
          if (toAcquire.length === 0) {
            return acquiredShardIds
          }
          const results = (yield* conn.executeValues(`SELECT ${mysqlLocks(toAcquire)}`, []))[0] as Array<number>
          for (let i = 0; i < results.length; i++) {
            if (results[i] === 1) {
              acquiredShardIds.push(toAcquire[i])
            }
          }
          return acquiredShardIds
        }))
    },

    mssql: () => (address: string, shardIds: ReadonlyArray<string>) => {
      const values = shardIds.map((shardId) => sql`(${stringLiteral(shardId)}, ${stringLiteral(address)}, ${sqlNow})`)
      return sql`
        MERGE ${locksTableSql} WITH (HOLDLOCK) AS target
        USING (SELECT * FROM (VALUES ${sql.csv(values)})) AS source (shard_id, address, acquired_at)
        ON target.shard_id = source.shard_id
        WHEN MATCHED AND (target.address = source.address OR DATEDIFF(SECOND, target.acquired_at, ${sqlNow}) > ${expiresSeconds}) THEN
          UPDATE SET address = source.address, acquired_at = source.acquired_at
        WHEN NOT MATCHED THEN
          INSERT (shard_id, address, acquired_at)
          VALUES (source.shard_id, source.address, source.acquired_at);
      `.pipe(
        Effect.andThen(acquiredLocks(address, shardIds)),
        sql.withTransaction
      )
    },

    orElse: () => (address: string, shardIds: ReadonlyArray<string>) => {
      const values = shardIds.map((shardId) => sql`(${stringLiteral(shardId)}, ${stringLiteral(address)}, ${sqlNow})`)
      return sql`
        WITH source(shard_id, address, acquired_at) AS (VALUES ${sql.csv(values)})
        INSERT INTO ${locksTableSql} (shard_id, address, acquired_at)
        SELECT source.shard_id, source.address, source.acquired_at
        FROM source
        WHERE NOT EXISTS (
          SELECT 1 FROM ${locksTableSql}
          WHERE shard_id = source.shard_id
          AND address != ${address}
          AND (strftime('%s', ${sqlNow}) - strftime('%s', acquired_at)) <= ${expiresSeconds}
        )
        ON CONFLICT(shard_id) DO UPDATE
        SET address = ${address}, acquired_at = ${sqlNow}
      `.pipe(
        Effect.andThen(acquiredLocks(address, shardIds)),
        sql.withTransaction
      )
    }
  })

  const lockNumbers = new Map<string, number>()
  for (let i = 0; i < availableShardGroups.length; i++) {
    const group = availableShardGroups[i]
    const base = (i + 1) * 1000000
    for (let shard = 1; shard <= config.shardsPerGroup; shard++) {
      const shardId = ShardId.make(group, shard).toString()
      const lockNum = base + shard
      lockNumbers.set(shardId, lockNum)
    }
  }

  const shardIdsIndex = new Map<string, number>()
  const lockNames = new Map<string, string>()
  const lockNamesReverse = new Map<string, string>()
  {
    let index = 0
    for (let i = 0; i < availableShardGroups.length; i++) {
      const group = availableShardGroups[i]
      for (let shard = 1; shard <= config.shardsPerGroup; shard++) {
        const shardId = ShardId.make(group, shard).toString()
        const lockName = `${prefix}.${shardId}`
        shardIdsIndex.set(shardId, index++)
        lockNames.set(shardId, lockName)
        lockNamesReverse.set(lockName, shardId)
      }
    }
  }

  const pgLocks = (shardIdsMap: Map<number, string>) =>
    Array.from(
      shardIdsMap.entries(),
      ([lockNum, shardId]) => `pg_try_advisory_lock(${pgLockNamespace}, ${lockNum}) AS "${shardId}"`
    ).join(", ")

  const mysqlLocks = (shardIds: ReadonlyArray<string>) =>
    shardIds.map((shardId) => `GET_LOCK('${lockNames.get(shardId)!}', 0) AS "${shardId}"`).join(", ")

  const allMySqlTakenLocks = Array.from(
    lockNames.entries(),
    ([shardId, lockName]) => `IS_USED_LOCK('${lockName}') AS "${shardId}"`
  ).join(", ")

  const acquiredLocks = (address: string, shardIds: ReadonlyArray<string>) =>
    sql<{ shard_id: string }>`
      SELECT shard_id FROM ${sql(locksTable)}
      WHERE address = ${address}
      AND acquired_at >= ${lockExpiresAt}
      AND shard_id IN ${stringLiteralArr(shardIds)}
    `.pipe(
      execWithLockConnValues,
      Effect.map((rows) => rows.map((row) => row[0] as string))
    )

  const wrapString = sql.onDialectOrElse({
    mssql: () => (s: string) => `N'${s}'`,
    orElse: () => (s: string) => `'${s}'`
  })
  const stringLiteral = (s: string) => sql.literal(wrapString(s))
  const stringLiteralArr = (arr: ReadonlyArray<string>) => sql.literal(`(${arr.map(wrapString).join(",")})`)

  const refreshShards = sql.onDialectOrElse({
    pg: () => {
      if (!disableAdvisoryLocks) return acquireLock
      return (address: string, shardIds: ReadonlyArray<string>) =>
        sql`
          WITH locked AS (
            SELECT shard_id FROM ${locksTableSql}
            WHERE address = ${address} AND shard_id IN ${stringLiteralArr(shardIds)}
            ${pgLockOrder} FOR UPDATE
          )
          UPDATE ${locksTableSql}
          SET acquired_at = ${sqlNow}
          WHERE address = ${address} AND shard_id IN (SELECT shard_id FROM locked)
          RETURNING shard_id
        `.pipe(
          execWithLockConnValues,
          Effect.map((rows) => rows.map((row) => row[0] as string))
        )
    },
    mysql: () => {
      if (!disableAdvisoryLocks) return acquireLock
      return (address: string, shardIds: ReadonlyArray<string>) => {
        const shardIdsStr = stringLiteralArr(shardIds)
        return sql<Array<{ shard_id: string }>>`
          UPDATE ${locksTableSql}
          SET acquired_at = ${sqlNow}
          WHERE address = ${address} AND shard_id IN ${shardIdsStr};
          SELECT shard_id FROM ${locksTableSql} WHERE address = ${address} AND shard_id IN ${shardIdsStr}
        `.pipe(
          execWithLockConnUnprepared,
          Effect.map((rows) => rows[1].map((row) => row.shard_id))
        )
      }
    },
    mssql: () => (address: string, shardIds: ReadonlyArray<string>) =>
      sql`
        UPDATE ${locksTableSql}
        SET acquired_at = ${sqlNow}
        OUTPUT inserted.shard_id
        WHERE address = ${address} AND shard_id IN ${stringLiteralArr(shardIds)}
      `.pipe(execWithLockConnValues, Effect.map((rows) => rows.map((row) => row[0] as string))),
    orElse: () => (address: string, shardIds: ReadonlyArray<string>) =>
      sql`
        UPDATE ${locksTableSql}
        SET acquired_at = ${sqlNow}
        WHERE address = ${address} AND shard_id IN ${stringLiteralArr(shardIds)}
        RETURNING shard_id
      `.pipe(execWithLockConnValues, Effect.map((rows) => rows.map((row) => row[0] as string)))
  })

  // On failure, replace the connection ready at entry. If none was ready,
  // retry only a failed rebuild, leaving pending or newly ready connections alone.
  const withLockOperationDeadline = <A, E, R>(operation: Effect.Effect<A, E, R>) =>
    Effect.suspend(() => {
      const ready = lockConn?.getUnsafe()
      return Effect.onError(withDeadline(operation), () => {
        if (ready !== undefined) return rebuildLockConn(ready)
        return lockConn?.getUnsafe() === undefined ? rebuildLockConn() : Effect.void
      })
    })

  const releaseShard = sql.onDialectOrElse({
    pg: () => {
      if (disableAdvisoryLocks) {
        return (address: string, shardId: string) =>
          sql`DELETE FROM ${locksTableSql} WHERE address = ${address} AND shard_id = ${shardId}`.pipe(execWithLockConn)
      }
      return (_address: string, shardId: string) =>
        useLockConn(Effect.fnUntraced(function*(conn) {
          const lockNum = lockNumbers.get(shardId)!
          for (let i = 0; i < 5; i++) {
            yield* conn.executeRaw(`SELECT pg_advisory_unlock(${pgLockNamespace}, ${lockNum})`, [])
            const takenLocks = yield* conn.executeValues(
              `SELECT 1 FROM pg_locks WHERE locktype = 'advisory' AND granted = true AND classid = ${pgLockNamespaceOid} AND objid = ${lockNum} AND objsubid = 2 AND pid = pg_backend_pid()`,
              []
            )
            if (takenLocks.length === 0) return
          }
          yield* conn.executeRaw(`SELECT pg_advisory_unlock_all()`, [])
        }))
    },
    mysql: () => {
      if (disableAdvisoryLocks) {
        return (address: string, shardId: string) =>
          sql`DELETE FROM ${locksTableSql} WHERE address = ${address} AND shard_id = ${shardId}`.pipe(execWithLockConn)
      }
      return (_address: string, shardId: string) =>
        useLockConn(Effect.fnUntraced(function*(conn, pid) {
          const lockName = lockNames.get(shardId)!
          while (true) {
            yield* conn.executeRaw(`SELECT RELEASE_LOCK('${lockName}')`, [])
            const takenLocks = yield* conn.executeValues(
              `SELECT IS_USED_LOCK('${lockName}')`,
              []
            )
            if (takenLocks.length === 0 || takenLocks[0][0] !== pid) return
          }
        }))
    },
    orElse: () => (address: string, shardId: string) =>
      sql`DELETE FROM ${locksTableSql} WHERE address = ${address} AND shard_id = ${shardId}`
  })

  const releaseAllShards = sql.onDialectOrElse({
    pg: () => (address: string) =>
      disableAdvisoryLocks
        ? sql`
          WITH locked AS (
            SELECT shard_id FROM ${locksTableSql} WHERE address = ${address} ${pgLockOrder} FOR UPDATE
          )
          DELETE FROM ${locksTableSql} WHERE address = ${address} AND shard_id IN (SELECT shard_id FROM locked)
        `.pipe(execWithLockConn)
        : sql`SELECT pg_advisory_unlock_all()`.pipe(execWithLockConn, Effect.asVoid),
    mysql: () => (address: string) =>
      disableAdvisoryLocks
        ? sql`DELETE FROM ${locksTableSql} WHERE address = ${address}`.pipe(execWithLockConn)
        : sql`SELECT RELEASE_ALL_LOCKS()`.pipe(execWithLockConn, Effect.asVoid),
    orElse: () => (address: string) => sql`DELETE FROM ${locksTableSql} WHERE address = ${address}`
  })

  return RunnerStorage.makeEncoded({
    getRunners: sql`SELECT runner, healthy FROM ${runnersTableSql} WHERE last_heartbeat > ${lockExpiresAt}`.values.pipe(
      PersistenceError.refail,
      Effect.map(Arr.map(([runner, healthy]) => [String(runner), Boolean(healthy)] as const)),
      withTracerDisabled
    ),

    register: (address, runner, healthy) =>
      insertRunner(address, runner, healthy).pipe(
        Effect.map((rows: any) => Number(rows[0][0])),
        PersistenceError.refail,
        withTracerDisabled
      ),

    unregister: (address) =>
      sql`DELETE FROM ${runnersTableSql} WHERE address = ${address} OR last_heartbeat < ${lockExpiresAt}`.pipe(
        Effect.asVoid,
        PersistenceError.refail,
        withTracerDisabled
      ),

    setRunnerHealth: (address, healthy) =>
      sql`UPDATE ${runnersTableSql} SET healthy = ${encodeBoolean(healthy)} WHERE address = ${address}`
        .pipe(
          Effect.asVoid,
          PersistenceError.refail,
          withTracerDisabled
        ),

    acquire: (address, shardIds) =>
      withLockOperationDeadline(acquireLock(address, shardIds)).pipe(
        PersistenceError.refail,
        withTracerDisabled
      ),

    refresh: (address, shardIds) => {
      const heartbeat = sql`UPDATE ${runnersTableSql} SET last_heartbeat = ${sqlNow} WHERE address = ${address}`
      // An empty refresh is the liveness probe used while lock storage is
      // unhealthy. Run it on the shared pool, so a wedged reserved lock
      // connection cannot block recovery.
      if (shardIds.length === 0) {
        return withDeadline(heartbeat).pipe(
          Effect.as([]),
          PersistenceError.refail,
          withTracerDisabled
        )
      }
      return withLockOperationDeadline(
        heartbeat.pipe(
          execWithLockConn,
          Effect.andThen(refreshShards(address, shardIds))
        )
      ).pipe(
        PersistenceError.refail,
        withTracerDisabled
      )
    },

    release: (address, shardId) =>
      withLockOperationDeadline(releaseShard(address, shardId)).pipe(
        Effect.asVoid,
        PersistenceError.refail,
        withTracerDisabled
      ),

    releaseAll: (address) =>
      withLockOperationDeadline(releaseAllShards(address)).pipe(
        Effect.asVoid,
        PersistenceError.refail,
        withTracerDisabled
      )
  })
}, withTracerDisabled)

/**
 * Layer that provides SQL-backed `RunnerStorage` using the default table prefix.
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const layer: Layer.Layer<
  RunnerStorage.RunnerStorage,
  SqlError,
  SqlClient.SqlClient | ShardingConfig.ShardingConfig
> = Layer.effect(RunnerStorage.RunnerStorage)(make({}))

/**
 * Layer that provides SQL-backed `RunnerStorage` using a custom table prefix.
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const layerWith = (options: {
  readonly prefix?: string | undefined
}): Layer.Layer<RunnerStorage.RunnerStorage, SqlError, SqlClient.SqlClient | ShardingConfig.ShardingConfig> =>
  Layer.effect(RunnerStorage.RunnerStorage)(make(options))
