/**
 * SQL-backed persistence for the unstable event-log journal.
 *
 * This module implements `EventJournal` on top of a `SqlClient`. It stores event
 * entries as encoded bytes and stores per-remote sequence metadata in separate
 * tables, giving event-log programs a durable journal that can be replayed after
 * restart and synchronized with remote journals.
 *
 * @stability unstable
 * @since 4.0.0
 */
import * as Arr from "../Array.ts"
import * as Effect from "../Effect.ts"
import * as Uuid from "../internal/uuid.ts"
import * as Layer from "../Layer.ts"
import * as PubSub from "../PubSub.ts"
import * as Schema from "../Schema.ts"
import * as SchemaTransformation from "../SchemaTransformation.ts"
import * as SqlClient from "../sql/SqlClient.ts"
import * as SqlError from "../sql/SqlError.ts"
import * as SqlSchema from "../sql/SqlSchema.ts"
import * as EventJournal from "./EventJournal.ts"

type WriteFromRemoteOptions = Parameters<EventJournal.EventJournal["Service"]["writeFromRemote"]>[0]

/**
 * Creates an `EventJournal` backed by a SQL database.
 *
 * **Details**
 *
 * The constructor creates the entry and remote metadata tables when needed,
 * persists local and remote entries, and uses the configured `SqlClient`.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const make = (options?: {
  readonly entryTable?: string
  readonly remotesTable?: string
}): Effect.Effect<
  EventJournal.EventJournal["Service"],
  SqlError.SqlError,
  SqlClient.SqlClient
> =>
  Effect.gen(function*() {
    const sql = (yield* SqlClient.SqlClient).withoutTransforms()

    const entryTable = options?.entryTable ?? "effect_event_journal"
    const remotesTable = options?.remotesTable ?? "effect_event_remotes"

    const entryTableSql = sql(entryTable)
    const remotesTableSql = sql(remotesTable)

    yield* sql.onDialectOrElse({
      pg: () =>
        sql`
          CREATE TABLE IF NOT EXISTS ${entryTableSql} (
            id UUID PRIMARY KEY,
            event TEXT NOT NULL,
            primary_key TEXT NOT NULL,
            payload BYTEA NOT NULL,
            timestamp BIGINT NOT NULL
          )`,
      mysql: () =>
        sql`
          CREATE TABLE IF NOT EXISTS ${entryTableSql} (
            id BINARY(16) PRIMARY KEY,
            event TEXT NOT NULL,
            primary_key TEXT NOT NULL,
            payload BLOB NOT NULL,
            timestamp BIGINT NOT NULL
          )`,
      mssql: () =>
        sql`
          CREATE TABLE IF NOT EXISTS ${entryTableSql} (
            id UNIQUEIDENTIFIER PRIMARY KEY,
            event NVARCHAR(MAX) NOT NULL,
            primary_key NVARCHAR(MAX) NOT NULL,
            payload VARBINARY(MAX) NOT NULL,
            timestamp BIGINT NOT NULL
          )`,
      orElse: () =>
        sql`
          CREATE TABLE IF NOT EXISTS ${entryTableSql} (
            id BLOB PRIMARY KEY,
            event TEXT NOT NULL,
            primary_key TEXT NOT NULL,
            payload BLOB NOT NULL,
            timestamp INTEGER NOT NULL
          )`
    }).pipe(withTracerDisabled)

    yield* sql.onDialectOrElse({
      pg: () =>
        sql`
          CREATE TABLE IF NOT EXISTS ${remotesTableSql} (
            remote_id UUID NOT NULL,
            entry_id UUID NOT NULL,
            sequence INT NOT NULL,
            PRIMARY KEY (remote_id, entry_id)
          )`,
      mysql: () =>
        sql`
          CREATE TABLE IF NOT EXISTS ${remotesTableSql} (
            remote_id BINARY(16) NOT NULL,
            entry_id BINARY(16) NOT NULL,
            sequence INT NOT NULL,
            PRIMARY KEY (remote_id, entry_id)
          )`,
      mssql: () =>
        sql`
          CREATE TABLE IF NOT EXISTS ${remotesTableSql} (
            remote_id UNIQUEIDENTIFIER NOT NULL,
            entry_id UNIQUEIDENTIFIER NOT NULL,
            sequence INT NOT NULL,
            PRIMARY KEY (remote_id, entry_id)
          )`,
      orElse: () =>
        sql`
          CREATE TABLE IF NOT EXISTS ${remotesTableSql} (
            remote_id BLOB NOT NULL,
            entry_id BLOB NOT NULL,
            sequence INT NOT NULL,
            PRIMARY KEY (remote_id, entry_id)
          )`
    }).pipe(withTracerDisabled)

    const decodeEntryRows = Schema.decodeUnknownEffect(EntryRowArray)
    const decodeEntryIdRows = Schema.decodeUnknownEffect(EntryIdRowArray)
    const toEntries = (rows: ReadonlyArray<EntryRow>): ReadonlyArray<EventJournal.Entry> => rows.map(toEntry)

    const insertEntry = SqlSchema.void({
      Request: EntryRow,
      execute: (entry) => sql`INSERT INTO ${entryTableSql} ${sql.insert(entry)} ON CONFLICT DO NOTHING`
    })
    const insertEntries = SqlSchema.void({
      Request: EntryRowArray,
      execute: (entries) => sql`INSERT INTO ${entryTableSql} ${sql.insert(entries)} ON CONFLICT DO NOTHING`
    })
    const insertRemotes = SqlSchema.void({
      Request: RemoteRowArray,
      execute: (entries) => sql`INSERT INTO ${remotesTableSql} ${sql.insert(entries)} ON CONFLICT DO NOTHING`
    })

    const pubsub = yield* PubSub.unbounded<EventJournal.Entry>()

    const writeFromRemote = Effect.fnUntraced(function*(options: WriteFromRemoteOptions): Effect.fn.Return<
      {
        readonly duplicateEntries: ReadonlyArray<EventJournal.Entry>
      },
      EventJournal.EventJournalError | Schema.SchemaError | SqlError.SqlError
    > {
      const entries = options.entries.map((remoteEntry) => remoteEntry.entry)
      const remoteRows = options.entries.map((remoteEntry) => ({
        remote_id: options.remoteId,
        entry_id: remoteEntry.entry.id,
        sequence: remoteEntry.remoteSequence
      }))

      const existingIds = new Set<string>()
      if (entries.length > 0) {
        yield* sql`SELECT id FROM ${entryTableSql} WHERE ${
          sql.in(
            "id",
            entries.map((entry) => entry.id)
          )
        }`.pipe(
          Effect.flatMap(decodeEntryIdRows),
          Effect.tap((rows) =>
            Effect.sync(() => {
              for (const row of rows) {
                existingIds.add(Uuid.stringify(row.id))
              }
            })
          )
        )
      }
      if (entries.length > 0) {
        yield* insertEntries(entries.map(toEntryRow))
      }
      if (remoteRows.length > 0) {
        yield* insertRemotes(remoteRows)
      }

      const uncommitted = options.entries.filter((entry) => !existingIds.has(entry.entry.idString))
      const duplicateEntries = options.entries
        .filter((entry) => existingIds.has(entry.entry.idString))
        .map((entry) => entry.entry)
      const compacted = options.compact
        ? yield* options.compact(uncommitted)
        : uncommitted.map((remoteEntry) => remoteEntry.entry)

      for (const entry of compacted) {
        const conflicts = yield* sql`
            SELECT *
            FROM ${entryTableSql}
            WHERE event = ${entry.event} AND
                  primary_key = ${entry.primaryKey} AND
                  timestamp >= ${entry.createdAtMillis}
            ORDER BY timestamp ASC
          `.pipe(
          Effect.flatMap(decodeEntryRows),
          Effect.map(toEntries)
        )
        yield* options.effect({ entry, conflicts })
      }

      return {
        duplicateEntries
      }
    })

    return EventJournal.EventJournal.of({
      entries: sql`SELECT * FROM ${entryTableSql} ORDER BY timestamp ASC`.pipe(
        withTracerDisabled,
        Effect.flatMap(decodeEntryRows),
        Effect.map(toEntries),
        Effect.mapError((cause) => new EventJournal.EventJournalError({ cause, method: "entries" }))
      ),
      write: Effect.fnUntraced(
        function*({ effect, event, payload, primaryKey }) {
          const entry = new EventJournal.Entry({
            id: EventJournal.makeEntryIdUnsafe(),
            event,
            primaryKey,
            payload
          }, { disableChecks: true })
          return yield* Effect.uninterruptibleMask((restore) =>
            restore(effect(entry)).pipe(
              Effect.tap(
                insertEntry(toEntryRow(entry)).pipe(
                  Effect.mapError((cause) => new EventJournal.EventJournalError({ cause, method: "write" }))
                )
              ),
              Effect.tap(PubSub.publish(pubsub, entry))
            )
          )
        },
        withTracerDisabled
      ),
      writeFromRemote: (options) =>
        writeFromRemote(options).pipe(
          withTracerDisabled,
          Effect.catchIf(
            (e) => e._tag !== "EventJournalError",
            (cause) => Effect.fail(new EventJournal.EventJournalError({ cause, method: "writeFromRemote" }))
          )
        ),
      withRemoteUncommited: Effect.fnUntraced(
        function*(remoteId, f) {
          const entries = yield* sql`
            SELECT *
            FROM ${entryTableSql}
            WHERE id NOT IN (SELECT entry_id FROM ${remotesTableSql} WHERE remote_id = ${remoteId})
            ORDER BY timestamp ASC
          `.pipe(
            Effect.flatMap(decodeEntryRows),
            Effect.map(toEntries),
            Effect.mapError((cause) => new EventJournal.EventJournalError({ cause, method: "withRemoteUncommited" }))
          )
          if (!Arr.isReadonlyArrayNonEmpty(entries)) return yield* Effect.succeedNone
          return yield* Effect.asSome(f(entries))
        },
        withTracerDisabled
      ),
      nextRemoteSequence: (remoteId) =>
        sql<{ max: number | null }>`SELECT MAX(sequence) AS max FROM ${remotesTableSql} WHERE remote_id = ${remoteId}`
          .pipe(
            Effect.map((rows) => {
              const value = rows[0]?.max
              if (value === null || value === undefined) return 0
              return Number(value) + 1
            }),
            withTracerDisabled,
            Effect.mapError((cause) => new EventJournal.EventJournalError({ cause, method: "nextRemoteSequence" }))
          ),
      changes: PubSub.subscribe(pubsub),
      destroy: Effect.gen(function*() {
        yield* sql`DROP TABLE ${entryTableSql}`
        yield* sql`DROP TABLE ${remotesTableSql}`
      }).pipe(
        withTracerDisabled,
        Effect.mapError((cause) => new EventJournal.EventJournalError({ cause, method: "destroy" }))
      ),
      withLock(_storeId) {
        return (effect) =>
          sql.withTransaction(effect).pipe(
            Effect.catchIf(SqlError.isSqlError, Effect.die)
          )
      }
    })
  })

/**
 * Provides `EventJournal` using the SQL-backed implementation created by
 * `make`.
 *
 * **When to use**
 *
 * Use when composing a Layer graph that should provide a persistent SQL-backed
 * `EventJournal` from an existing `SqlClient` service.
 *
 * **Details**
 *
 * The layer delegates to `make(options)`, so the same optional `entryTable` and
 * `remotesTable` settings are used and construction requires `SqlClient` and
 * may fail with `SqlError`.
 *
 * **Gotchas**
 *
 * Layer construction performs the same minimal `CREATE TABLE IF NOT EXISTS`
 * setup as `make`; manage indexes and schema migrations outside this layer when
 * your SQL schema needs more than the built-in tables.
 *
 * @see {@link make} for constructing the SQL-backed service directly
 * @see {@link EventJournal.layerMemory} for an in-memory `EventJournal` layer
 * @see {@link EventJournal.layerIndexedDb} for an IndexedDB-backed `EventJournal` layer
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const layer = (options?: {
  readonly entryTable?: string
  readonly remotesTable?: string
}): Layer.Layer<EventJournal.EventJournal, SqlError.SqlError, SqlClient.SqlClient> =>
  Layer.effect(EventJournal.EventJournal)(make(options))

const ArrayBuffer = Schema.instanceOf(globalThis.ArrayBuffer, {
  expected: "ArrayBuffer"
})

const SqlUint8Array = Schema.Union([Schema.Uint8Array, ArrayBuffer]).pipe(
  Schema.decodeTo(
    Schema.Uint8Array,
    SchemaTransformation.transform({
      decode: (value) => value instanceof globalThis.ArrayBuffer ? new globalThis.Uint8Array(value) : value,
      encode: (value) => value
    })
  )
)

const SqlEntryId = SqlUint8Array.pipe(Schema.decodeTo(EventJournal.EntryId))

const EntryRow = Schema.Struct({
  id: SqlEntryId,
  event: Schema.String,
  primary_key: Schema.String,
  payload: SqlUint8Array,
  timestamp: Schema.Int
})

const EntryRowArray = Schema.Array(EntryRow)
const EntryIdRowArray = Schema.Array(Schema.Struct({ id: SqlEntryId }))

type EntryRow = Schema.Schema.Type<typeof EntryRow>

const toEntry = (row: EntryRow): EventJournal.Entry =>
  new EventJournal.Entry({
    id: row.id,
    event: row.event,
    primaryKey: row.primary_key,
    payload: row.payload
  }, { disableChecks: true })

const toEntryRow = (entry: EventJournal.Entry): EntryRow => ({
  id: entry.id,
  event: entry.event,
  primary_key: entry.primaryKey,
  payload: entry.payload,
  timestamp: EventJournal.entryIdMillis(entry.id)
})

const RemoteRow = Schema.Struct({
  remote_id: EventJournal.RemoteId,
  entry_id: EventJournal.EntryId,
  sequence: Schema.Natural
})

const RemoteRowArray = Schema.Array(RemoteRow)

const withTracerDisabled = Effect.withTracerEnabled(false)
