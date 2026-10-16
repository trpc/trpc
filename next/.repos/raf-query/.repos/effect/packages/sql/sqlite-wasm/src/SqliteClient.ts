/**
 * Connects Effect SQL to SQLite compiled to WebAssembly with
 * `@effect/wa-sqlite`.
 *
 * This module can create an in-memory SQLite database in the current runtime or
 * connect to a worker-backed database, such as the OPFS worker from
 * `OpfsWorker`. Both clients are exposed as `SqliteClient` and the generic
 * Effect SQL client, serialize access, support database import and export, and
 * can install reactivity hooks from SQLite update notifications. In-memory
 * clients can stream query rows; worker-backed clients cannot. `updateValues`
 * is not supported by this driver.
 *
 * @since 4.0.0
 */
// oxlint-disable-next-line effect/no-import-from-barrel-package
import * as WaSqlite from "@effect/wa-sqlite"
import SQLiteESMFactory from "@effect/wa-sqlite/dist/wa-sqlite.mjs"
import { MemoryVFS } from "@effect/wa-sqlite/src/examples/MemoryVFS.js"
import * as Config from "effect/Config"
import * as Context from "effect/Context"
import * as Deferred from "effect/Deferred"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import { identity } from "effect/Function"
import * as Layer from "effect/Layer"
import * as Reactivity from "effect/reactivity/Reactivity"
import * as Rec from "effect/Record"
import * as Scope from "effect/Scope"
import * as ScopedRef from "effect/ScopedRef"
import * as Semaphore from "effect/Semaphore"
import * as Client from "effect/sql/SqlClient"
import type { Connection } from "effect/sql/SqlConnection"
import { classifySqliteError, SqlError } from "effect/sql/SqlError"
import * as Statement from "effect/sql/Statement"
import * as Stream from "effect/Stream"
import type { OpfsWorkerMessage } from "./internal/opfsWorker.ts"

const ATTR_DB_SYSTEM_NAME = "db.system.name"

const classifyError = (cause: unknown, message: string, operation: string) =>
  classifySqliteError(cause, { message, operation })

/**
 * Runtime identifier attached to SQLite WASM client values.
 *
 * @category type IDs
 * @since 4.0.0
 */
export const TypeId: TypeId = "~@effect/sql-sqlite-wasm/SqliteClient"

/**
 * Type-level identifier for SQLite WASM client values.
 *
 * @category type IDs
 * @since 4.0.0
 */
export type TypeId = "~@effect/sql-sqlite-wasm/SqliteClient"

/**
 * SQLite WASM client service interface, extending `SqlClient` with database `export` and `import` operations and marking `updateValues` as unsupported for SQLite.
 *
 * @category services
 * @since 4.0.0
 */
export interface SqliteClient extends Client.SqlClient {
  readonly [TypeId]: TypeId
  readonly config: SqliteClientMemoryConfig
  readonly export: Effect.Effect<Uint8Array, SqlError>
  readonly import: (data: Uint8Array) => Effect.Effect<void, SqlError>

  /** Not supported in sqlite */
  readonly updateValues: never
}

/**
 * Service tag for the SQLite WASM client.
 *
 * @category services
 * @since 4.0.0
 */
export const SqliteClient = Context.Service<SqliteClient>("@effect/sql-sqlite-wasm/SqliteClient")

/**
 * Configuration for an in-memory SQLite WASM client, including optional reactivity hooks, span attributes, and query/result name transforms.
 *
 * @category models
 * @since 4.0.0
 */
export interface SqliteClientMemoryConfig {
  readonly installReactivityHooks?: boolean
  readonly spanAttributes?: Record<string, unknown>
  readonly transformResultNames?: (str: string) => string
  readonly transformQueryNames?: (str: string) => string
}

/**
 * Configuration for a worker-backed SQLite WASM client, including the scoped worker or message port, optional reactivity hooks, span attributes, and query/result name transforms.
 *
 * @category models
 * @since 4.0.0
 */
export interface SqliteClientConfig {
  readonly worker: Effect.Effect<Worker | SharedWorker | MessagePort, never, Scope.Scope>
  readonly installReactivityHooks?: boolean
  readonly spanAttributes?: Record<string, unknown>
  readonly transformResultNames?: (str: string) => string
  readonly transformQueryNames?: (str: string) => string
}

interface SqliteConnection extends Connection {
  readonly export: Effect.Effect<Uint8Array, SqlError>
  readonly import: (data: Uint8Array) => Effect.Effect<void, SqlError>
}

interface SqliteMemoryConnection extends SqliteConnection {
  readonly isTransaction: () => boolean
}

const initModule = Effect.runSync(
  Effect.cached(Effect.promise(() => SQLiteESMFactory()))
)

const initEffect = Effect.runSync(
  Effect.cached(initModule.pipe(Effect.map((module) => WaSqlite.Factory(module))))
)

const registered = new Set<string>()

/**
 * Creates a scoped in-memory SQLite WASM client using the memory VFS, serializing access through a semaphore and exposing database `export` and `import` operations.
 *
 * @category constructors
 * @since 4.0.0
 */
export const makeMemory = (
  options: SqliteClientMemoryConfig
): Effect.Effect<SqliteClient, SqlError, Scope.Scope | Reactivity.Reactivity> =>
  Effect.gen(function*() {
    const reactivity = yield* Reactivity.Reactivity
    const compiler = Statement.makeCompilerSqlite(options.transformQueryNames)
    const transformRows = options.transformResultNames ?
      Statement.defaultTransforms(
        options.transformResultNames
      ).array :
      undefined

    const makeConnection = Effect.gen(function*() {
      const sqlite3 = yield* initEffect

      if (registered.has("memory-vfs") === false) {
        registered.add("memory-vfs")
        const module = yield* initModule
        // @ts-expect-error
        const vfs = new MemoryVFS("memory-vfs", module)
        sqlite3.vfs_register(vfs as any, false)
      }
      const db = yield* Effect.acquireRelease(
        Effect.try({
          try: () => sqlite3.open_v2(":memory:", undefined, "memory-vfs"),
          catch: (cause) => new SqlError({ reason: classifyError(cause, "Failed to open database", "openDatabase") })
        }),
        (db) => Effect.sync(() => sqlite3.close(db))
      )

      if (options.installReactivityHooks) {
        sqlite3.update_hook(db, (_op, _db, table, rowid) => {
          if (!table) return
          const id = String(Number(rowid))
          reactivity.invalidateUnsafe({ [table]: [id] })
        })
      }

      const run = (
        sql: string,
        params: ReadonlyArray<unknown> = [],
        rowMode: "object" | "array" = "object"
      ) =>
        Effect.try({
          try: () => {
            const results: Array<any> = []
            for (const stmt of sqlite3.statements(db, sql)) {
              let columns: Array<string> | undefined
              sqlite3.bind_collection(stmt, params as any)
              while (sqlite3.step(stmt) === WaSqlite.SQLITE_ROW) {
                columns = columns ?? sqlite3.column_names(stmt)
                const row = sqlite3.row(stmt)
                if (rowMode === "object") {
                  const obj: Record<string, any> = {}
                  for (let i = 0; i < columns.length; i++) {
                    Rec.assignProperty(obj, columns[i], row[i])
                  }
                  results.push(obj)
                } else {
                  results.push(row)
                }
              }
            }
            return results
          },
          catch: (cause) => new SqlError({ reason: classifyError(cause, "Failed to execute statement", "execute") })
        })

      return identity<SqliteMemoryConnection>({
        isTransaction: () => sqlite3.get_autocommit(db) === 0,
        execute(sql, params, transformRows) {
          return transformRows
            ? Effect.map(run(sql, params), transformRows)
            : run(sql, params)
        },
        executeRaw(sql, params) {
          return run(sql, params)
        },
        executeValues(sql, params) {
          return run(sql, params, "array")
        },
        executeValuesUnprepared(sql, params) {
          return run(sql, params, "array")
        },
        executeUnprepared(sql, params, transformRows) {
          return this.execute(sql, params, transformRows)
        },
        executeStream(sql, params, transformRows) {
          function* stream() {
            for (const stmt of sqlite3.statements(db, sql)) {
              let columns: Array<string> | undefined
              sqlite3.bind_collection(stmt, params as any)
              while (sqlite3.step(stmt) === WaSqlite.SQLITE_ROW) {
                columns = columns ?? sqlite3.column_names(stmt)
                const row = sqlite3.row(stmt)
                const obj: Record<string, any> = {}
                for (let i = 0; i < columns.length; i++) {
                  Rec.assignProperty(obj, columns[i], row[i])
                }
                yield obj
              }
            }
          }
          return Stream.suspend(() => Stream.fromIteratorSucceed(stream()[Symbol.iterator]())).pipe(
            transformRows
              ? Stream.mapArray((chunk) => transformRows(chunk) as any)
              : identity,
            Stream.mapError((cause) =>
              new SqlError({ reason: classifyError(cause, "Failed to execute statement", "stream") })
            )
          )
        },
        export: Effect.try({
          try: () => sqlite3.serialize(db, "main"),
          catch: (cause) => new SqlError({ reason: classifyError(cause, "Failed to export database", "export") })
        }),
        import(data) {
          return Effect.try({
            try: () => sqlite3.deserialize(db, "main", data, data.length, data.length, 1 | 2),
            catch: (cause) => new SqlError({ reason: classifyError(cause, "Failed to import database", "import") })
          })
        }
      })
    })

    const { acquirer, onCommitFailure, transactionAcquirer } = Client.makeSqliteAcquirers({
      connection: Effect.succeed(yield* makeConnection),
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
        spanAttributes: [
          ...(options.spanAttributes ? Object.entries(options.spanAttributes) : []),
          [ATTR_DB_SYSTEM_NAME, "sqlite"]
        ],
        transformRows
      })) as SqliteClient,
      {
        [TypeId]: TypeId as TypeId,
        config: options,
        export: Effect.scoped(Effect.flatMap(transactionAcquirer, (conn) => conn.export)),
        import(data: Uint8Array) {
          return Effect.scoped(Effect.flatMap(transactionAcquirer, (conn) => conn.import(data)))
        }
      }
    )
  })

/**
 * Creates a scoped worker-backed SQLite WASM client, communicating with the configured worker or message port, restarting the scoped connection on worker errors, and exposing database `export` and `import` operations.
 *
 * @category constructors
 * @since 4.0.0
 */
export const make = (
  options: SqliteClientConfig
): Effect.Effect<SqliteClient, SqlError, Scope.Scope | Reactivity.Reactivity> =>
  Effect.gen(function*() {
    const reactivity = yield* Reactivity.Reactivity
    const compiler = Statement.makeCompilerSqlite(options.transformQueryNames)
    const transformRows = options.transformResultNames ?
      Statement.defaultTransforms(options.transformResultNames).array :
      undefined
    const makeConnection = Effect.gen(function*() {
      let currentId = 0
      const pending = new Map<number, (effect: Exit.Exit<any, SqlError>) => void>()
      const scope = yield* Effect.scope
      const readyDeferred = yield* Deferred.make<void>()

      const worker = yield* options.worker
      const port = "port" in worker ? worker.port : worker
      const postMessage = (message: OpfsWorkerMessage, transferables?: ReadonlyArray<any>) =>
        port.postMessage(message, transferables as any)

      yield* Scope.addFinalizer(scope, Effect.sync(() => postMessage(["close"])))

      const onMessage = (event: any) => {
        const [id, error, results] = event.data
        if (id === "ready") {
          Deferred.doneUnsafe(readyDeferred, Exit.void)
          return
        } else if (id === "update_hook") {
          reactivity.invalidateUnsafe({ [error]: [results] })
          return
        } else {
          const resume = pending.get(id)
          if (!resume) return
          pending.delete(id)
          if (error) {
            resume(
              Exit.fail(
                new SqlError({ reason: classifyError(error, "Failed to execute statement", "execute") })
              )
            )
          } else {
            resume(Exit.succeed(results))
          }
        }
      }
      port.addEventListener("message", onMessage)
      if ("start" in port) {
        port.start()
      }

      function onError(cause: Event) {
        const exit = Exit.fail(
          new SqlError({ reason: classifyError(cause, "SQLite WASM worker failed", "worker") })
        )
        const requests = Array.from(pending.values())
        pending.clear()
        for (const resume of requests) {
          resume(exit)
        }
        Effect.runFork(ScopedRef.set(connectionRef, makeConnection))
      }
      if ("onerror" in worker) {
        worker.addEventListener("error", onError)
      }

      yield* Scope.addFinalizer(
        scope,
        Effect.sync(() => {
          port.removeEventListener("message", onMessage)
          worker.removeEventListener("error", onError)
        })
      )

      yield* Deferred.await(readyDeferred)

      if (options.installReactivityHooks) {
        postMessage(["update_hook"])
      }

      const send = (id: number, message: OpfsWorkerMessage, transferables?: ReadonlyArray<any>) =>
        Effect.callback<any, SqlError>((resume) => {
          pending.set(id, resume)
          postMessage(message, transferables)
        })

      const run = (
        sql: string,
        params: ReadonlyArray<unknown> = [],
        rowMode: "object" | "array" = "object"
      ): Effect.Effect<Array<any>, SqlError, never> => {
        const rows = Effect.withFiber<WorkerResult, SqlError>((fiber) => {
          const id = currentId++
          return send(id, [id, sql, params], fiber.getRef(Transferables))
        })
        return rowMode === "object"
          ? Effect.map(rows, extractObject)
          : Effect.map(rows, extractRows)
      }

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
          return run(sql, params, "array")
        },
        executeValuesUnprepared(sql, params) {
          return run(sql, params, "array")
        },
        executeUnprepared(sql, params, transformRows) {
          return this.execute(sql, params, transformRows)
        },
        executeStream() {
          return Stream.die("executeStream not implemented")
        },
        export: Effect.suspend(() => {
          const id = currentId++
          return send(id, ["export", id])
        }),
        import(data) {
          return Effect.suspend(() => {
            const id = currentId++
            return send(id, ["import", id, data], [data.buffer])
          })
        }
      })
    })

    const connectionRef = yield* ScopedRef.fromAcquire(makeConnection)

    const { acquirer, onCommitFailure, transactionAcquirer } = Client.makeSqliteAcquirers({
      connection: ScopedRef.get(connectionRef),
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
        [TypeId]: TypeId as TypeId,
        config: options,
        export: Effect.flatMap(acquirer, (connection) => connection.export),
        import(data: Uint8Array) {
          return Effect.flatMap(acquirer, (connection) => connection.import(data))
        }
      }
    )
  })

function rowToObject(columns: Array<string>, row: Array<any>) {
  const obj: Record<string, any> = {}
  for (let i = 0; i < columns.length; i++) {
    Rec.assignProperty(obj, columns[i], row[i])
  }
  return obj
}
type WorkerResult = [columns: Array<Array<string>>, rows: Array<any>]

const extractObject = (rows: WorkerResult) => rows[1].map((row, index) => rowToObject(rows[0][index], row))
const extractRows = (rows: WorkerResult) => rows[1]

/**
 * Fiber reference that stores transferables to include with worker-backed SQLite WASM query messages.
 *
 * @category services
 * @since 4.0.0
 */
export const Transferables = Context.Reference<ReadonlyArray<Transferable>>(
  "@effect/sql-sqlite-wasm/currentTransferables",
  { defaultValue: () => [] }
)

/**
 * Runs an effect with the supplied transferables attached to worker-backed SQLite WASM query messages.
 *
 * @category transferables
 * @since 4.0.0
 */
export const withTransferables =
  (transferables: ReadonlyArray<Transferable>) => <A, E, R>(effect: Effect.Effect<A, E, R>): Effect.Effect<A, E, R> =>
    Effect.provideService(effect, Transferables, transferables)

/**
 * Builds a layer from an Effect `Config` value, providing both the in-memory SQLite WASM `SqliteClient` service and the generic `SqlClient` service.
 *
 * @category layers
 * @since 4.0.0
 */
export const layerMemoryConfig = (
  config: Config.Wrap<SqliteClientMemoryConfig>
): Layer.Layer<SqliteClient | Client.SqlClient, Config.ConfigError | SqlError> =>
  Layer.effectContext(
    Config.unwrap(config).pipe(
      Effect.flatMap(makeMemory),
      Effect.map((client) =>
        Context.make(SqliteClient, client).pipe(
          Context.add(Client.SqlClient, client)
        )
      )
    )
  ).pipe(Layer.provide(Reactivity.layer))

/**
 * Builds a layer from an in-memory SQLite WASM client configuration, providing both `SqliteClient` and the generic `SqlClient` service.
 *
 * @category layers
 * @since 4.0.0
 */
export const layerMemory = (
  config: SqliteClientMemoryConfig
): Layer.Layer<SqliteClient | Client.SqlClient, SqlError> =>
  Layer.effectContext(
    Effect.map(makeMemory(config), (client) =>
      Context.make(SqliteClient, client).pipe(
        Context.add(Client.SqlClient, client)
      ))
  ).pipe(Layer.provide(Reactivity.layer))

/**
 * Builds a layer from a worker-backed SQLite WASM client configuration, providing both `SqliteClient` and the generic `SqlClient` service.
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

/**
 * Builds a layer from an Effect `Config` value, providing both the worker-backed SQLite WASM `SqliteClient` service and the generic `SqlClient` service.
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
