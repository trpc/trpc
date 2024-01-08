/**
 * @remark Do not `import` anything from `@trpc/core` it will be unreliable between minor versions of tRPC
 */

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
export { initTRPC } from './core/initTRPC';
export type { MiddlewareFunction, MiddlewareBuilder } from './core/middleware';
export {
  createInputMiddleware,
  createOutputMiddleware,
  experimental_standaloneMiddleware,
  middlewareMarker,
} from './core/middleware';
export type { inferParser } from './core/parser';
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
export type {
  AnyProcedureBuilderDef,
  ProcedureBuilder,
  ProcedureBuilderDef,
  ProcedureBuilderResolver,
  ProcedureCallOptions,
} from './core/procedureBuilder';
export { unsetMarker, createBuilder } from './core/procedureBuilder';
export type {
  AnyRootConfig,
  CreateRootConfigTypes,
  RootConfig,
  RootConfigTypes,
  RuntimeConfig,
} from './core/rootConfig';
export { isServerDefault } from './core/rootConfig';
export type {
  AnyRouter,
  ProcedureRecord,
  ProcedureRouterRecord,
  CreateRouterInner,
  Router,
  RouterCaller,
  AnyRouterDef,
} from './core/router';
export {
  callProcedure,
  createCallerFactory,
  mergeRouters,
} from './core/router';
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

export { getErrorShape } from './error/getErrorShape';
export type { DefaultErrorShape } from './error/formatter';
export {
  TRPCError,
  getCauseFromUnknown,
  getTRPCErrorFromUnknown,
} from './error/TRPCError';

export { createFlatProxy, createRecursiveProxy } from './createProxy';

// For `.d.ts` files https://github.com/trpc/trpc/issues/3943
export type { SerializeObject, Serialize } from './serialize';

export type {
  IntersectionError,
  ProtectedIntersection,
  GetRawInputFn,
} from './types';

export { isObject } from './utilityFunctions';
export type {
  DeepPartial,
  Dict,
  DistributiveOmit,
  Filter,
  FilterKeys,
  Maybe,
  MaybePromise,
  Simplify,
  Unwrap,
  WithoutIndexSignature,
  Overwrite,
  PickFirstDefined,
  ValidateShape,
} from './utilityTypes';
