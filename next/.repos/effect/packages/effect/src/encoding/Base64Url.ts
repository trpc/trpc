/**
 * URL-safe Base64 encoding and decoding helpers.
 *
 * @stability stable
 * @since 4.0.0
 */
import * as Result from "../Result.ts"
import * as Base64 from "./Base64.ts"
import { EncodingError } from "./EncodingError.ts"

/**
 * Encodes the given value into an unpadded URL-safe Base64 string.
 *
 * **When to use**
 *
 * Use to encode text or bytes in contexts that require the URL-safe alphabet.
 *
 * **Details**
 *
 * String inputs are encoded as UTF-8 bytes before Base64Url encoding.
 * `Uint8Array` inputs are encoded directly. The output removes `=` padding
 * and replaces `+` with `-` and `/` with `_`.
 *
 * **Example** (Encoding URL-safe Base64)
 *
 * ```ts import.meta.vitest
 * import { Base64Url } from "effect/encoding"
 *
 * Base64Url.encode("hello?") // => "aGVsbG8_"
 *
 * const bytes = new Uint8Array([72, 101, 108, 108, 111, 63])
 * Base64Url.encode(bytes) // => "SGVsbG8_"
 * ```
 *
 * @see {@link encodePadded} for output that keeps `=` padding
 * @see {@link decode} for decoding URL-safe Base64 to bytes
 * @see {@link decodeString} for decoding URL-safe Base64 to UTF-8 text
 *
 * @stability stable
 * @category encoding
 * @since 4.0.0
 */
export const encode: (input: Uint8Array | string) => string = (input) =>
  Base64.encode(input).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_")

/**
 * Encodes the given value into a padded URL-safe Base64 string.
 *
 * **When to use**
 *
 * Use when a consumer requires `=` padding on URL-safe Base64, such as Go's
 * `base64.URLEncoding`.
 *
 * **Details**
 *
 * Same as {@link encode}, but keeps the `=` padding. {@link decode} accepts
 * both forms.
 *
 * **Example** (Encoding padded URL-safe Base64)
 *
 * ```ts import.meta.vitest
 * import { Base64Url } from "effect/encoding"
 *
 * Base64Url.encodePadded("fo") // => "Zm8="
 * ```
 *
 * @see {@link encode} for unpadded output
 *
 * @stability stable
 * @category encoding
 * @since 4.0.6
 */
export const encodePadded: (input: Uint8Array | string) => string = (input) =>
  Base64.encode(input).replace(/\+/g, "-").replace(/\//g, "_")

/**
 * Decodes a padded or unpadded URL-safe Base64 string into bytes safely.
 *
 * **When to use**
 *
 * Use to decode Base64Url text into bytes without throwing on invalid input.
 *
 * **Details**
 *
 * Returns `Result.succeed` with a `Uint8Array` when decoding succeeds, or
 * `Result.fail` with an `EncodingError` when the input is not valid
 * Base64Url. Both padded and unpadded forms are accepted when otherwise valid.
 *
 * **Example** (Decoding URL-safe Base64 bytes)
 *
 * ```ts import.meta.vitest
 * import { Result } from "effect"
 * import { Base64Url } from "effect/encoding"
 *
 * Base64Url.decode("SGVsbG8_") // => Result.succeed(new Uint8Array([72, 101, 108, 108, 111, 63]))
 * ```
 *
 * @stability stable
 * @category decoding
 * @since 4.0.0
 */
export const decode = (str: string): Result.Result<Uint8Array, EncodingError> => {
  const stripped = str.replace(/[\n\r]/g, "")
  const length = stripped.length
  const padded = stripped.endsWith("=")
  if (padded ? length % 4 !== 0 : length % 4 === 1) {
    return Result.fail(
      new EncodingError({
        module: "Base64Url",
        kind: "Decode",
        input: stripped,
        message: padded
          ? `Padded length should be a multiple of 4, but is ${length}`
          : `Unpadded length should not be 1 more than a multiple of 4, but is ${length}`
      })
    )
  }
  // Validating up front keeps failures as cheap as the scan, without allocating the output.
  if (!/^[-_A-Z0-9]*?={0,2}$/i.test(stripped)) {
    return Result.fail(
      new EncodingError({
        module: "Base64Url",
        kind: "Decode",
        input: stripped,
        message: "Invalid input"
      })
    )
  }
  const end = !padded ? length : stripped.charCodeAt(length - 2) === 61 ? length - 2 : length - 1
  const fullEnd = end & ~3
  // Not `(end * 3) >> 2`: engines that allow strings over 2^31 / 3 characters would overflow int32.
  const result = new Uint8Array(Math.floor(end * 3 / 4))
  let j = 0
  for (let i = 0; i < fullEnd; i += 4) {
    const a = codes[stripped.charCodeAt(i)]
    const b = codes[stripped.charCodeAt(i + 1)]
    const c = codes[stripped.charCodeAt(i + 2)]
    const d = codes[stripped.charCodeAt(i + 3)]
    result[j++] = (a << 2) | (b >> 4)
    result[j++] = (b << 4) | (c >> 2)
    result[j++] = (c << 6) | d
  }
  // Non-zero trailing bits in the final character are ignored.
  if (end > fullEnd) {
    const a = codes[stripped.charCodeAt(fullEnd)]
    const b = codes[stripped.charCodeAt(fullEnd + 1)]
    result[j++] = (a << 2) | (b >> 4)
    if (end - fullEnd === 3) result[j] = (b << 4) | (codes[stripped.charCodeAt(fullEnd + 2)] >> 2)
  }
  return Result.succeed(result)
}

const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_"
const codes = new Uint8Array(128)
for (let i = 0; i < alphabet.length; i++) codes[alphabet.charCodeAt(i)] = i

/**
 * Decodes a padded or unpadded URL-safe Base64 string into UTF-8 text safely.
 *
 * **When to use**
 *
 * Use to decode Base64Url text into UTF-8 text without throwing on invalid
 * input.
 *
 * **Details**
 *
 * Returns `Result.succeed` with the decoded text when decoding succeeds, or
 * `Result.fail` with an `EncodingError` when the input is not valid
 * Base64Url.
 *
 * **Example** (Decoding URL-safe Base64 strings)
 *
 * ```ts import.meta.vitest
 * import { Result } from "effect"
 * import { Base64Url } from "effect/encoding"
 *
 * Base64Url.decodeString("aGVsbG8_") // => Result.succeed("hello?")
 * ```
 *
 * @stability stable
 * @category decoding
 * @since 4.0.0
 */
export const decodeString = (str: string) => Result.map(decode(str), (_) => decoder.decode(_))

const decoder = new TextDecoder()
