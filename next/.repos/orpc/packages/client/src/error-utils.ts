import type { Writable } from '@orpc/shared'
import type { AnyORPCError, ORPCErrorCode, ORPCErrorJSON } from './error'
import { isPlainObject } from '@orpc/shared'
import { ORPCError } from './error'

/**
 * Checks if an error is an `ORPCError` that matches a definition in the procedure's `.errors` map,
 * narrowing it so `code` and `data` are fully typed.
 *
 * @see {@link https://orpc.dev/docs/client/error-handling#using-safe-and-isdefinederror | Client Error Handling - Using safe and isDefinedError}
 */
export function isDefinedError<T>(error: T): error is Extract<T, AnyORPCError> {
  return error instanceof ORPCError && error.defined
}

export function toORPCError<T>(error: T): Extract<T, AnyORPCError> | ORPCError<'INTERNAL_SERVER_ERROR', undefined> {
  return error instanceof ORPCError
    ? error
    : new ORPCError('INTERNAL_SERVER_ERROR', { cause: error })
}

export function isORPCErrorJson(json: unknown): json is ORPCErrorJSON<ORPCErrorCode, unknown> {
  if (!isPlainObject(json)) {
    return false
  }

  const validKeys = ['defined', 'code', 'message', 'data']
  if (Object.keys(json).some(k => !validKeys.includes(k))) {
    return false
  }

  return 'defined' in json
    && typeof json.defined === 'boolean'
    && 'code' in json
    && typeof json.code === 'string'
    && 'message' in json
    && typeof json.message === 'string'
}

export function createORPCErrorFromJson<TCode extends ORPCErrorCode, TData>(
  json: ORPCErrorJSON<TCode, TData>,
  options: ErrorOptions = {},
): ORPCError <TCode, TData> {
  const error = new ORPCError(json.code, {
    ...json,
    ...options,
  })

  ;(error.defined as Writable<typeof error.defined>) = json.defined

  return error
}

/**
 * Clones an `ORPCError` while preserving its prototype chain, so instances of
 * `ORPCError` subclasses remain `instanceof` their class.
 *
 * Limitation: subclass constructors are not re-run, so private fields
 * (`#field`) are not carried over and subclass members that read them
 * will throw on the clone.
 */
export function cloneORPCError<T extends AnyORPCError>(error: T): T {
  const cloned = new ORPCError(error.code, {
    message: error.message,
    data: error.data,
    cause: error.cause,
  })

  Object.setPrototypeOf(cloned, Object.getPrototypeOf(error))
  Object.defineProperties(cloned, Object.getOwnPropertyDescriptors(error))
  cloned.stack = error.stack

  return cloned as T
}
