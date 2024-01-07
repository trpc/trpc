/**
 * @remark Do not `import` anything from `@trpc/core` it will be unreliable between minor versions of tRPC
 */

export {
  CombinedDataTransformer,
  CombinedDataTransformerClient,
  DataTransformer,
  DataTransformerOptions,
  DefaultDataTransformer,
  defaultTransformer,
  getDataTransformer,
} from './transformer';
export {
  TRPCError,
  getCauseFromUnknown,
  getTRPCErrorFromUnknown,
} from './error/TRPCError';
export type {
  AnyRouter,
  ProcedureRecord,
  ProcedureRouterRecord,
  CreateRouterInner,
  Router,
  RouterCaller,
  AnyRouterDef,
} from './router';
export { callProcedure, createCallerFactory } from './router';
export type {
  Procedure,
  AnyProcedure,
  AnyQueryProcedure,
  AnyMutationProcedure,
  AnySubscriptionProcedure,
  ProcedureArgs,
  ProcedureOptions,
  MutationProcedure,
  QueryProcedure,
  SubscriptionProcedure,
} from './procedure';
export type { inferParser } from './parser';
export {
  createInputMiddleware,
  createOutputMiddleware,
  experimental_standaloneMiddleware,
} from './middleware';
export type { MiddlewareFunction, MiddlewareBuilder } from './middleware';
export { initTRPC } from './initTRPC';
export {
  DeepPartial,
  Dict,
  DistributiveOmit,
  Filter,
  FilterKeys,
  InferLast,
  IntersectionError,
  Maybe,
  MaybePromise,
  ProcedureType,
  ProtectedIntersection,
  Simplify,
  Unwrap,
  WithoutIndexSignature,
  inferHandlerInput,
  inferProcedureInput,
  inferProcedureOutput,
  inferProcedureParams,
  inferRouterConfig,
  inferRouterContext,
  inferRouterDef,
  inferRouterError,
  inferRouterInputs,
  inferRouterMeta,
  inferRouterOutputs,
  procedureTypes,
} from './types';
export { type DefaultErrorShape } from './error/formatter';

export { mergeRouters } from './internals/mergeRouters';
export {
  AnyProcedureBuilderDef,
  ProcedureBuilder,
  ProcedureBuilderDef,
  ProcedureBuilderResolver,
  ProcedureCallOptions,
  createBuilder,
} from './internals/procedureBuilder';
export {
  DefaultValue,
  GetRawInputFn,
  MiddlewareMarker,
  Overwrite,
  PickFirstDefined,
  UnsetMarker,
  ValidateShape,
  isObject,
  middlewareMarker,
  unsetMarker,
} from './internals/utils';
export {
  AnyRootConfig,
  CreateRootConfigTypes,
  RootConfig,
  RootConfigTypes,
  RuntimeConfig,
  isServerDefault,
} from './internals/config';

export { createFlatProxy, createRecursiveProxy } from './shared/createProxy';
export {
  inferTransformedProcedureOutput,
  inferTransformedSubscriptionOutput,
} from './shared/jsonify';
export { transformTRPCResponse } from './shared/transformTRPCResponse';

// For `.d.ts` files https://github.com/trpc/trpc/issues/3943
export type { SerializeObject, Serialize } from './shared/serialize';

export { getErrorShape } from './shared/getErrorShape';

export { TRPCInferrable, inferConfig, inferErrorShape } from './shared/types';
