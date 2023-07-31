import {
  CancelOptions,
  FetchInfiniteQueryOptions,
  FetchQueryOptions,
  InfiniteData,
  InvalidateOptions,
  InvalidateQueryFilters,
  QueryClient,
  QueryFilters,
  RefetchOptions,
  RefetchQueryFilters,
  ResetOptions,
  SetDataOptions,
  Updater,
} from '@tanstack/react-query';
import {
  CreateTRPCProxyClient,
  TRPCClientError,
  TRPCRequestOptions,
  TRPCUntypedClient,
} from '@trpc/client';
import type { AnyRouter, DistributiveOmit } from '@trpc/server';
import { createContext } from 'react';
import { ExtractCursorType } from '../shared';
import { TRPCQueryKey } from './getQueryKey';

export type TRPCFetchQueryOptions<TOutput, TError> = DistributiveOmit<
  FetchQueryOptions<TOutput, TError>,
  'queryKey'
> &
  TRPCRequestOptions;

export type TRPCFetchInfiniteQueryOptions<TInput, TOutput, TError> =
  DistributiveOmit<
    FetchInfiniteQueryOptions<
      TOutput,
      TError,
      TOutput,
      TRPCQueryKey,
      ExtractCursorType<TInput>
    >,
    'queryKey' | 'defaultPageParam'
  > &
    TRPCRequestOptions & {
      initialCursor?: ExtractCursorType<TInput>;
    };

/** @internal */
export type SSRState = 'mounted' | 'mounting' | 'prepass' | false;

export interface ProxyTRPCContextProps<TRouter extends AnyRouter, TSSRContext> {
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
export type DecoratedProxyTRPCContextProps<
  TRouter extends AnyRouter,
  TSSRContext,
> = ProxyTRPCContextProps<TRouter, TSSRContext> & {
  client: CreateTRPCProxyClient<TRouter>;
};

export interface TRPCContextProps<TRouter extends AnyRouter, TSSRContext>
  extends ProxyTRPCContextProps<TRouter, TSSRContext> {
  /**
   * The react-query `QueryClient`
   */
  queryClient: QueryClient;
}

export const contextProps: (keyof ProxyTRPCContextProps<any, any>)[] = [
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
> extends Required<TRPCContextProps<TRouter, TSSRContext>> {
  /**
   * @link https://tanstack.com/query/v4/docs/reference/QueryClient#queryclientfetchquery
   */
  fetchQuery: (
    queryKey: TRPCQueryKey,
    opts?: TRPCFetchQueryOptions<unknown, TRPCClientError<TRouter>>,
  ) => Promise<unknown>;
  /**
   * @link https://tanstack.com/query/v4/docs/reference/QueryClient#queryclientfetchinfinitequery
   */
  fetchInfiniteQuery: (
    queryKey: TRPCQueryKey,
    opts?: TRPCFetchInfiniteQueryOptions<
      unknown,
      unknown,
      TRPCClientError<TRouter>
    >,
  ) => Promise<InfiniteData<unknown>>;
  /**
   * @link https://tanstack.com/query/v4/docs/react/guides/prefetching
   */
  prefetchQuery: (
    queryKey: TRPCQueryKey,
    opts?: TRPCFetchQueryOptions<unknown, TRPCClientError<TRouter>>,
  ) => Promise<void>;

  /**
   * @link https://tanstack.com/query/v4/docs/reference/QueryClient#queryclientprefetchinfinitequery
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
   * @link https://tanstack.com/query/v4/docs/react/reference/QueryClient#queryclientensurequerydata
   */
  ensureQueryData: (
    queryKey: TRPCQueryKey,
    opts?: TRPCFetchQueryOptions<unknown, TRPCClientError<TRouter>>,
  ) => Promise<unknown>;

  /**
   * @link https://tanstack.com/query/v4/docs/react/guides/query-invalidation
   */
  invalidateQueries: (
    queryKey: TRPCQueryKey,
    filters?: InvalidateQueryFilters,
    options?: InvalidateOptions,
  ) => Promise<void>;

  /**
   * @link https://tanstack.com/query/v4/docs/react/reference/QueryClient#queryclientresetqueries
   */
  resetQueries: (
    queryKey: TRPCQueryKey,
    filters?: QueryFilters,
    options?: ResetOptions,
  ) => Promise<void>;

  /**
   * @link https://tanstack.com/query/v4/docs/react/reference/QueryClient#queryclientrefetchqueries
   */
  refetchQueries: (
    queryKey: TRPCQueryKey,
    filters?: RefetchQueryFilters,
    options?: RefetchOptions,
  ) => Promise<void>;

  /**
   * @link https://tanstack.com/query/v4/docs/react/guides/query-cancellation
   */
  cancelQuery: (
    queryKey: TRPCQueryKey,
    options?: CancelOptions,
  ) => Promise<void>;

  /**
   * @link https://tanstack.com/query/v4/docs/react/reference/QueryClient#queryclientsetquerydata
   */
  setQueryData: (
    queryKey: TRPCQueryKey,
    updater: Updater<unknown, unknown>,
    options?: SetDataOptions,
  ) => void;

  /**
   * @link https://tanstack.com/query/v4/docs/react/reference/QueryClient#queryclientgetquerydata
   */
  getQueryData: (queryKey: TRPCQueryKey) => unknown;
  /**
   * @link https://tanstack.com/query/v4/docs/react/reference/QueryClient#queryclientsetquerydata
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
   * @link https://tanstack.com/query/v4/docs/react/reference/QueryClient#queryclientgetquerydata
   */
  getInfiniteQueryData: (
    queryKey: TRPCQueryKey,
  ) => InfiniteData<unknown> | undefined;
}
export const TRPCContext = createContext(null as any);
