import * as React from 'react';
import type { TRPCQueryOptionsResult } from '../shared';
import type { TRPCHookResult } from '../shared/hooks/types';

export function createTRPCOptionsResult(value: {
  path: readonly string[];
}): TRPCQueryOptionsResult['trpc'] {
  const path = value.path.join('.');

  return {
    path,
  };
}

/**
 * Makes a stable reference of the `trpc` prop
 */
export function useHookResult(value: {
  path: readonly string[];
}): TRPCHookResult['trpc'] {
  const result = createTRPCOptionsResult(value);
  return React.useMemo(() => result, [result]);
}
