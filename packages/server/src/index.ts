export * from './transformer';
export * from './error/TRPCError';
export * from './types';
export * from './core';
export { type DefaultErrorShape } from './error/formatter';
export type { RootConfig, AnyRootConfig } from './core/internals/config';

/**
 * ⚠️ ⚠️ ⚠️ Danger zone ⚠️ ⚠️ ⚠️
 * @remark
 * Do not use things from this export as they are subject to change without notice.
 * They only exist to support emits
 * @deprecated
 */
export * as unstableExternalsExport from './unstableInternalsExport';
