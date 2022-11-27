import {
  CancelOptions,
  InfiniteData,
  InvalidateOptions,
  InvalidateQueryFilters,
  RefetchOptions,
  RefetchQueryFilters,
  ResetOptions,
  SetDataOptions,
  Updater,
} from '@tanstack/react-query';
import { TRPCClientError, createTRPCClientProxy } from '@trpc/client';
import {
  AnyQueryProcedure,
  AnyRouter,
  Filter,
  ProcedureOptions,
  inferProcedureInput,
} from '@trpc/server';
import {
  createFlatProxy,
  createRecursiveProxy,
  inferTransformedProcedureOutput,
} from '@trpc/server/shared';
import {
  DecoratedProxyTRPCContextProps,
  TRPCContextState,
  TRPCFetchInfiniteQueryOptions,
  TRPCFetchQueryOptions,
  contextProps,
} from '../../internals/context';
import { getQueryKey } from '../../internals/getQueryKey';

type DecorateProcedure<
  TRouter extends AnyRouter,
  TProcedure extends AnyQueryProcedure,
> = {
  /**
   * @link https://react-query.tanstack.com/guides/prefetching
   */
  fetch(
    input: inferProcedureInput<TProcedure>,
    opts?: TRPCFetchQueryOptions<
      inferProcedureInput<TProcedure>,
      TRPCClientError<TRouter>,
      inferTransformedProcedureOutput<TProcedure>
    >,
  ): Promise<inferTransformedProcedureOutput<TProcedure>>;

  /**
   * @link https://react-query.tanstack.com/guides/prefetching
   */
  fetchInfinite(
    input: inferProcedureInput<TProcedure>,
    opts?: TRPCFetchInfiniteQueryOptions<
      inferProcedureInput<TProcedure>,
      TRPCClientError<TRouter>,
      inferTransformedProcedureOutput<TProcedure>
    >,
  ): Promise<InfiniteData<inferTransformedProcedureOutput<TProcedure>>>;

  /**
   * @link https://react-query.tanstack.com/guides/prefetching
   */
  prefetch(
    input: inferProcedureInput<TProcedure>,
    opts?: TRPCFetchQueryOptions<
      inferProcedureInput<TProcedure>,
      TRPCClientError<TRouter>,
      inferTransformedProcedureOutput<TProcedure>
    >,
  ): Promise<void>;

  /**
   * @link https://react-query.tanstack.com/guides/prefetching
   */
  prefetchInfinite(
    input: inferProcedureInput<TProcedure>,
    procedureOpts?: ProcedureOptions,
    opts?: TRPCFetchInfiniteQueryOptions<
      inferProcedureInput<TProcedure>,
      TRPCClientError<TRouter>,
      inferTransformedProcedureOutput<TProcedure>
    >,
  ): Promise<void>;

  /**
   * @link https://react-query.tanstack.com/guides/query-invalidation
   */
  invalidate(
    input?: inferProcedureInput<TProcedure>,
    filters?: InvalidateQueryFilters,
    options?: InvalidateOptions,
  ): Promise<void>;

  /**
   * @link https://react-query.tanstack.com/reference/QueryClient#queryclientrefetchqueries
   */
  refetch(
    input?: inferProcedureInput<TProcedure>,
    filters?: RefetchQueryFilters,
    options?: RefetchOptions,
  ): Promise<void>;

  /**
   * @link https://react-query.tanstack.com/guides/query-cancellation
   */
  cancel(
    input?: inferProcedureInput<TProcedure>,
    options?: CancelOptions,
  ): Promise<void>;

  /**
   * @link https://react-query.tanstack.com/reference/QueryClient#queryclientresetqueries
   */
  reset(
    input?: inferProcedureInput<TProcedure>,
    options?: ResetOptions,
  ): Promise<void>;

  /**
   * @link https://react-query.tanstack.com/reference/QueryClient#queryclientsetquerydata
   */
  setData(
    /**
     * The input of the procedure
     */
    input: inferProcedureInput<TProcedure>,
    updater: Updater<
      inferTransformedProcedureOutput<TProcedure> | undefined,
      inferTransformedProcedureOutput<TProcedure> | undefined
    >,
    options?: SetDataOptions,
  ): void;

  /**
   * @link https://react-query.tanstack.com/reference/QueryClient#queryclientgetquerydata
   */
  setInfiniteData(
    input: inferProcedureInput<TProcedure>,
    updater: Updater<
      InfiniteData<inferTransformedProcedureOutput<TProcedure>> | undefined,
      InfiniteData<inferTransformedProcedureOutput<TProcedure>> | undefined
    >,
    options?: SetDataOptions,
  ): void;

  /**
   * @link https://react-query.tanstack.com/reference/QueryClient#queryclientgetquerydata
   */
  getData(
    input?: inferProcedureInput<TProcedure>,
  ): inferTransformedProcedureOutput<TProcedure> | undefined;

  /**
   * @link https://react-query.tanstack.com/reference/QueryClient#queryclientgetquerydata
   */
  getInfiniteData(
    input?: inferProcedureInput<TProcedure>,
  ): InfiniteData<inferTransformedProcedureOutput<TProcedure>> | undefined;
};

/**
 * this is the type that is used to add in procedures that can be used on
 * an entire router
 */
type DecorateRouter = {
  /**
   * Invalidate the full router
   * @link https://trpc.io/docs/v10/useContext#query-invalidation
   * @link https://react-query.tanstack.com/guides/query-invalidation
   */
  invalidate(
    filters?: InvalidateQueryFilters,
    options?: InvalidateOptions,
  ): Promise<void>;
};

/**
 * @internal
 */
export type DecoratedProcedureUtilsRecord<TRouter extends AnyRouter> = {
  [TKey in keyof Filter<
    TRouter['_def']['record'],
    AnyRouter | AnyQueryProcedure
  >]: TRouter['_def']['record'][TKey] extends AnyRouter
    ? DecoratedProcedureUtilsRecord<TRouter['_def']['record'][TKey]> &
        DecorateRouter
    : // utils only apply to queries
      DecorateProcedure<TRouter, TRouter['_def']['record'][TKey]>;
} & DecorateRouter; // Add functions that should be available at utils root

type AnyDecoratedProcedure = DecorateProcedure<any, any>;

export type CreateReactUtilsProxy<
  TRouter extends AnyRouter,
  TSSRContext,
> = DecoratedProcedureUtilsRecord<TRouter> &
  DecoratedProxyTRPCContextProps<TRouter, TSSRContext>;

/**
 * @internal
 */
export function createReactQueryUtilsProxy<
  TRouter extends AnyRouter,
  TSSRContext,
>(context: TRPCContextState<AnyRouter, unknown>) {
  type CreateReactUtilsProxyReturnType = CreateReactUtilsProxy<
    TRouter,
    TSSRContext
  >;

  return createFlatProxy<CreateReactUtilsProxyReturnType>((key) => {
    const contextName = key as typeof contextProps[number];
    if (contextName === 'client') {
      return createTRPCClientProxy(context.client);
    }
    if (contextProps.includes(contextName)) {
      return context[contextName];
    }

    return createRecursiveProxy(({ path, args }) => {
      const pathCopy = [key, ...path];
      const utilName = pathCopy.pop() as keyof AnyDecoratedProcedure;

      const fullPath = pathCopy.join('.');

      const getOpts = (name: typeof utilName) => {
        if (['setData', 'setInfiniteData'].includes(name)) {
          const [input, updater, ...rest] = args as Parameters<
            AnyDecoratedProcedure[typeof utilName]
          >;
          const queryKey = getQueryKey(fullPath, input);
          return {
            queryKey,
            updater,
            rest,
          };
        }

        const [input, ...rest] = args as Parameters<
          AnyDecoratedProcedure[typeof utilName]
        >;
        const queryKey = getQueryKey(fullPath, input);
        return {
          queryKey,
          rest,
        };
      };

      const { queryKey, rest, updater } = getOpts(utilName);

      const contextMap: Record<keyof AnyDecoratedProcedure, () => unknown> = {
        fetch: () => context.fetchQuery(queryKey, ...rest),
        fetchInfinite: () => context.fetchInfiniteQuery(queryKey, ...rest),
        prefetch: () => context.prefetchQuery(queryKey, ...rest),
        prefetchInfinite: () =>
          context.prefetchInfiniteQuery(queryKey, ...rest),
        invalidate: () => context.invalidateQueries(queryKey, ...rest),
        reset: () => context.resetQueries(queryKey, ...rest),
        refetch: () => context.refetchQueries(queryKey, ...rest),
        cancel: () => context.cancelQuery(queryKey, ...rest),
        setData: () => context.setQueryData(queryKey, updater, ...rest),
        setInfiniteData: () =>
          context.setInfiniteQueryData(queryKey, updater, ...rest),
        getData: () => context.getQueryData(queryKey),
        getInfiniteData: () => context.getInfiniteQueryData(queryKey),
      };

      return contextMap[utilName]();
    });
  });
}
