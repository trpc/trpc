/**
 * Connects Effect SQL to PGlite, the embedded PostgreSQL-compatible database
 * from `@electric-sql/pglite`.
 *
 * This module can create a managed PGlite instance or wrap an existing one and
 * expose it as both `PgliteClient` and the generic Effect SQL client. The client
 * runs PostgreSQL-style SQL, adds helpers for JSON values and LISTEN/NOTIFY
 * messages, can dump the PGlite data directory, and can refresh PGlite array
 * types. It also provides layers and maps common PostgreSQL-style failures into
 * Effect SQL errors.
 *
 * @stability unstable
 * @since 4.0.0
 */
import { PGlite, type PGliteInterface, type PGliteOptions } from "@electric-sql/pglite"
import * as Config from "effect/Config"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Fiber from "effect/Fiber"
import * as Layer from "effect/Layer"
import * as Queue from "effect/Queue"
import * as Reactivity from "effect/reactivity/Reactivity"
import * as Scope from "effect/Scope"
import * as Semaphore from "effect/Semaphore"
import * as Client from "effect/sql/SqlClient"
import type { Connection } from "effect/sql/SqlConnection"
import {
  AuthenticationError,
  AuthorizationError,
  ConnectionError,
  ConstraintError,
  DeadlockError,
  LockTimeoutError,
  SerializationError,
  SqlError,
  SqlSyntaxError,
  StatementTimeoutError,
  UniqueViolation,
  UnknownError
} from "effect/sql/SqlError"
import type { Custom, Fragment } from "effect/sql/Statement"
import * as Statement from "effect/sql/Statement"
import * as Stream from "effect/Stream"

/**
 * Runtime type identifier used to mark `PgliteClient` values.
 *
 * @stability unstable
 * @category type IDs
 * @since 4.0.0
 */
export const TypeId: TypeId = "~@effect/sql-pglite/PgliteClient"

/**
 * Type-level identifier used to mark `PgliteClient` values.
 *
 * @stability unstable
 * @category type IDs
 * @since 4.0.0
 */
export type TypeId = "~@effect/sql-pglite/PgliteClient"

/**
 * PGlite-backed PostgreSQL client service, extending `SqlClient` with access to the PGlite instance, JSON fragments, LISTEN/NOTIFY, data directory dumps, and array type refresh.
 *
 * @stability unstable
 * @category services
 * @since 4.0.0
 */
export interface PgliteClient extends Client.SqlClient {
  readonly [TypeId]: TypeId
  readonly config: PgliteClientConfig
  readonly pglite: PGliteInterface
  readonly json: (_: unknown) => Fragment
  /**
   * Subscribes to a PGlite notification channel.
   *
   * **Details**
   *
   * The effect completes after the listener is installed. Notifications are
   * buffered in the returned dequeue, and the subscription remains active
   * until the required scope closes.
   */
  readonly listen: (
    channel: string
  ) => Effect.Effect<Queue.Dequeue<string>, SqlError, Scope.Scope>
  readonly notify: (channel: string, payload: string) => Effect.Effect<void, SqlError>
  readonly dumpDataDir: (compression?: "none" | "gzip" | "auto") => Effect.Effect<File | Blob, SqlError>
  readonly refreshArrayTypes: Effect.Effect<void, SqlError>
}

/**
 * Service tag for the PGlite client service.
 *
 * **When to use**
 *
 * Use to access or provide a PGlite client through the Effect context.
 *
 * @stability unstable
 * @category services
 * @since 4.0.0
 */
export const PgliteClient = Context.Service<PgliteClient>("@effect/sql-pglite/PgliteClient")

/**
 * Configuration for a PGlite client, either by supplying PGlite creation options or an existing live PGlite client.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type PgliteClientConfig = PgliteClientConfig.Create | PgliteClientConfig.Live

/**
 * Namespace containing the configuration variants for `PgliteClient`.
 *
 * @stability unstable
 * @since 4.0.0
 */
export declare namespace PgliteClientConfig {
  /**
   * Shared PGlite client options for span attributes, query/result name transformations, and JSON value transformation.
   *
   * @stability unstable
   * @category models
   * @since 4.0.0
   */
  export interface Base {
    readonly spanAttributes?: Record<string, unknown> | undefined
    readonly transformResultNames?: ((str: string) => string) | undefined
    readonly transformQueryNames?: ((str: string) => string) | undefined
    readonly transformJson?: boolean | undefined
  }

  /**
   * Configuration used to create a managed PGlite instance from PGlite constructor options.
   *
   * @stability unstable
   * @category models
   * @since 4.0.0
   */
  export interface Create extends Base, PGliteOptions {}

  /**
   * Configuration that uses an existing PGlite client. The supplied `liveClient` is caller-owned and is not closed by the Effect client.
   *
   * @stability unstable
   * @category models
   * @since 4.0.0
   */
  export interface Live extends Base {
    readonly liveClient: PGliteInterface
  }

  /**
   * Config-friendly subset of PGlite creation options, including data directory, username, database, relaxed durability, and shared transform options.
   *
   * @stability unstable
   * @category models
   * @since 4.0.0
   */
  export interface ConfigBase extends Base {
    readonly dataDir?: string | undefined
    readonly username?: string | undefined
    readonly database?: string | undefined
    readonly relaxedDurability?: boolean | undefined
  }
}

/**
 * Creates a scoped PGlite SQL client. When no live client is supplied it creates and closes a PGlite instance; when `liveClient` is supplied, the caller retains ownership.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const make = (
  options: PgliteClientConfig = {}
): Effect.Effect<PgliteClient, SqlError, Scope.Scope | Reactivity.Reactivity> =>
  Effect.gen(function*() {
    const pglite = "liveClient" in options
      ? options.liveClient
      : yield* Effect.acquireRelease(
        Effect.tryPromise({
          try: async () => {
            const pg = new PGlite(options)
            await pg.waitReady
            return pg
          },
          catch: (cause) => new SqlError({ reason: classifyError(cause, "PgliteClient: Failed to connect", "connect") })
        }),
        (pg) => Effect.promise(() => pg.close()).pipe(Effect.timeoutOption(1000)),
        { interruptible: true }
      )

    return yield* fromClient({ ...options, liveClient: pglite })
  })

/**
 * Builds a `PgliteClient` around an existing PGlite instance, adding SQL client operations, LISTEN/NOTIFY, dump helpers, and serialized access.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const fromClient = (
  options:
    & PgliteClientConfig.Base
    & {
      readonly liveClient: PGliteInterface
    }
): Effect.Effect<PgliteClient, SqlError, Scope.Scope | Reactivity.Reactivity> =>
  Effect.gen(function*() {
    const pglite = options.liveClient
    const compiler = makeCompiler(options.transformQueryNames, options.transformJson)
    const transformRows = options.transformResultNames
      ? Statement.defaultTransforms(options.transformResultNames, options.transformJson).array
      : undefined

    const spanAttributes: Array<[string, unknown]> = [
      ...(options.spanAttributes ? Object.entries(options.spanAttributes) : []),
      [ATTR_DB_SYSTEM_NAME, "postgresql"]
    ]

    const connection = new PgliteConnection(pglite)
    const semaphore = Semaphore.makeUnsafe(1)
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

    const config = options as PgliteClientConfig
    const client = yield* Client.make({
      acquirer,
      compiler,
      transactionAcquirer,
      releaseSavepoint: (name) => `RELEASE SAVEPOINT ${name}`,
      spanAttributes,
      transformRows
    })

    return Object.assign(
      client,
      {
        [TypeId]: TypeId as TypeId,
        config,
        pglite,
        json: (_: unknown) => Statement.fragment([PgJson(_)]),
        listen: Effect.fnUntraced(function*(channel: string) {
          const queue = yield* Queue.unbounded<string>()
          yield* Effect.acquireRelease(
            Effect.tryPromise({
              try: () =>
                pglite.listen(channel, (payload) => {
                  Queue.offerUnsafe(queue, payload)
                }),
              catch: (cause) => new SqlError({ reason: classifyError(cause, "Failed to listen", "listen") })
            }),
            (unlisten) => Effect.promise(() => unlisten()),
            { interruptible: true }
          )
          yield* Effect.addFinalizer(() => Queue.shutdown(queue))
          return queue
        }),
        notify: (channel: string, payload: string) =>
          Effect.tryPromise({
            try: () => pglite.exec(`NOTIFY ${escape(channel)}, ${escapeLiteral(payload)}`),
            catch: (cause) => new SqlError({ reason: classifyError(cause, "Failed to notify", "notify") })
          }).pipe(
            semaphore.withPermit,
            Effect.asVoid
          ),
        dumpDataDir: (compression?: "none" | "gzip" | "auto") =>
          semaphore.withPermit(
            Effect.tryPromise({
              try: () => pglite.dumpDataDir(compression),
              catch: (cause) => new SqlError({ reason: classifyError(cause, "Failed to dump data dir", "dumpDataDir") })
            })
          ),
        refreshArrayTypes: semaphore.withPermit(
          Effect.tryPromise({
            try: () => pglite.refreshArrayTypes(),
            catch: (cause) =>
              new SqlError({ reason: classifyError(cause, "Failed to refresh array types", "refreshArrayTypes") })
          })
        )
      }
    )
  })

class PgliteConnection implements Connection {
  readonly pglite: PGliteInterface
  constructor(pglite: PGliteInterface) {
    this.pglite = pglite
  }

  private run(method: string, sql: string, params: ReadonlyArray<unknown>) {
    return Effect.map(
      Effect.tryPromise({
        try: () => this.pglite.query<any>(sql, params as Array<any>),
        catch: (cause) => new SqlError({ reason: classifyError(cause, "Failed to execute statement", method) })
      }),
      (result) => result.rows
    )
  }
  execute(
    sql: string,
    params: ReadonlyArray<unknown>,
    transformRows: (<A extends object>(row: ReadonlyArray<A>) => ReadonlyArray<A>) | undefined
  ) {
    return transformRows
      ? Effect.map(this.run("execute", sql, params), transformRows)
      : this.run("execute", sql, params)
  }
  executeRaw(sql: string, params: ReadonlyArray<unknown>) {
    return Effect.tryPromise({
      try: () => this.pglite.query<any>(sql, params as Array<any>),
      catch: (cause) => new SqlError({ reason: classifyError(cause, "Failed to execute statement", "executeRaw") })
    })
  }
  executeValues(sql: string, params: ReadonlyArray<unknown>) {
    return Effect.map(
      Effect.tryPromise({
        try: () => this.pglite.query<any>(sql, params as Array<any>, { rowMode: "array" }),
        catch: (cause) => new SqlError({ reason: classifyError(cause, "Failed to execute statement", "executeValues") })
      }),
      (result) => result.rows as ReadonlyArray<ReadonlyArray<any>>
    )
  }
  executeValuesUnprepared(sql: string, params: ReadonlyArray<unknown>) {
    return Effect.map(
      Effect.tryPromise({
        try: () => this.pglite.query<any>(sql, params as Array<any>, { rowMode: "array" }),
        catch: (cause) =>
          new SqlError({ reason: classifyError(cause, "Failed to execute statement", "executeValuesUnprepared") })
      }),
      (result) => result.rows as ReadonlyArray<ReadonlyArray<any>>
    )
  }
  executeUnprepared(
    sql: string,
    params: ReadonlyArray<unknown>,
    transformRows: (<A extends object>(row: ReadonlyArray<A>) => ReadonlyArray<A>) | undefined
  ) {
    return transformRows
      ? Effect.map(this.run("executeUnprepared", sql, params), transformRows)
      : this.run("executeUnprepared", sql, params)
  }
  executeStream(
    sql: string,
    params: ReadonlyArray<unknown>,
    transformRows: (<A extends object>(row: ReadonlyArray<A>) => ReadonlyArray<A>) | undefined
  ) {
    const eff = transformRows
      ? Effect.map(this.run("executeStream", sql, params), transformRows)
      : this.run("executeStream", sql, params)
    return Stream.fromArrayEffect(eff)
  }
}

/**
 * Creates a layer from an effect that acquires a `PgliteClient`, providing both `PgliteClient` and `SqlClient`.
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const layerFrom = <E, R>(
  acquire: Effect.Effect<PgliteClient, E, R>
): Layer.Layer<PgliteClient | Client.SqlClient, E, Exclude<R, Scope.Scope | Reactivity.Reactivity>> =>
  Layer.effectContext(
    Effect.map(acquire, (client) =>
      Context.make(PgliteClient, client).pipe(
        Context.add(Client.SqlClient, client)
      ))
  ).pipe(Layer.provide(Reactivity.layer)) as any

/**
 * Creates a layer from a `Config`-wrapped PGlite client configuration, providing both `PgliteClient` and `SqlClient`.
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const layerConfig: (
  config: Config.Wrap<PgliteClientConfig.ConfigBase>
) => Layer.Layer<PgliteClient | Client.SqlClient, Config.ConfigError | SqlError> = (
  config: Config.Wrap<PgliteClientConfig.ConfigBase>
): Layer.Layer<PgliteClient | Client.SqlClient, Config.ConfigError | SqlError> =>
  layerFrom(Effect.flatMap(
    Config.unwrap(config),
    (resolved) => make(resolved as PgliteClientConfig)
  ))

/**
 * Creates a layer from a concrete PGlite client configuration, providing both `PgliteClient` and `SqlClient`.
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const layer = (
  config?: PgliteClientConfig | undefined
): Layer.Layer<PgliteClient | Client.SqlClient, SqlError> => layerFrom(make(config))

/**
 * Creates the PGlite statement compiler, using PostgreSQL `$1` placeholders, double-quoted identifiers, returning clauses, and optional JSON value transformation.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const makeCompiler = (
  transform?: (_: string) => string,
  transformJson = true
): Statement.Compiler => {
  const transformValue = transformJson && transform
    ? Statement.defaultTransforms(transform).value
    : undefined

  return Statement.makeCompiler<PgCustom>({
    dialect: "pg",
    placeholder(_) {
      return `$${_}`
    },
    onIdentifier: transform ?
      function(value, withoutTransform) {
        return withoutTransform ? escape(value) : escape(transform(value))
      } :
      escape,
    onRecordUpdate(placeholders, valueAlias, valueColumns, values, returning) {
      return [
        `(values ${placeholders}) AS ${valueAlias}${valueColumns}${returning ? ` RETURNING ${returning[0]}` : ""}`,
        returning ?
          values.flat().concat(returning[1]) :
          values.flat()
      ]
    },
    onCustom(type, placeholder, withoutTransform) {
      switch (type.kind) {
        case "PgJson": {
          const value = withoutTransform || transformValue === undefined
            ? type.paramA
            : transformValue(type.paramA)
          return [
            placeholder(undefined),
            [typeof value === "string" ? JSON.stringify(value) : value]
          ]
        }
      }
    }
  })
}

const escape = Statement.defaultEscape("\"")
const escapeLiteral = (value: string) => `'${value.replace(/'/g, "''")}'`

/**
 * PGlite-specific custom statement fragments supported by the compiler, currently JSON parameter fragments.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type PgCustom = PgJson

/**
 * @category models
 * @since 4.0.0
 */
interface PgJson extends Custom<"PgJson", unknown> {}
const PgJson = Statement.custom<PgJson>("PgJson")

const ATTR_DB_SYSTEM_NAME = "db.system.name"

const pgCodeFromCause = (cause: unknown): string | undefined => {
  if (typeof cause !== "object" || cause === null || !("code" in cause)) {
    return undefined
  }
  const code = cause.code
  return typeof code === "string" ? code : undefined
}

const pgConstraintFromCause = (cause: unknown): string => {
  if (typeof cause !== "object" || cause === null || !("constraint" in cause)) {
    return "unknown"
  }
  const constraint = cause.constraint
  if (typeof constraint !== "string") {
    return "unknown"
  }
  const normalized = constraint.trim()
  return normalized.length === 0 ? "unknown" : normalized
}

const classifyError = (
  cause: unknown,
  message: string,
  operation: string
) => {
  const props = { cause, message, operation }
  const code = pgCodeFromCause(cause)
  if (code !== undefined) {
    if (code.startsWith("08")) {
      return new ConnectionError(props)
    }
    if (code.startsWith("28")) {
      return new AuthenticationError(props)
    }
    if (code === "42501") {
      return new AuthorizationError(props)
    }
    if (code.startsWith("42")) {
      return new SqlSyntaxError(props)
    }
    if (code === "23505") {
      return new UniqueViolation({ ...props, constraint: pgConstraintFromCause(cause) })
    }
    if (code.startsWith("23")) {
      return new ConstraintError(props)
    }
    if (code === "40P01") {
      return new DeadlockError(props)
    }
    if (code === "40001") {
      return new SerializationError(props)
    }
    if (code === "55P03") {
      return new LockTimeoutError(props)
    }
    if (code === "57014") {
      return new StatementTimeoutError(props)
    }
  }
  return new UnknownError(props)
}
