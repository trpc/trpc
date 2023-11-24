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
} from './types';

export type {
  AnyRouter as TRPCRouter,
  /**
   * @deprecated use `TRPCRouter` instead
   */
  AnyRouter,
} from './core';
