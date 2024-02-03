import { useMemo } from 'react';

export interface TRPCHookResult {
  trpc: {
    path: string;
  };
}

/**
 * Makes a stable reference of the `trpc` prop
 */
export function useHookResult(
  value: TRPCHookResult['trpc'],
): TRPCHookResult['trpc'] {
  const { path } = value;
  return useMemo(() => ({ path }), [path]);
}
