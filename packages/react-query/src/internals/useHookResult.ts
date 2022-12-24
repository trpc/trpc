import { useRef } from 'react';
import { TRPCHookResult } from '../shared/hooks/types';

/**
 * Makes a stable reference of the `trpc` prop
 */
export function useHookResult(
  value: TRPCHookResult['trpc'],
): TRPCHookResult['trpc'] {
  const ref = useRef(value);
  ref.current.path = value.path;
  return ref.current;
}
