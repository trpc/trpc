import { isFunction } from '@trpc/server/unstable-core-do-not-import';

export { createTRPCOptionsResult, getClientArgs } from '../shared/queryFn';
export { getMutationKeyInternal } from '../shared/mutationKey';
export { getQueryKeyInternal, readQueryKey } from '../shared/queryKey';

/**
 * @internal
 */
export function unwrapLazyArg<T>(valueOrLazy: T | (() => T)): T {
  return (isFunction(valueOrLazy) ? valueOrLazy() : valueOrLazy) as T;
}
