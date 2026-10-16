/**
 * Builds and opens typed IndexedDB databases from versioned schema migrations.
 *
 * This module turns an `IndexedDbVersion` migration chain into an
 * `IndexedDbDatabase` layer. The layer opens the browser database, runs any
 * pending upgrade migrations, provides a query builder for the current schema,
 * and exposes a `rebuild` effect that deletes and reopens the database.
 * Migration transactions can create or delete object stores and indexes, and
 * database failures are represented as `IndexedDbDatabaseError` values.
 *
 * @since 4.0.0
 */
import * as Context from "effect/Context"
import * as Data from "effect/Data"
import * as Effect from "effect/Effect"
import * as Effectable from "effect/Effectable"
import * as Fiber from "effect/Fiber"
import * as Layer from "effect/Layer"
import * as MutableRef from "effect/MutableRef"
import * as Reactivity from "effect/reactivity/Reactivity"
import * as Semaphore from "effect/Semaphore"
import * as IndexedDb from "./IndexedDb.ts"
import * as IndexedDbQueryBuilder from "./IndexedDbQueryBuilder.ts"
import type * as IndexedDbTable from "./IndexedDbTable.ts"
import type * as IndexedDbVersion from "./IndexedDbVersion.ts"

const TypeId = "~@effect/platform-browser/IndexedDbDatabase"
const ErrorTypeId = "~@effect/platform-browser/IndexedDbDatabase/IndexedDbDatabaseError"

const SchemaProto = {
  [TypeId]: {
    _A: (_: never) => _
  },
  get getQueryBuilder() {
    const self = this as unknown as IndexedDbSchema<any, any, any>
    return IndexedDbDatabase.useSync(({ database, IDBKeyRange, reactivity }) =>
      IndexedDbQueryBuilder.make({
        database,
        IDBKeyRange,
        tables: self.version.tables,
        reactivity
      })
    )
  },
  ...Effectable.Prototype<IndexedDbSchema<any, any, any>>({
    label: "IndexedDbSchema",
    evaluate() {
      return this.getQueryBuilder
    }
  }),
  add<Version extends IndexedDbVersion.AnyWithProps>(
    this: IndexedDbSchema<any, any, any>,
    version: Version,
    migrate: (
      fromQuery: Transaction<any>,
      toQuery: Transaction<Version>
    ) => Effect.Effect<void, Error>
  ) {
    return makeMigration({
      fromVersion: this.version,
      version,
      migrate,
      previous: this
    })
  },
  layer(this: IndexedDbSchema<any, any, any>, databaseName: string) {
    return layer(databaseName, this)
  }
}

/**
 * String union describing the failure categories for IndexedDB database opening, migration, and schema operations.
 *
 * @category errors
 * @since 4.0.0
 */
export type ErrorReason =
  | "TransactionError"
  | "MissingTable"
  | "OpenError"
  | "UpgradeError"
  | "Aborted"
  | "Blocked"
  | "MissingIndex"

/**
 * Tagged error for IndexedDB database operations, carrying a database error reason and the original cause.
 *
 * @category errors
 * @since 4.0.0
 */
export class IndexedDbDatabaseError extends Data.TaggedError(
  "IndexedDbDatabaseError"
)<{
  reason: ErrorReason
  cause: unknown
}> {
  /**
   * Marks this value as an IndexedDB database error for runtime guards.
   *
   * @since 4.0.0
   */
  readonly [ErrorTypeId]: typeof ErrorTypeId = ErrorTypeId
  override readonly message = this.reason
}

/**
 * Service tag for an open IndexedDB database, its `IDBKeyRange` constructor, reactivity service, and rebuild effect.
 *
 * **When to use**
 *
 * Use when you need access to the live database service after an
 * `IndexedDbSchema` layer has been provided, especially for `rebuild` or
 * lower-level database primitives.
 *
 * **Details**
 *
 * `database` is a mutable reference to the current `IDBDatabase`. `IDBKeyRange`
 * and `reactivity` are shared with query builders created from the schema.
 *
 * **Gotchas**
 *
 * `rebuild` closes and deletes the browser database, then reopens it and reruns
 * migrations. Records not recreated by migrations are removed.
 *
 * @see {@link IndexedDb.IndexedDb} for the lower-level browser IndexedDB primitives
 * @see {@link make} for creating a schema that provides this service as a layer
 *
 * @category services
 * @since 4.0.0
 */
export class IndexedDbDatabase extends Context.Service<
  IndexedDbDatabase,
  {
    readonly database: MutableRef.MutableRef<globalThis.IDBDatabase>
    readonly IDBKeyRange: typeof globalThis.IDBKeyRange
    readonly reactivity: Reactivity.Reactivity
    readonly rebuild: Effect.Effect<void, IndexedDbDatabaseError>
  }
>()(TypeId) {}

/**
 * Describes an IndexedDB schema version and its migrations, and acts as an effect that yields a query builder for the target version.
 *
 * @category models
 * @since 4.0.0
 */
export interface IndexedDbSchema<
  in out FromVersion extends IndexedDbVersion.AnyWithProps,
  in out ToVersion extends IndexedDbVersion.AnyWithProps,
  out Error = never
> extends
  Effect.Effect<
    IndexedDbQueryBuilder.IndexedDbQueryBuilder<ToVersion>,
    never,
    IndexedDbDatabase
  >
{
  new(_: never): {}

  readonly previous: [FromVersion] extends [never] ? undefined
    : IndexedDbSchema<never, FromVersion, Error>
  readonly fromVersion: FromVersion
  readonly version: ToVersion

  readonly migrate: [FromVersion] extends [never] ? (query: Transaction<ToVersion>) => Effect.Effect<void, Error>
    : (
      fromQuery: Transaction<FromVersion>,
      toQuery: Transaction<ToVersion>
    ) => Effect.Effect<void, Error>

  readonly add: <Version extends IndexedDbVersion.AnyWithProps, MigrationError>(
    version: Version,
    migrate: (
      fromQuery: Transaction<ToVersion>,
      toQuery: Transaction<Version>
    ) => Effect.Effect<void, MigrationError>
  ) => IndexedDbSchema<ToVersion, Version, MigrationError | Error>

  readonly getQueryBuilder: Effect.Effect<
    IndexedDbQueryBuilder.IndexedDbQueryBuilder<ToVersion>,
    never,
    IndexedDbDatabase
  >

  readonly layer: (
    databaseName: string
  ) => Layer.Layer<
    IndexedDbDatabase,
    IndexedDbDatabaseError,
    IndexedDb.IndexedDb
  >
}

/**
 * Query builder available during a database migration, extended with object-store and index management helpers for the active `IDBTransaction`.
 *
 * @category models
 * @since 4.0.0
 */
export interface Transaction<
  Source extends IndexedDbVersion.AnyWithProps = never
> extends Omit<IndexedDbQueryBuilder.IndexedDbQueryBuilder<Source>, "transaction"> {
  readonly transaction: globalThis.IDBTransaction

  readonly createObjectStore: <
    A extends IndexedDbTable.TableName<IndexedDbVersion.Tables<Source>>
  >(
    table: A
  ) => Effect.Effect<globalThis.IDBObjectStore, IndexedDbDatabaseError>

  readonly deleteObjectStore: <
    A extends IndexedDbTable.TableName<IndexedDbVersion.Tables<Source>>
  >(
    table: A
  ) => Effect.Effect<void, IndexedDbDatabaseError>

  readonly createIndex: <
    Name extends IndexedDbTable.TableName<IndexedDbVersion.Tables<Source>>
  >(
    table: Name,
    indexName: IndexFromTableName<Source, Name>,
    options?: IDBIndexParameters
  ) => Effect.Effect<globalThis.IDBIndex, IndexedDbDatabaseError>

  readonly deleteIndex: <
    Name extends IndexedDbTable.TableName<IndexedDbVersion.Tables<Source>>
  >(
    table: Name,
    indexName: IndexFromTableName<Source, Name>
  ) => Effect.Effect<void, IndexedDbDatabaseError>
}

/**
 * Extracts the string-literal index names defined by an `IndexedDbTable`.
 *
 * @category utility types
 * @since 4.0.0
 */
export type IndexFromTable<Table extends IndexedDbTable.AnyWithProps> = IsStringLiteral<
  Extract<keyof IndexedDbTable.Indexes<Table>, string>
> extends true ? Extract<keyof IndexedDbTable.Indexes<Table>, string>
  : never

/**
 * Extracts the valid index names for a table name within an IndexedDB version.
 *
 * @category utility types
 * @since 4.0.0
 */
export type IndexFromTableName<
  Version extends IndexedDbVersion.AnyWithProps,
  Table extends string
> = IndexFromTable<
  IndexedDbTable.WithName<IndexedDbVersion.Tables<Version>, Table>
>

/**
 * Type-erased IndexedDB schema shape used when traversing schema migration chains.
 *
 * @category models
 * @since 4.0.0
 */
export interface Any {
  readonly previous?: Any | undefined
  readonly layer: (
    databaseName: string
  ) => Layer.Layer<
    IndexedDbDatabase,
    IndexedDbDatabaseError,
    IndexedDb.IndexedDb
  >
}

/**
 * Type-erased `IndexedDbSchema` covering any source version, target version, and migration error type.
 *
 * @category models
 * @since 4.0.0
 */
export type AnySchema = IndexedDbSchema<
  IndexedDbVersion.AnyWithProps,
  IndexedDbVersion.AnyWithProps,
  any
>

/**
 * Creates the initial `IndexedDbSchema` from a version and an initialization migration run during database upgrade.
 *
 * @category constructors
 * @since 4.0.0
 */
export const make = <
  InitialVersion extends IndexedDbVersion.AnyWithProps,
  Error
>(
  initialVersion: InitialVersion,
  init: (toQuery: Transaction<InitialVersion>) => Effect.Effect<void, Error>
): IndexedDbSchema<never, InitialVersion, Error> => {
  // oxlint-disable-next-line typescript/no-extraneous-class
  function Initial() {}
  Object.setPrototypeOf(Initial, SchemaProto)
  ;(Initial as any).version = initialVersion
  ;(Initial as any).migrate = init
  return Initial as any
}

const makeMigration = <
  FromVersion extends IndexedDbVersion.AnyWithProps,
  ToVersion extends IndexedDbVersion.AnyWithProps,
  Error
>(options: {
  readonly previous:
    | IndexedDbSchema<FromVersion, ToVersion, Error>
    | IndexedDbSchema<never, FromVersion, Error>
  readonly fromVersion: FromVersion
  readonly version: ToVersion
  readonly migrate: (
    fromQuery: Transaction<FromVersion>,
    toQuery: Transaction<ToVersion>
  ) => Effect.Effect<void, Error>
}): IndexedDbSchema<FromVersion, ToVersion, Error> => {
  // oxlint-disable-next-line typescript/no-extraneous-class
  function Migration() {}
  Object.setPrototypeOf(Migration, SchemaProto)
  ;(Migration as any).previous = options.previous
  ;(Migration as any).fromVersion = options.fromVersion
  ;(Migration as any).version = options.version
  ;(Migration as any).migrate = options.migrate

  return Migration as any
}

const layer = <DatabaseName extends string>(
  databaseName: DatabaseName,
  migration: Any
) =>
  Layer.effect(
    IndexedDbDatabase,
    Effect.gen(function*() {
      const { IDBKeyRange, indexedDB } = yield* IndexedDb.IndexedDb
      const reactivity = yield* Reactivity.Reactivity
      const context = yield* Effect.context()
      const runForkWith = Effect.runForkWith(context)

      let oldVersion = 0
      const migrations: Array<Any> = []
      let current = migration
      while (current) {
        migrations.unshift(current)
        current = (current as unknown as AnySchema).previous as any
      }

      const version = migrations.length
      const database = MutableRef.make<globalThis.IDBDatabase>(null as any)

      const open = Effect.callback<
        void,
        IndexedDbDatabaseError
      >((resume) => {
        const request = indexedDB.open(databaseName, version)

        request.onblocked = (event) => {
          resume(
            Effect.fail(
              new IndexedDbDatabaseError({
                reason: "Blocked",
                cause: event
              })
            )
          )
        }

        request.onerror = (event) => {
          const idbRequest = event.target as IDBRequest<IDBDatabase>

          resume(
            Effect.fail(
              new IndexedDbDatabaseError({
                reason: "OpenError",
                cause: idbRequest.error
              })
            )
          )
        }

        let fiber: Fiber.Fiber<void, IndexedDbDatabaseError> | undefined
        request.onupgradeneeded = (event) => {
          const idbRequest = event.target as IDBRequest<IDBDatabase>
          const db = idbRequest.result
          const transaction = idbRequest.transaction
          oldVersion = event.oldVersion

          MutableRef.set(database, db)

          if (transaction === null) {
            return resume(
              Effect.fail(
                new IndexedDbDatabaseError({
                  reason: "TransactionError",
                  cause: null
                })
              )
            )
          }

          transaction.onabort = (event) => {
            resume(
              Effect.fail(
                new IndexedDbDatabaseError({
                  reason: "Aborted",
                  cause: event
                })
              )
            )
          }

          transaction.onerror = (event) => {
            resume(
              Effect.fail(
                new IndexedDbDatabaseError({
                  reason: "TransactionError",
                  cause: event
                })
              )
            )
          }

          const effect = Effect.forEach(
            migrations.slice(oldVersion),
            (untypedMigration) => {
              if (untypedMigration.previous === undefined) {
                const migration = untypedMigration as any as AnySchema
                const api = makeTransactionProto({
                  database,
                  IDBKeyRange,
                  tables: migration.version.tables,
                  transaction,
                  reactivity
                })
                return (migration as any).migrate(api) as Effect.Effect<
                  void,
                  IndexedDbDatabaseError
                >
              } else if (untypedMigration.previous) {
                const migration = untypedMigration as any as AnySchema
                const fromApi = makeTransactionProto({
                  database,
                  IDBKeyRange,
                  tables: migration.fromVersion.tables,
                  transaction,
                  reactivity
                })
                const toApi = makeTransactionProto({
                  database,
                  IDBKeyRange,
                  tables: migration.version.tables,
                  transaction,
                  reactivity
                })
                return migration.migrate(fromApi, toApi) as Effect.Effect<
                  void,
                  IndexedDbDatabaseError
                >
              }

              return Effect.die(new Error("Invalid migration"))
            },
            { discard: true }
          ).pipe(
            Effect.mapError(
              (cause) =>
                new IndexedDbDatabaseError({
                  reason: "UpgradeError",
                  cause
                })
            ),
            Effect.provideService(IndexedDbQueryBuilder.IndexedDbTransaction, transaction)
          )
          fiber = runForkWith(effect)
          fiber.addObserver((exit) => {
            if (exit._tag === "Failure") {
              transaction.abort()
              resume(exit)
            }
          })
          fiber.currentDispatcher.flush()
        }

        request.onsuccess = (event) => {
          const idbRequest = event.target as IDBRequest<IDBDatabase>
          const db = idbRequest.result
          MutableRef.set(database, db)
          if (fiber) {
            // ensure migration errors are propagated
            resume(Effect.asVoid(Fiber.join(fiber)))
          } else {
            resume(Effect.void)
          }
        }
      })

      yield* Effect.addFinalizer(() => {
        database.current?.close()
        return Effect.void
      })
      yield* open

      const rebuildLock = Semaphore.makeUnsafe(1).withPermit
      const rebuild = Effect.callback<void, IndexedDbDatabaseError>((resume) => {
        database.current?.close()
        const request = indexedDB.deleteDatabase(databaseName)
        request.onerror = (_) => {
          resume(
            Effect.fail(
              new IndexedDbDatabaseError({
                reason: "OpenError",
                cause: request.error
              })
            )
          )
        }
        request.onsuccess = () => {
          resume(Effect.void)
        }
      }).pipe(
        Effect.flatMap(() => open),
        rebuildLock
      )

      return IndexedDbDatabase.of({ database, IDBKeyRange, rebuild, reactivity })
    })
  ).pipe(
    Layer.provide(Reactivity.layer)
  )

// -----------------------------------------------------------------------------
// Internal
// -----------------------------------------------------------------------------

type IsStringLiteral<T> = T extends string ? string extends T ? false
  : true
  : false

const makeTransactionProto = <Source extends IndexedDbVersion.AnyWithProps>({
  IDBKeyRange,
  database,
  tables,
  transaction,
  reactivity
}: {
  readonly database: MutableRef.MutableRef<globalThis.IDBDatabase>
  readonly IDBKeyRange: typeof globalThis.IDBKeyRange
  readonly tables: ReadonlyMap<string, IndexedDbVersion.Tables<Source>>
  readonly transaction: globalThis.IDBTransaction
  readonly reactivity: Reactivity.Reactivity
}): Transaction<Source> => {
  const migration = IndexedDbQueryBuilder.make({
    database,
    IDBKeyRange,
    tables,
    reactivity
  }) as any

  migration.transaction = transaction

  migration.createObjectStore = Effect.fnUntraced(function*(table: string) {
    const createTable = yield* Effect.fromNullishOr(tables.get(table)).pipe(
      Effect.mapError(
        (cause) =>
          new IndexedDbDatabaseError({
            reason: "MissingTable",
            cause
          })
      )
    )

    return yield* Effect.try({
      try: () =>
        database.current.createObjectStore(createTable.tableName, {
          keyPath: createTable.keyPath,
          autoIncrement: createTable.autoIncrement
        }),
      catch: (cause) =>
        new IndexedDbDatabaseError({
          reason: "TransactionError",
          cause
        })
    })
  })

  migration.deleteObjectStore = Effect.fnUntraced(function*(table: string) {
    const createTable = yield* Effect.fromNullishOr(tables.get(table)).pipe(
      Effect.mapError(
        (cause) =>
          new IndexedDbDatabaseError({
            reason: "MissingTable",
            cause
          })
      )
    )

    return yield* Effect.try({
      try: () => database.current.deleteObjectStore(createTable.tableName),
      catch: (cause) =>
        new IndexedDbDatabaseError({
          reason: "TransactionError",
          cause
        })
    })
  })

  migration.createIndex = Effect.fnUntraced(function*(
    table: string,
    indexName: string,
    options?: IDBIndexParameters
  ) {
    const store = transaction.objectStore(table)
    const sourceTable = tables.get(table)!

    const keyPath = yield* Effect.fromNullishOr(
      sourceTable.indexes[indexName]
    ).pipe(
      Effect.mapError(
        (cause) =>
          new IndexedDbDatabaseError({
            reason: "MissingIndex",
            cause
          })
      )
    )

    return yield* Effect.try({
      try: () => store.createIndex(indexName, keyPath, options),
      catch: (cause) =>
        new IndexedDbDatabaseError({
          reason: "TransactionError",
          cause
        })
    })
  })

  migration.deleteIndex = (table: string, indexName: string) =>
    Effect.try({
      try: () => transaction.objectStore(table).deleteIndex(indexName),
      catch: (cause) =>
        new IndexedDbDatabaseError({
          reason: "TransactionError",
          cause
        })
    })

  return migration
}
