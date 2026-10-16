/**
 * Builds effectful, schema-aware queries for typed browser IndexedDB versions.
 *
 * An `IndexedDbQueryBuilder` is created from an open database and a version's
 * table descriptors, then exposes `from(tableName)` as the entry point for
 * table operations. Query objects can select, count, delete, insert, upsert,
 * clear tables, stream paged reads, react to invalidations, and run multiple
 * effects in a shared `IDBTransaction` with `withTransaction`. Reads decode
 * stored rows with the table schema, and writes encode input values before
 * sending them to IndexedDB.
 *
 * @since 4.0.0
 */
import type { NonEmptyReadonlyArray } from "effect/Array"
import * as Cause from "effect/Cause"
import * as Context from "effect/Context"
import * as Data from "effect/Data"
import * as Effect from "effect/Effect"
import * as Effectable from "effect/Effectable"
import * as Fiber from "effect/Fiber"
import type { Inspectable } from "effect/Inspectable"
import { BaseProto } from "effect/Inspectable"
import type * as MutableRef from "effect/MutableRef"
import * as Option from "effect/Option"
import * as Pipeable from "effect/Pipeable"
import type * as Queue from "effect/Queue"
import type * as Reactivity from "effect/reactivity/Reactivity"
import type * as Record from "effect/Record"
import * as References from "effect/References"
import * as Schema from "effect/Schema"
import * as SchemaIssue from "effect/SchemaIssue"
import * as SchemaParser from "effect/SchemaParser"
import type * as Scope from "effect/Scope"
import * as Stream from "effect/Stream"
import * as Utils from "effect/Utils"
import type * as IndexedDb from "./IndexedDb.ts"
import type * as IndexedDbDatabase from "./IndexedDbDatabase.ts"
import type * as IndexedDbTable from "./IndexedDbTable.ts"
import type * as IndexedDbVersion from "./IndexedDbVersion.ts"

const ErrorTypeId = "~@effect/platform-browser/IndexedDbQueryBuilder/IndexedDbQueryError"

const CommonProto = {
  [Symbol.iterator]() {
    return new Utils.SingleShotGen(this) as any
  },
  ...Pipeable.Prototype,
  ...BaseProto,
  toJSON(this: any) {
    return {
      _id: "IndexedDbQueryBuilder"
    }
  }
}

/**
 * String union describing IndexedDB query failure categories such as decoding, encoding, and transaction errors.
 *
 * @category errors
 * @since 4.0.0
 */
export type ErrorReason =
  | "UnknownError"
  | "DecodeError"
  | "EncodeError"
  | "TransactionError"

/**
 * Tagged error for IndexedDB query operations, carrying a query error reason and the original cause.
 *
 * **Details**
 *
 * `reason` is the query failure category, `cause` preserves the underlying
 * schema, IndexedDB request, transaction, or user callback failure, and
 * `message` is set to the reason.
 *
 * @see {@link ErrorReason} for the supported failure categories
 *
 * @category errors
 * @since 4.0.0
 */
export class IndexedDbQueryError extends Data.TaggedError(
  "IndexedDbQueryError"
)<{
  reason: ErrorReason
  cause: unknown
}> {
  /**
   * Marks this value as an IndexedDB query builder error for runtime guards.
   *
   * @since 4.0.0
   */
  readonly [ErrorTypeId]: typeof ErrorTypeId = ErrorTypeId

  override readonly message = this.reason
}

/**
 * Typed query builder for an IndexedDB version, with helpers for table queries, database access, clearing data, and running effects in a shared transaction.
 *
 * @category models
 * @since 4.0.0
 */
export interface IndexedDbQueryBuilder<
  Source extends IndexedDbVersion.AnyWithProps
> extends Pipeable.Pipeable, Inspectable {
  readonly tables: ReadonlyMap<string, IndexedDbVersion.Tables<Source>>
  readonly database: MutableRef.MutableRef<globalThis.IDBDatabase>
  readonly reactivity: Reactivity.Reactivity
  readonly IDBKeyRange: typeof globalThis.IDBKeyRange
  readonly IDBTransaction: globalThis.IDBTransaction | undefined

  readonly use: <A = unknown>(
    f: (database: globalThis.IDBDatabase) => A
  ) => Effect.Effect<A, IndexedDbQueryError>

  readonly from: <
    const Name extends IndexedDbTable.TableName<
      IndexedDbVersion.Tables<Source>
    >
  >(
    table: Name
  ) => IndexedDbQuery.From<IndexedDbVersion.TableWithName<Source, Name>>

  /** @internal */
  readonly fromCache: Map<string, IndexedDbQuery.From<IndexedDbVersion.TableWithName<Source, any>>>

  readonly clearAll: Effect.Effect<void, IndexedDbQueryError>

  readonly withTransaction: <
    Tables extends NonEmptyReadonlyArray<
      IndexedDbTable.TableName<IndexedDbVersion.Tables<Source>>
    >,
    Mode extends "readonly" | "readwrite"
  >(options: {
    readonly tables: Tables
    readonly mode: Mode
    readonly durability?: IDBTransactionDurability
  }) => <A, E, R>(effect: Effect.Effect<A, E, R>) => Effect.Effect<
    A,
    E | IndexedDbQueryError,
    Exclude<R, IndexedDbTransaction>
  >
}

/**
 * Valid key-path type for a table schema, using encoded fields whose values are IndexedDB-valid keys.
 *
 * @category utility types
 * @since 4.0.0
 */
export type KeyPath<TableSchema extends IndexedDbTable.AnySchemaStruct> =
  | IndexedDbValidKeys<TableSchema>
  | NonEmptyReadonlyArray<IndexedDbValidKeys<TableSchema>>

/**
 * Valid numeric key-path type for a table schema, used for auto-increment key paths.
 *
 * @category utility types
 * @since 4.0.0
 */
export type KeyPathNumber<TableSchema extends IndexedDbTable.AnySchemaStruct> =
  | IndexedDbValidNumberKeys<TableSchema>
  | NonEmptyReadonlyArray<IndexedDbValidNumberKeys<TableSchema>>

/**
 * Namespace containing the typed IndexedDB query model interfaces and helper types.
 *
 * @since 4.0.0
 */
export declare namespace IndexedDbQuery {
  /**
   * Decoded row type returned by select queries, adding a `key` field when the table does not define a key path.
   *
   * @category utility types
   * @since 4.0.0
   */
  export type SelectType<
    Table extends IndexedDbTable.AnyWithProps
  > = [IndexedDbTable.KeyPath<Table>] extends [undefined] ? IndexedDbTable.TableSchema<Table>["Type"] & {
      readonly key: (typeof IndexedDb.IDBValidKey)["Type"]
    } :
    IndexedDbTable.TableSchema<Table>["Type"]

  /**
   * Input type for insert and upsert operations, adjusted for auto-increment keys and out-of-line keys.
   *
   * @category utility types
   * @since 4.0.0
   */
  export type ModifyType<
    Table extends IndexedDbTable.AnyWithProps
  > =
    & (IndexedDbTable.AutoIncrement<Table> extends true ?
        & {
          [
            key in keyof Schema.Struct.MakeIn<
              Omit<
                IndexedDbTable.TableSchema<Table>["fields"],
                IndexedDbTable.KeyPath<Table>
              >
            >
          ]: key extends keyof Schema.Struct.MakeIn<
            IndexedDbTable.TableSchema<Table>["fields"]
          > ? Schema.Struct.MakeIn<
              IndexedDbTable.TableSchema<Table>["fields"]
            >[key]
            : never
        }
        & {
          [key in IndexedDbTable.KeyPath<Table>]?: number | undefined
        }
      : Schema.Struct.MakeIn<IndexedDbTable.TableSchema<Table>["fields"]>)
    & ([IndexedDbTable.KeyPath<Table>] extends [undefined] ? {
        key: IDBValidKey
      }
      : {})

  /**
   * Value type accepted by `equals` comparisons for a table key path or index.
   *
   * @category utility types
   * @since 4.0.0
   */
  export type EqualsType<
    Table extends IndexedDbTable.AnyWithProps,
    Index extends keyof Table["indexes"],
    KeyPath = [Index] extends [never] ? Table["keyPath"] : Table["indexes"][Index],
    Type = Table["tableSchema"]["Encoded"]
  > = [KeyPath] extends [undefined] ? IDBValidKey
    : KeyPath extends keyof Type ? Type[KeyPath]
    : { [I in keyof KeyPath]: KeyPath[I] extends keyof Type ? Type[KeyPath[I]] | [] : never }

  /**
   * Value type accepted by range comparisons for a table key path or index, including partial tuples for compound indexes.
   *
   * @category utility types
   * @since 4.0.0
   */
  export type ExtractIndexType<
    Table extends IndexedDbTable.AnyWithProps,
    Index extends keyof Table["indexes"],
    KeyPath = [Index] extends [never] ? Table["keyPath"] : Table["indexes"][Index],
    Type = Table["tableSchema"]["Encoded"]
  > = KeyPath extends keyof Type ? Type[KeyPath]
    : KeyPath extends readonly [infer K, ...infer Rest] ? K extends keyof Type ? [
          Type[K],
          ...{ [P in keyof Rest]?: Rest[P] extends keyof Type ? Type[Rest[P]] | [] : never }
        ] :
      never :
    never

  /**
   * Mutation input type for insert and upsert operations, including any required key fields.
   *
   * @category utility types
   * @since 4.0.0
   */
  export type ModifyWithKey<Table extends IndexedDbTable.AnyWithProps> = ModifyType<Table>

  /**
   * Query entry point for a table, exposing clear, select, count, delete, insert, and upsert operations.
   *
   * @category models
   * @since 4.0.0
   */
  export interface From<Table extends IndexedDbTable.AnyWithProps> {
    readonly table: Table
    readonly database: MutableRef.MutableRef<globalThis.IDBDatabase>
    readonly IDBKeyRange: typeof globalThis.IDBKeyRange
    readonly reactivity: Reactivity.Reactivity

    readonly clear: Effect.Effect<void, IndexedDbQueryError>

    readonly select: {
      <Index extends IndexedDbDatabase.IndexFromTable<Table>>(
        index: Index
      ): Select<Table, Index>
      (): Select<Table, never>
    }

    /** @internal */
    readonly selectCache: Map<
      string | undefined,
      IndexedDbQuery.Select<any, never>
    >

    readonly count: {
      <Index extends IndexedDbDatabase.IndexFromTable<Table>>(
        index: Index
      ): Count<Table, Index>
      (): Count<Table, never>
    }

    /** @internal */
    readonly countCache: Map<
      string | undefined,
      IndexedDbQuery.Count<any, never>
    >

    readonly delete: {
      <Index extends IndexedDbDatabase.IndexFromTable<Table>>(
        index: Index
      ): DeletePartial<Table, Index>
      (): DeletePartial<Table, never>
    }

    /** @internal */
    readonly deleteCache: Map<
      string | undefined,
      IndexedDbQuery.DeletePartial<any, never>
    >

    readonly insert: (value: ModifyWithKey<Table>) => Modify<Table>
    readonly insertAll: (
      values: Array<ModifyWithKey<Table>>
    ) => ModifyAll<Table>
    readonly upsert: (value: ModifyWithKey<Table>) => Modify<Table>
    readonly upsertAll: (
      values: Array<ModifyWithKey<Table>>
    ) => ModifyAll<Table>
  }

  /**
   * Effect model for clearing all rows from a table.
   *
   * @category models
   * @since 4.0.0
   */
  export interface Clear<
    Table extends IndexedDbTable.AnyWithProps
  > extends Effect.Effect<void, IndexedDbQueryError> {
    readonly from: From<Table>
  }

  type ComparisonKeys = "equals" | "gte" | "lte" | "gt" | "lt" | "between"

  /**
   * Effect model for counting table rows, optionally constrained by an index and key-range comparisons.
   *
   * @category models
   * @since 4.0.0
   */
  export interface Count<
    Table extends IndexedDbTable.AnyWithProps,
    Index extends IndexedDbDatabase.IndexFromTable<Table>
  > extends Effect.Effect<number, IndexedDbQueryError> {
    readonly from: From<Table>
    readonly index?: Index
    readonly only?: ExtractIndexType<Table, Index>
    readonly lowerBound?: ExtractIndexType<Table, Index>
    readonly upperBound?: ExtractIndexType<Table, Index>
    readonly excludeLowerBound?: boolean
    readonly excludeUpperBound?: boolean

    readonly equals: (
      value: EqualsType<Table, Index>
    ) => Omit<Count<Table, Index>, ComparisonKeys>

    readonly gte: (
      value: ExtractIndexType<Table, Index>
    ) => Omit<Count<Table, Index>, ComparisonKeys>

    readonly lte: (
      value: ExtractIndexType<Table, Index>
    ) => Omit<Count<Table, Index>, ComparisonKeys>

    readonly gt: (
      value: ExtractIndexType<Table, Index>
    ) => Omit<Count<Table, Index>, ComparisonKeys>

    readonly lt: (
      value: ExtractIndexType<Table, Index>
    ) => Omit<Count<Table, Index>, ComparisonKeys>

    readonly between: (
      lowerBound: ExtractIndexType<Table, Index>,
      upperBound: ExtractIndexType<Table, Index>,
      options?: { excludeLowerBound?: boolean; excludeUpperBound?: boolean }
    ) => Omit<Count<Table, Index>, ComparisonKeys>
  }

  /**
   * Intermediate delete builder used to choose a key range or limit before producing an executable delete query.
   *
   * @category models
   * @since 4.0.0
   */
  export interface DeletePartial<
    Table extends IndexedDbTable.AnyWithProps,
    Index extends IndexedDbDatabase.IndexFromTable<Table>
  > {
    readonly from: From<Table>
    readonly index?: Index

    readonly equals: (
      value: EqualsType<Table, Index>
    ) => Delete<Table, Index>

    readonly gte: (
      value: ExtractIndexType<Table, Index>
    ) => Delete<Table, Index>

    readonly lte: (
      value: ExtractIndexType<Table, Index>
    ) => Delete<Table, Index>

    readonly gt: (
      value: ExtractIndexType<Table, Index>
    ) => Delete<Table, Index>

    readonly lt: (
      value: ExtractIndexType<Table, Index>
    ) => Delete<Table, Index>

    readonly between: (
      lowerBound: ExtractIndexType<Table, Index>,
      upperBound: ExtractIndexType<Table, Index>,
      options?: { excludeLowerBound?: boolean; excludeUpperBound?: boolean }
    ) => Delete<Table, Index>

    readonly limit: (
      limit: number
    ) => DeleteWithout<Table, Index, "limit">
  }

  type DeleteWithout<
    Table extends IndexedDbTable.AnyWithProps,
    Index extends IndexedDbDatabase.IndexFromTable<Table>,
    ExcludedKeys extends string
  > = Omit<Delete<Table, Index, ExcludedKeys>, ExcludedKeys>

  /**
   * Effect model for deleting rows from a table, with optional key-range, limit, filter, and reactivity invalidation helpers.
   *
   * @category models
   * @since 4.0.0
   */
  export interface Delete<
    Table extends IndexedDbTable.AnyWithProps,
    Index extends IndexedDbDatabase.IndexFromTable<Table>,
    ExcludedKeys extends string = never
  > extends Effect.Effect<void, IndexedDbQueryError> {
    readonly delete: DeletePartial<Table, Index>
    readonly index?: Index
    readonly limitValue?: number
    readonly only?: ExtractIndexType<Table, Index>
    readonly lowerBound?: ExtractIndexType<Table, Index>
    readonly upperBound?: ExtractIndexType<Table, Index>
    readonly excludeLowerBound?: boolean
    readonly excludeUpperBound?: boolean
    readonly predicate?: (item: IndexedDbTable.Encoded<Table>) => boolean

    readonly limit: (
      limit: number
    ) => DeleteWithout<Table, Index, ExcludedKeys | "limit">

    readonly filter: (
      f: (value: IndexedDbTable.Encoded<Table>) => boolean
    ) => DeleteWithout<Table, Index, ExcludedKeys>

    /**
     * Invalidate any queries using Reactivity service with the provided keys.
     *
     * **Details**
     *
     * If no keys are provided, the table name is used as the reactivity key.
     */
    readonly invalidate: (
      keys?: ReadonlyArray<unknown> | Record.ReadonlyRecord<string, ReadonlyArray<unknown>> | undefined
    ) => Effect.Effect<void, IndexedDbQueryError, IndexedDbTable.Context<Table>>
  }

  type SelectWithout<
    Table extends IndexedDbTable.AnyWithProps,
    Index extends IndexedDbDatabase.IndexFromTable<Table>,
    ExcludedKeys extends string
  > = Omit<Select<Table, Index, ExcludedKeys>, ExcludedKeys>

  /**
   * Effect model for selecting rows from a table, with chainable range, paging, filtering, streaming, and reactive query helpers.
   *
   * @category models
   * @since 4.0.0
   */
  export interface Select<
    Table extends IndexedDbTable.AnyWithProps,
    Index extends IndexedDbDatabase.IndexFromTable<Table>,
    ExcludedKeys extends string = never
  > extends
    Effect.Effect<
      Array<SelectType<Table>>,
      IndexedDbQueryError,
      IndexedDbTable.Context<Table>
    >
  {
    readonly from: From<Table>
    readonly index?: Index
    readonly limitValue?: number
    readonly offsetValue?: number
    readonly reverseValue?: boolean
    readonly only?: ExtractIndexType<Table, Index>
    readonly lowerBound?: ExtractIndexType<Table, Index>
    readonly upperBound?: ExtractIndexType<Table, Index>
    readonly excludeLowerBound?: boolean
    readonly excludeUpperBound?: boolean
    readonly predicate?: (item: IndexedDbTable.Encoded<Table>) => boolean

    readonly equals: (
      value: EqualsType<Table, Index>
    ) => SelectWithout<Table, Index, ExcludedKeys | ComparisonKeys>

    readonly gte: (
      value: ExtractIndexType<Table, Index>
    ) => SelectWithout<Table, Index, ExcludedKeys | ComparisonKeys>

    readonly lte: (
      value: ExtractIndexType<Table, Index>
    ) => SelectWithout<Table, Index, ExcludedKeys | ComparisonKeys>

    readonly gt: (
      value: ExtractIndexType<Table, Index>
    ) => SelectWithout<Table, Index, ExcludedKeys | ComparisonKeys>

    readonly lt: (
      value: ExtractIndexType<Table, Index>
    ) => SelectWithout<Table, Index, ExcludedKeys | ComparisonKeys>

    readonly between: (
      lowerBound: ExtractIndexType<Table, Index>,
      upperBound: ExtractIndexType<Table, Index>,
      options?: { excludeLowerBound?: boolean; excludeUpperBound?: boolean }
    ) => SelectWithout<Table, Index, ExcludedKeys | ComparisonKeys>

    readonly limit: (
      limit: number
    ) => SelectWithout<Table, Index, ExcludedKeys | "limit" | "first">

    readonly offset: (
      offset: number
    ) => SelectWithout<Table, Index, ExcludedKeys | "offset" | "first">

    readonly reverse: () => SelectWithout<Table, Index, ExcludedKeys | "reverse" | "first">

    readonly filter: (
      f: (value: IndexedDbTable.Encoded<Table>) => boolean
    ) => SelectWithout<Table, Index, ExcludedKeys | "first">

    readonly first: () => First<Table, Index>

    /**
     * Stream the selected data.
     *
     * **Details**
     *
     * The default chunk size is 100.
     */
    readonly stream: (options?: {
      readonly chunkSize?: number | undefined
    }) => Stream.Stream<
      SelectType<Table>,
      IndexedDbQueryError,
      IndexedDbTable.Context<Table>
    >

    /**
     * Use the Reactivity service to react to changes to the selected data.
     *
     * **Details**
     *
     * By default, the table name is used as the reactivity key.
     */
    readonly reactive: (
      keys?: ReadonlyArray<unknown> | Record.ReadonlyRecord<string, ReadonlyArray<unknown>> | undefined
    ) => Stream.Stream<
      Array<SelectType<Table>>,
      IndexedDbQueryError,
      IndexedDbTable.Context<Table>
    >
    readonly reactiveQueue: (
      keys?: ReadonlyArray<unknown> | Record.ReadonlyRecord<string, ReadonlyArray<unknown>> | undefined
    ) => Effect.Effect<
      Queue.Dequeue<Array<SelectType<Table>>, IndexedDbQueryError>,
      never,
      Scope.Scope | IndexedDbTable.Context<Table>
    >
  }

  /**
   * Effect model for selecting the first matching row, failing with `NoSuchElementError` when no row is found.
   *
   * @category models
   * @since 4.0.0
   */
  export interface First<
    Table extends IndexedDbTable.AnyWithProps,
    Index extends IndexedDbDatabase.IndexFromTable<Table>
  > extends
    Effect.Effect<
      SelectType<Table>,
      IndexedDbQueryError | Cause.NoSuchElementError,
      IndexedDbTable.Context<Table>
    >
  {
    readonly select: Select<Table, Index>

    /**
     * Use the Reactivity service to react to changes to the selected data.
     *
     * **Details**
     *
     * By default, the table name is used as the reactivity key.
     */
    readonly reactive: (
      keys?: ReadonlyArray<unknown> | Record.ReadonlyRecord<string, ReadonlyArray<unknown>> | undefined
    ) => Stream.Stream<
      SelectType<Table>,
      IndexedDbQueryError | Cause.NoSuchElementError,
      IndexedDbTable.Context<Table>
    >

    /**
     * Use the Reactivity service to react to changes to the selected data.
     *
     * **Details**
     *
     * By default, the table name is used as the reactivity key.
     */
    readonly reactiveQueue: (
      keys: ReadonlyArray<unknown> | Record.ReadonlyRecord<string, ReadonlyArray<unknown>>
    ) => Effect.Effect<
      Queue.Dequeue<SelectType<Table>, IndexedDbQueryError | Cause.NoSuchElementError>,
      never,
      Scope.Scope | IndexedDbTable.Context<Table>
    >
  }

  /**
   * Effect model for a select query filtered by one or more predicates over encoded table rows.
   *
   * @category models
   * @since 4.0.0
   */
  export interface Filter<
    Table extends IndexedDbTable.AnyWithProps,
    Index extends IndexedDbDatabase.IndexFromTable<Table>
  > extends
    Effect.Effect<
      Array<SelectType<Table>>,
      IndexedDbQueryError,
      IndexedDbTable.Context<Table>
    >
  {
    readonly select: Select<Table, Index>
    readonly predicate: (item: IndexedDbTable.Encoded<Table>) => boolean
    readonly filter: (
      f: (value: IndexedDbTable.Encoded<Table>) => boolean
    ) => Filter<Table, Index>
  }

  /**
   * Effect model for inserting or upserting one row, returning the resulting IndexedDB key and supporting reactivity invalidation.
   *
   * @category models
   * @since 4.0.0
   */
  export interface Modify<
    Table extends IndexedDbTable.AnyWithProps
  > extends
    Effect.Effect<
      globalThis.IDBValidKey,
      IndexedDbQueryError,
      IndexedDbTable.Context<Table>
    >
  {
    readonly operation: "add" | "put"
    readonly from: From<Table>
    readonly value: ModifyWithKey<Table>

    /**
     * Invalidate any queries using Reactivity service with the provided keys.
     *
     * **Details**
     *
     * If no keys are provided, the table name is used as the reactivity key.
     */
    readonly invalidate: (
      keys?: ReadonlyArray<unknown> | Record.ReadonlyRecord<string, ReadonlyArray<unknown>> | undefined
    ) => Effect.Effect<globalThis.IDBValidKey, IndexedDbQueryError, IndexedDbTable.Context<Table>>
  }

  /**
   * Effect model for inserting or upserting multiple rows, returning the resulting IndexedDB keys and supporting reactivity invalidation.
   *
   * @category models
   * @since 4.0.0
   */
  export interface ModifyAll<
    Table extends IndexedDbTable.AnyWithProps
  > extends
    Effect.Effect<
      Array<globalThis.IDBValidKey>,
      IndexedDbQueryError,
      IndexedDbTable.Context<Table>
    >
  {
    readonly operation: "add" | "put"
    readonly from: From<Table>
    readonly values: Array<ModifyWithKey<Table>>

    /**
     * Invalidate any queries using Reactivity service with the provided keys.
     *
     * **Details**
     *
     * If no keys are provided, the table name is used as the reactivity key.
     */
    readonly invalidate: (
      keys?: ReadonlyArray<unknown> | Record.ReadonlyRecord<string, ReadonlyArray<unknown>> | undefined
    ) => Effect.Effect<globalThis.IDBValidKey, IndexedDbQueryError, IndexedDbTable.Context<Table>>
  }
}

/**
 * Service tag for the active `IDBTransaction` used to share a transaction across IndexedDB query effects.
 *
 * @category services
 * @since 4.0.0
 */
export class IndexedDbTransaction extends Context.Service<IndexedDbTransaction, globalThis.IDBTransaction>()(
  "@effect/platform-browser/IndexedDbQueryBuilder/IndexedDbTransaction"
) {}

// -----------------------------------------------------------------------------
// internal
// -----------------------------------------------------------------------------

type IndexedDbValidKeys<TableSchema extends IndexedDbTable.AnySchemaStruct> = keyof TableSchema["Encoded"] extends
  infer K ? K extends keyof TableSchema["Encoded"] ? TableSchema["Encoded"][K] extends Readonly<IDBValidKey> ? K
    : never
  : never
  : never

type IndexedDbValidNumberKeys<
  TableSchema extends IndexedDbTable.AnySchemaStruct
> = keyof TableSchema["Encoded"] extends infer K
  ? K extends keyof TableSchema["Encoded"] ? [TableSchema["Encoded"][K]] extends [number | undefined] ? K
    : never
  : never
  : never

const applyDelete = (query: IndexedDbQuery.Delete<any, never>) =>
  Effect.callback<any, IndexedDbQueryError>((resume) => {
    const database = query.delete.from.database
    const IDBKeyRange = query.delete.from.IDBKeyRange
    const transaction = getOrCreateTransaction(database.current, [query.delete.from.table.tableName], "readwrite", {
      durability: query.delete.from.table.durability
    })
    const objectStore = transaction.objectStore(query.delete.from.table.tableName)
    const store = query.delete.index === undefined ? objectStore : objectStore.index(query.delete.index)
    const predicate = query.predicate

    let keyRange: globalThis.IDBKeyRange | undefined = undefined

    if (query.only !== undefined) {
      keyRange = IDBKeyRange.only(query.only)
    } else if (
      query.lowerBound !== undefined &&
      query.upperBound !== undefined
    ) {
      keyRange = IDBKeyRange.bound(
        query.lowerBound,
        query.upperBound,
        query.excludeLowerBound,
        query.excludeUpperBound
      )
    } else if (query.lowerBound !== undefined) {
      keyRange = IDBKeyRange.lowerBound(
        query.lowerBound,
        query.excludeLowerBound
      )
    } else if (query.upperBound !== undefined) {
      keyRange = IDBKeyRange.upperBound(
        query.upperBound,
        query.excludeUpperBound
      )
    }

    let request: globalThis.IDBRequest

    if (query.delete.index !== undefined || query.limitValue !== undefined || predicate) {
      const cursorRequest = store.openCursor(keyRange)
      let count = 0

      cursorRequest.onerror = () => {
        resume(
          Effect.fail(
            new IndexedDbQueryError({
              reason: "TransactionError",
              cause: cursorRequest.error
            })
          )
        )
      }

      cursorRequest.onsuccess = () => {
        const cursor = cursorRequest.result
        if (cursor === null) {
          return resume(Effect.void)
        }

        if (predicate === undefined || predicate(cursor.value)) {
          const deleteRequest = cursor.delete()
          deleteRequest.onerror = () => {
            resume(
              Effect.fail(
                new IndexedDbQueryError({
                  reason: "TransactionError",
                  cause: deleteRequest.error
                })
              )
            )
          }
          count += 1
        }

        if (query.limitValue === undefined || count < query.limitValue) {
          return cursor.continue()
        }

        resume(Effect.void)
      }
    } else if (keyRange !== undefined) {
      request = objectStore.delete(keyRange)

      request.onerror = (event) => {
        resume(
          Effect.fail(
            new IndexedDbQueryError({
              reason: "TransactionError",
              cause: event
            })
          )
        )
      }

      request.onsuccess = () => {
        resume(Effect.succeed(request.result))
      }
    } else {
      resume(
        Effect.die(new Error("No key range provided for delete operation"))
      )
    }
  })

const getReadonlyObjectStore = (
  query: IndexedDbQuery.Select<any, never> | IndexedDbQuery.Count<any, never>
) => {
  const database = query.from.database
  const IDBKeyRange = query.from.IDBKeyRange
  const transaction = getOrCreateTransaction(database.current, [query.from.table.tableName], "readonly", {
    durability: query.from.table.durability
  })
  const objectStore = transaction.objectStore(query.from.table.tableName)

  let keyRange: globalThis.IDBKeyRange | undefined = undefined
  let store: globalThis.IDBObjectStore | globalThis.IDBIndex

  if (query.only !== undefined) {
    keyRange = IDBKeyRange.only(query.only)
  } else if (query.lowerBound !== undefined && query.upperBound !== undefined) {
    keyRange = IDBKeyRange.bound(
      query.lowerBound,
      query.upperBound,
      query.excludeLowerBound,
      query.excludeUpperBound
    )
  } else if (query.lowerBound !== undefined) {
    keyRange = IDBKeyRange.lowerBound(
      query.lowerBound,
      query.excludeLowerBound
    )
  } else if (query.upperBound !== undefined) {
    keyRange = IDBKeyRange.upperBound(
      query.upperBound,
      query.excludeUpperBound
    )
  }

  if (query.index !== undefined) {
    store = objectStore.index(query.index)
  } else {
    store = objectStore
  }

  return { store, keyRange }
}

const applySelect = Effect.fnUntraced(function*(
  query: IndexedDbQuery.Select<any, never, any>
): Effect.fn.Return<Array<any>, IndexedDbQueryError, unknown> {
  const keyPath = query.from.table.keyPath
  const predicate = query.predicate

  const data = predicate || keyPath === undefined || query.offsetValue !== undefined || query.reverseValue ?
    yield* Effect.callback<Array<any>, IndexedDbQueryError>((resume) => {
      const { keyRange, store } = getReadonlyObjectStore(query)

      const cursorRequest = store.openCursor(keyRange, query.reverseValue ? "prev" : "next")
      const results: Array<any> = []
      let count = 0
      let offsetApplied = false

      cursorRequest.onerror = () => {
        resume(
          Effect.fail(
            new IndexedDbQueryError({
              reason: "TransactionError",
              cause: cursorRequest.error
            })
          )
        )
      }

      cursorRequest.onsuccess = () => {
        const cursor = cursorRequest.result
        if (cursor === null) {
          return resume(Effect.succeed(results))
        }

        if (query.offsetValue && !offsetApplied) {
          offsetApplied = true
          return cursor.advance(query.offsetValue)
        }

        if (predicate === undefined || predicate(cursor.value)) {
          results.push(
            keyPath === undefined
              ? { ...cursor.value, key: cursor.primaryKey }
              : cursor.value
          )
          count += 1
        }

        if (query.limitValue === undefined || count < query.limitValue) {
          return cursor.continue()
        }

        resume(Effect.succeed(results))
      }
    }) :
    yield* Effect.callback<Array<any>, IndexedDbQueryError>((resume) => {
      const { keyRange, store } = getReadonlyObjectStore(query)
      const request = store.getAll(keyRange, query.limitValue)
      request.onerror = (event) => {
        resume(
          Effect.fail(
            new IndexedDbQueryError({
              reason: "TransactionError",
              cause: event
            })
          )
        )
      }
      request.onsuccess = () => {
        if (query.reverseValue) {
          request.result.reverse()
        }
        resume(Effect.succeed(request.result))
      }
    })

  const tableSchema = (query.from.table as IndexedDbTable.AnyWithProps).arraySchema

  return yield* Schema.decodeUnknownEffect(tableSchema)(data).pipe(
    Effect.mapError(
      (error) =>
        new IndexedDbQueryError({
          reason: "DecodeError",
          cause: error
        })
    )
  ) as Effect.Effect<Array<any>, IndexedDbQueryError, unknown>
})

const applyFirst = Effect.fnUntraced(function*(
  query: IndexedDbQuery.First<any, never>
) {
  const keyPath = query.select.from.table.keyPath

  const data = yield* Effect.callback<any, IndexedDbQueryError | Cause.NoSuchElementError>((resume) => {
    const { keyRange, store } = getReadonlyObjectStore(query.select)

    if (keyRange !== undefined && keyPath !== undefined) {
      const request = store.get(keyRange)

      request.onerror = (event) => {
        resume(
          Effect.fail(
            new IndexedDbQueryError({
              reason: "TransactionError",
              cause: event
            })
          )
        )
      }

      request.onsuccess = () => {
        if (request.result === undefined) {
          resume(
            Effect.fail(new Cause.NoSuchElementError(`No such element in table ${query.select.from.table.tableName}`))
          )
        } else {
          resume(Effect.succeed(request.result))
        }
      }
    } else {
      const request = store.openCursor(keyRange)

      request.onerror = (event) => {
        resume(
          Effect.fail(
            new IndexedDbQueryError({
              reason: "TransactionError",
              cause: event
            })
          )
        )
      }

      request.onsuccess = () => {
        const value = request.result?.value
        const key = request.result?.primaryKey

        if (value === undefined) {
          resume(
            Effect.fail(new Cause.NoSuchElementError(`No such element in table ${query.select.from.table.tableName}`))
          )
        } else {
          resume(
            Effect.succeed(keyPath === undefined ? { ...value, key } : value)
          )
        }
      }
    }
  })

  return yield* Schema.decodeUnknownEffect(query.select.from.table.readSchema)(
    data
  ).pipe(
    Effect.mapError(
      (error) =>
        new IndexedDbQueryError({
          reason: "DecodeError",
          cause: error
        })
    )
  )
})

const applyModify = Effect.fnUntraced(function*({
  query,
  value
}: {
  query: IndexedDbQuery.Modify<any>
  value: any
}) {
  const autoIncrement = query.from.table.autoIncrement as boolean
  const keyPath = query.from.table.keyPath
  const table = query.from.table
  const schema: Schema.Top = autoIncrement && value[keyPath] === undefined
    ? table.autoincrementSchema
    : table.tableSchema

  const encodedValue = yield* schema.makeEffect(value).pipe(
    Effect.flatMap(Schema.encodeUnknownEffect(schema)),
    Effect.mapError(
      (error) =>
        new IndexedDbQueryError({
          reason: "EncodeError",
          cause: error
        })
    )
  )

  return yield* Effect.callback<any, IndexedDbQueryError>((resume) => {
    const database = query.from.database
    const transaction = getOrCreateTransaction(database.current, [query.from.table.tableName], "readwrite", {
      durability: query.from.table.durability
    })
    const objectStore = transaction.objectStore(query.from.table.tableName)

    let request: globalThis.IDBRequest<IDBValidKey>

    if (query.operation === "add") {
      request = objectStore.add(
        encodedValue,
        keyPath === undefined ? value["key"] : undefined
      )
    } else if (query.operation === "put") {
      request = objectStore.put(
        encodedValue,
        keyPath === undefined ? value["key"] : undefined
      )
    } else {
      return resume(Effect.die(new Error("Invalid modify operation")))
    }

    request.onerror = (event) => {
      resume(
        Effect.fail(
          new IndexedDbQueryError({
            reason: "TransactionError",
            cause: event
          })
        )
      )
    }

    request.onsuccess = () => {
      resume(Effect.succeed(request.result))
    }
  })
})

const applyModifyAll = Effect.fnUntraced(
  function*({
    query,
    values
  }: {
    query: IndexedDbQuery.ModifyAll<any>
    values: Array<any>
  }) {
    const autoIncrement = query.from.table.autoIncrement as boolean
    const keyPath = query.from.table.keyPath
    const schema = query.from.table.tableSchema
    const encodedValues = new Array(values.length)
    const makeValue = SchemaParser.makeEffect(schema)
    const encodeValue = SchemaParser.encodeUnknownEffect(schema)
    const makeValueAutoincrement = SchemaParser.makeEffect(query.from.table.autoincrementSchema)
    const encodeValueAutoincrement = SchemaParser.encodeUnknownEffect(query.from.table.autoincrementSchema)

    for (let i = 0; i < values.length; i++) {
      const value = values[i]
      if (autoIncrement && value[keyPath] === undefined) {
        encodedValues[i] = yield* encodeValueAutoincrement(yield* makeValueAutoincrement(value))
      } else {
        encodedValues[i] = yield* encodeValue(yield* makeValue(value))
      }
    }

    return yield* Effect.callback<
      Array<globalThis.IDBValidKey>,
      IndexedDbQueryError
    >((resume) => {
      if (encodedValues.length === 0) {
        return resume(Effect.succeed([]))
      }

      const database = query.from.database
      const transaction = getOrCreateTransaction(database.current, [query.from.table.tableName], "readwrite", {
        durability: query.from.table.durability
      })
      const objectStore = transaction.objectStore(query.from.table.tableName)

      const results: Array<globalThis.IDBValidKey> = new Array(encodedValues.length)
      let remaining = encodedValues.length

      if (query.operation === "add") {
        for (let i = 0; i < encodedValues.length; i++) {
          const request = objectStore.add(
            encodedValues[i],
            keyPath === undefined ? values[i]["key"] : undefined
          )

          request.onerror = () => {
            resume(
              Effect.fail(
                new IndexedDbQueryError({
                  reason: "TransactionError",
                  cause: request.error
                })
              )
            )
          }

          request.onsuccess = () => {
            results[i] = request.result
            remaining -= 1
            if (remaining === 0) {
              resume(Effect.succeed(results))
            }
          }
        }
      } else if (query.operation === "put") {
        for (let i = 0; i < encodedValues.length; i++) {
          const request = objectStore.put(
            encodedValues[i],
            keyPath === undefined ? values[i]["key"] : undefined
          )

          request.onerror = () => {
            resume(
              Effect.fail(
                new IndexedDbQueryError({
                  reason: "TransactionError",
                  cause: request.error
                })
              )
            )
          }

          request.onsuccess = () => {
            results[i] = request.result
            remaining -= 1
            if (remaining === 0) {
              resume(Effect.succeed(results))
            }
          }
        }
      } else {
        return resume(Effect.die(new Error("Invalid modify all operation")))
      }

      objectStore.transaction.onerror = () => {
        resume(
          Effect.fail(
            new IndexedDbQueryError({
              reason: "TransactionError",
              cause: objectStore.transaction.error
            })
          )
        )
      }
    })
  },
  Effect.catchIf(
    SchemaIssue.isIssue,
    (issue) => Effect.fail(new IndexedDbQueryError({ reason: "EncodeError", cause: new Schema.SchemaError(issue) }))
  )
)

const applyClear = (options: {
  readonly database: globalThis.IDBDatabase
  readonly table: IndexedDbTable.AnyWithProps
}) =>
  Effect.callback<void, IndexedDbQueryError>((resume) => {
    const database = options.database
    const transaction = getOrCreateTransaction(database, [options.table.tableName], "readwrite", {
      durability: options.table.durability
    })
    const objectStore = transaction.objectStore(options.table.tableName)

    const request = objectStore.clear()

    request.onerror = (event) => {
      resume(
        Effect.fail(
          new IndexedDbQueryError({
            reason: "TransactionError",
            cause: event
          })
        )
      )
    }

    request.onsuccess = () => {
      resume(Effect.void)
    }
  })

const applyClearAll = (options: {
  readonly database: globalThis.IDBDatabase
}) =>
  Effect.callback<void, IndexedDbQueryError>((resume) => {
    const database = options.database
    const tables = database.objectStoreNames
    const transaction = getOrCreateTransaction(database, [...tables], "readwrite")

    for (let t = 0; t < tables.length; t++) {
      const objectStore = transaction.objectStore(tables[t])
      const request = objectStore.clear()

      request.onerror = () => {
        resume(
          Effect.fail(
            new IndexedDbQueryError({
              reason: "TransactionError",
              cause: request.error
            })
          )
        )
      }
    }

    transaction.onerror = () => {
      resume(
        Effect.fail(
          new IndexedDbQueryError({
            reason: "TransactionError",
            cause: transaction.error
          })
        )
      )
    }

    transaction.oncomplete = () => {
      resume(Effect.void)
    }
  })

const getCount = (query: IndexedDbQuery.Count<any, never>) =>
  Effect.callback<number, IndexedDbQueryError>((resume) => {
    const { keyRange, store } = getReadonlyObjectStore(query)

    const request = store.count(keyRange)

    request.onerror = (event) => {
      resume(
        Effect.fail(
          new IndexedDbQueryError({
            reason: "TransactionError",
            cause: event
          })
        )
      )
    }

    request.onsuccess = () => {
      resume(Effect.succeed(request.result))
    }
  })

const FromProto: Omit<
  IndexedDbQuery.From<any>,
  | "table"
  | "database"
  | "IDBKeyRange"
  | "transaction"
  | "reactivity"
  | "selectCache"
  | "countCache"
  | "deleteCache"
> = {
  select<Index extends IndexedDbDatabase.IndexFromTable<any>>(
    this: IndexedDbQuery.From<any>,
    index?: Index
  ) {
    let select = this.selectCache.get(index)
    if (select === undefined) {
      select = makeSelect({
        from: this,
        index
      })
      this.selectCache.set(index, select)
    }
    return select
  },
  count<Index extends IndexedDbDatabase.IndexFromTable<any>>(
    this: IndexedDbQuery.From<any>,
    index?: Index
  ) {
    let count = this.countCache.get(index)
    if (count === undefined) {
      count = makeCount({
        from: this,
        index
      })
      this.countCache.set(index, count)
    }
    return count
  },
  delete<Index extends IndexedDbDatabase.IndexFromTable<any>>(
    this: IndexedDbQuery.From<any>,
    index?: Index
  ) {
    let cached = this.deleteCache.get(index)
    if (cached === undefined) {
      cached = makeDeletePartial({
        from: this,
        index
      })
      this.deleteCache.set(index, cached)
    }
    return cached
  },
  insert(this: IndexedDbQuery.From<any>, value: any) {
    return makeModify({ from: this, value, operation: "add" })
  },
  upsert(this: IndexedDbQuery.From<any>, value: any) {
    return makeModify({ from: this, value, operation: "put" })
  },
  insertAll(this: IndexedDbQuery.From<any>, values: Array<any>) {
    return makeModifyAll({ from: this, values, operation: "add" })
  },
  upsertAll(this: IndexedDbQuery.From<any>, values: Array<any>) {
    return makeModifyAll({ from: this, values, operation: "put" })
  },
  get clear() {
    const self = this as IndexedDbQuery.From<any>
    return applyClear({
      database: self.database.current,
      table: self.table
    })
  },
  ...CommonProto
}

const makeFrom = <
  const Table extends IndexedDbTable.AnyWithProps
>(options: {
  readonly table: Table
  readonly database: MutableRef.MutableRef<globalThis.IDBDatabase>
  readonly IDBKeyRange: typeof globalThis.IDBKeyRange
  readonly reactivity: Reactivity.Reactivity
}): IndexedDbQuery.From<Table> => {
  const self = Object.create(FromProto)
  self.table = options.table
  self.database = options.database
  self.IDBKeyRange = options.IDBKeyRange
  self.reactivity = options.reactivity
  self.selectCache = new Map()
  self.countCache = new Map()
  self.deleteCache = new Map()
  return self
}

const DeletePartialProto: Omit<
  IndexedDbQuery.DeletePartial<any, never>,
  | "from"
  | "index"
> = {
  ...CommonProto,
  limit(this: IndexedDbQuery.DeletePartial<any, never>, limit: number) {
    return makeDelete({
      delete: this as any,
      limitValue: limit
    })
  },
  equals(this: IndexedDbQuery.DeletePartial<any, never>, value: IndexedDbQuery.ExtractIndexType<any, never>) {
    return makeDelete({
      delete: this as any,
      only: value
    })
  },
  gte(this: IndexedDbQuery.DeletePartial<any, never>, value: IndexedDbQuery.ExtractIndexType<any, never>) {
    return makeDelete({
      delete: this as any,
      lowerBound: value,
      excludeLowerBound: false
    })
  },
  lte(this: IndexedDbQuery.DeletePartial<any, never>, value: IndexedDbQuery.ExtractIndexType<any, never>) {
    return makeDelete({
      delete: this as any,
      upperBound: value,
      excludeUpperBound: false
    })
  },
  gt(this: IndexedDbQuery.DeletePartial<any, never>, value: IndexedDbQuery.ExtractIndexType<any, never>) {
    return makeDelete({
      delete: this as any,
      lowerBound: value,
      excludeLowerBound: true
    })
  },
  lt(this: IndexedDbQuery.DeletePartial<any, never>, value: IndexedDbQuery.ExtractIndexType<any, never>) {
    return makeDelete({
      delete: this as any,
      upperBound: value,
      excludeUpperBound: true
    })
  },
  between(
    this: IndexedDbQuery.DeletePartial<any, never>,
    lowerBound: IndexedDbQuery.ExtractIndexType<any, never>,
    upperBound: IndexedDbQuery.ExtractIndexType<any, never>,
    queryOptions?: { excludeLowerBound?: boolean; excludeUpperBound?: boolean }
  ) {
    return makeDelete({
      delete: this as any,
      lowerBound,
      upperBound,
      excludeLowerBound: queryOptions?.excludeLowerBound ?? false,
      excludeUpperBound: queryOptions?.excludeUpperBound ?? false
    })
  }
}

const makeDeletePartial = <
  Table extends IndexedDbTable.AnyWithProps,
  Index extends IndexedDbDatabase.IndexFromTable<Table>
>(options: {
  readonly from: IndexedDbQuery.From<Table>
  readonly index: Index | undefined
}): IndexedDbQuery.DeletePartial<Table, Index> => {
  const self = Object.create(DeletePartialProto)
  self.from = options.from
  self.index = options.index
  return self as any
}

const DeleteProto: Omit<
  IndexedDbQuery.Delete<any, never>,
  | "delete"
  | "limitValue"
  | "only"
  | "lowerBound"
  | "upperBound"
  | "excludeLowerBound"
  | "excludeUpperBound"
  | "predicate"
> = {
  ...CommonProto,
  ...Effectable.Prototype<IndexedDbQuery.Delete<any, never>>({
    label: "IndexedDbQuery.Delete",
    evaluate() {
      return applyDelete(this)
    }
  }),
  limit(this: IndexedDbQuery.Delete<any, never>, limit: number) {
    return makeDelete({
      ...this,
      limitValue: limit
    })
  },
  filter(this: IndexedDbQuery.Delete<any, never>, filter: (value: IndexedDbTable.Encoded<any>) => boolean) {
    const prev = this.predicate
    return makeDelete({
      ...this,
      predicate: prev ? (item) => prev(item) && filter(item) : filter
    })
  },
  invalidate(
    this: IndexedDbQuery.Delete<any, never>,
    keys?: ReadonlyArray<unknown> | Record.ReadonlyRecord<string, ReadonlyArray<unknown>> | undefined
  ) {
    keys ??= this.only !== undefined
      ? { [this.delete.from.table.tableName]: [this.only] }
      : [this.delete.from.table.tableName]
    return this.delete.from.reactivity.mutation(keys, this)
  }
}

const makeDelete = <
  Table extends IndexedDbTable.AnyWithProps,
  Index extends IndexedDbDatabase.IndexFromTable<Table>
>(options: {
  readonly delete: IndexedDbQuery.DeletePartial<Table, Index>
  readonly limitValue?: number | undefined
  readonly only?: IndexedDbQuery.ExtractIndexType<Table, Index> | undefined
  readonly lowerBound?:
    | IndexedDbQuery.ExtractIndexType<Table, Index>
    | undefined
  readonly upperBound?:
    | IndexedDbQuery.ExtractIndexType<Table, Index>
    | undefined
  readonly excludeLowerBound?: boolean | undefined
  readonly excludeUpperBound?: boolean | undefined
  readonly predicate?: ((item: IndexedDbTable.Encoded<Table>) => boolean) | undefined
}): IndexedDbQuery.Delete<Table, Index> => {
  const self = Object.create(DeleteProto)
  self.delete = options.delete
  self.limitValue = options.limitValue
  self.only = options.only
  self.lowerBound = options.lowerBound
  self.upperBound = options.upperBound
  self.excludeLowerBound = options.excludeLowerBound ?? false
  self.excludeUpperBound = options.excludeUpperBound ?? false
  self.predicate = options.predicate
  return self
}

const CountProto: Omit<
  IndexedDbQuery.Count<any, never>,
  | "from"
  | "index"
  | "only"
  | "lowerBound"
  | "upperBound"
  | "excludeLowerBound"
  | "excludeUpperBound"
> = {
  ...CommonProto,
  ...Effectable.Prototype<IndexedDbQuery.Count<any, never>>({
    label: "IndexedDbQuery.Count",
    evaluate() {
      return getCount(this)
    }
  }),
  equals(this: IndexedDbQuery.Count<any, never>, value: IndexedDbQuery.ExtractIndexType<any, never>) {
    return makeCount({
      from: this.from,
      index: this.index,
      only: value
    })
  },
  gte(this: IndexedDbQuery.Count<any, never>, value: IndexedDbQuery.ExtractIndexType<any, never>) {
    return makeCount({
      from: this.from,
      index: this.index,
      lowerBound: value,
      excludeLowerBound: false
    })
  },
  lte(this: IndexedDbQuery.Count<any, never>, value: IndexedDbQuery.ExtractIndexType<any, never>) {
    return makeCount({
      from: this.from,
      index: this.index,
      upperBound: value,
      excludeUpperBound: false
    })
  },
  gt(this: IndexedDbQuery.Count<any, never>, value: IndexedDbQuery.ExtractIndexType<any, never>) {
    return makeCount({
      from: this.from,
      index: this.index,
      lowerBound: value,
      excludeLowerBound: true
    })
  },
  lt(this: IndexedDbQuery.Count<any, never>, value: IndexedDbQuery.ExtractIndexType<any, never>) {
    return makeCount({
      from: this.from,
      index: this.index,
      upperBound: value,
      excludeUpperBound: true
    })
  },
  between(
    this: IndexedDbQuery.Count<any, never>,
    lowerBound: IndexedDbQuery.ExtractIndexType<any, never>,
    upperBound: IndexedDbQuery.ExtractIndexType<any, never>,
    queryOptions?: { excludeLowerBound?: boolean; excludeUpperBound?: boolean }
  ) {
    return makeCount({
      from: this.from,
      index: this.index,
      lowerBound,
      upperBound,
      excludeLowerBound: queryOptions?.excludeLowerBound ?? false,
      excludeUpperBound: queryOptions?.excludeUpperBound ?? false
    })
  }
}

const makeCount = <
  Table extends IndexedDbTable.AnyWithProps,
  Index extends IndexedDbDatabase.IndexFromTable<Table>
>(options: {
  readonly from: IndexedDbQuery.From<Table>
  readonly index: Index | undefined
  readonly only?: IndexedDbQuery.ExtractIndexType<Table, Index> | undefined
  readonly lowerBound?:
    | IndexedDbQuery.ExtractIndexType<Table, Index>
    | undefined
  readonly upperBound?:
    | IndexedDbQuery.ExtractIndexType<Table, Index>
    | undefined
  readonly excludeLowerBound?: boolean | undefined
  readonly excludeUpperBound?: boolean | undefined
}): IndexedDbQuery.Count<Table, Index> => {
  const self = Object.create(CountProto)
  self.from = options.from
  self.index = options.index
  self.only = options.only
  self.lowerBound = options.lowerBound
  self.upperBound = options.upperBound
  self.excludeLowerBound = options.excludeLowerBound
  self.excludeUpperBound = options.excludeUpperBound
  return self
}

const SelectProto: Omit<
  IndexedDbQuery.Select<any, never>,
  | "from"
  | "index"
  | "limitValue"
  | "reverseValue"
  | "only"
  | "lowerBound"
  | "upperBound"
  | "excludeLowerBound"
  | "excludeUpperBound"
> = {
  ...CommonProto,
  ...Effectable.Prototype<IndexedDbQuery.Select<any, never>>({
    label: "IndexedDbQuery.Select",
    evaluate() {
      return applySelect(this)
    }
  }),
  limit(this: IndexedDbQuery.Select<any, never>, limit: number) {
    return makeSelect({
      ...this,
      limitValue: limit
    })
  },
  offset(this: IndexedDbQuery.Select<any, never>, offset: number) {
    return makeSelect({
      ...this,
      offsetValue: offset
    })
  },
  equals(this: IndexedDbQuery.Select<any, never>, value: IndexedDbQuery.ExtractIndexType<any, never>) {
    return makeSelect({
      ...this,
      only: value
    })
  },
  gte(this: IndexedDbQuery.Select<any, never>, value: IndexedDbQuery.ExtractIndexType<any, never>) {
    return makeSelect({
      ...this,
      lowerBound: value,
      excludeLowerBound: false
    })
  },
  lte(this: IndexedDbQuery.Select<any, never>, value: IndexedDbQuery.ExtractIndexType<any, never>) {
    return makeSelect({
      ...this,
      upperBound: value,
      excludeUpperBound: false
    })
  },
  gt(this: IndexedDbQuery.Select<any, never>, value: IndexedDbQuery.ExtractIndexType<any, never>) {
    return makeSelect({
      ...this,
      lowerBound: value,
      excludeLowerBound: true
    })
  },
  lt(this: IndexedDbQuery.Select<any, never>, value: IndexedDbQuery.ExtractIndexType<any, never>) {
    return makeSelect({
      ...this,
      upperBound: value,
      excludeUpperBound: true
    })
  },
  between(
    this: IndexedDbQuery.Select<any, never>,
    lowerBound: IndexedDbQuery.ExtractIndexType<any, never>,
    upperBound: IndexedDbQuery.ExtractIndexType<any, never>,
    queryOptions?: { excludeLowerBound?: boolean; excludeUpperBound?: boolean }
  ) {
    return makeSelect({
      ...this,
      lowerBound,
      upperBound,
      excludeLowerBound: queryOptions?.excludeLowerBound ?? false,
      excludeUpperBound: queryOptions?.excludeUpperBound ?? false
    })
  },
  reverse(this: IndexedDbQuery.Select<any, never>) {
    return makeSelect({
      ...this,
      reverseValue: true
    })
  },
  first(this: IndexedDbQuery.Select<any, never>) {
    return makeFirst({ select: this })
  },
  filter(this: IndexedDbQuery.Select<any, never>, filter: (value: IndexedDbTable.Encoded<any>) => boolean) {
    const prev = this.predicate
    return makeSelect({
      ...this,
      predicate: prev ? (item) => prev(item) && filter(item) : filter
    })
  },
  stream(this: IndexedDbQuery.Select<any, never>, options?: {
    readonly chunkSize?: number | undefined
  }) {
    const limit = this.limitValue
    const chunkSize = Math.min(options?.chunkSize ?? 100, limit ?? Number.MAX_SAFE_INTEGER)
    const initialOffset = this.offsetValue ?? 0
    return Stream.suspend(() => {
      let total = 0
      const initial = this.limit(chunkSize)
      return Stream.paginate(initial, (select) =>
        Effect.map(
          applySelect(select as any),
          (data) => {
            total += data.length
            const reachedLimit = limit && total >= limit
            const isPartial = data.length < chunkSize
            const next = makeSelect({
              ...select,
              limitValue: limit === undefined ? chunkSize : Math.min(chunkSize, limit - total),
              offsetValue: initialOffset + total
            })
            return [data, isPartial || reachedLimit ? Option.none() : Option.some(next)] as const
          }
        ))
    })
  },
  reactive(
    this: IndexedDbQuery.Select<any, never>,
    keys?: ReadonlyArray<unknown> | Record.ReadonlyRecord<string, ReadonlyArray<unknown>> | undefined
  ) {
    keys ??= [this.from.table.tableName]
    return this.from.reactivity.stream(keys, this)
  },
  reactiveQueue(
    this: IndexedDbQuery.Select<any, never>,
    keys?: ReadonlyArray<unknown> | Record.ReadonlyRecord<string, ReadonlyArray<unknown>> | undefined
  ) {
    keys ??= [this.from.table.tableName]
    return this.from.reactivity.query(keys, this)
  }
}

const makeSelect = <
  Table extends IndexedDbTable.AnyWithProps,
  Index extends IndexedDbDatabase.IndexFromTable<Table>
>(options: {
  readonly from: IndexedDbQuery.From<Table>
  readonly index?: Index | undefined
  readonly limitValue?: number | undefined
  readonly offsetValue?: number | undefined
  readonly reverseValue?: boolean | undefined
  readonly only?: IndexedDbQuery.ExtractIndexType<Table, Index> | undefined
  readonly lowerBound?:
    | IndexedDbQuery.ExtractIndexType<Table, Index>
    | undefined
  readonly upperBound?:
    | IndexedDbQuery.ExtractIndexType<Table, Index>
    | undefined
  readonly excludeLowerBound?: boolean | undefined
  readonly excludeUpperBound?: boolean | undefined
  readonly predicate?: ((item: IndexedDbTable.Encoded<Table>) => boolean) | undefined
}): IndexedDbQuery.Select<Table, Index> => {
  const self = Object.create(SelectProto)
  self.from = options.from
  self.index = options.index
  self.only = options.only
  self.limitValue = options.limitValue
  self.offsetValue = options.offsetValue
  self.reverseValue = options.reverseValue
  self.lowerBound = options.lowerBound
  self.upperBound = options.upperBound
  self.excludeLowerBound = options.excludeLowerBound
  self.excludeUpperBound = options.excludeUpperBound
  self.predicate = options.predicate
  return self as any
}

const FirstProto: Omit<
  IndexedDbQuery.First<any, never>,
  "select"
> = {
  ...CommonProto,
  ...Effectable.Prototype<IndexedDbQuery.First<any, never>>({
    label: "IndexedDbQuery.First",
    evaluate() {
      return applyFirst(this)
    }
  }),
  reactive(
    this: IndexedDbQuery.First<any, never>,
    keys?: ReadonlyArray<unknown> | Record.ReadonlyRecord<string, ReadonlyArray<unknown>> | undefined
  ) {
    keys ??= this.select.only !== undefined
      ? [`${this.select.from.table.tableName}:${String(this.select.only)}`]
      : [this.select.from.table.tableName]
    return this.select.from.reactivity.stream(keys, this)
  },
  reactiveQueue(
    this: IndexedDbQuery.First<any, never>,
    keys?: ReadonlyArray<unknown> | Record.ReadonlyRecord<string, ReadonlyArray<unknown>> | undefined
  ) {
    keys ??= this.select.only !== undefined
      ? [`${this.select.from.table.tableName}:${this.select.only}`]
      : [this.select.from.table.tableName]
    return this.select.from.reactivity.query(keys, this)
  }
}

const makeFirst = <
  Table extends IndexedDbTable.AnyWithProps,
  Index extends IndexedDbDatabase.IndexFromTable<Table>
>(options: {
  readonly select: IndexedDbQuery.Select<Table, Index>
}): IndexedDbQuery.First<Table, Index> => {
  const self = Object.create(FirstProto)
  self.select = options.select
  return self as any
}

const ModifyProto: Omit<
  IndexedDbQuery.Modify<any>,
  | "from"
  | "value"
  | "operation"
> = {
  ...CommonProto,
  ...Effectable.Prototype<IndexedDbQuery.Modify<any>>({
    label: "IndexedDbQuery.Modify",
    evaluate() {
      return applyModify({ query: this, value: this.value })
    }
  }),
  invalidate(
    this: IndexedDbQuery.Modify<any>,
    keys?: ReadonlyArray<unknown> | Record.ReadonlyRecord<string, ReadonlyArray<unknown>> | undefined
  ) {
    const keyPath = this.from.table.keyPath
    keys ??= typeof keyPath === "string" && this.value[keyPath] !== undefined
      ? { [this.from.table.tableName]: [this.value[keyPath]] }
      : [this.from.table.tableName]
    return this.from.reactivity.mutation(keys, this)
  }
}

const makeModify = <Table extends IndexedDbTable.AnyWithProps>(options: {
  readonly from: IndexedDbQuery.From<Table>
  readonly value: IndexedDbTable.TableSchema<Table>["Type"]
  readonly operation: "add" | "put"
}): IndexedDbQuery.Modify<Table> => {
  const self = Object.create(ModifyProto)
  self.from = options.from
  self.value = options.value
  self.operation = options.operation
  return self as any
}

const ModifyAllProto: Omit<
  IndexedDbQuery.ModifyAll<any>,
  | "from"
  | "values"
  | "operation"
> = {
  ...CommonProto,
  ...Effectable.Prototype<IndexedDbQuery.ModifyAll<any>>({
    label: "IndexedDbQuery.ModifyAll",
    evaluate() {
      return applyModifyAll({ query: this, values: this.values })
    }
  }),
  invalidate(
    this: IndexedDbQuery.ModifyAll<any>,
    keys?: ReadonlyArray<unknown> | Record.ReadonlyRecord<string, ReadonlyArray<unknown>> | undefined
  ) {
    keys ??= [this.from.table.tableName]
    return this.from.reactivity.mutation(keys, this)
  }
}

const makeModifyAll = <
  Table extends IndexedDbTable.AnyWithProps
>(options: {
  readonly from: IndexedDbQuery.From<Table>
  readonly values: Array<IndexedDbTable.TableSchema<Table>["Type"]>
  readonly operation: "add" | "put"
}): IndexedDbQuery.ModifyAll<Table> => {
  const self = Object.create(ModifyAllProto)
  self.from = options.from
  self.values = options.values
  self.operation = options.operation
  return self as any
}

const QueryBuilderProto: Omit<
  IndexedDbQueryBuilder<any>,
  | "fromCache"
  | "tables"
  | "database"
  | "IDBKeyRange"
  | "IDBTransaction"
  | "reactivity"
> = {
  use(this: IndexedDbQueryBuilder<any>, f: (database: globalThis.IDBDatabase) => any) {
    return Effect.try({
      try: () => f(this.database.current),
      catch: (error) =>
        new IndexedDbQueryError({
          reason: "UnknownError",
          cause: error
        })
    })
  },
  from(this: IndexedDbQueryBuilder<any>, table: any) {
    let cached = this.fromCache.get(table)
    if (cached === undefined) {
      cached = makeFrom({
        database: this.database,
        IDBKeyRange: this.IDBKeyRange,
        table: this.tables.get(table)!,
        reactivity: this.reactivity
      })
      this.fromCache.set(table, cached)
    }
    return cached as any
  },
  get clearAll() {
    const self = this as IndexedDbQueryBuilder<any>
    return applyClearAll({ database: self.database.current })
  },
  ...CommonProto,
  withTransaction(this: IndexedDbQueryBuilder<any>, options: {
    readonly tables: NonEmptyReadonlyArray<any>
    readonly mode: globalThis.IDBTransactionMode
    readonly durability?: IDBTransactionDurability
  }) {
    return (effect) =>
      Effect.suspend(() => {
        const transaction = this.database.current.transaction(options.tables, options.mode, options)
        return Effect.provideService(effect, IndexedDbTransaction, transaction).pipe(
          Effect.onExit((exit) =>
            exit._tag === "Success" ? awaitTransaction(transaction) : abortTransaction(transaction)
          )
        )
      }).pipe(
        // To prevent async gaps between transaction queries
        Effect.provideService(References.PreventSchedulerYield, true)
      )
  }
}

const abortTransaction = (transaction: globalThis.IDBTransaction) =>
  Effect.try({
    try: () => transaction.abort(),
    catch: () => undefined
  }).pipe(Effect.ignore)

const awaitTransaction = (transaction: globalThis.IDBTransaction) =>
  Effect.callback<void, IndexedDbQueryError>((resume) => {
    transaction.oncomplete = () => {
      resume(Effect.void)
    }
    transaction.onabort = () => {
      resume(
        Effect.fail(
          new IndexedDbQueryError({
            reason: "TransactionError",
            cause: transaction.error
          })
        )
      )
    }
    return abortTransaction(transaction)
  })

/**
 * Creates an `IndexedDbQueryBuilder` from an open database reference, key-range constructor, table map, and reactivity service.
 *
 * @category constructors
 * @since 4.0.0
 */
export const make = <Source extends IndexedDbVersion.AnyWithProps>({
  IDBKeyRange,
  database,
  tables,
  reactivity
}: {
  readonly database: MutableRef.MutableRef<globalThis.IDBDatabase>
  readonly IDBKeyRange: typeof globalThis.IDBKeyRange
  readonly tables: ReadonlyMap<string, IndexedDbVersion.Tables<Source>>
  readonly reactivity: Reactivity.Reactivity
}): IndexedDbQueryBuilder<Source> => {
  const self = Object.create(QueryBuilderProto)
  self.tables = tables
  self.database = database
  self.reactivity = reactivity
  self.IDBKeyRange = IDBKeyRange
  self.fromCache = new Map()
  return self
}

const getOrCreateTransaction = (
  database: globalThis.IDBDatabase,
  tables: ReadonlyArray<string>,
  mode: globalThis.IDBTransactionMode,
  options?: IDBTransactionOptions
) => {
  const fiber = Fiber.getCurrent()!
  return Context.getOrUndefined(fiber.context, IndexedDbTransaction) ?? database.transaction(tables, mode, options)
}
