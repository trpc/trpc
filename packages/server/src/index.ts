// FIXME: this file should only export
// - `initTRPC`
// - `TRPCError`
// - (maybe something else?)

export * from './transformer';
export * from './error/TRPCError';
export * from './core';
export { type DefaultErrorShape } from './error/formatter';
export type { RootConfig, AnyRootConfig } from './core/internals/config';

/**
 * ⚠️ ⚠️ ⚠️ Danger zone ⚠️ ⚠️ ⚠️
 * @remark
 * Do not use things from this export as they are subject to change without notice. They only exists to support `.d.ts`-files
 * If you need something from here, please open an issue and we'll see if we can expose it in a stable way.
 * @deprecated
 */
export * as unstableExternalsExport from './unstableInternalsExport';

export type {
  /**
   * @deprecated
   * Use `Awaited<ReturnType<T>>` instead
   */
  inferAsyncReturnType,
} from './types';
