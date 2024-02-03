import * as React from 'react';
import type { TRPCHookResult } from '../shared/hooks/types';

/**
 * Makes a stable reference of the `trpc` prop
 */
export function useHookResult(value: {
  path: string[];
}): TRPCHookResult['trpc'] {
  return React.useMemo(
    () => ({
      path: value.path.join('.'),
    }),
    [value.path],
  );
}
