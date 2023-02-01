import { Maybe } from '@trpc/server';
import { AbortControllerEsque } from './types';

export function getWindow() {
  if (typeof window !== 'undefined') {
    return window;
  }
  return globalThis;
}
export function getAbortController(
  ac: Maybe<AbortControllerEsque>,
): AbortControllerEsque | null {
  return ac ?? getWindow().AbortController ?? null;
}
