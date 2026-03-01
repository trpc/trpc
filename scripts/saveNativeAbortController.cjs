'use strict';
/**
 * This file is preloaded via --require in vitest's poolOptions.forks.execArgv
 * and poolOptions.threads.execArgv before vitest's environment (jsdom) sets up.
 *
 * jsdom replaces globalThis.AbortController / AbortSignal / FormData with its
 * own implementations, but Node.js 24's built-in fetch (undici v7) validates
 * these against the native classes captured at initialization time. This causes
 * fetch calls in jsdom tests to fail:
 *   - AbortSignal: "Expected signal to be an instance of AbortSignal"
 *   - FormData: body converted to text/plain instead of multipart/form-data
 *
 * By capturing the native versions here (before jsdom runs), and then
 * restoring them in the vitest setup file (suppressActWarnings.ts), we ensure
 * that tRPC client code always uses the native globals compatible with Node.js
 * 24's fetch.
 */
global.__nativeAbortController = global.AbortController;
global.__nativeAbortSignal = global.AbortSignal;
global.__nativeFormData = global.FormData;
