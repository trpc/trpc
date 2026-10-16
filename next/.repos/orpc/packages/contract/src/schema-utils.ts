import type { IsEqual, Promisable } from '@orpc/shared'
import type { Schema, SchemaIssue } from './schema'
import { isPropertyKey, isTypescriptObject, ORPC_NAME } from '@orpc/shared'

export type TypeRest<TInput, TOutput>
  = | [map: (input: TInput) => Promisable<TOutput>]
    | (IsEqual<TInput, TOutput> extends true ? [] : never)

/**
 * Create a schema for things can be trust without validation.
 * You can optionally pass a map function for mapping
 *
 * @example
 * ```ts
 * const normal = type<number>()
 * const withMap = type<number, string>(input => input.toString())
 *```
 *
 * @see {@link https://orpc.dev/docs/procedure#type-utility | Procedure - type Utility}
 */
export function type<TInput, TOutput = TInput>(
  ...[map]: TypeRest<TInput, TOutput>
): Schema<TInput, TOutput> {
  return {
    '~standard': {
      vendor: ORPC_NAME,
      version: 1,
      async validate(value) {
        if (map) {
          return { value: await map(value as TInput) as TOutput }
        }

        return { value: value as TOutput }
      },
    },
  }
}

/**
 * Check if the given issue is following the standard-schema issue format.
 */
export function isSchemaIssue(issue: unknown): issue is SchemaIssue {
  if (!isTypescriptObject(issue) || typeof issue.message !== 'string') {
    return false
  }

  if (issue.path !== undefined) {
    if (!Array.isArray(issue.path)) {
      return false
    }

    if (
      !issue.path.every(segment => isPropertyKey(segment) || (isTypescriptObject(segment) && isPropertyKey(segment.key)))
    ) {
      return false
    }
  }

  return true
}
