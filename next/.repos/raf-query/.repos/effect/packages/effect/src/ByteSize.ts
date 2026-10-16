/**
 * Represents exact, non-negative, integral byte counts.
 *
 * Decimal units use powers of 1,000 and binary units use powers of 1,024.
 *
 * @since 4.0.0
 */
import * as BI from "./BigInt.ts"
import type * as Brand from "./Brand.ts"
import type * as Combiner from "./Combiner.ts"
import type * as Equ from "./Equivalence.ts"
import { dual } from "./Function.ts"
import * as Option from "./Option.ts"
import type * as order from "./Order.ts"
import type * as Reducer from "./Reducer.ts"

const TypeId = "~effect/ByteSize"

const bigint0 = BigInt(0)
const bigint1 = BigInt(1)
const decimalBase = BigInt(1000)
const binaryBase = BigInt(1024)

/**
 * Represents an exact, non-negative number of bytes.
 *
 * @category models
 * @since 4.0.0
 */
export type ByteSize = Brand.Branded<bigint, typeof TypeId>

/**
 * Values accepted by byte-size decoding operations.
 *
 * **Details**
 *
 * String inputs require a non-negative decimal integer without leading zeros,
 * followed by a canonical unit symbol or lowercase unit name, optionally
 * separated by one space. Numeric inputs are validated at runtime.
 *
 * @see {@link fromString} for external strings and fractional quantities
 * @see {@link fromStringUnsafe} for throwing string validation
 * @category models
 * @since 4.0.0
 */
export type Input = ByteSize | bigint | number | `${IntegerQuantity}${"" | " "}${InputUnit}`

// Combining these constraints excludes signs, radix prefixes, leading zeros,
// fractions, and exponent notation without limiting the number of digits.
type IntegerQuantity = "0" | (`${bigint}` & `${"1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9"}${string}`)

type InputUnit =
  | Unit
  | `${
    | ""
    | "kilo"
    | "mega"
    | "giga"
    | "tera"
    | "peta"
    | "exa"
    | "zetta"
    | "yotta"
    | "ronna"
    | "quetta"
    | "kibi"
    | "mebi"
    | "gibi"
    | "tebi"
    | "pebi"
    | "exbi"
    | "zebi"
    | "yobi"}byte${"" | "s"}`

/**
 * Canonical decimal byte unit symbols.
 *
 * @category models
 * @since 4.0.0
 */
export type DecimalUnit =
  | "B"
  | "kB"
  | "MB"
  | "GB"
  | "TB"
  | "PB"
  | "EB"
  | "ZB"
  | "YB"
  | "RB"
  | "QB"

/**
 * Canonical binary byte unit symbols.
 *
 * @category models
 * @since 4.0.0
 */
export type BinaryUnit =
  | "B"
  | "KiB"
  | "MiB"
  | "GiB"
  | "TiB"
  | "PiB"
  | "EiB"
  | "ZiB"
  | "YiB"

/**
 * Canonical decimal and binary byte unit symbols.
 *
 * @category models
 * @since 4.0.0
 */
export type Unit = DecimalUnit | BinaryUnit

/**
 * Options controlling compact byte-size formatting.
 *
 * @category models
 * @since 4.0.0
 */
export type FormatOptions =
  & {
    readonly precision?: number | undefined
    readonly trailingZeros?: boolean | undefined
  }
  & (
    | {
      readonly system?: "decimal" | undefined
      readonly unit?: DecimalUnit | undefined
    }
    | {
      readonly system?: "binary" | undefined
      readonly unit?: BinaryUnit | undefined
    }
  )

interface UnitInfo {
  readonly symbol: Unit
  readonly factor: bigint
  readonly names: ReadonlyArray<string>
}

const decimalUnits: ReadonlyArray<UnitInfo> = [
  { symbol: "B", factor: bigint1, names: ["B", "byte", "bytes"] },
  { symbol: "kB", factor: decimalBase, names: ["kB", "kilobyte", "kilobytes"] },
  { symbol: "MB", factor: decimalBase ** BigInt(2), names: ["MB", "megabyte", "megabytes"] },
  { symbol: "GB", factor: decimalBase ** BigInt(3), names: ["GB", "gigabyte", "gigabytes"] },
  { symbol: "TB", factor: decimalBase ** BigInt(4), names: ["TB", "terabyte", "terabytes"] },
  { symbol: "PB", factor: decimalBase ** BigInt(5), names: ["PB", "petabyte", "petabytes"] },
  { symbol: "EB", factor: decimalBase ** BigInt(6), names: ["EB", "exabyte", "exabytes"] },
  { symbol: "ZB", factor: decimalBase ** BigInt(7), names: ["ZB", "zettabyte", "zettabytes"] },
  { symbol: "YB", factor: decimalBase ** BigInt(8), names: ["YB", "yottabyte", "yottabytes"] },
  { symbol: "RB", factor: decimalBase ** BigInt(9), names: ["RB", "ronnabyte", "ronnabytes"] },
  { symbol: "QB", factor: decimalBase ** BigInt(10), names: ["QB", "quettabyte", "quettabytes"] }
]

const binaryUnits: ReadonlyArray<UnitInfo> = [
  decimalUnits[0],
  { symbol: "KiB", factor: binaryBase, names: ["KiB", "kibibyte", "kibibytes"] },
  { symbol: "MiB", factor: binaryBase ** BigInt(2), names: ["MiB", "mebibyte", "mebibytes"] },
  { symbol: "GiB", factor: binaryBase ** BigInt(3), names: ["GiB", "gibibyte", "gibibytes"] },
  { symbol: "TiB", factor: binaryBase ** BigInt(4), names: ["TiB", "tebibyte", "tebibytes"] },
  { symbol: "PiB", factor: binaryBase ** BigInt(5), names: ["PiB", "pebibyte", "pebibytes"] },
  { symbol: "EiB", factor: binaryBase ** BigInt(6), names: ["EiB", "exbibyte", "exbibytes"] },
  { symbol: "ZiB", factor: binaryBase ** BigInt(7), names: ["ZiB", "zebibyte", "zebibytes"] },
  { symbol: "YiB", factor: binaryBase ** BigInt(8), names: ["YiB", "yobibyte", "yobibytes"] }
]

const allUnits = [...decimalUnits, ...binaryUnits.slice(1)]
const unitsByName = new Map(allUnits.flatMap((unit) => unit.names.map((name) => [name, unit] as const)))
const unitsBySymbol = new Map(allUnits.map((unit) => [unit.symbol, unit] as const))

const make = (value: bigint): ByteSize => value as ByteSize

/**
 * The byte size containing zero bytes.
 *
 * @category constants
 * @since 4.0.0
 */
export const zero: ByteSize = make(bigint0)

const invalid = (message: string): never => {
  throw new Error(`Invalid ByteSize: ${message}`)
}

const fromNumber = (input: number): ByteSize => {
  if (!Number.isSafeInteger(input) || input < 0) {
    return invalid(`expected a non-negative safe integer, received ${input}`)
  }
  return make(BigInt(input))
}

const fromQuantity = (quantity: number | bigint, unit: UnitInfo): ByteSize => {
  if (typeof quantity === "bigint") {
    if (quantity < bigint0) return invalid(`expected a non-negative quantity, received ${quantity}`)
    return make(quantity * unit.factor)
  }
  const value = quantity * Number(unit.factor)
  if (!Number.isSafeInteger(value) || value < 0) {
    return invalid(`expected an exact non-negative safe-integer byte result, received ${quantity} ${unit.symbol}`)
  }
  return make(BigInt(value))
}

/**
 * Parses a byte-size string and throws for invalid syntax, unsupported units,
 * or quantities that do not represent non-negative integral bytes.
 *
 * **Details**
 *
 * Accepts decimal fractions, canonical SI and IEC symbols, lowercase unit
 * names, and whitespace around the quantity and unit. Parsing uses exact
 * bigint arithmetic, including above the safe integer range.
 *
 * @see {@link fromString} for non-throwing validation
 * @category constructors
 * @since 4.0.0
 */
export const fromStringUnsafe = (input: string): ByteSize => {
  const match = /^\s*(\d+)(?:\.(\d+))?\s*([A-Za-z]+)\s*$/.exec(input)
  if (match === null) return invalid(`unsupported syntax ${JSON.stringify(input)}`)
  const unit = unitsByName.get(match[3])
  if (unit === undefined) return invalid(`unsupported unit ${JSON.stringify(match[3])}`)
  const fraction = match[2] ?? ""
  const scale = BigInt(10) ** BigInt(fraction.length)
  const numerator = BigInt(match[1] + fraction) * unit.factor
  if (numerator % scale !== bigint0) {
    return invalid(`${JSON.stringify(input)} does not represent an integral number of bytes`)
  }
  return make(numerator / scale)
}

/**
 * Parses a byte-size string, returning `None` for invalid syntax, unsupported
 * units, or quantities that do not represent non-negative integral bytes.
 *
 * **Details**
 *
 * Accepts external strings and fractional quantities using the same syntax
 * as `fromStringUnsafe`.
 *
 * @see {@link fromStringUnsafe} for throwing validation
 * @category constructors
 * @since 4.0.0
 */
export const fromString: (input: string) => Option.Option<ByteSize> = Option.liftThrowable(fromStringUnsafe)

/**
 * Decodes a trusted input into a byte size and throws for invalid input.
 *
 * @category constructors
 * @since 4.0.0
 */
export const fromInputUnsafe = (input: Input): ByteSize => {
  switch (typeof input) {
    case "bigint":
      if (input < bigint0) return invalid(`expected a non-negative bigint, received ${input}`)
      return make(input)
    case "number":
      return fromNumber(input)
    case "string":
      return fromStringUnsafe(input)
  }
  return invalid(`unsupported input ${input}`)
}

/**
 * Decodes an input into a byte size, returning `None` for invalid input.
 *
 * @category constructors
 * @since 4.0.0
 */
export const fromInput: (input: Input) => Option.Option<ByteSize> = Option.liftThrowable(fromInputUnsafe)

/**
 * Creates a byte size from a non-negative byte count.
 *
 * @category constructors
 * @since 4.0.0
 */
export const bytes = (value: number | bigint): ByteSize =>
  typeof value === "bigint" ? fromInputUnsafe(value) : fromNumber(value)

const unitConstructor = (symbol: Unit) => (value: number | bigint): ByteSize =>
  fromQuantity(value, unitsBySymbol.get(symbol)!)

/**
 * Creates a decimal kilobyte value.
 *
 * @category constructors
 * @since 4.0.0
 */
export const kilobytes: (value: number | bigint) => ByteSize = unitConstructor("kB")
/**
 * Creates a decimal megabyte value.
 *
 * @category constructors
 * @since 4.0.0
 */
export const megabytes: (value: number | bigint) => ByteSize = unitConstructor("MB")
/**
 * Creates a decimal gigabyte value.
 *
 * @category constructors
 * @since 4.0.0
 */
export const gigabytes: (value: number | bigint) => ByteSize = unitConstructor("GB")
/**
 * Creates a decimal terabyte value.
 *
 * @category constructors
 * @since 4.0.0
 */
export const terabytes: (value: number | bigint) => ByteSize = unitConstructor("TB")
/**
 * Creates a decimal petabyte value.
 *
 * @category constructors
 * @since 4.0.0
 */
export const petabytes: (value: number | bigint) => ByteSize = unitConstructor("PB")
/**
 * Creates a decimal exabyte value.
 *
 * @category constructors
 * @since 4.0.0
 */
export const exabytes: (value: number | bigint) => ByteSize = unitConstructor("EB")
/**
 * Creates a decimal zettabyte value.
 *
 * @category constructors
 * @since 4.0.0
 */
export const zettabytes: (value: number | bigint) => ByteSize = unitConstructor("ZB")
/**
 * Creates a decimal yottabyte value.
 *
 * @category constructors
 * @since 4.0.0
 */
export const yottabytes: (value: number | bigint) => ByteSize = unitConstructor("YB")
/**
 * Creates a decimal ronnabyte value.
 *
 * @category constructors
 * @since 4.0.0
 */
export const ronnabytes: (value: number | bigint) => ByteSize = unitConstructor("RB")
/**
 * Creates a decimal quettabyte value.
 *
 * @category constructors
 * @since 4.0.0
 */
export const quettabytes: (value: number | bigint) => ByteSize = unitConstructor("QB")
/**
 * Creates a binary kibibyte value.
 *
 * @category constructors
 * @since 4.0.0
 */
export const kibibytes: (value: number | bigint) => ByteSize = unitConstructor("KiB")
/**
 * Creates a binary mebibyte value.
 *
 * @category constructors
 * @since 4.0.0
 */
export const mebibytes: (value: number | bigint) => ByteSize = unitConstructor("MiB")
/**
 * Creates a binary gibibyte value.
 *
 * @category constructors
 * @since 4.0.0
 */
export const gibibytes: (value: number | bigint) => ByteSize = unitConstructor("GiB")
/**
 * Creates a binary tebibyte value.
 *
 * @category constructors
 * @since 4.0.0
 */
export const tebibytes: (value: number | bigint) => ByteSize = unitConstructor("TiB")
/**
 * Creates a binary pebibyte value.
 *
 * @category constructors
 * @since 4.0.0
 */
export const pebibytes: (value: number | bigint) => ByteSize = unitConstructor("PiB")
/**
 * Creates a binary exbibyte value.
 *
 * @category constructors
 * @since 4.0.0
 */
export const exbibytes: (value: number | bigint) => ByteSize = unitConstructor("EiB")
/**
 * Creates a binary zebibyte value.
 *
 * @category constructors
 * @since 4.0.0
 */
export const zebibytes: (value: number | bigint) => ByteSize = unitConstructor("ZiB")
/**
 * Creates a binary yobibyte value.
 *
 * @category constructors
 * @since 4.0.0
 */
export const yobibytes: (value: number | bigint) => ByteSize = unitConstructor("YiB")

/**
 * Checks whether a value is a byte size.
 *
 * @category guards
 * @since 4.0.0
 */
export const isByteSize = (input: unknown): input is ByteSize => typeof input === "bigint" && input >= bigint0

/**
 * Checks whether a byte size is zero.
 *
 * @category predicates
 * @since 4.0.0
 */
export const isZero = (self: ByteSize): boolean => self === bigint0

/**
 * Returns the exact byte count as a bigint.
 *
 * @category getters
 * @since 4.0.0
 */
export const toBigInt = (self: ByteSize): bigint => self

/**
 * Converts a byte size to a safe integer, returning `None` when it is too large.
 *
 * @category converting
 * @since 4.0.0
 */
export const toNumber: (self: ByteSize) => Option.Option<number> = BI.toNumber

/**
 * Converts a byte size to a safe integer and throws when it is too large.
 *
 * @category unsafe
 * @since 4.0.0
 */
export const toNumberUnsafe = (self: ByteSize): number =>
  Option.getOrThrowWith(toNumber(self), () => new Error(`ByteSize exceeds Number.MAX_SAFE_INTEGER: ${self}`))

/**
 * Converts a byte size to an approximate number of the specified unit.
 *
 * @category converting
 * @since 4.0.0
 */
export const toUnit: {
  (unit: Unit): (self: ByteSize) => number
  (self: ByteSize, unit: Unit): number
} = dual(2, (self: ByteSize, unit: Unit) => Number(self) / Number(unitsBySymbol.get(unit)!.factor))

/**
 * Provides an order for byte sizes.
 *
 * @category instances
 * @since 4.0.0
 */
export const Order: order.Order<ByteSize> = BI.Order

/**
 * Provides an equivalence for byte sizes.
 *
 * @category instances
 * @since 4.0.0
 */
export const Equivalence: Equ.Equivalence<ByteSize> = BI.Equivalence

/**
 * Returns whether a byte size is in an inclusive range.
 *
 * @category predicates
 * @since 4.0.0
 */
export const between: {
  (options: { minimum: ByteSize; maximum: ByteSize }): (self: ByteSize) => boolean
  (self: ByteSize, options: { minimum: ByteSize; maximum: ByteSize }): boolean
} = BI.between

/**
 * Returns the smaller byte size.
 *
 * @category ordering
 * @since 4.0.0
 */
export const min: {
  (that: ByteSize): (self: ByteSize) => ByteSize
  (self: ByteSize, that: ByteSize): ByteSize
} = BI.min as any

/**
 * Returns the larger byte size.
 *
 * @category ordering
 * @since 4.0.0
 */
export const max: {
  (that: ByteSize): (self: ByteSize) => ByteSize
  (self: ByteSize, that: ByteSize): ByteSize
} = BI.max as any

/**
 * Constrains a byte size to an inclusive range.
 *
 * @category ordering
 * @since 4.0.0
 */
export const clamp: {
  (options: { minimum: ByteSize; maximum: ByteSize }): (self: ByteSize) => ByteSize
  (self: ByteSize, options: { minimum: ByteSize; maximum: ByteSize }): ByteSize
} = BI.clamp as any

/**
 * Checks whether the first byte size is less than the second.
 *
 * @category predicates
 * @since 4.0.0
 */
export const isLessThan: {
  (that: ByteSize): (self: ByteSize) => boolean
  (self: ByteSize, that: ByteSize): boolean
} = BI.isLessThan

/**
 * Checks whether the first byte size is at most the second.
 *
 * @category predicates
 * @since 4.0.0
 */
export const isLessThanOrEqualTo: {
  (that: ByteSize): (self: ByteSize) => boolean
  (self: ByteSize, that: ByteSize): boolean
} = BI.isLessThanOrEqualTo

/**
 * Checks whether the first byte size is greater than the second.
 *
 * @category predicates
 * @since 4.0.0
 */
export const isGreaterThan: {
  (that: ByteSize): (self: ByteSize) => boolean
  (self: ByteSize, that: ByteSize): boolean
} = BI.isGreaterThan

/**
 * Checks whether the first byte size is at least the second.
 *
 * @category predicates
 * @since 4.0.0
 */
export const isGreaterThanOrEqualTo: {
  (that: ByteSize): (self: ByteSize) => boolean
  (self: ByteSize, that: ByteSize): boolean
} = BI.isGreaterThanOrEqualTo

/**
 * Checks whether two byte sizes contain the same count.
 *
 * @category predicates
 * @since 4.0.0
 */
export const equals: {
  (that: ByteSize): (self: ByteSize) => boolean
  (self: ByteSize, that: ByteSize): boolean
} = dual(2, Equivalence)

/**
 * Adds two byte sizes exactly.
 *
 * @category math
 * @since 4.0.0
 */
export const sum: {
  (that: ByteSize): (self: ByteSize) => ByteSize
  (self: ByteSize, that: ByteSize): ByteSize
} = BI.sum as any

/**
 * Subtracts byte sizes, returning `None` on underflow.
 *
 * @category math
 * @since 4.0.0
 */
export const subtract: {
  (that: ByteSize): (self: ByteSize) => Option.Option<ByteSize>
  (self: ByteSize, that: ByteSize): Option.Option<ByteSize>
} = dual(
  2,
  (self: ByteSize, that: ByteSize) => self < that ? Option.none() : Option.some(make(self - that))
)

/**
 * Subtracts byte sizes and throws on underflow.
 *
 * @category unsafe
 * @since 4.0.0
 */
export const subtractUnsafe: {
  (that: ByteSize): (self: ByteSize) => ByteSize
  (self: ByteSize, that: ByteSize): ByteSize
} = dual(2, (self: ByteSize, that: ByteSize) => {
  if (self < that) throw new Error(`ByteSize subtraction underflow: ${self} - ${that}`)
  return make(self - that)
})

const scalar = (input: number | bigint, positive: boolean): bigint | undefined => {
  if (typeof input === "bigint") return input >= (positive ? bigint1 : bigint0) ? input : undefined
  return Number.isSafeInteger(input) && input >= (positive ? 1 : 0) ? BigInt(input) : undefined
}

/**
 * Multiplies a byte size by a non-negative integer scalar.
 *
 * @category math
 * @since 4.0.0
 */
export const times: {
  (multiplier: number | bigint): (self: ByteSize) => Option.Option<ByteSize>
  (self: ByteSize, multiplier: number | bigint): Option.Option<ByteSize>
} = dual(2, (self: ByteSize, multiplier: number | bigint) => {
  const value = scalar(multiplier, false)
  return value === undefined ? Option.none() : Option.some(make(self * value))
})

/**
 * Divides a byte size by a positive integer, discarding any remainder.
 *
 * @category math
 * @since 4.0.0
 */
export const divide: {
  (divisor: number | bigint): (self: ByteSize) => Option.Option<ByteSize>
  (self: ByteSize, divisor: number | bigint): Option.Option<ByteSize>
} = dual(2, (self: ByteSize, divisor: number | bigint) => {
  const value = scalar(divisor, true)
  return value === undefined ? Option.none() : Option.some(make(self / value))
})

const validatePrecision = (precision: number): number => {
  if (!Number.isSafeInteger(precision) || precision < 0 || precision > 20) {
    throw new Error(`ByteSize format precision must be an integer from 0 to 20, received ${precision}`)
  }
  return precision
}

const formatWithUnit = (value: bigint, unit: UnitInfo, precision: number, trailingZeros: boolean): string => {
  const scale = BigInt(10) ** BigInt(precision)
  const rounded = (value * scale * BigInt(2) + unit.factor) / (unit.factor * BigInt(2))
  const whole = rounded / scale
  if (precision === 0) return `${whole} ${unit.symbol}`
  let fraction = `${rounded % scale}`.padStart(precision, "0")
  if (!trailingZeros) fraction = fraction.replace(/0+$/, "")
  return `${whole}${fraction.length === 0 ? "" : `.${fraction}`} ${unit.symbol}`
}

/**
 * Formats a byte size with canonical decimal or binary unit symbols.
 *
 * @category converting
 * @since 4.0.0
 */
export const format = (self: ByteSize, options: FormatOptions = {}): string => {
  const precision = validatePrecision(options.precision ?? 2)
  const trailingZeros = options.trailingZeros ?? false
  if (options.unit !== undefined) {
    return formatWithUnit(self, unitsBySymbol.get(options.unit)!, precision, trailingZeros)
  }
  const units = options.system === "decimal" ? decimalUnits : binaryUnits
  if (self === bigint0) return "0 B"
  let index = units.length - 1
  while (index > 0 && self < units[index].factor) index--
  if (index < units.length - 1) {
    const scale = BigInt(10) ** BigInt(precision)
    const rounded = (self * scale * BigInt(2) + units[index].factor) / (units[index].factor * BigInt(2))
    const base = options.system === "decimal" ? decimalBase : binaryBase
    if (rounded >= base * scale) index++
  }
  return formatWithUnit(self, units[index], precision, trailingZeros)
}

/**
 * Reducer that sums byte sizes from zero.
 *
 * @category math
 * @since 4.0.0
 */
export const ReducerSum: Reducer.Reducer<ByteSize> = BI.ReducerSum as any

/**
 * Combiner that keeps the largest byte size.
 *
 * @category math
 * @since 4.0.0
 */
export const CombinerMax: Combiner.Combiner<ByteSize> = BI.CombinerMax as any

/**
 * Combiner that keeps the smallest byte size.
 *
 * @category math
 * @since 4.0.0
 */
export const CombinerMin: Combiner.Combiner<ByteSize> = BI.CombinerMin as any
