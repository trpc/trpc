/**
 * URL-safe Base64 encoding and decoding helpers.
 *
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
 * @see {@link decode} for decoding URL-safe Base64 to bytes
 * @see {@link decodeString} for decoding URL-safe Base64 to UTF-8 text
 *
 * @category encoding
 * @since 4.0.0
 */
export const encode: (input: Uint8Array | string) => string = (input) =>
  Base64.encode(input).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_")

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
 * @category decoding
 * @since 4.0.0
 */
export const decode = (str: string): Result.Result<Uint8Array, EncodingError> => {
  const stripped = str.replace(/[\n\r]/g, "")
  const length = stripped.length
  if (length % 4 === 1) {
    return Result.fail(
      new EncodingError({
        module: "Base64Url",
        kind: "Decode",
        input: stripped,
        message: `Length should be a multiple of 4, but is ${length}`
      })
    )
  }
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
  let sanitized = length % 4 === 2 ? `${stripped}==` : length % 4 === 3 ? `${stripped}=` : stripped
  sanitized = sanitized.replace(/-/g, "+").replace(/_/g, "/")
  return Base64.decode(sanitized)
}

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
 * @category decoding
 * @since 4.0.0
 */
export const decodeString = (str: string) => Result.map(decode(str), (_) => decoder.decode(_))

const decoder = new TextDecoder()
