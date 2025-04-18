import type {
  CancelOptions,
  FetchInfiniteQueryOptions,
  FetchQueryOptions,
  InfiniteData,
  InvalidateOptions,
  InvalidateQueryFilters,
  MutationOptions,
  QueryClient,
  QueryFilters,
  QueryKey,
  RefetchOptions,
  RefetchQueryFilters,
  ResetOptions,
  SetDataOptions,
  Updater,
} from '@tanstack/react-query';
import type {
  TRPCClient,
  TRPCClientError,
  TRPCRequestOptions,
  TRPCUntypedClient,
} from '@trpc/client';
import type {
  AnyClientTypes,
  AnyRouter,
  DistributiveOmit,
} from '@trpc/server/unstable-core-do-not-import';
import * as React from 'react';
import type {
  DefinedTRPCInfiniteQueryOptionsIn,
  DefinedTRPCInfiniteQueryOptionsOut,
  DefinedTRPCQueryOptionsIn,
  DefinedTRPCQueryOptionsOut,
  ExtractCursorType,
  UndefinedTRPCInfiniteQueryOptionsIn,
  UndefinedTRPCInfiniteQueryOptionsOut,
  UndefinedTRPCQueryOptionsIn,
  UndefinedTRPCQueryOptionsOut,
} from '../shared';
import type { TRPCMutationKey, TRPCQueryKey } from './getQueryKey';

interface TRPCUseUtilsOptions {
  /**
   * tRPC-related options
   */
  trpc?: TRPCRequestOptions;
}
export interface TRPCFetchQueryOptions<TOutput, TError>
  extends DistributiveOmit<FetchQueryOptions<TOutput, TError>, 'queryKey'>,
    TRPCUseUtilsOptions {
  //
}

export type TRPCFetchInfiniteQueryOptions<TInput, TOutput, TError> =
  DistributiveOmit<
    FetchInfiniteQueryOptions<
      TOutput,
      TError,
      TOutput,
      TRPCQueryKey,
      ExtractCursorType<TInput>
    >,
    'queryKey' | 'initialPageParam'
  > &
    TRPCUseUtilsOptions & {
      initialCursor?: ExtractCursorType<TInput>;
    };

/** @internal */
export type SSRState = 'mounted' | 'mounting' | 'prepass' | false;

export interface TRPCContextPropsBase<TRouter extends AnyRouter, TSSRContext> {
  /**
   * The `TRPCClient`
   */
  client: TRPCUntypedClient<TRouter>;
  /**
   * The SSR context when server-side rendering
   * @default null
   */
  ssrContext?: TSSRContext | null;
  /**
   * State of SSR hydration.
   * - `false` if not using SSR.
   * - `prepass` when doing a prepass to fetch queries' data
   * - `mounting` before TRPCProvider has been rendered on the client
   * - `mounted` when the TRPCProvider has been rendered on the client
   * @default false
   */
  ssrState?: SSRState;
  /**
   * @deprecated pass abortOnUnmount to `createTRPCReact` instead
   * Abort loading query calls when unmounting a component - usually when navigating to a new page
   * @default false
   */
  abortOnUnmount?: boolean;
}

/**
 * @internal
 */
export type DecoratedTRPCContextProps<
  TRouter extends AnyRouter,
  TSSRContext,
> = TRPCContextPropsBase<TRouter, TSSRContext> & {
  client: TRPCClient<TRouter>;
};

export interface TRPCContextProps<TRouter extends AnyRouter, TSSRContext>
  extends TRPCContextPropsBase<TRouter, TSSRContext> {
  /**
   * The react-query `QueryClient`
   */
  queryClient: QueryClient;
}

export const contextProps: (keyof TRPCContextPropsBase<any, any>)[] = [
  'client',
  'ssrContext',
  'ssrState',
  'abortOnUnmount',
];

/**
 * @internal
 */
export interface TRPCContextState<
  TRouter extends AnyRouter,
  TSSRContext = undefined,
> extends Required<TRPCContextProps<TRouter, TSSRContext>>,
    TRPCQueryUtils<TRouter> {}

/**
 * @internal
 */
export interface TRPCQueryUtils<TRouter extends AnyRouter> {
  /**
   * @see https://tanstack.com/query/latest/docs/framework/react/reference/queryOptions#queryoptions
   */
  queryOptions(
    path: readonly string[], // <-- look into if needed
    queryKey: TRPCQueryKey,
    opts?: UndefinedTRPCQueryOptionsIn<
      unknown,
      unknown,
      TRPCClientError<AnyClientTypes>
    >,
  ): UndefinedTRPCQueryOptionsOut<
    unknown,
    unknown,
    TRPCClientError<AnyClientTypes>
  >;
  queryOptions(
    path: readonly string[], // <-- look into if needed
    queryKey: TRPCQueryKey,
    opts: DefinedTRPCQueryOptionsIn<
      unknown,
      unknown,
      TRPCClientError<AnyClientTypes>
    >,
  ): DefinedTRPCQueryOptionsOut<
    unknown,
    unknown,
    TRPCClientError<AnyClientTypes>
  >;

  /**
   * @see https://tanstack.com/query/latest/docs/framework/react/reference/infiniteQueryOptions#infinitequeryoptions
   */
  infiniteQueryOptions(
    path: readonly string[], // <-- look into if needed
    queryKey: TRPCQueryKey,
    opts: UndefinedTRPCInfiniteQueryOptionsIn<
      unknown,
      unknown,
      unknown,
      TRPCClientError<AnyClientTypes>
    >,
  ): UndefinedTRPCInfiniteQueryOptionsOut<
    unknown,
    unknown,
    unknown,
    TRPCClientError<AnyClientTypes>
  >;
  infiniteQueryOptions(
    path: readonly string[], // <-- look into if needed
    queryKey: TRPCQueryKey,
    opts: DefinedTRPCInfiniteQueryOptionsIn<
      unknown,
      unknown,
      unknown,
      TRPCClientError<AnyClientTypes>
    >,
  ): DefinedTRPCInfiniteQueryOptionsOut<
    unknown,
    unknown,
    unknown,
    TRPCClientError<AnyClientTypes>
  >;

  /**
   * @see https://tanstack.com/query/v5/docs/reference/QueryClient#queryclientfetchquery
   */
  fetchQuery: (
    queryKey: TRPCQueryKey,
    opts?: TRPCFetchQueryOptions<unknown, TRPCClientError<TRouter>>,
  ) => Promise<unknown>;
  /**
   * @see https://tanstack.com/query/v5/docs/reference/QueryClient#queryclientfetchinfinitequery
   */
  fetchInfiniteQuery: (
    queryKey: TRPCQueryKey,
    opts?: TRPCFetchInfiniteQueryOptions<
      unknown,
      unknown,
      TRPCClientError<TRouter>
    >,
  ) => Promise<InfiniteData<unknown, unknown>>;
  /**
   * @see https://tanstack.com/query/v5/docs/framework/react/guides/prefetching
   */
  prefetchQuery: (
    queryKey: TRPCQueryKey,
    opts?: TRPCFetchQueryOptions<unknown, TRPCClientError<TRouter>>,
  ) => Promise<void>;

  /**
   * @see https://tanstack.com/query/v5/docs/reference/QueryClient#queryclientprefetchinfinitequery
   */
  prefetchInfiniteQuery: (
    queryKey: TRPCQueryKey,
    opts?: TRPCFetchInfiniteQueryOptions<
      unknown,
      unknown,
      TRPCClientError<TRouter>
    >,
  ) => Promise<void>;

  /**
   * @see https://tanstack.com/query/v5/docs/reference/QueryClient#queryclientensurequerydata
   */
  ensureQueryData: (
    queryKey: TRPCQueryKey,
    opts?: TRPCFetchQueryOptions<unknown, TRPCClientError<TRouter>>,
  ) => Promise<unknown>;

  /**
   * @see https://tanstack.com/query/v5/docs/framework/react/guides/query-invalidation
   */
  invalidateQueries: (
    queryKey: TRPCQueryKey,
    filters?: InvalidateQueryFilters<TRPCQueryKey>,
    options?: InvalidateOptions,
  ) => Promise<void>;

  /**
   * @see https://tanstack.com/query/v5/docs/reference/QueryClient#queryclientresetqueries
   */
  resetQueries: (
    queryKey: TRPCQueryKey,
    filters?: QueryFilters<TRPCQueryKey>,
    options?: ResetOptions,
  ) => Promise<void>;

  /**
   * @see https://tanstack.com/query/v5/docs/reference/QueryClient#queryclientrefetchqueries
   */
  refetchQueries: (
    queryKey: TRPCQueryKey,
    filters?: RefetchQueryFilters<TRPCQueryKey>,
    options?: RefetchOptions,
  ) => Promise<void>;

  /**
   * @see https://tanstack.com/query/v5/docs/framework/react/guides/query-cancellation
   */
  cancelQuery: (
    queryKey: TRPCQueryKey,
    options?: CancelOptions,
  ) => Promise<void>;

  /**
   * @see https://tanstack.com/query/v5/docs/reference/QueryClient#queryclientsetquerydata
   */
  setQueryData: (
    queryKey: TRPCQueryKey,
    updater: Updater<unknown, unknown>,
    options?: SetDataOptions,
  ) => void;

  /**
   * @see https://tanstack.com/query/v5/docs/reference/QueryClient#queryclientsetqueriesdata
   */
  setQueriesData: (
    queryKey: TRPCQueryKey,
    filters: QueryFilters,
    updater: Updater<unknown, unknown>,
    options?: SetDataOptions,
  ) => [QueryKey, unknown][];

  /**
   * @see https://tanstack.com/query/v5/docs/reference/QueryClient#queryclientgetquerydata
   */
  getQueryData: (queryKey: TRPCQueryKey) => unknown;

  /**
   * @see https://tanstack.com/query/v5/docs/reference/QueryClient#queryclientsetquerydata
   */
  setInfiniteQueryData: (
    queryKey: TRPCQueryKey,
    updater: Updater<
      InfiniteData<unknown> | undefined,
      InfiniteData<unknown> | undefined
    >,
    options?: SetDataOptions,
  ) => void;

  /**
   * @see https://tanstack.com/query/v5/docs/reference/QueryClient#queryclientgetquerydata
   */
  getInfiniteQueryData: (
    queryKey: TRPCQueryKey,
  ) => InfiniteData<unknown> | undefined;

  /**
   * @see https://tanstack.com/query/latest/docs/reference/QueryClient/#queryclientsetmutationdefaults
   */
  setMutationDefaults: (
    mutationKey: TRPCMutationKey,
    options:
      | MutationOptions
      | ((args: {
          canonicalMutationFn: (input: unknown) => Promise<unknown>;
        }) => MutationOptions),
  ) => void;

  /**
   * @see https://tanstack.com/query/latest/docs/reference/QueryClient#queryclientgetmutationdefaults
   */
  getMutationDefaults: (
    mutationKey: TRPCMutationKey,
  ) => MutationOptions | undefined;

  /**
   * @see https://tanstack.com/query/latest/docs/reference/QueryClient#queryclientismutating
   */
  isMutating: (filters: { mutationKey: TRPCMutationKey }) => number;
}
export const TRPCContext = React.createContext?.(null as any);
