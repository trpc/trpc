import { assert, describe, it } from "@effect/vitest"
import { Effect, Result, Schema } from "effect"
import * as Arbitrary from "effect/Arbitrary"

describe("Arbitrary array shrinking", () => {
  const item = Arbitrary.schema(Schema.Literals([8, 27, 0, 1]), { shrink: (n) => n === 8 ? [1] as const : [] })
  it.effect("reduces custom command sequences to Reset followed by Stop", () =>
    Effect.gen(function*() {
      const command = Arbitrary.map(item, (n) =>
        n === 27
          ? { _tag: "Reset" } as const
          : n === 0
          ? { _tag: "Stop" } as const
          : { _tag: "Add", value: n } as const)
      const commands = Arbitrary.array(command, { maxLength: 50 })
      const property = (values: ReadonlyArray<{ readonly _tag: string }>) => {
        const reset = values.findIndex((value) => value._tag === "Reset")
        return reset === -1 || !values.slice(reset + 1).some((value) => value._tag === "Stop")
      }
      const result = yield* Arbitrary.checkEffect(commands, property, { runs: 1, size: 4, seed: 395 })
      assert.strictEqual(result._tag, "Falsified")
      if (result._tag === "Falsified") {
        assert.strictEqual(result.initialInput.length, 4)
        assert.deepStrictEqual(result.shrunkInput, [{ _tag: "Reset" }, { _tag: "Stop" }])
        assert.deepStrictEqual(yield* Arbitrary.checkEffect(commands, property, { replay: result.replay }), result)
      }
    }))
  for (
    const [name, arbitrary, seed] of [
      ["schema", item, 30],
      [
        "validated shrink",
        Arbitrary.schema(Schema.Literals([8, 27, 0, 1]), {
          shrink: (n) => n === 8 ? [99 as 8, 1] as const : []
        }),
        30
      ],
      ["map", Arbitrary.map(item, (n) => n), 30],
      ["filter", Arbitrary.filter(item, (n) => n >= 0), 30],
      ["filterMap", Arbitrary.filterMap(item, Result.succeed), 30],
      ["flatMap", Arbitrary.flatMap(item, Arbitrary.Constant), 30],
      ["all", Arbitrary.map(Arbitrary.all([item, Arbitrary.Constant("tag")]), ([n]) => n), 597]
    ] as const
  ) {
    it.effect(`retries a previously passing element shrink after deletion (${name})`, () =>
      Effect.gen(function*() {
        const array = Arbitrary.array(arbitrary, { minLength: 2, maxLength: 4 })
        const evaluated: Array<ReadonlyArray<number>> = []
        const property = (values: ReadonlyArray<number>) => {
          assert.isFalse(values.includes(99))
          evaluated.push(values)
          return !["8,27,0", "8,0", "1,0"].includes(values.join(","))
        }
        const result = yield* Arbitrary.checkEffect(array, property, { runs: 1, size: 4, seed })
        assert.strictEqual(result._tag, "Falsified")
        if (result._tag === "Falsified") {
          assert.deepStrictEqual(result.initialInput, [8, 27, 0])
          assert.deepStrictEqual(result.shrunkInput, [1, 0])
          assert.isTrue(evaluated.some((values) => values.join(",") === "1,27,0"))
          assert.deepStrictEqual(yield* Arbitrary.checkEffect(array, property, { replay: result.replay }), result)
        }
      }))
  }

  for (
    const [name, arbitrary, seed] of [
      ["Schema", Arbitrary.schema(Schema.Array(Schema.Literals([8, 27, 0, 1])).check(Schema.isMinLength(2))), 1967],
      ["custom", Arbitrary.array(item, { minLength: 2, maxLength: 4 }), 395]
    ] as const
  ) {
    it.effect(`removes a middle block when no single deletion fails (${name})`, () =>
      Effect.gen(function*() {
        const property = (values: ReadonlyArray<number>) => {
          assert.isAtLeast(values.length, 2)
          return !["8,27,0,1", "8,1"].includes(values.join(","))
        }
        const result = yield* Arbitrary.checkEffect(arbitrary, property, { runs: 1, size: 4, seed })
        assert.strictEqual(result._tag, "Falsified")
        if (result._tag === "Falsified") {
          assert.deepStrictEqual(result.initialInput, [8, 27, 0, 1])
          assert.deepStrictEqual(result.shrunkInput, [8, 1])
          assert.deepStrictEqual(yield* Arbitrary.checkEffect(arbitrary, property, { replay: result.replay }), result)
        }
      }))
  }

  it("rejects invalid length bounds immediately", () => {
    for (const length of [-1, 0.5, NaN, Infinity, 0x100000000]) {
      assert.throws(() => Arbitrary.array(item, { minLength: length }), RangeError)
      assert.throws(() => Arbitrary.array(item, { maxLength: length }), RangeError)
    }
    assert.throws(() => Arbitrary.array(item, { minLength: 3, maxLength: 2 }), RangeError)
    assert.doesNotThrow(() => Arbitrary.array(item, { maxLength: 0xffffffff }))
  })

  it.effect("honors minima at size zero, maxima and exact lengths", () =>
    Effect.gen(function*() {
      for (const options of [{}, { minLength: 3 }, { maxLength: 2 }, { minLength: 2, maxLength: 2 }]) {
        for (const size of [0, 1, 10]) {
          const arbitrary = Arbitrary.array(item, options)
          const values = yield* Arbitrary.sampleEffect(arbitrary, { size, count: 50, seed: "array-bounds" })
          assert.isTrue(values.every((value) =>
            value.length >= (options.minLength ?? 0) &&
            value.length <= Math.min(options.maxLength ?? Infinity, Math.max(size, options.minLength ?? 0))
          ))
          const result = yield* Arbitrary.checkEffect(arbitrary, () => false, { size, runs: 1, seed: "array-bounds" })
          assert.strictEqual(result._tag, "Falsified")
          if (result._tag === "Falsified") {
            assert.deepStrictEqual(result.initialInput, values[0])
            assert.strictEqual(result.shrunkInput.length, options.minLength ?? 0)
          }
        }
      }
    }))

  it.effect("does not generate elements for an empty array or shorten a discarded generation", () =>
    Effect.gen(function*() {
      let calls = 0
      const rejected = Arbitrary.filter(item, () => {
        calls++
        return false
      })
      const empty = Arbitrary.array(rejected, { maxLength: 0 })
      assert.deepStrictEqual(yield* Arbitrary.sampleEffect(empty, { count: 1, seed: 0 }), [[]])
      assert.strictEqual(calls, 0)
      const result = yield* Arbitrary.checkEffect(
        Arbitrary.array(rejected, { minLength: 2 }),
        () => true,
        { runs: 1, maxDiscards: 0, seed: 0 }
      )
      assert.strictEqual(result._tag, "Exhausted")
      assert.strictEqual(calls, 1)
    }))

  it.effect("preserves retained object identities and order without generating replacements", () =>
    Effect.gen(function*() {
      const arbitrary = Arbitrary.array(
        Arbitrary.map(Arbitrary.Constant(null), () => ({ command: "Stop" })),
        { minLength: 2, maxLength: 8 }
      )
      const seen: Array<ReadonlyArray<object>> = []
      const result = yield* Arbitrary.checkEffect(arbitrary, (values) => {
        seen.push(values)
        return false
      }, { runs: 1, size: 8, seed: 0 })
      assert.strictEqual(result._tag, "Falsified")
      if (result._tag === "Falsified") {
        assert.isAbove(result.initialInput.length, 2)
        assert.strictEqual(result.shrunkInput.length, 2)
        for (const values of seen) {
          const indexes = values.map((value) => result.initialInput.indexOf(value as { command: string }))
          assert.isTrue(indexes.every((index, i) => index >= 0 && (i === 0 || index > indexes[i - 1])))
        }
        assert.strictEqual(result.shrunkInput[0], result.initialInput[result.initialInput.length - 2])
        assert.strictEqual(result.shrunkInput[1], result.initialInput[result.initialInput.length - 1])
      }
    }))

  it.effect("counts rejected element candidates against maxShrinks and replays past them", () =>
    Effect.gen(function*() {
      const filtered = Arbitrary.schema(Schema.Literals([8, 1, 0]), {
        shrink: (value) => value === 8 ? [1, 0] as const : []
      }).pipe(Arbitrary.filter((value) => value !== 1))
      const arbitrary = Arbitrary.array(filtered, { minLength: 1, maxLength: 1 })
      const evaluated: Array<Array<number>> = []
      const property = (values: Array<number>) => {
        evaluated.push(values)
        return false
      }
      const limited = yield* Arbitrary.checkEffect(arbitrary, property, { runs: 1, seed: 0, maxShrinks: 1 })
      assert.strictEqual(limited._tag, "Falsified")
      if (limited._tag === "Falsified") {
        assert.deepStrictEqual(limited.initialInput, [8])
        assert.deepStrictEqual(limited.shrunkInput, [8])
        assert.deepStrictEqual(evaluated, [[8]])
      }
      const result = yield* Arbitrary.checkEffect(arbitrary, property, { runs: 1, seed: 0, maxShrinks: 20 })
      assert.strictEqual(result._tag, "Falsified")
      if (result._tag === "Falsified") {
        assert.deepStrictEqual(result.shrunkInput, [0])
        assert.deepStrictEqual(yield* Arbitrary.checkEffect(arbitrary, property, { replay: result.replay }), result)
      }
    }))

  it.effect("does not inspect element shrinking during sampling or successful checks", () =>
    Effect.gen(function*() {
      let shrinks = 0
      const arbitrary = Arbitrary.array(
        Arbitrary.schema(Schema.Literal(8), {
          shrink: () => {
            shrinks++
            return []
          }
        }),
        { minLength: 10, maxLength: 10 }
      )
      yield* Arbitrary.sampleEffect(arbitrary, { count: 10, seed: 0 })
      yield* Arbitrary.checkEffect(arbitrary, () => true, { runs: 10, seed: 0 })
      yield* Arbitrary.checkEffect(arbitrary, () => false, { runs: 1, seed: 0, maxShrinks: 0 })
      assert.strictEqual(shrinks, 0)
    }))

  it.effect("shares the recursion budget across array elements and reserves required siblings", () =>
    Effect.gen(function*() {
      interface Chain {
        readonly next: Chain | null
      }
      const Chain: Schema.Codec<Chain> = Schema.Struct({
        next: Schema.suspend(() => Schema.Union([Schema.Null, Chain]))
      })
      const arbitrary = Arbitrary.all([
        Arbitrary.array(Arbitrary.schema(Chain), { minLength: 3, maxLength: 3 }),
        Arbitrary.schema(Chain)
      ])
      const depth = (chain: Chain): number => chain.next === null ? 0 : 1 + depth(chain.next)
      const values = yield* Arbitrary.sampleEffect(arbitrary, {
        count: 100,
        maxDiscards: 0,
        seed: "array-recursion-budget",
        size: 5
      })
      assert.isTrue(
        values.every(([array, last]) => array.reduce((total, chain) => total + depth(chain), depth(last)) <= 5)
      )
    }))

  it.effect("protects fixed tuple prefixes, tails and the order of optional positions", () =>
    Effect.gen(function*() {
      for (
        const schema of [
          Schema.TupleWithRest(Schema.Tuple([Schema.Literal("head")]), [Schema.Int, Schema.Literal("tail")]),
          Schema.Tuple([
            Schema.Literal("head"),
            Schema.optionalKey(Schema.Literal(27)),
            Schema.optionalKey(Schema.Literal(0))
          ])
        ]
      ) {
        for (let seed = 0; seed < 10; seed++) {
          const result = yield* Arbitrary.checkEffect(Arbitrary.schema(schema), (values) => {
            assert.isTrue(Schema.is(schema)(values))
            return false
          }, { runs: 1, size: 8, seed })
          assert.strictEqual(result._tag, "Falsified")
          if (result._tag === "Falsified") {
            assert.deepStrictEqual(
              result.shrunkInput,
              result.initialInput.some((value) => value === "tail")
                ? ["head", "tail"]
                : ["head"]
            )
          }
        }
      }
    }))

  it.effect("handles wide exact-length arrays", () =>
    Effect.gen(function*() {
      const arbitrary = Arbitrary.array(Arbitrary.Constant(0), { minLength: 20_000, maxLength: 20_000 })
      const result = yield* Arbitrary.checkEffect(arbitrary, () => false, { runs: 1, seed: 0 })
      assert.strictEqual(result._tag, "Falsified")
      if (result._tag === "Falsified") assert.strictEqual(result.shrunkInput.length, 20_000)
    }))

  it.effect("keeps unique arrays and decoded collections valid during shrinking", () =>
    Effect.gen(function*() {
      for (
        const schema of [
          Schema.Array(Schema.Int).check(Schema.isUnique(), Schema.isMinLength(2)),
          Schema.ReadonlySet(Schema.Int),
          Schema.ReadonlyMap(Schema.Int, Schema.Int),
          Schema.Uint8Array
        ]
      ) {
        const result = yield* Arbitrary.checkEffect(Arbitrary.schema(schema), (value) => {
          assert.isTrue(Schema.is(schema)(value))
          return false
        }, { runs: 1, size: 10, seed: 0 })
        assert.strictEqual(result._tag, "Falsified")
      }
    }))

  for (
    const [name, needed] of [
      ["prefix", [27, 0]],
      ["middle", [8, 0]],
      ["suffix", [8, 27]]
    ] as const
  ) {
    it.effect(`removes an irrelevant ${name} from a Schema array`, () =>
      Effect.gen(function*() {
        const arbitrary = Arbitrary.schema(Schema.Array(Schema.Literals([8, 27, 0, 1])))
        const property = (values: ReadonlyArray<number>) =>
          !(values.includes(needed[0]) && values.indexOf(needed[1]) > values.indexOf(needed[0]))
        const result = yield* Arbitrary.checkEffect(arbitrary, property, {
          runs: 1,
          size: 4,
          seed: 1967,
          maxShrinks: 1000
        })
        assert.strictEqual(result._tag, "Falsified")
        if (result._tag === "Falsified") {
          assert.deepStrictEqual(result.initialInput, [8, 27, 0, 1])
          assert.deepStrictEqual(result.shrunkInput, needed)
          assert.deepStrictEqual(yield* Arbitrary.checkEffect(arbitrary, property, { replay: result.replay }), result)
        }
      }))
  }
})
