import { assert, describe, it } from "@effect/vitest"
import { Effect, Fiber, Option, References, Stream, Tracer } from "effect"
import * as Reactivity from "effect/reactivity/Reactivity"
import * as SqlClient from "effect/sql/SqlClient"
import type { Connection } from "effect/sql/SqlConnection"
import * as Statement from "effect/sql/Statement"
import * as Str from "effect/String"
import * as TestClock from "effect/testing/TestClock"

describe("Statement", () => {
  it("transforms SQL result names without changing nested values", () => {
    const rows: Array<Record<string, unknown>> = [
      { user_id: 1, profile_data: { display_name: "Ada" }, tags: [{ tag_name: "admin" }] }
    ]
    assert.deepStrictEqual(Statement.defaultTransforms(Str.snakeToCamel).array(rows), [
      { userId: 1, profileData: { displayName: "Ada" }, tags: [{ tagName: "admin" }] }
    ])
    assert.deepStrictEqual(Statement.defaultTransforms(Str.snakeToCamel, false).array(rows), [
      { userId: 1, profileData: { display_name: "Ada" }, tags: [{ tag_name: "admin" }] }
    ])
  })

  it("keeps null and scalar items in transformed arrays", () => {
    const rows: Array<Record<string, unknown>> = [{ posts: [null], tags: [{ tag_name: "admin" }, null, 1] }]
    assert.deepStrictEqual(Statement.defaultTransforms(Str.snakeToCamel).array(rows), [
      { posts: [null], tags: [{ tagName: "admin" }, null, 1] }
    ])
    assert.deepStrictEqual(
      Statement.defaultTransforms(Str.snakeToCamel, false).value([{ tag_name: "admin" }, null, 1]),
      [{ tagName: "admin" }, null, 1]
    )
  })

  it("keeps previously distinct SQL column names distinct", () => {
    const rows: Array<Record<string, unknown>> = [
      { _id: 1, id: 2, foo__bar: 3, foo_bar: 4, _: 5, ___: 6 }
    ]
    assert.deepStrictEqual(
      Statement.defaultTransforms(Str.snakeToCamel).array(rows),
      [{ _id: 1, id: 2, foo_bar: 3, fooBar: 4, _: 5, __: 6 }]
    )
    assert.deepStrictEqual(
      Statement.defaultTransforms(Str.snakeToPascal).array(rows),
      [{ _id: 1, Id: 2, Foo_bar: 3, FooBar: 4, _: 5, __: 6 }]
    )
  })

  it("defaultTransforms ignores inherited properties", () => {
    const row = Object.create({ inherited: 1 })
    row.own = 2

    const nested = Statement.defaultTransforms((key) => key.toUpperCase())
    const flat = Statement.defaultTransforms((key) => key.toUpperCase(), false)

    assert.deepStrictEqual(nested.object(row), { OWN: 2 })
    assert.deepStrictEqual(nested.array([row]), [{ OWN: 2 }])
    assert.deepStrictEqual(nested.array([[row]]), [[{ OWN: 2 }]])
    assert.deepStrictEqual(flat.array([row]), [{ OWN: 2 }])
  })

  it("compiles one fragment independently for each compiler", () => {
    const postgres = Statement.makeCompiler({
      dialect: "pg",
      placeholder: (index) => `$${index}`,
      onIdentifier: Statement.defaultEscape("\""),
      onRecordUpdate: () => ["", []],
      onCustom: () => ["", []]
    })
    const sqlite = Statement.makeCompilerSqlite()
    const fragment = Statement.fragment([
      Statement.identifier("value"),
      Statement.parameter(1)
    ])

    assert.deepStrictEqual(postgres.compile(fragment, false), ["\"value\"$1", [1]])
    assert.deepStrictEqual(sqlite.compile(fragment, false), ["\"value\"?", [1]])
  })

  it("escapes updateValues aliases without transforming them", () => {
    const compiler = Statement.makeCompiler({
      dialect: "pg",
      placeholder: (index) => `$${index}`,
      onIdentifier: (value, withoutTransform) => Statement.defaultEscape("\"")(withoutTransform ? value : `t_${value}`),
      onRecordUpdate: (placeholders, alias, columns, values) => [
        `(values ${placeholders}) AS ${alias}${columns}`,
        values.flat()
      ],
      onCustom: () => ["", []]
    })
    const fragment = Statement.fragment([
      Statement.recordUpdateHelper([{ name: "Ada" }], "My\"Data --")
    ])

    assert.deepStrictEqual(compiler.compile(fragment, false), [
      "(values ($1)) AS \"My\"\"Data --\"(\"t_name\")",
      ["Ada"]
    ])
  })

  it("binds plain objects shaped like fragments or segments as parameters", () => {
    const sql = Statement.make({} as any, Statement.makeCompilerSqlite(), [], undefined)
    const fragmentLike = {
      "~effect/sql/Statement/Fragment": "~effect/sql/Statement/Fragment",
      segments: [{ _tag: "Literal", value: "1=1" }]
    }
    const segmentLike = { _tag: "Literal", value: "1=1" }

    assert.deepStrictEqual(sql`SELECT ${fragmentLike}, ${segmentLike}`.compile(), [
      "SELECT ?, ?",
      [fragmentLike, segmentLike]
    ])
  })

  it("renumbers a cached returning fragment", () => {
    const sql = Statement.make(
      Effect.void as any,
      Statement.makeCompiler({
        dialect: "pg",
        placeholder: (index) => `$${index}`,
        onIdentifier: Statement.defaultEscape("\""),
        onRecordUpdate: () => ["", []],
        onCustom: () => ["", []]
      }),
      [],
      undefined
    )
    const returning = sql`${"label"} AS label`

    assert.deepStrictEqual(returning.compile(), ["$1 AS label", ["label"]])
    assert.deepStrictEqual(
      sql`INSERT INTO people ${sql.insert({ name: "Ada" }).returning(returning)}, ${"extra"} AS extra`.compile(),
      ["INSERT INTO people (\"name\") VALUES ($1) RETURNING $2 AS label, $3 AS extra", ["Ada", "label", "extra"]]
    )
  })

  it.effect("reads propagation overrides when executing existing statements and streams", () =>
    Effect.gen(function*() {
      let expected = "none"
      const sql = yield* makeClient(Effect.map(Effect.option(Effect.currentSpan), (span) => {
        assert.strictEqual(Option.isSome(span) ? span.value.name : "none", expected)
      }))
      const query = sql`select 1`
      const run = Effect.andThen(query, Stream.runDrain(query.stream))

      yield* run
      expected = "sql.execute"
      yield* Effect.provideService(run, Statement.SpanPropagationEnabled, true)
      expected = "none"
      yield* run.pipe(
        Effect.provideService(Statement.SpanPropagationEnabled, false),
        Effect.provideService(Statement.SpanPropagationEnabled, true)
      )
    }).pipe(Effect.provide(Reactivity.layer)))

  it.effect("parents acquisition, execution, and pulls without adding stack frames", () =>
    Effect.gen(function*() {
      const frame = yield* Effect.service(References.CurrentStackFrame)
      const observe = Effect.gen(function*() {
        assert.strictEqual((yield* Effect.orDie(Effect.currentSpan)).name, "sql.execute")
        assert.strictEqual(yield* Effect.service(References.CurrentStackFrame), frame)
      })
      const acquired = yield* makeClient(observe)
      const borrowed = yield* makeClient(observe, true)

      yield* Effect.gen(function*() {
        yield* acquired`select 1`
        yield* borrowed`select 1`
        yield* Stream.runDrain(borrowed`select 1`.stream)
      }).pipe(Effect.provideService(Statement.SpanPropagationEnabled, true))
    }).pipe(Effect.provide(Reactivity.layer)))

  it.effect("records how long a statement waited for a connection", () =>
    Effect.gen(function*() {
      const spans: Array<Tracer.NativeSpan> = []
      const tracer = Tracer.make({
        span(options) {
          const span = new Tracer.NativeSpan(options)
          spans.push(span)
          return span
        }
      })
      const acquired = yield* makeClient(Effect.void, false, Effect.sleep("30 millis"))
      const borrowed = yield* makeClient(Effect.void, true, Effect.sleep("30 millis"))
      const run = Effect.fnUntraced(function*(statement: Effect.Effect<unknown, unknown>, propagate: boolean) {
        const fiber = yield* Effect.forkChild(
          statement.pipe(
            Effect.withTracer(tracer),
            Effect.provideService(Statement.SpanPropagationEnabled, propagate)
          )
        )
        yield* TestClock.adjust("30 millis")
        yield* Fiber.join(fiber)
      })

      for (const propagate of [true, false]) {
        yield* run(acquired`select 1`, propagate)
        yield* run(borrowed`select 1`, propagate)
        yield* run(Stream.runDrain(acquired`select 1`.stream), propagate)
      }
      assert.deepStrictEqual(
        spans.map((span) => span.attributes.get("db.client.connection.wait_time_ms")),
        [30, 30, 30, undefined, undefined, undefined]
      )
    }).pipe(Effect.provide(Reactivity.layer)))

  it.effect("skips propagation when tracing is disabled", () =>
    Effect.gen(function*() {
      const sql = yield* makeClient(Effect.map(Effect.option(Effect.currentSpan), (span) => {
        assert.isTrue(Option.isNone(span))
      }))
      yield* Effect.andThen(sql`select 1`, Stream.runDrain(sql`select 1`.stream)).pipe(
        Effect.provideService(Statement.SpanPropagationEnabled, true),
        Effect.provideService(References.TracerEnabled, false)
      )
    }).pipe(Effect.provide(Reactivity.layer)))
})

const makeClient = (observe: Effect.Effect<void>, borrow = false, acquire = observe) => {
  const execute = Effect.as(observe, [])
  const connection: Connection = {
    execute: () => execute,
    executeRaw: () => execute,
    executeValues: () => execute,
    executeUnprepared: () => execute,
    executeValuesUnprepared: () => execute,
    executeStream: () => Stream.fromEffect(execute)
  }
  return SqlClient.make({
    driver: "test",
    acquirer: Effect.as(acquire, connection),
    borrower: borrow ? (f) => Effect.andThen(acquire, f(connection)) : undefined,
    compiler: Statement.makeCompilerSqlite(),
    spanAttributes: []
  })
}
