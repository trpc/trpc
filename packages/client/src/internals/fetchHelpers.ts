import { Maybe } from '@trpc/server';

export function getWindow() {
  if (typeof window !== 'undefined') {
    return window;
  }
  return globalThis;
}
export function getAbortController(
  ac: Maybe<typeof AbortController>,
): typeof AbortController | null {
  return ac ?? getWindow().AbortController ?? null;
}
