/**
 * Typed IndexedDB schema version definitions.
 *
 * This module represents one logical IndexedDB database version as a non-empty set of `IndexedDbTable` definitions.
 * Versions are consumed by `IndexedDbDatabase.make` and `.add` to type query builders and migration transactions, so
 * applications can describe the tables available after initialization or after each schema upgrade.
 *
 * Use an `IndexedDbVersion` when defining the initial stores for a browser database, adding or removing object stores,
 * changing indexes, or moving data between differently shaped table schemas. The version value is a typed description of
 * the target schema; creating and deleting object stores or indexes still happens explicitly inside the corresponding
 * `IndexedDbDatabase` migration callback.
 *
 * IndexedDB versioning is ordered by the migration chain rather than by a number stored here. Each `.add` step becomes
 * the next browser database version, and only migrations after the browser's current version are run. Include every table
 * that should be queryable in each target version, avoid duplicate table names, and remember that key-path or
 * auto-increment changes usually require creating a new object store and copying data during the upgrade transaction.
 *
 * @since 4.0.0
 */
import type { NonEmptyReadonlyArray } from "effect/Array"
import type { Pipeable } from "effect/Pipeable"
import { pipeArguments } from "effect/Pipeable"
import type * as IndexedDbTable from "./IndexedDbTable.ts"

const TypeId = "~@effect/platform-browser/IndexedDbVersion"

/**
 * Typed IndexedDB version definition containing the tables available in that schema version.
 *
 * @category models
 * @since 4.0.0
 */
export interface IndexedDbVersion<
  out Tables extends IndexedDbTable.AnyWithProps
> extends Pipeable {
  new(_: never): {}
  readonly [TypeId]: typeof TypeId
  readonly tables: ReadonlyMap<string, Tables>
}

/**
 * Type-erased shape of an `IndexedDbVersion`.
 *
 * @category models
 * @since 4.0.0
 */
export interface Any {
  readonly [TypeId]: typeof TypeId
}

/**
 * Type-erased `IndexedDbVersion` retaining version properties with broad table types.
 *
 * @category models
 * @since 4.0.0
 */
export type AnyWithProps = IndexedDbVersion<IndexedDbTable.AnyWithProps>

/**
 * Extracts the table union from an `IndexedDbVersion`.
 *
 * @category utility types
 * @since 4.0.0
 */
export type Tables<Db extends Any> = Db extends IndexedDbVersion<infer _Tables> ? _Tables : never

/**
 * Selects a table by name from an `IndexedDbVersion`.
 *
 * @category utility types
 * @since 4.0.0
 */
export type TableWithName<
  Db extends Any,
  TableName extends string
> = IndexedDbTable.WithName<Tables<Db>, TableName>

/**
 * Extracts the schema for a named table within an `IndexedDbVersion`.
 *
 * @category utility types
 * @since 4.0.0
 */
export type SchemaWithName<
  Db extends Any,
  TableName extends string
> = IndexedDbTable.TableSchema<IndexedDbTable.WithName<Tables<Db>, TableName>>

const Proto = {
  [TypeId]: TypeId,
  pipe() {
    return pipeArguments(this, arguments)
  }
}

const makeProto = <Tables extends IndexedDbTable.AnyWithProps>(options: {
  readonly tables: ReadonlyMap<string, Tables>
}): IndexedDbVersion<Tables> => {
  // oxlint-disable-next-line typescript/no-extraneous-class
  class Version {}
  Object.assign(Version, Proto)
  ;(Version as any).tables = options.tables
  return Version as any
}

/**
 * Creates an `IndexedDbVersion` from one or more table definitions.
 *
 * **When to use**
 *
 * Use when you need a typed description of the target IndexedDB schema that a
 * database migration will materialize.
 *
 * **Details**
 *
 * The returned version exposes a `tables` map keyed by each table's
 * `tableName`, and its type is the union of the supplied table definitions.
 *
 * **Gotchas**
 *
 * This constructor only describes the target schema; object stores and indexes
 * still need to be created in the corresponding `IndexedDbDatabase` migration.
 * Duplicate table names are not rejected, and the runtime map keeps the later
 * table for a repeated key.
 *
 * @see {@link IndexedDbTable.make} for creating table definitions consumed by this constructor
 *
 * @category constructors
 * @since 4.0.0
 */
export const make = <
  const Tables extends NonEmptyReadonlyArray<IndexedDbTable.AnyWithProps>
>(
  ...tables: Tables
): IndexedDbVersion<Tables[number]> =>
  makeProto({
    tables: new Map(tables.map((table) => [table.tableName, table]))
  })
