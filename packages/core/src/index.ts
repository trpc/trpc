/**
 * @remark Do not `import` anything from `@trpc/core` it will be unreliable between minor versions of tRPC
 */

export { initTRPC } from './initTRPC';
export type { MiddlewareFunction, MiddlewareBuilder } from './middleware';
export {
  createInputMiddleware,
  createOutputMiddleware,
  experimental_standaloneMiddleware,
  middlewareMarker,
} from './middleware';
export type { inferParser } from './parser';
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
  inferHandlerInput,
  inferProcedureInput,
  inferProcedureOutput,
  inferTransformedProcedureOutput,
  inferTransformedSubscriptionOutput,
  inferProcedureParams,
  QueryProcedure,
  SubscriptionProcedure,
} from './procedure';
export { procedureTypes } from './procedure';
export type { ProcedureBuilder } from './procedureBuilder';
export { unsetMarker, createBuilder } from './procedureBuilder';
export type { AnyRootConfig, RootConfig } from './rootConfig';
export type {
  AnyRouter,
  ProcedureRecord,
  ProcedureRouterRecord,
  CreateRouterInner,
  Router,
  RouterCaller,
  AnyRouterDef,
  inferRouterContext,
  inferRouterError,
  inferRouterInputs,
  inferRouterMeta,
  inferRouterOutputs,
  TRPCInferrable,
  inferErrorShape,
  createRouterFactory,
} from './router';
export { callProcedure, mergeRouters } from './router';
export type {
  CombinedDataTransformer,
  CombinedDataTransformerClient,
  DataTransformer,
  DataTransformerOptions,
  DefaultDataTransformer,
} from './transformer';
export { transformResult, transformTRPCResponse } from './transformer';

export { createFlatProxy, createRecursiveProxy } from './createProxy';

// For `.d.ts` files https://github.com/trpc/trpc/issues/3943
export type { SerializeObject, Serialize } from './serialize';

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
  IntersectionError,
  ProtectedIntersection,
} from './types';
export { isObject } from './utils';
