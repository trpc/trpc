/**
 * Low-level byte search used by the multipart parser.
 *
 * @stability unstable
 * @since 4.0.0
 */
import * as internal from "./internal/search.ts"

/**
 * Creates an incremental byte search for a string boundary.
 *
 * @stability unstable
 * @category constructors
 * @since 4.0.0
 */
export const make: (
  needle: string,
  callback: (index: number, chunk: Uint8Array) => void
) => { readonly write: (chunk: Uint8Array) => void; readonly end: () => void } = internal.make
