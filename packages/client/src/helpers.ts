import type { Maybe } from '@trpc/server';

export function getAbortController(
  ac?: typeof AbortController,
): Maybe<typeof AbortController> {
  if (ac) {
    return ac;
  }
  if (typeof window !== 'undefined' && window.AbortController) {
    return window.AbortController;
  }
  if (typeof global !== 'undefined' && global.AbortController) {
    return global.AbortController;
  }
  return null;
}
export function getFetch(f?: typeof fetch): typeof fetch {
  if (f) {
    return f;
  }
  if (typeof window !== 'undefined' && window.fetch) {
    return window.fetch;
  }
  if (typeof global !== 'undefined' && global.fetch) {
    return global.fetch;
  }

  throw new Error('No fetch implementation found');
}
