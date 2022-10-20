import {
  CancelOptions,
  InfiniteData,
  InvalidateOptions,
  InvalidateQueryFilters,
  RefetchOptions,
  RefetchQueryFilters,
  SetDataOptions,
  Updater,
} from '@tanstack/react-query';
import { TRPCClientError } from '@trpc/client';
import {
  AnyQueryProcedure,
  AnyRouter,
  Filter,
  ProcedureOptions,
  inferProcedureInput,
  inferProcedureOutput,
} from '@trpc/server';
import { createFlatProxy, createRecursiveProxy } from '@trpc/server/shared';
import {
  ProxyTRPCContextProps,
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
      inferProcedureOutput<TProcedure>
    >,
  ): Promise<inferProcedureOutput<TProcedure>>;

  /**
   * @link https://react-query.tanstack.com/guides/prefetching
   */
  fetchInfinite(
    input: inferProcedureInput<TProcedure>,
    opts?: TRPCFetchInfiniteQueryOptions<
      inferProcedureInput<TProcedure>,
      TRPCClientError<TRouter>,
      inferProcedureOutput<TProcedure>
    >,
  ): Promise<InfiniteData<inferProcedureOutput<TProcedure>>>;

  /**
   * @link https://react-query.tanstack.com/guides/prefetching
   */
  prefetch(
    input: inferProcedureInput<TProcedure>,
    opts?: TRPCFetchQueryOptions<
      inferProcedureInput<TProcedure>,
      TRPCClientError<TRouter>,
      inferProcedureOutput<TProcedure>
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
      inferProcedureOutput<TProcedure>
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
   * @link https://react-query.tanstack.com/reference/QueryClient#queryclientsetquerydata
   */
  setData(
    updater: Updater<
      inferProcedureOutput<TProcedure> | undefined,
      inferProcedureOutput<TProcedure> | undefined
    >,
    input?: inferProcedureInput<TProcedure>,
    options?: SetDataOptions,
  ): void;

  /**
   * @link https://react-query.tanstack.com/reference/QueryClient#queryclientgetquerydata
   */
  setInfiniteData(
    updater: Updater<
      InfiniteData<inferProcedureOutput<TProcedure>> | undefined,
      InfiniteData<inferProcedureOutput<TProcedure>> | undefined
    >,
    input?: inferProcedureInput<TProcedure>,
    options?: SetDataOptions,
  ): void;

  /**
   * @link https://react-query.tanstack.com/reference/QueryClient#queryclientgetquerydata
   */
  getData(
    input?: inferProcedureInput<TProcedure>,
  ): inferProcedureOutput<TProcedure> | undefined;

  /**
   * @link https://react-query.tanstack.com/reference/QueryClient#queryclientgetquerydata
   */
  getInfiniteData(
    input?: inferProcedureInput<TProcedure>,
  ): InfiniteData<inferProcedureOutput<TProcedure>> | undefined;
};

/**
 * A type that will traverse all procedures and sub routers of a given router to create a union of
 * their possible input types
 */
type InferAllRouterQueryInputTypes<TRouter extends AnyRouter> = {
  [TKey in keyof Filter<
    TRouter['_def']['record'],
    AnyRouter | AnyQueryProcedure
  >]: TRouter['_def']['record'][TKey] extends AnyQueryProcedure
    ? inferProcedureInput<TRouter['_def']['record'][TKey]>
    : InferAllRouterQueryInputTypes<TRouter['_def']['record'][TKey]>; // Recurse as we have a sub router!
}[keyof Filter<TRouter['_def']['record'], AnyRouter | AnyQueryProcedure>]; // This flattens results into a big union

/**
 * this is the type that is used to add in procedures that can be used on
 * an entire router
 */
type DecorateRouterProcedure<TRouter extends AnyRouter> = {
  /**
   * @link https://react-query.tanstack.com/guides/query-invalidation
   */
  invalidate(
    input?: Partial<InferAllRouterQueryInputTypes<TRouter>>,
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
        DecorateRouterProcedure<TRouter['_def']['record'][TKey]>
    : // utils only apply to queries
      DecorateProcedure<TRouter, TRouter['_def']['record'][TKey]>;
} & DecorateRouterProcedure<TRouter>; // Add functions that should be available at utils root

type AnyDecoratedProcedure = DecorateProcedure<any, any>;

export type CreateReactUtilsProxy<
  TRouter extends AnyRouter,
  TSSRContext,
> = DecoratedProcedureUtilsRecord<TRouter> &
  ProxyTRPCContextProps<TRouter, TSSRContext>;

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
    if (contextProps.includes(contextName)) {
      return context[contextName];
    }

    return createRecursiveProxy(({ path, args }) => {
      const pathCopy = [key, ...path];
      const utilName = pathCopy.pop() as keyof AnyDecoratedProcedure;

      const fullPath = pathCopy.join('.');

      const getOpts = (name: typeof utilName) => {
        if (['setData', 'setInfiniteData'].includes(name)) {
          const [updater, input, ...rest] = args as Parameters<
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
