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

export { mergeRouters } from './internals/mergeRouters';
export * from './internals/procedureBuilder';
export * from './internals/utils';
export * from './internals/config';

export * from './procedure';

export * from './types';
export * from './shared/createProxy';
export * from './shared/jsonify';
export * from './shared/transformTRPCResponse';

// For `.d.ts` files https://github.com/trpc/trpc/issues/3943
export type { SerializeObject, Serialize } from './shared/internal/serialize';

export * from './shared/getErrorShape';

export * from './shared/types';
export * from './shared/getCauseFromUnknown';
