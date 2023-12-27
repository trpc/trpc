// <delete me>
export * from './transformer';
export * from './error/TRPCError';
export * from './core';
export { type DefaultErrorShape } from './error/formatter';
export type { RootConfig, AnyRootConfig } from './core/internals/config';

// </delete me>

export { TRPCError } from './error/TRPCError';
export {
  initTRPC,
  experimental_standaloneMiddleware,
  type inferRouterInputs,
  type inferRouterOutputs,
  type inferProcedureInput,
  type inferProcedureOutput,
  type inferRouterError,
} from './core';

export type {
  /**
   * @deprecated
   * Use `Awaited<ReturnType<T>>` instead
   */
  inferAsyncReturnType,
} from '@trpc/core';

export type {
  AnyRouter as AnyTRPCRouter,
  /**
   * @deprecated use `AnyTRPCRouter` instead
   */
  AnyRouter,
} from './core';
