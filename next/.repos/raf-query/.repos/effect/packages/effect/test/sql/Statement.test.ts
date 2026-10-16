import { assert, describe, it } from "@effect/vitest"
import { Effect, Option, References, Stream } from "effect"
import * as Reactivity from "effect/reactivity/Reactivity"
import * as SqlClient from "effect/sql/SqlClient"
import type { Connection } from "effect/sql/SqlConnection"
import * as Statement from "effect/sql/Statement"

describe("Statement", () => {
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

const makeClient = (observe: Effect.Effect<void>, borrow = false) => {
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
    acquirer: Effect.as(observe, connection),
    borrower: borrow ? (f) => Effect.andThen(observe, f(connection)) : undefined,
    compiler: Statement.makeCompilerSqlite(),
    spanAttributes: []
  })
}
