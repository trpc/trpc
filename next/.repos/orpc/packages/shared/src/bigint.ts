/**
 * Default maximum digits, excluding a leading `-`, when parsing a `bigint` from a string.
 */
export const DEFAULT_MAX_BIGINT_DIGITS = 4300

/**
 * Matches `bigint.toString()` output only.
 */
const BIGINT_PATTERN = /^-?(?:0|[1-9]\d*)$/

/**
 * Parses a `bigint.toString()` string, or returns `undefined` if it is invalid or has more than `maxDigits` digits.
 * The length is checked first, since `BigInt()` is super-linear in the digit count.
 */
export function parseBigIntString(value: string, maxDigits: number): bigint | undefined {
  const digits = value.startsWith('-') ? value.length - 1 : value.length

  if (digits > maxDigits || !BIGINT_PATTERN.test(value)) {
    return undefined
  }

  return BigInt(value)
}
