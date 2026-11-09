/**
 * Main SQL client service for tagged-template queries.
 *
 * `SqlClient` combines the tagged-template statement constructor with
 * connection acquisition, dialect compilation, transactions, row transforms,
 * tracing, and reactive query helpers. Driver integrations build this service
 * from their connection and compiler pieces.
 *
 * @stability unstable
 * @since 4.0.0
 */
import * as Cause from "../Cause.ts"
import { Clock } from "../Clock.ts"
import * as Context from "../Context.ts"
import * as Effect from "../Effect.ts"
import * as Exit from "../Exit.ts"
import { identity } from "../Function.ts"
import { CurrentTransactionService } from "../internal/sql.ts"
import * as Option from "../Option.ts"
import { hasProperty } from "../Predicate.ts"
import type * as Queue from "../Queue.ts"
import { type KeysInput, Reactivity } from "../reactivity/Reactivity.ts"
import type { ReadonlyRecord } from "../Record.ts"
import * as Scope from "../Scope.ts"
import * as Semaphore from "../Semaphore.ts"
import * as Stream from "../Stream.ts"
import * as Tracer from "../Tracer.ts"
import type { NoInfer } from "../Types.ts"
import type * as Connection from "./SqlConnection.ts"
import { ConnectionError, SqlError } from "./SqlError.ts"
import type { Compiler, Constructor } from "./Statement.ts"
import * as Statement from "./Statement.ts"

const TypeId = "~effect/sql/SqlClient"

/**
 * SQL client service interface, combining the statement constructor API with
 * connection reservation, transaction handling, and reactive query helpers.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface SqlClient extends Constructor {
  readonly [TypeId]: typeof TypeId

  /**
   * Copy of the client for safeql etc.
   */
  readonly safe: this

  /**
   * Copy of the client without transformations.
   */
  readonly withoutTransforms: () => this

  readonly reserve: Effect.Effect<Connection.Connection, SqlError, Scope.Scope>

  /**
   * Identifies the driver that created this client.
   *
   * **Details**
   *
   * Effect drivers use their package name without the `@effect/sql-` prefix,
   * such as `"pg"`, `"pglite"` or `"sqlite-node"`. Unlike the compiler
   * dialect, it distinguishes drivers that share a SQL dialect but manage
   * connections differently.
   */
  readonly driver: string

  /**
   * With the given effect, ensure all sql queries are run in a transaction.
   *
   * **Details**
   *
   * Inside the transaction, `Reactivity.invalidate` and `Reactivity.mutation`
   * invalidate once the outermost transaction commits, and not at all if it
   * rolls back.
   *
   * To start a top-level transaction with a statement other than the
   * client's, such as one that sets its isolation level, provide
   * `BeginTransaction`.
   *
   * To retry serialization failures or deadlocks, wrap the outermost
   * `withTransaction` in `Effect.retry`. Each attempt starts a fresh
   * transaction and re-runs the whole effect, including `COMMIT`.
   *
   * **Gotchas**
   *
   * Deferred invalidations run individually after the commit and don't join an
   * enclosing `Reactivity.withBatch`. Only the `Reactivity` service read from
   * the transaction's context defers, and a fiber that outlives the
   * transaction can't defer through it, as with `afterCommit`. Transactions
   * that don't go through `makeWithTransaction` invalidate immediately.
   *
   * Retrying a nested transaction only retries its savepoint, which can't
   * recover an outer transaction the database has aborted. Since a retried
   * effect runs more than once, keep non-transactional side effects in
   * `afterCommit`, which discards the callbacks of a failed attempt but
   * doesn't guarantee they run exactly once. Don't retry `ConnectionError`: a
   * `COMMIT` that lost its connection may have committed, and retrying would
   * apply its writes twice.
   *
   * **Example** (Retrying serialization failures and deadlocks)
   *
   * ```ts
   * import { Effect, Schedule } from "effect"
   * import { SqlClient } from "effect/sql"
   *
   * const program = Effect.gen(function*() {
   *   const sql = yield* SqlClient.SqlClient
   *   return yield* sql.withTransaction(
   *     sql`UPDATE accounts SET balance = balance - 10 WHERE id = 1`
   *   ).pipe(
   *     Effect.provideService(SqlClient.BeginTransaction, "BEGIN ISOLATION LEVEL SERIALIZABLE"),
   *     Effect.retry({
   *       while: (error) => error.reason._tag === "SerializationError" || error.reason._tag === "DeadlockError",
   *       times: 5,
   *       schedule: Schedule.exponential("10 millis").pipe(Schedule.jittered)
   *     })
   *   )
   * })
   * ```
   */
  readonly withTransaction: <R, E, A>(
    self: Effect.Effect<A, E, R>
  ) => Effect.Effect<A, E | SqlError, R>

  /**
   * The transaction service for this client.
   */
  readonly transactionService: Context.Service<TransactionConnection, TransactionConnection.Service>

  /**
   * Runs `effect` once the outermost transaction of this client commits, or
   * immediately, and interruptibly, when no transaction is open.
   *
   * **When to use**
   *
   * Use to signal committed changes, such as waking workers, invalidating
   * caches or notifying subscribers.
   *
   * **Details**
   *
   * Callbacks are discarded if the transaction rolls back or its `COMMIT`
   * fails, and callbacks registered in a savepoint that rolls back are
   * discarded even if the outer transaction commits. After a successful
   * `COMMIT`, callbacks run once releasing the connection has been attempted,
   * before `withTransaction` returns.
   *
   * A callback runs with the services that were in scope when it was
   * registered, minus this client's transaction, so a callback that queries
   * uses a new connection. A callback that dies is logged at
   * `References.UnhandledLogLevel` and the rest still run.
   *
   * Callbacks run in registration order within a transaction or savepoint,
   * and a committed savepoint's callbacks follow those already registered in
   * the enclosing level. Callbacks registered concurrently from several
   * fibers are not guaranteed to run in registration order.
   *
   * **Gotchas**
   *
   * Callbacks are lost if the process exits before they run or the outcome of
   * `COMMIT` is unknown, so work that must happen belongs in a table written
   * in the same transaction. After `COMMIT`, callbacks run uninterruptibly,
   * even if the fiber was interrupted or releasing the connection failed, and
   * `withTransaction` waits for them, so keep them short and fork
   * long-running work.
   * Registering after the transaction has ended is a defect.
   *
   * Transactions that don't go through `makeWithTransaction` run callbacks
   * immediately.
   */
  readonly afterCommit: <R>(effect: Effect.Effect<void, never, R>) => Effect.Effect<void, never, R>

  /**
   * Use the Reactivity service to create a reactive query.
   */
  readonly reactive: <A, E, R>(
    keys: KeysInput,
    effect: Effect.Effect<A, E, R>
  ) => Stream.Stream<A, E, R>

  /**
   * Use the Reactivity service to create a reactive
   * query.
   */
  readonly reactiveMailbox: <A, E, R>(
    keys: KeysInput,
    effect: Effect.Effect<A, E, R>
  ) => Effect.Effect<Queue.Dequeue<A, E>, never, R | Scope.Scope>
}

/**
 * Service tag for the active SQL client service.
 *
 * **When to use**
 *
 * Use to access or provide the SQL client used to build statements, stream
 * rows, reserve connections, and run transactions.
 *
 * @stability unstable
 * @category services
 * @since 4.0.0
 */
export const SqlClient = Context.Service<SqlClient>("effect/sql/SqlClient")

/**
 * Namespace containing types associated with the `SqlClient` service.
 *
 * @stability unstable
 * @since 4.0.0
 */
export declare namespace SqlClient {
  /**
   * Options used to construct a `SqlClient`, including connection acquirers,
   * the SQL compiler, transaction SQL, row transformation, tracing attributes,
   * and optional reactive query integration.
   *
   * @stability unstable
   * @category options
   * @since 4.0.0
   */
  export interface MakeOptions {
    readonly acquirer: Connection.Acquirer
    /**
     * Lends a connection for one statement instead of leasing one into a
     * scope. A client that can do this saves the scope and finalizer per
     * statement; `stream`, transactions, and `reserve` keep the `acquirer`,
     * whose lease outlives the effect that starts it.
     */
    readonly borrower?: Connection.Borrower | undefined
    readonly compiler: Compiler
    readonly transactionAcquirer?: Connection.Acquirer
    /**
     * Identifies the driver creating the client, exposed as `SqlClient.driver`.
     */
    readonly driver: string
    readonly spanAttributes: ReadonlyArray<readonly [string, unknown]>
    readonly transactionService?: Context.Service<TransactionConnection, TransactionConnection.Service>
    /**
     * Whether the transaction control statements - `BEGIN`, `COMMIT` and
     * `SAVEPOINT` - can be prepared like any other statement.
     *
     * **Details**
     *
     * They run on every transaction and never change, so a database that can
     * prepare them stops parsing them again each time. Off by default,
     * because several databases refuse to prepare transaction control at all;
     * a driver has to say that its own does not.
     *
     * Rollbacks and savepoint releases always run unprepared, so a prepared
     * statement the backend has dropped cannot stop cleanup.
     */
    readonly prepareTransactionControls?: boolean | undefined
    readonly beginTransaction?: string | undefined
    readonly rollback?: string | undefined
    /** Commit SQL, or an effect that commits on the connection and checks the result. */
    readonly commit?: string | ((conn: Connection.Connection) => Effect.Effect<void, SqlError>) | undefined
    /** Cleanup on the same connection when COMMIT fails. Omit when the driver already ends the transaction. */
    readonly onCommitFailure?: ((conn: Connection.Connection) => Effect.Effect<void, SqlError>) | undefined
    /**
     * Reports whether a transaction is open. If false, rollback and savepoint
     * cleanup are skipped.
     */
    readonly isTransaction?: ((conn: Connection.Connection) => boolean) | undefined
    readonly savepoint?: ((name: string) => string) | undefined
    /**
     * SQL to release a nested savepoint after success or a successful rollback.
     * Omit to leave savepoints unreleased, including for dialects such as MSSQL
     * that do not support releasing savepoints.
     */
    readonly releaseSavepoint?: ((name: string) => string) | undefined
    readonly rollbackSavepoint?: ((name: string) => string) | undefined
    readonly transformRows?: (<A extends object>(row: ReadonlyArray<A>) => ReadonlyArray<A>) | undefined
    readonly reactiveQueue?: <A, E, R>(
      keys: ReadonlyArray<unknown> | ReadonlyRecord<string, ReadonlyArray<unknown>>,
      effect: Effect.Effect<A, E, R>
    ) => Effect.Effect<Queue.Dequeue<A, E>, never, R | Scope.Scope>
  }
}

let clientIdCounter = 0
let transactionSemaphoreIdCounter = 0

/**
 * Constructs a `SqlClient` from connection acquirers, a compiler, transaction
 * commands, tracing attributes, optional row transforms, and reactive query
 * integration.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const make = Effect.fnUntraced(function*(options: SqlClient.MakeOptions) {
  const transactionService = options.transactionService ?? TransactionConnection(clientIdCounter++)
  const getConnection = Effect.flatMap(
    Effect.serviceOption(transactionService),
    Option.match({
      onNone: () => options.acquirer,
      onSome: ([conn]) => Effect.succeed(conn)
    })
  )

  const beginTransaction = options.beginTransaction ?? "BEGIN"
  const commit = options.commit ?? "COMMIT"
  const savepoint = options.savepoint ?? ((name: string) => `SAVEPOINT ${name}`)
  const releaseSavepoint = options.releaseSavepoint
  const rollback = options.rollback ?? "ROLLBACK"
  const rollbackSavepoint = options.rollbackSavepoint ?? ((name: string) => `ROLLBACK TO SAVEPOINT ${name}`)
  const transactionAcquirer = options.transactionAcquirer ?? options.acquirer
  const unprepared = (conn: Connection.Connection, sql: string) => conn.executeUnprepared(sql, [], undefined)
  const control = options.prepareTransactionControls === true
    ? (conn: Connection.Connection, sql: string) => conn.execute(sql, [], undefined)
    : unprepared
  const isTransaction = options.isTransaction
  const cleanup = isTransaction
    ? (conn: Connection.Connection, sql: string) => isTransaction(conn) ? unprepared(conn, sql) : Effect.void
    : unprepared
  const withTransaction = makeWithTransaction({
    transactionService,
    spanAttributes: options.spanAttributes,
    acquireConnection: (restore) => restore(transactionAcquirer!),
    // Unlike the client's own, a provided statement isn't fixed, so it isn't prepared.
    begin: (conn, statement) => statement === undefined ? control(conn, beginTransaction) : unprepared(conn, statement),
    savepoint: (conn, id) => control(conn, savepoint(`effect_sql_${id}`)),
    releaseSavepoint: releaseSavepoint
      ? (conn, id) => cleanup(conn, releaseSavepoint(`effect_sql_${id}`))
      : undefined,
    commit: typeof commit === "string" ? (conn) => control(conn, commit) : commit,
    onCommitFailure: options.onCommitFailure,
    rollback: (conn) => cleanup(conn, rollback),
    rollbackSavepoint: (conn, id) => cleanup(conn, rollbackSavepoint(`effect_sql_${id}`))
  })

  const afterCommit = makeAfterCommit(transactionService)

  const reactivity = yield* Reactivity
  // A statement inside a transaction has to run on that transaction's
  // connection, so borrowing is only for statements that reach the pool.
  const borrower: Connection.Borrower | undefined = options.borrower === undefined ? undefined : (f) =>
    Effect.flatMap(
      Effect.serviceOption(transactionService),
      Option.match({
        onNone: () => options.borrower!(f),
        onSome: ([conn]) => f(conn)
      })
    )

  const client: SqlClient = Object.assign(
    Statement.make(getConnection, options.compiler, options.spanAttributes, options.transformRows, borrower),
    {
      [TypeId]: TypeId as typeof TypeId,
      safe: undefined as any,
      withTransaction,
      transactionService,
      afterCommit,
      reserve: transactionAcquirer,
      driver: options.driver,
      withoutTransforms(): any {
        if (options.transformRows === undefined) {
          return this
        }
        const statement = Statement.make(
          getConnection,
          options.compiler.withoutTransform,
          options.spanAttributes,
          undefined,
          borrower
        )
        const client = Object.assign(statement, {
          ...this,
          ...statement
        })
        ;(client as any).safe = client
        ;(client as any).withoutTransforms = () => client
        return client
      },
      reactive: options.reactiveQueue ?
        <A, E, R>(
          keys: ReadonlyArray<unknown> | ReadonlyRecord<string, ReadonlyArray<unknown>>,
          effect: Effect.Effect<A, E, R>
        ) =>
          options.reactiveQueue!(keys, effect).pipe(
            Effect.map(Stream.fromQueue),
            Stream.unwrap
          ) :
        reactivity.stream,
      reactiveMailbox: options.reactiveQueue ?? reactivity.query
    }
  )
  ;(client as any).safe = client

  return client
})

/**
 * Builds the acquirers, borrower and failed-COMMIT cleanup for a SQLite client that
 * shares one connection through a semaphore.
 *
 * **Details**
 *
 * Both acquirers lease the connection into the current scope and hold the
 * semaphore until that scope closes. The borrower holds the same semaphore
 * until the statement finishes without creating a scope. Another fiber cannot
 * begin a transaction underneath either. Effects that use the connection directly,
 * such as an export, have to run inside `Effect.scoped`.
 *
 * SQLite can keep a transaction open after COMMIT fails, for example on a
 * deferred foreign key violation. `onCommitFailure` rolls it back before the
 * connection is reused. If that ROLLBACK fails, the connection is rejected, and
 * each acquisition or borrow retries the ROLLBACK once while holding the semaphore
 * until it succeeds. The database is never reopened, and transactions started with a
 * plain `BEGIN` are only touched after a failed cleanup.
 *
 * Pass `isTransaction` when the driver can report whether a transaction is
 * open. Without it, ROLLBACK always runs and SQLite's "no transaction is
 * active" error counts as clean.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const makeSqliteAcquirers = <C extends Connection.Connection>(options: {
  readonly connection: Effect.Effect<C, SqlError>
  readonly semaphore: Semaphore.Semaphore
  readonly isTransaction?: ((conn: C) => boolean) | undefined
}): {
  readonly acquirer: Effect.Effect<C, SqlError, Scope.Scope>
  readonly borrower: Connection.Borrower
  readonly transactionAcquirer: Effect.Effect<C, SqlError, Scope.Scope>
  readonly onCommitFailure: (conn: Connection.Connection) => Effect.Effect<void, SqlError>
  readonly isTransaction: ((conn: Connection.Connection) => boolean) | undefined
} => {
  const { isTransaction, semaphore } = options
  let poisoned: SqlError | undefined
  const poison = (cause: Cause.Cause<SqlError>) =>
    poisoned = new SqlError({
      reason: new ConnectionError({
        message: "SQLite connection cannot be reused after failed COMMIT cleanup",
        operation: "rollback",
        cause
      })
    })

  const rollback = (conn: C): Effect.Effect<void, SqlError> => {
    if (isTransaction) {
      return isTransaction(conn) ? Effect.asVoid(conn.executeUnprepared("ROLLBACK", [], undefined)) : Effect.void
    }
    return conn.executeUnprepared("ROLLBACK", [], undefined).pipe(
      Effect.asVoid,
      Effect.catchIf(isNoTransactionError, () => Effect.void)
    )
  }

  const available = Effect.flatMap(options.connection, (conn) => {
    if (poisoned === undefined) return Effect.succeed(conn)
    return Effect.matchCauseEffect(rollback(conn), {
      onFailure: (cause) => Effect.fail(poison(cause)),
      onSuccess: () => {
        poisoned = undefined
        return Effect.succeed(conn)
      }
    })
  })

  const lease = Effect.uninterruptibleMask((restore) => Effect.andThen(restore(semaphore.takeScoped(1)), available))

  return {
    acquirer: lease,
    borrower: (f) => semaphore.withPermit(Effect.flatMap(available, f)),
    transactionAcquirer: lease,
    onCommitFailure: (conn) => Effect.tapCause(rollback(conn as C), (cause) => Effect.sync(() => poison(cause))),
    isTransaction: isTransaction && ((conn) => isTransaction(conn as C))
  }
}

const isNoTransactionError = (error: SqlError): boolean => {
  const cause = error.reason.cause
  const message = typeof cause === "string"
    ? cause
    : hasProperty(cause, "message") && typeof cause.message === "string"
    ? cause.message
    : ""
  return /no transaction is active/i.test(message)
}

/**
 * A failed COMMIT cleanup leaves the connection in an unsafe state, so both the
 * COMMIT error and the cleanup error are promoted to defects: typed recovery
 * must not be able to hide them.
 */
const failuresToDefects = <E>(cause: Cause.Cause<E>): Cause.Cause<never> =>
  Cause.fromReasons(cause.reasons.map((reason) =>
    Cause.isFailReason(reason)
      ? Cause.makeDieReason(reason.error).annotate(Cause.reasonAnnotations(reason))
      : reason
  ))

/**
 * Callbacks registered with `afterCommit` in one transaction level. A
 * committed savepoint hands its callbacks to its parent, and the outermost
 * level runs them after it commits.
 */
interface AfterCommitBuffer {
  readonly callbacks: Array<Effect.Effect<void>>
  readonly parent: AfterCommitBuffer | undefined
  open: boolean
}

/**
 * Keyed by the transaction service value of each level, so removing the
 * transaction service also hides its buffer, and a transaction that
 * `makeWithTransaction` didn't start has none.
 */
const afterCommitBuffers = new WeakMap<object, AfterCommitBuffer>()

const runAfterCommit = <R>(effect: Effect.Effect<void, never, R>): Effect.Effect<void, never, R> =>
  Effect.ignoreCause(effect, { log: "Unhandled", message: "Unhandled error in SqlClient.afterCommit callback" })

const makeAfterCommit =
  (transactionService: Context.Key<any, any>) =>
  <R>(effect: Effect.Effect<void, never, R>): Effect.Effect<void, never, R> =>
    Effect.withFiber((fiber) => {
      const transaction = Context.getOrUndefined(fiber.context, transactionService)
      const buffer = transaction && afterCommitBuffers.get(transaction)
      // Outside a transaction, or in one that doesn't buffer callbacks.
      if (buffer === undefined) {
        return runAfterCommit(effect)
      }
      for (let current: AfterCommitBuffer | undefined = buffer; current !== undefined; current = current.parent) {
        if (!current.open) {
          return Effect.die(new Error("SqlClient.afterCommit: the transaction has already ended"))
        }
      }
      // Runs later with the services in scope now, without the transaction.
      buffer.callbacks.push(
        Effect.provideContext(effect, Context.omit(transactionService)(fiber.context) as Context.Context<R>)
      )
      return Effect.void
    })

/**
 * Builds a transaction wrapper that begins top-level transactions, uses
 * savepoints for nested transactions, commits on success, and rolls back on
 * failure or interruption. Releases nested savepoints when `releaseSavepoint`
 * is provided.
 *
 * **Details**
 *
 * Transactions started this way are also recognized by `SqlResolver` when the
 * caller's context has no `SqlClient`, so their requests don't share a batch
 * with requests outside the transaction.
 *
 * @stability unstable
 * @category transactions
 * @since 4.0.0
 */
export const makeWithTransaction = <I, S>(options: {
  readonly transactionService: Context.Key<I, readonly [conn: S, counter: number]>
  readonly spanAttributes: ReadonlyArray<readonly [string, unknown]>
  /**
   * Acquires the connection for a top-level transaction. Runs under the
   * transaction's uninterruptible mask; wrap the wait for a connection in
   * `restore` so a queued transaction can be interrupted, and register
   * releases on the provided scope. The scope closes with the transaction, or
   * immediately when acquisition fails or is interrupted.
   */
  readonly acquireConnection: (
    restore: <XA, XE, XR>(effect: Effect.Effect<XA, XE, XR>) => Effect.Effect<XA, XE, XR>
  ) => Effect.Effect<S, SqlError, Scope.Scope>
  /**
   * Starts a top-level transaction. `statement` is the `BeginTransaction`
   * provided to the transaction, if any; a driver that doesn't start
   * transactions with a SQL statement ignores it.
   */
  readonly begin: (conn: NoInfer<S>, statement: string | undefined) => Effect.Effect<void, SqlError>
  readonly savepoint: (conn: NoInfer<S>, id: number) => Effect.Effect<void, SqlError>
  /**
   * Releases a nested savepoint after success or a successful rollback.
   * Omit to leave savepoints unreleased, including for dialects such as MSSQL
   * that do not support releasing savepoints.
   */
  readonly releaseSavepoint?: ((conn: NoInfer<S>, id: number) => Effect.Effect<void, SqlError>) | undefined
  readonly commit: (conn: NoInfer<S>) => Effect.Effect<void, SqlError>
  /** Driver-specific recovery before the connection is released after a failed COMMIT. */
  readonly onCommitFailure?: ((conn: NoInfer<S>) => Effect.Effect<void, SqlError>) | undefined
  readonly rollback: (conn: NoInfer<S>) => Effect.Effect<void, SqlError>
  readonly rollbackSavepoint: (conn: NoInfer<S>, id: number) => Effect.Effect<void, SqlError>
}) => {
  const transactionSemaphore = Context.Service<Semaphore.Semaphore>(
    `effect/sql/SqlClient/TransactionSemaphore/${transactionSemaphoreIdCounter++}`
  )
  const afterCommit = makeAfterCommit(options.transactionService)
  const deferInvalidations = (reactivity: Reactivity): Reactivity => {
    const invalidate = (keys: Parameters<Reactivity["invalidate"]>[0]) =>
      afterCommit(Effect.sync(() => reactivity.invalidateUnsafe(keys)))
    return { ...reactivity, invalidate, mutation: (keys, effect) => Effect.tap(effect, invalidate(keys)) }
  }
  return <R, E, A>(effect: Effect.Effect<A, E, R>): Effect.Effect<A, E | SqlError, R> =>
    Effect.uninterruptibleMask((restore) =>
      Effect.useSpan(
        "sql.transaction",
        { kind: "internal" },
        (span) =>
          Effect.withFiber<A, E | SqlError, R>((fiber) => {
            for (const [key, value] of options.spanAttributes) {
              span.attribute(key, value)
            }
            const services = fiber.context
            const reactivity = Context.getOrUndefined(services, Reactivity)
            const clock = fiber.getRef(Clock)
            const connOption = Context.getOption(services, options.transactionService)
            const conn: Effect.Effect<readonly [Scope.Closeable | undefined, S], SqlError> = connOption._tag === "Some"
              ? Effect.succeed([undefined, connOption.value[0]] as const)
              : Effect.flatMap(Scope.make(), (scope) =>
                Scope.provide(options.acquireConnection(restore), scope).pipe(
                  Effect.map((conn) => [scope, conn] as const),
                  Effect.onError((cause) => Scope.close(scope, Exit.failCause(cause)))
                ))
            const id = connOption._tag === "Some" ? connOption.value[1] + 1 : 0
            const buffer: AfterCommitBuffer = {
              callbacks: [],
              parent: connOption._tag === "Some" ? afterCommitBuffers.get(connOption.value) : undefined,
              open: true
            }
            let committed = false
            const transaction = Effect.flatMap(
              conn,
              (
                [scope, conn]
              ) =>
                (id === 0 ? options.begin(conn, fiber.getRef(BeginTransaction)) : options.savepoint(conn, id)).pipe(
                  Effect.flatMap(() => {
                    const level = [conn, id] as const
                    afterCommitBuffers.set(level, buffer)
                    return Effect.onExitPrimitive(
                      Effect.provideContext(
                        restore(effect),
                        services.pipe(
                          Context.add(options.transactionService, level),
                          Context.add(CurrentTransactionService, options.transactionService),
                          reactivity ? Context.add(Reactivity, deferInvalidations(reactivity)) : identity,
                          Context.add(transactionSemaphore, Semaphore.makeUnsafe(1)),
                          Context.add(Tracer.ParentSpan, span)
                        )
                      ),
                      (exit) => {
                        let effect: Effect.Effect<void, SqlError>
                        if (Exit.isSuccess(exit)) {
                          if (id === 0) {
                            span.event("effect.sql.transaction.commit", clock.currentTimeNanosUnsafe())
                            const onCommitFailure = options.onCommitFailure
                            effect = onCommitFailure
                              ? Effect.catchCause(options.commit(conn), (commitCause) =>
                                Effect.matchCauseEffect(onCommitFailure(conn), {
                                  onFailure: (cleanupCause) =>
                                    Effect.failCause(failuresToDefects(Cause.combine(commitCause, cleanupCause))),
                                  onSuccess: () => Effect.failCause(commitCause)
                                }))
                              : options.commit(conn)
                          } else {
                            span.event("effect.sql.transaction.savepoint", clock.currentTimeNanosUnsafe())
                            effect = Effect.void
                          }
                        } else {
                          span.event("effect.sql.transaction.rollback", clock.currentTimeNanosUnsafe())
                          effect = Effect.orDie(
                            id > 0
                              ? options.rollbackSavepoint(conn, id)
                              : options.rollback(conn)
                          )
                        }
                        if (id > 0 && options.releaseSavepoint) {
                          effect = Effect.andThen(effect, Effect.orDie(options.releaseSavepoint(conn, id)))
                        }
                        return Effect.flatMap(effect, () => {
                          committed = Exit.isSuccess(exit)
                          return exit
                        })
                      },
                      true
                    )
                  }),
                  scope
                    ? (eff) => Effect.onExitPrimitive(eff, (exit) => Scope.close(scope, exit), true)
                    : identity
                )
            )
            // Runs once the connection is released, whether or not that succeeded.
            const settled = Effect.onExitPrimitive(transaction, () => {
              buffer.open = false
              if (!committed || buffer.callbacks.length === 0) {
                return undefined
              }
              if (buffer.parent !== undefined) {
                buffer.parent.callbacks.push(...buffer.callbacks)
                return undefined
              }
              return Effect.forEach(buffer.callbacks, runAfterCommit, { discard: true })
            }, true)
            return id === 0
              ? settled
              : Context.getUnsafe(services, transactionSemaphore).withPermit(settled)
          })
      )
    )
}

/**
 * Phantom identifier for the scoped transaction connection service associated
 * with a SQL client.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface TransactionConnection {
  readonly _: unique symbol
}

/**
 * Namespace containing types associated with transaction connection services.
 *
 * @stability unstable
 * @since 4.0.0
 */
export declare namespace TransactionConnection {
  /**
   * Service payload stored during a transaction, containing the active
   * connection and nested transaction depth.
   *
   * @stability unstable
   * @category services
   * @since 4.0.0
   */
  export type Service = readonly [conn: Connection.Connection, depth: number]
}

/**
 * Creates a unique context service tag for the active transaction connection of
 * a specific SQL client.
 *
 * @stability unstable
 * @category services
 * @since 4.0.0
 */
export const TransactionConnection = (
  clientId: number
): Context.Service<TransactionConnection, TransactionConnection.Service> =>
  Context.Service(`effect/sql/SqlClient/TransactionConnection/${clientId}`)

/**
 * Context reference used by SQL integrations to opt in to safe integer
 * handling; defaults to `false`.
 *
 * @stability unstable
 * @category services
 * @since 4.0.0
 */
export const SafeIntegers = Context.Reference<boolean>("effect/sql/SqlClient/SafeIntegers", {
  defaultValue: () => false
})

/**
 * Context reference holding the statement that starts a top-level
 * transaction in place of the client's `BEGIN`; defaults to `undefined`, which
 * keeps the client's.
 *
 * **When to use**
 *
 * Use when one transaction needs its own isolation level or access mode, as
 * in `BEGIN ISOLATION LEVEL SERIALIZABLE` on PostgreSQL, rather than following
 * the client's `BEGIN` with a `SET TRANSACTION`, which costs another round
 * trip.
 *
 * **Details**
 *
 * The statement runs unprepared. Nested transactions ignore it and keep their
 * savepoints.
 *
 * **Gotchas**
 *
 * It applies to every top-level transaction started while it is provided,
 * including in forked fibers, so provide it around the single
 * `withTransaction` it is meant for. `@effect/sql-libsql`, `@effect/sql-mssql`
 * and `@effect/sql-sqlite-do` don't start transactions with a SQL statement
 * and ignore it. The statement is sent as raw SQL, so never build it from
 * untrusted input.
 *
 * **Example** (Starting a serializable transaction)
 *
 * ```ts
 * import { Effect } from "effect"
 * import { SqlClient } from "effect/sql"
 *
 * const program = Effect.gen(function*() {
 *   const sql = yield* SqlClient.SqlClient
 *   return yield* sql.withTransaction(sql`SELECT 1`).pipe(
 *     Effect.provideService(SqlClient.BeginTransaction, "BEGIN ISOLATION LEVEL SERIALIZABLE")
 *   )
 * })
 * ```
 *
 * @stability unstable
 * @category services
 * @since 4.0.6
 */
export const BeginTransaction = Context.Reference<string | undefined>("effect/sql/SqlClient/BeginTransaction", {
  defaultValue: () => undefined
})
