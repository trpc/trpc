import type {
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
import type {
  CreateTRPCProxyClient,
  TRPCClient,
  TRPCClientError,
  TRPCRequestOptions,
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
export type SSRState = 'mounted' | 'mounting' | 'prepass' | false;

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

/** @internal */
type TRPCContextResetQueries<TRouter extends AnyRouter> =
  /**
   * @link https://tanstack.com/query/v4/docs/react/reference/QueryClient#queryclientresetqueries
   */
  ((filters?: ResetQueryFilters, options?: ResetOptions) => Promise<void>) &
    (<
      TPath extends string & keyof TRouter['_def']['queries'],
      TInput extends inferProcedureInput<TRouter['_def']['queries'][TPath]>,
    >(
      pathAndInput?: TPath | [TPath, TInput?],
      filters?: ResetQueryFilters,
      options?: ResetOptions,
    ) => Promise<void>);

/**
 * @deprecated
 * @internal
 **/
export interface TRPCContextState<
  TRouter extends AnyRouter,
  TSSRContext = undefined,
> extends Required<TRPCContextProps<TRouter, TSSRContext>> {
  /**
   * @link https://tanstack.com/query/v4/docs/reference/QueryClient#queryclientfetchquery
   */
  fetchQuery: <
    TPath extends string & keyof TRouter['_def']['queries'],
    TProcedure extends TRouter['_def']['queries'][TPath],
    TOutput extends inferTransformedProcedureOutput<TProcedure>,
    TInput extends inferProcedureInput<TProcedure>,
  >(
    pathAndInput: [path: TPath, ...args: inferHandlerInput<TProcedure>],
    opts?: TRPCFetchQueryOptions<TInput, TRPCClientError<TProcedure>, TOutput>,
  ) => Promise<TOutput>;

  /**
   * @link https://tanstack.com/query/v4/docs/reference/QueryClient#queryclientfetchinfinitequery
   */
  fetchInfiniteQuery: <
    TPath extends string & keyof TRouter['_def']['queries'],
    TProcedure extends TRouter['_def']['queries'][TPath],
    TOutput extends inferTransformedProcedureOutput<TProcedure>,
    TInput extends inferProcedureInput<TProcedure>,
  >(
    pathAndInput: [path: TPath, ...args: inferHandlerInput<TProcedure>],
    opts?: TRPCFetchInfiniteQueryOptions<
      TInput,
      TRPCClientError<TProcedure>,
      TOutput
    >,
  ) => Promise<InfiniteData<TOutput>>;

  /**
   * @link https://tanstack.com/query/v4/docs/react/guides/prefetching
   */
  prefetchQuery: <
    TPath extends string & keyof TRouter['_def']['queries'],
    TProcedure extends TRouter['_def']['queries'][TPath],
    TOutput extends inferTransformedProcedureOutput<TProcedure>,
    TInput extends inferProcedureInput<TProcedure>,
  >(
    pathAndInput: [path: TPath, ...args: inferHandlerInput<TProcedure>],
    opts?: TRPCFetchQueryOptions<TInput, TRPCClientError<TProcedure>, TOutput>,
  ) => Promise<void>;

  /**
   * @link https://tanstack.com/query/v4/docs/reference/QueryClient#queryclientprefetchinfinitequery
   */
  prefetchInfiniteQuery: <
    TPath extends string & keyof TRouter['_def']['queries'],
    TProcedure extends TRouter['_def']['queries'][TPath],
    TOutput extends inferTransformedProcedureOutput<TProcedure>,
    TInput extends inferProcedureInput<TProcedure>,
  >(
    pathAndInput: [path: TPath, ...args: inferHandlerInput<TProcedure>],
    opts?: TRPCFetchInfiniteQueryOptions<
      TInput,
      TRPCClientError<TProcedure>,
      TOutput
    >,
  ) => Promise<void>;

  /**
   * @link https://tanstack.com/query/v4/docs/react/reference/QueryClient#queryclientensurequerydata
   */
  ensureQueryData: <
    TPath extends string & keyof TRouter['_def']['queries'],
    TProcedure extends TRouter['_def']['queries'][TPath],
    TOutput extends inferTransformedProcedureOutput<TProcedure>,
    TInput extends inferProcedureInput<TProcedure>,
  >(
    pathAndInput: [path: TPath, ...args: inferHandlerInput<TProcedure>],
    opts?: TRPCFetchQueryOptions<TInput, TRPCClientError<TProcedure>, TOutput>,
  ) => Promise<TOutput>;

  /**
   * @link https://tanstack.com/query/v4/docs/react/guides/query-invalidation
   */
  invalidateQueries: <
    TPath extends string & keyof TRouter['_def']['queries'],
    TInput extends inferProcedureInput<TRouter['_def']['queries'][TPath]>,
  >(
    pathAndInput?: TPath | [TPath, TInput?],
    filters?: InvalidateQueryFilters,
    options?: InvalidateOptions,
  ) => Promise<void>;

  /**
   * @link https://tanstack.com/query/v4/docs/react/reference/QueryClient#queryclientresetqueries
   */
  resetQueries: TRPCContextResetQueries<TRouter>;

  /**
   * @link https://tanstack.com/query/v4/docs/react/reference/QueryClient#queryclientrefetchqueries
   */
  refetchQueries<
    TPath extends string & keyof TRouter['_def']['queries'],
    TInput extends inferProcedureInput<TRouter['_def']['queries'][TPath]>,
  >(
    pathAndInput: [TPath, TInput?],
    filters?: RefetchQueryFilters,
    options?: RefetchOptions,
  ): Promise<void>;

  /**
   * @link https://tanstack.com/query/v4/docs/react/reference/QueryClient#queryclientrefetchqueries
   */
  refetchQueries(
    filters?: RefetchQueryFilters,
    options?: RefetchOptions,
  ): Promise<void>;

  /**
   * @link https://tanstack.com/query/v4/docs/react/guides/query-cancellation
   */
  cancelQuery: <
    TPath extends string & keyof TRouter['_def']['queries'],
    TInput extends inferProcedureInput<TRouter['_def']['queries'][TPath]>,
  >(
    pathAndInput: [TPath, TInput?],
    options?: CancelOptions,
  ) => Promise<void>;

  /**
   * @link https://tanstack.com/query/v4/docs/react/reference/QueryClient#queryclientsetquerydata
   */
  setQueryData: <
    TPath extends string & keyof TRouter['_def']['queries'],
    TInput extends inferProcedureInput<TRouter['_def']['queries'][TPath]>,
    TOutput extends inferTransformedProcedureOutput<
      TRouter['_def']['queries'][TPath]
    >,
  >(
    pathAndInput: [TPath, TInput?],
    updater: Updater<TOutput | undefined, TOutput | undefined>,
    options?: SetDataOptions,
  ) => void;

  /**
   * @link https://tanstack.com/query/v4/docs/react/reference/QueryClient#queryclientgetquerydata
   */
  getQueryData: <
    TPath extends string & keyof TRouter['_def']['queries'],
    TInput extends inferProcedureInput<TRouter['_def']['queries'][TPath]>,
    TOutput extends inferTransformedProcedureOutput<
      TRouter['_def']['queries'][TPath]
    >,
  >(
    pathAndInput: [TPath, TInput?],
  ) => TOutput | undefined;

  /**
   * @link https://tanstack.com/query/v4/docs/react/reference/QueryClient#queryclientsetquerydata
   */
  setInfiniteQueryData: <
    TPath extends string & keyof TRouter['_def']['queries'],
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
  ) => void;

  /**
   * @link https://tanstack.com/query/v4/docs/react/reference/QueryClient#queryclientgetquerydata
   */
  getInfiniteQueryData: <
    TPath extends string & keyof TRouter['_def']['queries'],
    TInput extends inferProcedureInput<TRouter['_def']['queries'][TPath]>,
    TOutput extends inferTransformedProcedureOutput<
      TRouter['_def']['queries'][TPath]
    >,
  >(
    pathAndInput: [TPath, TInput?],
  ) => InfiniteData<TOutput> | undefined;
}

export const TRPCContext = createContext(null as any);
