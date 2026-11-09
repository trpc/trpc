import * as Effect from "../../Effect.ts"
import * as Model from "./model.ts"

const bigint0 = BigInt(0)
const bigint1 = BigInt(1)
const bigint2 = BigInt(2)
const ordinaryMaximumBits = 20
const wideMaximumBits = 2_048

const semanticMagnitudes = [
  bigint1,
  bigint2,
  BigInt(0x7fff_ffff),
  BigInt(0x8000_0000),
  BigInt(Number.MAX_SAFE_INTEGER),
  BigInt(Number.MAX_SAFE_INTEGER) + bigint1,
  BigInt(Number.MAX_VALUE),
  BigInt(Number.MAX_VALUE) + bigint1,
  bigint1 << BigInt(1_024)
] as const

function isWithin(value: bigint, minimum: bigint | undefined, maximum: bigint | undefined): boolean {
  return (minimum === undefined || value >= minimum) && (maximum === undefined || value <= maximum)
}

function bitLength(value: bigint): number {
  return value === bigint0 ? 0 : (value < bigint0 ? -value : value).toString(2).length
}

function randomMagnitude(state: Model.GenerationState, maximum?: bigint): bigint {
  if (maximum === bigint0) return bigint0
  const family = Model.randomInt(state, 0, 7)
  if (family === 0) return bigint0
  const maximumBits = maximum === undefined ? wideMaximumBits : bitLength(maximum)
  const bits = Model.randomInt(state, 1, family <= 3 ? Math.min(ordinaryMaximumBits, maximumBits) : maximumBits)
  const minimum = bigint1 << BigInt(bits - 1)
  const upper = (minimum << bigint1) - bigint1
  return Model.randomBigInt(state, minimum, maximum !== undefined && maximum < upper ? maximum : upper)
}

function makeGenerator(
  minimum: bigint | undefined,
  maximum: bigint | undefined
): (state: Model.GenerationState) => bigint {
  if (minimum !== undefined && maximum !== undefined) return Model.makeRandomNumericBigInt(minimum, maximum)

  const special = [
    bigint0,
    ...(minimum === undefined ? [] : [minimum, minimum + bigint1]),
    ...(maximum === undefined ? [] : [maximum, maximum - bigint1]),
    ...semanticMagnitudes.flatMap((value) => [value, -value])
  ].filter((value) => isWithin(value, minimum, maximum))
  const boundary = minimum ?? maximum
  const direction = minimum === undefined ? -bigint1 : bigint1
  const finiteMagnitude = boundary !== undefined && boundary * direction <= bigint0 ? -boundary * direction : undefined

  return (state) => {
    if (Model.randomInt(state, 0, 7) === 0) return special[Model.randomIndex(state, special.length)]
    if (boundary !== undefined && (boundary * direction > bigint0 || Model.randomBoolean(state))) {
      return boundary + direction * randomMagnitude(state)
    }
    const sign = Model.randomBoolean(state) ? bigint1 : -bigint1
    return sign * randomMagnitude(state, sign === -direction ? finiteMagnitude : undefined)
  }
}

function sample(value: bigint, target: bigint, context?: bigint): Model.Sample<bigint> {
  return Model.makeSampleWithLazyShrinks(value, () => {
    const from = context ?? target
    const gap = value - from
    if (gap === bigint0) return undefined
    if (context !== undefined && (gap === bigint1 || gap === -bigint1)) {
      return Model.pullFromArray([sample(context, target)])
    }
    const direction = gap > bigint0 ? bigint1 : -bigint1
    const candidates = new Set<bigint>(context === undefined ? [target] : [])
    // Both endpoints satisfy the bounds, so every candidate strictly between them does too.
    const add = (candidate: bigint) => {
      if ((candidate - from) * direction > bigint0 && (value - candidate) * direction > bigint0) {
        candidates.add(candidate)
      }
    }
    if (context === undefined) {
      for (const magnitude of semanticMagnitudes) add(target + direction * magnitude)
      const maximumBits = bitLength(gap)
      for (let bits = 1; bits < maximumBits; bits *= 2) {
        add(target + direction * ((bigint1 << BigInt(bits)) - bigint1))
      }
    } else {
      const passingBits = bitLength(context)
      const failingBits = bitLength(value)
      if (
        Math.abs(failingBits - passingBits) > 1 && (context === bigint0 || (context > bigint0) === (value > bigint0))
      ) {
        const bits = Math.floor((passingBits + failingBits) / 2)
        add(direction * ((bigint1 << BigInt(bits)) - bigint1))
      }
    }
    let toRemove = gap / bigint2
    for (let step = 0; toRemove !== bigint0 && step < 256; step++, toRemove /= bigint2) {
      add(value - toRemove)
    }
    candidates.add(value - direction)
    const ordered = [...candidates].sort((a, b) => a < b ? -Number(direction) : a > b ? Number(direction) : 0)
    let previous = context
    return Effect.map(Model.pullFromArray(ordered), (candidate) => {
      const child = sample(candidate, target, previous)
      previous = candidate
      return child
    })
  })
}

/** @internal */
export function make(minimum: bigint | undefined, maximum: bigint | undefined): Model.Compiled<bigint> {
  const generate = makeGenerator(minimum, maximum)
  const target = minimum !== undefined && minimum > bigint0
    ? minimum
    : maximum !== undefined && maximum < bigint0
    ? maximum
    : bigint0
  return Model.makeCompiled([], () => 0, (state) => {
    const value = generate(state)
    return state.shrinks ? sample(value, target) : Model.makeSample(value)
  })
}
