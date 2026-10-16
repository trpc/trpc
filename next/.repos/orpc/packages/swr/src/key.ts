import type { PartialDeep } from '@orpc/shared'

export interface OperationKeyPrefixOptions {
  /**
   * Prepended as the first element of the key when present.
   * Use this to avoid key conflicts when multiple router utils share the same client.
   */
  prefix?: string
}

export type OperationKeyOptions<TInput> = OperationKeyPrefixOptions & {
  input?: PartialDeep<TInput>
}

export type OperationKey<TInput>
  = | [path: string[], options: Omit<OperationKeyOptions<TInput>, 'prefix'>]
    | [prefix: string, path: string[], options: Omit<OperationKeyOptions<TInput>, 'prefix'>]

/**
 * Generate a **full matching** key for SWR operations.
 *
 * @see {@link https://orpc.dev/docs/integrations/swr#data-fetching | SWR Integration - Data Fetching}
 */
export function generateOperationKey<TInput>(
  path: string[],
  options: OperationKeyOptions<TInput> = {},
): OperationKey<TInput> {
  return [
    ...options.prefix !== undefined ? [options.prefix] : [],
    path,
    {
      ...options.input !== undefined ? { input: options.input } : {},
    },
  ] as OperationKey<TInput>
}
