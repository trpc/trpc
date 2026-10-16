/**
 * PostgreSQL support for Effect SQL, backed by the native wire protocol client.
 *
 * @since 4.0.0
 */
import type * as Arr from "effect/Array"
import * as Config from "effect/Config"
import * as Context from "effect/Context"
import type * as Duration from "effect/Duration"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import type * as Queue from "effect/Queue"
import * as Reactivity from "effect/reactivity/Reactivity"
import type * as Redacted from "effect/Redacted"
import type * as Scope from "effect/Scope"
import * as Client from "effect/sql/SqlClient"
import type { Borrower, Connection } from "effect/sql/SqlConnection"
import { SqlError, UnknownError } from "effect/sql/SqlError"
import type { Custom, Fragment } from "effect/sql/Statement"
import * as Statement from "effect/sql/Statement"
import * as Stream from "effect/Stream"
import type { Duplex } from "node:stream"
import type { ConnectionOptions } from "node:tls"
import { validateChannelName } from "./internal/sqlError.ts"
import * as PgConnection from "./PgConnection.ts"
import * as PgPool from "./PgPool.ts"
import * as PgTypes from "./PgTypes.ts"

/**
 * The runtime type identifier for `PgClient`.
 *
 * @category type IDs
 * @since 4.0.0
 */
export const TypeId: TypeId = "~@effect/sql-pg/PgClient"

/**
 * The type-level identifier for `PgClient`.
 *
 * @category type IDs
 * @since 4.0.0
 */
export type TypeId = "~@effect/sql-pg/PgClient"

/**
 * A PostgreSQL `SqlClient` with JSON and `LISTEN`/`NOTIFY` helpers.
 *
 * @category services
 * @since 4.0.0
 */
export interface PgClient extends Client.SqlClient {
  readonly [TypeId]: TypeId
  readonly config: PgClientConfig
  readonly json: (_: unknown) => Fragment
  /**
   * Registers a channel listener and returns its notification queue after
   * PostgreSQL confirms `LISTEN`. The listener holds a connection until the
   * scope closes.
   * Connection failures after registration fail the queue with the original
   * `SqlError`. Intentional scope closure interrupts consumers.
   */
  readonly listen: (
    channel: string
  ) => Effect.Effect<Queue.Dequeue<PgConnection.Notification, SqlError>, SqlError, Scope.Scope>
  readonly notify: (channel: string, payload: string) => Effect.Effect<void, SqlError>
}

/**
 * The service tag for `PgClient`.
 *
 * @category services
 * @since 4.0.0
 */
export const PgClient = Context.Service<PgClient>("@effect/sql-pg/PgClient")

/**
 * Connection and query settings for a PostgreSQL client.
 *
 * @category models
 * @since 4.0.0
 */
export interface PgClientConfig {
  readonly url?: Redacted.Redacted | undefined

  readonly host?: string | undefined
  readonly port?: number | undefined
  readonly path?: string | undefined
  readonly ssl?: boolean | ConnectionOptions | undefined
  readonly database?: string | undefined
  readonly username?: string | undefined
  /**
   * A static password or an Effect evaluated for each connection attempt.
   * Providers must handle typed errors and require no services.
   * {@link Effect.orDie} converts typed errors to defects, not retryable SQL errors.
   */
  readonly password?: Redacted.Redacted | Effect.Effect<Redacted.Redacted> | undefined

  readonly connectTimeout?: Duration.Input | undefined

  readonly stream?: (() => Duplex) | undefined

  /**
   * Overrides `startupParameters.application_name`, the URL's `application_name`,
   * and the default `"@effect/sql-pg"`, in that order.
   */
  readonly applicationName?: string | undefined
  /**
   * Session defaults sent in every physical connection's startup packet.
   * Names are lowercased; `user`, `database`, `replication`, and `options` are
   * reserved. `client_encoding` only accepts UTF8 / UTF-8 (case-insensitive).
   * Empty names and NUL bytes fail before connecting; PostgreSQL validates
   * other settings. Do not set the same GUC here and in `startupOptions`.
   */
  readonly startupParameters?: Readonly<Record<string, string>> | undefined
  /**
   * Opaque PostgreSQL startup options, overriding the URL's `options` parameter.
   * Forwarded without parsing `-c` flags or checking for duplicate GUCs.
   */
  readonly startupOptions?: string | undefined
  readonly spanAttributes?: Record<string, unknown> | undefined

  readonly transformResultNames?: ((str: string) => string) | undefined
  readonly transformQueryNames?: ((str: string) => string) | undefined
  readonly transformJson?: boolean | undefined
  readonly types?: PgTypes.Registry | undefined
  /**
   * Pipelines queries from multiple fibers on each pooled connection.
   * Transactions, streams, and listeners still reserve a connection.
   */
  readonly multiplex?: boolean | undefined
  /**
   * How many statements may share one connection when `multiplex` is on.
   * Defaults to `32`. Higher values trade tail latency for throughput: the
   * statements sharing a connection are pipelined into one write, and they
   * also queue behind the slowest of them.
   */
  readonly multiplexConcurrency?: number | undefined
  /**
   * Caches prepared statements by name. Enabled by default. Disable it for
   * poolers that cannot preserve named statements between queries.
   */
  readonly prepare?: boolean | undefined
  /** How many statements a connection keeps prepared. Defaults to `100`. */
  readonly preparedStatementCacheSize?: number | undefined
  /** Maximum backend message size in bytes. Defaults to 16 MiB. */
  readonly maxMessageSize?: number | undefined
}

/**
 * PostgreSQL client settings with connection pool limits and timeouts.
 *
 * @category models
 * @since 4.0.0
 */
export interface PgPoolConfig extends PgClientConfig {
  readonly idleTimeout?: Duration.Input | undefined

  readonly maxConnections?: number | undefined
  readonly minConnections?: number | undefined
  readonly connectionTTL?: Duration.Input | undefined
}

/**
 * Creates a scoped PostgreSQL client backed by a connection pool.
 *
 * @category constructors
 * @since 4.0.0
 */
export const make = (options: PgPoolConfig): Effect.Effect<PgClient, SqlError, Scope.Scope | Reactivity.Reactivity> =>
  Effect.flatMap(PgPool.make(options), (pool) =>
    makeImpl({
      acquirer: Effect.map(pool.get, makeConnection),
      borrower: (f) => pool.use((connection) => f(makeConnection(connection))),
      transactionAcquirer: Effect.map(pool.reserve, makeConnection),
      listenAcquirer: pool.reserve,
      config: options
    }))

/**
 * Creates a scoped PostgreSQL client backed by one connection.
 *
 * @category constructors
 * @since 4.0.0
 */
export const makeClient = (
  options: PgClientConfig & {
    /**
     * Opens a separate connection for each stream and listener when enabled.
     */
    readonly acquireForStream?: boolean | undefined
  }
): Effect.Effect<PgClient, SqlError, Scope.Scope | Reactivity.Reactivity> =>
  Effect.flatMap(PgConnection.make(options), (connection) =>
    makeImpl({
      acquirer: Effect.succeed(makeConnection(
        connection,
        options.acquireForStream ? PgConnection.make(options) : undefined
      )),
      transactionAcquirer: Effect.map(connection.pin, makeConnection),
      listenAcquirer: options.acquireForStream ? PgConnection.make(options) : connection.pin,
      config: options
    }))

/**
 * Builds the shared SQL facade around native connection acquirers.
 */
const makeImpl = Effect.fnUntraced(function*(
  options: {
    readonly acquirer: Effect.Effect<Connection, SqlError, Scope.Scope>
    readonly borrower?: Borrower | undefined
    readonly transactionAcquirer: Effect.Effect<Connection, SqlError, Scope.Scope>
    readonly listenAcquirer: Effect.Effect<PgConnection.PgConnection, SqlError, Scope.Scope>
    readonly config: PgClientConfig
  }
): Effect.fn.Return<PgClient, SqlError, Scope.Scope | Reactivity.Reactivity> {
  const config = options.config
  const compiler = makeCompiler(
    config.transformQueryNames,
    config.transformJson
  )
  const transformRows = config.transformResultNames ?
    Statement.defaultTransforms(
      config.transformResultNames,
      config.transformJson
    ).array :
    undefined

  const listen = (
    channel: string
  ): Effect.Effect<Queue.Dequeue<PgConnection.Notification, SqlError>, SqlError, Scope.Scope> =>
    Effect.flatMap(options.listenAcquirer, (connection) => connection.listen(channel))

  return Object.assign(
    yield* Client.make({
      acquirer: options.acquirer,
      borrower: options.borrower,
      // Postgres prepares transaction control like anything else, and a client
      // with preparation turned off falls back to the unnamed path anyway.
      prepareTransactionControls: true,
      commit,
      releaseSavepoint: (name) => `RELEASE SAVEPOINT ${name}`,
      transactionAcquirer: options.transactionAcquirer,
      compiler,
      spanAttributes: [
        ...(config.spanAttributes ? Object.entries(config.spanAttributes) : []),
        [ATTR_DB_SYSTEM_NAME, "postgresql"],
        [ATTR_DB_NAMESPACE, config.database ?? config.username ?? "postgres"],
        [ATTR_SERVER_ADDRESS, config.host ?? "localhost"],
        [ATTR_SERVER_PORT, config.port ?? 5432]
      ],
      transformRows
    }),
    {
      [TypeId]: TypeId as TypeId,
      config,
      json: (_: unknown) => Statement.fragment([PgJson(_)]),
      listen,
      notify: (channel: string, payload: string) => {
        const channelError = validateChannelName(channel, "notify")
        return channelError !== undefined ?
          Effect.fail(channelError) :
          Effect.asVoid(Effect.scoped(Effect.flatMap(
            options.acquirer,
            (conn) => conn.executeRaw(`SELECT pg_notify($1, $2)`, [channel, payload])
          )))
      }
    }
  )
})

class ConnectionImpl implements Connection {
  readonly connection: PgConnection.PgConnection
  readonly streamAcquirer: Effect.Effect<PgConnection.PgConnection, SqlError, Scope.Scope> | undefined

  constructor(
    connection: PgConnection.PgConnection,
    streamAcquirer?: Effect.Effect<PgConnection.PgConnection, SqlError, Scope.Scope> | undefined
  ) {
    this.connection = connection
    this.streamAcquirer = streamAcquirer
  }

  private run(query: string, params: ReadonlyArray<unknown>, prepare = true) {
    return Effect.map(this.connection.query(query, params, prepare), (result) => result.rows)
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
    return this.connection.query(sql, params)
  }
  executeWithoutTransform(sql: string, params: ReadonlyArray<unknown>) {
    return this.run(sql, params)
  }
  executeValues(sql: string, params: ReadonlyArray<unknown>) {
    return this.connection.queryValues(sql, params)
  }
  executeValuesUnprepared(sql: string, params: ReadonlyArray<unknown>) {
    return this.connection.queryValues(sql, params, false)
  }
  executeUnprepared(
    sql: string,
    params: ReadonlyArray<unknown>,
    transformRows: (<A extends object>(row: ReadonlyArray<A>) => ReadonlyArray<A>) | undefined
  ) {
    const operation = this.run(sql, params, false)
    return transformRows
      ? Effect.map(operation, transformRows)
      : operation
  }
  executeStream(
    sql: string,
    params: ReadonlyArray<unknown>,
    transformRows: (<A extends object>(row: ReadonlyArray<A>) => ReadonlyArray<A>) | undefined
  ) {
    const stream = this.streamAcquirer === undefined
      ? this.connection.stream(sql, params)
      : Stream.unwrap(Effect.map(this.streamAcquirer, (connection) => connection.stream(sql, params)))
    return transformRows
      ? Stream.mapArray(stream, (rows) => transformRows(rows) as Arr.NonEmptyReadonlyArray<PgConnection.Row>)
      : stream
  }
}

/** PostgreSQL returns `ROLLBACK` for `COMMIT` when a transaction is aborted. */
const commit = (conn: Connection): Effect.Effect<void, SqlError> =>
  Effect.flatMap(
    conn.executeRaw("COMMIT", []) as Effect.Effect<PgConnection.Result, SqlError>,
    (result) =>
      result.command === "ROLLBACK"
        ? Effect.fail(
          new SqlError({
            reason: new UnknownError({
              cause: new Error("COMMIT rolled back an aborted transaction"),
              message: "PgClient: COMMIT rolled back an aborted transaction",
              operation: "commit"
            })
          })
        )
        : Effect.void
  )

const makeConnection = (
  connection: PgConnection.PgConnection,
  streamAcquirer?: Effect.Effect<PgConnection.PgConnection, SqlError, Scope.Scope> | undefined
): Connection => new ConnectionImpl(connection, streamAcquirer)

/**
 * Provides both `PgClient` and `SqlClient` from an acquisition effect.
 *
 * @category layers
 * @since 4.0.0
 */
export const layerFrom = <E, R>(
  acquire: Effect.Effect<PgClient, E, R>
): Layer.Layer<PgClient | Client.SqlClient, E, Exclude<R, Scope.Scope | Reactivity.Reactivity>> =>
  Layer.effectContext(
    Effect.map(acquire, (client) =>
      Context.make(PgClient, client).pipe(
        Context.add(Client.SqlClient, client)
      ))
  ).pipe(Layer.provide(Reactivity.layer)) as any

/**
 * Creates a client layer from wrapped pool configuration.
 *
 * @category layers
 * @since 4.0.0
 */
export const layerConfig = (
  config: Config.Wrap<PgPoolConfig>
): Layer.Layer<PgClient | Client.SqlClient, Config.ConfigError | SqlError> =>
  layerFrom(Effect.flatMap(
    Config.unwrap(config),
    make
  ))

/**
 * Creates a client layer from pool configuration.
 *
 * @category layers
 * @since 4.0.0
 */
export const layer = (
  config: PgPoolConfig
): Layer.Layer<PgClient | Client.SqlClient, SqlError> => layerFrom(make(config))

/**
 * Creates the PostgreSQL statement compiler.
 *
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
            [PgTypes.jsonb(value)]
          ]
        }
      }
    }
  })
}

const escape = Statement.defaultEscape("\"")

/**
 * PostgreSQL-specific statement fragments.
 *
 * @category models
 * @since 4.0.0
 */
export type PgCustom = PgJson

/**
 * @category models
 * @since 4.0.0
 */
interface PgJson extends Custom<"PgJson", unknown> {}
/**
 * @category constructors
 * @since 4.0.0
 */
const PgJson = Statement.custom<PgJson>("PgJson")

const ATTR_DB_SYSTEM_NAME = "db.system.name"
const ATTR_DB_NAMESPACE = "db.namespace"
const ATTR_SERVER_ADDRESS = "server.address"
const ATTR_SERVER_PORT = "server.port"
