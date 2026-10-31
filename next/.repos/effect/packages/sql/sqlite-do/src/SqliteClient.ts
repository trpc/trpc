/**
 * Connects Effect SQL to SQLite storage inside Cloudflare Durable Objects.
 *
 * Provides `SqliteClient` and the generic `SqlClient` service. Pass `db` for
 * queries only, or `storage` for transactions and migrations. SQLite blobs are
 * returned as `Uint8Array`; `updateValues` is unsupported.
 *
 * Transactions use `storage.transaction()` instead of transaction SQL, and
 * hold the connection until storage completes. A failed or interrupted nested
 * transaction rolls back only itself, unless the failure reaches the parent.
 *
 * Fibers that inherit the transaction context must finish their transaction
 * work before the transaction exits; later use can bypass the connection
 * semaphore.
 *
 * @stability unstable
 * @since 4.0.0
 */
import type { DurableObjectStorage, DurableObjectTransaction, SqlStorage } from "@cloudflare/workers-types"
import * as Cause from "effect/Cause"
import * as Config from "effect/Config"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import { identity } from "effect/Function"
import * as Layer from "effect/Layer"
import * as Reactivity from "effect/reactivity/Reactivity"
import * as Rec from "effect/Record"
import * as Scheduler from "effect/Scheduler"
import type * as Scope from "effect/Scope"
import * as Semaphore from "effect/Semaphore"
import * as Client from "effect/sql/SqlClient"
import type { Connection } from "effect/sql/SqlConnection"
import { classifySqliteError, SqlError, UnknownError } from "effect/sql/SqlError"
import * as Statement from "effect/sql/Statement"
import * as Stream from "effect/Stream"

const ATTR_DB_SYSTEM_NAME = "db.system.name"

const classifyError = (cause: unknown, message: string, operation: string) =>
  classifySqliteError(cause, { message, operation })

/**
 * Runtime type identifier used to mark Cloudflare Durable Object `SqliteClient` values.
 *
 * @stability unstable
 * @category type IDs
 * @since 4.0.0
 */
export const TypeId: TypeId = "~@effect/sql-sqlite-do/SqliteClient"

/**
 * Type-level identifier used to mark Cloudflare Durable Object `SqliteClient` values.
 *
 * @stability unstable
 * @category type IDs
 * @since 4.0.0
 */
export type TypeId = "~@effect/sql-sqlite-do/SqliteClient"

/**
 * Cloudflare Durable Object SQLite client service, extending `SqlClient` with its configuration. `updateValues` is not supported.
 *
 * @stability unstable
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
 * Service tag for the Cloudflare Durable Object SQLite client service.
 *
 * **When to use**
 *
 * Use to access or provide a Durable Object SQLite client through the Effect
 * context.
 *
 * @stability unstable
 * @category services
 * @since 4.0.0
 */
export const SqliteClient = Context.Service<SqliteClient>("@effect/sql-sqlite-do/SqliteClient")

const SqliteTransaction = Context.Service<Client.TransactionConnection, Client.TransactionConnection.Service>(
  "@effect/sql-sqlite-do/SqliteClient/SqliteTransaction"
)

/**
 * Configuration for a Cloudflare Durable Object SQLite client, including either a `SqlStorage` handle or the full `DurableObjectStorage` for transaction support, span attributes, and query/result name transforms.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface SqliteClientConfig {
  readonly db?: SqlStorage | undefined
  readonly storage?: DurableObjectStorage | undefined
  readonly spanAttributes?: Record<string, unknown> | undefined

  readonly transformResultNames?: ((str: string) => string) | undefined
  readonly transformQueryNames?: ((str: string) => string) | undefined
}

const unsupportedTransaction = (message: string, operation: string) =>
  new SqlError({
    reason: new UnknownError({
      cause: new Error(message),
      message,
      operation
    })
  })

const makeUnsupportedWithTransaction =
  (message: string): Client.SqlClient["withTransaction"] =>
  <R, E, A>(_effect: Effect.Effect<A, E, R>): Effect.Effect<A, E | SqlError, R> =>
    Effect.fail(unsupportedTransaction(message, "transaction"))

interface StorageLevel {
  readonly txn: DurableObjectTransaction
  readonly resolve: () => void
  readonly done: Promise<Exit.Exit<void, SqlError>>
}

const makeStorageBackedWithTransaction = (
  storage: DurableObjectStorage,
  connection: Connection,
  acquirer: Effect.Effect<Connection, never, Scope.Scope>,
  spanAttributes: ReadonlyArray<readonly [string, unknown]>
): Client.SqlClient["withTransaction"] => {
  // The open storage transaction at each depth. Transactions at the same depth
  // never overlap.
  const levels: Array<StorageLevel> = []

  // Parks the storage callback so the body runs on the fiber.
  const open = (id: number) =>
    Effect.callback<void, SqlError>((resume) => {
      const done: Promise<Exit.Exit<void, SqlError>> = storage.transaction((txn) =>
        new Promise<void>((resolve) => {
          resume(Effect.sync(() => {
            levels[id] = { txn, resolve, done }
          }))
        })
      ).then(
        () => Exit.void,
        (cause) => {
          const exit = Exit.fail(new SqlError({ reason: classifyError(cause, "Failed transaction", "transaction") }))
          // Only takes effect if storage rejects before the callback starts.
          resume(exit)
          return exit
        }
      )
    })

  const close = (id: number) =>
    Effect.suspend(() => {
      const level = levels[id]
      levels.length = id
      level.resolve()
      return Effect.flatten(Effect.promise(() => level.done))
    })

  // Uses `txn.rollback()` because rejecting a nested callback can abort its parent.
  const rollback = (id: number) => Effect.sync(() => levels[id].txn.rollback())

  const withTransaction = Client.makeWithTransaction({
    transactionService: SqliteTransaction,
    spanAttributes,
    acquireConnection: (restore) => restore(acquirer),
    begin: () => open(0),
    savepoint: (_, id) => open(id),
    releaseSavepoint: (_, id) => close(id),
    commit: () => close(0),
    rollback: () => Effect.andThen(rollback(0), close(0)),
    // `releaseSavepoint` runs next and closes the level.
    rollbackSavepoint: (_, id) => rollback(id)
  })

  return <R, E, A>(effect: Effect.Effect<A, E, R>): Effect.Effect<A, E | SqlError, R> =>
    Effect.withFiber((fiber) => {
      const conn = Context.getOrUndefined(fiber.context, SqliteTransaction)
      if (conn !== undefined && conn[0] !== connection) {
        return Effect.fail(
          unsupportedTransaction(
            "Transactions cannot use a connection from a different SQLite client",
            "transaction"
          )
        )
      }
      return withTransaction(effect)
    }).pipe(
      // The storage transaction closes the input gate, blocking dispatcher tasks until it completes.
      Effect.provideService(Scheduler.PreventSchedulerYield, true)
    )
}

/**
 * Creates a scoped Cloudflare Durable Object SQLite client around Durable Object SQLite storage, serializing access and converting returned `ArrayBuffer` values to `Uint8Array`.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const make = (
  options: SqliteClientConfig
): Effect.Effect<SqliteClient, never, Scope.Scope | Reactivity.Reactivity> =>
  Effect.gen(function*() {
    const compiler = Statement.makeCompilerSqlite(options.transformQueryNames)
    const transformRows = options.transformResultNames
      ? Statement.defaultTransforms(options.transformResultNames).array
      : undefined
    const db = options.storage?.sql ?? options.db

    if (db === undefined) {
      return yield* Effect.die("SqliteClient.make requires either a Durable Object storage or sql storage")
    }
    const sqlStorage = db

    const makeConnection = Effect.gen(function*() {
      function* runIterator(
        sql: string,
        params: ReadonlyArray<unknown> = []
      ) {
        const cursor = sqlStorage.exec(sql, ...params)
        const columns = cursor.columnNames
        for (const result of cursor.raw()) {
          const obj: any = {}
          for (let i = 0; i < columns.length; i++) {
            const value = result[i]
            Rec.assignProperty(obj, columns[i], value instanceof ArrayBuffer ? new Uint8Array(value) : value)
          }
          yield obj
        }
      }

      const runStatement = (
        sql: string,
        params: ReadonlyArray<unknown> = []
      ): Effect.Effect<ReadonlyArray<any>, SqlError, never> =>
        Effect.try({
          try: () => Array.from(runIterator(sql, params)),
          catch: (cause) => new SqlError({ reason: classifyError(cause, "Failed to execute statement", "execute") })
        })

      const runValues = (
        sql: string,
        params: ReadonlyArray<unknown> = []
      ): Effect.Effect<ReadonlyArray<any>, SqlError, never> =>
        Effect.try({
          try: () =>
            Array.from(sqlStorage.exec(sql, ...params).raw(), (row) => {
              for (let i = 0; i < row.length; i++) {
                const value = row[i]
                if (value instanceof ArrayBuffer) {
                  row[i] = new Uint8Array(value) as any
                }
              }
              return row
            }),
          catch: (cause) => new SqlError({ reason: classifyError(cause, "Failed to execute statement", "execute") })
        })

      return identity<Connection>({
        execute(sql, params, transformRows) {
          return transformRows
            ? Effect.map(runStatement(sql, params), transformRows)
            : runStatement(sql, params)
        },
        executeRaw(sql, params) {
          return runStatement(sql, params)
        },
        executeValues(sql, params) {
          return runValues(sql, params)
        },
        executeValuesUnprepared(sql, params) {
          return runValues(sql, params)
        },
        executeUnprepared(sql, params, transformRows) {
          return transformRows
            ? Effect.map(runStatement(sql, params), transformRows)
            : runStatement(sql, params)
        },
        executeStream(sql, params, transformRows) {
          return Stream.suspend(() => {
            const iterator = runIterator(sql, params)
            return Stream.fromIteratorSucceed(iterator, 128)
          }).pipe(
            Stream.catchCauseFilter(Cause.findDefect, (defect) =>
              Stream.fail(
                new SqlError({
                  reason: classifyError(defect, "Failed to execute statement", "execute")
                })
              )),
            transformRows
              ? Stream.mapArray((chunk) => transformRows(chunk) as any)
              : identity
          )
        }
      })
    })

    const semaphore = yield* Semaphore.make(1)
    const connection = yield* makeConnection

    // Streams and reservations hold the permit until their scope closes.
    const acquirer = Effect.as(
      Effect.acquireRelease(semaphore.take(1), () => semaphore.release(1), { interruptible: true }),
      connection
    )

    const spanAttributes: ReadonlyArray<readonly [string, unknown]> = [
      ...(options.spanAttributes ? Object.entries(options.spanAttributes) : []),
      [ATTR_DB_SYSTEM_NAME, "sqlite"]
    ]

    const client = (yield* Client.make({
      driver: "sqlite-do",
      acquirer,
      borrower: (f) => semaphore.withPermit(f(connection)),
      compiler,
      transactionService: SqliteTransaction,
      spanAttributes,
      transformRows
    })) as SqliteClient

    return Object.assign(client, {
      [TypeId]: TypeId as TypeId,
      config: options,
      withTransaction: options.storage
        ? makeStorageBackedWithTransaction(options.storage, connection, acquirer, spanAttributes)
        : makeUnsupportedWithTransaction(
          "Transactions require Durable Object storage; pass ctx.storage as the storage option"
        )
    })
  })

/**
 * Creates a layer from a `Config`-wrapped Durable Object SQLite client configuration, providing both `SqliteClient` and `SqlClient`.
 *
 * @stability unstable
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
 * Creates a layer from a concrete Durable Object SQLite client configuration, providing both `SqliteClient` and `SqlClient`.
 *
 * @stability unstable
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
