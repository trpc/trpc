import { assert, describe, it } from "@effect/vitest"
import { Effect, Result, Schema } from "effect"
import * as Arbitrary from "effect/Arbitrary"

describe("Arbitrary shared shrink contexts", () => {
  const field = Arbitrary.schema(Schema.Literals([8, 1]), { shrink: (n) => n === 8 ? [1] as const : [] })
  const int = Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 8 }))

  for (
    const [name, pair, seed, initial] of [
      ["all tuple", Arbitrary.all([field, field]), 0, [8, 8]],
      ["all record", Arbitrary.all({ a: field, b: field }).pipe(Arbitrary.map(({ a, b }) => [a, b])), 0, [8, 8]],
      ["Schema tuple", Arbitrary.schema(Schema.Tuple([int, int])), 47, [8, 3]],
      [
        "Schema struct",
        Arbitrary.schema(Schema.Struct({ a: int, b: int })).pipe(Arbitrary.map(({ a, b }) => [a, b])),
        47,
        [8, 3]
      ]
    ] as const
  ) {
    it.effect(`preserves a sibling after promoting a filtered descendant (${name})`, () =>
      Effect.gen(function*() {
        const arbitrary = Arbitrary.filter(pair, ([a, b]: ReadonlyArray<number>) => a === 8 || b === 1)
        const seen: Array<ReadonlyArray<number>> = []
        const property = (value: ReadonlyArray<number>) => {
          seen.push(value)
          return value[0] !== 8
        }
        const result = yield* Arbitrary.checkEffect(arbitrary, property, { runs: 1, seed, maxShrinks: 100 })
        assert.strictEqual(result._tag, "Falsified")
        if (result._tag === "Falsified") {
          assert.deepStrictEqual(result.initialInput, initial)
          assert.deepStrictEqual(result.shrunkInput, [8, 1])
          assert.isTrue(seen.some(([a, b]) => a === 1 && b === 1))
          assert.deepStrictEqual(yield* Arbitrary.checkEffect(arbitrary, property, { replay: result.replay }), result)
        }
      }))
  }

  const first = Arbitrary.schema(Schema.Literals([8, 27, 0, 1]), { shrink: (n) => n === 8 ? [1] as const : [] })
  const pair = Arbitrary.all([first, field])
  for (
    const [name, element, seed] of [
      ["all", pair, 25],
      ["map", pair.pipe(Arbitrary.map((value) => value)), 25],
      ["filter", pair.pipe(Arbitrary.filter(() => true)), 25],
      ["filterMap", pair.pipe(Arbitrary.filterMap(Result.succeed)), 25],
      ["flatMap source", pair.pipe(Arbitrary.flatMap(Arbitrary.Constant)), 25],
      ["flatMap target", Arbitrary.flatMap(Arbitrary.Constant(null), () => pair), 25],
      ["nested all", Arbitrary.all([pair, Arbitrary.Constant("tag")]).pipe(Arbitrary.map(([value]) => value)), 611],
      ["rejecting filter", pair.pipe(Arbitrary.filter(([a, b]) => !(a === 1 && b === 8))), 25]
    ] as const
  ) {
    it.effect(`preserves descendants of a command retried after deletion (${name})`, () =>
      Effect.gen(function*() {
        const arbitrary = Arbitrary.array(element, { minLength: 2, maxLength: 3 })
        const initial = [[8, 8], [27, seed === 611 ? 8 : 1], [0, 8]]
        const failures = [initial, [[8, 8], [0, 8]], [[1, 8], [0, 8]], [[1, 1], [0, 8]]]
          .map((value) => JSON.stringify(value))
        const property = (value: ReadonlyArray<ReadonlyArray<number>>) => !failures.includes(JSON.stringify(value))
        const result = yield* Arbitrary.checkEffect(arbitrary, property, { runs: 1, size: 3, seed })
        assert.strictEqual(result._tag, "Falsified")
        if (result._tag === "Falsified") {
          assert.deepStrictEqual(result.initialInput, initial)
          assert.deepStrictEqual(result.shrunkInput, [[1, 1], [0, 8]])
          assert.deepStrictEqual(yield* Arbitrary.checkEffect(arbitrary, property, { replay: result.replay }), result)
        }
      }))
  }

  it.effect("preserves a sibling key after exploring a rejected key change", () =>
    Effect.gen(function*() {
      const schema = Schema.Record(
        Schema.String.check(Schema.isPattern(/^[a-c]$/)),
        Schema.Null
      ).check(Schema.isBetweenProperties(2, 2))
      const record = Arbitrary.schema(schema)
      const options = { runs: 1, count: 1, seed: 13, size: 2 }
      const [initial] = yield* Arbitrary.sampleEffect(record, options)
      const [firstKey, secondKey] = Object.keys(initial)
      assert.notStrictEqual(firstKey, "a")
      assert.notStrictEqual(secondKey, "a")
      // Reject changing the first key alone. Exploring that branch tries the
      // second key's "a" candidate too, which must remain available at the root.
      const arbitrary = record.pipe(
        Arbitrary.filter((value) =>
          Object.hasOwn(value, firstKey) || Object.hasOwn(value, "a") && !Object.hasOwn(value, secondKey)
        )
      )
      const property = (value: Record<string, null>) => {
        assert.isTrue(Schema.is(schema)(value))
        return !Object.hasOwn(value, firstKey)
      }
      const result = yield* Arbitrary.checkEffect(arbitrary, property, { ...options, maxShrinks: 100 })
      assert.strictEqual(result._tag, "Falsified")
      if (result._tag === "Falsified") {
        assert.deepStrictEqual(result.initialInput, initial)
        assert.deepStrictEqual(result.shrunkInput, { [firstKey]: null, a: null })
        assert.deepStrictEqual(yield* Arbitrary.checkEffect(arbitrary, property, { replay: result.replay }), result)
      }
    }))

  it.effect("continues in field order while promoting rejected product descendants", () =>
    Effect.gen(function*() {
      const field = Arbitrary.schema(Schema.Literals([1, 0]), { shrink: (n) => n === 1 ? [0] as const : [] })
      const arbitrary = Arbitrary.all(Array.from({ length: 7 }, () => field)).pipe(
        Arbitrary.filter((value) => value[0] === 1)
      )
      const result = yield* Arbitrary.checkEffect(arbitrary, () => false, { runs: 1, seed: 198, maxShrinks: 100 })
      assert.strictEqual(result._tag, "Falsified")
      if (result._tag === "Falsified") {
        assert.deepStrictEqual(result.initialInput, [1, 1, 1, 1, 1, 1, 1])
        assert.deepStrictEqual(result.shrunkInput, [1, 0, 0, 0, 0, 0, 0])
      }
    }))
})
