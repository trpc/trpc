import { PgConnection, PgTypes } from "@effect/sql-pg"
import { assert, it } from "@effect/vitest"
import { Cause, Deferred, Effect, Exit, Fiber, Queue, Redacted, Scope, Stream } from "effect"
import type { SqlError } from "effect/sql/SqlError"
import { PgContainer } from "./utils.ts"

const makeConnection = (options?: PgConnection.Config) =>
  Effect.gen(function*() {
    const container = yield* PgContainer
    return yield* PgConnection.make({
      url: Redacted.make(container.getConnectionUri()),
      ...options
    })
  })

const assertInterruptedOnClose = (
  scope: Scope.Closeable,
  notifications: Queue.Dequeue<PgConnection.Notification, SqlError>
) =>
  Effect.gen(function*() {
    const consumer = yield* Effect.forkScoped(Queue.take(notifications))
    yield* Scope.close(scope, Exit.void)
    const exit = yield* Fiber.await(consumer)
    assert.isTrue(Exit.isFailure(exit) && Cause.hasInterruptsOnly(exit.cause))
  })

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
})
