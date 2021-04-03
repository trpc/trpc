import { useRef } from 'react';

/**
 * Takes a function that returns an instance which is stored as a ref exactly once
 */
export function useInstance<T>(obj: () => T): T {
  const ref = useRef<T>();
  if (!ref.current) {
    ref.current = obj();
  }
  return ref.current;
}
