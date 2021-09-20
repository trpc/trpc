export function getWindow() {
  if (typeof window !== 'undefined') {
    return window;
  }
  return global;
}
export function getAbortController(
  ac?: typeof AbortController,
): typeof AbortController | null {
  const win = getWindow();
  return ac || win.AbortController || null;
}
