/**
 * Stores encoded results for `Persistable` requests.
 *
 * The `Persistence` service creates scoped stores keyed by each request's
 * `PrimaryKey`. Stores read and write schema-encoded `Exit` values with
 * optional TTLs, letting request workflows reuse expensive or idempotent results
 * across fibers, process restarts, or workers that share a backing store.
 *
 * @stability unstable
 * @since 4.0.0
 */
import * as Arr from "../Array.ts"
import * as Clock from "../Clock.ts"
import * as Context from "../Context.ts"
import * as Duration from "../Duration.ts"
import * as Effect from "../Effect.ts"
import * as Exit from "../Exit.ts"
import { identity } from "../Function.ts"
import { sqlCleanupBatchSize } from "../internal/persistence.ts"
import * as Layer from "../Layer.ts"
import * as PrimaryKey from "../PrimaryKey.ts"
import * as Schedule from "../Schedule.ts"
import * as Schema from "../Schema.ts"
import type * as Scope from "../Scope.ts"
import * as SqlClient from "../sql/SqlClient.ts"
import type { SqlError } from "../sql/SqlError.ts"
import * as KeyValueStore from "./KeyValueStore.ts"
import * as Persistable from "./Persistable.ts"
import * as Redis from "./Redis.ts"

const ErrorTypeId = "~effect/persistence/Persistence/PersistenceError" as const

/**
 * Error raised by persistence and backing-store operations.
 *
 * @stability unstable
 * @category errors
 * @since 4.0.0
 */
export class PersistenceError extends Schema.Error<PersistenceError>(ErrorTypeId)({
  _tag: Schema.tag("PersistenceError"),
  message: Schema.String,
  cause: Schema.optional(Schema.Defect())
}) {
  /**
   * Marks this value as a persistence error for runtime guards.
   *
   * @stability unstable
   * @since 4.0.0
   */
  readonly [ErrorTypeId]: typeof ErrorTypeId = ErrorTypeId
}

/**
 * Service for creating scoped stores of persisted `Persistable` request
 * results.
 *
 * @stability unstable
 * @category services
 * @since 4.0.0
 */
export class Persistence extends Context.Service<Persistence, {
  readonly make: (options: {
    readonly storeId: string
    readonly timeToLive?: (exit: Exit.Exit<unknown, unknown>, key: Persistable.Any) => Duration.Input
  }) => Effect.Effect<PersistenceStore, never, Scope.Scope>
}>()("effect/persistence/Persistence") {}

/**
 * Typed store for persisted `Exit` values keyed by `Persistable` requests.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface PersistenceStore {
  readonly get: <A extends Schema.Constraint, E extends Schema.Constraint>(
    key: Persistable.Persistable<A, E>
  ) => Effect.Effect<
    Exit.Exit<A["Type"], E["Type"]> | undefined,
    PersistenceError | Schema.SchemaError,
    A["DecodingServices"] | E["DecodingServices"]
  >
  readonly getMany: <A extends Schema.Constraint, E extends Schema.Constraint>(
    keys: Iterable<Persistable.Persistable<A, E>>
  ) => Effect.Effect<
    Array<Exit.Exit<A["Type"], E["Type"]> | undefined>,
    PersistenceError | Schema.SchemaError,
    A["DecodingServices"] | E["DecodingServices"]
  >
  readonly set: <A extends Schema.Constraint, E extends Schema.Constraint>(
    key: Persistable.Persistable<A, E>,
    value: Exit.Exit<A["Type"], E["Type"]>
  ) => Effect.Effect<void, PersistenceError | Schema.SchemaError, A["EncodingServices"] | E["EncodingServices"]>
  readonly setMany: <A extends Schema.Constraint, E extends Schema.Constraint>(
    entries: Iterable<readonly [Persistable.Persistable<A, E>, Exit.Exit<A["Type"], E["Type"]>]>
  ) => Effect.Effect<void, PersistenceError | Schema.SchemaError, A["EncodingServices"] | E["EncodingServices"]>
  readonly remove: <A extends Schema.Constraint, E extends Schema.Constraint>(
    key: Persistable.Persistable<A, E>
  ) => Effect.Effect<void, PersistenceError>
  readonly clear: Effect.Effect<void, PersistenceError>
}

/**
 * Service for creating raw backing stores for persistence store ids.
 *
 * @stability unstable
 * @category services
 * @since 4.0.0
 */
export class BackingPersistence extends Context.Service<BackingPersistence, {
  readonly make: (storeId: string) => Effect.Effect<BackingPersistenceStore, never, Scope.Scope>
}>()("effect/persistence/BackingPersistence") {}

/**
 * Raw persistence backing store for JSON-compatible objects with optional
 * TTLs.
 *
 * @stability unstable
 * @category services
 * @since 4.0.0
 */
export interface BackingPersistenceStore {
  readonly get: (key: string) => Effect.Effect<object | undefined, PersistenceError>
  readonly getMany: (
    keys: Arr.NonEmptyArray<string>
  ) => Effect.Effect<Arr.NonEmptyArray<object | undefined>, PersistenceError>
  readonly set: (
    key: string,
    value: object,
    ttl: Duration.Duration | undefined
  ) => Effect.Effect<void, PersistenceError>
  readonly setMany: (
    entries: Arr.NonEmptyArray<readonly [key: string, value: object, ttl: Duration.Duration | undefined]>
  ) => Effect.Effect<void, PersistenceError>
  readonly remove: (key: string) => Effect.Effect<void, PersistenceError>
  readonly clear: Effect.Effect<void, PersistenceError>
}

/**
 * Provides `Persistence` from `BackingPersistence`.
 *
 * **Details**
 *
 * The layer serializes and deserializes `Persistable` exits, applies
 * per-entry TTLs, and skips writes whose TTL is zero or negative.
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const layer = Layer.effect(Persistence)(Effect.gen(function*() {
  const backing = yield* BackingPersistence
  const scope = yield* Effect.scope
  return Persistence.of({
    make: Effect.fnUntraced(function*(options) {
      const storage = yield* backing.make(options.storeId)
      const timeToLive = options.timeToLive ?? (() => Duration.infinity)

      return identity<PersistenceStore>({
        get: (key) =>
          Effect.flatMap(
            storage.get(PrimaryKey.value(key)),
            (result) => result ? Persistable.deserializeExit(key, result) : Effect.undefined
          ),
        getMany: Effect.fnUntraced(function*(keys) {
          const primaryKeys = Arr.empty<string>()
          const persistables = Arr.empty<Persistable.Any>()
          for (const key of keys) {
            primaryKeys.push(PrimaryKey.value(key))
            persistables.push(key)
          }
          if (!Arr.isArrayNonEmpty(primaryKeys)) return []

          const results = yield* storage.getMany(primaryKeys)
          if (results.length !== primaryKeys.length) {
            return yield* new PersistenceError({
              message: `Expected ${primaryKeys.length} results but got ${results.length} from backing store`
            })
          }
          const out = new Array<Exit.Exit<unknown, unknown> | undefined>(primaryKeys.length)
          let toRemove: Array<string> | undefined
          for (let i = 0; i < results.length; i++) {
            const key = persistables[i]
            const result = results[i]
            if (result === undefined) {
              out[i] = undefined
              continue
            }
            const eff = Persistable.deserializeExit(key, result)
            const exit = Exit.isExit(eff)
              ? eff as Exit.Exit<Exit.Exit<any, any>, Schema.SchemaError>
              : yield* Effect.exit(eff)
            if (Exit.isFailure(exit)) {
              toRemove ??= []
              toRemove.push(PrimaryKey.value(key))
              out[i] = undefined
              continue
            }
            out[i] = exit.value
          }
          if (toRemove) {
            for (let i = 0; i < toRemove.length; i++) {
              yield* Effect.forkIn(storage.remove(toRemove[i]), scope)
            }
          }
          return out
        }),
        set(key, value) {
          const ttl = Duration.fromInputUnsafe(timeToLive(value, key))
          if (Duration.isZero(ttl) || Duration.isNegative(ttl)) return Effect.void
          return Persistable.serializeExit(key, value).pipe(
            Effect.flatMap((encoded) =>
              storage.set(PrimaryKey.value(key), encoded as object, Duration.isFinite(ttl) ? ttl : undefined)
            )
          )
        },
        setMany: Effect.fnUntraced(function*(entries) {
          const encodedEntries = Arr.empty<readonly [string, object, Duration.Duration | undefined]>()
          for (const [key, value] of entries) {
            const ttl = Duration.fromInputUnsafe(timeToLive(value, key))
            if (Duration.isZero(ttl) || Duration.isNegative(ttl)) continue
            const encoded = Persistable.serializeExit(key, value)
            const exit = Exit.isExit(encoded)
              ? encoded as Exit.Exit<unknown, Schema.SchemaError>
              : yield* Effect.exit(encoded)
            if (Exit.isFailure(exit)) {
              return yield* exit
            }
            encodedEntries.push([PrimaryKey.value(key), exit.value as object, Duration.isFinite(ttl) ? ttl : undefined])
          }
          if (!Arr.isArrayNonEmpty(encodedEntries)) return
          return yield* storage.setMany(encodedEntries)
        }),
        remove: (key) => storage.remove(PrimaryKey.value(key)),
        clear: storage.clear
      })
    })
  })
}))

/**
 * Provides an in-memory `BackingPersistence` grouped by store id.
 *
 * **Details**
 *
 * Entries are process-local and expire according to their stored TTL.
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const layerBackingMemory: Layer.Layer<BackingPersistence> = Layer.sync(BackingPersistence)(
  () => {
    const stores = new Map<string, Map<string, readonly [object, expires: number | null]>>()
    const getStore = (storeId: string) => {
      let store = stores.get(storeId)
      if (store === undefined) {
        store = new Map<string, readonly [object, expires: number | null]>()
        stores.set(storeId, store)
      }
      return store
    }
    return BackingPersistence.of({
      make: (storeId) =>
        Effect.clockWith((clock) => {
          const map = getStore(storeId)
          const unsafeGet = (key: string): object | undefined => {
            const value = map.get(key)
            if (value === undefined) {
              return undefined
            } else if (value[1] !== null && value[1] <= clock.currentTimeMillisUnsafe()) {
              map.delete(key)
              return undefined
            }
            return value[0]
          }
          return Effect.succeed<BackingPersistenceStore>({
            get: (key) => Effect.sync(() => unsafeGet(key)),
            getMany: (keys) => Effect.sync(() => Arr.map(keys, unsafeGet)),
            set: (key, value, ttl) => Effect.sync(() => map.set(key, [value, unsafeTtlToExpires(clock, ttl)])),
            setMany: (entries) =>
              Effect.sync(() => {
                for (const [key, value, ttl] of entries) {
                  map.set(key, [value, unsafeTtlToExpires(clock, ttl)])
                }
              }),
            remove: (key) => Effect.sync(() => map.delete(key)),
            clear: Effect.sync(() => map.clear())
          })
        })
    })
  }
)

/**
 * Provides SQL-backed persistence using one table per store id.
 *
 * **Details**
 *
 * Each table is created if needed and stores JSON-encoded values with optional
 * expiration timestamps.
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const layerBackingSqlMultiTable: Layer.Layer<
  BackingPersistence,
  never,
  SqlClient.SqlClient
> = Layer.effect(BackingPersistence)(Effect.gen(function*() {
  const sql = (yield* SqlClient.SqlClient).withoutTransforms()
  return BackingPersistence.of({
    make: Effect.fnUntraced(function*(storeId) {
      const clock = yield* Clock.Clock
      const tableName = `effect_persistence_${storeId}`
      const table = sql(tableName)
      yield* sql.onDialectOrElse({
        mysql: () =>
          sql`
            CREATE TABLE IF NOT EXISTS ${table} (
              id VARCHAR(191) PRIMARY KEY,
              value TEXT NOT NULL,
              expires BIGINT
            )
          `,
        pg: () =>
          sql`
            CREATE TABLE IF NOT EXISTS ${table} (
              id TEXT PRIMARY KEY,
              value TEXT NOT NULL,
              expires BIGINT
            )
          `,
        mssql: () =>
          sql`
            IF NOT EXISTS (SELECT * FROM sysobjects WHERE name=${tableName} AND xtype='U')
            CREATE TABLE ${table} (
              id NVARCHAR(450) PRIMARY KEY,
              value NVARCHAR(MAX) NOT NULL,
              expires BIGINT
            )
          `,
        // sqlite
        orElse: () =>
          sql`
            CREATE TABLE IF NOT EXISTS ${table} (
              id TEXT PRIMARY KEY,
              value TEXT NOT NULL,
              expires INTEGER
            )
          `
      }).pipe(Effect.orDie)

      // Cleanup expired entries on startup
      yield* Effect.ignore(
        sql`DELETE FROM ${table} WHERE expires IS NOT NULL AND expires <= ${clock.currentTimeMillisUnsafe()}`
      )

      type UpsertFn = (
        entries: Array<{ id: string; value: string; expires: number | null }>
      ) => Effect.Effect<unknown, SqlError>

      const upsert = sql.onDialectOrElse({
        pg: (): UpsertFn => (entries) =>
          sql`
            INSERT INTO ${table} ${sql.insert(entries)}
            ON CONFLICT (id) DO UPDATE SET value=EXCLUDED.value, expires=EXCLUDED.expires
          `.unprepared,
        mysql: (): UpsertFn => (entries) =>
          sql`
            INSERT INTO ${table} ${sql.insert(entries)}
            ON DUPLICATE KEY UPDATE value=VALUES(value), expires=VALUES(expires)
          `.unprepared,
        mssql: (): UpsertFn => (entries) =>
          Effect.forEach(
            entries,
            (entry) =>
              sql`
                MERGE ${table} AS target
                USING (SELECT ${entry.id} AS id, ${entry.value} AS value, ${entry.expires} AS expires) AS source
                ON target.id = source.id
                WHEN MATCHED THEN UPDATE SET value = source.value, expires = source.expires
                WHEN NOT MATCHED THEN INSERT (id, value, expires)
                VALUES (source.id, source.value, source.expires);
              `,
            { discard: true }
          ),
        // sqlite
        orElse: (): UpsertFn => (entries) =>
          sql`
            INSERT INTO ${table} ${sql.insert(entries)}
            ON CONFLICT(id) DO UPDATE SET value=excluded.value, expires=excluded.expires
          `.unprepared
      })

      return identity<BackingPersistenceStore>({
        get: (key) =>
          sql<
            { value: string }
          >`SELECT value FROM ${table} WHERE id = ${key} AND (expires IS NULL OR expires > ${clock.currentTimeMillisUnsafe()})`
            .pipe(
              Effect.mapError((cause) =>
                new PersistenceError({
                  message: `Failed to get key ${key} from backing store`,
                  cause
                })
              ),
              Effect.flatMap((rows) => {
                if (rows.length === 0) {
                  return Effect.undefined
                }
                try {
                  return Effect.succeed(JSON.parse(rows[0].value))
                } catch (cause) {
                  return Effect.fail(
                    new PersistenceError({
                      message: `Failed to parse value for key ${key} from backing store`,
                      cause
                    })
                  )
                }
              })
            ),
        getMany: (keys) =>
          sql<{ id: string; value: string }>`SELECT id, value FROM ${table} WHERE ${
            sql.in("id", keys)
          } AND (expires IS NULL OR expires > ${clock.currentTimeMillisUnsafe()})`.unprepared.pipe(
            Effect.mapError((cause) =>
              new PersistenceError({
                message: `Failed to getMany from backing store`,
                cause
              })
            ),
            Effect.flatMap((rows) => {
              const values = new Map<string, object>()
              for (let i = 0; i < rows.length; i++) {
                const row = rows[i]
                try {
                  values.set(row.id, JSON.parse(row.value))
                } catch {
                  // ignore
                }
              }
              return Effect.succeed(keys.map((key) => values.get(key)) as Arr.NonEmptyArray<object | undefined>)
            })
          ),
        set: (key, value, ttl) =>
          Effect.suspend(() => {
            try {
              return upsert([{ id: key, value: JSON.stringify(value), expires: unsafeTtlToExpires(clock, ttl) }]).pipe(
                Effect.mapError((cause) =>
                  new PersistenceError({
                    message: `Failed to set key ${key} in backing store`,
                    cause
                  })
                ),
                Effect.asVoid
              )
            } catch (cause) {
              return Effect.fail(
                new PersistenceError({
                  message: `Failed to serialize value for key ${key} to backing store`,
                  cause
                })
              )
            }
          }),
        setMany: (entries) =>
          Effect.suspend(() => {
            try {
              const encoded = entries.map(([key, value, ttl]) => ({
                id: key,
                value: JSON.stringify(value),
                expires: unsafeTtlToExpires(clock, ttl)
              }))
              return upsert(encoded).pipe(
                Effect.mapError((cause) =>
                  new PersistenceError({
                    message: `Failed to setMany in backing store`,
                    cause
                  })
                ),
                Effect.asVoid
              )
            } catch (cause) {
              return Effect.fail(
                new PersistenceError({
                  message: `Failed to serialize values into backing store`,
                  cause
                })
              )
            }
          }),
        remove: (key) =>
          sql`DELETE FROM ${table} WHERE id = ${key}`.pipe(
            Effect.mapError((cause) =>
              new PersistenceError({
                message: `Failed to remove key ${key} from backing store`,
                cause
              })
            ),
            Effect.asVoid
          ),
        clear: sql`DELETE FROM ${table}`.pipe(
          Effect.mapError((cause) =>
            new PersistenceError({
              message: `Failed to clear backing store`,
              cause
            })
          ),
          Effect.asVoid
        )
      })
    })
  })
}))

/**
 * Provides SQL-backed persistence using a shared `effect_persistence` table.
 *
 * **Details**
 *
 * Rows are partitioned by `store_id` and store JSON-encoded values with
 * optional expiration timestamps.
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const layerBackingSql: Layer.Layer<
  BackingPersistence,
  never,
  SqlClient.SqlClient
> = Layer.effect(BackingPersistence)(Effect.gen(function*() {
  const sql = (yield* SqlClient.SqlClient).withoutTransforms()
  const table = sql("effect_persistence")
  yield* sql.onDialectOrElse({
    mysql: () =>
      sql`
        CREATE TABLE IF NOT EXISTS ${table} (
          store_id VARCHAR(191) NOT NULL,
          id VARCHAR(191) NOT NULL,
          value TEXT NOT NULL,
          expires BIGINT,
          PRIMARY KEY (store_id, id)
        )
      `,
    pg: () =>
      sql`
        CREATE TABLE IF NOT EXISTS ${table} (
          store_id TEXT NOT NULL,
          id TEXT NOT NULL,
          value TEXT NOT NULL,
          expires BIGINT,
          PRIMARY KEY (store_id, id)
        )
      `,
    mssql: () =>
      sql`
        IF NOT EXISTS (SELECT * FROM sysobjects WHERE name=${"effect_persistence"} AND xtype='U')
        CREATE TABLE ${table} (
          store_id NVARCHAR(191) NOT NULL,
          id NVARCHAR(191) NOT NULL,
          value NVARCHAR(MAX) NOT NULL,
          expires BIGINT,
          PRIMARY KEY (store_id, id)
        )
      `,
    // sqlite
    orElse: () =>
      sql`
        CREATE TABLE IF NOT EXISTS ${table} (
          store_id TEXT NOT NULL,
          id TEXT NOT NULL,
          value TEXT NOT NULL,
          expires INTEGER,
          PRIMARY KEY (store_id, id)
        )
      `
  }).pipe(Effect.orDie)

  yield* sql.onDialectOrElse({
    pg: () =>
      sql`CREATE INDEX IF NOT EXISTS effect_persistence_expires_idx ON ${table} (expires) WHERE expires IS NOT NULL`
        .pipe(Effect.orDie, Effect.asVoid),
    mysql: () =>
      Effect.gen(function*() {
        const indexExists = sql<{ readonly count: number }>`
          SELECT COUNT(*) AS count FROM information_schema.statistics
          WHERE table_schema = DATABASE()
            AND table_name = 'effect_persistence'
            AND index_name = 'effect_persistence_expires_idx'
        `.pipe(
          Effect.map((rows) => Number(rows[0].count) > 0)
        )

        yield* sql`CREATE INDEX effect_persistence_expires_idx ON ${table} (expires)`.pipe(
          Effect.catch((error) => Effect.flatMap(indexExists, (exists) => exists ? Effect.void : Effect.fail(error)))
        )
      }).pipe(Effect.orDie),
    mssql: () =>
      Effect.gen(function*() {
        const indexExists = sql<{ readonly count: number }>`
          SELECT COUNT(*) AS count FROM sys.indexes
          WHERE name = N'effect_persistence_expires_idx'
            AND object_id = OBJECT_ID(N'effect_persistence')
        `.pipe(
          Effect.map((rows) => Number(rows[0].count) > 0)
        )

        yield* sql`CREATE INDEX effect_persistence_expires_idx ON ${table} (expires) WHERE expires IS NOT NULL`.pipe(
          Effect.catch((error) => Effect.flatMap(indexExists, (exists) => exists ? Effect.void : Effect.fail(error)))
        )
      }).pipe(Effect.orDie),
    // sqlite
    orElse: () =>
      sql`CREATE INDEX IF NOT EXISTS effect_persistence_expires_idx ON ${table} (expires) WHERE expires IS NOT NULL`
        .pipe(Effect.orDie, Effect.asVoid)
  })

  const cleanupBatchDelay = Duration.millis(10)
  const cleanupInterval = Duration.minutes(5)

  const deleteExpiredBatch = sql.onDialectOrElse({
    pg: () => (expiresAtOrBefore: number) =>
      sql<{ readonly count: number }>`
        WITH deleted_entries AS (
          DELETE FROM ${table}
          WHERE ctid IN (
            SELECT ctid FROM ${table}
            WHERE expires IS NOT NULL AND expires <= ${expiresAtOrBefore}
            LIMIT ${sql.literal(String(sqlCleanupBatchSize))}
          )
          RETURNING 1
        )
        SELECT COUNT(*)::INT AS count FROM deleted_entries
      `.pipe(Effect.map((rows) => rows[0].count)),
    mysql: () =>
      Effect.fnUntraced(
        function*(expiresAtOrBefore: number) {
          const connection = yield* sql.reserve
          const [statement, parameters] = sql`
            DELETE FROM ${table}
            WHERE expires IS NOT NULL AND expires <= ${expiresAtOrBefore}
            LIMIT ${sql.literal(String(sqlCleanupBatchSize))}
          `.compile()
          yield* connection.execute(statement, parameters, undefined)
          const rows = yield* connection.executeValues("SELECT ROW_COUNT()", [])
          return Number(rows[0][0])
        },
        Effect.scoped
      ),
    mssql: () => (expiresAtOrBefore: number) =>
      sql<{ readonly store_id: string }>`
        WITH expired_entries AS (
          SELECT TOP ${sql.literal(String(sqlCleanupBatchSize))} store_id, id FROM ${table}
          WITH (UPDLOCK, READPAST, READCOMMITTEDLOCK)
          WHERE expires IS NOT NULL AND expires <= ${expiresAtOrBefore}
        )
        DELETE persistence
        OUTPUT DELETED.store_id
        FROM ${table} AS persistence
        INNER JOIN expired_entries
          ON persistence.store_id = expired_entries.store_id
          AND persistence.id = expired_entries.id
      `.pipe(Effect.map((deletedEntries) => deletedEntries.length)),
    // Some sqlite clients do not support interactive transactions, so use one bounded statement.
    orElse: () => (expiresAtOrBefore: number) =>
      sql<{ readonly deleted: number }>`
        DELETE FROM ${table}
        WHERE rowid IN (
          SELECT rowid FROM ${table}
          WHERE expires IS NOT NULL AND expires <= ${expiresAtOrBefore}
          LIMIT ${sql.literal(String(sqlCleanupBatchSize))}
        )
        RETURNING 1 AS deleted
      `.pipe(Effect.map((deletedEntries) => deletedEntries.length))
  })

  const deleteExpired = Effect.gen(function*() {
    const expiresAtOrBefore = yield* Clock.currentTimeMillis
    return yield* deleteExpiredBatch(expiresAtOrBefore).pipe(
      Effect.repeat({
        while: (deletedCount) => deletedCount === sqlCleanupBatchSize,
        schedule: Schedule.spaced(cleanupBatchDelay)
      })
    )
  })

  yield* deleteExpired.pipe(
    Effect.catch((cause) => Effect.logWarning("Failed to clean up expired persistence entries", cause)),
    Effect.repeat(Schedule.spaced(cleanupInterval)),
    Effect.forkScoped
  )

  type UpsertFn = (
    entries: Array<{ store_id: string; id: string; value: string; expires: number | null }>
  ) => Effect.Effect<unknown, SqlError>

  const upsert = sql.onDialectOrElse({
    pg: (): UpsertFn => (entries) =>
      sql`
        INSERT INTO ${table} ${sql.insert(entries)}
        ON CONFLICT (store_id, id) DO UPDATE SET value=EXCLUDED.value, expires=EXCLUDED.expires
      `.unprepared,
    mysql: (): UpsertFn => (entries) =>
      sql`
        INSERT INTO ${table} ${sql.insert(entries)}
        ON DUPLICATE KEY UPDATE value=VALUES(value), expires=VALUES(expires)
      `.unprepared,
    mssql: (): UpsertFn => (entries) =>
      Effect.forEach(
        entries,
        (entry) =>
          sql`
            MERGE ${table} AS target
            USING (SELECT ${entry.store_id} AS store_id, ${entry.id} AS id, ${entry.value} AS value, ${entry.expires} AS expires) AS source
            ON target.store_id = source.store_id AND target.id = source.id
            WHEN MATCHED THEN UPDATE SET value = source.value, expires = source.expires
            WHEN NOT MATCHED THEN INSERT (store_id, id, value, expires)
            VALUES (source.store_id, source.id, source.value, source.expires);
          `,
        { discard: true }
      ),
    // sqlite
    orElse: (): UpsertFn => (entries) =>
      sql`
        INSERT INTO ${table} ${sql.insert(entries)}
        ON CONFLICT(store_id, id) DO UPDATE SET value=excluded.value, expires=excluded.expires
      `.unprepared
  })

  return BackingPersistence.of({
    make: Effect.fnUntraced(function*(storeId) {
      const clock = yield* Clock.Clock

      return identity<BackingPersistenceStore>({
        get: (key) =>
          sql<
            { value: string }
          >`SELECT value FROM ${table} WHERE store_id = ${storeId} AND id = ${key} AND (expires IS NULL OR expires > ${clock.currentTimeMillisUnsafe()})`
            .pipe(
              Effect.mapError((cause) =>
                new PersistenceError({
                  message: `Failed to get key ${key} from backing store`,
                  cause
                })
              ),
              Effect.flatMap((rows) => {
                if (rows.length === 0) {
                  return Effect.undefined
                }
                try {
                  return Effect.succeed(JSON.parse(rows[0].value))
                } catch (cause) {
                  return Effect.fail(
                    new PersistenceError({
                      message: `Failed to parse value for key ${key} from backing store`,
                      cause
                    })
                  )
                }
              })
            ),
        getMany: (keys) =>
          sql<{ id: string; value: string }>`SELECT id, value FROM ${table} WHERE store_id = ${storeId} AND ${
            sql.in("id", keys)
          } AND (expires IS NULL OR expires > ${clock.currentTimeMillisUnsafe()})`.unprepared.pipe(
            Effect.mapError((cause) =>
              new PersistenceError({
                message: `Failed to getMany from backing store`,
                cause
              })
            ),
            Effect.flatMap((rows) => {
              const values = new Map<string, object>()
              for (let i = 0; i < rows.length; i++) {
                const row = rows[i]
                try {
                  values.set(row.id, JSON.parse(row.value))
                } catch {
                  // ignore
                }
              }
              return Effect.succeed(keys.map((key) => values.get(key)) as Arr.NonEmptyArray<object | undefined>)
            })
          ),
        set: (key, value, ttl) =>
          Effect.suspend(() => {
            try {
              return upsert([{
                store_id: storeId,
                id: key,
                value: JSON.stringify(value),
                expires: unsafeTtlToExpires(clock, ttl)
              }])
                .pipe(
                  Effect.mapError((cause) =>
                    new PersistenceError({
                      message: `Failed to set key ${key} in backing store`,
                      cause
                    })
                  ),
                  Effect.asVoid
                )
            } catch (cause) {
              return Effect.fail(
                new PersistenceError({
                  message: `Failed to serialize value for key ${key} to backing store`,
                  cause
                })
              )
            }
          }),
        setMany: (entries) =>
          Effect.suspend(() => {
            try {
              const encoded = entries.map(([key, value, ttl]) => ({
                store_id: storeId,
                id: key,
                value: JSON.stringify(value),
                expires: unsafeTtlToExpires(clock, ttl)
              }))
              return upsert(encoded).pipe(
                Effect.mapError((cause) =>
                  new PersistenceError({
                    message: `Failed to setMany in backing store`,
                    cause
                  })
                ),
                Effect.asVoid
              )
            } catch (cause) {
              return Effect.fail(
                new PersistenceError({
                  message: `Failed to serialize values into backing store`,
                  cause
                })
              )
            }
          }),
        remove: (key) =>
          sql`DELETE FROM ${table} WHERE store_id = ${storeId} AND id = ${key}`.pipe(
            Effect.mapError((cause) =>
              new PersistenceError({
                message: `Failed to remove key ${key} from backing store`,
                cause
              })
            ),
            Effect.asVoid
          ),
        clear: sql`DELETE FROM ${table} WHERE store_id = ${storeId}`.pipe(
          Effect.mapError((cause) =>
            new PersistenceError({
              message: `Failed to clear backing store`,
              cause
            })
          ),
          Effect.asVoid
        )
      })
    })
  })
}))

/**
 * Provides Redis-backed persistence.
 *
 * **Details**
 *
 * Each store id is used as a key prefix, values are JSON-encoded, and finite
 * TTLs are stored with Redis expiration.
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const layerBackingRedis: Layer.Layer<
  BackingPersistence,
  never,
  Redis.Redis
> = Layer.effect(BackingPersistence)(Effect.gen(function*() {
  const redis = yield* Redis.Redis
  const setMany = redis.eval(setManyRedis)

  return BackingPersistence.of({
    make: (prefix) =>
      Effect.sync(() => {
        const prefixed = (key: string) => `${prefix}:${key}`
        const parse = (str: string | null) => {
          if (str === null) {
            return Effect.undefined
          }
          try {
            return Effect.succeed(JSON.parse(str))
          } catch (cause) {
            return Effect.fail(
              new PersistenceError({
                message: `Failed to parse value from Redis`,
                cause
              })
            )
          }
        }
        return identity<BackingPersistenceStore>({
          get: (key) =>
            Effect.flatMap(
              Effect.mapError(
                redis.send<string>("GET", prefixed(key)),
                ({ cause }) =>
                  new PersistenceError({
                    message: `Failed to get key ${key} from Redis`,
                    cause
                  })
              ),
              parse
            ),
          getMany: (keys) =>
            Effect.flatMap(
              Effect.mapError(
                redis.send<Arr.NonEmptyArray<string>>("mget", ...keys.map(prefixed)),
                ({ cause }) =>
                  new PersistenceError({
                    message: `Failed to getMany from Redis`,
                    cause
                  })
              ),
              (values) => {
                const out = new Array<object | undefined>(keys.length) as Arr.NonEmptyArray<object | undefined>
                for (let i = 0; i < keys.length; i++) {
                  const value = values[i]
                  try {
                    out[i] = value === null ? undefined : JSON.parse(value)
                  } catch {
                    // TODO: remove bad entries?
                    out[i] = undefined
                  }
                }
                return Effect.succeed(out)
              }
            ),
          set: (key, value, ttl) =>
            Effect.mapError(
              ttl === undefined
                ? redis.send("SET", prefixed(key), JSON.stringify(value))
                : redis.send(
                  "SET",
                  prefixed(key),
                  JSON.stringify(value),
                  "PX",
                  String(Math.ceil(Duration.toMillis(ttl)))
                ),
              ({ cause }) =>
                new PersistenceError({
                  message: `Failed to set key ${key} in Redis`,
                  cause
                })
            ),
          setMany: (entries) =>
            Effect.suspend(() => {
              const sets = new Map<string, string>()
              const expires = new Map<string, number>()
              for (const [key, value, ttl] of entries) {
                const pkey = prefixed(key)
                sets.set(pkey, JSON.stringify(value))
                if (ttl) {
                  expires.set(pkey, Math.ceil(Duration.toMillis(ttl)))
                }
              }
              return Effect.mapError(
                setMany({ sets, expires }),
                ({ cause }) =>
                  new PersistenceError({
                    message: `Failed to setMany in Redis`,
                    cause
                  })
              )
            }),
          remove: (key) =>
            Effect.mapError(
              redis.send("DEL", prefixed(key)),
              ({ cause }) => new PersistenceError({ message: `Failed to remove key ${key} from Redis`, cause })
            ),
          clear: redis.send<Array<string>>("KEYS", `${prefix}:*`).pipe(
            Effect.flatMap((keys) => keys.length === 0 ? Effect.void : redis.send("DEL", ...keys)),
            Effect.mapError(({ cause }) =>
              new PersistenceError({
                message: `Failed to clear keys from Redis`,
                cause
              })
            )
          )
        })
      })
  })
}))

const setManyRedis = Redis.script(
  (options: {
    readonly sets: Map<string, string>
    readonly expires: Map<string, number>
  }) => [
    ...options.sets.keys(),
    ...options.expires.keys(),
    options.sets.size,
    options.expires.size,
    ...options.sets.values(),
    ...options.expires.values()
  ],
  {
    numberOfKeys: (options) => options.sets.size + options.expires.size,
    lua: `
local num_sets = tonumber(ARGV[1])
local num_expires = tonumber(ARGV[2])
local index = 3

for i = 1, num_sets do
  local key = KEYS[i]
  local value = ARGV[index]
  redis.call("SET", key, value)
  index = index + 1
end

for i = 1, num_expires do
  local key = KEYS[num_sets + i]
  local expire = tonumber(ARGV[index])
  redis.call("PEXPIRE", key, expire)
  index = index + 1
end
`
  }
)

/**
 * Provides `BackingPersistence` using a `KeyValueStore`.
 *
 * **Details**
 *
 * Each store id becomes a key prefix, and values are stored as JSON with
 * optional expiration timestamps.
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const layerBackingKvs: Layer.Layer<
  BackingPersistence,
  never,
  KeyValueStore.KeyValueStore
> = Layer.effect(BackingPersistence)(Effect.gen(function*() {
  const backing = yield* KeyValueStore.KeyValueStore
  const clock = yield* Clock.Clock
  return BackingPersistence.of({
    make: (storeId) =>
      Effect.sync(() => {
        const store = KeyValueStore.prefix(backing, storeId)
        const get = (key: string) =>
          Effect.flatMap(
            Effect.mapError(
              store.get(key),
              (error) =>
                new PersistenceError({
                  message: `Failed to get key ${key} from backing store`,
                  cause: error
                })
            ),
            (str) => {
              if (str === undefined) {
                return Effect.undefined
              }
              try {
                const parsed = JSON.parse(str)
                if (!Array.isArray(parsed)) return Effect.undefined
                const [value, expires] = parsed as [object, number | null]
                if (expires !== null && expires <= clock.currentTimeMillisUnsafe()) {
                  return Effect.as(Effect.ignore(store.remove(key)), undefined)
                }
                return Effect.succeed(value)
              } catch (cause) {
                return Effect.fail(
                  new PersistenceError({
                    message: `Failed to parse value for key ${key} from backing store`,
                    cause
                  })
                )
              }
            }
          )
        return identity<BackingPersistenceStore>({
          get,
          getMany: (keys) => Effect.forEach(keys, get, { concurrency: "unbounded" }),
          set: (key, value, ttl) =>
            Effect.suspend(() => {
              try {
                return Effect.mapError(
                  store.set(key, JSON.stringify([value, unsafeTtlToExpires(clock, ttl)])),
                  (cause) =>
                    new PersistenceError({
                      message: `Failed to set key ${key} in backing store`,
                      cause
                    })
                )
              } catch (cause) {
                return Effect.fail(
                  new PersistenceError({
                    message: `Failed to serialize value for key ${key} to backing store`,
                    cause
                  })
                )
              }
            }),
          setMany: (entries) =>
            Effect.forEach(entries, ([key, value, ttl]) => {
              const expires = unsafeTtlToExpires(clock, ttl)
              const encoded = JSON.stringify([value, expires])
              return store.set(key, encoded)
            }, { concurrency: "unbounded", discard: true }).pipe(
              Effect.mapError((cause) =>
                new PersistenceError({
                  message: `Failed to setMany in backing store`,
                  cause
                })
              )
            ),
          remove: (key) =>
            Effect.mapError(
              store.remove(key),
              (cause) => new PersistenceError({ message: `Failed to remove key ${key} from backing store`, cause })
            ),
          clear: Effect.mapError(store.clear, (cause) =>
            new PersistenceError({ message: `Failed to clear backing store`, cause }))
        })
      })
  })
}))

/**
 * Provides `Persistence` backed by the current `KeyValueStore`.
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const layerKvs: Layer.Layer<Persistence, never, KeyValueStore.KeyValueStore> = layer.pipe(
  Layer.provide(layerBackingKvs)
)

/**
 * Provides `Persistence` backed by process-local in-memory storage.
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const layerMemory: Layer.Layer<Persistence> = layer.pipe(
  Layer.provide(layerBackingMemory)
)

/**
 * Provides `Persistence` backed by the current `Redis` service.
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const layerRedis: Layer.Layer<Persistence, never, Redis.Redis> = layer.pipe(
  Layer.provide(layerBackingRedis)
)

/**
 * Provides `Persistence` backed by SQL with one table per store id.
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const layerSqlMultiTable: Layer.Layer<Persistence, never, SqlClient.SqlClient> = layer.pipe(
  Layer.provide(layerBackingSqlMultiTable)
)

/**
 * Provides `Persistence` backed by SQL using a shared persistence table.
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const layerSql: Layer.Layer<Persistence, never, SqlClient.SqlClient> = layer.pipe(
  Layer.provide(layerBackingSql)
)

/**
 * Converts a TTL to an absolute expiration timestamp in milliseconds.
 *
 * **Details**
 *
 * Returns `null` for no TTL and uses `clock.currentTimeMillisUnsafe`, so it is
 * intended for backing-store internals.
 *
 * @stability unstable
 * @category converting
 * @since 4.0.0
 */
export const unsafeTtlToExpires = (clock: Clock.Clock, ttl: Duration.Duration | undefined): number | null =>
  ttl ? clock.currentTimeMillisUnsafe() + Duration.toMillis(ttl) : null
