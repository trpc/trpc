export function getWindow() {
  if (typeof window !== 'undefined') {
    return window;
  }
  return globalThis;
}
export function getAbortController(
  ac?: typeof AbortController,
): typeof AbortController | undefined {
  return ac ?? getWindow().AbortController ?? undefined;
}
