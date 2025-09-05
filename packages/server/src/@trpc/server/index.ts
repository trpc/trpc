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
  type RouterDef as TRPCRouterDef,
  type RouterBuilder as TRPCRouterBuilder,
  type RouterCallerFactory as TRPCRouterCallerFactory,
  type RootConfig as TRPCRootConfig,
  type AnyRootTypes as AnyTRPCRootTypes,
  type MiddlewareFunction as TRPCMiddlewareFunction,
  type MiddlewareBuilder as TRPCMiddlewareBuilder,
  type AnyMiddlewareFunction as AnyTRPCMiddlewareFunction,
  type CombinedDataTransformer as TRPCCombinedDataTransformer,
  type DataTransformer as TRPCDataTransformer,
  type ProcedureType as TRPCProcedureType,
  type AnyMutationProcedure as AnyTRPCMutationProcedure,
  type AnyQueryProcedure as AnyTRPCQueryProcedure,
  type RouterRecord as TRPCRouterRecord,
  type MergeRouters as TRPCMergeRouters,
  type AnySubscriptionProcedure as AnyTRPCSubscriptionProcedure,
  type CreateContextCallback,
  type MutationProcedure as TRPCMutationProcedure,
  type QueryProcedure as TRPCQueryProcedure,
  type BuiltRouter as TRPCBuiltRouter,
  type SubscriptionProcedure as TRPCSubscriptionProcedure,
  type TRPCBuilder,
  type ProcedureBuilder as TRPCProcedureBuilder,
  type RuntimeConfigOptions as TRPCRuntimeConfigOptions,
  type TRPCRootObject,
  type ErrorFormatter as TRPCErrorFormatter,
  type TRPCErrorShape,
  type DefaultErrorShape as TRPCDefaultErrorShape,
  type DefaultErrorData as TRPCDefaultErrorData,
  type TRPC_ERROR_CODE_KEY,
  type TRPC_ERROR_CODE_NUMBER,
  type DecorateCreateRouterOptions as TRPCDecorateCreateRouterOptions,
  type CreateRouterOptions as TRPCCreateRouterOptions,
  type RouterCaller as TRPCRouterCaller,
  StandardSchemaV1Error,
  /**
   * @deprecated use `tracked(id, data)` instead
   */
  sse,
  tracked,
  type TrackedEnvelope,
  isTrackedEnvelope,
  lazy,
  /**
   * @deprecated use {@link lazy} instead
   */
  lazy as experimental_lazy,
  callProcedure as callTRPCProcedure,

  /**
   * @internal
   */
  type UnsetMarker as TRPCUnsetMarker,
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
   * @deprecated use `TRPCDataTransformer` instead
   */
  DataTransformer,

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
  getErrorShape as getTRPCErrorShape,
} from '../../unstable-core-do-not-import';

/**
 * @deprecated
 * Use `Awaited<ReturnType<typeof myFunction>>` instead
 */
export type inferAsyncReturnType<TFunction extends (...args: any[]) => any> =
  Awaited<ReturnType<TFunction>>;
