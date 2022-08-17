export function getWindow() {
  if (typeof window !== 'undefined') {
    return window;
  }
  return global;
}
export function getAbortController(
  ac?: typeof AbortController,
): typeof AbortController | undefined {
  const win = getWindow();
  return ac ?? win.AbortController ?? undefined;
}
