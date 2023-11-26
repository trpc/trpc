export { createReactProxyDecoration } from './proxy/decorationProxy';
export {
  createReactQueryUtilsProxy,
  type DecoratedProcedureUtilsRecord,
  type CreateReactUtilsProxy,
} from './proxy/utilsProxy';
export {
  createUseQueriesProxy,
  type UseQueriesProcedureRecord,
} from './proxy/useQueriesProxy';
export type {
  DecoratedProcedureRecord,
  DecorateProcedure,
} from '../createTRPCReact';
export type { TRPCUseQueries } from '../internals/useQueries';
export {
  createRootHooks,
  createHooksInternal,
  type CreateReactQueryHooks,
} from './hooks/createRootHooks';
export {
  getQueryClient,
  type CreateTRPCReactQueryClientConfig,
} from './queryClient';
export { type UseMutationOverride, type CreateTRPCReactOptions } from './types';
export {
  type OutputWithCursor,
  type TRPCReactRequestOptions,
  type TRPCUseQueryBaseOptions,
  type UseTRPCQueryOptions,
  type DefinedUseTRPCQueryOptions,
  type TRPCQueryOptions,
  type ExtractCursorType,
  type UseTRPCInfiniteQueryOptions,
  type UseTRPCMutationOptions,
  type UseTRPCSubscriptionOptions,
  type TRPCProviderProps,
  type TRPCProvider,
  type UseDehydratedState,
  type CreateClient,
  type UseTRPCQueryResult,
  type DefinedUseTRPCQueryResult,
  type UseTRPCQuerySuccessResult,
  type UseTRPCInfiniteQueryResult,
  type UseTRPCInfiniteQuerySuccessResult,
  type UseTRPCMutationResult,
} from './hooks/types';
export {
  type MutationLike,
  type InferMutationLikeInput,
  type InferMutationLikeData,
  type QueryLike,
  type InferQueryLikeInput,
  type InferQueryLikeData,
  type RouterLike,
  type UtilsLike,
} from './polymorphism';

export {
  /**
   * @deprecated this is an internal function
   */
  getClientArgs,
} from '../internals/getClientArgs';

export {
  contextProps,
  /**
   * @deprecated
   */
  TRPCContext,
  type TRPCFetchQueryOptions,
  type TRPCFetchInfiniteQueryOptions,
  type SSRState,
  type ProxyTRPCContextProps,
  type DecoratedProxyTRPCContextProps,
  type TRPCContextProps,
  type TRPCContextState,
} from '../internals/context';
