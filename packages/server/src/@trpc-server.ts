export {
  TRPCError,
  /**
   * @deprecated use `experimental_trpcMiddleware` instead
   */
  experimental_standaloneMiddleware,
  experimental_standaloneMiddleware as experimental_trpcMiddleware,
  initTRPC,
  callProcedure as callTRPCProcedure,
  getTRPCErrorFromUnknown,
  transformTRPCResponse,
  type inferProcedureInput,
  type inferProcedureOutput,
  type inferRouterError,
  type inferRouterInputs,
  type inferRouterOutputs,
  type inferRouterContext,
  type AnyProcedure as AnyTRPCProcedure,
  type AnyRouter as AnyTRPCRouter,
  type AnyMiddlewareFunction as AnyTRPCMiddlewareFunction,
  type CombinedDataTransformer as TRPCCombinedDataTransformer,
  type ProcedureType as TRPCProcedureType,
} from './@trpc-core-unstable-do-not-import-this-please';

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
  /**
   * @deprecated use `TRPCCombinedDataTransformer` instead
   */
  CombinedDataTransformer,

  /**
   * @deprecated This is a utility type will be removed in v12
   */
  Dict,

  /**
   * @deprecated use `TRPCProcedureType` instead
   */
  ProcedureType,
} from '@trpc/core';

export {
  /**
   * @deprecated use `getTRPCErrorShape` instead
   */
  getErrorShape,

  /**
   * @deprecated use `callTRPCProcedure` instead
   */
  callProcedure,
} from '@trpc/core';

/**
 * @deprecated
 * Use `Awaited<ReturnType<typeof myFunction>>` instead
 */
export type inferAsyncReturnType<TFunction extends (...args: any[]) => any> =
  Awaited<ReturnType<TFunction>>;
