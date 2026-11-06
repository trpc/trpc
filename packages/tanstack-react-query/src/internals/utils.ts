import { isFunction } from '@trpc/server/unstable-core-do-not-import';
import type { AnyTRPCMutationKey, TRPCMutationKeyWithoutPrefix } from './types';

export { createTRPCOptionsResult, getClientArgs } from '../shared/queryFn';
export { getQueryKeyInternal, readQueryKey } from '../shared/queryKey';

/**
 * @internal
 */
export function getMutationKeyInternal(opts: {
  prefix: string | undefined;
  path: string[];
}): AnyTRPCMutationKey {
  // some parts of the path may be dot-separated, split them up
  const key: TRPCMutationKeyWithoutPrefix = [
    opts.path.flatMap((part) => part.split('.')),
  ];

  if (opts.prefix) {
    key.unshift([opts.prefix]);
  }
  return key;
}

/**
 * @internal
 */
export function unwrapLazyArg<T>(valueOrLazy: T | (() => T)): T {
  return (isFunction(valueOrLazy) ? valueOrLazy() : valueOrLazy) as T;
}
