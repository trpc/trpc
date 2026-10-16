/**
 * Runs SQL migrations with `SqlClient`.
 *
 * A migrator loads numbered migration effects, records completed ids in a
 * migrations table, and runs only pending migrations in a transaction. It
 * creates the table when needed, detects duplicate ids, treats concurrent runs
 * as locked, and can dump the schema after successful migrations.
 *
 * @stability unstable
 * @since 4.0.0
 */
import * as Arr from "../Array.ts"
import * as Data from "../Data.ts"
import * as Effect from "../Effect.ts"
import { FileSystem } from "../FileSystem.ts"
import { pipe } from "../Function.ts"
import * as Option from "../Option.ts"
import * as Order from "../Order.ts"
import { Path } from "../Path.ts"
import * as Client from "./SqlClient.ts"
import type { SqlError } from "./SqlError.ts"

/**
 * Options for running SQL migrations, including the migration loader, optional
 * schema dump directory, and migrations table name.
 *
 * @stability unstable
 * @category options
 * @since 4.0.0
 */
export interface MigratorOptions<R = never> {
  readonly loader: Loader<R>
  readonly schemaDirectory?: string
  readonly table?: string
}

/**
 * Effect that resolves the available migrations for the migrator or fails with a
 * `MigrationError`.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type Loader<R = never> = Effect.Effect<
  ReadonlyArray<ResolvedMigration>,
  MigrationError,
  R
>

/**
 * Tuple produced by a migration loader, containing the migration id, migration
 * name, and an effect that loads the migration implementation.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type ResolvedMigration = readonly [
  id: number,
  name: string,
  load: Effect.Effect<any, any, Client.SqlClient>
]

/**
 * Metadata for a migration recorded in the migrations table, including its id,
 * name, and creation timestamp.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface Migration {
  readonly id: number
  readonly name: string
  readonly createdAt: Date
}

/**
 * Error raised while loading, validating, locking, or running SQL migrations.
 *
 * @stability unstable
 * @category errors
 * @since 4.0.0
 */
export class MigrationError extends Data.TaggedError("MigrationError")<{
  readonly _tag: "MigrationError"
  readonly cause?: unknown
  readonly kind:
    | "BadState"
    | "ImportError"
    | "Failed"
    | "Duplicates"
    | "Locked"
  readonly message: string
}> {}

/**
 * Creates a migrator that ensures the migrations table exists, runs pending
 * migrations in a transaction, and optionally dumps the schema after successful
 * migrations.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const make = <RD = never>({
  dumpSchema = () => Effect.void
}: {
  dumpSchema?: (
    path: string,
    migrationsTable: string
  ) => Effect.Effect<void, MigrationError, RD>
}) =>
<R2 = never>({
  loader,
  schemaDirectory,
  table = "effect_sql_migrations"
}: MigratorOptions<R2>): Effect.Effect<
  ReadonlyArray<readonly [id: number, name: string]>,
  MigrationError | SqlError,
  Client.SqlClient | RD | R2
> =>
  Effect.gen(function*() {
    const sql = yield* Client.SqlClient

    const ensureMigrationsTable = sql.onDialectOrElse({
      mssql: () =>
        sql`IF OBJECT_ID(N'${sql.literal(table)}', N'U') IS NULL
  CREATE TABLE ${sql(table)} (
    migration_id INT NOT NULL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    created_at DATETIME NOT NULL DEFAULT GETDATE()
  )`,
      mysql: () =>
        sql`CREATE TABLE IF NOT EXISTS ${sql(table)} (
  migration_id INTEGER UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  name VARCHAR(255) NOT NULL,
  PRIMARY KEY (migration_id)
)`,
      pg: () =>
        Effect.catch(
          sql`select ${table}::regclass`,
          () =>
            sql`CREATE TABLE ${sql(table)} (
  migration_id integer primary key,
  created_at timestamp with time zone not null default now(),
  name text not null
)`
        ),
      orElse: () =>
        sql`CREATE TABLE IF NOT EXISTS ${sql(table)} (
  migration_id integer PRIMARY KEY NOT NULL,
  created_at datetime NOT NULL DEFAULT current_timestamp,
  name VARCHAR(255) NOT NULL
)`
    })

    const insertMigrations = (
      rows: ReadonlyArray<[id: number, name: string]>
    ) =>
      sql`INSERT INTO ${sql(table)} ${
        sql.insert(
          rows.map(([migration_id, name]) => ({ migration_id, name }))
        )
      }`.withoutTransform

    const latestMigration = Effect.map(
      sql<{ migration_id: number; name: string; created_at: Date }>`SELECT migration_id, name, created_at FROM ${
        sql(table)
      } ORDER BY migration_id DESC`.withoutTransform,
      (_) =>
        Option.map(
          Option.fromNullishOr(_[0] as any),
          ({ created_at, migration_id, name }): Migration => ({
            id: migration_id,
            name,
            createdAt: created_at
          })
        )
    )

    const loadMigration = ([id, name, load]: ResolvedMigration) =>
      Effect.catchDefect(load, (_) =>
        Effect.fail(
          new MigrationError({
            kind: "ImportError",
            message: `Could not import migration "${id}_${name}"\n\n${_}`
          })
        )).pipe(
          Effect.flatMap((_) =>
            Effect.isEffect(_)
              ? Effect.succeed(_)
              : _.default
              ? Effect.succeed(_.default?.default ?? _.default)
              : Effect.fail(
                new MigrationError({
                  kind: "ImportError",
                  message: `Default export not found for migration "${id}_${name}"`
                })
              )
          ),
          Effect.filterOrFail(
            (_): _ is Effect.Effect<any, any, Client.SqlClient> => Effect.isEffect(_),
            () =>
              new MigrationError({
                kind: "ImportError",
                message: `Default export was not an Effect for migration "${id}_${name}"`
              })
          )
        )

    const runMigration = (
      id: number,
      name: string,
      effect: Effect.Effect<unknown, unknown, Client.SqlClient>
    ) =>
      Effect.catch(effect, (error: unknown) =>
        Effect.die(
          new MigrationError({
            cause: error,
            kind: "Failed",
            message: `Migration "${id}_${name}" failed`
          })
        ))

    // === run

    const run = Effect.gen(function*() {
      yield* sql.onDialectOrElse({
        pg: () => sql`LOCK TABLE ${sql(table)} IN ACCESS EXCLUSIVE MODE`,
        orElse: () => Effect.void
      })

      const [latestMigrationId, current] = yield* Effect.all([
        Effect.map(
          latestMigration,
          Option.match({
            onNone: () => 0,
            onSome: (_) => _.id
          })
        ),
        loader
      ])

      if (new Set(current.map(([id]) => id)).size !== current.length) {
        return yield* new MigrationError({
          kind: "Duplicates",
          message: "Found duplicate migration id's"
        })
      }

      const required: Array<ResolvedMigration> = []

      for (const resolved of current) {
        const [currentId, currentName] = resolved
        if (currentId <= latestMigrationId) {
          continue
        }

        required.push([
          currentId,
          currentName,
          yield* loadMigration(resolved)
        ])
      }

      if (required.length > 0) {
        yield* pipe(
          insertMigrations(required.map(([id, name]) => [id, name])),
          Effect.mapError((error): MigrationError | SqlError =>
            isConstraintConflict(error)
              ? new MigrationError({
                kind: "Locked",
                message: "Migrations already running"
              })
              : error
          )
        )
      }

      yield* Effect.forEach(
        required,
        ([id, name, effect]) =>
          Effect.logDebug(`Running migration`).pipe(
            Effect.flatMap(() => runMigration(id, name, effect)),
            Effect.annotateLogs("migration_id", String(id)),
            Effect.annotateLogs("migration_name", name),
            Effect.withSpan(`Migrator ${id}_${name}`)
          ),
        { discard: true }
      )

      yield* pipe(
        latestMigration,
        Effect.flatMap(
          Option.match({
            onNone: () => Effect.logDebug(`Migrations complete`),
            onSome: (_) =>
              Effect.logDebug(`Migrations complete`).pipe(
                Effect.annotateLogs("latest_migration_id", _.id.toString()),
                Effect.annotateLogs("latest_migration_name", _.name)
              )
          })
        )
      )

      return required.map(([id, name]) => [id, name] as const)
    })

    yield* ensureMigrationsTable

    const completed = yield* pipe(
      sql.withTransaction(run),
      Effect.catchTag("MigrationError", (_) =>
        _.kind === "Locked"
          ? Effect.as(Effect.logDebug(_.message), [])
          : Effect.fail(_))
    )

    if (schemaDirectory && completed.length > 0) {
      yield* dumpSchema(`${schemaDirectory}/_schema.sql`, table).pipe(
        Effect.catchCause((cause) => Effect.logInfo("Could not dump schema", cause))
      )
    }

    return completed
  })

const migrationOrder = Order.make<ResolvedMigration>(([a], [b]) => Order.Number(a, b))

const isConstraintConflict = (error: SqlError): boolean =>
  error.reason._tag === "ConstraintError" || error.reason._tag === "UniqueViolation"

/**
 * Creates a migration loader from a glob record of dynamic import functions,
 * parsing files named `<id>_<name>.js`, `<id>_<name>.ts`,
 * `<id>_<name>.mjs`, or `<id>_<name>.mts` and sorting migrations by id.
 *
 * @stability unstable
 * @category loaders
 * @since 4.0.0
 */
export const fromGlob = (
  migrations: Record<string, () => Promise<any>>
): Loader =>
  pipe(
    Object.keys(migrations),
    Arr.flatMapNullishOr((_) => _.match(/^(?:.*\/)?(\d+)_([^.]+)\.(js|ts|mjs|mts)$/)),
    Arr.map(
      ([key, id, name]): ResolvedMigration => [
        Number(id),
        name,
        Effect.promise(() => migrations[key]())
      ]
    ),
    Arr.sort(migrationOrder),
    Effect.succeed
  )

/**
 * Creates a migration loader from a Babel-style glob record, parsing keys such
 * as `_<id>_<name>Js`, `_<id>_<name>Ts`, `_<id>_<name>Mjs`, or
 * `_<id>_<name>Mts` and sorting migrations by id.
 *
 * @stability unstable
 * @category loaders
 * @since 4.0.0
 */
export const fromBabelGlob = (migrations: Record<string, any>): Loader =>
  pipe(
    Object.keys(migrations),
    Arr.flatMapNullishOr((_) => _.match(/^_(\d+)_([^.]+?)(Js|Ts|Mjs|Mts)?$/)),
    Arr.map(
      ([key, id, name]): ResolvedMigration => [
        Number(id),
        name,
        Effect.succeed(migrations[key])
      ]
    ),
    Arr.sort(migrationOrder),
    Effect.succeed
  )

/**
 * Creates a migration loader from a record of migration effects keyed by
 * `<id>_<name>`, sorted by migration id.
 *
 * @stability unstable
 * @category loaders
 * @since 4.0.0
 */
export const fromRecord = (migrations: Record<string, Effect.Effect<void, unknown, Client.SqlClient>>): Loader =>
  pipe(
    Object.keys(migrations),
    Arr.flatMapNullishOr((_) => _.match(/^(\d+)_(.+)$/)),
    Arr.map(
      ([key, id, name]): ResolvedMigration => [
        Number(id),
        name,
        Effect.succeed(migrations[key])
      ]
    ),
    Arr.sort(migrationOrder),
    Effect.succeed
  )

/**
 * Creates a migration loader that reads a directory with `FileSystem`, imports
 * files named `<id>_<name>.js`, `<id>_<name>.ts`,
 * `<id>_<name>.mjs`, or `<id>_<name>.mts`, and sorts migrations by id.
 *
 * **Details**
 *
 * Requires a `Path` service appropriate for the migration directory's path
 * syntax. On Windows, prefer a platform-aware implementation such as
 * `NodePath.layer`; the core `Path.layer` uses POSIX semantics and does not
 * preserve Windows drive-letter paths.
 *
 * @stability unstable
 * @category loaders
 * @since 4.0.0
 */
export const fromFileSystem: (directory: string) => Loader<FileSystem | Path> = Effect.fnUntraced(function*(directory) {
  const Fs = yield* FileSystem
  const path = yield* Path
  const files = yield* Effect.mapError(
    Fs.readDirectory(directory),
    (cause) =>
      new MigrationError({
        kind: "Failed",
        cause,
        message: "Failed to read migrations directory"
      })
  )
  return files
    .map((file) => Option.fromNullishOr(file.match(/^(?:.*\/)?(\d+)_([^.]+)\.(js|ts|mjs|mts)$/)))
    .flatMap(
      Option.match({
        onNone: () => [],
        onSome: ([basename, id, name]): ReadonlyArray<ResolvedMigration> =>
          [
            [
              Number(id),
              name,
              // `import` needs a file URL: on Windows an absolute path such as
              // `D:\migrations\1_init.ts` is rejected by the ESM loader. `orDie` keeps the
              // failure a defect so `loadMigration` reports it as an import error.
              Effect.flatMap(Effect.orDie(path.toFileUrl(path.join(directory, basename))), (url) =>
                Effect.promise(
                  () =>
                    import(
                      /* @vite-ignore */
                      /* webpackIgnore: true */
                      url.href
                    )
                ))
            ]
          ] as const
      })
    )
    .sort(([a], [b]) => a - b)
})
