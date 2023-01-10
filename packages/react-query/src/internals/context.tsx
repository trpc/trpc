import {
  CancelOptions,
  FetchInfiniteQueryOptions,
  FetchQueryOptions,
  InfiniteData,
  InvalidateOptions,
  InvalidateQueryFilters,
  QueryClient,
  RefetchOptions,
  RefetchQueryFilters,
  ResetOptions,
  ResetQueryFilters,
  SetDataOptions,
  Updater,
} from '@tanstack/react-query';
import {
  TRPCClientError,
  TRPCRequestOptions,
  TRPCUntypedClient,
  inferRouterProxyClient,
} from '@trpc/client';
import type { AnyRouter } from '@trpc/server';
import { createContext } from 'react';
import { TRPCQueryKey } from './getQueryKey';

export interface TRPCFetchQueryOptions<TInput, TError, TOutput>
  extends FetchQueryOptions<TInput, TError, TOutput>,
    TRPCRequestOptions {}

export interface TRPCFetchInfiniteQueryOptions<TInput, TError, TOutput>
  extends FetchInfiniteQueryOptions<TInput, TError, TOutput>,
    TRPCRequestOptions {}

/** @internal */
export type SSRState = false | 'prepass' | 'mounting' | 'mounted';

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
  client: inferRouterProxyClient<TRouter>;
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
    opts?: TRPCFetchQueryOptions<unknown, TRPCClientError<TRouter>, unknown>,
  ) => Promise<unknown>;
  /**
   * @link https://tanstack.com/query/v4/docs/reference/QueryClient#queryclientfetchinfinitequery
   */
  fetchInfiniteQuery: (
    queryKey: TRPCQueryKey,
    opts?: TRPCFetchInfiniteQueryOptions<
      unknown,
      TRPCClientError<TRouter>,
      unknown
    >,
  ) => Promise<InfiniteData<unknown>>;
  /**
   * @link https://react-query.tanstack.com/guides/prefetching
   */
  prefetchQuery: (
    queryKey: TRPCQueryKey,
    opts?: TRPCFetchQueryOptions<unknown, TRPCClientError<TRouter>, unknown>,
  ) => Promise<void>;

  /**
   * @link https://tanstack.com/query/v4/docs/reference/QueryClient#queryclientprefetchinfinitequery
   */
  prefetchInfiniteQuery: (
    queryKey: TRPCQueryKey,
    opts?: TRPCFetchInfiniteQueryOptions<
      unknown,
      TRPCClientError<TRouter>,
      unknown
    >,
  ) => Promise<void>;

  /**
   * @link https://react-query.tanstack.com/guides/query-invalidation
   */
  invalidateQueries: (
    queryKey: TRPCQueryKey,
    filters?: InvalidateQueryFilters,
    options?: InvalidateOptions,
  ) => Promise<void>;

  /**
   * @link https://react-query.tanstack.com/reference/QueryClient#queryclientresetqueries
   */
  resetQueries: (
    queryKey: TRPCQueryKey,
    filters?: ResetQueryFilters,
    options?: ResetOptions,
  ) => Promise<void>;

  /**
   * @link https://react-query.tanstack.com/reference/QueryClient#queryclientrefetchqueries
   */
  refetchQueries: (
    queryKey: TRPCQueryKey,
    filters?: RefetchQueryFilters,
    options?: RefetchOptions,
  ) => Promise<void>;

  /**
   * @link https://react-query.tanstack.com/guides/query-cancellation
   */
  cancelQuery: (
    queryKey: TRPCQueryKey,
    options?: CancelOptions,
  ) => Promise<void>;
  /**
   * @link https://react-query.tanstack.com/reference/QueryClient#queryclientsetquerydata
   */
  setQueryData: (
    queryKey: TRPCQueryKey,
    updater: Updater<unknown | undefined, unknown | undefined>,
    options?: SetDataOptions,
  ) => void;
  /**
   * @link https://react-query.tanstack.com/reference/QueryClient#queryclientgetquerydata
   */
  getQueryData: (queryKey: TRPCQueryKey) => unknown | undefined;
  /**
   * @link https://react-query.tanstack.com/reference/QueryClient#queryclientsetquerydata
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
   * @link https://react-query.tanstack.com/reference/QueryClient#queryclientgetquerydata
   */
  getInfiniteQueryData: (
    queryKey: TRPCQueryKey,
  ) => InfiniteData<unknown> | undefined;
}
export const TRPCContext = createContext(null as any);
