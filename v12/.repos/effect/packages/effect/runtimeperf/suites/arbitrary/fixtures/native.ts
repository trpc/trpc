import * as Arbitrary from "effect/Arbitrary"
import * as Effect from "effect/Effect"
import * as Result from "effect/Result"
import * as Schema from "effect/Schema"
import * as TestSchema from "effect/testing/TestSchema"
import assert from "node:assert/strict"
import {
  makeBigDecimalSchema,
  makeConstrainedStringSchema,
  makeDateTimeUtcSchema,
  makeDateTimeZonedSchema,
  makeOptionalStructSchema,
  makeRareFilterSchema,
  makeRegExpSchema,
  makeTreeSchema,
  makeUniqueArraySchema,
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
const size = 10

interface FlatMapValue {
  readonly length: number
  readonly values: ReadonlyArray<number>
}

const flatMapSource = Arbitrary.schema(Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 8 })))
const flatMapItem = Schema.Int.check(Schema.isBetween({ minimum: -1_000, maximum: 1_000 }))
const flatMapTargets = globalThis.Array.from({ length: 8 }, (_, index) => {
  const length = index + 1
  return Arbitrary.schema(
    Schema.Array(flatMapItem).check(Schema.isMinLength(length), Schema.isMaxLength(length))
  ).pipe(Arbitrary.map((values): FlatMapValue => ({ length, values })))
})
const makeFlatMapArbitrary = () => flatMapSource.pipe(Arbitrary.flatMap((length) => flatMapTargets[length - 1]))

export const coldRecursiveFirstSample = () => ({
  run: () =>
    Effect.runSync(
      Arbitrary.sampleEffect(Arbitrary.schema(makeTreeSchema()), { count: 1, seed, size: 1 })
    ),
  validate: validateTrees(1, 2, 2)
})

export const recursiveSample32 = () => {
  const arbitrary = Arbitrary.schema(makeTreeSchema())
  const program = Arbitrary.sampleEffect(arbitrary, { count: 32, seed: recursiveSeed, size: 3 })
  return {
    run: () => Effect.runSync(program),
    validate: validateTrees(32, 90, 110)
  }
}

export const optionalStructSample128 = () => {
  const schema = makeOptionalStructSchema()
  const arbitrary = Arbitrary.schema(schema)
  const program = Arbitrary.sampleEffect(arbitrary, { count: 128, maxDiscards: 0, seed, size: 8 })
  return {
    run: () => Effect.runSync(program),
    validate: validateSchemaValues(schema, 128)
  }
}

export const constrainedStringSample128 = () => {
  const arbitrary = Arbitrary.schema(makeConstrainedStringSchema())
  const program = Arbitrary.sampleEffect(arbitrary, { count: 128, maxDiscards: 0, seed, size })
  return {
    run: () => Effect.runSync(program),
    validate: validateStrings(128)
  }
}

export const coldRegExpFirstSample = () => ({
  run: () =>
    Effect.runSync(
      Arbitrary.sampleEffect(Arbitrary.schema(makeRegExpSchema()), {
        count: 1,
        maxDiscards: 0,
        seed,
        size: 48
      })
    ),
  validate: validateRegExpValues(1)
})

export const regExpSample64 = () => {
  const arbitrary = Arbitrary.schema(makeRegExpSchema())
  const program = Arbitrary.sampleEffect(arbitrary, { count: 64, maxDiscards: 0, seed, size: 48 })
  return {
    run: () => Effect.runSync(program),
    validate: validateRegExpCoverage
  }
}

export const regExpCheckFalsifyAndShrink = () => {
  const arbitrary = Arbitrary.schema(makeRegExpSchema())
  const program = Arbitrary.checkEffect(arbitrary, () => false, {
    runs: 1,
    maxDiscards: 0,
    seed: regExpShrinkSeed,
    size: 48
  })
  return {
    run: () => Effect.runSync(program),
    validate: (result: Arbitrary.CheckResult<string, never>) => {
      assert.equal(result._tag, "Falsified")
      if (result._tag !== "Falsified") return
      validateRegExpValues(2)([result.initialInput, result.shrunkInput])
      assert.equal(result.shrinks > 0, true)
    }
  }
}

export const boundedNumberSample128 = () => {
  const arbitrary = Arbitrary.schema(Schema.Number.check(Schema.isBetween({ minimum: 2, maximum: 4 })))
  const program = Arbitrary.sampleEffect(arbitrary, { count: 128, maxDiscards: 0, seed, size })
  return {
    run: () => Effect.runSync(program),
    validate: validateNumbers(128)
  }
}

export const uint8ArraySample128 = () => {
  const arbitrary = Arbitrary.schema(Schema.Uint8Array)
  const program = Arbitrary.sampleEffect(arbitrary, { count: 128, maxDiscards: 0, seed, size })
  return {
    run: () => Effect.runSync(program),
    validate: validateUint8Arrays(128)
  }
}

export const bigDecimalSample128 = () => {
  const schema = makeBigDecimalSchema()
  const arbitrary = Arbitrary.schema(schema)
  const program = Arbitrary.sampleEffect(arbitrary, { count: 128, maxDiscards: 0, seed, size })
  return {
    run: () => Effect.runSync(program),
    validate: validateSchemaValues(schema, 128)
  }
}

export const dateTimeUtcSample128 = () => {
  const schema = makeDateTimeUtcSchema()
  const arbitrary = Arbitrary.schema(schema)
  const program = Arbitrary.sampleEffect(arbitrary, { count: 128, maxDiscards: 0, seed, size })
  return {
    run: () => Effect.runSync(program),
    validate: validateSchemaValues(schema, 128)
  }
}

export const timeZoneNamedSample128 = () => {
  const arbitrary = Arbitrary.schema(Schema.TimeZoneNamed)
  const program = Arbitrary.sampleEffect(arbitrary, { count: 128, maxDiscards: 0, seed, size })
  return {
    run: () => Effect.runSync(program),
    validate: validateSchemaValues(Schema.TimeZoneNamed, 128)
  }
}

export const timeZoneSample128 = () => {
  const arbitrary = Arbitrary.schema(Schema.TimeZone)
  const program = Arbitrary.sampleEffect(arbitrary, { count: 128, maxDiscards: 0, seed, size })
  return {
    run: () => Effect.runSync(program),
    validate: validateSchemaValues(Schema.TimeZone, 128)
  }
}

export const dateTimeZonedSample128 = () => {
  const schema = makeDateTimeZonedSchema()
  const arbitrary = Arbitrary.schema(schema)
  const program = Arbitrary.sampleEffect(arbitrary, { count: 128, maxDiscards: 0, seed, size })
  return {
    run: () => Effect.runSync(program),
    validate: validateSchemaValues(schema, 128)
  }
}

export const rareFilterSample32 = () => {
  const arbitrary = Arbitrary.schema(makeRareFilterSchema())
  const program = Arbitrary.sampleEffect(arbitrary, { count: 32, maxDiscards: 2_048, seed, size })
  return {
    run: () => Effect.runSync(program),
    validate: (values: ReadonlyArray<number>) => {
      assert.equal(values.length, 32)
      assert.equal(values.every((value) => value % 16 === 0), true)
    }
  }
}

export const uniqueArraySample32 = () => {
  const arbitrary = Arbitrary.schema(makeUniqueArraySchema())
  const program = Arbitrary.sampleEffect(arbitrary, { count: 32, maxDiscards: 2_048, seed, size })
  return {
    run: () => Effect.runSync(program),
    validate: (values: ReadonlyArray<ReadonlyArray<number>>) => {
      assert.equal(values.length, 32)
      assert.equal(values.every((value) => value.length === 32 && new Set(value).size === 32), true)
    }
  }
}

export const literalSample128 = () => {
  const arbitrary = Arbitrary.schema(Schema.Literal("value"))
  const program = Arbitrary.sampleEffect(arbitrary, { count: 128, maxDiscards: 0, seed, size })
  return {
    run: () => Effect.runSync(program),
    validate: (values: ReadonlyArray<unknown>) => {
      assert.equal(values.length, 128)
      assert.equal(values.every((value) => value === "value"), true)
    }
  }
}

export const mapSample128 = () => {
  const arbitrary = Arbitrary.map(
    Arbitrary.schema(Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 1_000 }))),
    (value) => value + 1
  )
  const program = Arbitrary.sampleEffect(arbitrary, { count: 128, maxDiscards: 0, seed, size })
  return {
    run: () => Effect.runSync(program),
    validate: (values: ReadonlyArray<number>) => {
      assert.equal(values.length, 128)
      assert.equal(values.every((value) => value >= 1 && value <= 1_001), true)
    }
  }
}

export const passingFilterSample128 = () => {
  const arbitrary = Arbitrary.filter(
    Arbitrary.schema(Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 1_000 }))),
    (value) => value >= 0
  )
  const program = Arbitrary.sampleEffect(arbitrary, { count: 128, maxDiscards: 0, seed, size })
  return {
    run: () => Effect.runSync(program),
    validate: (values: ReadonlyArray<number>) => {
      assert.equal(values.length, 128)
      assert.equal(values.every((value) => value >= 0 && value <= 1_000), true)
    }
  }
}

export const selectiveFilterSample32 = () => {
  const arbitrary = Arbitrary.filter(
    Arbitrary.schema(Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 255 }))),
    (value) => value % 16 === 0
  )
  const program = Arbitrary.sampleEffect(arbitrary, { count: 32, maxDiscards: 2_048, seed, size })
  return {
    run: () => Effect.runSync(program),
    validate: (values: ReadonlyArray<number>) => {
      assert.equal(values.length, 32)
      assert.equal(values.every((value) => value % 16 === 0), true)
    }
  }
}

export const filterMapSample128 = () => {
  const arbitrary = Arbitrary.filterMap(
    Arbitrary.schema(Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 255 }))),
    (value) => value % 2 === 0 ? Result.succeed(value / 2) : Result.fail(value)
  )
  const program = Arbitrary.sampleEffect(arbitrary, { count: 128, maxDiscards: 2_048, seed, size })
  return {
    run: () => Effect.runSync(program),
    validate: (values: ReadonlyArray<number>) => {
      assert.equal(values.length, 128)
      assert.equal(values.every((value) => Number.isInteger(value) && value >= 0 && value <= 127), true)
    }
  }
}

export const filterCheckFalsifyAndShrink = () => {
  const arbitrary = Arbitrary.filter(
    Arbitrary.schema(Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 8 }))),
    (value) => value === 8 || value === 5 || value === 4
  )
  const program = Arbitrary.checkEffect(arbitrary, () => false, {
    runs: 1,
    seed: 47,
    size,
    maxShrinks: 100
  })
  return {
    run: () => Effect.runSync(program),
    validate: (result: Arbitrary.CheckResult<number, never>) => {
      assert.equal(result._tag, "Falsified")
      if (result._tag !== "Falsified") return
      assert.equal(result.initialInput, 8)
      assert.equal(result.shrunkInput, 4)
      assert.equal(result.shrinks, 2)
    }
  }
}

export const allTupleSample128 = () => {
  const arbitrary = Arbitrary.all([
    Arbitrary.schema(Schema.Literal("left")),
    Arbitrary.schema(Schema.Literal(1))
  ])
  const program = Arbitrary.sampleEffect(arbitrary, { count: 128, maxDiscards: 0, seed, size })
  return {
    run: () => Effect.runSync(program),
    validate: (values: ReadonlyArray<["left", 1]>) => {
      assert.equal(values.length, 128)
      assert.equal(values.every(([left, right]) => left === "left" && right === 1), true)
    }
  }
}

export const allRecordSample128 = () => {
  const arbitrary = Arbitrary.all({
    name: Arbitrary.schema(Schema.Literals(["Ada", "Grace"])),
    age: Arbitrary.schema(Schema.Int)
  })
  const program = Arbitrary.sampleEffect(arbitrary, { count: 128, maxDiscards: 0, seed, size })
  return {
    run: () => Effect.runSync(program),
    validate: (values: ReadonlyArray<{ readonly name: string; readonly age: number }>) => {
      assert.equal(values.length, 128)
      assert.equal(values.every((value) => value.name === "Ada" || value.name === "Grace"), true)
    }
  }
}

export const flatMapSample128 = () => {
  const flatMapArbitrary = makeFlatMapArbitrary()
  const program = Arbitrary.sampleEffect(flatMapArbitrary, { count: 128, maxDiscards: 0, seed, size })
  return {
    run: () => Effect.runSync(program),
    validate: (values: ReadonlyArray<FlatMapValue>) => {
      assert.equal(values.length, 128)
      assert.equal(values.every((value) => value.values.length === value.length), true)
    }
  }
}

export const flatMapCheckFalsifyAndShrink = () => {
  const flatMapArbitrary = makeFlatMapArbitrary()
  const program = Arbitrary.checkEffect(flatMapArbitrary, () => false, { runs: 1, seed, size })
  return {
    run: () => Effect.runSync(program),
    validate: (result: Arbitrary.CheckResult<FlatMapValue, never>) => {
      assert.equal(result._tag, "Falsified")
      if (result._tag !== "Falsified") return
      assert.equal(result.shrunkInput.length, 1)
      assert.equal(result.shrunkInput.values.length, 1)
    }
  }
}

export const flatMapCheckReplay = () => {
  const flatMapArbitrary = makeFlatMapArbitrary()
  const property = () => false
  const initial = Effect.runSync(Arbitrary.checkEffect(flatMapArbitrary, property, { runs: 1, seed, size }))
  assert.equal(initial._tag, "Falsified")
  if (initial._tag !== "Falsified") throw new Error("Expected the flatMap replay setup to falsify")
  const program = Arbitrary.checkEffect(flatMapArbitrary, property, { replay: initial.replay })
  return {
    run: () => Effect.runSync(program),
    validate: (result: Arbitrary.CheckResult<FlatMapValue, never>) => {
      assert.equal(result._tag, "Falsified")
      if (result._tag !== "Falsified") return
      assert.equal(result.shrunkInput.length, 1)
      assert.equal(result.shrunkInput.values.length, 1)
    }
  }
}

export const checkPass100 = () => {
  const arbitrary = Arbitrary.schema(Schema.Int)
  const program = Arbitrary.checkEffect(arbitrary, () => true, { runs: 100, seed, size })
  return {
    run: () => Effect.runSync(program),
    validate: (result: Arbitrary.CheckResult<number, never>) => {
      assert.deepEqual(result, { _tag: "Passed", runs: 100, discards: 0 })
    }
  }
}

export const arrayCheckPass100 = () => {
  const arbitrary = Arbitrary.schema(Schema.Array(Schema.Int))
  const program = Arbitrary.checkEffect(arbitrary, () => true, { runs: 100, seed, size: 50 })
  return {
    run: () => Effect.runSync(program),
    validate: (result: Arbitrary.CheckResult<ReadonlyArray<number>, never>) => {
      assert.deepEqual(result, { _tag: "Passed", runs: 100, discards: 0 })
    }
  }
}

export const arrayCheckFalsifyAndShrink = () => {
  const arbitrary = Arbitrary.schema(Schema.Array(Schema.Literals([8, 27, 0, 1])))
  const property = (values: ReadonlyArray<number>) => !(values.includes(27) && values.indexOf(0) > values.indexOf(27))
  const program = Arbitrary.checkEffect(arbitrary, property, { runs: 1, seed: 1967, size: 4 })
  return {
    run: () => Effect.runSync(program),
    validate: (result: Arbitrary.CheckResult<ReadonlyArray<number>, never>) => {
      assert.equal(result._tag, "Falsified")
      if (result._tag !== "Falsified") return
      assert.deepEqual(result.initialInput, [8, 27, 0, 1])
      // Both revisions must preserve the failure; the regression test checks the new, smaller result.
      assert.equal(property(result.shrunkInput), false)
      assert.ok(result.shrunkInput.length <= 3)
    }
  }
}

export const testSchemaVerifyGeneration100 = () => {
  const asserts = new TestSchema.Asserts(Schema.Int)
  return {
    run: () => asserts.arbitrary().verifyGeneration({ runs: 100, seed }),
    validate: (result: void) => assert.equal(result, undefined)
  }
}

export const checkFalsifyAndShrink = () => {
  const arbitrary = Arbitrary.schema(
    Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 1_000 }))
  )
  const program = Arbitrary.checkEffect(arbitrary, (value) => value < 0, { runs: 1, seed: 47, size })
  return {
    run: () => Effect.runSync(program),
    validate: (result: Arbitrary.CheckResult<number, never>) => {
      assert.equal(result._tag, "Falsified")
      if (result._tag !== "Falsified") return
      assert.equal(result.initialInput, 1_000)
      assert.equal(result.shrunkInput, 1)
      assert.equal(result.shrinks, 1)
    }
  }
}

export const checkReplay = () => {
  const arbitrary = Arbitrary.schema(
    Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 1_000 }))
  )
  const property = (value: number) => value < 0
  const initial = Effect.runSync(Arbitrary.checkEffect(arbitrary, property, { runs: 1, seed: 47, size }))
  assert.equal(initial._tag, "Falsified")
  if (initial._tag !== "Falsified") throw new Error("Expected the replay setup to falsify")
  const program = Arbitrary.checkEffect(arbitrary, property, { replay: initial.replay })
  return {
    run: () => Effect.runSync(program),
    validate: (result: Arbitrary.CheckResult<number, never>) => {
      assert.equal(result._tag, "Falsified")
      if (result._tag !== "Falsified") return
      assert.equal(result.initialInput, 1_000)
      assert.equal(result.shrunkInput, 1)
      assert.equal(result.shrinks, 1)
    }
  }
}
