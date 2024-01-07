export {
  TRPCError,
  /**
   * @deprecated use `experimental_trpcMiddleware` instead
   */
  experimental_standaloneMiddleware,
  experimental_standaloneMiddleware as experimental_trpcMiddleware,
  initTRPC,
  type inferProcedureInput,
  type inferProcedureOutput,
  type inferRouterError,
  type inferRouterInputs,
  type inferRouterOutputs,
  type AnyProcedure as AnyTRPCProcedure,
  type AnyRouter as AnyTRPCRouter,
} from './unstableDoNotImportThis';

export type {
  /**
   * @deprecated
   * Use `Awaited<ReturnType<T>>` instead
   */
  inferAsyncReturnType,
  /**
   * @deprecated use `AnyTRPCProcedure` instead
   */
  AnyProcedure,
  /**
   * @deprecated use `AnyTRPCRouter` instead
   */
  AnyRouter,
} from '@trpc/core';
