/**
 * MySQL adapter for Effect SQL, backed by the `mysql2` driver.
 *
 * This module provides constructors and layers for a {@link MysqlClient} and
 * the generic Effect SQL client service. `make` creates a managed mysql2 pool,
 * checks the connection with `SELECT 1`, maps mysql2 failures to `SqlError`,
 * supports transaction connections, and exposes streaming queries through
 * mysql2 query streams. It also provides direct and config-backed layers plus a
 * MySQL statement compiler.
 *
 * @since 4.0.0
 */
import * as Config from "effect/Config"
import * as Context from "effect/Context"
import * as Duration from "effect/Duration"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Reactivity from "effect/reactivity/Reactivity"
import * as Redacted from "effect/Redacted"
import type { Scope } from "effect/Scope"
import * as Client from "effect/sql/SqlClient"
import type { Connection } from "effect/sql/SqlConnection"
import {
  AuthenticationError,
  AuthorizationError,
  ConnectionError,
  ConstraintError,
  DeadlockError,
  LockTimeoutError,
  SqlError,
  SqlSyntaxError,
  StatementTimeoutError,
  UniqueViolation,
  UnknownError
} from "effect/sql/SqlError"
import { asyncPauseResume } from "effect/sql/SqlStream"
import * as Statement from "effect/sql/Statement"
import * as Stream from "effect/Stream"
import * as Mysql from "mysql2"

const ATTR_DB_SYSTEM_NAME = "db.system.name"
const ATTR_DB_NAMESPACE = "db.namespace"
const ATTR_SERVER_ADDRESS = "server.address"
const ATTR_SERVER_PORT = "server.port"

const mysqlErrnoFromCause = (cause: unknown): number | undefined => {
  if (typeof cause !== "object" || cause === null || !("errno" in cause)) {
    return undefined
  }
  const errno = cause.errno
  return typeof errno === "number" ? errno : undefined
}

const mysqlConnectionErrorCodes = new Set([1040, 1042, 1043, 1129, 1130, 1203])
const mysqlAuthorizationErrorCodes = new Set([1044, 1142, 1143, 1227])
const mysqlSyntaxErrorCodes = new Set([1054, 1064, 1146])
const mysqlConstraintErrorCodes = new Set([1022, 1048, 1169, 1216, 1217, 1451, 1452, 1557])

const UNKNOWN_CONSTRAINT = "unknown"

const normalizeConstraintIdentifier = (identifier: unknown): string => {
  if (typeof identifier !== "string") {
    return UNKNOWN_CONSTRAINT
  }
  const trimmed = identifier.trim()
  return trimmed.length === 0 ? UNKNOWN_CONSTRAINT : trimmed
}

const mysqlCauseProperty = (cause: unknown, property: "constraint" | "message" | "sqlMessage"): unknown => {
  if (typeof cause !== "object" || cause === null || !(property in cause)) {
    return undefined
  }
  return (cause as Record<string, unknown>)[property]
}

const mysqlDuplicateEntryConstraintFromMessage = (message: unknown): string => {
  if (typeof message !== "string") {
    return UNKNOWN_CONSTRAINT
  }
  const match = /\bfor key\s+(?:'([^']*)'|\x60([^\x60]*)\x60|([^\s'\x60]+))/i.exec(message)
  return match === null ?
    UNKNOWN_CONSTRAINT :
    normalizeConstraintIdentifier(match[1] ?? match[2] ?? match[3])
}

const mysqlDuplicateEntryConstraintFromCause = (cause: unknown): string => {
  const constraint = normalizeConstraintIdentifier(mysqlCauseProperty(cause, "constraint"))
  if (constraint !== UNKNOWN_CONSTRAINT) {
    return constraint
  }
  const sqlMessageConstraint = mysqlDuplicateEntryConstraintFromMessage(mysqlCauseProperty(cause, "sqlMessage"))
  if (sqlMessageConstraint !== UNKNOWN_CONSTRAINT) {
    return sqlMessageConstraint
  }
  return mysqlDuplicateEntryConstraintFromMessage(mysqlCauseProperty(cause, "message"))
}

const classifyError = (
  cause: unknown,
  message: string,
  operation: string
) => {
  const props = { cause, message, operation }
  const errno = mysqlErrnoFromCause(cause)
  if (errno !== undefined) {
    if (mysqlConnectionErrorCodes.has(errno)) {
      return new ConnectionError(props)
    }
    if (errno === 1045) {
      return new AuthenticationError(props)
    }
    if (mysqlAuthorizationErrorCodes.has(errno)) {
      return new AuthorizationError(props)
    }
    if (mysqlSyntaxErrorCodes.has(errno)) {
      return new SqlSyntaxError(props)
    }
    if (errno === 1062) {
      return new UniqueViolation({ ...props, constraint: mysqlDuplicateEntryConstraintFromCause(cause) })
    }
    if (mysqlConstraintErrorCodes.has(errno)) {
      return new ConstraintError(props)
    }
    if (errno === 1213) {
      return new DeadlockError(props)
    }
    if (errno === 1205) {
      return new LockTimeoutError(props)
    }
    if (errno === 3024) {
      return new StatementTimeoutError(props)
    }
  }
  return new UnknownError(props)
}

/**
 * Runtime type identifier used to mark `MysqlClient` values.
 *
 * @category type IDs
 * @since 4.0.0
 */
export const TypeId: TypeId = "~@effect/sql-mysql2/MysqlClient"

/**
 * Type-level identifier used to mark `MysqlClient` values.
 *
 * @category type IDs
 * @since 4.0.0
 */
export type TypeId = "~@effect/sql-mysql2/MysqlClient"

/**
 * mysql2-backed SQL client service, extending `SqlClient` with its runtime type marker and client configuration.
 *
 * @category services
 * @since 4.0.0
 */
export interface MysqlClient extends Client.SqlClient {
  readonly [TypeId]: TypeId
  readonly config: MysqlClientConfig
}

/**
 * Service tag for the mysql2 SQL client service.
 *
 * **When to use**
 *
 * Use to access or provide a mysql2 client through the Effect context.
 *
 * @category services
 * @since 4.0.0
 */
export const MysqlClient = Context.Service<MysqlClient>("@effect/sql-mysql2/MysqlClient")

/**
 * Configuration for a mysql2 client, including connection URI or connection fields, pool options, span attributes, and query/result name transforms.
 *
 * @category models
 * @since 4.0.0
 */
export interface MysqlClientConfig {
  /**
   * Connection URI. Setting this will override the other connection options
   */
  readonly url?: Redacted.Redacted | undefined

  readonly host?: string | undefined
  readonly port?: number | undefined
  readonly database?: string | undefined
  readonly username?: string | undefined
  readonly password?: Redacted.Redacted | undefined

  readonly maxConnections?: number | undefined
  readonly connectionTTL?: Duration.Input | undefined

  /**
   * Options passed directly to the `mysql2` connection pool.
   *
   * @stability unstable
   */
  readonly poolConfig?: Mysql.PoolOptions | undefined

  /**
   * Use the text protocol instead of prepared statements, for proxies like
   * Cloudflare Hyperdrive that do not support `COM_STMT_PREPARE`.
   */
  readonly disablePreparedStatements?: boolean | undefined

  readonly spanAttributes?: Record<string, unknown> | undefined

  readonly transformResultNames?: ((str: string) => string) | undefined
  readonly transformQueryNames?: ((str: string) => string) | undefined
}

/**
 * Creates a scoped MySQL client backed by a managed mysql2 pool, verifying connectivity and supporting streaming queries through mysql2 query streams.
 *
 * @category constructors
 * @since 4.0.0
 */
export const make = (
  options: MysqlClientConfig
): Effect.Effect<MysqlClient, SqlError, Scope | Reactivity.Reactivity> =>
  Effect.gen(function*() {
    const compiler = makeCompiler(options.transformQueryNames)
    const transformRows = options.transformResultNames ?
      Statement.defaultTransforms(
        options.transformResultNames
      ).array :
      undefined
    const defaultMethod: "execute" | "query" = options.disablePreparedStatements === true ? "query" : "execute"

    class ConnectionImpl implements Connection {
      readonly conn: Mysql.PoolConnection | Mysql.Pool
      constructor(conn: Mysql.PoolConnection | Mysql.Pool) {
        this.conn = conn
      }

      private runRaw(
        sql: string,
        values?: ReadonlyArray<any>,
        rowsAsArray = false,
        method: "execute" | "query" = defaultMethod
      ) {
        return Effect.callback<unknown, SqlError>((resume) => {
          const operation = method === "query" ? "executeUnprepared" : "execute"
          ;(this.conn as any)[method]({
            sql,
            values,
            rowsAsArray
          }, (cause: unknown | null, results: unknown, _fields: any) => {
            if (cause) {
              resume(
                Effect.fail(new SqlError({ reason: classifyError(cause, "Failed to execute statement", operation) }))
              )
            } else {
              resume(Effect.succeed(results))
            }
          })
        })
      }

      private run(
        sql: string,
        values?: ReadonlyArray<any>,
        rowsAsArray = false,
        method: "execute" | "query" = defaultMethod
      ) {
        return this.runRaw(sql, values, rowsAsArray, method).pipe(
          Effect.map((results) => Array.isArray(results) ? results : [])
        )
      }

      execute(
        sql: string,
        params: ReadonlyArray<unknown>,
        transformRows: (<A extends object>(row: ReadonlyArray<A>) => ReadonlyArray<A>) | undefined
      ) {
        return transformRows
          ? Effect.map(this.run(sql, params), transformRows)
          : this.run(sql, params)
      }
      executeRaw(sql: string, params: ReadonlyArray<unknown>) {
        return this.runRaw(sql, params)
      }
      executeValues(sql: string, params: ReadonlyArray<unknown>) {
        return this.run(sql, params, true)
      }
      executeValuesUnprepared(sql: string, params: ReadonlyArray<unknown>) {
        return this.run(sql, params, true, "query")
      }
      executeUnprepared(
        sql: string,
        params: ReadonlyArray<unknown>,
        transformRows: (<A extends object>(row: ReadonlyArray<A>) => ReadonlyArray<A>) | undefined
      ) {
        return transformRows
          ? Effect.map(this.run(sql, params, false, "query"), transformRows)
          : this.run(sql, params, false, "query")
      }
      executeStream(
        sql: string,
        params: ReadonlyArray<unknown>,
        transformRows: (<A extends object>(row: ReadonlyArray<A>) => ReadonlyArray<A>) | undefined
      ) {
        const stream = queryStream(this.conn as any, sql, params)
        return transformRows
          ? Stream.mapArray(stream, (_) => transformRows(_) as any)
          : stream
      }
    }

    const pool = options.url
      ? Mysql.createPool({
        uri: Redacted.value(options.url),
        multipleStatements: true,
        supportBigNumbers: true,
        connectionLimit: options.maxConnections!,
        idleTimeout: options.connectionTTL
          ? Duration.toMillis(Duration.fromInputUnsafe(options.connectionTTL))
          : undefined as any
      })
      : Mysql.createPool({
        ...options.poolConfig,
        host: options.host,
        port: options.port,
        database: options.database,
        user: options.username,
        password: options.password
          ? Redacted.value(options.password)
          : undefined,
        multipleStatements: true,
        supportBigNumbers: true,
        connectionLimit: options.maxConnections ?? options.poolConfig?.connectionLimit,
        idleTimeout: options.connectionTTL
          ? Duration.toMillis(Duration.fromInputUnsafe(options.connectionTTL))
          : options.poolConfig?.idleTimeout
      } as Mysql.PoolOptions)

    yield* Effect.acquireRelease(
      Effect.callback<void, SqlError>((resume) => {
        ;(pool as any).query("SELECT 1", (cause: Error) => {
          if (cause) {
            resume(Effect.fail(
              new SqlError({
                reason: classifyError(cause, "MysqlClient: Failed to connect", "connect")
              })
            ))
          } else {
            resume(Effect.void)
          }
        })
      }),
      () =>
        Effect.callback<void>((resume) => {
          pool.end(() => resume(Effect.void))
        })
    ).pipe(
      Effect.timeoutOrElse({
        duration: Duration.seconds(5),
        orElse: () =>
          Effect.fail(
            new SqlError({
              reason: new ConnectionError({
                message: "MysqlClient: Connection timeout",
                cause: new Error("connection timeout"),
                operation: "connect"
              })
            })
          )
      })
    )

    const poolConnection = new ConnectionImpl(pool)

    const acquireConn = Effect.acquireRelease(
      Effect.callback<Mysql.PoolConnection, SqlError>((resume) => {
        pool.getConnection((cause, conn) => {
          if (cause) {
            resume(
              Effect.fail(
                new SqlError({
                  reason: classifyError(cause, "Failed to acquire connection", "acquireConnection")
                })
              )
            )
          } else {
            resume(Effect.succeed(conn))
          }
        })
      }),
      (conn) => Effect.sync(() => conn.release())
    )

    const transactionAcquirer = Effect.map(
      acquireConn,
      (conn) => new ConnectionImpl(conn)
    )

    const spanAttributes: Array<[string, unknown]> = [
      ...(options.spanAttributes ? Object.entries(options.spanAttributes) : []),
      [ATTR_DB_SYSTEM_NAME, "mysql"],
      [ATTR_SERVER_ADDRESS, options.host ?? "localhost"],
      [ATTR_SERVER_PORT, options.port ?? 3306]
    ]

    if (options.database) {
      spanAttributes.push([ATTR_DB_NAMESPACE, options.database])
    }

    return Object.assign(
      yield* Client.make({
        acquirer: Effect.succeed(poolConnection),
        transactionAcquirer,
        releaseSavepoint: (name) => `RELEASE SAVEPOINT ${name}`,
        compiler,
        spanAttributes,
        transformRows
      }),
      { [TypeId]: TypeId as TypeId, config: options }
    )
  })

/**
 * Creates a layer from a `Config`-wrapped MySQL client configuration, providing both `MysqlClient` and `SqlClient`.
 *
 * @category layers
 * @since 4.0.0
 */
export const layerConfig = (
  config: Config.Wrap<MysqlClientConfig>
): Layer.Layer<MysqlClient | Client.SqlClient, Config.ConfigError | SqlError> =>
  Layer.effectContext(
    Config.unwrap(config).pipe(
      Effect.flatMap(make),
      Effect.map((client) =>
        Context.make(MysqlClient, client).pipe(
          Context.add(Client.SqlClient, client)
        )
      )
    )
  ).pipe(Layer.provide(Reactivity.layer))

/**
 * Creates a layer from a concrete MySQL client configuration, providing both `MysqlClient` and `SqlClient`.
 *
 * @category layers
 * @since 4.0.0
 */
export const layer = (
  config: MysqlClientConfig
): Layer.Layer<MysqlClient | Client.SqlClient, Config.ConfigError | SqlError> =>
  Layer.effectContext(
    Effect.map(make(config), (client) =>
      Context.make(MysqlClient, client).pipe(
        Context.add(Client.SqlClient, client)
      ))
  ).pipe(Layer.provide(Reactivity.layer))

/**
 * Creates the MySQL statement compiler, using `?` placeholders and backtick-escaped identifiers.
 *
 * @category constructors
 * @since 4.0.0
 */
export const makeCompiler = (transform?: (_: string) => string) =>
  Statement.makeCompiler({
    dialect: "mysql",
    placeholder(_) {
      return `?`
    },
    onIdentifier: transform ?
      function(value, withoutTransform) {
        return withoutTransform ? escape(value) : escape(transform(value))
      } :
      escape,
    onCustom() {
      return ["", []]
    },
    onRecordUpdate() {
      return ["", []]
    }
  })

const escape = Statement.defaultEscape("`")

function queryStream(
  conn: Mysql.PoolConnection,
  sql: string,
  params?: ReadonlyArray<any>
) {
  return asyncPauseResume<any, SqlError>(Effect.fnUntraced(function*(emit) {
    const query = (conn as any).query(sql, params).stream()
    yield* Effect.addFinalizer(() => Effect.sync(() => query.destroy() as void))

    let buffer: Array<any> = []
    let taskPending = false
    query.on(
      "error",
      (cause: unknown) =>
        emit.fail(new SqlError({ reason: classifyError(cause, "Failed to stream statement", "stream") }))
    )
    query.on("data", (row: any) => {
      buffer.push(row)
      if (!taskPending) {
        taskPending = true
        queueMicrotask(() => {
          const items = buffer
          buffer = []
          emit.array(items)
          taskPending = false
        })
      }
    })
    query.on("end", () => {
      if (buffer.length > 0) {
        emit.array(buffer)
        buffer = []
      }
      emit.end()
    })

    return {
      onPause() {
        query.pause()
      },
      onResume() {
        query.resume()
      }
    }
  }))
}
