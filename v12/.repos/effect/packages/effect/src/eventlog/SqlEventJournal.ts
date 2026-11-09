/**
 * SQL-backed event journal with per-remote upload checkpoints.
 *
 * @stability unstable
 * @since 4.0.0
 */
import * as Arr from "../Array.ts"
import * as Clock from "../Clock.ts"
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
import { type ConflictGroup, ConflictIndex } from "./internal/conflicts.ts"

type WriteFromRemoteOptions = Parameters<EventJournal.EventJournal["Service"]["writeFromRemote"]>[0]

/**
 * Creates an `EventJournal` backed by a SQL database.
 *
 * **Details**
 *
 * Maintains `entryTable`, `${entryTable}_sequence`, `${entryTable}_sources`,
 * `${remotesTable}_checkpoints` and `remoteCursorsTable` (default
 * `${remotesTable}_cursors`) using the configured `SqlClient`.
 *
 * **Gotchas**
 *
 * Creating or migrating the schema requires a writable connection. Migrated
 * databases can be reopened read-only.
 *
 * Journals from earlier releases keep one `remotesTable` row per entry per
 * remote. Opening one replaces those rows with entry sources and drops the
 * table; an entry known to several remotes keeps one of them as its source.
 *
 * Upload acknowledgements do not advance past unseen entries.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const make = (options?: {
  readonly entryTable?: string
  readonly remotesTable?: string
  readonly remoteCursorsTable?: string
}): Effect.Effect<
  EventJournal.EventJournal["Service"],
  SqlError.SqlError,
  SqlClient.SqlClient
> =>
  Effect.gen(function*() {
    const sql = (yield* SqlClient.SqlClient).withoutTransforms()

    const entryTable = options?.entryTable ?? "effect_event_journal"
    const remotesTable = options?.remotesTable ?? "effect_event_remotes"
    const remoteCursorsTable = options?.remoteCursorsTable ?? `${remotesTable}_cursors`

    const sequenceTable = `${entryTable}_sequence`
    const sourcesTable = `${entryTable}_sources`
    const checkpointsTable = `${remotesTable}_checkpoints`

    const entryTableSql = sql(entryTable)
    const remotesTableSql = sql(remotesTable)
    const sequenceTableSql = sql(sequenceTable)
    const sourcesTableSql = sql(sourcesTable)
    const checkpointsTableSql = sql(checkpointsTable)
    const remoteCursorsTableSql = sql(remoteCursorsTable)

    // to_regclass folds unquoted names to lowercase, so pass the quoted identifier.
    const quoted = (table: string) => sql`${sql(table)}`.compile(true)[0]

    const tableExists = (table: string) =>
      sql.onDialectOrElse({
        // Reading the catalog refreshes cached names after concurrent DDL.
        pg: () => sql`SELECT 1 AS found FROM pg_class WHERE oid = to_regclass(${quoted(table)})`,
        mysql: () =>
          sql`SELECT 1 AS found FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ${table}`,
        mssql: () => sql`SELECT 1 AS found WHERE OBJECT_ID(${table}, 'U') IS NOT NULL`,
        orElse: () => sql`SELECT 1 AS found FROM sqlite_master WHERE type = 'table' AND name = ${table}`
      }).pipe(Effect.map((rows) => rows.length > 0))

    const createSchema = Effect.gen(function*() {
      const eventIndex = sql(`${entryTable}_event_idx`)
      const timestampIndex = sql(`${entryTable}_timestamp_idx`)

      yield* sql.onDialectOrElse({
        pg: () =>
          sql`
            CREATE TABLE IF NOT EXISTS ${entryTableSql} (
              id BYTEA PRIMARY KEY,
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
      })

      // Insertion sequences let uploads include older entries imported later.
      yield* sql.onDialectOrElse({
        pg: () =>
          sql`
            CREATE TABLE IF NOT EXISTS ${sequenceTableSql} (
              sequence BIGSERIAL PRIMARY KEY,
              entry_id BYTEA NOT NULL UNIQUE
            )`,
        mysql: () =>
          sql`
            CREATE TABLE IF NOT EXISTS ${sequenceTableSql} (
              sequence BIGINT AUTO_INCREMENT PRIMARY KEY,
              entry_id BINARY(16) NOT NULL UNIQUE
            )`,
        mssql: () =>
          sql`
            CREATE TABLE ${sequenceTableSql} (
              sequence BIGINT IDENTITY(1,1) PRIMARY KEY,
              entry_id UNIQUEIDENTIFIER NOT NULL UNIQUE
            )`,
        orElse: () =>
          sql`
            CREATE TABLE IF NOT EXISTS ${sequenceTableSql} (
              sequence INTEGER PRIMARY KEY,
              entry_id BLOB NOT NULL UNIQUE
            )`
      })

      yield* sql.onDialectOrElse({
        pg: () =>
          sql`
            CREATE TABLE IF NOT EXISTS ${checkpointsTableSql} (
              remote_id BYTEA PRIMARY KEY,
              sequence BIGINT NOT NULL
            )`,
        mysql: () =>
          sql`
            CREATE TABLE IF NOT EXISTS ${checkpointsTableSql} (
              remote_id BINARY(16) PRIMARY KEY,
              sequence BIGINT NOT NULL
            )`,
        mssql: () =>
          sql`
            CREATE TABLE ${checkpointsTableSql} (
              remote_id UNIQUEIDENTIFIER PRIMARY KEY,
              sequence BIGINT NOT NULL
            )`,
        orElse: () =>
          sql`
            CREATE TABLE IF NOT EXISTS ${checkpointsTableSql} (
              remote_id BLOB PRIMARY KEY,
              sequence INTEGER NOT NULL
            )`
      })

      yield* sql.onDialectOrElse({
        pg: () =>
          sql`
            CREATE TABLE IF NOT EXISTS ${remoteCursorsTableSql} (
              remote_id BYTEA PRIMARY KEY,
              next_sequence INT NOT NULL
            )`,
        mysql: () =>
          sql`
            CREATE TABLE IF NOT EXISTS ${remoteCursorsTableSql} (
              remote_id BINARY(16) PRIMARY KEY,
              next_sequence INT NOT NULL
            )`,
        mssql: () =>
          sql`
            CREATE TABLE ${remoteCursorsTableSql} (
              remote_id UNIQUEIDENTIFIER PRIMARY KEY,
              next_sequence INT NOT NULL
            )`,
        orElse: () =>
          sql`
            CREATE TABLE IF NOT EXISTS ${remoteCursorsTableSql} (
              remote_id BLOB PRIMARY KEY,
              next_sequence INT NOT NULL
            )`
      })

      // The remote each imported entry came from, so uploads skip it.
      yield* sql.onDialectOrElse({
        pg: () =>
          sql`
            CREATE TABLE IF NOT EXISTS ${sourcesTableSql} (
              entry_id BYTEA PRIMARY KEY,
              remote_id BYTEA NOT NULL
            )`,
        mysql: () =>
          sql`
            CREATE TABLE IF NOT EXISTS ${sourcesTableSql} (
              entry_id BINARY(16) PRIMARY KEY,
              remote_id BINARY(16) NOT NULL
            )`,
        mssql: () =>
          sql`
            CREATE TABLE ${sourcesTableSql} (
              entry_id UNIQUEIDENTIFIER PRIMARY KEY,
              remote_id UNIQUEIDENTIFIER NOT NULL
            )`,
        orElse: () =>
          sql`
            CREATE TABLE IF NOT EXISTS ${sourcesTableSql} (
              entry_id BLOB PRIMARY KEY,
              remote_id BLOB NOT NULL
            )`
      })

      yield* sql.onDialectOrElse({
        // MySQL indexes TEXT columns by prefix only.
        mysql: () =>
          Effect.andThen(
            sql`CREATE INDEX ${eventIndex} ON ${entryTableSql} (event(191), primary_key(191), timestamp)`,
            sql`CREATE INDEX ${timestampIndex} ON ${entryTableSql} (timestamp)`
          ),
        // B-tree entries are limited to about 2.7 KB, so index hashes of the
        // unbounded columns.
        pg: () =>
          Effect.andThen(
            sql`CREATE INDEX IF NOT EXISTS ${eventIndex} ON ${entryTableSql} (md5(event), md5(primary_key), timestamp)`,
            sql`CREATE INDEX IF NOT EXISTS ${timestampIndex} ON ${entryTableSql} (timestamp)`
          ),
        // NVARCHAR(MAX) columns cannot be index keys.
        mssql: () => sql`CREATE INDEX ${timestampIndex} ON ${entryTableSql} (timestamp)`,
        orElse: () =>
          Effect.andThen(
            sql`CREATE INDEX IF NOT EXISTS ${eventIndex} ON ${entryTableSql} (event, primary_key, timestamp)`,
            sql`CREATE INDEX IF NOT EXISTS ${timestampIndex} ON ${entryTableSql} (timestamp)`
          )
      })

      // Number existing entries in creation order. `WHERE true` keeps SQLite
      // from parsing ON CONFLICT as a join constraint.
      yield* sql`
        INSERT INTO ${sequenceTableSql} (entry_id)
        SELECT id FROM ${entryTableSql} WHERE true ORDER BY timestamp ASC, id ASC
        ON CONFLICT DO NOTHING
      `
    })

    // Earlier releases kept a remotes row per entry per remote. An entry known
    // to several remotes keeps one of them as its source, and a remote without
    // a cursor resumes after its highest downloaded sequence.
    const importRemotes = Effect.gen(function*() {
      yield* sql`
        INSERT INTO ${sourcesTableSql} (entry_id, remote_id)
        SELECT entry_id, remote_id FROM ${remotesTableSql} WHERE true
        ON CONFLICT DO NOTHING
      `
      yield* sql`
        INSERT INTO ${remoteCursorsTableSql} (remote_id, next_sequence)
        SELECT remote_id, MAX(sequence) + 1 FROM ${remotesTableSql} GROUP BY remote_id
        ON CONFLICT DO NOTHING
      `
      yield* sql`DROP TABLE ${remotesTableSql}`
    })

    // Both steps run in one transaction, so a complete schema has the sources
    // table and no remotes table. Checking that first lets complete databases
    // open read-only; PostgreSQL also locks and rechecks so concurrent opens
    // migrate once.
    const schemaState = Effect.all({ sources: tableExists(sourcesTable), remotes: tableExists(remotesTable) })
    const isComplete = (state: { readonly sources: boolean; readonly remotes: boolean }) =>
      state.sources && !state.remotes
    yield* Effect.gen(function*() {
      if (isComplete(yield* schemaState)) return
      yield* Effect.gen(function*() {
        yield* sql.onDialectOrElse({
          pg: () => sql`SELECT pg_advisory_xact_lock(hashtext(${quoted(entryTable)}))`,
          orElse: () => Effect.void
        })
        const state = yield* schemaState
        if (!state.sources) yield* createSchema
        if (state.remotes) yield* importRemotes
      }).pipe(sql.withTransaction)
    }).pipe(withTracerDisabled)

    const decodeEntryRows = Schema.decodeUnknownEffect(EntryRowArray)
    const decodeEntryIdRows = Schema.decodeUnknownEffect(EntryIdRowArray)
    const toEntries = (rows: ReadonlyArray<EntryRow>): ReadonlyArray<EventJournal.Entry> => rows.map(toEntry)
    // Sort timestamp ties by id bytes consistently across dialects.
    const toOrderedEntries = (rows: ReadonlyArray<EntryRow>): ReadonlyArray<EventJournal.Entry> =>
      rows.map(toEntry).sort(EventJournal.Entry.Order)

    const insertEntries = SqlSchema.void({
      Request: EntryRowArray,
      execute: (entries) =>
        forEachChunk(
          entries,
          entryColumns,
          (chunk) => sql`INSERT INTO ${entryTableSql} ${sql.insert(chunk)} ON CONFLICT DO NOTHING`
        )
    })
    const insertSources = (entries: ReadonlyArray<EventJournal.Entry>, remoteId: EventJournal.RemoteId) =>
      forEachChunk(entries, 2, (chunk) => {
        const rows = Arr.map(chunk, (entry) => ({ entry_id: entry.id, remote_id: remoteId }))
        return sql`INSERT INTO ${sourcesTableSql} ${sql.insert(rows)} ON CONFLICT DO NOTHING`
      })
    // Serialize writers so checkpoints cannot skip out-of-order commits.
    // Lock before callbacks in both paths to avoid projection-row deadlocks.
    const lockWriters = sql.onDialectOrElse({
      pg: () => Effect.asVoid(sql`LOCK TABLE ${sequenceTableSql} IN SHARE ROW EXCLUSIVE MODE`),
      orElse: () => Effect.void
    })
    const insertSequence = (entries: ReadonlyArray<EventJournal.Entry>) =>
      forEachChunk(entries, 1, (chunk) => {
        const rows = Arr.map(chunk, (entry) => ({ entry_id: entry.id }))
        return sql`INSERT INTO ${sequenceTableSql} ${sql.insert(rows)} ON CONFLICT DO NOTHING`
      })

    const decodeCursorRows = Schema.decodeUnknownEffect(CursorRowArray)

    const readCursor = (remoteId: EventJournal.RemoteId) =>
      sql`SELECT next_sequence FROM ${remoteCursorsTableSql} WHERE remote_id = ${remoteId}`.pipe(
        Effect.flatMap(decodeCursorRows),
        Effect.map((rows) => rows.length > 0 ? rows[0].next_sequence : 0)
      )

    // Cursors only move forward.
    const writeCursor = (remoteId: EventJournal.RemoteId, next: number) =>
      sql`
        INSERT INTO ${remoteCursorsTableSql} ${sql.insert({ remote_id: remoteId, next_sequence: next })}
        ON CONFLICT (remote_id) DO UPDATE SET next_sequence = excluded.next_sequence
        WHERE ${remoteCursorsTableSql}.next_sequence < excluded.next_sequence
      `

    const pubsub = yield* PubSub.unbounded<EventJournal.Entry>()
    const clock = yield* Clock.Clock

    const writeFromRemote = Effect.fnUntraced(function*(options: WriteFromRemoteOptions): Effect.fn.Return<
      {
        readonly duplicateEntries: ReadonlyArray<EventJournal.Entry>
      },
      EventJournal.EventJournalError | Schema.SchemaError | SqlError.SqlError
    > {
      const entries = options.entries.map((remoteEntry) => remoteEntry.entry)

      yield* lockWriters

      const existingRows = yield* forEachChunk(
        entries,
        1,
        (chunk) => sql`SELECT id FROM ${entryTableSql} WHERE ${sql.in("id", chunk.map((entry) => entry.id))}`
      ).pipe(Effect.flatMap(decodeEntryIdRows))
      const existingIds = new Set(existingRows.map((row) => Uuid.stringify(row.id)))
      // Overlapping batches can repeat an entry; the first copy wins.
      const incomingIds = new Set<string>()
      const uncommitted = options.entries.filter((entry) => {
        const idString = entry.entry.idString
        if (existingIds.has(idString) || incomingIds.has(idString)) return false
        incomingIds.add(idString)
        return true
      })
      const duplicateEntries = options.entries
        .filter((entry) => existingIds.has(entry.entry.idString))
        .map((entry) => entry.entry)
      const compacted = options.compact
        ? yield* options.compact(uncommitted)
        : uncommitted.map((remoteEntry) => remoteEntry.entry)

      if (Arr.isReadonlyArrayNonEmpty(compacted)) {
        const index = new ConflictIndex(compacted)
        const conflicts = (groups: ReadonlyArray<ConflictGroup>) => {
          const events = Array.from(new Set(groups.map((group) => group.event)))
          const primaryKeys = Array.from(new Set(groups.map((group) => group.primaryKey)))
          return sql`SELECT * FROM ${entryTableSql} WHERE ${
            sql.and([
              // Match the hash index; exact predicates below rule out hash collisions.
              ...sql.onDialectOrElse({
                pg: () => [
                  sql`md5(event) IN (${sql.csv(events.map((event) => sql`md5(${event})`))})`,
                  sql`md5(primary_key) IN (${sql.csv(primaryKeys.map((primaryKey) => sql`md5(${primaryKey})`))})`
                ],
                orElse: () => []
              }),
              sql.in("event", events),
              sql.in("primary_key", primaryKeys),
              // A coarse filter: the index compares ids exactly.
              sql`timestamp >= ${index.oldestMillis}`
            ])
          }`
        }
        // Each group binds its event and key, twice on PostgreSQL, and one
        // parameter is left for the timestamp.
        const groupsPerChunk = Math.floor((maxParameters - 1) / sql.onDialectOrElse({ pg: () => 4, orElse: () => 2 }))
        const stored = yield* Effect.forEach(Arr.chunksOf(index.groups(), groupsPerChunk), conflicts).pipe(
          Effect.flatMap((rows) => decodeEntryRows(rows.flat())),
          Effect.map(toEntries)
        )
        // Chunks can share an event and a key, so a row can be returned twice.
        const added = new Set<string>()
        for (const entry of stored) {
          if (added.has(entry.idString)) continue
          added.add(entry.idString)
          index.add(entry)
        }
        yield* options.effect(index.toBatch())
      }

      // Keep the incoming batch out of conflict queries and persist only after
      // compaction and every callback have succeeded.
      if (uncommitted.length > 0) {
        const imported = uncommitted.map((remoteEntry) => remoteEntry.entry)
        yield* insertEntries(imported.map(toEntryRow))
        yield* insertSequence(imported)
        yield* insertSources(imported, options.remoteId)
      }
      // The change stream is ordered, so every earlier sequence is now known.
      if (options.entries.length > 0) {
        yield* writeCursor(options.remoteId, EventJournal.nextSequenceAfter(options.entries))
      }
      yield* EventJournal.warnIfAhead(clock, uncommitted.map((remoteEntry) => remoteEntry.entry.id))

      return {
        duplicateEntries
      }
    })

    // Other processes share the database but not the entry id sequence. Ids in
    // the latest millisecond are few, and comparing them here avoids ordering
    // id bytes in SQL.
    const latestEntryIds = sql`
      SELECT id FROM ${entryTableSql} WHERE timestamp = (SELECT MAX(timestamp) FROM ${entryTableSql})
    `.pipe(
      Effect.flatMap(decodeEntryIdRows),
      Effect.map((rows) => rows.map((row) => row.id))
    )

    const writeMany: EventJournal.EventJournal["Service"]["writeMany"] = ({ effect, entries }) =>
      Effect.uninterruptibleMask((restore) =>
        Effect.gen(function*() {
          yield* lockWriters
          // Rows visible here include an enclosing transaction's uncommitted
          // ones, which local ids must also sort after.
          const committed = yield* EventJournal.makeEntries(entries, yield* latestEntryIds)
          const result = yield* restore(effect(committed)).pipe(
            Effect.mapError((error) => new CallbackFailure(error))
          )
          yield* insertEntries(committed.map(toEntryRow))
          yield* insertSequence(committed)
          return { result, committed }
        }).pipe(
          sql.withTransaction,
          Effect.mapError((error) =>
            error instanceof CallbackFailure
              ? error.error
              : error instanceof EventJournal.EventJournalError
              ? error
              : new EventJournal.EventJournalError({ cause: error, method: "writeMany" })
          ),
          Effect.flatMap(({ committed, result }) => Effect.as(PubSub.publishAll(pubsub, committed), result))
        )
      ).pipe(withTracerDisabled)

    return EventJournal.EventJournal.of({
      entries: sql`SELECT * FROM ${entryTableSql} ORDER BY timestamp ASC`.pipe(
        withTracerDisabled,
        Effect.flatMap(decodeEntryRows),
        Effect.map(toOrderedEntries),
        Effect.mapError((cause) => new EventJournal.EventJournalError({ cause, method: "entries" }))
      ),
      entriesById: (ids) =>
        forEachChunk(ids, 1, (chunk) => sql`SELECT * FROM ${entryTableSql} WHERE ${sql.in("id", chunk)}`).pipe(
          withTracerDisabled,
          Effect.flatMap(decodeEntryRows),
          Effect.map((rows) => {
            const byId = new Map(toEntries(rows).map((entry) => [entry.idString, entry]))
            return ids.map((id) => byId.get(Uuid.stringify(id)))
          }),
          Effect.mapError((cause) => new EventJournal.EventJournalError({ cause, method: "entriesById" }))
        ),
      write: ({ effect, ...entry }) => writeMany({ entries: [entry], effect: (entries) => effect(entries[0]) }),
      writeMany,
      writeFromRemote: (options) =>
        writeFromRemote(options).pipe(
          sql.withTransaction,
          withTracerDisabled,
          Effect.catchIf(
            (e) => e._tag !== "EventJournalError",
            (cause) => Effect.fail(new EventJournal.EventJournalError({ cause, method: "writeFromRemote" }))
          )
        ),
      withRemoteUncommited: Effect.fnUntraced(
        function*(remoteId, f) {
          const mapError = Effect.mapError((cause: unknown) =>
            new EventJournal.EventJournalError({ cause, method: "withRemoteUncommited" })
          )
          // Capture an upper bound so entries committed during upload remain pending.
          const [{ checkpoint, latest }] = yield* sql`
            SELECT
              COALESCE((SELECT sequence FROM ${checkpointsTableSql} WHERE remote_id = ${remoteId}), 0) AS checkpoint,
              COALESCE((SELECT MAX(sequence) FROM ${sequenceTableSql}), 0) AS latest
          `.pipe(Effect.flatMap(decodeUploadBounds), mapError)
          if (latest <= checkpoint) return yield* Effect.succeedNone
          const entries = yield* sql`
            SELECT e.*
            FROM ${sequenceTableSql} s
            JOIN ${entryTableSql} e ON e.id = s.entry_id
            WHERE s.sequence > ${checkpoint} AND
                  s.sequence <= ${latest} AND
                  NOT EXISTS (
                    SELECT 1 FROM ${sourcesTableSql} src WHERE src.entry_id = s.entry_id AND src.remote_id = ${remoteId}
                  )
          `.pipe(
            Effect.flatMap(decodeEntryRows),
            Effect.map(toOrderedEntries),
            mapError
          )
          // Uploads can complete out of order; the checkpoint only moves forward.
          const saveCheckpoint = sql`
            INSERT INTO ${checkpointsTableSql} ${sql.insert({ remote_id: remoteId, sequence: latest })}
            ON CONFLICT (remote_id) DO UPDATE SET sequence = excluded.sequence
            WHERE ${checkpointsTableSql}.sequence < excluded.sequence
          `.pipe(mapError)
          return yield* Effect.uninterruptibleMask((restore) =>
            restore(Arr.isReadonlyArrayNonEmpty(entries) ? Effect.asSome(f(entries)) : Effect.succeedNone).pipe(
              Effect.tap(saveCheckpoint)
            )
          )
        },
        withTracerDisabled
      ),
      writeRemoteAcks: Effect.fnUntraced(
        function*({ acks, firstSequence, remoteId }) {
          if (acks.length === 0) return
          const next = yield* readCursor(remoteId)
          yield* writeCursor(remoteId, EventJournal.advanceSequence(next, acks, firstSequence))
        },
        (_) => sql.withTransaction(_),
        (_) => withTracerDisabled(_),
        Effect.mapError((cause) => new EventJournal.EventJournalError({ cause, method: "writeRemoteAcks" }))
      ),
      nextRemoteSequence: (remoteId) =>
        readCursor(remoteId).pipe(
          withTracerDisabled,
          Effect.mapError((cause) => new EventJournal.EventJournalError({ cause, method: "nextRemoteSequence" }))
        ),
      changes: PubSub.subscribe(pubsub),
      destroy: Effect.gen(function*() {
        yield* sql`DROP TABLE ${entryTableSql}`
        yield* sql`DROP TABLE ${sequenceTableSql}`
        yield* sql`DROP TABLE ${sourcesTableSql}`
        yield* sql`DROP TABLE ${checkpointsTableSql}`
        yield* sql`DROP TABLE ${remoteCursorsTableSql}`
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
 * Provides a SQL-backed `EventJournal` from an existing `SqlClient` service.
 *
 * **Gotchas**
 *
 * Creating or migrating the schema requires a writable connection.
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
  readonly remoteCursorsTable?: string
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

const EntryRow = Schema.Struct({
  id: SqlEntryId,
  event: Schema.String,
  primary_key: Schema.String,
  payload: SqlUint8Array,
  timestamp: SqlNatural
})

const EntryRowArray = Schema.Array(EntryRow)
const entryColumns = Object.keys(EntryRow.fields).length
const decodeUploadBounds = Schema.decodeUnknownEffect(Schema.Tuple([
  Schema.Struct({ checkpoint: SqlNatural, latest: SqlNatural })
]))
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

const CursorRowArray = Schema.Array(Schema.Struct({ next_sequence: SqlNatural }))

const withTracerDisabled = Effect.withTracerEnabled(false)

// Statements bind at most this many parameters: Cloudflare Durable Object
// SQLite's per-statement limit, the lowest of the supported databases.
const maxParameters = 100

// Runs `f` in order over chunks of `values`, each binding `parametersPerValue`
// parameters per value, and concatenates the rows.
const forEachChunk = <A, B, E, R>(
  values: ReadonlyArray<A>,
  parametersPerValue: number,
  f: (chunk: Arr.NonEmptyReadonlyArray<A>) => Effect.Effect<ReadonlyArray<B>, E, R>
): Effect.Effect<Array<B>, E, R> =>
  Effect.map(
    Effect.forEach(Arr.chunksOf(values, Math.floor(maxParameters / parametersPerValue)), f),
    (rows) => rows.flat()
  )

// Preserve callback errors without wrapping them as journal SQL errors.
class CallbackFailure<E> {
  readonly error: E
  constructor(error: E) {
    this.error = error
  }
}
