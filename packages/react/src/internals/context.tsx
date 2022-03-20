import { TRPCClient, TRPCClientError, TRPCRequestOptions } from '@trpc/client';
import type {
  AnyRouter,
  inferHandlerInput,
  inferProcedureInput,
  inferProcedureOutput,
} from '@trpc/server';
import { createContext } from 'react';
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
  SetDataOptions,
} from 'react-query';
import { Updater } from 'react-query/types/core/utils';

interface TRPCFetchQueryOptions<TInput, TError, TOutput>
  extends FetchQueryOptions<TInput, TError, TOutput>,
    TRPCRequestOptions {}

interface TRPCFetchInfiniteQueryOptions<TInput, TError, TOutput>
  extends FetchInfiniteQueryOptions<TInput, TError, TOutput>,
    TRPCRequestOptions {}

export type SSRState = false | 'prepass' | 'mounting' | 'mounted';
export interface TRPCContextState<
  TRouter extends AnyRouter,
  TSSRContext = undefined,
> {
  queryClient: QueryClient;
  client: TRPCClient<TRouter>;
  /**
   * @deprecated use `ssrState === 'prepass'`
   */
  isPrepass: boolean;
  ssrContext: TSSRContext | null;
  /**
   * State of SSR hydration.
   * - `false` if not using SSR.
   * - `prepass` when doing a prepass to fetch queries' data
   * - `mounting` before TRPCProvider has been rendered on the client
   * - `mounted` when the TRPCProvider has been rendered on the client
   */
  ssrState: SSRState;

  /**
   * @link https://react-query.tanstack.com/guides/prefetching
   */
  fetchQuery<
    TPath extends keyof TRouter['_def']['queries'] & string,
    TProcedure extends TRouter['_def']['queries'][TPath],
    TOutput extends inferProcedureOutput<TProcedure>,
    TInput extends inferProcedureInput<TProcedure>,
  >(
    pathAndInput: [path: TPath, ...args: inferHandlerInput<TProcedure>],
    opts?: TRPCFetchQueryOptions<TInput, TRPCClientError<TRouter>, TOutput>,
  ): Promise<TOutput>;
  /**
   * @link https://react-query.tanstack.com/guides/prefetching
   */
  fetchInfiniteQuery<
    TPath extends keyof TRouter['_def']['queries'] & string,
    TProcedure extends TRouter['_def']['queries'][TPath],
    TOutput extends inferProcedureOutput<TProcedure>,
    TInput extends inferProcedureInput<TProcedure>,
  >(
    pathAndInput: [path: TPath, ...args: inferHandlerInput<TProcedure>],
    opts?: TRPCFetchInfiniteQueryOptions<
      TInput,
      TRPCClientError<TRouter>,
      TOutput
    >,
  ): Promise<InfiniteData<TOutput>>;
  /**
   * @link https://react-query.tanstack.com/guides/prefetching
   */
  prefetchQuery<
    TPath extends keyof TRouter['_def']['queries'] & string,
    TProcedure extends TRouter['_def']['queries'][TPath],
    TOutput extends inferProcedureOutput<TProcedure>,
    TInput extends inferProcedureInput<TProcedure>,
  >(
    pathAndInput: [path: TPath, ...args: inferHandlerInput<TProcedure>],
    opts?: TRPCFetchQueryOptions<TInput, TRPCClientError<TRouter>, TOutput>,
  ): Promise<void>;

  /**
   * @link https://react-query.tanstack.com/guides/prefetching
   */
  prefetchInfiniteQuery<
    TPath extends keyof TRouter['_def']['queries'] & string,
    TProcedure extends TRouter['_def']['queries'][TPath],
    TOutput extends inferProcedureOutput<TProcedure>,
    TInput extends inferProcedureInput<TProcedure>,
  >(
    pathAndInput: [path: TPath, ...args: inferHandlerInput<TProcedure>],
    opts?: TRPCFetchInfiniteQueryOptions<
      TInput,
      TRPCClientError<TRouter>,
      TOutput
    >,
  ): Promise<void>;

  /**
   * @deprecated use `invalidateQueries`
   */
  invalidateQuery<
    TPath extends keyof TRouter['_def']['queries'] & string,
    TInput extends inferProcedureInput<TRouter['_def']['queries'][TPath]>,
  >(
    pathAndInput: [TPath, TInput?],
    options?: InvalidateOptions,
  ): Promise<void>;

  /**
   * @link https://react-query.tanstack.com/guides/query-invalidation
   */
  invalidateQueries<
    TPath extends keyof TRouter['_def']['queries'] & string,
    TInput extends inferProcedureInput<TRouter['_def']['queries'][TPath]>,
  >(
    pathAndInput?: [TPath, TInput?] | TPath,
    filters?: InvalidateQueryFilters,
    options?: InvalidateOptions,
  ): Promise<void>;
  /**
   * @link https://react-query.tanstack.com/guides/query-invalidation
   */
  invalidateQueries(
    filters?: InvalidateQueryFilters,
    options?: InvalidateOptions,
  ): Promise<void>;

  /**
   * @link https://react-query.tanstack.com/reference/QueryClient#queryclientrefetchqueries
   */
  refetchQueries<
    TPath extends keyof TRouter['_def']['queries'] & string,
    TInput extends inferProcedureInput<TRouter['_def']['queries'][TPath]>,
  >(
    pathAndInput: [TPath, TInput?],
    filters?: RefetchQueryFilters,
    options?: RefetchOptions,
  ): Promise<void>;
  /**
   * @link https://react-query.tanstack.com/reference/QueryClient#queryclientrefetchqueries
   */
  refetchQueries(
    filters?: RefetchQueryFilters,
    options?: RefetchOptions,
  ): Promise<void>;

  /**
   * @link https://react-query.tanstack.com/guides/query-cancellation
   */
  cancelQuery<
    TPath extends keyof TRouter['_def']['queries'] & string,
    TInput extends inferProcedureInput<TRouter['_def']['queries'][TPath]>,
  >(
    pathAndInput: [TPath, TInput?],
    options?: CancelOptions,
  ): Promise<void>;
  /**
   * @link https://react-query.tanstack.com/reference/QueryClient#queryclientsetquerydata
   */
  setQueryData<
    TPath extends keyof TRouter['_def']['queries'] & string,
    TInput extends inferProcedureInput<TRouter['_def']['queries'][TPath]>,
    TOutput extends inferProcedureOutput<TRouter['_def']['queries'][TPath]>,
  >(
    pathAndInput: [TPath, TInput?],
    updater: Updater<TOutput | undefined, TOutput>,
    options?: SetDataOptions,
  ): void;
  /**
   * @link https://react-query.tanstack.com/reference/QueryClient#queryclientgetquerydata
   */
  getQueryData<
    TPath extends keyof TRouter['_def']['queries'] & string,
    TInput extends inferProcedureInput<TRouter['_def']['queries'][TPath]>,
    TOutput extends inferProcedureOutput<TRouter['_def']['queries'][TPath]>,
  >(
    pathAndInput: [TPath, TInput?],
  ): TOutput | undefined;
  /**
   * @link https://react-query.tanstack.com/reference/QueryClient#queryclientgetquerydata
   */
  setInfiniteQueryData<
    TPath extends keyof TRouter['_def']['queries'] & string,
    TInput extends inferProcedureInput<TRouter['_def']['queries'][TPath]>,
    TOutput extends inferProcedureOutput<TRouter['_def']['queries'][TPath]>,
  >(
    pathAndInput: [TPath, TInput?],
    updater: Updater<InfiniteData<TOutput> | undefined, InfiniteData<TOutput>>,
    options?: SetDataOptions,
  ): void;
  /**
   * @link https://react-query.tanstack.com/reference/QueryClient#queryclientgetquerydata
   */
  getInfiniteQueryData<
    TPath extends keyof TRouter['_def']['queries'] & string,
    TInput extends inferProcedureInput<TRouter['_def']['queries'][TPath]>,
    TOutput extends inferProcedureOutput<TRouter['_def']['queries'][TPath]>,
  >(
    pathAndInput: [TPath, TInput?],
  ): InfiniteData<TOutput> | undefined;
}

export const TRPCContext = createContext(null as any);
