import * as BigDecimal from "effect/BigDecimal"
import * as DateTime from "effect/DateTime"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import * as FastCheck from "fast-check"
import assert from "node:assert/strict"
import type { Tree } from "./schema.ts"
import {
  makeBigDecimalSchema,
  makeDateTimeUtcSchema,
  makeDateTimeZonedSchema,
  makeOptionalStructSchema,
  regularExpression,
  validateNumbers,
  validateRegExpCoverage,
  validateRegExpValues,
  validateSchemaValues,
  validateStrings,
  validateTrees,
  validateUint8Arrays
} from "./schema.ts"

const seed = 42
const recursiveSeed = 188
const regExpShrinkSeed = 0
const namedTimeZones = ["UTC", "Europe/London", "America/New_York", "Asia/Tokyo", "Australia/Sydney"] as const

const makeRegExpArbitrary = () => FastCheck.stringMatching(regularExpression)

interface FlatMapValue {
  readonly length: number
  readonly values: ReadonlyArray<number>
}

const flatMapTargets = globalThis.Array.from({ length: 8 }, (_, index) => {
  const length = index + 1
  return FastCheck.array(FastCheck.integer({ min: -1_000, max: 1_000 }), { minLength: length, maxLength: length })
    .map((values): FlatMapValue => ({ length, values }))
})
const flatMapArbitrary = FastCheck.integer({ min: 1, max: 8 }).chain((length) => flatMapTargets[length - 1])

const scoreArbitrary = FastCheck.oneof(
  FastCheck.constant(Option.none()),
  FastCheck.integer({ min: 0, max: 100 }).map(Option.some)
)

const treeFields = (
  score: FastCheck.Arbitrary<Option.Option<number>>,
  children: FastCheck.Arbitrary<ReadonlyArray<Tree>>
) => ({
  label: FastCheck.string({ minLength: 2, maxLength: 12 }),
  score,
  children
})

const treeArbitrary = (maxDepth = 1) => {
  const depthIdentifier = FastCheck.createDepthIdentifier()
  const recursion = { maxDepth, depthIdentifier }
  const recursive = FastCheck.letrec<{ readonly Tree: Tree }>((tie) => ({
    Tree: FastCheck.oneof(
      recursion,
      FastCheck.record(treeFields(FastCheck.constant(Option.none()), FastCheck.constant([]))),
      FastCheck.constant(null).chain(() =>
        FastCheck.record(
          treeFields(
            FastCheck.oneof(recursion, FastCheck.constant(Option.none()), scoreArbitrary),
            FastCheck.array(tie("Tree"), { maxLength: 3 })
          )
        )
      )
    )
  })).Tree
  return FastCheck.record(
    treeFields(scoreArbitrary, FastCheck.array(recursive, { maxLength: 3 }))
  )
}

const timeZoneArbitrary = () =>
  FastCheck.oneof(
    FastCheck.integer({ min: -12 * 60 * 60 * 1_000, max: 14 * 60 * 60 * 1_000 }).map(DateTime.zoneMakeOffset),
    FastCheck.constantFrom(...namedTimeZones).map(DateTime.zoneMakeNamedUnsafe)
  )

export const coldRecursiveFirstSample = () => ({
  run: () => FastCheck.sample(treeArbitrary(0), { numRuns: 1, seed }),
  validate: validateTrees(1, 2, 2)
})

export const recursiveSample32 = () => {
  const arbitrary = treeArbitrary()
  return {
    run: () => FastCheck.sample(arbitrary, { numRuns: 32, seed: recursiveSeed }),
    validate: validateTrees(32, 90, 110)
  }
}

export const optionalStructSample128 = () => {
  const schema = makeOptionalStructSchema()
  const item = FastCheck.integer({ min: 0, max: 1_000 })
  const arbitrary = FastCheck.record({ a: item, b: item, c: item, d: item, e: item, f: item, g: item, h: item }, {
    requiredKeys: []
  })
  return {
    run: () => FastCheck.sample(arbitrary, { numRuns: 128, seed }),
    validate: validateSchemaValues(schema, 128)
  }
}

export const constrainedStringSample128 = () => {
  const arbitrary = FastCheck.string({ minLength: 32, maxLength: 32 })
  return {
    run: () => FastCheck.sample(arbitrary, { numRuns: 128, seed }),
    validate: validateStrings(128)
  }
}

export const coldRegExpFirstSample = () => ({
  run: () => FastCheck.sample(makeRegExpArbitrary(), { numRuns: 1, seed }),
  validate: validateRegExpValues(1)
})

export const regExpSample64 = () => {
  const arbitrary = makeRegExpArbitrary()
  return {
    run: () => FastCheck.sample(arbitrary, { numRuns: 64, seed }),
    validate: validateRegExpCoverage
  }
}

export const regExpCheckFalsifyAndShrink = () => {
  const property = FastCheck.property(makeRegExpArbitrary(), () => false)
  return {
    run: () => FastCheck.check(property, { numRuns: 1, seed: regExpShrinkSeed }),
    validate: (result: FastCheck.RunDetails<[string]>) => {
      assert.equal(result.failed, true)
      if (!result.failed) return
      validateRegExpValues(1)(result.counterexample)
      assert.equal(result.numShrinks > 0, true)
    }
  }
}

export const boundedNumberSample128 = () => {
  const arbitrary = FastCheck.double({ min: 2, max: 4, noNaN: true })
  return {
    run: () => FastCheck.sample(arbitrary, { numRuns: 128, seed }),
    validate: validateNumbers(128)
  }
}

export const uint8ArraySample128 = () => {
  const arbitrary = FastCheck.uint8Array({ maxLength: 10 })
  return {
    run: () => FastCheck.sample(arbitrary, { numRuns: 128, seed }),
    validate: validateUint8Arrays(128)
  }
}

export const bigDecimalSample128 = () => {
  const schema = makeBigDecimalSchema()
  const scale = 20
  const factor = BigInt(10) ** BigInt(17)
  const arbitrary = FastCheck.bigInt({
    min: BigInt(1234) * factor + BigInt(1),
    max: BigInt(1236) * factor - BigInt(1)
  }).map((value) => BigDecimal.make(value, scale))
  return {
    run: () => FastCheck.sample(arbitrary, { numRuns: 128, seed }),
    validate: validateSchemaValues(schema, 128)
  }
}

export const dateTimeUtcSample128 = () => {
  const schema = makeDateTimeUtcSchema()
  const arbitrary = FastCheck.integer({ min: -1_000_000_000, max: 1_000_000_000 }).map(DateTime.makeUnsafe)
  return {
    run: () => FastCheck.sample(arbitrary, { numRuns: 128, seed }),
    validate: validateSchemaValues(schema, 128)
  }
}

export const timeZoneNamedSample128 = () => {
  const arbitrary = FastCheck.constantFrom(...namedTimeZones).map(DateTime.zoneMakeNamedUnsafe)
  return {
    run: () => FastCheck.sample(arbitrary, { numRuns: 128, seed }),
    validate: validateSchemaValues(Schema.TimeZoneNamed, 128)
  }
}

export const timeZoneSample128 = () => {
  const arbitrary = timeZoneArbitrary()
  return {
    run: () => FastCheck.sample(arbitrary, { numRuns: 128, seed }),
    validate: validateSchemaValues(Schema.TimeZone, 128)
  }
}

export const dateTimeZonedSample128 = () => {
  const schema = makeDateTimeZonedSchema()
  const arbitrary = FastCheck.tuple(
    FastCheck.integer({ min: -1_000_000_000, max: 1_000_000_000 }),
    timeZoneArbitrary()
  ).map(([epochMilliseconds, timeZone]) => DateTime.makeZonedUnsafe(epochMilliseconds, { timeZone }))
  return {
    run: () => FastCheck.sample(arbitrary, { numRuns: 128, seed }),
    validate: validateSchemaValues(schema, 128)
  }
}

export const rareFilterSample32 = () => {
  const arbitrary = FastCheck.integer({ min: 0, max: 255 }).filter((value) => value % 16 === 0)
  return {
    run: () => FastCheck.sample(arbitrary, { numRuns: 32, seed }),
    validate: (values: ReadonlyArray<number>) => {
      assert.equal(values.length, 32)
      assert.equal(values.every((value) => value % 16 === 0), true)
    }
  }
}

export const uniqueArraySample32 = () => {
  const arbitrary = FastCheck.uniqueArray(FastCheck.integer({ min: 0, max: 1_023 }), {
    minLength: 32,
    maxLength: 32
  })
  return {
    run: () => FastCheck.sample(arbitrary, { numRuns: 32, seed }),
    validate: (values: ReadonlyArray<ReadonlyArray<number>>) => {
      assert.equal(values.length, 32)
      assert.equal(values.every((value) => value.length === 32 && new Set(value).size === 32), true)
    }
  }
}

export const literalSample128 = () => {
  const arbitrary = FastCheck.constant("value")
  return {
    run: () => FastCheck.sample(arbitrary, { numRuns: 128, seed }),
    validate: (values: ReadonlyArray<unknown>) => {
      assert.equal(values.length, 128)
      assert.equal(values.every((value) => value === "value"), true)
    }
  }
}

export const mapSample128 = () => {
  const arbitrary = FastCheck.integer({ min: 0, max: 1_000 }).map((value) => value + 1)
  return {
    run: () => FastCheck.sample(arbitrary, { numRuns: 128, seed }),
    validate: (values: ReadonlyArray<number>) => {
      assert.equal(values.length, 128)
      assert.equal(values.every((value) => value >= 1 && value <= 1_001), true)
    }
  }
}

export const passingFilterSample128 = () => {
  const arbitrary = FastCheck.integer({ min: 0, max: 1_000 }).filter((value) => value >= 0)
  return {
    run: () => FastCheck.sample(arbitrary, { numRuns: 128, seed }),
    validate: (values: ReadonlyArray<number>) => {
      assert.equal(values.length, 128)
      assert.equal(values.every((value) => value >= 0 && value <= 1_000), true)
    }
  }
}

export const selectiveFilterSample32 = () => {
  const arbitrary = FastCheck.integer({ min: 0, max: 255 }).filter((value) => value % 16 === 0)
  return {
    run: () => FastCheck.sample(arbitrary, { numRuns: 32, seed }),
    validate: (values: ReadonlyArray<number>) => {
      assert.equal(values.length, 32)
      assert.equal(values.every((value) => value % 16 === 0), true)
    }
  }
}

export const filterMapSample128 = () => {
  const arbitrary = FastCheck.integer({ min: 0, max: 255 })
    .filter((value) => value % 2 === 0)
    .map((value) => value / 2)
  return {
    run: () => FastCheck.sample(arbitrary, { numRuns: 128, seed }),
    validate: (values: ReadonlyArray<number>) => {
      assert.equal(values.length, 128)
      assert.equal(values.every((value) => Number.isInteger(value) && value >= 0 && value <= 127), true)
    }
  }
}

export const filterCheckFalsifyAndShrink = () => {
  const arbitrary = FastCheck.integer({ min: 1, max: 8 }).filter(
    (value) => value === 8 || value === 5 || value === 4
  )
  const property = FastCheck.property(arbitrary, () => false)
  return {
    run: () => FastCheck.check(property, { examples: [[8]], numRuns: 1, seed }),
    validate: (result: FastCheck.RunDetails<[number]>) => {
      assert.equal(result.failed, true)
      assert.deepEqual(result.counterexample, [4])
      assert.equal(result.numShrinks, 2)
    }
  }
}

export const allTupleSample128 = () => {
  const arbitrary = FastCheck.tuple(FastCheck.constant("left"), FastCheck.constant(1))
  return {
    run: () => FastCheck.sample(arbitrary, { numRuns: 128, seed }),
    validate: (values: ReadonlyArray<["left", 1]>) => {
      assert.equal(values.length, 128)
      assert.equal(values.every(([left, right]) => left === "left" && right === 1), true)
    }
  }
}

export const allRecordSample128 = () => {
  const arbitrary = FastCheck.record({
    name: FastCheck.constantFrom("Ada", "Grace"),
    age: FastCheck.integer()
  })
  return {
    run: () => FastCheck.sample(arbitrary, { numRuns: 128, seed }),
    validate: (values: ReadonlyArray<{ readonly name: string; readonly age: number }>) => {
      assert.equal(values.length, 128)
      assert.equal(values.every((value) => value.name === "Ada" || value.name === "Grace"), true)
    }
  }
}

export const flatMapSample128 = () => ({
  run: () => FastCheck.sample(flatMapArbitrary, { numRuns: 128, seed }),
  validate: (values: ReadonlyArray<FlatMapValue>) => {
    assert.equal(values.length, 128)
    assert.equal(values.every((value) => value.values.length === value.length), true)
  }
})

export const flatMapCheckFalsifyAndShrink = () => {
  const property = FastCheck.property(flatMapArbitrary, () => false)
  return {
    run: () => FastCheck.check(property, { numRuns: 1, seed }),
    validate: (result: FastCheck.RunDetails<[FlatMapValue]>) => {
      assert.equal(result.failed, true)
      assert.equal(result.counterexample?.[0].length, 1)
      assert.equal(result.counterexample?.[0].values.length, 1)
    }
  }
}

export const flatMapCheckReplay = () => {
  const property = FastCheck.property(flatMapArbitrary, () => false)
  const initial = FastCheck.check(property, { numRuns: 1, seed })
  assert.equal(initial.failed, true)
  return {
    run: () => FastCheck.check(property, { numRuns: 1, seed: initial.seed, path: initial.counterexamplePath }),
    validate: (result: FastCheck.RunDetails<[FlatMapValue]>) => {
      assert.equal(result.failed, true)
      assert.equal(result.counterexample?.[0].length, 1)
      assert.equal(result.counterexample?.[0].values.length, 1)
    }
  }
}

export const checkPass100 = () => {
  const arbitrary = FastCheck.integer()
  const property = FastCheck.property(arbitrary, () => true)
  return {
    run: () => FastCheck.check(property, { numRuns: 100, seed }),
    validate: (result: FastCheck.RunDetails<[number]>) => {
      assert.equal(result.failed, false)
      assert.equal(result.numRuns, 100)
      assert.equal(result.numSkips, 0)
    }
  }
}

export const arrayCheckPass100 = () => {
  const property = FastCheck.property(FastCheck.array(FastCheck.integer(), { maxLength: 50 }), () => true)
  return {
    run: () => FastCheck.check(property, { numRuns: 100, seed }),
    validate: (result: FastCheck.RunDetails<[Array<number>]>) => {
      assert.equal(result.failed, false)
      assert.equal(result.numRuns, 100)
      assert.equal(result.numSkips, 0)
    }
  }
}

export const arrayCheckFalsifyAndShrink = () => {
  const arbitrary = FastCheck.array(FastCheck.constantFrom(8, 27, 0, 1), { maxLength: 4 })
  const property = FastCheck.property(
    arbitrary,
    (values) => !(values.includes(27) && values.indexOf(0) > values.indexOf(27))
  )
  return {
    run: () => FastCheck.check(property, { examples: [[[8, 27, 0, 1]]], numRuns: 1, seed }),
    validate: (result: FastCheck.RunDetails<[Array<number>]>) => {
      assert.equal(result.failed, true)
      assert.deepEqual(result.counterexample, [[27, 0]])
    }
  }
}

export const testSchemaVerifyGeneration100 = () => ({
  run: () => {
    const schema = Schema.Int
    const arbitrary = FastCheck.integer()
    FastCheck.assert(FastCheck.property(arbitrary, Schema.is(schema)), { numRuns: 100, seed })
  },
  validate: (result: void) => assert.equal(result, undefined)
})

export const checkFalsifyAndShrink = () => {
  const arbitrary = FastCheck.integer({ min: 1, max: 1_000 })
  const property = FastCheck.property(arbitrary, (value) => value < 0)
  return {
    run: () => FastCheck.check(property, { examples: [[1_000]], numRuns: 1, seed }),
    validate: (result: FastCheck.RunDetails<[number]>) => {
      assert.equal(result.failed, true)
      assert.deepEqual(result.counterexample, [1])
      assert.equal(result.numShrinks, 1)
    }
  }
}

export const checkReplay = () => {
  const arbitrary = FastCheck.integer({ min: 1, max: 1_000 })
  const property = FastCheck.property(arbitrary, (value) => value < 0)
  const initial = FastCheck.check(property, { examples: [[1_000]], numRuns: 1, seed })
  assert.equal(initial.failed, true)
  return {
    run: () => FastCheck.check(property, { numRuns: 1, seed: initial.seed, path: initial.counterexamplePath }),
    validate: (result: FastCheck.RunDetails<[number]>) => {
      assert.equal(result.failed, true)
      assert.deepEqual(result.counterexample, [1])
      assert.equal(result.numShrinks, 0)
    }
  }
}
