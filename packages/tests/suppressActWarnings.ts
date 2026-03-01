/* eslint-disable no-console */

// Restore native AbortController, AbortSignal, and FormData after jsdom replaces them.
// In Node.js 24, the built-in fetch (undici v7) validates that AbortSignal instances
// are native, and only recognizes native FormData for multipart/form-data encoding.
// jsdom replaces these globals with its own versions that are incompatible with
// Node.js 24's native fetch. We preload scripts/saveNativeAbortController.cjs (via
// --require) to capture native references before jsdom runs, and restore them here.
{
  const g = globalThis as any;
  if (g.__nativeAbortController) g.AbortController = g.__nativeAbortController;
  if (g.__nativeAbortSignal) g.AbortSignal = g.__nativeAbortSignal;
  if (g.__nativeFormData) g.FormData = g.__nativeFormData;
}

// Suppress React act() warnings
const originalError = console.error;

console.error = (...args) => {
  const message = args[0];
  if (
    typeof message === 'string' &&
    message.includes('was not wrapped in act(...)') &&
    process.env['MUTE_REACT_ACT_WARNINGS']
  ) {
    return;
  }
  originalError.apply(console, args);
};
