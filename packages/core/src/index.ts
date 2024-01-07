/**
 * @remark Do not `import` anything from `@trpc/core` it will be unreliable between minor versions of tRPC
 */

export type {
  CombinedDataTransformer,
  CombinedDataTransformerClient,
  DataTransformer,
  DataTransformerOptions,
  DefaultDataTransformer,
} from './transformer';
export { defaultTransformer, getDataTransformer } from './transformer';
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
  ProcedureType,
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
export { procedureTypes } from './procedure';
export type { inferParser } from './parser';
export {
  createInputMiddleware,
  createOutputMiddleware,
  experimental_standaloneMiddleware,
  middlewareMarker,
} from './middleware';
export type {
  MiddlewareFunction,
  MiddlewareBuilder,
  MiddlewareMarker,
} from './middleware';
export { initTRPC } from './initTRPC';
export type {
  DeepPartial,
  Dict,
  DistributiveOmit,
  Filter,
  FilterKeys,
  InferLast,
  Maybe,
  MaybePromise,
  Simplify,
  Unwrap,
  WithoutIndexSignature,
  Overwrite,
  PickFirstDefined,
  UnsetMarker,
  ValidateShape,
  DefaultValue,
} from './utilityTypes';
export type {
  IntersectionError,
  ProtectedIntersection,
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
} from './types';
export type { DefaultErrorShape } from './error/formatter';

export { mergeRouters } from './internals/mergeRouters';
export type {
  AnyProcedureBuilderDef,
  ProcedureBuilder,
  ProcedureBuilderDef,
  ProcedureBuilderResolver,
  ProcedureCallOptions,
} from './internals/procedureBuilder';
export { createBuilder } from './internals/procedureBuilder';
export type { GetRawInputFn } from './types';
export { unsetMarker } from './utilityTypes';
export { isObject } from './utilityFunctions';
export type {
  AnyRootConfig,
  CreateRootConfigTypes,
  RootConfig,
  RootConfigTypes,
  RuntimeConfig,
} from './rootConfig';
export { isServerDefault } from './rootConfig';

export { createFlatProxy, createRecursiveProxy } from './shared/createProxy';
export type {
  inferTransformedProcedureOutput,
  inferTransformedSubscriptionOutput,
} from './shared/jsonify';
export { transformTRPCResponse } from './shared/transformTRPCResponse';

// For `.d.ts` files https://github.com/trpc/trpc/issues/3943
export type { SerializeObject, Serialize } from './shared/serialize';

export { getErrorShape } from './shared/getErrorShape';

export type {
  TRPCInferrable,
  inferConfig,
  inferErrorShape,
} from './shared/types';
