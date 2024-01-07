/**
 * @remark Do not `import` anything from `@trpc/core` it will be unreliable between minor versions of tRPC
 */

export * from './transformer';
export * from './error/TRPCError';
export type {
  AnyRouter,
  ProcedureRecord,
  ProcedureRouterRecord,
  CreateRouterInner,
  Router,
  AnyRouterDef,
} from './router';
export { callProcedure, createRouterFactory } from './router';
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
export * from './trpcConfig';
export { initTRPC } from './initTRPC';
export * from './types';
export { type DefaultErrorShape } from './error/formatter';
export * from './transformer';

export { mergeRouters } from './internals/mergeRouters';
export * from './internals/procedureBuilder';
export * from './utilityFunctions';

export * from './procedure';

export * from './types';
export * from './shared/createProxy';
export * from './shared/transformTRPCResponse';

// For `.d.ts` files https://github.com/trpc/trpc/issues/3943
export type { SerializeObject, Serialize } from './shared/serialize';

export * from './shared/getErrorShape';

export * from './inference';
export * from './utilityFunctions';
export * from './utilityTypes';
