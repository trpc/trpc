import { assert, describe, it } from "@effect/vitest"
import * as testAssert from "@effect/vitest/utils"
import {
  Cause,
  Clock,
  Context,
  Deferred,
  Effect,
  Exit,
  Fiber,
  Layer,
  Ref,
  Result,
  Schema,
  SchemaGetter,
  SchemaIssue
} from "effect"
import * as SchemaTransformation from "effect/SchemaTransformation"
import { TestClock, TestSchema } from "effect/testing"
import { AssertionError } from "node:assert"

describe("TestSchema", () => {
  describe("ast.fields.equals", () => {
    const equals = TestSchema.Asserts.ast.fields.equals

    it("compares string and symbol fields by AST", () => {
      const key = Symbol("field")
      const fields = () => ({ field: Schema.Literal("value"), [key]: Schema.Literal("value") })
      const left = fields()
      const right = fields()
      assert.notStrictEqual(left[key], right[key])
      equals(left, right)
    })

    it("rejects missing or structurally different symbol fields", () => {
      const key = Symbol("field")
      assert.throws(() => equals({ [key]: Schema.Literal("left") }, { [key]: Schema.Literal("right") }))
      assert.throws(() => equals({ [key]: Schema.Literal("value") }, {}))
      assert.throws(() =>
        equals(
          { [key]: Schema.Literal("value").annotate({ title: "Field" }) },
          { [key]: Schema.Literal("value") }
        )
      )
      assert.throws(() =>
        equals({ [key]: Schema.optionalKey(Schema.Literal("value")) }, { [key]: Schema.Literal("value") })
      )
    })

    it("preserves symbol identity even with equal descriptions", () => {
      const left: symbol = Symbol("field")
      const right: symbol = Symbol("field")
      const schema = Schema.Literal("value")
      assert.notStrictEqual(left, right)
      assert.throws(() => equals({ [left]: schema }, { [right]: schema }))
    })

    it("preserves own __proto__ and constructor fields", () => {
      const fields = () => ({ ["__proto__"]: Schema.Literal("proto"), constructor: Schema.Literal("ctor") })
      const left = fields()
      assert.isTrue(Object.hasOwn(left, "__proto__"))
      assert.isTrue(Object.hasOwn(left, "constructor"))
      equals(left, fields())
      assert.throws(() => equals(left, { constructor: Schema.Literal("ctor") }))
      assert.throws(() => equals(left, { ["__proto__"]: Schema.Literal("other"), constructor: Schema.Literal("ctor") }))
    })

    it("uses the Struct own-key contract for non-enumerable fields", () => {
      const key = Symbol("hidden")
      const fields = (value: string): Schema.Struct.Fields =>
        Object.defineProperties({}, {
          hidden: { value: Schema.Literal(value) },
          [key]: { value: Schema.Literal(value) }
        })
      const left = fields("value")
      const right = fields("value")
      assert.deepStrictEqual(Object.keys(left), [])
      assert.deepStrictEqual(Schema.Struct(left).ast.propertySignatures.map((field) => field.name), ["hidden", key])
      equals(left, right)
      equals(left, { hidden: Schema.Literal("value"), [key]: Schema.Literal("value") })
      assert.throws(() => equals(left, fields("other")))
    })
  })

  it("decoding", async () => {
    const schema = Schema.FiniteFromString.check(Schema.isGreaterThan(0))
    const asserts = new TestSchema.Asserts(schema)
    const decoding = asserts.decoding()
    await decoding.succeed("1", 1)
    await decoding.fail("-1", `Expected a value greater than 0`)
    await decoding.fail("a", `Expected a finite number`)
  })

  it("decoding.provide", async () => {
    class Service extends Context.Service<Service, { fallback: Effect.Effect<string> }>()("Service") {}

    const schema = Schema.String.pipe(
      Schema.decode({
        decode: SchemaGetter.checkEffect((s) =>
          Effect.gen(function*() {
            yield* Service
            if (s.length === 0) {
              return new SchemaIssue.InvalidValue({
                message: "input should not be empty string"
              })
            }
          })
        ),
        encode: SchemaGetter.passthrough()
      })
    )
    const asserts = new TestSchema.Asserts(schema)

    const decoding = asserts.decoding().provide(Service, { fallback: Effect.succeed("b") })
    await decoding.succeed("a")
    await decoding.fail("", "input should not be empty string")
  })

  it("encoding", async () => {
    const schema = Schema.FiniteFromString.check(Schema.isGreaterThan(0))
    const asserts = new TestSchema.Asserts(schema)
    const encoding = asserts.encoding()
    await encoding.succeed(1, "1")
    await encoding.fail(-1, `Expected a value greater than 0`)
  })

  it("encoding.provide", async () => {
    class Service extends Context.Service<Service, { fallback: Effect.Effect<string> }>()("Service") {}

    const schema = Schema.String.pipe(
      Schema.decode({
        decode: SchemaGetter.passthrough(),
        encode: SchemaGetter.checkEffect((s) =>
          Effect.gen(function*() {
            yield* Service
            if (s.length === 0) {
              return new SchemaIssue.InvalidValue({
                message: "input should not be empty string"
              })
            }
          })
        )
      })
    )
    const asserts = new TestSchema.Asserts(schema)

    const encoding = asserts.encoding().provide(Service, { fallback: Effect.succeed("b") })
    await encoding.succeed("a")
    await encoding.fail("", "input should not be empty string")
  })

  it("verifyRoundTrip", async () => {
    const schema = Schema.FiniteFromString.check(Schema.isGreaterThan(0))
    const asserts = new TestSchema.Asserts(schema)
    await asserts.verifyRoundTrip({ runs: 20, seed: "lossless" })
  })

  it("verifyRoundTrip reports a shrunk input and replay", async () => {
    const schema = Schema.Number.pipe(
      Schema.decodeTo(
        Schema.Number,
        SchemaTransformation.transform({ decode: (value) => value, encode: () => 0 })
      )
    )
    const asserts = new TestSchema.Asserts(schema)

    await testAssert.throwsAsync(
      () => asserts.verifyRoundTrip({ runs: 20, seed: "lossy" }),
      (error) => {
        assert.instanceOf(error, Error)
        assert.match(error.message, /Property falsified/)
        assert.match(error.message, /Shrunk input:/)
        assert.match(error.message, /Replay:/)
      }
    )
  })

  it("verifyGeneration bounds residual discards", () => {
    const schema = Schema.Null.check(Schema.makeFilter(() => false))
    const asserts = new TestSchema.Asserts(schema)

    assert.throws(
      () => asserts.arbitrary().verifyGeneration({ runs: 1, maxDiscards: 2, seed: "exhausted" }),
      /Property exhausted after 0 run\(s\) and 3 discard\(s\)/
    )
  })

  for (const method of ["decoding", "encoding", "make"] as const) {
    describe(`${method} Effect assertions`, () => {
      it.effect("defers parsing and reruns it on every execution", () =>
        Effect.gen(function*() {
          let calls = 0
          const schema = Schema.String.check(Schema.makeFilter((value) => {
            calls++
            return value === "ok" || "Expected ok"
          }))
          const assertions = new TestSchema.Asserts(schema)[method]()
          const success = assertions.succeedEffect("ok")
          const failure = assertions.failEffect("bad", "Expected ok")
          assert.strictEqual(calls, 0)

          yield* success
          yield* success
          yield* failure
          assert.strictEqual(calls, 3)
        }))

      it.effect("preserves explicit undefined and reports mismatches as defects", () =>
        Effect.gen(function*() {
          const assertions = new TestSchema.Asserts(Schema.Unknown)[method]()
          yield* assertions.succeedEffect("value")
          yield* assertions.succeedEffect(undefined)
          const exit = yield* Effect.exit(assertions.succeedEffect("value", undefined))
          assert.isTrue(Exit.isFailure(exit))
          if (Exit.isFailure(exit)) {
            assert.isFalse(Cause.hasFails(exit.cause))
            const error = Cause.squash(exit.cause)
            assert.instanceOf(error, AssertionError)
            assert.deepStrictEqual(error.actual, Result.succeed("value"))
            assert.deepStrictEqual(error.expected, Result.succeed(undefined))
          }

          const strings = new TestSchema.Asserts(
            Schema.String.check(Schema.makeFilter((value) => value.length > 0 || "Expected nonempty string"))
          )[method]()
          for (
            const effect of [
              strings.succeedEffect(""),
              strings.failEffect("valid", "Expected string"),
              strings.failEffect(123, "wrong message")
            ]
          ) {
            const exit = yield* Effect.exit(effect)
            assert.isTrue(Exit.isFailure(exit))
            if (Exit.isFailure(exit)) {
              assert.isFalse(Cause.hasFails(exit.cause))
              assert.instanceOf(Cause.squash(exit.cause), AssertionError)
            }
          }
        }))

      it("preserves Promise assertion errors and explicit undefined", async () => {
        const assertions = new TestSchema.Asserts(Schema.Unknown)[method]()
        await assertions.succeed("value")
        await testAssert.throwsAsync(() => assertions.succeed("value", undefined), (error) => {
          assert.instanceOf(error, AssertionError)
          assert.deepStrictEqual(error.actual, Result.succeed("value"))
          assert.deepStrictEqual(error.expected, Result.succeed(undefined))
          assert.strictEqual(error.operator, "deepStrictEqual")
        })
        await testAssert.throwsAsync(() => assertions.fail("value", "wrong message"), (error) => {
          assert.instanceOf(error, AssertionError)
        })
      })

      it.effect("forwards parsing options", () =>
        Effect.gen(function*() {
          const schema = Schema.String.check(
            Schema.makeFilter((_, __, options) => options.errors === "all" || "Expected all errors")
          )
          const asserts = new TestSchema.Asserts(schema)
          yield* asserts[method]({ parseOptions: { errors: "all" } }).succeedEffect("value")
          yield* asserts[method]().failEffect("value", "Expected all errors")
        }))

      it.effect("preserves thrown schema defects in success and failure assertions", () =>
        Effect.gen(function*() {
          const defect = new Error("schema defect")
          const schema = Schema.String.check(Schema.makeFilter(() => {
            throw defect
          }))
          const assertions = new TestSchema.Asserts(schema)[method]()
          const success = assertions.succeedEffect("value")
          const failure = assertions.failEffect("value", "schema defect")

          assert.deepStrictEqual(yield* Effect.exit(success), Exit.die(defect))
          assert.deepStrictEqual(yield* Effect.exit(failure), Exit.die(defect))
        }))
    })
  }

  it.effect("asserts decoded and encoded transformations", () =>
    Effect.gen(function*() {
      const asserts = new TestSchema.Asserts(Schema.NumberFromString)
      yield* asserts.decoding().succeedEffect("42", 42)
      yield* asserts.encoding().succeedEffect(42, "42")
      yield* asserts.decoding().failEffect(null, "Expected string")
      yield* asserts.encoding().failEffect(null, "Expected number")
    }))

  it.effect("make uses constructor defaults from the test environment and honors disableChecks", () =>
    Effect.gen(function*() {
      const schema = Schema.Struct({
        time: Schema.Number.pipe(Schema.withConstructorDefault(Clock.currentTimeMillis))
      })
      const make = new TestSchema.Asserts(schema).make()
      const assertion = make.succeedEffect({}, { time: 123 })
      yield* TestClock.setTime(123)
      yield* assertion

      const checked = new TestSchema.Asserts(Schema.Number.check(Schema.isGreaterThan(0)))
      yield* checked.make().failEffect(-1, "Expected a value greater than 0")
      yield* checked.make({ disableChecks: true }).succeedEffect(-1)
    }))

  for (const method of ["decoding", "encoding"] as const) {
    it.effect(`${method} preserves validation failures and defective finalizers`, () =>
      Effect.gen(function*() {
        const defect = new Error("cleanup failed")
        const finalize = Effect.ensuring(Effect.die(defect))
        const schema = method === "decoding"
          ? Schema.String.pipe(Schema.middlewareDecoding(finalize))
          : Schema.String.pipe(Schema.middlewareEncoding(finalize))
        const assertions = new TestSchema.Asserts(schema)[method]()

        for (
          const effect of [
            assertions.succeedEffect(123, "value"),
            assertions.failEffect(123, "Expected string")
          ]
        ) {
          const exit = yield* Effect.exit(effect)
          assert.isTrue(Exit.isFailure(exit))
          if (Exit.isFailure(exit)) {
            assert.deepStrictEqual(exit.cause.reasons.map((reason) => reason._tag), ["Die", "Die"])
            const [validation, cleanup] = exit.cause.reasons
            assert.isTrue(Cause.isDieReason(validation) && SchemaIssue.isIssue(validation.defect))
            assert.isTrue(Cause.isDieReason(cleanup) && cleanup.defect === defect)
          }
        }

        const asserts = new TestSchema.Asserts(schema)
        yield* Effect.promise(() =>
          testAssert.throwsAsync(
            () =>
              method === "decoding"
                ? asserts.decoding().fail(123, "Expected string")
                : asserts.encoding().fail(123, "Expected string"),
            (error) => {
              assert.isTrue(SchemaIssue.isIssue(error))
            }
          )
        )
      }))

    it.effect(`${method} preserves interruption alongside annotated validation failures`, () =>
      Effect.gen(function*() {
        class Metadata extends Context.Service<Metadata, string>()("Metadata") {}
        const annotations = Context.make(Metadata, "validation")
        const issue = new SchemaIssue.InvalidValue({ message: "schema issue" })
        const interrupt = Cause.makeInterruptReason(123)
        const failure = Effect.failCause(Cause.fromReasons([
          Cause.makeFailReason(issue).annotate(annotations),
          interrupt
        ]))
        const schema = method === "decoding"
          ? Schema.String.pipe(Schema.middlewareDecoding(() => failure))
          : Schema.String.pipe(Schema.middlewareEncoding(() => failure))
        const assertions = new TestSchema.Asserts(schema)[method]()

        for (
          const effect of [
            assertions.succeedEffect("value"),
            assertions.failEffect("value", "schema issue")
          ]
        ) {
          const exit = yield* Effect.exit(effect)
          assert.isTrue(Exit.isFailure(exit))
          if (Exit.isFailure(exit)) {
            assert.deepStrictEqual(exit.cause.reasons.map((reason) => reason._tag), ["Die", "Interrupt"])
            const [validation, interruption] = exit.cause.reasons
            assert.isTrue(Cause.isDieReason(validation) && SchemaIssue.isIssue(validation.defect))
            if (Cause.isDieReason(validation) && SchemaIssue.isIssue(validation.defect)) {
              assert.strictEqual(SchemaIssue.defaultFormatter(validation.defect), "schema issue")
            }
            assert.strictEqual(Context.getOrUndefined(Cause.reasonAnnotations(validation), Metadata), "validation")
            assert.deepStrictEqual(interruption, interrupt)
          }
        }
      }))

    it.effect(`round trips preserve mixed causes from ${method}`, () =>
      Effect.gen(function*() {
        const issue = new SchemaIssue.InvalidValue({ message: "schema issue" })
        const defect = new Error("cleanup failed")
        const failure = Effect.fail(issue).pipe(Effect.ensuring(Effect.die(defect)))
        const schema = method === "decoding"
          ? Schema.String.pipe(Schema.middlewareDecoding(() => failure))
          : Schema.String.pipe(Schema.middlewareEncoding(() => failure))

        const exit = yield* Effect.exit(new TestSchema.Asserts(schema).verifyRoundTripEffect({ runs: 1, seed: 1 }))
        assert.isTrue(Exit.isFailure(exit))
        if (Exit.isFailure(exit)) {
          assert.deepStrictEqual(exit.cause.reasons.map((reason) => reason._tag), ["Die", "Die"])
          const [validation, cleanup] = exit.cause.reasons
          assert.isTrue(Cause.isDieReason(validation) && SchemaIssue.isIssue(validation.defect))
          if (Cause.isDieReason(validation) && SchemaIssue.isIssue(validation.defect)) {
            assert.strictEqual(SchemaIssue.defaultFormatter(validation.defect), "schema issue")
          }
          assert.isTrue(Cause.isDieReason(cleanup) && cleanup.defect === defect)
        }
      }))

    it.effect(`${method} inherits layer services and supports provide`, () =>
      Effect.gen(function*() {
        class Expected extends Context.Service<Expected, string>()("Expected") {}
        const check = SchemaGetter.checkEffect((value: string) =>
          Effect.map(Expected, (expected) =>
            value === expected ? undefined : new SchemaIssue.InvalidValue({ message: "Unexpected value" }))
        )
        const schema = Schema.String.pipe(Schema.decode({ decode: check, encode: check }))
        const assertions = new TestSchema.Asserts(schema)[method]()

        yield* Effect.gen(function*() {
          yield* assertions.succeedEffect("provided")
          yield* assertions.failEffect("wrong", "Unexpected value")
        }).pipe(Effect.provide(Layer.succeed(Expected, "provided")))

        yield* assertions.provide(Expected, "local").succeedEffect("local")
        yield* assertions.provide(Expected, "local").failEffect("wrong", "Unexpected value")
      }))

    it.effect(`${method} reads the test clock`, () =>
      Effect.gen(function*() {
        const check = SchemaGetter.checkEffect((value: number) =>
          Effect.map(Clock.currentTimeMillis, (now) =>
            value === now ? undefined : new SchemaIssue.InvalidValue({ message: "Unexpected time" }))
        )
        const schema = Schema.Number.pipe(Schema.decode({ decode: check, encode: check }))
        const assertions = new TestSchema.Asserts(schema)[method]()
        yield* TestClock.setTime(123)
        yield* assertions.succeedEffect(123)
        yield* assertions.failEffect(0, "Unexpected time")
      }))
  }

  it.effect("make preserves mixed causes from constructor defaults", () =>
    Effect.gen(function*() {
      const issue = new SchemaIssue.InvalidValue({ message: "schema issue" })
      const defect = new Error("cleanup failed")
      const schema = Schema.Struct({
        value: Schema.String.pipe(
          Schema.withConstructorDefault(Effect.fail(issue).pipe(Effect.ensuring(Effect.die(defect))))
        )
      })
      const assertions = new TestSchema.Asserts(schema).make()

      const exit = yield* Effect.exit(assertions.failEffect({}, "schema issue"))
      assert.isTrue(Exit.isFailure(exit))
      if (Exit.isFailure(exit)) {
        assert.deepStrictEqual(exit.cause.reasons.map((reason) => reason._tag), ["Die", "Die"])
        const [validation, cleanup] = exit.cause.reasons
        assert.isTrue(Cause.isDieReason(validation) && SchemaIssue.isIssue(validation.defect))
        if (Cause.isDieReason(validation) && SchemaIssue.isIssue(validation.defect)) {
          assert.include(SchemaIssue.defaultFormatter(validation.defect), "schema issue")
        }
        assert.isTrue(Cause.isDieReason(cleanup) && cleanup.defect === defect)
      }
    }))

  for (const method of ["decoding", "encoding", "roundTrip"] as const) {
    it.effect(`${method} propagates interruption and runs finalizers`, () =>
      Effect.gen(function*() {
        const started = yield* Deferred.make<void>()
        const finalized = yield* Ref.make(false)
        const check = SchemaGetter.checkEffect<string>(() =>
          Effect.andThen(Deferred.succeed(started, undefined), Effect.never).pipe(
            Effect.ensuring(Ref.set(finalized, true))
          )
        )
        const schema = Schema.String.pipe(Schema.decode({ decode: check, encode: check }))
        const asserts = new TestSchema.Asserts(schema)
        const effect = method === "roundTrip"
          ? asserts.verifyRoundTripEffect({ runs: 1, seed: 1 })
          : asserts[method]().failEffect("value", "should not pass")
        const fiber = yield* Effect.forkChild(effect)
        yield* Deferred.await(started)
        yield* Fiber.interrupt(fiber)
        assert.isTrue(yield* Ref.get(finalized))
        const exit = yield* Fiber.await(fiber)
        assert.isTrue(Exit.isFailure(exit))
        if (Exit.isFailure(exit)) {
          assert.isTrue(Cause.hasInterruptsOnly(exit.cause))
        }
      }))
  }

  it.effect("round trips use both decoding and encoding services lazily", () =>
    Effect.gen(function*() {
      class Decoding extends Context.Service<Decoding, Ref.Ref<number>>()("Decoding") {}
      class Encoding extends Context.Service<Encoding, Ref.Ref<number>>()("Encoding") {}
      const schema = Schema.String.pipe(Schema.decode({
        decode: SchemaGetter.checkEffect(() =>
          Effect.flatMap(Decoding, (ref) => Ref.update(ref, (n) => n + 1)).pipe(Effect.as(true))
        ),
        encode: SchemaGetter.checkEffect(() =>
          Effect.flatMap(Encoding, (ref) => Ref.update(ref, (n) => n + 1)).pipe(Effect.as(true))
        )
      }))
      const decoding = yield* Ref.make(0)
      const encoding = yield* Ref.make(0)
      const assertion = new TestSchema.Asserts(schema).verifyRoundTripEffect({ runs: 3, seed: 1 })
      assert.strictEqual(yield* Ref.get(decoding), 0)
      assert.strictEqual(yield* Ref.get(encoding), 0)
      yield* assertion.pipe(Effect.provide(Layer.mergeAll(
        Layer.succeed(Decoding, decoding),
        Layer.succeed(Encoding, encoding)
      )))
      assert.strictEqual(yield* Ref.get(decoding), 3)
      assert.strictEqual(yield* Ref.get(encoding), 3)
    }))

  it.effect("round-trip assertion defects report shrunk inputs and replay", () =>
    Effect.gen(function*() {
      const schema = Schema.Number.pipe(Schema.decodeTo(
        Schema.Number,
        SchemaTransformation.transform({ decode: (value) => value, encode: () => 0 })
      ))
      const exit = yield* Effect.exit(
        new TestSchema.Asserts(schema).verifyRoundTripEffect({ runs: 20, seed: "lossy" })
      )
      assert.isTrue(Exit.isFailure(exit))
      if (Exit.isFailure(exit)) {
        const error = Cause.squash(exit.cause)
        assert.instanceOf(error, AssertionError)
        assert.match(error.message, /Property falsified/)
        assert.match(error.message, /Shrunk input:/)
        assert.match(error.message, /Replay:/)
      }
    }))

  it.effect("round trips preserve schema defects", () =>
    Effect.gen(function*() {
      const defect = new Error("round-trip defect")
      const schema = Schema.String.pipe(Schema.decode({
        decode: SchemaGetter.passthrough(),
        encode: SchemaGetter.checkEffect(() => Effect.die(defect))
      }))
      const assertion = new TestSchema.Asserts(schema).verifyRoundTripEffect({ runs: 1, seed: 1 })
      assert.deepStrictEqual(yield* Effect.exit(assertion), Exit.die(defect))
    }))
})
