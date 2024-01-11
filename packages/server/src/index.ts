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
  type AnyMiddlewareFunction as AnyTRPCMiddlewareFunction,
} from './unstableDoNotImportThis';

export type {
  /**
   * @deprecated use `AnyTRPCProcedure` instead
   */
  AnyProcedure,
  /**
   * @deprecated use `AnyTRPCRouter` instead
   */
  AnyRouter,
  /**
   * @deprecated use `AnyTRPCMiddlewareFunction` instead
   */
  AnyMiddlewareFunction,
} from '@trpc/core';

/**
 * @deprecated
 * Use `Awaited<ReturnType<typeof myFunction>>` instead
 */
export type inferAsyncReturnType<TFunction extends (...args: any[]) => any> =
  Awaited<ReturnType<TFunction>>;
