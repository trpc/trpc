import {
  CancelOptions,
  InfiniteData,
  InvalidateOptions,
  InvalidateQueryFilters,
  RefetchOptions,
  RefetchQueryFilters,
  ResetOptions,
  ResetQueryFilters,
  SetDataOptions,
  Updater,
} from '@tanstack/react-query';
import { TRPCClientError } from '@trpc/client';
import { AnyRouter } from '@trpc/server';
import {
  TRPCContextProps,
  TRPCFetchInfiniteQueryOptions,
  TRPCFetchQueryOptions,
} from './context';

export interface TRPCUntypedContextState<
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
