/**
 * Connects Effect SQL to SQLite when running on Bun, using `bun:sqlite`.
 *
 * This module opens a SQLite database and exposes it as both `SqliteClient` and
 * the generic Effect SQL client. It serializes access to the database, enables
 * WAL mode unless disabled, and waits up to five seconds for busy databases by
 * default. Explicit transactions on writable connections use `BEGIN IMMEDIATE`
 * to avoid read-to-write lock upgrades, which serializes them behind other
 * writers even when they only read. Clients opened with `readonly: true` are
 * unaffected. Busy waits block the event loop because `bun:sqlite` is
 * synchronous. Database export and extension loading are supported; streaming
 * queries and `updateValues` are not.
 *
 * @since 4.0.0
 */
import { constants, Database } from "bun:sqlite"
import * as Clock from "effect/Clock"
import * as Config from "effect/Config"
import * as Context from "effect/Context"
import * as Duration from "effect/Duration"
import * as Effect from "effect/Effect"
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

const ATTR_DB_SYSTEM_NAME = "db.system.name"
const MAX_BUSY_TIMEOUT = 2_147_483_647
const NANOS_PER_MILLI = BigInt(1_000_000)

const classifyError = (cause: unknown, message: string, operation: string) =>
  classifySqliteError(cause, { message, operation })

/**
 * Runtime type identifier used to mark Bun `SqliteClient` values.
 *
 * @category type IDs
 * @since 4.0.0
 */
export const TypeId: TypeId = "~@effect/sql-sqlite-bun/SqliteClient"

/**
 * Type-level identifier used to mark Bun `SqliteClient` values.
 *
 * @category type IDs
 * @since 4.0.0
 */
export type TypeId = "~@effect/sql-sqlite-bun/SqliteClient"

/**
 * Bun SQLite client service, extending `SqlClient` with database export and extension loading helpers. `updateValues` is not supported.
 *
 * @category services
 * @since 4.0.0
 */
export interface SqliteClient extends Client.SqlClient {
  readonly [TypeId]: TypeId
  readonly config: SqliteClientConfig
  readonly export: Effect.Effect<Uint8Array, SqlError>
  readonly loadExtension: (path: string) => Effect.Effect<void, SqlError>

  /** Not supported in sqlite */
  readonly updateValues: never
}

/**
 * Service tag for the Bun SQLite client service.
 *
 * **When to use**
 *
 * Use to access or provide a Bun SQLite client through the Effect context.
 *
 * @category services
 * @since 4.0.0
 */
export const SqliteClient = Context.Service<SqliteClient>("@effect/sql-sqlite-bun/Client")

/**
 * Configuration for a Bun SQLite client, including filename, open mode flags, WAL and busy timeout behavior, span attributes, and query/result name transforms.
 *
 * @category models
 * @since 4.0.0
 */
export interface SqliteClientConfig {
  readonly filename: string
  readonly readonly?: boolean | undefined
  readonly create?: boolean | undefined
  readonly readwrite?: boolean | undefined
  readonly disableWAL?: boolean | undefined
  /**
   * How long SQLite waits when the database is busy. Defaults to 5 seconds.
   * `Duration.infinity` is clamped to SQLite's maximum timeout.
   * Waiting blocks the event loop because `bun:sqlite` is synchronous.
   */
  readonly busyTimeout?: Duration.Input | undefined

  readonly spanAttributes?: Record<string, unknown> | undefined

  readonly transformResultNames?: ((str: string) => string) | undefined
  readonly transformQueryNames?: ((str: string) => string) | undefined
}

interface SqliteConnection extends Connection {
  readonly isTransaction: () => boolean
  readonly export: Effect.Effect<Uint8Array, SqlError>
  readonly loadExtension: (path: string) => Effect.Effect<void, SqlError>
}

/**
 * Creates a scoped Bun SQLite client for a database file, enabling WAL and a 5-second busy timeout by default. Explicit transactions on writable connections take the write lock for their duration, even when they only read; clients opened with `readonly: true` are unaffected. Streaming queries are not implemented.
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
      const readonly = options.readonly === true
      const openOptions = {
        readonly,
        readwrite: readonly ? false : options.readwrite ?? true,
        create: readonly ? false : options.create ?? true
      }
      const db = yield* Effect.acquireRelease(
        Effect.try({
          try: () =>
            new Database(
              options.filename,
              options.filename.startsWith("file:")
                ? constants.SQLITE_OPEN_URI |
                  (openOptions.readonly ? constants.SQLITE_OPEN_READONLY : 0) |
                  (openOptions.readwrite || openOptions.create ? constants.SQLITE_OPEN_READWRITE : 0) |
                  (openOptions.create ? constants.SQLITE_OPEN_CREATE : 0)
                : openOptions
            ),
          catch: (cause) => new SqlError({ reason: classifyError(cause, "Failed to open database", "connect") })
        }),
        (db) => Effect.sync(() => db.close())
      )
      const busyTimeout = Math.min(
        MAX_BUSY_TIMEOUT,
        Math.max(0, Math.round(Duration.toMillis(options.busyTimeout ?? Duration.seconds(5))))
      )
      const exec = (sql: string) =>
        Effect.try({
          try: () => db.run(sql),
          catch: (cause) => new SqlError({ reason: classifyError(cause, "Failed to configure database", "connect") })
        })
      yield* exec(`PRAGMA busy_timeout = ${busyTimeout};`)

      if (options.disableWAL !== true && !readonly) {
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
          Effect.andThen(exec("PRAGMA journal_mode = WAL;")),
          Effect.retry({
            while: (error) =>
              error.reason._tag === "LockTimeoutError" && Effect.map(remainingMillis, (remaining) => remaining > 0),
            schedule: Schedule.spaced("10 millis")
          })
        )
        yield* exec(`PRAGMA busy_timeout = ${busyTimeout}`)
      }

      const prepare = (sql: string, useSafeIntegers: boolean) => {
        const statement = db.query(sql)
        // @ts-ignore bun-types missing safeIntegers method, fixed in https://github.com/oven-sh/bun/pull/26627
        statement.safeIntegers(useSafeIntegers)
        return statement
      }

      const run = (
        sql: string,
        params: ReadonlyArray<unknown> = []
      ) =>
        Effect.withFiber<Array<any>, SqlError>((fiber) => {
          const useSafeIntegers = Context.get(fiber.context, Client.SafeIntegers)
          try {
            return Effect.succeed((prepare(sql, useSafeIntegers).all(...(params as any)) ?? []) as Array<any>)
          } catch (cause) {
            return Effect.fail(new SqlError({ reason: classifyError(cause, "Failed to execute statement", "execute") }))
          }
        })

      const runValues = (
        sql: string,
        params: ReadonlyArray<unknown> = []
      ) =>
        Effect.withFiber<Array<any>, SqlError>((fiber) => {
          const useSafeIntegers = Context.get(fiber.context, Client.SafeIntegers)
          try {
            return Effect.succeed((prepare(sql, useSafeIntegers).values(...(params as any)) ?? []) as Array<any>)
          } catch (cause) {
            return Effect.fail(
              new SqlError({ reason: classifyError(cause, "Failed to execute statement", "executeValues") })
            )
          }
        })

      return identity<SqliteConnection>({
        isTransaction: () => db.inTransaction,
        execute(sql, params, transformRows) {
          return transformRows
            ? Effect.map(run(sql, params), transformRows)
            : run(sql, params)
        },
        executeRaw(sql, params) {
          return run(sql, params)
        },
        executeValues(sql, params) {
          return runValues(sql, params)
        },
        executeValuesUnprepared(sql, params) {
          return runValues(sql, params)
        },
        executeUnprepared(sql, params, transformRows) {
          return this.execute(sql, params, transformRows)
        },
        executeStream(_sql, _params) {
          return Stream.die("executeStream not implemented")
        },
        export: Effect.try({
          try: () => db.serialize(),
          catch: (cause) => new SqlError({ reason: classifyError(cause, "Failed to export database", "export") })
        }),
        loadExtension: (path) =>
          Effect.try({
            try: () => db.loadExtension(path),
            catch: (cause) =>
              new SqlError({ reason: classifyError(cause, "Failed to load extension", "loadExtension") })
          })
      })
    })

    const connection = yield* makeConnection
    const { acquirer, onCommitFailure, transactionAcquirer } = Client.makeSqliteAcquirers({
      connection: Effect.succeed(connection),
      semaphore: yield* Semaphore.make(1),
      isTransaction: (conn) => conn.isTransaction()
    })

    const client: SqliteClient = Object.assign(
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
        export: Effect.withFiber((fiber) =>
          Context.getOption(fiber.context, client.transactionService)._tag === "Some"
            ? connection.export
            : Effect.flatMap(acquirer, (_) => _.export)
        ),
        loadExtension: (path: string) => Effect.flatMap(acquirer, (_) => _.loadExtension(path))
      }
    )
    return client
  })

/**
 * Creates a layer from a `Config`-wrapped Bun SQLite client configuration, providing both `SqliteClient` and `SqlClient`.
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
 * Creates a layer from a concrete Bun SQLite client configuration, providing both `SqliteClient` and `SqlClient`.
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
