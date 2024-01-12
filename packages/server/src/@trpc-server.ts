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
  type inferTransformedProcedureOutput,
  type inferTransformedSubscriptionOutput,
  type AnyProcedure as AnyTRPCProcedure,
  type AnyRouter as AnyTRPCRouter,
  type AnyMiddlewareFunction as AnyTRPCMiddlewareFunction,
  type CombinedDataTransformer as TRPCCombinedDataTransformer,
  type ProcedureType as TRPCProcedureType,
  type AnyMutationProcedure as AnyTRPCMutationProcedure,
  type AnyQueryProcedure as AnyTRPCQueryProcedure,
  type ProcedureRouterRecord as TRPCProcedureRouterRecord,
  type ProcedureArgs as TRPCProcedureArgs,
  type AnySubscriptionProcedure as AnyTRPCSubscriptionProcedure,
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
   * @deprecated This is a utility type will be removed in v12
   */
  DeepPartial,
  /**
   * @deprecated use `TRPCProcedureType` instead
   */
  ProcedureType,
  /**
   * @deprecated use `AnyTRPCMutationProcedure` instead
   */
  AnyMutationProcedure,

  /**
   * @deprecated use `AnyTRPCQueryProcedure` instead
   */
  AnyQueryProcedure,
  /**
   * @deprecated use `TRPCProcedureRouterRecord` instead
   */
  ProcedureRouterRecord,
  /**
   * @deprecated use `TRPCProcedureArgs` instead
   */
  ProcedureArgs,
  /**
   * @deprecated use `AnyTRPCSubscriptionProcedure` instead
   */
  AnySubscriptionProcedure,
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
  /**
   * @deprecated use `getTRPCErrorFromUnknown` instead
   */
  createFlatProxy,
} from '@trpc/core';

/**
 * @deprecated
 * Use `Awaited<ReturnType<typeof myFunction>>` instead
 */
export type inferAsyncReturnType<TFunction extends (...args: any[]) => any> =
  Awaited<ReturnType<TFunction>>;
