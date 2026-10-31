/**
 * Stores encrypted event-log server state in SQL.
 *
 * This module provides the durable `Storage` implementation used by
 * `EventLogServerEncrypted` when entries should be stored without exposing
 * plaintext event data to the database. It persists the server remote id,
 * session authentication bindings, and encrypted batch tables, assigns stable
 * sequence numbers, streams changes, and stores encrypted compaction snapshots.
 * Clients remain responsible for encrypting writes and decrypting reads.
 *
 * @stability unstable
 * @since 4.0.0
 */
import * as Arr from "../Array.ts"
import type { NonEmptyArray } from "../Array.ts"
import * as Cause from "../Cause.ts"
import * as Clock from "../Clock.ts"
import * as Digest from "../crypto/Digest.ts"
import * as SecureRandom from "../crypto/SecureRandom.ts"
import * as Duration from "../Duration.ts"
import * as Effect from "../Effect.ts"
import * as Layer from "../Layer.ts"
import * as Option from "../Option.ts"
import * as PubSub from "../PubSub.ts"
import * as RcMap from "../RcMap.ts"
import * as Schedule from "../Schedule.ts"
import * as Schema from "../Schema.ts"
import type * as Scope from "../Scope.ts"
import * as Semaphore from "../Semaphore.ts"
import * as SqlClient from "../sql/SqlClient.ts"
import * as SqlError from "../sql/SqlError.ts"
import type * as Statement from "../sql/Statement.ts"
import * as Stream from "../Stream.ts"
import { type EntryId, makeRemoteIdUnsafe, type RemoteId } from "./EventJournal.ts"
import type * as EventLogEncryption from "./EventLogEncryption.ts"
import type { StoreId, WriteAck } from "./EventLogMessage.ts"
import * as EventLogServerEncrypted from "./EventLogServerEncrypted.ts"
import {
  hourMillis,
  lagHour,
  logCommit,
  logNoOp,
  logRollback,
  maxSegments,
  positionsPerSegment
} from "./internal/compaction.ts"

/**
 * Creates encrypted event-log server `Storage` backed by SQL.
 *
 * **Details**
 *
 * It persists the server remote id, session authentication bindings, and encrypted
 * batches in dialect-specific tables, creating per-identity/store batch and entry
 * id tables as needed.
 *
 * The storage always provides `compaction`. Its tables are created on startup
 * and when a store is first opened. A sweep in the surrounding scope prunes
 * superseded generations every `sweepInterval`. Startup dies on invalid
 * compaction options (see `EventLogServerEncrypted.makeCompactionConfig`).
 *
 * **Gotchas**
 *
 * Storage does not retry sequence conflicts between competing instances.
 * `EventLog.runRemote` retries failed writes; direct `EventLogRemote.write`
 * callers must retry failures other than Forbidden themselves. Live notifications
 * are local to each storage instance; clients on other instances must reconnect
 * to read those writes.
 *
 * Inside a caller's transaction, `write` and `compaction.rollback` publish to
 * live readers after the outermost commit, and not at all if it rolls back.
 * Concurrent caller transactions may reach live readers out of sequence order.
 * `changes` always reads in committed order.
 *
 * Instances sharing a database should share compaction options. The instance
 * that writes a generation or stage fixes its prune time or expiry.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const makeStorage = (options?: {
  readonly entryTablePrefix?: string
  readonly remoteIdTable?: string
  readonly compaction?: EventLogServerEncrypted.CompactionOptions | undefined
}): Effect.Effect<
  EventLogServerEncrypted.Storage["Service"],
  SqlError.SqlError,
  SqlClient.SqlClient | Digest.Digest | Scope.Scope
> =>
  Effect.gen(function*() {
    const digest = yield* Digest.Digest
    const sql = (yield* SqlClient.SqlClient).withoutTransforms()
    const config = yield* EventLogServerEncrypted.makeCompactionConfig(options?.compaction)
    const graceMillis = Duration.toMillis(config.grace)
    const lagMillis = Duration.toMillis(config.lag)
    const stageTtlMillis = Duration.toMillis(config.stageTtl)
    const sweepIntervalMillis = Duration.toMillis(config.sweepInterval)

    const tablePrefix = options?.entryTablePrefix ?? "effect_events"
    const remoteIdTable = options?.remoteIdTable ?? "effect_remote_id"
    const sessionAuthBindingsTable = `${tablePrefix}_session_auth_bindings`

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
          IF OBJECT_ID(${remoteIdTable}, N'U') IS NULL
          CREATE TABLE ${remoteIdTableSql} (
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
          IF OBJECT_ID(${sessionAuthBindingsTable}, N'U') IS NULL
          CREATE TABLE ${sessionAuthBindingsTableSql} (
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

    const types = sql.onDialectOrElse({
      pg: () => ({ id: "TEXT", int: "INTEGER", bigint: "BIGINT", bytes: "BYTEA", entryId: "BYTEA", iv: "BYTEA" }),
      mysql: () => ({
        id: "VARCHAR(36)",
        int: "INT",
        bigint: "BIGINT",
        bytes: "LONGBLOB",
        entryId: "BINARY(16)",
        iv: "BINARY(12)"
      }),
      mssql: () => ({
        id: "NVARCHAR(36)",
        int: "INT",
        bigint: "BIGINT",
        bytes: "VARBINARY(MAX)",
        entryId: "VARBINARY(16)",
        iv: "VARBINARY(12)"
      }),
      orElse: () => ({ id: "TEXT", int: "INTEGER", bigint: "INTEGER", bytes: "BLOB", entryId: "BLOB", iv: "BLOB" })
    })
    // Two instances can open the same table at once, and PostgreSQL and SQL
    // Server can fail the loser of a concurrent create, so creation retries.
    const createTable = (name: string, columns: string, indexes: ReadonlyArray<string> = []) =>
      sql.onDialectOrElse({
        mysql: () => {
          const definitions = [columns, ...indexes.map((index) => `INDEX (${index})`)].join(", ")
          return Effect.asVoid(sql`CREATE TABLE IF NOT EXISTS ${sql(name)} (${sql.literal(definitions)})`)
        },
        mssql: () =>
          sql`IF OBJECT_ID(${name}, N'U') IS NULL CREATE TABLE ${sql(name)} (${sql.literal(columns)})`.pipe(
            Effect.andThen(Effect.forEach(indexes, (index, i) => {
              const indexName = `${name}_i${i}`
              return sql`
                IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = ${indexName} AND object_id = OBJECT_ID(${name}))
                CREATE INDEX ${sql(indexName)} ON ${sql(name)} (${sql.literal(index)})`
            }, { discard: true }))
          ),
        orElse: () =>
          sql`CREATE TABLE IF NOT EXISTS ${sql(name)} (${sql.literal(columns)})`.pipe(
            Effect.andThen(Effect.forEach(
              indexes,
              (index, i) =>
                sql`CREATE INDEX IF NOT EXISTS ${sql(`${name}_i${i}`)} ON ${sql(name)} (${sql.literal(index)})`,
              { discard: true }
            ))
          )
      }).pipe(Effect.retry({ times: 3 }))

    const storesTable = `${tablePrefix}_compaction_stores`
    const bucketsTable = `${tablePrefix}_compaction_buckets`
    const activationsTable = `${tablePrefix}_compaction_activations`
    const stagesTable = `${tablePrefix}_compaction_stages`
    const storesSql = sql(storesTable)
    const bucketsSql = sql(bucketsTable)
    const activationsSql = sql(activationsTable)
    const stagesSql = sql(stagesTable)

    // One row per store, keyed by the scope hash its tables are named after.
    // "Nothing" is 0 for the base, `pruned_through` and the lag head.
    yield* createTable(
      storesTable,
      `scope ${types.id} PRIMARY KEY,
      next_sequence ${types.int} NOT NULL,
      active_activation ${types.id} NOT NULL,
      active_batch_set ${types.id} NULL,
      base_sequence ${types.int} NOT NULL,
      active_kept_count ${types.int} NOT NULL,
      no_op_at ${types.int} NULL,
      no_op_count ${types.int} NOT NULL,
      open_stage ${types.id} NULL,
      next_sweep_at ${types.bigint} NULL,
      sweep_lease_until ${types.bigint} NULL,
      sweep_lease_owner ${types.id} NULL,
      pruned_through ${types.int} NOT NULL`,
      ["next_sweep_at"]
    )
    // The highest last sequence stored in each storage-time hour.
    yield* createTable(
      bucketsTable,
      `scope ${types.id} NOT NULL,
      bucket_hour ${types.bigint} NOT NULL,
      last_sequence ${types.int} NOT NULL,
      PRIMARY KEY (scope, bucket_hour)`
    )
    // A `batch_set` of null means the originals only. `prunable_at` is set when
    // the activation is superseded or withdrawn.
    yield* createTable(
      activationsTable,
      `id ${types.id} PRIMARY KEY,
      scope ${types.id} NOT NULL,
      ordinal ${types.int} NOT NULL,
      batch_set ${types.id} NULL,
      base_sequence ${types.int} NOT NULL,
      kept_count ${types.int} NULL,
      previous ${types.id} NULL,
      superseded_at ${types.bigint} NULL,
      prunable_at ${types.bigint} NULL,
      prune_started_at ${types.bigint} NULL`,
      ["scope, ordinal"]
    )
    // A stage's pending batch set is its own id. A committed stage's row is
    // deleted at commit. Other stages go from `open` to `closed`, and the
    // sweep deletes what they staged, then the row.
    yield* createTable(
      stagesTable,
      `id ${types.id} PRIMARY KEY,
      scope ${types.id} NOT NULL,
      state ${types.id} NOT NULL,
      pinned ${types.id} NOT NULL,
      through_sequence ${types.int} NOT NULL,
      expires_at ${types.bigint} NOT NULL`,
      ["scope, state", "state, expires_at"]
    )

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

    const scopeTables = (scope: string) => {
      const table = `${tablePrefix}_${scope}`
      return {
        tableSql: sql(table),
        idsTableSql: sql(`${table}_ids`),
        snapshotTableSql: sql(`${table}_snapshot`)
      }
    }
    type ScopeTables = ReturnType<typeof scopeTables>

    const ensureTables = Effect.fnUntraced(function*(scope: string, tables: ScopeTables) {
      const table = `${tablePrefix}_${scope}`
      const { idsTableSql, tableSql } = tables
      const indexSql = sql(`${table}_last_sequence`)

      yield* sql.onDialectOrElse({
        pg: () =>
          sql`
              CREATE TABLE IF NOT EXISTS ${tableSql} (
                sequence INTEGER PRIMARY KEY,
                last_sequence INTEGER NOT NULL,
                iv BYTEA NOT NULL,
                entry_ids BYTEA NOT NULL,
                encrypted_batch BYTEA NOT NULL
              )`.pipe(
            Effect.andThen(sql`CREATE INDEX IF NOT EXISTS ${indexSql} ON ${tableSql} (last_sequence)`),
            Effect.andThen(sql`
              CREATE TABLE IF NOT EXISTS ${idsTableSql} (
                entry_id BYTEA PRIMARY KEY,
                sequence INTEGER NOT NULL
              )`)
          ),
        mysql: () =>
          sql`
              CREATE TABLE IF NOT EXISTS ${tableSql} (
                sequence INT PRIMARY KEY,
                last_sequence INT NOT NULL,
                iv BINARY(12) NOT NULL,
                entry_ids LONGBLOB NOT NULL,
                encrypted_batch LONGBLOB NOT NULL,
                INDEX (last_sequence)
              )`.pipe(
            Effect.andThen(sql`
              CREATE TABLE IF NOT EXISTS ${idsTableSql} (
                entry_id BINARY(16) PRIMARY KEY,
                sequence INT NOT NULL
              )`)
          ),
        mssql: () =>
          sql`
              IF OBJECT_ID(${table}, N'U') IS NULL
              CREATE TABLE ${tableSql} (
                sequence INT PRIMARY KEY,
                last_sequence INT NOT NULL,
                iv VARBINARY(12) NOT NULL,
                entry_ids VARBINARY(MAX) NOT NULL,
                encrypted_batch VARBINARY(MAX) NOT NULL,
                INDEX ${indexSql} NONCLUSTERED (last_sequence)
              )`.pipe(
            Effect.andThen(sql`
              IF OBJECT_ID(${`${table}_ids`}, N'U') IS NULL
              CREATE TABLE ${idsTableSql} (
                entry_id VARBINARY(16) PRIMARY KEY,
                sequence INT NOT NULL
              )`)
          ),
        orElse: () =>
          sql`
              CREATE TABLE IF NOT EXISTS ${tableSql} (
                sequence INTEGER PRIMARY KEY,
                last_sequence INTEGER NOT NULL,
                iv BLOB NOT NULL,
                entry_ids BLOB NOT NULL,
                encrypted_batch BLOB NOT NULL
              )`.pipe(
            Effect.andThen(sql`CREATE INDEX IF NOT EXISTS ${indexSql} ON ${tableSql} (last_sequence)`),
            Effect.andThen(sql`
              CREATE TABLE IF NOT EXISTS ${idsTableSql} (
                entry_id BLOB PRIMARY KEY,
                sequence INTEGER NOT NULL
              )`)
          )
      }).pipe(Effect.retry({ times: 3 }))
      // Staged and committed snapshot batches. `sequence` and
      // `last_sequence` stay null until commit.
      yield* createTable(
        `${table}_snapshot`,
        `batch_set ${types.id} NOT NULL,
        batch_position ${types.bigint} NOT NULL,
        sequence ${types.int} NULL,
        last_sequence ${types.int} NULL,
        entry_count ${types.int} NOT NULL,
        iv ${types.iv} NOT NULL,
        entry_ids ${types.bytes} NOT NULL,
        encrypted_batch ${types.bytes} NOT NULL,
        PRIMARY KEY (batch_set, batch_position)`,
        ["batch_set, last_sequence"]
      )
      yield* ensureStore(scope, tables)
    })

    // Stores whose tables and row this instance has ensured, so a store
    // reopened after idling skips the DDL.
    const ensured = new Set<string>()
    const lookup = Effect.fnUntraced(function*(scopeKey: string) {
      const scope = (yield* digest.digestHex(Digest.sha256, new TextEncoder().encode(scopeKey))).slice(0, 16)
      const tables = scopeTables(scope)
      if (!ensured.has(scope)) {
        yield* ensureTables(scope, tables)
        ensured.add(scope)
      }

      const pubsub = yield* Effect.acquireRelease(
        PubSub.unbounded<EventLogEncryption.EncryptedRemoteBatch>(),
        PubSub.shutdown
      )
      const semaphore = yield* Semaphore.make(1)
      return { pubsub, semaphore, scope, ...tables } as const
    }, withTracerDisabled)
    type StoreResources = Effect.Success<ReturnType<typeof lookup>>
    const resources = yield* RcMap.make({ lookup, idleTimeToLive: "5 minutes" })

    // Statements that return rows the caller decodes.
    const query = (statement: Statement.Statement<unknown>) =>
      statement as unknown as Effect.Effect<ReadonlyArray<Record<string, unknown>>, SqlError.SqlError>

    // Inserts the rows whose `keys` are not stored yet, leaving stored rows as
    // they are, and returns how many were inserted. Every row has the same
    // columns, and SQL Server's MERGE needs them unique by key.
    const insertNew = (
      tableSql: Statement.Identifier,
      rows: Arr.NonEmptyReadonlyArray<Record<string, unknown>>,
      keys: ReadonlyArray<string>
    ) =>
      sql.onDialectOrElse({
        mysql: () =>
          sql`INSERT IGNORE INTO ${tableSql} ${sql.insert(rows)}`.raw.pipe(
            Effect.map((result) => (result as { affectedRows: number }).affectedRows)
          ),
        mssql: () => {
          const columns = Object.keys(rows[0])
          const values = sql.join(", ", false)(
            rows.map((row) => sql`(${sql.join(", ", false)(columns.map((column) => sql`${row[column]}`))})`)
          )
          return sql`
            MERGE ${tableSql} WITH (HOLDLOCK) AS target
            USING (VALUES ${values}) AS source (${sql.literal(columns.join(", "))})
            ON ${sql.literal(keys.map((key) => `target.${key} = source.${key}`).join(" AND "))}
            WHEN NOT MATCHED THEN
              INSERT (${sql.literal(columns.join(", "))})
              VALUES (${sql.literal(columns.map((column) => `source.${column}`).join(", "))})
            OUTPUT inserted.${sql.literal(keys[0])};
          `.pipe(Effect.map((inserted) => inserted.length))
        },
        orElse: () =>
          sql`INSERT INTO ${tableSql} ${sql.insert(rows)} ON CONFLICT DO NOTHING RETURNING ${sql(keys[0])}`.pipe(
            Effect.map((inserted) => inserted.length)
          )
      })

    const upsertBucket = (scope: string, hour: number, lastSequence: number) =>
      sql.onDialectOrElse({
        pg: () =>
          sql`
            INSERT INTO ${bucketsSql} (scope, bucket_hour, last_sequence) VALUES (${scope}, ${hour}, ${lastSequence})
            ON CONFLICT (scope, bucket_hour)
            DO UPDATE SET last_sequence = GREATEST(${bucketsSql}.last_sequence, EXCLUDED.last_sequence)`,
        mysql: () =>
          sql`
            INSERT INTO ${bucketsSql} (scope, bucket_hour, last_sequence) VALUES (${scope}, ${hour}, ${lastSequence})
            ON DUPLICATE KEY UPDATE last_sequence = GREATEST(last_sequence, VALUES(last_sequence))`,
        mssql: () =>
          sql`
            MERGE ${bucketsSql} WITH (HOLDLOCK) AS target
            USING (VALUES (${scope}, ${hour}, ${lastSequence})) AS source (scope, bucket_hour, last_sequence)
            ON target.scope = source.scope AND target.bucket_hour = source.bucket_hour
            WHEN MATCHED AND source.last_sequence > target.last_sequence THEN
              UPDATE SET last_sequence = source.last_sequence
            WHEN NOT MATCHED THEN
              INSERT (scope, bucket_hour, last_sequence)
              VALUES (source.scope, source.bucket_hour, source.last_sequence);`,
        orElse: () =>
          sql`
            INSERT INTO ${bucketsSql} (scope, bucket_hour, last_sequence) VALUES (${scope}, ${hour}, ${lastSequence})
            ON CONFLICT (scope, bucket_hour)
            DO UPDATE SET last_sequence = MAX(${bucketsSql}.last_sequence, excluded.last_sequence)`
      })

    const maxLastSequence = (tableSql: Statement.Identifier) =>
      Effect.map(
        query(sql`SELECT MAX(last_sequence) AS last_sequence FROM ${tableSql}`),
        ([row]) => Number(row?.last_sequence ?? 0)
      )

    // Creates the store row on first open. The first instance to insert it
    // also records the originals activation and seeds a bucket at the current
    // last sequence, so data written before the upgrade becomes compactable.
    const ensureStore = Effect.fnUntraced(function*(scope: string, tables: ScopeTables) {
      const existing = yield* query(sql`SELECT scope FROM ${storesSql} WHERE scope = ${scope}`)
      if (existing.length > 0) return
      const now = yield* Clock.currentTimeMillis
      yield* sql.withTransaction(Effect.gen(function*() {
        const lastSequence = yield* maxLastSequence(tables.tableSql)
        const originals = SecureRandom.uuidV4Unsafe()
        const inserted = yield* insertNew(storesSql, [{
          scope,
          next_sequence: lastSequence + 1,
          active_activation: originals,
          active_batch_set: null,
          base_sequence: 0,
          active_kept_count: 0,
          no_op_at: null,
          no_op_count: 0,
          open_stage: null,
          next_sweep_at: null,
          sweep_lease_until: null,
          sweep_lease_owner: null,
          pruned_through: 0
        }], ["scope"])
        if (inserted === 0) return
        yield* sql`INSERT INTO ${activationsSql} ${
          sql.insert({
            id: originals,
            scope,
            ordinal: 0,
            batch_set: null,
            base_sequence: 0,
            kept_count: null,
            previous: null,
            superseded_at: null,
            prunable_at: null,
            prune_started_at: null
          })
        }`
        if (lastSequence > 0) yield* upsertBucket(scope, Math.floor(now / hourMillis), lastSequence)
      }))
    })

    const storeColumns = sql.literal(
      "next_sequence, active_activation, active_batch_set, base_sequence, active_kept_count, no_op_at, " +
        "no_op_count, open_stage, next_sweep_at, sweep_lease_until, sweep_lease_owner, pruned_through"
    )
    const selectStore = (scope: string) =>
      Effect.map(
        query(sql`SELECT ${storeColumns} FROM ${storesSql} WHERE scope = ${scope}`),
        ([row]) => row === undefined ? undefined : toStoreRow(row)
      )
    // Row locks held for the rest of the transaction. SQLite transactions take
    // the database write lock instead.
    const lockHint = sql.onDialectOrElse({
      mssql: () => sql.literal("WITH (UPDLOCK, ROWLOCK, HOLDLOCK)"),
      orElse: () => sql.literal("")
    })
    const forUpdate = sql.onDialectOrElse({
      pg: () => sql.literal("FOR UPDATE"),
      mysql: () => sql.literal("FOR UPDATE"),
      orElse: () => sql.literal("")
    })
    const noClause = sql.literal("")
    // Locks the store row for the rest of the transaction. Lock order is store
    // row, then stage row, then snapshot rows.
    const lockStore = (scope: string) =>
      query(sql`SELECT ${storeColumns} FROM ${storesSql} ${lockHint} WHERE scope = ${scope} ${forUpdate}`).pipe(
        Effect.flatMap(([row]) =>
          row === undefined
            ? Effect.die(new Cause.NoSuchElementError(`No compaction store row for scope ${scope}`))
            : Effect.succeed(toStoreRow(row))
        )
      )

    const stageColumns = sql.literal("id, scope, state, pinned, through_sequence, expires_at")
    const selectStage = (scope: string, stageId: string, lock: boolean) =>
      query(sql`
        SELECT ${stageColumns} FROM ${stagesSql} ${lock ? lockHint : noClause}
        WHERE id = ${stageId} ${lock ? forUpdate : noClause}`).pipe(
        Effect.map(([row]) => {
          if (row === undefined) return undefined
          const stage = toStageRow(row)
          return stage.scope === scope ? stage : undefined
        })
      )

    const selectActivation = (id: string) =>
      Effect.map(
        query(sql`SELECT ${activationColumns} FROM ${activationsSql} WHERE id = ${id}`),
        ([row]) => row === undefined ? undefined : toActivationRow(row)
      )
    const selectActivations = (scope: string) =>
      Effect.map(
        query(sql`SELECT ${activationColumns} FROM ${activationsSql} WHERE scope = ${scope} ORDER BY ordinal`),
        (rows) => rows.map(toActivationRow)
      )
    const activationColumns = sql.literal(
      "id, ordinal, batch_set, base_sequence, kept_count, previous, superseded_at, prunable_at, prune_started_at"
    )

    const releaseClaim = (scope: string, stageId: string) =>
      sql`UPDATE ${storesSql} SET open_stage = NULL WHERE scope = ${scope} AND open_stage = ${stageId}`
    // Closes an open stage, leaving what it staged to the sweep, and releases
    // the store's busy claim.
    const closeStage = (scope: string, stageId: string) =>
      sql`UPDATE ${stagesSql} SET state = ${"closed"} WHERE id = ${stageId} AND state = ${"open"}`.pipe(
        Effect.andThen(releaseClaim(scope, stageId))
      )

    const scheduleSweep = (scope: string, at: number) =>
      sql`
        UPDATE ${storesSql}
        SET next_sweep_at = CASE WHEN next_sweep_at IS NULL OR next_sweep_at > ${at} THEN ${at} ELSE next_sweep_at END
        WHERE scope = ${scope}`

    // The clauses that cap a statement at `rows` rows, for `SELECT ${top} ... ${limit}`.
    const rowCap = (rows: number) => ({
      top: sql.onDialectOrElse({ mssql: () => sql.literal(`TOP (${rows})`), orElse: () => noClause }),
      limit: sql.onDialectOrElse({ mssql: () => noClause, orElse: () => sql.literal(`LIMIT ${rows}`) })
    })
    const { limit, top } = rowCap(pageSize)
    const { limit: chunkLimit, top: chunkTop } = rowCap(pruneChunkRows)
    // Streams rows in key order, one page per statement.
    const paged = <A>(
      first: number,
      page: (after: number) => Effect.Effect<ReadonlyArray<A>, SqlError.SqlError>,
      key: (row: A) => number
    ) =>
      Stream.paginate(first, (after) =>
        Effect.map(page(after), (rows) =>
          [
            rows,
            rows.length < pageSize ? Option.none<number>() : Option.some(key(rows[rows.length - 1]))
          ] as const))

    const setRows = (snapshotTableSql: Statement.Identifier, batchSet: string) =>
      paged(
        -1,
        (after) =>
          query(sql`
            SELECT ${top} batch_position, sequence, entry_ids FROM ${snapshotTableSql}
            WHERE batch_set = ${batchSet} AND batch_position > ${after}
            ORDER BY batch_position ${limit}`),
        (row) => Number(row.batch_position)
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

    // Runs `f` with the store's resources and the time, read before any
    // transaction starts. SQL failures are defects.
    const withStore = <A, E>(
      publicKey: string,
      storeId: StoreId,
      f: (store: StoreResources, now: number) => Effect.Effect<A, E | SqlError.SqlError>
    ): Effect.Effect<A, Exclude<E, SqlError.SqlError>> =>
      Effect.zip(RcMap.get(resources, makeEncryptedScopeKey(publicKey, storeId)), Clock.currentTimeMillis).pipe(
        Effect.flatMap(([store, now]) => f(store, now)),
        dieOnSqlError,
        Effect.scoped,
        withTracerDisabled
      )

    const notFound = (stageId: string) => Effect.fail(new EventLogServerEncrypted.CompactionNotFound({ stageId }))

    // An open stage whose pin isn't being pruned yet, for Input and Fetch.
    const findInputStage = Effect.fnUntraced(function*(scope: string, stageId: string, now: number) {
      const stage = yield* selectStage(scope, stageId, false)
      if (stage === undefined || stage.state !== "open" || stage.expiresAt <= now) return undefined
      const pinned = yield* selectActivation(stage.pinned)
      if (pinned === undefined || pinned.pruneStartedAt !== undefined) return undefined
      return { stage, pinned }
    })
    // Fails a read that may have been truncated by a prune of its pin.
    const recheckPin = (stageId: string, pinned: string) =>
      Effect.flatMap(
        selectActivation(pinned),
        (activation) =>
          activation === undefined || activation.pruneStartedAt !== undefined ? notFound(stageId) : Effect.void
      )

    const status = Effect.fnUntraced(function*({ scope, tableSql }: StoreResources, now: number) {
      const store = (yield* selectStore(scope))!
      const lastSequence = yield* maxLastSequence(tableSql)
      const [lag] = yield* query(sql`
        SELECT MAX(last_sequence) AS last_sequence FROM ${bucketsSql}
        WHERE scope = ${scope} AND bucket_hour <= ${lagHour(now, lagMillis)}`)
      return {
        head: Math.max(store.nextSequence - 1, lastSequence),
        base: store.base,
        activeKeptCount: store.activeKeptCount,
        lagHead: Number(lag?.last_sequence ?? 0),
        noOp: store.noOpAt === undefined ? undefined : { at: store.noOpAt, count: store.noOpCount }
      }
    })

    const begin = Effect.fnUntraced(function*({ scope }: StoreResources, now: number, through: number) {
      const store = yield* lockStore(scope)
      if (store.openStage !== undefined) {
        const open = yield* selectStage(scope, store.openStage, true)
        if (open !== undefined && open.state === "open") {
          if (open.expiresAt > now) {
            return { _tag: "Busy", expiresAt: open.expiresAt } as const
          }
          yield* closeStage(scope, open.id)
        }
      }
      const stageId = SecureRandom.uuidV4Unsafe()
      yield* sql`INSERT INTO ${stagesSql} ${
        sql.insert({
          id: stageId,
          scope,
          state: "open",
          pinned: store.activeActivation,
          through_sequence: through,
          expires_at: now + stageTtlMillis
        })
      }`
      yield* sql`UPDATE ${storesSql} SET open_stage = ${stageId} WHERE scope = ${scope}`
      return { _tag: "Started", stageId } as const
    }, sql.withTransaction)

    const inputHeaders = Effect.fnUntraced(function*(
      { scope, snapshotTableSql, tableSql }: StoreResources,
      now: number,
      stageId: string
    ) {
      const found = yield* findInputStage(scope, stageId, now)
      if (found === undefined) {
        return yield* notFound(stageId)
      }
      const { pinned, stage } = found
      // Membership comes from the batch rows, never from the id table.
      const snapshot = pinned.batchSet === undefined ? Stream.empty : setRows(snapshotTableSql, pinned.batchSet)
      const tail = paged(pinned.base, (after) =>
        query(sql`
          SELECT ${top} sequence, entry_ids FROM ${tableSql}
          WHERE sequence > ${after} AND last_sequence <= ${stage.through}
          ORDER BY sequence ${limit}`), (row) => Number(row.sequence))
      return snapshot.pipe(
        Stream.concat(tail),
        Stream.map((row): EventLogServerEncrypted.CompactionBatchHeader => ({
          sequence: Number(row.sequence),
          entryIds: toEntryIds(row.entry_ids as Uint8Array)
        })),
        Stream.orDie,
        Stream.concat(Stream.fromEffectDrain(dieOnSqlError(recheckPin(stageId, pinned.id))))
      )
    })

    const fetch = Effect.fnUntraced(function*(
      { scope, snapshotTableSql, tableSql }: StoreResources,
      now: number,
      stageId: string,
      sequences: ReadonlyArray<number>
    ) {
      const found = yield* findInputStage(scope, stageId, now)
      if (found === undefined) {
        return yield* notFound(stageId)
      }
      const { pinned, stage } = found
      const bySequence = new Map<number, EventLogEncryption.EncryptedRemoteBatch>()
      if (pinned.batchSet !== undefined) {
        for (const chunk of Arr.chunksOf(sequences.filter((sequence) => sequence <= pinned.base), 200)) {
          const rows = yield* sql`
            SELECT sequence, iv, entry_ids, encrypted_batch FROM ${snapshotTableSql}
            WHERE batch_set = ${pinned.batchSet} AND ${sql.in("sequence", chunk)}
          `.pipe(Effect.flatMap(decodeBatches), Effect.orDie)
          for (const batch of rows) bySequence.set(batch.sequence, batch)
        }
      }
      const originals = sequences.filter((sequence) => sequence > pinned.base && sequence <= stage.through)
      for (const chunk of Arr.chunksOf(originals, 200)) {
        const rows = yield* sql`
          SELECT sequence, iv, entry_ids, encrypted_batch FROM ${tableSql}
          WHERE ${sql.in("sequence", chunk)}
        `.pipe(Effect.flatMap(decodeBatches), Effect.orDie)
        for (const batch of rows) bySequence.set(batch.sequence, batch)
      }
      yield* recheckPin(stageId, pinned.id)
      return Stream.fromArray(sequences.flatMap((sequence) => {
        const batch = bySequence.get(sequence)
        return batch === undefined ? [] : [batch]
      }))
    })

    const stagePart = (
      store: StoreResources,
      now: number,
      stageId: string,
      segment: number,
      batches: Arr.NonEmptyReadonlyArray<EventLogEncryption.EncryptedBatch>
    ): Effect.Effect<
      "Stored" | "AlreadyStored",
      EventLogServerEncrypted.CompactionInvalidRequest | EventLogServerEncrypted.CompactionNotFound | SqlError.SqlError
    > => {
      const invalid = !Number.isSafeInteger(segment) || segment < 0 || segment >= maxSegments
        ? "Invalid segment index"
        : batches.length > positionsPerSegment
        ? "Too many batches in a segment"
        : undefined
      // A Part that fails validation closes the stage.
      if (invalid !== undefined) {
        return Effect.andThen(
          abort(store, stageId),
          Effect.fail(new EventLogServerEncrypted.CompactionInvalidRequest({ stageId, message: invalid }))
        )
      }
      const { scope, snapshotTableSql } = store
      return sql.withTransaction(Effect.gen(function*() {
        yield* lockStore(scope)
        const stage = yield* selectStage(scope, stageId, true)
        if (stage === undefined || stage.state !== "open" || stage.expiresAt <= now) {
          return yield* notFound(stageId)
        }
        // The snapshot table's key makes a retried segment insert nothing.
        // `sequence` and `last_sequence` stay null until commit.
        const rows = batches.map((batch, i) => ({
          batch_set: stageId,
          batch_position: segment * positionsPerSegment + i,
          entry_count: batch.entryIds.length,
          iv: batch.iv,
          entry_ids: concatEntryIds(batch.entryIds),
          encrypted_batch: batch.encryptedBatch
        }))
        let inserted = 0
        for (const chunk of Arr.chunksOf(rows, 200)) {
          inserted += yield* insertNew(snapshotTableSql, chunk, ["batch_set", "batch_position"])
        }
        if (inserted === 0) return "AlreadyStored" as const
        yield* sql`UPDATE ${stagesSql} SET expires_at = ${now + stageTtlMillis} WHERE id = ${stageId}`
        return "Stored" as const
      }))
    }

    const stagedHeaders = Effect.fnUntraced(function*(
      { scope, snapshotTableSql }: StoreResources,
      now: number,
      stageId: string
    ) {
      const stage = yield* selectStage(scope, stageId, false)
      if (stage === undefined || stage.state !== "open" || stage.expiresAt <= now) {
        return yield* notFound(stageId)
      }
      return setRows(snapshotTableSql, stageId).pipe(
        Stream.map((row) => ({
          position: Number(row.batch_position),
          entryIds: toEntryIds(row.entry_ids as Uint8Array)
        })),
        Stream.orDie
      )
    })

    const commit = Effect.fnUntraced(function*(
      { scope, snapshotTableSql }: StoreResources,
      now: number,
      stageId: string,
      virtualSequences: ReadonlyArray<number>
    ) {
      const store = yield* lockStore(scope)
      const stage = yield* selectStage(scope, stageId, true)
      if (stage === undefined || stage.state !== "open" || stage.expiresAt <= now) {
        return yield* notFound(stageId)
      }
      const staged = yield* query(sql`
        SELECT batch_position, entry_count FROM ${snapshotTableSql}
        WHERE batch_set = ${stageId} ORDER BY batch_position`)
      let keptCount = 0
      for (const row of staged) keptCount += Number(row.entry_count)
      const audit = { through: stage.through, keptCount }
      if (stage.pinned !== store.activeActivation) {
        yield* closeStage(scope, stageId)
        return { result: "Superseded", activationId: undefined, ...audit } as const
      }
      if (staged.length !== virtualSequences.length) {
        return yield* Effect.die(new Cause.IllegalArgumentError("Expected one virtual sequence per staged batch"))
      }
      for (let i = 0; i < staged.length; i++) {
        const sequence = virtualSequences[i]
        const lastSequence = sequence + Number(staged[i].entry_count) - 1
        yield* sql`
          UPDATE ${snapshotTableSql} SET sequence = ${sequence}, last_sequence = ${lastSequence}
          WHERE batch_set = ${stageId} AND batch_position = ${Number(staged[i].batch_position)}`
      }
      const activationId = SecureRandom.uuidV4Unsafe()
      yield* insertActivation(scope, {
        id: activationId,
        batch_set: stageId,
        base_sequence: stage.through,
        kept_count: keptCount,
        previous: store.activeActivation
      })
      yield* supersede(store.activeActivation, now)
      yield* sql`
        UPDATE ${storesSql}
        SET active_activation = ${activationId}, active_batch_set = ${stageId},
          base_sequence = ${stage.through}, active_kept_count = ${keptCount},
          no_op_at = NULL, no_op_count = 0
        WHERE scope = ${scope}`
      yield* scheduleSweep(scope, now + graceMillis)
      // The staged rows are now the active batch set.
      yield* sql`DELETE FROM ${stagesSql} WHERE id = ${stageId}`
      yield* releaseClaim(scope, stageId)
      return { result: "Committed", activationId, ...audit } as const
    }, sql.withTransaction)

    const recordNoOp = Effect.fnUntraced(function*({ scope }: StoreResources, now: number, stageId: string) {
      const store = yield* lockStore(scope)
      const stage = yield* selectStage(scope, stageId, true)
      if (stage === undefined || stage.state !== "open" || stage.expiresAt <= now) {
        return yield* notFound(stageId)
      }
      // A rollback since begin cleared the no-op state, so a stale run leaves it.
      if (stage.pinned === store.activeActivation) {
        yield* sql`
          UPDATE ${storesSql} SET no_op_at = ${stage.through}, no_op_count = ${store.noOpCount + 1}
          WHERE scope = ${scope}`
      }
      yield* closeStage(scope, stageId)
      return stage.through
    }, sql.withTransaction)

    const rollbackTransaction = Effect.fnUntraced(function*(
      { pubsub, scope, snapshotTableSql, tableSql }: StoreResources,
      now: number,
      expectedActivationId: string
    ) {
      const refuse = (reason: EventLogServerEncrypted.CompactionRollbackError["reason"]) =>
        Effect.fail(new EventLogServerEncrypted.CompactionRollbackError({ reason }))
      const store = yield* lockStore(scope)
      if (store.activeActivation !== expectedActivationId) return yield* refuse("NotActive")
      const withdrawn = (yield* selectActivation(store.activeActivation))!
      const target = withdrawn.previous === undefined ? undefined : yield* selectActivation(withdrawn.previous)
      if (target === undefined) return yield* refuse("NoPrevious")
      if (target.pruneStartedAt !== undefined) return yield* refuse("PruneStarted")
      const activationId = SecureRandom.uuidV4Unsafe()
      yield* insertActivation(scope, {
        id: activationId,
        batch_set: target.batchSet ?? null,
        base_sequence: target.base,
        kept_count: target.keptCount ?? null,
        previous: target.previous ?? null
      })
      yield* supersede(withdrawn.id, now)
      yield* sql`
        UPDATE ${storesSql}
        SET active_activation = ${activationId}, active_batch_set = ${target.batchSet ?? null},
          base_sequence = ${target.base}, active_kept_count = ${target.keptCount ?? 0},
          no_op_at = NULL, no_op_count = 0
        WHERE scope = ${scope}`
      yield* scheduleSweep(scope, now + graceMillis)

      // Re-appends the input of the stage that built the withdrawn generation,
      // the target's batch set and then the originals between the two bases,
      // at sequences taken as `write` takes them.
      let nextSequence = Math.max(store.nextSequence, (yield* maxLastSequence(tableSql)) + 1)
      const reappended: Array<EventLogEncryption.EncryptedRemoteBatch> = []
      const reappend = (rows: ReadonlyArray<Record<string, unknown>>) => {
        const inserted: Array<BatchRow> = []
        for (const row of rows) {
          const entry_ids = row.entry_ids as Uint8Array
          const batch: EventLogEncryption.EncryptedRemoteBatch = {
            sequence: nextSequence,
            entryIds: toEntryIds(entry_ids),
            iv: row.iv as Uint8Array<ArrayBuffer>,
            encryptedBatch: row.encrypted_batch as Uint8Array<ArrayBuffer>
          }
          nextSequence += batch.entryIds.length
          reappended.push(batch)
          inserted.push({
            sequence: batch.sequence,
            last_sequence: nextSequence - 1,
            iv: batch.iv,
            entry_ids,
            encrypted_batch: batch.encryptedBatch
          })
        }
        return Effect.forEach(
          Arr.chunksOf(inserted, 200),
          (chunk) => sql`INSERT INTO ${tableSql} ${sql.insert(chunk)}`,
          { discard: true }
        )
      }
      if (target.batchSet !== undefined) {
        yield* Stream.runForEachArray(
          paged(
            -1,
            (after) =>
              query(sql`
                SELECT ${top} batch_position, iv, entry_ids, encrypted_batch FROM ${snapshotTableSql}
                WHERE batch_set = ${target.batchSet} AND batch_position > ${after}
                ORDER BY batch_position ${limit}`),
            (row) => Number(row.batch_position)
          ),
          reappend
        )
      }
      // The copies land above `withdrawn.base`, so the pages never reach them.
      yield* Stream.runForEachArray(
        paged(
          target.base,
          (after) =>
            query(sql`
              SELECT ${top} sequence, iv, entry_ids, encrypted_batch FROM ${tableSql}
              WHERE sequence > ${after} AND last_sequence <= ${withdrawn.base}
              ORDER BY sequence ${limit}`),
          (row) => Number(row.sequence)
        ),
        reappend
      )
      if (reappended.length > 0) {
        yield* sql`UPDATE ${storesSql} SET next_sequence = ${nextSequence} WHERE scope = ${scope}`
        yield* upsertBucket(scope, Math.floor(now / hourMillis), nextSequence - 1)
        yield* sql.afterCommit(Effect.asVoid(PubSub.publishAll(pubsub, reappended)))
      }
      return { activationId, target, withdrawn }
    }, sql.withTransaction)

    // The re-appended batches are published after the outermost commit. When
    // the storage owns the transaction, that happens before the semaphore is
    // released, so live readers get them in sequence order.
    const rollback = (store: StoreResources, now: number, expectedActivationId: string) =>
      store.semaphore.withPermits(1)(rollbackTransaction(store, now, expectedActivationId))

    const history = Effect.fnUntraced(function*({ scope }: StoreResources) {
      const store = (yield* selectStore(scope))!
      const activations = yield* selectActivations(scope)
      return activations.map((activation): EventLogServerEncrypted.CompactionActivation => {
        const active = activation.id === store.activeActivation
        return {
          activationId: activation.id,
          base: activation.base,
          keptCount: activation.keptCount,
          active,
          supersededAt: active ? undefined : activation.supersededAt,
          restorable: activation.pruneStartedAt === undefined
        }
      })
    })

    const abort = Effect.fnUntraced(function*({ scope }: StoreResources, stageId: string) {
      yield* lockStore(scope)
      const stage = yield* selectStage(scope, stageId, true)
      if (stage?.state === "open") yield* closeStage(scope, stageId)
    }, sql.withTransaction)

    const compaction: EventLogServerEncrypted.StorageCompaction = {
      config,
      status: (publicKey, storeId) => withStore(publicKey, storeId, status),
      begin: (publicKey, storeId, { through }) =>
        withStore(publicKey, storeId, (store, now) => begin(store, now, through)),
      inputHeaders: (publicKey, storeId, stageId) =>
        Stream.unwrap(withStore(publicKey, storeId, (store, now) => inputHeaders(store, now, stageId))),
      fetch: (publicKey, storeId, stageId, sequences) =>
        Stream.unwrap(withStore(publicKey, storeId, (store, now) => fetch(store, now, stageId, sequences))),
      stagePart: (publicKey, storeId, stageId, segment, batches) =>
        withStore(publicKey, storeId, (store, now) => stagePart(store, now, stageId, segment, batches)),
      stagedHeaders: (publicKey, storeId, stageId) =>
        Stream.unwrap(withStore(publicKey, storeId, (store, now) => stagedHeaders(store, now, stageId))),
      commit: (publicKey, storeId, stageId, virtualSequences) =>
        withStore(publicKey, storeId, (store, now) => commit(store, now, stageId, virtualSequences)).pipe(
          Effect.tap((outcome) => logCommit({ publicKey, storeId, ...outcome })),
          Effect.map((outcome) => outcome.result)
        ),
      recordNoOp: (publicKey, storeId, stageId) =>
        withStore(publicKey, storeId, (store, now) => recordNoOp(store, now, stageId)).pipe(
          Effect.flatMap((through) => logNoOp({ publicKey, storeId, stageId, through }))
        ),
      abort: (publicKey, storeId, stageId) => withStore(publicKey, storeId, (store) => abort(store, stageId)),
      rollback: (publicKey, storeId, expectedActivationId) =>
        withStore(publicKey, storeId, (store, now) => rollback(store, now, expectedActivationId)).pipe(
          Effect.tap(({ activationId, target, withdrawn }) =>
            logRollback({ publicKey, storeId, activation: { ...target, id: activationId }, withdrawn })
          ),
          Effect.map((outcome) => outcome.activationId)
        ),
      history: (publicKey, storeId) => withStore(publicKey, storeId, (store) => history(store))
    }

    const insertActivation = Effect.fnUntraced(function*(scope: string, activation: {
      readonly id: string
      readonly batch_set: string | null
      readonly base_sequence: number
      readonly kept_count: number | null
      readonly previous: string | null
    }) {
      const [last] = yield* query(sql`SELECT MAX(ordinal) AS ordinal FROM ${activationsSql} WHERE scope = ${scope}`)
      yield* sql`INSERT INTO ${activationsSql} ${
        sql.insert({
          ...activation,
          scope,
          ordinal: Number(last?.ordinal ?? 0) + 1,
          superseded_at: null,
          prunable_at: null,
          prune_started_at: null
        })
      }`
    })
    // Supersedes or withdraws an activation, prunable `grace` later.
    const supersede = (activationId: string, now: number) =>
      sql`
        UPDATE ${activationsSql} SET superseded_at = ${now}, prunable_at = ${now + graceMillis}
        WHERE id = ${activationId}`

    // Deletes up to `pruneChunkRows` rows matching `where` in key order and
    // returns whether it found any. No new rows match `where`, so a later call
    // resumes an interrupted one.
    const deleteChunk = Effect.fnUntraced(function*(
      tableSql: Statement.Identifier,
      key: string,
      where: Statement.Fragment
    ) {
      const keys = yield* query(sql`
        SELECT ${chunkTop} ${sql(key)} AS chunk_key FROM ${tableSql}
        WHERE ${where} ORDER BY ${sql(key)} ${chunkLimit}`)
      if (keys.length === 0) return false
      yield* sql`DELETE FROM ${tableSql} WHERE ${where} AND ${sql(key)} <= ${keys[keys.length - 1].chunk_key}`
      return true
    })

    // Runs one chunk of a prune under the store row lock, if this sweeper
    // still holds the lease and the active activation hasn't changed.
    const pruneChunk = <A>(
      scope: string,
      now: number,
      lease: { readonly owner: string; readonly activeActivation: string },
      f: Effect.Effect<A, SqlError.SqlError>
    ) =>
      sql.withTransaction(Effect.gen(function*() {
        const store = yield* lockStore(scope)
        if (store.sweepLeaseOwner !== lease.owner || store.activeActivation !== lease.activeActivation) {
          return Option.none<A>()
        }
        const value = yield* f
        yield* sql`UPDATE ${storesSql} SET sweep_lease_until = ${now + sweepIntervalMillis} WHERE scope = ${scope}`
        return Option.some(value)
      }))

    // Prunes what no activation still needs: the batch sets of generations
    // past their grace, and the originals at or below the lowest base still
    // kept. Deletes are idempotent, so a later sweep finishes one that died.
    const pruneStore = Effect.fnUntraced(function*(scope: string, now: number) {
      const { snapshotTableSql, tableSql } = scopeTables(scope)
      const owner = SecureRandom.uuidV4Unsafe()
      // Claim the store and mark what this prune removes before deleting anything.
      const plan = yield* sql.withTransaction(Effect.gen(function*() {
        const store = yield* lockStore(scope)
        if (store.nextSweepAt === undefined || store.nextSweepAt > now) return undefined
        if (store.sweepLeaseUntil !== undefined && store.sweepLeaseUntil > now) return undefined
        const activations = yield* selectActivations(scope)
        const isKept = (activation: ActivationRow) =>
          activation.id === store.activeActivation ||
          (activation.pruneStartedAt === undefined && (activation.prunableAt ?? Infinity) > now)
        const kept = activations.filter(isKept)
        const pruned = activations.filter((activation) => !isKept(activation))
        const starting = pruned.filter((activation) => activation.pruneStartedAt === undefined)
        for (const chunk of Arr.chunksOf(starting.map((activation) => activation.id), 200)) {
          yield* sql`UPDATE ${activationsSql} SET prune_started_at = ${now} WHERE ${sql.in("id", chunk)}`
        }
        const keptSets = new Set(kept.map((activation) => activation.batchSet))
        yield* sql`
          UPDATE ${storesSql} SET sweep_lease_until = ${now + sweepIntervalMillis}, sweep_lease_owner = ${owner}
          WHERE scope = ${scope}`
        return {
          lease: { owner, activeActivation: store.activeActivation },
          sets: Array.from(
            new Set(pruned.flatMap((activation) =>
              activation.batchSet === undefined || keptSets.has(activation.batchSet) ? [] : [activation.batchSet]
            ))
          ),
          keptBase: kept.reduce((base, activation) =>
            Math.min(base, activation.base), Infinity),
          prunedThrough: store.prunedThrough
        }
      }))
      if (plan === undefined) return
      for (const set of plan.sets) {
        while (true) {
          const deleted = yield* pruneChunk(
            scope,
            now,
            plan.lease,
            deleteChunk(snapshotTableSql, "batch_position", sql`batch_set = ${set}`)
          )
          if (Option.isNone(deleted)) return
          if (!deleted.value) break
        }
      }
      for (let start = plan.prunedThrough; start < plan.keptBase; start += pruneChunkSequences) {
        const end = Math.min(start + pruneChunkSequences, plan.keptBase)
        const held = yield* pruneChunk(
          scope,
          now,
          plan.lease,
          sql`DELETE FROM ${tableSql} WHERE last_sequence <= ${end}`.pipe(
            Effect.andThen(sql`
              UPDATE ${storesSql}
              SET pruned_through = CASE WHEN pruned_through < ${end} THEN ${end} ELSE pruned_through END
              WHERE scope = ${scope}`)
          )
        )
        if (Option.isNone(held)) return
      }
      yield* sql.withTransaction(Effect.gen(function*() {
        const store = yield* lockStore(scope)
        if (store.sweepLeaseOwner !== owner) return
        const [next] = yield* query(sql`
          SELECT MIN(prunable_at) AS next_sweep_at FROM ${activationsSql}
          WHERE scope = ${scope} AND id <> ${store.activeActivation} AND prune_started_at IS NULL`)
        yield* sql`
          UPDATE ${storesSql}
          SET next_sweep_at = ${next?.next_sweep_at ?? null}, sweep_lease_until = NULL, sweep_lease_owner = NULL
          WHERE scope = ${scope}`
      }))
    })

    // Deletes a closed stage's rows matching `where`, one chunk per
    // transaction, each under the store row lock to keep the lock order.
    const deleteStaged = Effect.fnUntraced(function*(
      scope: string,
      tableSql: Statement.Identifier,
      key: string,
      where: Statement.Fragment
    ) {
      while (yield* sql.withTransaction(Effect.andThen(lockStore(scope), deleteChunk(tableSql, key, where)))) {
        // Each chunk commits on its own.
      }
    })

    // Closes stages past their claim, then deletes closed stages. A closed
    // stage's staged rows are read by nothing, so they go first in short
    // chunks, and the stage row last.
    const sweepStages = Effect.fnUntraced(function*(now: number) {
      const expired = yield* query(sql`
        SELECT id, scope FROM ${stagesSql} WHERE state = ${"open"} AND expires_at <= ${now}`)
      for (const row of expired) {
        const scope = String(row.scope)
        const stageId = String(row.id)
        yield* sql.withTransaction(Effect.gen(function*() {
          yield* lockStore(scope)
          const stage = yield* selectStage(scope, stageId, true)
          if (stage?.state === "open" && stage.expiresAt <= now) {
            yield* closeStage(scope, stageId)
          }
        }))
      }
      const closed = yield* query(sql`SELECT id, scope FROM ${stagesSql} WHERE state = ${"closed"}`)
      for (const row of closed) {
        const scope = String(row.scope)
        const stageId = String(row.id)
        yield* deleteStaged(scope, scopeTables(scope).snapshotTableSql, "batch_position", sql`batch_set = ${stageId}`)
        yield* sql.withTransaction(
          Effect.andThen(lockStore(scope), sql`DELETE FROM ${stagesSql} WHERE id = ${stageId}`)
        )
      }
    })

    // Only the newest bucket past the lag matters for the lag head.
    const sweepBuckets = Effect.fnUntraced(function*(now: number) {
      const rows = yield* query(sql`
        SELECT scope, MAX(bucket_hour) AS newest FROM ${bucketsSql}
        WHERE bucket_hour <= ${lagHour(now, lagMillis)}
        GROUP BY scope HAVING COUNT(*) > 1`)
      for (const row of rows) {
        yield* sql`DELETE FROM ${bucketsSql} WHERE scope = ${String(row.scope)} AND bucket_hour < ${Number(row.newest)}`
      }
    })

    const logSweepFailure = (cause: Cause.Cause<unknown>) =>
      Effect.logWarning("Compaction sweep failed", cause).pipe(
        Effect.annotateLogs({ service: "SqlEventLogServerEncrypted" })
      )
    const sweep = Effect.gen(function*() {
      const now = yield* Clock.currentTimeMillis
      yield* Effect.catchCause(sweepStages(now), logSweepFailure)
      const due = yield* query(sql`SELECT scope FROM ${storesSql} WHERE next_sweep_at <= ${now}`)
      for (const row of due) {
        yield* Effect.catchCause(pruneStore(String(row.scope), now), logSweepFailure)
      }
      yield* Effect.catchCause(sweepBuckets(now), logSweepFailure)
    }).pipe(Effect.catchCause(logSweepFailure), withTracerDisabled)
    // A fixed schedule starts an overdue sweep straight away, so slow queries
    // don't push sweeps back.
    yield* Effect.forkScoped(
      Effect.delay(Effect.repeat(sweep, Schedule.fixed(config.sweepInterval)), config.sweepInterval)
    )

    return EventLogServerEncrypted.Storage.of({
      getId: Effect.succeed(remoteId),
      // Auto-increment sequences start at 1.
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
        withTracerDisabled,
        Effect.orDie
      ),
      write: Effect.fnUntraced(
        function*(publicKey, storeId, batches) {
          if (batches.length === 0) return []
          const scopeKey = makeEncryptedScopeKey(publicKey, storeId)
          const { idsTableSql, pubsub, scope, semaphore, tableSql } = yield* RcMap.get(resources, scopeKey)
          const now = yield* Clock.currentTimeMillis

          const writeBatches = Effect.gen(function*() {
            const stored: Array<EventLogEncryption.EncryptedRemoteBatch> = []
            // The store row lock makes sequence order commit order. The row's
            // `next_sequence` survives pruning, and `MAX(last_sequence)` covers
            // instances that predate the row.
            const store = yield* lockStore(scope)
            // Read before inserting ids, which record the sequence they are stored at.
            let nextSequence = Math.max(store.nextSequence, (yield* maxLastSequence(tableSql)) + 1)
            for (const batch of batches) {
              // Inserting the ids decides whether the batch is new. SQL Server's
              // MERGE also requires unique source ids.
              const ids = new Map<string, IdRow>()
              for (let i = 0; i < batch.entryIds.length; i++) {
                const entry_id = batch.entryIds[i]
                const key = entry_id.join(",")
                if (!ids.has(key)) ids.set(key, { entry_id, sequence: nextSequence + i })
              }
              let inserted = 0
              for (const chunk of Arr.chunksOf(ids.values(), 200)) {
                // Stored ids keep their first sequence.
                inserted += yield* insertNew(idsTableSql, chunk, ["entry_id"])
              }
              if (inserted === 0) continue
              const row: BatchRow = {
                sequence: nextSequence,
                last_sequence: nextSequence + batch.entryIds.length - 1,
                iv: batch.iv,
                entry_ids: concatEntryIds(batch.entryIds),
                encrypted_batch: batch.encryptedBatch
              }
              yield* sql`INSERT INTO ${tableSql} ${sql.insert(row)}`
              stored.push({ sequence: nextSequence, ...batch })
              nextSequence += batch.entryIds.length
            }
            if (stored.length > 0) {
              yield* sql`UPDATE ${storesSql} SET next_sequence = ${nextSequence} WHERE scope = ${scope}`
              yield* upsertBucket(scope, Math.floor(now / hourMillis), nextSequence - 1)
              // Published after the outermost commit, as `rollback` publishes.
              yield* sql.afterCommit(Effect.asVoid(PubSub.publishAll(pubsub, stored)))
            }
            return stored
          })

          return yield* semaphore.withPermits(1)(sql.withTransaction(writeBatches))
        },
        Effect.orDie,
        Effect.scoped,
        withTracerDisabled
      ),
      entrySequences: Effect.fnUntraced(
        function*(publicKey, storeId, entryIds) {
          const { idsTableSql } = yield* RcMap.get(resources, makeEncryptedScopeKey(publicKey, storeId))
          const acks: Array<WriteAck> = []
          for (const chunk of Arr.chunksOf(entryIds, 200)) {
            const rows = yield* sql`
              SELECT entry_id, sequence FROM ${idsTableSql} WHERE ${sql.in("entry_id", chunk)}
            `.pipe(Effect.flatMap(decodeIdRows))
            for (const row of rows) acks.push({ entryId: row.entry_id as EntryId, sequence: row.sequence })
          }
          return acks
        },
        Effect.orDie,
        Effect.scoped,
        withTracerDisabled
      ),
      // Reads the store row, the active set and the tail as separate
      // statements. A transaction would take the SQLite write lock on every
      // stream open, and set rows never change before they are pruned.
      changes: Effect.fnUntraced(
        function*(publicKey, storeId, startSequence) {
          const scopeKey = makeEncryptedScopeKey(publicKey, storeId)
          const { pubsub, scope, snapshotTableSql, tableSql } = yield* RcMap.get(resources, scopeKey)
          const subscription = yield* PubSub.subscribe(pubsub)
          const live = Stream.fromSubscription(subscription)
          const store = (yield* selectStore(scope))!
          // Below the base an active snapshot replaces the originals.
          if (store.activeBatchSet !== undefined && startSequence <= store.base) {
            const set = yield* sql`
              SELECT sequence, iv, entry_ids, encrypted_batch FROM ${snapshotTableSql}
              WHERE batch_set = ${store.activeBatchSet} AND last_sequence >= ${startSequence}
              ORDER BY batch_position ASC
            `.pipe(Effect.flatMap(decodeBatches))
            // The final batch ends at the base, so only an empty set reads nothing.
            if (set.length === 0) {
              return Stream.die(new Error(`The active compaction snapshot of store ${storeId} has no batches`))
            }
            const tail = yield* sql`
              SELECT sequence, iv, entry_ids, encrypted_batch FROM ${tableSql}
              WHERE sequence > ${store.base}
              ORDER BY sequence ASC
            `.pipe(Effect.flatMap(decodeBatches))
            return Stream.fromArray([...set, ...tail]).pipe(Stream.concat(live))
          }
          const initial = yield* sql`
            SELECT sequence, iv, entry_ids, encrypted_batch FROM ${tableSql}
            WHERE last_sequence >= ${startSequence}
            ORDER BY sequence ASC
          `.pipe(
            Effect.flatMap(decodeBatches)
          )
          return Stream.fromArray(initial).pipe(Stream.concat(live))
        },
        Effect.orDie,
        withTracerDisabled,
        Stream.unwrap
      ),
      compaction
    })
  }).pipe(withTracerDisabled)

// Rows per statement when streaming compaction input or staged batches.
const pageSize = 500
// Sequences of originals deleted per prune chunk.
const pruneChunkSequences = 10_000
// Snapshot or staged rows deleted per prune chunk.
const pruneChunkRows = 200

type StageState = "open" | "closed"

// SQL failures are defects for the compaction primitives.
const dieOnSqlError = <A, E, R>(
  effect: Effect.Effect<A, E | SqlError.SqlError, R>
): Effect.Effect<A, Exclude<E, SqlError.SqlError>, R> =>
  Effect.catchIf(
    effect,
    (error): error is SqlError.SqlError => SqlError.isSqlError(error),
    (error) => Effect.die(error)
  ) as Effect.Effect<A, Exclude<E, SqlError.SqlError>, R>

const optionalNumber = (value: unknown) => value === null || value === undefined ? undefined : Number(value)
const optionalString = (value: unknown) => value === null || value === undefined ? undefined : String(value)

const toStoreRow = (row: Record<string, unknown>) => ({
  nextSequence: Number(row.next_sequence),
  activeActivation: String(row.active_activation),
  activeBatchSet: optionalString(row.active_batch_set),
  base: Number(row.base_sequence),
  activeKeptCount: Number(row.active_kept_count),
  noOpAt: optionalNumber(row.no_op_at),
  noOpCount: Number(row.no_op_count),
  openStage: optionalString(row.open_stage),
  nextSweepAt: optionalNumber(row.next_sweep_at),
  sweepLeaseUntil: optionalNumber(row.sweep_lease_until),
  sweepLeaseOwner: optionalString(row.sweep_lease_owner),
  prunedThrough: Number(row.pruned_through)
})

const toStageRow = (row: Record<string, unknown>) => ({
  id: String(row.id),
  scope: String(row.scope),
  state: String(row.state) as StageState,
  pinned: String(row.pinned),
  through: Number(row.through_sequence),
  expiresAt: Number(row.expires_at)
})

type ActivationRow = ReturnType<typeof toActivationRow>

const toActivationRow = (row: Record<string, unknown>) => ({
  id: String(row.id),
  ordinal: Number(row.ordinal),
  batchSet: optionalString(row.batch_set),
  base: Number(row.base_sequence),
  keptCount: optionalNumber(row.kept_count),
  previous: optionalString(row.previous),
  supersededAt: optionalNumber(row.superseded_at),
  prunableAt: optionalNumber(row.prunable_at),
  pruneStartedAt: optionalNumber(row.prune_started_at)
})

type IdRow = {
  readonly entry_id: Uint8Array
  readonly sequence: number
}

const decodeIdRows = Schema.decodeUnknownEffect(Schema.Array(Schema.Struct({
  entry_id: Schema.Uint8Array,
  sequence: Schema.Number
})))

type BatchRow = {
  readonly sequence: number
  readonly last_sequence: number
  readonly iv: Uint8Array
  readonly entry_ids: Uint8Array
  readonly encrypted_batch: Uint8Array
}

const concatEntryIds = (entryIds: ReadonlyArray<Uint8Array>): Uint8Array => {
  const data = new Uint8Array(entryIds.length * 16)
  for (let i = 0; i < entryIds.length; i++) data.set(entryIds[i], i * 16)
  return data
}

const toEntryIds = (data: Uint8Array): NonEmptyArray<EntryId> => {
  const entryIds: Array<EntryId> = []
  for (let offset = 0; offset < data.byteLength; offset += 16) {
    entryIds.push(data.subarray(offset, offset + 16) as EntryId)
  }
  return entryIds as NonEmptyArray<EntryId>
}

const EncryptedRemoteBatchSql = Schema.Struct({
  sequence: Schema.Natural,
  iv: Schema.Uint8Array,
  entry_ids: Schema.Uint8Array,
  encrypted_batch: Schema.Uint8Array
})

type EncryptedRemoteBatchSql = Schema.Schema.Type<typeof EncryptedRemoteBatchSql>

const SessionAuthBindingSql = Schema.Struct({
  public_key: Schema.String,
  signing_public_key: Schema.Uint8Array
})

type SessionAuthBindingSql = Schema.Schema.Type<typeof SessionAuthBindingSql>

const decodeBatchRows = Schema.decodeUnknownEffect(Schema.Array(EncryptedRemoteBatchSql))
const decodeSessionAuthBindingRows = Schema.decodeUnknownEffect(Schema.Array(SessionAuthBindingSql))

const toEncryptedRemoteBatch = (row: EncryptedRemoteBatchSql): EventLogEncryption.EncryptedRemoteBatch => ({
  sequence: row.sequence,
  entryIds: toEntryIds(row.entry_ids),
  iv: row.iv as Uint8Array<ArrayBuffer>,
  encryptedBatch: row.encrypted_batch as Uint8Array<ArrayBuffer>
})

const decodeBatches = (
  rows: unknown
): Effect.Effect<ReadonlyArray<EventLogEncryption.EncryptedRemoteBatch>, Schema.SchemaError> =>
  decodeBatchRows(rows).pipe(Effect.map((batches) => batches.map(toEncryptedRemoteBatch)))

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
  readonly compaction?: EventLogServerEncrypted.CompactionOptions | undefined
}): Layer.Layer<
  EventLogServerEncrypted.Storage,
  SqlError.SqlError,
  SqlClient.SqlClient | Digest.Digest
> => Layer.effect(EventLogServerEncrypted.Storage)(makeStorage(options))

/**
 * Provides SQL-backed encrypted server `Storage` and supplies the default Web
 * Crypto `Digest` layer.
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const layerStorageSubtle = (options?: {
  readonly entryTablePrefix?: string
  readonly remoteIdTable?: string
  readonly compaction?: EventLogServerEncrypted.CompactionOptions | undefined
}): Layer.Layer<EventLogServerEncrypted.Storage, SqlError.SqlError, SqlClient.SqlClient> =>
  layerStorage(options).pipe(
    Layer.provide(Digest.layerWebCrypto)
  )

const makeEncryptedScopeKey = (
  publicKey: string,
  storeId: string
): string => `${publicKey}/${storeId}`

const withTracerDisabled = Effect.withTracerEnabled(false)
