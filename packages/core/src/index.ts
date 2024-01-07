/**
 * @remark Do not `import` anything from `@trpc/core` it will be unreliable between minor versions of tRPC
 */

export type {
  CombinedDataTransformer,
  CombinedDataTransformerClient,
  DataTransformer,
  DataTransformerOptions,
  DefaultDataTransformer,
} from './core/transformer';
export {
  defaultTransformer,
  getDataTransformer,
  transformResult,
  transformTRPCResponse,
} from './core/transformer';
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
} from './core/router';
export { callProcedure, createCallerFactory } from './core/router';
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
} from './core/procedure';
export { procedureTypes } from './core/procedure';
export type { inferParser } from './core/parser';
export {
  createInputMiddleware,
  createOutputMiddleware,
  experimental_standaloneMiddleware,
  middlewareMarker,
} from './core/middleware';
export type {
  MiddlewareFunction,
  MiddlewareBuilder,
  MiddlewareMarker,
} from './core/middleware';
export { initTRPC } from './core/initTRPC';
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
export type { IntersectionError, ProtectedIntersection } from './types';
export type {
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
  inferTransformedProcedureOutput,
  inferTransformedSubscriptionOutput,
  TRPCInferrable,
  inferConfig,
  inferErrorShape,
} from './core/inference';
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
} from './core/rootConfig';
export { isServerDefault } from './core/rootConfig';

export { createFlatProxy, createRecursiveProxy } from './createProxy';

// For `.d.ts` files https://github.com/trpc/trpc/issues/3943
export type { SerializeObject, Serialize } from './serialize';

export { getErrorShape } from './error/getErrorShape';
