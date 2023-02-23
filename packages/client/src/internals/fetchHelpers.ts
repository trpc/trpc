import { Maybe } from '@trpc/server';
import { AbortControllerEsque } from './types';

export function getWindow() {
  if (typeof globalThis !== 'undefined') {
    return globalThis; 
  }
  if (typeof window !== 'undefined') {
    return window;
  }
  throw new Error('Could not resolve "globalThis"');
}
export function getAbortController(
  ac: Maybe<AbortControllerEsque>,
): AbortControllerEsque | null {
  return ac ?? getWindow().AbortController ?? null;
}
