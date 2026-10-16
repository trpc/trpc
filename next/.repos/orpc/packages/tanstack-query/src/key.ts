import type { PartialDeep } from '@orpc/shared'
import type { SerializableStreamedQueryOptions } from './stream-query'
import type { OperationType } from './types'
import { skipToken } from '@tanstack/query-core'

export interface OperationKeyPrefixOptions {
  /**
   * Prepended as the first element of the key when present.
   * Use this to avoid key conflicts when multiple router utils share the same client.
   */
  prefix?: string
}

export type OperationKeyOptions<TType extends OperationType, TInput> = OperationKeyPrefixOptions & {
  type?: TType
  input?: TType extends 'mutation' ? never : PartialDeep<TInput>
  fnOptions?: TType extends 'streamed' ? SerializableStreamedQueryOptions : never
}

type OperationKeyContent<TType extends OperationType, TInput> = Omit<OperationKeyOptions<TType, TInput>, 'prefix'> & {
  /**
   * Set in place of `input` when the operation is disabled with `skipToken`,
   * because query key hashers drop symbols.
   */
  skipToken?: TType extends 'mutation' ? never : true
}

export type OperationKey<TType extends OperationType, TInput>
  = | [path: string[], options: OperationKeyContent<TType, TInput>]
    | [prefix: string, path: string[], options: OperationKeyContent<TType, TInput>]

export function generateOperationKey<TType extends OperationType, TInput>(
  path: string[],
  options: OperationKeyOptions<TType, TInput> = {},
): OperationKey<TType, TInput> {
  return [
    ...options.prefix !== undefined ? [options.prefix] : [],
    path,
    {
      ...options.input === skipToken
        ? { skipToken: true }
        : options.input !== undefined ? { input: options.input } : {},
      ...options.type !== undefined ? { type: options.type } : {},
      ...options.fnOptions !== undefined ? { fnOptions: options.fnOptions } : {},
    },
  ] as OperationKey<TType, TInput>
}
