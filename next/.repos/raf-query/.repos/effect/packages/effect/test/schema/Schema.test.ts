import { assert, describe, it } from "@effect/vitest"
import {
  BigDecimal,
  Brand,
  ByteSize,
  Cause,
  Chunk,
  Context,
  DateTime,
  Deferred,
  Duration,
  Effect,
  Equal,
  Exit,
  Fiber,
  flow,
  HashMap,
  HashSet,
  Option,
  Order,
  pipe,
  Predicate,
  Redacted,
  Result,
  Schema,
  SchemaAST,
  SchemaGetter,
  SchemaIssue,
  SchemaParser,
  SchemaTransformation,
  String as Str,
  Struct,
  Tuple
} from "effect"
import { TestSchema } from "effect/testing"
import { produce } from "immer"
import { deepStrictEqual, fail, strictEqual } from "node:assert"
import {
  assertExitSuccess,
  assertFalse,
  assertInclude,
  assertSchemaIssueError,
  assertTrue,
  throws
} from "../utils/assert.ts"

const verifyGeneration = true

const equals = TestSchema.Asserts.ast.fields.equals
const formatIssue = SchemaIssue.makeFormatterDefault()

const SnakeToCamel = Schema.String.pipe(
  Schema.decode(
    SchemaTransformation.snakeToCamel()
  )
)

describe("Schema", () => {
  it("keeps synchronous decode and encode effects eager", () => {
    // A synchronous parser already produces an `Exit`, so the adapter must hand
    // it back as-is instead of wrapping it in something a fiber has to run.
    const eagerExit = <A>(effect: Effect.Effect<A, Schema.SchemaError>): Exit.Exit<A, Schema.SchemaError> => {
      assertTrue(Exit.isExit(effect), "expected the adapter to return an Exit")
      return effect as Exit.Exit<A, Schema.SchemaError>
    }
    const schemaError = <A>(exit: Exit.Exit<A, Schema.SchemaError>) =>
      Exit.isFailure(exit) ? Cause.findErrorOption(exit.cause) : Option.none()

    assertExitSuccess(eagerExit(Schema.decodeUnknownEffect(Schema.String)("a")), "a")
    assertExitSuccess(eagerExit(Schema.encodeUnknownEffect(Schema.String)("a")), "a")

    for (
      const effect of [
        Schema.decodeUnknownEffect(Schema.String)(null),
        Schema.encodeUnknownEffect(Schema.String)(null)
      ]
    ) {
      const error = schemaError(eagerExit(effect))
      assertTrue(Option.isSome(error) && Schema.isSchemaError(error.value))
    }
  })

  it("isSchema", () => {
    class A extends Schema.Class<A>("A")(Schema.Struct({
      a: Schema.String
    })) {}
    class B extends Schema.Opaque<B>()(Schema.Struct({ a: Schema.String })) {}
    assertTrue(Schema.isSchema(Schema.String))
    assertTrue(Schema.isSchema(A))
    assertTrue(Schema.isSchema(B))
    assertFalse(Schema.isSchema({}))
  })

  it("toString", () => {
    const schema = Schema.String
    const result = Schema.decodeUnknownExit(schema)(null)
    assertTrue(Exit.isFailure(result))
    strictEqual(String(result.cause.reasons[0]), "Fail(SchemaError(Expected string))")
  })

  describe("SchemaError", () => {
    it("extends Error and exposes the issue", () => {
      const result = SchemaParser.decodeUnknownResult(Schema.String)(null)
      assertTrue(Result.isFailure(result))
      const error = new Schema.SchemaError(result.failure)

      assertTrue(error instanceof Error)
      assertTrue(Schema.isSchemaError(error))
      assertFalse(Schema.isSchemaError({ "~effect/Schema/SchemaError": false }))
      strictEqual(error._tag, "SchemaError")
      strictEqual(error.name, "SchemaError")
      strictEqual(error.issue, result.failure)
      strictEqual(error.message, "Expected string")
      strictEqual(String(error), "SchemaError(Expected string)")
    })

    it("does not capture stack frames", () => {
      const result = SchemaParser.decodeUnknownResult(Schema.String)(null)
      assertTrue(Result.isFailure(result))
      const ErrorWithLimit = Error as typeof Error & { stackTraceLimit?: number | undefined }
      const stackTraceLimit = ErrorWithLimit.stackTraceLimit

      const error = new Schema.SchemaError(result.failure)

      strictEqual(error.stack, "SchemaError: Expected string")
      strictEqual(ErrorWithLimit.stackTraceLimit, stackTraceLimit)
    })
  })

  describe("parse options", () => {
    it("does not interpret custom parseOptions metadata", async () => {
      const schema = Schema.Number.check(Schema.isGreaterThan(0), Schema.isInt()).annotate({
        parseOptions: { errors: "all" }
      })
      const asserts = new TestSchema.Asserts(schema)

      const decoding = asserts.decoding()
      await decoding.fail(
        -1.2,
        "Expected a value greater than 0"
      )
    })

    it("applies errors to nested schemas without annotation overrides", async () => {
      const schema = Schema.Struct({
        a: Schema.String,
        b: Schema.Struct({
          c: Schema.String,
          d: Schema.String
        }).annotate({ parseOptions: { errors: "first" } })
      })
      const asserts = new TestSchema.Asserts(schema)

      const decoding = asserts.decoding({ parseOptions: { errors: "all" } })
      await decoding.fail(
        { a: "a", b: {} },
        `Missing key
  at ["b"]["c"]
Missing key
  at ["b"]["d"]`
      )
    })

    it("applies errors with encoding checks", async () => {
      const schema = Schema.Struct({
        a: Schema.String,
        b: Schema.String
      }).pipe(
        Schema.flip,
        Schema.check(Schema.isMaxProperties(1)),
        Schema.flip
      )
      assertTrue(SchemaAST.isObjects(schema.ast))
      strictEqual(schema.ast.checks, undefined)
      strictEqual(schema.ast.encodingChecks?.length, 1)
      const asserts = new TestSchema.Asserts(schema)

      const decoding = asserts.decoding({ parseOptions: { errors: "all" } })
      await decoding.fail(
        {},
        `Missing key
  at ["a"]
Missing key
  at ["b"]`
      )
    })
    it("decoders can receive options when they are created", () => {
      const schema = Schema.Struct({
        a: Schema.String
      })
      const decode = Schema.decodeUnknownExit(schema, { onExcessProperty: "error" })

      const failure = decode({ a: "a", b: "b" })
      assertTrue(Exit.isFailure(failure))

      const success = decode({ a: "a", b: "b" }, { onExcessProperty: "ignore" })
      assertTrue(Exit.isSuccess(success))
      deepStrictEqual(success.value, { a: "a" })
      assertTrue(Exit.isFailure(decode({ a: "a", b: "b" })))
    })

    it("encoders can receive options when they are created", () => {
      const schema = Schema.Struct({
        a: Schema.String
      })
      const encode = Schema.encodeUnknownExit(schema, { onExcessProperty: "error" })

      const failure = encode({ a: "a", b: "b" })
      assertTrue(Exit.isFailure(failure))

      const success = encode({ a: "a", b: "b" }, { onExcessProperty: "ignore" })
      assertTrue(Exit.isSuccess(success))
      deepStrictEqual(success.value, { a: "a" })
      assertTrue(Exit.isFailure(encode({ a: "a", b: "b" })))
    })
  })

  describe("Literal", () => {
    it("should throw an error if the literal is not a finite number", () => {
      throws(
        // @effect-diagnostics-next-line schemaLiteralNonFinite:off
        () => Schema.Literal(Infinity),
        new Error("A numeric literal must be finite, got Infinity")
      )
      throws(
        // @effect-diagnostics-next-line schemaLiteralNonFinite:off
        () => Schema.Literal(-Infinity),
        new Error("A numeric literal must be finite, got -Infinity")
      )
      throws(
        // @effect-diagnostics-next-line schemaLiteralNonFinite:off
        () => Schema.Literal(NaN),
        new Error("A numeric literal must be finite, got NaN")
      )
    })

    it("should expose the literal", () => {
      const schema = Schema.Literal("a")
      strictEqual(schema.literal, "a")
      strictEqual(schema.annotate({}).literal, "a")
    })

    it(`"a"`, async () => {
      const schema = Schema.Literal("a")
      const asserts = new TestSchema.Asserts(schema)

      const make = asserts.make()
      await make.succeed("a")
      await make.fail(null, `Expected "a"`)

      const decoding = asserts.decoding()
      await decoding.succeed("a")
      await decoding.fail(1, `Expected "a"`)

      const encoding = asserts.encoding()
      await encoding.succeed("a")
      await encoding.fail(1, `Expected "a"`)
    })

    it(`1`, async () => {
      const schema = Schema.Literal(1)
      const asserts = new TestSchema.Asserts(schema)

      const make = asserts.make()
      await make.succeed(1)
      await make.fail(null, `Expected 1`)

      const decoding = asserts.decoding()
      await decoding.succeed(1)
      await decoding.fail("1", `Expected 1`)

      const encoding = asserts.encoding()
      await encoding.succeed(1)
      await encoding.fail("1", `Expected 1`)
    })

    it("accepts either signed zero and preserves the input sign", () => {
      for (const literal of [0, -0]) {
        const schema = Schema.Literal(literal)
        for (const input of [0, -0]) {
          assertTrue(Object.is(Schema.decodeUnknownSync(schema)(input), input))
          assertTrue(Object.is(Schema.encodeUnknownSync(schema)(input), input))
        }
      }
    })

    it("transform", async () => {
      const schema = Schema.Literal(0).transform("a")
      const asserts = new TestSchema.Asserts(schema)

      const decoding = asserts.decoding()
      await decoding.succeed(0, "a")
      await decoding.fail(1, `Expected 0`)

      const encoding = asserts.encoding()
      await encoding.succeed("a", 0)
      await encoding.fail("b", `Expected "a"`)
    })
  })

  describe("Literals", () => {
    it("red, green, blue", async () => {
      const schema = Schema.Literals(["red", "green", "blue"])

      deepStrictEqual(schema.literals, ["red", "green", "blue"])

      const asserts = new TestSchema.Asserts(schema)
      const make = asserts.make()
      await make.succeed("red")
      await make.succeed("green")
      await make.succeed("blue")
      await make.fail("yellow", `Expected "red" | "green" | "blue"`)
    })

    it("transform", async () => {
      const schema = Schema.Literals([0, 1]).transform(["a", "b"])
      const asserts = new TestSchema.Asserts(schema)

      const decoding = asserts.decoding()
      await decoding.succeed(0, "a")
      await decoding.succeed(1, "b")
      await decoding.fail(2, `Expected 0 | 1`)

      const encoding = asserts.encoding()
      await encoding.succeed("a", 0)
      await encoding.succeed("b", 1)
      await encoding.fail("c", `Expected "a" | "b"`)
    })

    it("pick", () => {
      const schema = Schema.Literals(["a", "b", "c"]).pick(["a", "b"])

      deepStrictEqual(schema.literals, ["a", "b"])
    })
  })

  it("Never", async () => {
    const schema = Schema.Never
    const asserts = new TestSchema.Asserts(schema)

    const make = asserts.make()
    await make.fail(null as never, `Expected never`)

    const decoding = asserts.decoding()
    await decoding.fail("a", `Expected never`)

    const encoding = asserts.encoding()
    await encoding.fail("a", `Expected never`)
  })

  it("Any", async () => {
    const schema = Schema.Any
    const asserts = new TestSchema.Asserts(schema)

    const make = asserts.make()
    await make.succeed("a")

    const decoding = asserts.decoding()
    await decoding.succeed("a")
  })

  it("Unknown", async () => {
    const schema = Schema.Unknown
    const asserts = new TestSchema.Asserts(schema)

    const make = asserts.make()
    await make.succeed("a")

    const decoding = asserts.decoding()
    await decoding.succeed("a")
  })

  it("Null", async () => {
    const schema = Schema.Null
    const asserts = new TestSchema.Asserts(schema)

    const make = asserts.make()
    await make.succeed(null)
    await make.fail(undefined, `Expected null`)
  })

  it("Undefined", async () => {
    const schema = Schema.Undefined
    const asserts = new TestSchema.Asserts(schema)

    const make = asserts.make()
    await make.succeed(undefined)
    await make.fail(null, `Expected undefined`)
  })

  it("String", async () => {
    const schema = Schema.String
    const asserts = new TestSchema.Asserts(schema)

    const make = asserts.make()
    await make.succeed("a")
    await make.fail(null, `Expected string`)

    const decoding = asserts.decoding()
    await decoding.succeed("a")
    await decoding.fail(1, `Expected string`)

    const encoding = asserts.encoding()
    await encoding.succeed("a")
    await encoding.fail(1, `Expected string`)
  })

  it("StringForLiteralAutocomplete", async () => {
    const schema = Schema.StringForLiteralAutocomplete
    const asserts = new TestSchema.Asserts(schema)

    strictEqual(schema.ast, SchemaAST.string)

    const make = asserts.make()
    await make.succeed("a")
    await make.fail(null, `Expected string`)

    const decoding = asserts.decoding()
    await decoding.succeed("a")
    await decoding.fail(1, `Expected string`)

    const encoding = asserts.encoding()
    await encoding.succeed("a")
    await encoding.fail(1, `Expected string`)
  })

  it("StringForLiteralAutocomplete | Literals", async () => {
    const schema = Schema.Union([
      Schema.StringForLiteralAutocomplete,
      Schema.Literals(["GET", "POST"])
    ])
    const asserts = new TestSchema.Asserts(schema)

    deepStrictEqual(schema.members[1].literals, ["GET", "POST"])

    const make = asserts.make()
    await make.succeed("GET")
    await make.succeed("PATCH")
    await make.fail(null, `Expected string | "GET" | "POST"`)

    const decoding = asserts.decoding()
    await decoding.succeed("GET")
    await decoding.succeed("PATCH")
    await decoding.fail(1, `Expected string | "GET" | "POST"`)

    const encoding = asserts.encoding()
    await encoding.succeed("GET")
    await encoding.succeed("PATCH")
    await encoding.fail(1, `Expected string | "GET" | "POST"`)
  })

  it("Number", async () => {
    const schema = Schema.Number
    const asserts = new TestSchema.Asserts(schema)

    const make = asserts.make()
    await make.succeed(1)
    await make.fail(null, `Expected number`)

    const decoding = asserts.decoding()
    await decoding.succeed(1)
    await decoding.fail("a", `Expected number`)

    const encoding = asserts.encoding()
    await encoding.succeed(1)
    await encoding.fail("a", `Expected number`)
  })

  it("Boolean", async () => {
    const schema = Schema.Boolean
    const asserts = new TestSchema.Asserts(schema)

    const make = asserts.make()
    await make.succeed(true)
    await make.succeed(false)
    await make.fail(null, `Expected boolean`)

    const decoding = asserts.decoding()
    await decoding.succeed(true)
    await decoding.succeed(false)
    await decoding.fail("a", `Expected boolean`)

    const encoding = asserts.encoding()
    await encoding.succeed(true)
    await encoding.succeed(false)
    await encoding.fail("a", `Expected boolean`)
  })

  it("Symbol", async () => {
    const schema = Schema.Symbol
    const asserts = new TestSchema.Asserts(schema)

    const make = asserts.make()
    await make.succeed(Symbol("a"))
    await make.fail(null, `Expected symbol`)

    const decoding = asserts.decoding()
    await decoding.succeed(Symbol("a"))
    await decoding.fail("a", `Expected symbol`)

    const encoding = asserts.encoding()
    await encoding.succeed(Symbol("a"))
    await encoding.fail("a", `Expected symbol`)
  })

  it("UniqueSymbol", async () => {
    const a = Symbol("a")
    const schema = Schema.UniqueSymbol(a)
    const asserts = new TestSchema.Asserts(schema)

    const make = asserts.make()
    await make.succeed(a)
    await make.fail(Symbol("b"), `Expected Symbol(a)`)

    const decoding = asserts.decoding()
    await decoding.succeed(a)
    await decoding.fail(Symbol("b"), `Expected Symbol(a)`)
  })

  it("BigInt", async () => {
    const schema = Schema.BigInt
    const asserts = new TestSchema.Asserts(schema)

    const make = asserts.make()
    await make.succeed(1n)
    await make.fail(null, `Expected bigint`)

    const decoding = asserts.decoding()
    await decoding.succeed(1n)
    await decoding.fail("1", `Expected bigint`)

    const encoding = asserts.encoding()
    await encoding.succeed(1n)
    await encoding.fail("1", `Expected bigint`)
  })

  it("Void", async () => {
    const schema = Schema.Void
    const asserts = new TestSchema.Asserts(schema)

    // The public make input stays typed as void; these callbacks exercise runtime parser behavior.
    let fn: () => void

    const make = asserts.make()
    await make.succeed()
    await make.succeed(undefined)
    fn = () => undefined
    await make.succeed(fn())
    fn = () => null
    await make.succeed(fn(), undefined)
    fn = () => "a"
    await make.succeed(fn(), undefined)

    const decoding = asserts.decoding()
    await decoding.succeed(undefined)
    await decoding.succeed(null, undefined)
    await decoding.succeed("a", undefined)

    const encoding = asserts.encoding()
    await encoding.succeed(undefined)
    await encoding.succeed(null, undefined)
    await encoding.succeed("1", undefined)
  })

  it("ObjectKeyword", async () => {
    const schema = Schema.ObjectKeyword
    const asserts = new TestSchema.Asserts(schema)

    const make = asserts.make()
    await make.succeed({})
    await make.succeed([])
    await make.fail(null, `Expected object | array | function`)

    const decoding = asserts.decoding()
    await decoding.succeed({})
    await decoding.succeed([])
    await decoding.fail("1", `Expected object | array | function`)

    const encoding = asserts.encoding()
    await encoding.succeed({})
    await encoding.succeed([])
    await encoding.fail("1", `Expected object | array | function`)
  })

  it("optionalKey", () => {
    const schema = Schema.optionalKey(Schema.String)
    strictEqual(schema.ast.context?.isOptional, true)
    strictEqual(Schema.optionalKey(Schema.String).ast, schema.ast)
    strictEqual(Schema.optionalKey(schema).ast, schema.ast)
  })

  it("optionalKey & mutableKey", () => {
    const schema = Schema.String.pipe(Schema.optionalKey, Schema.mutableKey)
    strictEqual(schema.ast.context?.isOptional, true)
    strictEqual(schema.ast.context?.isMutable, true)
  })

  it("optional", () => {
    const schema = Schema.optional(Schema.String)
    strictEqual(schema.ast.context?.isOptional, true)
    strictEqual(Schema.optional(Schema.String).ast, schema.ast)
    const nested = Schema.optional(schema)
    strictEqual(Schema.required(nested), schema)
  })

  it("mutableKey", () => {
    const schema = Schema.mutableKey(Schema.String)
    strictEqual(schema.ast.context?.isMutable, true)
    strictEqual(Schema.mutableKey(Schema.String).ast, schema.ast)
    strictEqual(Schema.mutableKey(schema).ast, schema.ast)
  })

  it("mutableKey & optionalKey", () => {
    const schema = Schema.String.pipe(Schema.mutableKey, Schema.optionalKey)
    strictEqual(schema.ast.context?.isOptional, true)
    strictEqual(schema.ast.context?.isMutable, true)
  })

  it("readonlyKey", () => {
    const schema = Schema.readonlyKey(Schema.mutableKey(Schema.String))
    strictEqual(schema.ast.context?.isMutable, undefined)
  })

  describe("Struct", () => {
    it("allows duplicate property signatures in the low-level AST constructor", () => {
      const ast = new SchemaAST.Objects(
        [
          new SchemaAST.PropertySignature("a", Schema.String.ast),
          new SchemaAST.PropertySignature("b", Schema.String.ast),
          new SchemaAST.PropertySignature("a", Schema.Number.ast)
        ],
        []
      )
      deepStrictEqual(ast.propertySignatures.map((propertySignature) => propertySignature.name), ["a", "b", "a"])
    })

    describe("onExcessProperty", () => {
      it("error", async () => {
        const schema = Schema.Struct({
          a: Schema.String
        })
        const asserts = new TestSchema.Asserts(schema)
        const decoding = asserts.decoding({ parseOptions: { onExcessProperty: "error" } })
        await decoding.fail(
          { a: "a", b: "b" },
          `Expected no excess property
  at ["b"]`
        )
        const sym = Symbol("sym")
        await decoding.fail(
          { a: "a", [sym]: "sym" },
          `Expected no excess property
  at [Symbol(sym)]`
        )

        const decodingAll = asserts.decoding({ parseOptions: { onExcessProperty: "error", errors: "all" } })
        await decodingAll.fail(
          { a: "a", b: "b", c: "c" },
          `Expected no excess property
  at ["b"]
Expected no excess property
  at ["c"]`
        )
      })

      it("ignore strips undeclared string and symbol properties", async () => {
        const schema = Schema.Struct({
          a: Schema.String
        })
        const asserts = new TestSchema.Asserts(schema)

        const decoding = asserts.decoding({ parseOptions: { onExcessProperty: "ignore" } })
        const sym = Symbol("sym")
        await decoding.succeed(
          { a: "a", b: "b", c: "c", [sym]: "sym" },
          { a: "a" }
        )
      })

      it("error ignores non-enumerable undeclared own properties without reading them", async () => {
        const schema = Schema.Struct({
          a: Schema.String
        })
        const asserts = new TestSchema.Asserts(schema)
        const sym = Symbol("sym")
        const input: Record<PropertyKey, unknown> = { a: "a" }
        for (const key of ["stack", sym]) {
          Object.defineProperty(input, key, {
            get() {
              throw new Error("Non-enumerable excess properties must not be read")
            },
            enumerable: false
          })
        }

        for (const errors of ["first", "all"] as const) {
          const parseOptions = { onExcessProperty: "error", errors } as const
          await asserts.decoding({ parseOptions }).succeed(input, { a: "a" })
          await asserts.encoding({ parseOptions }).succeed(input, { a: "a" })
        }
      })

      it("error validates non-enumerable declared string and symbol properties", async () => {
        for (const key of ["a", Symbol("a")]) {
          const schema = Schema.Struct({ [key]: Schema.Number })
          const input = Object.defineProperty({}, key, { value: 1, enumerable: false })
          const invalid = Object.defineProperty({}, key, { value: "invalid", enumerable: false })
          const asserts = new TestSchema.Asserts(schema)
          const parseOptions = { onExcessProperty: "error" } as const
          const message = `Expected number\n  at [${typeof key === "string" ? JSON.stringify(key) : String(key)}]`

          await asserts.decoding({ parseOptions }).succeed(input, { [key]: 1 })
          await asserts.encoding({ parseOptions }).succeed(input, { [key]: 1 })
          await asserts.decoding({ parseOptions }).fail(invalid, message)
          await asserts.encoding({ parseOptions }).fail(invalid, message)
        }
      })

      it("error accepts Error internals in an open record", async () => {
        const schema = Schema.Record(Schema.String, Schema.Number)
        const asserts = new TestSchema.Asserts(schema)
        const decoding = asserts.decoding({ parseOptions: { onExcessProperty: "error" } })
        await decoding.succeed(new Error("boom"), {})
        await asserts.encoding({ parseOptions: { onExcessProperty: "error" } }).succeed(new Error("boom"), {})
      })

      it("error encodes tagged errors carrying runtime internals", async () => {
        class NotFound extends Schema.TaggedError<NotFound>()("NotFound", { id: Schema.Number }) {}
        const asserts = new TestSchema.Asserts(NotFound)
        const encoding = asserts.encoding({ parseOptions: { onExcessProperty: "error" } })
        await encoding.succeed(new NotFound({ id: 1 }), { _tag: "NotFound", id: 1 })
      })
    })

    it("should corectly handle __proto__", async () => {
      const schema = Schema.Struct({
        ["__proto__"]: Schema.String
      })
      const asserts = new TestSchema.Asserts(schema)

      const decoding = asserts.decoding()
      await decoding.succeed({ ["__proto__"]: "a" })
      await decoding.fail(
        { __proto__: "a" },
        `Missing key
  at ["__proto__"]`
      )
    })

    it(`{ readonly "a": string }`, async () => {
      const schema = Schema.Struct({
        a: Schema.String
      })
      const asserts = new TestSchema.Asserts(schema)

      // Should be able to access the fields
      deepStrictEqual(schema.fields, { a: Schema.String })

      const make = asserts.make()
      await make.succeed({ a: "a" })
      await make.fail(null, `Expected object`)

      const decoding = asserts.decoding()
      await decoding.succeed({ a: "a" })
      await decoding.fail(
        {},
        `Missing key
  at ["a"]`
      )
      await decoding.fail(
        { a: 1 },
        `Expected string
  at ["a"]`
      )

      const encoding = asserts.encoding()
      await encoding.succeed({ a: "a" })
      await encoding.fail(
        {},
        `Missing key
  at ["a"]`
      )
      await encoding.fail(
        { a: 1 },
        `Expected string
  at ["a"]`
      )
    })

    it(`{ readonly "a": <transformation> }`, async () => {
      const schema = Schema.Struct({
        a: Schema.FiniteFromString
      })
      const asserts = new TestSchema.Asserts(schema)

      const decoding = asserts.decoding()
      await decoding.succeed({ a: "1" }, { a: 1 })
      await decoding.fail(
        { a: "a" },
        `Expected a finite number
  at ["a"]`
      )

      const encoding = asserts.encoding()
      await encoding.succeed({ a: 1 }, { a: "1" })
      await encoding.fail(
        { a: "a" },
        `Expected number
  at ["a"]`
      )
    })

    it("should use the identifier annotation as the expected message", async () => {
      const schema = Schema.Struct({
        a: Schema.String
      }).annotate({ identifier: "ID" })
      const asserts = new TestSchema.Asserts(schema)

      const decoding = asserts.decoding()
      await decoding.fail(null, `Expected ID`)
    })

    it(`Schema.optionalKey: { readonly "a"?: string }`, async () => {
      const schema = Schema.Struct({
        a: Schema.optionalKey(Schema.String)
      })
      const asserts = new TestSchema.Asserts(schema)

      const make = asserts.make()
      await make.succeed({ a: "a" })
      await make.succeed({})

      const decoding = asserts.decoding()
      await decoding.succeed({ a: "a" })
      await decoding.succeed({})
      await decoding.fail(
        { a: 1 },
        `Expected string
  at ["a"]`
      )

      const encoding = asserts.encoding()
      await encoding.succeed({ a: "a" })
      await encoding.succeed({})
      await encoding.fail(
        { a: 1 },
        `Expected string
  at ["a"]`
      )
    })

    it(`Schema.optional: { readonly "a"?: string | undefined }`, async () => {
      const schema = Schema.Struct({
        a: Schema.optional(Schema.String)
      })
      const asserts = new TestSchema.Asserts(schema)

      const make = asserts.make()
      await make.succeed({ a: "a" })
      await make.succeed({ a: undefined })
      await make.succeed({})

      const decoding = asserts.decoding()
      await decoding.succeed({ a: "a" })
      await decoding.succeed({ a: undefined })
      await decoding.succeed({})
      await decoding.fail(
        { a: 1 },
        `Expected string | undefined
  at ["a"]`
      )

      const encoding = asserts.encoding()
      await encoding.succeed({ a: "a" })
      await encoding.succeed({ a: undefined })
      await encoding.succeed({})
      await encoding.fail(
        { a: 1 },
        `Expected string | undefined
  at ["a"]`
      )
    })

    it(`{ readonly "a"?: <transformation> }`, async () => {
      const schema = Schema.Struct({
        a: Schema.optionalKey(Schema.FiniteFromString)
      })
      const asserts = new TestSchema.Asserts(schema)

      const decoding = asserts.decoding()
      await decoding.succeed({ a: "1" }, { a: 1 })
      await decoding.succeed({})
      await decoding.fail(
        { a: undefined },
        `Expected string
  at ["a"]`
      )

      const encoding = asserts.encoding()
      await encoding.succeed({ a: 1 }, { a: "1" })
      await encoding.succeed({})
    })

    describe("ParseOptions", () => {
      it(`{ errors: "all" }`, async () => {
        const schema = Schema.Struct({
          a: Schema.String,
          b: Schema.Number
        })
        const asserts = new TestSchema.Asserts(schema)

        const make = asserts.make({ parseOptions: { errors: "all" } })
        await make.fail(
          {},
          `Missing key
  at ["a"]
Missing key
  at ["b"]`
        )

        const decoding = asserts.decoding({ parseOptions: { errors: "all" } })
        await decoding.fail(
          {},
          `Missing key
  at ["a"]
Missing key
  at ["b"]`
        )

        const encoding = asserts.encoding({ parseOptions: { errors: "all" } })
        await encoding.fail(
          {},
          `Missing key
  at ["a"]
Missing key
  at ["b"]`
        )
      })
    })

    describe("assign", () => {
      it("Struct", async () => {
        const from = Schema.Struct({
          a: Schema.String
        })
        const schema = from.mapFields(Struct.assign({ b: Schema.String }))
        const asserts = new TestSchema.Asserts(schema)

        const decoding = asserts.decoding()
        await decoding.succeed({ a: "a", b: "b" })
        await decoding.fail(
          { b: "b" },
          `Missing key
  at ["a"]`
        )
        await decoding.fail(
          { a: "a" },
          `Missing key
  at ["b"]`
        )
      })

      it("overlapping fields", async () => {
        const from = Schema.Struct({
          a: Schema.String,
          b: Schema.String
        })
        const schema = from.mapFields(Struct.assign({ b: Schema.Number, c: Schema.Number }))
        const asserts = new TestSchema.Asserts(schema)

        const decoding = asserts.decoding()
        await decoding.succeed({ a: "a", b: 1, c: 2 })
        await decoding.fail(
          { a: "a", b: "b" },
          `Expected number
  at ["b"]`
        )
      })

      it("Struct & check & unsafePreserveChecks: true", async () => {
        const from = Schema.Struct({
          a: Schema.String,
          b: Schema.String
        }).check(
          Schema.makeFilter(({ a, b }) => a === b, { expected: "a === b" })
        )
        const schema = from.mapFields(Struct.assign({ c: Schema.String }), { unsafePreserveChecks: true })
        const asserts = new TestSchema.Asserts(schema)

        const decoding = asserts.decoding()
        await decoding.succeed({ a: "a", b: "a", c: "c" })
        await decoding.fail(
          { a: "", b: "b", c: "c" },
          `Expected a === b`
        )
      })
    })

    describe("pick", () => {
      it("Struct", async () => {
        const schema = Schema.Struct({
          a: Schema.String,
          b: Schema.String
        }).mapFields(Struct.pick(["a"]))
        const asserts = new TestSchema.Asserts(schema)

        const decoding = asserts.decoding()
        await decoding.succeed({ a: "a" })
      })
    })

    describe("omit", () => {
      it("Struct", async () => {
        const schema = Schema.Struct({
          a: Schema.String,
          b: Schema.String
        }).mapFields(Struct.omit(["b"]))
        const asserts = new TestSchema.Asserts(schema)

        const decoding = asserts.decoding()
        await decoding.succeed({ a: "a" })
      })
    })
  })

  describe("Tuple", () => {
    it("A required element cannot follow an optional element", () => {
      throws(
        () => Schema.Tuple([Schema.optionalKey(Schema.String), Schema.String]),
        new Error("A required element cannot follow an optional element. ts(1257)")
      )
      throws(
        () => Schema.Tuple([Schema.optional(Schema.String), Schema.String]),
        new Error("A required element cannot follow an optional element. ts(1257)")
      )
    })

    it("should fail on unexpected indexes", async () => {
      const schema = Schema.Tuple([Schema.String])
      const asserts = new TestSchema.Asserts(schema)

      const decoding = asserts.decoding()
      await decoding.fail(
        ["a", "b"],
        `Expected no excess property
  at [1]`
      )
      const decodingAll = asserts.decoding({ parseOptions: { errors: "all" } })
      await decodingAll.fail(
        ["a", "b", "c"],
        `Expected no excess property
  at [1]
Expected no excess property
  at [2]`
      )
    })

    it(`readonly [string]`, async () => {
      const schema = Schema.Tuple([Schema.NonEmptyString])
      const asserts = new TestSchema.Asserts(schema)

      // should be able to access the elements
      deepStrictEqual(schema.elements, [Schema.NonEmptyString])

      const make = asserts.make()
      await make.succeed(["a"])
      await make.fail(
        [""],
        `Expected a value with a length of at least 1
  at [0]`
      )

      const decoding = asserts.decoding()
      await decoding.succeed(["a"])
      await decoding.fail(null, `Expected array`)
      await decoding.fail(
        [],
        `Missing key
  at [0]`
      )
      await decoding.fail(
        [1],
        `Expected string
  at [0]`
      )

      const encoding = asserts.encoding()
      await encoding.succeed(["a"])
      await encoding.fail(
        [],
        `Missing key
  at [0]`
      )
      await encoding.fail(
        [1],
        `Expected string
  at [0]`
      )
    })

    it(`readonly [string?]`, async () => {
      const schema = Schema.Tuple([Schema.String.pipe(Schema.optionalKey)])
      const asserts = new TestSchema.Asserts(schema)

      const make = asserts.make()
      await make.succeed(["a"])
      await make.succeed([])

      const decoding = asserts.decoding()
      await decoding.succeed(["a"])
      await decoding.succeed([])

      const encoding = asserts.encoding()
      await encoding.succeed(["a"])
      await encoding.succeed([])
    })
  })

  describe("Array", () => {
    it("should expose the element schema via .value", () => {
      const schema = Schema.Array(Schema.String)
      strictEqual(schema.value, Schema.String)
      strictEqual(schema.annotate({}).value, Schema.String)
    })

    it("readonly string[]", async () => {
      const schema = Schema.Array(Schema.String)
      const asserts = new TestSchema.Asserts(schema)

      const make = asserts.make()
      await make.succeed(["a", "b"])

      const decoding = asserts.decoding()
      await decoding.succeed(["a", "b"])
      await decoding.fail(
        ["a", 1],
        `Expected string
  at [1]`
      )

      const encoding = asserts.encoding()
      await encoding.succeed(["a", "b"])
      await encoding.fail(
        ["a", 1],
        `Expected string
  at [1]`
      )
    })
  })

  describe("mutable", () => {
    it("supports encodings on array elements", async () => {
      const schema = Schema.mutable(Schema.Array(Schema.FiniteFromString))
      const asserts = new TestSchema.Asserts(schema)

      await asserts.decoding().succeed(["1"], [1])
      await asserts.encoding().succeed([1], ["1"])
    })

    it("supports withDecodingDefaultType after mutable", async () => {
      const schema = Schema.Struct({
        value: Schema.Array(Schema.String).pipe(
          Schema.mutable,
          Schema.withDecodingDefaultType(Effect.succeed(["default"]))
        )
      })
      const asserts = new TestSchema.Asserts(schema)

      await asserts.decoding().succeed({}, { value: ["default"] })
      await asserts.decoding().succeed({ value: undefined }, { value: ["default"] })
      await asserts.decoding().succeed({ value: ["a"] })
      await asserts.encoding().succeed({ value: ["a"] })
    })

    it("does not support withDecodingDefaultType before mutable", () => {
      throws(
        () =>
          Schema.Struct({
            value: Schema.Array(Schema.String).pipe(
              Schema.withDecodingDefaultType(Effect.succeed(["default"])),
              Schema.mutable
            )
          }),
        new Error("mutable does not support encodings")
      )
    })

    it("preserves annotations, checks, encoding checks, and context", async () => {
      const schema = Schema.Array(Schema.String).annotate({ identifier: "A" }).check(
        Schema.isMinLength(1)
      ).pipe(
        Schema.flip,
        Schema.check(Schema.isMaxLength(1)),
        Schema.flip,
        Schema.optionalKey
      )
      const mutable = Schema.mutable(schema)

      strictEqual(mutable.ast.annotations, schema.ast.annotations)
      strictEqual(mutable.ast.checks, schema.ast.checks)
      strictEqual(mutable.ast.encodingChecks, schema.ast.encodingChecks)
      strictEqual(mutable.ast.context, schema.ast.context)

      const asserts = new TestSchema.Asserts(mutable)
      await asserts.decoding().fail([], "Expected a value with a length of at least 1")
      await asserts.encoding().fail(["a", "b"], "Expected a value with a length of at most 1")
    })
  })

  it("ArrayEnsure", async () => {
    const schema = Schema.ArrayEnsure(Schema.FiniteFromString)
    const asserts = new TestSchema.Asserts(schema)

    const decoding = asserts.decoding()
    await decoding.succeed("1", [1])
    await decoding.succeed(["1", "2"], [1, 2])
    await decoding.succeed([], [])
    await decoding.fail(null, `Expected string | array`)
    await decoding.fail("a", `Expected a finite number`)
    await decoding.fail(
      ["a"],
      `Expected a finite number
  at [0]`
    )

    const encoding = asserts.encoding()
    await encoding.succeed([], [])
    await encoding.succeed([1], "1")
    await encoding.succeed([1, 2], ["1", "2"])
  })

  it("ArrayEnsure roundtrips array-valued elements", () => {
    const schema = Schema.ArrayEnsure(Schema.Tuple([Schema.Number, Schema.Number]))
    const encoded = Schema.encodeSync(schema)([[1, 2]])
    deepStrictEqual(encoded, [1, 2])
    deepStrictEqual(Schema.decodeSync(schema)(encoded), [[1, 2]])
  })

  it("ArrayEnsure preserves outer-array encoding", () => {
    const schema = Schema.ArrayEnsure(Schema.fromJsonString(Schema.Unknown))
    deepStrictEqual(Schema.encodeSync(schema)([1, 2]), ["1", "2"])
  })

  describe("NonEmptyArray", () => {
    it("should expose the element schema via .value", () => {
      const schema = Schema.NonEmptyArray(Schema.String)
      strictEqual(schema.value, Schema.String)
    })

    it("readonly string[]", async () => {
      const schema = Schema.NonEmptyArray(Schema.String)
      const asserts = new TestSchema.Asserts(schema)

      const make = asserts.make()
      await make.succeed(["a"])
      await make.succeed(["a", "b"])

      const decoding = asserts.decoding()
      await decoding.succeed(["a"])
      await decoding.succeed(["a", "b"])
      await decoding.fail(
        [],
        `Missing key
  at [0]`
      )
      await decoding.fail(
        ["a", 1],
        `Expected string
  at [1]`
      )

      const encoding = asserts.encoding()
      await encoding.succeed(["a"])
      await encoding.succeed(["a", "b"])
      await encoding.fail(
        [],
        `Missing key
  at [0]`
      )
      await encoding.fail(
        ["a", 1],
        `Expected string
  at [1]`
      )
    })
  })

  it("Trimmed", async () => {
    const schema = Schema.Trimmed
    const asserts = new TestSchema.Asserts(schema)

    if (verifyGeneration) {
      asserts.arbitrary().verifyGeneration()
    }

    const decoding = asserts.decoding()
    await decoding.succeed("a")
    await decoding.fail(
      " a ",
      `Expected a string with no leading or trailing whitespace`
    )
  })

  describe("Checks", () => {
    describe("check", () => {
      it("single check", async () => {
        const schema = Schema.String.check(Schema.isMinLength(3))
        const asserts = new TestSchema.Asserts(schema)

        const decoding = asserts.decoding()
        await decoding.succeed("abc")
        await decoding.fail(
          "ab",
          `Expected a value with a length of at least 3`
        )
      })

      it("multiple checks", async () => {
        const schema = Schema.String.check(
          Schema.isMinLength(3),
          Schema.isIncluding("c")
        )
        const asserts = new TestSchema.Asserts(schema)

        const decoding = asserts.decoding()
        await decoding.succeed("abc")
        await decoding.fail(
          "ab",
          `Expected a value with a length of at least 3`
        )
        const decodingAll = asserts.decoding({ parseOptions: { errors: "all" } })
        await decodingAll.fail(
          "ab",
          `Expected a value with a length of at least 3
Expected a string including "c"`
        )
      })

      it("aborting checks", async () => {
        const schema = Schema.String.check(
          Schema.isMinLength(2).abort(),
          Schema.isIncluding("b")
        )
        const asserts = new TestSchema.Asserts(schema)

        const decoding = asserts.decoding()
        await decoding.fail(
          "a",
          `Expected a value with a length of at least 2`
        )
      })

      it("makeFilterGroup", async () => {
        const usernameGroup = Schema.makeFilterGroup(
          [
            Schema.isMinLength(3),
            Schema.isPattern(/^[a-zA-Z0-9]+$/, {
              title: "alphanumeric",
              description: "must contain only letters and numbers"
            }),
            Schema.isTrimmed()
          ],
          {
            title: "username",
            description: "a valid username"
          }
        )

        const Username = Schema.String.check(usernameGroup)
        const asserts = new TestSchema.Asserts(Username)

        const decoding = asserts.decoding()
        await decoding.succeed("abc")
        await decoding.fail(
          "",
          `Expected a value with a length of at least 3`
        )
      })

      it("object-level checks are validated against the decoded value when encoding", async () => {
        const schema = Schema.Struct({ a: Schema.FiniteFromString }).check(
          Schema.makeFilter((o) => typeof o.a === "number", { expected: "a is a number" })
        )
        const asserts = new TestSchema.Asserts(schema)

        const decoding = asserts.decoding()
        await decoding.succeed({ a: "1" }, { a: 1 })

        const encoding = asserts.encoding()
        await encoding.succeed({ a: 1 }, { a: "1" })
      })

      it("suspended checks are not supported", () => {
        throws(
          () => {
            Schema.suspend(() => Schema.Struct({ a: Schema.FiniteFromString })).check(
              Schema.makeFilter((o) => typeof o.a === "number", { expected: "a is a number" })
            )
          },
          "Cannot add checks to Suspend"
        )
      })
    })

    it("refine", async () => {
      const schema = Schema.Option(Schema.String).pipe(
        Schema.refine(Option.isSome, { expected: "isSome" }),
        Schema.check(
          Schema.makeFilter(({ value }) => value.length > 0, { expected: "length > 0" })
        )
      )
      const asserts = new TestSchema.Asserts(schema)

      const decoding = asserts.decoding()
      await decoding.succeed(Option.some("a"))
      await decoding.fail(
        Option.some(""),
        `Expected length > 0`
      )
      await decoding.fail(
        Option.none(),
        `Expected isSome`
      )
    })

    describe("String checks", () => {
      it("isPattern", async () => {
        const schema = Schema.String.check(Schema.isPattern(/^a/))
        const asserts = new TestSchema.Asserts(schema)

        const decoding = asserts.decoding()
        await decoding.succeed("a")
        await decoding.fail(
          "b",
          `Expected a string matching the RegExp ^a`
        )

        const encoding = asserts.encoding()
        await encoding.succeed("a")
        await encoding.fail(
          "b",
          `Expected a string matching the RegExp ^a`
        )
      })

      it("isPattern with stateful RegExp flags", async () => {
        for (const regExp of [/^a/g, /^a/y]) {
          const schema = Schema.String.check(Schema.isPattern(regExp))
          const decoding = new TestSchema.Asserts(schema).decoding()

          await decoding.succeed("a")
          await decoding.succeed("a")
          strictEqual(regExp.lastIndex, 0)
        }
      })

      it("isStartingWith", async () => {
        const schema = Schema.String.check(Schema.isStartingWith("a"))
        const asserts = new TestSchema.Asserts(schema)

        const decoding = asserts.decoding()
        await decoding.succeed("a")
        await decoding.fail(
          "b",
          `Expected a string starting with "a"`
        )

        const encoding = asserts.encoding()
        await encoding.succeed("a")
        await encoding.fail(
          "b",
          `Expected a string starting with "a"`
        )
      })

      it("isEndingWith", async () => {
        const schema = Schema.String.check(Schema.isEndingWith("a"))
        const asserts = new TestSchema.Asserts(schema)

        const decoding = asserts.decoding()
        await decoding.succeed("a")
        await decoding.fail(
          "b",
          `Expected a string ending with "a"`
        )

        const encoding = asserts.encoding()
        await encoding.succeed("a")
        await encoding.fail(
          "b",
          `Expected a string ending with "a"`
        )
      })

      it("isLowercased", async () => {
        const schema = Schema.String.check(Schema.isLowercased())
        const asserts = new TestSchema.Asserts(schema)

        const decoding = asserts.decoding()
        await decoding.succeed("a")
        await decoding.fail(
          "A",
          `Expected a string with all characters in lowercase`
        )

        const encoding = asserts.encoding()
        await encoding.succeed("a")
        await encoding.fail(
          "A",
          `Expected a string with all characters in lowercase`
        )
      })

      it("isUppercased", async () => {
        const schema = Schema.String.check(Schema.isUppercased())
        const asserts = new TestSchema.Asserts(schema)

        const decoding = asserts.decoding()
        await decoding.succeed("A")
        await decoding.fail(
          "a",
          `Expected a string with all characters in uppercase`
        )

        const encoding = asserts.encoding()
        await encoding.succeed("A")
        await encoding.fail(
          "a",
          `Expected a string with all characters in uppercase`
        )
      })

      it("isCapitalized", async () => {
        const schema = Schema.String.check(Schema.isCapitalized())
        const asserts = new TestSchema.Asserts(schema)

        const decoding = asserts.decoding()
        await decoding.succeed("Abc")
        await decoding.fail(
          "abc",
          `Expected a string with the first character in uppercase`
        )

        const encoding = asserts.encoding()
        await encoding.succeed("Abc")
        await encoding.fail(
          "abc",
          `Expected a string with the first character in uppercase`
        )
      })

      it("isUncapitalized", async () => {
        const schema = Schema.String.check(Schema.isUncapitalized())
        const asserts = new TestSchema.Asserts(schema)

        const decoding = asserts.decoding()
        await decoding.succeed("aBC")
        await decoding.fail(
          "ABC",
          `Expected a string with the first character in lowercase`
        )

        const encoding = asserts.encoding()
        await encoding.succeed("aBC")
        await encoding.fail(
          "ABC",
          `Expected a string with the first character in lowercase`
        )
      })

      it("isMinLength", async () => {
        const schema = Schema.String.check(Schema.isMinLength(1))
        const asserts = new TestSchema.Asserts(schema)

        const decoding = asserts.decoding()
        await decoding.succeed("a")
        await decoding.fail(
          "",
          `Expected a value with a length of at least 1`
        )

        const encoding = asserts.encoding()
        await encoding.succeed("a")
        await encoding.fail(
          "",
          `Expected a value with a length of at least 1`
        )
      })
    })

    describe("Number checks", () => {
      it("isGreaterThan", async () => {
        const schema = Schema.Number.check(Schema.isGreaterThan(1))
        const asserts = new TestSchema.Asserts(schema)

        const decoding = asserts.decoding()
        await decoding.succeed(2)
        await decoding.fail(
          1,
          `Expected a value greater than 1`
        )

        const encoding = asserts.encoding()
        await encoding.succeed(2)
        await encoding.fail(
          1,
          `Expected a value greater than 1`
        )
      })

      it("isGreaterThanOrEqualTo", async () => {
        const schema = Schema.Number.check(Schema.isGreaterThanOrEqualTo(1))
        const asserts = new TestSchema.Asserts(schema)

        const decoding = asserts.decoding()
        await decoding.succeed(1)
        await decoding.fail(
          0,
          `Expected a value greater than or equal to 1`
        )
      })

      it("isLessThan", async () => {
        const schema = Schema.Number.check(Schema.isLessThan(1))
        const asserts = new TestSchema.Asserts(schema)

        const decoding = asserts.decoding()
        await decoding.succeed(0)
        await decoding.fail(
          1,
          `Expected a value less than 1`
        )
      })

      it("isLessThanOrEqualTo", async () => {
        const schema = Schema.Number.check(Schema.isLessThanOrEqualTo(1))
        const asserts = new TestSchema.Asserts(schema)

        const decoding = asserts.decoding()
        await decoding.succeed(1)
        await decoding.fail(
          2,
          `Expected a value less than or equal to 1`
        )
      })

      it("isMultipleOf", async () => {
        const schema = Schema.Number.check(Schema.isMultipleOf(2))
        const asserts = new TestSchema.Asserts(schema)

        const decoding = asserts.decoding()
        await decoding.succeed(4)
        await decoding.fail(
          3,
          `Expected a value that is a multiple of 2`
        )
      })

      it("isMultipleOf rejects nonzero subnormal remainders", () => {
        const is = Schema.is(Schema.Number.check(Schema.isMultipleOf(Number("1e-323"))))

        assertFalse(is(Number("1.042e-321")))
      })

      it("isMultipleOf normalizes negative divisors", async () => {
        const schema = Schema.Number.check(Schema.isMultipleOf(-2))
        const asserts = new TestSchema.Asserts(schema)

        const decoding = asserts.decoding()
        await decoding.succeed(4)
        await decoding.fail(
          3,
          `Expected a value that is a multiple of 2`
        )
      })

      it("isMultipleOf rejects invalid divisors", () => {
        for (const divisor of [0, -0, NaN, Infinity, -Infinity]) {
          throws(
            () => Schema.isMultipleOf(divisor),
            new RangeError(`Expected a finite non-zero number, got ${String(divisor)}`)
          )
        }
      })

      describe("isBetween", () => {
        it("included & included", async () => {
          const schema = Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 3 }))
          const asserts = new TestSchema.Asserts(schema)

          const decoding = asserts.decoding()
          await decoding.succeed(1)
          await decoding.succeed(3)
          await decoding.fail(
            0,
            `Expected a value between 1 and 3`
          )
          await decoding.fail(
            4,
            `Expected a value between 1 and 3`
          )

          const encoding = asserts.encoding()
          await encoding.succeed(1)
          await encoding.succeed(3)
          await encoding.fail(
            0,
            `Expected a value between 1 and 3`
          )
        })

        it("included & excluded", async () => {
          const schema = Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 3, exclusiveMaximum: true }))
          const asserts = new TestSchema.Asserts(schema)

          const decoding = asserts.decoding()
          await decoding.succeed(1)
          await decoding.fail(3, `Expected a value between 1 and 3 (excluded)`)
          await decoding.fail(
            0,
            `Expected a value between 1 and 3 (excluded)`
          )
          await decoding.fail(
            4,
            `Expected a value between 1 and 3 (excluded)`
          )

          const encoding = asserts.encoding()
          await encoding.succeed(1)
          await encoding.fail(3, `Expected a value between 1 and 3 (excluded)`)
          await encoding.fail(
            0,
            `Expected a value between 1 and 3 (excluded)`
          )
        })

        it("excluded & included", async () => {
          const schema = Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 3, exclusiveMinimum: true }))
          const asserts = new TestSchema.Asserts(schema)

          const decoding = asserts.decoding()
          await decoding.fail(1, `Expected a value between 1 (excluded) and 3`)
          await decoding.succeed(3)
          await decoding.fail(
            0,
            `Expected a value between 1 (excluded) and 3`
          )
          await decoding.fail(
            4,
            `Expected a value between 1 (excluded) and 3`
          )

          const encoding = asserts.encoding()
          await encoding.fail(1, `Expected a value between 1 (excluded) and 3`)
          await encoding.succeed(3)
          await encoding.fail(
            0,
            `Expected a value between 1 (excluded) and 3`
          )
        })

        it("excluded & excluded", async () => {
          const schema = Schema.Int.check(
            Schema.isBetween({ minimum: 1, maximum: 3, exclusiveMinimum: true, exclusiveMaximum: true })
          )
          const asserts = new TestSchema.Asserts(schema)

          const decoding = asserts.decoding()
          await decoding.succeed(2)
          await decoding.fail(1, `Expected a value between 1 (excluded) and 3 (excluded)`)
          await decoding.fail(3, `Expected a value between 1 (excluded) and 3 (excluded)`)
          await decoding.fail(
            0,
            `Expected a value between 1 (excluded) and 3 (excluded)`
          )
          await decoding.fail(
            4,
            `Expected a value between 1 (excluded) and 3 (excluded)`
          )

          const encoding = asserts.encoding()
          await encoding.succeed(2)
          await encoding.fail(1, `Expected a value between 1 (excluded) and 3 (excluded)`)
          await encoding.fail(3, `Expected a value between 1 (excluded) and 3 (excluded)`)
          await encoding.fail(
            0,
            `Expected a value between 1 (excluded) and 3 (excluded)`
          )
        })
      })

      it("isInt", async () => {
        const schema = Schema.Number.check(Schema.isInt())
        const asserts = new TestSchema.Asserts(schema)

        const decoding = asserts.decoding()
        await decoding.succeed(1)
        await decoding.fail(
          1.1,
          `Expected an integer`
        )

        const encoding = asserts.encoding()
        await encoding.succeed(1)
        await encoding.fail(
          1.1,
          `Expected an integer`
        )
        await decoding.fail(
          NaN,
          `Expected an integer`
        )
        await decoding.fail(
          Infinity,
          `Expected an integer`
        )
        await decoding.fail(
          -Infinity,
          `Expected an integer`
        )
      })

      it("isInt32", async () => {
        const schema = Schema.Number.check(Schema.isInt32())
        const asserts = new TestSchema.Asserts(schema)

        const decoding = asserts.decoding()
        await decoding.succeed(1)
        await decoding.fail(
          1.1,
          `Expected an integer`
        )
        await decoding.fail(
          Number.MAX_SAFE_INTEGER + 1,
          `Expected an integer`
        )
        await decoding.fail(
          1.1,
          `Expected an integer`
        )
        await decoding.fail(
          Number.MIN_SAFE_INTEGER - 1,
          `Expected an integer`
        )
        const decodingAll = asserts.decoding({ parseOptions: { errors: "all" } })
        await decodingAll.fail(
          Number.MAX_SAFE_INTEGER + 1,
          `Expected an integer
Expected a value between -2147483648 and 2147483647`
        )

        const encoding = asserts.encoding()
        await encoding.succeed(1)
        await encoding.fail(
          1.1,
          `Expected an integer`
        )
        await encoding.fail(
          Number.MAX_SAFE_INTEGER + 1,
          `Expected an integer`
        )
      })
    })

    describe("BigInt Checks", () => {
      const options = { order: Order.BigInt, format: (value: bigint) => `${value}n` }

      const isBetween = Schema.makeIsBetween(options)
      const isGreaterThan = Schema.makeIsGreaterThan(options)
      const isGreaterThanOrEqualTo = Schema.makeIsGreaterThanOrEqualTo(options)
      const isLessThan = Schema.makeIsLessThan(options)
      const isLessThanOrEqualTo = Schema.makeIsLessThanOrEqualTo(options)

      it("isBetween", async () => {
        const schema = Schema.BigInt.check(isBetween({ minimum: 5n, maximum: 10n }))
        const asserts = new TestSchema.Asserts(schema)

        const decoding = asserts.decoding()
        await decoding.succeed(5n)
        await decoding.succeed(7n)
        await decoding.succeed(10n)
        await decoding.fail(
          4n,
          `Expected a value between 5n and 10n`
        )
      })

      it("isGreaterThan", async () => {
        const schema = Schema.BigInt.check(isGreaterThan(5n))
        const asserts = new TestSchema.Asserts(schema)

        const decoding = asserts.decoding()
        await decoding.succeed(6n)
        await decoding.fail(
          5n,
          `Expected a value greater than 5n`
        )
      })

      it("isGreaterThanOrEqualTo", async () => {
        const schema = Schema.BigInt.check(isGreaterThanOrEqualTo(5n))
        const asserts = new TestSchema.Asserts(schema)

        const decoding = asserts.decoding()
        await decoding.succeed(5n)
        await decoding.succeed(6n)
        await decoding.fail(
          4n,
          `Expected a value greater than or equal to 5n`
        )
      })

      it("isLessThan", async () => {
        const schema = Schema.BigInt.check(isLessThan(5n))
        const asserts = new TestSchema.Asserts(schema)

        const decoding = asserts.decoding()
        await decoding.succeed(4n)
        await decoding.fail(
          5n,
          `Expected a value less than 5n`
        )
      })

      it("isLessThanOrEqualTo", async () => {
        const schema = Schema.BigInt.check(isLessThanOrEqualTo(5n))
        const asserts = new TestSchema.Asserts(schema)

        const decoding = asserts.decoding()
        await decoding.succeed(5n)
        await decoding.succeed(4n)
        await decoding.fail(
          6n,
          `Expected a value less than or equal to 5n`
        )
      })
    })

    describe("Record checks", () => {
      it("isMinProperties", async () => {
        const schema = Schema.Record(Schema.String, Schema.Finite).check(Schema.isMinProperties(1))
        const asserts = new TestSchema.Asserts(schema)

        const decoding = asserts.decoding()
        await decoding.succeed({ a: 1, b: 2 })
        await decoding.fail(
          {},
          `Expected a value with at least 1 entry`
        )
      })

      it("isMaxProperties", async () => {
        const schema = Schema.Record(Schema.String, Schema.Finite).check(Schema.isMaxProperties(2))
        const asserts = new TestSchema.Asserts(schema)

        const decoding = asserts.decoding()
        await decoding.succeed({ a: 1, b: 2 })
        await decoding.fail(
          { a: 1, b: 2, c: 3 },
          `Expected a value with at most 2 entries`
        )
        await decoding.fail(
          { a: 1, b: 2, c: 3 },
          `Expected a value with at most 2 entries`
        )
      })

      it("isMinProperties with symbol keys", async () => {
        const sym = Symbol("test")
        const schema = Schema.Record(Schema.Union([Schema.String, Schema.Symbol]), Schema.Finite).check(
          Schema.isMinProperties(2)
        )
        const asserts = new TestSchema.Asserts(schema)

        const decoding = asserts.decoding()
        await decoding.succeed({ a: 1, [sym]: 2 })
        await decoding.fail(
          { [sym]: 1 },
          `Expected a value with at least 2 entries`
        )
      })

      it("isMaxProperties with symbol keys", async () => {
        const sym1 = Symbol("test1")
        const sym2 = Symbol("test2")
        const sym3 = Symbol("test3")
        const schema = Schema.Record(Schema.Union([Schema.String, Schema.Symbol]), Schema.Finite).check(
          Schema.isMaxProperties(2)
        )
        const asserts = new TestSchema.Asserts(schema)

        const decoding = asserts.decoding()
        await decoding.succeed({ [sym1]: 1, [sym2]: 2 })
        await decoding.fail(
          { [sym1]: 1, [sym2]: 2, [sym3]: 3 },
          `Expected a value with at most 2 entries`
        )
      })

      it("isBetweenProperties", async () => {
        const schema = Schema.Record(Schema.String, Schema.Number).check(Schema.isBetweenProperties(2, 2))
        const asserts = new TestSchema.Asserts(schema)

        const decoding = asserts.decoding()
        await decoding.succeed({ a: 1, b: 2 })
        await decoding.succeed({ ["__proto__"]: 0, "": 0 })
        await decoding.fail(
          { a: 1 },
          `Expected a value with exactly 2 entries`
        )
        await decoding.fail(
          { a: 1, b: 2, c: 3 },
          `Expected a value with exactly 2 entries`
        )
      })

      it("isBetweenProperties with symbol keys", async () => {
        const sym1 = Symbol("test1")
        const sym2 = Symbol("test2")
        const schema = Schema.Record(Schema.Union([Schema.String, Schema.Symbol]), Schema.Number).check(
          Schema.isBetweenProperties(2, 2)
        )
        const asserts = new TestSchema.Asserts(schema)

        const decoding = asserts.decoding()
        await decoding.succeed({ [sym1]: 1, [sym2]: 2 })
        await decoding.succeed({ a: 1, [sym1]: 2 })
        await decoding.fail(
          { [sym1]: 1 },
          `Expected a value with exactly 2 entries`
        )
        await decoding.fail(
          { [sym1]: 1, [sym2]: 2, a: 3 },
          `Expected a value with exactly 2 entries`
        )
      })

      it("isPropertyNames", async () => {
        const schema = Schema.Record(Schema.String, Schema.Finite).check(
          Schema.isPropertyNames(Schema.String.check(Schema.isPattern(/^[A-Z]/)))
        )
        const asserts = new TestSchema.Asserts(schema)

        const decoding = asserts.decoding()
        await decoding.succeed({ Ab: 1 })
        await decoding.fail(
          { ab: 1 },
          `Expected a string matching the RegExp ^[A-Z]
  at ["ab"]`
        )
      })

      it("isPropertyNames with Never", async () => {
        const schema = Schema.Record(Schema.String, Schema.Finite).check(Schema.isPropertyNames(Schema.Never))
        const asserts = new TestSchema.Asserts(schema)

        const decoding = asserts.decoding()
        await decoding.succeed({})
        await decoding.fail(
          { a: 1 },
          `Expected never
  at ["a"]`
        )
      })
    })

    describe("Array checks", () => {
      it("UniqueArray", async () => {
        const schema = Schema.UniqueArray(Schema.Struct({
          a: Schema.String,
          b: Schema.String
        }))
        const asserts = new TestSchema.Asserts(schema)

        const decoding = asserts.decoding()
        await decoding.succeed([{ a: "a", b: "b" }, { a: "c", b: "d" }])
        await decoding.fail(
          [{ a: "a", b: "b" }, { a: "a", b: "b" }],
          `Expected an array with unique items`
        )
      })
    })
  })

  it("Finite", async () => {
    const schema = Schema.Finite
    const asserts = new TestSchema.Asserts(schema)
    if (verifyGeneration) {
      asserts.arbitrary().verifyGeneration()
    }
  })

  describe("Transformations", () => {
    it("NumberFromString", async () => {
      const schema = Schema.NumberFromString
      const asserts = new TestSchema.Asserts(schema)

      if (verifyGeneration) {
        asserts.arbitrary().verifyGeneration()
      }

      const decoding = asserts.decoding()
      await decoding.succeed("1", 1)
      await decoding.succeed("NaN", NaN)
      await decoding.succeed("Infinity", Infinity)
      await decoding.succeed("+Infinity", Infinity)
      await decoding.succeed("-Infinity", -Infinity)

      const encoding = asserts.encoding()
      await encoding.succeed(1, "1")
      await encoding.succeed(NaN, "NaN")
      await encoding.succeed(Infinity, "Infinity")
      await encoding.succeed(-Infinity, "-Infinity")
      await encoding.fail(
        "a",
        `Expected number`
      )
    })

    it("DateFromString", async () => {
      const schema = Schema.DateFromString
      const asserts = new TestSchema.Asserts(schema)
      if (verifyGeneration) {
        asserts.arbitrary().verifyGeneration()
      }

      const decoding = asserts.decoding()
      await decoding.succeed("2021-01-01T00:00:00.000Z", new Date("2021-01-01T00:00:00.000Z"))
      await decoding.fail("invalid", `Expected a valid Date`)

      const encoding = asserts.encoding()
      await encoding.succeed(new Date("2021-01-01T00:00:00.000Z"), "2021-01-01T00:00:00.000Z")
      await encoding.fail(new Date(NaN), `Expected a valid Date`)
    })

    it("DateFromMillis", async () => {
      const schema = Schema.DateFromMillis
      const asserts = new TestSchema.Asserts(schema)
      if (verifyGeneration) {
        asserts.arbitrary().verifyGeneration()
      }

      const decoding = asserts.decoding()
      await decoding.succeed(0, new Date(0))
      await decoding.fail(NaN, `Expected an integer`)
      await decoding.fail(Infinity, `Expected an integer`)
      await decoding.fail(-Infinity, `Expected an integer`)
      await decoding.fail(null, `Expected number`)
      await decoding.fail(8640000000000001, `Expected a valid Date`)

      const encoding = asserts.encoding()
      await encoding.succeed(new Date(0), 0)
      await encoding.fail(new Date("invalid"), `Expected a valid Date`)
      await encoding.fail(new Date(NaN), `Expected a valid Date`)
      await encoding.fail(new Date(Infinity), `Expected a valid Date`)
      await encoding.fail(new Date(-Infinity), `Expected a valid Date`)
    })

    it("FiniteFromString", async () => {
      const schema = Schema.FiniteFromString
      const asserts = new TestSchema.Asserts(schema)

      if (verifyGeneration) {
        asserts.arbitrary().verifyGeneration()
      }

      const decoding = asserts.decoding()
      await decoding.succeed("1", 1)
      await decoding.fail(
        "a",
        `Expected a finite number`
      )
      await decoding.fail(
        "NaN",
        `Expected a finite number`
      )
      await decoding.fail(
        "Infintiy",
        `Expected a finite number`
      )
      await decoding.fail(
        "+Infintiy",
        `Expected a finite number`
      )
      await decoding.fail(
        "-Infintiy",
        `Expected a finite number`
      )

      const encoding = asserts.encoding()
      await encoding.succeed(1, "1")
      await encoding.fail(
        "a",
        `Expected number`
      )
    })

    it("BigIntFromString", async () => {
      const schema = Schema.BigIntFromString
      const asserts = new TestSchema.Asserts(schema)
      if (verifyGeneration) {
        asserts.arbitrary().verifyGeneration()
      }

      const decoding = asserts.decoding()
      await decoding.succeed("0", 0n)
      await decoding.fail(
        "a",
        `Expected a string representing a bigint`
      )

      const encoding = asserts.encoding()
      await encoding.succeed(0n, "0")
    })

    it("BigDecimalFromString", async () => {
      const schema = Schema.BigDecimalFromString
      const asserts = new TestSchema.Asserts(schema)

      if (verifyGeneration) {
        asserts.arbitrary().verifyGeneration()
      }

      const decoding = asserts.decoding()
      await decoding.succeed("0", Option.getOrThrow(BigDecimal.fromString("0")))
      await decoding.succeed("123.456", Option.getOrThrow(BigDecimal.fromString("123.456")))

      const encoding = asserts.encoding()
      await encoding.succeed(BigDecimal.make(0n, 0), "0")
      await encoding.succeed(BigDecimal.make(123456n, 3), "123.456")
      await encoding.fail(
        "a",
        `Expected BigDecimal`
      )
    })

    it("TimeZoneNamedFromString", async () => {
      const schema = Schema.TimeZoneNamedFromString
      const asserts = new TestSchema.Asserts(schema)

      if (verifyGeneration) {
        asserts.arbitrary().verifyGeneration()
      }

      const decoding = asserts.decoding()
      await decoding.succeed("Europe/London", DateTime.zoneMakeNamedUnsafe("Europe/London"))

      const encoding = asserts.encoding()
      await encoding.succeed(DateTime.zoneMakeNamedUnsafe("Europe/London"), "Europe/London")
      await encoding.fail(
        "a",
        `Expected DateTime.TimeZone.Named`
      )
    })

    it("TimeZoneFromString", async () => {
      const schema = Schema.TimeZoneFromString
      const asserts = new TestSchema.Asserts(schema)

      if (verifyGeneration) {
        asserts.arbitrary().verifyGeneration()
      }

      const decoding = asserts.decoding()
      await decoding.succeed("Europe/London", DateTime.zoneMakeNamedUnsafe("Europe/London"))
      await decoding.succeed("+03:00", DateTime.zoneMakeOffset(3 * 60 * 60 * 1000))

      const encoding = asserts.encoding()
      await encoding.succeed(DateTime.zoneMakeNamedUnsafe("Europe/London"), "Europe/London")
      await encoding.succeed(DateTime.zoneMakeOffset(3 * 60 * 60 * 1000), "+03:00")
      await encoding.fail(
        "a",
        `Expected DateTime.TimeZone`
      )
    })

    it("DateTimeZonedFromString", async () => {
      const schema = Schema.DateTimeZonedFromString
      const asserts = new TestSchema.Asserts(schema)

      if (verifyGeneration) {
        asserts.arbitrary().verifyGeneration()
      }

      const zoned = DateTime.makeZonedUnsafe("2021-01-01T00:00:00.000Z", { timeZone: "Europe/London" })

      const decoding = asserts.decoding()
      await decoding.fail("invalid", "Expected a valid Zoned DateTime string")

      const encoding = asserts.encoding()
      await encoding.succeed(zoned, DateTime.formatIsoZoned(zoned))
      await encoding.fail(
        "a",
        `Expected DateTime.Zoned`
      )
    })

    it("FiniteFromString & isGreaterThan", async () => {
      const schema = Schema.FiniteFromString.check(Schema.isGreaterThan(2))
      const asserts = new TestSchema.Asserts(schema)

      const decoding = asserts.decoding()
      await decoding.succeed("3", 3)
      await decoding.fail(
        "1",
        `Expected a value greater than 2`
      )

      const encoding = asserts.encoding()
      await encoding.succeed(3, "3")
      await encoding.fail(
        1,
        `Expected a value greater than 2`
      )
    })
  })

  describe("decodeTo", () => {
    it("should expose the source and the target schemas", () => {
      const schema = Schema.FiniteFromString

      strictEqual(schema.from.ast._tag, "String")
      strictEqual(schema.to, Schema.Finite)
    })

    it("required to required", async () => {
      const schema = Schema.Struct({
        a: Schema.String.pipe(
          Schema.decodeTo(
            Schema.String,
            SchemaTransformation.passthrough()
          )
        )
      })
      const asserts = new TestSchema.Asserts(schema)

      const decoding = asserts.decoding()
      await decoding.succeed({ a: "a" })
      await decoding.fail(
        {},
        `Missing key
  at ["a"]`
      )

      const encoding = asserts.encoding()
      await encoding.succeed({ a: "a" })
      await encoding.fail(
        {},
        `Missing key
  at ["a"]`
      )
    })

    it("required to optional", async () => {
      const schema = Schema.Struct({
        a: Schema.String.pipe(
          Schema.decodeTo(
            Schema.optionalKey(Schema.String),
            {
              decode: SchemaGetter.required(),
              encode: SchemaGetter.withDefault(Effect.succeed("default"))
            }
          )
        )
      })
      const asserts = new TestSchema.Asserts(schema)

      const decoding = asserts.decoding()
      await decoding.succeed({ a: "a" })
      await decoding.fail(
        {},
        `Missing key
  at ["a"]`
      )

      const encoding = asserts.encoding()
      await encoding.succeed({ a: "a" })
      await encoding.succeed({}, { a: "default" })
    })

    it("optionalKey to required", async () => {
      const schema = Schema.Struct({
        a: Schema.optionalKey(Schema.String).pipe(
          Schema.decodeTo(
            Schema.String,
            {
              decode: SchemaGetter.withDefault(Effect.succeed("default")),
              encode: SchemaGetter.passthrough()
            }
          )
        )
      })
      const asserts = new TestSchema.Asserts(schema)

      const decoding = asserts.decoding()
      await decoding.succeed({ a: "a" })
      await decoding.succeed({}, { a: "default" })

      const encoding = asserts.encoding()
      await encoding.succeed({ a: "a" })
    })

    it("double transformation", async () => {
      const schema = Schema.Trim.pipe(Schema.decodeTo(
        Schema.FiniteFromString,
        SchemaTransformation.passthrough()
      ))
      const asserts = new TestSchema.Asserts(schema)

      const decoding = asserts.decoding()
      await decoding.succeed(" 2 ", 2)
      await decoding.fail(
        " a2 ",
        `Expected a finite number`
      )

      const encoding = asserts.encoding()
      await encoding.succeed(2, "2")
    })

    it("double transformation with checks", async () => {
      const schema = Schema.Struct({
        a: Schema.String.check(Schema.isMinLength(2)).pipe(
          Schema.decodeTo(
            Schema.String.check(Schema.isMinLength(3)),
            SchemaTransformation.passthrough()
          ),
          Schema.decodeTo(
            Schema.String,
            SchemaTransformation.passthrough()
          )
        )
      })
      const asserts = new TestSchema.Asserts(schema)

      const decoding = asserts.decoding()
      await decoding.succeed({ a: "aaa" })
      await decoding.fail(
        { a: "aa" },
        `Expected a value with a length of at least 3
  at ["a"]`
      )

      const encoding = asserts.encoding()
      await encoding.succeed({ a: "aaa" })
      await encoding.fail(
        { a: "aa" },
        `Expected a value with a length of at least 3
  at ["a"]`
      )
    })

    it("nested defaults", async () => {
      const schema = Schema.Struct({
        a: Schema.optionalKey(Schema.Struct({
          b: Schema.optionalKey(Schema.String)
        })).pipe(Schema.decodeTo(
          Schema.Struct({
            b: Schema.optionalKey(Schema.String).pipe(
              Schema.decodeTo(
                Schema.String,
                {
                  decode: SchemaGetter.withDefault(Effect.succeed("default-b")),
                  encode: SchemaGetter.passthrough()
                }
              )
            )
          }),
          {
            decode: SchemaGetter.withDefault(Effect.succeed({})),
            encode: SchemaGetter.passthrough()
          }
        ))
      })
      const asserts = new TestSchema.Asserts(schema)

      const decoding = asserts.decoding()
      await decoding.succeed({ a: { b: "b" } })
      await decoding.succeed({ a: {} }, { a: { b: "default-b" } })
      await decoding.succeed({}, { a: { b: "default-b" } })
    })
  })

  describe("decode", () => {
    it("double transformation", async () => {
      const schema = Schema.String.pipe(
        Schema.decode(
          SchemaTransformation.composeTransformation(
            SchemaTransformation.trim(),
            SchemaTransformation.toLowerCase()
          )
        )
      )
      const asserts = new TestSchema.Asserts(schema)

      const decoding = asserts.decoding()
      await decoding.succeed(" A ", "a")

      const encoding = asserts.encoding()
      await encoding.succeed(" A ", " A ")
    })
  })

  describe("encodeTo", () => {
    it("required to required", async () => {
      const schema = Schema.Struct({
        a: Schema.String.pipe(
          Schema.encodeTo(
            Schema.String,
            SchemaTransformation.passthrough()
          )
        )
      })
      const asserts = new TestSchema.Asserts(schema)

      const decoding = asserts.decoding()
      await decoding.succeed({ a: "a" })
      await decoding.fail(
        {},
        `Missing key
  at ["a"]`
      )

      const encoding = asserts.encoding()
      await encoding.succeed({ a: "a" })
      await encoding.fail(
        {},
        `Missing key
  at ["a"]`
      )
    })

    it("required to optionalKey", async () => {
      const schema = Schema.Struct({
        a: Schema.String.pipe(
          Schema.encodeTo(
            Schema.optionalKey(Schema.String),
            {
              decode: SchemaGetter.withDefault(Effect.succeed("default")),
              encode: SchemaGetter.passthrough()
            }
          )
        )
      })
      const asserts = new TestSchema.Asserts(schema)

      const decoding = asserts.decoding()
      await decoding.succeed({ a: "a" })
      await decoding.succeed({}, { a: "default" })

      const encoding = asserts.encoding()
      await encoding.succeed({ a: "a" })
    })

    it("optionalKey to required", async () => {
      const schema = Schema.Struct({
        a: Schema.optionalKey(Schema.String).pipe(
          Schema.encodeTo(
            Schema.String,
            {
              decode: SchemaGetter.required(),
              encode: SchemaGetter.withDefault(Effect.succeed("default"))
            }
          )
        )
      })
      const asserts = new TestSchema.Asserts(schema)

      const decoding = asserts.decoding()
      await decoding.succeed({ a: "a" })
      await decoding.fail(
        {},
        `Missing key
  at ["a"]`
      )

      const encoding = asserts.encoding()
      await encoding.succeed({ a: "a" })
      await encoding.succeed({}, { a: "default" })
    })

    it("double transformation", async () => {
      const schema = Schema.FiniteFromString.pipe(Schema.encodeTo(
        Schema.Trim,
        SchemaTransformation.passthrough()
      ))
      const asserts = new TestSchema.Asserts(schema)

      const decoding = asserts.decoding()
      await decoding.succeed(" 2 ", 2)
      await decoding.fail(
        " a2 ",
        `Expected a finite number`
      )

      const encoding = asserts.encoding()
      await encoding.succeed(2, "2")
    })

    it("double transformation with checks", async () => {
      const schema = Schema.Struct({
        a: Schema.String.pipe(
          Schema.encodeTo(
            Schema.String.check(Schema.isMinLength(3)),
            SchemaTransformation.passthrough()
          ),
          Schema.encodeTo(
            Schema.String.check(Schema.isMinLength(2)),
            SchemaTransformation.passthrough()
          )
        )
      })
      const asserts = new TestSchema.Asserts(schema)

      const decoding = asserts.decoding()
      await decoding.succeed({ a: "aaa" })
      await decoding.fail(
        { a: "aa" },
        `Expected a value with a length of at least 3
  at ["a"]`
      )

      const encoding = asserts.encoding()
      await encoding.succeed({ a: "aaa" })
      await encoding.fail(
        { a: "aa" },
        `Expected a value with a length of at least 3
  at ["a"]`
      )
    })
  })

  describe("encode", () => {
    it("double transformation", async () => {
      const schema = Schema.String.pipe(
        Schema.encode(
          SchemaTransformation.composeTransformation(
            SchemaTransformation.trim(),
            SchemaTransformation.toLowerCase()
          ).flip()
        )
      )
      const asserts = new TestSchema.Asserts(schema)

      const decoding = asserts.decoding()
      await decoding.succeed(" A ", " A ")

      const encoding = asserts.encoding()
      await encoding.succeed(" A ", "a")
    })
  })

  describe("flip", () => {
    it("should expose the schema", () => {
      const schema = Schema.Struct({
        a: Schema.String
      })
      const flipped = schema.pipe(Schema.flip)
      strictEqual(flipped.schema, schema)
    })

    it("string & isMinLength(3) <-> number & isGreaterThan(2)", async () => {
      const schema = Schema.FiniteFromString.pipe(
        Schema.check(Schema.isGreaterThan(2)),
        Schema.flip,
        Schema.check(Schema.isMinLength(3))
      )
      const asserts = new TestSchema.Asserts(schema)

      const decoding = asserts.decoding()
      await decoding.fail(
        2,
        `Expected a value greater than 2`
      )
      await decoding.fail(
        3,
        `Expected a value with a length of at least 3`
      )

      const encoding = asserts.encoding()
      await encoding.succeed("123", 123)
    })

    it("Struct & flip & check & flip should apply the check to the encoded side", async () => {
      const schema = Schema.Struct({ a: Schema.String }).pipe(
        Schema.flip,
        Schema.check(Schema.makeFilter((o) => o.a.length > 1, { expected: "a length > 1" })),
        Schema.flip
      )
      assertTrue(SchemaAST.isObjects(schema.ast))
      strictEqual(schema.ast.checks, undefined)
      strictEqual(schema.ast.encodingChecks?.length, 1)
      const asserts = new TestSchema.Asserts(schema)

      const decoding = asserts.decoding()
      await decoding.fail(
        { a: "a" },
        `Expected a length > 1`
      )
      await decoding.succeed({ a: "aa" })

      const encoding = asserts.encoding()
      await encoding.fail(
        { a: "a" },
        `Expected a length > 1`
      )
      await encoding.succeed({ a: "aa" })
    })

    it("Tuple & flip & check & flip should apply the check to the encoded side", async () => {
      const schema = Schema.Tuple([Schema.String]).pipe(
        Schema.flip,
        Schema.check(Schema.makeFilter((tuple) => tuple[0].length > 1, { expected: "head length > 1" })),
        Schema.flip
      )
      assertTrue(SchemaAST.isArrays(schema.ast))
      strictEqual(schema.ast.checks, undefined)
      strictEqual(schema.ast.encodingChecks?.length, 1)
      const asserts = new TestSchema.Asserts(schema)

      const decoding = asserts.decoding()
      await decoding.fail(
        ["a"],
        `Expected head length > 1`
      )
      await decoding.succeed(["aa"])

      const encoding = asserts.encoding()
      await encoding.fail(
        ["a"],
        `Expected head length > 1`
      )
      await encoding.succeed(["aa"])
    })

    it("Union & flip & check & flip should apply the check to the encoded side", async () => {
      const schema = Schema.Union([Schema.Literal("a"), Schema.Literal("aa")]).pipe(
        Schema.flip,
        Schema.check(Schema.makeFilter((s) => s === "aa", { expected: `"aa"` })),
        Schema.flip
      )
      assertTrue(SchemaAST.isUnion(schema.ast))
      strictEqual(schema.ast.checks, undefined)
      strictEqual(schema.ast.encodingChecks?.length, 1)
      const asserts = new TestSchema.Asserts(schema)

      const decoding = asserts.decoding()
      await decoding.fail(
        "a",
        `Expected "aa"`
      )
      await decoding.succeed("aa")

      const encoding = asserts.encoding()
      await encoding.fail(
        "a",
        `Expected "aa"`
      )
      await encoding.succeed("aa")
    })

    it("Declaration & flip & check & flip should apply the check to the encoded side", async () => {
      const schema = Schema.declare(
        (u): u is string => typeof u === "string",
        { expected: "string declaration" }
      ).pipe(
        Schema.flip,
        Schema.check(Schema.makeFilter((s) => s.length > 1, { expected: "a length > 1" })),
        Schema.flip
      )
      assertTrue(SchemaAST.isDeclaration(schema.ast))
      strictEqual(schema.ast.checks, undefined)
      strictEqual(schema.ast.encodingChecks?.length, 1)
      const asserts = new TestSchema.Asserts(schema)

      const decoding = asserts.decoding()
      await decoding.fail(
        "a",
        `Expected a length > 1`
      )
      await decoding.succeed("aa")

      const encoding = asserts.encoding()
      await encoding.fail(
        "a",
        `Expected a length > 1`
      )
      await encoding.succeed("aa")
    })

    it("Struct & flip & check & flip with encoding chain should check the local value", async () => {
      const local = Schema.Struct({ a: Schema.String }).pipe(
        Schema.flip,
        Schema.check(Schema.makeFilter((o) => typeof o.a === "string" && o.a.length > 1, {
          expected: "a length > 1"
        })),
        Schema.flip
      )
      const schema = Schema.Struct({ b: Schema.String }).pipe(
        Schema.decodeTo(local, {
          decode: SchemaGetter.transform<{ readonly a: string }, { readonly b: string }>((o) => ({ a: o.b })),
          encode: SchemaGetter.transform<{ readonly b: string }, { readonly a: string }>((o) => ({ b: o.a }))
        })
      )
      assertTrue(SchemaAST.isObjects(schema.ast))
      strictEqual(schema.ast.encoding?.length, 1)
      strictEqual(schema.ast.encodingChecks?.length, 1)
      const asserts = new TestSchema.Asserts(schema)

      const decoding = asserts.decoding()
      await decoding.fail(
        { b: "a" },
        `Expected a length > 1`
      )
      await decoding.succeed({ b: "aa" }, { a: "aa" })

      const encoding = asserts.encoding()
      await encoding.fail(
        { a: "a" },
        `Expected a length > 1`
      )
      await encoding.succeed({ a: "aa" }, { b: "aa" })
    })

    it("should work with withConstructorDefault", async () => {
      const schema = Schema.Struct({
        a: Schema.FiniteFromString.pipe(Schema.withConstructorDefault(Effect.succeed(-1)))
      })
      const asserts = new TestSchema.Asserts(schema)

      const make = asserts.make()
      await make.succeed({ a: 1 })
      await make.succeed({}, { a: -1 })

      const flipped = schema.pipe(Schema.flip)
      const assertsFlipped = new TestSchema.Asserts(flipped)
      throws(() => flipped.make({} as any))
      const makeFlipped = assertsFlipped.make()
      await makeFlipped.succeed({ a: "1" })

      const flipped2 = flipped.pipe(Schema.flip)
      const assertsFlipped2 = new TestSchema.Asserts(flipped2)
      deepStrictEqual(flipped2.fields, schema.fields)
      const makeFlipped2 = assertsFlipped2.make()
      await makeFlipped2.succeed({ a: 1 })
      await makeFlipped2.succeed({}, { a: -1 })
    })
  })

  it("declare", async () => {
    const schema = Schema.declare(
      (u) => u instanceof File,
      { expected: "File" }
    )
    const asserts = new TestSchema.Asserts(schema)

    const decoding = asserts.decoding()
    await decoding.succeed(new File([], "a.txt"))
    await decoding.fail("a", `Expected File`)
  })

  describe("Redacted", () => {
    it("should expose the value", () => {
      const schema = Schema.Redacted(Schema.String)
      strictEqual(schema.value, Schema.String)
      strictEqual(schema.annotate({}).value, Schema.String)
    })

    it("does not expose unwrapped inputs", async () => {
      const schema = Schema.Redacted(Schema.String)
      const asserts = new TestSchema.Asserts(schema)

      const decoding = asserts.decoding()
      await decoding.fail("secret", `Expected Redacted`)

      const encoding = asserts.encoding()
      await encoding.fail("secret", `Expected Redacted`)
    })

    it("Redacted(Finite)", async () => {
      const schema = Schema.Redacted(Schema.Int)
      const asserts = new TestSchema.Asserts(schema)

      if (verifyGeneration) {
        asserts.arbitrary().verifyGeneration()
      }

      const decoding = asserts.decoding()
      await decoding.succeed(Redacted.make(123))
      await decoding.fail(null, `Expected Redacted`)
      await decoding.fail(
        Redacted.make("a"),
        `Expected a valid value
  at ["value"]`
      )
      await decoding.fail(
        Redacted.make(1.2),
        `Expected a valid value
  at ["value"]`
      )

      const encoding = asserts.encoding()
      await encoding.succeed(Redacted.make(123))
      await encoding.fail(null, `Expected Redacted`)
      await encoding.fail(
        Redacted.make("a"),
        `Expected a valid value
  at ["value"]`
      )
      await encoding.fail(
        Redacted.make(1.2),
        `Expected a valid value
  at ["value"]`
      )
    })

    it("Redacted(FiniteFromString)", async () => {
      const schema = Schema.Redacted(Schema.FiniteFromString.check(Schema.isInt()))
      const asserts = new TestSchema.Asserts(schema)

      if (verifyGeneration) {
        asserts.arbitrary().verifyGeneration()
      }

      const decoding = asserts.decoding()
      await decoding.succeed(Redacted.make("123"), Redacted.make(123))
      const decoded = Schema.decodeUnknownSync(schema)(Redacted.make("123", { label: "secret" }))
      strictEqual(Redacted.value(decoded), 123)
      strictEqual(decoded.label, "secret")
      await decoding.fail(null, `Expected Redacted`)
      await decoding.fail(
        Redacted.make(null),
        `Expected a valid value
  at ["value"]`
      )
      await decoding.fail(
        Redacted.make("a"),
        `Expected a valid value
  at ["value"]`
      )
      await decoding.fail(
        Redacted.make("1.2"),
        `Expected a valid value
  at ["value"]`
      )

      const encoding = asserts.encoding()
      await encoding.succeed(Redacted.make(123), Redacted.make("123"))
      const encoded = Schema.encodeSync(schema)(Redacted.make(123, { label: "secret" }))
      strictEqual(Redacted.value(encoded), "123")
      strictEqual(encoded.label, "secret")
      await encoding.fail(null, `Expected Redacted`)
      await encoding.fail(
        Redacted.make(null),
        `Expected a valid value
  at ["value"]`
      )
      await encoding.fail(
        Redacted.make("a"),
        `Expected a valid value
  at ["value"]`
      )
      await encoding.fail(
        Redacted.make(1.2),
        `Expected a valid value
  at ["value"]`
      )
    })

    it("with label", async () => {
      const schema = Schema.Redacted(Schema.NonEmptyString, { label: "password" })
      const asserts = new TestSchema.Asserts(schema)

      const decoding = asserts.decoding()
      await decoding.succeed(Redacted.make("a", { label: "password" }))
      await decoding.fail(
        Redacted.make("a", { label: "API key" }),
        `Expected "password"
  at ["label"]`
      )
      await decoding.fail(
        Redacted.make(1, { label: "API key" }),
        `Expected "password"
  at ["label"]`
      )
      await decoding.fail(
        Redacted.make(1, { label: "password" }),
        `Expected a valid value
  at ["value"]`
      )

      const encoding = asserts.encoding()
      await encoding.succeed(Redacted.make("a", { label: "password" }))
      await encoding.fail(
        Redacted.make("a", { label: "API key" }),
        `Expected "password"
  at ["label"]`
      )
      await encoding.fail(
        Redacted.make("", { label: "password" }),
        `Expected a valid value
  at ["value"]`
      )
    })
  })

  describe("RedactedFromValue", () => {
    it("should decode a value", async () => {
      const schema = Schema.RedactedFromValue(Schema.FiniteFromString.check(Schema.isInt()))
      const asserts = new TestSchema.Asserts(schema)

      const decoding = asserts.decoding()
      await decoding.succeed("123", Redacted.make(123))
      await decoding.fail(null, `Expected string`)
      await decoding.fail("1.2", `Expected an integer`)

      const encoding = asserts.encoding()
      await encoding.succeed(Redacted.make(123), "123")
      await encoding.fail("schema-secret", `Expected Redacted`)
      await encoding.fail(
        Redacted.make("schema-secret"),
        `Expected a valid value
  at ["value"]`
      )
      await encoding.fail(
        Redacted.make(1.2),
        `Expected a valid value
  at ["value"]`
      )
    })
  })

  describe("Option", () => {
    it("should expose the value", () => {
      const schema = Schema.Option(Schema.String)
      strictEqual(schema.value, Schema.String)
      strictEqual(schema.annotate({}).value, Schema.String)
    })

    it("Option(FiniteFromString)", async () => {
      const schema = Schema.Option(Schema.FiniteFromString)
      const asserts = new TestSchema.Asserts(schema)

      if (verifyGeneration) {
        asserts.arbitrary().verifyGeneration()
      }

      const decoding = asserts.decoding()
      await decoding.succeed(Option.none())
      await decoding.succeed(Option.some("123"), Option.some(123))
      await decoding.fail(null, `Expected Option`)
      await decoding.fail(
        Option.some(null),
        `Expected string
  at ["value"]`
      )

      const encoding = asserts.encoding()
      await encoding.succeed(Option.none())
      await encoding.succeed(Option.some(123), Option.some("123"))
      await encoding.fail(null, `Expected Option`)
      await encoding.fail(
        Option.some(null),
        `Expected number
  at ["value"]`
      )
    })
  })

  it("OptionFromNullOr", async () => {
    const schema = Schema.OptionFromNullOr(Schema.FiniteFromString)
    const asserts = new TestSchema.Asserts(schema)

    if (verifyGeneration) {
      asserts.arbitrary().verifyGeneration()
    }

    const decoding = asserts.decoding()
    await decoding.succeed(null, Option.none())
    await decoding.succeed("1", Option.some(1))
    await decoding.fail("a", `Expected a finite number`)

    const encoding = asserts.encoding()
    await encoding.succeed(Option.none(), null)
    await encoding.succeed(Option.some(1), "1")
  })

  it("OptionFromUndefinedOr", async () => {
    const schema = Schema.OptionFromUndefinedOr(Schema.FiniteFromString)
    const asserts = new TestSchema.Asserts(schema)

    if (verifyGeneration) {
      asserts.arbitrary().verifyGeneration()
    }

    const decoding = asserts.decoding()
    await decoding.succeed(undefined, Option.none())
    await decoding.succeed("1", Option.some(1))
    await decoding.fail("a", `Expected a finite number`)

    const encoding = asserts.encoding()
    await encoding.succeed(Option.none(), undefined)
    await encoding.succeed(Option.some(1), "1")
  })

  describe("OptionFromNullishOr", () => {
    it("onNoneEncoding: null", async () => {
      const schema = Schema.OptionFromNullishOr(Schema.FiniteFromString, { onNoneEncoding: null })
      const asserts = new TestSchema.Asserts(schema)

      if (verifyGeneration) {
        asserts.arbitrary().verifyGeneration()
      }

      const decoding = asserts.decoding()
      await decoding.succeed(null, Option.none())
      await decoding.succeed(undefined, Option.none())
      await decoding.succeed("1", Option.some(1))
      await decoding.fail("a", `Expected a finite number`)

      const encoding = asserts.encoding()
      await encoding.succeed(Option.none(), null)
      await encoding.succeed(Option.some(1), "1")
    })

    it("onNoneEncoding: undefined", async () => {
      const schema = Schema.OptionFromNullishOr(Schema.FiniteFromString, { onNoneEncoding: undefined })
      const asserts = new TestSchema.Asserts(schema)

      if (verifyGeneration) {
        asserts.arbitrary().verifyGeneration()
      }

      const decoding = asserts.decoding()
      await decoding.succeed(null, Option.none())
      await decoding.succeed(undefined, Option.none())
      await decoding.succeed("1", Option.some(1))
      await decoding.fail("a", `Expected a finite number`)

      const encoding = asserts.encoding()
      await encoding.succeed(Option.none(), undefined)
      await encoding.succeed(Option.some(1), "1")
    })
  })

  it("OptionFromOptionalKey", async () => {
    const schema = Schema.Struct({
      a: Schema.OptionFromOptionalKey(Schema.FiniteFromString)
    })
    const asserts = new TestSchema.Asserts(schema)

    if (verifyGeneration) {
      asserts.arbitrary().verifyGeneration()
    }

    const decoding = asserts.decoding()
    await decoding.succeed({}, { a: Option.none() })
    await decoding.succeed({ a: "1" }, { a: Option.some(1) })
    await decoding.fail(
      { a: undefined },
      `Expected string
  at ["a"]`
    )
    await decoding.fail(
      { a: "a" },
      `Expected a finite number
  at ["a"]`
    )

    const encoding = asserts.encoding()
    await encoding.succeed({ a: Option.none() }, {})
    await encoding.succeed({ a: Option.some(1) }, { a: "1" })
  })

  it("OptionFromOptional", async () => {
    const schema = Schema.Struct({
      a: Schema.OptionFromOptional(Schema.FiniteFromString)
    })
    const asserts = new TestSchema.Asserts(schema)

    if (verifyGeneration) {
      asserts.arbitrary().verifyGeneration()
    }

    const decoding = asserts.decoding()
    await decoding.succeed({}, { a: Option.none() })
    await decoding.succeed({ a: undefined }, { a: Option.none() })
    await decoding.succeed({ a: "1" }, { a: Option.some(1) })
    await decoding.fail(
      { a: "a" },
      `Expected a finite number
  at ["a"]`
    )

    const encoding = asserts.encoding()
    await encoding.succeed({ a: Option.none() }, {})
    await encoding.succeed({ a: Option.some(1) }, { a: "1" })
  })

  describe("OptionFromOptionalNullOr", () => {
    it("default (omit)", async () => {
      const schema = Schema.Struct({
        a: Schema.OptionFromOptionalNullOr(Schema.FiniteFromString)
      })
      const asserts = new TestSchema.Asserts(schema)

      if (verifyGeneration) {
        asserts.arbitrary().verifyGeneration()
      }

      const decoding = asserts.decoding()
      await decoding.succeed({}, { a: Option.none() })
      await decoding.succeed({ a: null }, { a: Option.none() })
      await decoding.succeed({ a: undefined }, { a: Option.none() })
      await decoding.succeed({ a: "1" }, { a: Option.some(1) })
      await decoding.fail(
        { a: "a" },
        `Expected a finite number
  at ["a"]`
      )

      const encoding = asserts.encoding()
      await encoding.succeed({ a: Option.none() }, {})
      await encoding.succeed({ a: Option.some(1) }, { a: "1" })
      await encoding.fail(
        { a: null },
        `Expected Option
  at ["a"]`
      )
    })

    it("onNoneEncoding: null", async () => {
      const schema = Schema.Struct({
        a: Schema.OptionFromOptionalNullOr(Schema.FiniteFromString, { onNoneEncoding: null })
      })
      const asserts = new TestSchema.Asserts(schema)

      const decoding = asserts.decoding()
      await decoding.succeed({}, { a: Option.none() })
      await decoding.succeed({ a: null }, { a: Option.none() })
      await decoding.succeed({ a: undefined }, { a: Option.none() })
      await decoding.succeed({ a: "1" }, { a: Option.some(1) })

      const encoding = asserts.encoding()
      await encoding.succeed({ a: Option.none() }, { a: null })
      await encoding.succeed({ a: Option.some(1) }, { a: "1" })
    })

    it("onNoneEncoding: undefined", async () => {
      const schema = Schema.Struct({
        a: Schema.OptionFromOptionalNullOr(Schema.FiniteFromString, { onNoneEncoding: undefined })
      })
      const asserts = new TestSchema.Asserts(schema)

      const decoding = asserts.decoding()
      await decoding.succeed({}, { a: Option.none() })
      await decoding.succeed({ a: null }, { a: Option.none() })
      await decoding.succeed({ a: undefined }, { a: Option.none() })
      await decoding.succeed({ a: "1" }, { a: Option.some(1) })

      const encoding = asserts.encoding()
      await encoding.succeed({ a: Option.none() }, { a: undefined })
      await encoding.succeed({ a: Option.some(1) }, { a: "1" })
    })
  })

  describe("Result", () => {
    it("should expose the values", () => {
      const schema = Schema.Result(Schema.String, Schema.Number)
      strictEqual(schema.success, Schema.String)
      strictEqual(schema.annotate({}).success, Schema.String)
      strictEqual(schema.failure, Schema.Number)
      strictEqual(schema.annotate({}).failure, Schema.Number)
    })

    it("Result(FiniteFromString, FiniteFromString)", async () => {
      const schema = Schema.Result(Schema.FiniteFromString, Schema.FiniteFromString)
      const asserts = new TestSchema.Asserts(schema)

      if (verifyGeneration) {
        asserts.arbitrary().verifyGeneration()
      }

      const decoding = asserts.decoding()
      await decoding.succeed(Result.succeed("1"), Result.succeed(1))
      await decoding.succeed(Result.fail("2"), Result.fail(2))
      await decoding.fail(null, `Expected Result`)
      await decoding.fail(
        Result.succeed("a"),
        `Expected a finite number
  at ["success"]`
      )
      await decoding.fail(
        Result.fail("b"),
        `Expected a finite number
  at ["failure"]`
      )

      const encoding = asserts.encoding()
      await encoding.succeed(Result.succeed(1), Result.succeed("1"))
      await encoding.succeed(Result.fail(2), Result.fail("2"))
    })
  })

  it("Defect", async () => {
    const schema = Schema.Defect()
    const asserts = new TestSchema.Asserts(schema)

    const noPrototypeObject = Object.create(null)
    noPrototypeObject.message = "a"

    if (verifyGeneration) {
      asserts.arbitrary().verifyGeneration()
    }

    const decoding = asserts.decoding()
    // Error: message only
    await decoding.succeed({ message: "a" }, new Error("a"))
    await decoding.succeed(noPrototypeObject, new Error("a"))
    // Error: message and name
    await decoding.succeed(
      { message: "a", name: "b" },
      (() => {
        const err = new Error("a")
        err.name = "b"
        return err
      })()
    )
    // Error: message, name, and stack
    await decoding.succeed(
      { message: "a", name: "b", stack: "c" },
      (() => {
        const err = new Error("a")
        err.name = "b"
        err.stack = "c"
        return err
      })()
    )
    // anything else
    await decoding.succeed("a")
    await decoding.succeed({ a: 1 })

    const encoding = asserts.encoding()
    // Error
    await encoding.succeed(new Error("a"), { name: "Error", message: "a" })
    // anything else
    await encoding.succeed("a")
    await encoding.succeed({ a: 1 })
    await encoding.succeed(noPrototypeObject, { message: "a" })
  })

  it("ErrorInstance and Defect memoize equivalent options", () => {
    const assertMemoized = <S>(schema: (options?: Schema.ErrorOptions) => S) => {
      strictEqual(schema(), schema({}))
      strictEqual(schema(), schema({ includeStack: false }))
      strictEqual(schema(), schema({ excludeCause: false }))
      strictEqual(schema(), schema({ includeStack: false, excludeCause: false }))
      strictEqual(schema({ includeStack: true }), schema({ includeStack: true }))
      strictEqual(schema({ includeStack: true }), schema({ includeStack: true, excludeCause: false }))
      strictEqual(schema({ excludeCause: true }), schema({ excludeCause: true }))
      strictEqual(schema({ excludeCause: true }), schema({ includeStack: false, excludeCause: true }))
      strictEqual(
        schema({ includeStack: true, excludeCause: true }),
        schema({ includeStack: true, excludeCause: true })
      )
      assertFalse(schema() === schema({ includeStack: true }))
      assertFalse(schema() === schema({ excludeCause: true }))
      assertFalse(schema({ includeStack: true }) === schema({ includeStack: true, excludeCause: true }))
      assertFalse(schema({ excludeCause: true }) === schema({ includeStack: true, excludeCause: true }))
    }

    assertMemoized(Schema.ErrorInstance)
    assertMemoized(Schema.Defect)
  })

  describe("CauseReason", () => {
    it("should expose the values", () => {
      const schema = Schema.CauseReason(Schema.String, Schema.Number)
      strictEqual(schema.error, Schema.String)
      strictEqual(schema.annotate({}).error, Schema.String)
      strictEqual(schema.defect, Schema.Number)
      strictEqual(schema.annotate({}).defect, Schema.Number)
    })

    it("CauseReason(FiniteFromString, FiniteFromString)", async () => {
      const schema = Schema.CauseReason(Schema.FiniteFromString, Schema.FiniteFromString)
      const asserts = new TestSchema.Asserts(schema)

      if (verifyGeneration) {
        asserts.arbitrary().verifyGeneration()
      }
    })
  })

  describe("Cause", () => {
    it("strict encoding preserves the default wire format for every reason variant", () => {
      const schema = Schema.fromJsonString(Schema.toCodecJson(Schema.Cause(Schema.String, Schema.Number)))
      const cause = Cause.fromReasons([
        Cause.makeFailReason("boom"),
        Cause.makeDieReason(42),
        Cause.makeInterruptReason(7),
        Cause.makeInterruptReason()
      ])
      const wire =
        "[{\"_tag\":\"Fail\",\"error\":\"boom\"},{\"_tag\":\"Die\",\"defect\":42},{\"_tag\":\"Interrupt\",\"fiberId\":7},{\"_tag\":\"Interrupt\",\"fiberId\":null}]"
      strictEqual(Schema.encodeSync(schema)(cause), wire)
      strictEqual(Schema.encodeSync(schema, { onExcessProperty: "error" })(cause), wire)
      assert.deepStrictEqual(Schema.decodeSync(schema)(wire), cause)
      assert.deepStrictEqual(Schema.decodeSync(schema, { onExcessProperty: "error" })(wire), cause)
    })

    it("should expose the values", () => {
      const schema = Schema.Cause(Schema.String, Schema.Number)
      strictEqual(schema.error, Schema.String)
      strictEqual(schema.annotate({}).error, Schema.String)
      strictEqual(schema.defect, Schema.Number)
      strictEqual(schema.annotate({}).defect, Schema.Number)
    })

    it("Cause(FiniteFromString, FiniteFromString)", async () => {
      const schema = Schema.Cause(Schema.FiniteFromString, Schema.FiniteFromString)
      const asserts = new TestSchema.Asserts(schema)

      if (verifyGeneration) {
        asserts.arbitrary().verifyGeneration()
      }

      const decoding = asserts.decoding()
      await decoding.succeed(Cause.fail("1"), Cause.fail(1))
      await decoding.succeed(Cause.die("2"), Cause.die(2))
      await decoding.succeed(Cause.interrupt(3))

      await decoding.fail(
        Cause.fail("a"),
        `Expected a finite number
  at ["failures"][0]["error"]`
      )
      await decoding.fail(
        Cause.die("a"),
        `Expected a finite number
  at ["failures"][0]["defect"]`
      )

      const encoding = asserts.encoding()
      await encoding.succeed(Cause.fail(1), Cause.fail("1"))
      await encoding.succeed(Cause.die(2), Cause.die("2"))
      await encoding.succeed(Cause.interrupt(3))

      await encoding.fail(
        Cause.fail("a"),
        `Expected number
  at ["failures"][0]["error"]`
      )
      await encoding.fail(
        Cause.die("a"),
        `Expected number
  at ["failures"][0]["defect"]`
      )
    })
  })

  it("Error", async () => {
    const schema = Schema.ErrorInstance()
    const asserts = new TestSchema.Asserts(schema)

    if (verifyGeneration) {
      asserts.arbitrary().verifyGeneration()
    }

    const error = new Error("a")
    const customError = new Error("b")
    customError.name = "CustomError"
    customError.stack = "stack"

    const decoding = asserts.decoding()
    await decoding.succeed(error)
    await decoding.succeed(customError)
    await decoding.fail(
      { message: "a" },
      `Expected Error`
    )
    await decoding.fail(
      "a",
      `Expected Error`
    )

    const encoding = asserts.encoding()
    await encoding.succeed(error)
    await encoding.succeed(customError)
    await encoding.fail(
      { message: "a" },
      `Expected Error`
    )
    await encoding.fail(
      "a",
      `Expected Error`
    )
  })

  describe("Exit", () => {
    it("should expose the values", () => {
      const schema = Schema.Exit(Schema.String, Schema.Number, Schema.Boolean)
      strictEqual(schema.value, Schema.String)
      strictEqual(schema.annotate({}).value, Schema.String)
      strictEqual(schema.error, Schema.Number)
      strictEqual(schema.annotate({}).error, Schema.Number)
      strictEqual(schema.defect, Schema.Boolean)
      strictEqual(schema.annotate({}).defect, Schema.Boolean)
    })

    it("Exit(FiniteFromString, String, Unknown)", async () => {
      const schema = Schema.Exit(Schema.FiniteFromString, Schema.String, Schema.Unknown)
      const asserts = new TestSchema.Asserts(schema)

      if (verifyGeneration) {
        asserts.arbitrary().verifyGeneration()
      }

      const decoding = asserts.decoding()
      await decoding.succeed(Exit.succeed("123"), Exit.succeed(123))
      await decoding.succeed(Exit.fail("boom"))
      await decoding.fail(
        null,
        `Expected Exit`
      )
      await decoding.fail(
        Exit.succeed(123),
        `Expected string
  at ["value"]`
      )
      await decoding.fail(
        Exit.fail(null),
        `Expected string
  at ["cause"]["failures"][0]["error"]`
      )
    })

    it("Exit(FiniteFromString, String, Defect)", async () => {
      const schema = Schema.Exit(Schema.FiniteFromString, Schema.String, Schema.Defect())
      const asserts = new TestSchema.Asserts(schema)

      const decoding = asserts.decoding()
      const boomError = new Error("boom message")
      boomError.name = "boom"

      await decoding.succeed(
        Exit.die({
          name: "boom",
          message: "boom message"
        }),
        Exit.die(boomError)
      )
    })
  })

  describe("suspend", () => {
    it("should work", async () => {
      interface Category<A, T> {
        readonly a: A
        readonly categories: ReadonlyArray<T>
      }
      interface CategoryType extends Category<number, CategoryType> {}
      interface CategoryEncoded extends Category<string, CategoryEncoded> {}

      const schema = Schema.Struct({
        a: Schema.FiniteFromString.check(Schema.isGreaterThan(0)),
        categories: Schema.Array(Schema.suspend((): Schema.Codec<CategoryType, CategoryEncoded> => schema))
      })
      const asserts = new TestSchema.Asserts(schema)

      const decoding = asserts.decoding()
      await decoding.succeed({ a: "1", categories: [] }, { a: 1, categories: [] })
      await decoding.succeed({ a: "1", categories: [{ a: "2", categories: [] }] }, {
        a: 1,
        categories: [{ a: 2, categories: [] }]
      })
      await decoding.fail(
        {
          a: "1",
          categories: [{ a: "a", categories: [] }]
        },
        `Expected a finite number
  at ["categories"][0]["a"]`
      )

      const encoding = asserts.encoding()
      await encoding.succeed({ a: 1, categories: [] }, { a: "1", categories: [] })
      await encoding.succeed({ a: 1, categories: [{ a: 2, categories: [] }] }, {
        a: "1",
        categories: [{ a: "2", categories: [] }]
      })
      await encoding.fail(
        { a: 1, categories: [{ a: -1, categories: [] }] },
        `Expected a value greater than 0
  at ["categories"][0]["a"]`
      )
    })
  })

  describe("make", () => {
    it("preserves __proto__ as an own option", () => {
      const value = { polluted: true }
      const schema = Schema.make(Schema.String.ast, {
        ["__proto__"]: value
      })

      assertTrue(Schema.isSchema(schema))
      assertTrue(Object.hasOwn(schema, "__proto__"))
      strictEqual((schema as any)["__proto__"], value)
    })

    it("preserves name and length as options", () => {
      const schema = Schema.make<Schema.String>(Schema.String.ast, {
        name: "CustomSchema",
        length: 2
      })

      strictEqual((schema as any).name, "CustomSchema")
      strictEqual((schema as any).length, 2)

      const rebuilt = schema.annotate({})

      strictEqual((rebuilt as any).name, "CustomSchema")
      strictEqual((rebuilt as any).length, 2)
    })

    it("assigns options", () => {
      const schema = Schema.make<Schema.String>(Schema.String.ast, {
        custom: "value"
      })

      assertTrue(Schema.isSchema(schema))
      strictEqual((schema as any).custom, "value")

      const rebuilt = schema.annotate({})

      strictEqual((rebuilt as any).custom, "value")
    })

    it("should throw an error when the cause contains both a schema issue and a defect", () => {
      const cause = Cause.combine(
        Cause.fail(new SchemaIssue.InvalidValue({ message: "schema issue" })),
        Cause.die(new Error("defect"))
      )
      const schema = Schema.Struct({
        a: Schema.String.pipe(Schema.withConstructorDefault(Effect.failCause(cause)))
      })

      throws(() => schema.make({}), (e) => {
        assertTrue(e instanceof Error)
        strictEqual(e.message, "Constructor adapter can only throw schema issues")
        assertTrue(Cause.hasDies(e.cause as Cause.Cause<never>))
      })
    })
  })

  describe("makeOption", () => {
    it("Struct", () => {
      const schema = Schema.Struct({ a: Schema.Number.check(Schema.isGreaterThan(0)) })
      deepStrictEqual(schema.makeOption({ a: 1 }), Option.some({ a: 1 }))
      deepStrictEqual(schema.makeOption({ a: -1 }), Option.none())
    })

    it("Class", () => {
      class A extends Schema.Class<A>("A")(Schema.Struct({ a: Schema.Number.check(Schema.isGreaterThan(0)) })) {}
      deepStrictEqual(A.makeOption({ a: 1 }), Option.some(new A({ a: 1 })))
      deepStrictEqual(A.makeOption({ a: -1 }), Option.none())
    })

    it("should throw an error when the cause is not a schema issue", () => {
      const schema = Schema.Struct({
        a: Schema.String.pipe(Schema.withConstructorDefault(Effect.die(new Error("make defect"))))
      })
      class A extends Schema.Class<A>("A")(schema) {}

      throws(() => schema.makeOption({}), (e) => {
        assertTrue(e instanceof Error)
        strictEqual(e.message, "Option adapter can only return none for schema issues")
        assertTrue(Cause.hasDies(e.cause as Cause.Cause<never>))
      })
      throws(() => A.makeOption(), (e) => {
        assertTrue(e instanceof Error)
        strictEqual(e.message, "Option adapter can only return none for schema issues")
        assertTrue(Cause.hasDies(e.cause as Cause.Cause<never>))
      })
    })
  })

  describe("makeEffect", () => {
    it.effect("Struct", () =>
      Effect.gen(function*() {
        const schema = Schema.Struct({ a: Schema.Number.check(Schema.isGreaterThan(0)) })

        const success = yield* schema.makeEffect({ a: 1 }).pipe(Effect.result)
        deepStrictEqual(success, Result.succeed({ a: 1 }))

        const failure = yield* schema.makeEffect({ a: -1 }).pipe(Effect.flip)
        assertTrue(SchemaIssue.isIssue(failure))
      }))

    it.effect("Class", () =>
      Effect.gen(function*() {
        class A extends Schema.Class<A>("A")(Schema.Struct({ a: Schema.Number.check(Schema.isGreaterThan(0)) })) {}

        const success = yield* A.makeEffect({ a: 1 })
        deepStrictEqual(success, new A({ a: 1 }))

        const failure = yield* A.makeEffect({ a: -1 }).pipe(Effect.flip)
        assertTrue(SchemaIssue.isIssue(failure))
      }))

    it.effect("should preserve mixed schema issue and defect causes", () =>
      Effect.gen(function*() {
        const cause = Cause.combine(
          Cause.fail(new SchemaIssue.InvalidValue({ message: "schema issue" })),
          Cause.die(new Error("defect"))
        )
        const schema = Schema.Struct({
          a: Schema.String.pipe(Schema.withConstructorDefault(Effect.failCause(cause)))
        })

        const exit = yield* schema.makeEffect({}).pipe(Effect.exit)
        assertTrue(Exit.isFailure(exit))
        assertTrue(Exit.hasDies(exit))
        const error = Cause.findError(exit.cause)
        assertTrue(Result.isSuccess(error))
        assertTrue(SchemaIssue.isIssue(error.success))
      }))
  })

  describe("withConstructorDefault", () => {
    describe("Struct", () => {
      it("should not apply defaults when decoding / encoding", async () => {
        const schema = Schema.Struct({
          a: Schema.String.pipe(Schema.optionalKey, Schema.withConstructorDefault(Effect.succeed("a")))
        })
        const asserts = new TestSchema.Asserts(schema)

        const decoding = asserts.decoding()
        await decoding.succeed({}, {})

        const encoding = asserts.encoding()
        await encoding.succeed({}, {})
      })

      it("should apply constructor default when the field is not present", async () => {
        const schema = Schema.Struct({
          a: Schema.FiniteFromString.pipe(Schema.withConstructorDefault(Effect.succeed(-1)))
        })
        const asserts = new TestSchema.Asserts(schema)

        const make = asserts.make()
        await make.succeed({ a: 1 })
        await make.succeed({}, { a: -1 })
      })

      it("should construct a Class field from a plain object", () => {
        class A extends Schema.Class<A>("A")({ a: Schema.String }) {}
        const schema = Schema.Struct({
          a: A.pipe(Schema.withConstructorDefault(Effect.succeed(A.make({ a: "default" }))))
        })

        const result = schema.make({ a: { a: "a" } })
        assertTrue(result.a instanceof A)
      })

      describe("nested defaults", () => {
        it("Struct", async () => {
          const schema = Schema.Struct({
            a: Schema.Struct({
              b: Schema.FiniteFromString.pipe(Schema.withConstructorDefault(Effect.succeed(-1)))
            }).pipe(Schema.withConstructorDefault(Effect.succeed({})))
          })
          const asserts = new TestSchema.Asserts(schema)

          const make = asserts.make()
          await make.succeed({ a: { b: 1 } })
          await make.succeed({ a: {} }, { a: { b: -1 } })
          await make.succeed({}, { a: { b: -1 } })
        })

        it("Class", async () => {
          class A extends Schema.Class<A>("A")(Schema.Struct({
            a: Schema.Struct({
              b: Schema.FiniteFromString.pipe(Schema.withConstructorDefault(Effect.succeed(-1)))
            }).pipe(Schema.withConstructorDefault(Effect.succeed({})))
          })) {}

          const asserts = new TestSchema.Asserts(A)

          const make = asserts.make()
          await make.succeed({ a: { b: 1 } }, new A({ a: { b: 1 } }))
          await make.succeed({ a: {} }, new A({ a: { b: -1 } }))
          await make.succeed({}, new A({ a: { b: -1 } }))

          deepStrictEqual(A.make({ a: { b: 1 } }), new A({ a: { b: 1 } }))
          deepStrictEqual(A.make({ a: {} }), new A({ a: { b: -1 } }))
          deepStrictEqual(A.make({}), new A({ a: { b: -1 } }))
        })
      })

      it("applies constructor default when disableChecks is true", () => {
        class A extends Schema.Class<A>("A")({
          a: Schema.String.pipe(Schema.withConstructorDefault(Effect.succeed("default")))
        }) {}

        const instance = new A({}, { disableChecks: true })
        deepStrictEqual(instance.a, "default")
      })

      it("Struct & Effect sync", async () => {
        const schema = Schema.Struct({
          a: Schema.FiniteFromString.pipe(Schema.withConstructorDefault(Effect.succeed(-1)))
        })
        const asserts = new TestSchema.Asserts(schema)

        const make = asserts.make()
        await make.succeed({ a: 1 })
        await make.succeed({}, { a: -1 })
      })

      it("Struct & Effect async", async () => {
        const schema = Schema.Struct({
          a: Schema.FiniteFromString.pipe(Schema.withConstructorDefault(
            Effect.gen(function*() {
              yield* Effect.sleep(100)
              return -1
            })
          ))
        })
        const asserts = new TestSchema.Asserts(schema)

        const make = asserts.make()
        await make.succeed({ a: 1 })
        await make.succeed({}, { a: -1 })
      })

      it("Effect failing with SchemaIssue propagates as parse failure", async () => {
        const schema = Schema.Struct({
          a: Schema.FiniteFromString.pipe(Schema.withConstructorDefault(
            Effect.fail(new SchemaIssue.InvalidValue({ message: "ctor default failed" }))
          ))
        })
        const asserts = new TestSchema.Asserts(schema)

        const make = asserts.make()
        await make.succeed({ a: 1 })
        await make.fail(
          {},
          `ctor default failed
  at ["a"]`
        )
      })

      it("Effect failing via another schema's makeEffect propagates as parse failure", async () => {
        const Inner = Schema.Struct({
          n: Schema.FiniteFromString.pipe(Schema.check(Schema.isGreaterThan(0)))
        })
        const schema = Schema.Struct({
          a: Schema.FiniteFromString.pipe(Schema.withConstructorDefault(
            Inner.makeEffect({ n: -1 }).pipe(Effect.map((s) => s.n))
          ))
        })
        const asserts = new TestSchema.Asserts(schema)

        const make = asserts.make()
        await make.succeed({ a: 1 })
        await make.fail(
          {},
          `Expected a value greater than 0
  at ["a"]["n"]`
        )
      })

      it("Struct & Effect async & service", async () => {
        class Service extends Context.Service<Service, { value: Effect.Effect<number> }>()("Service") {}

        const schema = Schema.Struct({
          a: Schema.FiniteFromString.pipe(Schema.withConstructorDefault(
            Effect.gen(function*() {
              yield* Effect.sleep(100)
              const oservice = yield* Effect.serviceOption(Service)
              if (Option.isNone(oservice)) {
                return -1
              }
              return yield* oservice.value.value
            })
          ))
        })
        const asserts = new TestSchema.Asserts(schema)

        const make = asserts.make()

        await make.succeed({ a: 1 })
        await make.succeed({}, { a: -1 })
        const effect = await schema.makeEffect({}).pipe(
          Effect.provideService(Service, { value: Effect.succeed(0) }),
          Effect.result,
          Effect.runPromise
        )
        deepStrictEqual(effect, Result.succeed({ a: 0 }))
      })
    })

    describe("Tuple", () => {
      it("Tuple & Some", async () => {
        const schema = Schema.Tuple(
          [Schema.FiniteFromString.pipe(Schema.withConstructorDefault(Effect.succeed(-1)))]
        )
        const asserts = new TestSchema.Asserts(schema)

        const make = asserts.make()
        await make.succeed([1])
        await make.succeed([], [-1])
      })

      it("nested defaults (Struct)", async () => {
        const schema = Schema.Tuple(
          [
            Schema.Struct({
              b: Schema.FiniteFromString.pipe(Schema.withConstructorDefault(Effect.succeed(-1)))
            }).pipe(Schema.withConstructorDefault(Effect.succeed({})))
          ]
        )
        const asserts = new TestSchema.Asserts(schema)

        const make = asserts.make()
        await make.succeed([{ b: 1 }])
        await make.succeed([{}], [{ b: -1 }])
        await make.succeed([], [{ b: -1 }])
      })

      it("inner defaults (Tuple)", async () => {
        const schema = Schema.Tuple(
          [
            Schema.Tuple([
              Schema.FiniteFromString.pipe(Schema.withConstructorDefault(Effect.succeed(-1)))
            ])
          ]
        )
        const asserts = new TestSchema.Asserts(schema)

        const make = asserts.make()
        await make.succeed([[1]])
        await make.succeed([[]], [[-1]])
      })

      it("nested defaults (Tuple)", async () => {
        const schema = Schema.Tuple(
          [
            Schema.Tuple([
              Schema.FiniteFromString.pipe(Schema.withConstructorDefault(Effect.succeed(-1)))
            ]).pipe(Schema.withConstructorDefault(Effect.succeed([] as const)))
          ]
        )
        const asserts = new TestSchema.Asserts(schema)

        const make = asserts.make()
        await make.succeed([[1]])
        await make.succeed([[]], [[-1]])
        await make.succeed([], [[-1]])
      })
    })
  })

  describe("Record", () => {
    it("Record(String, Number)", async () => {
      const schema = Schema.Record(Schema.String, Schema.Number)
      const asserts = new TestSchema.Asserts(schema)

      const make = asserts.make()
      await make.succeed({ a: 1 })
      await make.fail(null, `Expected object`)

      const decoding = asserts.decoding()
      await decoding.succeed({ a: 1 })
      await decoding.fail(null, "Expected object")
      await decoding.fail(
        { a: "b" },
        `Expected number
  at ["a"]`
      )

      const encoding = asserts.encoding()
      await encoding.succeed({ a: 1 })
      await encoding.fail(
        { a: "b" },
        `Expected number
  at ["a"]`
      )
      await encoding.fail(null, "Expected object")
    })

    it("recursive values stay lazy", async () => {
      interface Recursive {
        readonly [key: string]: Recursive
      }
      const schema: Schema.Codec<Recursive> = Schema.Record(
        Schema.String,
        Schema.suspend((): Schema.Codec<Recursive> => schema)
      )
      const asserts = new TestSchema.Asserts(schema)

      const input = { a: { b: {} } }
      await asserts.decoding().succeed(input)
      await asserts.encoding().succeed(input)
    })

    it.effect("sequential parsing resumes without replaying entries", () =>
      Effect.gen(function*() {
        const calls: Array<string> = []
        const value = Schema.String.pipe(
          Schema.decode({
            decode: SchemaGetter.transformEffect((value) => {
              calls.push(value)
              return value === "b" ? Effect.yieldNow.pipe(Effect.as(value)) : Effect.succeed(value)
            }),
            encode: SchemaGetter.passthrough()
          })
        )
        const schema = Schema.Record(Schema.String, value)
        const input = { a: "a", b: "b", c: "c" }

        deepStrictEqual(yield* Schema.decodeUnknownEffect(schema)(input), input)
        deepStrictEqual(calls, ["a", "b", "c"])
      }))

    it("Record(String, optionalKey(Number)) should throw", async () => {
      throws(
        () => Schema.Record(Schema.String, Schema.optionalKey(Schema.Number)),
        new Error("Cannot use `Schema.optionalKey` with index signatures, use `Schema.optional` instead.")
      )
    })

    it("Record(String, optional(Number))", async () => {
      const schema = Schema.Record(Schema.String, Schema.optional(Schema.Number))
      const asserts = new TestSchema.Asserts(schema)

      const make = asserts.make()
      await make.succeed({ a: 1 })
      await make.succeed({ a: undefined })
      await make.fail(null, `Expected object`)

      const decoding = asserts.decoding()
      await decoding.succeed({ a: 1 })
      await decoding.succeed({ a: undefined })

      const encoding = asserts.encoding()
      await encoding.succeed({ a: 1 })
      await encoding.succeed({ a: undefined })
    })

    it("Record(String.check, Number) should use the key checks to select keys", async () => {
      const schema = Schema.Record(Schema.String.check(Schema.isPattern(/^a/)), Schema.Number)
      const asserts = new TestSchema.Asserts(schema)

      const decoding = asserts.decoding()
      await decoding.succeed({ a: 1, ab: 2, b: "ignored" }, { a: 1, ab: 2 })
      await decoding.fail(
        { a: "bad", b: 1 },
        `Expected number
  at ["a"]`
      )
    })

    it("applies excess-property options to unmatched own keys", () => {
      const schema = Schema.Record(Schema.String.check(Schema.isPattern(/^a/)), Schema.Number)
      const input = { a: 1, b: 2 }

      deepStrictEqual(Schema.decodeUnknownSync(schema)(input, { onExcessProperty: "ignore" }), { a: 1 })
      deepStrictEqual(Schema.encodeUnknownSync(schema)(input, { onExcessProperty: "ignore" }), { a: 1 })
      throws(
        () => Schema.decodeUnknownSync(schema)(input, { onExcessProperty: "error" }),
        `Expected no excess property\n  at ["b"]`
      )
      throws(
        () => Schema.encodeUnknownSync(schema)(input, { onExcessProperty: "error" }),
        `Expected no excess property\n  at ["b"]`
      )
    })

    it("recognizes numeric declared keys with an index signature", () => {
      const symbol = Symbol("symbol")
      const schema = Schema.Record(Schema.Union([Schema.Literal(1), Schema.Symbol]), Schema.String)
      const input = { 1: "one", [symbol]: "symbol" }

      deepStrictEqual(Schema.decodeUnknownSync(schema)(input, { onExcessProperty: "error" }), input)
      deepStrictEqual(Schema.encodeUnknownSync(schema)(input, { onExcessProperty: "error" }), input)
    })

    it("Record(Symbol, Number)", async () => {
      const schema = Schema.Record(Schema.Symbol, Schema.Number)
      const asserts = new TestSchema.Asserts(schema)

      const make = asserts.make()
      await make.succeed({ [Symbol.for("a")]: 1 })
      await make.fail(null, `Expected object`)

      const decoding = asserts.decoding()
      await decoding.succeed({ [Symbol.for("a")]: 1 })
      await decoding.fail(null, "Expected object")
      await decoding.fail(
        { [Symbol.for("a")]: "b" },
        `Expected number
  at [Symbol(a)]`
      )

      const encoding = asserts.encoding()
      await encoding.succeed({ [Symbol.for("a")]: 1 })
      await encoding.fail(
        { [Symbol.for("a")]: "b" },
        `Expected number
  at [Symbol(a)]`
      )
      await encoding.fail(null, "Expected object")
    })

    for (const key of ["visible", Symbol("visible")]) {
      it(`index signatures select only enumerable ${typeof key} properties`, async () => {
        const input = { [key]: 1 }
        const hidden = typeof key === "string" ? "hidden" : Symbol("hidden")
        Object.defineProperty(input, hidden, {
          get() {
            throw new Error("Non-enumerable record entries must not be read")
          },
          enumerable: false
        })
        const schema = Schema.Record(typeof key === "string" ? Schema.String : Schema.Symbol, Schema.Number)
        const asserts = new TestSchema.Asserts(schema)
        const message = `Expected number\n  at [${typeof key === "string" ? JSON.stringify(key) : String(key)}]`

        for (const parseOptions of [undefined, { onExcessProperty: "error" } as const]) {
          await asserts.decoding({ parseOptions }).succeed(input, { [key]: 1 })
          await asserts.encoding({ parseOptions }).succeed(input, { [key]: 1 })
          await asserts.decoding({ parseOptions }).fail({ [key]: "invalid" }, message)
          await asserts.encoding({ parseOptions }).fail({ [key]: "invalid" }, message)
        }
      })
    }

    it("Record(Symbol.check, Number) should use the key checks to select keys", async () => {
      const a = Symbol.for("a")
      const b = Symbol.for("b")
      const schema = Schema.Record(
        Schema.Symbol.check(Schema.makeFilter((symbol) => Symbol.keyFor(symbol)?.startsWith("a") ?? false)),
        Schema.Number
      )
      const asserts = new TestSchema.Asserts(schema)

      const decoding = asserts.decoding()
      await decoding.succeed({ [a]: 1, [b]: "ignored" }, { [a]: 1 })
      await decoding.fail(
        { [a]: "bad", [b]: 1 },
        `Expected number
  at [Symbol(a)]`
      )
    })

    it("Record(SnakeToCamel, NumberFromString)", async () => {
      const schema = Schema.Record(SnakeToCamel, Schema.NumberFromString)
      const asserts = new TestSchema.Asserts(schema)

      const decoding = asserts.decoding()
      await decoding.succeed({ a: "1" }, { a: 1 })
      await decoding.succeed({ a_b: "1" }, { aB: 1 })
      await decoding.succeed({ a_b: "1", aB: "2" }, { aB: 2 })

      const encoding = asserts.encoding()
      await encoding.succeed({ a: 1 }, { a: "1" })
      await encoding.succeed({ aB: 1 }, { a_b: "1" })
      await encoding.succeed({ a_b: 1, aB: 2 }, { a_b: "2" })
    })

    it("UniqueSymbol", async () => {
      const a = Symbol.for("a")
      const schema = Schema.Record(Schema.UniqueSymbol(a), Schema.Number)
      const asserts = new TestSchema.Asserts(schema)

      const decoding = asserts.decoding()
      await decoding.succeed({ [a]: 1 })
      await decoding.fail(
        { [a]: "b" },
        `Expected number
  at [Symbol(a)]`
      )
    })

    describe("Literals keys", () => {
      it("deduplicates repeated literal keys", () => {
        const schema = Schema.Record(Schema.Literals(["a", "a", "b"]), Schema.Number)
        deepStrictEqual(schema.ast.propertySignatures.map((propertySignature) => propertySignature.name), ["a", "b"])
      })

      it("Record(Literals, Number)", async () => {
        const schema = Schema.Record(Schema.Literals(["a", "b"]), Schema.Number)
        const asserts = new TestSchema.Asserts(schema)

        const decoding = asserts.decoding()
        await decoding.succeed({ a: 1, b: 2 })
        await decoding.fail(
          { a: 1 },
          `Missing key
  at ["b"]`
        )
        await decoding.fail(
          { b: 2 },
          `Missing key
  at ["a"]`
        )
      })

      it("Record(Literals, optionalKey(Number))", async () => {
        const schema = Schema.Record(Schema.Literals(["a", "b"]), Schema.optionalKey(Schema.Number))
        const asserts = new TestSchema.Asserts(schema)

        const decoding = asserts.decoding()
        await decoding.succeed({})
        await decoding.succeed({ a: 1 })
        await decoding.succeed({ b: 2 })
        await decoding.succeed({ a: 1, b: 2 })
      })

      it("Record(Literals, mutableKey(Number))", async () => {
        const schema = Schema.Record(Schema.Literals(["a", "b"]), Schema.mutableKey(Schema.Number))
        const asserts = new TestSchema.Asserts(schema)

        const decoding = asserts.decoding()
        await decoding.succeed({ a: 1, b: 2 })
      })

      it("Record(Literals, mutableKey(optionalKey(Number)))", async () => {
        const schema = Schema.Record(
          Schema.Literals(["a", "b"]),
          Schema.mutableKey(Schema.optionalKey(Schema.Number))
        )
        const asserts = new TestSchema.Asserts(schema)

        const decoding = asserts.decoding()
        await decoding.succeed({})
        await decoding.succeed({ a: 1 })
        await decoding.succeed({ b: 2 })
        await decoding.succeed({ a: 1, b: 2 })
      })
    })

    it("Record(Number, String)", async () => {
      const schema = Schema.Record(Schema.Number, Schema.FiniteFromString)
      const asserts = new TestSchema.Asserts(schema)

      const decoding = asserts.decoding()
      await decoding.succeed({ 1: "1", 2.2: "2", Infinity: "3", NaN: "4", "-Infinity": "5" }, {
        "1": 1,
        "2.2": 2,
        Infinity: 3,
        NaN: 4,
        "-Infinity": 5
      })
      await decoding.fail(
        { 1: null },
        `Expected string
  at ["1"]`
      )
      await decoding.fail(
        { 1: "a" },
        `Expected a finite number
  at ["1"]`
      )
    })

    it("Record(Int, String)", async () => {
      const schema = Schema.Record(Schema.Int, Schema.FiniteFromString)
      const asserts = new TestSchema.Asserts(schema)

      const decoding = asserts.decoding()
      await decoding.succeed({ 1: "1" }, { "1": 1 })
      await decoding.succeed({ 1: "1", "1.1": "ignored", Infinity: "ignored", NaN: "ignored" }, { "1": 1 })
      await decoding.fail(
        { 1: null },
        `Expected string
  at ["1"]`
      )
      await decoding.fail(
        { 1: "a" },
        `Expected a finite number
  at ["1"]`
      )
    })

    it("Record(TemplateLiteral with checked part, Number) should use the part checks to select keys", async () => {
      const schema = Schema.Record(Schema.TemplateLiteral(["a", Schema.NonEmptyString]), Schema.Number)
      const asserts = new TestSchema.Asserts(schema)

      const decoding = asserts.decoding()
      await decoding.succeed({ a: "ignored", ab: 1 }, { ab: 1 })
      await decoding.fail(
        { a: 1, ab: "bad" },
        `Expected number
  at ["ab"]`
      )
    })

    it(`Record(Union(Number, "a"), FiniteFromString)`, async () => {
      const schema = Schema.Record(Schema.Union([Schema.Number, Schema.Literal("a")]), Schema.FiniteFromString)
      const asserts = new TestSchema.Asserts(schema)

      const decoding = asserts.decoding()
      await decoding.succeed(
        { a: "-1", 1: "1", 2.2: "2", Infinity: "3", NaN: "4", "-Infinity": "5" },
        {
          a: -1,
          "1": 1,
          "2.2": 2,
          Infinity: 3,
          NaN: 4,
          "-Infinity": 5
        }
      )
    })
  })

  describe("Union", () => {
    it("empty", async () => {
      const schema = Schema.Union([])
      const asserts = new TestSchema.Asserts(schema)

      const decoding = asserts.decoding()
      await decoding.fail(null, `Expected never`)
    })

    it(`String`, async () => {
      const schema = Schema.Union([Schema.String])
      const asserts = new TestSchema.Asserts(schema)

      const decoding = asserts.decoding()
      await decoding.succeed("a")
      await decoding.fail(null, `Expected string`)
    })

    it(`Void`, async () => {
      const schema = Schema.Union([Schema.Void])
      const asserts = new TestSchema.Asserts(schema)

      const decoding = asserts.decoding()
      await decoding.succeed(undefined)
      await decoding.succeed(null, undefined)
      await decoding.succeed("a", undefined)
      await decoding.succeed(1, undefined)
      await decoding.succeed({}, undefined)
      await decoding.succeed([], undefined)
    })

    it(`Void | String`, async () => {
      const schema = Schema.Union([Schema.Void, Schema.String])
      const asserts = new TestSchema.Asserts(schema)

      const decoding = asserts.decoding()
      await decoding.succeed("a", undefined)
    })

    it(`String | Number`, async () => {
      const schema = Schema.Union([Schema.String, Schema.Number])
      const asserts = new TestSchema.Asserts(schema)

      deepStrictEqual(schema.members, [Schema.String, Schema.Number])

      const decoding = asserts.decoding()
      await decoding.succeed("a")
      await decoding.succeed(1)
      await decoding.fail(
        null,
        `Expected string | number`
      )
    })

    it(`String | Never`, async () => {
      const schema = Schema.Union([Schema.String, Schema.Never])
      const asserts = new TestSchema.Asserts(schema)

      const decoding = asserts.decoding()
      await decoding.succeed("a")
      await decoding.fail(null, `Expected string | never`)
    })

    it(`String & isMinLength(1) | number & isGreaterThan(0)`, async () => {
      const schema = Schema.Union([
        Schema.NonEmptyString,
        Schema.Number.check(Schema.isGreaterThan(0))
      ])
      const asserts = new TestSchema.Asserts(schema)

      const decoding = asserts.decoding()
      await decoding.succeed("a")
      await decoding.succeed(1)
      await decoding.fail(
        "",
        `Expected a value with a length of at least 1`
      )
      await decoding.fail(
        -1,
        `Expected a value greater than 0`
      )
    })

    it(`mode: "oneOf"`, async () => {
      const schema = Schema.Union([
        Schema.Struct({ a: Schema.String }),
        Schema.Struct({ b: Schema.Number })
      ], { mode: "oneOf" })
      const asserts = new TestSchema.Asserts(schema)

      const decoding = asserts.decoding()
      await decoding.succeed({ a: "a" })
      await decoding.succeed({ b: 1 })
      await decoding.fail(
        { a: "a", b: 1 },
        "Expected exactly one member to match"
      )
    })

    it(`mode: "oneOf" with different sentinel keys`, async () => {
      const schema = Schema.Union([
        Schema.Struct({ kind: Schema.Literal("a"), value: Schema.String }),
        Schema.Struct({ status: Schema.Literal("ready"), value: Schema.String })
      ], { mode: "oneOf" })
      const asserts = new TestSchema.Asserts(schema)

      const decoding = asserts.decoding()
      await decoding.fail(
        { kind: "a", status: "ready", value: "value" },
        "Expected exactly one member to match"
      )
    })

    it(`mode: "oneOf" with nested and contradicted sentinels`, async () => {
      const nested = Schema.Union([
        Schema.Struct({ kind: Schema.Literal("a"), variant: Schema.Literal("x") }),
        Schema.Struct({ kind: Schema.Literal("a"), variant: Schema.Literal("y") })
      ])
      const schema = Schema.Struct({
        block: Schema.Union([
          nested,
          Schema.Struct({ kind: Schema.Literal("b") })
        ], { mode: "oneOf" })
      })
      const decoding = new TestSchema.Asserts(schema).decoding()

      await decoding.succeed({ block: { kind: "a", variant: "x" } })
      await decoding.fail(
        { block: { kind: "a", variant: "z" } },
        `Expected { readonly "kind": "a", readonly "variant": "x", ... } | { readonly "kind": "a", readonly "variant": "y", ... }
  at ["block"]`
      )
      await decoding.fail(
        { block: { kind: "a", variant: undefined } },
        `Expected { readonly "kind": "a", readonly "variant": "x", ... } | { readonly "kind": "a", readonly "variant": "y", ... }
  at ["block"]`
      )
    })

    it(`mode: "oneOf" counts repeated member occurrences`, async () => {
      const member = Schema.Struct({ kind: Schema.Literal("a") })
      const schema = Schema.Union([member, member], { mode: "oneOf" })
      const asserts = new TestSchema.Asserts(schema)

      const decoding = asserts.decoding()
      await decoding.fail(
        { kind: "a" },
        "Expected exactly one member to match"
      )
    })

    it(`mode: "oneOf" counts repeated literal occurrences`, async () => {
      const member = Schema.Literal("a")
      const schema = Schema.Union([member, member], { mode: "oneOf" })
      const asserts = new TestSchema.Asserts(schema)

      const decoding = asserts.decoding()
      await decoding.fail(
        "a",
        "Expected exactly one member to match"
      )
    })

    it("preserves member order after sentinel dispatch", async () => {
      const fallback = Schema.Struct({ value: Schema.String }).pipe(
        Schema.decodeTo(Schema.String, {
          decode: SchemaGetter.transform(() => "fallback"),
          encode: SchemaGetter.transform((value) => ({ value }))
        })
      )
      const discriminated = Schema.Struct({ kind: Schema.Literal("a"), value: Schema.String }).pipe(
        Schema.decodeTo(Schema.String, {
          decode: SchemaGetter.transform(() => "discriminated"),
          encode: SchemaGetter.transform((value) => ({ kind: "a" as const, value }))
        })
      )
      const schema = Schema.Union([fallback, discriminated])
      const asserts = new TestSchema.Asserts(schema)

      const decoding = asserts.decoding()
      await decoding.succeed({ kind: "a", value: "value" }, "fallback")
    })

    it("preserves recovering members during runtime type dispatch", async () => {
      const decodingFallback = Schema.String.pipe(
        Schema.catchDecoding(() => Effect.succeed(Option.some("fallback")))
      )
      const encodingFallback = Schema.String.pipe(
        Schema.catchEncoding(() => Effect.succeed(Option.some("fallback")))
      )
      const transformedFallback = Schema.NumberFromString.pipe(
        Schema.catchDecoding(() => Effect.succeed(Option.some(0)))
      )
      const nestedFallback = Schema.Union([decodingFallback, Schema.Number])
      const literalFallback = Schema.Literal("a").pipe(
        Schema.catchDecoding(() => Effect.succeed(Option.some("a" as const)))
      )
      const record = Schema.Record(decodingFallback, Schema.String)

      const decoding = new TestSchema.Asserts(Schema.Union([decodingFallback, Schema.Null])).decoding()
      await decoding.succeed(null, "fallback")

      const transformedDecoding = new TestSchema.Asserts(Schema.Union([transformedFallback, Schema.Null])).decoding()
      await transformedDecoding.succeed(null, 0)

      const nestedDecoding = new TestSchema.Asserts(Schema.Union([nestedFallback, Schema.Null])).decoding()
      await nestedDecoding.succeed(null, "fallback")

      const recordDecoding = new TestSchema.Asserts(Schema.Union([record, Schema.Null])).decoding()
      await recordDecoding.succeed(null, null)

      const literalDecoding = new TestSchema.Asserts(
        Schema.Union([literalFallback, Schema.Literal("b")])
      ).decoding()
      await literalDecoding.succeed("b", "a")

      const decodingOneOf = new TestSchema.Asserts(
        Schema.Union([decodingFallback, Schema.Null], { mode: "oneOf" })
      ).decoding()
      await decodingOneOf.fail(null, "Expected exactly one member to match")

      const encoding = new TestSchema.Asserts(Schema.Union([encodingFallback, Schema.Null])).encoding()
      await encoding.succeed(null, "fallback")

      const encodingOneOf = new TestSchema.Asserts(
        Schema.Union([encodingFallback, Schema.Null], { mode: "oneOf" })
      ).encoding()
      await encodingOneOf.fail(null, "Expected exactly one member to match")
    })

    it("preserves recovering members during sentinel dispatch", async () => {
      const decodingTag = Schema.Literal("a").pipe(
        Schema.catchDecoding(() => Effect.succeed(Option.some("a" as const)))
      )
      const encodingTag = Schema.Literal("a").pipe(
        Schema.catchEncoding(() => Effect.succeed(Option.some("a" as const)))
      )
      const decodingFirst = Schema.Struct({ kind: decodingTag })
      const encodingFirst = Schema.Struct({ kind: encodingTag })
      const decodingRoot = Schema.Struct({ kind: Schema.Literal("a") }).pipe(
        Schema.catchDecoding(() => Effect.succeed(Option.some({ kind: "a" as const })))
      )
      const second = Schema.Struct({ kind: Schema.Literal("b") })
      const input = { kind: "b" as const }

      const decoding = new TestSchema.Asserts(Schema.Union([decodingFirst, second])).decoding()
      await decoding.succeed(input, { kind: "a" })

      const rootDecoding = new TestSchema.Asserts(Schema.Union([decodingRoot, second])).decoding()
      await rootDecoding.succeed(input, { kind: "a" })

      const decodingOneOf = new TestSchema.Asserts(
        Schema.Union([decodingFirst, second], { mode: "oneOf" })
      ).decoding()
      await decodingOneOf.fail(input, "Expected exactly one member to match")

      const encoding = new TestSchema.Asserts(Schema.Union([encodingFirst, second])).encoding()
      await encoding.succeed(input, { kind: "a" })

      const encodingOneOf = new TestSchema.Asserts(
        Schema.Union([encodingFirst, second], { mode: "oneOf" })
      ).encoding()
      await encodingOneOf.fail(input, "Expected exactly one member to match")
    })

    it("keeps suspended members lazy during candidate selection", async () => {
      let decodingEvaluations = 0
      const decodingSuspended = Schema.suspend(() => {
        decodingEvaluations++
        return Schema.String
      })
      const decoding = new TestSchema.Asserts(
        Schema.Union([Schema.Literal("a"), decodingSuspended])
      ).decoding()

      await decoding.succeed("a", "a")
      strictEqual(decodingEvaluations, 0)
      await decoding.succeed("b", "b")
      await decoding.succeed("c", "c")
      strictEqual(decodingEvaluations, 1)

      let encodingEvaluations = 0
      const encodingSuspended = Schema.suspend(() => {
        encodingEvaluations++
        return Schema.String
      })
      const encoding = new TestSchema.Asserts(
        Schema.Union([Schema.Literal("a"), encodingSuspended])
      ).encoding()

      await encoding.succeed("a", "a")
      strictEqual(encodingEvaluations, 0)

      let oneOfEvaluations = 0
      const oneOfSuspended = Schema.suspend(() => {
        oneOfEvaluations++
        return Schema.String
      })
      const oneOf = new TestSchema.Asserts(
        Schema.Union([Schema.Literal("a"), oneOfSuspended], { mode: "oneOf" })
      ).decoding()

      await oneOf.fail("a", "Expected exactly one member to match")
      strictEqual(oneOfEvaluations, 1)
    })

    it("does not force a recursive suspended member after an earlier success", async () => {
      let evaluations = 0
      let recursive: Schema.Codec<"end">
      const suspended: Schema.Codec<"end"> = Schema.suspend(() => {
        evaluations++
        return recursive
      })
      recursive = Schema.Union([Schema.Literal("end"), suspended])

      const decoding = new TestSchema.Asserts(recursive).decoding()
      await decoding.succeed("end", "end")
      strictEqual(evaluations, 0)
    })

    it.effect("does not start later members after an asynchronous success", () =>
      Effect.gen(function*() {
        const firstStarted = yield* Deferred.make<void>()
        const firstLatch = yield* Deferred.make<void>()
        let secondCalls = 0
        const first = Schema.String.pipe(
          Schema.decode({
            decode: SchemaGetter.transformEffect(() =>
              Deferred.succeed(firstStarted, undefined).pipe(
                Effect.andThen(Deferred.await(firstLatch)),
                Effect.as("first")
              )
            ),
            encode: SchemaGetter.passthrough()
          })
        )
        const second = Schema.String.pipe(
          Schema.decode({
            decode: SchemaGetter.transform(() => {
              secondCalls++
              return "second"
            }),
            encode: SchemaGetter.passthrough()
          })
        )
        const fiber = yield* Schema.decodeUnknownEffect(Schema.Union([first, second]))("value").pipe(Effect.forkChild)

        yield* Deferred.await(firstStarted)
        yield* Effect.yieldNow
        strictEqual(secondCalls, 0)
        yield* Deferred.succeed(firstLatch, undefined)
        strictEqual(yield* Fiber.join(fiber), "first")
        strictEqual(secondCalls, 0)
      }))

    it.effect("starts the next member only after an asynchronous failure", () =>
      Effect.gen(function*() {
        const firstStarted = yield* Deferred.make<void>()
        const firstLatch = yield* Deferred.make<void>()
        let secondCalls = 0
        const first = Schema.String.pipe(
          Schema.decode({
            decode: SchemaGetter.transformEffect(() =>
              Deferred.succeed(firstStarted, undefined).pipe(
                Effect.andThen(Deferred.await(firstLatch)),
                Effect.andThen(Effect.fail(new SchemaIssue.Forbidden({ message: "first failed" })))
              )
            ),
            encode: SchemaGetter.passthrough()
          })
        )
        const second = Schema.String.pipe(
          Schema.decode({
            decode: SchemaGetter.transform(() => {
              secondCalls++
              return "second"
            }),
            encode: SchemaGetter.passthrough()
          })
        )
        const fiber = yield* Schema.decodeUnknownEffect(Schema.Union([first, second]))("value").pipe(Effect.forkChild)

        yield* Deferred.await(firstStarted)
        yield* Effect.yieldNow
        strictEqual(secondCalls, 0)
        yield* Deferred.succeed(firstLatch, undefined)
        strictEqual(yield* Fiber.join(fiber), "second")
        strictEqual(secondCalls, 1)
      }))

    it.effect(`mode: "oneOf" detects asynchronous successes in member order`, () =>
      Effect.gen(function*() {
        const firstStarted = yield* Deferred.make<void>()
        const firstLatch = yield* Deferred.make<void>()
        let secondCalls = 0
        const first = Schema.String.pipe(
          Schema.decode({
            decode: SchemaGetter.transformEffect(() =>
              Deferred.succeed(firstStarted, undefined).pipe(
                Effect.andThen(Deferred.await(firstLatch)),
                Effect.as("first")
              )
            ),
            encode: SchemaGetter.passthrough()
          })
        )
        const second = Schema.String.pipe(
          Schema.decode({
            decode: SchemaGetter.transform(() => {
              secondCalls++
              return "second"
            }),
            encode: SchemaGetter.passthrough()
          })
        )
        const fiber = yield* Schema.decodeUnknownEffect(Schema.Union([first, second], { mode: "oneOf" }))(
          "value"
        ).pipe(Effect.exit, Effect.forkChild)

        yield* Deferred.await(firstStarted)
        yield* Effect.yieldNow
        strictEqual(secondCalls, 0)
        yield* Deferred.succeed(firstLatch, undefined)
        const exit = yield* Fiber.join(fiber)
        strictEqual(secondCalls, 1)
        strictEqual(exit._tag, "Failure")
        if (exit._tag === "Failure") {
          const reason = exit.cause.reasons[0]
          strictEqual(reason._tag, "Fail")
          if (reason._tag === "Fail") {
            assertTrue(Schema.isSchemaError(reason.error))
            if (Schema.isSchemaError(reason.error)) {
              strictEqual(reason.error.issue._tag, "OneOf")
              if (reason.error.issue._tag === "OneOf") {
                deepStrictEqual(reason.error.issue.successes, [first.ast, second.ast])
              }
            }
          }
        }
      }))

    it(`mode: "oneOf" with Void`, async () => {
      const schema = Schema.Union([Schema.Void, Schema.String], { mode: "oneOf" })
      const asserts = new TestSchema.Asserts(schema)

      const decoding = asserts.decoding()
      await decoding.fail("a", "Expected exactly one member to match")
    })

    it("Struct({}) preserves its semantics in a union", async () => {
      const schema = Schema.Union([
        Schema.Struct({}),
        Schema.Null
      ])
      const asserts = new TestSchema.Asserts(schema)

      const decoding = asserts.decoding()
      const symbol = Symbol()
      const fn = () => {}
      await decoding.succeed("a")
      await decoding.succeed(1)
      await decoding.succeed(true)
      await decoding.succeed(symbol)
      await decoding.succeed(1n)
      await decoding.succeed(fn)
      await decoding.succeed({})
      await decoding.succeed([])
      await decoding.succeed(null)
      await decoding.fail(undefined, `Expected object | array | null`)
    })

    describe("should exclude members based on failed sentinels", () => {
      it("string | struct", async () => {
        const schema = Schema.Union([
          Schema.String,
          Schema.Struct({ _tag: Schema.Literal("a"), a: Schema.String })
        ])
        const asserts = new TestSchema.Asserts(schema)

        const decoding = asserts.decoding()
        await decoding.fail(
          {},
          `Expected string | { readonly "_tag": "a", ... }`
        )
      })

      it("string | tuple", async () => {
        const schema = Schema.Union([
          Schema.String,
          Schema.Tuple([Schema.Literal("a"), Schema.String])
        ])
        const asserts = new TestSchema.Asserts(schema)

        const decoding = asserts.decoding()
        await decoding.fail(
          [],
          `Expected string | readonly [ "a", ... ]`
        )
      })

      it("tagged struct union", async () => {
        const schema = Schema.Union([
          Schema.Struct({ _tag: Schema.Literal("a"), a: Schema.String }),
          Schema.Struct({ _tag: Schema.Literal("b"), b: Schema.Number })
        ])
        const asserts = new TestSchema.Asserts(schema)

        const decoding = asserts.decoding()
        await decoding.fail(
          { _tag: "a" },
          `Missing key
  at ["a"]`
        )
        await decoding.fail(
          { _tag: "b" },
          `Missing key
  at ["b"]`
        )
        await decoding.fail(
          { _tag: "c" },
          `Expected { readonly "_tag": "a", ... } | { readonly "_tag": "b", ... }`
        )
      })

      it("tagged tuple union", async () => {
        const schema = Schema.Union([
          Schema.Tuple([Schema.Literal("a"), Schema.String]),
          Schema.Tuple([Schema.Literal("b"), Schema.Number])
        ])
        const asserts = new TestSchema.Asserts(schema)

        const decoding = asserts.decoding()
        await decoding.fail(
          ["a"],
          `Missing key
  at [1]`
        )
        await decoding.fail(
          ["b"],
          `Missing key
  at [1]`
        )
        await decoding.fail(
          ["c"],
          `Expected readonly [ "a", ... ] | readonly [ "b", ... ]`
        )
      })
    })
  })

  describe("TupleWithRest", () => {
    it("A required element cannot follow an optional element", () => {
      throws(
        () =>
          Schema.TupleWithRest(
            Schema.Tuple([Schema.optionalKey(Schema.String)]),
            [Schema.Boolean, Schema.String]
          ),
        new Error("A required element cannot follow an optional element. ts(1257)")
      )
      throws(
        () =>
          Schema.TupleWithRest(
            Schema.Tuple([Schema.optional(Schema.String)]),
            [Schema.Boolean, Schema.String]
          ),
        new Error("A required element cannot follow an optional element. ts(1257)")
      )
    })

    it("An optional element cannot follow a rest element", () => {
      throws(
        () =>
          Schema.TupleWithRest(
            Schema.Tuple([]),
            [Schema.Boolean, Schema.optionalKey(Schema.String)]
          ),
        new Error("An optional element cannot follow a rest element. ts(1266)")
      )
      throws(
        () =>
          Schema.TupleWithRest(
            Schema.Tuple([]),
            [Schema.Boolean, Schema.optional(Schema.String)]
          ),
        new Error("An optional element cannot follow a rest element. ts(1266)")
      )
    })

    it("[FiniteFromString, String] + [Boolean, String]", async () => {
      const schema = Schema.TupleWithRest(
        Schema.Tuple([Schema.FiniteFromString, Schema.String]),
        [Schema.Boolean, Schema.String]
      )
      const asserts = new TestSchema.Asserts(schema)

      const decoding = asserts.decoding()
      await decoding.succeed(["1", "a", "b"], [1, "a", "b"])
      await decoding.succeed(["1", "a", true, "b"], [1, "a", true, "b"])
      await decoding.succeed(["1", "a", true, true, "b"], [1, "a", true, true, "b"])
      await decoding.fail(
        ["1", "a"],
        `Missing key
  at [2]`
      )
      await decoding.fail(
        ["1", "a", true],
        `Expected string
  at [2]`
      )
      await decoding.fail(
        ["1", "a", "b", "c"],
        `Expected boolean
  at [2]`
      )
      await decoding.fail(
        ["1", "a", true, "b", "c"],
        `Expected boolean
  at [3]`
      )

      const encoding = asserts.encoding()
      await encoding.succeed([1, "a", "b"], ["1", "a", "b"])
      await encoding.succeed([1, "a", true, "b"], ["1", "a", true, "b"])
    })

    it("[FiniteFromString, String] + [Boolean, String, Number]", async () => {
      const schema = Schema.TupleWithRest(
        Schema.Tuple([Schema.FiniteFromString, Schema.String]),
        [Schema.Boolean, Schema.String, Schema.FiniteFromString]
      )
      const asserts = new TestSchema.Asserts(schema)

      const decoding = asserts.decoding()
      await decoding.succeed(["1", "a", "b", "2"], [1, "a", "b", 2])
      await decoding.succeed(["1", "a", true, "b", "2"], [1, "a", true, "b", 2])
      await decoding.succeed(["1", "a", true, true, "b", "2"], [1, "a", true, true, "b", 2])
      await decoding.fail(
        ["1", "a"],
        `Missing key
  at [2]`
      )
      await decoding.fail(
        ["1", "a", "b"],
        `Missing key
  at [3]`
      )
      await decoding.fail(
        ["1", "a", "b", "c"],
        `Expected a finite number
  at [3]`
      )

      const encoding = asserts.encoding()
      await encoding.succeed([1, "a", "b", 2], ["1", "a", "b", "2"])
      await encoding.succeed([1, "a", true, "b", 2], ["1", "a", true, "b", "2"])
    })

    it("[String] + [Boolean, String, Number, Number] validates every post-rest index", async () => {
      const schema = Schema.TupleWithRest(
        Schema.Tuple([Schema.String]),
        [Schema.Boolean, Schema.String, Schema.FiniteFromString, Schema.FiniteFromString]
      )
      const asserts = new TestSchema.Asserts(schema)

      const decoding = asserts.decoding()
      await decoding.fail(
        ["a", true, "b", "1", "x"],
        `Expected a finite number
  at [4]`
      )
      await decoding.succeed(["a", true, "b", "1", "2"], ["a", true, "b", 1, 2])
    })
  })

  describe("StructWithRest", () => {
    it("should throw an error if there are duplicate property signatures", () => {
      throws(
        () =>
          Schema.StructWithRest(
            Schema.Struct({ a: Schema.String }),
            [Schema.Record(Schema.Literals(["a", "b"]), Schema.Number)]
          ),
        new Error(`Duplicate identifier: "a". ts(2300)`)
      )
    })

    it("should throw an error if there are encodings", () => {
      throws(
        () =>
          Schema.StructWithRest(
            Schema.Struct({}).pipe(Schema.encodeTo(Schema.Struct({}))),
            [Schema.Record(Schema.String, Schema.Number)]
          ),
        new Error(`StructWithRest does not support encodings`)
      )
    })

    it("Record(String, Number)", async () => {
      const schema = Schema.StructWithRest(
        Schema.Struct({ a: Schema.Number }),
        [Schema.Record(Schema.String, Schema.Number)]
      )
      const asserts = new TestSchema.Asserts(schema)

      const decoding = asserts.decoding()
      await decoding.succeed({ a: 1 })
      await decoding.succeed({ a: 1, b: 2 })
      await decoding.fail(
        { a: 1, b: "" },
        `Expected number
  at ["b"]`
      )
    })

    it("Record(Symbol, Number)", async () => {
      const schema = Schema.StructWithRest(
        Schema.Struct({ a: Schema.Number }),
        [Schema.Record(Schema.Symbol, Schema.Number)]
      )
      const asserts = new TestSchema.Asserts(schema)

      const decoding = asserts.decoding()
      await decoding.succeed({ a: 1 })
      await decoding.succeed({ a: 1, [Symbol.for("b")]: 2 })
      await decoding.fail(
        { a: 1, [Symbol.for("b")]: "c" },
        `Expected number
  at [Symbol(b)]`
      )
    })

    it("Record(`a${string}`, Number)", async () => {
      const schema = Schema.StructWithRest(
        Schema.Struct({ a: Schema.Number }),
        [Schema.Record(Schema.TemplateLiteral(["a", Schema.String]), Schema.Finite)]
      )
      const asserts = new TestSchema.Asserts(schema)

      const decoding = asserts.decoding()
      await decoding.succeed({ a: 1 })
      await decoding.succeed({ a: 1, "ab": 2 })
      await decoding.fail(
        { a: NaN, "ab": 2 },
        `Expected a finite number
  at ["a"]`
      )
      await decoding.fail(
        { a: 1, "ab": "c" },
        `Expected number
  at ["ab"]`
      )
    })

    it("applies excess-property options after fixed and index signatures", () => {
      const schema = Schema.StructWithRest(
        Schema.Struct({ fixed: Schema.Number }),
        [Schema.Record(Schema.String.check(Schema.isPattern(/^a/)), Schema.Number)]
      )
      const input = { fixed: 0, a: 1, b: 2 }
      const expected = { fixed: 0, a: 1 }

      deepStrictEqual(Schema.decodeUnknownSync(schema)(input, { onExcessProperty: "ignore" }), expected)
      deepStrictEqual(Schema.encodeUnknownSync(schema)(input, { onExcessProperty: "ignore" }), expected)
      throws(
        () => Schema.decodeUnknownSync(schema)(input, { onExcessProperty: "error" }),
        `Expected no excess property\n  at ["b"]`
      )
      throws(
        () => Schema.encodeUnknownSync(schema)(input, { onExcessProperty: "error" }),
        `Expected no excess property\n  at ["b"]`
      )
    })

    it("should preserve both checks", async () => {
      const schema = Schema.StructWithRest(
        Schema.Struct({ a: Schema.Number }).check(
          Schema.makeFilter((s) => s.a > 0, { expected: "agt(0)" })
        ),
        [
          Schema.Record(Schema.String, Schema.Number).check(
            Schema.makeFilter((s) => s.b === undefined || s.b > 1, { expected: "bgt(1)" })
          )
        ]
      )
      const asserts = new TestSchema.Asserts(schema)

      const decoding = asserts.decoding()
      await decoding.succeed({ a: 1 })
      await decoding.succeed({ a: 1, b: 2 })
      await decoding.fail(
        { a: 0 },
        `Expected agt(0)`
      )
      await decoding.fail(
        { a: 1, b: 1 },
        `Expected bgt(1)`
      )
    })

    it("index signatures should not re-parse fixed properties", async () => {
      const Trimmed = Schema.String.pipe(Schema.decodeTo(Schema.String, SchemaTransformation.trim()))
      const schema = Schema.StructWithRest(
        Schema.Struct({ a: Trimmed }),
        [Schema.Record(Schema.String, Schema.String)]
      )
      const asserts = new TestSchema.Asserts(schema)

      const decoding = asserts.decoding()
      await decoding.succeed({ a: "  x  ", b: "y" }, { a: "x", b: "y" })

      const encoding = asserts.encoding()
      await encoding.succeed({ a: "x", b: "y" })
    })

    it("index signatures should not overwrite fixed properties after key decoding", async () => {
      const UppercaseKey = Schema.String.pipe(Schema.decodeTo(Schema.String, SchemaTransformation.toUpperCase()))
      const schema = Schema.StructWithRest(
        Schema.Struct({ A: Schema.String }),
        [Schema.Record(UppercaseKey, Schema.String)]
      )
      const asserts = new TestSchema.Asserts(schema)

      const decoding = asserts.decoding()
      await decoding.succeed({ A: "fixed", a: "rest" }, { A: "fixed" })
    })
  })

  describe("NullOr", () => {
    it("NullOr(String)", async () => {
      const schema = Schema.NullOr(Schema.NonEmptyString)
      const asserts = new TestSchema.Asserts(schema)

      const decoding = asserts.decoding()
      await decoding.succeed("a")
      await decoding.succeed(null)
      await decoding.fail(undefined, `Expected string | null`)
      await decoding.fail(
        "",
        `Expected a value with a length of at least 1`
      )
    })
  })

  describe("UndefinedOr", () => {
    it("UndefinedOr(String)", async () => {
      const schema = Schema.UndefinedOr(Schema.NonEmptyString)
      const asserts = new TestSchema.Asserts(schema)

      const decoding = asserts.decoding()
      await decoding.succeed("a")
      await decoding.succeed(undefined)
      await decoding.fail(null, `Expected string | undefined`)
      await decoding.fail(
        "",
        `Expected a value with a length of at least 1`
      )
    })
  })

  describe("NullishOr", () => {
    it("NullishOr(String)", async () => {
      const schema = Schema.NullishOr(Schema.NonEmptyString)
      const asserts = new TestSchema.Asserts(schema)

      const decoding = asserts.decoding()
      await decoding.succeed("a")
      await decoding.succeed(null)
      await decoding.succeed(undefined)
      await decoding.fail(
        "",
        `Expected a value with a length of at least 1`
      )
    })
  })

  it("PropertyKey", async () => {
    const schema = Schema.PropertyKey
    const asserts = new TestSchema.Asserts(schema)
    if (verifyGeneration) {
      asserts.arbitrary().verifyGeneration()
    }
  })

  it("BooleanFromBit", async () => {
    const schema = Schema.BooleanFromBit
    const asserts = new TestSchema.Asserts(schema)
    if (verifyGeneration) {
      asserts.arbitrary().verifyGeneration()
    }
  })

  it("Uint8Array", async () => {
    const schema = Schema.Uint8Array
    const asserts = new TestSchema.Asserts(schema)
    if (verifyGeneration) {
      asserts.arbitrary().verifyGeneration()
    }
  })

  it("Uint8ArrayFromBase64", async () => {
    const schema = Schema.Uint8ArrayFromBase64
    const asserts = new TestSchema.Asserts(schema)
    const encoder = new TextEncoder()

    if (verifyGeneration) {
      asserts.arbitrary().verifyGeneration()
    }

    const decoding = asserts.decoding()
    await decoding.succeed("Zm9vYmFy", encoder.encode("foobar"))
    await decoding.fail("Zm9vY", "Expected a valid Base64 string")
    await decoding.fail("Zm9vYmF-", "Expected a valid Base64 string")
    await decoding.fail("=Zm9vYmF", "Expected a valid Base64 string")

    const encoding = asserts.encoding()
    await encoding.succeed(encoder.encode("foobar"), "Zm9vYmFy")
  })

  it("StringFromBase64", async () => {
    const schema = Schema.StringFromBase64
    const asserts = new TestSchema.Asserts(schema)

    const decoding = asserts.decoding()
    await decoding.succeed("Zm9vYmFy", "foobar")
    await decoding.fail("Zm9vY", "Expected a valid Base64 string")
    await decoding.fail("Zm9vYmF-", "Expected a valid Base64 string")
    await decoding.fail("=Zm9vYmF", "Expected a valid Base64 string")

    const encoding = asserts.encoding()
    await encoding.succeed("foobar", "Zm9vYmFy")
  })

  it("StringFromBase64Url", async () => {
    const schema = Schema.StringFromBase64Url
    const asserts = new TestSchema.Asserts(schema)

    const decoding = asserts.decoding()
    await decoding.succeed("Zm9vYmFy", "foobar")
    await decoding.fail("Zm9vY", "Expected a valid Base64Url string")
    await decoding.succeed("Pj8-ZD_Dnw", ">?>d?\u00DF")
    await decoding.fail("Pj8/ZD+Dnw", "Expected a valid Base64Url string")

    const encoding = asserts.encoding()
    await encoding.succeed("foobar", "Zm9vYmFy")
    await encoding.succeed(">?>d?\u00DF", "Pj8-ZD_Dnw")
  })

  it("StringFromHex", async () => {
    const schema = Schema.StringFromHex
    const asserts = new TestSchema.Asserts(schema)

    const decoding = asserts.decoding()
    await decoding.succeed("67", "g")
    await decoding.fail("0", "Expected a valid hexadecimal string")
    await decoding.fail("zd4aa", "Expected a valid hexadecimal string")
    await decoding.fail("0\x01", "Expected a valid hexadecimal string")

    const encoding = asserts.encoding()
    await encoding.succeed("g", "67")
  })

  it("StringFromUriComponent", async () => {
    const schema = Schema.StringFromUriComponent
    const asserts = new TestSchema.Asserts(schema)

    const decoding = asserts.decoding()
    await decoding.succeed("%7B%22a%22%3A1%7D", "{\"a\":1}")
    await decoding.succeed("%D1%88%D0%B5%D0%BB%D0%BB%D1%8B", "шеллы")
    await decoding.succeed("hello%20world", "hello world")
    await decoding.succeed("hello", "hello")
    await decoding.fail("%ZZ", "Expected a valid URI component")

    const encoding = asserts.encoding()
    await encoding.succeed("{\"a\":1}", "%7B%22a%22%3A1%7D")
    await encoding.succeed("hello world", "hello%20world")
  })

  it("Uint8ArrayFromBase64Url", async () => {
    const schema = Schema.Uint8ArrayFromBase64Url
    const asserts = new TestSchema.Asserts(schema)
    const encoder = new TextEncoder()

    if (verifyGeneration) {
      asserts.arbitrary().verifyGeneration()
    }

    const decoding = asserts.decoding()
    await decoding.succeed("Zm9vYmFy", encoder.encode("foobar"))
    await decoding.fail("Zm9vY", "Expected a valid Base64Url string")
    await decoding.succeed("Pj8-ZD_Dnw", encoder.encode(">?>d?ß"))
    await decoding.fail("Pj8/ZD+Dnw", "Expected a valid Base64Url string")

    const encoding = asserts.encoding()
    await encoding.succeed(encoder.encode("foobar"), "Zm9vYmFy")
    await encoding.succeed(encoder.encode(">?>d?ß"), "Pj8-ZD_Dnw")
  })

  it("Uint8ArrayFromHex", async () => {
    const schema = Schema.Uint8ArrayFromHex
    const asserts = new TestSchema.Asserts(schema)
    const encoder = new TextEncoder()

    if (verifyGeneration) {
      asserts.arbitrary().verifyGeneration()
    }

    const decoding = asserts.decoding()
    await decoding.succeed(
      "0001020304050607",
      Uint8Array.from([0, 1, 2, 3, 4, 5, 6, 7])
    )
    await decoding.succeed(
      "f0f1f2f3f4f5f6f7",
      Uint8Array.from([0xf0, 0xf1, 0xf2, 0xf3, 0xf4, 0xf5, 0xf6, 0xf7])
    )
    await decoding.succeed("67", encoder.encode("g"))
    await decoding.fail("0", "Expected a valid hexadecimal string")
    await decoding.fail("2d4aa", "Expected a valid hexadecimal string")
    await decoding.fail("0\x01", "Expected a valid hexadecimal string")

    const encoding = asserts.encoding()
    await encoding.succeed(Uint8Array.from([0, 1, 2, 3, 4, 5, 6, 7]), "0001020304050607")
  })

  it("Date", async () => {
    const schema = Schema.Date
    const asserts = new TestSchema.Asserts(schema)

    if (verifyGeneration) {
      asserts.arbitrary().verifyGeneration()
    }

    const decoding = asserts.decoding()
    await decoding.succeed(new Date("2021-01-01"))
    await decoding.fail(new Date(NaN), `Expected a valid Date`)
    await decoding.fail(null, `Expected a valid Date`)
    await decoding.fail(0, `Expected a valid Date`)

    const encoding = asserts.encoding()
    await encoding.succeed(new Date("2021-01-01"))
    await encoding.fail(new Date(NaN), `Expected a valid Date`)
  })

  it("DateTimeUtc", async () => {
    const schema = Schema.DateTimeUtc
    const asserts = new TestSchema.Asserts(schema)

    if (verifyGeneration) {
      asserts.arbitrary().verifyGeneration()
    }

    const decoding = asserts.decoding()
    await decoding.succeed(DateTime.makeUnsafe("2021-01-01T00:00:00.000Z"))

    const encoding = asserts.encoding()
    await encoding.succeed(DateTime.makeUnsafe("2021-01-01T00:00:00.000Z"))
  })

  it("DateTimeUtcFromValidDate", async () => {
    const schema = Schema.DateTimeUtcFromDate
    const asserts = new TestSchema.Asserts(schema)

    if (verifyGeneration) {
      asserts.arbitrary().verifyGeneration()
    }

    const decoding = asserts.decoding()
    await decoding.succeed(new Date("2021-01-01T00:00:00.000Z"), DateTime.makeUnsafe("2021-01-01T00:00:00.000Z"))
    await decoding.fail(new Date("invalid date"), `Expected a valid Date`)

    const encoding = asserts.encoding()
    await encoding.succeed(DateTime.makeUnsafe("2021-01-01T00:00:00.000Z"), new Date("2021-01-01T00:00:00.000Z"))
  })

  it("DateTimeUtcFromString", async () => {
    const schema = Schema.DateTimeUtcFromString
    const asserts = new TestSchema.Asserts(schema)

    if (verifyGeneration) {
      asserts.arbitrary().verifyGeneration()
    }

    const decoding = asserts.decoding()
    await decoding.succeed("2021-01-01T00:00:00.000Z", DateTime.makeUnsafe("2021-01-01T00:00:00.000Z"))
    await decoding.fail("invalid", "Expected a valid UTC DateTime string")
    await decoding.fail(null, `Expected string`)

    const encoding = asserts.encoding()
    await encoding.succeed(DateTime.makeUnsafe("2021-01-01T00:00:00.000Z"), "2021-01-01T00:00:00.000Z")
  })

  it("DateTimeUtcFromMillis", async () => {
    const schema = Schema.DateTimeUtcFromMillis
    const asserts = new TestSchema.Asserts(schema)

    if (verifyGeneration) {
      asserts.arbitrary().verifyGeneration()
    }

    const decoding = asserts.decoding()
    await decoding.succeed(1609459200000, DateTime.makeUnsafe("2021-01-01T00:00:00.000Z"))
    await decoding.fail(null, `Expected number`)

    const encoding = asserts.encoding()
    await encoding.succeed(DateTime.makeUnsafe("2021-01-01T00:00:00.000Z"), 1609459200000)
  })

  it("TimeZoneOffset", async () => {
    const schema = Schema.TimeZoneOffset
    const asserts = new TestSchema.Asserts(schema)

    if (verifyGeneration) {
      asserts.arbitrary().verifyGeneration()
    }

    const decoding = asserts.decoding()
    await decoding.succeed(DateTime.zoneMakeOffset(3 * 60 * 60 * 1000))

    const encoding = asserts.encoding()
    await encoding.succeed(DateTime.zoneMakeOffset(3 * 60 * 60 * 1000))
  })

  it("TimeZoneNamed", async () => {
    const schema = Schema.TimeZoneNamed
    const asserts = new TestSchema.Asserts(schema)

    if (verifyGeneration) {
      asserts.arbitrary().verifyGeneration()
    }

    const decoding = asserts.decoding()
    await decoding.succeed(DateTime.zoneMakeNamedUnsafe("Europe/London"))

    const encoding = asserts.encoding()
    await encoding.succeed(DateTime.zoneMakeNamedUnsafe("Europe/London"))
  })

  it("TimeZone", async () => {
    const schema = Schema.TimeZone
    const asserts = new TestSchema.Asserts(schema)

    if (verifyGeneration) {
      asserts.arbitrary().verifyGeneration()
    }

    const decoding = asserts.decoding()
    await decoding.succeed(DateTime.zoneMakeOffset(3 * 60 * 60 * 1000))
    await decoding.succeed(DateTime.zoneMakeNamedUnsafe("Europe/London"))

    const encoding = asserts.encoding()
    await encoding.succeed(DateTime.zoneMakeOffset(3 * 60 * 60 * 1000))
    await encoding.succeed(DateTime.zoneMakeNamedUnsafe("Europe/London"))
  })

  it("DateTimeZoned", async () => {
    const schema = Schema.DateTimeZoned
    const asserts = new TestSchema.Asserts(schema)

    if (verifyGeneration) {
      asserts.arbitrary().verifyGeneration()
    }

    const decoding = asserts.decoding()
    await decoding.succeed(DateTime.makeZonedUnsafe("2021-01-01T00:00:00.000Z", { timeZone: "Europe/London" }))

    const encoding = asserts.encoding()
    await encoding.succeed(DateTime.makeZonedUnsafe("2021-01-01T00:00:00.000Z", { timeZone: "Europe/London" }))
  })

  it("ReadonlySet", async () => {
    const schema = Schema.ReadonlySet(Schema.FiniteFromString)
    const asserts = new TestSchema.Asserts(schema)

    strictEqual(schema.value, Schema.FiniteFromString)
    strictEqual(schema.annotate({}).value, Schema.FiniteFromString)

    if (verifyGeneration) {
      asserts.arbitrary().verifyGeneration()
    }

    const decoding = asserts.decoding()
    await decoding.succeed(new Set(["1", "2", "3"]), new Set([1, 2, 3]))
    await decoding.fail(null, `Expected ReadonlySet`)
    await decoding.fail(
      new Set(["1", "2", null]),
      `Expected string
  at ["values"][2]`
    )
  })

  it("HashSet", async () => {
    const schema = Schema.HashSet(Schema.FiniteFromString)
    const asserts = new TestSchema.Asserts(schema)

    strictEqual(schema.value, Schema.FiniteFromString)
    strictEqual(schema.annotate({}).value, Schema.FiniteFromString)

    if (verifyGeneration) {
      asserts.arbitrary().verifyGeneration()
    }

    const decoding = asserts.decoding()
    await decoding.succeed(HashSet.make("1", "2", "3"), HashSet.make(1, 2, 3))
    await decoding.fail(null, `Expected HashSet`)
    await decoding.fail(
      HashSet.make(null),
      `Expected string
  at ["values"][0]`
    )

    const encoding = asserts.encoding()
    await encoding.succeed(HashSet.make(1, 2, 3), HashSet.make("1", "2", "3"))
  })

  it("Chunk", async () => {
    const schema = Schema.Chunk(Schema.FiniteFromString)
    const asserts = new TestSchema.Asserts(schema)

    strictEqual(schema.value, Schema.FiniteFromString)
    strictEqual(schema.annotate({}).value, Schema.FiniteFromString)

    if (verifyGeneration) {
      asserts.arbitrary().verifyGeneration()
    }

    const decoding = asserts.decoding()
    await decoding.succeed(Chunk.make("1", "2", "3"), Chunk.make(1, 2, 3))
    await decoding.fail(null, `Expected Chunk`)
    await decoding.fail(
      Chunk.make(null),
      `Expected string
  at ["values"][0]`
    )

    const encoding = asserts.encoding()
    await encoding.succeed(Chunk.make(1, 2, 3), Chunk.make("1", "2", "3"))
  })

  it("ReadonlyMap", async () => {
    const schema = Schema.ReadonlyMap(Schema.String, Schema.FiniteFromString)
    const asserts = new TestSchema.Asserts(schema)

    strictEqual(schema.key, Schema.String)
    strictEqual(schema.annotate({}).key, Schema.String)
    strictEqual(schema.value, Schema.FiniteFromString)
    strictEqual(schema.annotate({}).value, Schema.FiniteFromString)

    if (verifyGeneration) {
      asserts.arbitrary().verifyGeneration()
    }

    const decoding = asserts.decoding()
    await decoding.succeed(new Map([["a", "1"]]), new Map([["a", 1]]))
    await decoding.fail(null, `Expected ReadonlyMap`)
    await decoding.fail(
      new Map([["a", null]]),
      `Expected string
  at ["entries"][0][1]`
    )

    const encoding = asserts.encoding()
    await encoding.succeed(new Map([["a", 1]]), new Map([["a", "1"]]))
  })

  it("HashMap", async () => {
    const schema = Schema.HashMap(Schema.String, Schema.FiniteFromString)
    const asserts = new TestSchema.Asserts(schema)

    strictEqual(schema.key, Schema.String)
    strictEqual(schema.annotate({}).key, Schema.String)
    strictEqual(schema.value, Schema.FiniteFromString)
    strictEqual(schema.annotate({}).value, Schema.FiniteFromString)

    if (verifyGeneration) {
      asserts.arbitrary().verifyGeneration()
    }

    const decoding = asserts.decoding()
    await decoding.succeed(HashMap.make(["a", "1"]), HashMap.make(["a", 1]))
    await decoding.fail(null, `Expected HashMap`)
    await decoding.fail(
      HashMap.make(["a", null]),
      `Expected string
  at ["entries"][0][1]`
    )

    const encoding = asserts.encoding()
    await encoding.succeed(HashMap.make(["a", 1]), HashMap.make(["a", "1"]))
  })

  describe("Transformations", () => {
    it("toLowerCase", async () => {
      const schema = Schema.String.pipe(
        Schema.decodeTo(
          Schema.String,
          SchemaTransformation.toLowerCase()
        )
      )
      const asserts = new TestSchema.Asserts(schema)

      const decoding = asserts.decoding()
      await decoding.succeed("A", "a")
      await decoding.succeed("B", "b")
    })

    it("toUpperCase", async () => {
      const schema = Schema.String.pipe(
        Schema.decodeTo(Schema.String, SchemaTransformation.toUpperCase())
      )
      const asserts = new TestSchema.Asserts(schema)

      const decoding = asserts.decoding()
      await decoding.succeed("a", "A")
      await decoding.succeed("b", "B")
    })
  })

  describe("Opaque", () => {
    it("returns the original schema", () => {
      const schema = Schema.Struct({ a: Schema.String })

      strictEqual(Schema.Opaque<{ readonly a: string }>()(schema), schema)
    })

    it("Struct", () => {
      class A extends Schema.Opaque<A>()(Schema.Struct({ a: Schema.String })) {}

      const schema = A

      const instance = schema.make({ a: "a" })
      strictEqual(instance.a, "a")
      deepStrictEqual(A.fields, { a: Schema.String })
    })
  })

  describe("instanceOf", () => {
    it("arg: message: string", async () => {
      class MyError extends Error {
        constructor(message?: string) {
          super(message)
          this.name = "MyError"
          Object.setPrototypeOf(this, MyError.prototype)
        }
      }

      const schema = Schema.instanceOf(
        MyError,
        { expected: "MyError" }
      )
      const asserts = new TestSchema.Asserts(schema)

      const decoding = asserts.decoding()
      await decoding.succeed(new MyError("a"))
      await decoding.fail(null, `Expected MyError`)

      const encoding = asserts.encoding()
      await encoding.succeed(new MyError("a"))
      await encoding.fail(null, `Expected MyError`)
    })
  })

  it("Duration", async () => {
    const schema = Schema.Duration
    const asserts = new TestSchema.Asserts(schema)

    if (verifyGeneration) {
      asserts.arbitrary().verifyGeneration()
    }
  })

  it("DurationFromString", async () => {
    const schema = Schema.DurationFromString
    const asserts = new TestSchema.Asserts(schema)

    const decoding = asserts.decoding()
    await decoding.succeed("1000 millis", Duration.millis(1000))
    await decoding.succeed("1 second", Duration.seconds(1))
    await decoding.succeed("Infinity", Duration.infinity)
    await decoding.succeed("-Infinity", Duration.negativeInfinity)
    await decoding.fail("value", "Expected a valid Duration string")

    const encoding = asserts.encoding()
    await encoding.succeed(Duration.zero, "0 millis")
    await encoding.succeed(Duration.seconds(5), "5000 millis")
    await encoding.succeed(Duration.nanos(5000n), "5000 nanos")
    await encoding.succeed(Duration.infinity, "Infinity")
    await encoding.succeed(Duration.negativeInfinity, "-Infinity")
  })

  it("DurationFromNanos", async () => {
    const schema = Schema.DurationFromNanos
    const asserts = new TestSchema.Asserts(schema)

    if (verifyGeneration) {
      asserts.arbitrary().verifyGeneration()
    }

    const decoding = asserts.decoding()
    await decoding.succeed(0n, Duration.zero)
    await decoding.succeed(1000n, Duration.nanos(1000n))
    await decoding.succeed(-1000n, Duration.nanos(-1000n))

    const encoding = asserts.encoding()
    await encoding.succeed(Duration.millis(5), 5_000_000n)
    await encoding.succeed(Duration.nanos(5000n), 5000n)
    await encoding.succeed(Duration.nanos(-5000n), -5000n)
    await encoding.fail(Duration.infinity, "Expected a Duration representable as a bigint")
    await encoding.fail(Duration.negativeInfinity, "Expected a Duration representable as a bigint")
  })

  it("DurationFromMillis", async () => {
    const schema = Schema.DurationFromMillis
    const asserts = new TestSchema.Asserts(schema)

    if (verifyGeneration) {
      asserts.arbitrary().verifyGeneration()
    }

    const decoding = asserts.decoding()
    await decoding.succeed(Infinity, Duration.infinity)
    await decoding.succeed(-Infinity, Duration.negativeInfinity)
    await decoding.succeed(0, Duration.millis(0))
    await decoding.succeed(-1, Duration.millis(-1))
    await decoding.succeed(1000, Duration.seconds(1))
    await decoding.succeed(60 * 1000, Duration.minutes(1))
    await decoding.succeed(0.1, Duration.millis(0.1))
    await decoding.succeed(NaN, Duration.zero)

    const encoding = asserts.encoding()
    await encoding.succeed(Duration.infinity, Infinity)
    await encoding.succeed(Duration.negativeInfinity, -Infinity)
    await encoding.succeed(Duration.millis(NaN), 0)
    await encoding.succeed(Duration.millis(-1), -1)
    await encoding.succeed(Duration.seconds(5), 5000)
    await encoding.succeed(Duration.millis(5000), 5000)
    await encoding.succeed(Duration.millis(0.1), 0.1)
    await encoding.succeed(Duration.nanos(5000n), 0.005)
  })

  it("ByteSize", async () => {
    const asserts = new TestSchema.Asserts(Schema.ByteSize)
    if (verifyGeneration) asserts.arbitrary().verifyGeneration()

    const json = new TestSchema.Asserts(Schema.toCodecJson(Schema.ByteSize))
    await json.decoding().succeed("9007199254740993", ByteSize.bytes(9_007_199_254_740_993n))
    await json.encoding().succeed(ByteSize.bytes(9_007_199_254_740_993n), "9007199254740993")
  })

  it("ByteSizeFromString", async () => {
    const asserts = new TestSchema.Asserts(Schema.ByteSizeFromString)
    await asserts.decoding().succeed("1.5 kB", ByteSize.bytes(1500))
    await asserts.decoding().fail("1 KB", "Expected a valid ByteSize string")
    await asserts.encoding().succeed(ByteSize.bytes(1500), "1500 bytes")
  })

  it("ByteSizeFromBigInt", async () => {
    const asserts = new TestSchema.Asserts(Schema.ByteSizeFromBigInt)
    if (verifyGeneration) asserts.arbitrary().verifyGeneration()
    await asserts.decoding().succeed(9_007_199_254_740_993n, ByteSize.bytes(9_007_199_254_740_993n))
    await asserts.decoding().fail(-1n, "Expected a non-negative bigint byte count")
    await asserts.encoding().succeed(ByteSize.bytes(9_007_199_254_740_993n), 9_007_199_254_740_993n)
  })

  it("ByteSizeFromNumber", async () => {
    const asserts = new TestSchema.Asserts(Schema.ByteSizeFromNumber)
    await asserts.decoding().succeed(Number.MAX_SAFE_INTEGER, ByteSize.bytes(Number.MAX_SAFE_INTEGER))
    await asserts.decoding().fail(-1, "Expected a non-negative safe-integer byte count")
    await asserts.decoding().fail(0.5, "Expected a non-negative safe-integer byte count")
    await asserts.decoding().fail(Number.MAX_SAFE_INTEGER + 1, "Expected a non-negative safe-integer byte count")
    await asserts.encoding().succeed(ByteSize.bytes(1500), 1500)
    await asserts.encoding().fail(
      ByteSize.bytes(BigInt(Number.MAX_SAFE_INTEGER) + 1n),
      "Expected a ByteSize representable as a safe integer"
    )
  })

  it("BigDecimal", async () => {
    const schema = Schema.BigDecimal
    const asserts = new TestSchema.Asserts(schema)

    if (verifyGeneration) {
      asserts.arbitrary().verifyGeneration()
    }

    const decoding = asserts.decoding()
    await decoding.succeed(BigDecimal.fromStringUnsafe("123.45"))
    await decoding.fail(null, `Expected BigDecimal`)

    const encoding = asserts.encoding()
    await encoding.succeed(BigDecimal.fromStringUnsafe("123.45"))
  })

  describe("BigDecimal checks", () => {
    it("isGreaterThanBigDecimal", async () => {
      const schema = Schema.BigDecimal.check(Schema.isGreaterThanBigDecimal(BigDecimal.fromStringUnsafe("1")))
      const asserts = new TestSchema.Asserts(schema)

      const decoding = asserts.decoding()
      await decoding.succeed(BigDecimal.fromStringUnsafe("2"))
      await decoding.fail(
        BigDecimal.fromStringUnsafe("1"),
        `Expected a value greater than 1`
      )
    })

    it("isGreaterThanOrEqualToBigDecimal", async () => {
      const schema = Schema.BigDecimal.check(
        Schema.isGreaterThanOrEqualToBigDecimal(BigDecimal.fromStringUnsafe("1"))
      )
      const asserts = new TestSchema.Asserts(schema)

      const decoding = asserts.decoding()
      await decoding.succeed(BigDecimal.fromStringUnsafe("1"))
      await decoding.fail(
        BigDecimal.fromStringUnsafe("0"),
        `Expected a value greater than or equal to 1`
      )
    })

    it("isLessThanBigDecimal", async () => {
      const schema = Schema.BigDecimal.check(Schema.isLessThanBigDecimal(BigDecimal.fromStringUnsafe("1")))
      const asserts = new TestSchema.Asserts(schema)

      const decoding = asserts.decoding()
      await decoding.succeed(BigDecimal.fromStringUnsafe("0"))
      await decoding.fail(
        BigDecimal.fromStringUnsafe("1"),
        `Expected a value less than 1`
      )
    })

    it("isLessThanOrEqualToBigDecimal", async () => {
      const schema = Schema.BigDecimal.check(Schema.isLessThanOrEqualToBigDecimal(BigDecimal.fromStringUnsafe("1")))
      const asserts = new TestSchema.Asserts(schema)

      const decoding = asserts.decoding()
      await decoding.succeed(BigDecimal.fromStringUnsafe("1"))
      await decoding.fail(
        BigDecimal.fromStringUnsafe("2"),
        `Expected a value less than or equal to 1`
      )
    })

    it("isBetweenBigDecimal", async () => {
      const schema = Schema.BigDecimal.check(Schema.isBetweenBigDecimal({
        minimum: BigDecimal.fromStringUnsafe("1"),
        maximum: BigDecimal.fromStringUnsafe("5")
      }))
      const asserts = new TestSchema.Asserts(schema)

      const decoding = asserts.decoding()
      await decoding.succeed(BigDecimal.fromStringUnsafe("3"))
      await decoding.fail(
        BigDecimal.fromStringUnsafe("0"),
        `Expected a value between 1 and 5`
      )
    })
  })

  describe("tag", () => {
    it("decoding: required & encoding: required & constructor: required", async () => {
      const schema = Schema.Struct({
        _tag: Schema.Literal("a"),
        a: Schema.FiniteFromString
      })
      const asserts = new TestSchema.Asserts(schema)

      const make = asserts.make()
      await make.succeed({ _tag: "a", a: 1 })

      const decoding = asserts.decoding()
      await decoding.succeed({ _tag: "a", a: "1" }, { _tag: "a", a: 1 })

      const encoding = asserts.encoding()
      await encoding.succeed({ _tag: "a", a: 1 }, { _tag: "a", a: "1" })
    })

    it("decoding: required & encoding: required & constructor: optional", async () => {
      const schema = Schema.Struct({
        _tag: Schema.tag("a"),
        a: Schema.FiniteFromString
      })
      const asserts = new TestSchema.Asserts(schema)

      const make = asserts.make()
      await make.succeed({ _tag: "a", a: 1 })
      await make.succeed({ a: 1 }, { _tag: "a", a: 1 })

      const decoding = asserts.decoding()
      await decoding.succeed({ _tag: "a", a: "1" }, { _tag: "a", a: 1 })

      const encoding = asserts.encoding()
      await encoding.succeed({ _tag: "a", a: 1 }, { _tag: "a", a: "1" })
    })

    it("decoding: default & encoding: omit & constructor: optional", async () => {
      const schema = Schema.Struct({
        _tag: Schema.tag("a").pipe(
          Schema.encodeTo(
            Schema.optionalKey(Schema.Literal("a")),
            {
              decode: SchemaGetter.withDefault(Effect.succeed("a")),
              encode: SchemaGetter.omit()
            }
          )
        ),
        a: Schema.FiniteFromString
      })
      const asserts = new TestSchema.Asserts(schema)

      const make = asserts.make()
      await make.succeed({ _tag: "a", a: 1 })
      await make.succeed({ a: 1 }, { _tag: "a", a: 1 })

      const decoding = asserts.decoding()
      await decoding.succeed({ _tag: "a", a: "1" }, { _tag: "a", a: 1 })
      await decoding.succeed({ a: "1" }, { _tag: "a", a: 1 })

      const encoding = asserts.encoding()
      await encoding.succeed({ _tag: "a", a: 1 }, { a: "1" })
    })
  })

  it("tagDefaultOmit", async () => {
    const schema = Schema.Struct({
      _tag: Schema.tagDefaultOmit("a"),
      a: Schema.FiniteFromString
    })
    const asserts = new TestSchema.Asserts(schema)

    const make = asserts.make()
    await make.succeed({ _tag: "a", a: 1 })
    await make.succeed({ a: 1 }, { _tag: "a", a: 1 })
    await make.fail(
      { _tag: "c", a: 1 },
      `Expected "a"
  at ["_tag"]`
    )

    const decoding = asserts.decoding()
    await decoding.succeed({ _tag: "a", a: "1" }, { _tag: "a", a: 1 })
    await decoding.succeed({ a: "1" }, { _tag: "a", a: 1 })
    await decoding.fail(
      { _tag: "c", a: 1 },
      `Expected "a"
  at ["_tag"]`
    )

    const encoding = asserts.encoding()
    await encoding.succeed({ _tag: "a", a: 1 }, { a: "1" })
    await encoding.succeed({ a: 1 }, { a: "1" })
  })

  it("URL", async () => {
    const schema = Schema.URL
    const asserts = new TestSchema.Asserts(schema)
    if (verifyGeneration) {
      asserts.arbitrary().verifyGeneration()
    }
  })

  it("RegExp", async () => {
    const schema = Schema.RegExp
    const asserts = new TestSchema.Asserts(schema)
    if (verifyGeneration) {
      asserts.arbitrary().verifyGeneration()
    }
  })

  it("URLFromString", async () => {
    const schema = Schema.URLFromString
    const asserts = new TestSchema.Asserts(schema)

    if (verifyGeneration) {
      asserts.arbitrary().verifyGeneration()
    }

    const decoding = asserts.decoding()
    await decoding.succeed("https://effect.website", new URL("https://effect.website"))
    await decoding.fail(
      "123",
      "Expected a valid URL string"
    )

    const encoding = asserts.encoding()
    await encoding.succeed(new URL("https://effect.website"), "https://effect.website/")
  })

  describe("UnknownFromJsonString / fromJsonString", () => {
    it("use case: Unknown <-> JSON string", async () => {
      const schema = Schema.UnknownFromJsonString
      const asserts = new TestSchema.Asserts(schema)

      if (verifyGeneration) {
        asserts.arbitrary().verifyGeneration()
      }

      const decoding = asserts.decoding()
      await decoding.succeed(`{"a":1}`, { a: 1 })
      await decoding.fail(
        `{"a"`,
        "Expected a valid JSON string"
      )

      const encoding = asserts.encoding()
      await encoding.succeed({ a: 1 }, `{"a":1}`)
    })

    it("use case: create a JSON string serializer for an existing schema", async () => {
      const schema = Schema.fromJsonString(Schema.Struct({ b: Schema.Number }))
      const asserts = new TestSchema.Asserts(schema)

      if (verifyGeneration) {
        asserts.arbitrary().verifyGeneration()
      }

      const decoding = asserts.decoding()
      await decoding.succeed(`{"b":1}`, { b: 1 })
      await decoding.fail(
        `{"a":null}`,
        `Missing key
  at ["b"]`
      )
    })

    it("reviver option", async () => {
      const schema = Schema.fromJsonString(Schema.Struct({ a: Schema.Number }), {
        reviver: (key, value) => key === "a" ? Number(value) : value
      })
      const decoding = new TestSchema.Asserts(schema).decoding()

      await decoding.succeed(`{"a":"1"}`, { a: 1 })
    })

    it("replacer and space options", async () => {
      const schema = Schema.fromJsonString(Schema.Struct({ a: Schema.Number, b: Schema.Number }), {
        replacer: (key, value) => key === "b" ? undefined : value,
        space: 2
      })
      const encoding = new TestSchema.Asserts(schema).encoding()

      await encoding.succeed(
        { a: 1, b: 2 },
        `{
  "a": 1
}`
      )
    })

    it("use case: parse / stringify a nested schema", async () => {
      const schema = Schema.Struct({
        a: Schema.fromJsonString(Schema.Struct({ b: Schema.Number }))
      })
      const asserts = new TestSchema.Asserts(schema)

      if (verifyGeneration) {
        asserts.arbitrary().verifyGeneration()
      }

      const decoding = asserts.decoding()
      await decoding.succeed({ a: `{"b":2}` }, { a: { b: 2 } })
      await decoding.fail(
        { a: `{"a":null}` },
        `Missing key
  at ["a"]["b"]`
      )
    })
  })

  it("fromFormData", async () => {
    const schema = Schema.fromFormData(Schema.Struct({
      a: Schema.NonEmptyString,
      b: Schema.Struct({
        c: Schema.String,
        d: Schema.String
      }),
      e: Schema.Array(Schema.String)
    }))
    const asserts = new TestSchema.Asserts(schema)

    const formData = new FormData()
    formData.append("a", "a")
    formData.append("b[c]", "bc")
    formData.append("b[d]", "bd")
    formData.append("e[0]", "e0")
    formData.append("e[1]", "e1")

    const decoded = { a: "a", b: { c: "bc", d: "bd" }, e: ["e0", "e1"] }

    const decoding = asserts.decoding()
    await decoding.succeed(formData, decoded)

    const encoding = asserts.encoding()

    {
      const formData = new FormData()
      formData.append("a", "a")
      formData.append("b[c]", "bc")
      formData.append("b[d]", "bd")
      formData.append("e", "e0")
      formData.append("e", "e1")
      await encoding.succeed(decoded, formData)
    }

    {
      const formData = new FormData()
      formData.append("a", "")
      await decoding.fail(
        formData,
        `Expected a value with a length of at least 1
  at ["a"]`
      )
    }
  })

  it("fromURLSearchParams", async () => {
    const schema = Schema.fromURLSearchParams(Schema.Struct({
      a: Schema.NonEmptyString,
      b: Schema.Struct({
        c: Schema.String,
        d: Schema.String
      }),
      e: Schema.Array(Schema.String)
    }))
    const asserts = new TestSchema.Asserts(schema)

    const urlSearchParams = new URLSearchParams("a=a&b[c]=bc&b[d]=bd&e=e0&e=e1")

    const decoded = { a: "a", b: { c: "bc", d: "bd" }, e: ["e0", "e1"] }

    const decoding = asserts.decoding()
    await decoding.succeed(urlSearchParams, decoded)

    const encoding = asserts.encoding()

    {
      const urlSearchParams = new URLSearchParams("a=a&b[c]=bc&b[d]=bd&e=e0&e=e1")
      await encoding.succeed(decoded, urlSearchParams)
    }

    {
      const urlSearchParams = new URLSearchParams("a=")
      await decoding.fail(
        urlSearchParams,
        `Expected a value with a length of at least 1
  at ["a"]`
      )
    }
  })

  it("Trim", async () => {
    const schema = Schema.Trim
    const asserts = new TestSchema.Asserts(schema)

    if (verifyGeneration) {
      asserts.arbitrary().verifyGeneration()
    }

    const decoding = asserts.decoding()
    await decoding.succeed("a")
    await decoding.succeed("a ", "a")
    await decoding.succeed(" a", "a")
    await decoding.succeed(" a ", "a")
    await decoding.succeed("a\n", "a")

    const encoding = asserts.encoding()
    await encoding.succeed("a")
    await encoding.fail(
      "a ",
      `Expected a string with no leading or trailing whitespace`
    )
  })

  it("transformEffect", async () => {
    const schema = Schema.String.pipe(
      Schema.decodeTo(
        Schema.String,
        SchemaTransformation.transformEffect({
          decode: (s) =>
            s === "a"
              ? Effect.fail(new SchemaIssue.Forbidden({ message: `input should not be "a"` }))
              : Effect.succeed(s),
          encode: (s) =>
            s === "b"
              ? Effect.fail(new SchemaIssue.Forbidden({ message: `input should not be "b"` }))
              : Effect.succeed(s)
        })
      )
    )
    const asserts = new TestSchema.Asserts(schema)

    const decoding = asserts.decoding()
    await decoding.succeed("b")
    await decoding.fail(
      "a",
      `input should not be "a"`
    )

    const encoding = asserts.encoding()
    await encoding.succeed("a")
    await encoding.fail(
      "b",
      `input should not be "b"`
    )
  })

  describe("TemplateLiteral", () => {
    it("should expose the parts", () => {
      const parts = ["a", Schema.String] as const
      const schema = Schema.TemplateLiteral(parts)
      deepStrictEqual(schema.parts, parts)
    })

    it(`NonEmptyString + String`, async () => {
      const schema = Schema.TemplateLiteral([Schema.NonEmptyString, Schema.String])
      const asserts = new TestSchema.Asserts(schema)

      const decoding = asserts.decoding()
      await decoding.succeed("a")
    })

    it("rejects checks on Literal, TemplateLiteral, and Union parts", () => {
      const check = Schema.makeFilter(() => true)

      throws(
        () => Schema.TemplateLiteral([Schema.Literal("a").check(check)]),
        "Invalid TemplateLiteral part Literal"
      )
      throws(
        () => Schema.TemplateLiteral([Schema.TemplateLiteral(["a"]).check(check)]),
        "Invalid TemplateLiteral part TemplateLiteral"
      )
      throws(
        () => Schema.TemplateLiteral([Schema.Union([Schema.Literal("a"), Schema.Literal("b")]).check(check)]),
        "Invalid TemplateLiteral part Union"
      )
    })

    it(`"a"`, async () => {
      const schema = Schema.TemplateLiteral(["a"])
      const asserts = new TestSchema.Asserts(schema)

      const decoding = asserts.decoding()
      await decoding.succeed("a")
      await decoding.fail(null, "Expected string")
      await decoding.fail(
        "ab",
        "Expected a string matching template literal parts"
      )
      await decoding.fail(
        "",
        `Expected a string matching template literal parts`
      )
    })

    it(`"a b"`, async () => {
      const schema = Schema.TemplateLiteral(["a", " ", "b"])
      const asserts = new TestSchema.Asserts(schema)

      const decoding = asserts.decoding()
      await decoding.succeed("a b")

      await decoding.fail(
        "a  b",
        `Expected a string matching template literal parts`
      )
    })

    it(`"[" + string + "]"`, async () => {
      const schema = Schema.TemplateLiteral(["[", Schema.String, "]"])
      const asserts = new TestSchema.Asserts(schema)

      const decoding = asserts.decoding()
      await decoding.succeed("[a]")

      await decoding.fail(
        "a",
        `Expected a string matching template literal parts`
      )
    })

    it(`"a" + string`, async () => {
      const schema = Schema.TemplateLiteral(["a", Schema.String])
      const asserts = new TestSchema.Asserts(schema)

      const decoding = asserts.decoding()
      await decoding.succeed("a")
      await decoding.succeed("ab")

      await decoding.fail(
        null,
        "Expected string"
      )
      await decoding.fail(
        "",
        `Expected a string matching template literal parts`
      )
    })

    it(`"a" + number`, async () => {
      const schema = Schema.TemplateLiteral(["a", Schema.Number])
      const asserts = new TestSchema.Asserts(schema)

      const decoding = asserts.decoding()
      await decoding.succeed("a1")
      await decoding.succeed("a+1")
      await decoding.succeed("a1.2")

      await decoding.succeed("a-1.401298464324817e-45")
      await decoding.succeed("a1.401298464324817e-45")
      await decoding.succeed("a+1.401298464324817e-45")
      await decoding.succeed("a-1.401298464324817e+45")
      await decoding.succeed("a1.401298464324817e+45")
      await decoding.succeed("a+1.401298464324817e+45")

      await decoding.succeed("a-1.401298464324817E-45")
      await decoding.succeed("a1.401298464324817E-45")
      await decoding.succeed("a+1.401298464324817E-45")
      await decoding.succeed("a-1.401298464324817E+45")
      await decoding.succeed("a1.401298464324817E+45")
      await decoding.succeed("a+1.401298464324817E+45")

      await decoding.fail(
        null,
        "Expected string"
      )
      await decoding.fail(
        "",
        `Expected a string matching template literal parts`
      )
      await decoding.fail(
        "aa",
        `Expected a string matching template literal parts`
      )
    })

    it(`"a" + bigint`, async () => {
      const schema = Schema.TemplateLiteral(["a", Schema.BigInt])
      const asserts = new TestSchema.Asserts(schema)

      const decoding = asserts.decoding()
      await decoding.succeed("a0")
      await decoding.succeed("a1")
      await decoding.succeed("a-1")

      await decoding.fail(
        null,
        "Expected string"
      )
      await decoding.fail(
        "",
        `Expected a string matching template literal parts`
      )
      await decoding.fail(
        "aa",
        `Expected a string matching template literal parts`
      )
      await decoding.fail(
        "a1.2",
        `Expected a string matching template literal parts`
      )
      await decoding.fail(
        "a+1",
        `Expected a string matching template literal parts`
      )
    })

    it(`string`, async () => {
      const schema = Schema.TemplateLiteral([Schema.String])
      const asserts = new TestSchema.Asserts(schema)

      const decoding = asserts.decoding()
      await decoding.succeed("a")
      await decoding.succeed("ab")
      await decoding.succeed("")
      await decoding.succeed("\n")
      await decoding.succeed("\r")
      await decoding.succeed("\r\n")
      await decoding.succeed("\t")
    })

    it(`\\n + string`, async () => {
      const schema = Schema.TemplateLiteral(["\n", Schema.String])
      const asserts = new TestSchema.Asserts(schema)

      const decoding = asserts.decoding()
      await decoding.succeed("\n")
      await decoding.succeed("\na")
      await decoding.fail(
        "a",
        `Expected a string matching template literal parts`
      )
    })

    it(`a\\nb  + string`, async () => {
      const schema = Schema.TemplateLiteral(["a\nb ", Schema.String])
      const asserts = new TestSchema.Asserts(schema)

      const decoding = asserts.decoding()
      await decoding.succeed("a\nb ")
      await decoding.succeed("a\nb c")
    })

    it(`"a" + string + "b"`, async () => {
      const schema = Schema.TemplateLiteral(["a", Schema.String, "b"])
      const asserts = new TestSchema.Asserts(schema)

      const decoding = asserts.decoding()
      await decoding.succeed("ab")
      await decoding.succeed("acb")
      await decoding.succeed("abb")
      await decoding.fail(
        "",
        `Expected a string matching template literal parts`
      )
      await decoding.fail(
        "a",
        `Expected a string matching template literal parts`
      )
      await decoding.fail(
        "b",
        `Expected a string matching template literal parts`
      )

      const encoding = asserts.encoding()
      await encoding.succeed("acb")
    })

    it(`"a" + string + "b" + string`, async () => {
      const schema = Schema.TemplateLiteral(["a", Schema.String, "b", Schema.String])
      const asserts = new TestSchema.Asserts(schema)

      const decoding = asserts.decoding()
      await decoding.succeed("ab")
      await decoding.succeed("acb")
      await decoding.succeed("acbd")
      await decoding.fail(
        "a",
        `Expected a string matching template literal parts`
      )
      await decoding.fail(
        "b",
        `Expected a string matching template literal parts`
      )
    })

    it("https://www.typescriptlang.org/docs/handbook/2/template-literal-types.html", async () => {
      const EmailLocaleIDs = Schema.Literals(["welcome_email", "email_heading"])
      const FooterLocaleIDs = Schema.Literals(["footer_title", "footer_sendoff"])
      const schema = Schema.TemplateLiteral([Schema.Union([EmailLocaleIDs, FooterLocaleIDs]), "_id"])
      const asserts = new TestSchema.Asserts(schema)

      const decoding = asserts.decoding()
      await decoding.succeed("welcome_email_id")
      await decoding.succeed("email_heading_id")
      await decoding.succeed("footer_title_id")
      await decoding.succeed("footer_sendoff_id")

      await decoding.fail(
        "_id",
        `Expected a string matching template literal parts`
      )
    })

    it(`string + 0`, async () => {
      const schema = Schema.TemplateLiteral([Schema.String, 0])
      const asserts = new TestSchema.Asserts(schema)

      const decoding = asserts.decoding()
      await decoding.succeed("a0")
      await decoding.fail(
        "a",
        `Expected a string matching template literal parts`
      )
    })

    it(`string + 1n`, async () => {
      const schema = Schema.TemplateLiteral([Schema.String, 1n])
      const asserts = new TestSchema.Asserts(schema)

      const decoding = asserts.decoding()
      await decoding.succeed("a1")
      await decoding.fail(
        "a",
        `Expected a string matching template literal parts`
      )
    })

    it(`string + ("a" | 0)`, async () => {
      const schema = Schema.TemplateLiteral([Schema.String, Schema.Literals(["a", 0])])
      const asserts = new TestSchema.Asserts(schema)

      const decoding = asserts.decoding()
      await decoding.succeed("a0")
      await decoding.succeed("aa")
      await decoding.fail(
        "b",
        `Expected a string matching template literal parts`
      )
    })

    it(`(string | 1) + (number | true)`, async () => {
      const schema = Schema.TemplateLiteral([
        Schema.Union([Schema.String, Schema.Literal(1)]),
        Schema.Union([Schema.Number, Schema.Literal("true")])
      ])
      const asserts = new TestSchema.Asserts(schema)

      const decoding = asserts.decoding()
      await decoding.succeed("atrue")
      await decoding.succeed("-2")
      await decoding.succeed("10.1")
      await decoding.fail(
        "",
        `Expected a string matching template literal parts`
      )
    })

    it("`c${`a${string}b` | \"e\"}d`", async () => {
      const schema = Schema.TemplateLiteral(
        ["c", Schema.Union([Schema.TemplateLiteral(["a", Schema.String, "b"]), Schema.Literal("e")]), "d"]
      )
      const asserts = new TestSchema.Asserts(schema)

      const decoding = asserts.decoding()
      await decoding.succeed("ced")
      await decoding.succeed("cabd")
      await decoding.succeed("casbd")
      await decoding.succeed("ca  bd")
      await decoding.fail(
        "",
        `Expected a string matching template literal parts`
      )
    })

    it("< + h + (1|2n) + >", async () => {
      const schema = Schema.TemplateLiteral(["<", Schema.TemplateLiteral(["h", Schema.Literals([1, 2n])]), ">"])
      const asserts = new TestSchema.Asserts(schema)

      const decoding = asserts.decoding()
      await decoding.succeed("<h1>")
      await decoding.succeed("<h2>")
      await decoding.fail(
        "<h3>",
        `Expected a string matching template literal parts`
      )
    })

    it(`"a" + check`, async () => {
      const schema = Schema.TemplateLiteral(["a", Schema.NonEmptyString])
      const asserts = new TestSchema.Asserts(schema)

      const decoding = asserts.decoding()
      await decoding.succeed("ab")
      await decoding.fail(
        null,
        "Expected string"
      )
      await decoding.fail(
        "",
        `Expected a string matching template literal parts`
      )
      await decoding.fail(
        "a",
        `Expected a string matching template literal parts`
      )
    })

    it(`rejects "a" + transformation`, () => {
      throws(
        () => Schema.TemplateLiteral(["a", Schema.FiniteFromString]),
        "TemplateLiteral parts cannot have an encoding at parts[1]"
      )
    })
  })

  describe("TemplateLiteralParser", () => {
    it("should expose the parts", () => {
      const parts = ["a", Schema.String] as const
      const schema = Schema.TemplateLiteralParser(parts)
      deepStrictEqual(schema.parts, parts)
    })

    it("preserves greedy segmentation at repeated literal anchors", async () => {
      const schema = Schema.TemplateLiteralParser([Schema.String, ":", Schema.String])
      const decoding = new TestSchema.Asserts(schema).decoding()

      await decoding.succeed("a:b:c", ["a:b", ":", "c"])
    })

    it("backtracks from an invalid literal anchor", async () => {
      const schema = Schema.TemplateLiteralParser([Schema.String, ":", Schema.NonEmptyString, "x"])
      const decoding = new TestSchema.Asserts(schema).decoding()

      await decoding.succeed("a:b:x", ["a", ":", "b:", "x"])
    })

    it("backtracks across an empty literal anchor", async () => {
      const schema = Schema.TemplateLiteralParser([Schema.String, "", Schema.NonEmptyString])
      const decoding = new TestSchema.Asserts(schema).decoding()

      await decoding.succeed("a", ["", "", "a"])
    })

    it(`NonEmptyString + String`, async () => {
      const schema = Schema.TemplateLiteralParser([Schema.NonEmptyString, Schema.String])
      const asserts = new TestSchema.Asserts(schema)

      const decoding = asserts.decoding()
      await decoding.succeed("a", ["a", ""])
    })

    it(`"a"`, async () => {
      const schema = Schema.TemplateLiteralParser(["a"])
      const asserts = new TestSchema.Asserts(schema)

      const decoding = asserts.decoding()
      await decoding.succeed("a", ["a"])
      await decoding.fail(
        "ab",
        `Expected a string matching template literal parts`
      )
      await decoding.fail(
        "",
        `Expected a string matching template literal parts`
      )
      await decoding.fail(
        null,
        "Expected string"
      )
    })

    it(`"a b"`, async () => {
      const schema = Schema.TemplateLiteralParser(["a", " ", "b"])
      const asserts = new TestSchema.Asserts(schema)

      const decoding = asserts.decoding()
      await decoding.succeed("a b", ["a", " ", "b"])

      await decoding.fail(
        "a  b",
        `Expected a string matching template literal parts`
      )
    })

    it(`Int + "a"`, async () => {
      const schema = Schema.TemplateLiteralParser([Schema.Int, "a"])
      const asserts = new TestSchema.Asserts(schema)

      const decoding = asserts.decoding()
      await decoding.succeed("1a", [1, "a"])
      await decoding.fail(
        "1.1a",
        `Expected a string matching template literal parts`
      )

      const encoding = asserts.encoding()
      await encoding.succeed([1, "a"], "1a")
      await encoding.fail(
        [1.1, "a"],
        `Expected an integer
  at [0]`
      )
    })

    it(`Int + String`, async () => {
      const schema = Schema.TemplateLiteralParser([Schema.Number.check(Schema.isInt()), Schema.String])
      const asserts = new TestSchema.Asserts(schema)

      const decoding = asserts.decoding()
      await decoding.succeed("1.2", [1, ".2"])
    })

    it(`NumberFromString + "a" + NonEmptyString`, async () => {
      const schema = Schema.TemplateLiteralParser([Schema.FiniteFromString, "a", Schema.NonEmptyString])
      const asserts = new TestSchema.Asserts(schema)

      const decoding = asserts.decoding()
      await decoding.succeed("100ab", [100, "a", "b"])
      await decoding.succeed("100ab23a", [100, "a", "b23a"])
      await decoding.fail(
        "-ab",
        `Expected a finite number
  at [0]`
      )

      const encoding = asserts.encoding()
      await encoding.succeed([100, "a", "b"], "100ab")
      await encoding.fail(
        [100, "a", ""],
        `Expected a value with a length of at least 1
  at [2]`
      )
    })

    it(`"h" + (1 | 2 | 3)`, async () => {
      const schema = Schema.TemplateLiteralParser(["h", Schema.Literals([1, 2, 3])])
      const asserts = new TestSchema.Asserts(schema)

      const decoding = asserts.decoding()
      await decoding.succeed("h1", ["h", 1])
    })

    it(`"c" + (\`a\${string}b\`|"e") + "d"`, async () => {
      const schema = Schema.TemplateLiteralParser([
        "c",
        Schema.Union([Schema.TemplateLiteralParser(["a", Schema.NonEmptyString, "b"]), Schema.Literal("e")]),
        "d"
      ])
      const asserts = new TestSchema.Asserts(schema)

      const decoding = asserts.decoding()
      await decoding.succeed("ca bd", ["c", ["a", " ", "b"], "d"])
      await decoding.succeed("ced", ["c", "e", "d"])
      await decoding.fail(
        "cabd",
        `Expected a string matching template literal parts`
      )
      await decoding.fail(
        "ed",
        `Expected a string matching template literal parts`
      )
    })

    it(`"c" + (\`a\${number}b\`|"e") + "d"`, async () => {
      const schema = Schema.TemplateLiteralParser([
        "c",
        Schema.Union([
          Schema.TemplateLiteralParser(["a", Schema.Finite.check(Schema.isInt()), "b"]),
          Schema.Literal("e")
        ]),
        "d"
      ])
      const asserts = new TestSchema.Asserts(schema)

      const decoding = asserts.decoding()
      await decoding.succeed("ced", ["c", "e", "d"])
      await decoding.succeed("ca1bd", ["c", ["a", 1, "b"], "d"])
      await decoding.fail(
        "ca1.1bd",
        `Expected a string matching template literal parts`
      )
      await decoding.fail(
        "ca-bd",
        `Expected a string matching template literal parts`
      )
    })

    it(`readonly ["<", \`h\${1 | 2}\`, ">"]`, async () => {
      const schema = Schema.TemplateLiteralParser(["<", Schema.TemplateLiteral(["h", Schema.Literals([1, 2])]), ">"])
      const asserts = new TestSchema.Asserts(schema)

      const decoding = asserts.decoding()
      await decoding.succeed("<h1>", ["<", "h1", ">"])
      await decoding.succeed("<h2>", ["<", "h2", ">"])
      await decoding.fail(
        "<h3>",
        `Expected a string matching template literal parts`
      )
    })

    it(`readonly ["<", readonly ["h", 1 | 2], ">"]`, async () => {
      const schema = Schema.TemplateLiteralParser([
        "<",
        Schema.TemplateLiteralParser(["h", Schema.Literals([1, 2])]),
        ">"
      ])
      const asserts = new TestSchema.Asserts(schema)

      const decoding = asserts.decoding()
      await decoding.succeed("<h1>", ["<", ["h", 1], ">"])
      await decoding.succeed("<h2>", ["<", ["h", 2], ">"])
      await decoding.fail(
        "<h3>",
        `Expected a string matching template literal parts`
      )
    })
  })

  describe("Class", () => {
    it.effect("make preserves existing instances like the other constructor adapters", () =>
      Effect.gen(function*() {
        let constructions = 0
        class A extends Schema.Class<A>("A")({ a: Schema.String }) {
          readonly construction = ++constructions
        }
        const instance = new A({ a: "a" })

        assert.strictEqual(A.make(instance), instance)
        assert.strictEqual(SchemaParser.make(A)(instance), instance)
        assert.strictEqual(Option.getOrThrow(A.makeOption(instance)), instance)
        assert.strictEqual(yield* A.makeEffect(instance), instance)
        assert.strictEqual(constructions, 1)

        assert.notStrictEqual(new A(instance), instance)
        assert.strictEqual(constructions, 2)
      }))

    it("make applies defaults, source checks, and the constructor once", () => {
      let defaults = 0
      let checks = 0
      let constructions = 0
      const struct = Schema.Struct({
        a: Schema.String.pipe(Schema.withConstructorDefault(Effect.sync(() => {
          defaults++
          return "default"
        })))
      }).check(Schema.makeFilter(() => {
        checks++
        return true
      }))
      class A extends Schema.Class<A>("A")(struct) {
        readonly construction = ++constructions
      }

      const instance = A.make({})

      assert.instanceOf(instance, A)
      assert.strictEqual(instance.a, "default")
      assert.strictEqual(defaults, 1)
      assert.strictEqual(checks, 1)
      assert.strictEqual(constructions, 1)
    })

    it("make with void input", () => {
      class A extends Schema.Class<A>("A")({}) {}
      deepStrictEqual(A.make(), new A())
      deepStrictEqual(A.makeOption(), Option.some(new A()))
      deepStrictEqual(Effect.runSync(A.makeEffect()), new A())
    })

    it("decoding validates the class struct once", () => {
      let checks = 0
      const schema = Schema.Struct({
        a: Schema.String
      }).check(Schema.makeFilter(() => {
        checks++
        return true
      }))
      class A extends Schema.Class<A>("A")(schema) {}

      const instance = Schema.decodeUnknownSync(A)({ a: "a" })

      assertTrue(instance instanceof A)
      strictEqual(checks, 1)
    })

    it("make validates an existing nested Class once", () => {
      let checks = 0
      class A extends Schema.Class<A>("A")({ a: Schema.String }) {}
      const schema = Schema.Struct({
        a: A.check(Schema.makeFilter(() => {
          checks++
          return true
        }))
      })
      const instance = A.make({ a: "a" })

      strictEqual(schema.make({ a: instance }).a, instance)
      strictEqual(checks, 1)
    })

    it("make validates a nested Class source and output once", () => {
      let sourceChecks = 0
      let classChecks = 0
      class A extends Schema.Class<A>("A")(
        Schema.Struct({ a: Schema.String }).check(Schema.makeFilter(() => {
          sourceChecks++
          return true
        }))
      ) {}
      const schema = Schema.Struct({
        a: A.check(Schema.makeFilter(() => {
          classChecks++
          return true
        }))
      })

      assertTrue(schema.make({ a: { a: "a" } }).a instanceof A)
      strictEqual(sourceChecks, 1)
      strictEqual(classChecks, 1)
    })

    it("make allows an optional nested Class to be omitted", () => {
      class A extends Schema.Class<A>("A")({ a: Schema.String }) {}
      const schema = Schema.Struct({ a: Schema.optionalKey(A) })

      deepStrictEqual(schema.make({}), {})
    })

    it("make applies constructor defaults only at a field occurrence", () => {
      let defaults = 0
      const defaulted = Schema.String.pipe(
        Schema.withConstructorDefault(Effect.sync(() => {
          defaults++
          return "default"
        }))
      )
      const field = Schema.Struct({ value: defaulted })
      const unionMember = Schema.Struct({ value: Schema.Union([defaulted, Schema.Number]) })

      deepStrictEqual(defaulted.makeOption(undefined as any), Option.none())
      strictEqual(defaults, 0)
      deepStrictEqual(field.make({}), { value: "default" })
      strictEqual(defaults, 1)
      deepStrictEqual(unionMember.makeOption({} as any), Option.none())
      deepStrictEqual(unionMember.makeOption({ value: undefined } as any), Option.none())
      strictEqual(defaults, 1)
    })

    it("suspend before initialization", async () => {
      const schema = Schema.suspend(() => string)
      class A extends Schema.Class<A>("A")(Schema.Struct({ a: schema })) {}
      const string = Schema.String

      const asserts = new TestSchema.Asserts(A)
      const make = asserts.make()
      await make.succeed(new A({ a: "a" }))
      await make.succeed({ a: "a" }, new A({ a: "a" }))

      const decoding = asserts.decoding()
      await decoding.succeed(new A({ a: "a" }))
    })

    it("should memoize the ast", () => {
      class A extends Schema.Class<A>("A")({
        a: Schema.String
      }) {}
      assertTrue(A.ast === A.ast)
    })

    it("should set the identifier annotation", () => {
      class A extends Schema.Class<A>("A")({
        a: Schema.String
      }) {}
      strictEqual(A.ast.annotations?.identifier, "A")
    })

    describe("should be compatible with `immer`", () => {
      it("`[immerable]`", () => {
        class A extends Schema.Class<A>("A")({
          a: Schema.Struct({ b: Schema.FiniteFromString }).pipe(Schema.optional),
          c: Schema.FiniteFromString
        }) {}

        const a = new A({ a: { b: 1 }, c: 2 })

        const modified = produce(a, (draft) => {
          if (draft.a) {
            draft.a.b = 2
          }
        })

        assertTrue(modified instanceof A)
        strictEqual(modified.a?.b, 2)
        strictEqual(modified.c, 2)
        strictEqual(a.a?.b, 1)
      })

      it("Equality", () => {
        class A extends Schema.Class<A>("A")({
          a: Schema.String
        }) {}

        const a = new A({ a: "a" })
        const a1 = produce(a, (draft) => {
          draft.a = "a1"
        })
        const a2 = produce(a, (draft) => {
          draft.a = "a1"
        })
        assertTrue(Equal.equals(a1, new A({ a: "a1" })))
        assertTrue(Equal.equals(a1, a2))
      })
    })

    it("mapFields", () => {
      class A extends Schema.Class<A>("A")({
        a: Schema.String
      }) {}
      const schema = A.mapFields((fields) => ({ ...fields, b: Schema.Number }))
      deepStrictEqual(schema.fields, { a: Schema.String, b: Schema.Number })
    })

    it("Struct with nested Class", async () => {
      class A extends Schema.Class<A, { readonly brand: unique symbol }>("A")(Schema.Struct({
        a: Schema.String
      })) {}
      const schema = Schema.Struct({
        a: A.pipe(Schema.withConstructorDefault(Effect.succeed(new A({ a: "default" }))))
      })
      const asserts = new TestSchema.Asserts(schema)

      const make = asserts.make()
      await make.succeed({ a: new A({ a: "a" }) })
      await make.succeed({}, { a: new A({ a: "default" }) })
    })

    it("Class with nested Class", async () => {
      class A extends Schema.Class<A, { readonly brand: unique symbol }>("A")(Schema.Struct({
        a: Schema.String
      })) {}
      class B extends Schema.Class<B, { readonly brand: unique symbol }>("B")(Schema.Struct({
        a: A.pipe(Schema.withConstructorDefault(Effect.succeed(new A({ a: "default" }))))
      })) {}
      const schema = B
      const asserts = new TestSchema.Asserts(schema)

      const make = asserts.make()
      await make.succeed({ a: new A({ a: "a" }) }, new B({ a: new A({ a: "a" }) }))
      await make.succeed({}, new B({ a: new A({ a: "default" }) }))
    })

    it("make preserves Class instances in Array(Class) and Array(Union(Class))", () => {
      class Row extends Schema.Class<Row>("Row")({ value: Schema.String }) {}
      class DirectTable extends Schema.Class<DirectTable>("DirectTable")({ rows: Schema.Array(Row) }) {}
      class UnionTable extends Schema.Class<UnionTable>("UnionTable")({ rows: Schema.Array(Schema.Union([Row])) }) {}
      const row = Row.make({ value: "a" })

      strictEqual(DirectTable.make({ rows: [row] }).rows[0], row)
      strictEqual(UnionTable.make({ rows: [row] }).rows[0], row)
      deepStrictEqual(DirectTable.makeOption({ rows: [{ value: 1 } as any] }), Option.none())
      deepStrictEqual(UnionTable.makeOption({ rows: [{ value: 1 } as any] }), Option.none())
    })

    it("make constructs nested Class instances with and without Union", () => {
      class A extends Schema.Class<A>("A")({ a: Schema.String }) {}
      const direct = Schema.Struct({ a: A })
      const union = Schema.Struct({ a: Schema.Union([A]) })

      assertTrue(direct.make({ a: { a: "a" } }).a instanceof A)
      assertTrue(union.make({ a: { a: "a" } }).a instanceof A)
    })

    it("make selects the first TaggedClass Union member when the tag is defaulted", () => {
      class A extends Schema.TaggedClass<A>()("A", { a: Schema.String }) {}
      class B extends Schema.TaggedClass<B>()("B", { a: Schema.String }) {}
      const schema = Schema.Union([A, B])

      assertTrue(schema.make({ a: "a" } as any) instanceof A)
    })

    it("should be possible to define a class with a mutable field", async () => {
      class A extends Schema.Class<A>("A")({
        a: Schema.mutableKey(Schema.String)
      }) {
        public update() {
          this.a = "b"
        }
      }
      const asserts = new TestSchema.Asserts(A)

      const make = asserts.make()
      await make.succeed(new A({ a: "a" }))
      await make.succeed({ a: "a" }, new A({ a: "a" }))

      const a = new A({ a: "a" })
      a.update()
      strictEqual(a.a, "b")
    })

    it("Fields argument", async () => {
      class A extends Schema.Class<A>("A")({
        a: Schema.String
      }) {
        readonly _a = 1
      }
      const asserts = new TestSchema.Asserts(A)

      // should be a schema
      assertTrue(Schema.isSchema(A))
      // should expose the fields
      deepStrictEqual(A.fields, { a: Schema.String })
      // should expose the identifier
      strictEqual(A.identifier, "A")

      strictEqual(A.name, "A")

      assertTrue(new A({ a: "a" }) instanceof A)
      assertTrue(A.make({ a: "a" }) instanceof A)

      // test additional fields
      strictEqual(new A({ a: "a" })._a, 1)
      strictEqual(A.make({ a: "a" })._a, 1)

      // test Equal.equals
      assertTrue(Equal.equals(new A({ a: "a" }), new A({ a: "a" })))
      assertFalse(Equal.equals(new A({ a: "a" }), new A({ a: "b" })))

      const make = asserts.make()
      await make.succeed(new A({ a: "a" }))
      await make.succeed({ a: "a" }, new A({ a: "a" }))

      const decoding = asserts.decoding()
      await decoding.succeed({ a: "a" }, new A({ a: "a" }))
      await decoding.fail(
        null,
        `Expected object`
      )
      await decoding.fail(
        { a: 1 },
        `Expected string
  at ["a"]`
      )

      const encoding = asserts.encoding()
      await encoding.succeed(new A({ a: "a" }), { a: "a" })
      await encoding.fail(
        null,
        "Expected A"
      )
      await encoding.fail(
        { a: "a" },
        `Expected A`
      )
    })

    it("Struct argument", async () => {
      class A extends Schema.Class<A>("A")(Schema.Struct({
        a: Schema.String
      })) {
        readonly _a = 1
      }
      const asserts = new TestSchema.Asserts(A)

      // should be a schema
      assertTrue(Schema.isSchema(A))
      // should expose the fields
      deepStrictEqual(A.fields, { a: Schema.String })
      // should expose the identifier
      strictEqual(A.identifier, "A")

      strictEqual(A.name, "A")

      assertTrue(new A({ a: "a" }) instanceof A)
      assertTrue(A.make({ a: "a" }) instanceof A)

      // test additional fields
      strictEqual(new A({ a: "a" })._a, 1)
      strictEqual(A.make({ a: "a" })._a, 1)

      // test Equal.equals
      assertTrue(Equal.equals(new A({ a: "a" }), new A({ a: "a" })))
      assertFalse(Equal.equals(new A({ a: "a" }), new A({ a: "b" })))

      const make = asserts.make()
      await make.succeed(new A({ a: "a" }))
      await make.succeed({ a: "a" }, new A({ a: "a" }))

      if (verifyGeneration) {
        asserts.arbitrary().verifyGeneration()
      }

      const decoding = asserts.decoding()
      await decoding.succeed({ a: "a" }, new A({ a: "a" }))
      await decoding.fail(
        { a: 1 },
        `Expected string
  at ["a"]`
      )

      const encoding = asserts.encoding()
      await encoding.succeed(new A({ a: "a" }), { a: "a" })
      await encoding.fail(
        null,
        "Expected A"
      )
      await encoding.fail(
        { a: "a" },
        `Expected A`
      )
    })

    it("constructor ignores excess properties by default", () => {
      class A extends Schema.Class<A>("A")({
        a: Schema.String
      }) {}

      const instance = new A({ a: "a", extra: "extra" } as any)

      strictEqual(instance.a, "a")
      assertFalse("extra" in instance)
    })

    it("constructor strips excess properties with explicit ignore", () => {
      class A extends Schema.Class<A>("A")({
        a: Schema.String
      }) {}

      const instance = new A({ a: "a", extra: "extra" } as any, {
        parseOptions: { onExcessProperty: "ignore" }
      })

      strictEqual(instance.a, "a")
      assertFalse("extra" in instance)
    })

    it("constructor rejects excess properties when requested", () => {
      class A extends Schema.Class<A>("A")({
        a: Schema.String
      }) {}

      throws(() =>
        new A({ a: "a", extra: "extra" } as any, {
          parseOptions: { onExcessProperty: "error" }
        })
      )
    })

    it("annotate", async () => {
      class A extends Schema.Class<A>("A")({
        a: Schema.String
      }) {}

      const Annotated = A.annotate({})

      // should be a schema
      assertTrue(Schema.isSchema(Annotated))
      // should expose the fields
      deepStrictEqual(Annotated.from.fields, { a: Schema.String })

      assertTrue(Annotated.make(new A({ a: "a" })) instanceof A)
    })

    describe("extend", () => {
      it("basic", async () => {
        class A extends Schema.Class<A>("A")(Schema.Struct({
          a: Schema.String
        })) {
          readonly _a = 1
        }
        class B extends A.extend<B>("B")({
          b: Schema.Number
        }) {
          readonly _b = 2
        }
        const asserts = new TestSchema.Asserts(B)

        const instance = new B({ a: "a", b: 2 })

        assertTrue(instance instanceof A)
        assertTrue(B.make({ a: "a", b: 2 }) instanceof A)
        assertTrue(instance instanceof B)
        assertTrue(B.make({ a: "a", b: 2 }) instanceof B)

        strictEqual(instance.a, "a")
        strictEqual(instance._a, 1)
        strictEqual(instance.b, 2)
        strictEqual(instance._b, 2)

        const make = asserts.make()
        await make.succeed(new B({ a: "a", b: 2 }))
        await make.succeed({ a: "a", b: 2 }, new B({ a: "a", b: 2 }))

        const decoding = asserts.decoding()
        await decoding.succeed({ a: "a", b: 2 }, new B({ a: "a", b: 2 }))
      })

      it("decoding validates the extended struct once", () => {
        let baseChecks = 0
        let extensionChecks = 0
        class A extends Schema.Class<A>("A")(
          Schema.Struct({
            a: Schema.String
          }).check(Schema.makeFilter(() => {
            baseChecks++
            return true
          }))
        ) {}
        class B extends A.extend<B>("B")(
          Schema.Struct({
            b: Schema.Number
          }).check(Schema.makeFilter(() => {
            extensionChecks++
            return true
          }))
        ) {}

        const instance = Schema.decodeUnknownSync(B)({ a: "a", b: 1 })

        assertTrue(instance instanceof B)
        strictEqual(baseChecks, 1)
        strictEqual(extensionChecks, 1)
      })

      it("constructor preserves subclass fields while ignoring excess properties by default", () => {
        class A extends Schema.Class<A>("A")({
          a: Schema.String
        }) {}
        class B extends A.extend<B>("B")({
          b: Schema.Number
        }) {}

        const instance = new B({ a: "a", b: 2, extra: "extra" } as any)

        strictEqual(instance.a, "a")
        strictEqual(instance.b, 2)
        assertFalse("extra" in instance)
      })

      it("constructor keeps subclass fields and strips excess properties with explicit ignore", () => {
        class A extends Schema.Class<A>("A")({
          a: Schema.String
        }) {}
        class B extends A.extend<B>("B")({
          b: Schema.Number
        }) {}

        const instance = new B({ a: "a", b: 2, extra: "extra" } as any, {
          parseOptions: { onExcessProperty: "ignore" }
        })

        strictEqual(instance.a, "a")
        strictEqual(instance.b, 2)
        assertFalse("extra" in instance)
      })

      it("constructor does not treat subclass fields as excess properties", () => {
        class A extends Schema.Class<A>("A")({
          a: Schema.String
        }) {}
        class B extends A.extend<B>("B")({
          b: Schema.Number
        }) {}

        const instance = new B({ a: "a", b: 2 }, {
          parseOptions: { onExcessProperty: "error" }
        })

        strictEqual(instance.a, "a")
        strictEqual(instance.b, 2)

        throws(() =>
          new B({ a: "a", b: 2, extra: "extra" } as any, {
            parseOptions: { onExcessProperty: "error" }
          })
        )
      })

      it("Struct argument", async () => {
        class A extends Schema.Class<A>("A")(
          Schema.Struct({
            a: Schema.Number
          }).check(Schema.makeFilter(({ a }) => a > 0, { expected: "positive a" }))
        ) {}
        class B extends A.extend<B>("B")(
          Schema.Struct({
            b: Schema.Number
          }).check(Schema.makeFilter(({ b }) => b > 0, { expected: "positive b" }))
        ) {}
        const asserts = new TestSchema.Asserts(B)

        const make = asserts.make()
        await make.succeed({ a: 1, b: 1 }, new B({ a: 1, b: 1 }))
        await make.fail({ a: 0, b: 1 }, `Expected positive a`)
        await make.fail({ a: 1, b: 0 }, `Expected positive b`)
      })

      it("static members", async () => {
        class A extends Schema.Class<A>("A")({
          a: Schema.String
        }) {
          static readonly aStatic = "value"
        }
        class B extends A.extend<B, typeof A>("B")({
          b: Schema.Number
        }) {}
        strictEqual(B.aStatic, "value")
      })
    })
  })

  describe("TaggedClass", () => {
    it("make with void input", () => {
      class A extends Schema.TaggedClass<A>()("A", {}) {}
      deepStrictEqual(A.make(), new A())
      deepStrictEqual(A.makeOption(), Option.some(new A()))
      deepStrictEqual(Effect.runSync(A.makeEffect()), new A())
    })

    it("explicit identifier", async () => {
      class A extends Schema.TaggedClass<A>("B")("A", {
        a: Schema.String
      }) {}
      strictEqual(A.identifier, "B")
    })

    it("fields argument", async () => {
      class A extends Schema.TaggedClass<A>()("A", {
        a: Schema.String
      }) {}
      const asserts = new TestSchema.Asserts(A)

      assertTrue(Schema.isSchema(A))
      deepStrictEqual(Object.keys(A.fields).sort(), ["_tag", "a"])
      strictEqual(A.identifier, "A")

      const instance = new A({ a: "a" })
      strictEqual(instance._tag, "A")
      strictEqual(instance.a, "a")
      assertTrue(instance instanceof A)

      const make = asserts.make()
      await make.succeed(new A({ a: "a" }))
      await make.succeed({ a: "a" }, new A({ a: "a" }))

      const decoding = asserts.decoding()
      await decoding.succeed({ _tag: "A", a: "a" }, new A({ a: "a" }))

      const encoding = asserts.encoding()
      await encoding.succeed(new A({ a: "a" }), { _tag: "A", a: "a" })
    })

    it("constructor ignores excess properties by default", () => {
      class A extends Schema.TaggedClass<A>()("A", {
        a: Schema.String
      }) {}

      const instance = new A({ a: "a", extra: "extra" } as any)

      strictEqual(instance._tag, "A")
      strictEqual(instance.a, "a")
      assertFalse("extra" in instance)
    })

    it("Struct argument", async () => {
      class A extends Schema.TaggedClass<A>()(
        "A",
        Schema.Struct({
          a: Schema.String
        }).check(Schema.makeFilter(({ a }) => a.length > 0, { expected: `"a" being longer than 0` }))
      ) {}

      const asserts = new TestSchema.Asserts(A)

      const make = asserts.make()
      await make.succeed({ a: "a" }, new A({ a: "a" }))
      await make.fail({ a: "" }, `Expected "a" being longer than 0`)

      const decoding = asserts.decoding()
      await decoding.succeed({ _tag: "A", a: "a" }, new A({ a: "a" }))
      await decoding.fail(
        { a: "a" },
        `Missing key
  at ["_tag"]`
      )
      await decoding.fail({ _tag: "A", a: "" }, `Expected "a" being longer than 0`)
    })

    it("extended constructor does not treat subclass fields as excess properties", () => {
      class A extends Schema.TaggedClass<A>()("A", {
        a: Schema.String
      }) {}
      class B extends A.extend<B>("B")({
        b: Schema.Number
      }) {}

      const instance = new B({ a: "a", b: 2, extra: "extra" } as any)

      strictEqual(instance._tag, "A")
      strictEqual(instance.a, "a")
      strictEqual(instance.b, 2)
      assertFalse("extra" in instance)

      const strictInstance = new B({ a: "a", b: 2 }, {
        parseOptions: { onExcessProperty: "error" }
      })

      strictEqual(strictInstance._tag, "A")
      strictEqual(strictInstance.a, "a")
      strictEqual(strictInstance.b, 2)

      throws(() =>
        new B({ a: "a", b: 2, extra: "extra" } as any, {
          parseOptions: { onExcessProperty: "error" }
        })
      )
    })
  })

  describe("Error", () => {
    it("make with void input", () => {
      class E extends Schema.Error<E>("E")({}) {}
      deepStrictEqual(E.make(), new E())
      deepStrictEqual(E.makeOption(), Option.some(new E()))
      deepStrictEqual(Effect.runSync(E.makeEffect()), new E())
    })

    it("fields argument", async () => {
      class E extends Schema.Error<E>("E")({
        id: Schema.Number
      }) {}
      const asserts = new TestSchema.Asserts(E)

      const err = new E({ id: 1 })

      strictEqual(String(err), `E`)
      assertInclude(err.stack, "Schema.test.ts:")
      strictEqual(err.id, 1)

      const make = asserts.make()
      await make.succeed(new E({ id: 1 }))
      await make.succeed({ id: 1 }, new E({ id: 1 }))
    })

    it("constructor ignores excess properties by default", () => {
      class E extends Schema.Error<E>("E")({
        message: Schema.String,
        cause: Schema.optionalKey(Schema.Unknown),
        code: Schema.Number
      }) {}
      const cause = new Error("cause")

      const err = new E({ message: "boom", cause, code: 1, extra: "extra" } as any)

      strictEqual(err.message, "boom")
      strictEqual(err.cause, cause)
      strictEqual(err.code, 1)
      assertFalse("extra" in err)
    })

    it("constructor strips excess properties with explicit ignore", () => {
      class E extends Schema.Error<E>("E")({
        message: Schema.String,
        code: Schema.Number
      }) {}

      const err = new E({ message: "boom", code: 1, extra: "extra" } as any, {
        parseOptions: { onExcessProperty: "ignore" }
      })

      strictEqual(err.message, "boom")
      strictEqual(err.code, 1)
      assertFalse("extra" in err)
    })

    it("Struct argument", async () => {
      class E extends Schema.Error<E>("E")(Schema.Struct({
        id: Schema.Number
      })) {}
      const asserts = new TestSchema.Asserts(E)

      const err = new E({ id: 1 })

      strictEqual(String(err), `E`)
      assertInclude(err.stack, "Schema.test.ts:")
      strictEqual(err.id, 1)

      const make = asserts.make()
      await make.succeed(new E({ id: 1 }))
      await make.succeed({ id: 1 }, new E({ id: 1 }))

      if (verifyGeneration) {
        asserts.arbitrary().verifyGeneration()
      }
    })

    it("extend", async () => {
      class A extends Schema.Error<A>("A")({
        a: Schema.String
      }) {
        readonly _a = 1
      }
      class B extends A.extend<B>("B")({
        b: Schema.Number
      }) {
        readonly _b = 2
      }
      const asserts = new TestSchema.Asserts(B)

      const instance = new B({ a: "a", b: 2 })

      strictEqual(String(instance), `B`)
      assertInclude(instance.stack, "Schema.test.ts:")

      assertTrue(instance instanceof A)
      assertTrue(B.make({ a: "a", b: 2 }) instanceof A)
      assertTrue(instance instanceof B)
      assertTrue(B.make({ a: "a", b: 2 }) instanceof B)

      strictEqual(instance.a, "a")
      strictEqual(instance._a, 1)
      strictEqual(instance.b, 2)
      strictEqual(instance._b, 2)

      const make = asserts.make()
      await make.succeed(new B({ a: "a", b: 2 }))
      await make.succeed({ a: "a", b: 2 }, new B({ a: "a", b: 2 }))

      const decoding = asserts.decoding()
      await decoding.succeed({ a: "a", b: 2 }, new B({ a: "a", b: 2 }))
    })

    it("extended constructor ignores excess properties by default", () => {
      class A extends Schema.Error<A>("A")({
        message: Schema.String
      }) {}
      class B extends A.extend<B>("B")({
        code: Schema.Number
      }) {}

      const err = new B({ message: "boom", code: 1, extra: "extra" } as any)

      strictEqual(err.message, "boom")
      strictEqual(err.code, 1)
      assertFalse("extra" in err)
    })

    it("extended constructor does not treat subclass fields as excess properties", () => {
      class A extends Schema.Error<A>("A")({
        message: Schema.String
      }) {}
      class B extends A.extend<B>("B")({
        code: Schema.Number
      }) {}

      const err = new B({ message: "boom", code: 1 }, {
        parseOptions: { onExcessProperty: "error" }
      })

      strictEqual(err.message, "boom")
      strictEqual(err.code, 1)
    })

    it("`toString` to match native `Error` output format", async () => {
      class E extends Schema.Error<E>("E")({
        message: Schema.String
      }) {}
      const err = new E({ message: "my message" })
      strictEqual(String(err), `E: my message`)
    })
  })

  describe("TaggedError", () => {
    it("make preserves existing instances", () => {
      class E extends Schema.TaggedError<E>()("E", { message: Schema.String }) {}
      const instance = new E({ message: "failure" })

      assert.strictEqual(E.make(instance), instance)
    })

    it("make with void input", () => {
      class E extends Schema.TaggedError<E>()("E", {}) {}
      deepStrictEqual(E.make(), new E())
      deepStrictEqual(E.makeOption(), Option.some(new E()))
      deepStrictEqual(Effect.runSync(E.makeEffect()), new E())
    })

    it("fields argument", async () => {
      class E extends Schema.TaggedError<E>()("E", {
        id: Schema.Number
      }) {}
      const asserts = new TestSchema.Asserts(E)

      const err = new E({ id: 1 })
      strictEqual(err._tag, "E")
      strictEqual(err.id, 1)
      assertInclude(err.stack, "Schema.test.ts:")

      const make = asserts.make()
      await make.succeed(new E({ id: 1 }))
      await make.succeed({ id: 1 }, new E({ id: 1 }))

      const decoding = asserts.decoding()
      await decoding.succeed({ _tag: "E", id: 1 }, new E({ id: 1 }))

      const encoding = asserts.encoding()
      await encoding.succeed(new E({ id: 1 }), { _tag: "E", id: 1 })
    })

    it("constructor ignores excess properties by default", () => {
      class E extends Schema.TaggedError<E>()("E", {
        id: Schema.Number
      }) {}

      const err = new E({ id: 1, extra: "extra" } as any)

      strictEqual(err._tag, "E")
      strictEqual(err.id, 1)
      assertFalse("extra" in err)
    })

    it("Struct argument", async () => {
      class E extends Schema.TaggedError<E>()(
        "E",
        Schema.Struct({
          id: Schema.Number
        })
      ) {}

      const err = new E({ id: 1 })
      strictEqual(err._tag, "E")
      strictEqual(err.id, 1)
      deepStrictEqual(Object.keys(E.fields).sort(), ["_tag", "id"])
    })

    it("name matches tag", () => {
      class E extends Schema.TaggedError<E>()("TaggedErrorName", {
        id: Schema.Number
      }) {}

      const err = new E({ id: 1 })
      strictEqual(err.name, "TaggedErrorName")
    })

    it("name matches identifier", () => {
      class E extends Schema.TaggedError<E>("A")("B", {
        a: Schema.Number
      }) {}

      const err = new E({ a: 1 })
      strictEqual(err.name, "A")
    })

    it("name matches identifier after extend", () => {
      class E extends Schema.TaggedError<E>("A")("B", {
        a: Schema.Number
      }) {}
      class E2 extends E.extend<E2>("C")({
        b: Schema.String
      }) {}

      const err = new E2({ a: 1, b: "b" })
      strictEqual(err.name, "C")
    })

    it("zero-field TaggedError allows omitting props argument", () => {
      class NotFoundError extends Schema.TaggedError<NotFoundError>()("NotFoundError", {}) {}

      // new NotFoundError() should work without passing {}
      const a = new NotFoundError()
      strictEqual(a._tag, "NotFoundError")
      assertTrue(a instanceof NotFoundError)

      // new NotFoundError({}) should also still work
      const b = new NotFoundError({})
      strictEqual(b._tag, "NotFoundError")
      assertTrue(b instanceof NotFoundError)
    })

    it("extend", async () => {
      class A extends Schema.TaggedError<A>()("A", {
        a: Schema.String
      }) {}
      class B extends A.extend<B>("B")({
        b: Schema.Number
      }) {}
      const instance = new B({ a: "a", b: 2 })
      strictEqual(instance._tag, "A")
      assertTrue(instance instanceof A)
      assertTrue(instance instanceof B)
    })

    it("extended constructor ignores excess properties by default", () => {
      class A extends Schema.TaggedError<A>()("A", {
        a: Schema.String
      }) {}
      class B extends A.extend<B>("B")({
        b: Schema.Number
      }) {}

      const instance = new B({ a: "a", b: 2, extra: "extra" } as any)

      strictEqual(instance._tag, "A")
      strictEqual(instance.a, "a")
      strictEqual(instance.b, 2)
      assertFalse("extra" in instance)
    })

    it("extended constructor does not treat subclass fields as excess properties", () => {
      class A extends Schema.TaggedError<A>()("A", {
        a: Schema.String
      }) {}
      class B extends A.extend<B>("B")({
        b: Schema.Number
      }) {}

      const instance = new B({ a: "a", b: 2 }, {
        parseOptions: { onExcessProperty: "error" }
      })

      strictEqual(instance._tag, "A")
      strictEqual(instance.a, "a")
      strictEqual(instance.b, 2)
    })
  })

  describe("Enum", () => {
    it("rejects non-finite numeric values", () => {
      for (const value of [NaN, Infinity, -Infinity]) {
        throws(
          () => Schema.Enum({ value }),
          new Error(`A numeric enum value must be finite, got ${String(value)}`)
        )
      }
    })

    it("enums should be exposed", () => {
      enum Fruits {
        Apple,
        Banana
      }
      const schema = Schema.Enum(Fruits)
      strictEqual(schema.enums.Apple, 0)
      strictEqual(schema.enums.Banana, 1)
    })

    it("Numeric enum", async () => {
      enum Fruits {
        Apple,
        Banana
      }
      const schema = Schema.Enum(Fruits)
      const asserts = new TestSchema.Asserts(schema)

      const decoding = asserts.decoding()
      await decoding.succeed(Fruits.Apple)
      await decoding.succeed(Fruits.Banana)
      await decoding.succeed(0)
      await decoding.succeed(1)

      await decoding.fail(
        3,
        `Expected 0 | 1`
      )

      const encoding = asserts.encoding()
      await encoding.succeed(Fruits.Apple, 0)
      await encoding.succeed(Fruits.Banana, 1)
    })

    it("String enum", async () => {
      enum Fruits {
        Apple = "apple",
        Banana = "banana",
        Cantaloupe = 0
      }
      const schema = Schema.Enum(Fruits)
      const asserts = new TestSchema.Asserts(schema)

      const decoding = asserts.decoding()
      await decoding.succeed(Fruits.Apple)
      await decoding.succeed(Fruits.Cantaloupe)
      await decoding.succeed("apple")
      await decoding.succeed("banana")
      await decoding.succeed(0)
      await decoding.succeed(0)

      await decoding.fail(
        "Cantaloupe",
        `Expected "apple" | "banana" | 0`
      )

      const encoding = asserts.encoding()
      await encoding.succeed(Fruits.Apple)
      await encoding.succeed(Fruits.Banana)
      await encoding.succeed(Fruits.Cantaloupe)
    })

    it("Const enum", async () => {
      const Fruits = {
        Apple: "apple",
        Banana: "banana",
        Cantaloupe: 3
      } as const
      const schema = Schema.Enum(Fruits)
      const asserts = new TestSchema.Asserts(schema)

      const decoding = asserts.decoding()
      await decoding.succeed("apple")
      await decoding.succeed("banana")
      await decoding.succeed(3)

      await decoding.fail(
        "Cantaloupe",
        `Expected "apple" | "banana" | 3`
      )

      const encoding = asserts.encoding()
      await encoding.succeed(Fruits.Apple, "apple")
      await encoding.succeed(Fruits.Banana, "banana")
      await encoding.succeed(Fruits.Cantaloupe, 3)
    })
  })

  describe("catchDecoding", () => {
    it("sync fallback", async () => {
      const fallback = Effect.succeed(Option.some("b"))
      const schema = Schema.String.pipe(Schema.catchDecoding(() => fallback)).check(Schema.isNonEmpty())
      const asserts = new TestSchema.Asserts(schema)

      const decoding = asserts.decoding()
      await decoding.succeed("a")
      await decoding.succeed(null, "b")
      await decoding.fail(
        "",
        `Expected a value with a length of at least 1`
      )

      const encoding = asserts.encoding()
      await encoding.succeed("a")
      await encoding.fail(
        null,
        "Expected string"
      )
    })

    it("async fallback", async () => {
      const fallback = Effect.succeed(Option.some("b")).pipe(Effect.delay(100))
      const schema = Schema.String.pipe(Schema.catchDecoding(() => fallback))
      const asserts = new TestSchema.Asserts(schema)

      const decoding = asserts.decoding()
      await decoding.succeed("a")
      await decoding.succeed(null, "b")
    })
  })

  it("catchDecodingWithContext", async () => {
    class Service extends Context.Service<Service, { fallback: Effect.Effect<string> }>()("Service") {}

    const schema = Schema.String.pipe(Schema.catchDecodingWithContext(() =>
      Effect.gen(function*() {
        const service = yield* Service
        return Option.some(yield* service.fallback)
      })
    ))
    const asserts = new TestSchema.Asserts(schema)

    const decoding = asserts.decoding().provide(
      Service,
      { fallback: Effect.succeed("b") }
    )
    await decoding.succeed("a")
    await decoding.succeed(null, "b")
  })

  describe("middlewareDecoding", () => {
    it("providing a service", async () => {
      class Service extends Context.Service<Service, { fallback: Effect.Effect<number> }>()("Service") {}

      const schema = Schema.FiniteFromString.pipe(
        Schema.catchDecodingWithContext((issue) =>
          Effect.gen(function*() {
            if (issue._tag === "Encoding" && issue.issue._tag === "InvalidType") {
              return yield* Effect.fail(issue)
            }
            const service = yield* Service
            return Option.some(yield* service.fallback)
          })
        ),
        Schema.middlewareDecoding(Effect.provideService(Service, { fallback: Effect.succeed(0) }))
      )
      const asserts = new TestSchema.Asserts(schema)

      const decoding = asserts.decoding()
      await decoding.succeed("1", 1)
      await decoding.succeed("a", 0)
      await decoding.fail(null, "Expected string")
    })

    it("forced failure", async () => {
      const schema = Schema.String.pipe(
        Schema.middlewareDecoding(() => Effect.fail(new SchemaIssue.Forbidden({ message: "my message" })))
      )
      const asserts = new TestSchema.Asserts(schema)

      const decoding = asserts.decoding()
      await decoding.fail(
        "1",
        "my message"
      )
    })
  })

  describe("catchEncoding", () => {
    it("sync fallback", async () => {
      const fallback = Effect.succeed(Option.some(0))
      const schema = Schema.Number.pipe(Schema.catchEncoding(() => fallback), Schema.encodeTo(Schema.Int))
      const asserts = new TestSchema.Asserts(schema)

      const decoding = asserts.decoding()
      await decoding.succeed(1)
      await decoding.fail(
        1.2,
        `Expected an integer`
      )

      const encoding = asserts.encoding()
      await encoding.succeed(1)
      await encoding.succeed(null, 0)
      await encoding.fail(
        1.2,
        `Expected an integer`
      )
    })

    it("async fallback", async () => {
      const fallback = Effect.succeed(Option.some(0)).pipe(Effect.delay(100))
      const schema = Schema.Number.pipe(Schema.catchEncoding(() => fallback), Schema.encodeTo(Schema.Int))
      const asserts = new TestSchema.Asserts(schema)

      const encoding = asserts.encoding()
      await encoding.succeed(1)
      await encoding.succeed(null, 0)
      await encoding.fail(
        1.2,
        `Expected an integer`
      )
    })
  })

  it("catchEncodingWithContext", async () => {
    class Service extends Context.Service<Service, { fallback: Effect.Effect<number> }>()("Service") {}

    const schema = Schema.Number.pipe(
      Schema.catchEncodingWithContext(() =>
        Effect.gen(function*() {
          const service = yield* Service
          return Option.some(yield* service.fallback)
        })
      ),
      Schema.encodeTo(Schema.Int)
    )
    const asserts = new TestSchema.Asserts(schema)

    const encoding = asserts.encoding().provide(
      Service,
      { fallback: Effect.succeed(0) }
    )
    await encoding.succeed(1)
    await encoding.succeed(null, 0)
    await encoding.fail(
      1.2,
      `Expected an integer`
    )
  })

  describe("middlewareEncoding", () => {
    it("providing a service", async () => {
      class Service extends Context.Service<Service, { fallback: Effect.Effect<string> }>()("Service") {}

      const schema = Schema.FiniteFromString.pipe(
        Schema.catchEncodingWithContext((issue) =>
          Effect.gen(function*() {
            if (issue._tag === "InvalidType") {
              return yield* Effect.fail(issue)
            }
            const service = yield* Service
            return Option.some(yield* service.fallback)
          })
        ),
        Schema.middlewareEncoding(Effect.provideService(Service, { fallback: Effect.succeed("b") }))
      )
      const asserts = new TestSchema.Asserts(schema)

      const encoding = asserts.encoding()
      await encoding.succeed(1, "1")
      await encoding.succeed(NaN, "b")
      await encoding.fail(null, "Expected number")
    })

    it("forced failure", async () => {
      const schema = Schema.String.pipe(
        Schema.middlewareEncoding(() => Effect.fail(new SchemaIssue.Forbidden({ message: "my message" })))
      )
      const asserts = new TestSchema.Asserts(schema)

      const encoding = asserts.encoding()
      await encoding.fail(1, "my message")
    })
  })

  describe("Optional Fields", () => {
    it("Exact Optional Property", async () => {
      const schema = Schema.Struct({
        a: Schema.optionalKey(Schema.FiniteFromString)
      })
      const asserts = new TestSchema.Asserts(schema)

      const decoding = asserts.decoding()
      await decoding.succeed({ a: "1" }, { a: 1 })
      await decoding.succeed({})

      const encoding = asserts.encoding()
      await encoding.succeed({ a: 1 }, { a: "1" })
      await encoding.succeed({})
    })

    it("Optional Property", async () => {
      const schema = Schema.Struct({
        a: Schema.optional(Schema.FiniteFromString)
      })
      const asserts = new TestSchema.Asserts(schema)

      const decoding = asserts.decoding()
      await decoding.succeed({ a: "1" }, { a: 1 })
      await decoding.succeed({})
      await decoding.succeed({ a: undefined })

      const encoding = asserts.encoding()
      await encoding.succeed({ a: 1 }, { a: "1" })
      await encoding.succeed({})
      await encoding.succeed({ a: undefined })
    })

    it("Exact Optional Property with Nullability", async () => {
      const schema = Schema.Struct({
        a: Schema.optionalKey(Schema.NullOr(Schema.FiniteFromString))
      })
      const asserts = new TestSchema.Asserts(schema)

      const decoding = asserts.decoding()
      await decoding.succeed({ a: "1" }, { a: 1 })
      await decoding.succeed({})
      await decoding.succeed({ a: null })

      const encoding = asserts.encoding()
      await encoding.succeed({ a: 1 }, { a: "1" })
      await encoding.succeed({})
      await encoding.succeed({ a: null })
    })

    it("Optional Property with Nullability", async () => {
      const schema = Schema.Struct({
        a: Schema.optional(Schema.NullOr(Schema.FiniteFromString))
      })
      const asserts = new TestSchema.Asserts(schema)

      const decoding = asserts.decoding()
      await decoding.succeed({ a: "1" }, { a: 1 })
      await decoding.succeed({})
      await decoding.succeed({ a: undefined })
      await decoding.succeed({ a: null })

      const encoding = asserts.encoding()
      await encoding.succeed({ a: 1 }, { a: "1" })
      await encoding.succeed({})
      await encoding.succeed({ a: null })
      await encoding.succeed({ a: undefined })
    })

    it("Optional Property to Exact Optional Property", async () => {
      const schema = Schema.Struct({
        a: Schema.optional(Schema.FiniteFromString).pipe(Schema.decodeTo(Schema.optionalKey(Schema.Number), {
          decode: SchemaGetter.transformOptional(Option.filter(Predicate.isNotUndefined)),
          encode: SchemaGetter.passthrough()
        }))
      })
      const asserts = new TestSchema.Asserts(schema)

      const decoding = asserts.decoding()
      await decoding.succeed({ a: "1" }, { a: 1 })
      await decoding.succeed({})
      await decoding.succeed({ a: undefined }, {})

      const encoding = asserts.encoding()
      await encoding.succeed({ a: 1 }, { a: "1" })
      await encoding.succeed({})
    })

    it("Optional Property with Nullability to Optional Property", async () => {
      const schema = Schema.Struct({
        a: Schema.optional(Schema.NullOr(Schema.FiniteFromString)).pipe(
          Schema.decodeTo(Schema.optional(Schema.Number), {
            decode: SchemaGetter.transformOptional(Option.filter(Predicate.isNotNull)),
            encode: SchemaGetter.passthrough()
          })
        )
      })
      const asserts = new TestSchema.Asserts(schema)

      const decoding = asserts.decoding()
      await decoding.succeed({ a: "1" }, { a: 1 })
      await decoding.succeed({})
      await decoding.succeed({ a: undefined })
      await decoding.succeed({ a: null }, {})

      const encoding = asserts.encoding()
      await encoding.succeed({ a: 1 }, { a: "1" })
      await encoding.succeed({})
    })
  })

  describe("asOption", () => {
    it("optionalKey -> Option", async () => {
      const schema = Schema.Struct({
        a: Schema.optionalKey(Schema.FiniteFromString).pipe(
          Schema.decodeTo(
            Schema.Option(Schema.Number),
            SchemaTransformation.transformOptional({
              decode: Option.some,
              encode: Option.flatten
            })
          )
        )
      })
      const asserts = new TestSchema.Asserts(schema)

      const decoding = asserts.decoding()
      await decoding.succeed({ a: "1" }, { a: Option.some(1) })
      await decoding.succeed({}, { a: Option.none() })

      const encoding = asserts.encoding()
      await encoding.succeed({ a: Option.some(1) }, { a: "1" })
      await encoding.succeed({ a: Option.none() }, {})
    })

    it("optional -> Option", async () => {
      const schema = Schema.Struct({
        a: Schema.optional(Schema.FiniteFromString).pipe(
          Schema.decodeTo(
            Schema.Option(Schema.Number),
            SchemaTransformation.transformOptional({
              decode: (on) => on.pipe(Option.filter((nu) => nu !== undefined), Option.some),
              encode: Option.flatten
            })
          )
        )
      })
      const asserts = new TestSchema.Asserts(schema)

      const decoding = asserts.decoding()
      await decoding.succeed({ a: "1" }, { a: Option.some(1) })
      await decoding.succeed({}, { a: Option.none() })
      await decoding.succeed({ a: undefined }, { a: Option.none() })

      const encoding = asserts.encoding()
      await encoding.succeed({ a: Option.some(1) }, { a: "1" })
      await encoding.succeed({ a: Option.none() }, {})
    })
  })

  it("decodeTo as composition", async () => {
    const From = Schema.Struct({
      a: Schema.String,
      b: Schema.FiniteFromString
    })

    const To = Schema.Struct({
      a: Schema.FiniteFromString,
      b: Schema.UndefinedOr(Schema.Number)
    })

    const schema = From.pipe(Schema.decodeTo(To))
    const asserts = new TestSchema.Asserts(schema)

    const decoding = asserts.decoding()
    await decoding.succeed({ a: "1", b: "2" }, { a: 1, b: 2 })

    const encoding = asserts.encoding()
    await encoding.succeed({ a: 1, b: 2 }, { a: "1", b: "2" })
    await encoding.fail(
      { a: 1, b: NaN },
      `Expected a finite number
  at ["b"]`
    )
    await encoding.fail(
      { a: 1, b: undefined },
      `Expected number
  at ["b"]`
    )
  })

  it("encodeTo as composition", async () => {
    const From = Schema.Struct({
      a: Schema.String,
      b: Schema.FiniteFromString
    })

    const To = Schema.Struct({
      a: Schema.FiniteFromString,
      b: Schema.UndefinedOr(Schema.Number)
    })

    const schema = To.pipe(Schema.encodeTo(From))
    const asserts = new TestSchema.Asserts(schema)

    const decoding = asserts.decoding()
    await decoding.succeed({ a: "1", b: "2" }, { a: 1, b: 2 })
    await decoding.fail(
      { a: "1", b: null },
      `Expected string
  at ["b"]`
    )

    const encoding = asserts.encoding()
    await encoding.succeed({ a: 1, b: 2 }, { a: "1", b: "2" })
    await encoding.fail(
      { a: 1, b: NaN },
      `Expected a finite number
  at ["b"]`
    )
    await encoding.fail(
      { a: 1, b: undefined },
      `Expected number
  at ["b"]`
    )
  })

  describe("checkEffect", () => {
    it("no context", async () => {
      const schema = Schema.String.pipe(
        Schema.decode({
          decode: SchemaGetter.checkEffect((s) =>
            Effect.gen(function*() {
              if (s.length === 0) {
                return new SchemaIssue.InvalidValue({ message: "input should not be empty string" })
              }
            }).pipe(Effect.delay(100))
          ),
          encode: SchemaGetter.passthrough()
        })
      )
      const asserts = new TestSchema.Asserts(schema)

      const decoding = asserts.decoding()
      await decoding.succeed("a")
      await decoding.fail(
        "",
        "input should not be empty string"
      )
    })

    it("with context", async () => {
      class Service extends Context.Service<Service, { fallback: Effect.Effect<string> }>()("Service") {}

      const schema = Schema.String.pipe(
        Schema.decode({
          decode: SchemaGetter.checkEffect((s) =>
            Effect.gen(function*() {
              yield* Service
              if (s.length === 0) {
                return new SchemaIssue.InvalidValue({ message: "input should not be empty string" })
              }
            })
          ),
          encode: SchemaGetter.passthrough()
        })
      )
      const asserts = new TestSchema.Asserts(schema)

      const decoding = asserts.decoding().provide(
        Service,
        { fallback: Effect.succeed("b") }
      )
      await decoding.succeed("a")
      await decoding.fail(
        "",
        "input should not be empty string"
      )
    })
  })

  describe("is", () => {
    it("FiniteFromString", () => {
      const schema = Schema.FiniteFromString
      const is = Schema.is(schema)
      assertTrue(is(1))
      assertFalse(is("a"))
    })
  })

  describe("asserts", () => {
    it("FiniteFromString", () => {
      const schema = Schema.FiniteFromString
      try {
        Schema.asserts(schema, 1)
      } catch {
        fail("Expected asserts to not throw an error")
      }
      try {
        Schema.asserts(schema, "a")
        fail("Expected asserts to throw an error")
      } catch (e) {
        assertSchemaIssueError(e, "Expected number")
      }
    })
  })

  describe("decodeUnknownPromise / encodeUnknownPromise", () => {
    it("FiniteFromString", async () => {
      const schema = Schema.FiniteFromString
      const decodeUnknownPromise = Schema.decodeUnknownPromise(schema)
      const encodeUnknownPromise = Schema.encodeUnknownPromise(schema)
      const decodeUnknownPromiseIssue = SchemaParser.decodeUnknownPromise(schema)
      const encodeUnknownPromiseIssue = SchemaParser.encodeUnknownPromise(schema)

      const r1 = await decodeUnknownPromise("1").then(Result.succeed, Result.fail)
      deepStrictEqual(r1, Result.succeed(1))

      const r2 = await decodeUnknownPromise(null).then(Result.succeed, Result.fail)
      assertTrue(Result.isFailure(r2))
      assertTrue(Schema.isSchemaError(r2.failure))
      strictEqual(r2.failure.message, "Expected string")

      const r3 = await encodeUnknownPromise(1).then(Result.succeed, Result.fail)
      deepStrictEqual(r3, Result.succeed("1"))

      const r4 = await encodeUnknownPromise(null).then(Result.succeed, Result.fail)
      assertTrue(Result.isFailure(r4))
      assertTrue(Schema.isSchemaError(r4.failure))
      strictEqual(r4.failure.message, "Expected number")

      const r5 = await decodeUnknownPromiseIssue(null).then(Result.succeed, Result.fail)
      assertTrue(Result.isFailure(r5))
      assertSchemaIssueError(r5.failure, "Expected string")

      const r6 = await encodeUnknownPromiseIssue(null).then(Result.succeed, Result.fail)
      assertTrue(Result.isFailure(r6))
      assertSchemaIssueError(r6.failure, "Expected number")
    })

    it("should reject with an error when the cause contains both a schema issue and a defect", async () => {
      const cause = Cause.combine(
        Cause.fail(new SchemaIssue.InvalidValue({ message: "schema issue" })),
        Cause.die(new Error("defect"))
      )
      const decodeSchema = Schema.String.pipe(Schema.decode({
        decode: SchemaGetter.transformOptionalEffect(() => Effect.failCause(cause)),
        encode: SchemaGetter.passthrough()
      }))
      const encodeSchema = Schema.String.pipe(Schema.encode({
        decode: SchemaGetter.passthrough(),
        encode: SchemaGetter.transformOptionalEffect(() => Effect.failCause(cause))
      }))

      const r1 = await Schema.decodeUnknownPromise(decodeSchema)("a").then(Result.succeed, Result.fail)
      assertTrue(Result.isFailure(r1))
      assertTrue(r1.failure instanceof Error)
      strictEqual(r1.failure.message, "Promise adapter can only reject schema errors")
      assertTrue(Cause.hasDies(r1.failure.cause as Cause.Cause<never>))

      const r2 = await Schema.encodeUnknownPromise(encodeSchema)("a").then(Result.succeed, Result.fail)
      assertTrue(Result.isFailure(r2))
      assertTrue(r2.failure instanceof Error)
      strictEqual(r2.failure.message, "Promise adapter can only reject schema errors")
      assertTrue(Cause.hasDies(r2.failure.cause as Cause.Cause<never>))
    })
  })

  describe("decodeUnknownOption / encodeUnknownOption", () => {
    it("FiniteFromString", () => {
      const schema = Schema.FiniteFromString
      const decodeUnknownOption = Schema.decodeUnknownOption(schema)
      const encodeUnknownOption = Schema.encodeUnknownOption(schema)

      const r1 = decodeUnknownOption("1")
      assertTrue(Option.isSome(r1))
      strictEqual(r1.value, 1)

      assertTrue(Option.isNone(decodeUnknownOption(null)))

      const r2 = encodeUnknownOption(1)
      assertTrue(Option.isSome(r2))
      strictEqual(r2.value, "1")

      assertTrue(Option.isNone(encodeUnknownOption(null)))
    })

    it("should throw an error when the cause is not a schema issue", () => {
      const decodeSchema = Schema.String.pipe(Schema.decode({
        decode: SchemaGetter.transformOptionalEffect(() => Effect.die(new Error("decode defect"))),
        encode: SchemaGetter.passthrough()
      }))
      const encodeSchema = Schema.String.pipe(Schema.encode({
        decode: SchemaGetter.passthrough(),
        encode: SchemaGetter.transformOptionalEffect(() => Effect.die(new Error("encode defect")))
      }))

      throws(() => Schema.decodeUnknownOption(decodeSchema)("a"), (e) => {
        assertTrue(e instanceof Error)
        strictEqual(e.message, "Option adapter can only return none for schema issues")
        assertTrue(Cause.hasDies(e.cause as Cause.Cause<never>))
      })
      throws(() => Schema.encodeUnknownOption(encodeSchema)("a"), (e) => {
        assertTrue(e instanceof Error)
        strictEqual(e.message, "Option adapter can only return none for schema issues")
        assertTrue(Cause.hasDies(e.cause as Cause.Cause<never>))
      })
    })

    it("should throw an error when the cause contains both a schema issue and a defect", () => {
      const cause = Cause.combine(
        Cause.fail(new SchemaIssue.InvalidValue({ message: "schema issue" })),
        Cause.die(new Error("defect"))
      )
      const decodeSchema = Schema.String.pipe(Schema.decode({
        decode: SchemaGetter.transformOptionalEffect(() => Effect.failCause(cause)),
        encode: SchemaGetter.passthrough()
      }))
      const encodeSchema = Schema.String.pipe(Schema.encode({
        decode: SchemaGetter.passthrough(),
        encode: SchemaGetter.transformOptionalEffect(() => Effect.failCause(cause))
      }))

      throws(() => Schema.decodeUnknownOption(decodeSchema)("a"), (e) => {
        assertTrue(e instanceof Error)
        strictEqual(e.message, "Option adapter can only return none for schema issues")
        assertTrue(Cause.hasDies(e.cause as Cause.Cause<never>))
      })
      throws(() => Schema.encodeUnknownOption(encodeSchema)("a"), (e) => {
        assertTrue(e instanceof Error)
        strictEqual(e.message, "Option adapter can only return none for schema issues")
        assertTrue(Cause.hasDies(e.cause as Cause.Cause<never>))
      })
    })
  })

  describe("decodeUnknownResult / encodeUnknownResult", () => {
    it("FiniteFromString", () => {
      const schema = Schema.FiniteFromString
      const decodeUnknownResult = Schema.decodeUnknownResult(schema)
      const encodeUnknownResult = Schema.encodeUnknownResult(schema)

      const r1 = decodeUnknownResult("1")
      assertTrue(Result.isSuccess(r1))
      strictEqual(r1.success, 1)

      const r2 = decodeUnknownResult(null)
      assertTrue(Result.isFailure(r2))
      assertTrue(Schema.isSchemaError(r2.failure))
      strictEqual(r2.failure.message, "Expected string")

      const r3 = encodeUnknownResult(1)
      assertTrue(Result.isSuccess(r3))
      strictEqual(r3.success, "1")

      const r4 = encodeUnknownResult(null)
      assertTrue(Result.isFailure(r4))
      assertTrue(Schema.isSchemaError(r4.failure))
      strictEqual(r4.failure.message, "Expected number")

      const r5 = SchemaParser.decodeUnknownResult(schema)(null)
      assertTrue(Result.isFailure(r5))
      assertTrue(SchemaIssue.isIssue(r5.failure))
      strictEqual(formatIssue(r5.failure), "Expected string")

      const r6 = SchemaParser.encodeUnknownResult(schema)(null)
      assertTrue(Result.isFailure(r6))
      assertTrue(SchemaIssue.isIssue(r6.failure))
      strictEqual(formatIssue(r6.failure), "Expected number")
    })

    it("should throw an error when the cause contains both a schema issue and a defect", () => {
      const cause = Cause.combine(
        Cause.fail(new SchemaIssue.InvalidValue({ message: "schema issue" })),
        Cause.die(new Error("defect"))
      )
      const decodeSchema = Schema.String.pipe(Schema.decode({
        decode: SchemaGetter.transformOptionalEffect(() => Effect.failCause(cause)),
        encode: SchemaGetter.passthrough()
      }))
      const encodeSchema = Schema.String.pipe(Schema.encode({
        decode: SchemaGetter.passthrough(),
        encode: SchemaGetter.transformOptionalEffect(() => Effect.failCause(cause))
      }))

      throws(() => Schema.decodeUnknownResult(decodeSchema)("a"), (e) => {
        assertTrue(e instanceof Error)
        strictEqual(e.message, "Result adapter can only return schema issues")
        assertTrue(Cause.hasDies(e.cause as Cause.Cause<never>))
      })
      throws(() => Schema.encodeUnknownResult(encodeSchema)("a"), (e) => {
        assertTrue(e instanceof Error)
        strictEqual(e.message, "Result adapter can only return schema issues")
        assertTrue(Cause.hasDies(e.cause as Cause.Cause<never>))
      })
    })
  })

  describe("decodeUnknownSync / encodeUnknownSync", () => {
    it("FiniteFromString", () => {
      const schema = Schema.FiniteFromString

      strictEqual(Schema.decodeUnknownSync(schema)("1"), 1)
      strictEqual(Schema.encodeUnknownSync(schema)(1), "1")

      throws(() => Schema.decodeUnknownSync(schema)(null), (e) => {
        assertTrue(Schema.isSchemaError(e))
        strictEqual(e.message, "Expected string")
      })

      throws(() => Schema.encodeUnknownSync(schema)(null), (e) => {
        assertTrue(Schema.isSchemaError(e))
        strictEqual(e.message, "Expected number")
      })

      throws(() => SchemaParser.decodeUnknownSync(schema)(null), (e) => {
        assertSchemaIssueError(e, "Expected string")
      })

      throws(() => SchemaParser.encodeUnknownSync(schema)(null), (e) => {
        assertSchemaIssueError(e, "Expected number")
      })
    })

    it("should throw an error when the cause contains both a schema issue and a defect", () => {
      const cause = Cause.combine(
        Cause.fail(new SchemaIssue.InvalidValue({ message: "schema issue" })),
        Cause.die(new Error("defect"))
      )
      const decodeSchema = Schema.String.pipe(Schema.decode({
        decode: SchemaGetter.transformOptionalEffect(() => Effect.failCause(cause)),
        encode: SchemaGetter.passthrough()
      }))
      const encodeSchema = Schema.String.pipe(Schema.encode({
        decode: SchemaGetter.passthrough(),
        encode: SchemaGetter.transformOptionalEffect(() => Effect.failCause(cause))
      }))

      throws(() => Schema.decodeUnknownSync(decodeSchema)("a"), (e) => {
        assertTrue(e instanceof Error)
        strictEqual(e.message, "Sync adapter can only throw schema errors")
        assertTrue(Cause.hasDies(e.cause as Cause.Cause<never>))
      })
      throws(() => Schema.encodeUnknownSync(encodeSchema)("a"), (e) => {
        assertTrue(e instanceof Error)
        strictEqual(e.message, "Sync adapter can only throw schema errors")
        assertTrue(Cause.hasDies(e.cause as Cause.Cause<never>))
      })
    })
  })

  describe("decodeUnknownResult", () => {
    it("should throw on async decoding", () => {
      const AsyncString = Schema.String.pipe(Schema.decode({
        decode: SchemaGetter.transformOptionalEffect((os: Option.Option<string>) =>
          Effect.gen(function*() {
            yield* Effect.sleep("10 millis")
            return os
          })
        ),
        encode: SchemaGetter.passthrough()
      }))
      const schema = AsyncString

      throws(() => SchemaParser.decodeUnknownResult(schema)("1"))
    })

    it("should throw on missing dependency", () => {
      class MagicNumber extends Context.Service<MagicNumber, number>()("MagicNumber") {}
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

      throws(() => SchemaParser.decodeUnknownResult(schema as any)(1))
    })
  })

  describe("decodeUnknownExit", () => {
    it("should die on async decoding", () => {
      const AsyncString = Schema.String.pipe(Schema.decode({
        decode: SchemaGetter.transformOptionalEffect((os: Option.Option<string>) =>
          Effect.gen(function*() {
            yield* Effect.sleep("10 millis")
            return os
          })
        ),
        encode: SchemaGetter.passthrough()
      }))
      const schema = AsyncString

      const exit = SchemaParser.decodeUnknownExit(schema)("1")
      assertTrue(Exit.hasDies(exit))
    })

    it("should die on missing dependency", () => {
      class MagicNumber extends Context.Service<MagicNumber, number>()("MagicNumber") {}
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
      const exit = SchemaParser.decodeUnknownExit(schema as any)(1)
      assertTrue(Exit.hasDies(exit))
    })
  })

  describe("decodeUnknownExit / encodeUnknownExit", () => {
    it("should preserve mixed schema issue and defect causes", () => {
      const cause = Cause.combine(
        Cause.fail(new SchemaIssue.InvalidValue({ message: "schema issue" })),
        Cause.die(new Error("defect"))
      )
      const decodeSchema = Schema.String.pipe(Schema.decode({
        decode: SchemaGetter.transformOptionalEffect(() => Effect.failCause(cause)),
        encode: SchemaGetter.passthrough()
      }))
      const encodeSchema = Schema.String.pipe(Schema.encode({
        decode: SchemaGetter.passthrough(),
        encode: SchemaGetter.transformOptionalEffect(() => Effect.failCause(cause))
      }))

      const decodeExit = Schema.decodeUnknownExit(decodeSchema)("a")
      assertTrue(Exit.isFailure(decodeExit))
      assertTrue(Exit.hasDies(decodeExit))
      const decodeError = Cause.findError(decodeExit.cause)
      assertTrue(Result.isSuccess(decodeError))
      assertTrue(Schema.isSchemaError(decodeError.success))

      const encodeExit = Schema.encodeUnknownExit(encodeSchema)("a")
      assertTrue(Exit.isFailure(encodeExit))
      assertTrue(Exit.hasDies(encodeExit))
      const encodeError = Cause.findError(encodeExit.cause)
      assertTrue(Result.isSuccess(encodeError))
      assertTrue(Schema.isSchemaError(encodeError.success))
    })
  })

  describe("annotateKey", () => {
    describe("the messageMissingKey annotation should be used as a error message", () => {
      it("Struct", async () => {
        const schema = Schema.Struct({
          a: Schema.String.pipe(Schema.annotateKey({ messageMissingKey: "this field is required" }))
        })
        const asserts = new TestSchema.Asserts(schema)

        const decoding = asserts.decoding()
        await decoding.fail(
          {},
          `this field is required
  at ["a"]`
        )
      })

      it("Tuple", async () => {
        const schema = Schema.Tuple([
          Schema.String.pipe(Schema.annotateKey({ messageMissingKey: "this element is required" }))
        ])
        const asserts = new TestSchema.Asserts(schema)

        const decoding = asserts.decoding()
        await decoding.fail(
          [],
          `this element is required
  at [0]`
        )
      })
    })
  })

  describe("annotateEncoded", () => {
    it("non-transforming schema", () => {
      const schema = Schema.String.pipe(
        Schema.annotateEncoded({ title: "encoded title" })
      )
      strictEqual(SchemaAST.toEncoded(schema.ast).annotations?.title, "encoded title")
    })

    it("transforming schema", () => {
      const schema = Schema.NumberFromString.pipe(
        Schema.annotateEncoded({ title: "encoded title" })
      )
      strictEqual(SchemaAST.toEncoded(schema.ast).annotations?.title, "encoded title")
    })
  })

  describe("Struct.mapFields", () => {
    it("evolve", () => {
      const schema = Schema.Struct({
        a: Schema.String,
        b: Schema.Number
      }).mapFields(Struct.evolve({ a: (v) => Schema.optionalKey(v) }))

      equals(schema.fields, {
        a: Schema.optionalKey(Schema.String),
        b: Schema.Number
      })
    })

    it("evolveKeys", () => {
      const schema = Schema.Struct({
        a: Schema.String,
        b: Schema.Number
      }).mapFields(Struct.evolveKeys({ a: (k) => Str.toUpperCase(k) }))

      equals(schema.fields, {
        A: Schema.String,
        b: Schema.Number
      })
    })

    it("renameKeys", () => {
      const schema = Schema.Struct({
        a: Schema.String,
        b: Schema.Number,
        c: Schema.Boolean
      }).mapFields(Struct.renameKeys({ a: "A", b: "B" }))

      equals(schema.fields, {
        A: Schema.String,
        B: Schema.Number,
        c: Schema.Boolean
      })
    })

    it("evolveEntries", () => {
      const schema = Schema.Struct({
        a: Schema.String,
        b: Schema.Number
      }).mapFields(Struct.evolveEntries({ a: (k, v) => [Str.toUpperCase(k), Schema.optionalKey(v)] }))

      equals(schema.fields, {
        A: Schema.optionalKey(Schema.String),
        b: Schema.Number
      })
    })

    it("optionalKey", () => {
      const schema = Schema.Struct({
        a: Schema.String,
        b: Schema.Number
      }).mapFields(Struct.map(Schema.optionalKey))

      equals(schema.fields, {
        a: Schema.optionalKey(Schema.String),
        b: Schema.optionalKey(Schema.Number)
      })
    })

    it("mapPick", () => {
      const schema = Schema.Struct({
        a: Schema.String,
        b: Schema.Number
      }).mapFields(Struct.mapPick(["a"], Schema.optionalKey))

      equals(schema.fields, {
        a: Schema.optionalKey(Schema.String),
        b: Schema.Number
      })
    })

    it("mapOmit", () => {
      const schema = Schema.Struct({
        a: Schema.String,
        b: Schema.Number
      }).mapFields(Struct.mapOmit(["b"], Schema.optionalKey))

      equals(schema.fields, {
        a: Schema.optionalKey(Schema.String),
        b: Schema.Number
      })
    })

    it("optional", () => {
      const schema = Schema.Struct({
        a: Schema.String,
        b: Schema.Number
      }).mapFields(Struct.map(Schema.optional))

      equals(schema.fields, {
        a: Schema.optional(Schema.String),
        b: Schema.optional(Schema.Number)
      })
    })

    it("mutableKey", () => {
      const schema = Schema.Struct({
        a: Schema.String,
        b: Schema.Number
      }).mapFields(Struct.map(Schema.mutableKey))

      equals(schema.fields, {
        a: Schema.mutableKey(Schema.String),
        b: Schema.mutableKey(Schema.Number)
      })
    })

    it("readonlyKey", () => {
      const schema = Schema.Struct({
        a: Schema.mutableKey(Schema.String),
        b: Schema.mutableKey(Schema.Number)
      }).mapFields(Struct.map(Schema.readonlyKey))

      equals(schema.fields, {
        a: Schema.String,
        b: Schema.Number
      })
    })

    it("mutable", () => {
      const schema = Schema.Struct({
        a: Schema.Array(Schema.String),
        b: Schema.Tuple([Schema.Number])
      }).mapFields(Struct.map(Schema.mutable))

      equals(schema.fields, {
        a: Schema.mutable(Schema.Array(Schema.String)),
        b: Schema.mutable(Schema.Tuple([Schema.Number]))
      })
    })

    it("NullOr", () => {
      const schema = Schema.Struct({
        a: Schema.String,
        b: Schema.Number
      }).mapFields(Struct.map(Schema.NullOr))

      equals(schema.fields, {
        a: Schema.NullOr(Schema.String),
        b: Schema.NullOr(Schema.Number)
      })
    })

    it("UndefinedOr", () => {
      const schema = Schema.Struct({
        a: Schema.String,
        b: Schema.Number
      }).mapFields(Struct.map(Schema.UndefinedOr))

      equals(schema.fields, {
        a: Schema.UndefinedOr(Schema.String),
        b: Schema.UndefinedOr(Schema.Number)
      })
    })

    it("NullishOr", () => {
      const schema = Schema.Struct({
        a: Schema.String,
        b: Schema.Number
      }).mapFields(Struct.map(Schema.NullishOr))

      equals(schema.fields, {
        a: Schema.NullishOr(Schema.String),
        b: Schema.NullishOr(Schema.Number)
      })
    })

    it("should work with flow", () => {
      const schema = Schema.Struct({
        a: Schema.String,
        b: Schema.FiniteFromString,
        c: Schema.Boolean
      }).mapFields(flow(
        Struct.map(Schema.NullOr),
        Struct.mapPick(["a", "c"], Schema.mutableKey)
      ))

      equals(schema.fields, {
        a: Schema.mutableKey(Schema.NullOr(Schema.String)),
        b: Schema.NullOr(Schema.FiniteFromString),
        c: Schema.mutableKey(Schema.NullOr(Schema.Boolean))
      })
    })
  })

  describe("Tuple.mapElements", () => {
    it("appendElement", () => {
      const schema = Schema.Tuple([Schema.String]).mapElements(Tuple.appendElement(Schema.Number))

      TestSchema.Asserts.ast.elements.equals(schema.elements, [Schema.String, Schema.Number])
    })

    it("appendElements", () => {
      const schema = Schema.Tuple([Schema.String]).mapElements(Tuple.appendElements([Schema.Number, Schema.Boolean]))

      TestSchema.Asserts.ast.elements.equals(schema.elements, [Schema.String, Schema.Number, Schema.Boolean])
    })

    it("pick", () => {
      const schema = Schema.Tuple([Schema.String, Schema.Number, Schema.Boolean]).mapElements(Tuple.pick([0, 2]))

      TestSchema.Asserts.ast.elements.equals(schema.elements, [Schema.String, Schema.Boolean])
    })

    it("omit", () => {
      const schema = Schema.Tuple([Schema.String, Schema.Number, Schema.Boolean]).mapElements(Tuple.omit([1]))

      TestSchema.Asserts.ast.elements.equals(schema.elements, [Schema.String, Schema.Boolean])
    })

    describe("evolve", () => {
      it("readonly [string] -> readonly [string?]", () => {
        const schema = Schema.Tuple([Schema.String]).mapElements(Tuple.evolve([(v) => Schema.optionalKey(v)]))

        TestSchema.Asserts.ast.elements.equals(schema.elements, [Schema.optionalKey(Schema.String)])
      })

      it("readonly [string, number] -> readonly [string, number?]", () => {
        const schema = Schema.Tuple([Schema.String, Schema.Number]).mapElements(
          Tuple.evolve([undefined, (v) => Schema.optionalKey(v)])
        )

        TestSchema.Asserts.ast.elements.equals(schema.elements, [Schema.String, Schema.optionalKey(Schema.Number)])
      })
    })

    describe("renameIndices", () => {
      it("partial index mapping", () => {
        const schema = Schema.Tuple([Schema.String, Schema.Number, Schema.Boolean]).mapElements(
          Tuple.renameIndices(["1", "0"])
        )
        TestSchema.Asserts.ast.elements.equals(schema.elements, [Schema.Number, Schema.String, Schema.Boolean])
      })

      it("full index mapping", () => {
        const schema = Schema.Tuple([Schema.String, Schema.Number, Schema.Boolean]).mapElements(
          Tuple.renameIndices(["2", "1", "0"])
        )
        TestSchema.Asserts.ast.elements.equals(schema.elements, [Schema.Boolean, Schema.Number, Schema.String])
      })
    })

    it("NullOr", () => {
      const schema = Schema.Tuple([Schema.String, Schema.Number]).mapElements(Tuple.map(Schema.NullOr))

      TestSchema.Asserts.ast.elements.equals(schema.elements, [
        Schema.NullOr(Schema.String),
        Schema.NullOr(Schema.Number)
      ])
    })
  })

  describe("Union options", () => {
    it("preserves Union options through public derivations", () => {
      const options: SchemaAST.UnionOptions = { mode: "oneOf" }
      const schema = Schema.Union([Schema.String, Schema.Number], options)

      strictEqual(schema.mapMembers(Tuple.appendElement(Schema.Boolean)).ast.options, options)
      const flipped = Schema.flip(schema).ast
      assertTrue(SchemaAST.isUnion(flipped))
      strictEqual(flipped.options, options)
    })
  })

  describe("Union.mapMembers", () => {
    it("appendElement", () => {
      const schema = Schema.Union([Schema.String, Schema.Number]).mapMembers(Tuple.appendElement(Schema.Boolean))

      TestSchema.Asserts.ast.elements.equals(schema.members, [Schema.String, Schema.Number, Schema.Boolean])
    })

    it("evolve", () => {
      const schema = Schema.Union([Schema.String, Schema.Number, Schema.Boolean]).mapMembers(
        Tuple.evolve([
          (v) => Schema.Array(v),
          undefined,
          (v) => Schema.Array(v)
        ])
      )

      TestSchema.Asserts.ast.elements.equals(schema.members, [
        Schema.Array(Schema.String),
        Schema.Number,
        Schema.Array(Schema.Boolean)
      ])
    })

    it("Array", () => {
      const schema = Schema.Union([Schema.String, Schema.Number]).mapMembers(Tuple.map(Schema.Array))

      TestSchema.Asserts.ast.elements.equals(schema.members, [
        Schema.Array(Schema.String),
        Schema.Array(Schema.Number)
      ])
    })
  })

  describe("Literals.mapMembers", () => {
    it("evolve", () => {
      const schema = Schema.Literals(["a", "b", "c"]).mapMembers(Tuple.evolve([
        (a) => Schema.Struct({ _tag: a, a: Schema.String }),
        (b) => Schema.Struct({ _tag: b, b: Schema.Number }),
        (c) => Schema.Struct({ _tag: c, c: Schema.Boolean })
      ]))

      TestSchema.Asserts.ast.elements.equals(schema.members, [
        Schema.Struct({ _tag: Schema.Literal("a"), a: Schema.String }),
        Schema.Struct({ _tag: Schema.Literal("b"), b: Schema.Number }),
        Schema.Struct({ _tag: Schema.Literal("c"), c: Schema.Boolean })
      ])
    })
  })

  describe("encodeKeys", () => {
    it("Struct", async () => {
      const schema = Schema.Struct({
        a: Schema.FiniteFromString,
        b: Schema.FiniteFromString
      }).pipe(Schema.encodeKeys({ a: "c" }))
      const asserts = new TestSchema.Asserts(schema)

      const decoding = asserts.decoding()
      await decoding.succeed({ c: "1", b: "2" }, { a: 1, b: 2 })

      const encoding = asserts.encoding()
      await encoding.succeed({ a: 1, b: 2 }, { c: "1", b: "2" })
    })

    it("Class", async () => {
      class A extends Schema.Class<A>("A")({
        a: Schema.FiniteFromString,
        b: Schema.String
      }) {}
      const schema = A.pipe(Schema.encodeKeys({ a: "c" }))
      const asserts = new TestSchema.Asserts(schema)

      const decoding = asserts.decoding()
      await decoding.succeed({ c: "1", b: "b" }, new A({ a: 1, b: "b" }))

      const encoding = asserts.encoding()
      await encoding.succeed(new A({ a: 1, b: "b" }), { c: "1", b: "b" })
    })

    it("supports symbol source keys", () => {
      const field = Symbol("field")
      const schema = Schema.Struct({
        [field]: Schema.String
      }).pipe(Schema.encodeKeys({ [field]: "field" }))

      deepStrictEqual(Schema.decodeUnknownSync(schema)({ field: "a" }), { [field]: "a" })
      deepStrictEqual(Schema.encodeSync(schema)({ [field]: "a" }), { field: "a" })
    })

    it("supports symbol destination keys", () => {
      const field = Symbol("field")
      const schema = Schema.Struct({
        field: Schema.String
      }).pipe(Schema.encodeKeys({ field }))

      deepStrictEqual(Schema.decodeUnknownSync(schema)({ [field]: "a" }), { field: "a" })
      deepStrictEqual(Schema.encodeSync(schema)({ field: "a" }), { [field]: "a" })
    })

    it("rejects duplicate destination keys", () => {
      throws(
        () =>
          Schema.Struct({
            a: Schema.String,
            b: Schema.String
          }).pipe(Schema.encodeKeys({ a: "c", b: "c" })),
        (e) => {
          assertInclude(String(e), "Duplicate encoded keys")
        }
      )
    })

    it("rejects destination keys that collide with unmapped fields", () => {
      throws(
        () =>
          Schema.Struct({
            a: Schema.String,
            b: Schema.String
          }).pipe(Schema.encodeKeys({ a: "b" })),
        (e) => {
          assertInclude(String(e), "Duplicate encoded keys")
        }
      )
    })

    it("rejects canonical number and string destination key collisions", () => {
      throws(
        () =>
          Schema.Struct({
            a: Schema.String,
            b: Schema.String
          }).pipe(Schema.encodeKeys({ a: 1, b: "1" })),
        (e) => {
          assertInclude(String(e), "Duplicate encoded keys")
        }
      )
    })
  })

  describe("Schema.makeFilter", () => {
    it("returns undefined", async () => {
      const schema = Schema.String.check(Schema.makeFilter(() => undefined))
      const asserts = new TestSchema.Asserts(schema)
      const decoding = asserts.decoding()
      await decoding.succeed("a")
    })

    it("returns true", async () => {
      const schema = Schema.String.check(Schema.makeFilter(() => true))
      const asserts = new TestSchema.Asserts(schema)
      const decoding = asserts.decoding()
      await decoding.succeed("a")
    })

    it("returns false", async () => {
      const schema = Schema.String.check(Schema.makeFilter(() => false))
      const asserts = new TestSchema.Asserts(schema)
      const decoding = asserts.decoding()
      await decoding.fail(
        "a",
        `Expected <filter>`
      )
    })

    it("returns string", async () => {
      const schema = Schema.String.check(Schema.makeFilter(() => "error message"))
      const asserts = new TestSchema.Asserts(schema)
      const decoding = asserts.decoding()
      await decoding.fail(
        "a",
        `error message`
      )
    })

    describe("returns issue", () => {
      it("abort: false", async () => {
        const schema = Schema.String.check(
          Schema.makeFilter(() => new SchemaIssue.InvalidValue({ message: "error message 1" }), {
            title: "filter title 1"
          }),
          Schema.makeFilter(() => false, { title: "filter title 2", message: "error message 2" })
        )
        const asserts = new TestSchema.Asserts(schema)

        const decoding = asserts.decoding({ parseOptions: { errors: "all" } })
        await decoding.fail(
          "a",
          `error message 1
error message 2`
        )
      })

      it("abort: true", async () => {
        const schema = Schema.String.check(
          Schema.makeFilter(() => new SchemaIssue.InvalidValue({ message: "error message 1" }), {
            title: "filter title 1"
          }, true),
          Schema.makeFilter(() => false, { title: "filter title 2", message: "error message 2" })
        )
        const asserts = new TestSchema.Asserts(schema)

        const decoding = asserts.decoding({ parseOptions: { errors: "all" } })
        await decoding.fail(
          "a",
          `error message 1`
        )
      })
    })

    describe("returns object", () => {
      it("abort: false", async () => {
        const schema = Schema.String.check(
          Schema.makeFilter(() => ({
            path: ["a"],
            issue: "error message 1"
          }), { title: "filter title 1" }),
          Schema.makeFilter(() => false, { title: "filter title 2", message: "error message 2" })
        )
        const asserts = new TestSchema.Asserts(schema)

        const decoding = asserts.decoding({ parseOptions: { errors: "all" } })
        await decoding.fail(
          "a",
          `error message 1
  at ["a"]
error message 2`
        )
      })

      it("abort: true", async () => {
        const schema = Schema.String.check(
          Schema.makeFilter(() => ({ path: ["a"], issue: "error message 1" }), { title: "error title 1" }, true),
          Schema.makeFilter(() => false, { title: "error title 2", message: "error message 2" })
        )
        const asserts = new TestSchema.Asserts(schema)

        const decoding = asserts.decoding({ parseOptions: { errors: "all" } })
        await decoding.fail(
          "a",
          `error message 1
  at ["a"]`
        )
      })

      it("issue: Issue", async () => {
        const schema = Schema.String.check(
          Schema.makeFilter(
            () => ({ path: ["a"], issue: new SchemaIssue.InvalidValue({ message: "custom issue" }) }),
            { title: "filter title" }
          )
        )
        const asserts = new TestSchema.Asserts(schema)

        const decoding = asserts.decoding()
        await decoding.fail(
          "a",
          `custom issue
  at ["a"]`
        )
      })
    })

    describe("returns array", () => {
      it("empty array is treated as success", async () => {
        const schema = Schema.String.check(Schema.makeFilter(() => []))
        const asserts = new TestSchema.Asserts(schema)
        const decoding = asserts.decoding()
        await decoding.succeed("a")
      })

      it("single-element array collapses to the element", async () => {
        const schema = Schema.String.check(
          Schema.makeFilter(() => [{ path: ["a"], issue: "error message 1" }], { title: "filter title" })
        )
        const asserts = new TestSchema.Asserts(schema)
        const decoding = asserts.decoding()
        await decoding.fail(
          "a",
          `error message 1
  at ["a"]`
        )
      })

      it("multi-element array groups into a Composite", async () => {
        const schema = Schema.String.check(
          Schema.makeFilter(() => [
            { path: ["a"], issue: "error message 1" },
            { path: ["b"], issue: "error message 2" }
          ], { title: "filter title" })
        )
        const asserts = new TestSchema.Asserts(schema)
        const decoding = asserts.decoding({ parseOptions: { errors: "all" } })
        await decoding.fail(
          "a",
          `error message 1
  at ["a"]
error message 2
  at ["b"]`
        )
      })

      it("array mixing string, Issue, and { path, issue }", async () => {
        const schema = Schema.String.check(
          Schema.makeFilter(() => [
            "top-level message",
            new SchemaIssue.InvalidValue({ message: "direct issue" }),
            { path: ["a"], issue: "pointed message" }
          ], { title: "filter title" })
        )
        const asserts = new TestSchema.Asserts(schema)
        const decoding = asserts.decoding({ parseOptions: { errors: "all" } })
        await decoding.fail(
          "a",
          `top-level message
direct issue
pointed message
  at ["a"]`
        )
      })
    })
  })

  describe("extendTo", () => {
    it("Struct", async () => {
      const schema = Schema.Struct({
        a: Schema.String,
        b: Schema.Number
      }).pipe(Schema.extendTo({
        c: Schema.String
      }, {
        c: (value) => Option.some(value.a + "c" + value.b)
      }))
      const asserts = new TestSchema.Asserts(schema)

      const decoding = asserts.decoding()
      await decoding.succeed({ a: "1", b: 2 }, { a: "1", b: 2, c: "1c2" })

      const encoding = asserts.encoding()
      await encoding.succeed({ a: "1", b: 2, c: "1c2" }, { a: "1", b: 2 })
    })

    it("Union", async () => {
      const Circle = Schema.Struct({
        radius: Schema.Number
      })

      const Square = Schema.Struct({
        sideLength: Schema.Number
      })

      const DiscriminatedShape = Schema.Union([
        Circle.pipe(Schema.extendTo({ kind: Schema.tag("circle") }, { kind: () => Option.some("circle" as const) })),
        Square.pipe(Schema.extendTo({ kind: Schema.tag("square") }, { kind: () => Option.some("square" as const) }))
      ])
      const asserts = new TestSchema.Asserts(DiscriminatedShape)

      const decoding = asserts.decoding()
      await decoding.succeed({ radius: 1 }, { radius: 1, kind: "circle" })
      await decoding.succeed({ sideLength: 1 }, {
        sideLength: 1,
        kind: "square"
      })

      const encoding = asserts.encoding()
      await encoding.succeed({ radius: 1, kind: "circle" }, { radius: 1 })
      await encoding.succeed({ sideLength: 1, kind: "square" }, {
        sideLength: 1
      })
    })
  })

  describe("Tagged unions", () => {
    describe("toTaggedUnion", () => {
      it("should augment a union of structs", () => {
        const b = Symbol.for("B")
        const schema = Schema.Union([
          Schema.Struct({ _tag: Schema.Literal("A"), a: Schema.String }),
          Schema.Struct({ _tag: Schema.UniqueSymbol(b), b: Schema.FiniteFromString }),
          Schema.Union([
            Schema.Struct({ _tag: Schema.Literal(1), c: Schema.Boolean }),
            Schema.Struct({ _tag: Schema.Literal("D"), d: Schema.Date })
          ])
        ]).pipe(Schema.toTaggedUnion("_tag"))

        deepStrictEqual(schema.discriminants, ["A", b, 1, "D"])

        // cases
        deepStrictEqual(schema.cases.A, schema.members[0])
        deepStrictEqual(schema.cases[b], schema.members[1])
        deepStrictEqual(schema.cases[1], schema.members[2].members[0])
        deepStrictEqual(schema.cases["1"], schema.members[2].members[0])
        deepStrictEqual(schema.cases.D, schema.members[2].members[1])

        // isAnyOf
        const isAOr1 = schema.isAnyOf(["A", 1])
        assertTrue(isAOr1({ _tag: "A", a: "a" }))
        assertTrue(isAOr1({ _tag: 1, c: true }))
        assertFalse(isAOr1({ _tag: "D", d: new Date() }))
        assertFalse(isAOr1({ _tag: b, b: 1 }))

        // guards
        assertTrue(schema.guards.A({ _tag: "A", a: "a" }))
        assertFalse(schema.guards.A({ _tag: "A", a: 1 }))

        assertTrue(schema.guards[b]({ _tag: b, b: 1 }))
        assertFalse(schema.guards[b]({ _tag: b, b: "b" }))

        assertTrue(schema.guards[1]({ _tag: 1, c: true }))
        assertFalse(schema.guards[1]({ _tag: 1, c: 1 }))

        assertTrue(schema.guards.D({ _tag: "D", d: new Date() }))
        assertFalse(schema.guards.D({ _tag: "D", d: "d" }))

        // match
        deepStrictEqual(
          schema.match({ _tag: "A", a: "a" }, { A: () => "A", [b]: () => "B", 1: () => "C", D: () => "D" }),
          "A"
        )
        deepStrictEqual(
          pipe({ _tag: "A", a: "a" }, schema.match({ A: () => "A", [b]: () => "B", 1: () => "C", D: () => "D" })),
          "A"
        )
        deepStrictEqual(
          schema.match({ _tag: b, b: 1 }, { A: () => "A", [b]: () => "B", 1: () => "C", D: () => "D" }),
          "B"
        )
        deepStrictEqual(
          pipe({ _tag: b, b: 1 }, schema.match({ A: () => "A", [b]: () => "B", 1: () => "C", D: () => "D" })),
          "B"
        )
        deepStrictEqual(
          schema.match({ _tag: 1, c: true }, { A: () => "A", [b]: () => "B", 1: () => "C", D: () => "D" }),
          "C"
        )
        deepStrictEqual(
          pipe({ _tag: 1, c: true }, schema.match({ A: () => "A", [b]: () => "B", 1: () => "C", D: () => "D" })),
          "C"
        )
        deepStrictEqual(
          schema.match({ _tag: "D", d: new Date() }, { A: () => "A", [b]: () => "B", 1: () => "C", D: () => "D" }),
          "D"
        )
        deepStrictEqual(
          pipe(
            { _tag: "D", d: new Date() },
            schema.match({ A: () => "A", [b]: () => "B", 1: () => "C", D: () => "D" })
          ),
          "D"
        )

        // matchOrElse
        deepStrictEqual(
          schema.matchOrElse({ _tag: "A", a: "a" }, { A: () => "A" }, () => "fallback"),
          "A"
        )
        deepStrictEqual(
          schema.matchOrElse({ _tag: b, b: 1 }, { A: () => "A" }, (value) => value._tag),
          b
        )
        deepStrictEqual(
          pipe({ _tag: b, b: 1 }, schema.matchOrElse({ A: () => "A" }, (value) => value._tag)),
          b
        )
        const undefinedCases = { A: undefined } as unknown as { A?: () => string }
        deepStrictEqual(
          schema.matchOrElse({ _tag: "A", a: "a" }, undefinedCases, () => "fallback"),
          "fallback"
        )
      })

      it("should support multiple tags", () => {
        const schema = Schema.Union([
          Schema.Struct({ _tag: Schema.tag("A"), type: Schema.tag("TypeA"), a: Schema.String }),
          Schema.Struct({ _tag: Schema.tag("B"), type: Schema.tag("TypeB"), b: Schema.FiniteFromString })
        ]).pipe(Schema.toTaggedUnion("type"))

        // cases
        deepStrictEqual(schema.cases.TypeA, schema.members[0])
        deepStrictEqual(schema.cases.TypeB, schema.members[1])
      })

      it("should throw on duplicate discriminants", () => {
        throws(
          () =>
            Schema.Union([
              Schema.Struct({ event: Schema.Literal("A"), a: Schema.String }),
              Schema.Union([
                Schema.Struct({ event: Schema.Literal("B"), b: Schema.String }),
                Schema.Struct({ event: Schema.Literal("A"), c: Schema.String })
              ])
            ]).pipe(Schema.toTaggedUnion("event")),
          "Duplicate discriminant: A"
        )
        throws(
          () =>
            Schema.Union([
              Schema.Struct({ event: Schema.Literal(1) }),
              Schema.Struct({ event: Schema.Literal("1") })
            ]).pipe(Schema.toTaggedUnion("event")),
          "Duplicate discriminant: 1"
        )
      })

      it("should collect no discriminants from an empty union", () => {
        const schema = Schema.Union([]).pipe(Schema.toTaggedUnion("event"))

        deepStrictEqual(schema.discriminants, [])
      })

      it("should support __proto__ as a discriminant", () => {
        const member = Schema.Struct({ event: Schema.Literal("__proto__"), value: Schema.String })
        const schema = Schema.Union([member]).pipe(Schema.toTaggedUnion("event"))

        assertTrue(Object.hasOwn(schema.cases, "__proto__"))
        strictEqual(schema.cases["__proto__"], member)
        assertTrue(Object.hasOwn(schema.guards, "__proto__"))
        assertTrue(schema.guards["__proto__"]({ event: "__proto__", value: "a" }))
      })

      it("should augment a union of classes", () => {
        class A extends Schema.Class<A>("A")({
          _tag: Schema.tag("A"),
          a: Schema.String
        }) {}
        class B extends Schema.Class<B>("B")({
          _tag: Schema.tag("B"),
          b: Schema.FiniteFromString
        }) {}

        const schema = Schema.Union([A, B]).pipe(Schema.toTaggedUnion("_tag"))

        // cases
        deepStrictEqual(schema.cases.A, A)
        deepStrictEqual(schema.cases.B, B)
      })
    })

    describe("TaggedUnion", () => {
      it("should create a tagged union", () => {
        const schema = Schema.TaggedUnion({
          A: { a: Schema.String },
          C: { c: Schema.Boolean },
          B: { b: Schema.FiniteFromString }
        }).annotate({})

        const { A, B, C } = schema.cases

        // cases
        strictEqual(A.fields._tag.ast.literal, "A")
        strictEqual(A.fields.a, Schema.String)
        strictEqual(B.fields._tag.ast.literal, "B")
        strictEqual(B.fields.b, Schema.FiniteFromString)
        strictEqual(C.fields._tag.ast.literal, "C")
        strictEqual(C.fields.c, Schema.Boolean)

        // isAnyOf
        const isAOrB = schema.isAnyOf(["A", "B"])
        assertTrue(isAOrB({ _tag: "A", a: "a" }))
        assertTrue(isAOrB({ _tag: "B", b: 1 }))
        assertFalse(isAOrB({ _tag: "C", c: true }))

        // guards
        assertTrue(schema.guards.A({ _tag: "A", a: "a" }))
        assertTrue(schema.guards.B({ _tag: "B", b: 1 }))
        assertTrue(schema.guards.C({ _tag: "C", c: true }))
        assertFalse(schema.guards.A({ _tag: "A", b: 1 }))
        assertFalse(schema.guards.B({ _tag: "B", a: "a" }))
        assertFalse(schema.guards.C({ _tag: "C", c: 1 }))

        // match
        deepStrictEqual(
          schema.match({ _tag: "A", a: "a" }, { A: () => "A", B: () => "B", C: () => "C" }),
          "A"
        )
        deepStrictEqual(
          pipe({ _tag: "A", a: "a" }, schema.match({ A: () => "A", B: () => "B", C: () => "C" })),
          "A"
        )
        deepStrictEqual(
          schema.match({ _tag: "B", b: 1 }, { A: () => "A", B: () => "B", C: () => "C" }),
          "B"
        )
        deepStrictEqual(
          pipe({ _tag: "B", b: 1 }, schema.match({ A: () => "A", B: () => "B", C: () => "C" })),
          "B"
        )
        deepStrictEqual(
          schema.match({ _tag: "C", c: true }, { A: () => "A", B: () => "B", C: () => "C" }),
          "C"
        )
        deepStrictEqual(
          pipe({ _tag: "C", c: true }, schema.match({ A: () => "A", B: () => "B", C: () => "C" })),
          "C"
        )

        // matchOrElse
        deepStrictEqual(
          schema.matchOrElse({ _tag: "A", a: "a" }, { A: (value) => value.a }, () => "fallback"),
          "a"
        )
        deepStrictEqual(
          schema.matchOrElse({ _tag: "B", b: 1 }, { A: () => "A" }, (value) => value._tag),
          "B"
        )
        deepStrictEqual(
          pipe({ _tag: "B", b: 1 }, schema.matchOrElse({ A: () => "A" }, (value) => value._tag)),
          "B"
        )
      })
    })
  })

  describe("withDecodingDefaultKey", () => {
    it("should return a decoding default value if the key is missing", async () => {
      const schema = Schema.Struct({
        a: Schema.FiniteFromString.pipe(Schema.withDecodingDefaultKey(Effect.succeed("1")))
      })
      const asserts = new TestSchema.Asserts(schema)

      const decoding = asserts.decoding()
      await decoding.succeed({}, { a: 1 })
      await decoding.succeed({ a: "2" }, { a: 2 })
      await decoding.fail(
        { a: undefined },
        `Expected string
  at ["a"]`
      )
    })

    it("by default should pass through the value", async () => {
      const schema = Schema.Struct({
        a: Schema.FiniteFromString.pipe(Schema.withDecodingDefaultKey(Effect.succeed("1")))
      })
      const asserts = new TestSchema.Asserts(schema)

      const encoding = asserts.encoding()
      await encoding.succeed({ a: 1 }, { a: "1" })
    })

    it("should omit the value if the encoding strategy is set to omit", async () => {
      const schema = Schema.Struct({
        a: Schema.FiniteFromString.pipe(
          Schema.withDecodingDefaultKey(Effect.succeed("1"), { encodingStrategy: "omit" })
        )
      })
      const asserts = new TestSchema.Asserts(schema)

      const encoding = asserts.encoding()
      await encoding.succeed({ a: 1 }, {})
    })

    it("nested default values", async () => {
      const schema = Schema.Struct({
        a: Schema.Struct({
          b: Schema.FiniteFromString.pipe(Schema.withDecodingDefaultKey(Effect.succeed("1")))
        }).pipe(Schema.withDecodingDefaultKey(Effect.succeed({})))
      })
      const asserts = new TestSchema.Asserts(schema)

      const decoding = asserts.decoding()
      await decoding.succeed({}, { a: { b: 1 } })
      await decoding.succeed({ a: {} }, { a: { b: 1 } })
      await decoding.succeed({ a: { b: "2" } }, { a: { b: 2 } })
      await decoding.fail(
        { a: { b: undefined } },
        `Expected string
  at ["a"]["b"]`
      )
    })

    it("Effect failing with SchemaError propagates as decode failure", async () => {
      const schema = Schema.Struct({
        a: Schema.FiniteFromString.pipe(Schema.withDecodingDefaultKey(
          Effect.fail(
            new Schema.SchemaError(new SchemaIssue.InvalidValue({ message: "decoding default failed" }))
          )
        ))
      })
      const asserts = new TestSchema.Asserts(schema)

      const decoding = asserts.decoding()
      await decoding.succeed({ a: "2" }, { a: 2 })
      await decoding.fail(
        {},
        `decoding default failed
  at ["a"]`
      )
    })

    it("Effect failing with SchemaError and a defect preserves the mixed cause", () => {
      const cause = Cause.combine(
        Cause.fail(
          new Schema.SchemaError(new SchemaIssue.InvalidValue({ message: "decoding default failed" }))
        ),
        Cause.die(new Error("defect"))
      )
      const schema = Schema.Struct({
        a: Schema.FiniteFromString.pipe(Schema.withDecodingDefaultKey(Effect.failCause(cause)))
      })

      const exit = Schema.decodeUnknownExit(schema)({})
      assertTrue(Exit.isFailure(exit))
      assertTrue(Exit.hasDies(exit))
      const error = Cause.findError(exit.cause)
      assertTrue(Result.isSuccess(error))
      assertTrue(Schema.isSchemaError(error.success))
      strictEqual(
        error.success.message,
        `decoding default failed
  at ["a"]`
      )
    })

    it("default Effect can require a service", async () => {
      class Service extends Context.Service<Service, { fallback: Effect.Effect<string> }>()("Service") {}

      const schema = Schema.Struct({
        a: Schema.FiniteFromString.pipe(Schema.withDecodingDefaultKey(
          Effect.gen(function*() {
            const service = yield* Service
            return yield* service.fallback
          })
        ))
      })
      const asserts = new TestSchema.Asserts(schema)

      const decoding = asserts.decoding().provide(Service, { fallback: Effect.succeed("3") })
      await decoding.succeed({ a: "2" }, { a: 2 })
      await decoding.succeed({}, { a: 3 })
    })
  })

  describe("withDecodingDefault", () => {
    it("should return a decoding default value if the key is missing", async () => {
      const schema = Schema.Struct({
        a: Schema.FiniteFromString.pipe(Schema.withDecodingDefault(Effect.succeed("1")))
      })
      const asserts = new TestSchema.Asserts(schema)

      const decoding = asserts.decoding()
      await decoding.succeed({}, { a: 1 })
      await decoding.succeed({ a: undefined }, { a: 1 })
      await decoding.succeed({ a: "2" }, { a: 2 })
    })

    it("should return a decoding default value if the schema is used as standalone and the input is undefined", async () => {
      const schema = Schema.String.pipe(Schema.withDecodingDefault(Effect.succeed("a")))
      const asserts = new TestSchema.Asserts(schema)

      const decoding = asserts.decoding()
      await decoding.succeed(undefined, "a")
      await decoding.succeed("b", "b")
    })

    it("by default should pass through the value", async () => {
      const schema = Schema.Struct({
        a: Schema.FiniteFromString.pipe(Schema.withDecodingDefault(Effect.succeed("1")))
      })
      const asserts = new TestSchema.Asserts(schema)

      const encoding = asserts.encoding()
      await encoding.succeed({ a: 1 }, { a: "1" })
    })

    it("should omit the value if the encoding strategy is set to omit", async () => {
      const schema = Schema.Struct({
        a: Schema.FiniteFromString.pipe(Schema.withDecodingDefault(Effect.succeed("1"), { encodingStrategy: "omit" }))
      })
      const asserts = new TestSchema.Asserts(schema)

      const encoding = asserts.encoding()
      await encoding.succeed({ a: 1 }, {})
    })

    it("nested default values", async () => {
      const schema = Schema.Struct({
        a: Schema.Struct({
          b: Schema.FiniteFromString.pipe(Schema.withDecodingDefault(Effect.succeed("1")))
        }).pipe(Schema.withDecodingDefault(Effect.succeed({})))
      })
      const asserts = new TestSchema.Asserts(schema)

      const decoding = asserts.decoding()
      await decoding.succeed({}, { a: { b: 1 } })
      await decoding.succeed({ a: {} }, { a: { b: 1 } })
      await decoding.succeed({ a: undefined }, { a: { b: 1 } })
      await decoding.succeed({ a: { b: undefined } }, { a: { b: 1 } })
      await decoding.succeed({ a: { b: "2" } }, { a: { b: 2 } })
    })

    it("Effect failing with SchemaError and a defect preserves the mixed cause", () => {
      const cause = Cause.combine(
        Cause.fail(
          new Schema.SchemaError(new SchemaIssue.InvalidValue({ message: "decoding default failed" }))
        ),
        Cause.die(new Error("defect"))
      )
      const schema = Schema.Struct({
        a: Schema.FiniteFromString.pipe(Schema.withDecodingDefault(Effect.failCause(cause)))
      })

      const exit = Schema.decodeUnknownExit(schema)({})
      assertTrue(Exit.isFailure(exit))
      assertTrue(Exit.hasDies(exit))
      const error = Cause.findError(exit.cause)
      assertTrue(Result.isSuccess(error))
      assertTrue(Schema.isSchemaError(error.success))
      strictEqual(
        error.success.message,
        `decoding default failed
  at ["a"]`
      )
    })

    it("default Effect can require a service", async () => {
      class Service extends Context.Service<Service, { fallback: Effect.Effect<string> }>()("Service") {}

      const schema = Schema.Struct({
        a: Schema.FiniteFromString.pipe(Schema.withDecodingDefault(
          Effect.gen(function*() {
            const service = yield* Service
            return yield* service.fallback
          })
        ))
      })
      const asserts = new TestSchema.Asserts(schema)

      const decoding = asserts.decoding().provide(Service, { fallback: Effect.succeed("3") })
      await decoding.succeed({ a: "2" }, { a: 2 })
      await decoding.succeed({}, { a: 3 })
      await decoding.succeed({ a: undefined }, { a: 3 })
    })
  })

  describe("withDecodingDefaultTypeKey", () => {
    it("should return a decoding default value if the key is missing", async () => {
      const schema = Schema.Struct({
        a: Schema.FiniteFromString.pipe(Schema.withDecodingDefaultTypeKey(Effect.succeed(1)))
      })
      const asserts = new TestSchema.Asserts(schema)

      const decoding = asserts.decoding()
      await decoding.succeed({}, { a: 1 })
      await decoding.succeed({ a: "2" }, { a: 2 })
      await decoding.fail(
        { a: undefined },
        `Expected string
  at ["a"]`
      )
    })

    it("by default should pass through the value", async () => {
      const schema = Schema.Struct({
        a: Schema.FiniteFromString.pipe(Schema.withDecodingDefaultTypeKey(Effect.succeed(1)))
      })
      const asserts = new TestSchema.Asserts(schema)

      const encoding = asserts.encoding()
      await encoding.succeed({ a: 1 }, { a: "1" })
    })

    it("should omit the value if the encoding strategy is set to omit", async () => {
      const schema = Schema.Struct({
        a: Schema.FiniteFromString.pipe(
          Schema.withDecodingDefaultTypeKey(Effect.succeed(1), { encodingStrategy: "omit" })
        )
      })
      const asserts = new TestSchema.Asserts(schema)

      const encoding = asserts.encoding()
      await encoding.succeed({ a: 1 }, {})
    })

    it("nested default values", async () => {
      const schema = Schema.Struct({
        a: Schema.Struct({
          b: Schema.FiniteFromString.pipe(Schema.withDecodingDefaultTypeKey(Effect.succeed(1)))
        }).pipe(Schema.withDecodingDefaultTypeKey(Effect.succeed({ b: 1 })))
      })
      const asserts = new TestSchema.Asserts(schema)

      const decoding = asserts.decoding()
      await decoding.succeed({}, { a: { b: 1 } })
      await decoding.succeed({ a: {} }, { a: { b: 1 } })
      await decoding.succeed({ a: { b: "2" } }, { a: { b: 2 } })
      await decoding.fail(
        { a: { b: undefined } },
        `Expected string
  at ["a"]["b"]`
      )
    })

    it("Effect failing with SchemaError propagates as decode failure", async () => {
      const schema = Schema.Struct({
        a: Schema.FiniteFromString.pipe(Schema.withDecodingDefaultTypeKey(
          Effect.fail(
            new Schema.SchemaError(new SchemaIssue.InvalidValue({ message: "decoding default failed" }))
          )
        ))
      })
      const asserts = new TestSchema.Asserts(schema)

      const decoding = asserts.decoding()
      await decoding.succeed({ a: "2" }, { a: 2 })
      await decoding.fail(
        {},
        `decoding default failed
  at ["a"]`
      )
    })

    it("default Effect can require a service", async () => {
      class Service extends Context.Service<Service, { fallback: Effect.Effect<number> }>()("Service") {}

      const schema = Schema.Struct({
        a: Schema.FiniteFromString.pipe(Schema.withDecodingDefaultTypeKey(
          Effect.gen(function*() {
            const service = yield* Service
            return yield* service.fallback
          })
        ))
      })
      const asserts = new TestSchema.Asserts(schema)

      const decoding = asserts.decoding().provide(Service, { fallback: Effect.succeed(3) })
      await decoding.succeed({ a: "2" }, { a: 2 })
      await decoding.succeed({}, { a: 3 })
    })
  })

  describe("withDecodingDefaultType", () => {
    it("should return a decoding default value if the key is missing", async () => {
      const schema = Schema.Struct({
        a: Schema.FiniteFromString.pipe(Schema.withDecodingDefaultType(Effect.succeed(1)))
      })
      const asserts = new TestSchema.Asserts(schema)

      const decoding = asserts.decoding()
      await decoding.succeed({}, { a: 1 })
      await decoding.succeed({ a: undefined }, { a: 1 })
      await decoding.succeed({ a: "2" }, { a: 2 })
    })

    it("should return a decoding default value if the schema is used as standalone and the input is undefined", async () => {
      const schema = Schema.String.pipe(Schema.withDecodingDefaultType(Effect.succeed("a")))
      const asserts = new TestSchema.Asserts(schema)

      const decoding = asserts.decoding()
      await decoding.succeed(undefined, "a")
      await decoding.succeed("b", "b")
    })

    it("by default should pass through the value", async () => {
      const schema = Schema.Struct({
        a: Schema.FiniteFromString.pipe(Schema.withDecodingDefaultType(Effect.succeed(1)))
      })
      const asserts = new TestSchema.Asserts(schema)

      const encoding = asserts.encoding()
      await encoding.succeed({ a: 1 }, { a: "1" })
    })

    it("should omit the value if the encoding strategy is set to omit", async () => {
      const schema = Schema.Struct({
        a: Schema.FiniteFromString.pipe(
          Schema.withDecodingDefaultType(Effect.succeed(1), { encodingStrategy: "omit" })
        )
      })
      const asserts = new TestSchema.Asserts(schema)

      const encoding = asserts.encoding()
      await encoding.succeed({ a: 1 }, {})
    })

    it("nested default values", async () => {
      const schema = Schema.Struct({
        a: Schema.Struct({
          b: Schema.FiniteFromString.pipe(Schema.withDecodingDefaultType(Effect.succeed(1)))
        }).pipe(Schema.withDecodingDefaultType(Effect.succeed({ b: 1 })))
      })
      const asserts = new TestSchema.Asserts(schema)

      const decoding = asserts.decoding()
      await decoding.succeed({}, { a: { b: 1 } })
      await decoding.succeed({ a: {} }, { a: { b: 1 } })
      await decoding.succeed({ a: undefined }, { a: { b: 1 } })
      await decoding.succeed({ a: { b: undefined } }, { a: { b: 1 } })
      await decoding.succeed({ a: { b: "2" } }, { a: { b: 2 } })
    })

    it("Effect failing with SchemaError propagates as decode failure", async () => {
      const schema = Schema.Struct({
        a: Schema.FiniteFromString.pipe(Schema.withDecodingDefaultType(
          Effect.fail(
            new Schema.SchemaError(new SchemaIssue.InvalidValue({ message: "decoding default failed" }))
          )
        ))
      })
      const asserts = new TestSchema.Asserts(schema)

      const decoding = asserts.decoding()
      await decoding.succeed({ a: "2" }, { a: 2 })
      await decoding.fail(
        {},
        `decoding default failed
  at ["a"]`
      )
    })

    it("default Effect can require a service", async () => {
      class Service extends Context.Service<Service, { fallback: Effect.Effect<number> }>()("Service") {}

      const schema = Schema.Struct({
        a: Schema.FiniteFromString.pipe(Schema.withDecodingDefaultType(
          Effect.gen(function*() {
            const service = yield* Service
            return yield* service.fallback
          })
        ))
      })
      const asserts = new TestSchema.Asserts(schema)

      const decoding = asserts.decoding().provide(Service, { fallback: Effect.succeed(3) })
      await decoding.succeed({ a: "2" }, { a: 2 })
      await decoding.succeed({}, { a: 3 })
      await decoding.succeed({ a: undefined }, { a: 3 })
    })
  })

  it("NonEmptyString", async () => {
    const schema = Schema.NonEmptyString
    const asserts = new TestSchema.Asserts(schema)

    const decoding = asserts.decoding()
    await decoding.succeed("a")
    await decoding.fail(
      "",
      `Expected a value with a length of at least 1`
    )

    const encoding = asserts.encoding()
    await encoding.succeed("a")
    await encoding.fail(
      "",
      `Expected a value with a length of at least 1`
    )
  })

  it("Char", async () => {
    const schema = Schema.Char
    const asserts = new TestSchema.Asserts(schema)

    if (verifyGeneration) {
      asserts.arbitrary().verifyGeneration()
    }

    const decoding = asserts.decoding()
    await decoding.succeed("a")
    await decoding.fail(
      "ab",
      `Expected a value with a length of 1`
    )

    const encoding = asserts.encoding()
    await encoding.succeed("a")
    await encoding.fail(
      "ab",
      `Expected a value with a length of 1`
    )
  })

  it("Int", async () => {
    const schema = Schema.Int
    const asserts = new TestSchema.Asserts(schema)

    if (verifyGeneration) {
      asserts.arbitrary().verifyGeneration()
    }

    const decoding = asserts.decoding()
    await decoding.succeed(1)
    await decoding.fail(
      1.1,
      `Expected an integer`
    )
    await decoding.fail(
      NaN,
      `Expected an integer`
    )
    await decoding.fail(
      Infinity,
      `Expected an integer`
    )
    await decoding.fail(
      -Infinity,
      `Expected an integer`
    )

    const encoding = asserts.encoding()
    await encoding.succeed(1)
    await encoding.fail(
      1.1,
      `Expected an integer`
    )
  })

  it("Natural", async () => {
    const schema = Schema.Natural
    const asserts = new TestSchema.Asserts(schema)

    if (verifyGeneration) {
      asserts.arbitrary().verifyGeneration()
    }

    const decoding = asserts.decoding()
    await decoding.succeed(0)
    await decoding.succeed(1)
    await decoding.fail(
      -1,
      `Expected a value greater than or equal to 0`
    )
    await decoding.fail(
      1.1,
      `Expected an integer`
    )

    const encoding = asserts.encoding()
    await encoding.succeed(0)
    await encoding.fail(
      -1,
      `Expected a value greater than or equal to 0`
    )
  })

  it("Capitalize", async () => {
    const schema = Schema.String.pipe(
      Schema.decodeTo(
        Schema.String.check(Schema.isCapitalized()),
        SchemaTransformation.capitalize()
      )
    )
    const asserts = new TestSchema.Asserts(schema)

    if (verifyGeneration) {
      asserts.arbitrary().verifyGeneration()
    }

    const decoding = asserts.decoding()
    await decoding.succeed("abc", "Abc")

    const encoding = asserts.encoding()
    await encoding.succeed("Abc")
    await encoding.fail(
      "abc",
      `Expected a string with the first character in uppercase`
    )
  })

  it("Uncapitalize", async () => {
    const schema = Schema.String.pipe(
      Schema.decodeTo(
        Schema.String.check(Schema.isUncapitalized()),
        SchemaTransformation.uncapitalize()
      )
    )
    const asserts = new TestSchema.Asserts(schema)

    if (verifyGeneration) {
      asserts.arbitrary().verifyGeneration()
    }

    const decoding = asserts.decoding()
    await decoding.succeed("Abc", "abc")

    const encoding = asserts.encoding()
    await encoding.succeed("abc")
    await encoding.fail(
      "Abc",
      `Expected a string with the first character in lowercase`
    )
  })

  it("Lowercase", async () => {
    const schema = Schema.String.pipe(
      Schema.decodeTo(
        Schema.String.check(Schema.isLowercased()),
        SchemaTransformation.toLowerCase()
      )
    )
    const asserts = new TestSchema.Asserts(schema)

    if (verifyGeneration) {
      asserts.arbitrary().verifyGeneration()
    }

    const decoding = asserts.decoding()
    await decoding.succeed("ABC", "abc")

    const encoding = asserts.encoding()
    await encoding.succeed("abc")
    await encoding.fail(
      "ABC",
      `Expected a string with all characters in lowercase`
    )
  })

  it("Uppercase", async () => {
    const schema = Schema.String.pipe(
      Schema.decodeTo(
        Schema.String.check(Schema.isUppercased()),
        SchemaTransformation.toUpperCase()
      )
    )
    const asserts = new TestSchema.Asserts(schema)

    if (verifyGeneration) {
      asserts.arbitrary().verifyGeneration()
    }

    const decoding = asserts.decoding()
    await decoding.succeed("abc", "ABC")

    const encoding = asserts.encoding()
    await encoding.succeed("ABC")
    await encoding.fail(
      "abc",
      `Expected a string with all characters in uppercase`
    )
  })
})

describe("Getter", () => {
  it("succeed", async () => {
    const schema = Schema.Literal(0).pipe(Schema.decodeTo(Schema.Literal("a"), {
      decode: SchemaGetter.succeed("a"),
      encode: SchemaGetter.succeed(0)
    }))
    const asserts = new TestSchema.Asserts(schema)

    const decoding = asserts.decoding()
    await decoding.succeed(0, "a")
    await decoding.fail(1, `Expected 0`)

    const encoding = asserts.encoding()
    await encoding.succeed("a", 0)
    await encoding.fail("b", `Expected "a"`)
  })
})

describe("Check", () => {
  it("isStringFinite", async () => {
    const schema = Schema.String.check(Schema.isStringFinite())

    deepStrictEqual(Schema.resolveAnnotations(schema)?.representation, {
      id: "effect/schema/isStringFinite",
      payload: null
    })
  })

  it("isStringBigInt", async () => {
    const schema = Schema.String.check(Schema.isStringBigInt())

    deepStrictEqual(Schema.resolveAnnotations(schema)?.representation, {
      id: "effect/schema/isStringBigInt",
      payload: null
    })
  })

  it("isStringSymbol", async () => {
    const schema = Schema.String.check(Schema.isStringSymbol())

    deepStrictEqual(Schema.resolveAnnotations(schema)?.representation, {
      id: "effect/schema/isStringSymbol",
      payload: null
    })
  })

  it("isUUID", async () => {
    const schema = Schema.String.check(Schema.isUUID())
    const asserts = new TestSchema.Asserts(schema)

    if (verifyGeneration) {
      asserts.arbitrary().verifyGeneration()
    }

    deepStrictEqual(Schema.resolveAnnotations(schema)?.representation, {
      id: "effect/schema/isUUID",
      payload: { version: null }
    })

    const decoding = asserts.decoding()
    await decoding.succeed("00000000-0000-0000-0000-000000000000")
    await decoding.succeed("ffffffff-ffff-ffff-ffff-ffffffffffff")
    await decoding.succeed("FFFFFFFF-FFFF-FFFF-FFFF-FFFFFFFFFFFF")
    await decoding.succeed("00000000-0000-4000-8000-000000000001")
    await decoding.fail(
      "00000000-0000-0000-0000-000000000001",
      `Expected a UUID`
    )
  })

  it("isUUID version-specific checks reject nil and max UUIDs", async () => {
    const schema = Schema.String.check(Schema.isUUID(4))
    const asserts = new TestSchema.Asserts(schema)
    const decoding = asserts.decoding()

    await decoding.succeed("00000000-0000-4000-8000-000000000001")
    await decoding.fail(
      "00000000-0000-0000-0000-000000000000",
      `Expected a UUID v4`
    )
    await decoding.fail(
      "ffffffff-ffff-ffff-ffff-ffffffffffff",
      `Expected a UUID v4`
    )
  })

  it("isGUID", async () => {
    const schema = Schema.String.check(Schema.isGUID())
    const asserts = new TestSchema.Asserts(schema)

    if (verifyGeneration) {
      asserts.arbitrary().verifyGeneration()
    }

    deepStrictEqual(Schema.resolveAnnotations(schema)?.representation, {
      id: "effect/schema/isGUID",
      payload: null
    })

    const decoding = asserts.decoding()
    await decoding.succeed("00000000-0000-0000-0000-000000000001")
    await decoding.succeed("FFFFFFFF-FFFF-FFFF-FFFF-FFFFFFFFFFFF")
    await decoding.fail(
      "not-a-guid",
      `Expected a GUID`
    )
  })

  it("isULID", async () => {
    const schema = Schema.String.check(Schema.isULID())
    const asserts = new TestSchema.Asserts(schema)

    if (verifyGeneration) {
      asserts.arbitrary().verifyGeneration()
    }

    deepStrictEqual(Schema.resolveAnnotations(schema)?.representation, {
      id: "effect/schema/isULID",
      payload: null
    })

    const decoding = asserts.decoding()
    await decoding.succeed("01H4PGGGJVN2DKP2K1H7EH996V")
    await decoding.fail(
      "",
      `Expected a string matching the RegExp ^[0-9A-HJKMNP-TV-Za-hjkmnp-tv-z]{26}$`
    )
  })

  it("isBase64", async () => {
    const schema = Schema.String.check(Schema.isBase64())

    deepStrictEqual(Schema.resolveAnnotations(schema)?.representation, {
      id: "effect/schema/isBase64",
      payload: null
    })
  })

  it("isBase64Url", async () => {
    const schema = Schema.String.check(Schema.isBase64Url())

    deepStrictEqual(Schema.resolveAnnotations(schema)?.representation, {
      id: "effect/schema/isBase64Url",
      payload: null
    })
  })

  describe("brand", () => {
    it("single brand", async () => {
      const schema = Schema.String.pipe(Schema.brand("Positive"))
      strictEqual(schema.ast, Schema.String.ast)
      strictEqual(schema.schema, Schema.String)
      strictEqual(schema.identifier, "Positive")
    })

    it("double brand", async () => {
      const schema = Schema.String.pipe(Schema.brand("Positive"), Schema.brand("Int"))
      strictEqual(schema.ast, Schema.String.ast)
      strictEqual(schema.schema.identifier, "Positive")
      strictEqual(schema.identifier, "Int")
    })

    it("override the default identifier", async () => {
      const schema = Schema.String.pipe(Schema.brand("Positive"), Schema.brand("Int")).annotate({ identifier: "MyInt" })
      deepStrictEqual(schema.ast.annotations, { identifier: "MyInt" })
    })
  })

  describe("fromBrand", () => {
    it("nominal", async () => {
      const schema = Schema.String.pipe(Schema.fromBrand("a", Brand.nominal<string & Brand.Brand<"a">>()))
      const asserts = new TestSchema.Asserts(schema)

      const decoding = asserts.decoding()
      await decoding.succeed("a")
      await decoding.fail(1, `Expected string`)

      strictEqual(schema.ast, Schema.String.ast)
    })

    it("single brand", async () => {
      type Int = number & Brand.Brand<"Int">
      const Int = Brand.check<Int>(Schema.isInt())
      const schema = Schema.Number.pipe(Schema.fromBrand("Int", Int))

      const asserts = new TestSchema.Asserts(schema)

      const decoding = asserts.decoding()
      await decoding.succeed(1)
      await decoding.fail("a", `Expected number`)
      await decoding.fail(1.2, `Expected an integer`)
    })

    it("multiple brands", async () => {
      type Int = number & Brand.Brand<"Int">
      const Int = Brand.check<Int>(Schema.isInt())

      type Positive = number & Brand.Brand<"Positive">
      const Positive = Brand.check<Positive>(Schema.isGreaterThan(0))

      const schema = Schema.Number.pipe(
        Schema.fromBrand("Int", Int),
        Schema.fromBrand("Positive", Positive)
      )

      const asserts = new TestSchema.Asserts(schema)

      const decoding = asserts.decoding()
      await decoding.succeed(1)
      await decoding.fail("a", `Expected number`)
      await decoding.fail(1.2, `Expected an integer`)
      await decoding.fail(-1, `Expected a value greater than 0`)
    })
  })

  describe("requiredKey", () => {
    it("should make all optionalKey keys required", async () => {
      const schema = Schema.Struct({
        a: Schema.optionalKey(Schema.String),
        b: Schema.optionalKey(Schema.Number)
      }).mapFields(Struct.map(Schema.requiredKey))
      const asserts = new TestSchema.Asserts(schema)

      const decoding = asserts.decoding()
      await decoding.succeed({ a: "a", b: 1 })
      await decoding.fail(
        { a: "a" },
        `Missing key
  at ["b"]`
      )
      await decoding.fail(
        { a: "a", b: undefined },
        `Expected number
  at ["b"]`
      )
      await decoding.fail(
        { b: 1 },
        `Missing key
  at ["a"]`
      )
    })

    it("should make all optional keys required", async () => {
      const schema = Schema.Struct({
        a: Schema.optional(Schema.String),
        b: Schema.optional(Schema.Number)
      }).mapFields(Struct.map(Schema.requiredKey))
      const asserts = new TestSchema.Asserts(schema)

      const decoding = asserts.decoding()
      await decoding.succeed({ a: "a", b: 1 })
      await decoding.succeed({ a: "a", b: undefined })
      await decoding.succeed({ a: undefined, b: 1 })
      await decoding.succeed({ a: undefined, b: undefined })
      await decoding.fail(
        { a: "a" },
        `Missing key
  at ["b"]`
      )
      await decoding.fail(
        { b: 1 },
        `Missing key
  at ["a"]`
      )
    })
  })

  describe("required", () => {
    it("should make all optional keys required", async () => {
      const schema = Schema.Struct({
        a: Schema.optional(Schema.String),
        b: Schema.optional(Schema.Number)
      }).mapFields(Struct.map(Schema.required))
      const asserts = new TestSchema.Asserts(schema)

      const decoding = asserts.decoding()
      await decoding.succeed({ a: "a", b: 1 })
      await decoding.fail(
        { a: "a" },
        `Missing key
  at ["b"]`
      )
      await decoding.fail(
        { a: "a", b: undefined },
        `Expected number
  at ["b"]`
      )
      await decoding.fail(
        { b: 1 },
        `Missing key
  at ["a"]`
      )
      await decoding.fail(
        { a: undefined, b: 1 },
        `Expected string
  at ["a"]`
      )
    })
  })

  it("fieldsAssign", async () => {
    const schema = Schema.Union([
      Schema.Struct({
        a: Schema.String
      }),
      Schema.Struct({
        b: Schema.Number
      })
    ]).mapMembers(Tuple.map(Schema.fieldsAssign({ c: Schema.Number })))
    const asserts = new TestSchema.Asserts(schema)

    const decoding = asserts.decoding()
    await decoding.succeed({ a: "a", c: 1 })
    await decoding.succeed({ b: 1, c: 1 })
    await decoding.fail(
      { a: "a" },
      `Missing key
  at ["c"]
Missing key
  at ["b"]`
    )
    await decoding.fail(
      { b: 1 },
      `Missing key
  at ["a"]
Missing key
  at ["c"]`
    )
  })

  describe("class extension", () => {
    it("wrapping a primitive schema", () => {
      class A extends Schema.String {}

      strictEqual(Schema.decodeUnknownSync(A)("a"), "a")
    })

    it("inherits the schema protocol", () => {
      class A extends Schema.String {}

      assertTrue(Schema.isSchema(A))
      strictEqual(A.make("a"), "a")

      const annotated = A.annotate({ title: "A" })
      assertTrue(Schema.isSchema(annotated))
      strictEqual(Schema.resolveAnnotations(annotated)?.title, "A")
    })

    it("extending a rebuilt schema", () => {
      class A extends Schema.Struct({ name: Schema.String }).annotate({ title: "A" }) {}

      deepStrictEqual(Schema.decodeUnknownSync(A)({ name: "a" }), { name: "a" })
      strictEqual(Schema.resolveAnnotations(A)?.title, "A")
    })

    it("static getter using this", () => {
      class A extends Schema.String {
        static get decodeUnknownSync() {
          return Schema.decodeUnknownSync(this)
        }
      }

      strictEqual(A.decodeUnknownSync("a"), "a")
    })

    it("static property", () => {
      class A extends Schema.String {
        static readonly decodeUnknownSync = Schema.decodeUnknownSync(this)
      }

      strictEqual(A.decodeUnknownSync("a"), "a")
    })

    it("static property using Schema.suspend", () => {
      class A extends Schema.String {
        static readonly decodeUnknownSync = Schema.decodeUnknownSync(Schema.suspend(() => this))
      }

      strictEqual(A.decodeUnknownSync("a"), "a")
    })

    it("wrapping a Struct schema", () => {
      const struct = Schema.Struct({
        name: Schema.String
      })
      class A extends struct {
        static get decodeUnknownSync() {
          return Schema.decodeUnknownSync(this)
        }
      }

      deepStrictEqual(A.decodeUnknownSync({ name: "a" }), { name: "a" })
      strictEqual(A.fields, struct.fields)
    })

    it("does not create class instances", () => {
      class A extends Schema.Struct({ name: Schema.String }) {}

      const value = A.make({ name: "a" })

      assertFalse(value instanceof A)
      deepStrictEqual(value, { name: "a" })
    })

    it("subclassing", () => {
      class A extends Schema.FiniteFromString {
        static get decodeUnknownSync() {
          return Schema.decodeUnknownSync(this)
        }
      }

      class B extends A {
        static encodeSync = Schema.encodeSync(this)
      }

      strictEqual(B.decodeUnknownSync("1"), 1)
      strictEqual(B.encodeSync(1), "1")
    })
  })
})

describe("resolveAnnotations", () => {
  it("returns undefined for a schema without annotations", () => {
    strictEqual(Schema.resolveAnnotations(Schema.String), undefined)
  })

  it("returns annotations from the base schema", () => {
    const schema = Schema.String.annotate({ title: "my string" })
    deepStrictEqual(Schema.resolveAnnotations(schema), { title: "my string" })
  })

  it("returns annotations from the last check", () => {
    const schema = Schema.String
      .annotate({ title: "base" })
      .check(Schema.isNonEmpty().annotate({ title: "check" }))
    strictEqual(Schema.resolveAnnotations(schema)?.title, "check")
  })
})

describe("resolveAnnotationsKey", () => {
  it("returns undefined for a schema without key annotations", () => {
    strictEqual(Schema.resolveAnnotationsKey(Schema.String), undefined)
  })

  it("returns key annotations", () => {
    const schema = Schema.String.annotateKey({ messageMissingKey: "required" })
    deepStrictEqual(Schema.resolveAnnotationsKey(schema), { messageMissingKey: "required" })
  })
})
