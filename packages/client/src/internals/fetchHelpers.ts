export function getWindow() {
  if (typeof window !== 'undefined') {
    return window;
  }
  if (typeof global !== 'undefined') {
    return global;
  }
  if (typeof globalThis !== 'undefined') {
    return globalThis;
  }
  return undefined;
}
export function getAbortController(
  ac?: typeof AbortController,
): typeof AbortController | undefined {
  const win = getWindow();
  return ac ?? win?.AbortController ?? undefined;
}
