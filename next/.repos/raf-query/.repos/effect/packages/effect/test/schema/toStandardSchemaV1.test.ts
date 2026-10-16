import { assertTrue, deepStrictEqual, strictEqual } from "@effect/vitest/utils"
import { Context, Effect, type Option, Predicate, Schema, SchemaGetter, SchemaIssue } from "effect"
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
