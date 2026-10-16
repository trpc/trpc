/**
 * Connects Effect SQL to SQLite storage inside Cloudflare Durable Objects.
 *
 * Provides `SqliteClient` and the generic `SqlClient` service. Pass `db` for
 * queries only, or `storage` for transactions and migrations. SQLite blobs are
 * returned as `Uint8Array`; `updateValues` is unsupported.
 *
 * The outer transaction holds the connection semaphore until storage completes.
 * Nested `withTransaction` calls reuse that connection and call
 * `storage.transaction()` without emitting transaction SQL. Child failures and
 * interruptions roll back the child; uncaught failures also roll back the parent.
 *
 * Concurrent sibling transactions are unsupported. Fibers inheriting the
 * transaction context must finish their transaction work before the enclosing
 * transaction exits; later use can bypass the connection semaphore.
 *
 * @stability unstable
 * @since 4.0.0
 */
import type { DurableObjectStorage, SqlStorage } from "@cloudflare/workers-types"
import * as Cause from "effect/Cause"
import * as Config from "effect/Config"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Fiber from "effect/Fiber"
import { identity } from "effect/Function"
import * as Layer from "effect/Layer"
import * as Reactivity from "effect/reactivity/Reactivity"
import * as Rec from "effect/Record"
import * as Scheduler from "effect/Scheduler"
import * as Scope from "effect/Scope"
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

const makeStorageBackedWithTransaction = (
  storage: DurableObjectStorage,
  connection: Connection,
  semaphore: Semaphore.Semaphore
): Client.SqlClient["withTransaction"] =>
<R, E, A>(effect: Effect.Effect<A, E, R>): Effect.Effect<A, E | SqlError, R> =>
  Effect.withFiber((fiber) => {
    const services = fiber.context
    const connOption = Context.getOption(services, SqliteTransaction)
    if (connOption._tag === "Some" && connOption.value[0] !== connection) {
      return Effect.fail(
        unsupportedTransaction(
          "Transactions cannot use a connection from a different SQLite client",
          "transaction"
        )
      )
    }
    const depth = connOption._tag === "Some" ? connOption.value[1] + 1 : 0

    const effectWithTxn = Effect.provideContext(
      effect,
      Context.add(services, SqliteTransaction, [connection, depth] as const)
    )

    const transaction = Effect.callback<A, E | SqlError, R>((resume) => {
      let interrupted = false
      const promise = storage.transaction((txn) =>
        new Promise<void>((resolve) => {
          if (interrupted) return resolve()
          resume(Effect.onExit(effectWithTxn, (exit) => {
            if (Exit.isFailure(exit)) {
              txn.rollback()
            }
            // Throwing from a child callback can abort its parent.
            resolve()
            return Effect.flatten(Effect.promise(() => promise))
          }))
        })
      ).then(
        () => Exit.void,
        (cause) => {
          const exit = Exit.fail(new SqlError({ reason: classifyError(cause, "Failed transaction", "transaction") }))
          // Report rejection before the transaction callback starts; later resumes are ignored.
          resume(exit)
          return exit
        }
      )
      return Effect.suspend(() => {
        interrupted = true
        return Effect.asVoid(Effect.promise(() => promise))
      })
    })
    return connOption._tag === "Some" ? transaction : semaphore.withPermits(1)(transaction)
  }).pipe(
    // The storage transaction closes the input gate, blocking dispatcher tasks until it completes.
    Effect.provideService(Scheduler.PreventSchedulerYield, true)
  )

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

    const acquirer = semaphore.withPermits(1)(Effect.succeed(connection))
    const transactionAcquirer = Effect.uninterruptibleMask((restore) => {
      const fiber = Fiber.getCurrent()!
      const scope = Context.getUnsafe(fiber.context, Scope.Scope)
      return Effect.as(
        Effect.tap(
          restore(semaphore.take(1)),
          () => Scope.addFinalizer(scope, semaphore.release(1))
        ),
        connection
      )
    })

    const client = (yield* Client.make({
      acquirer,
      compiler,
      transactionAcquirer,
      transactionService: SqliteTransaction,
      spanAttributes: [
        ...(options.spanAttributes ? Object.entries(options.spanAttributes) : []),
        [ATTR_DB_SYSTEM_NAME, "sqlite"]
      ],
      transformRows
    })) as SqliteClient

    return Object.assign(client, {
      [TypeId]: TypeId as TypeId,
      config: options,
      withTransaction: options.storage
        ? makeStorageBackedWithTransaction(options.storage, connection, semaphore)
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
