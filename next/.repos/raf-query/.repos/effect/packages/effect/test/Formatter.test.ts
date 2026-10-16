import { describe, it } from "@effect/vitest"
import {
  Context,
  Effect,
  Inspectable,
  Option,
  Redactable,
  Redacted,
  Result,
  Schema,
  SchemaGetter,
  SchemaIssue,
  SchemaParser
} from "effect"
import { format, formatJson } from "effect/Formatter"
import { assertFalse, assertTrue, deepStrictEqual, strictEqual } from "./utils/assert.ts"

class SensitiveData implements Redactable.Redactable {
  constructor(private secret: string) {}

  f(s: string) {
    this.secret += s
  }

  toString() {
    return this.secret
  }

  toJSON() {
    return { secret: this.secret }
  }

  [Redactable.symbolRedactable]() {
    return { secret: "[REDACTED]" }
  }
}

const data = new SensitiveData("my-secret-key")

describe("Formatter", () => {
  describe("format", () => {
    it("null", () => {
      strictEqual(format(null), `null`)
    })

    it("undefined", () => {
      strictEqual(format(undefined), `undefined`)
    })

    it("string", () => {
      strictEqual(format("a"), `"a"`)
    })

    it("number", () => {
      strictEqual(format(123), `123`)
    })

    it("boolean", () => {
      strictEqual(format(true), `true`)
    })

    it("symbol", () => {
      strictEqual(format(Symbol("a")), `Symbol(a)`)
    })

    it("bigint", () => {
      strictEqual(format(BigInt(123)), `123n`)
    })

    it("custom toString method", () => {
      strictEqual(format({ toString: () => "custom" }), `custom`)
    })

    it("handles throwing property getters", () => {
      const value = Object.defineProperty({ safe: 1 }, "unsafe", {
        enumerable: true,
        get() {
          throw new Error("getter defect")
        }
      })

      strictEqual(format(value), `{"safe":1,"unsafe":"[property access threw]"}`)
    })

    it("handles hostile Proxies", () => {
      const { proxy, revoke } = Proxy.revocable({}, {})
      revoke()

      strictEqual(format(proxy), `[inspection threw]`)
    })

    it("does not expose a value when redaction throws", () => {
      const value = {
        toString: () => "secret",
        [Redactable.symbolRedactable]() {
          throw new Error("redaction defect")
        }
      }

      strictEqual(format(value), `[inspection threw]`)
    })

    it("array", () => {
      strictEqual(format([1, 2, 3n]), `[1,2,3n]`)
    })

    it("circular array", () => {
      const arr: any = [1]
      arr.push(arr)
      strictEqual(format(arr), `[1,[Circular]]`)
    })

    it("circular Map contents", () => {
      const obj: any = { a: 1 }
      const map = new Map([["obj", obj]])
      obj.map = map
      strictEqual(format(map), `Map([["obj",{"a":1,"map":[Circular]}]])`)
    })

    it("circular Set contents", () => {
      const obj: any = { a: 1 }
      const set = new Set([obj])
      obj.set = set
      strictEqual(format(set), `Set([{"a":1,"set":[Circular]}])`)
    })

    it("object", () => {
      strictEqual(format({ a: 1 }), `{"a":1}`)
      strictEqual(format({ a: 1, b: 2 }), `{"a":1,"b":2}`)
      strictEqual(format({ [Symbol.for("a")]: 1 }), `{Symbol(a):1}`)
      strictEqual(format({ a: 1, b: [1, 2, 3n] }), `{"a":1,"b":[1,2,3n]}`)
    })

    it("circular object", () => {
      const obj: any = { a: 1 }
      obj.b = obj
      strictEqual(format(obj), `{"a":1,"b":[Circular]}`)
    })

    it("preserves repeated non-circular references", () => {
      const shared = { value: 1 }
      strictEqual(format({ first: shared, second: shared }), `{"first":{"value":1},"second":{"value":1}}`)
    })

    it("object with null prototype", () => {
      strictEqual(format(Object.create(null)), `{}`)
      strictEqual(format(Object.create(null, { a: { value: 1 } })), `{"a":1}`)
    })

    it("function", () => {
      strictEqual(
        format(() => {}),
        `() => {}`
      )
      strictEqual(
        format(() => {
          return 1
        }),
        `() => {\n\t\t\t\treturn 1;\n\t\t\t}`
      )
    })

    it("Error", () => {
      strictEqual(format(new Error("a")), `Error: a`)
      strictEqual(format(new Error("a", { cause: "b" })), `Error: a (cause: "b")`)
      strictEqual(format(new Error("a", { cause: 0 })), `Error: a (cause: 0)`)
      strictEqual(format(new Error("a", { cause: false })), `Error: a (cause: false)`)
      strictEqual(format(new Error("a", { cause: "" })), `Error: a (cause: "")`)
      strictEqual(format(new Error("a", { cause: null })), `Error: a (cause: null)`)
      strictEqual(format(new Error("a", { cause: 0n })), `Error: a (cause: 0n)`)
      strictEqual(format(new Error("a", { cause: Number.NaN })), `Error: a (cause: NaN)`)
      strictEqual(format(new Error("a", { cause: undefined })), `Error: a`)
    })

    it("Date", () => {
      strictEqual(format(new Date(0)), `1970-01-01T00:00:00.000Z`)
      strictEqual(format(new Date("invalid")), `Invalid Date`)
    })

    it("RegExp", () => {
      strictEqual(format(/a/), `/a/`)
    })

    it("Set", () => {
      strictEqual(format(new Set([1, 2, 3])), `Set([1,2,3])`)
    })

    it("Map", () => {
      strictEqual(format(new Map([["a", 1], ["b", 2]])), `Map([["a",1],["b",2]])`)
    })

    it("FormData", () => {
      const formData = new FormData()
      formData.append("a", "1")
      strictEqual(format(formData), `FormData([["a","1"]])`)
    })

    it("Uint8Array", () => {
      const uint8Array = new Uint8Array([1, 2, 3])
      strictEqual(format(uint8Array), `Uint8Array([1,2,3])`)
    })

    it("Redacted", () => {
      strictEqual(format(Redacted.make("a")), `<redacted>`)
    })

    it("Option", () => {
      strictEqual(
        format(Option.some(1)),
        `some(1)`
      )
      strictEqual(
        format(Option.none()),
        `none()`
      )
    })

    it("Schema.Class", () => {
      class A extends Schema.Class<A>("A")({
        a: Schema.String
      }) {}
      strictEqual(format(new A({ a: "a" })), `A({"a":"a"})`)
    })

    it("Schema.Error", () => {
      class E extends Schema.Error<E>("E")({
        a: Schema.String
      }) {}
      strictEqual(format(new E({ a: "a" })), `E`)
    })

    it("Context.Service", () => {
      const MyService = Context.Service<{ readonly value: number }>("MyService")
      strictEqual(format(MyService).includes(`"key": "MyService"`), true)
    })

    describe("whitespace", () => {
      it("object", () => {
        strictEqual(format({ a: 1 }, { space: 2 }), `{"a":1}`)
        strictEqual(
          format({ a: 1, b: 2 }, { space: 2 }),
          `{
  "a": 1,
  "b": 2
}`
        )
        strictEqual(
          format({ a: 1, b: [1, 2, 3n] }, { space: 2 }),
          `{
  "a": 1,
  "b": [
    1,
    2,
    3n
  ]
}`
        )
        strictEqual(format({ [Symbol.for("a")]: 1 }, { space: 2 }), `{Symbol(a):1}`)
      })

      it("circular object", () => {
        const obj: any = { a: 1 }
        obj.b = obj
        strictEqual(
          format(obj, { space: 2 }),
          `{
  "a": 1,
  "b": [Circular]
}`
        )
      })

      it("object with null prototype", () => {
        strictEqual(format(Object.create(null), { space: 2 }), `{}`)
        strictEqual(
          format(Object.create(null, { a: { value: 1 } }), { space: 2 }),
          `{"a":1}`
        )
      })
    })

    it("should redact sensitive data", () => {
      strictEqual(format(data), `{"secret":"[REDACTED]"}`)
      strictEqual(format({ a: data }), `{"a":{"secret":"[REDACTED]"}}`)
    })

    it("redacts before specialized representations", () => {
      const array = Object.assign(["secret"], {
        [Redactable.symbolRedactable]: () => ["[REDACTED]"]
      })
      const date = Object.assign(new Date(0), {
        [Redactable.symbolRedactable]: () => "[REDACTED]"
      })

      strictEqual(format(array), `["[REDACTED]"]`)
      strictEqual(format(date), `"[REDACTED]"`)
    })

    it("preserves formatting options for redacted representations", () => {
      let toStringCalls = 0
      const value = {
        [Redactable.symbolRedactable]: () => ({
          a: 1,
          b: 2,
          toString() {
            toStringCalls++
            return "custom"
          }
        })
      }

      assertTrue(format(value, { space: 2, ignoreToString: true }).startsWith(`{\n  "a": 1,\n  "b": 2,`))
      strictEqual(toStringCalls, 0)
    })

    it("tracks circular references through redacted representations", () => {
      const value: Redactable.Redactable = {
        [Redactable.symbolRedactable]: () => ({ value })
      }

      strictEqual(format(value), `{"value":[Circular]}`)
    })
  })

  describe("formatJson", () => {
    it("returns valid JSON for undefined input", () => {
      strictEqual(formatJson(undefined), `null`)
    })

    it("should omit circular references", () => {
      const obj: any = { a: 1 }
      obj.self = obj
      strictEqual(formatJson(obj), `{"a":1}`)
    })

    it("preserves repeated non-circular references", () => {
      const shared = { a: 1 }
      strictEqual(formatJson({ left: shared, right: shared }), `{"left":{"a":1},"right":{"a":1}}`)
    })

    it("should stringify BigInt values", () => {
      strictEqual(formatJson(123n), `"123n"`)
      strictEqual(formatJson({ value: 123n }), `{"value":"123n"}`)
      strictEqual(formatJson([1n, 2n]), `["1n","2n"]`)
    })

    it("should serialize Error objects with name, message, and enumerable fields", () => {
      strictEqual(formatJson(new Error("boom")), `{"name":"Error","message":"boom"}`)
      strictEqual(formatJson({ error: new Error("boom") }), `{"error":{"name":"Error","message":"boom"}}`)

      const nodeErr = Object.assign(new Error("ENOENT: no such file or directory"), {
        errno: -2,
        code: "ENOENT",
        syscall: "open",
        path: "/tmp/foo"
      })
      strictEqual(
        formatJson(nodeErr),
        `{"errno":-2,"code":"ENOENT","syscall":"open","path":"/tmp/foo","name":"Error","message":"ENOENT: no such file or directory"}`
      )

      const circularErr = new Error("boom")
      ;(circularErr as any).self = circularErr
      strictEqual(formatJson(circularErr), `{"name":"Error","message":"boom"}`)
    })

    it("should keep structured serialization for Errors that define toJSON", () => {
      class Tagged extends Error {
        toJSON() {
          return { _tag: "Tagged", message: "boom" }
        }
      }
      strictEqual(formatJson(new Tagged("boom")), `{"_tag":"Tagged","message":"boom"}`)
    })

    it("should redact sensitive data", () => {
      const date = Object.assign(new Date(0), {
        [Redactable.symbolRedactable]: () => "[REDACTED]"
      })

      strictEqual(formatJson(data), `{"secret":"[REDACTED]"}`)
      strictEqual(formatJson({ a: data }), `{"a":{"secret":"[REDACTED]"}}`)
      strictEqual(formatJson([data]), `[{"secret":"[REDACTED]"}]`)
      strictEqual(formatJson(date), `"[REDACTED]"`)
    })
  })

  describe("Inspectable.toJson", () => {
    it("redacts before toJSON", () => {
      deepStrictEqual(
        Inspectable.toJson(data),
        { secret: "[REDACTED]" }
      )
    })

    it("preserves plain objects as structured values", () => {
      const value: any = { count: 1n }
      value.self = value

      strictEqual(Inspectable.toJson(value), value)
    })
  })

  describe("Inspectable.toStringUnknown", () => {
    it("should stringify BigInt values", () => {
      strictEqual(Inspectable.toStringUnknown(123n), `123n`)
      strictEqual(
        Inspectable.toStringUnknown({ value: 123n }),
        `{
  "value": "123n"
}`
      )
    })
  })

  describe("SchemaIssue reportInput", () => {
    const formatIssue = SchemaIssue.makeFormatterDefault()

    it("supports every value-bearing issue constructor", () => {
      const input = { value: "secret" }
      const options = { reportInput: true } as const
      const invalidValue = new SchemaIssue.InvalidValue()
      const union = Schema.Union([Schema.String, Schema.Number]).ast
      const issues: ReadonlyArray<SchemaIssue.Issue> = [
        new SchemaIssue.InvalidType(Schema.String.ast, input, options),
        new SchemaIssue.InvalidValue(undefined, input, options),
        new SchemaIssue.UnexpectedKey(Schema.String.ast, input, options),
        new SchemaIssue.Forbidden(undefined, input, options),
        new SchemaIssue.OneOf(union, [Schema.String.ast], input, options),
        new SchemaIssue.Filter(Schema.isMinLength(1), invalidValue, input, options),
        new SchemaIssue.Encoding(Schema.String.ast, invalidValue, input, options),
        new SchemaIssue.Composite(Schema.String.ast, [invalidValue], input, options),
        new SchemaIssue.AnyOf(union, [invalidValue], input, options)
      ]

      for (const issue of issues) {
        assertTrue(SchemaIssue.hasInput(issue))
        strictEqual(issue.input, input)
        assertTrue(Object.keys(issue).includes("input"))
      }

      assertFalse(SchemaIssue.hasInput(new SchemaIssue.InvalidType(Schema.String.ast)))
      assertFalse(SchemaIssue.hasInput(new SchemaIssue.Pointer([], invalidValue)))
      assertFalse(SchemaIssue.hasInput(new SchemaIssue.MissingKey(undefined)))
    })

    it("reports input only when enabled", () => {
      const input = { secret: "value" }
      const disabled = SchemaParser.decodeUnknownResult(Schema.String)(input)

      assertTrue(Result.isFailure(disabled))
      assertTrue(disabled.failure._tag === "InvalidType")
      assertFalse(SchemaIssue.hasInput(disabled.failure))
      strictEqual(formatIssue(disabled.failure), "Expected string")

      const enabled = SchemaParser.decodeUnknownResult(Schema.String)(input, { reportInput: true })
      assertTrue(Result.isFailure(enabled))
      assertTrue(enabled.failure._tag === "InvalidType")
      assertTrue(SchemaIssue.hasInput(enabled.failure))
      strictEqual(enabled.failure.input, input)
      assertTrue(Object.keys(enabled.failure).includes("input"))
      assertTrue(JSON.stringify(enabled.failure).includes("secret"))
      deepStrictEqual(Object.getOwnPropertyDescriptor(enabled.failure, "input"), {
        value: input,
        enumerable: true,
        writable: true,
        configurable: true
      })
      strictEqual(formatIssue(enabled.failure), `Expected string, got {"secret":"value"}`)
    })

    it("distinguishes undefined input from missing input", () => {
      const undefinedResult = SchemaParser.decodeUnknownResult(Schema.String)(undefined, { reportInput: true })
      assertTrue(Result.isFailure(undefinedResult))
      assertTrue(SchemaIssue.hasInput(undefinedResult.failure))
      strictEqual(undefinedResult.failure.input, undefined)
      strictEqual(formatIssue(undefinedResult.failure), "Expected string, got undefined")

      const missingResult = SchemaParser.decodeUnknownResult(Schema.Struct({ value: Schema.String }))(
        {},
        { reportInput: true }
      )
      assertTrue(Result.isFailure(missingResult))
      assertTrue(missingResult.failure._tag === "Composite")
      const pointer = missingResult.failure.issues[0]
      assertTrue(pointer._tag === "Pointer")
      assertFalse(SchemaIssue.hasInput(pointer))
      assertTrue(pointer.issue._tag === "MissingKey")
      assertFalse(SchemaIssue.hasInput(pointer.issue))
      strictEqual(formatIssue(pointer.issue), "Missing key")
    })

    it("reports local inputs for structs", () => {
      const input = { value: "not a number", extra: "secret" }
      const result = SchemaParser.decodeUnknownResult(Schema.Struct({ value: Schema.Number }))(input, {
        errors: "all",
        onExcessProperty: "error",
        reportInput: true
      })

      assertTrue(Result.isFailure(result))
      assertTrue(result.failure._tag === "Composite")
      strictEqual(result.failure.input, input)

      const extraPointer = result.failure.issues[0]
      assertTrue(extraPointer._tag === "Pointer")
      assertFalse(SchemaIssue.hasInput(extraPointer))
      assertTrue(extraPointer.issue._tag === "UnexpectedKey")
      strictEqual(extraPointer.issue.input, "secret")

      const valuePointer = result.failure.issues[1]
      assertTrue(valuePointer._tag === "Pointer")
      assertFalse(SchemaIssue.hasInput(valuePointer))
      assertTrue(valuePointer.issue._tag === "InvalidType")
      strictEqual(valuePointer.issue.input, "not a number")
    })

    it("reports filter input on parser-created issues", () => {
      const result = SchemaParser.decodeUnknownResult(Schema.String.check(Schema.isMinLength(1)))("", {
        reportInput: true
      })

      assertTrue(Result.isFailure(result))
      assertTrue(result.failure._tag === "Composite")
      const filter = result.failure.issues[0]
      assertTrue(filter._tag === "Filter")
      strictEqual(filter.input, "")
      assertTrue(filter.issue._tag === "InvalidValue")
      strictEqual(filter.issue.input, "")
      strictEqual(formatIssue(filter), `Expected a value with a length of at least 1, got ""`)
    })

    it("allows user-provided transformations to report their input", () => {
      const schema = Schema.String.pipe(
        Schema.decode({
          decode: SchemaGetter.transformEffect((input, options) =>
            Effect.fail(new SchemaIssue.InvalidValue(undefined, input, options))
          ),
          encode: SchemaGetter.passthrough()
        })
      )
      const result = SchemaParser.decodeUnknownResult(schema)("secret", { reportInput: true })

      assertTrue(Result.isFailure(result))
      assertTrue(result.failure._tag === "Encoding")
      assertTrue(result.failure.issue._tag === "InvalidValue")
      strictEqual(result.failure.issue.input, "secret")
      strictEqual(formatIssue(result.failure), `Invalid data "secret"`)
    })

    it("reports input from effectful checks", () => {
      const schema = Schema.String.pipe(
        Schema.decode({
          decode: SchemaGetter.checkEffect(() => Effect.succeed(false)),
          encode: SchemaGetter.passthrough()
        })
      )
      const result = SchemaParser.decodeUnknownResult(schema)("secret", { reportInput: true })

      assertTrue(Result.isFailure(result))
      assertTrue(result.failure._tag === "Encoding")
      assertTrue(result.failure.issue._tag === "InvalidValue")
      strictEqual(result.failure.issue.input, "secret")
      strictEqual(formatIssue(result.failure), `Invalid data "secret"`)
    })

    it("does not infer input through a user-provided pointer", () => {
      const inner = new SchemaIssue.InvalidValue()
      const pointer = new SchemaIssue.Pointer(["value"], inner)
      const schema = Schema.String.check(Schema.makeFilter(() => pointer))
      const result = SchemaParser.decodeUnknownResult(schema)("secret", { reportInput: true })

      assertTrue(Result.isFailure(result))
      assertTrue(result.failure._tag === "Composite")
      const filter = result.failure.issues[0]
      assertTrue(filter._tag === "Filter")
      strictEqual(filter.input, "secret")
      strictEqual(filter.issue, pointer)
      assertFalse(SchemaIssue.hasInput(pointer))
      assertFalse(SchemaIssue.hasInput(inner))
    })

    it("reports input for union wrappers", () => {
      const anyOf = SchemaParser.decodeUnknownResult(Schema.Union([Schema.Literal("a"), Schema.Literal("b")]))(
        "c",
        { reportInput: true }
      )
      assertTrue(Result.isFailure(anyOf))
      assertTrue(anyOf.failure._tag === "AnyOf")
      strictEqual(anyOf.failure.input, "c")
      strictEqual(formatIssue(anyOf.failure), `Expected "a" | "b", got "c"`)

      const oneOf = SchemaParser.decodeUnknownResult(
        Schema.Union([Schema.Literal("a"), Schema.Literal("a")], { mode: "oneOf" })
      )("a", { reportInput: true })
      assertTrue(Result.isFailure(oneOf))
      assertTrue(oneOf.failure._tag === "OneOf")
      strictEqual(oneOf.failure.input, "a")
      strictEqual(formatIssue(oneOf.failure), `Expected exactly one member to match the input "a"`)
    })

    it("runtime reportInput overrides preset options and reaches nested schemas", () => {
      const enabledResult = SchemaParser.decodeUnknownResult(Schema.String, { reportInput: false })(1, {
        reportInput: true
      })
      assertTrue(Result.isFailure(enabledResult))
      strictEqual(enabledResult.failure.input, 1)

      const disabledResult = SchemaParser.decodeUnknownResult(Schema.String, { reportInput: true })(1, {
        reportInput: false
      })
      assertTrue(Result.isFailure(disabledResult))
      assertFalse(SchemaIssue.hasInput(disabledResult.failure))

      const nested = Schema.Struct({ value: Schema.String })
      const nestedInput = { value: 1 }
      const nestedResult = SchemaParser.decodeUnknownResult(nested)(nestedInput, { reportInput: true })
      assertTrue(Result.isFailure(nestedResult))
      assertTrue(nestedResult.failure._tag === "Composite")
      strictEqual(nestedResult.failure.input, nestedInput)
      const pointer = nestedResult.failure.issues[0]
      assertTrue(pointer._tag === "Pointer")
      assertTrue(SchemaIssue.hasInput(pointer.issue))
      strictEqual(pointer.issue.input, 1)
    })

    it.effect("distinguishes present undefined from absent input in forbidden", () =>
      Effect.gen(function*() {
        const getter = SchemaGetter.forbidden<never, undefined>(() => "not allowed")
        assertTrue(getter._tag === "TransformOptionalEffect")
        const present = yield* getter.transform(Option.some(undefined), { reportInput: true }).pipe(Effect.flip)
        assertTrue(present._tag === "Forbidden")
        assertTrue(SchemaIssue.hasInput(present))
        strictEqual(present.input, undefined)
        strictEqual(formatIssue(present), "not allowed")

        const absent = yield* getter.transform(Option.none(), { reportInput: true }).pipe(Effect.flip)
        assertTrue(absent._tag === "Forbidden")
        assertFalse(SchemaIssue.hasInput(absent))
      }))

    it("formats reported inputs with the historical templates", () => {
      const options = { reportInput: true } as const
      const invalidValue = new SchemaIssue.InvalidValue()
      const union = Schema.Union([Schema.String, Schema.Number]).ast

      strictEqual(formatIssue(new SchemaIssue.InvalidType(Schema.String.ast, 1, options)), "Expected string, got 1")
      strictEqual(formatIssue(new SchemaIssue.InvalidValue(undefined, 1, options)), "Invalid data 1")
      strictEqual(
        formatIssue(new SchemaIssue.UnexpectedKey(Schema.String.ast, 1, options)),
        "Unexpected key with value 1"
      )
      strictEqual(
        formatIssue(new SchemaIssue.OneOf(union, [Schema.String.ast], 1, options)),
        "Expected exactly one member to match the input 1"
      )
      strictEqual(formatIssue(new SchemaIssue.Forbidden(undefined, 1, options)), "Forbidden operation")
      strictEqual(
        formatIssue(new SchemaIssue.Filter(Schema.isMinLength(1), invalidValue, 1, options)),
        "Expected a value with a length of at least 1, got 1"
      )
      strictEqual(formatIssue(new SchemaIssue.AnyOf(union, [], 1, options)), "Expected string | number, got 1")
    })

    it("does not inherit input from wrappers", () => {
      const options = { reportInput: true } as const
      const inner = new SchemaIssue.InvalidValue()

      strictEqual(
        formatIssue(new SchemaIssue.Encoding(Schema.String.ast, inner, "secret", options)),
        "Expected a valid value"
      )
      strictEqual(
        formatIssue(new SchemaIssue.Composite(Schema.String.ast, [inner], "secret", options)),
        "Expected a valid value"
      )
      strictEqual(
        formatIssue(
          new SchemaIssue.Filter(
            Schema.isMinLength(1),
            new SchemaIssue.InvalidValue(undefined, "secret", options)
          )
        ),
        "Expected a value with a length of at least 1"
      )
    })

    it("uses expected annotations only for InvalidValue", () => {
      strictEqual(formatIssue(new SchemaIssue.InvalidValue({ expected: "a valid value" })), "Expected a valid value")
      strictEqual(
        formatIssue(new SchemaIssue.InvalidValue({ expected: "a valid value" }, "secret", { reportInput: true })),
        `Expected a valid value, got "secret"`
      )
      strictEqual(
        formatIssue(
          new SchemaIssue.InvalidValue(
            { expected: "ignored", message: "custom message" },
            "secret",
            { reportInput: true }
          )
        ),
        "custom message"
      )
      strictEqual(
        formatIssue(new SchemaIssue.Forbidden({ expected: "a permitted operation" }, "secret", { reportInput: true })),
        "Forbidden operation"
      )
      const filter = new SchemaIssue.Filter(
        Schema.isMinLength(1),
        new SchemaIssue.InvalidValue({ expected: "a custom value" }, "secret", { reportInput: true })
      )
      strictEqual(formatIssue(filter), `Expected a custom value, got "secret"`)
      deepStrictEqual(
        SchemaIssue.makeFormatterStandardSchemaV1({ checkHook: () => undefined })(filter).issues,
        [{ message: `Expected a custom value, got "secret"`, path: [] }]
      )
    })

    it("uses expected annotations in built-ins", () => {
      const disabled = SchemaParser.decodeUnknownResult(Schema.URLFromString)("invalid")
      assertTrue(Result.isFailure(disabled))
      strictEqual(formatIssue(disabled.failure), "Expected a valid URL string")

      const enabled = SchemaParser.decodeUnknownResult(Schema.URLFromString)("invalid", { reportInput: true })
      assertTrue(Result.isFailure(enabled))
      strictEqual(formatIssue(enabled.failure), `Expected a valid URL string, got "invalid"`)
    })

    it("keeps Redacted input redacted", () => {
      const input = Redacted.make("secret", { label: "password" })
      const result = SchemaParser.decodeUnknownResult(Schema.Redacted(Schema.Number))(input, { reportInput: true })

      assertTrue(Result.isFailure(result))
      assertTrue(result.failure._tag === "Composite")
      const pointer = result.failure.issues[0]
      assertTrue(pointer._tag === "Pointer")
      assertTrue(pointer.issue._tag === "InvalidValue")
      strictEqual(pointer.issue.input, input)
      strictEqual(formatIssue(result.failure), "Invalid data <redacted:password>\n  at [\"value\"]")
    })

    it("preserves custom messages and hooks", () => {
      const options = { reportInput: true } as const
      const invalidType = new SchemaIssue.InvalidType(
        Schema.String.annotate({ message: "custom message" }).ast,
        "secret",
        options
      )
      strictEqual(formatIssue(invalidType), "custom message")

      const leafFormatter = SchemaIssue.makeFormatterStandardSchemaV1({ leafHook: () => "redacted leaf" })
      deepStrictEqual(leafFormatter(invalidType).issues, [{ message: "redacted leaf", path: [] }])

      const filter = new SchemaIssue.Filter(Schema.isMinLength(1), new SchemaIssue.InvalidValue(), "secret", options)
      const checkFormatter = SchemaIssue.makeFormatterStandardSchemaV1({ checkHook: () => "redacted check" })
      deepStrictEqual(checkFormatter(filter).issues, [{ message: "redacted check", path: [] }])
    })

    it("reports input in Standard Schema messages without adding an input field", () => {
      const standardSchema = Schema.toStandardSchemaV1(Schema.String, {
        parseOptions: { reportInput: true }
      })
      const result = standardSchema["~standard"].validate(1)
      if (result instanceof Promise) {
        throw new Error("Expected synchronous validation")
      }
      deepStrictEqual(result, {
        issues: [{ message: "Expected string, got 1", path: [] }]
      })
    })
  })
})
