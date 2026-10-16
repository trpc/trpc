/**
 * Connects Effect SQL to SQLite in React Native using
 * `@op-engineering/op-sqlite`.
 *
 * This module opens an on-device SQLite database and exposes it as both
 * `SqliteClient` and the generic Effect SQL client. It serializes access,
 * supports normal and value-based queries, and uses the driver's synchronous
 * query API by default. `AsyncQuery` and `withAsyncQuery` switch a scoped effect
 * to the driver's asynchronous query API. Streaming queries and `updateValues`
 * are not supported by this driver.
 *
 * @since 4.0.0
 */
import * as Sqlite from "@op-engineering/op-sqlite"
import * as Config from "effect/Config"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import { constFalse, identity } from "effect/Function"
import * as Layer from "effect/Layer"
import * as Reactivity from "effect/reactivity/Reactivity"
import type * as Scope from "effect/Scope"
import * as Semaphore from "effect/Semaphore"
import * as Client from "effect/sql/SqlClient"
import type { Connection } from "effect/sql/SqlConnection"
import { classifySqliteError, SqlError } from "effect/sql/SqlError"
import * as Statement from "effect/sql/Statement"
import * as Stream from "effect/Stream"

const ATTR_DB_SYSTEM_NAME = "db.system.name"

// `open` is still exported at runtime in v18, but is missing from the package's
// root type declarations.
interface OpenOptions {
  name: string
  location?: string
  encryptionKey?: string
}

const open = (Sqlite as typeof Sqlite & {
  readonly open: (options: OpenOptions) => Sqlite.DB
}).open

const classifyError = (cause: unknown, message: string, operation: string) =>
  classifySqliteError(cause, { message, operation })

/**
 * Runtime identifier attached to SQLite React Native client values.
 *
 * @category type IDs
 * @since 4.0.0
 */
export const TypeId: TypeId = "~@effect/sql-sqlite-react-native/SqliteClient"

/**
 * Type-level identifier for SQLite React Native client values.
 *
 * @category type IDs
 * @since 4.0.0
 */
export type TypeId = "~@effect/sql-sqlite-react-native/SqliteClient"

/**
 * React Native SQLite client service interface, extending `SqlClient` with its configuration and marking `updateValues` as unsupported for SQLite.
 *
 * @category services
 * @since 4.0.0
 */
export interface SqliteClient extends Client.SqlClient {
  readonly [TypeId]: TypeId
  readonly config: SqliteClientConfig

  /** Not supported in sqlite */
  readonly updateValues: never
}

/**
 * Service tag for the React Native SQLite client.
 *
 * @category services
 * @since 4.0.0
 */
export const SqliteClient = Context.Service<SqliteClient>("@effect/sql-sqlite-react-native/SqliteClient")

/**
 * Configuration for a React Native SQLite client, including the database filename, optional location and encryption key, span attributes, and query/result name transforms.
 *
 * @category models
 * @since 4.0.0
 */
export interface SqliteClientConfig {
  readonly filename: string
  readonly location?: string | undefined
  readonly encryptionKey?: string | undefined
  readonly spanAttributes?: Record<string, unknown> | undefined
  readonly transformResultNames?: ((str: string) => string) | undefined
  readonly transformQueryNames?: ((str: string) => string) | undefined
}

/**
 * Fiber reference that makes the React Native SQLite client run queries through the asynchronous `execute` API instead of `executeSync`.
 *
 * **When to use**
 *
 * Use to switch React Native SQLite query execution to the asynchronous driver
 * API for a scoped effect.
 *
 * @category services
 * @since 4.0.0
 */
export const AsyncQuery = Context.Reference<boolean>(
  "@effect/sql-sqlite-react-native/Client/asyncQuery",
  { defaultValue: constFalse }
)

/**
 * Runs an effect with `AsyncQuery` enabled, causing React Native SQLite queries in that effect to use the asynchronous driver API.
 *
 * @category providing services
 * @since 4.0.0
 */
export const withAsyncQuery = <R, E, A>(effect: Effect.Effect<A, E, R>) =>
  Effect.provideService(effect, AsyncQuery, true)

interface SqliteConnection extends Connection {}

/**
 * Creates a scoped React Native SQLite client from the supplied configuration, using a single serialized connection and honoring `AsyncQuery` for query execution.
 *
 * @category constructors
 * @since 4.0.0
 */
export const make = (
  options: SqliteClientConfig
): Effect.Effect<SqliteClient, never, Scope.Scope | Reactivity.Reactivity> =>
  Effect.gen(function*() {
    const clientOptions: Parameters<typeof open>[0] = {
      name: options.filename
    }
    if (options.location) {
      clientOptions.location = options.location
    }
    if (options.encryptionKey) {
      clientOptions.encryptionKey = options.encryptionKey
    }

    const compiler = Statement.makeCompilerSqlite(options.transformQueryNames)
    const transformRows = options.transformResultNames ?
      Statement.defaultTransforms(options.transformResultNames).array :
      undefined

    const makeConnection = Effect.gen(function*() {
      const db = open(clientOptions) as DB
      yield* Effect.addFinalizer(() => Effect.sync(() => db.close()))

      const run = (
        sql: string,
        params: ReadonlyArray<unknown> = []
      ) =>
        Effect.withFiber<Array<any>, SqlError>((fiber) => {
          if (fiber.getRef(AsyncQuery)) {
            return Effect.map(
              Effect.tryPromise({
                try: () => db.execute(sql, params as Array<any>),
                catch: (cause) =>
                  new SqlError({ reason: classifyError(cause, "Failed to execute statement (async)", "execute") })
              }),
              (result) => result.rows
            )
          }
          return Effect.try({
            try: () => db.executeSync(sql, params as Array<any>).rows,
            catch: (cause) => new SqlError({ reason: classifyError(cause, "Failed to execute statement", "execute") })
          })
        })

      const runValues = (
        sql: string,
        params: ReadonlyArray<unknown> = []
      ) =>
        Effect.withFiber<Array<any>, SqlError>((fiber) => {
          if (fiber.getRef(AsyncQuery)) {
            return Effect.map(
              Effect.tryPromise({
                try: () => db.executeRaw(sql, params as Array<any>),
                catch: (cause) =>
                  new SqlError({ reason: classifyError(cause, "Failed to execute statement (async)", "execute") })
              }),
              (result) => result.rawRows
            )
          }
          return Effect.try({
            try: () => db.executeRawSync(sql, params as Array<any>).rawRows,
            catch: (cause) => new SqlError({ reason: classifyError(cause, "Failed to execute statement", "execute") })
          })
        })

      return identity<SqliteConnection>({
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
        executeStream() {
          return Stream.die("executeStream not implemented")
        }
      })
    })

    const { acquirer, onCommitFailure, transactionAcquirer } = Client.makeSqliteAcquirers({
      connection: Effect.succeed(yield* makeConnection),
      semaphore: yield* Semaphore.make(1)
    })

    return Object.assign(
      (yield* Client.make({
        acquirer,
        compiler,
        transactionAcquirer,
        onCommitFailure,
        releaseSavepoint: (name) => `RELEASE SAVEPOINT ${name}`,
        spanAttributes: [
          ...(options.spanAttributes ? Object.entries(options.spanAttributes) : []),
          [ATTR_DB_SYSTEM_NAME, "sqlite"]
        ],
        transformRows
      })) as SqliteClient,
      {
        [TypeId]: TypeId,
        config: options
      }
    )
  })

/**
 * Builds a layer from an Effect `Config` value, providing both the React Native `SqliteClient` service and the generic `SqlClient` service.
 *
 * @category layers
 * @since 4.0.0
 */
export const layerConfig = (
  config: Config.Wrap<SqliteClientConfig>
): Layer.Layer<SqliteClient | Client.SqlClient, Config.ConfigError> =>
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
 * Builds a layer from a React Native SQLite client configuration, providing both `SqliteClient` and the generic `SqlClient` service.
 *
 * @category layers
 * @since 4.0.0
 */
export const layer = (
  config: SqliteClientConfig
): Layer.Layer<SqliteClient | Client.SqlClient> =>
  Layer.effectContext(
    Effect.map(make(config), (client) =>
      Context.make(SqliteClient, client).pipe(
        Context.add(Client.SqlClient, client)
      ))
  ).pipe(Layer.provide(Reactivity.layer))

interface DB {
  close: () => void
  delete: (location?: string) => void
  attach: (params: {
    secondaryDbFileName: string
    alias: string
    location?: string
  }) => void
  detach: (alias: string) => void
  /**
   * Sync version of the execute function
   * It will block the JS thread and therefore your UI and should be used with caution
   *
   * When writing your queries, you can use the ? character as a placeholder for parameters
   * The parameters will be automatically escaped and sanitized
   *
   * Example:
   * db.executeSync('SELECT * FROM table WHERE id = ?', [1]);
   *
   * If you are writing a query that doesn't require parameters, you can omit the second argument
   *
   * If you are writing to the database YOU SHOULD BE USING TRANSACTIONS!
   * Transactions protect you from partial writes and ensure that your data is always in a consistent state
   */
  executeSync: (query: string, params?: Array<any>) => QueryResult
  /**
   * Basic query execution function, it is async don't forget to await it
   *
   * When writing your queries, you can use the ? character as a placeholder for parameters
   * The parameters will be automatically escaped and sanitized
   *
   * Example:
   * await db.execute('SELECT * FROM table WHERE id = ?', [1]);
   *
   * If you are writing a query that doesn't require parameters, you can omit the second argument
   *
   * If you are writing to the database YOU SHOULD BE USING TRANSACTIONS!
   * Transactions protect you from partial writes and ensure that your data is always in a consistent state
   *
   * If you need a large amount of queries ran as fast as possible you should be using `executeBatch`, `executeRaw`, `loadFile` or `executeWithHostObjects`
   */
  execute: (query: string, params?: Array<any>) => Promise<QueryResult>
  /**
   * Loads a runtime loadable sqlite extension. Libsql and iOS embedded version do not support loading extensions
   */
  loadExtension: (path: string, entryPoint?: string) => void
  /**
   * Same as `execute` except the results are not returned in objects but rather in arrays with just the values and not the keys
   * It will be faster since a lot of repeated work is skipped and only the values you care about are returned
   */
  executeRaw: (query: string, params?: Array<any>) => Promise<RawQueryResult>
  /**
   * Same as `executeRaw` but it will block the JS thread and therefore your UI and should be used with caution
   * It will return an array of arrays with just the values and not the keys
   */
  executeRawSync: (query: string, params?: Array<any>) => RawQueryResult
  /**
   * Get's the absolute path to the db file. Useful for debugging on local builds and for attaching the DB from users devices
   */
  getDbPath: (location?: string) => string
  /**
   * Reactive execution of queries when data is written to the database. Check the docs for how to use them.
   */
  reactiveExecute: (params: {
    query: string
    arguments: Array<any>
    fireOn: Array<{
      table: string
      ids?: Array<number>
    }>
    callback: (response: any) => void
  }) => () => void
  /** This function is only available for libsql.
   * Allows to trigger a sync the database with it's remote replica
   * In order for this function to work you need to use openSync or openRemote functions
   * with libsql: true in the package.json
   *
   * The database is hosted in turso
   */
  sync: () => void
}

interface RawQueryResult {
  rawRows: Array<Array<any>>
}

interface QueryResult {
  insertId?: number
  rowsAffected: number
  res?: Array<any>
  rows: Array<Record<string, any>>
  // An array of intermediate results, just values without column names
  rawRows?: Array<Array<any>>
  columnNames?: Array<string>
  /**
   * Query metadata, available only for select query results
   */
  metadata?: Array<any>
}
