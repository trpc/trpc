/**
 * Hexadecimal encoding, decoding, and random value helpers.
 *
 * @since 4.0.0
 */
import * as Result from "../Result.ts"
import { EncodingError } from "./EncodingError.ts"

/**
 * Encodes the given value into a hex `string`.
 *
 * **When to use**
 *
 * Use to encode text or bytes as lowercase hexadecimal text.
 *
 * **Example** (Encoding hex strings and bytes)
 *
 * ```ts import.meta.vitest
 * import { Hex } from "effect/encoding"
 *
 * // Encode a string to hex
 * Hex.encode("hello") // => "68656c6c6f"
 *
 * // Encode binary data to hex
 * const bytes = new Uint8Array([72, 101, 108, 108, 111])
 * Hex.encode(bytes) // => "48656c6c6f"
 * ```
 *
 * @category encoding
 * @since 4.0.0
 */
export const encode: (input: Uint8Array | string) => string = (input) =>
  typeof input === "string" ? hexEncodeUint8Array(encoder.encode(input)) : hexEncodeUint8Array(input)

/**
 * Generates a random lowercase hexadecimal string, optimized for lengths that
 * are multiples of 8.
 *
 * **Details**
 *
 * `length` is not validated. The function generates `length >>> 3` random
 * 8-character words, so non-negative lengths below `2 ** 32` are rounded down
 * to a multiple of 8 and other values follow JavaScript's unsigned 32-bit
 * coercion rules.
 *
 * This function uses `Math.random()` and is not cryptographically secure. For
 * security-sensitive values, use the `Crypto.Crypto` service's `randomBytes`
 * method and encode the result with {@link encode}.
 *
 * @category encoding
 * @since 4.0.0
 */
export const random = (length: number): string => {
  switch (length) {
    case 16:
      return random16()
    case 32:
      return random32()
    default: {
      let result = ""
      for (let i = length >>> 3; i > 0; i--) {
        result += random8()
      }
      return result
    }
  }
}

const hexCharCodes = Uint8Array.from("0123456789abcdef", (c) => c.charCodeAt(0))

const randomWord = (): number => (Math.random() * 0x100000000) >>> 0

// Trace and span identifiers are the common lengths. A single
// String.fromCharCode call produces a flat string, which avoids rope
// flattening when the identifier is later serialized.
const random8 = (): string => {
  const a = randomWord()
  return String.fromCharCode(
    hexCharCodes[a >>> 28],
    hexCharCodes[(a >>> 24) & 15],
    hexCharCodes[(a >>> 20) & 15],
    hexCharCodes[(a >>> 16) & 15],
    hexCharCodes[(a >>> 12) & 15],
    hexCharCodes[(a >>> 8) & 15],
    hexCharCodes[(a >>> 4) & 15],
    hexCharCodes[a & 15]
  )
}

const random16 = (): string => {
  const a = randomWord()
  const b = randomWord()
  return String.fromCharCode(
    hexCharCodes[a >>> 28],
    hexCharCodes[(a >>> 24) & 15],
    hexCharCodes[(a >>> 20) & 15],
    hexCharCodes[(a >>> 16) & 15],
    hexCharCodes[(a >>> 12) & 15],
    hexCharCodes[(a >>> 8) & 15],
    hexCharCodes[(a >>> 4) & 15],
    hexCharCodes[a & 15],
    hexCharCodes[b >>> 28],
    hexCharCodes[(b >>> 24) & 15],
    hexCharCodes[(b >>> 20) & 15],
    hexCharCodes[(b >>> 16) & 15],
    hexCharCodes[(b >>> 12) & 15],
    hexCharCodes[(b >>> 8) & 15],
    hexCharCodes[(b >>> 4) & 15],
    hexCharCodes[b & 15]
  )
}

const random32 = (): string => {
  const a = randomWord()
  const b = randomWord()
  const c = randomWord()
  const d = randomWord()
  return String.fromCharCode(
    hexCharCodes[a >>> 28],
    hexCharCodes[(a >>> 24) & 15],
    hexCharCodes[(a >>> 20) & 15],
    hexCharCodes[(a >>> 16) & 15],
    hexCharCodes[(a >>> 12) & 15],
    hexCharCodes[(a >>> 8) & 15],
    hexCharCodes[(a >>> 4) & 15],
    hexCharCodes[a & 15],
    hexCharCodes[b >>> 28],
    hexCharCodes[(b >>> 24) & 15],
    hexCharCodes[(b >>> 20) & 15],
    hexCharCodes[(b >>> 16) & 15],
    hexCharCodes[(b >>> 12) & 15],
    hexCharCodes[(b >>> 8) & 15],
    hexCharCodes[(b >>> 4) & 15],
    hexCharCodes[b & 15],
    hexCharCodes[c >>> 28],
    hexCharCodes[(c >>> 24) & 15],
    hexCharCodes[(c >>> 20) & 15],
    hexCharCodes[(c >>> 16) & 15],
    hexCharCodes[(c >>> 12) & 15],
    hexCharCodes[(c >>> 8) & 15],
    hexCharCodes[(c >>> 4) & 15],
    hexCharCodes[c & 15],
    hexCharCodes[d >>> 28],
    hexCharCodes[(d >>> 24) & 15],
    hexCharCodes[(d >>> 20) & 15],
    hexCharCodes[(d >>> 16) & 15],
    hexCharCodes[(d >>> 12) & 15],
    hexCharCodes[(d >>> 8) & 15],
    hexCharCodes[(d >>> 4) & 15],
    hexCharCodes[d & 15]
  )
}

/**
 * Decodes a hexadecimal string into bytes safely.
 *
 * **When to use**
 *
 * Use to decode hexadecimal text into bytes without throwing on invalid input.
 *
 * **Details**
 *
 * Returns `Result.succeed` with a `Uint8Array` when decoding succeeds, or
 * `Result.fail` with an `EncodingError` when the input has an odd length or
 * contains invalid hex characters.
 *
 * **Example** (Decoding hex bytes)
 *
 * ```ts import.meta.vitest
 * import { Result } from "effect"
 * import { Hex } from "effect/encoding"
 *
 * Hex.decode("48656c6c6f") // => Result.succeed(new Uint8Array([72, 101, 108, 108, 111]))
 * ```
 *
 * @category decoding
 * @since 4.0.0
 */
export const decode = (str: string): Result.Result<Uint8Array, EncodingError> => {
  const bytes = new TextEncoder().encode(str)
  if (bytes.length % 2 !== 0) {
    return Result.fail(
      new EncodingError({
        module: "Hex",
        kind: "Decode",
        input: str,
        message: `Length must be a multiple of 2, but is ${bytes.length}`
      })
    )
  }

  try {
    const length = bytes.length / 2
    const result = new Uint8Array(length)
    for (let i = 0; i < length; i++) {
      const a = fromHexChar(bytes[i * 2])
      const b = fromHexChar(bytes[i * 2 + 1])
      result[i] = (a << 4) | b
    }

    return Result.succeed(result)
  } catch (e) {
    return Result.fail(
      new EncodingError({
        module: "Hex",
        kind: "Decode",
        input: str,
        message: e instanceof Error ? e.message : "Invalid input"
      })
    )
  }
}

/**
 * Decodes a hexadecimal string into a UTF-8 string safely.
 *
 * **When to use**
 *
 * Use to decode hexadecimal text into UTF-8 text without throwing on invalid
 * input.
 *
 * **Details**
 *
 * Returns `Result.succeed` with the decoded text when decoding succeeds, or
 * `Result.fail` with an `EncodingError` when the input is not valid hex.
 *
 * **Example** (Decoding hex strings)
 *
 * ```ts import.meta.vitest
 * import { Result } from "effect"
 * import { Hex } from "effect/encoding"
 *
 * Hex.decodeString("68656c6c6f") // => Result.succeed("hello")
 * ```
 *
 * @category decoding
 * @since 4.0.0
 */
export const decodeString = (str: string) => Result.map(decode(str), (_) => decoder.decode(_))

const encoder = new TextEncoder()
const decoder = new TextDecoder()

const byteToHex: Array<string> = Array.from({ length: 256 }, (_, i) => i.toString(16).padStart(2, "0"))

const hexEncodeUint8Array = (bytes: Uint8Array): string => {
  let result = ""
  for (let i = 0; i < bytes.length; i++) {
    result += byteToHex[bytes[i]]
  }
  return result
}

const fromHexChar = (byte: number) => {
  if (48 <= byte && byte <= 57) {
    return byte - 48
  }

  if (97 <= byte && byte <= 102) {
    return byte - 97 + 10
  }

  if (65 <= byte && byte <= 70) {
    return byte - 65 + 10
  }

  throw new TypeError("Invalid input")
}
