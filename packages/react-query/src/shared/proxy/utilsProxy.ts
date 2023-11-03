import {
  CancelOptions,
  InfiniteData,
  InvalidateOptions,
  InvalidateQueryFilters,
  Query,
  RefetchOptions,
  RefetchQueryFilters,
  ResetOptions,
  SetDataOptions,
  Updater,
} from '@tanstack/react-query';
import { createTRPCClientProxy, TRPCClientError } from '@trpc/client';
import {
  AnyQueryProcedure,
  AnyRootConfig,
  AnyRouter,
  inferProcedureInput,
} from '@trpc/server';
import {
  createFlatProxy,
  createRecursiveProxy,
  inferTransformedProcedureOutput,
} from '@trpc/server/shared';
import {
  DeepPartial,
  Filter,
  ProtectedIntersection,
} from '@trpc/server/unstableInternalsExport';
import {
  contextProps,
  DecoratedTRPCContextProps,
  TRPCContextState,
  TRPCFetchInfiniteQueryOptions,
  TRPCFetchQueryOptions,
} from '../../internals/context';
import {
  getQueryKeyInternal,
  QueryKeyKnown,
  QueryType,
} from '../../internals/getQueryKey';
import { ExtractCursorType } from '../hooks/types';

type DecorateProcedure<
  TConfig extends AnyRootConfig,
  TProcedure extends AnyQueryProcedure,
> = {
  /**
   * @link https://tanstack.com/query/v5/docs/reference/QueryClient#queryclientfetchquery
   */
  fetch(
    input: inferProcedureInput<TProcedure>,
    opts?: TRPCFetchQueryOptions<
      inferTransformedProcedureOutput<TConfig, TProcedure>,
      TRPCClientError<TConfig>
    >,
  ): Promise<inferTransformedProcedureOutput<TConfig, TProcedure>>;

  /**
   * @link https://tanstack.com/query/v5/docs/reference/QueryClient#queryclientfetchinfinitequery
   */
  fetchInfinite(
    input: inferProcedureInput<TProcedure>,
    opts?: TRPCFetchInfiniteQueryOptions<
      inferProcedureInput<TProcedure>,
      inferTransformedProcedureOutput<TConfig, TProcedure>,
      TRPCClientError<TConfig>
    >,
  ): Promise<
    InfiniteData<
      inferTransformedProcedureOutput<TConfig, TProcedure>,
      NonNullable<ExtractCursorType<inferProcedureInput<TProcedure>>> | null
    >
  >;

  /**
   * @link https://tanstack.com/query/v5/docs/reference/QueryClient#queryclientprefetchquery
   */
  prefetch(
    input: inferProcedureInput<TProcedure>,
    opts?: TRPCFetchQueryOptions<
      inferTransformedProcedureOutput<TConfig, TProcedure>,
      TRPCClientError<TConfig>
    >,
  ): Promise<void>;

  /**
   * @link https://tanstack.com/query/v5/docs/reference/QueryClient#queryclientprefetchinfinitequery
   */
  prefetchInfinite(
    input: inferProcedureInput<TProcedure>,
    opts?: TRPCFetchInfiniteQueryOptions<
      inferProcedureInput<TProcedure>,
      inferTransformedProcedureOutput<TConfig, TProcedure>,
      TRPCClientError<TConfig>
    >,
  ): Promise<void>;

  /**
   * @link https://tanstack.com/query/v5/docs/react/reference/QueryClient#queryclientensurequerydata
   */
  ensureData(
    input: inferProcedureInput<TProcedure>,
    opts?: TRPCFetchQueryOptions<
      inferTransformedProcedureOutput<TConfig, TProcedure>,
      TRPCClientError<TConfig>
    >,
  ): Promise<inferTransformedProcedureOutput<TConfig, TProcedure>>;

  /**
   * @link https://tanstack.com/query/v5/docs/reference/QueryClient#queryclientinvalidatequeries
   */
  invalidate(
    input?: DeepPartial<inferProcedureInput<TProcedure>>,
    filters?: Omit<InvalidateQueryFilters, 'predicate'> & {
      predicate?: (
        query: Query<
          inferProcedureInput<TProcedure>,
          TRPCClientError<TConfig>,
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
      inferTransformedProcedureOutput<TConfig, TProcedure> | undefined,
      inferTransformedProcedureOutput<TConfig, TProcedure> | undefined
    >,
    options?: SetDataOptions,
  ): void;

  /**
   * @link https://tanstack.com/query/v5/docs/reference/QueryClient#queryclientsetquerydata
   */
  setInfiniteData(
    input: inferProcedureInput<TProcedure>,
    updater: Updater<
      | InfiniteData<
          inferTransformedProcedureOutput<TConfig, TProcedure>,
          NonNullable<ExtractCursorType<inferProcedureInput<TProcedure>>> | null
        >
      | undefined,
      | InfiniteData<
          inferTransformedProcedureOutput<TConfig, TProcedure>,
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
  ): inferTransformedProcedureOutput<TConfig, TProcedure> | undefined;

  /**
   * @link https://tanstack.com/query/v5/docs/reference/QueryClient#queryclientgetquerydata
   */
  getInfiniteData(
    input?: inferProcedureInput<TProcedure>,
  ):
    | InfiniteData<
        inferTransformedProcedureOutput<TConfig, TProcedure>,
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
   * @link https://tanstack.com/query/v5/docs/react/guides/query-invalidation
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
export type DecoratedProcedureUtilsRecord<TRouter extends AnyRouter> =
  DecorateRouter & {
    [TKey in keyof Filter<
      TRouter['_def']['record'],
      AnyQueryProcedure | AnyRouter
    >]: TRouter['_def']['record'][TKey] extends AnyRouter
      ? DecoratedProcedureUtilsRecord<TRouter['_def']['record'][TKey]> &
          DecorateRouter
      : // utils only apply to queries
        DecorateProcedure<
          TRouter['_def']['_config'],
          TRouter['_def']['record'][TKey]
        >;
  }; // Add functions that should be available at utils root

type AnyDecoratedProcedure = DecorateProcedure<any, any>;

export type CreateReactUtils<
  TRouter extends AnyRouter,
  TSSRContext,
> = ProtectedIntersection<
  DecoratedTRPCContextProps<TRouter, TSSRContext>,
  DecoratedProcedureUtilsRecord<TRouter>
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
export function createReactQueryUtils<TRouter extends AnyRouter, TSSRContext>(
  context: TRPCContextState<AnyRouter, unknown>,
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
        prefetchInfinite: () =>
          context.prefetchInfiniteQuery(queryKey, args[0]),
        ensureData: () => context.ensureQueryData(queryKey, ...args),
        invalidate: () => context.invalidateQueries(queryKey, ...args),
        reset: () => context.resetQueries(queryKey, ...args),
        refetch: () => context.refetchQueries(queryKey, ...args),
        cancel: () => context.cancelQuery(queryKey, ...args),
        setData: () => {
          context.setQueryData(queryKey, args[0], args[1]);
        },
        setInfiniteData: () => {
          context.setInfiniteQueryData(queryKey, args[0], args[1]);
        },
        getData: () => context.getQueryData(queryKey),
        getInfiniteData: () => context.getInfiniteQueryData(queryKey),
      };

      return contextMap[utilName]();
    });
  });
}
