/**
 * Shared error type for encoding and decoding operations.
 *
 * @since 4.0.0
 */
import * as Data from "../Data.ts"
import { hasProperty } from "../Predicate.ts"

/**
 * Type identifier stored on `EncodingError` values and used by
 * `isEncodingError`.
 *
 * **When to use**
 *
 * Use when implementing low-level `EncodingError`-compatible values that need
 * to carry the runtime marker.
 *
 * **Details**
 *
 * This marker is part of the runtime representation of `EncodingError`. Prefer
 * `isEncodingError` when narrowing unknown values.
 *
 * @see {@link isEncodingError} for the public guard that checks this marker
 *
 * @category type IDs
 * @since 4.0.0
 */
export const EncodingErrorTypeId = "~effect/encoding/EncodingError" as const

/**
 * Literal type of the `EncodingErrorTypeId` marker.
 *
 * **When to use**
 *
 * Use to type the marker carried by `EncodingError` values.
 *
 * @category type IDs
 * @since 4.0.0
 */
export type EncodingErrorTypeId = typeof EncodingErrorTypeId

/**
 * Error returned when an encoding or decoding operation cannot process its input.
 *
 * **When to use**
 *
 * Use when you need to handle or inspect failures from encoding or decoding
 * operations.
 *
 * **Details**
 *
 * The error records whether the failure happened during encoding or decoding,
 * which encoding module reported it, the original input, and a human-readable
 * message.
 *
 * @see {@link isEncodingError} for checking whether a value is an EncodingError
 *
 * @category errors
 * @since 4.0.0
 */
export class EncodingError extends Data.TaggedError("EncodingError")<{
  kind: "Decode" | "Encode"
  module: string
  input: unknown
  message: string
}> {
  /**
   * Marks this value as an encoding or decoding error for runtime guards.
   *
   * **When to use**
   *
   * Use to identify `EncodingError` instances through `isEncodingError`.
   *
   * @since 4.0.0
   */
  readonly [EncodingErrorTypeId]: EncodingErrorTypeId = EncodingErrorTypeId
}

/**
 * Checks whether a value is an `EncodingError`.
 *
 * **When to use**
 *
 * Use to narrow an unknown value before handling it as an `EncodingError` from
 * encoding or decoding code.
 *
 * **Details**
 *
 * Returns `true` when the value carries the `EncodingErrorTypeId` marker and
 * narrows the value to `EncodingError`.
 *
 * @see {@link EncodingError} for the structured error produced by failed
 * encoding and decoding operations
 *
 * @category guards
 * @since 4.0.0
 */
export const isEncodingError = (u: unknown): u is EncodingError => hasProperty(u, EncodingErrorTypeId)
