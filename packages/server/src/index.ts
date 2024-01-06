export {
  initTRPC,
  TRPCError,
  /**
   * @deprecated use `experimental_trpcMiddleware` instead
   */
  experimental_standaloneMiddleware,
  experimental_standaloneMiddleware as experimental_trpcMiddleware,
  type inferProcedureInput,
  type inferProcedureOutput,
  type inferRouterError,
  type inferRouterInputs,
  type inferRouterOutputs,
} from './index.core';

export type {
  /**
   * @deprecated
   * Use `Awaited<ReturnType<T>>` instead
   */
  inferAsyncReturnType,
} from './index.core';

export type {
  /**
   * @deprecated use `AnyTRPCProcedure` instead
   */
  AnyProcedure,
  /**
   * @deprecated use `AnyTRPCRouter` instead
   */
  AnyRouter,
  AnyProcedure as AnyTRPCProcedure,
  AnyRouter as AnyTRPCRouter,
} from './index.core';
