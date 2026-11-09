import { assertTrue, deepStrictEqual, strictEqual } from "@effect/vitest/utils"
import { Context, Effect, type Option, Predicate, Result, Schema, SchemaGetter, SchemaIssue } from "effect"
import type { StandardSchemaV1 } from "effect/StandardSchema"
import { describe, it } from "vitest"

function validate<I, A>(
  schema: StandardSchemaV1<I, A>,
  input: unknown
): StandardSchemaV1.Result<A> | Promise<StandardSchemaV1.Result<A>> {
  return schema["~standard"].validate(input)
}

const isPromise = (value: unknown): value is Promise<unknown> => value instanceof Promise

const expectSuccess = <A>(result: StandardSchemaV1.Result<A>, a: A) => {
  deepStrictEqual(result, { value: a })
}

const expectSyncSuccess = <I, A>(
  schema: StandardSchemaV1<I, A>,
  input: unknown,
  a: A
) => {
  const result = validate(schema, input)
  if (isPromise(result)) {
    throw new Error("Expected value, got promise")
  } else {
    expectSuccess(result, a)
  }
}

const expectFailure = <A>(
  result: StandardSchemaV1.Result<A>,
  issues: ReadonlyArray<StandardSchemaV1.Issue> | ((issues: ReadonlyArray<StandardSchemaV1.Issue>) => void)
) => {
  if (result.issues !== undefined) {
    if (Predicate.isFunction(issues)) {
      issues(result.issues)
    } else {
      deepStrictEqual(
        result.issues.map((issue) => ({
          message: issue.message,
          path: issue.path
        })),
        issues
      )
    }
  } else {
    throw new Error("Expected issues, got undefined")
  }
}

const expectAsyncSuccess = async <I, A>(
  schema: StandardSchemaV1<I, A>,
  input: unknown,
  a: A
) => {
  const result = validate(schema, input)
  if (isPromise(result)) {
    expectSuccess(await result, a)
  } else {
    throw new Error("Expected promise, got value")
  }
}

const expectSyncFailure = <I, A>(
  schema: StandardSchemaV1<I, A>,
  input: unknown,
  issues: ReadonlyArray<StandardSchemaV1.Issue> | ((issues: ReadonlyArray<StandardSchemaV1.Issue>) => void)
) => {
  const result = validate(schema, input)
  if (isPromise(result)) {
    throw new Error("Expected value, got promise")
  } else {
    expectFailure(result, issues)
  }
}

const expectFormattedFailure = (
  schema: Schema.ConstraintDecoder<unknown>,
  input: unknown,
  issues: ReadonlyArray<StandardSchemaV1.Issue>,
  message: string
) => {
  expectSyncFailure(Schema.toStandardSchemaV1(schema), input, issues)
  const result = Schema.decodeUnknownResult(schema, { errors: "all" })(input)
  assertTrue(Result.isFailure(result))
  strictEqual(SchemaIssue.makeFormatterDefault()(result.failure.issue), message)
}

const expectAsyncFailure = async <I, A>(
  schema: StandardSchemaV1<I, A>,
  input: unknown,
  issues: ReadonlyArray<StandardSchemaV1.Issue> | ((issues: ReadonlyArray<StandardSchemaV1.Issue>) => void)
) => {
  const result = validate(schema, input)
  if (isPromise(result)) {
    expectFailure(await result, issues)
  } else {
    throw new Error("Expected promise, got value")
  }
}

const AsyncString = Schema.String.pipe(Schema.decode({
  decode: SchemaGetter.transformOptionalEffect((os: Option.Option<string>) =>
    Effect.gen(function*() {
      yield* Effect.sleep("10 millis")
      return os
    })
  ),
  encode: SchemaGetter.passthrough()
}))

const AsyncNonEmptyString = AsyncString.check(Schema.isNonEmpty())

describe("toStandardSchemaV1", () => {
  it("can re-adapt a frozen adapter with a custom hook", () => {
    const frozen = Object.freeze(Schema.toStandardSchemaV1(Schema.String))
    const custom = Schema.toStandardSchemaV1(frozen, { leafHook: () => "Custom message" })

    expectSyncFailure(custom, null, [{ message: "Custom message", path: [] }])
  })

  it("isolates leafHook between adaptations of the same schema", () => {
    const schema = Schema.String.annotate({})
    const standard = Schema.toStandardSchemaV1(schema)
    const custom = Schema.toStandardSchemaV1(schema, { leafHook: () => "Custom message" })

    expectSyncFailure(custom, null, [{ message: "Custom message", path: [] }])
    expectSyncFailure(standard, null, [{ message: "Expected string", path: [] }])
  })

  it("retains validation when piping a class adapter into the JSON-schema adapter", () => {
    class Parent extends Schema.Class<Parent>("Parent")({ a: Schema.String }) {}
    const adapted = Schema.toStandardSchemaV1(Parent, { leafHook: () => "Custom message" })
    const both = adapted.pipe(Schema.toStandardJSONSchemaV1)

    expectSyncFailure(both, { a: null }, [{ message: "Custom message", path: ["a"] }])
  })

  it("validates subclass fields when the parent already has a Standard Schema adapter", () => {
    class Parent extends Schema.Class<Parent>("Parent")({ a: Schema.String }) {}
    const parent = Schema.toStandardJSONSchemaV1(Schema.toStandardSchemaV1(Parent))
    class Child extends parent.extend<Child>("Child")({ b: Schema.Number }) {}
    const child = Schema.toStandardSchemaV1(Child)

    strictEqual("jsonSchema" in child["~standard"], false)
    expectSyncSuccess(parent, { a: "a" }, new Parent({ a: "a" }))
    expectSyncFailure(child, { a: "a" }, [{ path: ["b"], message: "Missing key" }])
    expectSyncSuccess(child, { a: "a", b: 1 }, new Child({ a: "a", b: 1 }))
  })

  it("should return a Standard Schema V1 schema", () => {
    const schema = Schema.FiniteFromString
    const standardSchema = Schema.toStandardSchemaV1(schema)
    assertTrue(Schema.isSchema(standardSchema))
  })

  it("should support both standards", () => {
    const schema = Schema.String
    const both = Schema.toStandardJSONSchemaV1(Schema.toStandardSchemaV1(schema))
    expectSyncSuccess(both, "a", "a")
  })

  it("sync decoding", () => {
    const schema = Schema.NonEmptyString
    const standardSchema = Schema.toStandardSchemaV1(schema)
    expectSyncSuccess(standardSchema, "a", "a")
    expectSyncFailure(standardSchema, null, [
      {
        message: "Expected string",
        path: []
      }
    ])
    expectSyncFailure(standardSchema, "", [
      {
        message: `Expected a value with a length of at least 1`,
        path: []
      }
    ])
  })

  it("async decoding", async () => {
    const schema = AsyncNonEmptyString
    const standardSchema = Schema.toStandardSchemaV1(schema)
    await expectAsyncSuccess(standardSchema, "a", "a")
    expectSyncFailure(standardSchema, null, [
      {
        message: "Expected string",
        path: []
      }
    ])
    await expectAsyncFailure(standardSchema, "", [
      {
        message: `Expected a value with a length of at least 1`,
        path: []
      }
    ])
  })

  describe("missing dependencies", () => {
    class MagicNumber extends Context.Service<MagicNumber, number>()("MagicNumber") {}

    it("sync decoding should throw", () => {
      const DepString = Schema.Number.pipe(Schema.decode({
        decode: SchemaGetter.transformEffect((n) =>
          Effect.gen(function*() {
            const magicNumber = yield* MagicNumber
            return n * magicNumber
          })
        ),
        encode: SchemaGetter.passthrough()
      }))

      const schema = DepString
      const standardSchema = Schema.toStandardSchemaV1(schema as any)
      expectSyncFailure(standardSchema, 1, (issues) => {
        strictEqual(issues.length, 1)
        deepStrictEqual(issues[0].path, undefined)
        assertTrue(issues[0].message.includes("Service not found: MagicNumber"))
      })
    })

    it("async decoding should report a missing dependency", () => {
      const DepString = Schema.Number.pipe(Schema.decode({
        decode: SchemaGetter.transformEffect((n) =>
          Effect.gen(function*() {
            const magicNumber = yield* MagicNumber
            yield* Effect.sleep("10 millis")
            return n * magicNumber
          })
        ),
        encode: SchemaGetter.passthrough()
      }))

      const schema = DepString
      const standardSchema = Schema.toStandardSchemaV1(schema as any)
      expectSyncFailure(standardSchema, 1, (issues) => {
        strictEqual(issues.length, 1)
        deepStrictEqual(issues[0].path, undefined)
        assertTrue(issues[0].message.includes("Service not found: MagicNumber"))
      })
    })
  })

  it("by default should return all issues", () => {
    const schema = Schema.Struct({
      a: Schema.NonEmptyString,
      b: Schema.NonEmptyString
    })
    const standardSchema = Schema.toStandardSchemaV1(schema)
    expectSyncSuccess(standardSchema, { a: "a", b: "b" }, { a: "a", b: "b" })
    expectSyncFailure(standardSchema, null, [
      {
        message: "Expected object",
        path: []
      }
    ])
    expectSyncFailure(standardSchema, { a: "a", b: "" }, [
      {
        message: `Expected a value with a length of at least 1`,
        path: ["b"]
      }
    ])
    expectSyncFailure(standardSchema, { a: "", b: "b" }, [
      {
        message: `Expected a value with a length of at least 1`,
        path: ["a"]
      }
    ])
    expectSyncFailure(standardSchema, { a: "", b: "" }, [
      {
        message: `Expected a value with a length of at least 1`,
        path: ["a"]
      },
      {
        message: `Expected a value with a length of at least 1`,
        path: ["b"]
      }
    ])
  })

  it("with parseOptions: { errors: 'first' } should return only the first issue", () => {
    const schema = Schema.Struct({
      a: Schema.NonEmptyString,
      b: Schema.NonEmptyString
    })
    const standardSchema = Schema.toStandardSchemaV1(schema, { parseOptions: { errors: "first" } })
    expectSyncFailure(standardSchema, { a: "", b: "" }, [
      {
        message: `Expected a value with a length of at least 1`,
        path: ["a"]
      }
    ])
  })

  describe("should respect the `message` annotation", () => {
    it.each(["Custom message", ""])("preserves a custom filter's path with message %j", (message) => {
      const Passwords = Schema.Struct({ password: Schema.String, confirm: Schema.String })
      const schema = Passwords.check(Schema.makeFilter(
        (value: typeof Passwords.Type) =>
          value.password === value.confirm || { path: ["confirm"], issue: "Passwords must match" },
        { message }
      ))
      expectFormattedFailure(
        schema,
        { password: "a", confirm: "b" },
        [{ message, path: ["confirm"] }],
        `${message}\n  at ["confirm"]`
      )
    })

    it("preserves annotated filter paths, ancestor paths, and sibling messages", () => {
      const record = Schema.Record(Schema.String, Schema.Number).check(
        Schema.isPropertyNames(Schema.String.check(Schema.isMaxLength(2)), { message: "Custom message" })
      )
      expectFormattedFailure(
        record,
        { abc: 1 },
        [{ message: "Custom message", path: ["abc"] }],
        `Custom message
  at ["abc"]`
      )
      const schema = Schema.Struct({
        records: Schema.Array(record),
        other: Schema.String
      })
      expectFormattedFailure(
        schema,
        { records: [{ abc: 1 }], other: null },
        [
          { message: "Custom message", path: ["records", 0, "abc"] },
          { message: "Expected string", path: ["other"] }
        ],
        `Custom message
  at ["records"][0]["abc"]
Expected string
  at ["other"]`
      )
    })

    it.each([
      { annotations: undefined, messages: ["Invalid a", "Invalid b"] },
      { annotations: { message: "Custom message" }, messages: ["Custom message", "Custom message"] }
    ])("formats grouped filter failures with annotations $annotations", ({ annotations, messages: [a, b] }) => {
      const schema = Schema.Struct({ a: Schema.String, b: Schema.String })
        .annotate({ message: "Struct message" })
        .check(Schema.makeFilter(
          () => [
            { path: ["a"], issue: "Invalid a" },
            { path: ["b"], issue: "Invalid b" }
          ],
          annotations
        ))
      expectFormattedFailure(schema, null, [{ message: "Struct message", path: [] }], "Struct message")
      expectFormattedFailure(
        schema,
        { a: "a", b: "b" },
        [
          { message: a, path: ["a"] },
          { message: b, path: ["b"] }
        ],
        `${a}
  at ["a"]
${b}
  at ["b"]`
      )
    })

    it.each([
      { annotations: undefined, message: "Returned message" },
      { annotations: { message: "Filter message" }, message: "Filter message" },
      { annotations: { message: "" }, message: "" }
    ])("formats a directly returned message with annotations $annotations", ({ annotations, message }) => {
      const schema = Schema.String.check(Schema.makeFilter(() => "Returned message", annotations))
      expectFormattedFailure(schema, "", [{ message, path: [] }], message)
    })

    describe("String", () => {
      it("String & annotation", () => {
        const schema = Schema.String.annotate({ message: "Custom message" })
        const standardSchema = Schema.toStandardSchemaV1(schema)
        expectSyncFailure(standardSchema, null, [
          {
            message: "Custom message",
            path: []
          }
        ])
      })

      it("String & annotation & isNonEmpty", () => {
        const schema = Schema.String.annotate({ message: "Custom message" }).check(Schema.isNonEmpty())
        const standardSchema = Schema.toStandardSchemaV1(schema)
        expectSyncFailure(standardSchema, null, [
          {
            message: "Custom message",
            path: []
          }
        ])
      })

      it("String & isNonEmpty & annotation", () => {
        const schema = Schema.String.check(Schema.isNonEmpty()).annotate({ message: "Custom message" })
        const standardSchema = Schema.toStandardSchemaV1(schema)
        expectSyncFailure(standardSchema, null, [
          {
            message: "Expected string",
            path: []
          }
        ])
        expectSyncFailure(standardSchema, "", [
          {
            message: "Custom message",
            path: []
          }
        ])
      })

      it("String & isNonEmpty(annotation)", () => {
        const schema = Schema.String.check(Schema.isNonEmpty({ message: "Custom message" }))
        const standardSchema = Schema.toStandardSchemaV1(schema)
        expectSyncFailure(standardSchema, null, [
          {
            message: "Expected string",
            path: []
          }
        ])
        expectSyncFailure(standardSchema, "", [
          {
            message: "Custom message",
            path: []
          }
        ])
      })

      it("String & annotation & isNonEmpty & annotation", () => {
        const schema = Schema.String.annotate({ message: "Custom message" }).check(Schema.isNonEmpty()).annotate({
          message: "Custom message 2"
        })
        const standardSchema = Schema.toStandardSchemaV1(schema)
        expectSyncFailure(standardSchema, null, [
          {
            message: "Custom message",
            path: []
          }
        ])
        expectSyncFailure(standardSchema, "", [
          {
            message: "Custom message 2",
            path: []
          }
        ])
      })

      it("String & annotation & isNonEmpty(annotation)", () => {
        const schema = Schema.String.annotate({ message: "Custom message" }).check(
          Schema.isNonEmpty({ message: "Custom message 2" })
        )
        const standardSchema = Schema.toStandardSchemaV1(schema)
        expectSyncFailure(standardSchema, null, [
          {
            message: "Custom message",
            path: []
          }
        ])
        expectSyncFailure(standardSchema, "", [
          {
            message: "Custom message 2",
            path: []
          }
        ])
      })

      it("String & annotation & isNonEmpty(annotation) & isMaxLength(annotation)", () => {
        const schema = Schema.String.annotate({ message: "Custom message" })
          .check(Schema.isNonEmpty({ message: "Custom message 2" }))
          .check(Schema.isMaxLength(2, { message: "Custom message 3" }))
        const standardSchema = Schema.toStandardSchemaV1(schema)
        expectSyncFailure(standardSchema, null, [
          {
            message: "Custom message",
            path: []
          }
        ])
        expectSyncFailure(standardSchema, "", [
          {
            message: "Custom message 2",
            path: []
          }
        ])
        expectSyncFailure(standardSchema, "abc", [
          {
            message: "Custom message 3",
            path: []
          }
        ])
      })
    })

    describe("Struct", () => {
      it("messageMissingKey", () => {
        const schema = Schema.Struct({
          a: Schema.String.annotateKey({ messageMissingKey: "Custom message" })
        })
        const standardSchema = Schema.toStandardSchemaV1(schema)
        expectSyncFailure(standardSchema, {}, [
          {
            message: "Custom message",
            path: ["a"]
          }
        ])
      })

      it("messageUnexpectedKey", () => {
        const schema = Schema.Struct({
          a: Schema.String
        }).annotate({ messageUnexpectedKey: "Custom message" })
        const standardSchema = Schema.toStandardSchemaV1(schema, {
          parseOptions: { onExcessProperty: "error" }
        })
        expectSyncFailure(standardSchema, { a: "a", b: "b" }, [
          {
            message: "Custom message",
            path: ["b"]
          }
        ])
      })
    })

    describe("Tuple", () => {
      it("messageMissingKey", () => {
        const schema = Schema.Tuple([
          Schema.String.annotateKey({ messageMissingKey: "Custom message" })
        ])
        const standardSchema = Schema.toStandardSchemaV1(schema)
        expectSyncFailure(standardSchema, [], [
          {
            message: "Custom message",
            path: [0]
          }
        ])
      })

      it("messageUnexpectedKey", () => {
        const schema = Schema.Tuple([
          Schema.String
        ]).annotate({ messageUnexpectedKey: "Custom message" })
        const standardSchema = Schema.toStandardSchemaV1(schema, {
          parseOptions: { onExcessProperty: "error" }
        })
        expectSyncFailure(standardSchema, ["a", "b"], [
          {
            message: "Custom message",
            path: [1]
          }
        ])
      })
    })

    describe("Union", () => {
      it("Literals", () => {
        const schema = Schema.Literals(["a", "b"]).annotate({ message: "Custom message" })
        const standardSchema = Schema.toStandardSchemaV1(schema)
        expectSyncFailure(standardSchema, null, [
          {
            message: "Custom message",
            path: []
          }
        ])
        expectSyncFailure(standardSchema, "-", [
          {
            message: "Custom message",
            path: []
          }
        ])
      })
    })
  })

  describe("treeLeafHook & verboseCheckHook", () => {
    it("String", () => {
      const schema = Schema.String
      const standardSchema = Schema.toStandardSchemaV1(schema, {
        leafHook: SchemaIssue.defaultLeafHook
      })
      expectSyncFailure(standardSchema, null, [
        {
          message: "Expected string",
          path: []
        }
      ])
    })

    it("NonEmptyString", () => {
      const schema = Schema.NonEmptyString
      const standardSchema = Schema.toStandardSchemaV1(schema, {
        leafHook: SchemaIssue.defaultLeafHook
      })
      expectSyncFailure(standardSchema, "", [
        {
          message: `Expected a value with a length of at least 1`,
          path: []
        }
      ])
    })
  })
})
