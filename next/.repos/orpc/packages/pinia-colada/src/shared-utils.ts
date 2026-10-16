import type { OperationKey, OperationKeyOptions, OperationKeyPrefixOptions } from './key'
import type { OperationType } from './types'
import { generateOperationKey } from './key'

export class SharedUtils<TInput> {
  constructor(
    protected readonly path: string[],
    protected readonly options: OperationKeyPrefixOptions,
  ) {}

  /**
   * Generate a **partial matching** key for actions like revalidating queries, checking mutation status, etc.
   *
   * @see {@link https://orpc.dev/docs/integrations/pinia-colada#querymutation-key | Pinia Colada Integration - Query/Mutation Key}
   */
  key<TType extends OperationType>(options: Omit<OperationKeyOptions<TType, TInput>, 'prefix'> = {}): OperationKey<TType, TInput> {
    return generateOperationKey(this.path, { ...options, prefix: this.options.prefix })
  }
}
