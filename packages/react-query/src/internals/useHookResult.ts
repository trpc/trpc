import * as React from 'react';
import type { TRPCHookResult } from '../shared/hooks/types';

/**
 * Makes a stable reference of the `trpc` prop
 */
export function useHookResult(value: {
  path: string[];
}): TRPCHookResult['trpc'] {
  const path = value.path.join('.');
  return React.useMemo(
    () => ({
      path,
    }),
    [path],
  );
}
