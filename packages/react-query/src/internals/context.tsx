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
  TRPCClient,
  TRPCClientError,
  TRPCRequestOptions,
  inferRouterProxyClient,
} from '@trpc/client';
import type {
  AnyRouter,
  inferHandlerInput,
  inferProcedureInput,
} from '@trpc/server';
import type { inferTransformedProcedureOutput } from '@trpc/server/shared';
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
  client: TRPCClient<TRouter>;
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

/** @internal */
export interface TRPCContextState<
  TRouter extends AnyRouter,
  TSSRContext = undefined,
> extends Required<TRPCContextProps<TRouter, TSSRContext>> {
  /**
   * @link https://tanstack.com/query/v4/docs/reference/QueryClient#queryclientfetchquery
   */
  fetchQuery<
    TPath extends keyof TRouter['_def']['queries'] & string,
    TProcedure extends TRouter['_def']['queries'][TPath],
    TOutput extends inferTransformedProcedureOutput<TProcedure>,
    TInput extends inferProcedureInput<TProcedure>,
  >(
    pathAndInput: [path: TPath, ...args: inferHandlerInput<TProcedure>],
    opts?: TRPCFetchQueryOptions<TInput, TRPCClientError<TRouter>, TOutput>,
  ): Promise<TOutput>;
  /**
   * @link https://tanstack.com/query/v4/docs/reference/QueryClient#queryclientfetchinfinitequery
   */
  fetchInfiniteQuery<
    TPath extends keyof TRouter['_def']['queries'] & string,
    TProcedure extends TRouter['_def']['queries'][TPath],
    TOutput extends inferTransformedProcedureOutput<TProcedure>,
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
    TOutput extends inferTransformedProcedureOutput<TProcedure>,
    TInput extends inferProcedureInput<TProcedure>,
  >(
    pathAndInput: [path: TPath, ...args: inferHandlerInput<TProcedure>],
    opts?: TRPCFetchQueryOptions<TInput, TRPCClientError<TRouter>, TOutput>,
  ): Promise<void>;

  /**
   * @link https://tanstack.com/query/v4/docs/reference/QueryClient#queryclientprefetchinfinitequery
   */
  prefetchInfiniteQuery<
    TPath extends keyof TRouter['_def']['queries'] & string,
    TProcedure extends TRouter['_def']['queries'][TPath],
    TOutput extends inferTransformedProcedureOutput<TProcedure>,
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
   * @link https://react-query.tanstack.com/reference/QueryClient#queryclientresetqueries
   */
  resetQueries<
    TPath extends keyof TRouter['_def']['queries'] & string,
    TInput extends inferProcedureInput<TRouter['_def']['queries'][TPath]>,
  >(
    pathAndInput?: [TPath, TInput?] | TPath,
    filters?: ResetQueryFilters,
    options?: ResetOptions,
  ): Promise<void>;

  /**
   * @link https://react-query.tanstack.com/reference/QueryClient#queryclientresetqueries
   */
  resetQueries(
    filters?: ResetQueryFilters,
    options?: ResetOptions,
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
    TOutput extends inferTransformedProcedureOutput<
      TRouter['_def']['queries'][TPath]
    >,
  >(
    pathAndInput: [TPath, TInput?],
    updater: Updater<TOutput | undefined, TOutput | undefined>,
    options?: SetDataOptions,
  ): void;
  /**
   * @link https://react-query.tanstack.com/reference/QueryClient#queryclientgetquerydata
   */
  getQueryData<
    TPath extends keyof TRouter['_def']['queries'] & string,
    TInput extends inferProcedureInput<TRouter['_def']['queries'][TPath]>,
    TOutput extends inferTransformedProcedureOutput<
      TRouter['_def']['queries'][TPath]
    >,
  >(
    pathAndInput: [TPath, TInput?],
  ): TOutput | undefined;
  /**
   * @link https://react-query.tanstack.com/reference/QueryClient#queryclientsetquerydata
   */
  setInfiniteQueryData<
    TPath extends keyof TRouter['_def']['queries'] & string,
    TInput extends inferProcedureInput<TRouter['_def']['queries'][TPath]>,
    TOutput extends inferTransformedProcedureOutput<
      TRouter['_def']['queries'][TPath]
    >,
  >(
    pathAndInput: [TPath, TInput?],
    updater: Updater<
      InfiniteData<TOutput> | undefined,
      InfiniteData<TOutput> | undefined
    >,
    options?: SetDataOptions,
  ): void;
  /**
   * @link https://react-query.tanstack.com/reference/QueryClient#queryclientgetquerydata
   */
  getInfiniteQueryData<
    TPath extends keyof TRouter['_def']['queries'] & string,
    TInput extends inferProcedureInput<TRouter['_def']['queries'][TPath]>,
    TOutput extends inferTransformedProcedureOutput<
      TRouter['_def']['queries'][TPath]
    >,
  >(
    pathAndInput: [TPath, TInput?],
  ): InfiniteData<TOutput> | undefined;
}

export const TRPCContext = createContext(null as any);
