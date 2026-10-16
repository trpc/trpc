/**
 * Connects Effect SQL to SQLite on Node.js using `node:sqlite`.
 *
 * This module opens a SQLite database and exposes it as both `SqliteClient` and
 * the generic Effect SQL client. It serializes access through one connection,
 * caches prepared statements, enables WAL mode unless disabled, and waits up
 * to five seconds for busy databases by default. Explicit transactions on
 * writable connections use `BEGIN IMMEDIATE` to avoid read-to-write lock
 * upgrades, which serializes them behind other writers even when they only
 * read. Clients opened with `readonly: true` are unaffected. Busy waits block
 * the Node.js event loop because `node:sqlite` is synchronous. Database backup
 * and extension loading are supported; streaming queries and `updateValues`
 * are not.
 *
 * @since 4.0.0
 */
import * as Cache from "effect/Cache"
import * as Clock from "effect/Clock"
import * as Config from "effect/Config"
import * as Context from "effect/Context"
import * as Duration from "effect/Duration"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import { identity } from "effect/Function"
import * as Layer from "effect/Layer"
import * as Reactivity from "effect/reactivity/Reactivity"
import * as Schedule from "effect/Schedule"
import type * as Scope from "effect/Scope"
import * as Semaphore from "effect/Semaphore"
import * as Client from "effect/sql/SqlClient"
import type { Connection } from "effect/sql/SqlConnection"
import { classifySqliteError, SqlError } from "effect/sql/SqlError"
import * as Statement from "effect/sql/Statement"
import * as Stream from "effect/Stream"
import { backup as backupDatabase, DatabaseSync } from "node:sqlite"
import type { StatementSync } from "node:sqlite"

const ATTR_DB_SYSTEM_NAME = "db.system.name"
const MAX_BUSY_TIMEOUT = 2_147_483_647
const NANOS_PER_MILLI = BigInt(1_000_000)

/**
 * Runtime type identifier used to mark Node `SqliteClient` values.
 *
 * @category type IDs
 * @since 4.0.0
 */
export const TypeId: TypeId = "~@effect/sql-sqlite-node/SqliteClient"

/**
 * Type-level identifier used to mark Node `SqliteClient` values.
 *
 * @category type IDs
 * @since 4.0.0
 */
export type TypeId = "~@effect/sql-sqlite-node/SqliteClient"

/**
 * Node SQLite client service, extending `SqlClient` with database export, backup, and extension loading helpers. `updateValues` is not supported.
 *
 * @category services
 * @since 4.0.0
 */
export interface SqliteClient extends Client.SqlClient {
  readonly [TypeId]: TypeId
  readonly config: SqliteClientConfig
  readonly backup: (destination: string) => Effect.Effect<BackupMetadata, SqlError>
  readonly loadExtension: (path: string) => Effect.Effect<void, SqlError>

  /** Not supported in sqlite */
  readonly updateValues: never
}

/**
 * Metadata returned from a Node SQLite backup operation, reporting total and remaining page counts.
 *
 * @category models
 * @since 4.0.0
 */
export interface BackupMetadata {
  readonly totalPages: number
  readonly remainingPages: number
}

/**
 * Service tag for the node SQLite client implementation.
 *
 * @category services
 * @since 4.0.0
 */
export const SqliteClient = Context.Service<SqliteClient>("@effect/sql-sqlite-node/SqliteClient")

/**
 * Configuration for a node SQLite client backed by `node:sqlite`, including the database filename, read-only mode, statement cache settings, WAL and busy timeout behavior, span attributes, and query/result name transforms.
 *
 * @category models
 * @since 4.0.0
 */
export interface SqliteClientConfig {
  readonly filename: string
  readonly readonly?: boolean | undefined
  readonly prepareCacheSize?: number | undefined
  readonly prepareCacheTTL?: Duration.Input | undefined
  readonly disableWAL?: boolean | undefined
  /**
   * How long SQLite waits when the database is busy. Defaults to 5 seconds.
   * `Duration.infinity` is clamped to SQLite's maximum timeout.
   * Waiting blocks the Node.js event loop because `node:sqlite` is synchronous.
   */
  readonly busyTimeout?: Duration.Input | undefined
  readonly spanAttributes?: Record<string, unknown> | undefined

  readonly transformResultNames?: ((str: string) => string) | undefined
  readonly transformQueryNames?: ((str: string) => string) | undefined
}

interface SqliteConnection extends Connection {
  readonly isTransaction: () => boolean
  readonly backup: (destination: string) => Effect.Effect<BackupMetadata, SqlError>
  readonly loadExtension: (path: string) => Effect.Effect<void, SqlError>
}

/**
 * Creates a scoped node SQLite client from the supplied configuration, using a single serialized connection with WAL and a 5-second busy timeout enabled by default. Explicit transactions on writable connections take the write lock for their duration, even when they only read; clients opened with `readonly: true` are unaffected.
 *
 * @category constructors
 * @since 4.0.0
 */
export const make = (
  options: SqliteClientConfig
): Effect.Effect<SqliteClient, SqlError, Scope.Scope | Reactivity.Reactivity> =>
  Effect.gen(function*() {
    const compiler = Statement.makeCompilerSqlite(options.transformQueryNames)
    const transformRows = options.transformResultNames ?
      Statement.defaultTransforms(
        options.transformResultNames
      ).array :
      undefined

    const makeConnection = Effect.gen(function*() {
      const db = yield* Effect.acquireRelease(
        Effect.try({
          try: () =>
            new DatabaseSync(options.filename, {
              readOnly: options.readonly ?? false,
              allowExtension: true
            }),
          catch: (cause) => new SqlError({ reason: classifyError(cause, "Failed to open database", "connect") })
        }),
        (db) => Effect.sync(() => db.close())
      )
      db.enableLoadExtension(false)
      const busyTimeout = Math.min(
        MAX_BUSY_TIMEOUT,
        Math.max(0, Math.round(Duration.toMillis(options.busyTimeout ?? Duration.seconds(5))))
      )
      const exec = (sql: string) =>
        Effect.try({
          try: () => db.exec(sql),
          catch: (cause) => new SqlError({ reason: classifyError(cause, "Failed to configure database", "connect") })
        })
      yield* exec(`PRAGMA busy_timeout = ${busyTimeout}`)

      if (options.disableWAL !== true && !options.readonly) {
        // Switching to WAL can fail with SQLITE_BUSY without invoking the busy
        // handler, so retry it until busyTimeout has elapsed. Each attempt's
        // native busy wait is limited to the remaining time.
        const deadline = (yield* Clock.monotonicTimeNanos) + BigInt(busyTimeout) * NANOS_PER_MILLI
        const remainingMillis = Effect.map(
          Clock.monotonicTimeNanos,
          (now) => Math.max(0, Number((deadline - now) / NANOS_PER_MILLI))
        )
        yield* remainingMillis.pipe(
          Effect.flatMap((remaining) => exec(`PRAGMA busy_timeout = ${remaining}`)),
          Effect.andThen(exec("PRAGMA journal_mode = WAL")),
          Effect.retry({
            while: (error) =>
              error.reason._tag === "LockTimeoutError" && Effect.map(remainingMillis, (remaining) => remaining > 0),
            schedule: Schedule.spaced("10 millis")
          })
        )
        yield* exec(`PRAGMA busy_timeout = ${busyTimeout}`)
      }

      const prepare = (sql: string) =>
        Effect.try({
          try: () => db.prepare(sql),
          catch: (cause) => new SqlError({ reason: classifyError(cause, "Failed to prepare statement", "prepare") })
        })

      const prepareCacheTTL = options.prepareCacheTTL ?? Duration.minutes(10)
      const prepareCache = yield* Cache.makeWith(prepare, {
        capacity: options.prepareCacheSize ?? 200,
        timeToLive: (exit) => Exit.isSuccess(exit) ? prepareCacheTTL : Duration.zero
      })

      const runStatement = (
        statement: StatementSync,
        params: ReadonlyArray<unknown>,
        raw: boolean
      ) =>
        Effect.withFiber<ReadonlyArray<any>, SqlError>((fiber) => {
          const useSafeIntegers = Context.get(fiber.context, Client.SafeIntegers)
          return Effect.try({
            try: () => {
              statement.setReadBigInts(useSafeIntegers)
              if (!raw || statement.columns().length > 0) {
                return statement.all(...(params as Array<any>)) as ReadonlyArray<any>
              }
              const result = statement.run(...(params as Array<any>))
              return { changes: result.changes, lastInsertRowid: result.lastInsertRowid } as any
            },
            catch: (cause) => new SqlError({ reason: classifyError(cause, "Failed to execute statement", "execute") })
          })
        })

      const runStatementValues = (
        statement: StatementSync,
        params: ReadonlyArray<unknown>
      ) =>
        Effect.withFiber<ReadonlyArray<ReadonlyArray<unknown>>, SqlError>((fiber) => {
          const useSafeIntegers = Context.get(fiber.context, Client.SafeIntegers)
          return Effect.try({
            try: () => {
              statement.setReadBigInts(useSafeIntegers)
              return statement.all(...(params as Array<any>)) as unknown as ReadonlyArray<ReadonlyArray<unknown>>
            },
            catch: (cause) => new SqlError({ reason: classifyError(cause, "Failed to execute statement", "execute") })
          })
        })

      const runStatementValuesUnprepared = (
        statement: StatementSync,
        params: ReadonlyArray<unknown>
      ) =>
        Effect.withFiber<ReadonlyArray<ReadonlyArray<unknown>>, SqlError>((fiber) => {
          const useSafeIntegers = Context.get(fiber.context, Client.SafeIntegers)
          return Effect.try({
            try: () => {
              statement.setReadBigInts(useSafeIntegers)
              statement.setReturnArrays(true)
              return statement.all(...(params as Array<any>)) as unknown as ReadonlyArray<ReadonlyArray<unknown>>
            },
            catch: (cause) => new SqlError({ reason: classifyError(cause, "Failed to execute statement", "execute") })
          })
        })

      const run = (
        sql: string,
        params: ReadonlyArray<unknown>,
        raw = false
      ) =>
        Effect.flatMap(
          Cache.get(prepareCache, sql),
          (s) => runStatement(s, params, raw)
        )

      const runValues = (
        sql: string,
        params: ReadonlyArray<unknown>
      ) =>
        Effect.acquireUseRelease(
          Cache.get(prepareCache, sql),
          (statement) => {
            statement.setReturnArrays(true)
            return runStatementValues(statement, params)
          },
          (statement) => Effect.sync(() => statement.setReturnArrays(false))
        )

      const runValuesUnprepared = (
        sql: string,
        params: ReadonlyArray<unknown>
      ) => Effect.flatMap(prepare(sql), (statement) => runStatementValuesUnprepared(statement, params))

      return identity<SqliteConnection>({
        isTransaction: () => db.isTransaction,
        execute(sql, params, transformRows) {
          return transformRows
            ? Effect.map(run(sql, params), transformRows)
            : run(sql, params)
        },
        executeRaw(sql, params) {
          return run(sql, params, true)
        },
        executeValues(sql, params) {
          return runValues(sql, params)
        },
        executeValuesUnprepared(sql, params) {
          return runValuesUnprepared(sql, params)
        },
        executeUnprepared(sql, params, transformRows) {
          const effect = Effect.flatMap(prepare(sql), (statement) => runStatement(statement, params ?? [], false))
          return transformRows ? Effect.map(effect, transformRows) : effect
        },
        executeStream(_sql, _params) {
          return Stream.die("executeStream not implemented")
        },
        backup(destination) {
          return Effect.suspend(() => {
            let totalPages = 0
            return Effect.tryPromise({
              try: () =>
                backupDatabase(db, destination, {
                  progress: (progress) => {
                    totalPages = progress.totalPages
                  }
                }).then((pages): BackupMetadata => ({ totalPages: totalPages || pages, remainingPages: 0 })),
              catch: (cause) => new SqlError({ reason: classifyError(cause, "Failed to backup database", "backup") })
            })
          })
        },
        loadExtension(path) {
          return Effect.acquireUseRelease(
            Effect.sync(() => db.enableLoadExtension(true)),
            () =>
              Effect.try({
                try: () => db.loadExtension(path),
                catch: (cause) =>
                  new SqlError({ reason: classifyError(cause, "Failed to load extension", "loadExtension") })
              }),
            () => Effect.sync(() => db.enableLoadExtension(false))
          )
        }
      })
    })

    const connection = yield* makeConnection
    const { acquirer, onCommitFailure, transactionAcquirer } = Client.makeSqliteAcquirers({
      connection: Effect.succeed(connection),
      semaphore: yield* Semaphore.make(1),
      isTransaction: (conn) => conn.isTransaction()
    })

    return Object.assign(
      (yield* Client.make({
        acquirer,
        compiler,
        transactionAcquirer,
        onCommitFailure,
        releaseSavepoint: (name) => `RELEASE SAVEPOINT ${name}`,
        beginTransaction: options.readonly === true ? "BEGIN" : "BEGIN IMMEDIATE",
        spanAttributes: [
          ...(options.spanAttributes ? Object.entries(options.spanAttributes) : []),
          [ATTR_DB_SYSTEM_NAME, "sqlite"]
        ],
        transformRows
      })) as SqliteClient,
      {
        [TypeId]: TypeId as TypeId,
        config: options,
        backup: (destination: string) => Effect.flatMap(acquirer, (_) => _.backup(destination)),
        loadExtension: (path: string) => Effect.flatMap(acquirer, (_) => _.loadExtension(path))
      }
    )
  })

/**
 * Builds a layer from an Effect `Config` value, providing both the node `SqliteClient` service and the generic `SqlClient` service.
 *
 * @category layers
 * @since 4.0.0
 */
export const layerConfig = (
  config: Config.Wrap<SqliteClientConfig>
): Layer.Layer<SqliteClient | Client.SqlClient, Config.ConfigError | SqlError> =>
  Layer.effectContext(
    Config.unwrap(config).pipe(
      Effect.flatMap(make),
      Effect.map((client) =>
        Context.make(SqliteClient, client).pipe(
          Context.add(Client.SqlClient, client)
        )
      )
    )
  ).pipe(Layer.provide(Reactivity.layer))

/**
 * Builds a layer from a node SQLite client configuration, providing both `SqliteClient` and the generic `SqlClient` service.
 *
 * @category layers
 * @since 4.0.0
 */
export const layer = (
  config: SqliteClientConfig
): Layer.Layer<SqliteClient | Client.SqlClient, SqlError> =>
  Layer.effectContext(
    Effect.map(make(config), (client) =>
      Context.make(SqliteClient, client).pipe(
        Context.add(Client.SqlClient, client)
      ))
  ).pipe(Layer.provide(Reactivity.layer))

// internal

const classifyError = (cause: unknown, message: string, operation: string) =>
  classifySqliteError(sqliteCauseWithErrno(cause), { message, operation })

const sqliteCauseWithErrno = (cause: unknown): unknown => {
  if (typeof cause !== "object" || cause === null || !("errcode" in cause) || "errno" in cause) {
    return cause
  }
  const errcode = (cause as { readonly errcode: unknown }).errcode
  if (typeof errcode !== "number") {
    return cause
  }
  return Object.assign(cause, { errno: errcode })
}
