import * as React from 'react';

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
  const ref = React.useRef(value);
  ref.current.path = value.path;
  return ref.current;
}
