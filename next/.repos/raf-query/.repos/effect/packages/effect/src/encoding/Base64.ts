/**
 * Base64 encoding and decoding helpers.
 *
 * @since 4.0.0
 */
import * as Result from "../Result.ts"
import { EncodingError } from "./EncodingError.ts"

/**
 * Encodes the given value into a Base64 (RFC 4648) string.
 *
 * **When to use**
 *
 * Use to encode text or bytes as a standard padded Base64 string for storage or
 * transport.
 *
 * **Details**
 *
 * String inputs are encoded as UTF-8 bytes before Base64 encoding.
 * `Uint8Array` inputs are encoded directly. The output uses the standard
 * RFC 4648 alphabet with `=` padding.
 *
 * **Example** (Encoding Base64 strings and bytes)
 *
 * ```ts import.meta.vitest
 * import { Base64 } from "effect/encoding"
 *
 * Base64.encode("hello") // => "aGVsbG8="
 *
 * const bytes = new Uint8Array([72, 101, 108, 108, 111])
 * Base64.encode(bytes) // => "SGVsbG8="
 * ```
 *
 * @see {@link decode} for decoding standard Base64 to bytes
 * @see {@link decodeString} for decoding standard Base64 to UTF-8 text
 *
 * @category encoding
 * @since 4.0.0
 */
export const encode: (input: Uint8Array | string) => string = (input) =>
  encodeBytes(typeof input === "string" ? encoder.encode(input) : input)

/**
 * Decodes a Base64 (RFC 4648) string into bytes safely.
 *
 * **When to use**
 *
 * Use to decode a standard padded Base64 string into bytes without throwing on
 * invalid input.
 *
 * **Details**
 *
 * Returns `Result.succeed` with a `Uint8Array` when decoding succeeds, or
 * `Result.fail` with an `EncodingError` when the input is not valid Base64.
 *
 * **Example** (Decoding Base64 bytes)
 *
 * ```ts import.meta.vitest
 * import { Result } from "effect"
 * import { Base64 } from "effect/encoding"
 *
 * Base64.decode("SGVsbG8=") // => Result.succeed(new Uint8Array([72, 101, 108, 108, 111]))
 * ```
 *
 * @category decoding
 * @since 4.0.0
 */
export const decode = (str: string): Result.Result<Uint8Array, EncodingError> => {
  const stripped = stripCrlf(str)
  const length = stripped.length
  if (length % 4 !== 0) {
    return Result.fail(
      new EncodingError({
        kind: "Decode",
        module: "Base64",
        input: stripped,
        message: `Length must be a multiple of 4, but is ${length}`
      })
    )
  }

  const index = stripped.indexOf("=")
  if (index !== -1 && ((index < length - 2) || (index === length - 2 && stripped[length - 1] !== "="))) {
    return Result.fail(
      new EncodingError({
        kind: "Decode",
        module: "Base64",
        input: stripped,
        message: "Found a '=' character, but it is not at the end"
      })
    )
  }

  try {
    const missingOctets = stripped.endsWith("==") ? 2 : stripped.endsWith("=") ? 1 : 0
    const result = new Uint8Array(3 * (length / 4) - missingOctets)
    for (let i = 0, j = 0; i < length; i += 4, j += 3) {
      const buffer = getCode(stripped.charCodeAt(i)) << 18 |
        getCode(stripped.charCodeAt(i + 1)) << 12 |
        getCode(stripped.charCodeAt(i + 2)) << 6 |
        getCode(stripped.charCodeAt(i + 3))
      result[j] = buffer >> 16
      result[j + 1] = (buffer >> 8) & 0xff
      result[j + 2] = buffer & 0xff
    }
    return Result.succeed(result)
  } catch (cause) {
    return Result.fail(
      new EncodingError({
        kind: "Decode",
        module: "Base64",
        input: stripped,
        message: cause instanceof Error ? cause.message : "Invalid input"
      })
    )
  }
}

/**
 * Decodes a Base64 (RFC 4648) string into UTF-8 text safely.
 *
 * **When to use**
 *
 * Use to decode a standard padded Base64 string into UTF-8 text without
 * throwing on invalid input.
 *
 * **Details**
 *
 * Returns `Result.succeed` with the decoded text when decoding succeeds, or
 * `Result.fail` with an `EncodingError` when the input is not valid Base64.
 *
 * **Example** (Decoding Base64 strings)
 *
 * ```ts import.meta.vitest
 * import { Result } from "effect"
 * import { Base64 } from "effect/encoding"
 *
 * Base64.decodeString("aGVsbG8=") // => Result.succeed("hello")
 * ```
 *
 * @category decoding
 * @since 4.0.0
 */
export const decodeString = (str: string) => Result.map(decode(str), (_) => decoder.decode(_))

const encodeBytes = (bytes: Uint8Array): string => {
  const length = bytes.length
  let result = ""
  let i: number
  for (i = 2; i < length; i += 3) {
    result += alphabet[bytes[i - 2] >> 2]
    result += alphabet[((bytes[i - 2] & 0x03) << 4) | (bytes[i - 1] >> 4)]
    result += alphabet[((bytes[i - 1] & 0x0f) << 2) | (bytes[i] >> 6)]
    result += alphabet[bytes[i] & 0x3f]
  }
  if (i === length + 1) {
    result += alphabet[bytes[i - 2] >> 2]
    result += alphabet[(bytes[i - 2] & 0x03) << 4]
    result += "=="
  }
  if (i === length) {
    result += alphabet[bytes[i - 2] >> 2]
    result += alphabet[((bytes[i - 2] & 0x03) << 4) | (bytes[i - 1] >> 4)]
    result += alphabet[(bytes[i - 1] & 0x0f) << 2]
    result += "="
  }
  return result
}

const encoder = new TextEncoder()
const decoder = new TextDecoder()
const stripCrlf = (str: string) => str.replace(/[\n\r]/g, "")
const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"
const codes = new Uint8Array(123).fill(255)
for (let i = 0; i < alphabet.length; i++) codes[alphabet.charCodeAt(i)] = i
codes["=".charCodeAt(0)] = 0

const getCode = (charCode: number): number => {
  if (charCode >= codes.length || codes[charCode] === 255) {
    throw new TypeError(`Invalid character ${String.fromCharCode(charCode)}`)
  }
  return codes[charCode]
}
