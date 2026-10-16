import * as BigDecimal from "../../BigDecimal.ts"
import * as Effect from "../../Effect.ts"
import { done } from "../core.ts"
import * as Model from "./model.ts"

const bigint0 = BigInt(0)
const bigint1 = BigInt(1)
const bigint10 = BigInt(10)
const maximumGeneratedBits = 425
const maximumExactPower = 4_096
const shrinkExponents = [-512, -256, -128, -64, -32, -16, -8, -4, -2, -1, 0, 1, 2, 4, 8, 16, 32, 64, 128, 256, 512]
const compare = BigDecimal.Order

/** @internal */
export interface Bounds {
  readonly minimum?: BigDecimal.BigDecimal | undefined
  readonly exclusiveMinimum?: boolean | undefined
  readonly maximum?: BigDecimal.BigDecimal | undefined
  readonly exclusiveMaximum?: boolean | undefined
}

function isAllowed(value: BigDecimal.BigDecimal, bounds: Bounds): boolean {
  if (bounds.minimum !== undefined) {
    const comparison = compare(value, bounds.minimum)
    if (comparison < 0 || comparison === 0 && bounds.exclusiveMinimum === true) return false
  }
  if (bounds.maximum !== undefined) {
    const comparison = compare(value, bounds.maximum)
    if (comparison > 0 || comparison === 0 && bounds.exclusiveMaximum === true) return false
  }
  return true
}

// All offsets are nonnegative; clamp before constructing a BigDecimal at the finer scale.
function addScale(scale: number, offset: number, maximum = Number.MAX_SAFE_INTEGER): number {
  return Math.min(maximum, scale + offset)
}

function boundaryCandidate(
  value: BigDecimal.BigDecimal | undefined,
  exclusive: boolean | undefined,
  direction: -1 | 1
): BigDecimal.BigDecimal | undefined {
  if (value === undefined || exclusive !== true) return value
  return value.scale < Number.MAX_SAFE_INTEGER
    ? BigDecimal.make(value.value * bigint10 + BigInt(direction), value.scale + 1)
    : BigDecimal.make(value.value + BigInt(direction), value.scale)
}

function digits(value: bigint): number {
  return (value < bigint0 ? -value : value).toString().length
}

function roundAtScale(
  value: BigDecimal.BigDecimal,
  scale: number,
  ceil: boolean,
  maximumPower = maximumExactPower
): bigint | undefined {
  if (value.value === bigint0) return bigint0
  const difference = BigInt(scale) - BigInt(value.scale)
  if (difference >= bigint0) {
    if (difference > BigInt(maximumPower)) return undefined
    return value.value * bigint10 ** difference
  }
  const divisor = -difference >= BigInt(digits(value.value)) ? undefined : bigint10 ** -difference
  const quotient = divisor === undefined ? bigint0 : value.value / divisor
  const remainder = divisor === undefined ? value.value : value.value % divisor
  return quotient + (ceil && remainder > bigint0 ? bigint1 : !ceil && remainder < bigint0 ? -bigint1 : bigint0)
}

type CoefficientRange = readonly [minimum: bigint | undefined, maximum: bigint | undefined]

function coefficientRange(scale: number, bounds: Bounds): CoefficientRange | undefined {
  const lower = bounds.minimum
  const upper = bounds.maximum
  let minimum = lower === undefined
    ? undefined
    : roundAtScale(lower, scale, bounds.exclusiveMinimum !== true)
  let maximum = upper === undefined
    ? undefined
    : roundAtScale(upper, scale, bounds.exclusiveMaximum === true)
  // A projected bound can already exceed the default precision budget. Resolve the
  // other bound at that precision before treating its projection as out of reach.
  if (lower !== undefined && minimum === undefined && maximum !== undefined) {
    minimum = roundAtScale(
      lower,
      scale,
      bounds.exclusiveMinimum !== true,
      Math.max(maximumExactPower, digits(maximum))
    )
  }
  if (upper !== undefined && maximum === undefined && minimum !== undefined) {
    maximum = roundAtScale(
      upper,
      scale,
      bounds.exclusiveMaximum === true,
      Math.max(maximumExactPower, digits(minimum))
    )
  }
  if (minimum === undefined && lower !== undefined && lower.value > bigint0) return undefined
  if (maximum === undefined && upper !== undefined && upper.value < bigint0) return undefined
  if (minimum !== undefined && bounds.exclusiveMinimum === true) minimum += bigint1
  if (maximum !== undefined && bounds.exclusiveMaximum === true) maximum -= bigint1
  return minimum !== undefined && maximum !== undefined && minimum > maximum
    ? undefined
    : [minimum, maximum]
}

function randomCoefficient(state: Model.GenerationState, range: CoefficientRange): bigint {
  const [minimum, maximum] = range
  if (minimum !== undefined && maximum !== undefined) {
    return Model.randomBigInt(state, minimum, maximum)
  }
  const ordinary = Model.randomInt(state, 0, 3) !== 0
  const bits = ordinary ? Model.randomInt(state, 0, 20) : Model.randomInt(state, 1, maximumGeneratedBits)
  const lowest = bits === 0 ? bigint0 : bigint1 << BigInt(bits - 1)
  const distance = bits === 0 ? bigint0 : Model.randomBigInt(state, lowest, (lowest << bigint1) - bigint1)
  if (minimum !== undefined) return minimum + distance
  if (maximum !== undefined) return maximum - distance
  return Model.randomBoolean(state) ? distance : -distance
}

function randomScale(state: Model.GenerationState, boundaryScale: number | undefined): number {
  const mode = Model.randomInt(state, 0, 7)
  if (mode <= 5 && boundaryScale !== undefined) {
    return addScale(boundaryScale, Model.randomInt(state, 0, mode === 5 ? 20 : 2))
  }
  if (mode === 6) return Model.randomInt(state, -6, 20)
  const precision = Model.randomInt(state, 1, 128)
  const exponent = Model.randomInt(state, -512, 512)
  return precision - 1 - exponent
}

type ShrinkContext = readonly [passing: BigDecimal.BigDecimal, refinement: number]

function projectExact(value: BigDecimal.BigDecimal, scale: number): bigint | undefined {
  const difference = BigInt(scale) - BigInt(value.scale)
  if (difference < bigint0 || difference > BigInt(maximumExactPower)) return undefined
  return value.value * bigint10 ** difference
}

function midpoint(
  passing: BigDecimal.BigDecimal,
  failing: BigDecimal.BigDecimal,
  maximumScale: number
): BigDecimal.BigDecimal | undefined {
  const scale = addScale(Math.max(passing.scale, failing.scale), 1, maximumScale)
  const left = projectExact(passing, scale)
  const right = projectExact(failing, scale)
  if (left === undefined || right === undefined) return undefined
  const value = left + (right - left) / BigInt(2)
  return value === left || value === right ? undefined : BigDecimal.make(value, scale)
}

function sample(
  value: BigDecimal.BigDecimal,
  target: BigDecimal.BigDecimal,
  context?: ShrinkContext,
  maximumScale = addScale(Math.max(value.scale, target.scale), 128)
): Model.Sample<BigDecimal.BigDecimal> {
  return Model.makeSampleWithLazyShrinks(value, () => {
    const from = context?.[0] ?? target
    const direction = compare(value, from)
    if (direction === 0) return undefined
    let next: BigDecimal.BigDecimal | undefined
    if (context !== undefined) {
      const normalized = BigDecimal.normalize(context[0])
      const scale = addScale(normalized.scale, Math.min(context[1] + 1, 128), maximumScale)
      const projected = projectExact(normalized, scale)
      if (projected !== undefined) next = BigDecimal.make(projected + BigInt(direction), scale)
    }
    // Simple candidates are already ordered toward the failing value. Strict
    // inequalities preserve the bounds and exclude equivalent representations.
    const candidates = (context === undefined
      ? shrinkExponents.map((exponent) => BigDecimal.make(BigInt(direction), -exponent))
      : [next]).filter((candidate): candidate is BigDecimal.BigDecimal =>
        candidate !== undefined && candidate.scale <= maximumScale &&
        compare(candidate, from) === direction && compare(candidate, value) === -direction
      )
    if (context === undefined) candidates.unshift(target)
    let previous = context
    let index = 0
    return Effect.suspend(() => {
      // If all simpler candidates pass, keep bisecting toward the failing value.
      const candidate = index < candidates.length
        ? candidates[index++]
        : previous === undefined
        ? undefined
        : midpoint(previous[0], value, maximumScale)
      if (candidate === undefined) return done()
      const child = sample(candidate, target, previous, maximumScale)
      previous = [candidate, (previous?.[1] ?? 0) + 1]
      return Effect.succeed(child)
    })
  })
}

/** @internal */
export function make(bounds: Bounds): Model.Compiled<BigDecimal.BigDecimal> | undefined {
  if (bounds.minimum !== undefined && bounds.maximum !== undefined && compare(bounds.minimum, bounds.maximum) === 0) {
    if (bounds.exclusiveMinimum === true || bounds.exclusiveMaximum === true) return undefined
    const value = bounds.minimum
    return Model.makeCompiled([], () => 0, () => Model.makeSample(value))
  }
  const zero = BigDecimal.make(bigint0, 0)
  const lower = boundaryCandidate(bounds.minimum, bounds.exclusiveMinimum, 1)
  const upper = boundaryCandidate(bounds.maximum, bounds.exclusiveMaximum, -1)
  // The finer endpoint's inward step fits every nonempty interval. At the maximum
  // scale there is no finer grid, so adjacent exclusive endpoints have no witness.
  const witness = [zero, lower, upper].find((value) => value !== undefined && isAllowed(value, bounds))
  if (witness === undefined) return undefined
  const target = witness.value < bigint0 && upper !== undefined && isAllowed(upper, bounds) ? upper : witness

  const special = [
    witness,
    BigDecimal.make(bigint1, 1),
    BigDecimal.make(bigint1, 0),
    BigDecimal.make(bigint10, 0),
    BigDecimal.make(-bigint1, 1),
    BigDecimal.make(-bigint1, 0),
    BigDecimal.make(-bigint10, 0),
    ...(bounds.minimum !== undefined && bounds.exclusiveMinimum !== true ? [bounds.minimum] : []),
    ...(bounds.maximum !== undefined && bounds.exclusiveMaximum !== true ? [bounds.maximum] : [])
  ].filter((value) => isAllowed(value, bounds))
  const boundaryScale = lower === undefined
    ? upper?.scale
    : upper === undefined
    ? lower.scale
    : Math.max(lower.scale, upper.scale)
  const preferred = boundaryScale === undefined ? undefined : coefficientRange(boundaryScale, bounds)
  const generatePreferred = preferred?.[0] !== undefined && preferred[1] !== undefined
    ? Model.makeRandomNumericBigInt(preferred[0], preferred[1])
    : undefined

  return Model.makeCompiled([], () => 0, (state) => {
    let value: BigDecimal.BigDecimal
    if (Model.randomInt(state, 0, 7) === 0) {
      value = special[Model.randomIndex(state, special.length)]
    } else if (generatePreferred !== undefined && Model.randomInt(state, 0, 3) !== 0) {
      value = BigDecimal.make(generatePreferred(state), boundaryScale!)
    } else {
      value = witness
      for (let attempt = 0; attempt < 16; attempt++) {
        const scale = randomScale(state, boundaryScale)
        const range = coefficientRange(scale, bounds)
        if (range === undefined) continue
        const coefficient = randomCoefficient(state, range)
        if (Model.randomInt(state, 0, 7) === 0 && scale < Number.MAX_SAFE_INTEGER) {
          const trailing = Model.randomInt(state, 1, Math.min(8, Number.MAX_SAFE_INTEGER - scale))
          value = BigDecimal.make(coefficient * bigint10 ** BigInt(trailing), scale + trailing)
        } else {
          value = BigDecimal.make(coefficient, scale)
        }
        break
      }
    }
    return state.shrinks ? sample(value, target) : Model.makeSample(value)
  })
}
