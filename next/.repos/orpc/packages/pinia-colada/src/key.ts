import type { PartialDeep } from '@orpc/shared'
import type { EntryKey } from '@pinia/colada'
import type { SerializableStreamedQueryOptions } from './stream-query'
import type { OperationType } from './types'
import { RPCJsonSerializer } from '@orpc/client'

export interface OperationKeyPrefixOptions {
  /**
   * Prepended as the first element of the key when present.
   * Use this to avoid key conflicts when multiple router utils share the same client.
   */
  prefix?: string
}

export type OperationKeyOptions<TType extends OperationType, TInput> = OperationKeyPrefixOptions & {
  type?: TType
  input?: PartialDeep<TInput>
  fnOptions?: TType extends 'streamed' ? SerializableStreamedQueryOptions : never
}

export type OperationKey<TType extends OperationType, TInput>
  = EntryKey & (
    | [path: string[], options: Omit<OperationKeyOptions<TType, TInput>, 'prefix'>]
    | [prefix: string, path: string[], options: Omit<OperationKeyOptions<TType, TInput>, 'prefix'>]
  )

const serializer = new RPCJsonSerializer()

/**
 * Generate a Pinia Colada entry key for a procedure.
 *
 * The input is serialized to JSON-compatible values because Pinia Colada
 * requires entry keys to be serializable.
 *
 * @see {@link https://orpc.dev/docs/integrations/pinia-colada#querymutation-key | Pinia Colada Integration - Query/Mutation Key}
 */
export function generateOperationKey<TType extends OperationType, TInput>(
  path: string[],
  options: OperationKeyOptions<TType, TInput> = {},
): OperationKey<TType, TInput> {
  return [
    ...options.prefix !== undefined ? [options.prefix] : [],
    path,
    {
      ...options.input !== undefined ? { input: serializer.serialize(options.input).json } : {},
      ...options.type !== undefined ? { type: options.type } : {},
      ...options.fnOptions !== undefined ? { fnOptions: options.fnOptions } : {},
    },
  ] as OperationKey<TType, TInput>
}
