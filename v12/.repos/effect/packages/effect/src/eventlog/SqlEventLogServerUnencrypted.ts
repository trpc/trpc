/**
 * SQL-backed storage for unencrypted event-log servers.
 *
 * This module provides the durable `Storage` implementation used by
 * `EventLogServerUnencrypted` when remote entries should be stored in a SQL
 * database and streamed back to clients by store sequence. It creates
 * dialect-specific tables for the server remote id, per-store sequence state,
 * plaintext entries, and session authentication bindings.
 *
 * @stability unstable
 * @since 4.0.0
 */
import * as Arr from "../Array.ts"
import * as Effect from "../Effect.ts"
import * as Layer from "../Layer.ts"
import * as PubSub from "../PubSub.ts"
import * as RcMap from "../RcMap.ts"
import * as Schema from "../Schema.ts"
import * as SchemaTransformation from "../SchemaTransformation.ts"
import type * as Scope from "../Scope.ts"
import * as Semaphore from "../Semaphore.ts"
import * as SqlClient from "../sql/SqlClient.ts"
import * as SqlError from "../sql/SqlError.ts"
import * as Stream from "../Stream.ts"
import { Entry, EntryId, makeRemoteIdUnsafe, RemoteEntry, type RemoteId } from "./EventJournal.ts"
import * as EventLogServerUnencrypted from "./EventLogServerUnencrypted.ts"

const withTracerDisabled = Effect.withTracerEnabled(false)
// Keeps each history lookup within dialect parameter limits.
const lookupBatchSize = 200

type StorageOptions = {
  readonly entryTablePrefix?: string
  readonly remoteIdTable?: string
  readonly insertBatchSize?: number
}

/**
 * Creates unencrypted event-log server `Storage` backed by SQL.
 *
 * **Details**
 *
 * The implementation creates tables for the server remote id, store sequences,
 * entries, and session authentication bindings, then persists and streams
 * plaintext remote entries. Writes reach `changes` subscribers once the
 * outermost SQL transaction commits, including caller-owned transactions, and are
 * dropped if it rolls back.
 *
 * **Gotchas**
 *
 * Concurrent caller-owned transactions can publish writes out of sequence order.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const makeStorage = Effect.fnUntraced(function*(options?: StorageOptions): Effect.fn.Return<
  EventLogServerUnencrypted.Storage["Service"],
  SqlError.SqlError,
  SqlClient.SqlClient | Scope.Scope
> {
  const sql = (yield* SqlClient.SqlClient).withoutTransforms()

  const entriesTable = options?.entryTablePrefix ?? "effect_events"
  const remoteIdTable = options?.remoteIdTable ?? "effect_remote_id"
  const insertBatchSize = options?.insertBatchSize ?? 200
  const storesTable = `${entriesTable}_stores`
  const sessionAuthBindingsTable = `${entriesTable}_session_auth_bindings`

  const remoteIdTableSql = sql(remoteIdTable)
  const entriesTableSql = sql(entriesTable)
  const storesTableSql = sql(storesTable)
  const sessionAuthBindingsTableSql = sql(sessionAuthBindingsTable)

  yield* sql.onDialectOrElse({
    pg: () =>
      sql`
          CREATE TABLE IF NOT EXISTS ${remoteIdTableSql} (
            singleton INT PRIMARY KEY,
            remote_id BYTEA NOT NULL
          )`,
    mysql: () =>
      sql`
          CREATE TABLE IF NOT EXISTS ${remoteIdTableSql} (
            singleton INT PRIMARY KEY,
            remote_id BINARY(16) NOT NULL
          )`,
    mssql: () =>
      sql`
          CREATE TABLE IF NOT EXISTS ${remoteIdTableSql} (
            singleton INT PRIMARY KEY,
            remote_id VARBINARY(16) NOT NULL
          )`,
    orElse: () =>
      sql`
          CREATE TABLE IF NOT EXISTS ${remoteIdTableSql} (
            singleton INTEGER PRIMARY KEY,
            remote_id BLOB NOT NULL
          )`
  })

  yield* sql.onDialectOrElse({
    pg: () =>
      sql`
          CREATE TABLE IF NOT EXISTS ${entriesTableSql} (
            store_id TEXT NOT NULL,
            sequence BIGINT NOT NULL,
            entry_id BYTEA NOT NULL,
            event TEXT NOT NULL,
            primary_key TEXT NOT NULL,
            payload BYTEA NOT NULL,
            PRIMARY KEY (store_id, sequence),
            UNIQUE (store_id, entry_id)
          )`,
    mysql: () =>
      sql`
          CREATE TABLE IF NOT EXISTS ${entriesTableSql} (
            store_id VARCHAR(191) NOT NULL,
            sequence BIGINT NOT NULL,
            entry_id BINARY(16) NOT NULL,
            event TEXT NOT NULL,
            primary_key TEXT NOT NULL,
            payload BLOB NOT NULL,
            PRIMARY KEY (store_id, sequence),
            UNIQUE (store_id, entry_id)
          )`,
    mssql: () =>
      sql`
          CREATE TABLE IF NOT EXISTS ${entriesTableSql} (
            store_id NVARCHAR(191) NOT NULL,
            sequence BIGINT NOT NULL,
            entry_id VARBINARY(16) NOT NULL,
            event NVARCHAR(MAX) NOT NULL,
            primary_key NVARCHAR(MAX) NOT NULL,
            payload VARBINARY(MAX) NOT NULL,
            PRIMARY KEY (store_id, sequence),
            UNIQUE (store_id, entry_id)
          )`,
    orElse: () =>
      sql`
          CREATE TABLE IF NOT EXISTS ${entriesTableSql} (
            store_id TEXT NOT NULL,
            sequence INTEGER NOT NULL,
            entry_id BLOB NOT NULL,
            event TEXT NOT NULL,
            primary_key TEXT NOT NULL,
            payload BLOB NOT NULL,
            PRIMARY KEY (store_id, sequence),
            UNIQUE (store_id, entry_id)
          )`
  })

  // Serves the batch lookup in `entriesAfter`. Postgres indexes hashes to stay
  // under its B-tree row limit, MySQL indexes prefixes, and MSSQL has no
  // bounded index yet.
  const eventKeyIndex = `${entriesTable}_event_key_idx`
  yield* sql.onDialectOrElse({
    pg: () =>
      sql`
          CREATE INDEX IF NOT EXISTS ${sql(eventKeyIndex)}
          ON ${entriesTableSql} (store_id, hashtextextended(event, 0), hashtextextended(primary_key, 0), entry_id)
        `,
    mysql: () => {
      const indexExists = sql<{ readonly count: number }>`
          SELECT COUNT(*) AS count FROM information_schema.statistics
          WHERE table_schema = DATABASE()
            AND table_name = ${entriesTable}
            AND index_name = ${eventKeyIndex}
        `.pipe(
        Effect.map((rows) => Number(rows[0].count) > 0)
      )
      return sql`
          CREATE INDEX ${sql(eventKeyIndex)}
          ON ${entriesTableSql} (store_id, event(191), primary_key(191), entry_id)
        `.pipe(
        Effect.catch((error) => Effect.flatMap(indexExists, (exists) => exists ? Effect.void : Effect.fail(error)))
      )
    },
    mssql: () => Effect.void,
    orElse: () =>
      sql`
          CREATE INDEX IF NOT EXISTS ${sql(eventKeyIndex)}
          ON ${entriesTableSql} (store_id, event, primary_key, entry_id)
        `
  })

  yield* sql.onDialectOrElse({
    pg: () =>
      sql`
          CREATE TABLE IF NOT EXISTS ${storesTableSql} (
            store_id TEXT PRIMARY KEY,
            next_sequence BIGINT NOT NULL
          )`,
    mysql: () =>
      sql`
          CREATE TABLE IF NOT EXISTS ${storesTableSql} (
            store_id VARCHAR(191) PRIMARY KEY,
            next_sequence BIGINT NOT NULL
          )`,
    mssql: () =>
      sql`
          CREATE TABLE IF NOT EXISTS ${storesTableSql} (
            store_id NVARCHAR(191) PRIMARY KEY,
            next_sequence BIGINT NOT NULL
          )`,
    orElse: () =>
      sql`
          CREATE TABLE IF NOT EXISTS ${storesTableSql} (
            store_id TEXT PRIMARY KEY,
            next_sequence INTEGER NOT NULL
          )`
  })

  yield* sql.onDialectOrElse({
    pg: () =>
      sql`
          CREATE TABLE IF NOT EXISTS ${sessionAuthBindingsTableSql} (
            public_key TEXT PRIMARY KEY,
            signing_public_key BYTEA NOT NULL
          )`,
    mysql: () =>
      sql`
          CREATE TABLE IF NOT EXISTS ${sessionAuthBindingsTableSql} (
            public_key VARCHAR(191) PRIMARY KEY,
            signing_public_key BINARY(32) NOT NULL
          )`,
    mssql: () =>
      sql`
          CREATE TABLE IF NOT EXISTS ${sessionAuthBindingsTableSql} (
            public_key NVARCHAR(191) PRIMARY KEY,
            signing_public_key VARBINARY(32) NOT NULL
          )`,
    orElse: () =>
      sql`
          CREATE TABLE IF NOT EXISTS ${sessionAuthBindingsTableSql} (
            public_key TEXT PRIMARY KEY,
            signing_public_key BLOB NOT NULL
          )`
  })

  const selectRemoteId = sql<{ remote_id: Uint8Array }>`
      SELECT remote_id
      FROM ${remoteIdTableSql}
      WHERE singleton = 1
    `

  const remoteId = yield* selectRemoteId.pipe(
    Effect.flatMap((rows) => {
      const existing = rows[0]
      if (existing !== undefined) {
        return Effect.succeed(existing.remote_id as RemoteId)
      }

      const created = makeRemoteIdUnsafe()
      return sql`
          INSERT INTO ${remoteIdTableSql} (singleton, remote_id)
          VALUES (1, ${created})
        `.pipe(
        Effect.catchIf(
          isConstraintConflict,
          () => Effect.void
        ),
        Effect.andThen(selectRemoteId),
        Effect.map((rows) => rows[0]?.remote_id as RemoteId | undefined),
        Effect.map((persisted) => persisted ?? created)
      )
    })
  )

  const pubsubs = yield* RcMap.make({
    lookup: (_storeId: string) =>
      Effect.acquireRelease(
        PubSub.unbounded<RemoteEntry>(),
        PubSub.shutdown
      ),
    idleTimeToLive: "5 minutes"
  })

  const transactionSemaphore = yield* Semaphore.make(1)
  const publish = (storeId: string, entries: ReadonlyArray<RemoteEntry>) =>
    RcMap.get(pubsubs, storeId).pipe(
      Effect.flatMap((pubsub) => PubSub.publishAll(pubsub, entries)),
      Effect.asVoid,
      Effect.scoped
    )
  // Hold the permit through commit and publication to preserve commit order
  // for storage-owned transactions.
  const withTransaction = <A, E, R>(effect: Effect.Effect<A, E, R>): Effect.Effect<A, E | SqlError.SqlError, R> =>
    Effect.flatMap(
      Effect.serviceOption(sql.transactionService),
      (transaction) =>
        transaction._tag === "Some"
          ? sql.withTransaction(effect)
          : transactionSemaphore.withPermit(sql.withTransaction(effect))
    )

  const ensureStore = (storeId: string) =>
    sql.onDialectOrElse({
      pg: () =>
        sql`
            INSERT INTO ${storesTableSql} (store_id, next_sequence)
            VALUES (${storeId}, 1)
            ON CONFLICT (store_id) DO NOTHING
          `,
      mysql: () =>
        sql`
            INSERT INTO ${storesTableSql} (store_id, next_sequence)
            VALUES (${storeId}, 1)
            ON DUPLICATE KEY UPDATE store_id = store_id
          `,
      mssql: () =>
        sql`
            MERGE ${storesTableSql} WITH (HOLDLOCK) AS target
            USING (SELECT ${storeId} AS store_id, 1 AS next_sequence) AS source
              ON target.store_id = source.store_id
            WHEN NOT MATCHED THEN
              INSERT (store_id, next_sequence)
              VALUES (source.store_id, source.next_sequence);
          `,
      orElse: () =>
        sql`
            INSERT INTO ${storesTableSql} (store_id, next_sequence)
            VALUES (${storeId}, 1)
            ON CONFLICT DO NOTHING
          `
    })

  const lockStore = (storeId: string) =>
    sql.onDialectOrElse({
      pg: () =>
        sql`
            SELECT next_sequence
            FROM ${storesTableSql}
            WHERE store_id = ${storeId}
            FOR UPDATE
          `,
      mysql: () =>
        sql`
            SELECT next_sequence
            FROM ${storesTableSql}
            WHERE store_id = ${storeId}
            FOR UPDATE
          `,
      mssql: () =>
        sql`
            SELECT next_sequence
            FROM ${storesTableSql} WITH (UPDLOCK, HOLDLOCK)
            WHERE store_id = ${storeId}
          `,
      orElse: () =>
        sql`
            UPDATE ${storesTableSql}
            SET next_sequence = next_sequence
            WHERE store_id = ${storeId}
            RETURNING next_sequence
          `
    }).pipe(
      Effect.flatMap(decodeStoreSequence)
    )

  const setNextSequence = (storeId: string, nextSequence: number) =>
    sql`
        UPDATE ${storesTableSql}
        SET next_sequence = ${nextSequence}
        WHERE store_id = ${storeId}
      `

  const selectEntriesAfter = (storeId: string, startSequence: number) =>
    sql`
        SELECT sequence, entry_id, event, primary_key, payload
        FROM ${entriesTableSql}
        WHERE store_id = ${storeId} AND sequence >= ${startSequence}
        ORDER BY sequence ASC
      `.pipe(
      Effect.flatMap(decodeRemoteEntries)
    )

  // Postgres matches on the indexed hashes, then on the values to rule out
  // collisions.
  const matchesKey = sql.onDialectOrElse({
    pg: () => (event: string, primaryKeys: ReadonlyArray<string>) =>
      sql`
          hashtextextended(event, 0) = hashtextextended(${event}, 0) AND event = ${event}
          AND hashtextextended(primary_key, 0) IN (${
        sql.csv(primaryKeys.map((primaryKey) => sql`hashtextextended(${primaryKey}, 0)`))
      })
          AND ${sql.in("primary_key", primaryKeys)}
        `,
    orElse: () => (event: string, primaryKeys: ReadonlyArray<string>) =>
      sql`event = ${event} AND ${sql.in("primary_key", primaryKeys)}`
  })

  // One SELECT per index lookup, joined with UNION ALL: MySQL scans the whole
  // store for the equivalent OR.
  const selectChunkHistory = (storeId: string, oldest: Entry, entries: ReadonlyArray<Entry>) => {
    const primaryKeysByEvent = new Map<string, Set<string>>()
    for (const entry of entries) {
      const primaryKeys = primaryKeysByEvent.get(entry.event)
      if (primaryKeys === undefined) {
        primaryKeysByEvent.set(entry.event, new Set([entry.primaryKey]))
      } else {
        primaryKeys.add(entry.primaryKey)
      }
    }
    let statement = sql`
        SELECT sequence, entry_id, event, primary_key, payload
        FROM ${entriesTableSql}
        WHERE store_id = ${storeId} AND ${sql.in("entry_id", entries.map((entry) => entry.id))}
      `
    for (const [event, primaryKeys] of primaryKeysByEvent) {
      statement = sql`
          ${statement}
          UNION ALL
          SELECT sequence, entry_id, event, primary_key, payload
          FROM ${entriesTableSql}
          WHERE store_id = ${storeId}
            AND ${matchesKey(event, Array.from(primaryKeys))}
            AND entry_id >= ${oldest.id}
        `
    }
    return Effect.flatMap(statement, decodeRemoteEntries)
  }

  // Chunks and the UNION ALL branches can return the same row more than once.
  const selectBatchHistory = (storeId: string, oldest: Entry, batch: Arr.NonEmptyReadonlyArray<Entry>) =>
    Effect.forEach(
      Arr.chunksOf(batch, lookupBatchSize),
      (chunk) => selectChunkHistory(storeId, oldest, chunk)
    ).pipe(
      Effect.map((chunks) => {
        const bySequence = new Map<number, RemoteEntry>()
        for (const remoteEntry of chunks.flat()) {
          bySequence.set(remoteEntry.remoteSequence, remoteEntry)
        }
        return Array.from(bySequence.values()).sort((a, b) => a.remoteSequence - b.remoteSequence)
      })
    )

  const selectEntriesFrom = (storeId: string, entry: Entry) =>
    sql`
        SELECT sequence, entry_id, event, primary_key, payload
        FROM ${entriesTableSql}
        WHERE store_id = ${storeId} AND entry_id >= ${entry.id}
        ORDER BY sequence ASC
      `.pipe(
      Effect.flatMap(decodeRemoteEntries)
    )

  const getSessionAuthBinding = (publicKey: string) =>
    sql`
        SELECT public_key, signing_public_key
        FROM ${sessionAuthBindingsTableSql}
        WHERE public_key = ${publicKey}
      `.pipe(
      Effect.flatMap(decodeSessionAuthBindings),
      Effect.map((rows) => {
        const row = rows[0]
        return row === undefined ? undefined : row.signing_public_key as Uint8Array<ArrayBuffer>
      }),
      Effect.orDie
    )

  return EventLogServerUnencrypted.Storage.of({
    getId: Effect.succeed(remoteId),
    firstSequence: 1,
    getOrCreateSessionAuthBinding: Effect.fnUntraced(
      function*(publicKey, signingPublicKey) {
        const existing = yield* getSessionAuthBinding(publicKey)
        if (existing !== undefined) {
          return existing
        }
        return yield* sql`
            INSERT INTO ${sessionAuthBindingsTableSql} (public_key, signing_public_key)
            VALUES (${publicKey}, ${signingPublicKey})
          `.pipe(
          Effect.as(signingPublicKey)
        )
      },
      sql.withTransaction,
      Effect.orDie,
      withTracerDisabled
    ),
    entriesAfter: (storeId, entry, batch) =>
      (batch === undefined ? selectEntriesFrom(storeId, entry) : selectBatchHistory(storeId, entry, batch)).pipe(
        Effect.orDie,
        withTracerDisabled
      ),
    write: Effect.fnUntraced(
      function*(storeId, entries) {
        if (entries.length === 0) {
          return []
        }

        yield* ensureStore(storeId)
        const currentNextSequence = yield* lockStore(storeId)

        const committed: Array<RemoteEntry> = []
        let rowsForInsert: Array<{
          readonly store_id: string
          readonly sequence: number
          readonly entry_id: Uint8Array
          readonly event: string
          readonly primary_key: string
          readonly payload: Uint8Array
        }> = []

        for (let index = 0; index < entries.length; index++) {
          const entry = entries[index]
          const remoteSequence = currentNextSequence + index
          committed.push(
            new RemoteEntry({
              remoteSequence,
              entry
            }, { disableChecks: true })
          )
          rowsForInsert.push({
            store_id: storeId,
            sequence: remoteSequence,
            entry_id: entry.id,
            event: entry.event,
            primary_key: entry.primaryKey,
            payload: entry.payload
          })
          if (rowsForInsert.length >= insertBatchSize && Arr.isArrayNonEmpty(rowsForInsert)) {
            yield* sql`INSERT INTO ${entriesTableSql} ${sql.insert(rowsForInsert)}`
            rowsForInsert = []
          }
        }
        if (Arr.isArrayNonEmpty(rowsForInsert)) {
          yield* sql`INSERT INTO ${entriesTableSql} ${sql.insert(rowsForInsert)}`
        }
        const nextSequence = currentNextSequence + entries.length
        yield* setNextSequence(storeId, nextSequence)

        yield* sql.afterCommit(publish(storeId, committed))

        return committed
      },
      withTransaction,
      withTracerDisabled,
      Effect.orDie
    ),
    changes: Effect.fnUntraced(
      function*({ storeId, startSequence, compactors }) {
        const pubsub = yield* RcMap.get(pubsubs, storeId)
        const subscription = yield* PubSub.subscribe(pubsub)
        const remoteEntries = yield* selectEntriesAfter(storeId, startSequence)
        const backlog = yield* EventLogServerUnencrypted.compactBacklog({ compactors, remoteEntries })
        // Compaction can drop trailing entries, so skip live entries up to the
        // last uncompacted one.
        const watermark = remoteEntries.length > 0
          ? remoteEntries[remoteEntries.length - 1]!.remoteSequence
          : startSequence - 1

        return Stream.fromArray(backlog).pipe(
          Stream.concat(
            Stream.fromSubscription(subscription).pipe(
              Stream.filter((entry) => entry.remoteSequence > watermark)
            )
          )
        )
      },
      Effect.orDie,
      withTracerDisabled,
      Stream.unwrap
    ),
    withTransaction: (effect) =>
      withTransaction(effect).pipe(
        Effect.catchIf(SqlError.isSqlError, Effect.die)
      )
  })
}, (effect, _options?: StorageOptions) => withTracerDisabled(effect))

/**
 * Provides unencrypted server `Storage` using the SQL-backed implementation.
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const layerStorage = (options?: StorageOptions): Layer.Layer<
  EventLogServerUnencrypted.Storage,
  SqlError.SqlError,
  SqlClient.SqlClient
> => Layer.effect(EventLogServerUnencrypted.Storage)(makeStorage(options))

const EntrySql = Schema.Struct({
  entry_id: EntryId,
  event: Schema.String,
  primary_key: Schema.String,
  payload: Schema.Uint8Array
})

type EntrySql = Schema.Schema.Type<typeof EntrySql>

const SqlNatural = Schema.Union([
  Schema.Natural,
  Schema.FiniteFromString.check(Schema.isInt(), Schema.isGreaterThanOrEqualTo(0)),
  Schema.BigInt.pipe(
    Schema.decodeTo(
      Schema.Natural,
      SchemaTransformation.transform({
        decode: Number,
        encode: BigInt
      })
    )
  )
])

const RemoteEntrySql = Schema.Struct({
  ...EntrySql.fields,
  sequence: SqlNatural
})

type RemoteEntrySql = Schema.Schema.Type<typeof RemoteEntrySql>

const StoreSequenceSql = Schema.Struct({
  next_sequence: SqlNatural
})

const SessionAuthBindingSql = Schema.Struct({
  public_key: Schema.String,
  signing_public_key: Schema.Uint8Array
})

type SessionAuthBindingSql = Schema.Schema.Type<typeof SessionAuthBindingSql>

const decodeRemoteEntryRows = Schema.decodeUnknownEffect(Schema.mutable(Schema.Array(RemoteEntrySql)))
const decodeStoreSequenceRows = Schema.decodeUnknownEffect(Schema.Array(StoreSequenceSql))
const decodeSessionAuthBindingRows = Schema.decodeUnknownEffect(Schema.Array(SessionAuthBindingSql))

const toEntry = (row: EntrySql): Entry =>
  new Entry({
    id: row.entry_id,
    event: row.event,
    primaryKey: row.primary_key,
    payload: row.payload
  }, { disableChecks: true })

const toRemoteEntry = (row: RemoteEntrySql): RemoteEntry =>
  new RemoteEntry({
    remoteSequence: row.sequence,
    entry: toEntry(row)
  }, { disableChecks: true })

const decodeRemoteEntries = (
  rows: unknown
): Effect.Effect<Array<RemoteEntry>, Schema.SchemaError> =>
  decodeRemoteEntryRows(rows).pipe(
    Effect.map((rows) => rows.map(toRemoteEntry))
  )

const decodeStoreSequence = (rows: unknown): Effect.Effect<number, Schema.SchemaError> =>
  decodeStoreSequenceRows(rows).pipe(
    Effect.flatMap((rows) => {
      const row = rows[0]
      if (row === undefined) {
        return Effect.die("SqlEventLogServerUnencrypted missing store sequence row")
      }
      return Effect.succeed(row.next_sequence)
    })
  )

const decodeSessionAuthBindings = (
  rows: unknown
): Effect.Effect<ReadonlyArray<SessionAuthBindingSql>, Schema.SchemaError> => decodeSessionAuthBindingRows(rows)

const isConstraintConflict = (error: SqlError.SqlError): boolean =>
  error.reason._tag === "ConstraintError" || error.reason._tag === "UniqueViolation"
