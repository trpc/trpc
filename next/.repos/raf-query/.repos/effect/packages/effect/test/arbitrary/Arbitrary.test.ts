import { assert, describe, it } from "@effect/vitest"
import {
  Deferred,
  Effect,
  Exit,
  Fiber,
  Option,
  Order,
  Random,
  Result,
  Schema,
  SchemaIssue,
  SchemaTransformation
} from "effect"
import * as Arbitrary from "effect/Arbitrary"
import * as BigDecimal from "effect/BigDecimal"
import * as Chunk from "effect/Chunk"
import * as DateTime from "effect/DateTime"
import * as HashMap from "effect/HashMap"
import * as HashSet from "effect/HashSet"
import * as Scheduler from "effect/Scheduler"

const makeSuspendChain = (count: number): Schema.Codec<unknown> => {
  let schema: Schema.Codec<unknown> = Schema.Null
  for (let index = 0; index < count; index++) {
    const next = schema
    schema = Schema.suspend(() => next)
  }
  return schema
}

interface SchemaCatalogEntry {
  readonly name: string
  readonly schema: Schema.Top
}

const verifySchemaCatalog = Effect.fnUntraced(function*(entries: ReadonlyArray<SchemaCatalogEntry>) {
  for (const entry of entries) {
    const result = yield* Arbitrary.checkEffect(Arbitrary.schema(entry.schema), Schema.is(entry.schema), {
      runs: 100,
      maxDiscards: 200,
      seed: `schema-catalog:${entry.name}`
    })
    assert.strictEqual(result._tag, "Passed", entry.name)
    if (result._tag === "Passed") {
      assert.strictEqual(result.runs, 100, entry.name)
      assert.isAtMost(result.discards, 200, entry.name)
    }
  }
})

describe("Arbitrary", () => {
  describe("isArbitrary", () => {
    it("identifies Arbitrary values", () => {
      assert.isTrue(Arbitrary.isArbitrary(Arbitrary.schema(Schema.String)))
      assert.isFalse(Arbitrary.isArbitrary(Schema.String))
      assert.isFalse(Arbitrary.isArbitrary(null))
    })
  })

  describe("schema", () => {
    it.effect("uses a custom Schema shrinker", () =>
      Effect.gen(function*() {
        const arbitrary = Arbitrary.schema(Schema.Literals(["large", "small"]), {
          shrink: (value) => value === "large" ? ["small"] as const : []
        })
        const result = yield* Arbitrary.checkEffect(arbitrary, () => false, {
          runs: 1,
          maxDiscards: 0,
          seed: 0
        })

        assert.strictEqual(result._tag, "Falsified")
        if (result._tag === "Falsified") {
          assert.strictEqual(result.initialInput, "large")
          assert.strictEqual(result.shrunkInput, "small")
          assert.strictEqual(result.shrinks, 1)

          const replayed = yield* Arbitrary.checkEffect(arbitrary, () => false, { replay: result.replay })
          assert.deepStrictEqual(replayed, result)
        }
      }))

    it.effect("validates custom shrink candidates before evaluating the property", () =>
      Effect.gen(function*() {
        const arbitrary = Arbitrary.schema(Schema.Literals(["large", "small"]), {
          shrink: (value) => value === "large" ? ["invalid" as "large", "small"] as const : []
        })
        const limitedEvaluated: Array<string> = []
        const limited = yield* Arbitrary.checkEffect(arbitrary, (value) => {
          limitedEvaluated.push(value)
          return false
        }, {
          runs: 1,
          maxDiscards: 0,
          maxShrinks: 1,
          seed: 0
        })

        assert.strictEqual(limited._tag, "Falsified")
        if (limited._tag === "Falsified") {
          assert.strictEqual(limited.shrunkInput, "large")
          assert.strictEqual(limited.shrinks, 0)
          assert.deepStrictEqual(limitedEvaluated, ["large"])
        }

        const evaluated: Array<string> = []
        const result = yield* Arbitrary.checkEffect(arbitrary, (value) => {
          evaluated.push(value)
          return false
        }, {
          runs: 1,
          maxDiscards: 0,
          maxShrinks: 2,
          seed: 0
        })

        assert.strictEqual(result._tag, "Falsified")
        if (result._tag === "Falsified") {
          assert.strictEqual(result.shrunkInput, "small")
          assert.strictEqual(result.shrinks, 1)
          assert.deepStrictEqual(evaluated, ["large", "small"])
        }
      }))

    it.effect("evaluates a custom shrinker only while shrinking a failure", () =>
      Effect.gen(function*() {
        let calls = 0
        const arbitrary = Arbitrary.schema(Schema.Literals(["large", "small"]), {
          shrink: () => {
            calls++
            return []
          }
        })

        yield* Arbitrary.sampleEffect(arbitrary, { count: 1, maxDiscards: 0, seed: 0 })
        yield* Arbitrary.checkEffect(arbitrary, () => true, { runs: 1, maxDiscards: 0, seed: 0 })
        assert.strictEqual(calls, 0)

        yield* Arbitrary.checkEffect(arbitrary, () => false, { runs: 1, maxDiscards: 0, seed: 0 })
        assert.strictEqual(calls, 1)
      }))

    it.effect("replaces Schema-derived shrinking with the custom shrinker", () =>
      Effect.gen(function*() {
        const schema = Schema.BigInt.check(Schema.isBetweenBigInt({ minimum: 100n, maximum: 1_000n }))
        const result = yield* Arbitrary.checkEffect(Arbitrary.schema(schema, { shrink: () => [] }), () => false, {
          runs: 1,
          seed: 21
        })

        assert.strictEqual(result._tag, "Falsified")
        if (result._tag === "Falsified") {
          assert.isTrue(result.initialInput > 100n)
          assert.strictEqual(result.shrunkInput, result.initialInput)
          assert.strictEqual(result.shrinks, 0)
        }
      }))

    it.effect("generates deterministic samples and pushes constraints into primitive constructors", () =>
      Effect.gen(function*() {
        const schema = Schema.String.check(Schema.isMinLength(8), Schema.isMaxLength(8))
        const arbitrary = Arbitrary.schema(schema)
        const first = yield* Arbitrary.sampleEffect(arbitrary, { count: 20, maxDiscards: 0, seed: "constraint" })
        const second = yield* Arbitrary.sampleEffect(arbitrary, { count: 20, maxDiscards: 0, seed: "constraint" })

        assert.deepStrictEqual(first, second)
        assert.isTrue(first.every((value) => value.length === 8))
      }))

    it.effect("constructs strings for the regular pattern subset", () =>
      Effect.gen(function*() {
        const schemas = [
          Schema.String.check(Schema.isPattern(/^[A-Z]{3}[0-9]{3}$/)),
          Schema.String.check(Schema.isPattern(/^(?:foo|bar)-[^0-9]\s?\w+$/)),
          Schema.String.check(Schema.isPattern(/^a+?$/)),
          Schema.String.check(Schema.isPattern(/^\x41\u0042\cC$/)),
          Schema.String.check(Schema.isPattern(/^\u{1f600}{2}$/u)),
          Schema.String.check(Schema.isPattern(/^effect$/y))
        ]
        for (let index = 0; index < schemas.length; index++) {
          const values = yield* Arbitrary.sampleEffect(Arbitrary.schema(schemas[index]), {
            count: 20,
            maxDiscards: 20,
            seed: `regular-pattern-${index}`
          })
          assert.isTrue(values.every(Schema.is(schemas[index])))
        }
      }))

    it.effect("constructs strings with code point bounds and UTF-16 length bounds", () =>
      Effect.gen(function*() {
        const schemas = [
          Schema.String.check(Schema.isMinCodePoints(128)),
          Schema.String.check(Schema.isMaxCodePoints(0)),
          Schema.String.check(Schema.isBetweenCodePoints(2, 4)),
          Schema.String.check(Schema.isMinCodePoints(3), Schema.isMinCodePoints(4), Schema.isMaxCodePoints(4)),
          Schema.String.check(Schema.isMinCodePoints(4), Schema.isMaxCodePoints(5), Schema.isMaxCodePoints(4)),
          Schema.String.check(Schema.isBetweenLength(8, 8), Schema.isBetweenCodePoints(4, 4)),
          Schema.String.check(Schema.isMaxLength(4), Schema.isMinCodePoints(4)),
          Schema.String.check(Schema.isPattern(/^\u{1f600}{4}$/u), Schema.isBetweenCodePoints(4, 4))
        ]
        for (let index = 0; index < schemas.length; index++) {
          const schema = schemas[index]
          const values = yield* Arbitrary.sampleEffect(Arbitrary.schema(schema), {
            count: 20,
            maxDiscards: 0,
            size: 0,
            seed: `code-points-${index}`
          })
          assert.isTrue(values.every(Schema.is(schema)))
        }
      }))

    it.effect("generates variable-length supplementary patterns above the default size", () =>
      Effect.gen(function*() {
        const schema = Schema.String.check(Schema.isPattern(/^\u{1f600}+$/u), Schema.isMinCodePoints(128))
        const values = yield* Arbitrary.sampleEffect(Arbitrary.schema(schema), {
          count: 5,
          maxDiscards: 100,
          seed: 42
        })
        assert.isTrue(values.every(Schema.is(schema)))
      }))

    it.effect("generates variable-length patterns with code point bounds at size zero", () =>
      Effect.gen(function*() {
        const schemas = [
          Schema.String.check(
            Schema.isPattern(/^\u{1f600}+$/u),
            Schema.isBetweenCodePoints(4, 4),
            Schema.isMaxLength(8)
          ),
          Schema.String.check(Schema.isPattern(/^a+$/), Schema.isBetweenCodePoints(4, 4), Schema.isMaxLength(4)),
          Schema.String.check(
            Schema.isPattern(/^(?:a|\u{1f600})+$/u),
            Schema.isBetweenCodePoints(4, 4),
            Schema.isMaxLength(6)
          )
        ]
        for (let index = 0; index < schemas.length; index++) {
          const schema = schemas[index]
          const values = yield* Arbitrary.sampleEffect(Arbitrary.schema(schema), {
            count: 20,
            maxDiscards: 100,
            size: 0,
            seed: `code-point-pattern-${index}`
          })
          assert.isTrue(values.every(Schema.is(schema)))
        }
      }))

    it.effect("reaches longer pattern alternatives under a maximum code point bound", () =>
      Effect.gen(function*() {
        for (const size of [undefined, 0]) {
          const schema = Schema.String.check(
            Schema.isPattern(/^(?:a{129}|\u{1f600}{128})$/u),
            Schema.isMaxCodePoints(128)
          )
          const values = yield* Arbitrary.sampleEffect(Arbitrary.schema(schema), {
            count: 10,
            maxDiscards: 100,
            seed: 42,
            ...(size === undefined ? {} : { size })
          })
          assert.deepStrictEqual(values, Array(10).fill("😀".repeat(128)))
        }
      }))

    it.effect("respects UTF-16 limits and large code point maxima for patterns", () =>
      Effect.gen(function*() {
        const schemas = [
          Schema.String.check(
            Schema.isPattern(/^(?:aaa|\u{1f600}{2})$/u),
            Schema.isMaxCodePoints(2),
            Schema.isMaxLength(4)
          ),
          Schema.String.check(Schema.isPattern(/^a+$/), Schema.isMaxCodePoints(1_000_000))
        ]
        for (const schema of schemas) {
          const values = yield* Arbitrary.sampleEffect(Arbitrary.schema(schema), {
            count: 10,
            maxDiscards: 100,
            seed: 42,
            size: 0
          })
          assert.isTrue(values.every(Schema.is(schema)))
        }
      }))

    it.effect("generates supplementary code points and preserves bounds while shrinking", () =>
      Effect.gen(function*() {
        const schema = Schema.String.check(Schema.isBetweenCodePoints(1, 1))
        const arbitrary = Arbitrary.schema(schema)
        const values = yield* Arbitrary.sampleEffect(arbitrary, {
          count: 100,
          maxDiscards: 0,
          seed: "supplementary-code-points"
        })
        assert.isTrue(values.some((value) => value.length === 2))
        assert.isTrue(values.every((value) => [...value].length === 1))

        const evaluated: Array<string> = []
        const result = yield* Arbitrary.checkEffect(arbitrary, (value) => {
          evaluated.push(value)
          return false
        }, { runs: 1, seed: "code-point-shrink" })
        assert.strictEqual(result._tag, "Falsified")
        assert.isTrue(evaluated.every((value) => [...value].length === 1))
        if (result._tag === "Falsified") assert.strictEqual(result.shrunkInput, "\0")
      }))

    it("rejects contradictory code point and UTF-16 length constraints", () => {
      for (
        const schema of [
          Schema.String.check(Schema.isMinCodePoints(3), Schema.isMaxCodePoints(2)),
          Schema.String.check(Schema.isMinCodePoints(3), Schema.isMaxLength(2)),
          Schema.String.check(Schema.isMinLength(3), Schema.isMaxCodePoints(1))
        ]
      ) {
        assert.throws(() => Arbitrary.schema(schema), /Unable to derive an arbitrary for .*constraints/)
      }
    })

    it.effect("covers feasible regular-expression alternatives under a length bound", () =>
      Effect.gen(function*() {
        const pattern = /^(?:a|[B-D]{2}|[0-9]{3}){16}$/
        const schema = Schema.String.check(Schema.isPattern(pattern), Schema.isMaxLength(32))
        const values = yield* Arbitrary.sampleEffect(Arbitrary.schema(schema), {
          count: 64,
          maxDiscards: 0,
          seed: 42,
          size: 32
        })

        assert.isTrue(values.every(Schema.is(schema)))
        assert.isAbove(new Set(values.map((value) => value.length)).size, 1)
        assert.isTrue(values.some((value) => value.includes("a")))
        assert.isTrue(values.some((value) => /[B-D]{2}/.test(value)))
        assert.isTrue(values.some((value) => /[0-9]{3}/.test(value)))
      }))

    it.effect("honors dot-all and sticky regular-expression flags", () =>
      Effect.gen(function*() {
        const dotAll = Schema.String.check(Schema.isPattern(/^.$/s))
        const dotAllValues = yield* Arbitrary.sampleEffect(Arbitrary.schema(dotAll), {
          count: 200,
          maxDiscards: 0,
          seed: 0
        })
        assert.isTrue(dotAllValues.every(Schema.is(dotAll)))
        assert.isTrue(dotAllValues.some((value) => /[\n\r\u2028\u2029]/.test(value)))

        const sticky = Schema.String.check(Schema.isPattern(/a/y))
        const stickyValues = yield* Arbitrary.sampleEffect(Arbitrary.schema(sticky), {
          count: 100,
          maxDiscards: 0,
          seed: "sticky-pattern"
        })
        assert.isTrue(stickyValues.every(Schema.is(sticky)))
        assert.isTrue(stickyValues.some((value) => value.length > 1))
      }))

    it.effect("biases broad character classes toward common characters while exploring their full domain", () =>
      Effect.gen(function*() {
        const schema = Schema.String.check(Schema.isPattern(/^.$/u))
        const values = yield* Arbitrary.sampleEffect(Arbitrary.schema(schema), {
          count: 200,
          maxDiscards: 0,
          seed: "broad-character-class"
        })

        assert.isTrue(values.some((value) => /^[\x20-\x7e]$/u.test(value)))
        assert.isTrue(values.some((value) => value.codePointAt(0)! > 0x1f600))
      }))

    it.effect("constructs strings for built-in pattern checks", () =>
      Effect.gen(function*() {
        const schemas = [
          Schema.String.check(Schema.isTrimmed()),
          Schema.String.check(Schema.isUppercased()),
          Schema.String.check(Schema.isLowercased()),
          Schema.String.check(Schema.isCapitalized()),
          Schema.String.check(Schema.isUncapitalized()),
          Schema.String.check(Schema.isStartingWith("a.b")),
          Schema.String.check(Schema.isEndingWith("a.b")),
          Schema.String.check(Schema.isIncluding("a.b"))
        ]
        for (let index = 0; index < schemas.length; index++) {
          const values = yield* Arbitrary.sampleEffect(Arbitrary.schema(schemas[index]), {
            count: 20,
            maxDiscards: 100,
            seed: `built-in-pattern-${index}`
          })
          assert.isTrue(values.every(Schema.is(schemas[index])))
        }
      }))

    it.effect("generates RegExp declarations without codec filtering", () =>
      Effect.gen(function*() {
        const values = yield* Arbitrary.sampleEffect(Arbitrary.schema(Schema.RegExp), {
          count: 100,
          maxDiscards: 0,
          seed: "regexp-declaration"
        })

        assert.isTrue(values.every((value) => value instanceof globalThis.RegExp))
        assert.isTrue(new Set(values.map((value) => value.source)).size > 1)
        assert.isTrue(new Set(values.map((value) => value.flags)).size > 1)
      }))

    it.effect("generates and shrinks web URL declarations without codec filtering", () =>
      Effect.gen(function*() {
        const arbitrary = Arbitrary.schema(Schema.URL)
        const values = yield* Arbitrary.sampleEffect(arbitrary, {
          count: 200,
          maxDiscards: 0,
          seed: "url-declaration",
          size: 10
        })

        assert.isTrue(values.every((value) => value instanceof globalThis.URL))
        assert.deepStrictEqual(new Set(values.map((value) => value.protocol)), new Set(["http:", "https:"]))
        assert.isTrue(values.some((value) => value.pathname !== "/"))

        const result = yield* Arbitrary.checkEffect(arbitrary, () => false, {
          runs: 1,
          maxDiscards: 0,
          seed: "url-shrink",
          size: 10
        })
        assert.strictEqual(result._tag, "Falsified")
        if (result._tag === "Falsified") {
          assert.isAbove(result.shrinks, 0)
          assert.match(result.shrunkInput.protocol, /^https?:$/)
        }
      }))

    it.effect("generates and shrinks Date declarations constructively across their full domain", () =>
      Effect.gen(function*() {
        const values = yield* Arbitrary.sampleEffect(Arbitrary.schema(Schema.Date), {
          count: 25_000,
          maxDiscards: 0,
          seed: "date-declaration"
        })
        const timestamps = values.map((value) => value.getTime())

        assert.include(timestamps, -8_640_000_000_000_000)
        assert.include(timestamps, 0)
        assert.include(timestamps, 8_640_000_000_000_000)
        assert.isTrue(values.every(Schema.is(Schema.Date)))

        const constrained = Schema.Date.check(Schema.isBetweenDate({
          minimum: new globalThis.Date(0),
          maximum: new globalThis.Date(10),
          exclusiveMinimum: true,
          exclusiveMaximum: true
        }))
        const constrainedValues = yield* Arbitrary.sampleEffect(Arbitrary.schema(constrained), {
          count: 500,
          maxDiscards: 0,
          seed: "date-constraints"
        })
        const constrainedTimestamps = constrainedValues.map((value) => value.getTime())
        assert.include(constrainedTimestamps, 1)
        assert.include(constrainedTimestamps, 9)
        assert.isTrue(constrainedValues.every(Schema.is(constrained)))

        const result = yield* Arbitrary.checkEffect(Arbitrary.schema(Schema.Date), () => false, {
          runs: 1,
          maxDiscards: 0,
          seed: "date-shrink"
        })
        assert.strictEqual(result._tag, "Falsified")
        if (result._tag === "Falsified") assert.strictEqual(result.shrunkInput.getTime(), 0)
      }))

    it.effect("generates and shrinks BigDecimal declarations constructively", () =>
      Effect.gen(function*() {
        const arbitrary = Arbitrary.schema(Schema.BigDecimal)
        const values = yield* Arbitrary.sampleEffect(arbitrary, {
          count: 500,
          maxDiscards: 0,
          seed: "big-decimal-declaration",
          size: 10
        })

        assert.isTrue(values.every(Schema.is(Schema.BigDecimal)))
        assert.isAbove(new Set(values.map((value) => value.scale)).size, 1)

        const constrained = Schema.BigDecimal.check(Schema.isBetweenBigDecimal({
          minimum: BigDecimal.make(1_234n, 3),
          maximum: BigDecimal.make(1_236n, 3),
          exclusiveMinimum: true,
          exclusiveMaximum: true
        }))
        const constrainedValues = yield* Arbitrary.sampleEffect(Arbitrary.schema(constrained), {
          count: 500,
          maxDiscards: 0,
          seed: "big-decimal-constraints",
          size: 10
        })

        assert.isTrue(constrainedValues.every(Schema.is(constrained)))

        const highScale = Schema.BigDecimal.check(Schema.isBetweenBigDecimal({
          minimum: BigDecimal.make(-12_345n, 22),
          maximum: BigDecimal.make(678_901n, 24)
        }))
        const highScaleValues = yield* Arbitrary.sampleEffect(Arbitrary.schema(highScale), {
          count: 500,
          maxDiscards: 0,
          seed: "big-decimal-high-scale-constraints",
          size: 10
        })

        assert.isTrue(highScaleValues.every(Schema.is(highScale)))

        const result = yield* Arbitrary.checkEffect(arbitrary, () => false, {
          runs: 1,
          maxDiscards: 0,
          seed: "big-decimal-shrink",
          size: 10
        })
        assert.strictEqual(result._tag, "Falsified")
        if (result._tag === "Falsified") {
          assert.isTrue(BigDecimal.Equivalence(result.shrunkInput, BigDecimal.make(0n, 0)))
        }
      }))

    it.effect("covers independent BigDecimal precision and exponent ranges", () =>
      Effect.gen(function*() {
        const values = yield* Arbitrary.sampleEffect(Arbitrary.schema(Schema.BigDecimal), {
          count: 1_000,
          maxDiscards: 0,
          seed: "big-decimal-precision-and-exponent",
          size: 1
        })

        assert.isTrue(values.some((value) => Math.abs(value.scale) > 20))
        assert.isTrue(values.some((value) => {
          const magnitude = value.value < 0n ? -value.value : value.value
          return magnitude.toString().length > 20
        }))
      }))

    it.effect("constructs BigDecimals in narrow and extreme-scale intervals", () =>
      Effect.gen(function*() {
        const narrow = Schema.BigDecimal.check(Schema.isBetweenBigDecimal({
          minimum: BigDecimal.make(123_456_789n, 1_000),
          maximum: BigDecimal.make(123_456_799n, 1_000),
          exclusiveMinimum: true,
          exclusiveMaximum: true
        }))
        const narrowValues = yield* Arbitrary.sampleEffect(Arbitrary.schema(narrow), {
          count: 200,
          maxDiscards: 0,
          seed: "big-decimal-narrow-extreme"
        })
        assert.isTrue(narrowValues.every(Schema.is(narrow)))

        const maximumScale = Schema.BigDecimal.check(Schema.isBetweenBigDecimal({
          minimum: BigDecimal.make(0n, Number.MAX_SAFE_INTEGER),
          maximum: BigDecimal.make(1n, Number.MAX_SAFE_INTEGER)
        }))
        const maximumScaleValues = yield* Arbitrary.sampleEffect(Arbitrary.schema(maximumScale), {
          count: 50,
          maxDiscards: 0,
          seed: "big-decimal-maximum-scale"
        })
        assert.isTrue(maximumScaleValues.every(Schema.is(maximumScale)))
      }))

    it.effect("recognizes equivalent BigDecimal singleton bounds", () =>
      Effect.gen(function*() {
        for (
          const [minimum, maximum] of [
            [BigDecimal.make(1n, 0), BigDecimal.make(10n, 1)],
            [BigDecimal.make(10n ** 4097n, 0), BigDecimal.make(1n, -4097)],
            [BigDecimal.make(-1n, -4097), BigDecimal.make(-(10n ** 4097n), 0)],
            [BigDecimal.make(0n, Number.MIN_SAFE_INTEGER), BigDecimal.make(0n, Number.MAX_SAFE_INTEGER)]
          ]
        ) {
          const schema = Schema.BigDecimal.check(Schema.isBetweenBigDecimal({ minimum, maximum }))
          const values = yield* Arbitrary.sampleEffect(Arbitrary.schema(schema), {
            count: 20,
            maxDiscards: 0,
            seed: "big-decimal-singleton"
          })

          assert.isTrue(values.every((value) => BigDecimal.Equivalence(value, minimum)))
        }
      }))

    it.effect("preserves both BigDecimal bounds across large scale differences", () =>
      Effect.gen(function*() {
        const near = BigDecimal.make(10n ** 4097n - 1n, 0)
        const far = BigDecimal.make(1n, -4097)
        for (const [minimum, maximum] of [[near, far], [BigDecimal.negate(far), BigDecimal.negate(near)]]) {
          for (const exclusive of [false, true]) {
            const schema = Schema.BigDecimal.check(Schema.isBetweenBigDecimal({
              minimum,
              maximum,
              exclusiveMinimum: exclusive,
              exclusiveMaximum: exclusive
            }))
            const values = yield* Arbitrary.sampleEffect(Arbitrary.schema(schema), {
              count: 100,
              maxDiscards: 0,
              seed: "big-decimal-large-scale-difference"
            })

            assert.isTrue(values.every(Schema.is(schema)))
            assert.isTrue(
              values.some((value) => BigDecimal.Order(value, minimum) > 0 && BigDecimal.Order(value, maximum) < 0)
            )
          }
        }
      }))

    it("rejects empty BigDecimal intervals at the maximum scale", () => {
      const schema = Schema.BigDecimal.check(Schema.isBetweenBigDecimal({
        minimum: BigDecimal.make(0n, Number.MAX_SAFE_INTEGER),
        maximum: BigDecimal.make(1n, Number.MAX_SAFE_INTEGER),
        exclusiveMinimum: true,
        exclusiveMaximum: true
      }))

      assert.throws(() => Arbitrary.schema(schema), /Unable to derive an arbitrary for BigDecimal constraints/)
    })

    it.effect("shrinks BigDecimals by numeric value across representations", () =>
      Effect.gen(function*() {
        const one = BigDecimal.make(1n, 0)
        const onePointOne = BigDecimal.make(11n, 1)
        const schema = Schema.BigDecimal.check(Schema.isGreaterThanOrEqualToBigDecimal(BigDecimal.make(1n, 1)))
        const arbitrary = Arbitrary.schema(schema)
        const result = yield* Arbitrary.checkEffect(arbitrary, (value) => BigDecimal.Order(value, one) <= 0, {
          runs: 100,
          maxDiscards: 0,
          maxShrinks: 100,
          seed: "big-decimal-numeric-shrink"
        })

        assert.strictEqual(result._tag, "Falsified")
        if (result._tag === "Falsified") {
          assert.isTrue(BigDecimal.Order(result.shrunkInput, one) > 0)
          assert.isTrue(BigDecimal.Order(result.shrunkInput, onePointOne) <= 0)
          const replayed = yield* Arbitrary.checkEffect(arbitrary, (value) => BigDecimal.Order(value, one) <= 0, {
            replay: result.replay
          })
          assert.strictEqual(replayed._tag, "Falsified")
          if (replayed._tag === "Falsified") {
            assert.isTrue(BigDecimal.Equivalence(replayed.initialInput, result.initialInput))
            assert.isTrue(BigDecimal.Equivalence(replayed.shrunkInput, result.shrunkInput))
            assert.strictEqual(replayed.shrinks, result.shrinks)
          }
        }
      }))

    it.effect("shrinks BigDecimals toward ordinary thresholds between simple candidates", () =>
      Effect.gen(function*() {
        for (const [low, high, boundary] of [[1, 10, 7], [100, 101, 100.5], [0.1, 10, 1]]) {
          for (const sign of [1, -1]) {
            const minimum = BigDecimal.fromNumberUnsafe(sign > 0 ? low : -high)
            const maximum = BigDecimal.fromNumberUnsafe(sign > 0 ? high : -low)
            const threshold = BigDecimal.fromNumberUnsafe(sign * boundary)
            const tolerance = BigDecimal.fromNumberUnsafe(sign * (boundary + 0.01))
            const schema = Schema.BigDecimal.check(Schema.isBetweenBigDecimal({ minimum, maximum }))
            const arbitrary = Arbitrary.schema(schema)
            const property = (value: BigDecimal.BigDecimal) => sign * BigDecimal.Order(value, threshold) <= 0
            const result = yield* Arbitrary.checkEffect(arbitrary, property, {
              seed: "b",
              runs: 100,
              maxShrinks: 100,
              maxDiscards: 0
            })

            assert.strictEqual(result._tag, "Falsified")
            if (result._tag === "Falsified") {
              assert.isTrue(sign * BigDecimal.Order(result.initialInput, tolerance) > 0)
              assert.isTrue(sign * BigDecimal.Order(result.shrunkInput, threshold) > 0)
              assert.isTrue(sign * BigDecimal.Order(result.shrunkInput, tolerance) <= 0)
              assert.isTrue(Schema.is(schema)(result.shrunkInput))
              const replayed = yield* Arbitrary.checkEffect(arbitrary, property, { replay: result.replay })
              assert.strictEqual(replayed._tag, "Falsified")
              if (replayed._tag === "Falsified") {
                assert.isTrue(BigDecimal.Equivalence(replayed.initialInput, result.initialInput))
                assert.isTrue(BigDecimal.Equivalence(replayed.shrunkInput, result.shrunkInput))
                assert.strictEqual(replayed.shrinks, result.shrinks)
                assert.strictEqual(replayed.replay, result.replay)
              }
            }
          }
        }
      }))

    it.effect("generates and shrinks DateTime.Utc declarations constructively", () =>
      Effect.gen(function*() {
        const arbitrary = Arbitrary.schema(Schema.DateTimeUtc)
        const values = yield* Arbitrary.sampleEffect(arbitrary, {
          count: 1_000,
          maxDiscards: 0,
          seed: "date-time-utc-declaration",
          size: 10
        })

        assert.isTrue(values.every(Schema.is(Schema.DateTimeUtc)))

        const isBetweenDateTime = Schema.makeIsBetween({ order: DateTime.Order })
        const constrained = Schema.DateTimeUtc.check(isBetweenDateTime({
          minimum: DateTime.makeUnsafe(0),
          maximum: DateTime.makeUnsafe(10),
          exclusiveMinimum: true,
          exclusiveMaximum: true
        }))
        const constrainedValues = yield* Arbitrary.sampleEffect(Arbitrary.schema(constrained), {
          count: 500,
          maxDiscards: 0,
          seed: "date-time-utc-constraints",
          size: 10
        })

        assert.isTrue(constrainedValues.every(Schema.is(constrained)))
        assert.isTrue(constrainedValues.every((value) => value.epochMilliseconds > 0 && value.epochMilliseconds < 10))

        const result = yield* Arbitrary.checkEffect(arbitrary, () => false, {
          runs: 1,
          maxDiscards: 0,
          seed: "date-time-utc-shrink",
          size: 10
        })
        assert.strictEqual(result._tag, "Falsified")
        if (result._tag === "Falsified") assert.strictEqual(result.shrunkInput.epochMilliseconds, 0)
      }))

    it.effect("generates named and offset TimeZone declarations constructively", () =>
      Effect.gen(function*() {
        const named = yield* Arbitrary.sampleEffect(Arbitrary.schema(Schema.TimeZoneNamed), {
          count: 200,
          maxDiscards: 0,
          seed: "time-zone-named-declaration",
          size: 10
        })
        const zones = yield* Arbitrary.sampleEffect(Arbitrary.schema(Schema.TimeZone), {
          count: 1_000,
          maxDiscards: 0,
          seed: "time-zone-declaration",
          size: 10
        })

        assert.isTrue(named.every(Schema.is(Schema.TimeZoneNamed)))
        assert.isAbove(new Set(named.map((value) => value.id)).size, 1)
        assert.isTrue(zones.every(Schema.is(Schema.TimeZone)))
        assert.isTrue(zones.some(DateTime.isTimeZoneNamed))
        assert.isTrue(zones.some(DateTime.isTimeZoneOffset))
      }))

    it.effect("generates and shrinks DateTime.Zoned declarations constructively", () =>
      Effect.gen(function*() {
        const arbitrary = Arbitrary.schema(Schema.DateTimeZoned)
        const values = yield* Arbitrary.sampleEffect(arbitrary, {
          count: 1_000,
          maxDiscards: 0,
          seed: "date-time-zoned-declaration",
          size: 10
        })

        assert.isTrue(values.every(Schema.is(Schema.DateTimeZoned)))
        assert.isTrue(values.some((value) => DateTime.isTimeZoneNamed(value.zone)))
        assert.isTrue(values.some((value) => DateTime.isTimeZoneOffset(value.zone)))

        const isBetweenDateTime = Schema.makeIsBetween({ order: DateTime.Order })
        const constrained = Schema.DateTimeZoned.check(isBetweenDateTime({
          minimum: DateTime.makeZonedUnsafe(0, { timeZone: "UTC" }),
          maximum: DateTime.makeZonedUnsafe(10, { timeZone: "UTC" }),
          exclusiveMinimum: true,
          exclusiveMaximum: true
        }))
        const constrainedValues = yield* Arbitrary.sampleEffect(Arbitrary.schema(constrained), {
          count: 500,
          maxDiscards: 0,
          seed: "date-time-zoned-constraints",
          size: 10
        })

        assert.isTrue(constrainedValues.every(Schema.is(constrained)))
        assert.isTrue(constrainedValues.every((value) => value.epochMilliseconds > 0 && value.epochMilliseconds < 10))

        const result = yield* Arbitrary.checkEffect(arbitrary, () => false, {
          runs: 1,
          maxDiscards: 0,
          seed: "date-time-zoned-shrink",
          size: 10
        })
        assert.strictEqual(result._tag, "Falsified")
        if (result._tag === "Falsified") assert.strictEqual(result.shrunkInput.epochMilliseconds, 0)
      }))

    it.effect("generates and shrinks Uint8Array declarations through Array semantics", () =>
      Effect.gen(function*() {
        const schema = Schema.Uint8Array.check(Schema.isMinLength(2), Schema.isMaxLength(10))
        const arbitrary = Arbitrary.schema(schema)
        const values = yield* Arbitrary.sampleEffect(arbitrary, {
          count: 8_192,
          maxDiscards: 0,
          seed: "uint8-array-declaration",
          size: 10
        })
        const lengths = values.map((value) => value.length)
        const bytes = values.flatMap((value) => [...value])

        assert.isTrue(values.every((value) => value instanceof globalThis.Uint8Array))
        assert.isTrue(values.every(Schema.is(schema)))
        assert.include(lengths, 2)
        assert.include(lengths, 10)
        assert.include(bytes, 0)
        assert.include(bytes, 255)

        const result = yield* Arbitrary.checkEffect(arbitrary, () => false, {
          runs: 1,
          maxDiscards: 0,
          seed: "uint8-array-shrink",
          size: 10
        })
        assert.strictEqual(result._tag, "Falsified")
        if (result._tag === "Falsified") {
          assert.instanceOf(result.shrunkInput, globalThis.Uint8Array)
          assert.deepStrictEqual([...result.shrunkInput], [0, 0])
        }
      }))

    it.effect("explores strings around an unanchored match", () =>
      Effect.gen(function*() {
        const schema = Schema.String.check(Schema.isIncluding("needle"))
        const values = yield* Arbitrary.sampleEffect(Arbitrary.schema(schema), {
          count: 100,
          maxDiscards: 0,
          seed: "unanchored-pattern"
        })

        assert.isTrue(values.every(Schema.is(schema)))
        assert.isTrue(values.some((value) => value !== "needle"))
        assert.isTrue(values.some((value) => value.startsWith("needle")))
        assert.isTrue(values.some((value) => value.endsWith("needle")))
      }))

    it.effect("combines constructive pattern generation with string length constraints", () =>
      Effect.gen(function*() {
        const schema = Schema.String.check(
          Schema.isPattern(/^(ab){3,10}$/),
          Schema.isMinLength(8),
          Schema.isMaxLength(12)
        )
        const values = yield* Arbitrary.sampleEffect(Arbitrary.schema(schema), {
          count: 100,
          maxDiscards: 0,
          seed: "pattern-length"
        })

        assert.isTrue(values.every(Schema.is(schema)))
        assert.isTrue(values.every((value) => value.length === 8 || value.length === 10 || value.length === 12))
      }))

    it.effect("uses every supported pattern as a candidate and validates against every pattern", () =>
      Effect.gen(function*() {
        const schema = Schema.String.check(
          Schema.isPattern(/^[^A-Z]*$/),
          Schema.isPattern(/^0x[0-9a-f]{40}$/)
        )
        const values = yield* Arbitrary.sampleEffect(Arbitrary.schema(schema), {
          count: 20,
          maxDiscards: 200,
          seed: "multiple-patterns"
        })

        assert.isTrue(values.every(Schema.is(schema)))
      }))

    it.effect("keeps unsupported patterns as residual filters", () =>
      Effect.gen(function*() {
        const schema = Schema.String.check(
          Schema.isPattern(/^(?=a)a$/),
          Schema.isPattern(/^a$/)
        )
        const values = yield* Arbitrary.sampleEffect(Arbitrary.schema(schema), {
          count: 20,
          maxDiscards: 0,
          seed: "unsupported-pattern-candidate"
        })

        assert.deepStrictEqual(values, globalThis.Array.from({ length: 20 }, () => "a"))
      }))

    it.effect("bounds fallback filtering for unsupported regular expression constructs", () =>
      Effect.gen(function*() {
        const schema = Schema.String.check(Schema.isPattern(/^(?=a)b$/))
        const result = yield* Effect.result(Arbitrary.sampleEffect(Arbitrary.schema(schema), {
          count: 1,
          maxDiscards: 2,
          seed: "unsupported-pattern"
        }))

        assert.isTrue(Result.isFailure(result))
        if (Result.isFailure(result)) {
          assert.deepStrictEqual(result.failure, {
            _tag: "SampleError",
            generated: 0,
            discards: 3,
            seed: "unsupported-pattern"
          })
        }
      }))

    it.effect("uses generic generation for permissive unsupported regular expressions", () =>
      Effect.gen(function*() {
        const schema = Schema.String.check(Schema.isPattern(/^(?=)[ -~]*$/))
        const values = yield* Arbitrary.sampleEffect(Arbitrary.schema(schema), {
          count: 20,
          maxDiscards: 20,
          seed: "unsupported-permissive-pattern"
        })

        assert.isTrue(values.every(Schema.is(schema)))
      }))

    it.effect("bounds incompatible pattern and length constraints", () =>
      Effect.gen(function*() {
        const schemas = [
          Schema.String.check(
            Schema.isPattern(/^(aa)+$/),
            Schema.isMinLength(3),
            Schema.isMaxLength(3)
          ),
          Schema.String.check(
            Schema.isPattern(/^$/),
            Schema.isMinLength(1)
          )
        ]

        for (const schema of schemas) {
          const result = yield* Effect.result(Arbitrary.sampleEffect(Arbitrary.schema(schema), {
            count: 1,
            maxDiscards: 2,
            seed: "incompatible-pattern-length"
          }))

          assert.isTrue(Result.isFailure(result))
          if (Result.isFailure(result)) {
            assert.deepStrictEqual(result.failure, {
              _tag: "SampleError",
              generated: 0,
              discards: 3,
              seed: "incompatible-pattern-length"
            })
          }
        }
      }))

    it.effect("keeps pattern constraints while shrinking strings", () =>
      Effect.gen(function*() {
        const schema = Schema.String.check(Schema.isPattern(/^a+$/), Schema.isMaxLength(8))
        const evaluated: Array<string> = []
        const result = yield* Arbitrary.checkEffect(
          Arbitrary.schema(schema),
          (value) => {
            evaluated.push(value)
            return value.length < 4
          },
          { runs: 100, seed: "pattern-shrink" }
        )

        assert.strictEqual(result._tag, "Falsified")
        assert.isTrue(evaluated.every(Schema.is(schema)))
        if (result._tag === "Falsified") assert.strictEqual(result.shrunkInput.length, 4)
      }))

    it.effect("shrinks fixed-length String code units toward null", () =>
      Effect.gen(function*() {
        const schema = Schema.String.check(Schema.isMinLength(3), Schema.isMaxLength(3))
        const result = yield* Arbitrary.checkEffect(Arbitrary.schema(schema), () => false, {
          runs: 1,
          seed: "string-code-unit-shrink",
          size: 3
        })

        assert.strictEqual(result._tag, "Falsified")
        if (result._tag === "Falsified") {
          assert.notStrictEqual(result.initialInput, "\0\0\0")
          assert.strictEqual(result.shrunkInput, "\0\0\0")
        }
      }))

    it.effect("structurally shrinks regular-expression repetitions", () =>
      Effect.gen(function*() {
        const schema = Schema.String.check(Schema.isPattern(/^a*b$/), Schema.isMinLength(1), Schema.isMaxLength(8))
        const result = yield* Arbitrary.checkEffect(
          Arbitrary.schema(schema),
          () => false,
          { runs: 1, seed: "structural-pattern-shrink", size: 8 }
        )

        assert.strictEqual(result._tag, "Falsified")
        if (result._tag === "Falsified") {
          assert.notStrictEqual(result.initialInput, "b")
          assert.strictEqual(result.shrunkInput, "b")
        }
      }))

    it.effect("structurally shrinks regular-expression alternatives to the first one", () =>
      Effect.gen(function*() {
        const schema = Schema.String.check(Schema.isPattern(/^(foo|bar|baz)$/))
        const result = yield* Arbitrary.checkEffect(
          Arbitrary.schema(schema),
          () => false,
          { runs: 1, seed: "structural-alternative-shrink" }
        )

        assert.strictEqual(result._tag, "Falsified")
        if (result._tag === "Falsified") {
          assert.notStrictEqual(result.initialInput, "foo")
          assert.strictEqual(result.shrunkInput, "foo")
        }
      }))

    it.effect("derives independent random streams for adjacent attempts", () =>
      Effect.gen(function*() {
        const values = yield* Arbitrary.sampleEffect(
          Arbitrary.schema(Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: Number.MAX_SAFE_INTEGER }))),
          { count: 1_000, maxDiscards: 0, seed: "attempt-streams" }
        )

        // Numeric bias deliberately repeats small values, but attempt-local streams must still explore broadly.
        assert.isAtLeast(new Set(values).size, 750)
      }))

    it.effect("reaches both integer parities across the complete safe range", () =>
      Effect.gen(function*() {
        const schema = Schema.Int.check(Schema.isBetween({
          minimum: Number.MIN_SAFE_INTEGER,
          maximum: Number.MAX_SAFE_INTEGER
        }))
        const values = yield* Arbitrary.sampleEffect(Arbitrary.schema(schema), {
          count: 200,
          maxDiscards: 0,
          seed: "complete-safe-integer-range"
        })

        assert.isTrue(values.every(Number.isSafeInteger))
        assert.isTrue(values.some((value) => Math.abs(value % 2) === 0))
        assert.isTrue(values.some((value) => Math.abs(value % 2) === 1))
      }))

    it.effect("spreads bounded integer samples across the complete domain", () =>
      Effect.gen(function*() {
        const values = yield* Arbitrary.sampleEffect(
          Arbitrary.schema(Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 7 }))),
          { count: 8_192, maxDiscards: 0, seed: "bounded-integer-buckets" }
        )
        const buckets = Array.from({ length: 8 }, () => 0)
        for (const value of values) buckets[value]!++

        // Like fast-check v4.9.0's broad numeric smoke assertions, these bounds detect collapsed PRNG buckets without
        // specifying a public distribution.
        // https://github.com/dubzzz/fast-check/blob/v4.9.0/packages/fast-check/test/e2e/arbitraries/DoubleArbitrary.spec.ts
        for (const bucket of buckets) {
          assert.isAtLeast(bucket, values.length * 0.05)
          assert.isAtMost(bucket, values.length * 0.3)
        }
      }))

    it.effect("spreads bounded Number samples across one IEEE-754 binade", () =>
      Effect.gen(function*() {
        const schema = Schema.Number.check(Schema.isBetween({
          minimum: 1,
          maximum: 2,
          exclusiveMaximum: true
        }))
        const values = yield* Arbitrary.sampleEffect(Arbitrary.schema(schema), {
          count: 8_192,
          maxDiscards: 0,
          seed: "bounded-number-buckets"
        })
        const buckets = Array.from({ length: 4 }, () => 0)
        for (const value of values) buckets[Math.floor((value - 1) * 4)]!++

        // Edge weighting may change privately, but it must preserve broad coverage of the binade.
        for (const bucket of buckets) {
          assert.isAtLeast(bucket, values.length * 0.1)
          assert.isAtMost(bucket, values.length * 0.4)
        }
      }))

    it.effect("targets bounded integer and BigInt edges while preserving broad coverage", () =>
      Effect.gen(function*() {
        const minimumInt = -1_000_000
        const maximumInt = 1_000_000
        const ints = yield* Arbitrary.sampleEffect(
          Arbitrary.schema(Schema.Int.check(Schema.isBetween({ minimum: minimumInt, maximum: maximumInt }))),
          { count: 25_000, maxDiscards: 0, seed: "numeric-edge-bias-int" }
        )
        assert.include(ints, minimumInt)
        assert.include(ints, 0)
        assert.include(ints, maximumInt)
        assert.isAtLeast(new Set(ints).size, 15_000)

        const minimumBigInt = -(BigInt(1) << BigInt(255))
        const maximumBigInt = (BigInt(1) << BigInt(255)) - BigInt(1)
        const bigints = yield* Arbitrary.sampleEffect(
          Arbitrary.schema(Schema.BigInt.check(Schema.isBetweenBigInt({
            minimum: minimumBigInt,
            maximum: maximumBigInt
          }))),
          { count: 25_000, maxDiscards: 0, seed: "numeric-edge-bias-bigint" }
        )
        assert.include(bigints, minimumBigInt)
        assert.include(bigints, BigInt(0))
        assert.include(bigints, maximumBigInt)
        assert.isAtLeast(new Set(bigints).size, 15_000)
      }))

    it.effect("targets String, Array, and Record cardinality boundaries while preserving intermediate sizes", () =>
      Effect.gen(function*() {
        const count = 8_192
        const assertBoundaryBias = Effect.fnUntraced(function*<A>(
          schema: Schema.Schema<A>,
          cardinality: (value: A) => number
        ) {
          const values = yield* Arbitrary.sampleEffect(Arbitrary.schema(schema), {
            count,
            maxDiscards: count,
            seed: "length-edge-bias",
            size: 10
          })
          const buckets = Array.from({ length: 11 }, () => 0)
          for (const value of values) buckets[cardinality(value)]!++

          assert.isAtLeast(buckets[0], count * 0.12)
          assert.isAtLeast(buckets[10], count * 0.12)
          for (const bucket of buckets.slice(1, -1)) assert.isAtLeast(bucket, count * 0.04)
        })

        yield* assertBoundaryBias(Schema.String.check(Schema.isMaxLength(10)), (value) => value.length)
        yield* assertBoundaryBias(Schema.Array(Schema.Null).check(Schema.isMaxLength(10)), (value) => value.length)
        yield* assertBoundaryBias(
          Schema.Record(Schema.String, Schema.Null).check(Schema.isMaxProperties(10)),
          (value) => Object.keys(value).length
        )
      }))

    it.effect("starts progressive checks for Records with an explicit minimum property count", () =>
      Effect.gen(function*() {
        const schema = Schema.Record(Schema.String, Schema.Number).check(Schema.isMinProperties(2))
        const result = yield* Arbitrary.checkEffect(Arbitrary.schema(schema), Schema.is(schema), {
          runs: 20,
          maxDiscards: 200,
          seed: "record-min-properties-progressive"
        })

        assert.strictEqual(result._tag, "Passed")
      }))

    it.effect("generates ordinary and null-prototype structural objects", () =>
      Effect.gen(function*() {
        const schema = Schema.Struct({ value: Schema.Int })
        const values = yield* Arbitrary.sampleEffect(Arbitrary.schema(schema), {
          count: 512,
          maxDiscards: 0,
          seed: "object-prototypes"
        })
        const prototypes = new Set(values.map(Object.getPrototypeOf))

        assert.isTrue(values.every(Schema.is(schema)))
        assert.isTrue(prototypes.has(Object.prototype))
        assert.isTrue(prototypes.has(null))
      }))

    describe("indexed objects", () => {
      it.effect("combines fixed field constraints at size zero and starts progressive checks", () =>
        Effect.gen(function*() {
          const schema = Schema.StructWithRest(
            Schema.Struct({ fixed: Schema.String }),
            [Schema.Record(Schema.String, Schema.NonEmptyString)]
          )
          const arbitrary = Arbitrary.schema(schema)
          const values = yield* Arbitrary.sampleEffect(arbitrary, {
            count: 128,
            maxDiscards: 0,
            seed: "indexed-fixed-fields",
            size: 0
          })
          assert.isTrue(values.every(Schema.is(schema)))
          assert.isTrue(values.every((value) => value.fixed.length === 1))
          const prototypes = new Set(values.map(Object.getPrototypeOf))
          assert.isTrue(prototypes.has(null))
          assert.isTrue(prototypes.has(Object.prototype))

          const result = yield* Arbitrary.checkEffect(arbitrary, Schema.is(schema), {
            runs: 100,
            maxDiscards: 128,
            seed: "indexed-fixed-fields"
          })
          assert.strictEqual(result._tag, "Passed")
        }))

      it.effect("does not generate omitted fixed property names from indexes", () =>
        Effect.gen(function*() {
          const cases = [
            ["a", Schema.Struct({ a: Schema.optionalKey(Schema.Never) })],
            [0, Schema.Record(Schema.Literal(0), Schema.optionalKey(Schema.Never))]
          ] as const
          for (const [key, fields] of cases) {
            const schema = Schema.StructWithRest(fields, [
              Schema.Record(Schema.String.check(Schema.isPattern(new RegExp(`^${key}$`))), Schema.Boolean)
            ])
            const values = yield* Arbitrary.sampleEffect(Arbitrary.schema(schema), {
              count: 20,
              maxDiscards: 100,
              seed: "indexed-optional-never",
              size: 1
            })

            assert.isTrue(values.every(Schema.is(schema)))
            assert.isTrue(values.every((value) => !(key in value)))

            const shrinkingSchema = Schema.StructWithRest(fields, [
              Schema.Record(Schema.String.check(Schema.isPattern(new RegExp(`^${key}+$`))), Schema.Boolean)
            ]).check(Schema.isBetweenProperties(1, 1))
            const result = yield* Arbitrary.checkEffect(Arbitrary.schema(shrinkingSchema), () => false, {
              runs: 1,
              maxDiscards: 100,
              maxShrinks: 100,
              seed: 0,
              size: 4
            })

            assert.strictEqual(result._tag, "Falsified")
            if (result._tag === "Falsified") {
              assert.deepStrictEqual(result.shrunkInput, { [`${key}${key}`]: false })
              assert.isTrue(Schema.is(shrinkingSchema)(result.shrunkInput))
            }
          }
        }))

      it.effect("uses indexes when optional properties cannot satisfy the minimum", () =>
        Effect.gen(function*() {
          const schema = Schema.StructWithRest(
            Schema.Struct({ a: Schema.optionalKey(Schema.Never) }),
            [Schema.Record(Schema.String.check(Schema.isPattern(/^b$/)), Schema.Boolean)]
          ).check(Schema.isBetweenProperties(1, 1))
          const values = yield* Arbitrary.sampleEffect(Arbitrary.schema(schema), {
            count: 20,
            maxDiscards: 0,
            seed: "indexed-optional-never-minimum",
            size: 0
          })

          assert.isTrue(values.every(Schema.is(schema)))
          assert.isTrue(values.every((value) => "b" in value && !("a" in value)))
        }))

      it.effect("shrinks and replays fixed fields within the combined constraints", () =>
        Effect.gen(function*() {
          const schema = Schema.StructWithRest(
            Schema.Struct({ fixed: Schema.String }),
            [Schema.Record(Schema.String, Schema.NonEmptyString)]
          )
          const arbitrary = Arbitrary.schema(schema)
          const seen: Array<typeof schema.Type> = []
          const property = (value: typeof schema.Type) => {
            seen.push(value)
            return false
          }
          const result = yield* Arbitrary.checkEffect(arbitrary, property, {
            runs: 1,
            maxDiscards: 128,
            maxShrinks: 64,
            seed: "indexed-object-shrinking",
            size: 8
          })
          assert.strictEqual(result._tag, "Falsified")
          if (result._tag !== "Falsified") return
          assert.isAbove(result.shrinks, 0)
          assert.strictEqual(result.shrunkInput.fixed.length, 1)
          assert.strictEqual(Object.getPrototypeOf(result.shrunkInput), Object.getPrototypeOf(result.initialInput))
          const replayed = yield* Arbitrary.checkEffect(arbitrary, property, { replay: result.replay })
          assert.strictEqual(replayed._tag, "Falsified")
          if (replayed._tag === "Falsified") {
            assert.deepStrictEqual(replayed.shrunkInput, result.shrunkInput)
            assert.strictEqual(replayed.shrinks, result.shrinks)
          }
          assert.isTrue(seen.every(Schema.is(schema)))
        }))

      it.effect("combines numeric and bigint bounds with fixed field constraints", () =>
        Effect.gen(function*() {
          const schemas = [
            Schema.StructWithRest(
              Schema.Struct({ fixed: Schema.Number }),
              [Schema.Record(Schema.String, Schema.Int.check(Schema.isBetween({ minimum: 10, maximum: 20 })))]
            ),
            Schema.StructWithRest(
              Schema.Struct({ fixed: Schema.BigInt.check(Schema.isLessThanOrEqualToBigInt(BigInt(15))) }),
              [Schema.Record(Schema.String, Schema.BigInt.check(Schema.isGreaterThanOrEqualToBigInt(BigInt(10))))]
            )
          ]
          for (const schema of schemas) {
            const values = yield* Arbitrary.sampleEffect(Arbitrary.schema(schema), {
              count: 32,
              maxDiscards: 0,
              seed: "indexed-numeric-bounds",
              size: 0
            })
            assert.isTrue(values.every(Schema.is(schema)))
          }
        }))

      it.effect("combines overlapping index constraints after generating the key", () =>
        Effect.gen(function*() {
          const schema = Schema.StructWithRest(Schema.Struct({}), [
            Schema.Record(Schema.String, Schema.String),
            Schema.Record(Schema.String, Schema.NonEmptyString)
          ]).check(Schema.isMinProperties(1))
          const values = yield* Arbitrary.sampleEffect(Arbitrary.schema(schema), {
            count: 128,
            maxDiscards: 0,
            seed: "indexed-overlap",
            size: 0
          })
          assert.isTrue(values.every(Schema.is(schema)))
        }))

      it.effect("discards empty scalar intersections without failing compilation", () =>
        Effect.gen(function*() {
          const schemas = [
            Schema.StructWithRest(
              Schema.Struct({ fixed: Schema.String.check(Schema.isMaxLength(0)) }),
              [Schema.Record(Schema.String, Schema.NonEmptyString)]
            ),
            Schema.StructWithRest(
              Schema.Struct({ fixed: Schema.Int }),
              [Schema.Record(Schema.String, Schema.Number.check(Schema.isBetween({ minimum: 0.2, maximum: 0.8 })))]
            ),
            Schema.StructWithRest(
              Schema.Struct({ fixed: Schema.BigInt.check(Schema.isLessThanOrEqualToBigInt(BigInt(1))) }),
              [Schema.Record(Schema.String, Schema.BigInt.check(Schema.isGreaterThanBigInt(BigInt(1))))]
            )
          ]
          for (const schema of schemas) {
            const result = yield* Effect.result(Arbitrary.sampleEffect(Arbitrary.schema(schema), {
              count: 1,
              maxDiscards: 0,
              seed: "indexed-empty-intersection",
              size: 0
            }))
            assert.isTrue(Result.isFailure(result))
            if (Result.isFailure(result)) assert.strictEqual(result.failure._tag, "SampleError")
          }
        }))

      it.effect("selects matching pattern, template, numeric and symbol indexes", () =>
        Effect.gen(function*() {
          const symbol = Symbol.for("indexed-field")
          const schema = Schema.StructWithRest(
            Schema.Struct({
              a: Schema.String,
              other: Schema.String,
              "pre_x": Schema.String,
              0: Schema.String,
              [symbol]: Schema.String
            }),
            [
              Schema.Record(Schema.String.check(Schema.isPattern(/^a/)), Schema.NonEmptyString),
              Schema.Record(Schema.TemplateLiteral(["pre_", Schema.String]), Schema.NonEmptyString),
              Schema.Record(Schema.Int, Schema.NonEmptyString),
              Schema.Record(Schema.Symbol, Schema.NonEmptyString)
            ]
          )
          const values = yield* Arbitrary.sampleEffect(Arbitrary.schema(schema), {
            count: 32,
            maxDiscards: 0,
            seed: "indexed-key-matching",
            size: 0
          })
          assert.isTrue(values.every(Schema.is(schema)))
          assert.isTrue(values.every((value) => value.other === ""))
        }))

      it.effect("validates residual index filters without constructive constraints", () =>
        Effect.gen(function*() {
          const schema = Schema.StructWithRest(
            Schema.Struct({ fixed: Schema.String }),
            [Schema.Record(Schema.String, Schema.String.check(Schema.makeFilter((value) => value.length > 0)))]
          )
          const arbitrary = Arbitrary.schema(schema)
          const result = yield* Effect.result(Arbitrary.sampleEffect(arbitrary, {
            count: 1,
            maxDiscards: 0,
            seed: "indexed-residual-filter",
            size: 0
          }))
          assert.isTrue(Result.isFailure(result))
          if (Result.isFailure(result)) assert.strictEqual(result.failure._tag, "SampleError")
          const values = yield* Arbitrary.sampleEffect(arbitrary, {
            count: 32,
            maxDiscards: 128,
            seed: "indexed-residual-filter",
            size: 4
          })
          assert.isTrue(values.every(Schema.is(schema)))
          const seen: Array<typeof schema.Type> = []
          const checked = yield* Arbitrary.checkEffect(arbitrary, (value) => {
            seen.push(value)
            return false
          }, {
            runs: 1,
            maxDiscards: 128,
            maxShrinks: 64,
            seed: "indexed-residual-filter",
            size: 4
          })
          assert.strictEqual(checked._tag, "Falsified")
          if (checked._tag === "Falsified") assert.isAbove(checked.shrinks, 0)
          assert.isTrue(seen.every(Schema.is(schema)))
        }))

      it.effect("rejects key shrinks that enter an incompatible index", () =>
        Effect.gen(function*() {
          const schema = Schema.StructWithRest(Schema.Struct({}), [
            Schema.Record(Schema.String, Schema.String.check(Schema.isMaxLength(0))),
            Schema.Record(Schema.String.check(Schema.isMaxLength(1)), Schema.NonEmptyString)
          ]).check(Schema.isMinProperties(1), Schema.isMaxProperties(1))
          const seen: Array<typeof schema.Type> = []
          const result = yield* Arbitrary.checkEffect(Arbitrary.schema(schema), (value) => {
            seen.push(value)
            return false
          }, {
            runs: 1,
            maxDiscards: 128,
            maxShrinks: 64,
            seed: "indexed-key-shrinking",
            size: 8
          })
          assert.strictEqual(result._tag, "Falsified")
          if (result._tag === "Falsified") assert.isAbove(result.shrinks, 0)
          assert.isTrue(seen.every(Schema.is(schema)))
          assert.isTrue(seen.every((value) => Object.keys(value)[0].length > 1))
        }))
    })

    it.effect("preserves special Record keys with null-prototype objects", () =>
      Effect.gen(function*() {
        const schema = Schema.Record(Schema.Literal("__proto__"), Schema.Literal("value"))
        const values = yield* Arbitrary.sampleEffect(Arbitrary.schema(schema), {
          count: 512,
          maxDiscards: 0,
          seed: "record-object-prototypes"
        })

        assert.isTrue(values.every(Schema.is(schema)))
        assert.isTrue(values.some((value) => Object.getPrototypeOf(value) === null))
        assert.isTrue(values.every((value) => Object.hasOwn(value, "__proto__") && value.__proto__ === "value"))
      }))

    it.effect("preserves null prototypes while shrinking and replaying", () =>
      Effect.gen(function*() {
        const schema = Schema.Struct({
          value: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 100 }))
        })
        const arbitrary = Arbitrary.schema(schema)
        const property = (value: typeof schema.Type) => Object.getPrototypeOf(value) !== null
        const result = yield* Arbitrary.checkEffect(arbitrary, property, {
          runs: 100,
          maxDiscards: 0,
          seed: "null-prototype-shrink",
          size: 100
        })

        assert.strictEqual(result._tag, "Falsified")
        if (result._tag === "Falsified") {
          assert.strictEqual(Object.getPrototypeOf(result.initialInput), null)
          assert.strictEqual(Object.getPrototypeOf(result.shrunkInput), null)
          assert.isTrue(Schema.is(schema)(result.shrunkInput))
          const replayed = yield* Arbitrary.checkEffect(arbitrary, property, { replay: result.replay })
          assert.strictEqual(replayed._tag, "Falsified")
          if (replayed._tag === "Falsified") {
            assert.deepStrictEqual(replayed.initialInput, result.initialInput)
            assert.deepStrictEqual(replayed.shrunkInput, result.shrunkInput)
            assert.deepStrictEqual(replayed.failure, result.failure)
            assert.strictEqual(replayed.shrinks, result.shrinks)
            assert.strictEqual(replayed.replay, result.replay)
          }
        }
      }))

    it.effect("injects the approved JavaScript String edge corpus", () =>
      Effect.gen(function*() {
        const corpus = [
          "",
          " ",
          "\t",
          "\n",
          "\0",
          "0",
          "-1",
          "4294967295",
          "__proto__",
          "constructor",
          "prototype",
          "toString",
          "\uD800",
          "\uDC00",
          "😀"
        ]
        const values = yield* Arbitrary.sampleEffect(Arbitrary.schema(Schema.String), {
          count: 8_192,
          maxDiscards: 0,
          seed: "string-edge-corpus",
          size: 16
        })

        for (const value of corpus) assert.include(values, value)
      }))

    it.effect("scales unconstrained String, Array, and Record sizes without hidden ceilings", () =>
      Effect.gen(function*() {
        const size = 32
        const strings = yield* Arbitrary.sampleEffect(Arbitrary.schema(Schema.String), {
          count: 200,
          maxDiscards: 0,
          seed: "unconstrained-size",
          size
        })
        const arrays = yield* Arbitrary.sampleEffect(Arbitrary.schema(Schema.Array(Schema.Null)), {
          count: 200,
          maxDiscards: 0,
          seed: "unconstrained-size",
          size
        })
        const records = yield* Arbitrary.sampleEffect(Arbitrary.schema(Schema.Record(Schema.String, Schema.Null)), {
          count: 200,
          maxDiscards: 200,
          seed: "unconstrained-size",
          size
        })

        assert.isTrue(strings.some((value) => value.length > 16))
        assert.isTrue(arrays.some((value) => value.length > 8))
        assert.isTrue(records.some((value) => Object.keys(value).length > 8))
      }))

    it.effect("scales the specialized Json generator with size", () =>
      Effect.gen(function*() {
        const values = yield* Arbitrary.sampleEffect(Arbitrary.schema(Schema.Json), {
          count: 200,
          maxDiscards: 0,
          seed: "json-size",
          size: 32
        })

        assert.isTrue(values.some((value) => typeof value === "string" && value.length > 8))
        assert.isTrue(values.some((value) => Array.isArray(value) && value.length > 3))
        const objects = values.filter((value): value is Record<string, Schema.Json> => {
          return typeof value === "object" && value !== null && !Array.isArray(value)
        })
        assert.isTrue(objects.some((value) => Object.keys(value).length > 3))
        assert.isTrue(objects.flatMap((value) => Object.keys(value)).some((key) => !/^key\d+$/.test(key)))
        const prototypes = new Set(objects.map(Object.getPrototypeOf))
        assert.isTrue(prototypes.has(Object.prototype))
        assert.isTrue(prototypes.has(null))
      }))

    it.effect("targets IEEE-754 edge cases while preserving intermediate values", () =>
      Effect.gen(function*() {
        // This follows fast-check v4.9.0's broad edge-coverage contract without fixing exact frequencies.
        // https://github.com/dubzzz/fast-check/blob/v4.9.0/packages/fast-check/test/e2e/arbitraries/DoubleArbitrary.spec.ts
        const values = yield* Arbitrary.sampleEffect(Arbitrary.schema(Schema.Number), {
          count: 25_000,
          maxDiscards: 0,
          seed: "numeric-edge-bias-number"
        })
        const expected = [
          Number.NEGATIVE_INFINITY,
          -Number.MAX_VALUE,
          -Number.MIN_VALUE,
          -0,
          0,
          Number.MIN_VALUE,
          Number.MAX_VALUE,
          Number.POSITIVE_INFINITY,
          Number.NaN
        ]
        for (const value of expected) {
          assert.isTrue(values.some((candidate) => Object.is(candidate, value)))
        }
        const intermediate = values.filter((value) => {
          const absolute = Math.abs(value)
          return absolute >= 2 ** -1021 && absolute < 2 ** 1023
        })
        assert.isAtLeast(intermediate.length, values.length * 0.5)
      }))

    it.effect("reaches NaN through a one-sided upper Number bound", () =>
      Effect.gen(function*() {
        const schema = Schema.Number.check(Schema.isLessThanOrEqualTo(0))
        const values = yield* Arbitrary.sampleEffect(Arbitrary.schema(schema), {
          count: 1_000,
          maxDiscards: 0,
          seed: "upper-bounded-number-nan"
        })

        assert.isTrue(values.every(Schema.is(schema)))
        assert.isTrue(values.some(Number.isNaN))
      }))

    it("rejects integer bounds outside the safe range", () => {
      assert.throws(
        () => Arbitrary.schema(Schema.Int.check(Schema.isGreaterThan(Number.MAX_SAFE_INTEGER))),
        /Unable to derive an arbitrary for integer constraints/
      )
      assert.throws(
        () => Arbitrary.schema(Schema.Int.check(Schema.isLessThan(Number.MIN_SAFE_INTEGER))),
        /Unable to derive an arbitrary for integer constraints/
      )
    })

    it("rejects NaN numeric bounds", () => {
      const isBetweenNumber = Schema.makeIsBetween({ order: Order.Number })
      assert.throws(
        () => Arbitrary.schema(Schema.Number.check(isBetweenNumber({ minimum: Number.NaN, maximum: 1 }))),
        /Unable to derive an arbitrary for number constraints/
      )
      assert.throws(
        () => Arbitrary.schema(Schema.Int.check(isBetweenNumber({ minimum: 0, maximum: Number.NaN }))),
        /Unable to derive an arbitrary for integer constraints/
      )
    })

    it.effect("generates BigInts across arbitrary-width bounded ranges", () =>
      Effect.gen(function*() {
        const maximum = BigInt(1) << BigInt(1024)
        const schema = Schema.BigInt.check(Schema.isBetweenBigInt({ minimum: BigInt(0), maximum }))
        const values = yield* Arbitrary.sampleEffect(Arbitrary.schema(schema), {
          count: 20,
          maxDiscards: 0,
          seed: "arbitrary-width-bigint"
        })

        assert.isTrue(values.every((value) => value >= BigInt(0) && value <= maximum))
        assert.isTrue(values.some((value) => value > BigInt(Number.MAX_SAFE_INTEGER)))
      }))

    it.effect("generates unbounded BigInts across intermediate bit lengths", () =>
      Effect.gen(function*() {
        const values = yield* Arbitrary.sampleEffect(Arbitrary.schema(Schema.BigInt), {
          count: 1_000,
          maxDiscards: 0,
          seed: "unbounded-bigint-bit-lengths",
          size: 1
        })
        const bitLengths = values.map((value) => {
          const magnitude = value < 0n ? -value : value
          return magnitude === 0n ? 0 : magnitude.toString(2).length
        })

        assert.isTrue(values.some((value) => value < 0n))
        assert.isTrue(values.some((value) => value > 0n))
        assert.isTrue(bitLengths.some((length) => length > 512))
        assert.isAtLeast(new Set(bitLengths).size, 100)
      }))

    it.effect("constructs one-sided BigInts beyond a large finite bound", () =>
      Effect.gen(function*() {
        const minimum = 1n << 4_096n
        const schema = Schema.BigInt.check(Schema.isGreaterThanOrEqualToBigInt(minimum))
        const values = yield* Arbitrary.sampleEffect(Arbitrary.schema(schema), {
          count: 100,
          maxDiscards: 0,
          seed: "one-sided-large-bigint"
        })

        assert.isTrue(values.every((value) => value >= minimum))
        assert.isTrue(values.some((value) => value > minimum))
      }))

    it.effect("covers intermediate BigInt magnitudes on the finite side of one-sided bounds", () =>
      Effect.gen(function*() {
        const bound = 1n << 4096n
        for (const sign of [1n, -1n]) {
          const schema = Schema.BigInt.check(
            sign > 0n
              ? Schema.isLessThanBigInt(bound)
              : Schema.isGreaterThanBigInt(-bound)
          )
          for (const seed of ["one-sided-intermediate", "one-sided-intermediate-2"]) {
            const values = yield* Arbitrary.sampleEffect(Arbitrary.schema(schema), {
              count: 1_000,
              maxDiscards: 0,
              seed,
              size: 1
            })

            assert.isTrue(values.every(Schema.is(schema)))
            assert.isTrue(values.some((value) => sign * value > (1n << 2500n) && sign * value < (1n << 3500n)))
            assert.isTrue(values.some((value) => value < 0n))
            assert.isTrue(values.some((value) => value > 0n))
            assert.isTrue(values.some((value) => value !== 0n && value > -100n && value < 100n))
          }
        }
      }))

    it.effect("shrinks BigInts to a common semantic boundary", () =>
      Effect.gen(function*() {
        const boundary = BigInt(Number.MAX_SAFE_INTEGER)
        const arbitrary = Arbitrary.schema(Schema.BigInt)
        const result = yield* Arbitrary.checkEffect(arbitrary, (value) => value <= boundary, {
          runs: 200,
          maxDiscards: 0,
          maxShrinks: 100,
          seed: "bigint-semantic-boundary"
        })

        assert.strictEqual(result._tag, "Falsified")
        if (result._tag === "Falsified") {
          assert.strictEqual(result.shrunkInput, boundary + 1n)
          const replayed = yield* Arbitrary.checkEffect(arbitrary, (value) => value <= boundary, {
            replay: result.replay
          })
          assert.strictEqual(replayed._tag, "Falsified")
          if (replayed._tag === "Falsified") {
            assert.strictEqual(replayed.initialInput, result.initialInput)
            assert.strictEqual(replayed.shrunkInput, result.shrunkInput)
            assert.strictEqual(replayed.shrinks, result.shrinks)
          }
        }
      }))

    it.effect("generates the sole Number between adjacent exclusive IEEE-754 bounds", () =>
      Effect.gen(function*() {
        const minimum = 2 ** 100
        const unit = 2 ** 48
        const expected = minimum + unit
        const schema = Schema.Number.check(Schema.isBetween({
          minimum,
          maximum: minimum + unit * 2,
          exclusiveMinimum: true,
          exclusiveMaximum: true
        }))
        const values = yield* Arbitrary.sampleEffect(Arbitrary.schema(schema), {
          count: 20,
          maxDiscards: 0,
          seed: "adjacent-ieee-bounds"
        })

        assert.deepStrictEqual(values, Array.from({ length: 20 }, () => expected))
      }))

    it.effect("preserves both signed zeros in an inclusive zero interval", () =>
      Effect.gen(function*() {
        const schema = Schema.Number.check(Schema.isBetween({ minimum: 0, maximum: 0 }))
        const values = yield* Arbitrary.sampleEffect(Arbitrary.schema(schema), {
          count: 50,
          maxDiscards: 0,
          seed: "signed-zero"
        })

        assert.isTrue(values.every((value) => value === 0))
        assert.isTrue(values.some((value) => Object.is(value, -0)))
        assert.isTrue(values.some((value) => Object.is(value, 0)))
      }))

    it.effect("generates exact subnormal and infinite singleton intervals", () =>
      Effect.gen(function*() {
        const expected = [
          Number.NEGATIVE_INFINITY,
          -Number.MAX_VALUE,
          -Number.MIN_VALUE,
          Number.MIN_VALUE,
          Number.MAX_VALUE,
          Number.POSITIVE_INFINITY
        ]
        const values: Array<number> = []
        const isBetweenNumber = Schema.makeIsBetween({ order: Order.Number })
        for (const value of expected) {
          const schema = Schema.Number.check(isBetweenNumber({ minimum: value, maximum: value }))
          const [sample] = yield* Arbitrary.sampleEffect(Arbitrary.schema(schema), {
            count: 1,
            maxDiscards: 0,
            seed: "ieee-singleton"
          })
          values.push(sample)
        }

        assert.deepStrictEqual(values, expected)
      }))

    it.effect("generates infinity from one-sided inclusive bounds", () =>
      Effect.gen(function*() {
        const greaterThanOrEqualTo = Schema.makeIsGreaterThanOrEqualTo({ order: Order.Number })
        const lessThanOrEqualTo = Schema.makeIsLessThanOrEqualTo({ order: Order.Number })
        const [positive] = yield* Arbitrary.sampleEffect(
          Arbitrary.schema(Schema.Number.check(greaterThanOrEqualTo(Number.POSITIVE_INFINITY))),
          { count: 1, maxDiscards: 0, seed: "positive-infinity" }
        )
        const negativeSchema = Schema.Number.check(lessThanOrEqualTo(Number.NEGATIVE_INFINITY))
        const negatives = yield* Arbitrary.sampleEffect(
          Arbitrary.schema(negativeSchema),
          { count: 20, maxDiscards: 0, seed: "negative-infinity" }
        )

        assert.strictEqual(positive, Number.POSITIVE_INFINITY)
        assert.isTrue(negatives.every(Schema.is(negativeSchema)))
        assert.include(negatives, Number.NEGATIVE_INFINITY)
        assert.isTrue(negatives.some(Number.isNaN))
      }))

    it("rejects infinite intervals excluded by a finite constraint", () => {
      const greaterThanOrEqualTo = Schema.makeIsGreaterThanOrEqualTo({ order: Order.Number })
      const schema = Schema.Number.check(
        Schema.isFinite(),
        greaterThanOrEqualTo(Number.POSITIVE_INFINITY)
      )

      assert.throws(() => Arbitrary.schema(schema), /Unable to derive an arbitrary for number constraints/)
    })

    it.effect("uses the same generated value for sampling and a single-run check", () =>
      Effect.gen(function*() {
        const arbitrary = Arbitrary.schema(Schema.Struct({
          values: Schema.Array(Schema.Int).check(Schema.isMinLength(2), Schema.isMaxLength(4)),
          unique: Schema.UniqueArray(Schema.Int).check(Schema.isMinLength(2), Schema.isMaxLength(4))
        }))
        const sampled = yield* Arbitrary.sampleEffect(arbitrary, { count: 1, seed: "sample-check", size: 10 })
        let checked: (typeof sampled)[number] | undefined
        yield* Arbitrary.checkEffect(arbitrary, (value) => {
          checked = value
          return true
        }, { runs: 1, seed: "sample-check", size: 10 })

        assert.deepStrictEqual(checked, sampled[0])
      }))

    it.effect("supports unique collections", () =>
      Effect.gen(function*() {
        const schema = Schema.UniqueArray(Schema.Int).check(Schema.isMinLength(4), Schema.isMaxLength(4))
        const values = yield* Arbitrary.sampleEffect(Arbitrary.schema(schema), {
          count: 20,
          maxDiscards: 20,
          seed: "unique"
        })

        assert.isTrue(values.every((value) => value.length === 4 && new Set(value).size === 4))
      }))

    it.effect("uses Effect equality for constructive uniqueness", () =>
      Effect.gen(function*() {
        const schema = Schema.UniqueArray(Schema.Struct({ value: Schema.Literal(1) })).check(
          Schema.isMinLength(2),
          Schema.isMaxLength(2)
        )
        const result = yield* Effect.result(Arbitrary.sampleEffect(Arbitrary.schema(schema), {
          count: 1,
          maxDiscards: 2,
          seed: "structural-unique"
        }))

        assert.isTrue(Result.isFailure(result))
        if (Result.isFailure(result)) {
          assert.deepStrictEqual(result.failure, {
            _tag: "SampleError",
            generated: 0,
            discards: 3,
            seed: "structural-unique"
          })
        }
      }))

    it.effect("preserves unique collections while shrinking", () =>
      Effect.gen(function*() {
        const schema = Schema.UniqueArray(Schema.Int).check(Schema.isMinLength(2), Schema.isMaxLength(4))
        const result = yield* Arbitrary.checkEffect(Arbitrary.schema(schema), () => false, {
          runs: 1,
          seed: "unique-shrink",
          size: 10
        })

        assert.strictEqual(result._tag, "Falsified")
        if (result._tag === "Falsified") {
          assert.isTrue(Schema.is(schema)(result.shrunkInput))
        }
      }))

    it.effect("generates optional, rest, record, and union structure", () =>
      Effect.gen(function*() {
        const schema = Schema.Struct({
          tuple: Schema.TupleWithRest(
            Schema.Tuple([Schema.String, Schema.optionalKey(Schema.Int)]),
            [Schema.Boolean]
          ),
          optional: Schema.optionalKey(Schema.String),
          record: Schema.Record(Schema.String, Schema.Int).check(Schema.isMaxProperties(3)),
          union: Schema.Union([Schema.String, Schema.Int])
        })
        const values = yield* Arbitrary.sampleEffect(Arbitrary.schema(schema), {
          count: 50,
          seed: "structural",
          size: 5
        })

        assert.isTrue(values.every(Schema.is(schema)))
      }))

    it.effect("omits optional Never properties", () =>
      Effect.gen(function*() {
        const schema = Schema.Struct({ value: Schema.optionalKey(Schema.Never) })
        const values = yield* Arbitrary.sampleEffect(Arbitrary.schema(schema), {
          count: 1,
          maxDiscards: 0,
          seed: "optional-never"
        })

        assert.deepStrictEqual(values, [{}])
      }))

    it.effect("uses inhabited branches around Never", () =>
      Effect.gen(function*() {
        const union = yield* Arbitrary.sampleEffect(
          Arbitrary.schema(Schema.Union([Schema.Never, Schema.Literal("value")])),
          { count: 1, maxDiscards: 0, seed: "never-union" }
        )
        const array = yield* Arbitrary.sampleEffect(Arbitrary.schema(Schema.Array(Schema.Never)), {
          count: 1,
          maxDiscards: 0,
          seed: "never-array"
        })

        assert.deepStrictEqual(union, ["value"])
        assert.deepStrictEqual(array, [[]])
      }))

    it.effect("constructively selects optional properties affordable by the recursion budget", () =>
      Effect.gen(function*() {
        interface Node {
          readonly next: null | Node
        }
        const Node: Schema.Codec<Node> = Schema.Struct({
          next: Schema.suspend(() => Schema.Union([Schema.Null, Node]))
        })
        const schema = Schema.Struct({
          cheap: Schema.optionalKey(Schema.Null),
          recursive: Schema.optionalKey(Node)
        }).check(Schema.isBetweenProperties(1, 1))
        const values = yield* Arbitrary.sampleEffect(Arbitrary.schema(schema), {
          count: 100,
          maxDiscards: 0,
          seed: "optional-property-budget",
          size: 0
        })

        assert.isTrue(values.every((value) => "cheap" in value && !("recursive" in value)))
      }))

    it.effect("shrinks Record values before keys while preserving key uniqueness", () =>
      Effect.gen(function*() {
        const schema = Schema.Record(
          Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(1)),
          Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 10 }))
        ).check(Schema.isMinProperties(1), Schema.isMaxProperties(1))
        const result = yield* Arbitrary.checkEffect(Arbitrary.schema(schema), () => false, {
          runs: 1,
          seed: "record-key-shrink",
          size: 1
        })

        assert.strictEqual(result._tag, "Falsified")
        if (result._tag === "Falsified") {
          assert.deepStrictEqual(result.shrunkInput, { "\0": 0 })
        }

        const uniqueSchema = Schema.Record(
          Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(1)),
          Schema.Null
        ).check(Schema.isMinProperties(2), Schema.isMaxProperties(2))
        const uniqueResult = yield* Arbitrary.checkEffect(Arbitrary.schema(uniqueSchema), () => false, {
          runs: 1,
          seed: "record-key-unique-shrink",
          size: 2
        })

        assert.strictEqual(uniqueResult._tag, "Falsified")
        if (uniqueResult._tag === "Falsified") {
          const keys = Object.keys(uniqueResult.shrunkInput).map((key) => key.charCodeAt(0)).sort((a, b) => a - b)
          assert.deepStrictEqual(keys, [0, 1])
        }
      }))

    it.effect("generates finite numeric template literal segments", () =>
      Effect.gen(function*() {
        const schema = Schema.TemplateLiteral([Schema.Number])
        const values = yield* Arbitrary.sampleEffect(Arbitrary.schema(schema), {
          count: 200,
          maxDiscards: 0,
          seed: "template-number"
        })

        assert.isTrue(values.every(Schema.is(schema)))
      }))

    it.effect("generates bit templates and preserves checked numeric template shrinks", () =>
      Effect.gen(function*() {
        const bits = Schema.TemplateLiteral([Schema.Literals([0, 1])])
        const values = yield* Arbitrary.sampleEffect(Arbitrary.schema(bits), {
          count: 50,
          maxDiscards: 0,
          seed: 0
        })
        assert.deepStrictEqual(new Set(values), new Set(["0", "1"]))

        const schema = Schema.TemplateLiteral(["a", Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 100 }))])
        const seen: Array<string> = []
        const result = yield* Arbitrary.checkEffect(Arbitrary.schema(schema), (value) => {
          seen.push(value)
          return false
        }, { runs: 1, maxDiscards: 0, maxShrinks: 100, seed: 0, size: 10 })

        assert.strictEqual(result._tag, "Falsified")
        assert.isAbove(seen.length, 1)
        assert.isTrue(seen.every(Schema.is(schema)))
        if (result._tag === "Falsified") assert.strictEqual(result.shrunkInput, "a1")
      }))

    it.effect("validates overlapping oneOf Union members", () =>
      Effect.gen(function*() {
        const schema = Schema.Union([Schema.String, Schema.Literal("a")], { mode: "oneOf" })
        const values = yield* Arbitrary.sampleEffect(Arbitrary.schema(schema), {
          count: 100,
          maxDiscards: 200,
          seed: "overlapping-one-of"
        })

        assert.isTrue(values.every(Schema.is(schema)))
        assert.notInclude(values, "a")
      }))

    it.effect("bounds exhaustion for an uninhabited oneOf Union", () =>
      Effect.gen(function*() {
        const schema = Schema.Union([Schema.Literal("a"), Schema.Literal("a")], { mode: "oneOf" })
        const result = yield* Effect.result(Arbitrary.sampleEffect(Arbitrary.schema(schema), {
          count: 1,
          maxDiscards: 2,
          seed: "uninhabited-one-of"
        }))

        assert.isTrue(Result.isFailure(result))
        if (Result.isFailure(result)) {
          assert.deepStrictEqual(result.failure, {
            _tag: "SampleError",
            generated: 0,
            discards: 3,
            seed: "uninhabited-one-of"
          })
        }
      }))

    it.effect("generates finite numeric template literal union segments", () =>
      Effect.gen(function*() {
        const schema = Schema.TemplateLiteral([Schema.Union([Schema.Number, Schema.Literal("a")])])
        const values = yield* Arbitrary.sampleEffect(Arbitrary.schema(schema), {
          count: 200,
          maxDiscards: 0,
          seed: "template-number-union"
        })

        assert.isTrue(values.every(Schema.is(schema)))
      }))

    it.effect("generates symbols", () =>
      Effect.gen(function*() {
        const values = yield* Arbitrary.sampleEffect(Arbitrary.schema(Schema.Symbol), {
          count: 20,
          maxDiscards: 0,
          seed: "symbol"
        })

        assert.isTrue(values.every((value) => typeof value === "symbol"))
      }))

    it.effect("generates Unknown and Any through Json", () =>
      Effect.gen(function*() {
        for (const schema of [Schema.Unknown, Schema.Any]) {
          const values = yield* Arbitrary.sampleEffect(Arbitrary.schema(schema), {
            count: 30,
            maxDiscards: 0,
            seed: "unknown-any",
            size: 5
          })

          assert.isTrue(values.every(Schema.is(Schema.Json)))
        }
      }))

    it.effect("derives Json through its built-in representation", () =>
      Effect.gen(function*() {
        const values = yield* Arbitrary.sampleEffect(Arbitrary.schema(Schema.Json), {
          count: 30,
          seed: "json",
          size: 5
        })

        assert.isTrue(values.every(Schema.is(Schema.Json)))
      }))

    it.effect("prefers an explicit toCodecArbitrary over a built-in representation", () =>
      Effect.gen(function*() {
        const expected = "https://effect.website/custom"
        const schema = Schema.URL.annotate({
          toCodecArbitrary: () =>
            Schema.link<URL>()(
              Schema.Literal(expected),
              SchemaTransformation.transform<globalThis.URL, typeof expected>({
                decode: (value) => new URL(value),
                encode: () => expected
              })
            )
        })
        const values = yield* Arbitrary.sampleEffect(Arbitrary.schema(schema), {
          count: 10,
          maxDiscards: 0,
          seed: "built-in-explicit-arbitrary"
        })

        assert.deepStrictEqual(values.map((value) => value.href), globalThis.Array(10).fill(expected))
      }))

    it.effect("derives canonical declarations through their codec", () =>
      Effect.gen(function*() {
        const schema = Schema.Option(Schema.Int)
        const values = yield* Arbitrary.sampleEffect(Arbitrary.schema(schema), { count: 30, seed: "option", size: 5 })

        assert.isTrue(values.every(Option.isOption))
        assert.isTrue(values.every(Schema.is(schema)))
      }))

    it.effect("prefers toCodecArbitrary and passes normalized constraints without Order", () =>
      Effect.gen(function*() {
        let received: Schema.Annotations.ToArbitrary.GenerationConstraint<number> | undefined
        const declaration = Schema.declare<number>((input): input is number => typeof input === "number", {
          toCodec: () =>
            Schema.link<number>()(
              Schema.Literal(99),
              SchemaTransformation.transform<number, 99>({ decode: (value) => value, encode: () => 99 })
            ),
          toCodecArbitrary: ({ constraint }) => {
            received = constraint
            return Schema.link<number>()(
              Schema.Int.check(Schema.isBetween({
                minimum: constraint?.minimum ?? Number.MIN_SAFE_INTEGER,
                maximum: constraint?.maximum ?? Number.MAX_SAFE_INTEGER,
                exclusiveMinimum: constraint?.exclusiveMinimum,
                exclusiveMaximum: constraint?.exclusiveMaximum
              })),
              SchemaTransformation.passthrough()
            )
          }
        }).check(Schema.isBetween({ minimum: 1, maximum: 4, exclusiveMinimum: true }))

        const values = yield* Arbitrary.sampleEffect(Arbitrary.schema(declaration), {
          count: 100,
          maxDiscards: 0,
          seed: "to-codec-arbitrary-constraint"
        })

        assert.deepStrictEqual(received, { minimum: 1, maximum: 4, exclusiveMinimum: true })
        assert.isTrue(values.every((value) => value > 1 && value <= 4))
      }))

    it("rejects contradictory generation constraints before invoking toCodecArbitrary", () => {
      let invoked = false
      const declaration = Schema.declare<number>((input): input is number => typeof input === "number", {
        toCodecArbitrary: () => {
          invoked = true
          return Schema.link<number>()(Schema.Number, SchemaTransformation.passthrough())
        }
      }).check(
        Schema.makeFilter(() => true, { arbitraryConstraint: { minLength: 2 } }),
        Schema.makeFilter(() => true, { arbitraryConstraint: { maxLength: 1 } })
      )

      assert.throws(() => Arbitrary.schema(declaration), /Unable to derive an arbitrary for constraints/)
      assert.isFalse(invoked)
    })

    it.effect("derives mutually recursive declarations through toCodecArbitrary", () =>
      Effect.gen(function*() {
        interface A {
          readonly _tag: "A"
          readonly next: B | null
        }
        interface B {
          readonly _tag: "B"
          readonly next: A | null
        }
        let A: Schema.declare<A>
        let B: Schema.declare<B>
        A = Schema.declare<A>(
          (input): input is A => typeof input === "object" && input !== null && (input as A)._tag === "A",
          {
            toCodecArbitrary: () =>
              Schema.link<A>()(
                Schema.Struct({
                  _tag: Schema.Literal("A"),
                  next: Schema.NullOr(Schema.suspend(() => B))
                }),
                SchemaTransformation.passthrough()
              )
          }
        )
        B = Schema.declare<B>(
          (input): input is B => typeof input === "object" && input !== null && (input as B)._tag === "B",
          {
            toCodecArbitrary: () =>
              Schema.link<B>()(
                Schema.Struct({
                  _tag: Schema.Literal("B"),
                  next: Schema.NullOr(Schema.suspend(() => A))
                }),
                SchemaTransformation.passthrough()
              )
          }
        )

        const values = yield* Arbitrary.sampleEffect(Arbitrary.schema(A), {
          count: 100,
          maxDiscards: 0,
          seed: "mutual-to-codec-arbitrary",
          size: 10
        })

        assert.isTrue(values.every(Schema.is(A)))
        assert.isTrue(values.some((value) => value.next?._tag === "B"))
      }))

    it.effect("promotes valid shrink descendants through a rejecting canonical codec", () =>
      Effect.gen(function*() {
        const encoded = Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 100 }))
        const schema = Schema.declare<number>(
          (input): input is number => input === 25 || input === 100,
          {
            toCodec: () =>
              Schema.link<number>()(
                encoded,
                SchemaTransformation.transformEffect({
                  decode: (value) =>
                    value === 25 || value === 100
                      ? Effect.succeed(value)
                      : Effect.fail(new SchemaIssue.Forbidden({ message: "unsupported value" })),
                  encode: Effect.succeed
                })
              )
          }
        )

        const result = yield* Arbitrary.checkEffect(Arbitrary.schema(schema), () => false, {
          runs: 1,
          maxDiscards: 0,
          seed: 47
        })

        assert.strictEqual(result._tag, "Falsified")
        if (result._tag === "Falsified") {
          assert.strictEqual(result.initialInput, 100)
          assert.strictEqual(result.shrunkInput, 25)
          assert.strictEqual(result.shrinks, 1)
        }
      }))

    it.effect("keeps asynchronous canonical codecs interruptible", () =>
      Effect.gen(function*() {
        const started = yield* Deferred.make<void>()
        const schema = Schema.declare<number>((input): input is number => typeof input === "number", {
          toCodecArbitrary: () =>
            Schema.link<number>()(
              Schema.Literal(1),
              SchemaTransformation.transformEffect<number, 1>({
                decode: () => {
                  Deferred.doneUnsafe(started, Effect.void)
                  return Effect.never
                },
                encode: () => Effect.succeed(1)
              })
            )
        })
        const fiber = yield* Effect.forkChild(Arbitrary.sampleEffect(Arbitrary.schema(schema), {
          count: 1,
          seed: "interrupt-asynchronous-codec"
        }))

        yield* Deferred.await(started)
        yield* Fiber.interrupt(fiber)
        const exit = yield* Fiber.await(fiber)

        assert.isTrue(Exit.hasInterrupts(exit))
      }))

    it.effect("derives JSON-canonical declarations through their codec", () =>
      Effect.gen(function*() {
        const values = yield* Arbitrary.sampleEffect(Arbitrary.schema(Schema.URLSearchParams), {
          count: 30,
          seed: "url-search-params"
        })

        assert.isTrue(values.every((value) => value instanceof URLSearchParams))
      }))

    it.effect("derives productive structural declarations through canonical codecs", () =>
      Effect.gen(function*() {
        const schemas: ReadonlyArray<Schema.Top> = [
          Schema.Result(Schema.Number, Schema.String),
          Schema.Redacted(Schema.String),
          Schema.ReadonlySet(Schema.Int),
          Schema.HashSet(Schema.Int),
          Schema.ReadonlyMap(Schema.String, Schema.Int),
          Schema.HashMap(Schema.String, Schema.Int),
          Schema.Chunk(Schema.Int),
          Schema.Duration,
          Schema.Cause(Schema.String, Schema.String),
          Schema.Exit(Schema.Int, Schema.String, Schema.String),
          Schema.TimeZoneOffset
        ]

        for (const schema of schemas) {
          const result = yield* Arbitrary.checkEffect(Arbitrary.schema(schema), Schema.is(schema), {
            runs: 20,
            maxDiscards: 0,
            seed: "structural-declarations"
          })
          assert.deepStrictEqual(result, { _tag: "Passed", runs: 20, discards: 0 })
        }
      }))

    it.effect("constructs collection cardinality through declaration annotations", () =>
      Effect.gen(function*() {
        const hashSet = Schema.HashSet(Schema.Int).check(Schema.makeFilter(
          (value: HashSet.HashSet<number>) => HashSet.size(value) === 3,
          { arbitraryConstraint: { minSize: 3, maxSize: 3 } }
        ))
        const hashMap = Schema.HashMap(Schema.Literals(["a", "b", "c"]), Schema.Boolean).check(Schema.makeFilter(
          (value: HashMap.HashMap<string, boolean>) => HashMap.size(value) === 3,
          { arbitraryConstraint: { minSize: 3, maxSize: 3 } }
        ))
        const schemas: ReadonlyArray<readonly [Schema.Top, (value: any) => number]> = [
          [Schema.Chunk(Schema.Int).check(Schema.isBetweenLength(3, 3)), Chunk.size],
          [Schema.ReadonlySet(Schema.Int).check(Schema.isBetweenSize(3, 3)), (value) => value.size],
          [hashSet, HashSet.size],
          [
            Schema.ReadonlyMap(Schema.Literals(["a", "b", "c"]), Schema.Boolean).check(Schema.isBetweenSize(3, 3)),
            (value) => value.size
          ],
          [hashMap, HashMap.size]
        ]

        for (const [schema, size] of schemas) {
          const values = yield* Arbitrary.sampleEffect(Arbitrary.schema(schema), {
            count: 30,
            maxDiscards: 100,
            seed: "collection-to-codec-arbitrary",
            size: 10
          })
          assert.isTrue(values.every((value) => size(value) === 3))
        }
      }))

    it.effect("preserves Map key uniqueness while shrinking", () =>
      Effect.gen(function*() {
        const schema = Schema.ReadonlyMap(
          Schema.Literals(["a", "b", "c"]),
          Schema.Int
        ).check(Schema.isBetweenSize(2, 3))
        const result = yield* Arbitrary.checkEffect(Arbitrary.schema(schema), () => false, {
          runs: 1,
          seed: "map-key-shrinking",
          size: 10
        })

        assert.strictEqual(result._tag, "Falsified")
        if (result._tag === "Falsified") {
          assert.strictEqual(result.shrunkInput.size, 2)
          assert.strictEqual(new Set(result.shrunkInput.keys()).size, result.shrunkInput.size)
        }
      }))

    describe("Schema catalog", () => {
      it.effect("derives primitive and structural schemas", () => {
        const enumValues = {
          Apple: "apple",
          Banana: "banana",
          Cantaloupe: 3
        } as const
        class CatalogClass extends Schema.Class<CatalogClass>("ArbitraryCatalogClass")({
          value: Schema.String
        }) {}
        return verifySchemaCatalog([
          { name: "Any", schema: Schema.Any },
          { name: "Unknown", schema: Schema.Unknown },
          { name: "Void", schema: Schema.Void },
          { name: "Undefined", schema: Schema.Undefined },
          { name: "Null", schema: Schema.Null },
          { name: "String", schema: Schema.String },
          { name: "Number", schema: Schema.Number },
          { name: "Boolean", schema: Schema.Boolean },
          { name: "BigInt", schema: Schema.BigInt },
          { name: "Symbol", schema: Schema.Symbol },
          { name: "UniqueSymbol", schema: Schema.UniqueSymbol(Symbol.for("arbitrary-parity")) },
          { name: "ObjectKeyword", schema: Schema.ObjectKeyword },
          { name: "Literals", schema: Schema.Literals(["a", 1, true, 1n]) },
          { name: "Enum", schema: Schema.Enum(enumValues) },
          {
            name: "TemplateLiteral",
            schema: Schema.TemplateLiteral(["user_", Schema.String.check(Schema.isUUID())])
          },
          { name: "Union", schema: Schema.Union([Schema.String, Schema.Number]) },
          {
            name: "Tuple",
            schema: Schema.Tuple([Schema.String, Schema.optionalKey(Schema.Number)])
          },
          {
            name: "TupleWithRest",
            schema: Schema.TupleWithRest(Schema.Tuple([Schema.Boolean]), [Schema.Number, Schema.String])
          },
          { name: "Array", schema: Schema.Array(Schema.String) },
          {
            name: "Struct",
            schema: Schema.Struct({
              required: Schema.String,
              optional: Schema.optionalKey(Schema.Number)
            })
          },
          { name: "Record(String)", schema: Schema.Record(Schema.String, Schema.Number) },
          { name: "Record(Symbol)", schema: Schema.Record(Schema.Symbol, Schema.Number) },
          { name: "Class", schema: CatalogClass },
          {
            name: "StructWithRest",
            schema: Schema.StructWithRest(
              Schema.Struct({ required: Schema.Number }),
              [Schema.Record(Schema.String, Schema.Number)]
            )
          }
        ])
      })

      it.effect("derives schemas with canonical constraints", () =>
        verifySchemaCatalog([
          {
            name: "String length",
            schema: Schema.String.check(Schema.isMinLength(2), Schema.isMaxLength(4))
          },
          { name: "String starts with", schema: Schema.String.check(Schema.isStartingWith("a.b")) },
          { name: "String ends with", schema: Schema.String.check(Schema.isEndingWith("a+b")) },
          { name: "String includes", schema: Schema.String.check(Schema.isIncluding("[")) },
          { name: "Finite", schema: Schema.Finite },
          { name: "Int32", schema: Schema.Number.check(Schema.isInt32()) },
          {
            name: "Int fractional bounds",
            schema: Schema.Int.check(Schema.isBetween({
              minimum: 1.2,
              maximum: 10.8,
              exclusiveMinimum: true,
              exclusiveMaximum: true
            }))
          },
          {
            name: "BigInt bounds",
            schema: Schema.BigInt.check(Schema.isBetweenBigInt({
              minimum: 0n,
              maximum: 10n,
              exclusiveMinimum: true,
              exclusiveMaximum: true
            }))
          },
          {
            name: "Date bounds",
            schema: Schema.Date.check(Schema.isBetweenDate({
              minimum: new globalThis.Date(0),
              maximum: new globalThis.Date(10),
              exclusiveMinimum: true,
              exclusiveMaximum: true
            }))
          },
          {
            name: "BigDecimal bounds",
            schema: Schema.BigDecimal.check(Schema.isBetweenBigDecimal({
              minimum: BigDecimal.fromStringUnsafe("1.01"),
              maximum: BigDecimal.fromStringUnsafe("1.02"),
              exclusiveMinimum: true,
              exclusiveMaximum: true
            }))
          },
          {
            name: "Array length",
            schema: Schema.Array(Schema.String).check(Schema.isBetweenLength(2, 4))
          },
          {
            name: "UniqueArray",
            schema: Schema.UniqueArray(Schema.String).check(Schema.isMaxLength(2))
          },
          {
            name: "Record properties",
            schema: Schema.Record(Schema.String, Schema.Number).check(Schema.isBetweenProperties(2, 4))
          },
          {
            name: "Struct properties",
            schema: Schema.Struct({
              a: Schema.optionalKey(Schema.String),
              b: Schema.optionalKey(Schema.String),
              c: Schema.optionalKey(Schema.String)
            }).check(Schema.isBetweenProperties(2, 2))
          },
          {
            name: "ReadonlyMap size",
            schema: Schema.ReadonlyMap(Schema.String, Schema.Number).check(Schema.isBetweenSize(2, 4))
          }
        ]))

      it.effect("derives built-in and canonical declarations", () =>
        verifySchemaCatalog([
          { name: "Json", schema: Schema.Json },
          { name: "MutableJson", schema: Schema.MutableJson },
          { name: "Date", schema: Schema.Date },
          { name: "URL", schema: Schema.URL },
          { name: "URLSearchParams", schema: Schema.URLSearchParams },
          { name: "RegExp", schema: Schema.RegExp },
          { name: "Duration", schema: Schema.Duration },
          { name: "BigDecimal", schema: Schema.BigDecimal },
          { name: "DateTimeUtc", schema: Schema.DateTimeUtc },
          { name: "TimeZoneOffset", schema: Schema.TimeZoneOffset },
          { name: "TimeZoneNamed", schema: Schema.TimeZoneNamed },
          { name: "TimeZone", schema: Schema.TimeZone },
          { name: "DateTimeZoned", schema: Schema.DateTimeZoned },
          { name: "Uint8Array", schema: Schema.Uint8Array },
          { name: "UnknownFromJsonString", schema: Schema.UnknownFromJsonString },
          { name: "Option", schema: Schema.Option(Schema.String) },
          { name: "Result", schema: Schema.Result(Schema.Number, Schema.String) },
          { name: "ReadonlySet", schema: Schema.ReadonlySet(Schema.Number) },
          { name: "ReadonlyMap", schema: Schema.ReadonlyMap(Schema.String, Schema.Number) },
          { name: "HashSet", schema: Schema.HashSet(Schema.Number) },
          { name: "HashMap", schema: Schema.HashMap(Schema.String, Schema.Number) },
          { name: "Chunk", schema: Schema.Chunk(Schema.Number) },
          { name: "Redacted", schema: Schema.Redacted(Schema.String, { label: "password" }) },
          { name: "CauseReason", schema: Schema.CauseReason(Schema.String, Schema.String) },
          { name: "Cause", schema: Schema.Cause(Schema.String, Schema.String) },
          { name: "ErrorInstance", schema: Schema.ErrorInstance() },
          { name: "Exit", schema: Schema.Exit(Schema.Number, Schema.String, Schema.String) },
          { name: "File", schema: Schema.File },
          { name: "FormData", schema: Schema.FormData }
        ]))

      it("rejects uninhabited structural schemas", () => {
        assert.throws(
          () => Arbitrary.schema(Schema.Never),
          /Unable to derive an arbitrary for a schema without a finite generation path/
        )
        assert.throws(
          () => Arbitrary.schema(Schema.Struct({ value: Schema.Never })),
          /Unable to derive an arbitrary for a schema without a finite generation path/
        )
        assert.throws(
          () => Arbitrary.schema(Schema.Array(Schema.String).check(Schema.isMinLength(2), Schema.isMaxLength(1))),
          /Unable to derive an arbitrary for array constraints/
        )
        assert.throws(
          () =>
            Arbitrary.schema(
              Schema.Struct({ required: Schema.String }).check(Schema.isMaxProperties(0))
            ),
          /Unable to derive an arbitrary for object property constraints/
        )
      })
    })

    it.effect("generates recursive schemas with a finite path", () =>
      Effect.gen(function*() {
        interface Node {
          readonly value: string
          readonly children: ReadonlyArray<Node>
        }
        const Node: Schema.Codec<Node> = Schema.Struct({
          value: Schema.String,
          children: Schema.Array(Schema.suspend(() => Node)).check(Schema.isMaxLength(3))
        })
        const values = yield* Arbitrary.sampleEffect(Arbitrary.schema(Node), { count: 30, seed: "recursive", size: 5 })

        assert.isTrue(values.every(Schema.is(Node)))
      }))

    it.effect("uses the same recursive value for sampling and a single-run check", () =>
      Effect.gen(function*() {
        interface Node {
          readonly left: ReadonlyArray<Node | null>
          readonly right: ReadonlyArray<Node | null>
        }
        let Node!: Schema.Codec<Node>
        const child = Schema.Union([Schema.Null, Schema.suspend(() => Node)])
        const children = Schema.Array(child).check(Schema.isMinLength(1), Schema.isMaxLength(2))
        Node = Schema.Struct({ left: children, right: children })
        const arbitrary = Arbitrary.schema(Node)
        const sampled = yield* Arbitrary.sampleEffect(arbitrary, {
          count: 1,
          seed: "recursive-parity",
          size: 8
        })
        const checked: Array<Node> = []
        yield* Arbitrary.checkEffect(arbitrary, (value) => {
          checked.push(value)
          return true
        }, { runs: 1, seed: "recursive-parity", size: 8 })

        assert.deepStrictEqual(checked, sampled)
        const assertPropertyOrder = (node: Node | null): void => {
          if (node === null) return
          assert.deepStrictEqual(Object.keys(node), ["left", "right"])
          for (const child of node.left) assertPropertyOrder(child)
          for (const child of node.right) assertPropertyOrder(child)
        }
        assertPropertyOrder(sampled[0])
      }))

    it.effect("reserves the shared recursion budget for later siblings", () =>
      Effect.gen(function*() {
        interface Node {
          readonly children: ReadonlyArray<Node>
        }
        const Node: Schema.Codec<Node> = Schema.Struct({
          children: Schema.Array(Schema.suspend(() => Node)).check(Schema.isMaxLength(3))
        })
        const result = yield* Arbitrary.checkEffect(Arbitrary.schema(Node), () => true, {
          runs: 100,
          seed: "recursive-budget",
          size: 10
        })

        assert.deepStrictEqual(result, { _tag: "Passed", runs: 100, discards: 0 })
      }))

    it.effect("does not assign recursive depth according to sibling order", () =>
      Effect.gen(function*() {
        interface Node {
          readonly left: Node | null
          readonly right: Node | null
        }
        const Node: Schema.Codec<Node> = Schema.Struct({
          left: Schema.Union([Schema.Null, Schema.suspend(() => Node)]),
          right: Schema.Union([Schema.Null, Schema.suspend(() => Node)])
        })
        const values = yield* Arbitrary.sampleEffect(Arbitrary.schema(Node), {
          count: 2_000,
          maxDiscards: 0,
          seed: "recursive-sibling-order",
          size: 8
        })
        const countNodes = (root: Node | null): number => {
          if (root === null) return 0
          assert.deepStrictEqual(Object.keys(root), ["left", "right"])
          return 1 + countNodes(root.left) + countNodes(root.right)
        }
        let left = 0
        let right = 0
        for (const value of values) {
          left += countNodes(value.left)
          right += countNodes(value.right)
        }

        assert.isAbove(left, 0)
        assert.isAbove(right, 0)
        assert.isAtMost(Math.abs(left - right), (left + right) * 0.1)
      }))

    it.effect("reserves the shared recursion budget for record entries", () =>
      Effect.gen(function*() {
        type Node = null | { readonly [key: string]: Node }
        const Node: Schema.Codec<Node> = Schema.Union([
          Schema.Null,
          Schema.Record(Schema.String, Schema.suspend(() => Node)).check(
            Schema.isMinProperties(2),
            Schema.isMaxProperties(2)
          )
        ])
        const result = yield* Arbitrary.checkEffect(Arbitrary.schema(Node), () => true, {
          runs: 100,
          seed: "recursive-record-budget",
          size: 10
        })

        assert.deepStrictEqual(result, { _tag: "Passed", runs: 100, discards: 0 })
      }))

    it.effect("discovers a recursive finite path through a canonical declaration", () =>
      Effect.gen(function*() {
        interface Node {
          readonly next: Option.Option<Node>
        }
        const Node: Schema.Codec<Node> = Schema.Struct({
          next: Schema.Option(Schema.suspend(() => Node))
        })
        const values = yield* Arbitrary.sampleEffect(Arbitrary.schema(Node), {
          count: 30,
          seed: "recursive-option",
          size: 5
        })

        assert.isTrue(values.every(Schema.is(Node)))
      }))

    it.effect("starts progressive checks from a finite recursive base", () =>
      Effect.gen(function*() {
        interface Node {
          readonly next: Node | null
        }
        const Node: Schema.Codec<Node> = Schema.suspend(() =>
          Schema.Struct({
            next: Schema.Union([Schema.Null, Node])
          })
        )
        const result = yield* Arbitrary.checkEffect(Arbitrary.schema(Node), () => true, {
          runs: 2,
          maxDiscards: 0,
          seed: "recursive-base",
          size: 5
        })

        assert.deepStrictEqual(result, { _tag: "Passed", runs: 2, discards: 0 })
      }))

    it.effect("generates mutually recursive schemas", () =>
      Effect.gen(function*() {
        interface Expression {
          readonly type: "expression"
          readonly value: number | Operation
        }
        interface Operation {
          readonly type: "operation"
          readonly left: Expression
          readonly right: Expression
        }
        const Expression: Schema.Codec<Expression> = Schema.Struct({
          type: Schema.Literal("expression"),
          value: Schema.Union([Schema.Int, Schema.suspend((): Schema.Codec<Operation> => Operation)])
        })
        const Operation: Schema.Codec<Operation> = Schema.Struct({
          type: Schema.Literal("operation"),
          left: Expression,
          right: Expression
        })
        const values = yield* Arbitrary.sampleEffect(Arbitrary.schema(Operation), {
          count: 30,
          seed: "mutually-recursive",
          size: 5
        })

        assert.isTrue(values.every(Schema.is(Operation)))
      }))

    it.effect("derives a five-thousand-node mutually recursive component without overflowing", () =>
      Effect.gen(function*() {
        const count = 5_000
        const schemas: Array<Schema.Codec<unknown>> = []
        const suspends = Array.from(
          { length: count },
          (_, index) => Schema.suspend((): Schema.Codec<unknown> => schemas[(index + 1) % count])
        )
        for (let index = 0; index < count; index++) {
          schemas.push(Schema.Union([Schema.Null, Schema.Struct({ next: suspends[index] })]))
        }

        const values = yield* Arbitrary.sampleEffect(Arbitrary.schema(schemas[0]), {
          count: 1,
          maxDiscards: 0,
          seed: "deep-mutual-recursion",
          size: 10
        })

        assert.strictEqual(values.length, 1)
      }))

    it.effect("derives and samples a ten-thousand-node suspend chain without overflowing", () =>
      Effect.gen(function*() {
        const values = yield* Arbitrary.sampleEffect(Arbitrary.schema(makeSuspendChain(10_000)), {
          count: 1,
          maxDiscards: 0,
          seed: "deep-suspend-chain"
        })

        assert.deepStrictEqual(values, [null])
      }))

    it("fails immediately for recursion without a finite path", () => {
      const Recursive = Schema.suspend((): Schema.Codec<unknown> => schema)
      const schema: Schema.Codec<unknown> = Schema.Struct({ value: Recursive })

      assert.throws(
        () => Arbitrary.schema(schema),
        /Unable to derive an arbitrary for a schema without a finite generation path/
      )
    })

    it.effect("treats unproductive recursive union branches as empty", () =>
      Effect.gen(function*() {
        const Empty: Schema.Codec<unknown> = Schema.suspend(() => Schema.Struct({ value: Empty }))
        const values = yield* Arbitrary.sampleEffect(Arbitrary.schema(Schema.Union([Schema.Null, Empty])), {
          count: 10,
          maxDiscards: 0,
          seed: "empty-recursive-branch"
        })

        assert.deepStrictEqual(values, Array.from({ length: 10 }, () => null))
      }))

    it("fails immediately for unsupported declarations", () => {
      const declaration = Schema.declare((input): input is URL => input instanceof URL, { expected: "URL" })

      assert.throws(() => Arbitrary.schema(declaration), /Unable to derive an arbitrary for an unsupported Declaration/)
    })

    it.effect("bounds residual-filter exhaustion", () =>
      Effect.gen(function*() {
        const schema = Schema.String.check(Schema.makeFilter(() => false, { expected: "impossible" }))
        const result = yield* Effect.result(Arbitrary.sampleEffect(Arbitrary.schema(schema), {
          count: 1,
          maxDiscards: 2,
          seed: "exhaustion"
        }))

        assert.isTrue(Result.isFailure(result))
        if (Result.isFailure(result)) {
          assert.deepStrictEqual(result.failure, {
            _tag: "SampleError",
            generated: 0,
            discards: 3,
            seed: "exhaustion"
          })
        }
      }))

    it.effect("evaluates a residual filter once per generated value", () =>
      Effect.gen(function*() {
        let evaluations = 0
        const schema = Schema.Null.check(Schema.makeFilter(() => {
          evaluations++
          return true
        }))
        const result = yield* Arbitrary.checkEffect(Arbitrary.schema(schema), () => true, {
          runs: 1,
          seed: "single-filter-evaluation"
        })

        assert.deepStrictEqual(result, { _tag: "Passed", runs: 1, discards: 0 })
        assert.strictEqual(evaluations, 1)
      }))

    it.effect("interrupts a synchronous residual-filter generation loop", () =>
      Effect.gen(function*() {
        const schema = Schema.String.check(Schema.makeFilter(() => false, { expected: "impossible" }))
        const fiber = yield* Effect.forkChild(Arbitrary.sampleEffect(Arbitrary.schema(schema), {
          count: 1,
          maxDiscards: 100_000,
          seed: "interrupt-generation"
        }))

        yield* Effect.yieldNow
        yield* Fiber.interrupt(fiber)
        const exit = yield* Fiber.await(fiber)

        assert.isTrue(Exit.hasInterrupts(exit))
      }))

    it.effect("interrupts a synchronous successful generation loop", () =>
      Effect.gen(function*() {
        const count = 100_001
        let generated = 0
        const started = yield* Deferred.make<void>()
        const schema = Schema.String.check(Schema.makeFilter(() => {
          generated++
          if (generated === 1) Deferred.doneUnsafe(started, Effect.void)
          return true
        }))
        const arbitrary = Arbitrary.schema(schema)
        generated = 0
        const fiber = yield* Effect.forkChild(
          Arbitrary.sampleEffect(arbitrary, {
            count,
            seed: "interrupt-successful-generation"
          }).pipe(Effect.provideService(Scheduler.MaxOpsBeforeYield, 16))
        )

        yield* Deferred.await(started)
        assert.isBelow(generated, count)
        yield* Fiber.interrupt(fiber)
        const exit = yield* Fiber.await(fiber)

        assert.isTrue(Exit.hasInterrupts(exit))
      }))

    it.effect("interrupts deep suspended generation", () =>
      Effect.gen(function*() {
        const arbitrary = Arbitrary.schema(makeSuspendChain(10_000))
        const fiber = yield* Effect.forkChild(Arbitrary.sampleEffect(arbitrary, {
          count: 1,
          maxDiscards: 0,
          seed: "interrupt-suspended-generation"
        }))

        yield* Effect.yieldNow
        yield* Fiber.interrupt(fiber)
        const exit = yield* Fiber.await(fiber)

        assert.isTrue(Exit.hasInterrupts(exit))
      }))
  })

  describe("combinators", () => {
    it.effect("generates a constant without shrink candidates", () =>
      Effect.gen(function*() {
        const value = { tag: "value" }
        const arbitrary = Arbitrary.Constant(value)
        const values = yield* Arbitrary.sampleEffect(arbitrary, { count: 3, seed: "constant" })
        const result = yield* Arbitrary.checkEffect(arbitrary, () => false, {
          runs: 1,
          seed: "constant"
        })

        assert.deepStrictEqual(values, [value, value, value])
        assert.isTrue(values.every((sample) => sample === value))
        assert.strictEqual(result._tag, "Falsified")
        if (result._tag === "Falsified") {
          assert.strictEqual(result.initialInput, value)
          assert.strictEqual(result.shrunkInput, value)
          assert.strictEqual(result.shrinks, 0)
        }
      }))

    it.effect("maps generated values and the complete shrink tree", () =>
      Effect.gen(function*() {
        const arbitrary = Arbitrary.schema(
          Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 1_000 }))
        ).pipe(
          Arbitrary.map((value) => value * 2)
        )
        const result = yield* Arbitrary.checkEffect(arbitrary, () => false, { runs: 1, seed: 47, size: 10 })

        assert.strictEqual(result._tag, "Falsified")
        if (result._tag === "Falsified") {
          assert.strictEqual(result.initialInput, 2_000)
          assert.strictEqual(result.shrunkInput, 2)
          assert.strictEqual(result.shrinks, 1)
        }
      }))

    it.effect("preserves duplicate shrink positions after a non-injective map", () =>
      Effect.gen(function*() {
        const arbitrary = Arbitrary.map(
          Arbitrary.schema(Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 1_000 }))),
          () => "same"
        )
        let evaluations = 0
        const result = yield* Arbitrary.checkEffect(arbitrary, () => {
          evaluations++
          return false
        }, { runs: 1, seed: 47, size: 10 })

        assert.strictEqual(result._tag, "Falsified")
        if (result._tag === "Falsified") {
          assert.strictEqual(result.initialInput, "same")
          assert.strictEqual(result.shrunkInput, "same")
          assert.strictEqual(result.shrinks, 1)
          assert.strictEqual(evaluations, 2)
        }
      }))

    it.effect("bounds values rejected by filter", () =>
      Effect.gen(function*() {
        const arbitrary = Arbitrary.filter(Arbitrary.schema(Schema.Int), () => false)
        const sampled = yield* Effect.result(Arbitrary.sampleEffect(arbitrary, {
          count: 1,
          maxDiscards: 2,
          seed: "filter-exhaustion"
        }))
        const checked = yield* Arbitrary.checkEffect(arbitrary, () => true, {
          runs: 1,
          maxDiscards: 2,
          seed: "filter-exhaustion"
        })

        assert.isTrue(Result.isFailure(sampled))
        if (Result.isFailure(sampled)) {
          assert.deepStrictEqual(sampled.failure, {
            _tag: "SampleError",
            generated: 0,
            discards: 3,
            seed: "filter-exhaustion"
          })
        }
        assert.deepStrictEqual(checked, {
          _tag: "Exhausted",
          runs: 0,
          discards: 3,
          seed: "filter-exhaustion"
        })
      }))

    it.effect("promotes accepted shrink descendants through filter", () =>
      Effect.gen(function*() {
        const arbitrary = Arbitrary.filter(
          Arbitrary.schema(Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 100 }))),
          (value) => value === 100 || value === 26
        )
        const result = yield* Arbitrary.checkEffect(arbitrary, () => false, { runs: 1, seed: 47, size: 10 })

        assert.strictEqual(result._tag, "Falsified")
        if (result._tag === "Falsified") {
          assert.strictEqual(result.initialInput, 100)
          assert.strictEqual(result.shrunkInput, 26)
          assert.strictEqual(result.shrinks, 1)
        }
      }))

    it.effect("transforms accepted values and discards rejected values with filterMap", () =>
      Effect.gen(function*() {
        const arbitrary = Arbitrary.filterMap(
          Arbitrary.schema(Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 100 }))),
          (value) => value % 2 === 0 ? Result.succeed(`even:${value}`) : Result.fail(value)
        )
        const values = yield* Arbitrary.sampleEffect(arbitrary, {
          count: 20,
          maxDiscards: 100,
          seed: "filter-map"
        })

        assert.strictEqual(values.length, 20)
        assert.isTrue(values.every((value) => /^even:\d+$/.test(value)))
      }))

    it.effect("promotes transformed shrink descendants through filterMap", () =>
      Effect.gen(function*() {
        const arbitrary = Arbitrary.filterMap(
          Arbitrary.schema(Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 100 }))),
          (value) => value === 100 || value === 26 ? Result.succeed(`value:${value}`) : Result.fail(value)
        )
        const result = yield* Arbitrary.checkEffect(arbitrary, () => false, { runs: 1, seed: 47, size: 10 })

        assert.strictEqual(result._tag, "Falsified")
        if (result._tag === "Falsified") {
          assert.strictEqual(result.initialInput, "value:100")
          assert.strictEqual(result.shrunkInput, "value:26")
          assert.strictEqual(result.shrinks, 1)
          const replayed = yield* Arbitrary.checkEffect(arbitrary, () => false, { replay: result.replay })
          assert.strictEqual(replayed._tag, "Falsified")
          if (replayed._tag === "Falsified") {
            assert.strictEqual(replayed.initialInput, result.initialInput)
            assert.strictEqual(replayed.shrunkInput, result.shrunkInput)
            assert.strictEqual(replayed.shrinks, result.shrinks)
          }
        }
      }))

    it.effect("keeps root generation stable and shrinks dependent lengths consistently", () =>
      Effect.gen(function*() {
        const source = Arbitrary.schema(Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 8 })))
        const item = Schema.Int.check(Schema.isBetween({ minimum: -1_000, maximum: 1_000 }))
        const dependents = globalThis.Array.from({ length: 8 }, (_, index) => {
          const length = index + 1
          return Arbitrary.schema(
            Schema.Array(item).check(Schema.isMinLength(length), Schema.isMaxLength(length))
          ).pipe(Arbitrary.map((values) => ({ length, values })))
        })
        const arbitrary = source.pipe(Arbitrary.flatMap((length) => dependents[length - 1]))

        const composite = Arbitrary.all({
          dependent: arbitrary,
          after: Arbitrary.schema(Schema.Int)
        })
        const sampled = yield* Arbitrary.sampleEffect(composite, { count: 1, seed: 3, size: 8 })
        let checked: {
          readonly dependent: { readonly length: number; readonly values: ReadonlyArray<number> }
          readonly after: number
        } | undefined
        yield* Arbitrary.checkEffect(composite, (value) => {
          checked = value
          return true
        }, { runs: 1, seed: 3, size: 8 })
        assert.deepStrictEqual(sampled[0], checked)

        let failures = 0
        for (let seed = 0; seed < 32; seed++) {
          const result = yield* Arbitrary.checkEffect(arbitrary, (value) => value.values[0] >= 0, {
            runs: 1,
            seed,
            size: 8
          })
          if (result._tag === "Falsified") {
            failures++
            assert.strictEqual(result.shrunkInput.length, 1)
          }
        }
        assert.isAbove(failures, 0)
      }))

    it.effect("shrinks the source first and closes it after selecting a dependent shrink", () =>
      Effect.gen(function*() {
        const integers = Arbitrary.schema(Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 100 })))
        const sources: Array<number> = []
        const arbitrary = Arbitrary.flatMap(integers, (source) => {
          sources.push(source)
          return Arbitrary.map(integers, (target) => ({ source, target }))
        })
        let initial: { readonly source: number; readonly target: number } | undefined
        const result = yield* Arbitrary.checkEffect(arbitrary, (value) => {
          if (initial === undefined) {
            initial = value
            return false
          }
          return value.source !== initial.source || value.target === initial.target
        }, { runs: 1, seed: 0, size: 10 })

        assert.strictEqual(result._tag, "Falsified")
        if (result._tag === "Falsified") {
          assert.deepStrictEqual(result.initialInput, { source: 2, target: 15 })
          assert.deepStrictEqual(result.shrunkInput, { source: 2, target: 1 })
          assert.strictEqual(result.shrinks, 1)
          assert.deepStrictEqual(sources, [2, 1])
        }
      }))

    it.effect("replays source, dependent, and promoted flatMap shrink paths", () =>
      Effect.gen(function*() {
        const integers = Arbitrary.schema(Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 100 })))
        const cases: ReadonlyArray<{
          readonly arbitrary: Arbitrary.Arbitrary<number>
          readonly property: (value: number) => boolean
          readonly shrunkInput: number
        }> = [
          {
            arbitrary: Arbitrary.flatMap(integers, (value) => Arbitrary.schema(Schema.Literal(value))),
            property: (value) => value < 10,
            shrunkInput: 10
          },
          {
            arbitrary: Arbitrary.flatMap(Arbitrary.schema(Schema.Null), () => integers),
            property: (value) => value < 10,
            shrunkInput: 10
          },
          {
            arbitrary: Arbitrary.flatMap(integers, (value) =>
              value === 100 || value === 26
                ? Arbitrary.schema(Schema.Literal(value))
                : Arbitrary.filter(Arbitrary.schema(Schema.Literal(value)), () => false)),
            property: () => false,
            shrunkInput: 26
          }
        ]

        for (const test of cases) {
          const result = yield* Arbitrary.checkEffect(test.arbitrary, test.property, {
            runs: 1,
            seed: 47,
            size: 10
          })
          assert.strictEqual(result._tag, "Falsified")
          if (result._tag !== "Falsified") continue
          assert.strictEqual(result.initialInput, 100)
          assert.strictEqual(result.shrunkInput, test.shrunkInput)

          const replayed = yield* Arbitrary.checkEffect(test.arbitrary, test.property, { replay: result.replay })
          assert.strictEqual(replayed._tag, "Falsified")
          if (replayed._tag === "Falsified") {
            assert.strictEqual(replayed.initialInput, result.initialInput)
            assert.strictEqual(replayed.shrunkInput, result.shrunkInput)
            assert.deepStrictEqual(replayed.failure, result.failure)
            assert.strictEqual(replayed.shrinks, result.shrinks)
          }
        }
      }))

    it.effect("bounds initial flatMap discards and terminates an all-discard shrink frontier", () =>
      Effect.gen(function*() {
        const rejected = Arbitrary.filter(Arbitrary.schema(Schema.Literal("value")), () => false)
        const roots = [
          Arbitrary.flatMap(rejected, () => Arbitrary.schema(Schema.Literal("target"))),
          Arbitrary.flatMap(Arbitrary.schema(Schema.Literal("source")), () => rejected)
        ]
        for (const arbitrary of roots) {
          const sampled = yield* Effect.result(Arbitrary.sampleEffect(arbitrary, {
            count: 1,
            maxDiscards: 2,
            seed: "flat-map-discard"
          }))
          const checked = yield* Arbitrary.checkEffect(arbitrary, () => true, {
            runs: 1,
            maxDiscards: 2,
            seed: "flat-map-discard"
          })
          assert.isTrue(Result.isFailure(sampled))
          if (Result.isFailure(sampled)) {
            assert.deepStrictEqual(sampled.failure, {
              _tag: "SampleError",
              generated: 0,
              discards: 3,
              seed: "flat-map-discard"
            })
          }
          assert.deepStrictEqual(checked, {
            _tag: "Exhausted",
            runs: 0,
            discards: 3,
            seed: "flat-map-discard"
          })
        }

        const integers = Arbitrary.schema(Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 10 })))
        const frontier = Arbitrary.flatMap(integers, (value) =>
          value === 10
            ? Arbitrary.schema(Schema.Literal(value))
            : Arbitrary.filter(Arbitrary.schema(Schema.Literal(value)), () => false))
        const result = yield* Arbitrary.checkEffect(frontier, () => false, { runs: 1, seed: 47, size: 10 })
        assert.strictEqual(result._tag, "Falsified")
        if (result._tag === "Falsified") {
          assert.strictEqual(result.initialInput, 10)
          assert.strictEqual(result.shrunkInput, 10)
          assert.strictEqual(result.shrinks, 0)
        }
      }))

    it.effect("shares recursive fuel and tops up only the dependent minimum cost", () =>
      Effect.gen(function*() {
        interface Chain {
          readonly next: Chain | null
        }
        const Chain: Schema.Codec<Chain> = Schema.Struct({
          next: Schema.suspend(() => Schema.Union([Schema.Null, Chain]))
        })
        const chain = Arbitrary.schema(Chain)
        const triple = chain.pipe(
          Arbitrary.flatMap((first) =>
            chain.pipe(
              Arbitrary.flatMap((second) => chain.pipe(Arbitrary.map((third) => [first, second, third] as const)))
            )
          )
        )
        const chainSize = (value: Chain): number => 1 + (value.next === null ? 0 : chainSize(value.next))

        const values = yield* Arbitrary.sampleEffect(triple, {
          count: 512,
          maxDiscards: 0,
          seed: 42,
          size: 8
        })
        assert.isTrue(values.every((value) => value.reduce((total, item) => total + chainSize(item), 0) - 3 <= 8))

        let checked = 0
        const result = yield* Arbitrary.checkEffect(triple, (value) => {
          checked++
          return value.reduce((total, item) => total + chainSize(item), 0) - 3 <= 8
        }, { runs: 128, seed: 42, size: 8 })
        assert.deepStrictEqual(result, { _tag: "Passed", runs: 128, discards: 0 })
        assert.strictEqual(checked, 128)

        const minimum = yield* Arbitrary.sampleEffect(triple, {
          count: 64,
          maxDiscards: 0,
          seed: 42,
          size: 0
        })
        assert.isTrue(minimum.every((value) => value.every((item) => chainSize(item) === 1)))
      }))

    it.effect("supports mutually recursive Schema Arbitraries as source and dependent", () =>
      Effect.gen(function*() {
        interface A {
          readonly _tag: "A"
          readonly next: B | null
        }
        interface B {
          readonly _tag: "B"
          readonly next: A | null
        }
        const A: Schema.Codec<A> = Schema.Struct({
          _tag: Schema.Literal("A"),
          next: Schema.suspend(() => Schema.Union([Schema.Null, B]))
        })
        const B: Schema.Codec<B> = Schema.Struct({
          _tag: Schema.Literal("B"),
          next: Schema.suspend(() => Schema.Union([Schema.Null, A]))
        })
        const arbitrary = Arbitrary.flatMap(
          Arbitrary.schema(A),
          (left) => Arbitrary.map(Arbitrary.schema(B), (right) => [left, right] as const)
        )
        const values = yield* Arbitrary.sampleEffect(arbitrary, {
          count: 30,
          maxDiscards: 0,
          seed: "flat-map-mutual-recursion",
          size: 5
        })

        assert.isTrue(values.every(([left, right]) => Schema.is(A)(left) && Schema.is(B)(right)))
      }))

    it.effect("keeps dependent generation interruptible", () =>
      Effect.gen(function*() {
        const started = yield* Deferred.make<void>()
        const schema = Schema.declare<number>((input): input is number => typeof input === "number", {
          toCodecArbitrary: () =>
            Schema.link<number>()(
              Schema.Literal(1),
              SchemaTransformation.transformEffect<number, 1>({
                decode: () => {
                  Deferred.doneUnsafe(started, Effect.void)
                  return Effect.never
                },
                encode: () => Effect.succeed(1)
              })
            )
        })
        const arbitrary = Arbitrary.flatMap(
          Arbitrary.schema(Schema.Literal("source")),
          () => Arbitrary.schema(schema)
        )
        const fiber = yield* Effect.forkChild(Arbitrary.sampleEffect(arbitrary, {
          count: 1,
          seed: "interrupt-flat-map-dependent"
        }))

        yield* Deferred.await(started)
        yield* Fiber.interrupt(fiber)
        const exit = yield* Fiber.await(fiber)
        assert.isTrue(Exit.hasInterrupts(exit))
      }))

    it.effect("interrupts long discarded-source promotion", () =>
      Effect.gen(function*() {
        const started = yield* Deferred.make<void>()
        const source = Arbitrary.schema(
          Schema.Array(Schema.Int).check(Schema.isMinLength(1_000), Schema.isMaxLength(1_000))
        )
        let callbacks = 0
        const arbitrary = Arbitrary.flatMap(source, (value) => {
          callbacks++
          if (callbacks === 2) Deferred.doneUnsafe(started, Effect.void)
          const target = Arbitrary.Constant(value)
          return callbacks === 1 ? target : Arbitrary.filter(target, () => false)
        })
        const fiber = yield* Effect.forkChild(
          Arbitrary.checkEffect(arbitrary, () => false, {
            runs: 1,
            seed: "interrupt-flat-map-promotion"
          }).pipe(Effect.provideService(Scheduler.MaxOpsBeforeYield, 16))
        )

        yield* Deferred.await(started)
        yield* Fiber.interrupt(fiber)
        const exit = yield* Fiber.await(fiber)
        assert.isTrue(Exit.hasInterrupts(exit))
      }))

    it.effect("keeps synchronous combinator exceptions as defects", () =>
      Effect.gen(function*() {
        const source = Arbitrary.schema(Schema.Literal("value"))
        const defect = (): never => {
          throw new Error("combinator defect")
        }
        const arbitraries: ReadonlyArray<Arbitrary.Arbitrary<unknown>> = [
          Arbitrary.map(source, defect),
          Arbitrary.filter(source, defect),
          Arbitrary.filterMap(source, defect),
          Arbitrary.flatMap(source, defect)
        ]

        for (const arbitrary of arbitraries) {
          const exit = yield* Effect.exit(Arbitrary.sampleEffect(arbitrary, { count: 1, seed: "combinator-defect" }))
          assert.isTrue(Exit.hasDies(exit))
        }
      }))

    it.effect("combines tuple, iterable, and record Arbitraries with all", () =>
      Effect.gen(function*() {
        const text = Arbitrary.schema(Schema.Literal("value"))
        const count = Arbitrary.schema(Schema.Literal(1))
        const tuple = yield* Arbitrary.sampleEffect(Arbitrary.all([text, count]), {
          count: 1,
          maxDiscards: 0,
          seed: "all-tuple"
        })
        const iterable = yield* Arbitrary.sampleEffect(Arbitrary.all(new Set([text, count])), {
          count: 1,
          maxDiscards: 0,
          seed: "all-iterable"
        })
        const record = yield* Arbitrary.sampleEffect(Arbitrary.all({ text, count }), {
          count: 1,
          maxDiscards: 0,
          seed: "all-record"
        })
        const emptyTuple = yield* Arbitrary.sampleEffect(Arbitrary.all([]), { count: 1, seed: "all-empty-tuple" })
        const emptyRecord = yield* Arbitrary.sampleEffect(Arbitrary.all({}), { count: 1, seed: "all-empty-record" })

        assert.deepStrictEqual(tuple, [["value", 1]])
        assert.deepStrictEqual(iterable, [["value", 1]])
        assert.deepStrictEqual(record, [{ text: "value", count: 1 }])
        assert.deepStrictEqual(emptyTuple, [[]])
        assert.deepStrictEqual(emptyRecord, [{}])
      }))

    it.effect("shrinks all members independently and replays the product", () =>
      Effect.gen(function*() {
        const member = Arbitrary.schema(Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 100 })))
        const arbitrary = Arbitrary.all([member, member])
        const result = yield* Arbitrary.checkEffect(arbitrary, () => false, { runs: 1, seed: 47, size: 10 })

        assert.strictEqual(result._tag, "Falsified")
        if (result._tag === "Falsified") {
          assert.deepStrictEqual(result.shrunkInput, [1, 1])
          const replayed = yield* Arbitrary.checkEffect(arbitrary, () => false, { replay: result.replay })
          assert.deepStrictEqual(replayed, result)
        }
      }))

    it.effect("shares one optional recursion budget across all members", () =>
      Effect.gen(function*() {
        interface Chain {
          readonly next: Chain | null
        }
        const Chain: Schema.Codec<Chain> = Schema.Struct({
          next: Schema.suspend(() => Schema.Union([Schema.Null, Chain]))
        })
        const values = yield* Arbitrary.sampleEffect(
          Arbitrary.all([
            Arbitrary.schema(Chain),
            Arbitrary.schema(Chain),
            Arbitrary.schema(Chain)
          ]),
          {
            count: 100,
            maxDiscards: 0,
            seed: "all-recursion-budget",
            size: 5
          }
        )
        const depth = (chain: Chain): number => chain.next === null ? 1 : 1 + depth(chain.next)

        assert.isTrue(values.every((value) => value.reduce((total, chain) => total + depth(chain) - 1, 0) <= 5))
      }))

    it.effect("preserves special record keys", () =>
      Effect.gen(function*() {
        const input = Object.fromEntries([
          ["__proto__", Arbitrary.schema(Schema.Literal("value"))]
        ]) as Record<"__proto__", Arbitrary.Arbitrary<"value">>
        const arbitrary = Arbitrary.all(input)
        const values = yield* Arbitrary.sampleEffect(arbitrary, { count: 512, seed: "all-proto" })
        const prototypes = new Set(values.map(Object.getPrototypeOf))

        assert.isTrue(values.every((value) => Object.hasOwn(value, "__proto__") && value.__proto__ === "value"))
        assert.isTrue(prototypes.has(Object.prototype))
        assert.isTrue(prototypes.has(null))
      }))
  })

  describe("exhaustion", () => {
    it.effect("reports and reuses an automatically resolved seed", () =>
      Effect.gen(function*() {
        const seed = 123_456
        const random = {
          nextIntUnsafe: () => seed,
          nextDoubleUnsafe: () => 0
        }
        const arbitrary = Arbitrary.filter(Arbitrary.schema(Schema.Literal("value")), () => false)
        const sampleOptions = { count: 1, maxDiscards: 2 } as const
        const checkOptions = { runs: 1, maxDiscards: 2 } as const

        const sampled = yield* Effect.result(Arbitrary.sampleEffect(arbitrary, sampleOptions)).pipe(
          Effect.provideService(Random.Random, random)
        )
        assert.isTrue(Result.isFailure(sampled))
        if (Result.isSuccess(sampled)) return
        assert.strictEqual(sampled.failure.seed, seed)
        const resampled = yield* Effect.result(Arbitrary.sampleEffect(arbitrary, {
          ...sampleOptions,
          seed: sampled.failure.seed
        }))

        const checked = yield* Arbitrary.checkEffect(arbitrary, () => true, checkOptions).pipe(
          Effect.provideService(Random.Random, random)
        )
        assert.strictEqual(checked._tag, "Exhausted")
        if (checked._tag !== "Exhausted") return
        assert.strictEqual(checked.seed, seed)
        const rechecked = yield* Arbitrary.checkEffect(arbitrary, () => true, {
          ...checkOptions,
          seed: checked.seed
        })

        assert.deepStrictEqual(resampled, sampled)
        assert.deepStrictEqual(rechecked, checked)
      }))
  })

  describe("formatCheckFailure", () => {
    it("formats diagnostic values without ambiguity", () => {
      const falsified = Arbitrary.formatCheckFailure({
        _tag: "Falsified",
        initialInput: "initial",
        shrunkInput: "\n",
        failure: { _tag: "PropertyError", error: "boom" },
        runs: 1,
        discards: 0,
        shrinks: 0,
        replay: "replay"
      })
      const exhausted = Arbitrary.formatCheckFailure({
        _tag: "Exhausted",
        runs: 0,
        discards: 1,
        seed: "seed"
      })
      const map = Arbitrary.formatCheckFailure({
        _tag: "Falsified",
        initialInput: new Map(),
        shrunkInput: new Map([["key", 1]]),
        failure: { _tag: "ReturnedFalse" },
        runs: 1,
        discards: 0,
        shrinks: 0,
        replay: "replay"
      })
      const throwingInput = Object.defineProperty({}, "value", {
        enumerable: true,
        get() {
          throw new Error("getter defect")
        }
      })
      const throwing = Arbitrary.formatCheckFailure({
        _tag: "Falsified",
        initialInput: throwingInput,
        shrunkInput: throwingInput,
        failure: { _tag: "ReturnedFalse" },
        runs: 1,
        discards: 0,
        shrinks: 0,
        replay: "replay"
      })

      assert.strictEqual(
        falsified,
        "Property falsified after 1 run(s) and 0 shrink(s)\nShrunk input: \"\\n\"\nFailure: \"boom\"\nReplay: replay"
      )
      assert.strictEqual(exhausted, "Property exhausted after 0 run(s) and 1 discard(s)\nSeed: \"seed\"")
      assert.match(map!, /Shrunk input: Map\(/)
      assert.match(throwing!, /Shrunk input: {"value":"\[property access threw\]"}/)
      assert.match(throwing!, /Replay: replay$/)
    })
  })

  describe("checkEffect", () => {
    it.effect("isolates generation Random from property Random", () =>
      Effect.gen(function*() {
        const arbitrary = Arbitrary.schema(Schema.Int)
        const pureInputs: Array<number> = []
        const effectfulInputs: Array<number> = []

        yield* Arbitrary.checkEffect(arbitrary, (value) => {
          pureInputs.push(value)
          return true
        }, { runs: 20, seed: "random-isolation" })
        yield* Arbitrary.checkEffect(arbitrary, (value) =>
          Effect.gen(function*() {
            effectfulInputs.push(value)
            yield* Random.next
            yield* Random.next
            return true
          }), { runs: 20, seed: "random-isolation" })

        assert.deepStrictEqual(effectfulInputs, pureInputs)
      }))

    it.effect("grows size across successful runs without advancing on discards", () =>
      Effect.gen(function*() {
        type Node = null | { readonly next: Node }
        const Node: Schema.Codec<Node> = Schema.Union([
          Schema.Null.check(Schema.makeFilter(() => false, { expected: "discard" })),
          Schema.Null,
          Schema.Struct({ next: Schema.suspend(() => Node) })
        ])
        const inputs: Array<Node> = []
        const result = yield* Arbitrary.checkEffect(Arbitrary.schema(Node), (input) => {
          inputs.push(input)
          return true
        }, {
          runs: 100,
          size: 1,
          seed: "progressive-size"
        })

        assert.strictEqual(result._tag, "Passed")
        if (result._tag === "Passed") assert.isAbove(result.discards, 0)
        assert.isTrue(inputs.slice(0, 50).every((input) => input === null))
        assert.isTrue(inputs.slice(50).some((input) => input !== null))
      }))

    it.effect("shrinks integers to the local failure boundary", () =>
      Effect.gen(function*() {
        const result = yield* Arbitrary.checkEffect(
          Arbitrary.schema(Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 100 }))),
          (value) => value < 10,
          { runs: 100, seed: 0, size: 10 }
        )

        assert.strictEqual(result._tag, "Falsified")
        if (result._tag === "Falsified") {
          assert.strictEqual(result.shrunkInput, 10)
        }
      }))

    it.effect("shrinks bounded positive BigInts toward the minimum", () =>
      Effect.gen(function*() {
        const result = yield* Arbitrary.checkEffect(
          Arbitrary.schema(Schema.BigInt.check(Schema.isBetweenBigInt({ minimum: 100n, maximum: 1_000n }))),
          () => false,
          { runs: 1, seed: 21 }
        )

        assert.strictEqual(result._tag, "Falsified")
        if (result._tag === "Falsified") {
          assert.isTrue(result.initialInput > 100n)
          assert.strictEqual(result.shrunkInput, 100n)
        }
      }))

    it.effect("shrinks bounded BigInts to the local failure boundary", () =>
      Effect.gen(function*() {
        const result = yield* Arbitrary.checkEffect(
          Arbitrary.schema(Schema.BigInt.check(Schema.isBetweenBigInt({ minimum: 100n, maximum: 1_000n }))),
          (value) => value < 700n,
          { runs: 1, seed: 839 }
        )

        assert.strictEqual(result._tag, "Falsified")
        if (result._tag === "Falsified") {
          assert.strictEqual(result.initialInput, 775n)
          assert.strictEqual(result.shrunkInput, 700n)
        }
      }))

    it.effect("selects the closest-to-zero BigInt shrink target", () =>
      Effect.gen(function*() {
        const cases = [
          { minimum: -1_000n, maximum: -100n, target: -100n },
          { minimum: -1_000n, maximum: 1_000n, target: 0n }
        ] as const
        for (const { maximum, minimum, target } of cases) {
          const result = yield* Arbitrary.checkEffect(
            Arbitrary.schema(Schema.BigInt.check(Schema.isBetweenBigInt({ minimum, maximum }))),
            () => false,
            { runs: 1, seed: 21 }
          )

          assert.strictEqual(result._tag, "Falsified")
          if (result._tag === "Falsified") {
            assert.notStrictEqual(result.initialInput, target)
            assert.strictEqual(result.shrunkInput, target)
          }
        }
      }))

    it.effect("shrinks Numbers to the local representable failure boundary", () =>
      Effect.gen(function*() {
        const result = yield* Arbitrary.checkEffect(
          Arbitrary.schema(Schema.Number.check(Schema.isBetween({ minimum: 2, maximum: 4 }))),
          (value) => value < 3,
          { runs: 100, seed: 1, size: 10 }
        )

        assert.strictEqual(result._tag, "Falsified")
        if (result._tag === "Falsified") {
          assert.isAtLeast(result.initialInput, 3)
          assert.strictEqual(result.shrunkInput, 3)
        }
      }))

    it.effect("shrinks NaN through the ordinary Number target", () =>
      Effect.gen(function*() {
        const result = yield* Arbitrary.checkEffect(Arbitrary.schema(Schema.Number), () => false, {
          runs: 1,
          seed: 231,
          size: 10
        })

        assert.strictEqual(result._tag, "Falsified")
        if (result._tag === "Falsified") {
          assert.isTrue(Number.isNaN(result.initialInput))
          assert.strictEqual(result.shrunkInput, 0)
        }
      }))

    it.effect("shrinks recursive unions toward a finite base branch", () =>
      Effect.gen(function*() {
        type Node = null | { readonly next: Node }
        const Node: Schema.Codec<Node> = Schema.Union([
          Schema.Null,
          Schema.Struct({ next: Schema.suspend(() => Node) })
        ])
        const result = yield* Arbitrary.checkEffect(Arbitrary.schema(Node), () => false, {
          runs: 1,
          seed: 1,
          size: 5
        })

        assert.strictEqual(result._tag, "Falsified")
        if (result._tag === "Falsified") {
          assert.notStrictEqual(result.initialInput, null)
          assert.strictEqual(result.shrunkInput, null)

          const replayed = yield* Arbitrary.checkEffect(Arbitrary.schema(Node), () => false, { replay: result.replay })
          assert.strictEqual(replayed._tag, "Falsified")
          if (replayed._tag === "Falsified") {
            assert.deepStrictEqual(replayed.initialInput, result.initialInput)
            assert.strictEqual(replayed.shrunkInput, null)
          }
        }
      }))

    it.effect("isolates Union fallback shrinking from later tuple members", () =>
      Effect.gen(function*() {
        type Node = string | { readonly next: Node }
        const Node: Schema.Codec<Node> = Schema.Union([
          Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(1)),
          Schema.Struct({ next: Schema.suspend(() => Node) })
        ])
        const trace = <A>(schema: Schema.Schema<A>) => {
          const evaluated: Array<A> = []
          return Arbitrary.checkEffect(Arbitrary.schema(schema), (value) => {
            evaluated.push(value)
            return false
          }, { runs: 1, maxShrinks: 1, seed: 1, size: 5 }).pipe(Effect.as(evaluated))
        }

        const withConstantSuffix = yield* trace(Schema.Tuple([Node, Schema.Null]))
        const withRandomSuffix = yield* trace(Schema.Tuple([
          Node,
          Schema.String.check(Schema.isMinLength(8), Schema.isMaxLength(8))
        ]))

        assert.deepStrictEqual(withConstantSuffix[0][0], withRandomSuffix[0][0])
        assert.strictEqual(withConstantSuffix[1][0], withRandomSuffix[1][0])
      }))

    it.effect("shrinks and replays the complete falsification", () =>
      Effect.gen(function*() {
        const arbitrary = Arbitrary.schema(
          Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 100 }))
        )
        const first = yield* Arbitrary.checkEffect(arbitrary, (value) => value < 0, {
          runs: 1,
          seed: "replay",
          size: 10
        })
        assert.strictEqual(first._tag, "Falsified")
        if (first._tag !== "Falsified") return
        assert.strictEqual(first.runs, 1)
        assert.strictEqual(typeof first.replay, "string")

        const replay = `${first.replay}`
        const replayed = yield* Arbitrary.checkEffect(arbitrary, (value) => value < 0, { replay })
        assert.strictEqual(replayed._tag, "Falsified")
        if (replayed._tag !== "Falsified") return
        assert.strictEqual(replayed.runs, 1)
        assert.strictEqual(first.shrunkInput, 1)
        assert.strictEqual(replayed.initialInput, first.initialInput)
        assert.strictEqual(replayed.shrunkInput, first.shrunkInput)
        assert.deepStrictEqual(replayed.failure, first.failure)
        assert.strictEqual(replayed.shrinks, first.shrinks)
      }))

    it.effect("preserves a returned-false failure while shrinking", () =>
      Effect.gen(function*() {
        const evaluated: Array<string> = []
        const arbitrary = Arbitrary.schema(Schema.Literals(["root", "error", "false"]), {
          shrink: (value) => value === "root" ? ["error", "false"] as const : []
        })
        const result = yield* Arbitrary.checkEffect(arbitrary, (value) => {
          evaluated.push(value)
          return value === "error" ? Effect.fail("different failure") : false
        }, {
          runs: 1,
          maxShrinks: 2,
          seed: 0
        })

        assert.strictEqual(result._tag, "Falsified")
        if (result._tag === "Falsified") {
          assert.strictEqual(result.initialInput, "root")
          assert.strictEqual(result.shrunkInput, "false")
          assert.deepStrictEqual(result.failure, { _tag: "ReturnedFalse" })
          assert.strictEqual(result.shrinks, 1)
          assert.deepStrictEqual(evaluated, ["root", "error", "false"])
        }
      }))

    it.effect("preserves a typed-error failure while shrinking and replaying", () =>
      Effect.gen(function*() {
        const evaluated: Array<string> = []
        const arbitrary = Arbitrary.schema(Schema.Literals(["root", "false", "error"]), {
          shrink: (value) => value === "root" ? ["false", "error"] as const : []
        })
        const property = (value: "root" | "false" | "error") => {
          evaluated.push(value)
          return value === "false" ? false : Effect.fail(value)
        }
        const result = yield* Arbitrary.checkEffect(arbitrary, property, {
          runs: 1,
          maxShrinks: 2,
          seed: 0
        })

        assert.strictEqual(result._tag, "Falsified")
        if (result._tag === "Falsified") {
          assert.strictEqual(result.initialInput, "root")
          assert.strictEqual(result.shrunkInput, "error")
          assert.deepStrictEqual(result.failure, { _tag: "PropertyError", error: "error" })
          assert.strictEqual(result.shrinks, 1)
          assert.deepStrictEqual(evaluated, ["root", "false", "error"])

          evaluated.length = 0
          const replayed = yield* Arbitrary.checkEffect(arbitrary, property, { replay: result.replay })
          assert.deepStrictEqual(replayed, result)
          assert.deepStrictEqual(evaluated, ["root", "error"])

          const mismatch = yield* Arbitrary.checkEffect(
            arbitrary,
            (value) => value === "root" ? Effect.fail(value) : false,
            { replay: result.replay }
          )
          assert.deepStrictEqual(mismatch, { _tag: "ReplayMismatch", reason: "ShrinkPassed" })
        }
      }))

    it.effect("rejects replay when the recorded root failure class changes", () =>
      Effect.gen(function*() {
        const arbitrary = Arbitrary.Constant("root")
        const returnedFalse = yield* Arbitrary.checkEffect(arbitrary, () => false, { runs: 1, seed: 0 })
        const propertyError = yield* Arbitrary.checkEffect(arbitrary, () => Effect.fail("error"), {
          runs: 1,
          seed: 0
        })

        assert.strictEqual(returnedFalse._tag, "Falsified")
        assert.strictEqual(propertyError._tag, "Falsified")
        if (returnedFalse._tag === "Falsified" && propertyError._tag === "Falsified") {
          const replayedAsError = yield* Arbitrary.checkEffect(arbitrary, () => Effect.fail("error"), {
            replay: returnedFalse.replay
          })
          const replayedAsFalse = yield* Arbitrary.checkEffect(arbitrary, () => false, {
            replay: propertyError.replay
          })

          assert.deepStrictEqual(replayedAsError, { _tag: "ReplayMismatch", reason: "ShrinkPassed" })
          assert.deepStrictEqual(replayedAsFalse, { _tag: "ReplayMismatch", reason: "ShrinkPassed" })
        }
      }))

    it.effect("counts a different failure class against maxShrinks", () =>
      Effect.gen(function*() {
        const evaluated: Array<string> = []
        const arbitrary = Arbitrary.schema(Schema.Literals(["root", "error", "false"]), {
          shrink: (value) => value === "root" ? ["error", "false"] as const : []
        })
        const result = yield* Arbitrary.checkEffect(arbitrary, (value) => {
          evaluated.push(value)
          return value === "error" ? Effect.fail("different failure") : false
        }, {
          runs: 1,
          maxShrinks: 1,
          seed: 0
        })

        assert.strictEqual(result._tag, "Falsified")
        if (result._tag === "Falsified") {
          assert.strictEqual(result.shrunkInput, "root")
          assert.deepStrictEqual(result.failure, { _tag: "ReturnedFalse" })
          assert.strictEqual(result.shrinks, 0)
          assert.deepStrictEqual(evaluated, ["root", "error"])
        }
      }))

    it.effect("counts every tested shrink candidate against maxShrinks", () =>
      Effect.gen(function*() {
        let evaluations = 0
        const result = yield* Arbitrary.checkEffect(
          Arbitrary.schema(Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 100 }))),
          () => {
            evaluations++
            return evaluations !== 1
          },
          { runs: 1, seed: 0, size: 10, maxShrinks: 1 }
        )

        assert.strictEqual(result._tag, "Falsified")
        assert.strictEqual(evaluations, 2)
        if (result._tag === "Falsified") {
          assert.strictEqual(result.shrinks, 0)
        }
      }))

    it.effect("counts rejected shrink candidates once and preserves the best shrunk input", () =>
      Effect.gen(function*() {
        type Make = (
          source: Arbitrary.Arbitrary<number>,
          visit: (value: number) => void
        ) => Arbitrary.Arbitrary<number>
        const allowed = (value: number) => value === 8 || value === 5 || value === 4
        const cases: ReadonlyArray<readonly [name: string, make: Make]> = [
          ["filter", (source, visit) =>
            Arbitrary.filter(source, (value) => {
              visit(value)
              return allowed(value)
            })],
          ["filterMap", (source, visit) =>
            Arbitrary.filterMap(source, (value) => {
              visit(value)
              return allowed(value) ? Result.succeed(value) : Result.fail(value)
            })],
          ["flatMap", (source, visit) =>
            Arbitrary.flatMap(source, (value) => {
              visit(value)
              return Arbitrary.filter(Arbitrary.schema(Schema.Literal(value)), () => allowed(value))
            })]
        ]

        for (const [name, make] of cases) {
          const visited: Array<number> = []
          const propertyEvaluations: Array<number> = []
          const source = Arbitrary.schema(Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 8 })))
          const arbitrary = make(source, (value) => visited.push(value))
          const result = yield* Arbitrary.checkEffect(arbitrary, (value) => {
            propertyEvaluations.push(value)
            return false
          }, { runs: 1, seed: 47, size: 10, maxShrinks: 3 })

          assert.strictEqual(result._tag, "Falsified", name)
          assert.deepStrictEqual(visited, [8, 1, 5, 3], name)
          assert.deepStrictEqual(propertyEvaluations, [8, 5], name)
          if (result._tag !== "Falsified") continue
          assert.strictEqual(result.initialInput, 8, name)
          assert.strictEqual(result.shrunkInput, 5, name)
          assert.strictEqual(result.shrinks, 1, name)

          visited.length = 0
          propertyEvaluations.length = 0
          const replayed = yield* Arbitrary.checkEffect(arbitrary, (value) => {
            propertyEvaluations.push(value)
            return false
          }, { replay: result.replay, maxShrinks: 0 })
          assert.strictEqual(replayed._tag, "Falsified", name)
          assert.deepStrictEqual(visited, [8, 1, 5], name)
          assert.deepStrictEqual(propertyEvaluations, [8, 5], name)
          if (replayed._tag === "Falsified") {
            assert.strictEqual(replayed.initialInput, result.initialInput, name)
            assert.strictEqual(replayed.shrunkInput, result.shrunkInput, name)
            assert.deepStrictEqual(replayed.failure, result.failure, name)
            assert.strictEqual(replayed.shrinks, result.shrinks, name)
          }
        }
      }))

    it.effect("does not count a rejected candidate once per nested filter", () =>
      Effect.gen(function*() {
        const innerEvaluations: Array<number> = []
        const outerEvaluations: Array<number> = []
        const propertyEvaluations: Array<number> = []
        const arbitrary = Arbitrary.schema(
          Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 8 }))
        ).pipe(
          Arbitrary.filter((value) => {
            innerEvaluations.push(value)
            return value === 8 || value === 5
          }),
          Arbitrary.filter((value) => {
            outerEvaluations.push(value)
            return true
          })
        )
        const result = yield* Arbitrary.checkEffect(arbitrary, (value) => {
          propertyEvaluations.push(value)
          return false
        }, { runs: 1, seed: 47, size: 10, maxShrinks: 1 })

        assert.strictEqual(result._tag, "Falsified")
        assert.deepStrictEqual(innerEvaluations, [8, 1])
        assert.deepStrictEqual(outerEvaluations, [8])
        assert.deepStrictEqual(propertyEvaluations, [8])
        if (result._tag === "Falsified") {
          assert.strictEqual(result.shrunkInput, 8)
          assert.strictEqual(result.shrinks, 0)
        }
      }))

    it.effect("lazily materializes structural shrinks and replays them", () =>
      Effect.gen(function*() {
        const arbitrary = Arbitrary.schema(
          Schema.Array(Schema.Literal("value")).check(Schema.isMaxLength(3))
        )
        const first = yield* Arbitrary.checkEffect(arbitrary, () => false, { runs: 1, seed: 1, size: 3 })
        assert.strictEqual(first._tag, "Falsified")
        if (first._tag !== "Falsified") return

        const replayed = yield* Arbitrary.checkEffect(arbitrary, () => false, { replay: first.replay })
        assert.strictEqual(replayed._tag, "Falsified")
        if (replayed._tag !== "Falsified") return
        assert.deepStrictEqual(first.initialInput, ["value"])
        assert.deepStrictEqual(first.shrunkInput, [])
        assert.strictEqual(first.shrinks, 1)
        assert.deepStrictEqual(replayed.initialInput, first.initialInput)
        assert.deepStrictEqual(replayed.shrunkInput, first.shrunkInput)
        assert.strictEqual(replayed.shrinks, first.shrinks)
      }))

    it.effect("traverses a thousand lazy child shrinks without overflowing", () =>
      Effect.gen(function*() {
        const count = 1_000
        const schema = Schema.Array(Schema.Int).check(Schema.isMinLength(count), Schema.isMaxLength(count))
        let evaluations = 0
        const result = yield* Arbitrary.checkEffect(Arbitrary.schema(schema), () => {
          evaluations++
          return evaluations !== 1
        }, { runs: 1, seed: "wide-shrink", size: count, maxShrinks: count })

        assert.strictEqual(result._tag, "Falsified")
        assert.strictEqual(evaluations, count + 1)
      }))

    it.effect("propagates interruption while shrinking", () =>
      Effect.gen(function*() {
        const shrinking = yield* Deferred.make<void>()
        let evaluations = 0
        const fiber = yield* Effect.forkChild(Arbitrary.checkEffect(
          Arbitrary.schema(Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 1_000 }))),
          () => {
            evaluations++
            return evaluations === 1
              ? false
              : Deferred.succeed(shrinking, undefined).pipe(Effect.andThen(Effect.never))
          },
          { runs: 1, seed: 139, size: 10 }
        ))

        yield* Deferred.await(shrinking)
        yield* Fiber.interrupt(fiber)
        const exit = yield* Fiber.await(fiber)

        assert.strictEqual(evaluations, 2)
        assert.isTrue(Exit.hasInterrupts(exit))
      }))

    it.effect("preserves typed property failures", () =>
      Effect.gen(function*() {
        const result = yield* Arbitrary.checkEffect(
          Arbitrary.schema(Schema.Literal("value")),
          () => Effect.fail("property failure"),
          { runs: 1, seed: "typed-failure" }
        )

        assert.strictEqual(result._tag, "Falsified")
        if (result._tag === "Falsified") {
          assert.deepStrictEqual(result.failure, { _tag: "PropertyError", error: "property failure" })
        }
      }))

    it.effect("requires an explicit true result from pure and Effectful properties", () =>
      Effect.gen(function*() {
        const arbitrary = Arbitrary.schema(Schema.Literal("value"))
        const pureProperty = (() => 1) as unknown as () => boolean
        const effectfulProperty = (() => Effect.succeed("yes")) as unknown as () => Effect.Effect<boolean>

        const pure = yield* Arbitrary.checkEffect(arbitrary, pureProperty, { runs: 1, seed: "pure-truthy" })
        const effectful = yield* Arbitrary.checkEffect(arbitrary, effectfulProperty, {
          runs: 1,
          seed: "effectful-truthy"
        })

        assert.strictEqual(pure._tag, "Falsified")
        assert.strictEqual(effectful._tag, "Falsified")
        if (pure._tag === "Falsified") assert.deepStrictEqual(pure.failure, { _tag: "ReturnedFalse" })
        if (effectful._tag === "Falsified") assert.deepStrictEqual(effectful.failure, { _tag: "ReturnedFalse" })
      }))

    it.effect("does not turn synchronous property defects into a property result", () =>
      Effect.gen(function*() {
        const exit = yield* Effect.exit(
          Arbitrary.checkEffect(Arbitrary.schema(Schema.Literal("value")), () => {
            throw new Error("property defect")
          }, { runs: 1, seed: "property-defect" })
        )

        assert.isTrue(Exit.hasDies(exit))
      }))

    it.effect("does not turn interruption into a property result", () =>
      Effect.gen(function*() {
        const exit = yield* Effect.exit(
          Arbitrary.checkEffect(Arbitrary.schema(Schema.Literal("value")), () => Effect.interrupt, {
            runs: 1,
            seed: "interruption"
          })
        )

        assert.isTrue(Exit.hasInterrupts(exit))
      }))
  })
})
