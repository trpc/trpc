import {
  CancelOptions,
  InfiniteData,
  InvalidateOptions,
  InvalidateQueryFilters,
  RefetchOptions,
  RefetchQueryFilters,
  SetDataOptions,
} from '@tanstack/react-query';
import { Updater } from '@tanstack/react-query/build/types/packages/query-core/src/utils';
import { TRPCClientError } from '@trpc/client';
import {
  AnyRouter,
  OmitNeverKeys,
  Procedure,
  ProcedureOptions,
  QueryProcedure,
  inferProcedureInput,
  inferProcedureOutput,
} from '@trpc/server';
import { LegacyV9ProcedureTag, createProxy } from '@trpc/server/shared';
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
  TProcedure extends Procedure<any>,
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
      inferProcedureOutput<TProcedure>
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
      InfiniteData<inferProcedureOutput<TProcedure>>
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
 * this is the type that is used to add in procedures that can be used on
 * partial paths.
 *
 * NOTE: All generics have been removed from this type at the moment ... But we
 * may want to add these back in if we can be smarter about inferring input
 * type...
 */
type DecoratePartialPathProcedure = {
  /**
   * @link https://react-query.tanstack.com/guides/query-invalidation
   */
  invalidate(
    input?: unknown, // We can't infer the input type as it may be multiple queries!?
    filters?: InvalidateQueryFilters,
    options?: InvalidateOptions,
  ): Promise<void>;
};

/**
 * @internal
 */
export type DecoratedProcedureUtilsRecord<TRouter extends AnyRouter> =
  OmitNeverKeys<{
    [TKey in keyof TRouter['_def']['record']]: TRouter['_def']['record'][TKey] extends LegacyV9ProcedureTag
      ? never
      : TRouter['_def']['record'][TKey] extends AnyRouter
      ? DecoratedProcedureUtilsRecord<TRouter['_def']['record'][TKey]> &
          DecoratePartialPathProcedure
      : // utils only apply to queries
      TRouter['_def']['record'][TKey] extends QueryProcedure<any>
      ? DecorateProcedure<TRouter, TRouter['_def']['record'][TKey]>
      : never;
  }> &
    // Add functions that should be available at utils root
    DecoratePartialPathProcedure;

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
