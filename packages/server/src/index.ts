// FIXME: this file should only export
// - `initTRPC`
// - `TRPCError`
// - (maybe something else?)

export * from './transformer';
export * from './error/TRPCError';
export * from './core';
export { type DefaultErrorShape } from './error/formatter';
export type { RootConfig, AnyRootConfig } from './core/internals/config';

export type {
  /**
   * @deprecated
   * Use `Awaited<ReturnType<T>>` instead
   */
  inferAsyncReturnType,
} from './types';
