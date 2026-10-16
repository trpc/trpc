/**
 * Microsoft SQL Server client implementation for Effect SQL, backed by the
 * `tedious` driver.
 *
 * This module provides the `MssqlClient` service, constructors, layers, and SQL
 * Server statement compiler. `make` creates a pooled Tedious client, checks the
 * connection with `SELECT 1`, maps SQL Server failures to `SqlError`, and
 * supports transactions with savepoints. The SQL Server-specific service adds
 * typed Tedious parameters with `param`, stored procedure calls with `call`,
 * direct or config-backed layers, and default parameter type mappings.
 * Streaming queries are not implemented by this driver.
 *
 * @since 4.0.0
 */
import * as Config from "effect/Config"
import * as Context from "effect/Context"
import * as Deferred from "effect/Deferred"
import * as Duration from "effect/Duration"
import * as Effect from "effect/Effect"
import { identity } from "effect/Function"
import * as Layer from "effect/Layer"
import * as Pool from "effect/Pool"
import * as Reactivity from "effect/reactivity/Reactivity"
import * as Rec from "effect/Record"
import * as Redacted from "effect/Redacted"
import * as Scope from "effect/Scope"
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
  UniqueViolation,
  UnknownError
} from "effect/sql/SqlError"
import * as Statement from "effect/sql/Statement"
import * as Stream from "effect/Stream"
import { Buffer } from "node:buffer"
import * as Tedious from "tedious"
import type { ConnectionOptions } from "tedious/lib/connection.ts"
import type { DataType } from "tedious/lib/data-type.ts"
import type { ParameterOptions } from "tedious/lib/request.ts"
import type { Parameter } from "./Parameter.ts"
import type * as Procedure from "./Procedure.ts"

const ATTR_DB_SYSTEM_NAME = "db.system.name"
const ATTR_DB_NAMESPACE = "db.namespace"
const ATTR_SERVER_ADDRESS = "server.address"
const ATTR_SERVER_PORT = "server.port"

const mssqlNumberFromCause = (cause: unknown): number | undefined => {
  if (typeof cause !== "object" || cause === null || !("number" in cause)) {
    return undefined
  }
  const number = cause.number
  return typeof number === "number" ? number : undefined
}

const mssqlConnectionErrorCodes = new Set([233, 10054])
const mssqlAuthenticationErrorCodes = new Set([4060, 18452, 18456])
const mssqlAuthorizationErrorCodes = new Set([229, 230, 262, 297, 300])
const mssqlSyntaxErrorCodes = new Set([102, 207, 208, 2714])
const mssqlConstraintErrorCodes = new Set([515, 547])

const UNKNOWN_CONSTRAINT = "unknown"

const normalizeConstraintIdentifier = (identifier: unknown): string => {
  if (typeof identifier !== "string") {
    return UNKNOWN_CONSTRAINT
  }
  const trimmed = identifier.trim()
  return trimmed.length === 0 ? UNKNOWN_CONSTRAINT : trimmed
}

const mssqlCauseProperty = (cause: unknown, property: "constraint" | "message"): unknown => {
  if (typeof cause !== "object" || cause === null || !(property in cause)) {
    return undefined
  }
  return (cause as Record<string, unknown>)[property]
}

const mssqlUniqueViolationConstraintFromMessage = (number: 2601 | 2627, message: unknown): string => {
  if (typeof message !== "string") {
    return UNKNOWN_CONSTRAINT
  }
  const match = number === 2627 ?
    /\bconstraint\s+'([^']*)'/i.exec(message) :
    /\bunique index\s+'([^']*)'/i.exec(message)
  return match === null ? UNKNOWN_CONSTRAINT : normalizeConstraintIdentifier(match[1])
}

const mssqlUniqueViolationConstraintFromCause = (number: 2601 | 2627, cause: unknown): string => {
  const constraint = normalizeConstraintIdentifier(mssqlCauseProperty(cause, "constraint"))
  if (constraint !== UNKNOWN_CONSTRAINT) {
    return constraint
  }
  return mssqlUniqueViolationConstraintFromMessage(number, mssqlCauseProperty(cause, "message"))
}

const classifyError = (
  cause: unknown,
  message: string,
  operation: string,
  fallback: "connection" | "unknown" = "unknown"
) => {
  const props = { cause, message, operation }
  const number = mssqlNumberFromCause(cause)
  if (number !== undefined) {
    if (mssqlConnectionErrorCodes.has(number)) {
      return new ConnectionError(props)
    }
    if (mssqlAuthenticationErrorCodes.has(number)) {
      return new AuthenticationError(props)
    }
    if (mssqlAuthorizationErrorCodes.has(number)) {
      return new AuthorizationError(props)
    }
    if (mssqlSyntaxErrorCodes.has(number)) {
      return new SqlSyntaxError(props)
    }
    if (number === 2601 || number === 2627) {
      return new UniqueViolation({ ...props, constraint: mssqlUniqueViolationConstraintFromCause(number, cause) })
    }
    if (mssqlConstraintErrorCodes.has(number)) {
      return new ConstraintError(props)
    }
    if (number === 1205) {
      return new DeadlockError(props)
    }
    if (number === 3960) {
      return new SerializationError(props)
    }
    if (number === 1222) {
      return new LockTimeoutError(props)
    }
  }
  return fallback === "connection" ? new ConnectionError(props) : new UnknownError(props)
}

/**
 * Runtime type identifier used to mark `MssqlClient` values.
 *
 * @category type IDs
 * @since 4.0.0
 */
export const TypeId: unique symbol = Symbol.for("@effect/sql-mssql/MssqlClient")

/**
 * Type-level identifier used to mark `MssqlClient` values.
 *
 * @category type IDs
 * @since 4.0.0
 */
export type TypeId = typeof TypeId

/**
 * Microsoft SQL Server client service, extending `SqlClient` with typed parameter fragments and stored procedure calls.
 *
 * @category services
 * @since 4.0.0
 */
export interface MssqlClient extends Client.SqlClient {
  readonly [TypeId]: TypeId

  readonly config: MssqlClientConfig

  /**
   * Creates a statement parameter with an explicit `tedious` data type.
   *
   * @stability unstable
   */
  readonly param: (
    type: DataType,
    value: unknown,
    options?: ParameterOptions
  ) => Statement.Fragment

  readonly call: <
    I extends Record<string, Parameter<any>>,
    O extends Record<string, Parameter<any>>,
    A extends object
  >(
    procedure: Procedure.ProcedureWithValues<I, O, A>
  ) => Effect.Effect<Procedure.Procedure.Result<O, A>, SqlError>
}

/**
 * Service tag for the Microsoft SQL Server client service.
 *
 * **When to use**
 *
 * Use to access or provide a Microsoft SQL Server client through the Effect
 * context.
 *
 * @category services
 * @since 4.0.0
 */
export const MssqlClient = Context.Service<MssqlClient>("@effect/sql-mssql/MssqlClient")

/**
 * Configuration for a Microsoft SQL Server client, including connection, authentication, pool, parameter type, span attribute, and query/result name transform options.
 *
 * @category models
 * @since 4.0.0
 */
export interface MssqlClientConfig {
  readonly domain?: string | undefined
  readonly server: string
  readonly instanceName?: string | undefined
  /**
   * Whether to encrypt traffic between the client and server. Defaults to `true`. Setting this to `false` disables transport encryption and transmits credentials in cleartext.
   */
  readonly encrypt?: boolean | undefined
  /**
   * Whether to trust the server certificate without validating it. Defaults to `false`. Setting this to `true` disables TLS certificate validation.
   */
  readonly trustServer?: boolean | undefined
  readonly port?: number | undefined
  readonly authType?: string | undefined
  readonly database?: string | undefined
  readonly username?: string | undefined
  readonly password?: Redacted.Redacted | undefined
  readonly connectTimeout?: Duration.Input | undefined
  readonly cancelTimeout?: Duration.Input | undefined
  readonly connectionRetryInterval?: Duration.Input | undefined
  readonly multiSubnetFailover?: boolean | undefined
  readonly maxRetriesOnTransientErrors?: number | undefined

  readonly minConnections?: number | undefined
  readonly maxConnections?: number | undefined
  readonly connectionTTL?: Duration.Input | undefined

  /**
   * Overrides the `tedious` data type used for each primitive parameter kind.
   *
   * @stability unstable
   */
  readonly parameterTypes?: Record<Statement.PrimitiveKind, DataType> | undefined

  readonly spanAttributes?: Record<string, unknown> | undefined

  readonly transformResultNames?: ((str: string) => string) | undefined
  readonly transformQueryNames?: ((str: string) => string) | undefined
}

interface MssqlConnection extends Connection {
  readonly call: (
    procedure: Procedure.ProcedureWithValues<any, any, any>,
    transformRows: ((rows: ReadonlyArray<any>) => ReadonlyArray<any>) | undefined
  ) => Effect.Effect<any, SqlError>

  readonly begin: Effect.Effect<void, SqlError>
  readonly commit: Effect.Effect<void, SqlError>
  readonly savepoint: (name: string) => Effect.Effect<void, SqlError>
  readonly rollback: (name?: string) => Effect.Effect<void, SqlError>
}

const TransactionConnection = Client.TransactionConnection as unknown as (clientId: number) => Context.Service<
  readonly [conn: MssqlConnection, counter: number],
  readonly [conn: MssqlConnection, counter: number]
>

let clientIdCounter = 0

/**
 * Creates a scoped Microsoft SQL Server client backed by a connection pool, with transaction and stored procedure support. Streaming queries are not implemented.
 *
 * @category constructors
 * @since 4.0.0
 */
export const make = (
  options: MssqlClientConfig
): Effect.Effect<MssqlClient, SqlError, Scope.Scope | Reactivity.Reactivity> =>
  Effect.gen(function*() {
    const parameterTypes = options.parameterTypes ?? defaultParameterTypes
    const compiler = makeCompiler(options.transformQueryNames)

    const transformRows = options.transformResultNames ?
      Statement.defaultTransforms(
        options.transformResultNames
      ).array :
      undefined
    const spanAttributes: ReadonlyArray<[string, unknown]> = [
      ...(options.spanAttributes ? Object.entries(options.spanAttributes) : []),
      [ATTR_DB_SYSTEM_NAME, "microsoft.sql_server"],
      [ATTR_DB_NAMESPACE, options.database ?? "master"],
      [ATTR_SERVER_ADDRESS, options.server],
      [ATTR_SERVER_PORT, options.port ?? 1433]
    ]

    // oxlint-disable-next-line prefer-const
    let pool: Pool.Pool<MssqlConnection, SqlError>
    const connectionEnded = new WeakMap<MssqlConnection, Deferred.Deferred<void>>()
    // Invalidation can run before acquisition publishes the pool item. Check
    // the latch on every lease so an early event cannot leave it reusable.
    const acquireConnection: Effect.Effect<MssqlConnection, SqlError, Scope.Scope> = Effect.suspend(() =>
      Effect.flatMap(Pool.get(pool), (connection) =>
        Deferred.isDoneUnsafe(connectionEnded.get(connection)!)
          ? Effect.andThen(Pool.invalidate(pool, connection), acquireConnection)
          : Effect.succeed(connection))
    )

    const makeConnection = Effect.gen(function*() {
      const conn = new Tedious.Connection({
        options: {
          port: options.port,
          database: options.database,
          trustServerCertificate: options.trustServer ?? false,
          multiSubnetFailover: options.multiSubnetFailover,
          connectTimeout: options.connectTimeout
            ? Duration.toMillis(Duration.fromInputUnsafe(options.connectTimeout))
            : undefined,
          rowCollectionOnRequestCompletion: true,
          useColumnNames: false,
          instanceName: options.instanceName,
          encrypt: options.encrypt ?? true,
          cancelTimeout: options.cancelTimeout
            ? Duration.toMillis(Duration.fromInputUnsafe(options.cancelTimeout))
            : undefined,
          connectionRetryInterval: options.connectionRetryInterval
            ? Duration.toMillis(Duration.fromInputUnsafe(options.connectionRetryInterval))
            : undefined,
          maxRetriesOnTransientErrors: options.maxRetriesOnTransientErrors
        } as ConnectionOptions,
        server: options.server,
        authentication: {
          type: (options.authType as any) ?? "default",
          options: {
            domain: options.domain,
            userName: options.username,
            password: options.password
              ? Redacted.value(options.password)
              : undefined
          }
        }
      })

      const ended = Deferred.makeUnsafe<void>()
      let closing = false
      let endEmitted = false
      const onError = () => {
        Deferred.doneUnsafe(ended, Effect.void)
      }
      const removeListeners = () => {
        conn.removeListener("error", onError)
        conn.removeListener("end", onEnd)
      }
      const onEnd = () => {
        endEmitted = true
        Deferred.doneUnsafe(ended, Effect.void)
        if (closing) removeListeners()
      }

      // Install before connect and keep the error handler through asynchronous
      // close. The latch also records events before the pool item exists.
      conn.on("error", onError)
      conn.on("end", onEnd)
      yield* Effect.addFinalizer(() =>
        Effect.sync(() => {
          closing = true
          conn.close()
          if (endEmitted) removeListeners()
        })
      )

      yield* Effect.callback<void, SqlError>((resume) => {
        conn.connect((cause) => {
          if (cause) {
            resume(
              Effect.fail(new SqlError({ reason: classifyError(cause, "Failed to connect", "connect", "connection") }))
            )
          } else {
            resume(Effect.void)
          }
        })
      })

      const run = (
        sql: string,
        values?: ReadonlyArray<any>,
        rowsAsArray = false
      ) =>
        Effect.callback<any, SqlError>((resume) => {
          const req = new Tedious.Request(sql, (cause, _rowCount, result) => {
            if (cause) {
              resume(
                Effect.fail(new SqlError({ reason: classifyError(cause, "Failed to execute statement", "execute") }))
              )
              return
            }

            if (rowsAsArray) {
              result = result.map((row: any) => row.map((_: any) => _.value))
            } else {
              result = rowsToObjects(result)
            }

            resume(Effect.succeed(result))
          })

          if (values) {
            for (let i = 0, len = values.length; i < len; i++) {
              const value = values[i]
              const name = numberToParamName(i)

              if (isMssqlParam(value)) {
                req.addParameter(name, value.paramA, value.paramB, value.paramC)
              } else {
                const kind = Statement.primitiveKind(value)
                const type = parameterTypes[kind]
                req.addParameter(name, type, value)
              }
            }
          }

          conn.cancel()
          conn.execSql(req)
          return Effect.sync(() => conn.cancel())
        })

      const runProcedure = (
        procedure: Procedure.ProcedureWithValues<any, any, any>,
        transformRows: ((rows: ReadonlyArray<any>) => ReadonlyArray<any>) | undefined
      ) =>
        Effect.callback<any, SqlError>((resume) => {
          const result: Record<string, any> = {}

          const req = new Tedious.Request(
            escape(procedure.name),
            (cause, _, rows) => {
              if (cause) {
                resume(
                  Effect.fail(new SqlError({ reason: classifyError(cause, "Failed to execute statement", "execute") }))
                )
              } else {
                rows = rowsToObjects(rows)
                if (transformRows) {
                  rows = transformRows(rows) as any
                }
                resume(
                  Effect.succeed({
                    output: result,
                    rows
                  })
                )
              }
            }
          )

          for (const name in procedure.params) {
            const param = procedure.params[name]
            const value = procedure.values[name]
            req.addParameter(name, param.type, value, param.options)
          }

          for (const name in procedure.outputParams) {
            const param = procedure.outputParams[name]
            req.addOutputParameter(name, param.type, undefined, param.options)
          }

          req.on("returnValue", (name, value) => {
            Rec.assignProperty(result, name, value)
          })

          conn.cancel()
          conn.callProcedure(req)
          return Effect.sync(() => conn.cancel())
        })

      const connection = identity<MssqlConnection>({
        execute(sql, params, transformRows) {
          return transformRows
            ? Effect.map(run(sql, params), transformRows)
            : run(sql, params)
        },
        executeRaw(sql, params) {
          return run(sql, params)
        },
        executeValues(sql, params) {
          return run(sql, params, true)
        },
        executeValuesUnprepared(sql, params) {
          return run(sql, params, true)
        },
        executeUnprepared(sql, params, transformRows) {
          return this.execute(sql, params, transformRows)
        },
        executeStream() {
          return Stream.die("executeStream not implemented")
        },
        call(procedure, transformRows) {
          return runProcedure(procedure, transformRows)
        },
        begin: Effect.callback<void, SqlError>((resume) => {
          conn.beginTransaction((cause) => {
            if (cause) {
              resume(
                Effect.fail(
                  new SqlError({
                    reason: classifyError(cause, "Failed to begin transaction", "beginTransaction")
                  })
                )
              )
            } else {
              resume(Effect.void)
            }
          })
        }),
        commit: Effect.callback<void, SqlError>((resume) => {
          conn.commitTransaction((cause) => {
            if (cause) {
              resume(
                Effect.fail(
                  new SqlError({
                    reason: classifyError(cause, "Failed to commit transaction", "commitTransaction")
                  })
                )
              )
            } else {
              resume(Effect.void)
            }
          })
        }),
        savepoint: (name: string) =>
          Effect.callback<void, SqlError>((resume) => {
            conn.saveTransaction((cause) => {
              if (cause) {
                resume(
                  Effect.fail(
                    new SqlError({ reason: classifyError(cause, "Failed to create savepoint", "createSavepoint") })
                  )
                )
              } else {
                resume(Effect.void)
              }
            }, name)
          }),
        rollback: (name?: string) =>
          Effect.callback<void, SqlError>((resume) => {
            conn.rollbackTransaction((cause) => {
              if (cause) {
                resume(
                  Effect.fail(
                    new SqlError({
                      reason: classifyError(cause, "Failed to rollback transaction", "rollbackTransaction")
                    })
                  )
                )
              } else {
                resume(Effect.void)
              }
            }, name)
          })
      })

      connectionEnded.set(connection, ended)
      yield* Deferred.await(ended).pipe(
        Effect.andThen(Effect.suspend(() => pool ? Pool.invalidate(pool, connection) : Effect.void)),
        Effect.interruptible,
        Effect.forkScoped
      )

      return connection
    })

    pool = yield* Pool.makeWithTTL({
      acquire: makeConnection,
      min: options.minConnections ?? 1,
      max: options.maxConnections ?? 10,
      timeToLive: options.connectionTTL ?? Duration.minutes(45),
      timeToLiveStrategy: "creation"
    })

    yield* acquireConnection.pipe(
      Effect.tap((connection) => connection.executeUnprepared("SELECT 1", [], undefined)),
      Effect.mapError((cause) =>
        new SqlError({ reason: classifyError(cause, "MssqlClient: Failed to connect", "connect", "connection") })
      ),
      Effect.scoped,
      Effect.timeoutOrElse({
        duration: options.connectTimeout ?? Duration.seconds(5),
        orElse: () =>
          Effect.fail(
            new SqlError({
              reason: new ConnectionError({
                message: "MssqlClient: Connection timeout",
                cause: new Error("connection timeout"),
                operation: "connect"
              })
            })
          )
      })
    )

    const transactionService = TransactionConnection(clientIdCounter++)

    const withTransaction = Client.makeWithTransaction({
      transactionService,
      spanAttributes,
      acquireConnection: Effect.gen(function*() {
        const scope = Scope.makeUnsafe()
        const conn = yield* Scope.provide(acquireConnection, scope)
        return [scope, conn] as const
      }),
      begin: (conn) => conn.begin,
      savepoint: (conn, id) => conn.savepoint(`effect_sql_${id}`),
      commit: (conn) => conn.commit,
      rollback: (conn) => conn.rollback(),
      rollbackSavepoint: (conn, id) => conn.rollback(`effect_sql_${id}`)
    })

    return identity<MssqlClient>(Object.assign(
      yield* Client.make({
        acquirer: acquireConnection,
        compiler,
        transactionService: transactionService as any,
        spanAttributes,
        transformRows
      }),
      {
        [TypeId]: TypeId as TypeId,
        config: options,
        withTransaction,
        param: (
          type: DataType,
          value: unknown,
          options: ParameterOptions = {}
        ) => Statement.fragment([mssqlParam(type, value, options)]),
        call: <
          I extends Record<string, Parameter<any>>,
          O extends Record<string, Parameter<any>>,
          A
        >(
          procedure: Procedure.ProcedureWithValues<I, O, A>
        ) => Effect.scoped(Effect.flatMap(acquireConnection, (_) => _.call(procedure, transformRows))),
        withoutTransforms() {
          const statement = Statement.make(acquireConnection, compiler.withoutTransform, spanAttributes, undefined)
          const client = Object.assign(
            statement,
            this,
            statement,
            {
              call: <
                I extends Record<string, Parameter<any>>,
                O extends Record<string, Parameter<any>>,
                A
              >(
                procedure: Procedure.ProcedureWithValues<I, O, A>
              ) => Effect.scoped(Effect.flatMap(acquireConnection, (_) => _.call(procedure, undefined)))
            }
          )
          ;(client as any).safe = client
          ;(client as any).withoutTransforms = () => client
          return client
        }
      }
    ))
  })

/**
 * Creates a layer from a `Config`-wrapped SQL Server client configuration, providing both `MssqlClient` and `SqlClient`.
 *
 * @category layers
 * @since 4.0.0
 */
export const layerConfig: (
  config: Config.Wrap<MssqlClientConfig>
) => Layer.Layer<Client.SqlClient | MssqlClient, Config.ConfigError | SqlError> = (
  config: Config.Wrap<MssqlClientConfig>
): Layer.Layer<Client.SqlClient | MssqlClient, Config.ConfigError | SqlError> =>
  Layer.effectContext(
    Config.unwrap(config).pipe(
      Effect.flatMap(make),
      Effect.map((client) =>
        Context.make(MssqlClient, client).pipe(
          Context.add(Client.SqlClient, client)
        )
      )
    )
  ).pipe(Layer.provide(Reactivity.layer))

/**
 * Creates a layer from a concrete SQL Server client configuration, providing both `MssqlClient` and `SqlClient`.
 *
 * @category layers
 * @since 4.0.0
 */
export const layer = (
  config: MssqlClientConfig
): Layer.Layer<Client.SqlClient | MssqlClient, never | SqlError> =>
  Layer.effectContext(
    Effect.map(make(config), (client) =>
      Context.make(MssqlClient, client).pipe(
        Context.add(Client.SqlClient, client)
      ))
  ).pipe(Layer.provide(Reactivity.layer))

/**
 * Creates the SQL Server statement compiler, using `@1`-style placeholders, bracket-escaped identifiers, and SQL Server `OUTPUT INSERTED` returning clauses.
 *
 * @category constructors
 * @since 4.0.0
 */
export const makeCompiler = (transform?: (_: string) => string) =>
  Statement.makeCompiler<MssqlCustom>({
    dialect: "mssql",
    placeholder(_) {
      return `@${numberToParamName(_ - 1)}`
    },
    onIdentifier: transform ?
      function(value, withoutTransform) {
        return withoutTransform ? escape(value) : escape(transform(value))
      } :
      escape,
    onRecordUpdate(placeholders, valueAlias, valueColumns, values, returning) {
      const returningSql = returning ? returning[0] === "*" ? "OUTPUT INSERTED.* " : `OUTPUT ${returning[0]} ` : ""
      return [
        `${returningSql}FROM (values ${placeholders}) AS ${valueAlias}${valueColumns}`,
        returning ?
          returning[1].concat(values.flat()) :
          values.flat()
      ]
    },
    onCustom(type, placeholder) {
      switch (type.kind) {
        case "MssqlParam": {
          return [placeholder(undefined), [type] as any]
        }
      }
    },
    onInsert(columns, placeholders, values, returning) {
      const returningSql = returning ? returning[0] === "*" ? " OUTPUT INSERTED.*" : ` OUTPUT ${returning[0]}` : ""
      return [
        `(${columns.join(",")})${returningSql} VALUES ${placeholders}`,
        returning ?
          returning[1].concat(values.flat()) :
          values.flat()
      ]
    }
  })

// compiler helpers

const escape = (str: string) => "[" + str.replace(/\]/g, "]]").replace(/\./g, "].[") + "]"

function numberToParamName(n: number) {
  return `${Math.ceil(n + 1)}`
}

const byteArrayParameterType: DataType = {
  ...Tedious.TYPES.VarBinary,
  validate(value, collation, options) {
    return Tedious.TYPES.VarBinary.validate(
      Buffer.isBuffer(value) ? value : Buffer.from(value.buffer, value.byteOffset, value.byteLength),
      collation,
      options
    )
  }
}

/**
 * Default mapping from Effect SQL primitive value kinds to Tedious SQL Server parameter data types.
 *
 * @stability unstable
 * @category constants
 * @since 4.0.0
 */
export const defaultParameterTypes: Record<Statement.PrimitiveKind, DataType> = {
  string: Tedious.TYPES.NVarChar,
  number: Tedious.TYPES.Float,
  bigint: Tedious.TYPES.BigInt,
  boolean: Tedious.TYPES.Bit,
  Date: Tedious.TYPES.DateTime,
  Uint8Array: byteArrayParameterType,
  Int8Array: byteArrayParameterType,
  null: Tedious.TYPES.Bit
}

// custom types

type MssqlCustom = MssqlParam

interface MssqlParam extends
  Statement.Custom<
    "MssqlParam",
    DataType,
    unknown,
    ParameterOptions
  >
{}

const mssqlParam = Statement.custom<MssqlParam>("MssqlParam")
const isMssqlParam = Statement.isCustom<MssqlParam>("MssqlParam")

function rowsToObjects(rows: ReadonlyArray<any>) {
  const newRows = new Array(rows.length)

  for (let i = 0, len = rows.length; i < len; i++) {
    const row = rows[i]
    const newRow: any = {}
    for (let j = 0, columnLen = row.length; j < columnLen; j++) {
      const column = row[j]
      Rec.assignProperty(newRow, column.metadata.colName, column.value)
    }
    newRows[i] = newRow
  }

  return newRows
}
