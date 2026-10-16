/**
 * Stores encrypted event-log server state in SQL.
 *
 * This module provides the durable `Storage` implementation used by
 * `EventLogServerEncrypted` when entries should be stored without exposing
 * plaintext event data to the database. It persists the server remote id,
 * session authentication bindings, and encrypted entry tables, assigns stable
 * sequence numbers, and streams changes. Clients remain responsible for
 * encrypting writes and decrypting reads.
 *
 * @stability unstable
 * @since 4.0.0
 */
import * as Effect from "../Effect.ts"
import * as Layer from "../Layer.ts"
import * as PubSub from "../PubSub.ts"
import * as RcMap from "../RcMap.ts"
import * as Schema from "../Schema.ts"
import type * as Scope from "../Scope.ts"
import * as SqlClient from "../sql/SqlClient.ts"
import type * as SqlError from "../sql/SqlError.ts"
import * as Stream from "../Stream.ts"
import { EntryId, makeRemoteIdUnsafe, type RemoteId } from "./EventJournal.ts"
import * as EventLogEncryption from "./EventLogEncryption.ts"
import * as EventLogServerEncrypted from "./EventLogServerEncrypted.ts"

/**
 * Creates encrypted event-log server `Storage` backed by SQL.
 *
 * **Details**
 *
 * It persists the server remote id, session authentication bindings, and encrypted
 * entries in dialect-specific tables, creating per-identity/store entry tables as
 * needed.
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
  EventLogServerEncrypted.Storage["Service"],
  SqlError.SqlError,
  SqlClient.SqlClient | EventLogEncryption.EventLogEncryption | Scope.Scope
> =>
  Effect.gen(function*() {
    const encryptions = yield* EventLogEncryption.EventLogEncryption
    const sql = (yield* SqlClient.SqlClient).withoutTransforms()

    const tablePrefix = options?.entryTablePrefix ?? "effect_events"
    const remoteIdTable = options?.remoteIdTable ?? "effect_remote_id"
    const sessionAuthBindingsTable = `${tablePrefix}_session_auth_bindings`
    const insertBatchSize = options?.insertBatchSize ?? 200

    const remoteIdTableSql = sql(remoteIdTable)
    const sessionAuthBindingsTableSql = sql(sessionAuthBindingsTable)

    yield* sql.onDialectOrElse({
      pg: () =>
        sql`
          CREATE TABLE IF NOT EXISTS ${remoteIdTableSql} (
            remote_id BYTEA PRIMARY KEY
          )`,
      mysql: () =>
        sql`
          CREATE TABLE IF NOT EXISTS ${remoteIdTableSql} (
            remote_id BINARY(16) PRIMARY KEY
          )`,
      mssql: () =>
        sql`
          CREATE TABLE IF NOT EXISTS ${remoteIdTableSql} (
            remote_id VARBINARY(16) PRIMARY KEY
          )`,
      orElse: () =>
        sql`
          CREATE TABLE IF NOT EXISTS ${remoteIdTableSql} (
            remote_id BLOB PRIMARY KEY
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

    const remoteId = yield* sql<{ remote_id: Uint8Array }>`SELECT remote_id FROM ${remoteIdTableSql}`.pipe(
      Effect.flatMap((results) => {
        if (results.length > 0) {
          return Effect.succeed(results[0].remote_id as RemoteId)
        }
        const created = makeRemoteIdUnsafe()
        return Effect.as(
          sql`INSERT INTO ${remoteIdTableSql} (remote_id) VALUES (${created})`,
          created
        )
      })
    )

    const resources = yield* RcMap.make({
      lookup: Effect.fnUntraced(function*(scopeKey: string) {
        const scopeHash = (yield* encryptions.sha256String(new TextEncoder().encode(scopeKey))).slice(0, 16)
        const table = `${tablePrefix}_${scopeHash}`
        const tableSql = sql(table)

        yield* sql.onDialectOrElse({
          pg: () =>
            sql`
                CREATE TABLE IF NOT EXISTS ${tableSql} (
                  sequence SERIAL PRIMARY KEY,
                  iv BYTEA NOT NULL,
                  entry_id BYTEA UNIQUE NOT NULL,
                  encrypted_entry BYTEA NOT NULL
                )`,
          mysql: () =>
            sql`
                CREATE TABLE IF NOT EXISTS ${tableSql} (
                  sequence INT AUTO_INCREMENT PRIMARY KEY,
                  iv BINARY(12) NOT NULL,
                  entry_id BINARY(16) UNIQUE NOT NULL,
                  encrypted_entry BLOB NOT NULL
                )`,
          mssql: () =>
            sql`
                CREATE TABLE IF NOT EXISTS ${tableSql} (
                  sequence INT IDENTITY(1,1) PRIMARY KEY,
                  iv VARBINARY(12) NOT NULL,
                  entry_id VARBINARY(16) UNIQUE NOT NULL,
                  encrypted_entry VARBINARY(MAX) NOT NULL
                )`,
          orElse: () =>
            sql`
                CREATE TABLE IF NOT EXISTS ${tableSql} (
                  sequence INTEGER PRIMARY KEY AUTOINCREMENT,
                  iv BLOB NOT NULL,
                  entry_id BLOB UNIQUE NOT NULL,
                  encrypted_entry BLOB NOT NULL
                )`
        })

        const pubsub = yield* Effect.acquireRelease(
          PubSub.unbounded<EventLogEncryption.EncryptedRemoteEntry>(),
          PubSub.shutdown
        )
        return { pubsub, table } as const
      }, withTracerDisabled),
      idleTimeToLive: "5 minutes"
    })

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

    return EventLogServerEncrypted.Storage.of({
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
        withTracerDisabled,
        Effect.orDie
      ),
      write: Effect.fnUntraced(
        function*(publicKey, storeId, entries) {
          if (entries.length === 0) return []
          const scopeKey = makeEncryptedScopeKey(publicKey, storeId)
          const { pubsub, table } = yield* RcMap.get(resources, scopeKey)
          const forInsert: Array<{
            readonly ids: Array<EntryId>
            readonly entries: Array<{
              iv: Uint8Array
              entry_id: Uint8Array
              encrypted_entry: Uint8Array
            }>
          }> = [{ ids: [], entries: [] }]
          let currentBatch = forInsert[0]
          for (const entry of entries) {
            currentBatch.ids.push(entry.entryId)
            currentBatch.entries.push({
              iv: entry.iv,
              entry_id: entry.entryId,
              encrypted_entry: entry.encryptedEntry
            })
            if (currentBatch.entries.length === insertBatchSize) {
              currentBatch = { ids: [], entries: [] }
              forInsert.push(currentBatch)
            }
          }

          const allEntries: Array<EventLogEncryption.EncryptedRemoteEntry> = []
          for (const batch of forInsert) {
            if (batch.entries.length === 0) continue
            const encryptedEntries = yield* sql`
              INSERT INTO ${sql(table)} ${sql.insert(batch.entries)} ON CONFLICT DO NOTHING
            `.pipe(
              Effect.andThen(
                sql`SELECT * FROM ${sql(table)} WHERE ${sql.in("entry_id", batch.ids)} ORDER BY sequence ASC`
              ),
              Effect.flatMap(decodeEntries)
            )
            yield* PubSub.publishAll(pubsub, encryptedEntries)
            allEntries.push(...encryptedEntries)
          }
          return allEntries
        },
        Effect.orDie,
        Effect.scoped,
        withTracerDisabled
      ),
      changes: Effect.fnUntraced(
        function*(publicKey, storeId, startSequence) {
          const scopeKey = makeEncryptedScopeKey(publicKey, storeId)
          const { pubsub, table } = yield* RcMap.get(resources, scopeKey)
          const subscription = yield* PubSub.subscribe(pubsub)
          const initial = yield* sql`
            SELECT * FROM ${sql(table)} WHERE sequence >= ${startSequence} ORDER BY sequence ASC
          `.pipe(
            Effect.flatMap(decodeEntries)
          )
          return Stream.fromArray(initial).pipe(Stream.concat(Stream.fromSubscription(subscription)))
        },
        Effect.orDie,
        withTracerDisabled,
        Stream.unwrap
      )
    })
  }).pipe(withTracerDisabled)

const EncryptedRemoteEntrySql = Schema.Struct({
  sequence: Schema.Natural,
  iv: Schema.Uint8Array,
  entry_id: EntryId,
  encrypted_entry: Schema.Uint8Array
})

type EncryptedRemoteEntrySql = Schema.Schema.Type<typeof EncryptedRemoteEntrySql>

const SessionAuthBindingSql = Schema.Struct({
  public_key: Schema.String,
  signing_public_key: Schema.Uint8Array
})

type SessionAuthBindingSql = Schema.Schema.Type<typeof SessionAuthBindingSql>

const decodeEntryRows = Schema.decodeUnknownEffect(Schema.Array(EncryptedRemoteEntrySql))
const decodeSessionAuthBindingRows = Schema.decodeUnknownEffect(Schema.Array(SessionAuthBindingSql))

const toEncryptedRemoteEntry = (row: EncryptedRemoteEntrySql): EventLogEncryption.EncryptedRemoteEntry => ({
  sequence: row.sequence,
  iv: row.iv as Uint8Array<ArrayBuffer>,
  entryId: row.entry_id,
  encryptedEntry: row.encrypted_entry as Uint8Array<ArrayBuffer>
})

const decodeEntries = (
  rows: unknown
): Effect.Effect<ReadonlyArray<EventLogEncryption.EncryptedRemoteEntry>, Schema.SchemaError> =>
  decodeEntryRows(rows).pipe(Effect.map((entries) => entries.map(toEncryptedRemoteEntry)))

const decodeSessionAuthBindings = (
  rows: unknown
): Effect.Effect<ReadonlyArray<SessionAuthBindingSql>, Schema.SchemaError> => decodeSessionAuthBindingRows(rows)

/**
 * Provides encrypted server `Storage` using the SQL-backed implementation.
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const layerStorage = (options?: {
  readonly entryTablePrefix?: string
  readonly remoteIdTable?: string
  readonly insertBatchSize?: number
}): Layer.Layer<
  EventLogServerEncrypted.Storage,
  SqlError.SqlError,
  SqlClient.SqlClient | EventLogEncryption.EventLogEncryption
> => Layer.effect(EventLogServerEncrypted.Storage)(makeStorage(options))

/**
 * Provides SQL-backed encrypted server `Storage` and supplies the default Web
 * Crypto `EventLogEncryption` layer.
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const layerStorageSubtle = (options?: {
  readonly entryTablePrefix?: string
  readonly remoteIdTable?: string
  readonly insertBatchSize?: number
}): Layer.Layer<EventLogServerEncrypted.Storage, SqlError.SqlError, SqlClient.SqlClient> =>
  layerStorage(options).pipe(
    Layer.provide(EventLogEncryption.layerSubtle)
  )

const makeEncryptedScopeKey = (
  publicKey: string,
  storeId: string
): string => `${publicKey}/${storeId}`

const withTracerDisabled = Effect.withTracerEnabled(false)
