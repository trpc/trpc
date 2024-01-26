/**
 * **DO NOT IMPORT FROM HERE FILE**
 *
 * This file is here to:
 * - make TypeScript happy and prevent _"The inferred type of 'createContext' cannot be named without a reference to [...]"_.
 * - the the glue between the official `@trpc/*`-packages
 *
 *
 * If you seem to need to import anything from here, please open an issue at https://github.com/trpc/trpc/issues
 */
export {
  TRPCError,
  getCauseFromUnknown,
  getTRPCErrorFromUnknown,
} from './error/TRPCError';
export type { DefaultErrorData, DefaultErrorShape } from './error/formatter';
export { getErrorShape } from './error/getErrorShape';

export { initTRPC } from './initTRPC';
export {
  createInputMiddleware,
  createOutputMiddleware,
  experimental_standaloneMiddleware,
  middlewareMarker,
} from './middleware';
export type {
  AnyMiddlewareFunction,
  MiddlewareBuilder,
  MiddlewareFunction,
} from './middleware';
export type { inferParser } from './parser';
export { procedureTypes } from './procedure';
export type {
  AnyMutationProcedure,
  AnyProcedure,
  AnyQueryProcedure,
  AnySubscriptionProcedure,
  MutationProcedure,
  Procedure,
  ProcedureOptions,
  ProcedureType,
  QueryProcedure,
  SubscriptionProcedure,
  inferProcedureInput,
  inferProcedureOutput,
  inferProcedureParams,
  inferTransformedProcedureOutput,
  inferTransformedSubscriptionOutput,
} from './procedure';
export { createBuilder, unsetMarker } from './procedureBuilder';
export type { ProcedureBuilder } from './procedureBuilder';
export * from './rootConfig';
export type {
  AnyRouter,
  Router,
  RouterCaller,
  createRouterFactory,
  inferRouterContext,
  inferRouterError,
  inferRouterInputs,
  inferRouterMeta,
  inferRouterOutputs,
} from './router';

export * from './TRPCInferrable';
export * from './router';
export { transformResult, transformTRPCResponse } from './transformer';
export type {
  CombinedDataTransformer,
  CombinedDataTransformerClient,
  DataTransformer,
  DataTransformerOptions,
} from './transformer';

export { createFlatProxy, createRecursiveProxy } from './createProxy';

// For `.d.ts` files https://github.com/trpc/trpc/issues/3943
export type { Serialize, SerializeObject } from './serialize';

export type {
  DeepPartial,
  Dict,
  DistributiveOmit,
  Filter,
  FilterKeys,
  IntersectionError,
  Maybe,
  MaybePromise,
  Overwrite,
  PickFirstDefined,
  ProtectedIntersection,
  Simplify,
  Unwrap,
  ValidateShape,
  WithoutIndexSignature,
  TypeError,
} from './types';
export { isObject } from './utils';

export * from './TRPCInferrable';
/**
 * These should be re-exported from separate entrypoints in server package
 */
export * from './http';
export * from './rpc';
