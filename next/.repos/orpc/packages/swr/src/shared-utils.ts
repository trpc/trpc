import type { MaybeOptionalOptions, PartialDeep } from '@orpc/shared'
import type { OperationKeyPrefixOptions } from './key'
import type { Matcher, MatcherOptions, MatcherStrategy } from './types'
import { resolveMaybeOptionalOptions } from '@orpc/shared'
import { generateOperationKey } from './key'
import { isSubsetOf } from './utils'

export class SharedUtils<TInput> {
  constructor(
    protected readonly path: string[],
    protected readonly options: OperationKeyPrefixOptions,
  ) {}

  /**
   * Generate a matcher function that returns `true` if the key matches the specified conditions.
   *
   * @see {@link https://orpc.dev/docs/integrations/swr#manual-revalidation | SWR Integration - Manual Revalidation}
   */
  matcher<TStrategy extends MatcherStrategy>(
    ...rest: MaybeOptionalOptions<MatcherOptions<TStrategy, TInput>>
  ): Matcher {
    const { input, strategy = 'partial' } = resolveMaybeOptionalOptions(rest)

    const expectedKey = generateOperationKey(this.path, { prefix: this.options.prefix, input: input as PartialDeep<TInput> })

    return (key) => {
      if (!isSubsetOf(expectedKey, key)) {
        return false
      }

      if (strategy === 'exact' && !isSubsetOf(key, expectedKey)) {
        return false
      }

      return true
    }
  }
}
