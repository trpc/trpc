import { assert, describe, it } from "@effect/vitest"
import { type Array as Arr, type Channel, Effect, Schema, SchemaGetter, SchemaIssue, Stream } from "effect"
import { Csv } from "effect/encoding"

const run = <I, A, E>(
  input: ReadonlyArray<I>,
  channel: Channel.Channel<Arr.NonEmptyReadonlyArray<A>, E, unknown, Arr.NonEmptyReadonlyArray<I>, never, unknown>
) => Stream.fromArray(input).pipe(Stream.pipeThroughChannel(channel), Stream.runCollect)

const issuePaths = (error: Schema.SchemaError) =>
  SchemaIssue.makeFormatterStandardSchemaV1()(error.issue).issues.map((issue) => issue.path)

const Person = Schema.Struct({ name: Schema.String, age: Schema.FiniteFromString }).pipe(
  Schema.encodeKeys({ name: "Full Name", age: "Age (years)" })
)

describe("Csv", () => {
  it("identifies Csv errors", () => {
    assert.isTrue(Csv.isCsvError(new Csv.CsvError({ kind: "Syntax", message: "boom", record: 1, line: 1 })))
    assert.isFalse(Csv.isCsvError({ _tag: "CsvError" }))
    assert.isFalse(Csv.isCsvError(null))
  })

  it.effect("decodes records split at every chunk boundary", () =>
    Effect.gen(function*() {
      const text = "﻿a,\"b,\r\nc\"\r\n\"d\"\"e\",\n\nf\rg\n"
      for (let i = 0; i <= text.length; i++) {
        const input = [text.slice(0, i), text.slice(i)]
        assert.deepStrictEqual(yield* run(input, Csv.decodeString()), [
          ["a", "b,\r\nc"],
          ["d\"e", ""],
          [""],
          ["f"],
          ["g"]
        ])
        assert.deepStrictEqual(yield* run(input, Csv.decodeString({ ignoreEmptyLines: true })), [
          ["a", "b,\r\nc"],
          ["d\"e", ""],
          ["f"],
          ["g"]
        ])
      }
      assert.deepStrictEqual(yield* run(["a;\"b;c\""], Csv.decodeString({ delimiter: ";" })), [["a", "b;c"]])
    }))

  it.effect("reports syntax errors with record, line and column", () =>
    Effect.gen(function*() {
      for (
        const [text, record, line, column] of [
          ["a,b\n\"x\ny\",c\"d\n", 2, 2, 2],
          ["a\n\nb,\"c\"x", 3, 3, 2],
          ["a,\"b", 1, 1, 2]
        ] as const
      ) {
        const error = yield* Effect.flip(run([text], Csv.decodeString()))
        assert.deepStrictEqual([error.kind, error.record, error.line, error.column], ["Syntax", record, line, column])
      }
    }))

  it.effect("limits record size across chunks", () =>
    Effect.gen(function*() {
      assert.deepStrictEqual(yield* run(["ab", "c", "\n"], Csv.decodeString({ maxRecordSize: 3 })), [["abc"]])
      const boundaryError = yield* Effect.flip(run(["ab", "c", "d\n"], Csv.decodeString({ maxRecordSize: 3 })))
      assert.deepStrictEqual([boundaryError.kind, boundaryError.record, boundaryError.line], ["RecordSize", 1, 1])
      const error = yield* Effect.flip(run("abc\nabcd\n".split(""), Csv.decodeString({ maxRecordSize: 3 })))
      assert.deepStrictEqual([error.kind, error.record, error.line], ["RecordSize", 2, 2])
      const large = "a".repeat(1_048_577)
      assert.strictEqual((yield* Effect.flip(run([large], Csv.decodeString()))).kind, "RecordSize")
      assert.deepStrictEqual(yield* run([large], Csv.decodeString({ maxRecordSize: Infinity })), [[large]])
    }))

  it.effect("decodes header records with fresh state per run", () =>
    Effect.gen(function*() {
      const channel = Csv.decodeString({ headers: true })
      assert.deepStrictEqual(yield* run(["a,__proto__\n1,2\n"], channel), [
        Object.fromEntries([["a", "1"], ["__proto__", "2"]])
      ])
      assert.deepStrictEqual(yield* run(["b\n3"], channel), [{ b: "3" }])
      assert.deepStrictEqual(yield* run([], channel), [])
      assert.deepStrictEqual(yield* run(["a,b\n"], channel), [])
      for (const [text, record] of [["a,a\n1,2", 1], ["a,b\n1,2\n3", 3]] as const) {
        const error = yield* Effect.flip(run([text], channel))
        assert.deepStrictEqual(
          [error.kind, error.record, Object.hasOwn(error, "column"), error.column],
          ["Header", record, true, undefined]
        )
      }
    }))

  it("rejects invalid options at construction", () => {
    for (const delimiter of ["", ";;", "\"", "\n", "\r"]) {
      assert.throws(() => Csv.decodeString({ delimiter }))
      assert.throws(() => Csv.encodeString({ delimiter }))
    }
    assert.throws(() => Csv.decodeString({ maxRecordSize: 0 }))
    assert.throws(() => Csv.encodeString({ headers: true }))
    const Tuple = Schema.Tuple([Schema.String])
    assert.throws(() => Csv.encodeSchemaString(Tuple)({ headers: true }))
    const Tags = Schema.Struct({ tags: Schema.Array(Schema.String) })
    assert.throws(() => Csv.decodeSchemaString(Tags)({ headers: true }), /column "tags".*not a string/)
    assert.throws(() => Csv.encodeSchemaString(Tags)(), /column "tags".*not a string/)
    const Count = Schema.Struct({ n: Schema.Number })
    assert.throws(
      () => Csv.decodeSchemaString(Count)({ headers: true, disableCodecs: true }),
      /column "n".*not a string/
    )
    const Lazy = Schema.suspend(() => Tags)
    assert.throws(() => Csv.encodeSchemaString(Lazy)({ columns: ["tags"] }), /column "tags".*not a string/)
    const Tagged = Schema.Union([
      Schema.Struct({ kind: Schema.Literal("one"), tags: Schema.String }),
      Schema.Struct({ kind: Schema.Literal("many"), tags: Schema.Array(Schema.String) })
    ])
    assert.throws(() => Csv.encodeSchemaString(Tagged)({ columns: ["kind", "tags"] }), /column "tags".*not a string/)
  })

  it.effect("encodes rows and header records", () =>
    Effect.gen(function*() {
      const rows = [[""], ["a,b", "c\"d", "e\nf", "g\rh"], ["", " x "]]
      const text = (yield* run(rows, Csv.encodeString())).join("")
      assert.strictEqual(text, "\"\"\r\n\"a,b\",\"c\"\"d\",\"e\nf\",\"g\rh\"\r\n, x \r\n")
      assert.deepStrictEqual(yield* run([text], Csv.decodeString()), rows)
      assert.deepStrictEqual(yield* run([["a;b", "c,d"]], Csv.encodeString({ delimiter: ";", newline: "\n" })), [
        "\"a;b\";c,d\n"
      ])
      for (const delimiter of ["]", "[", "^", "-", "\\"]) {
        assert.deepStrictEqual(yield* run([["a" + delimiter + "b", "c"]], Csv.encodeString({ delimiter })), [
          "\"a" + delimiter + "b\"" + delimiter + "c\r\n"
        ])
      }
      const records = [{ a: "1", b: "2", c: "ignored" }, { a: undefined }, {}]
      assert.strictEqual(
        (yield* run(records, Csv.encodeString({ columns: ["b", "a"], headers: true }))).join(""),
        "b,a\r\n2,1\r\n,\r\n,\r\n"
      )
    }))

  it.effect("decodes and encodes UTF-8 bytes", () =>
    Effect.gen(function*() {
      const bytes = new TextEncoder().encode("\"Zoë\",東京\r\n\"a,b\",é\r\n")
      const rows = yield* Stream.fromArray(Array.from(bytes, (byte) => Uint8Array.of(byte))).pipe(
        Stream.pipeThroughChannel(Csv.decode()),
        Stream.runCollect
      )
      assert.deepStrictEqual(rows, [["Zoë", "東京"], ["a,b", "é"]])
      const encoded = yield* Stream.fromArray(rows).pipe(Stream.pipeThroughChannel(Csv.encode()), Stream.runCollect)
      const decoder = new TextDecoder()
      assert.strictEqual(
        encoded.map((chunk) => decoder.decode(chunk, { stream: true })).join("") + decoder.decode(),
        "Zoë,東京\r\n\"a,b\",é\r\n"
      )
      const boms = new TextEncoder().encode("\uFEFF\uFEFFa\n")
      assert.deepStrictEqual(yield* run([boms.subarray(0, 2), boms.subarray(2, 4), boms.subarray(4)], Csv.decode()), [[
        "\uFEFFa"
      ]])
    }))

  it.effect("decodes schemas and rebases issue paths onto record numbers", () =>
    Effect.gen(function*() {
      const text = "Full Name,Age (years)\nAlice,32\n\nBob,oops\nCarol,x\n"
      const channel = Csv.decodeSchemaString(Person)
      const options = { headers: true, ignoreEmptyLines: true } as const
      assert.deepStrictEqual(yield* run(["Full Name,Age (years)\nAlice,32\n"], channel(options)), [
        { name: "Alice", age: 32 }
      ])
      const first = yield* Effect.flip(run([text], channel(options)))
      assert.instanceOf(first, Schema.SchemaError)
      assert.deepStrictEqual(issuePaths(first as Schema.SchemaError), [[4, "age"]])
      const all = yield* Effect.flip(run([text], channel(options, { errors: "all" })))
      assert.deepStrictEqual(issuePaths(all as Schema.SchemaError), [[4, "age"], [5, "age"]])
    }))

  it.effect("encodes schemas with derived columns", () =>
    Effect.gen(function*() {
      const people = [{ name: "Alice", age: 32 }]
      assert.deepStrictEqual(yield* run(people, Csv.encodeSchemaString(Person)({ headers: true })), [
        "Full Name,Age (years)\r\n",
        "Alice,32\r\n"
      ])
      assert.deepStrictEqual(yield* run(people, Csv.encodeSchemaString(Person)()), ["Alice,32\r\n"])
      assert.deepStrictEqual(
        yield* run(people, Csv.encodeSchemaString(Person)({ columns: ["Age (years)"], headers: true })),
        ["Age (years)\r\n", "32\r\n"]
      )
      const Note = Schema.Struct({ name: Schema.String, note: Schema.optional(Schema.String) })
      assert.deepStrictEqual(yield* run([{ name: "A" }], Csv.encodeSchemaString(Note)()), ["A,\r\n"])
      const Positive = Schema.Struct({ n: Schema.NumberFromString.pipe(Schema.check(Schema.isGreaterThan(0))) })
      const error = yield* Effect.flip(run([{ n: 1 }, { n: -1 }], Csv.encodeSchemaString(Positive)()))
      assert.deepStrictEqual(issuePaths(error), [[2, "n"]])
    }))

  it.effect("converts non-string columns with the StringTree codec", () =>
    Effect.gen(function*() {
      const Entry = Schema.Struct({
        n: Schema.Number,
        b: Schema.Boolean,
        d: Schema.Date,
        score: Schema.optional(Schema.Number),
        note: Schema.String
      })
      const text = "n,b,d,score,note\r\n1,true,1970-01-01T00:00:00.000Z,,\r\n"
      const entries = yield* run([text], Csv.decodeSchemaString(Entry)({ headers: true }))
      assert.deepStrictEqual(entries, [{ n: 1, b: true, d: new Date(0), note: "" }])
      assert.strictEqual((yield* run(entries, Csv.encodeSchemaString(Entry)({ headers: true }))).join(""), text)
      const Lazy = Schema.suspend(() => Schema.Struct({ score: Schema.optional(Schema.Number) }))
      assert.deepStrictEqual(yield* run(["score\n\"\"\n"], Csv.decodeSchemaString(Lazy)({ headers: true })), [{}])
    }))

  it.effect("round trips tuple schemas by position", () =>
    Effect.gen(function*() {
      const TuplePerson = Schema.Tuple([Schema.String, Schema.NumberFromString]).pipe(
        Schema.decodeTo(Schema.Struct({ name: Schema.String, age: Schema.Number }), {
          decode: SchemaGetter.transform(([name, age]) => ({ name, age })),
          encode: SchemaGetter.transform(({ name, age }) => [name, age] as const)
        })
      )
      const text = yield* run([{ name: "Alice", age: 32 }], Csv.encodeSchemaString(TuplePerson)())
      assert.deepStrictEqual(text, ["Alice,32\r\n"])
      assert.deepStrictEqual(yield* run(text, Csv.decodeSchemaString(TuplePerson)()), [{ name: "Alice", age: 32 }])
    }))

  it.effect("fails with upstream errors without flushing a partial record", () =>
    Effect.gen(function*() {
      const error = yield* Stream.make("\"unfinished").pipe(
        Stream.concat(Stream.fail("upstream")),
        Stream.pipeThroughChannel(Csv.decodeString<string>()),
        Stream.runCollect,
        Effect.flip
      )
      assert.strictEqual(error, "upstream")
    }))
})
