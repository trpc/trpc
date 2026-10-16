/**
 * Utility for safely manipulating `Error.stackTraceLimit` in environments
 * where intrinsics may be frozen (e.g., SES / hardened JavaScript or
 * deterministic sandboxes such as Temporal). When the property is non-writable,
 * mutating it throws, so all manipulation here degrades to a best-effort,
 * silent no-op.
 *
 * Mirrors the guard Node uses internally:
 * https://github.com/nodejs/node/blob/e77694631f1642c302f664703197b5aabc65b482/lib/internal/errors.js#L246
 *
 * The error is constructed inline at each call site (rather than inside a
 * closure here) so the captured stack trace keeps pointing at the real caller
 * instead of this module.
 *
 * @internal
 */
import type { ErrorWithStackTraceLimit } from "./tracer.ts"

/**
 * Check if `Error.stackTraceLimit` is writable.
 * Returns `false` if the property is frozen, non-writable, or `Error` is non-extensible.
 *
 * @internal
 */
export const isStackTraceLimitWritable = (): boolean => {
  const desc = Object.getOwnPropertyDescriptor(Error, "stackTraceLimit")
  if (desc === undefined) {
    return Object.isExtensible(Error)
  }

  return Object.hasOwn(desc, "writable")
    ? desc.writable === true
    : desc.set !== undefined
}

// Cache the check result since it won't change during runtime
const canWriteStackTraceLimit = isStackTraceLimitWritable()

/**
 * Get the current `Error.stackTraceLimit` value.
 * Returns `undefined` if the property doesn't exist.
 *
 * @internal
 */
export const getStackTraceLimit = (): number | undefined => (Error as ErrorWithStackTraceLimit).stackTraceLimit

/**
 * Safely set `Error.stackTraceLimit` if possible, otherwise no-op.
 *
 * Accepts `undefined` so a value read via {@link getStackTraceLimit} can be
 * restored faithfully.
 *
 * @internal
 */
export const setStackTraceLimit = (value: number | undefined): void => {
  if (canWriteStackTraceLimit) {
    ;(Error as ErrorWithStackTraceLimit).stackTraceLimit = value
  }
}
