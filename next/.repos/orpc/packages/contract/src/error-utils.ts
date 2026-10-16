import type { AnyORPCError } from '@orpc/client'
import type { Writable } from '@orpc/shared'
import type { ErrorMap } from './error'
import { cloneORPCError } from '@orpc/client'
import { getOwn } from '@orpc/shared'

export type MergedErrorMap<T1 extends ErrorMap, T2 extends ErrorMap>
  = keyof T1 extends never | keyof T2
    ? T2
    : Omit<T1, keyof T2> & T2

export function mergeErrorMap<T1 extends ErrorMap = object, T2 extends ErrorMap = object>(errorMap1: T1 | undefined, errorMap2: T2 | undefined): MergedErrorMap<T1, T2> {
  return { ...errorMap1, ...errorMap2 } as any
}

export async function reconcileORPCError(
  map: ErrorMap,
  error: AnyORPCError,
): Promise<AnyORPCError> {
  const config = getOwn(map, error.code)

  if (!config) {
    if (!error.defined) {
      return error
    }

    const cloned = cloneORPCError(error)

    ;(cloned.defined as Writable<typeof cloned.defined>) = false

    return cloned
  }

  if (!config.data) {
    if (error.defined) {
      return error
    }

    const cloned = cloneORPCError(error)

    ;(cloned.defined as Writable<typeof cloned.defined>) = true

    return cloned
  }

  const validated = await config.data['~standard'].validate(error.data)

  if (validated.issues) {
    if (!error.defined) {
      return error
    }

    const cloned = cloneORPCError(error)

    ;(cloned.defined as Writable<typeof cloned.defined>) = false

    return cloned
  }

  if (error.data === validated.value && error.defined) {
    return error
  }

  const cloned = cloneORPCError(error)

  cloned.data = validated.value
  ;(cloned.defined as Writable<typeof cloned.defined>) = true

  return cloned
}
