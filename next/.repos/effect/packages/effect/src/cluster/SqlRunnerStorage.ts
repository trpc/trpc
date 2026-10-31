/**
 * Stores cluster runner registration and shard ownership in SQL.
 *
 * The SQL-backed `RunnerStorage` records runners, health flags, machine ids,
 * and shard locks so multiple processes can coordinate which runner owns each
 * shard. This module migrates the required runner and lock tables, supports an
 * optional table prefix, uses advisory locks for PostgreSQL and MySQL when
 * enabled, and provides constructors and layers for the storage service.
 * PGlite clients always use lock table rows on the shared client, so the
 * storage never holds their only connection.
 *
 * `layer`, `layerWith`, and `make` run the migrations before building the
 * storage. To run migrations with a different connection, such as a schema
 * owner in a deploy step, use `layerMigrations` there and `layerStorage` in the
 * runtime.
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
import * as Migrator from "../sql/Migrator.ts"
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

// The session holding a storage's advisory locks, as reported to other
// sessions.
interface LockSession {
  pid: number
  // MySQL only: the lock that pins the session's lock connection
  readonly pinLock: string | undefined
}

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

const makeStorage = Effect.fnUntraced(function*(options: {
  readonly prefix?: string | undefined
}) {
  const config = yield* ShardingConfig.ShardingConfig
  const shardGroups = ShardingConfig.shardGroupConfig(config)
  const availableShardGroups = Array.from(shardGroups.available)
  const lockOperationInterval = effectiveInterval(config)
  const sql = (yield* SqlClient.SqlClient).withoutTransforms()
  // PGlite runs every statement on one session, so advisory locks are shared by
  // every user of the client and a reserved connection would block all other
  // statements. Use table leases on the shared client instead.
  const singleSession = sql.driver === "pglite"
  const disableAdvisoryLocks = config.shardLockDisableAdvisory || singleSession
  const layerScope = yield* Effect.scope
  const prefix = options?.prefix ?? "cluster"
  const table = (name: string) => `${prefix}_${name}`
  const pgLockNamespace = postgresLockNamespace(prefix)
  // PostgreSQL exposes the signed int4 lock key through pg_locks as an unsigned oid.
  const pgLockNamespaceOid = pgLockNamespace >>> 0

  // MySQL identifies a lock holder by connection id. Behind Vitess that is the
  // id of vtgate's lock connection for the session, which vtgate replaces
  // once the session releases all of its locks. A lock of the session's own
  // pins that connection and reads its id.
  const pinLockSession = Effect.fnUntraced(function*(conn: Connection, pinLock?: string) {
    while (true) {
      const name = pinLock ?? `cluster:pid:${(Math.random() * Number.MAX_SAFE_INTEGER) | 0}`
      const taken = (yield* conn.executeValues(
        `SELECT GET_LOCK('${name}', 10), IS_USED_LOCK('${name}')`,
        []
      ))[0] as [1 | null, number]
      if (taken[0] === null) continue
      return { pid: Number(taken[1]), pinLock: name }
    }
  })

  // In milliseconds, capped to the largest value PostgreSQL accepts.
  const idleSessionTimeout = Math.min(
    Math.ceil(Duration.toMillis(Duration.fromInputUnsafe(config.shardLockExpiration))),
    2147483647
  )
  const shardLockExpirationSeconds = Math.ceil(Duration.toSeconds(config.shardLockExpiration))
  // Between the smallest and largest values MySQL accepts.
  const waitTimeout = Math.min(Math.max(1, shardLockExpirationSeconds), 31536000)

  // Keep all PostgreSQL and MySQL shard-lock operations on a rebuildable
  // reserved connection, including when advisory locks are disabled.
  const acquireLockConn = singleSession ? undefined : sql.onDialectOrElse({
    pg: () =>
      Effect.fnUntraced(function*(scope: Scope.Scope) {
        const conn = yield* Effect.orDie(sql.reserve).pipe(
          Scope.provide(scope)
        )
        if (disableAdvisoryLocks) return [conn, { pid: 0, pinLock: undefined }] as const
        // The connection returns to the shared pool, so restore the session's
        // idle_session_timeout along with releasing its locks. Registered
        // before the timeout is set, so a failed setup restores it too.
        yield* Scope.addFinalizerExit(scope, () =>
          conn.executeRaw(
            "SELECT pg_advisory_unlock_all(), (SELECT set_config(name, reset_val, false) FROM pg_settings WHERE name = 'idle_session_timeout')",
            []
          ).pipe(
            Effect.timeout(lockOperationInterval),
            Effect.interruptible,
            Effect.ignoreCause
          ))
        // Advisory locks belong to the session, so a frozen runner whose
        // connection stays open would hold them indefinitely. End the session
        // once it has been idle for shardLockExpiration, which releases them.
        // Runners holding shards use it at least every shardLockExpiration / 3.
        // Servers without idle_session_timeout (before PostgreSQL 14) keep the
        // session open.
        const pid = (yield* conn.executeValues(
          `SELECT pg_backend_pid(), (SELECT set_config(name, '${idleSessionTimeout}', false) FROM pg_settings WHERE name = 'idle_session_timeout')`,
          []
        ))[0][0] as number
        return [conn, { pid, pinLock: undefined }] as const
      }, Effect.orDie),
    mysql: () =>
      Effect.fnUntraced(function*(scope: Scope.Scope) {
        const conn = yield* Effect.orDie(sql.reserve).pipe(
          Scope.provide(scope)
        )
        if (disableAdvisoryLocks) return [conn, { pid: 0, pinLock: undefined }] as const
        // The connection goes back to the shared pool, so leave it as it was
        // borrowed, even if setup fails below.
        const borrowedWaitTimeout = Number((yield* conn.executeValues("SELECT @@SESSION.wait_timeout", []))[0][0])
        yield* Scope.addFinalizerExit(scope, () =>
          conn.executeRaw("SELECT RELEASE_ALL_LOCKS()", []).pipe(
            Effect.andThen(conn.executeRaw(`SET SESSION wait_timeout = ${borrowedWaitTimeout}`, [])),
            Effect.timeout(lockOperationInterval),
            Effect.interruptible,
            Effect.ignoreCause
          ))
        // Named locks belong to the connection, so a frozen runner whose
        // connection stays open would hold them indefinitely. Have the server
        // close the connection once it has been idle for shardLockExpiration,
        // which releases them. vtgate accepts but ignores wait_timeout, so
        // behind Vitess the locks stay held until the connection closes.
        yield* conn.executeRaw(`SET SESSION wait_timeout = ${waitTimeout}`, [])
        // we need to get the connection id using IS_USED_LOCK to properly
        // support vitess
        const session: LockSession = yield* pinLockSession(conn)
        return [conn, session] as const
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

  const rebuildLockConn = (from?: readonly [Connection, LockSession]) => {
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
    f: (conn: Connection, pid: number, session: LockSession) => Effect.Effect<A, E, R>
  ): Effect.Effect<A, E, R> =>
    Effect.flatMap(
      lockConn!.await,
      (held) =>
        Effect.onError(
          f(held[0], held[1].pid, held[1]),
          (cause) => Cause.hasInterruptsOnly(cause) ? Effect.void : rebuildLockConn(held)
        )
    )

  const runnersTable = table("runners")
  const runnersTableSql = sql(runnersTable)

  const locksTable = table("locks")
  const locksTableSql = sql(locksTable)

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

  const expiresSeconds = sql.literal(shardLockExpirationSeconds.toString())
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

  // Splits shardIds into the advisory locks held by the lock session and the rest.
  const pgHeldLocks = Effect.fnUntraced(function*(conn: Connection, pid: number, shardIds: ReadonlyArray<string>) {
    const held: Array<string> = []
    const notHeld = new Map(shardIds.map((shardId) => [lockNumbers.get(shardId)!, shardId]))
    const takenLocks = yield* conn.executeValues(
      `SELECT objid FROM pg_locks WHERE locktype = 'advisory' AND granted = true AND classid = ${pgLockNamespaceOid} AND objsubid = 2 AND pid = ${pid} ORDER BY objid`,
      []
    )
    for (let i = 0; i < takenLocks.length; i++) {
      const lockNum = takenLocks[i][0] as number
      const shardId = notHeld.get(lockNum)
      if (shardId === undefined) continue
      held.push(shardId)
      notHeld.delete(lockNum)
    }
    return [held, notHeld] as const
  })

  const mysqlHeldLocks = Effect.fnUntraced(function*(conn: Connection, pid: number, shardIds: ReadonlyArray<string>) {
    const takenLocks = (yield* conn.executeValues(`SELECT ${allMySqlTakenLocks}`, []))[0] as Array<number | null>
    const held: Array<string> = []
    const notHeld: Array<string> = []
    for (let i = 0; i < shardIds.length; i++) {
      const shardId = shardIds[i]
      const lockTakenBy = takenLocks[shardIdsIndex.get(shardId)!]
      if (lockTakenBy !== null && Number(lockTakenBy) === pid) {
        held.push(shardId)
      } else {
        notHeld.push(shardId)
      }
    }
    return [held, notHeld] as const
  })

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
          const [acquiredShardIds, toAcquire] = yield* pgHeldLocks(conn, pid, shardIds)
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
          const [acquiredShardIds, toAcquire] = yield* mysqlHeldLocks(conn, pid, shardIds)
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

  // An advisory lock refresh only confirms the locks the current lock session
  // holds. A replaced session has lost its predecessor's locks, possibly to
  // another runner in between, so reacquiring them here would hide the loss.
  const refreshShards = sql.onDialectOrElse({
    pg: () => {
      if (!disableAdvisoryLocks) {
        return (_address: string, shardIds: ReadonlyArray<string>) =>
          useLockConn((conn, pid) => Effect.map(pgHeldLocks(conn, pid, shardIds), ([held]) => held))
      }
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
      if (!disableAdvisoryLocks) {
        return (_address: string, shardIds: ReadonlyArray<string>) =>
          useLockConn((conn, pid) => Effect.map(mysqlHeldLocks(conn, pid, shardIds), ([held]) => held))
      }
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
            if (takenLocks.length === 0 || Number(takenLocks[0][0]) !== pid) return
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
        : useLockConn(Effect.fnUntraced(function*(conn, _pid, session) {
          yield* conn.executeRaw("SELECT RELEASE_ALL_LOCKS()", [])
          // Releasing every lock also releases the pin, so take it again.
          const pinned = yield* pinLockSession(conn, session.pinLock)
          session.pid = pinned.pid
        })),
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

    // A runner without shards leaves its lock connection idle, so the server
    // may have ended the session, and the first operation on it fails and
    // replaces it. Acquiring does not depend on the previous session, so retry
    // once on the replacement.
    acquire: (address, shardIds) =>
      withLockOperationDeadline(
        lockConn
          ? Effect.catch(acquireLock(address, shardIds), () => acquireLock(address, shardIds))
          : acquireLock(address, shardIds)
      ).pipe(
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
 * `make` first runs the runner storage migrations, so the connection needs
 * permission to create tables. When `prefix` is omitted, `make` uses the
 * `cluster` prefix, creating `cluster_runners`, `cluster_locks`, and the
 * `cluster_runner_migrations` history table. PostgreSQL and MySQL use advisory
 * locks unless `ShardingConfig.shardLockDisableAdvisory` is enabled or the
 * client is PGlite; other dialects and PGlite use rows in the locks table.
 *
 * **Gotchas**
 *
 * Changing `prefix` changes all generated table names, so runners using
 * different prefixes do not share registrations or shard locks.
 *
 * @see {@link layer} for the default SQL-backed storage layer
 * @see {@link layerWith} for a SQL-backed storage layer with a custom table prefix
 * @see {@link layerStorage} for a storage layer that does not run migrations
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const make = (options: {
  readonly prefix?: string | undefined
}): Effect.Effect<
  RunnerStorage.RunnerStorage["Service"],
  SqlError,
  SqlClient.SqlClient | ShardingConfig.ShardingConfig | Scope.Scope
> => Effect.andThen(runRunnerMigrations(options), makeStorage(options))

/**
 * Migration loader for the SQL runner storage tables.
 *
 * **Details**
 *
 * History is recorded in `<prefix>_runner_migrations`; the default
 * prefix is `cluster`. The locks table is created regardless of advisory lock settings.
 *
 * @stability unstable
 * @category migrations
 * @since 4.1.0
 */
export const migrations = (options: {
  readonly prefix?: string | undefined
}): Migrator.Loader => {
  const prefix = options.prefix ?? "cluster"
  const table = (name: string) => `${prefix}_${name}`
  const runnersTable = table("runners")
  const locksTable = table("locks")

  return Migrator.fromRecord({
    // Existing deployments may have these tables but no migration history.
    "0001_create_tables": Effect.gen(function*() {
      const sql = (yield* SqlClient.SqlClient).withoutTransforms()
      const runnersTableSql = sql(runnersTable)
      const locksTableSql = sql(locksTable)

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
          sql`
            CREATE TABLE IF NOT EXISTS ${locksTableSql} (
              shard_id VARCHAR(50) PRIMARY KEY,
              address VARCHAR(255) NOT NULL,
              acquired_at DATETIME NOT NULL
            )
          `,
        pg: () =>
          sql`
            CREATE TABLE IF NOT EXISTS ${locksTableSql} (
              shard_id VARCHAR(50) PRIMARY KEY,
              address VARCHAR(255) NOT NULL,
              acquired_at TIMESTAMP NOT NULL
            )
          `,
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
    })
  })
}

const runRunnerMigrations = (options: {
  readonly prefix?: string | undefined
}): Effect.Effect<void, never, SqlClient.SqlClient> =>
  Migrator.make({})({
    loader: migrations(options),
    // Message and runner migration ids overlap, so keep separate histories.
    table: `${options.prefix ?? "cluster"}_runner_migrations`
  }).pipe(Effect.asVoid, Effect.orDie)

/**
 * Runs the SQL runner storage migrations without providing storage.
 *
 * **Details**
 *
 * Use an owner connection in a deploy step, then use `layerStorage` with a
 * DML-only runtime connection. History is recorded in `<prefix>_runner_migrations`.
 * Migration errors become defects.
 * This layer does not require `ShardingConfig`.
 *
 * @stability unstable
 * @category layers
 * @since 4.1.0
 */
export const layerMigrations = (options: {
  readonly prefix?: string | undefined
}): Layer.Layer<never, never, SqlClient.SqlClient> => Layer.effectDiscard(runRunnerMigrations(options))

/**
 * Provides SQL-backed `RunnerStorage` without DDL or startup schema checks.
 *
 * **Details**
 *
 * Run `layerMigrations` separately before using this layer.
 *
 * @stability unstable
 * @category layers
 * @since 4.1.0
 */
export const layerStorage = (options: {
  readonly prefix?: string | undefined
}): Layer.Layer<RunnerStorage.RunnerStorage, never, SqlClient.SqlClient | ShardingConfig.ShardingConfig> =>
  Layer.effect(RunnerStorage.RunnerStorage)(makeStorage(options))

/**
 * Provides SQL-backed `RunnerStorage` with a custom table prefix,
 * running migrations first.
 *
 * **Details**
 *
 * The connection needs DDL permissions. PostgreSQL takes an exclusive lock
 * on the migration history table. Use `layerMigrations` and `layerStorage`
 * to migrate separately.
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const layerWith = (options: {
  readonly prefix?: string | undefined
}): Layer.Layer<RunnerStorage.RunnerStorage, SqlError, SqlClient.SqlClient | ShardingConfig.ShardingConfig> =>
  Layer.effect(RunnerStorage.RunnerStorage)(make(options))

/**
 * Layer that provides SQL-backed `RunnerStorage` using the default table prefix,
 * running the runner storage migrations first.
 *
 * @see {@link layerWith} for the same layer with a custom table prefix
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const layer: Layer.Layer<
  RunnerStorage.RunnerStorage,
  SqlError,
  SqlClient.SqlClient | ShardingConfig.ShardingConfig
> = layerWith({})
