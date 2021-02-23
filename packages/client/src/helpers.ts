import type { Maybe } from '@trpc/server';

function getWindow() {
  if (typeof window !== 'undefined') {
    return window;
  }
  return global;
}
export function getAbortController(
  ac?: typeof AbortController,
): Maybe<typeof AbortController> {
  const win = getWindow();
  return ac || win.AbortController || null;
}
export function getFetch(f?: typeof fetch): typeof fetch {
  if (f) {
    return f;
  }
  const win = getWindow();
  if (win.fetch) {
    return win.fetch;
  }

  throw new Error('No fetch implementation found');
}
