/**
 * Native PostgreSQL sessions built on the `PgProtocol` wire codec.
 *
 * **Details**
 *
 * Sessions support queries, streaming, `LISTEN`/`NOTIFY`, cancellation, and
 * exclusive ownership for transactions.
 *
 * @since 4.0.0
 */
import type * as Arr from "effect/Array"
import * as Cause from "effect/Cause"
import * as Channel from "effect/Channel"
import * as Context from "effect/Context"
import * as Deferred from "effect/Deferred"
import * as Duration from "effect/Duration"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Queue from "effect/Queue"
import * as Redacted from "effect/Redacted"
import * as EffectResult from "effect/Result"
import * as Scope from "effect/Scope"
import * as Semaphore from "effect/Semaphore"
import { AuthenticationError, ConnectionError, SqlError, type SqlErrorReason, UnknownError } from "effect/sql/SqlError"
import * as Stream from "effect/Stream"
import { Buffer } from "node:buffer"
import { randomBytes } from "node:crypto"
import * as Net from "node:net"
import type { Duplex } from "node:stream"
import * as Tls from "node:tls"
import type { ConnectionOptions } from "node:tls"
import { type ConnectionInternals, internalsKey } from "./internal/connection.ts"
import * as PasswordInternal from "./internal/password.ts"
import { classifySqlState, validateChannelName } from "./internal/sqlError.ts"
import * as PgAuth from "./PgAuth.ts"
import * as PgProtocol from "./PgProtocol.ts"
import * as PgTypes from "./PgTypes.ts"

/**
 * The runtime type identifier for `PgConnection`.
 *
 * @category type IDs
 * @since 4.0.0
 */
export const TypeId: TypeId = "~@effect/sql-pg/PgConnection"

/**
 * The type-level identifier for `PgConnection`.
 *
 * @category type IDs
 * @since 4.0.0
 */
export type TypeId = "~@effect/sql-pg/PgConnection"

/**
 * Connection settings for a PostgreSQL session.
 *
 * **Details**
 *
 * A `url` is parsed as a libpq URI (`postgres://` or `postgresql://`);
 * explicit fields win over anything the URL carries. A `stream` factory wins
 * over `host`, `port`, and `path`. A `path` is used verbatim as the unix
 * socket path, while a `host` beginning with `/` is treated as a socket
 * directory and expands to `${host}/.s.PGSQL.${port}`.
 *
 * URL modes `sslmode=prefer` and `sslmode=allow` try TLS first, falling back
 * to plaintext only when the server answers `SSLRequest` with `N`. Unlike
 * libpq, `allow` also tries TLS first. Certificate verification stays enabled
 * unless explicitly disabled through `ssl` options.
 *
 * Prepared statements are enabled by default and limited by
 * `preparedStatementCacheSize`. Disable them for statement-mode poolers or
 * workloads that generate unique SQL. Streams always use unnamed statements.
 *
 * With `multiplex` enabled, unpinned queries from multiple fibers are
 * pipelined. Transactions, streams, and listeners remain exclusive. An
 * unpinned multiplexed connection cannot be interrupted because cancellation
 * could affect another fiber's query.
 *
 * @category models
 * @since 4.0.0
 */
export interface Config {
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
  readonly stream?: (() => Duplex) | undefined
  readonly types?: PgTypes.Registry | undefined
  readonly multiplex?: boolean | undefined
  readonly prepare?: boolean | undefined
  readonly preparedStatementCacheSize?: number | undefined
  /** Maximum backend message size in bytes. Defaults to 16 MiB. */
  readonly maxMessageSize?: number | undefined
}

/**
 * Builds the prepared-statement cache a session should use, or `undefined`
 * when `prepare` is off or the cache is sized to nothing.
 */
const preparedCacheFor = (config: Config): PreparedCache | undefined => {
  if (config.prepare === false) return undefined
  const max = config.preparedStatementCacheSize ?? defaultPreparedStatements
  return max > 0 ? new PreparedCache(max) : undefined
}

/**
 * An object result row keyed by column name.
 *
 * @category models
 * @since 4.0.0
 */
export interface Row {
  readonly [column: string]: unknown
}

/**
 * Metadata for one result column.
 *
 * @category models
 * @since 4.0.0
 */
export interface Field {
  readonly name: string
  readonly dataTypeId: number
}

/**
 * The result of a query.
 *
 * @category models
 * @since 4.0.0
 */
export interface Result {
  readonly command: string
  readonly rowCount: number
  readonly oid: number | null
  readonly rows: ReadonlyArray<Row>
  readonly fields: ReadonlyArray<Field>
}

/**
 * A `NOTIFY` message received while listening on a channel.
 *
 * @category models
 * @since 4.0.0
 */
export interface Notification {
  readonly processId: number
  readonly channel: string
  readonly payload: string
}

/**
 * A connected and authenticated PostgreSQL session.
 *
 * @category models
 * @since 4.0.0
 */
export interface PgConnection {
  readonly [TypeId]: TypeId
  readonly config: Config
  readonly processId: number
  /**
   * Reserves the session for exclusive use until the scope closes. Pinning is
   * reentrant. Calls through the returned connection skip the
   * ownership queue, while calls through the original connection wait.
   */
  readonly pin: Effect.Effect<PgConnection, never, Scope.Scope>
  /**
   * Runs a query and returns rows keyed by column name. Pass `false` to skip
   * the prepared statement cache.
   *
   * **Details**
   *
   * On interruption, the connection drains to `ReadyForQuery` and sends a
   * `CancelRequest` if needed. Unless the backend confirms cancellation with
   * `57014`, a pool retires the session before its next checkout. A retained
   * checkout and an unpooled session remain exposed to a late cancel.
   * `statement_timeout` also reports `57014` and can be mistaken for
   * confirmation.
   */
  readonly query: (
    sql: string,
    params?: ReadonlyArray<unknown>,
    prepare?: boolean
  ) => Effect.Effect<Result, SqlError>
  /**
   * Runs a query and returns positional rows. Pass `false` to skip the
   * prepared statement cache. Interruption behaves as for `query`.
   */
  readonly queryValues: (
    sql: string,
    params?: ReadonlyArray<unknown>,
    prepare?: boolean
  ) => Effect.Effect<ReadonlyArray<ReadonlyArray<unknown>>, SqlError>
  /**
   * Streams rows without collecting the full result. The session is pinned for
   * the lifetime of the stream. An early abort behaves like an interrupted
   * `query`.
   */
  readonly stream: (
    sql: string,
    params?: ReadonlyArray<unknown>
  ) => Stream.Stream<Row, SqlError>
  /**
   * Registers a channel listener and returns its notification queue after
   * PostgreSQL confirms `LISTEN`. The session stays pinned until the scope
   * closes, when it runs `UNLISTEN` and shuts down the queue. PostgreSQL
   * registration errors fail the acquiring effect.
   * Connection failures after registration fail the queue with the original
   * `SqlError`. Intentional scope closure interrupts consumers.
   */
  readonly listen: (
    channel: string
  ) => Effect.Effect<Queue.Dequeue<Notification, SqlError>, SqlError, Scope.Scope>
  /**
   * Attempts to cancel the active query through a side connection. This is a
   * no-op for an unpinned multiplexed connection because the active
   * query may belong to another fiber. The effect never fails.
   */
  readonly interrupt: Effect.Effect<void>
}

/**
 * The service tag for `PgConnection`.
 *
 * @category services
 * @since 4.0.0
 */
export const PgConnection = Context.Service<PgConnection>("@effect/sql-pg/PgConnection")

/**
 * Connects and authenticates a single PostgreSQL session.
 *
 * **Details**
 *
 * Password resolution, transport, optional `SSLRequest`, startup, and
 * authentication run under `connectTimeout` (5 seconds by default). The effect
 * resolves when the backend sends `ReadyForQuery`. Closing the scope sends
 * `Terminate` and ends the socket.
 *
 * Use `sslmode=require` or explicit `ssl: true` to require encryption.
 * Unix sockets and custom streams should set `ssl.servername` explicitly.
 *
 * @category constructors
 * @since 4.0.0
 */
export const make = (options: Config): Effect.Effect<PgConnection, SqlError, Scope.Scope> =>
  Effect.flatMap(resolveConfig(options), (config) =>
    Effect.acquireRelease(
      Effect.gen(function*() {
        const password = yield* PasswordInternal.resolve(config.password)
        const session = yield* connect(config, password)
        return new PgConnectionImpl(options, config, session, options.types)
      }),
      (connection) => Effect.sync(() => connection.closeUnsafe()),
      { interruptible: true }
    ).pipe(
      Effect.timeoutOrElse({
        duration: config.connectTimeout,
        orElse: () =>
          Effect.fail(
            new SqlError({
              reason: new ConnectionError({
                cause: new Error("Connection timed out"),
                message: "PgConnection: Connection timed out",
                operation: "connect"
              })
            })
          )
      })
    ))

interface Session {
  readonly socket: Duplex
  readonly encrypted: boolean
  readonly parser: PgProtocol.Parser<unknown>
  readonly processId: number
  readonly secretKey: number
}

/**
 * The active protocol consumer: the state machine of the statement currently
 * on the wire. Messages the pump does not handle itself are forwarded here.
 */
interface Consumer {
  readonly onMessage: (message: PgProtocol.BackendMessage<unknown>) => void
  readonly onBatchEnd?: (() => void) | undefined
  readonly onFatal: (error: SqlError) => void
}

/** One statement waiting in, or travelling through, a multiplexed pipeline. */
interface PipelineEntry {
  readonly plan: Plan
  readonly deferred: Deferred.Deferred<QueryOutput, SqlError>
  readonly machine: QueryMachine
  abandoned: boolean
}

const abortDrainTimeoutMillis = 5000
const abortDrainGraceMillis = 10
/** PostgreSQL `query_canceled` SQLSTATE. */
const queryCanceledCode = "57014"
const cancelRequestTimeoutMillis = 5000
/** How many statements a multiplexed session keeps on the wire at once. */
const maxPipelineDepth = 128
const streamPauseThreshold = 512

class PgConnectionImpl implements PgConnection {
  readonly [TypeId]: TypeId = TypeId
  readonly config: Config
  readonly processId: number
  readonly session: Session
  /** The custom codec registry, or `undefined` for the builtin catalogue. */
  readonly registry: PgTypes.Registry | undefined
  readonly bindEncoder: BindEncoder
  /** The statements this session has named, or `undefined` when disabled. */
  readonly prepared: PreparedCache | undefined
  readonly resolved: ResolvedConfig
  readonly multiplex: boolean
  /** Serializes statements: one in-flight extended-query cycle. */
  readonly wire = Semaphore.makeUnsafe(1)
  /** Exclusive-ownership queue used by `pin` and unpinned statements. */
  readonly owner = Semaphore.makeUnsafe(1)
  pinned = false
  consumer: Consumer | undefined
  deadWith: SqlError | undefined
  closed = false
  cancelPending = false
  readonly channels = new Map<string, Set<Queue.Queue<Notification, SqlError>>>()
  readonly retireHooks = new Set<() => void>()
  /** Queued but not yet written; drained into `pipelineInFlight` on flush. */
  readonly pipelinePending: Array<PipelineEntry> = []
  /** Written and awaiting their `ReadyForQuery`, oldest first. */
  readonly pipelineInFlight: Array<PipelineEntry> = []
  pipelineHead = 0
  pipelineFlushScheduled = false
  readonly pipelineIdleWaiters = new Set<() => void>()
  readonly pinnedView: PgConnection
  readonly [internalsKey]: ConnectionInternals

  constructor(config: Config, resolved: ResolvedConfig, session: Session, registry: PgTypes.Registry | undefined) {
    this.config = config
    this.resolved = resolved
    this.session = session
    this.processId = session.processId
    this.registry = registry
    this.bindEncoder = makeBindEncoder(registry)
    this.prepared = preparedCacheFor(config)
    this.multiplex = config.multiplex ?? false
    // Before the pinned view, which copies it.
    this[internalsKey] = {
      base: this,
      deadError: () => this.deadWith,
      retireHooks: this.retireHooks
    }
    this.pinnedView = new PinnedPgConnection(this)
    session.socket.on("data", this.onData)
    session.socket.on("error", this.onSocketError)
    session.socket.on("close", this.onSocketClose)
  }

  private readonly onData = (chunk: Uint8Array): void => {
    try {
      this.session.parser.pushEach(chunk, this.dispatch)
    } catch (cause) {
      // A field reader that threw reports the row it could not decode; anything
      // else came out of the framing itself.
      return this.fatal(
        cause instanceof PgProtocol.ParseError
          ? connectionQueryError(cause, "PgConnection: Failed to parse server messages")
          : queryError(cause, "PgConnection: Failed to decode row")
      )
    }
    if (this.deadWith === undefined) this.consumer?.onBatchEnd?.()
  }

  private readonly onSocketError = (cause: Error): void =>
    this.fatal(connectionQueryError(cause, "PgConnection: Socket error"))

  private readonly onSocketClose = (): void =>
    this.fatal(connectionQueryError(new Error("Connection closed"), "PgConnection: Connection closed"))

  private readonly dispatch = (message: PgProtocol.BackendMessage<unknown>): void => {
    if (this.deadWith !== undefined) return
    switch (message._tag) {
      case "ErrorResponse":
        if (message.fields.code === queryCanceledCode) this.cancelPending = false
        break
      case "ReadyForQuery":
        if (this.cancelPending) {
          this.cancelPending = false
          this.retire()
        }
        break
      case "NotificationResponse": {
        const queues = this.channels.get(message.channel)
        if (queues !== undefined) {
          const notification: Notification = {
            processId: message.pid,
            channel: message.channel,
            payload: message.payload
          }
          for (const queue of queues) Queue.offerUnsafe(queue, notification)
        }
        return
      }
      case "ParameterStatus":
      case "NoticeResponse":
        return
    }
    if (this.consumer !== undefined) return this.consumer.onMessage(message)
    if (message._tag === "ErrorResponse") {
      return this.fatal(
        new SqlError({
          reason: classifyFields(message.fields, "PgConnection: The server reported an error", "query")
        })
      )
    }
    this.fatal(
      connectionQueryError(
        new Error(`Unexpected ${message._tag} while idle`),
        `PgConnection: Unexpected ${message._tag} while idle`
      )
    )
  }

  /** Marks the session dead: optionally destroys the socket, fails the active statement
   * and every listen queue, and notifies pool hooks unless the session's own
   * scope is being released. */
  fatal(error: SqlError, destroySocket = true): void {
    if (this.deadWith !== undefined) return
    this.deadWith = error
    if (destroySocket) this.session.socket.destroy()
    const consumer = this.consumer
    this.consumer = undefined
    this.retire()
    consumer?.onFatal(error)
    const sets = Array.from(this.channels.values())
    this.channels.clear()
    const cause = this.closed ? Cause.interrupt() : Cause.fail(error)
    for (const set of sets) {
      for (const queue of set) Queue.failCauseUnsafe(queue, cause)
    }
  }

  private retire(): void {
    if (this.closed) return
    for (const hook of this.retireHooks) hook()
  }

  closeUnsafe(): void {
    this.closed = true
    let destroySocket = true
    if (this.deadWith === undefined && this.session.socket.writable) {
      try {
        this.session.socket.end(PgProtocol.encodeTerminate())
        destroySocket = false
      } catch {
        // Fall back to the fatal path's immediate destroy below.
      }
    }
    this.fatal(
      new SqlError({
        reason: new ConnectionError({
          cause: new Error("Connection is closed"),
          message: "PgConnection: Connection is closed",
          operation: "query"
        })
      }),
      destroySocket
    )
  }

  /** Plans one execution. `cache` is `undefined` to force the unnamed path. */
  readonly encodeQuery = (
    sql: string,
    params: ReadonlyArray<unknown>,
    cache: PreparedCache | undefined
  ): Plan => encodeQuery(sql, params, this.registry, this.bindEncoder, cache)

  /**
   * Routes backend messages to the oldest statement still on the wire.
   *
   * Every cycle carries its own `Sync`, so the backend answers them in order
   * and finishes each with a `ReadyForQuery`. That boundary is what advances
   * the queue, and it is also why a statement the backend rejects only skips
   * the rest of its own cycle: the ones queued behind it still run.
   */
  private readonly pipelineConsumer: Consumer = {
    onMessage: (message) => {
      const entry = this.pipelineInFlight[this.pipelineHead]
      if (entry === undefined) {
        return this.fatal(connectionQueryError(
          new Error(`Unexpected ${message._tag} without an in-flight query`),
          `PgConnection: Unexpected ${message._tag} without an in-flight query`
        ))
      }
      entry.machine.onMessage(message)
    },
    onBatchEnd: () => this.flushPipeline(),
    onFatal: (error) => {
      const entries = [
        ...this.pipelineInFlight.slice(this.pipelineHead),
        ...this.pipelinePending
      ]
      this.pipelineInFlight.length = 0
      this.pipelineHead = 0
      this.pipelinePending.length = 0
      this.pipelineFlushScheduled = false
      for (const entry of entries) {
        if (!entry.abandoned) Deferred.doneUnsafe(entry.deferred, Effect.fail(error))
      }
      this.notifyPipelineIdle()
    }
  }

  private readonly pipelineDepth = (): number => this.pipelineInFlight.length - this.pipelineHead

  private readonly pipelineIsIdle = (): boolean => this.pipelineDepth() === 0 && this.pipelinePending.length === 0

  private readonly notifyPipelineIdle = (): void => {
    if (!this.pipelineIsIdle()) return
    this.consumer = undefined
    this.session.parser.readField = undefined
    const waiters = Array.from(this.pipelineIdleWaiters)
    this.pipelineIdleWaiters.clear()
    for (const waiter of waiters) waiter()
  }

  /** Resolves once nothing is on the wire, so `pin` can take the connection. */
  readonly waitPipelineIdle: Effect.Effect<void> = Effect.callback((resume) => {
    if (this.pipelineIsIdle()) return resume(Effect.void)
    const waiter = () => resume(Effect.void)
    this.pipelineIdleWaiters.add(waiter)
    return Effect.sync(() => this.pipelineIdleWaiters.delete(waiter))
  })

  private readonly finishPipelineEntry = (
    entry: PipelineEntry,
    result: Effect.Effect<QueryOutput, SqlError>
  ): void => {
    if (this.pipelineInFlight[this.pipelineHead] !== entry) {
      return this.fatal(connectionQueryError(
        new Error("A pipelined query completed out of order"),
        "PgConnection: A pipelined query completed out of order"
      ))
    }
    this.pipelineHead++
    // The next statement's rows can be in this same chunk, so its reader has to
    // be in place before the parser reads on.
    this.session.parser.readField = this.pipelineInFlight[this.pipelineHead]?.machine.readField
    if (!entry.abandoned) Deferred.doneUnsafe(entry.deferred, result)
    if (this.pipelineHead === this.pipelineInFlight.length) {
      this.pipelineInFlight.length = 0
      this.pipelineHead = 0
    }
  }

  /** Writes everything queued since the last flush as one batch. */
  private readonly flushPipeline = (): void => {
    this.pipelineFlushScheduled = false
    if (this.deadWith !== undefined) return
    let capacity = maxPipelineDepth - this.pipelineDepth()
    if (capacity <= 0) return
    const wasEmpty = this.pipelineDepth() === 0
    const batch: Array<PipelineEntry> = []
    let index = 0
    while (capacity > 0 && index < this.pipelinePending.length) {
      const entry = this.pipelinePending[index++]
      if (entry.abandoned) {
        if (entry.plan.parses && entry.plan.prepared !== undefined) {
          entry.plan.prepared.parsing = false
        }
        continue
      }
      batch.push(entry)
      this.pipelineInFlight.push(entry)
      capacity--
    }
    this.pipelinePending.splice(0, index)
    if (batch.length === 0) {
      this.notifyPipelineIdle()
      return
    }
    if (wasEmpty) this.session.parser.readField = batch[0].machine.readField
    const frame = batch.length === 1
      ? batch[0].plan.frame
      : concat(batch.map((entry) => entry.plan.frame))
    try {
      this.session.socket.write(frame)
    } catch (cause) {
      this.fatal(connectionQueryError(cause, "PgConnection: Failed to write query batch"))
    }
  }

  private readonly schedulePipelineFlush = (): void => {
    if (this.pipelineFlushScheduled || this.pipelineDepth() >= maxPipelineDepth) return
    this.pipelineFlushScheduled = true
    // A microtask is what lets fibers submitted in the same tick share a write.
    queueMicrotask(this.flushPipeline)
  }

  /**
   * One cycle on a multiplexed connection. The `owner` permit is only taken to
   * queue the statement, so a pin still orders against submissions without
   * serializing them.
   */
  private readonly pipelineCycle = (
    sql: string,
    params: ReadonlyArray<unknown>,
    wantRows: boolean,
    cache: PreparedCache | undefined
  ): Effect.Effect<QueryOutput, SqlError> =>
    Effect.flatMap(
      this.owner.withPermit(Effect.suspend(() => {
        if (this.deadWith !== undefined) return Effect.fail(this.deadWith)
        let plan: Plan
        try {
          plan = this.encodeQuery(sql, params, cache)
        } catch (cause) {
          return Effect.fail(queryError(cause, "PgConnection: Failed to encode query"))
        }
        const deferred = Deferred.makeUnsafe<QueryOutput, SqlError>()
        let entry: PipelineEntry
        const machine = new QueryMachine(this, plan, wantRows, (result) => this.finishPipelineEntry(entry, result))
        entry = { plan, deferred, machine, abandoned: false }
        this.pipelinePending.push(entry)
        this.consumer = this.pipelineConsumer
        this.schedulePipelineFlush()
        return Effect.succeed(entry)
      })),
      (entry) => {
        const awaited = Deferred.await(entry.deferred).pipe(
          Effect.onInterrupt(() =>
            Effect.sync(() => {
              entry.abandoned = true
            })
          )
        )
        if (cache === undefined || entry.plan.parses) return awaited
        return retryStale(entry.plan, cache, awaited, () => this.pipelineCycle(sql, params, wantRows, undefined))
      }
    )

  /**
   * One extended-query cycle for a caller that shares the session with others:
   * the fibers inside a transaction, and a stream running beside them. The
   * wire permit is what serializes them.
   */
  readonly cycle = (
    sql: string,
    params: ReadonlyArray<unknown>,
    wantRows: boolean,
    cache: PreparedCache | undefined
  ): Effect.Effect<QueryOutput, SqlError> => this.wire.withPermit(this.cycleOwned(sql, params, wantRows, cache))

  /**
   * Runs one cycle for a caller that owns the session. No wire permit is needed
   * because competing pinned work and streams must acquire `owner` first.
   */
  readonly cycleOwned = (
    sql: string,
    params: ReadonlyArray<unknown>,
    wantRows: boolean,
    cache: PreparedCache | undefined
  ): Effect.Effect<QueryOutput, SqlError> => Effect.suspend(() => this.attempt(sql, params, wantRows, cache))

  /**
   * Runs one cycle. A reused statement the backend has since dropped, or whose
   * plan no longer matches its columns, is parsed again on a second attempt;
   * that attempt skips the cache, so it cannot loop.
   */
  private readonly attempt = (
    sql: string,
    params: ReadonlyArray<unknown>,
    wantRows: boolean,
    cache: PreparedCache | undefined
  ): Effect.Effect<QueryOutput, SqlError> => {
    if (this.deadWith !== undefined) return Effect.fail(this.deadWith)
    let plan: Plan
    try {
      plan = this.encodeQuery(sql, params, cache)
    } catch (cause) {
      return Effect.fail(queryError(cause, "PgConnection: Failed to encode query"))
    }
    const run = runQuery(this, plan, wantRows)
    if (cache === undefined || plan.parses) return run
    return retryStale(plan, cache, run, () => this.attempt(sql, params, wantRows, undefined))
  }

  /** Sends a `CancelRequest` for this session on a side connection. */
  readonly cancel: Effect.Effect<void> = Effect.suspend(() => {
    if (this.deadWith !== undefined) return Effect.void
    this.cancelPending = true
    if (this.consumer === undefined) this.retire()
    return sendCancelRequest(this.resolved, this.session)
  })

  readonly pin: Effect.Effect<PgConnection, never, Scope.Scope> = Effect.suspend(() => {
    const reserve = this[internalsKey].reserve
    return reserve === undefined ? this.pinExclusive : Effect.andThen(reserve, this.pinExclusive)
  })

  private readonly pinExclusive: Effect.Effect<PgConnection, never, Scope.Scope> = Effect.acquireRelease(
    Effect.flatMap(this.owner.take(1), () =>
      // Holding `owner` stops new submissions; a pipeline already on the wire
      // still has to drain before this fiber owns the connection.
      Effect.as(
        Effect.tap(
          Effect.onInterrupt(this.waitPipelineIdle, () => this.owner.release(1)),
          () =>
            Effect.sync(() => {
              this.pinned = true
            })
        ),
        this.pinnedView
      )),
    () =>
      Effect.suspend(() => {
        this.pinned = false
        return this.owner.release(1)
      })
  )

  private readonly run = (
    sql: string,
    params: ReadonlyArray<unknown>,
    wantRows: boolean,
    prepare: boolean
  ): Effect.Effect<QueryOutput, SqlError> => {
    const cache = prepare ? this.prepared : undefined
    return this.multiplex
      ? this.pipelineCycle(sql, params, wantRows, cache)
      : this.owner.withPermit(this.cycleOwned(sql, params, wantRows, cache))
  }

  readonly query = (sql: string, params?: ReadonlyArray<unknown>, prepare = true): Effect.Effect<Result, SqlError> =>
    Effect.map(this.run(sql, params ?? emptyParams, true, prepare), takeResult)

  readonly queryValues = (
    sql: string,
    params?: ReadonlyArray<unknown>,
    prepare = true
  ): Effect.Effect<ReadonlyArray<ReadonlyArray<unknown>>, SqlError> =>
    Effect.map(this.run(sql, params ?? emptyParams, false, prepare), takeValues)

  readonly stream = (sql: string, params?: ReadonlyArray<unknown>): Stream.Stream<Row, SqlError> =>
    streamRows(this, this.pin, sql, params ?? emptyParams)

  readonly listen = (
    channel: string
  ): Effect.Effect<Queue.Dequeue<Notification, SqlError>, SqlError, Scope.Scope> =>
    listenChannel(this, this.pin, channel)

  readonly interrupt: Effect.Effect<void> = Effect.suspend(() =>
    this.multiplex && !this.pinned ? Effect.void : this.cancel
  )
}

/**
 * The view of a session returned by `pin`: statements skip the ownership
 * queue and re-pinning is a no-op, making `pin` reentrant for `stream` and
 * `listen` running inside a transaction.
 */
class PinnedPgConnection implements PgConnection {
  readonly [TypeId]: TypeId = TypeId
  readonly base: PgConnectionImpl
  readonly [internalsKey]: ConnectionInternals
  readonly pin: Effect.Effect<PgConnection, never, Scope.Scope>
  readonly interrupt: Effect.Effect<void>

  constructor(base: PgConnectionImpl) {
    this.base = base
    this[internalsKey] = base[internalsKey]
    this.pin = Effect.succeed(this)
    this.interrupt = base.cancel
  }

  get config(): Config {
    return this.base.config
  }

  get processId(): number {
    return this.base.processId
  }

  readonly query = (sql: string, params?: ReadonlyArray<unknown>, prepare = true): Effect.Effect<Result, SqlError> =>
    Effect.map(this.base.cycle(sql, params ?? emptyParams, true, prepare ? this.base.prepared : undefined), takeResult)

  readonly queryValues = (
    sql: string,
    params?: ReadonlyArray<unknown>,
    prepare = true
  ): Effect.Effect<ReadonlyArray<ReadonlyArray<unknown>>, SqlError> =>
    Effect.map(this.base.cycle(sql, params ?? emptyParams, false, prepare ? this.base.prepared : undefined), takeValues)

  readonly stream = (sql: string, params?: ReadonlyArray<unknown>): Stream.Stream<Row, SqlError> =>
    streamRows(this.base, this.pin, sql, params ?? emptyParams)

  readonly listen = (
    channel: string
  ): Effect.Effect<Queue.Dequeue<Notification, SqlError>, SqlError, Scope.Scope> =>
    listenChannel(this.base, this.pin, channel)
}

interface QueryOutput {
  readonly result: Result
  readonly values: ReadonlyArray<ReadonlyArray<unknown>>
}

const INT32_MIN = -2147483648
const INT32_MAX = 2147483647

const inferredParameter = (oid: number, value: unknown): PgTypes.Parameter => ({
  [PgTypes.ParameterTypeId]: PgTypes.ParameterTypeId,
  oid,
  value
})

const inferScalar = (value: unknown): PgTypes.Parameter => {
  if (PgTypes.isParameter(value)) return value
  if (value === null || value === undefined) return inferredParameter(0, null)
  switch (typeof value) {
    case "boolean":
      return inferredParameter(PgTypes.OID.bool, value)
    case "bigint":
      return inferredParameter(PgTypes.OID.int8, value)
    case "number":
      if (Number.isInteger(value)) {
        if (value >= INT32_MIN && value <= INT32_MAX) {
          return inferredParameter(PgTypes.OID.int4, value)
        }
        if (Number.isSafeInteger(value)) {
          return inferredParameter(PgTypes.OID.int8, BigInt(value))
        }
      }
      return inferredParameter(PgTypes.OID.float8, value)
    case "string":
      // Bound with no concrete type, as a text-format literal, so the backend
      // derives the type from the statement: a string works against a bigint
      // or timestamp column the way it did with the text-protocol drivers.
      return inferredParameter(0, value)
  }
  if (value instanceof Date) return inferredParameter(PgTypes.OID.timestamptz, value)
  if (value instanceof Uint8Array) return inferredParameter(PgTypes.OID.bytea, value)
  if (value instanceof Int8Array) {
    return inferredParameter(
      PgTypes.OID.bytea,
      new Uint8Array(value.buffer, value.byteOffset, value.byteLength)
    )
  }
  throw new PgTypes.CodecError({ message: `Cannot infer a PostgreSQL type for ${String(value)}` })
}

const inferParameter = (value: unknown, registry: PgTypes.Registry | undefined): PgTypes.Parameter => {
  if (!Array.isArray(value)) return inferScalar(value)
  if (value.length === 0) {
    throw new PgTypes.CodecError({ message: "Cannot infer the type of an empty array; use PgTypes.array" })
  }
  let elementOid: number | undefined
  const values: Array<unknown> = new Array(value.length)
  for (let index = 0; index < value.length; index++) {
    const element = value[index]
    if (Array.isArray(element)) {
      throw new PgTypes.CodecError({ message: "Nested array parameters are not supported" })
    }
    const parameter = inferScalar(element)
    // A scalar string binds untyped, but an array names its element type.
    let oid = parameter.oid
    if (oid === 0) {
      if (parameter.value === null) {
        values[index] = null
        continue
      }
      oid = PgTypes.OID.text
    }
    if (Array.isArray(parameter.value)) {
      throw new PgTypes.CodecError({ message: "Nested array parameters are not supported" })
    }
    if (elementOid === undefined) elementOid = oid
    else if (elementOid !== oid) {
      throw new PgTypes.CodecError({ message: "Array parameter elements must have the same inferred OID" })
    }
    values[index] = parameter.value
  }
  if (elementOid === undefined) {
    throw new PgTypes.CodecError({ message: "Cannot infer the type of an array containing only null values" })
  }
  const arrayOid = PgTypes.arrayOidFor(elementOid, registry)
  if (arrayOid === undefined) {
    throw new PgTypes.CodecError({ message: `No array type known for element OID ${elementOid}` })
  }
  return inferredParameter(arrayOid, values)
}

/**
 * Joins the parts of a frame into the buffer that goes on the wire.
 *
 * The buffer comes from Node's pool and can be passed directly to
 * `socket.write`. Every byte is initialized before the buffer is returned.
 */
const concat = (chunks: ReadonlyArray<Uint8Array>): Uint8Array => {
  let length = 0
  for (let index = 0; index < chunks.length; index++) length += chunks[index].length
  const output = Buffer.allocUnsafe(length)
  let offset = 0
  for (let index = 0; index < chunks.length; index++) {
    output.set(chunks[index], offset)
    offset += chunks[index].length
  }
  return output
}

const emptyParams: ReadonlyArray<unknown> = []

const takeResult = (output: QueryOutput): Result => output.result
const takeValues = (output: QueryOutput): ReadonlyArray<ReadonlyArray<unknown>> => output.values

/**
 * The tail of every extended-query frame. `Describe` names the unnamed portal,
 * `Execute` runs it without a row limit, and `Sync` closes the cycle; none of
 * the three carries per-query state, so the bytes are encoded once.
 */
const describeExecuteSync: Uint8Array = concat([
  PgProtocol.encodeDescribe({ target: "portal", name: "" }),
  PgProtocol.encodeExecute({ portal: "", maxRows: 0 }),
  PgProtocol.encodeSync()
])

/** The same tail for a statement whose columns are already known. */
const executeSync: Uint8Array = concat([
  PgProtocol.encodeExecute({ portal: "", maxRows: 0 }),
  PgProtocol.encodeSync()
])

/** The default number of statements a connection keeps prepared. */
const defaultPreparedStatements = 100

/**
 * A statement the backend has parsed and holds under a name.
 *
 * `ready` turns true once `ParseComplete` confirms the backend has it and the
 * first execution has reported its columns. Until then the entry is treated as
 * a miss, which is safe because one cycle runs at a time. A `ready` entry with
 * no `description` describes a statement that returns no rows.
 */
interface Prepared {
  readonly name: string
  readonly key: string
  ready: boolean
  /** A cycle carrying this statement's `Parse` is on the wire. */
  parsing: boolean
  description: Description | undefined
}

/** One planned execution: the bytes to write and what to expect back. */
interface Plan {
  readonly frame: Uint8Array
  /** `CloseComplete` messages to consume before the cycle proper. */
  readonly closes: number
  /** Whether the frame carries a `Parse`. */
  readonly parses: boolean
  /** Whether the frame carries a `Describe`, so the columns arrive on the wire. */
  readonly describes: boolean
  /** The statement being filled in or reused, if this execution names one. */
  readonly prepared: Prepared | undefined
  /** Set when the columns were already known, so no `RowDescription` is coming. */
  readonly description: Description | undefined
  /** Set by the cycle when the backend rejected the name or the cached plan. */
  stale: boolean
}

/** The unnamed path: `Parse` / `Bind` / `Describe` / `Execute` / `Sync`. */
const encodeUnnamed = (
  sql: string,
  parameters: ReadonlyArray<PgTypes.Parameter>,
  parameterTypes: ReadonlyArray<number>,
  encodeBind: BindEncoder
): Plan => {
  const parse = PgProtocol.encodeParse({ name: "", query: sql, parameterTypes })
  if (EffectResult.isFailure(parse)) throw parse.failure
  const bind = encodeBind({ portal: "", statement: "", parameters })
  if (EffectResult.isFailure(bind)) throw bind.failure
  return {
    frame: concat([parse.success, bind.success, describeExecuteSync]),
    closes: 0,
    parses: true,
    describes: true,
    prepared: undefined,
    description: undefined,
    stale: false
  }
}

/**
 * Builds one extended-query cycle as a single buffer, so a statement costs one
 * socket write.
 *
 * A statement the backend already holds under a name needs only
 * `Bind` / `Execute` / `Sync`: no `Parse` for the backend to plan and no
 * `Describe`, because the columns came back the first time and are cached with
 * the name. Statements evicted from the cache ride along as `Close` messages
 * rather than paying a round trip of their own.
 */
const encodeQuery = (
  sql: string,
  params: ReadonlyArray<unknown>,
  registry: PgTypes.Registry | undefined,
  encodeBind: BindEncoder,
  cache: PreparedCache | undefined
): Plan => {
  const count = params.length
  const parameters: Array<PgTypes.Parameter> = new Array(count)
  const parameterTypes: Array<number> = new Array(count)
  for (let index = 0; index < count; index++) {
    const parameter = inferParameter(params[index], registry)
    parameters[index] = parameter
    parameterTypes[index] = parameter.oid
  }

  if (cache === undefined) {
    return encodeUnnamed(sql, parameters, parameterTypes, encodeBind)
  }

  const prepared = cache.get(sql, parameterTypes)
  if (!prepared.ready && prepared.parsing) {
    // Another cycle is already on the wire carrying this name's `Parse`.
    // Naming it again would collide, and reusing it would mean binding to
    // columns nobody has seen yet, so this execution goes unnamed.
    return encodeUnnamed(sql, parameters, parameterTypes, encodeBind)
  }
  const bind = encodeBind({ portal: "", statement: prepared.name, parameters })
  if (EffectResult.isFailure(bind)) throw bind.failure
  const parse = prepared.ready ? undefined : PgProtocol.encodeParse({ name: prepared.name, query: sql, parameterTypes })
  if (parse !== undefined && EffectResult.isFailure(parse)) throw parse.failure
  const closeFrames = cache.takeCloses()

  if (parse === undefined) {
    return {
      frame: closeFrames === undefined
        ? concat([bind.success, executeSync])
        : concat([closeFrames.frames, bind.success, executeSync]),
      closes: closeFrames?.count ?? 0,
      parses: false,
      describes: false,
      prepared,
      description: prepared.description,
      stale: false
    }
  }

  prepared.parsing = true
  return {
    frame: closeFrames === undefined
      ? concat([parse.success, bind.success, describeExecuteSync])
      : concat([closeFrames.frames, parse.success, bind.success, describeExecuteSync]),
    closes: closeFrames?.count ?? 0,
    parses: true,
    describes: true,
    prepared,
    description: undefined,
    stale: false
  }
}

/**
 * The statements one connection has prepared, keyed by SQL text and the
 * parameter OIDs inferred for it: the same text with differently typed
 * parameters is a different statement to the backend.
 *
 * The cache is bounded and evicts least-recently-used. An evicted statement is
 * closed on the backend, but its `Close` waits for the next statement to go
 * out rather than taking a round trip of its own.
 */
class PreparedCache {
  readonly max: number
  private readonly statements = new Map<string, Prepared>()
  private readonly namespace = randomBytes(8).toString("hex")
  private closes: Array<Uint8Array> | undefined
  private counter = 0

  constructor(max: number) {
    this.max = max
  }

  get(sql: string, parameterTypes: ReadonlyArray<number>): Prepared {
    const key = parameterTypes.length === 0 ? sql : `${sql}\u0000${parameterTypes.join(",")}`
    const found = this.statements.get(key)
    if (found !== undefined) {
      // Re-insert to move it to the end: `Map` iterates in insertion order, so
      // the first key is the least recently used one.
      this.statements.delete(key)
      this.statements.set(key, found)
      this.trim(found)
      return found
    }
    const prepared: Prepared = {
      name: `effect_${this.namespace}_${++this.counter}`,
      key,
      ready: false,
      parsing: false,
      description: undefined
    }
    this.statements.set(key, prepared)
    this.trim(prepared)
    return prepared
  }

  /**
   * A statement still being parsed cannot be closed yet: its `Parse` may not
   * have reached the socket. Let the cache exceed its bound temporarily, then
   * discard abandoned entries and close excess ready statements on access.
   */
  private trim(protectedStatement?: Prepared): void {
    while (this.statements.size > this.max) {
      let evicted: Prepared | undefined
      for (const prepared of this.statements.values()) {
        if (prepared !== protectedStatement && (prepared.ready || !prepared.parsing)) {
          evicted = prepared
          break
        }
      }
      if (evicted === undefined) return
      this.statements.delete(evicted.key)
      if (evicted.ready) this.close(evicted.name)
    }
  }

  /**
   * Drops a statement the backend no longer holds, or whose plan went stale.
   *
   * The name is closed either way. A plan that went stale is still held under
   * it, and re-parsing would collide; a name the backend has already lost
   * ignores the `Close`, which Postgres treats as a success.
   */
  evict(prepared: Prepared): void {
    if (prepared.parsing) return
    if (this.statements.delete(prepared.key) && prepared.ready) this.close(prepared.name)
  }

  /**
   * Drops a statement whose parsing cycle failed before its columns arrived.
   *
   * A `Parse` that completed before the error outlives the failed cycle, so
   * the backend may hold the name while the entry can never become ready. The
   * name is closed either way: closing one the backend never registered is a
   * no-op.
   */
  evictFailed(prepared: Prepared): void {
    this.statements.delete(prepared.key)
    this.close(prepared.name)
  }

  private close(name: string): void {
    ;(this.closes ??= []).push(PgProtocol.encodeClose({ target: "statement", name }))
  }

  takeCloses(): { readonly frames: Uint8Array; readonly count: number } | undefined {
    const closes = this.closes
    if (closes === undefined) return undefined
    this.closes = undefined
    return { frames: closes.length === 1 ? closes[0] : concat(closes), count: closes.length }
  }
}

/**
 * SQLSTATEs that mean "this name is no longer usable": the backend lost the
 * statement, or the plan behind it no longer matches the columns it was
 * prepared for. Both are recovered by parsing the statement again.
 */
const isStalePreparedStatement = (code: string | undefined): boolean => code === "26000" || code === "0A000"

type BindEncoder = (options: {
  readonly portal: string
  readonly statement: string
  readonly parameters: ReadonlyArray<PgTypes.Parameter>
}) => EffectResult.Result<Uint8Array, PgProtocol.EncodeError | PgTypes.CodecError>

/**
 * The default builtin-catalogue encoder, shared by every connection without a
 * custom registry. Passing `PgTypes.writeParameter` itself engages
 * `makeBindEncoder`'s unsafe fast path.
 */
const defaultBindEncoder: BindEncoder = PgProtocol.makeBindEncoder(PgTypes.writeParameter, PgTypes.isTextFormat)

/** One bind encoder per registry, since building one allocates a closure. */
const makeBindEncoder = (registry: PgTypes.Registry | undefined): BindEncoder =>
  registry === undefined
    ? defaultBindEncoder
    : PgProtocol.makeBindEncoder(
      (sink: PgProtocol.ValueSink, parameter: PgTypes.Parameter) => PgTypes.writeParameter(sink, parameter, registry),
      PgTypes.isTextFormat
    )

const queryError = (cause: unknown, message: string): SqlError =>
  new SqlError({ reason: new UnknownError({ cause, message, operation: "query" }) })

/**
 * Retries a cycle whose named statement the backend no longer honors: the
 * statement is dropped from the cache and the retry runs unnamed, so it cannot
 * loop.
 */
const retryStale = (
  plan: Plan,
  cache: PreparedCache,
  run: Effect.Effect<QueryOutput, SqlError>,
  rerun: () => Effect.Effect<QueryOutput, SqlError>
): Effect.Effect<QueryOutput, SqlError> =>
  Effect.catchCause(run, (cause) => {
    if (!plan.stale) return Effect.failCause(cause)
    cache.evict(plan.prepared!)
    return rerun()
  })

const connectionQueryError = (cause: unknown, message: string): SqlError =>
  new SqlError({ reason: new ConnectionError({ cause, message, operation: "query" }) })

const escapeIdentifier = (identifier: string): string => `"${identifier.replaceAll("\"", "\"\"")}"`

type QueryPhase = "close" | "parse" | "bind" | "describe" | "rows" | "complete" | "error"

/**
 * Splits a command tag such as `SELECT 3` or `INSERT 0 1`. Reading the two
 * spaces directly keeps a completed statement from allocating the parts array
 * that splitting on every space would.
 */
const parseCommandTag = (tag: string): { command: string; rowCount: number; oid: number | null } => {
  const firstSpace = tag.indexOf(" ")
  if (firstSpace < 0) return { command: tag, oid: null, rowCount: 0 }
  const command = tag.slice(0, firstSpace)
  const secondSpace = tag.indexOf(" ", firstSpace + 1)
  if (command === "INSERT" && secondSpace > 0) {
    return {
      command,
      oid: Number(tag.slice(firstSpace + 1, secondSpace)),
      rowCount: Number(tag.slice(secondSpace + 1))
    }
  }
  const last = tag.slice((secondSpace < 0 ? firstSpace : secondSpace) + 1)
  return { command, oid: null, rowCount: isDigits(last) ? Number(last) : 0 }
}

const isDigits = (value: string): boolean => {
  if (value.length === 0) return false
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index)
    if (code < 48 || code > 57) return false
  }
  return true
}

/**
 * Tracks one query cycle while the connection routes backend messages to it.
 * Each pipelined cycle keeps its own parser state and completes once.
 */
class QueryMachine implements Consumer {
  private readonly conn: PgConnectionImpl
  private readonly plan: Plan
  private readonly finish: (effect: Effect.Effect<QueryOutput, SqlError>) => void
  /** Installed on the parser while this machine is at the head of the queue. */
  readonly readField: PgProtocol.FieldReader<unknown> | undefined
  /** Object rows, or `undefined` when the caller asked for positional ones. */
  private readonly rows: Array<Row> | undefined
  private readonly values: Array<ReadonlyArray<unknown>> | undefined

  private closes: number
  private phase: QueryPhase
  private fieldCount: number
  private resultFields: ReadonlyArray<Field>
  private rowBuilder: RowBuilder | undefined
  private command = ""
  private rowCount = 0
  private oid: number | null = null
  private failure: SqlError | undefined
  private done = false
  private aborted = false
  private drainDone: (() => void) | undefined

  constructor(
    conn: PgConnectionImpl,
    plan: Plan,
    wantRows: boolean,
    finish: (effect: Effect.Effect<QueryOutput, SqlError>) => void
  ) {
    this.conn = conn
    this.plan = plan
    this.finish = finish
    this.rows = wantRows ? [] : undefined
    this.values = wantRows ? undefined : []
    this.closes = plan.closes
    this.phase = plan.closes > 0 ? "close" : plan.parses ? "parse" : "bind"
    const description = plan.description
    this.readField = description?.readField
    this.fieldCount = description?.resultFields.length ?? 0
    this.resultFields = description?.resultFields ?? emptyFields
    this.rowBuilder = description?.rowBuilder
  }

  isDone(): boolean {
    return this.done
  }

  abort(onDrained: () => void): void {
    if (this.done) return onDrained()
    this.aborted = true
    this.drainDone = onDrained
  }

  private complete(effect: Effect.Effect<QueryOutput, SqlError>): void {
    if (this.done) return
    this.done = true
    // Whether it parsed or not, this cycle no longer holds the name: success
    // has already marked it ready, failure leaves it to be parsed again.
    const prepared = this.plan.prepared
    if (prepared !== undefined) prepared.parsing = false
    this.finish(effect)
  }

  private failDesync(message: string): void {
    this.conn.fatal(connectionQueryError(new Error(message), `PgConnection: ${message}`))
  }

  onFatal(error: SqlError): void {
    if (this.done) return
    this.done = true
    const prepared = this.plan.prepared
    if (prepared !== undefined) prepared.parsing = false
    if (this.aborted) this.drainDone?.()
    else this.finish(Effect.fail(error))
  }

  onMessage(message: PgProtocol.BackendMessage<unknown>): void {
    if (this.aborted) {
      if (message._tag === "ReadyForQuery") {
        this.done = true
        this.drainDone?.()
      }
      return
    }
    if (this.phase === "error") {
      if (message._tag === "ReadyForQuery") return this.complete(Effect.fail(this.failure!))
      return this.failDesync(`Unexpected ${message._tag} after ErrorResponse`)
    }
    switch (message._tag) {
      case "CloseComplete":
        if (this.phase !== "close") return this.failDesync(`Unexpected CloseComplete during ${this.phase}`)
        if (--this.closes === 0) this.phase = this.plan.parses ? "parse" : "bind"
        return
      case "ParseComplete":
        if (this.phase !== "parse") return this.failDesync(`Unexpected ParseComplete during ${this.phase}`)
        this.phase = "bind"
        return
      case "BindComplete":
        if (this.phase !== "bind") return this.failDesync(`Unexpected BindComplete during ${this.phase}`)
        this.phase = this.plan.describes ? "describe" : "rows"
        return
      case "RowDescription": {
        if (this.phase !== "describe") return this.failDesync(`Unexpected RowDescription during ${this.phase}`)
        const description = describe(message.fields, this.conn.registry)
        if (EffectResult.isFailure(description)) {
          return this.conn.fatal(queryError(description.failure, "PgConnection: Failed to decode row"))
        }
        this.fieldCount = message.fields.length
        this.resultFields = description.success.resultFields
        this.rowBuilder = description.success.rowBuilder
        // `pushEach` hands this description over before it reads the rows
        // behind it, including rows that arrived in the same chunk.
        this.conn.session.parser.readField = description.success.readField
        const prepared = this.plan.prepared
        if (prepared !== undefined) {
          prepared.description = description.success
          prepared.ready = true
        }
        this.phase = "rows"
        return
      }
      case "NoData": {
        if (this.phase !== "describe") return this.failDesync(`Unexpected NoData during ${this.phase}`)
        const prepared = this.plan.prepared
        if (prepared !== undefined) {
          prepared.description = undefined
          prepared.ready = true
        }
        this.phase = "rows"
        return
      }
      case "DataRow": {
        if (this.phase !== "rows" || this.rowBuilder === undefined) {
          return this.failDesync(`Unexpected DataRow during ${this.phase}`)
        }
        const rowValues = message.values
        if (rowValues.length !== this.fieldCount) {
          return this.failDesync(`DataRow has ${rowValues.length} values for ${this.fieldCount} fields`)
        }
        if (this.rows !== undefined) this.rows.push(this.rowBuilder(rowValues))
        else this.values!.push(rowValues)
        return
      }
      case "CommandComplete": {
        if (this.phase !== "rows") return this.failDesync(`Unexpected CommandComplete during ${this.phase}`)
        const parsed = parseCommandTag(message.commandTag)
        this.command = parsed.command
        this.rowCount = parsed.rowCount
        this.oid = parsed.oid
        this.phase = "complete"
        return
      }
      case "EmptyQueryResponse":
        if (this.phase !== "rows") return this.failDesync(`Unexpected EmptyQueryResponse during ${this.phase}`)
        this.phase = "complete"
        return
      case "ErrorResponse": {
        if (isStalePreparedStatement(message.fields.code)) this.plan.stale = true
        // A cycle that carried this statement's `Parse` but failed before its
        // columns arrived leaves an entry that can never become ready while
        // the backend may still hold the name: the `Parse` outlives the
        // failed cycle. Drop the entry and close the name, so the next
        // execution parses fresh under a new one.
        const prepared = this.plan.prepared
        if (this.plan.parses && prepared !== undefined && !prepared.ready) {
          this.conn.prepared?.evictFailed(prepared)
        }
        // Every phase drains the same way: the backend skips the rest of the
        // cycle and sends `ReadyForQuery` after the `Sync` that closes it, so
        // a statement it refused to parse leaves the session usable.
        this.failure = new SqlError({
          reason: classifyFields(message.fields, "PgConnection: Query failed", "query")
        })
        this.phase = "error"
        return
      }
      case "ReadyForQuery":
        if (this.phase !== "complete") return this.failDesync(`Unexpected ReadyForQuery during ${this.phase}`)
        return this.complete(Effect.succeed({
          result: {
            command: this.command,
            rowCount: this.rowCount,
            oid: this.oid,
            rows: this.rows ?? emptyRows,
            fields: this.resultFields
          },
          values: this.values ?? emptyValues
        }))
      case "CopyInResponse":
      case "CopyOutResponse":
      case "CopyBothResponse":
      case "CopyData":
      case "CopyDone":
        return this.failDesync(`Unexpected ${message._tag}; COPY is not supported`)
      default:
        return this.failDesync(`Unexpected ${message._tag} during ${this.phase}`)
    }
  }
}

const emptyRows: ReadonlyArray<Row> = []
const emptyValues: ReadonlyArray<ReadonlyArray<unknown>> = []

/** Drains an aborted statement, sending a cancel after a short grace period and failing if it stalls. */
const drainAborted = (
  conn: PgConnectionImpl,
  timeoutMessage: string,
  abort: (onDrained: () => void) => void
): Effect.Effect<void> => {
  const drained = Deferred.makeUnsafe<void>()
  const timeout = setTimeout(
    () => conn.fatal(connectionQueryError(new Error(timeoutMessage), `PgConnection: ${timeoutMessage}`)),
    abortDrainTimeoutMillis
  )
  abort(() => {
    clearTimeout(timeout)
    Deferred.doneUnsafe(drained, Effect.void)
  })
  const grace = Effect.callback<void>((resume) => {
    const timer = setTimeout(() => resume(Effect.void), abortDrainGraceMillis)
    return Effect.sync(() => clearTimeout(timer))
  })
  const cancelAndDrain = Effect.andThen(conn.cancel, Deferred.await(drained))
  return Effect.andThen(
    Effect.raceFirst(Deferred.await(drained), grace),
    Effect.suspend(() => Deferred.isDoneUnsafe(drained) ? Effect.void : cancelAndDrain)
  )
}

/** One cycle on a connection that carries a single statement at a time. */
const runQuery = (
  conn: PgConnectionImpl,
  plan: Plan,
  wantRows: boolean
): Effect.Effect<QueryOutput, SqlError> =>
  Effect.callback<QueryOutput, SqlError>((resume) => {
    if (conn.deadWith !== undefined) {
      resume(Effect.fail(conn.deadWith))
      return
    }
    const machine = new QueryMachine(conn, plan, wantRows, (effect) => {
      conn.consumer = undefined
      resume(effect)
    })
    conn.consumer = machine
    // A reused statement has no `RowDescription` coming, so its reader has to
    // be in place before the rows are.
    conn.session.parser.readField = machine.readField
    try {
      conn.session.socket.write(plan.frame)
    } catch (cause) {
      conn.fatal(connectionQueryError(cause, "PgConnection: Failed to write query"))
    }

    return Effect.suspend(() => {
      if (machine.isDone()) return Effect.void
      return drainAborted(conn, "Query cancellation timed out", (onDrained) =>
        machine.abort(() => {
          conn.consumer = undefined
          onDrained()
        }))
    })
  })

/** Turns one decoded row into an object keyed by column name. */
type RowBuilder = (rowValues: ReadonlyArray<unknown>) => Row

/** Everything a query needs from one `RowDescription`. */
interface Description {
  readonly readField: PgProtocol.FieldReader<unknown>
  readonly rowBuilder: RowBuilder
  readonly resultFields: ReadonlyArray<Field>
}

const emptyFields: ReadonlyArray<Field> = []

/** Derives the per-column readers and the row constructor for a description. */
const describe = (
  fields: ReadonlyArray<PgProtocol.FieldDescription>,
  registry: PgTypes.Registry | undefined
): EffectResult.Result<Description, PgTypes.CodecError> => {
  const reader = PgTypes.makeFieldReader(fields, registry)
  if (EffectResult.isFailure(reader)) return EffectResult.fail(reader.failure)
  const resultFields: Array<Field> = new Array(fields.length)
  for (let index = 0; index < fields.length; index++) {
    resultFields[index] = { name: fields[index].name, dataTypeId: fields[index].dataTypeOid }
  }
  return EffectResult.succeed({
    readField: reader.success,
    rowBuilder: makeRowBuilder(fields),
    resultFields
  })
}

/**
 * Builds the row constructor for one `RowDescription`.
 *
 * Assignment is an order of magnitude faster than `Object.defineProperty` and
 * stores the same own, enumerable, writable, configurable property - except
 * for `__proto__`, which assignment routes to the prototype setter instead. A
 * description carrying that column name falls back to the slow spelling.
 */
const makeRowBuilder = (fields: ReadonlyArray<PgProtocol.FieldDescription>): RowBuilder => {
  const names: Array<string> = new Array(fields.length)
  let hasProto = false
  for (let index = 0; index < fields.length; index++) {
    const name = fields[index].name
    names[index] = name
    if (name === "__proto__") hasProto = true
  }
  if (hasProto) {
    return (rowValues) => {
      const row: Record<string, unknown> = {}
      for (let index = 0; index < names.length; index++) {
        Object.defineProperty(row, names[index], {
          value: rowValues[index],
          enumerable: true,
          configurable: true,
          writable: true
        })
      }
      return row
    }
  }
  return (rowValues) => {
    const row: Record<string, unknown> = {}
    for (let index = 0; index < names.length; index++) {
      row[names[index]] = rowValues[index]
    }
    return row
  }
}

const streamRows = (
  conn: PgConnectionImpl,
  pin: Effect.Effect<PgConnection, never, Scope.Scope>,
  sql: string,
  params: ReadonlyArray<unknown>
): Stream.Stream<Row, SqlError> =>
  Stream.fromChannel(Channel.fromTransform(Effect.fnUntraced(function*(_, scope) {
    yield* Scope.provide(pin, scope)
    yield* Scope.provide(
      Effect.acquireRelease(conn.wire.take(1), () => conn.wire.release(1)),
      scope
    )
    if (conn.deadWith !== undefined) return yield* conn.deadWith
    // Streams stay on the unnamed path: a stream pays its setup once over the
    // whole result, so naming the statement buys little and would need the
    // stale-plan retry to unwind rows already delivered.
    const plan = yield* Effect.try({
      try: () => conn.encodeQuery(sql, params, undefined),
      catch: (cause) => queryError(cause, "PgConnection: Failed to encode query")
    })
    const frame = plan.frame

    const socket = conn.session.socket
    const parser = conn.session.parser
    let phase: QueryPhase = "parse"
    let fieldCount = 0
    let rowBuilder: RowBuilder | undefined
    let buffer: Array<Row> = []
    let failure: SqlError | undefined
    let finished = false
    let done = false
    let aborted = false
    let paused = false
    let pending:
      | ((effect: Effect.Effect<Arr.NonEmptyReadonlyArray<Row>, SqlError | Cause.Done>) => void)
      | undefined
    let drainDone: (() => void) | undefined

    const setPaused = (value: boolean): void => {
      if (paused === value) return
      paused = value
      if (value) socket.pause()
      else socket.resume()
    }

    const deliver = (): void => {
      if (pending === undefined) return
      const resume = pending
      if (buffer.length > 0) {
        const chunk = buffer as Arr.NonEmptyArray<Row>
        buffer = []
        pending = undefined
        resume(Effect.succeed(chunk))
      } else if (finished) {
        pending = undefined
        resume(failure !== undefined ? Effect.fail(failure) : Cause.done())
      }
    }

    const onFatal = (error: SqlError): void => {
      if (done) return
      done = true
      finished = true
      if (failure === undefined) failure = error
      drainDone?.()
      deliver()
    }
    // `conn.fatal` notifies the registered consumer; the direct `onFatal` call
    // covers the case where the connection was already dead.
    const failFatal = (error: SqlError): void => {
      conn.fatal(error)
      onFatal(error)
    }
    const failDesync = (message: string): void =>
      failFatal(connectionQueryError(new Error(message), `PgConnection: ${message}`))

    const onMessage = (message: PgProtocol.BackendMessage<unknown>): void => {
      if (aborted) {
        if (message._tag === "ReadyForQuery") {
          done = true
          conn.consumer = undefined
          drainDone?.()
        }
        return
      }
      if (phase === "error") {
        switch (message._tag) {
          case "ReadyForQuery":
            finished = true
            done = true
            conn.consumer = undefined
            deliver()
            return
          default:
            return failDesync(`Unexpected ${message._tag} after ErrorResponse`)
        }
      }
      switch (message._tag) {
        case "ParseComplete":
          if (phase !== "parse") return failDesync(`Unexpected ParseComplete during ${phase}`)
          phase = "bind"
          return
        case "BindComplete":
          if (phase !== "bind") return failDesync(`Unexpected BindComplete during ${phase}`)
          phase = "describe"
          return
        case "RowDescription": {
          if (phase !== "describe") return failDesync(`Unexpected RowDescription during ${phase}`)
          const description = describe(message.fields, conn.registry)
          if (EffectResult.isFailure(description)) {
            return failFatal(queryError(description.failure, "PgConnection: Failed to decode row"))
          }
          fieldCount = message.fields.length
          rowBuilder = description.success.rowBuilder
          parser.readField = description.success.readField
          phase = "rows"
          return
        }
        case "NoData":
          if (phase !== "describe") return failDesync(`Unexpected NoData during ${phase}`)
          phase = "rows"
          return
        case "DataRow": {
          if (phase !== "rows" || rowBuilder === undefined) {
            return failDesync(`Unexpected DataRow during ${phase}`)
          }
          const rowValues = message.values
          if (rowValues.length !== fieldCount) {
            return failDesync(`DataRow has ${rowValues.length} values for ${fieldCount} fields`)
          }
          buffer.push(rowBuilder(rowValues))
          return
        }
        case "CommandComplete":
          if (phase !== "rows") return failDesync(`Unexpected CommandComplete during ${phase}`)
          phase = "complete"
          return
        case "EmptyQueryResponse":
          if (phase !== "rows") return failDesync(`Unexpected EmptyQueryResponse during ${phase}`)
          phase = "complete"
          return
        case "ErrorResponse": {
          failure = new SqlError({
            reason: classifyFields(message.fields, "PgConnection: Query failed", "query")
          })
          phase = "error"
          return
        }
        case "ReadyForQuery":
          if (phase !== "complete") return failDesync(`Unexpected ReadyForQuery during ${phase}`)
          finished = true
          done = true
          conn.consumer = undefined
          deliver()
          return
        case "CopyInResponse":
        case "CopyOutResponse":
        case "CopyBothResponse":
        case "CopyData":
        case "CopyDone":
          return failDesync(`Unexpected ${message._tag}; COPY is not supported`)
        default:
          return failDesync(`Unexpected ${message._tag} during ${phase}`)
      }
    }

    const onBatchEnd = (): void => {
      if (done || aborted) return
      if (pending !== undefined) deliver()
      else if (buffer.length >= streamPauseThreshold) setPaused(true)
    }

    yield* Scope.addFinalizer(
      scope,
      Effect.suspend(() => {
        if (done) return Effect.void
        aborted = true
        const drain = drainAborted(conn, "Stream cancellation timed out", (onDrained) => {
          drainDone = onDrained
        })
        setPaused(false)
        return drain
      })
    )

    conn.consumer = { onMessage, onBatchEnd, onFatal }
    parser.readField = undefined
    // @effect-diagnostics-next-line tryCatchInEffectGen:off
    try {
      socket.write(frame)
    } catch (cause) {
      failFatal(connectionQueryError(cause, "PgConnection: Failed to write query"))
    }

    // @effect-diagnostics-next-line returnEffectInGen:off
    return Effect.callback<Arr.NonEmptyReadonlyArray<Row>, SqlError | Cause.Done>((resume) => {
      pending = resume
      setPaused(false)
      deliver()
      if (pending === undefined) return
      return Effect.sync(() => {
        if (pending === resume) pending = undefined
      })
    })
  })))

const listenChannel = (
  conn: PgConnectionImpl,
  pin: Effect.Effect<PgConnection, never, Scope.Scope>,
  channel: string
): Effect.Effect<Queue.Dequeue<Notification, SqlError>, SqlError, Scope.Scope> =>
  Effect.uninterruptibleMask((restore) =>
    Effect.gen(function*() {
      const channelError = validateChannelName(channel, "listen")
      if (channelError !== undefined) return yield* Effect.fail(channelError)
      const parentScope = yield* Scope.Scope
      const scope = yield* Scope.fork(parentScope)
      return yield* restore(Effect.gen(function*() {
        const pinned = yield* Scope.provide(pin, scope)
        if (conn.deadWith !== undefined) return yield* conn.deadWith
        const queue = yield* Queue.unbounded<Notification, SqlError>()
        const identifier = escapeIdentifier(channel)
        let queues = conn.channels.get(channel)
        if (queues === undefined) {
          queues = new Set()
          conn.channels.set(channel, queues)
        }
        queues.add(queue)
        yield* Scope.addFinalizer(
          scope,
          Effect.suspend(() => {
            const current = conn.channels.get(channel)
            if (current === undefined) return Queue.shutdown(queue)
            current.delete(queue)
            if (current.size > 0) return Queue.shutdown(queue)
            conn.channels.delete(channel)
            const unlisten = conn.deadWith === undefined
              ? Effect.ignore(pinned.query(`UNLISTEN ${identifier}`))
              : Effect.void
            return Effect.andThen(unlisten, Queue.shutdown(queue))
          })
        )
        yield* pinned.query(`LISTEN ${identifier}`)
        return queue
      })).pipe(
        Effect.tapCause((cause) => Scope.close(scope, Exit.failCause(cause)))
      )
    })
  )

const sendCancelRequest = (config: ResolvedConfig, session: Session): Effect.Effect<void> =>
  Effect.callback<void>((resume) => {
    let done = false
    let socket: Duplex
    let timer: ReturnType<typeof setTimeout> | undefined
    const finish = (): void => {
      if (done) return
      done = true
      if (timer !== undefined) clearTimeout(timer)
      socket?.destroy()
      resume(Effect.void)
    }
    const frame = PgProtocol.encodeCancelRequest({ pid: session.processId, secret: session.secretKey })
    // After the frame is written the server processes the request and closes
    // the connection, which lands in the `close` handler.
    const send = (): void => {
      socket.write(frame)
    }
    const begin = (): void => {
      if (config.ssl === false) return send()
      socket.once("data", (chunk: Uint8Array) => {
        if (done) return
        // A TLS session's cancel secret must stay encrypted.
        if (chunk.length === 1 && chunk[0] === 0x4e && config.sslOptional && !session.encrypted) return send()
        if (chunk.length !== 1 || chunk[0] !== 0x53) return finish()
        const raw = socket
        raw.off("error", finish)
        raw.off("close", finish)
        socket = Tls.connect({
          host: config.host,
          servername: Net.isIP(config.host) === 0 ? config.host : undefined,
          ...(typeof config.ssl === "object" ? config.ssl : {}),
          socket: raw as Net.Socket
        })
        socket.on("error", finish)
        socket.on("close", finish)
        socket.once("secureConnect", send)
      })
      socket.write(PgProtocol.encodeSslRequest())
    }
    try {
      socket = config.stream !== undefined
        ? config.stream()
        : config.path !== undefined
        ? Net.connect({ path: config.path })
        : Net.connect({ host: config.host, port: config.port, noDelay: true })
    } catch {
      resume(Effect.void)
      return
    }
    timer = setTimeout(finish, cancelRequestTimeoutMillis)
    socket.on("error", finish)
    socket.on("close", finish)
    if (config.stream !== undefined) begin()
    else socket.once("connect", begin)
    return Effect.sync(finish)
  })

const connect = (config: ResolvedConfig, resolvedPassword: string | undefined): Effect.Effect<Session, SqlError> =>
  Effect.callback<Session, SqlError>((resume) => {
    let done = false
    let socket: Duplex
    let encrypted = false
    let parser: PgProtocol.Parser<unknown> | undefined
    let sslErrorParser: PgProtocol.Parser | undefined
    let scram: PgAuth.ScramState | undefined
    let processId = 0
    let secretKey = 0

    const fail = (reason: SqlErrorReason): void => {
      if (done) return
      done = true
      socket?.destroy()
      resume(Effect.fail(new SqlError({ reason })))
    }
    const failConnect = (cause: unknown, message: string): void =>
      fail(new ConnectionError({ cause, message, operation: "connect" }))
    const failAuth = (cause: unknown, message: string): void =>
      fail(new AuthenticationError({ cause, message, operation: "connect" }))

    const onError = (cause: Error) => failConnect(cause, "PgConnection: Failed to connect")
    const onClose = () =>
      failConnect(new Error("Connection closed unexpectedly"), "PgConnection: Connection closed during startup")

    const password = (): string | undefined => {
      if (resolvedPassword === undefined) {
        failAuth(
          new Error("The server requested password authentication"),
          "PgConnection: No password configured"
        )
        return undefined
      }
      return resolvedPassword
    }

    const handleMessage = (message: PgProtocol.BackendMessage<unknown>): void => {
      switch (message._tag) {
        case "AuthenticationOk":
        case "NoticeResponse":
        case "NegotiateProtocolVersion":
        case "ParameterStatus":
          return
        case "AuthenticationCleartextPassword": {
          const secret = password()
          if (secret === undefined) return
          socket.write(PgProtocol.encodePasswordMessage({ password: secret }))
          return
        }
        case "AuthenticationMD5Password": {
          const secret = password()
          if (secret === undefined) return
          const hashed = PgAuth.md5Password({ user: config.username, password: secret, salt: message.salt })
          if (EffectResult.isFailure(hashed)) {
            return failAuth(hashed.failure, "PgConnection: MD5 authentication failed")
          }
          socket.write(PgProtocol.encodePasswordMessage({ password: hashed.success }))
          return
        }
        case "AuthenticationSASL": {
          if (!message.mechanisms.includes(PgAuth.SCRAM_SHA_256)) {
            return failAuth(
              new Error(`Unsupported SASL mechanisms: ${message.mechanisms.join(", ")}`),
              `PgConnection: Only ${PgAuth.SCRAM_SHA_256} is supported`
            )
          }
          const secret = password()
          if (secret === undefined) return
          const init = PgAuth.scramInit({ password: secret, nonce: randomBytes(18).toString("base64") })
          if (EffectResult.isFailure(init)) {
            return failAuth(init.failure, "PgConnection: SCRAM authentication failed")
          }
          scram = init.success.state
          socket.write(PgProtocol.encodeSASLInitialResponse({
            mechanism: PgAuth.SCRAM_SHA_256,
            initialResponse: init.success.response
          }))
          return
        }
        case "AuthenticationSASLContinue": {
          if (scram === undefined || scram._tag !== "ScramFirst") {
            return failConnect(new Error("Unexpected AuthenticationSASLContinue"), "PgConnection: Protocol desync")
          }
          const next = PgAuth.scramContinue(scram, message.data)
          if (EffectResult.isFailure(next)) {
            return failAuth(next.failure, "PgConnection: SCRAM authentication failed")
          }
          scram = next.success.state
          socket.write(PgProtocol.encodeSASLResponse({ data: next.success.response }))
          return
        }
        case "AuthenticationSASLFinal": {
          if (scram === undefined || scram._tag !== "ScramFinal") {
            return failConnect(new Error("Unexpected AuthenticationSASLFinal"), "PgConnection: Protocol desync")
          }
          const verified = PgAuth.scramFinish(scram, message.data)
          if (EffectResult.isFailure(verified)) {
            return failAuth(verified.failure, "PgConnection: SCRAM server verification failed")
          }
          scram = undefined
          return
        }
        case "AuthenticationUnsupported":
          return failAuth(
            new Error(`Authentication method ${message.method} is not supported`),
            "PgConnection: Unsupported authentication method"
          )
        case "BackendKeyData":
          processId = message.pid
          secretKey = message.secret
          return
        case "ErrorResponse":
          return fail(classifyFields(message.fields, "PgConnection: Failed to connect", "connect"))
        case "ReadyForQuery":
          if (scram !== undefined) {
            return failAuth(
              new Error("The server completed authentication without proving its identity"),
              "PgConnection: SCRAM exchange did not complete"
            )
          }
          done = true
          socket.off("data", onData)
          socket.off("error", onError)
          socket.off("close", onClose)
          socket.on("error", ignoreError)
          resume(Effect.succeed({ socket, encrypted, parser: parser!, processId, secretKey }))
          return
        default:
          return failConnect(
            new Error(`Unexpected ${message._tag} message during startup`),
            "PgConnection: Protocol desync"
          )
      }
    }

    const onData = (chunk: Uint8Array): void => {
      let messages: ReadonlyArray<PgProtocol.BackendMessage<unknown>>
      try {
        messages = parser!.push(chunk)
      } catch (cause) {
        return failConnect(cause, "PgConnection: Failed to parse server response")
      }
      for (const message of messages) {
        if (done) return
        handleMessage(message)
      }
    }

    const startup = (): void => {
      parser = PgProtocol.makeParser<unknown>({ maxMessageSize: config.maxMessageSize })
      socket.on("data", onData)
      socket.write(PgProtocol.encodeStartupMessage(config.startupParameters))
    }

    const onSslResponse = (chunk: Uint8Array): void => {
      if (done) return
      if (sslErrorParser !== undefined || chunk[0] === 0x45) {
        sslErrorParser ??= PgProtocol.makeParser({ maxMessageSize: config.maxMessageSize })
        let messages: ReadonlyArray<PgProtocol.BackendMessage>
        try {
          messages = sslErrorParser.push(chunk)
        } catch (cause) {
          return failConnect(cause, "PgConnection: Failed to parse SSLRequest error response")
        }
        if (messages.length === 0) return
        socket.off("data", onSslResponse)
        const message = messages[0]
        if (messages.length !== 1 || message._tag !== "ErrorResponse") {
          return failConnect(
            new Error("Expected one ErrorResponse after SSLRequest"),
            "PgConnection: Invalid SSLRequest response"
          )
        }
        return fail(classifyFields(message.fields, "PgConnection: Failed to negotiate TLS", "connect"))
      }
      socket.off("data", onSslResponse)
      if (chunk.length !== 1) {
        return failConnect(
          new Error(`Received ${chunk.length} bytes in response to SSLRequest`),
          "PgConnection: Invalid SSLRequest response"
        )
      }
      const response = PgProtocol.decodeSslResponse(chunk[0])
      if (EffectResult.isFailure(response)) {
        return failConnect(response.failure, "PgConnection: Invalid SSLRequest response")
      }
      if (response.success === "N") {
        if (config.sslOptional) return startup()
        return failConnect(new Error("The server does not support TLS"), "PgConnection: Server refused TLS")
      }
      const raw = socket
      raw.off("error", onError)
      raw.off("close", onClose)
      socket = Tls.connect({
        host: config.host,
        servername: Net.isIP(config.host) === 0 ? config.host : undefined,
        ...(typeof config.ssl === "object" ? config.ssl : {}),
        socket: raw as Net.Socket
      })
      socket.on("error", onError)
      socket.on("close", onClose)
      socket.once("secureConnect", () => {
        encrypted = true
        startup()
      })
    }

    const begin = (): void => {
      if (config.ssl === false) return startup()
      socket.on("data", onSslResponse)
      socket.write(PgProtocol.encodeSslRequest())
    }

    try {
      socket = config.stream !== undefined
        ? config.stream()
        : config.path !== undefined
        ? Net.connect({ path: config.path })
        // A statement is one write and then a wait for its answer, so Nagle has
        // nothing to coalesce and only holds the write back.
        : Net.connect({ host: config.host, port: config.port, noDelay: true })
    } catch (cause) {
      resume(Effect.fail(
        new SqlError({
          reason: new ConnectionError({ cause, message: "PgConnection: Failed to connect", operation: "connect" })
        })
      ))
      return
    }
    socket.on("error", onError)
    socket.on("close", onClose)
    if (config.stream !== undefined) {
      begin()
    } else {
      socket.once("connect", begin)
    }

    return Effect.sync(() => {
      if (done) return
      done = true
      socket.destroy()
    })
  })

const ignoreError = (_: Error) => {}

interface ResolvedConfig {
  readonly host: string
  readonly port: number
  readonly path: string | undefined
  readonly ssl: boolean | ConnectionOptions
  readonly sslOptional: boolean
  readonly username: string
  readonly password: Redacted.Redacted | Effect.Effect<Redacted.Redacted> | undefined
  readonly connectTimeout: Duration.Duration
  readonly startupParameters: PgProtocol.StartupParameters
  readonly stream: (() => Duplex) | undefined
  readonly maxMessageSize: number | undefined
}

const configError = (message: string, cause?: unknown): SqlError =>
  new SqlError({
    reason: new ConnectionError({
      cause: cause ?? new Error(message),
      message: `PgConnection: ${message}`,
      operation: "connect"
    })
  })

const resolveConfig = (options: Config): Effect.Effect<ResolvedConfig, SqlError> =>
  Effect.suspend(() => {
    const parsed: EffectResult.Result<UrlConfig, SqlError> = options.url !== undefined
      ? parseUrl(Redacted.value(options.url))
      : EffectResult.succeed({})
    if (EffectResult.isFailure(parsed)) return Effect.fail(parsed.failure)
    const url = parsed.success
    const host = options.host ?? url.host ?? "localhost"
    const port = options.port ?? url.port ?? 5432
    const username = options.username ?? url.username ?? process.env.USER ?? process.env.USERNAME
    if (username === undefined) {
      return Effect.fail(configError("No username configured"))
    }
    const named: Record<string, string> = Object.create(null)
    for (const [name, value] of Object.entries(options.startupParameters ?? {})) {
      const key = name.toLowerCase()
      if (key === "user" || key === "database" || key === "replication" || key === "options") {
        return Effect.fail(configError(`Reserved startup parameter: "${name}"`))
      }
      if (key === "client_encoding") {
        const encoding = value.toUpperCase()
        if (encoding !== "UTF8" && encoding !== "UTF-8") {
          return Effect.fail(configError("Startup parameter client_encoding must be UTF8 or UTF-8"))
        }
        named[key] = "UTF8"
      } else {
        named[key] = value
      }
      if (name === "" || name.includes("\0") || value.includes("\0")) {
        return Effect.fail(
          configError("Startup parameter names must be nonempty and names/values must not contain NUL")
        )
      }
    }
    const startupParameters: PgProtocol.StartupParameters = {
      ...named,
      user: username,
      database: options.database ?? url.database,
      application_name: options.applicationName ?? named.application_name ?? url.applicationName ?? "@effect/sql-pg",
      options: options.startupOptions ?? url.options
    }
    for (const [name, value] of Object.entries(startupParameters)) {
      if (value?.includes("\0")) {
        return Effect.fail(configError(`Startup parameter "${name}" must not contain NUL`))
      }
    }
    return Effect.succeed<ResolvedConfig>({
      host,
      port,
      path: options.path ?? (host.startsWith("/") ? `${host}/.s.PGSQL.${port}` : undefined),
      ssl: options.ssl ?? (url.ssl === "prefer" ? true : url.ssl ?? false),
      sslOptional: options.ssl === undefined && url.ssl === "prefer",
      username,
      password: options.password ?? (url.password !== undefined ? Redacted.make(url.password) : undefined),
      connectTimeout: Duration.fromInputUnsafe(options.connectTimeout ?? url.connectTimeout ?? Duration.seconds(5)),
      startupParameters,
      stream: options.stream,
      maxMessageSize: options.maxMessageSize
    })
  })

interface UrlConfig {
  host?: string | undefined
  port?: number | undefined
  database?: string | undefined
  username?: string | undefined
  password?: string | undefined
  applicationName?: string | undefined
  options?: string | undefined
  connectTimeout?: Duration.Duration | undefined
  ssl?: boolean | "prefer" | undefined
}

const decodeComponent = (value: string, what: string): EffectResult.Result<string, SqlError> => {
  try {
    return EffectResult.succeed(decodeURIComponent(value))
  } catch {
    return EffectResult.fail(configError(`Invalid percent-encoding in URL ${what}`))
  }
}

const parsePort = (value: string, what: string): EffectResult.Result<number, SqlError> => {
  const port = Number(value)
  return !Number.isInteger(port) || port < 1 || port > 65535
    ? EffectResult.fail(configError(`Invalid port in URL ${what}: "${value}"`))
    : EffectResult.succeed(port)
}

const parseUrl = (raw: string): EffectResult.Result<UrlConfig, SqlError> => {
  let url: URL
  try {
    url = new URL(raw)
  } catch (cause) {
    return EffectResult.fail(configError("Invalid connection URL", cause))
  }
  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
    return EffectResult.fail(configError(`Unsupported connection URL protocol: "${url.protocol}"`))
  }

  const config: UrlConfig = {}
  if (url.hostname !== "") {
    if (url.hostname.startsWith("[") && url.hostname.endsWith("]")) {
      config.host = url.hostname.slice(1, -1)
    } else {
      const host = decodeComponent(url.hostname, "host")
      if (EffectResult.isFailure(host)) return EffectResult.fail(host.failure)
      config.host = host.success
    }
  }
  if (url.port !== "") {
    const port = parsePort(url.port, "authority")
    if (EffectResult.isFailure(port)) return EffectResult.fail(port.failure)
    config.port = port.success
  }
  if (url.username !== "") {
    const username = decodeComponent(url.username, "username")
    if (EffectResult.isFailure(username)) return EffectResult.fail(username.failure)
    config.username = username.success
  }
  if (url.password !== "") {
    const password = decodeComponent(url.password, "password")
    if (EffectResult.isFailure(password)) return EffectResult.fail(password.failure)
    config.password = password.success
  }
  const database = decodeComponent(url.pathname.replace(/^\//, ""), "database")
  if (EffectResult.isFailure(database)) return EffectResult.fail(database.failure)
  if (database.success !== "") config.database = database.success

  for (const [key, value] of url.searchParams) {
    switch (key) {
      case "host":
        config.host = value
        break
      case "port": {
        const port = parsePort(value, "port parameter")
        if (EffectResult.isFailure(port)) return EffectResult.fail(port.failure)
        config.port = port.success
        break
      }
      case "user":
        config.username = value
        break
      case "password":
        config.password = value
        break
      case "dbname":
        config.database = value
        break
      case "application_name":
        config.applicationName = value
        break
      case "options":
        config.options = value
        break
      case "connect_timeout": {
        const seconds = Number(value)
        if (!Number.isInteger(seconds) || seconds < 0) {
          return EffectResult.fail(configError(`Invalid connect_timeout in URL: "${value}"`))
        }
        config.connectTimeout = seconds === 0 ? Duration.infinity : Duration.seconds(seconds)
        break
      }
      case "sslmode":
        switch (value) {
          case "disable":
            config.ssl = false
            break
          case "require":
          case "verify-ca":
          case "verify-full":
            config.ssl = true
            break
          case "prefer":
          case "allow":
            config.ssl = "prefer"
            break
          default:
            return EffectResult.fail(configError(`Unrecognized sslmode in URL: "${value}"`))
        }
        break
        // Unknown query parameters are ignored, matching libpq.
    }
  }
  return EffectResult.succeed(config)
}

const classifyFields = (
  fields: PgProtocol.ErrorFields,
  message: string,
  operation: string
): SqlErrorReason => {
  const cause = Object.assign(new Error(fields.message ?? "Unknown PostgreSQL error"), fields)
  return classifySqlState(fields.code, fields.constraint, { cause, message, operation })
}
