import { assert, describe, it } from "@effect/vitest"
import { Cause, Context, Deferred, Effect, Exit, Fiber, Logger, Option, type Scope, Semaphore, Stream } from "effect"
import { Reactivity } from "effect/reactivity"
import { SqlClient, SqlError, Statement } from "effect/sql"
import type { SqlConnection } from "effect/sql"

interface StubConnection {
  readonly id: string
}

interface StubTransactionConnection {
  readonly _: unique symbol
}

const sqlError = (message: string) =>
  new SqlError.SqlError({
    reason: new SqlError.UnknownError({ cause: new Error(message), message })
  })

let harnessIdCounter = 0

/**
 * Builds a `makeWithTransaction` wrapper over stub transaction commands, so the
 * transaction control flow can be driven without a database driver.
 *
 * The stubs mirror the driver contract: `rollback` and `rollbackSavepoint` fail
 * when no transaction or savepoint is active, which is what a real database
 * reports when a rollback is issued after a failed `BEGIN`.
 *
 * Savepoint release is opt-in, as it is for drivers: pass `true` to enable it,
 * or a `SqlError` to enable it and have it fail.
 */
const makeHarness = (options: {
  readonly begin?: SqlError.SqlError | undefined
  readonly commit?: (() => Effect.Effect<void, SqlError.SqlError>) | undefined
  readonly onCommitFailure?: (() => Effect.Effect<void, SqlError.SqlError>) | undefined
  readonly savepoint?: SqlError.SqlError | undefined
  readonly rollbackSavepoint?: SqlError.SqlError | undefined
  readonly releaseSavepoint?: true | SqlError.SqlError | undefined
} = {}) => {
  const release = options.releaseSavepoint
  const onCommitFailure = options.onCommitFailure
  const calls: Array<string> = []
  const conn: StubConnection = { id: "stub" }
  const transactionService = Context.Service<
    StubTransactionConnection,
    readonly [conn: StubConnection, counter: number]
  >(`test/SqlClient/TransactionConnection/${harnessIdCounter++}`)

  let transactionActive = false
  const savepoints: Array<number> = []

  const record = (name: string) => Effect.sync(() => calls.push(name))

  const withTransaction = SqlClient.makeWithTransaction({
    transactionService,
    spanAttributes: [],
    acquireConnection: () =>
      Effect.as(
        Effect.flatMap(record("acquireConnection"), () => Effect.addFinalizer(() => record("closeConnection"))),
        conn
      ),
    begin: (_conn, statement) =>
      Effect.flatMap(record(statement === undefined ? "begin" : `begin(${statement})`), () => {
        if (options.begin !== undefined) {
          return Effect.fail(options.begin)
        }
        transactionActive = true
        return Effect.void
      }),
    savepoint: (_conn, id) =>
      Effect.flatMap(record(`savepoint(${id})`), () => {
        if (options.savepoint !== undefined) {
          return Effect.fail(options.savepoint)
        }
        savepoints.push(id)
        return Effect.void
      }),
    commit: () =>
      Effect.flatMap(record("commit"), () =>
        options.commit !== undefined
          ? options.commit()
          : transactionActive
          ? Effect.sync(() => {
            transactionActive = false
          })
          : Effect.fail(sqlError("cannot commit - no transaction is active"))),
    onCommitFailure: onCommitFailure === undefined ?
      undefined :
      () => Effect.andThen(record("onCommitFailure"), onCommitFailure),
    rollback: () =>
      Effect.flatMap(record("rollback"), () =>
        transactionActive
          ? Effect.sync(() => {
            transactionActive = false
          })
          : Effect.fail(sqlError("cannot rollback - no transaction is active"))),
    rollbackSavepoint: (_conn, id) =>
      Effect.flatMap(record(`rollbackSavepoint(${id})`), () => {
        if (options.rollbackSavepoint !== undefined) {
          return Effect.fail(options.rollbackSavepoint)
        }
        return savepoints.includes(id)
          ? Effect.void
          : Effect.fail(sqlError(`cannot rollback to savepoint ${id} - it does not exist`))
      }),
    releaseSavepoint: release === undefined ?
      undefined :
      (_conn, id) =>
        Effect.flatMap(record(`releaseSavepoint(${id})`), () => release === true ? Effect.void : Effect.fail(release))
  })

  return { calls, withTransaction } as const
}

/**
 * Builds a client over a stub connection that records the transaction control
 * statements, as `prepared(sql)` when prepared, the connection release, and
 * `after(name)` for each callback registered with `after`, along with the
 * `Reactivity` service the client uses.
 */
const makeClient = (options: {
  readonly acquire?: Effect.Effect<void, never, Scope.Scope> | undefined
  readonly commit?: Effect.Effect<void, SqlError.SqlError> | undefined
  readonly prepareTransactionControls?: boolean | undefined
  readonly release?: Effect.Effect<void> | undefined
} = {}) => {
  const calls: Array<string> = []
  const record = (call: string) =>
    Effect.sync(() => {
      calls.push(call)
    })
  const execute = (sql: string) => Effect.as(record(sql), [])
  const connection: SqlConnection.Connection = {
    execute: (sql) => execute(`prepared(${sql})`),
    executeRaw: execute,
    executeValues: execute,
    executeUnprepared: execute,
    executeValuesUnprepared: execute,
    executeStream: (sql) => Stream.fromEffect(execute(sql))
  }
  const commit = options.commit
  return SqlClient.make({
    driver: "test",
    acquirer: Effect.as(
      Effect.andThen(
        options.acquire ?? Effect.void,
        Effect.addFinalizer(() => Effect.andThen(record("release"), options.release ?? Effect.void))
      ),
      connection
    ),
    compiler: Statement.makeCompilerSqlite(),
    spanAttributes: [],
    prepareTransactionControls: options.prepareTransactionControls,
    commit: commit === undefined ? undefined : () => Effect.andThen(record("COMMIT"), commit)
  }).pipe(
    Effect.flatMap((sql) =>
      Effect.map(Effect.service(Reactivity.Reactivity), (reactivity) => ({
        sql,
        reactivity,
        calls,
        record,
        after: (name: string) => sql.afterCommit(record(`after(${name})`))
      }))
    ),
    Effect.provide(Reactivity.layer)
  )
}

const assertTypedFailure = <A, E>(exit: Exit.Exit<A, E>, error: E) => {
  assert.isTrue(Exit.isFailure(exit))
  if (!Exit.isFailure(exit)) {
    return
  }
  assert.isFalse(
    Cause.hasDies(exit.cause),
    `expected a typed failure but the cause contains a defect:\n${Cause.pretty(exit.cause)}`
  )
  assert.deepStrictEqual(Cause.findErrorOption(exit.cause), Option.some(error))
}

describe("SqlClient", () => {
  it.effect("interrupts a queued transaction before the connection is released without starting its body", () =>
    Effect.gen(function*() {
      const semaphore = yield* Semaphore.make(1)
      const entered = yield* Deferred.make<void>()
      const release = yield* Deferred.make<void>()
      const interrupted = yield* Deferred.make<void>()
      const { calls, record, sql } = yield* makeClient({
        acquire: Effect.asVoid(
          Effect.acquireRelease(semaphore.take(1), () => semaphore.release(1), { interruptible: true })
        )
      })
      const holder = yield* Effect.forkChild(sql.withTransaction(
        Effect.andThen(Deferred.succeed(entered, undefined), Deferred.await(release))
      ))
      yield* Deferred.await(entered)

      const queued = yield* Effect.forkChild(sql.withTransaction(record("queued body")), { startImmediately: true })
      const interrupting = yield* Effect.forkChild(
        Effect.andThen(Fiber.interrupt(queued), Deferred.succeed(interrupted, undefined))
      )
      yield* Effect.yieldNow
      const interruptedBeforeRelease = yield* Deferred.isDone(interrupted)

      // Unblock both fibers before asserting, so the regression fails rather than hanging.
      yield* Deferred.succeed(release, undefined)
      yield* Fiber.join(holder)
      yield* Fiber.join(interrupting)
      const exit = yield* Fiber.await(queued)
      assert.isTrue(Exit.isFailure(exit) && Cause.hasInterrupts(exit.cause))
      assert.isFalse(calls.includes("queued body"))

      // A cancelled waiter must not retain the connection or its permit.
      yield* sql.withTransaction(record("reused"))
      assert.isTrue(interruptedBeforeRelease, "interruption must complete while the holder still owns the connection")
      assert.deepStrictEqual(calls, ["BEGIN", "COMMIT", "release", "BEGIN", "reused", "COMMIT", "release"])
    }))

  it.effect("starts only top-level transactions with the BeginTransaction statement, unprepared", () =>
    Effect.gen(function*() {
      const { calls, sql } = yield* makeClient({ prepareTransactionControls: true })

      yield* sql.withTransaction(
        sql.withTransaction(Effect.void).pipe(Effect.provideService(SqlClient.BeginTransaction, "BEGIN READ ONLY"))
      ).pipe(Effect.provideService(SqlClient.BeginTransaction, "BEGIN ISOLATION LEVEL SERIALIZABLE"))
      yield* sql.withTransaction(Effect.void)

      assert.deepStrictEqual(calls, [
        "BEGIN ISOLATION LEVEL SERIALIZABLE",
        "prepared(SAVEPOINT effect_sql_1)",
        "prepared(COMMIT)",
        "release",
        "prepared(BEGIN)",
        "prepared(COMMIT)",
        "release"
      ])
    }))

  it.effect("replays the whole transaction when Effect.retry recovers a serialization failure at COMMIT", () =>
    Effect.gen(function*() {
      let commits = 0
      const { after, calls, record, sql } = yield* makeClient({
        commit: Effect.suspend(() =>
          commits++ === 0
            ? Effect.fail(
              new SqlError.SqlError({
                reason: new SqlError.SerializationError({ cause: new Error("40001"), message: "serialization failure" })
              })
            )
            : Effect.void
        )
      })

      const result = yield* sql.withTransaction(
        Effect.andThen(record("body"), Effect.as(after("1"), "body"))
      ).pipe(
        Effect.provideService(SqlClient.BeginTransaction, "BEGIN ISOLATION LEVEL SERIALIZABLE"),
        Effect.retry({
          while: (error) =>
            SqlError.isSqlError(error) &&
            (error.reason._tag === "SerializationError" || error.reason._tag === "DeadlockError"),
          times: 5
        })
      )

      assert.strictEqual(result, "body")
      assert.deepStrictEqual(calls, [
        "BEGIN ISOLATION LEVEL SERIALIZABLE",
        "body",
        "COMMIT",
        "release",
        "BEGIN ISOLATION LEVEL SERIALIZABLE",
        "body",
        "COMMIT",
        "release",
        "after(1)"
      ])
    }))

  describe("makeWithTransaction", () => {
    it.effect("recovers a failed commit with catchTag after successful cleanup", () =>
      Effect.gen(function*() {
        const commitError = sqlError("commit rejected")
        const harness = makeHarness({
          commit: () => Effect.fail(commitError),
          onCommitFailure: () => Effect.void
        })

        const exit = yield* Effect.exit(
          harness.withTransaction(Effect.succeed("body")).pipe(
            Effect.catchTag("SqlError", (error) => Effect.succeed(error))
          )
        )

        assert.deepStrictEqual(exit, Exit.succeed(commitError))
        assert.deepStrictEqual(harness.calls, [
          "acquireConnection",
          "begin",
          "commit",
          "onCommitFailure",
          "closeConnection"
        ])
      }))

    it.effect("keeps both commit and cleanup errors as defects despite typed recovery", () =>
      Effect.gen(function*() {
        const commitError = sqlError("commit rejected")
        const cleanupError = sqlError("cleanup rejected")
        const harness = makeHarness({
          commit: () => Effect.fail(commitError),
          onCommitFailure: () => Effect.fail(cleanupError)
        })

        const exit = yield* Effect.exit(
          harness.withTransaction(Effect.void).pipe(Effect.catchTag("SqlError", () => Effect.void))
        )

        assert.deepStrictEqual(exit, Exit.failCause(Cause.combine(Cause.die(commitError), Cause.die(cleanupError))))
        assert.deepStrictEqual(harness.calls, [
          "acquireConnection",
          "begin",
          "commit",
          "onCommitFailure",
          "closeConnection"
        ])
      }))

    it.effect("propagates a failed begin as a typed error without rolling back", () =>
      Effect.gen(function*() {
        const beginError = sqlError("database is locked")
        const harness = makeHarness({ begin: beginError })
        let executed = false

        const exit = yield* Effect.exit(harness.withTransaction(Effect.sync(() => {
          executed = true
        })))

        assertTypedFailure(exit, beginError)
        assert.isFalse(executed)
        assert.deepStrictEqual(harness.calls, ["acquireConnection", "begin", "closeConnection"])
      }))

    it.effect("rolls back when the wrapped effect fails after a successful begin", () =>
      Effect.gen(function*() {
        const harness = makeHarness()

        const exit = yield* Effect.exit(harness.withTransaction(Effect.fail("boom" as const)))

        assertTypedFailure(exit, "boom" as const)
        assert.deepStrictEqual(harness.calls, ["acquireConnection", "begin", "rollback", "closeConnection"])
      }))

    it.effect("propagates a failed savepoint as a typed error without rolling back", () =>
      Effect.gen(function*() {
        const savepointError = sqlError("cannot create savepoint")
        const harness = makeHarness({ savepoint: savepointError })
        let executed = false

        const exit = yield* Effect.exit(harness.withTransaction(
          harness.withTransaction(Effect.sync(() => {
            executed = true
          }))
        ))

        assertTypedFailure(exit, savepointError)
        assert.isFalse(executed)
        assert.deepStrictEqual(harness.calls, [
          "acquireConnection",
          "begin",
          "savepoint(1)",
          "rollback",
          "closeConnection"
        ])
      }))

    it.effect("releases savepoints after nested transactions succeed or roll back", () =>
      Effect.gen(function*() {
        const harness = makeHarness({ releaseSavepoint: true })

        const exit = yield* harness.withTransaction(Effect.gen(function*() {
          yield* harness.withTransaction(Effect.void)
          return yield* Effect.exit(harness.withTransaction(Effect.fail("boom" as const)))
        }))

        assertTypedFailure(exit, "boom" as const)
        assert.deepStrictEqual(harness.calls, [
          "acquireConnection",
          "begin",
          "savepoint(1)",
          "releaseSavepoint(1)",
          "savepoint(1)",
          "rollbackSavepoint(1)",
          "releaseSavepoint(1)",
          "commit",
          "closeConnection"
        ])
      }))

    it.effect("does not release savepoints when the driver does not opt in", () =>
      Effect.gen(function*() {
        const harness = makeHarness()

        const result = yield* harness.withTransaction(harness.withTransaction(Effect.succeed(1)))

        assert.strictEqual(result, 1)
        assert.deepStrictEqual(harness.calls, [
          "acquireConnection",
          "begin",
          "savepoint(1)",
          "commit",
          "closeConnection"
        ])
      }))

    it.effect("skips savepoint release when rollback fails", () =>
      Effect.gen(function*() {
        const rollbackError = sqlError("cannot roll back savepoint")
        const harness = makeHarness({ releaseSavepoint: true, rollbackSavepoint: rollbackError })

        const exit = yield* Effect.exit(harness.withTransaction(harness.withTransaction(Effect.fail("boom"))))

        assert.deepStrictEqual(exit, Exit.failCause(Cause.combine(Cause.die("boom"), Cause.die(rollbackError))))
        assert.deepStrictEqual(harness.calls, [
          "acquireConnection",
          "begin",
          "savepoint(1)",
          "rollbackSavepoint(1)",
          "rollback",
          "closeConnection"
        ])
      }))

    it.effect("rolls back the outer transaction when a savepoint release fails", () =>
      Effect.gen(function*() {
        const releaseError = sqlError("cannot release savepoint")
        const harness = makeHarness({ releaseSavepoint: releaseError })

        const exit = yield* Effect.exit(harness.withTransaction(harness.withTransaction(Effect.void)))

        assert.deepStrictEqual(exit, Exit.die(releaseError))
        assert.deepStrictEqual(harness.calls, [
          "acquireConnection",
          "begin",
          "savepoint(1)",
          "releaseSavepoint(1)",
          "rollback",
          "closeConnection"
        ])
      }))

    it.effect("passes the BeginTransaction statement to begin", () =>
      Effect.gen(function*() {
        const harness = makeHarness()

        yield* harness.withTransaction(Effect.void)
        yield* harness.withTransaction(Effect.void).pipe(
          Effect.provideService(SqlClient.BeginTransaction, "BEGIN READ ONLY")
        )

        assert.deepStrictEqual(harness.calls.filter((call) => call.startsWith("begin")), [
          "begin",
          "begin(BEGIN READ ONLY)"
        ])
      }))

    it.effect("commits and returns the value when the wrapped effect succeeds", () =>
      Effect.gen(function*() {
        const harness = makeHarness()

        const result = yield* harness.withTransaction(Effect.succeed(1))

        assert.strictEqual(result, 1)
        assert.deepStrictEqual(harness.calls, ["acquireConnection", "begin", "commit", "closeConnection"])
      }))
  })

  describe("afterCommit", () => {
    it.effect("runs callbacks in order after commit and release, with the services they were registered with", () =>
      Effect.gen(function*() {
        const { after, calls, record, sql } = yield* makeClient()
        const Caller = Context.Service<string>("test/afterCommit/Caller")
        const seen: Array<unknown> = []

        const result = yield* sql.withTransaction(
          Effect.gen(function*() {
            yield* after("1")
            yield* sql.afterCommit(Effect.gen(function*() {
              seen.push(yield* Effect.serviceOption(sql.transactionService))
              seen.push(yield* Caller)
              yield* record("after(2)")
            }))
            return "body"
          }).pipe(Effect.provideService(Caller, "body"))
        ).pipe(Effect.provideService(Caller, "caller"))

        assert.strictEqual(result, "body")
        assert.deepStrictEqual(seen, [Option.none(), "body"])
        assert.deepStrictEqual(calls, ["BEGIN", "COMMIT", "release", "after(1)", "after(2)"])
      }))

    it.effect("runs nothing when the transaction rolls back or COMMIT fails", () =>
      Effect.gen(function*() {
        const rolledBack = yield* makeClient()
        yield* Effect.exit(rolledBack.sql.withTransaction(Effect.andThen(rolledBack.after("1"), Effect.fail("boom"))))
        assert.deepStrictEqual(rolledBack.calls, ["BEGIN", "ROLLBACK", "release"])

        const failedCommit = yield* makeClient({ commit: Effect.fail(sqlError("commit rejected")) })
        yield* Effect.exit(failedCommit.sql.withTransaction(failedCommit.after("1")))
        assert.deepStrictEqual(failedCommit.calls, ["BEGIN", "COMMIT", "release"])
      }))

    it.effect("drops a rolled-back savepoint's callbacks and keeps a committed savepoint's until the outer level ends", () =>
      Effect.gen(function*() {
        const { after, calls, sql } = yield* makeClient()
        yield* sql.withTransaction(Effect.gen(function*() {
          yield* after("1")
          yield* sql.withTransaction(after("2"))
          yield* Effect.exit(sql.withTransaction(Effect.gen(function*() {
            yield* after("dropped")
            yield* sql.withTransaction(after("nested dropped"))
            return yield* Effect.fail("boom")
          })))
          yield* after("3")
        }))
        assert.deepStrictEqual(calls.filter((call) => call.startsWith("after")), ["after(1)", "after(2)", "after(3)"])

        const rolledBack = yield* makeClient()
        yield* Effect.exit(rolledBack.sql.withTransaction(Effect.gen(function*() {
          yield* rolledBack.sql.withTransaction(rolledBack.after("inner"))
          return yield* Effect.fail("boom")
        })))
        assert.isFalse(rolledBack.calls.includes("after(inner)"))
      }))

    it.effect("runs immediately outside a transaction and after the transaction service is omitted", () =>
      Effect.gen(function*() {
        const { after, calls, sql } = yield* makeClient()
        yield* after("outside")
        assert.deepStrictEqual(calls, ["after(outside)"])

        yield* Effect.exit(sql.withTransaction(Effect.gen(function*() {
          yield* after("omitted").pipe(
            Effect.updateContext((context: Context.Context<never>) => Context.omit(sql.transactionService)(context))
          )
          return yield* Effect.fail("boom")
        })))
        assert.deepStrictEqual(calls, ["after(outside)", "BEGIN", "after(omitted)", "ROLLBACK", "release"])
      }))

    it.effect("runs callbacks when the fiber is interrupted during COMMIT or the release fails", () =>
      Effect.gen(function*() {
        const committing = yield* Deferred.make<void>()
        const resume = yield* Deferred.make<void>()
        const interrupted = yield* makeClient({
          commit: Effect.andThen(Deferred.succeed(committing, undefined), Deferred.await(resume))
        })
        const fiber = yield* Effect.forkChild(interrupted.sql.withTransaction(interrupted.after("1")))
        yield* Deferred.await(committing)
        const interrupting = yield* Effect.forkChild(Fiber.interrupt(fiber))
        yield* Effect.yieldNow
        yield* Deferred.succeed(resume, undefined)
        yield* Fiber.join(interrupting)
        assert.deepStrictEqual(interrupted.calls, ["BEGIN", "COMMIT", "release", "after(1)"])

        const failedRelease = yield* makeClient({ release: Effect.die("release defect") })
        yield* Effect.exit(failedRelease.sql.withTransaction(failedRelease.after("1")))
        assert.deepStrictEqual(failedRelease.calls, ["BEGIN", "COMMIT", "release", "after(1)"])
      }))

    it.effect("logs a callback that dies and runs the rest", () =>
      Effect.gen(function*() {
        const { after, calls, sql } = yield* makeClient()
        const logged: Array<string> = []
        const logger = Logger.make<unknown, void>((options) => {
          logged.push(Cause.pretty(options.cause))
        })

        const result = yield* sql.withTransaction(Effect.gen(function*() {
          yield* sql.afterCommit(Effect.die("callback defect"))
          yield* after("3")
          return "body"
        })).pipe(Effect.provide(Logger.layer([logger])))

        assert.strictEqual(result, "body")
        assert.isTrue(calls.includes("after(3)"))
        assert.strictEqual(logged.length, 1)
        assert.include(logged[0], "callback defect")
      }))

    it.effect("dies when a detached fiber registers after the transaction has ended", () =>
      Effect.gen(function*() {
        const { after, calls, sql } = yield* makeClient()
        const register = yield* Deferred.make<void>()
        const late = yield* sql.withTransaction(
          Effect.forkDetach(Effect.andThen(Deferred.await(register), after("late")))
        )
        yield* Deferred.succeed(register, undefined)
        const exit = yield* Fiber.await(late)
        assert.isTrue(Exit.isFailure(exit) && Cause.pretty(exit.cause).includes("the transaction has already ended"))

        const entered = yield* Deferred.make<void>()
        const registerNested = yield* Deferred.make<void>()
        const nested = yield* sql.withTransaction(Effect.gen(function*() {
          const child = yield* Effect.forkDetach(sql.withTransaction(Effect.gen(function*() {
            yield* Deferred.succeed(entered, undefined)
            yield* Deferred.await(registerNested)
            yield* after("late nested")
          })))
          yield* Deferred.await(entered)
          return child
        }))
        yield* Deferred.succeed(registerNested, undefined)
        const nestedExit = yield* Fiber.await(nested)
        assert.isTrue(
          Exit.isFailure(nestedExit) && Cause.pretty(nestedExit.cause).includes("the transaction has already ended")
        )
        assert.isFalse(calls.some((call) => call.startsWith("after")))
      }))
  })

  describe("Reactivity.mutation", () => {
    // Records `invalidate(key)` when a mutation invalidates one of `keys`.
    const watch = (
      client: Effect.Success<ReturnType<typeof makeClient>>,
      keys: ReadonlyArray<string>
    ) =>
      Effect.sync(() => {
        for (const key of keys) {
          client.reactivity.registerUnsafe([key], () => {
            client.calls.push(`invalidate(${key})`)
          })
        }
      })

    it.effect("invalidates once the outermost transaction commits, dropping rolled-back work", () =>
      Effect.gen(function*() {
        const client = yield* makeClient()
        const { calls, sql } = client
        yield* watch(client, ["users", "dropped"])

        yield* Effect.gen(function*() {
          yield* Effect.exit(sql.withTransaction(
            Effect.andThen(Reactivity.mutation(sql`UPDATE users`, ["users"]), Effect.fail("boom"))
          ))
          assert.isFalse(calls.includes("invalidate(users)"))

          yield* sql.withTransaction(Effect.gen(function*() {
            yield* sql.withTransaction(Reactivity.mutation(sql`UPDATE users`, ["users"]))
            yield* Effect.exit(sql.withTransaction(
              Effect.andThen(Reactivity.mutation(sql`UPDATE dropped`, ["dropped"]), Effect.fail("boom"))
            ))
            assert.isFalse(calls.includes("invalidate(users)"))
          }))
        }).pipe(Effect.provideService(Reactivity.Reactivity, client.reactivity))

        assert.deepStrictEqual(calls.slice(-3), ["COMMIT", "release", "invalidate(users)"])
        assert.isFalse(calls.includes("invalidate(dropped)"))
      }))
  })
})
