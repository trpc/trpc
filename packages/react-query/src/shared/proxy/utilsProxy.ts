import type {
  CancelOptions,
  InfiniteData,
  InvalidateOptions,
  InvalidateQueryFilters,
  Query,
  QueryFilters,
  QueryKey,
  RefetchOptions,
  RefetchQueryFilters,
  ResetOptions,
  SetDataOptions,
  Updater,
} from '@tanstack/react-query';
import type { TRPCClientError } from '@trpc/client';
import { createTRPCClientProxy } from '@trpc/client';
import type {
  AnyQueryProcedure,
  AnyRootTypes,
  AnyRouter,
  DeepPartial,
  inferProcedureInput,
  inferTransformedProcedureOutput,
  ProtectedIntersection,
  RouterRecord,
} from '@trpc/server/unstable-core-do-not-import';
import {
  createFlatProxy,
  createRecursiveProxy,
} from '@trpc/server/unstable-core-do-not-import';
import type {
  DecoratedTRPCContextProps,
  TRPCContextState,
  TRPCFetchInfiniteQueryOptions,
  TRPCFetchQueryOptions,
  TRPCQueryUtils,
} from '../../internals/context';
import { contextProps } from '../../internals/context';
import type { QueryKeyKnown, QueryType } from '../../internals/getQueryKey';
import { getQueryKeyInternal } from '../../internals/getQueryKey';
import type { ExtractCursorType } from '../hooks/types';

type DecorateProcedure<
  TRoot extends AnyRootTypes,
  TProcedure extends AnyQueryProcedure,
> = {
  /**
   * @link https://tanstack.com/query/v5/docs/reference/QueryClient#queryclientfetchquery
   */
  fetch(
    input: inferProcedureInput<TProcedure>,
    opts?: TRPCFetchQueryOptions<
      inferTransformedProcedureOutput<TRoot, TProcedure>,
      TRPCClientError<TRoot>
    >,
  ): Promise<inferTransformedProcedureOutput<TRoot, TProcedure>>;

  /**
   * @link https://tanstack.com/query/v5/docs/reference/QueryClient#queryclientfetchinfinitequery
   */
  fetchInfinite(
    input: inferProcedureInput<TProcedure>,
    opts?: TRPCFetchInfiniteQueryOptions<
      inferProcedureInput<TProcedure>,
      inferTransformedProcedureOutput<TRoot, TProcedure>,
      TRPCClientError<TRoot>
    >,
  ): Promise<
    InfiniteData<
      inferTransformedProcedureOutput<TRoot, TProcedure>,
      NonNullable<ExtractCursorType<inferProcedureInput<TProcedure>>> | null
    >
  >;

  /**
   * @link https://tanstack.com/query/v5/docs/reference/QueryClient#queryclientprefetchquery
   */
  prefetch(
    input: inferProcedureInput<TProcedure>,
    opts?: TRPCFetchQueryOptions<
      inferTransformedProcedureOutput<TRoot, TProcedure>,
      TRPCClientError<TRoot>
    >,
  ): Promise<void>;

  /**
   * @link https://tanstack.com/query/v5/docs/reference/QueryClient#queryclientprefetchinfinitequery
   */
  prefetchInfinite(
    input: inferProcedureInput<TProcedure>,
    opts?: TRPCFetchInfiniteQueryOptions<
      inferProcedureInput<TProcedure>,
      inferTransformedProcedureOutput<TRoot, TProcedure>,
      TRPCClientError<TRoot>
    >,
  ): Promise<void>;

  /**
   * @link https://tanstack.com/query/v5/docs/reference/QueryClient#queryclientensurequerydata
   */
  ensureData(
    input: inferProcedureInput<TProcedure>,
    opts?: TRPCFetchQueryOptions<
      inferTransformedProcedureOutput<TRoot, TProcedure>,
      TRPCClientError<TRoot>
    >,
  ): Promise<inferTransformedProcedureOutput<TRoot, TProcedure>>;

  /**
   * @link https://tanstack.com/query/v5/docs/reference/QueryClient#queryclientinvalidatequeries
   */
  invalidate(
    input?: DeepPartial<inferProcedureInput<TProcedure>>,
    filters?: Omit<InvalidateQueryFilters, 'predicate'> & {
      predicate?: (
        query: Query<
          inferProcedureInput<TProcedure>,
          TRPCClientError<TRoot>,
          inferProcedureInput<TProcedure>,
          QueryKeyKnown<
            inferProcedureInput<TProcedure>,
            inferProcedureInput<TProcedure> extends { cursor?: any } | void
              ? 'infinite'
              : 'query'
          >
        >,
      ) => boolean;
    },
    options?: InvalidateOptions,
  ): Promise<void>;

  /**
   * @link https://tanstack.com/query/v5/docs/reference/QueryClient#queryclientrefetchqueries
   */
  refetch(
    input?: inferProcedureInput<TProcedure>,
    filters?: RefetchQueryFilters,
    options?: RefetchOptions,
  ): Promise<void>;

  /**
   * @link https://tanstack.com/query/v5/docs/reference/QueryClient#queryclientcancelqueries
   */
  cancel(
    input?: inferProcedureInput<TProcedure>,
    options?: CancelOptions,
  ): Promise<void>;

  /**
   * @link https://tanstack.com/query/v5/docs/reference/QueryClient#queryclientresetqueries
   */
  reset(
    input?: inferProcedureInput<TProcedure>,
    options?: ResetOptions,
  ): Promise<void>;

  /**
   * @link https://tanstack.com/query/v5/docs/reference/QueryClient#queryclientsetquerydata
   */
  setData(
    /**
     * The input of the procedure
     */
    input: inferProcedureInput<TProcedure>,
    updater: Updater<
      inferTransformedProcedureOutput<TRoot, TProcedure> | undefined,
      inferTransformedProcedureOutput<TRoot, TProcedure> | undefined
    >,
    options?: SetDataOptions,
  ): void;

  /**
   * @link https://tanstack.com/query/v5/docs/reference/QueryClient#queryclientsetquerydata
   */
  setQueriesData(
    /**
     * The input of the procedure
     */
    input: inferProcedureInput<TProcedure>,
    filters: QueryFilters,
    updater: Updater<
      inferTransformedProcedureOutput<TRoot, TProcedure> | undefined,
      inferTransformedProcedureOutput<TRoot, TProcedure> | undefined
    >,
    options?: SetDataOptions,
  ): [QueryKey, inferTransformedProcedureOutput<TRoot, TProcedure>];

  /**
   * @link https://tanstack.com/query/v5/docs/reference/QueryClient#queryclientsetquerydata
   */
  setInfiniteData(
    input: inferProcedureInput<TProcedure>,
    updater: Updater<
      | InfiniteData<
          inferTransformedProcedureOutput<TRoot, TProcedure>,
          NonNullable<ExtractCursorType<inferProcedureInput<TProcedure>>> | null
        >
      | undefined,
      | InfiniteData<
          inferTransformedProcedureOutput<TRoot, TProcedure>,
          NonNullable<ExtractCursorType<inferProcedureInput<TProcedure>>> | null
        >
      | undefined
    >,
    options?: SetDataOptions,
  ): void;

  /**
   * @link https://tanstack.com/query/v5/docs/reference/QueryClient#queryclientgetquerydata
   */
  getData(
    input?: inferProcedureInput<TProcedure>,
  ): inferTransformedProcedureOutput<TRoot, TProcedure> | undefined;

  /**
   * @link https://tanstack.com/query/v5/docs/reference/QueryClient#queryclientgetquerydata
   */
  getInfiniteData(
    input?: inferProcedureInput<TProcedure>,
  ):
    | InfiniteData<
        inferTransformedProcedureOutput<TRoot, TProcedure>,
        NonNullable<ExtractCursorType<inferProcedureInput<TProcedure>>> | null
      >
    | undefined;
};

/**
 * this is the type that is used to add in procedures that can be used on
 * an entire router
 */
type DecorateRouter = {
  /**
   * Invalidate the full router
   * @link https://trpc.io/docs/v10/useContext#query-invalidation
   * @link https://tanstack.com/query/v5/docs/framework/react/guides/query-invalidation
   */
  invalidate(
    input?: undefined,
    filters?: InvalidateQueryFilters,
    options?: InvalidateOptions,
  ): Promise<void>;
};

/**
 * @internal
 */
export type DecoratedProcedureUtilsRecord<
  TRoot extends AnyRootTypes,
  TRecord extends RouterRecord,
> = DecorateRouter & {
  [TKey in keyof TRecord]: TRecord[TKey] extends infer $Value
    ? $Value extends RouterRecord
      ? DecoratedProcedureUtilsRecord<TRoot, $Value> & DecorateRouter
      : // utils only apply to queries
      $Value extends AnyQueryProcedure
      ? DecorateProcedure<TRoot, $Value>
      : never
    : never;
}; // Add functions that should be available at utils root

type AnyDecoratedProcedure = DecorateProcedure<any, any>;

export type CreateReactUtils<
  TRouter extends AnyRouter,
  TSSRContext,
> = ProtectedIntersection<
  DecoratedTRPCContextProps<TRouter, TSSRContext>,
  DecoratedProcedureUtilsRecord<
    TRouter['_def']['_config']['$types'],
    TRouter['_def']['record']
  >
>;

export type CreateQueryUtils<TRouter extends AnyRouter> =
  DecoratedProcedureUtilsRecord<
    TRouter['_def']['_config']['$types'],
    TRouter['_def']['record']
  >;

export const getQueryType = (
  utilName: keyof AnyDecoratedProcedure,
): QueryType => {
  switch (utilName) {
    case 'fetch':
    case 'ensureData':
    case 'prefetch':
    case 'getData':
    case 'setData':
    case 'setQueriesData':
      return 'query';

    case 'fetchInfinite':
    case 'prefetchInfinite':
    case 'getInfiniteData':
    case 'setInfiniteData':
      return 'infinite';

    case 'cancel':
    case 'invalidate':
    case 'refetch':
    case 'reset':
      return 'any';
  }
};

/**
 * @internal
 */
function createRecursiveUtilsProxy<TRouter extends AnyRouter>(
  context: TRPCQueryUtils<TRouter>,
  key: string,
) {
  return createRecursiveProxy((opts) => {
    const path = [key, ...opts.path];
    const utilName = path.pop() as keyof AnyDecoratedProcedure;
    const args = [...opts.args] as Parameters<
      AnyDecoratedProcedure[typeof utilName]
    >;
    const input = args.shift(); // args can now be spread when input removed
    const queryType = getQueryType(utilName);
    const queryKey = getQueryKeyInternal(path, input, queryType);

    const contextMap: Record<keyof AnyDecoratedProcedure, () => unknown> = {
      fetch: () => context.fetchQuery(queryKey, ...args),
      fetchInfinite: () => context.fetchInfiniteQuery(queryKey, args[0]),
      prefetch: () => context.prefetchQuery(queryKey, ...args),
      prefetchInfinite: () => context.prefetchInfiniteQuery(queryKey, args[0]),
      ensureData: () => context.ensureQueryData(queryKey, ...args),
      invalidate: () => context.invalidateQueries(queryKey, ...args),
      reset: () => context.resetQueries(queryKey, ...args),
      refetch: () => context.refetchQueries(queryKey, ...args),
      cancel: () => context.cancelQuery(queryKey, ...args),
      setData: () => {
        context.setQueryData(queryKey, args[0], args[1]);
      },
      setQueriesData: () =>
        context.setQueriesData(queryKey, args[0], args[1], args[2]),
      setInfiniteData: () => {
        context.setInfiniteQueryData(queryKey, args[0], args[1]);
      },
      getData: () => context.getQueryData(queryKey),
      getInfiniteData: () => context.getInfiniteQueryData(queryKey),
    };

    return contextMap[utilName]();
  });
}

/**
 * @internal
 */
export function createReactQueryUtils<TRouter extends AnyRouter, TSSRContext>(
  context: TRPCContextState<AnyRouter, TSSRContext>,
) {
  type CreateReactUtilsReturnType = CreateReactUtils<TRouter, TSSRContext>;

  return createFlatProxy<CreateReactUtilsReturnType>((key) => {
    const contextName = key as (typeof contextProps)[number];
    if (contextName === 'client') {
      return createTRPCClientProxy(context.client);
    }
    if (contextProps.includes(contextName)) {
      return context[contextName];
    }

    return createRecursiveUtilsProxy(context, key);
  });
}

/**
 * @internal
 */
export function createQueryUtilsProxy<TRouter extends AnyRouter>(
  context: TRPCQueryUtils<TRouter>,
): CreateQueryUtils<TRouter> {
  return createFlatProxy((key) => {
    return createRecursiveUtilsProxy(context, key);
  });
}
