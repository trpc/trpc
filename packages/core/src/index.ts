/**
 * @remark Do not `import` anything from `@trpc/core` it will be unreliable between minor versions of tRPC
 */

export * from './transformer';
export * from './error/TRPCError';
export * from './error/utils';
export type {
  AnyRouter,
  ProcedureRecord,
  ProcedureRouterRecord,
  CreateRouterInner,
  Router,
  RouterCaller,
  AnyRouterDef,
} from './router';
export { callProcedure, createCallerFactory } from './router';
export type {
  Procedure,
  AnyProcedure,
  AnyQueryProcedure,
  AnyMutationProcedure,
  AnySubscriptionProcedure,
  ProcedureArgs,
  ProcedureOptions,
} from './procedure';
export type { inferParser } from './parser';
export {
  createInputMiddleware,
  createOutputMiddleware,
  experimental_standaloneMiddleware,
} from './middleware';
export type { MiddlewareFunction, MiddlewareBuilder } from './middleware';
export { initTRPC } from './initTRPC';
export * from './types';
export { type DefaultErrorShape } from './error/formatter';
export type { RootConfig, AnyRootConfig } from './internals/config';
export * from './transformer';

export type {
  /**
   * @deprecated
   * Use `Awaited<ReturnType<T>>` instead
   */
  inferAsyncReturnType,
} from './types';

export { type OnErrorFunction } from './internals/types';
export { mergeRouters } from './internals/mergeRouters';
export * from './internals/procedureBuilder';
export * from './internals/utils';
export * from './procedure';

export * from './types';
