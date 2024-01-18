/**
 * This file is here to make TypeScript happy and prevent _"The inferred type of 'createContext' cannot be named without a reference to [...]"_.
 *
 * We're basically just re-exporting everything from core.
 *
 * If you need to import anything from here, please open an issue at https://github.com/trpc/trpc/issues
 */
export type { DefaultErrorShape, DefaultErrorData } from './error/formatter';
export { getErrorShape } from './error/getErrorShape';
export {
  TRPCError,
  getCauseFromUnknown,
  getTRPCErrorFromUnknown,
} from './error/TRPCError';

export { initTRPC } from './initTRPC';
export type {
  AnyMiddlewareFunction,
  MiddlewareFunction,
  MiddlewareBuilder,
} from './middleware';
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
  createRouterFactory,
} from './router';

export type { TRPCInferrable, inferErrorShape } from './TRPCInferrable';
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

/**
 * These should be re-exported from separate entrypoints in server package
 */
export * from './rpc';
export * from './http';
