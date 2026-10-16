/**
 * Cloudflare D1 client implementation for Effect SQL, backed by a Workers `D1Database` binding.
 *
 * This module adapts a Cloudflare D1 database binding into both the
 * D1-specific `D1Client` service and the generic Effect `SqlClient` service.
 * It uses the SQLite statement compiler, caches prepared statements, maps D1
 * failures to `SqlError`, and provides direct or config-backed layers.
 * Transactions, streaming queries, and `updateValues` are not supported by this
 * driver.
 *
 * @stability unstable
 * @since 4.0.0
 */
import type { D1Database, D1PreparedStatement, D1Result } from "@cloudflare/workers-types"
import * as Cache from "effect/Cache"
import * as Config from "effect/Config"
import * as Context from "effect/Context"
import * as Duration from "effect/Duration"
import * as Effect from "effect/Effect"
import { identity } from "effect/Function"
import * as Layer from "effect/Layer"
import * as Reactivity from "effect/reactivity/Reactivity"
import type * as Scope from "effect/Scope"
import * as Client from "effect/sql/SqlClient"
import type { Connection } from "effect/sql/SqlConnection"
import { SqlError, UnknownError } from "effect/sql/SqlError"
import * as Statement from "effect/sql/Statement"
import * as Stream from "effect/Stream"

const ATTR_DB_SYSTEM_NAME = "db.system.name"
const ATTR_DB_OPERATION_NAME = "db.operation.name"
const ATTR_DB_QUERY_TEXT = "db.query.text"

const classifyError = (cause: unknown, message: string, operation: string) =>
  new UnknownError({ cause, message, operation })

/**
 * Unique runtime identifier used to tag `D1Client` values.
 *
 * @stability unstable
 * @category type IDs
 * @since 4.0.0
 */
export const TypeId: TypeId = "~@effect/sql-d1/D1Client"

/**
 * Type-level literal for the `D1Client` runtime identifier.
 *
 * @stability unstable
 * @category type IDs
 * @since 4.0.0
 */
export type TypeId = "~@effect/sql-d1/D1Client"

/**
 * Cloudflare D1 SQL client service, extending `SqlClient` with its D1 configuration and no `updateValues` support.
 *
 * @stability unstable
 * @category services
 * @since 4.0.0
 */
export interface D1Client extends Client.SqlClient {
  readonly [TypeId]: TypeId
  readonly config: D1ClientConfig

  /**
   * Executes SQL statements as a single atomic D1 batch and returns their row results in order.
   *
   * **When to use**
   *
   * Use when you have a fixed collection of statements that should run in one
   * request and roll back together if any statement fails.
   *
   * **Gotchas**
   *
   * Each statement uses the query and result name transformations from the
   * client that created it. Mixing clients can produce differently shaped row
   * results within the same batch.
   *
   * @since 4.0.0
   */
  readonly batch: <const Statements extends ReadonlyArray<Statement.Statement<any>>>(
    statements: Statements
  ) => Effect.Effect<
    {
      readonly [K in keyof Statements]: Effect.Success<Statements[K]>
    },
    SqlError
  >

  /** Not supported in d1 */
  readonly updateValues: never
}

/**
 * Service tag for the Cloudflare D1 SQL client.
 *
 * **When to use**
 *
 * Use to access or provide a Cloudflare D1 SQL client through the Effect
 * context.
 *
 * @stability unstable
 * @category services
 * @since 4.0.0
 */
export const D1Client = Context.Service<D1Client>("@effect/sql-d1/D1Client")

/**
 * Configuration for a Cloudflare D1 client, including the `D1Database`, prepared statement cache settings, span attributes, and query/result name transforms.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface D1ClientConfig {
  readonly db: D1Database
  readonly prepareCacheSize?: number | undefined
  readonly prepareCacheTTL?: Duration.Input | undefined
  readonly spanAttributes?: Record<string, unknown> | undefined

  readonly transformResultNames?: ((str: string) => string) | undefined
  readonly transformQueryNames?: ((str: string) => string) | undefined
}

type TransformRows = <A extends object>(rows: ReadonlyArray<A>) => ReadonlyArray<A>

type BatchResults<Statements extends ReadonlyArray<Statement.Statement<any>>> = {
  readonly [K in keyof Statements]: Effect.Success<Statements[K]>
}

interface StatementWithTransformRows extends Statement.Statement<any> {
  readonly transformRows: TransformRows | undefined
}

const makeBatch = (options: {
  readonly db: D1Database
  readonly prepareCache: Cache.Cache<string, D1PreparedStatement, SqlError>
  readonly spanAttributes: ReadonlyArray<readonly [string, unknown]>
  readonly getClient: () => D1Client
}): D1Client["batch"] =>
<const Statements extends ReadonlyArray<Statement.Statement<any>>>(
  statements: Statements
) => {
  if (statements.length === 0) {
    return Effect.succeed([] as unknown as BatchResults<Statements>)
  }
  return Effect.useSpan(
    "sql.execute",
    { kind: "client" },
    (span) =>
      Effect.withFiber(Effect.fnUntraced(function*(fiber) {
        const transformer = fiber.getRef(Statement.CurrentTransformer)
        const prepared: Array<D1PreparedStatement> = []
        const transforms: Array<TransformRows | undefined> = []
        const queryTexts: Array<string> = []

        for (const original of statements) {
          const statement = transformer === undefined
            ? original
            : yield* transformer(original, options.getClient(), fiber, span)
          const [sql, params] = statement.compile()
          queryTexts.push(sql)
          transforms.push((statement as StatementWithTransformRows).transformRows)
          prepared.push((yield* Cache.get(options.prepareCache, sql)).bind(...params))
        }

        for (const [key, value] of options.spanAttributes) {
          span.attribute(key, value)
        }
        span.attribute(ATTR_DB_OPERATION_NAME, "batch")
        span.attribute(ATTR_DB_QUERY_TEXT, queryTexts.join("; "))

        // D1 batches execute on the binding directly and intentionally cannot participate in SqlClient transactions.
        const responses = yield* Effect.tryPromise({
          try: () =>
            options.db.batch<Record<string, unknown>>(prepared).then((responses) => {
              for (const response of responses) {
                if (response.error) {
                  throw response.error
                }
              }
              return responses
            }),
          catch: (cause) => new SqlError({ reason: classifyError(cause, "Failed to execute batch", "execute") })
        })

        const results = responses.map((response, index) => {
          const rows = response.results || []
          const transformRows = transforms[index]
          return transformRows ? transformRows(rows) : rows
        })
        return results as BatchResults<Statements>
      }))
  )
}

/**
 * Creates a scoped Cloudflare D1 SQL client. Prepared statements are cached, while transactions and streaming queries are not supported by this driver.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const make = (
  options: D1ClientConfig
): Effect.Effect<D1Client, never, Scope.Scope | Reactivity.Reactivity> =>
  Effect.gen(function*() {
    const compiler = Statement.makeCompilerSqlite(options.transformQueryNames)
    const transformRows = options.transformResultNames ?
      Statement.defaultTransforms(options.transformResultNames).array :
      undefined
    const spanAttributes: Array<readonly [string, unknown]> = [
      ...(options.spanAttributes ? Object.entries(options.spanAttributes) : []),
      [ATTR_DB_SYSTEM_NAME, "sqlite"]
    ]

    const makeConnection = Effect.gen(function*() {
      const db = options.db

      const prepareCache = yield* Cache.make({
        capacity: options.prepareCacheSize ?? 200,
        timeToLive: options.prepareCacheTTL ?? Duration.minutes(10),
        lookup: (sql: string) =>
          Effect.try({
            try: () => db.prepare(sql),
            catch: (cause) => new SqlError({ reason: classifyError(cause, "Failed to prepare statement", "prepare") })
          })
      })

      const runStatementRaw = (
        statement: D1PreparedStatement,
        params: ReadonlyArray<unknown> = []
      ): Effect.Effect<D1Result, SqlError, never> =>
        Effect.tryPromise({
          try: async () => {
            const response = await statement.bind(...params).all()
            if (response.error) {
              throw response.error
            }
            return response
          },
          catch: (cause) => new SqlError({ reason: classifyError(cause, "Failed to execute statement", "execute") })
        })

      const runStatement = (
        statement: D1PreparedStatement,
        params: ReadonlyArray<unknown> = []
      ): Effect.Effect<ReadonlyArray<any>, SqlError, never> =>
        Effect.map(runStatementRaw(statement, params), (response) => response.results || [])

      const runRaw = (
        sql: string,
        params: ReadonlyArray<unknown> = []
      ) => runStatementRaw(db.prepare(sql), params)

      const runCached = (
        sql: string,
        params: ReadonlyArray<unknown> = []
      ) => Effect.flatMap(Cache.get(prepareCache, sql), (s) => runStatement(s, params))

      const runUncached = (
        sql: string,
        params: ReadonlyArray<unknown> = []
      ) => runStatement(db.prepare(sql), params)

      const runValues = (
        sql: string,
        params: ReadonlyArray<unknown>
      ) =>
        Effect.flatMap(
          Cache.get(prepareCache, sql),
          (statement) =>
            Effect.tryPromise({
              try: () => {
                return statement.bind(...params).raw() as Promise<
                  ReadonlyArray<
                    ReadonlyArray<unknown>
                  >
                >
              },
              catch: (cause) => new SqlError({ reason: classifyError(cause, "Failed to execute statement", "execute") })
            })
        )

      const runValuesUncached = (
        sql: string,
        params: ReadonlyArray<unknown>
      ) =>
        Effect.tryPromise({
          try: () => {
            return db.prepare(sql).bind(...params).raw() as Promise<
              ReadonlyArray<
                ReadonlyArray<unknown>
              >
            >
          },
          catch: (cause) => new SqlError({ reason: classifyError(cause, "Failed to execute statement", "execute") })
        })

      const connection = identity<Connection>({
        execute(sql, params, transformRows) {
          return transformRows
            ? Effect.map(runCached(sql, params), transformRows)
            : runCached(sql, params)
        },
        executeRaw(sql, params) {
          return runRaw(sql, params)
        },
        executeValues(sql, params) {
          return runValues(sql, params)
        },
        executeValuesUnprepared(sql, params) {
          return runValuesUncached(sql, params)
        },
        executeUnprepared(sql, params, transformRows) {
          return transformRows
            ? Effect.map(runUncached(sql, params), transformRows)
            : runUncached(sql, params)
        },
        executeStream(_sql, _params) {
          return Stream.die("executeStream not implemented")
        }
      })
      return { connection, prepareCache } as const
    })

    const { connection, prepareCache } = yield* makeConnection
    const acquirer = Effect.succeed(connection)
    const transactionAcquirer = Effect.die("transactions are not supported in D1")

    let client!: D1Client
    client = Object.assign(
      (yield* Client.make({
        acquirer,
        compiler,
        transactionAcquirer,
        spanAttributes,
        transformRows
      })) as D1Client,
      {
        [TypeId]: TypeId as TypeId,
        config: options,
        batch: makeBatch({
          db: options.db,
          prepareCache,
          spanAttributes,
          getClient: () => client
        })
      }
    )

    if (options.transformQueryNames !== undefined || transformRows !== undefined) {
      const clientWithoutTransformsBase = yield* Client.make({
        acquirer: Effect.succeed(connection),
        compiler: compiler.withoutTransform,
        transactionAcquirer,
        spanAttributes,
        transformRows: undefined
      })
      let clientWithoutTransforms!: D1Client
      clientWithoutTransforms = Object.assign(clientWithoutTransformsBase as D1Client, {
        [TypeId]: TypeId as TypeId,
        config: options,
        batch: makeBatch({
          db: options.db,
          prepareCache,
          spanAttributes,
          getClient: () => clientWithoutTransforms
        }),
        withoutTransforms: () => clientWithoutTransforms
      })
      Object.assign(client, {
        withoutTransforms: () => clientWithoutTransforms
      })
    }

    return client
  })

/**
 * Creates a layer from a `Config`-wrapped D1 client configuration, providing both `D1Client` and `SqlClient`.
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const layerConfig = (
  config: Config.Wrap<D1ClientConfig>
): Layer.Layer<D1Client | Client.SqlClient, Config.ConfigError> =>
  Layer.effectContext(
    Config.unwrap(config).pipe(
      Effect.flatMap(make),
      Effect.map((client) =>
        Context.make(D1Client, client).pipe(
          Context.add(Client.SqlClient, client)
        )
      )
    )
  ).pipe(Layer.provide(Reactivity.layer))

/**
 * Creates a layer from a concrete D1 client configuration, providing both `D1Client` and `SqlClient`.
 *
 * @stability unstable
 * @category layers
 * @since 4.0.0
 */
export const layer = (
  config: D1ClientConfig
): Layer.Layer<D1Client | Client.SqlClient, Config.ConfigError> =>
  Layer.effectContext(
    Effect.map(make(config), (client) =>
      Context.make(D1Client, client).pipe(
        Context.add(Client.SqlClient, client)
      ))
  ).pipe(Layer.provide(Reactivity.layer))
