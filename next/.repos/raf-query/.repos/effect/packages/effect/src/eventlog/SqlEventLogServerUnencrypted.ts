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
import * as SqlClient from "../sql/SqlClient.ts"
import * as SqlError from "../sql/SqlError.ts"
import * as Stream from "../Stream.ts"
import { Entry, EntryId, makeRemoteIdUnsafe, RemoteEntry, type RemoteId } from "./EventJournal.ts"
import * as EventLogServerUnencrypted from "./EventLogServerUnencrypted.ts"

/**
 * Creates unencrypted event-log server `Storage` backed by SQL.
 *
 * **Details**
 *
 * The implementation creates tables for the server remote id, store sequences,
 * entries, and session authentication bindings, then persists and streams
 * plaintext remote entries.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const makeStorage = (options?: {
  readonly entryTablePrefix?: string
  readonly remoteIdTable?: string
  readonly insertBatchSize?: number
}): Effect.Effect<
  EventLogServerUnencrypted.Storage["Service"],
  SqlError.SqlError,
  SqlClient.SqlClient | Scope.Scope
> =>
  Effect.gen(function*() {
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
      entriesAfter: (storeId, entry) =>
        sql`
          SELECT sequence, entry_id, event, primary_key, payload
          FROM ${entriesTableSql}
          WHERE store_id = ${storeId} AND entry_id >= ${entry.id}
          ORDER BY sequence ASC
        `.pipe(
          Effect.flatMap(decodeRemoteEntries),
          Effect.map(Arr.map((r) => r.entry)),
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
            if (rowsForInsert.length >= insertBatchSize) {
              yield* sql`INSERT INTO ${entriesTableSql} ${sql.insert(rowsForInsert)}`
              rowsForInsert = []
            }
          }
          if (rowsForInsert.length > 0) {
            yield* sql`INSERT INTO ${entriesTableSql} ${sql.insert(rowsForInsert)}`
          }
          const nextSequence = currentNextSequence + entries.length
          yield* setNextSequence(storeId, nextSequence)

          const pubsub = yield* RcMap.get(pubsubs, storeId)
          yield* PubSub.publishAll(pubsub, committed)

          return committed
        },
        Effect.scoped,
        sql.withTransaction,
        withTracerDisabled,
        Effect.orDie
      ),
      changes: Effect.fnUntraced(
        function*({ storeId, startSequence, compactors }) {
          const pubsub = yield* RcMap.get(pubsubs, storeId)
          const subscription = yield* PubSub.subscribe(pubsub)
          const backlog = yield* EventLogServerUnencrypted.compactBacklog({
            compactors,
            remoteEntries: yield* selectEntriesAfter(storeId, startSequence)
          })
          let watermark = backlog.length > 0 ? backlog[backlog.length - 1]!.remoteSequence : startSequence - 1

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
        sql.withTransaction(effect).pipe(
          Effect.catchIf(SqlError.isSqlError, Effect.die)
        )
    })
  }).pipe(withTracerDisabled)

/**
 * Provides unencrypted server `Storage` using the SQL-backed implementation.
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const layerStorage = (options?: {
  readonly entryTablePrefix?: string
  readonly remoteIdTable?: string
  readonly insertBatchSize?: number
}): Layer.Layer<EventLogServerUnencrypted.Storage, SqlError.SqlError, SqlClient.SqlClient> =>
  Layer.effect(EventLogServerUnencrypted.Storage)(makeStorage(options))

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

const withTracerDisabled = Effect.withTracerEnabled(false)

const isConstraintConflict = (error: SqlError.SqlError): boolean =>
  error.reason._tag === "ConstraintError" || error.reason._tag === "UniqueViolation"
