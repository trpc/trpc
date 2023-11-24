// FIXME: this file should only export
// - `initTRPC`
// - `TRPCError`
// - (maybe something else?)

// export * from './transformer';
export { TRPCError } from './error/TRPCError';
export {
  initTRPC,
  experimental_standaloneMiddleware,
  inferRouterInputs,
  inferRouterOutputs,
} from './core';
export type { RootConfig, AnyRootConfig } from './core/internals/config';

export type {
  /**
   * @deprecated
   * Use `Awaited<ReturnType<T>>` instead
   */
  inferAsyncReturnType,
} from './types';
