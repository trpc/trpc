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
import { createProxy } from '@trpc/server/shared';
import {
  TRPCContextProps,
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
 * @internal
 */
export type DecoratedProcedureUtilsRecord<TRouter extends AnyRouter> = {
  [TKey in keyof Filter<
    TRouter['_def']['record'],
    AnyRouter | AnyQueryProcedure
  >]: TRouter['_def']['record'][TKey] extends AnyRouter
    ? DecoratedProcedureUtilsRecord<TRouter['_def']['record'][TKey]>
    : // utils only apply to queries
      DecorateProcedure<TRouter, TRouter['_def']['record'][TKey]>;
};

type AnyDecoratedProcedure = DecorateProcedure<any, any>;

export type CreateReactUtilsProxy<
  TRouter extends AnyRouter,
  TSSRContext,
> = DecoratedProcedureUtilsRecord<TRouter> &
  TRPCContextProps<TRouter, TSSRContext>;

/**
 * @internal
 */
export function createReactQueryUtilsProxy<
  TRouter extends AnyRouter,
  TSSRContext,
>(context: TRPCContextState<AnyRouter, unknown>) {
  const proxy: unknown = new Proxy(
    () => {
      // noop
    },
    {
      get(_obj, name) {
        if (typeof name !== 'string') {
          throw new Error('Not supported');
        }
        const contextName = name as typeof contextProps[number];
        if (contextProps.includes(contextName)) {
          return context[contextName];
        }

        return createProxy(({ path, args }) => {
          const pathCopy = [name, ...path];
          const utilName = pathCopy.pop() as keyof AnyDecoratedProcedure;

          const fullPath = pathCopy.join('.');

          const getOpts = (name: typeof utilName) => {
            if (['setData', 'setInfiniteData'].includes(name)) {
              const [updater, input, ...rest] = args as Parameters<
                AnyDecoratedProcedure[typeof utilName]
              >;
              const queryKey = getQueryKey(fullPath, input);
              return {
                input,
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
              input,
              queryKey,
              rest,
            };
          };

          const { queryKey, rest, updater, input } = getOpts(utilName);

          const contextMap: Record<keyof AnyDecoratedProcedure, () => unknown> =
            {
              fetch: () => context.fetchQuery(queryKey, ...rest),
              fetchInfinite: () =>
                context.fetchInfiniteQuery(queryKey, ...rest),
              prefetch: () => context.prefetchQuery(queryKey, ...rest),
              prefetchInfinite: () =>
                context.prefetchInfiniteQuery(queryKey, ...rest),
              invalidate: () => context.invalidateQueries(queryKey, ...rest),
              refetch: () => context.refetchQueries(queryKey, ...rest),
              cancel: () => context.cancelQuery(queryKey, ...rest),
              setData: () => context.setQueryData(queryKey, updater, ...rest),
              setInfiniteData: () =>
                context.setInfiniteQueryData(queryKey, input, ...rest),
              getData: () => context.getQueryData(queryKey),
              getInfiniteData: () => context.getInfiniteQueryData(queryKey),
            };

          return contextMap[utilName]();
        });
      },
    },
  );

  return proxy as CreateReactUtilsProxy<TRouter, TSSRContext>;
}
