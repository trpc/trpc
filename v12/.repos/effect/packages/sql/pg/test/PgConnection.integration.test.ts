import { PgConnection, PgTypes } from "@effect/sql-pg"
import { assert, it } from "@effect/vitest"
import { Cause, Deferred, Effect, Exit, Fiber, Option, Queue, Redacted, Scheduler, Scope, Stream } from "effect"
import type { SqlError } from "effect/sql/SqlError"
import * as TestClock from "effect/testing/TestClock"
import * as Net from "node:net"
import { PgContainer, waitUntilActive, waitUntilAdvisoryLock } from "./utils.ts"

const makeConnection = Effect.fnUntraced(function*(options?: PgConnection.Config) {
  const container = yield* PgContainer
  return yield* PgConnection.make({
    url: Redacted.make(container.getConnectionUri()),
    ...options
  })
})

const assertInterruptedOnClose = Effect.fnUntraced(function*(
  scope: Scope.Closeable,
  notifications: Queue.Dequeue<PgConnection.Notification, SqlError>
) {
  const consumer = yield* Effect.forkScoped(Queue.take(notifications))
  yield* Scope.close(scope, Exit.void)
  const exit = yield* Fiber.await(consumer)
  assert.isTrue(Exit.isFailure(exit) && Cause.hasInterruptsOnly(exit.cause))
})

// Runs a fiber normally until `holding` is set, then queues its tasks and runs
// them one at a time through `step`, so a test can stop it between two operations.
class SteppedScheduler implements Scheduler.Scheduler {
  readonly executionMode = "async"
  holding = false
  private readonly fallback = new Scheduler.MixedScheduler()
  private readonly held: Array<() => void> = []
  private onHeld: (() => void) | undefined

  // While holding, yield after one operation; the first operation after a
  // yield only resumes the yielded continuation.
  shouldYield(fiber: Fiber.Fiber<unknown, unknown>): boolean {
    return this.holding ? fiber.currentOpCount > 2 : this.fallback.shouldYield(fiber)
  }

  makeDispatcher(): Scheduler.SchedulerDispatcher {
    const dispatcher = this.fallback.makeDispatcher()
    return {
      scheduleTask: (task, priority) => {
        if (!this.holding) return dispatcher.scheduleTask(task, priority)
        this.held.push(task)
        const onHeld = this.onHeld
        this.onHeld = undefined
        onHeld?.()
      },
      flush: () => dispatcher.flush()
    }
  }

  readonly step: Effect.Effect<void> = Effect.callback((resume) => {
    const run = () =>
      setImmediate(() => {
        this.held.shift()!()
        resume(Effect.void)
      })
    if (this.held.length > 0) run()
    else this.onHeld = run
  })

  release(): void {
    this.holding = false
    for (const task of this.held.splice(0)) setImmediate(task)
  }
}

it.layer(PgContainer.layer, { timeout: "30 seconds" })("PgConnection", (it) => {
  it.effect("interrupts notification consumers when the connection scope closes", () =>
    Effect.gen(function*() {
      const scope = yield* Scope.fork(yield* Scope.Scope)
      const connection = yield* Scope.provide(makeConnection(), scope)
      const notifications = yield* connection.listen("closed_listener")
      yield* assertInterruptedOnClose(scope, notifications)
    }))

  it.effect("interrupts notification consumers when the listener scope closes", () =>
    Effect.gen(function*() {
      const scope = yield* Scope.fork(yield* Scope.Scope)
      const connection = yield* makeConnection()
      const notifications = yield* Scope.provide(connection.listen("closed_listener"), scope)
      yield* assertInterruptedOnClose(scope, notifications)
    }))

  it.effect("closes a listener whose connection stops responding", () =>
    Effect.gen(function*() {
      const container = yield* PgContainer
      const sockets: Array<Net.Socket> = []
      const connection = yield* makeConnection({
        stream: () => {
          const socket = Net.connect({ host: container.getHost(), port: container.getMappedPort(5432) })
          sockets.push(socket)
          return socket
        }
      })
      const scope = yield* Scope.make()
      yield* Scope.provide(connection.listen("unanswered_listener"), scope)
      for (const socket of sockets) socket.pause()

      const closing = yield* Effect.forkDetach(Scope.close(scope, Exit.void))
      yield* Effect.gen(function*() {
        const closed = yield* Fiber.await(closing).pipe(Effect.timeoutOption("10 seconds"))
        assert.isTrue(Option.isSome(closed), "listener scope did not close within 10 seconds")
        assert.isTrue(Exit.isFailure(yield* Effect.exit(connection.query("SELECT 1"))))
      }).pipe(Effect.ensuring(Effect.sync(() => sockets.forEach((socket) => socket.destroy()))))
    }).pipe(TestClock.withLive), { timeout: 30000 })

  it.effect("keeps a busy pinned session when a listener closes", () =>
    Effect.gen(function*() {
      const connection = yield* makeConnection()
      const observer = yield* makeConnection()
      const pinned = yield* connection.pin
      const scope = yield* Scope.make()
      yield* Scope.provide(pinned.listen("busy_listener"), scope)
      const slow = yield* Effect.forkChild(pinned.query("SELECT pg_sleep(6)"))
      yield* waitUntilActive(observer, pinned.processId)

      yield* Scope.close(scope, Exit.void)
      yield* Fiber.join(slow)
      const result = yield* pinned.query("SELECT 1 AS one")
      assert.deepStrictEqual(result.rows, [{ one: 1 }])
    }).pipe(TestClock.withLive), { timeout: 30000 })

  it.effect("skips UNLISTEN queued behind a pin release", () =>
    Effect.gen(function*() {
      const connection = yield* makeConnection()
      const pinScope = yield* Scope.make()
      const pinned = yield* Scope.provide(connection.pin, pinScope)
      const listenScope = yield* Scope.make()
      yield* Scope.provide(pinned.listen("released_listener"), listenScope)
      // Release the pin in the same fiber as the statement, so the release
      // follows the statement's response without waiting on the scheduler.
      const releasing = yield* Effect.forkChild(
        Effect.andThen(pinned.query("SELECT pg_sleep(0.05)"), Scope.close(pinScope, Exit.void)),
        { startImmediately: true }
      )
      // Close the listener while the statement holds the wire, queueing
      // UNLISTEN behind it.
      const closing = yield* Effect.forkChild(Scope.close(listenScope, Exit.void), { startImmediately: true })
      yield* Fiber.join(releasing)
      yield* Fiber.join(closing)

      const next = yield* Effect.forkDetach(connection.query("SELECT 1 AS one"))
      const result = yield* Fiber.join(next).pipe(Effect.timeout("2 seconds"))
      assert.deepStrictEqual(result.rows, [{ one: 1 }])
    }).pipe(TestClock.withLive))

  it.effect("waits for an UNLISTEN holding the wire at pin release", () =>
    Effect.gen(function*() {
      // Each run has a narrow window, so repeat it to make a regression show up reliably.
      for (let run = 0; run < 10; run++) {
        yield* Effect.scoped(Effect.gen(function*() {
          const connection = yield* makeConnection()
          const pinScope = yield* Scope.make()
          const pinned = yield* Scope.provide(connection.pin, pinScope)
          const listenScope = yield* Scope.make()
          yield* Scope.provide(pinned.listen("unlistening_listener"), listenScope)
          const closing = yield* Effect.forkDetach(
            Effect.andThen(Effect.yieldNow, Scope.close(listenScope, Exit.void))
          )
          yield* pinned.query("SELECT pg_sleep(0.05)")
          // Let the queued UNLISTEN take the wire, so the release lands while
          // it runs or between its completion and the permit release.
          yield* Effect.yieldNow
          yield* Effect.yieldNow
          yield* Effect.yieldNow

          yield* Scope.close(pinScope, Exit.void)
          const next = yield* Effect.forkDetach(connection.query("SELECT 1 AS one"))
          const result = yield* Fiber.join(next).pipe(Effect.timeout("2 seconds"))
          assert.deepStrictEqual(result.rows, [{ one: 1 }])
          yield* Fiber.join(closing)
        }))
      }
    }).pipe(TestClock.withLive, Effect.provideService(Scheduler.MaxOpsBeforeYield, 5)))

  it.effect("does not wait for ordinary work that overtakes UNLISTEN at pin release", () =>
    Effect.gen(function*() {
      const container = yield* PgContainer
      const sockets: Array<Net.Socket> = []
      const written: Array<string> = []
      const connection = yield* makeConnection({
        stream: () => {
          const socket = Net.connect({ host: container.getHost(), port: container.getMappedPort(5432) })
          const write = socket.write.bind(socket) as (chunk: Uint8Array) => boolean
          socket.write = ((chunk: Uint8Array) => {
            written.push(Buffer.from(chunk).toString("latin1"))
            return write(chunk)
          }) as typeof socket.write
          sockets.push(socket)
          return socket
        }
      })
      const sent = (text: string) => written.some((frame) => frame.includes(text))
      const pinScope = yield* Scope.make()
      const pinned = yield* Scope.provide(connection.pin, pinScope)
      const listenScope = yield* Scope.make()
      yield* Scope.provide(pinned.listen("overtaken_listener"), listenScope)

      yield* Effect.gen(function*() {
        // Hold the UNLISTEN reply so the cleanup keeps the wire.
        for (const socket of sockets) socket.pause()
        const scheduler = new SteppedScheduler()
        const closing = yield* Effect.forkDetach(Scope.close(listenScope, Exit.void)).pipe(
          Effect.provideService(Scheduler.Scheduler, scheduler)
        )
        while (!sent("UNLISTEN")) yield* Effect.yieldNow
        const overtaking = yield* Effect.forkDetach(pinned.query("SELECT pg_sleep(30)"))
        // The forked query queues on the wire before this fiber resumes.
        yield* Effect.yieldNow

        // Step the cleanup until the wire passes to the queued query, leaving
        // the rest of the cleanup unrun.
        scheduler.holding = true
        for (const socket of sockets) socket.resume()
        while (!sent("pg_sleep(30)")) yield* scheduler.step

        const releasing = yield* Effect.forkDetach(Scope.close(pinScope, Exit.void))
        scheduler.release()
        const released = yield* Fiber.await(releasing).pipe(Effect.timeoutOption("2 seconds"))
        assert.isTrue(Option.isSome(released), "pin release waited for the overtaking query")
        assert.isTrue(Exit.isFailure(yield* Fiber.await(overtaking)))
        yield* Fiber.join(closing)
      }).pipe(Effect.ensuring(Effect.sync(() => sockets.forEach((socket) => socket.destroy()))))
    }).pipe(TestClock.withLive), { timeout: 30000 })

  it.effect("connects through ReadyForQuery", () =>
    Effect.gen(function*() {
      const connection = yield* makeConnection()
      assert.isAbove(connection.processId, 0)
    }))

  it.effect("runs unnamed extended queries with inferred binary parameters", () =>
    Effect.gen(function*() {
      const connection = yield* makeConnection()
      const instant = new Date("2024-05-06T07:08:09.123Z")
      const result = yield* connection.query(
        "SELECT $1::int4 AS i, $2::float8 AS f, $3::int8 AS b, $4::bool AS flag, " +
          "$5::text AS text, $6::bytea AS bytes, $7::timestamptz AS instant, " +
          "$8::int4[] AS numbers, $9::text AS nil, $10::jsonb AS jsonb",
        [
          1,
          1.5,
          BigInt(2),
          true,
          "hello",
          new Int8Array([1, -1]),
          instant,
          [1, null, 3],
          null,
          PgTypes.jsonb({ nested: true })
        ]
      )
      assert.strictEqual(result.command, "SELECT")
      assert.strictEqual(result.rowCount, 1)
      assert.strictEqual(result.oid, null)
      assert.deepStrictEqual(result.rows, [{
        i: 1,
        f: 1.5,
        b: BigInt(2),
        flag: true,
        text: "hello",
        bytes: new Uint8Array([1, 255]),
        instant,
        numbers: [1, null, 3],
        nil: null,
        jsonb: { nested: true }
      }])
      assert.deepStrictEqual(result.fields.map((field) => field.name), [
        "i",
        "f",
        "b",
        "flag",
        "text",
        "bytes",
        "instant",
        "numbers",
        "nil",
        "jsonb"
      ])
    }))

  it.effect("applies the session TimeZone only to Dates bound into timestamp columns", () =>
    Effect.gen(function*() {
      const connection = yield* makeConnection()
      const instant = new Date("2024-05-06T07:08:09.123Z")
      yield* connection.query(
        "CREATE TEMP TABLE timestamp_timezone (bare timestamp, explicit timestamp, zoned timestamptz)"
      )
      for (
        const [zone, expectedBare] of [
          ["UTC", instant],
          ["Europe/Berlin", new Date("2024-05-06T09:08:09.123Z")]
        ] as const
      ) {
        yield* connection.query(`SET TIME ZONE '${zone}'`)
        yield* connection.query("TRUNCATE timestamp_timezone")
        yield* connection.query(
          "INSERT INTO timestamp_timezone VALUES ($1, $2, $3)",
          [instant, PgTypes.timestamp(instant), instant]
        )
        const result = yield* connection.query("SELECT * FROM timestamp_timezone")
        assert.deepStrictEqual(result.rows, [{ bare: expectedBare, explicit: instant, zoned: instant }])
      }
    }))

  it.effect("returns queryValues in RowDescription order", () =>
    Effect.gen(function*() {
      const connection = yield* makeConnection()
      const rows = yield* connection.queryValues(
        "SELECT $1::int8 AS second, $2::text AS first",
        [PgTypes.int8(BigInt(7)), "value"]
      )
      assert.deepStrictEqual(rows, [[BigInt(7), "value"]])
    }))

  it.effect("drains query errors and keeps the connection usable", () =>
    Effect.gen(function*() {
      const connection = yield* makeConnection()
      yield* connection.query("CREATE TEMP TABLE pg_connection_unique (value int4 UNIQUE)")
      yield* connection.query("INSERT INTO pg_connection_unique VALUES ($1)", [1])
      const error = yield* Effect.flip(connection.query("INSERT INTO pg_connection_unique VALUES ($1)", [1]))
      assert.strictEqual(error.reason._tag, "UniqueViolation")
      if (error.reason._tag === "UniqueViolation") {
        assert.include(error.reason.constraint, "pg_connection_unique")
      }
      const result = yield* connection.query("SELECT count(*)::int8 AS count FROM pg_connection_unique")
      assert.deepStrictEqual(result.rows, [{ count: BigInt(1) }])
    }))

  it.effect("binds untyped strings and integers beyond int4", () =>
    Effect.gen(function*() {
      const connection = yield* makeConnection()
      yield* connection.query("CREATE TEMP TABLE inference_widening (id bigint, at timestamptz)")
      yield* connection.query(
        "INSERT INTO inference_widening (id, at) VALUES ($1, $2)",
        ["12345678901234", "2024-05-06T07:08:09Z"]
      )
      yield* connection.query("INSERT INTO inference_widening (id) VALUES ($1)", [1755000000000])
      const rows = yield* connection.queryValues("SELECT id FROM inference_widening ORDER BY id")
      assert.deepStrictEqual(rows.map((row) => row[0]), [BigInt(1755000000000), BigInt("12345678901234")])
    }))

  it.effect("reparses a statement whose first execution failed at bind", () =>
    Effect.gen(function*() {
      const connection = yield* makeConnection()
      const missing = yield* Effect.flip(connection.query("select $1::regclass", ["prepared_bind_failure"]))
      assert.strictEqual(missing.reason._tag, "SqlSyntaxError")
      yield* connection.query("CREATE TEMP TABLE prepared_bind_failure (id int)")
      const found = yield* connection.query("select $1::regclass AS rel", ["prepared_bind_failure"])
      assert.strictEqual(found.rows.length, 1)
    }))

  it.effect("fails with AuthenticationError on a bad password", () =>
    Effect.gen(function*() {
      const container = yield* PgContainer
      const error = yield* Effect.flip(PgConnection.make({
        host: container.getHost(),
        port: container.getMappedPort(5432),
        username: container.getUsername(),
        password: Redacted.make("definitely-wrong"),
        database: container.getDatabase()
      }))
      assert.strictEqual(error._tag, "SqlError")
      assert.strictEqual(error.reason._tag, "AuthenticationError")
    }))

  it.effect("fails when the server refuses TLS", () =>
    Effect.gen(function*() {
      const container = yield* PgContainer
      const error = yield* Effect.flip(PgConnection.make({
        host: container.getHost(),
        port: container.getMappedPort(5432),
        username: container.getUsername(),
        password: Redacted.make(container.getPassword()),
        database: container.getDatabase(),
        ssl: true
      }))
      assert.strictEqual(error.reason._tag, "ConnectionError")
      assert.include(error.reason.message, "refused TLS")
    }))
  it.effect("reuses a prepared statement and keeps its columns", () =>
    Effect.gen(function*() {
      const connection = yield* makeConnection()
      for (let index = 0; index < 3; index++) {
        const result = yield* connection.query("SELECT $1::int4 AS value, $2::text AS label", [index, "x"])
        assert.deepStrictEqual(result.rows, [{ value: index, label: "x" }])
        assert.deepStrictEqual(result.fields, [
          { name: "value", dataTypeId: 23 },
          { name: "label", dataTypeId: 25 }
        ])
      }
      const prepared = yield* connection.query("SELECT count(*)::int4 AS n FROM pg_prepared_statements")
      assert.deepStrictEqual(prepared.rows[0], { n: 2 })
    }))

  it.effect("prepares the same text once per parameter signature", () =>
    Effect.gen(function*() {
      const connection = yield* makeConnection()
      assert.deepStrictEqual((yield* connection.query("SELECT $1 AS v", [1])).rows, [{ v: 1 }])
      assert.deepStrictEqual((yield* connection.query("SELECT $1 AS v", [BigInt(2)])).rows, [{ v: BigInt(2) }])
      const types = yield* connection.query(
        "SELECT parameter_types::text AS t FROM pg_prepared_statements WHERE statement = 'SELECT $1 AS v' ORDER BY t"
      )
      assert.deepStrictEqual(types.rows, [{ t: "{bigint}" }, { t: "{integer}" }])
    }))

  it.effect("re-parses a statement whose result type changed", () =>
    Effect.gen(function*() {
      const connection = yield* makeConnection()
      yield* connection.query("CREATE TEMP TABLE shifting (a int)")
      yield* connection.query("INSERT INTO shifting VALUES (1)")
      assert.deepStrictEqual((yield* connection.query("SELECT * FROM shifting")).rows, [{ a: 1 }])
      yield* connection.query("ALTER TABLE shifting ADD COLUMN b text DEFAULT 'added'")
      const after = yield* connection.query("SELECT * FROM shifting")
      assert.deepStrictEqual(after.rows, [{ a: 1, b: "added" }])
      assert.deepStrictEqual(after.fields, [
        { name: "a", dataTypeId: 23 },
        { name: "b", dataTypeId: 25 }
      ])
    }))

  it.effect("re-parses a statement the backend no longer holds", () =>
    Effect.gen(function*() {
      const connection = yield* makeConnection()
      assert.deepStrictEqual((yield* connection.query("SELECT $1::int4 AS n", [7])).rows, [{ n: 7 }])
      yield* connection.query("DEALLOCATE ALL")
      assert.deepStrictEqual((yield* connection.query("SELECT $1::int4 AS n", [8])).rows, [{ n: 8 }])
    }))

  it.effect("preserves a stale-plan error in a transaction and reparses after rollback", () =>
    Effect.gen(function*() {
      const connection = yield* makeConnection()
      yield* connection.query("CREATE TEMP TABLE stale_in_transaction (a int4)")
      yield* connection.query("INSERT INTO stale_in_transaction VALUES (1)")
      yield* connection.query("SELECT * FROM stale_in_transaction")
      yield* connection.query("ALTER TABLE stale_in_transaction ADD COLUMN b text DEFAULT 'added'")
      yield* connection.query("BEGIN")
      const error = yield* Effect.flip(connection.query("SELECT * FROM stale_in_transaction"))
      assert.propertyVal(error.reason.cause, "code", "0A000")
      yield* connection.query("ROLLBACK")
      assert.deepStrictEqual((yield* connection.query("SELECT * FROM stale_in_transaction")).rows, [{
        a: 1,
        b: "added"
      }])
    }))

  it.effect("preserves a missing-statement error in a transaction and reparses after rollback", () =>
    Effect.gen(function*() {
      const connection = yield* makeConnection()
      yield* connection.query("SELECT $1::int4 AS n", [7])
      yield* connection.query("DEALLOCATE ALL")
      yield* connection.query("BEGIN")
      const error = yield* Effect.flip(connection.query("SELECT $1::int4 AS n", [8]))
      assert.propertyVal(error.reason.cause, "code", "26000")
      yield* connection.query("ROLLBACK")
      assert.deepStrictEqual((yield* connection.query("SELECT $1::int4 AS n", [9])).rows, [{ n: 9 }])
    }))

  it.effect("closes statements it evicts from a full cache", () =>
    Effect.gen(function*() {
      const connection = yield* makeConnection({ preparedStatementCacheSize: 3 })
      for (let round = 0; round < 2; round++) {
        for (let index = 0; index < 8; index++) {
          const result = yield* connection.query(`SELECT ${index}::int4 AS n, $1::text AS t`, ["v"])
          assert.deepStrictEqual(result.rows, [{ n: index, t: "v" }])
        }
      }
      const held = yield* connection.query("SELECT count(*)::int4 AS n FROM pg_prepared_statements")
      assert.deepStrictEqual(held.rows[0], { n: 3 })
    }))

  it.effect("closes statements parsed while a pipeline overfills the cache", () =>
    Effect.gen(function*() {
      const connection = yield* makeConnection({ preparedStatementCacheSize: 1, multiplex: true })
      yield* Effect.all(
        Array.from({ length: 4 }, (_, index) => connection.query(`SELECT ${index}::int4 AS n`)),
        { concurrency: "unbounded" }
      )
      const held = yield* connection.query("SELECT count(*)::int4 AS n FROM pg_prepared_statements")
      assert.deepStrictEqual(held.rows[0], { n: 1 })
    }))

  it.effect("parses every statement when prepare is off", () =>
    Effect.gen(function*() {
      const connection = yield* makeConnection({ prepare: false })
      for (let index = 0; index < 3; index++) {
        assert.deepStrictEqual((yield* connection.query("SELECT $1::int4 AS n", [index])).rows, [{ n: index }])
      }
      const held = yield* connection.query("SELECT count(*)::int4 AS n FROM pg_prepared_statements")
      assert.deepStrictEqual(held.rows[0], { n: 0 })
    }))

  it.effect("stays usable after a statement the server refuses to parse", () =>
    Effect.gen(function*() {
      const connection = yield* makeConnection()
      const missing = yield* Effect.flip(connection.query("SELECT * FROM does_not_exist"))
      assert.strictEqual(missing.reason._tag, "SqlSyntaxError")
      const syntax = yield* Effect.flip(connection.query("SELECT FROM WHERE ????"))
      assert.strictEqual(syntax.reason._tag, "SqlSyntaxError")
      assert.deepStrictEqual((yield* connection.query("SELECT 42::int4 AS answer")).rows, [{ answer: 42 }])
    }))
  it.effect("closes a statement whose plan it had to throw away", () =>
    Effect.gen(function*() {
      const connection = yield* makeConnection()
      yield* connection.query("CREATE TEMP TABLE churn (a int)")
      for (let round = 0; round < 4; round++) {
        yield* connection.query("SELECT * FROM churn")
        yield* connection.query(`ALTER TABLE churn ADD COLUMN c${round} text`)
      }
      yield* connection.query("SELECT * FROM churn")
      // Every re-parse after a stale plan has to close the name it replaced,
      // or each DDL change strands a statement on the backend.
      const held = yield* connection.query(
        "SELECT count(*)::int4 AS n FROM pg_prepared_statements WHERE statement = 'SELECT * FROM churn'"
      )
      assert.deepStrictEqual(held.rows[0], { n: 1 })
    }))
  it.effect("re-parses a statement first prepared in a rolled back transaction", () =>
    Effect.gen(function*() {
      const connection = yield* makeConnection()
      yield* connection.query("CREATE TEMP TABLE rolled_back (a int)")

      // Postgres drops a statement prepared inside a transaction it rolls
      // back, so the cached name is gone even though the session lives on.
      yield* connection.query("BEGIN")
      yield* connection.query("INSERT INTO rolled_back VALUES ($1::int4)", [1])
      yield* connection.query("ROLLBACK")

      yield* connection.query("INSERT INTO rolled_back VALUES ($1::int4)", [2])
      yield* connection.query("INSERT INTO rolled_back VALUES ($1::int4)", [3])
      assert.deepStrictEqual(
        (yield* connection.query("SELECT a FROM rolled_back ORDER BY a")).rows,
        [{ a: 2 }, { a: 3 }]
      )
    }))
  it.effect("isolates errors between pipelined queries", () =>
    Effect.gen(function*() {
      const connection = yield* makeConnection({ multiplex: true })
      const exits = yield* Effect.all([
        Effect.exit(connection.query("SELECT $1::int4 AS first", [1])),
        Effect.exit(connection.query("SELECT missing_pipeline_column")),
        Effect.exit(connection.query("SELECT $1::int4 AS third", [3]))
      ], { concurrency: "unbounded" })

      assert.strictEqual(exits[0]._tag, "Success")
      assert.strictEqual(exits[1]._tag, "Failure")
      assert.strictEqual(exits[2]._tag, "Success")
      if (exits[0]._tag === "Success") assert.deepStrictEqual(exits[0].value.rows, [{ first: 1 }])
      if (exits[2]._tag === "Success") assert.deepStrictEqual(exits[2].value.rows, [{ third: 3 }])
    }))

  it.effect("drains an interrupted pipelined query without cancelling its neighbors", () =>
    Effect.gen(function*() {
      const connection = yield* makeConnection({ multiplex: true })
      const first = yield* connection.query("SELECT pg_sleep(0.05), 1 AS first").pipe(Effect.forkScoped)
      const second = yield* connection.query("SELECT 2 AS second").pipe(Effect.forkScoped)
      yield* Effect.yieldNow
      yield* Fiber.interrupt(first)

      const result = yield* Fiber.join(second)
      assert.deepStrictEqual(result.rows, [{ second: 2 }])
      assert.deepStrictEqual((yield* connection.query("SELECT 3 AS after")).rows, [{ after: 3 }])
    }))

  it.effect("places pin requests between earlier and later pipelined queries", () =>
    Effect.gen(function*() {
      const connection = yield* makeConnection({ multiplex: true })
      yield* connection.query(
        "CREATE TEMP TABLE pipeline_pin_order (position int GENERATED ALWAYS AS IDENTITY, value int4)"
      )
      const first = yield* connection.query(
        "INSERT INTO pipeline_pin_order (value) SELECT 1 FROM pg_sleep(0.05)"
      ).pipe(Effect.forkScoped)
      yield* Effect.yieldNow

      const pinned = yield* Deferred.make<void>()
      const release = yield* Deferred.make<void>()
      const pinFiber = yield* Effect.scoped(Effect.gen(function*() {
        const exclusive = yield* connection.pin
        yield* exclusive.query("INSERT INTO pipeline_pin_order (value) VALUES (2)")
        yield* Deferred.succeed(pinned, undefined)
        yield* Deferred.await(release)
      })).pipe(Effect.forkScoped)
      yield* Effect.yieldNow
      const third = yield* connection.query("INSERT INTO pipeline_pin_order (value) VALUES (3)").pipe(
        Effect.forkScoped
      )

      yield* Deferred.await(pinned)
      assert.isUndefined(third.pollUnsafe())
      yield* Deferred.succeed(release, undefined)
      yield* Fiber.join(first)
      yield* Fiber.join(pinFiber)
      yield* Fiber.join(third)

      const result = yield* connection.query("SELECT value FROM pipeline_pin_order ORDER BY position")
      assert.deepStrictEqual(result.rows, [{ value: 1 }, { value: 2 }, { value: 3 }])
    }))

  it.effect("reuses prepared statements across a pipeline", () =>
    Effect.gen(function*() {
      const connection = yield* makeConnection({ multiplex: true })
      for (let round = 0; round < 3; round++) {
        const results = yield* Effect.all(
          Array.from({ length: 8 }, (_, index) => connection.query("SELECT $1::int4 AS n", [index])),
          { concurrency: "unbounded" }
        )
        results.forEach((result, index) => assert.deepStrictEqual(result.rows, [{ n: index }]))
      }
      const held = yield* connection.query(
        "SELECT count(*)::int4 AS n FROM pg_prepared_statements WHERE statement = 'SELECT $1::int4 AS n'"
      )
      assert.deepStrictEqual(held.rows[0], { n: 1 })
    }))
  it.effect("orders ordinary statements against a stream on the same session", () =>
    Effect.gen(function*() {
      const connection = yield* makeConnection()
      // An ordinary statement holds `owner` rather than the wire permit, so
      // this is what says it still cannot interleave with a stream, which
      // reaches the session through a pin.
      const streamed = yield* Effect.forkScoped(
        Stream.runCollect(connection.stream("SELECT generate_series(1, 200) AS n"))
      )
      const queried = yield* Effect.forkScoped(
        Effect.all(
          Array.from({ length: 12 }, (_, index) => connection.query("SELECT $1::int4 AS n", [index])),
          { concurrency: "unbounded" }
        )
      )
      const rows = yield* Fiber.join(streamed)
      assert.strictEqual(Array.from(rows).length, 200)
      const results = yield* Fiber.join(queried)
      results.forEach((result, index) => assert.deepStrictEqual(result.rows, [{ n: index }]))
      assert.deepStrictEqual((yield* connection.query("SELECT 1 AS ok")).rows, [{ ok: 1 }])
    }))

  it.effect("fails work through a released pin without touching the next owner's session", () =>
    Effect.gen(function*() {
      const connection = yield* makeConnection()
      const released = yield* Effect.scoped(connection.pin)
      yield* Effect.scoped(Effect.gen(function*() {
        const owner = yield* connection.pin
        yield* owner.query("BEGIN")
        yield* owner.query("SET LOCAL application_name = 'next_owner'")

        const exits: ReadonlyArray<Exit.Exit<unknown, SqlError>> = [
          yield* Effect.exit(released.query("ROLLBACK")),
          yield* Effect.exit(released.queryValues("ROLLBACK")),
          yield* Effect.exit(Stream.runCollect(released.stream("SELECT 1"))),
          yield* Effect.exit(Effect.scoped(released.listen("released_pin")))
        ]
        exits.forEach((exit) => assert.isTrue(Exit.isFailure(exit)))

        const setting = yield* owner.query("SELECT current_setting('application_name') AS name")
        assert.deepStrictEqual(setting.rows, [{ name: "next_owner" }])
        yield* owner.query("ROLLBACK")
      }))
    }))

  it.effect("fails a statement that was queued on a pin before its release", () =>
    Effect.gen(function*() {
      const connection = yield* makeConnection()
      const scope = yield* Scope.make()
      const pinned = yield* Scope.provide(connection.pin, scope)
      const queued = yield* Effect.forkScoped(Effect.andThen(Effect.yieldNow, pinned.query("SELECT 1 AS queued")))
      // `queued` waits for the wire behind this statement, and the pin is
      // released before it wakes, so the session is idle and handed on.
      yield* pinned.query("SELECT 1 AS holder")
      yield* Scope.close(scope, Exit.void)
      assert.isTrue(Exit.isFailure(yield* Fiber.await(queued)))
      assert.deepStrictEqual((yield* connection.query("SELECT 1 AS ok")).rows, [{ ok: 1 }])
    }))

  it.effect("ignores interrupt on a released pin", () =>
    Effect.gen(function*() {
      const connection = yield* makeConnection()
      const blocker = yield* makeConnection()
      const observer = yield* makeConnection()
      const released = yield* Effect.scoped(connection.pin)
      const waiting = yield* Effect.gen(function*() {
        yield* blocker.query("BEGIN")
        yield* blocker.query("SELECT pg_advisory_xact_lock($1::int4)", [connection.processId])
        const waiting = yield* Effect.forkScoped(
          connection.query("SELECT pg_advisory_xact_lock($1::int4)", [connection.processId])
        )
        // A cancel only lands while the backend is executing, so wait for the lock.
        yield* waitUntilAdvisoryLock(observer, connection.processId)
        yield* released.interrupt
        return waiting
      }).pipe(Effect.ensuring(Effect.ignore(blocker.query("ROLLBACK"))))
      assert.isTrue(Exit.isSuccess(yield* Fiber.await(waiting)))
    }))
})
