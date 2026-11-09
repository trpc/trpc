/**
 * Low-level parser for multipart header blocks.
 *
 * @stability unstable
 * @since 4.0.0
 */
import * as internal from "./internal/headers.ts"

/**
 * The reason a multipart header block could not be parsed.
 *
 * @stability unstable
 * @category errors
 * @since 4.0.0
 */
export type FailureReason =
  | "TooManyHeaders"
  | "HeaderTooLarge"
  | "InvalidHeaderName"
  | "InvalidHeaderValue"

/**
 * Indicates that the parser needs more input.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface Continue {
  readonly _tag: "Continue"
}

/**
 * A multipart header parsing failure.
 *
 * @stability unstable
 * @category errors
 * @since 4.0.0
 */
export interface Failure {
  readonly _tag: "Failure"
  readonly reason: FailureReason
  readonly headers: Record<string, string | Array<string>>
}

/**
 * A successfully parsed multipart header block.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export interface Headers {
  readonly _tag: "Headers"
  readonly headers: Record<string, string | Array<string>>
  readonly endPosition: number
}

/**
 * The result of parsing a multipart header block.
 *
 * @stability unstable
 * @category models
 * @since 4.0.0
 */
export type ReturnValue = Continue | Failure | Headers

/**
 * Creates an incremental multipart header parser.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const make: () => (chunk: Uint8Array, start: number) => ReturnValue = internal.make
