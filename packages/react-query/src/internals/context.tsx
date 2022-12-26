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
    pathAndInput: [path: string, ...args: unknown[]],
    opts?: TRPCFetchQueryOptions<unknown, TRPCClientError<TRouter>, unknown>,
  ) => Promise<unknown>;
  /**
   * @link https://tanstack.com/query/v4/docs/reference/QueryClient#queryclientfetchinfinitequery
   */
  fetchInfiniteQuery: (
    pathAndInput: [path: string, ...args: unknown[]],
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
    pathAndInput: [path: string, ...args: unknown[]],
    opts?: TRPCFetchQueryOptions<unknown, TRPCClientError<TRouter>, unknown>,
  ) => Promise<void>;

  /**
   * @link https://tanstack.com/query/v4/docs/reference/QueryClient#queryclientprefetchinfinitequery
   */
  prefetchInfiniteQuery: (
    pathAndInput: [path: string, ...args: unknown[]],
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
    pathAndInput?: [string, unknown?] | string,
    filters?: InvalidateQueryFilters,
    options?: InvalidateOptions,
  ) => Promise<void>;

  /**
   * @link https://react-query.tanstack.com/reference/QueryClient#queryclientresetqueries
   */
  resetQueries:
    | ((
        pathAndInput?: [string, unknown?] | string,
        filters?: ResetQueryFilters,
        options?: ResetOptions,
      ) => Promise<void>)
    | ((filters?: ResetQueryFilters, options?: ResetOptions) => Promise<void>);

  /**
   * @link https://react-query.tanstack.com/reference/QueryClient#queryclientrefetchqueries
   */
  refetchQueries:
    | ((
        pathAndInput: [string, unknown?],
        filters?: RefetchQueryFilters,
        options?: RefetchOptions,
      ) => Promise<void>)
    | ((
        filters?: RefetchQueryFilters,
        options?: RefetchOptions,
      ) => Promise<void>);

  /**
   * @link https://react-query.tanstack.com/guides/query-cancellation
   */
  cancelQuery: (
    pathAndInput: [string, unknown?],
    options?: CancelOptions,
  ) => Promise<void>;
  /**
   * @link https://react-query.tanstack.com/reference/QueryClient#queryclientsetquerydata
   */
  setQueryData: (
    pathAndInput: [string, unknown?],
    updater: Updater<unknown | undefined, unknown | undefined>,
    options?: SetDataOptions,
  ) => void;
  /**
   * @link https://react-query.tanstack.com/reference/QueryClient#queryclientgetquerydata
   */
  getQueryData: (pathAndInput: [string, unknown?]) => unknown | undefined;
  /**
   * @link https://react-query.tanstack.com/reference/QueryClient#queryclientsetquerydata
   */
  setInfiniteQueryData: (
    pathAndInput: [string, unknown?],
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
    pathAndInput: [string, unknown?],
  ) => InfiniteData<unknown> | undefined;
}
export const TRPCContext = createContext(null as any);
