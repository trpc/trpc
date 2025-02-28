export {
  TRPCError,
  /**
   * @deprecated use `experimental_trpcMiddleware` instead
   */
  experimental_standaloneMiddleware,
  experimental_standaloneMiddleware as experimental_trpcMiddleware,
  initTRPC,
  // --- FIXME a bunch of these exports are only useful for plugins - move them somewhere else? ----
  getTRPCErrorFromUnknown,
  transformTRPCResponse,
  createFlatProxy as createTRPCFlatProxy,
  createRecursiveProxy as createTRPCRecursiveProxy,
  type inferProcedureInput,
  type inferProcedureOutput,
  type inferProcedureBuilderResolverOptions,
  type inferRouterError,
  type inferRouterInputs,
  type inferRouterOutputs,
  type inferRouterContext,
  type inferClientTypes as inferTRPCClientTypes,
  type AnyClientTypes as AnyTRPCClientTypes,
  type inferTransformedProcedureOutput,
  type inferTransformedSubscriptionOutput,
  type AnyProcedure as AnyTRPCProcedure,
  type AnyRouter as AnyTRPCRouter,
  type AnyRootTypes as AnyTRPCRootTypes,
  type AnyMiddlewareFunction as AnyTRPCMiddlewareFunction,
  type CombinedDataTransformer as TRPCCombinedDataTransformer,
  type ProcedureType as TRPCProcedureType,
  type AnyMutationProcedure as AnyTRPCMutationProcedure,
  type AnyQueryProcedure as AnyTRPCQueryProcedure,
  type RouterRecord as TRPCRouterRecord,
  type AnySubscriptionProcedure as AnyTRPCSubscriptionProcedure,
  type CreateContextCallback,
  type MutationProcedure as TRPCMutationProcedure,
  type QueryProcedure as TRPCQueryProcedure,
  type SubscriptionProcedure as TRPCSubscriptionProcedure,
  type TRPCBuilder,
  StandardSchemaV1Error,
  /**
   * @deprecated use `tracked(id, data)` instead
   */
  sse,
  tracked,
  type TrackedEnvelope,
  isTrackedEnvelope,
  lazy as experimental_lazy,
  callProcedure as callTRPCProcedure,
} from '../../unstable-core-do-not-import';

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
   * @deprecated use `AnyTRPCSubscriptionProcedure` instead
   */
  AnySubscriptionProcedure,
} from '../../unstable-core-do-not-import';

export {
  /**
   * @deprecated use `getTRPCErrorShape` instead
   */
  getErrorShape,
} from '../../unstable-core-do-not-import';

/**
 * @deprecated
 * Use `Awaited<ReturnType<typeof myFunction>>` instead
 */
export type inferAsyncReturnType<TFunction extends (...args: any[]) => any> =
  Awaited<ReturnType<TFunction>>;
