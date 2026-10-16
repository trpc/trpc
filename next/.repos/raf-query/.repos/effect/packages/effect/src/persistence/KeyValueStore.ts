/**
 * Provides effectful key/value storage for persistence backends.
 *
 * `KeyValueStore` is a service for storing string or binary values by key. It
 * is useful for lightweight durable state, browser storage, local files, SQL
 * tables, tests, and as a storage building block for higher-level persistence
 * APIs. This module includes store operations, prefixed views, schema-aware JSON
 * storage, error values, and layers for memory, filesystem, Web Storage, and
 * SQL-backed stores.
 *
 * @stability unstable
 * @since 4.0.0
 */
import * as Context from "../Context.ts"
import * as Data from "../Data.ts"
import * as Effect from "../Effect.ts"
import * as Base64 from "../encoding/Base64.ts"
import * as FileSystem from "../FileSystem.ts"
import { dual, identity, type LazyArg } from "../Function.ts"
import * as Layer from "../Layer.ts"
import * as Option from "../Option.ts"
import * as Path from "../Path.ts"
import type { PlatformError } from "../PlatformError.ts"
import * as Predicate from "../Predicate.ts"
import * as Result from "../Result.ts"
import * as Schema from "../Schema.ts"
import * as SqlClient from "../sql/SqlClient.ts"
import type { SqlError } from "../sql/SqlError.ts"
import * as UndefinedOr from "../UndefinedOr.ts"

const TypeId = "~effect/persistence/KeyValueStore" as const

/**
 * Effectful key/value store service for string and binary values.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface KeyValueStore {
  readonly [TypeId]: typeof TypeId
  /**
   * Returns the value of the specified key if it exists.
   */
  readonly get: (key: string) => Effect.Effect<string | undefined, KeyValueStoreError>

  /**
   * Returns the value of the specified key if it exists.
   */
  readonly getUint8Array: (key: string) => Effect.Effect<Uint8Array | undefined, KeyValueStoreError>

  /**
   * Sets the value of the specified key.
   */
  readonly set: (key: string, value: string | Uint8Array) => Effect.Effect<void, KeyValueStoreError>

  /**
   * Removes the specified key.
   */
  readonly remove: (key: string) => Effect.Effect<void, KeyValueStoreError>

  /**
   * Removes all entries.
   */
  readonly clear: Effect.Effect<void, KeyValueStoreError>

  /**
   * Returns the number of entries.
   */
  readonly size: Effect.Effect<number, KeyValueStoreError>

  /**
   * Updates the value of the specified key if it exists.
   */
  readonly modify: (
    key: string,
    f: (value: string) => string
  ) => Effect.Effect<string | undefined, KeyValueStoreError>

  /**
   * Updates the value of the specified key if it exists.
   */
  readonly modifyUint8Array: (
    key: string,
    f: (value: Uint8Array) => Uint8Array
  ) => Effect.Effect<Uint8Array | undefined, KeyValueStoreError>

  /**
   * Returns true if the KeyValueStore contains the specified key.
   */
  readonly has: (key: string) => Effect.Effect<boolean, KeyValueStoreError>

  /**
   * Checks whether the KeyValueStore contains any entries.
   */
  readonly isEmpty: Effect.Effect<boolean, KeyValueStoreError>
}

/**
 * Implementation callbacks used by `make` to construct a `KeyValueStore`.
 *
 * **Details**
 *
 * Primitive operations are required, while helpers such as `has`, `isEmpty`,
 * and `modify` can be supplied to override the defaults.
 *
 * @stability unstable
 * @category options
 * @since 4.0.0
 */
export type MakeOptions = Partial<KeyValueStore> & {
  /**
   * Returns the value of the specified key if it exists.
   */
  readonly get: (key: string) => Effect.Effect<string | undefined, KeyValueStoreError>

  /**
   * Returns the value of the specified key if it exists.
   */
  readonly getUint8Array: (key: string) => Effect.Effect<Uint8Array | undefined, KeyValueStoreError>

  /**
   * Sets the value of the specified key.
   */
  readonly set: (key: string, value: string | Uint8Array) => Effect.Effect<void, KeyValueStoreError>

  /**
   * Removes the specified key.
   */
  readonly remove: (key: string) => Effect.Effect<void, KeyValueStoreError>

  /**
   * Removes all entries.
   */
  readonly clear: Effect.Effect<void, KeyValueStoreError>

  /**
   * Returns the number of entries.
   */
  readonly size: Effect.Effect<number, KeyValueStoreError>
}

/**
 * Implementation callbacks for adapting a string-only backing store into a
 * `KeyValueStore`.
 *
 * @stability unstable
 * @category options
 * @since 4.0.0
 */
export type MakeStringOptions = Partial<Omit<KeyValueStore, "set">> & {
  /**
   * Returns the value of the specified key if it exists.
   */
  readonly get: (key: string) => Effect.Effect<string | undefined, KeyValueStoreError>

  /**
   * Sets the value of the specified key.
   */
  readonly set: (key: string, value: string) => Effect.Effect<void, KeyValueStoreError>

  /**
   * Removes the specified key.
   */
  readonly remove: (key: string) => Effect.Effect<void, KeyValueStoreError>

  /**
   * Removes all entries.
   */
  readonly clear: Effect.Effect<void, KeyValueStoreError>

  /**
   * Returns the number of entries.
   */
  readonly size: Effect.Effect<number, KeyValueStoreError>
}

const ErrorTypeId = "~effect/persistence/KeyValueStore/KeyValueStoreError" as const

/**
 * Error raised by key/value store operations, including the failed method,
 * optional key, message, and cause.
 *
 * @stability unstable
 * @category errors
 * @since 4.0.0
 */
export class KeyValueStoreError extends Data.TaggedError("KeyValueStoreError")<{
  message: string
  method: string
  key?: string
  cause?: unknown
}> {
  /**
   * Marks this value as a key-value store error for runtime guards.
   *
   * @stability unstable
   * @since 4.0.0
   */
  readonly [ErrorTypeId]: typeof ErrorTypeId = ErrorTypeId
}

/**
 * Service tag for string and binary key/value storage.
 *
 * **When to use**
 *
 * Use to access or provide the persistence store used for lightweight durable
 * state.
 *
 * @stability unstable
 * @category services
 * @since 4.0.0
 */
export const KeyValueStore: Context.Service<
  KeyValueStore,
  KeyValueStore
> = Context.Service("effect/persistence/KeyValueStore")

/**
 * Constructs a `KeyValueStore` from primitive store operations.
 *
 * **Details**
 *
 * Default implementations are derived for `has`, `isEmpty`, `modify`, and
 * `modifyUint8Array` unless they are provided in the options.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const make = (options: MakeOptions): KeyValueStore =>
  KeyValueStore.of({
    [TypeId]: TypeId,
    has: (key) => Effect.map(options.get(key), Predicate.isNotUndefined),
    isEmpty: Effect.map(options.size, (size) => size === 0),
    modify: (key, f) =>
      Effect.flatMap(
        options.get(key),
        (o) => {
          if (o === undefined) {
            return Effect.undefined
          }
          const newValue = f(o)
          return Effect.as(
            options.set(key, newValue),
            newValue
          )
        }
      ),
    modifyUint8Array: (key, f) =>
      Effect.flatMap(
        options.getUint8Array(key),
        (o) => {
          if (o === undefined) {
            return Effect.undefined
          }
          const newValue = f(o)
          return Effect.as(options.set(key, newValue), newValue)
        }
      ),
    ...options
  })

/**
 * Adapts a string-only backing store into a `KeyValueStore`.
 *
 * **Details**
 *
 * `Uint8Array` values are stored as base64 strings. `getUint8Array` decodes
 * base64 values and falls back to UTF-8 encoding for non-base64 strings.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const makeStringOnly = (
  options: MakeStringOptions
): KeyValueStore => {
  const encoder = new TextEncoder()
  return make({
    ...options,
    getUint8Array: (key) =>
      options.get(key).pipe(
        Effect.map(UndefinedOr.map((value) =>
          Result.match(Base64.decode(value), {
            onFailure: () => encoder.encode(value),
            onSuccess: identity
          })
        ))
      ),
    set: (key, value) =>
      typeof value === "string"
        ? options.set(key, value)
        : Effect.suspend(() => options.set(key, Base64.encode(value)))
  })
}

/**
 * Returns a view of a `KeyValueStore` that prepends the given prefix to every
 * key.
 *
 * @stability unstable
 * @category combinators
 * @since 4.0.0
 */
export const prefix: {
  (prefix: string): (self: KeyValueStore) => KeyValueStore
  (self: KeyValueStore, prefix: string): KeyValueStore
} = dual(2, (self: KeyValueStore, prefix: string): KeyValueStore => ({
  ...self,
  get: (key) => self.get(`${prefix}${key}`),
  getUint8Array: (key) => self.getUint8Array(`${prefix}${key}`),
  set: (key, value) => self.set(`${prefix}${key}`, value),
  remove: (key) => self.remove(`${prefix}${key}`),
  has: (key) => self.has(`${prefix}${key}`),
  modify: (key, f) => self.modify(`${prefix}${key}`, f),
  modifyUint8Array: (key, f) => self.modifyUint8Array(`${prefix}${key}`, f)
}))

/**
 * Provides a process-local in-memory `KeyValueStore` backed by a `Map`.
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const layerMemory: Layer.Layer<KeyValueStore> = Layer.sync(KeyValueStore)(() => {
  const store = new Map<string, string | Uint8Array>()
  const encoder = new TextEncoder()

  return make({
    get: (key: string) =>
      Effect.sync(() => {
        const value = store.get(key)
        return value === undefined ? undefined : typeof value === "string" ? value : Base64.encode(value)
      }),
    getUint8Array: (key: string) =>
      Effect.sync(() => {
        const value = store.get(key)
        return value === undefined ? undefined : typeof value === "string" ? encoder.encode(value) : value
      }),
    set: (key: string, value: string | Uint8Array) => Effect.sync(() => store.set(key, value)),
    remove: (key: string) => Effect.sync(() => store.delete(key)),
    clear: Effect.sync(() => store.clear()),
    size: Effect.sync(() => store.size)
  })
})

/**
 * Provides a `KeyValueStore` backed by files in the specified directory.
 *
 * **Details**
 *
 * The directory is created if needed, and each key is percent-encoded as a
 * single file name. Empty keys, `.` and `..` are rejected. Keys are only
 * guaranteed to be distinct on case-sensitive file systems.
 *
 * `clear` removes the directory recursively, so it must not be shared with
 * unrelated data.
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const layerFileSystem = (
  directory: string
): Layer.Layer<KeyValueStore, PlatformError, FileSystem.FileSystem | Path.Path> =>
  Layer.effect(KeyValueStore)(Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const withKeyPath = <A>(
      method: string,
      key: string,
      f: (path: string) => Effect.Effect<A, KeyValueStoreError>
    ): Effect.Effect<A, KeyValueStoreError> =>
      key.length === 0 || key === "." || key === ".."
        ? Effect.fail(
          new KeyValueStoreError({
            method,
            key,
            message: `Invalid key ${key}`
          })
        )
        : f(path.join(directory, encodeURIComponent(key)))

    if (!(yield* fs.exists(directory))) {
      yield* fs.makeDirectory(directory, { recursive: true })
    }

    return make({
      get: (key: string) =>
        withKeyPath("get", key, (path) =>
          Effect.catchTag(
            fs.readFileString(path),
            "PlatformError",
            (cause) =>
              cause.reason._tag === "NotFound" ? Effect.undefined : Effect.fail(
                new KeyValueStoreError({
                  method: "get",
                  key,
                  message: `Unable to get item with key ${key}`,
                  cause
                })
              )
          )),
      getUint8Array: (key: string) =>
        withKeyPath("getUint8Array", key, (path) =>
          Effect.catchTag(
            fs.readFile(path),
            "PlatformError",
            (cause) =>
              cause.reason._tag === "NotFound" ? Effect.undefined : Effect.fail(
                new KeyValueStoreError({
                  method: "getUint8Array",
                  key,
                  message: `Unable to get item with key ${key}`,
                  cause
                })
              )
          )),
      set: (key: string, value: string | Uint8Array) =>
        withKeyPath("set", key, (path) =>
          Effect.mapError(
            typeof value === "string" ? fs.writeFileString(path, value) : fs.writeFile(path, value),
            (cause) =>
              new KeyValueStoreError({
                method: "set",
                key,
                message: `Unable to set item with key ${key}`,
                cause
              })
          )),
      remove: (key: string) =>
        withKeyPath("remove", key, (path) =>
          Effect.mapError(fs.remove(path), (cause) =>
            new KeyValueStoreError({
              method: "remove",
              key,
              message: `Unable to remove item with key ${key}`,
              cause
            }))),
      has: (key: string) =>
        withKeyPath("has", key, (path) =>
          Effect.mapError(fs.exists(path), (cause) =>
            new KeyValueStoreError({
              method: "has",
              key,
              message: `Unable to check existence of item with key ${key}`,
              cause
            }))),
      clear: Effect.mapError(
        Effect.andThen(
          fs.remove(directory, { recursive: true }),
          fs.makeDirectory(directory, { recursive: true })
        ),
        (cause) =>
          new KeyValueStoreError({
            method: "clear",
            message: `Unable to clear storage`,
            cause
          })
      ),
      size: Effect.matchEffect(
        fs.readDirectory(directory),
        {
          onSuccess: (files) => Effect.succeed(files.length),
          onFailure: (cause) =>
            Effect.fail(
              new KeyValueStoreError({
                method: "size",
                message: `Unable to get size`,
                cause
              })
            )
        }
      )
    })
  }))

/**
 * Options for configuring the SQL-backed `KeyValueStore` layer.
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export interface LayerSqlOptions {
  /**
   * The SQL table name used to store values.
   *
   * @default "effect_key_value_store"
   */
  readonly table?: string
}

/**
 * Provides a SQL-backed `KeyValueStore`.
 *
 * **Details**
 *
 * The layer creates the configured table if it does not exist and stores both
 * string and binary values through the current `SqlClient`.
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const layerSql = (
  options: LayerSqlOptions = {}
): Layer.Layer<KeyValueStore, never, SqlClient.SqlClient> =>
  Layer.effect(KeyValueStore)(
    Effect.gen(function*() {
      const sql = (yield* SqlClient.SqlClient).withoutTransforms()
      const table = sql(options.table ?? "effect_key_value_store")

      yield* sql.onDialectOrElse({
        mysql: () =>
          sql`
          CREATE TABLE IF NOT EXISTS ${table} (
            id VARCHAR(191) PRIMARY KEY,
            value BLOB NOT NULL,
            value_type SMALLINT NOT NULL
          )
        `,
        pg: () =>
          sql`
          CREATE TABLE IF NOT EXISTS ${table} (
            id TEXT PRIMARY KEY,
            value BYTEA NOT NULL,
            value_type SMALLINT NOT NULL
          )
        `,
        mssql: () =>
          sql`
          IF NOT EXISTS (SELECT * FROM sysobjects WHERE name=${table} AND xtype='U')
          CREATE TABLE ${table} (
            id NVARCHAR(450) PRIMARY KEY,
            value VARBINARY(MAX) NOT NULL,
            value_type SMALLINT NOT NULL
          )
        `,
        // sqlite
        orElse: () =>
          sql`
          CREATE TABLE IF NOT EXISTS ${table} (
            id TEXT PRIMARY KEY,
            value BLOB NOT NULL,
            value_type INTEGER NOT NULL
          )
        `
      }).pipe(Effect.orDie)

      type UpsertFn = (entry: {
        id: string
        value: Uint8Array
        value_type: number
      }) => Effect.Effect<unknown, SqlError>

      const upsert = sql.onDialectOrElse({
        pg: (): UpsertFn => (entry) =>
          sql`
          INSERT INTO ${table} (id, value, value_type) VALUES (${entry.id}, ${entry.value}, ${entry.value_type})
          ON CONFLICT (id) DO UPDATE SET value=EXCLUDED.value, value_type=EXCLUDED.value_type
        `.unprepared,
        mysql: (): UpsertFn => (entry) =>
          sql`
          INSERT INTO ${table} (id, value, value_type) VALUES (${entry.id}, ${entry.value}, ${entry.value_type})
          ON DUPLICATE KEY UPDATE value=VALUES(value), value_type=VALUES(value_type)
        `,
        mssql: (): UpsertFn => (entry) =>
          sql`
          MERGE ${table} AS target
          USING (SELECT ${entry.id} AS id, ${entry.value} AS value, ${entry.value_type} AS value_type) AS source
          ON target.id = source.id
          WHEN MATCHED THEN UPDATE SET value = source.value, value_type = source.value_type
          WHEN NOT MATCHED THEN INSERT (id, value, value_type)
          VALUES (source.id, source.value, source.value_type);
        `,
        // sqlite
        orElse: (): UpsertFn => (entry) =>
          sql`
          INSERT INTO ${table} (id, value, value_type) VALUES (${entry.id}, ${entry.value}, ${entry.value_type})
          ON CONFLICT(id) DO UPDATE SET value=excluded.value, value_type=excluded.value_type
        `.unprepared
      })

      const encoder = new TextEncoder()
      const decoder = new TextDecoder()
      const ValueTypeString = 0
      const ValueTypeUint8Array = 1

      type Row = {
        value: Uint8Array
        value_type: number
      }

      return make({
        get: (key: string) =>
          sql<Row>`SELECT value, value_type FROM ${table} WHERE id = ${key}`.pipe(
            Effect.mapError((cause) =>
              new KeyValueStoreError({
                method: "get",
                key,
                message: `Unable to get item with key ${key}`,
                cause
              })
            ),
            Effect.flatMap((rows) => {
              if (rows.length === 0) {
                return Effect.undefined
              }
              const row = rows[0]
              switch (row.value_type) {
                case ValueTypeString:
                  return Effect.succeed(decoder.decode(row.value))
                case ValueTypeUint8Array:
                  return Effect.succeed(Base64.encode(row.value))
                default:
                  return Effect.fail(
                    new KeyValueStoreError({
                      method: "get",
                      key,
                      message: `Invalid stored value type for key ${key}: ${row.value_type}`
                    })
                  )
              }
            })
          ),
        getUint8Array: (key: string) =>
          sql<Row>`SELECT value, value_type FROM ${table} WHERE id = ${key}`.pipe(
            Effect.mapError((cause) =>
              new KeyValueStoreError({
                method: "getUint8Array",
                key,
                message: `Unable to get item with key ${key}`,
                cause
              })
            ),
            Effect.flatMap((rows) => {
              if (rows.length === 0) {
                return Effect.undefined
              }
              const row = rows[0]
              switch (row.value_type) {
                case ValueTypeString:
                  return Effect.succeed(row.value)
                case ValueTypeUint8Array:
                  return Effect.succeed(row.value)
                default:
                  return Effect.fail(
                    new KeyValueStoreError({
                      method: "getUint8Array",
                      key,
                      message: `Invalid stored value type for key ${key}: ${row.value_type}`
                    })
                  )
              }
            })
          ),
        set: (key: string, value: string | Uint8Array) =>
          upsert({
            id: key,
            value: typeof value === "string" ? encoder.encode(value) : value,
            value_type: typeof value === "string" ? ValueTypeString : ValueTypeUint8Array
          }).pipe(
            Effect.mapError((cause) =>
              new KeyValueStoreError({
                method: "set",
                key,
                message: `Unable to set item with key ${key}`,
                cause
              })
            ),
            Effect.asVoid
          ),
        remove: (key: string) =>
          sql`DELETE FROM ${table} WHERE id = ${key}`.pipe(
            Effect.mapError((cause) =>
              new KeyValueStoreError({
                method: "remove",
                key,
                message: `Unable to remove item with key ${key}`,
                cause
              })
            ),
            Effect.asVoid
          ),
        clear: sql`DELETE FROM ${table}`.pipe(
          Effect.mapError((cause) =>
            new KeyValueStoreError({
              method: "clear",
              message: `Unable to clear storage`,
              cause
            })
          ),
          Effect.asVoid
        ),
        size: sql<{ count: number }>`SELECT COUNT(*) as count FROM ${table}`.pipe(
          Effect.mapError((cause) =>
            new KeyValueStoreError({
              method: "size",
              message: `Unable to get size`,
              cause
            })
          ),
          Effect.map((rows) => rows.length === 0 ? 0 : Number(rows[0].count))
        )
      })
    })
  )

const SchemaStoreTypeId = "~effect/persistence/KeyValueStore/SchemaStore" as const

/**
 * Schema-aware view of a `KeyValueStore` that stores values as encoded JSON.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface SchemaStore<S extends Schema.Constraint> {
  readonly [SchemaStoreTypeId]: typeof SchemaStoreTypeId
  /**
   * Returns the value of the specified key if it exists.
   */
  readonly get: (
    key: string
  ) => Effect.Effect<Option.Option<S["Type"]>, KeyValueStoreError | Schema.SchemaError, S["DecodingServices"]>

  /**
   * Sets the value of the specified key.
   */
  readonly set: (
    key: string,
    value: S["Type"]
  ) => Effect.Effect<void, KeyValueStoreError | Schema.SchemaError, S["EncodingServices"]>

  /**
   * Removes the specified key.
   */
  readonly remove: (key: string) => Effect.Effect<void, KeyValueStoreError>

  /**
   * Removes all entries.
   */
  readonly clear: Effect.Effect<void, KeyValueStoreError>

  /**
   * Returns the number of entries.
   */
  readonly size: Effect.Effect<number, KeyValueStoreError>

  /**
   * Updates the value of the specified key if it exists.
   */
  readonly modify: (
    key: string,
    f: (value: S["Type"]) => S["Type"]
  ) => Effect.Effect<
    Option.Option<S["Type"]>,
    KeyValueStoreError | Schema.SchemaError,
    S["DecodingServices"] | S["EncodingServices"]
  >

  /**
   * Returns true if the KeyValueStore contains the specified key.
   */
  readonly has: (key: string) => Effect.Effect<boolean, KeyValueStoreError>

  /**
   * Checks whether the KeyValueStore contains any entries.
   */
  readonly isEmpty: Effect.Effect<boolean, KeyValueStoreError>
}

/**
 * Adapts a `KeyValueStore` into a `SchemaStore` using the schema's JSON codec.
 *
 * @stability unstable
 * @category converting
 * @since 4.0.0
 */
export const toSchemaStore = <S extends Schema.Constraint>(self: KeyValueStore, schema: S): SchemaStore<S> => {
  const serializer = Schema.toCodecJson(schema)
  const jsonSchema = Schema.fromJsonString(serializer)
  const decode = Schema.decodeEffect(jsonSchema)
  const encode = Schema.encodeEffect(jsonSchema)

  const get = (key: string) =>
    Effect.flatMap(
      self.get(key),
      UndefinedOr.match({
        onUndefined: () => Effect.succeedNone,
        onDefined: (value) => Effect.asSome(decode(value))
      })
    )

  const set = (key: string, value: S["Type"]) => Effect.flatMap(encode(value), (json) => self.set(key, json))

  const modify = (key: string, f: (value: S["Type"]) => S["Type"]) =>
    Effect.flatMap(
      get(key),
      (o) => {
        if (Option.isNone(o)) {
          return Effect.succeedNone
        }
        const newValue = f(o.value)
        return Effect.as(
          set(key, newValue),
          Option.some(newValue)
        )
      }
    )

  return {
    [SchemaStoreTypeId]: SchemaStoreTypeId,
    get,
    set,
    modify,
    remove: self.remove,
    clear: self.clear,
    size: self.size,
    has: self.has,
    isEmpty: self.isEmpty
  }
}

/**
 * Provides a `KeyValueStore` backed by a Web `Storage` instance such as
 * `localStorage` or `sessionStorage`.
 *
 * **Details**
 *
 * This layer uses the Web Storage API:
 * https://developer.mozilla.org/en-US/docs/Web/API/Web_Storage_API
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const layerStorage = (
  evaluate: LazyArg<Storage>
): Layer.Layer<KeyValueStore> =>
  Layer.sync(KeyValueStore)(() => {
    const storage = evaluate()
    return makeStringOnly({
      get: (key: string) =>
        Effect.try({
          try: () => storage.getItem(key) ?? undefined,
          catch: (cause) =>
            new KeyValueStoreError({
              key,
              method: "get",
              message: `Unable to get item with key ${key}`,
              cause
            })
        }),

      set: (key: string, value: string) =>
        Effect.try({
          try: () => storage.setItem(key, value),
          catch: (cause) =>
            new KeyValueStoreError({
              key,
              method: "set",
              message: `Unable to set item with key ${key}`,
              cause
            })
        }),

      remove: (key: string) =>
        Effect.try({
          try: () => storage.removeItem(key),
          catch: (cause) =>
            new KeyValueStoreError({
              key,
              method: "remove",
              message: `Unable to remove item with key ${key}`,
              cause
            })
        }),

      clear: Effect.try({
        try: () => storage.clear(),
        catch: (cause) =>
          new KeyValueStoreError({
            method: "clear",
            message: `Unable to clear storage`,
            cause
          })
      }),

      size: Effect.try({
        try: () => storage.length,
        catch: (cause) =>
          new KeyValueStoreError({
            method: "size",
            message: `Unable to get size`,
            cause
          })
      })
    })
  })
