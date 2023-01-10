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
  ProtectedIntersection,
  inferProcedureInput,
} from '@trpc/server';
import {
  createFlatProxy,
  createRecursiveProxy,
  inferTransformedProcedureOutput,
} from '@trpc/server/shared';
import {
  DecoratedProxyTRPCContextProps,
  TRPCFetchInfiniteQueryOptions,
  TRPCFetchQueryOptions,
  contextProps,
} from '../../internals/context';
import { TRPCContextState } from '../../internals/context';

type DecorateProcedure<
  TRouter extends AnyRouter,
  TProcedure extends AnyQueryProcedure,
> = {
  /**
   * @link https://tanstack.com/query/v4/docs/reference/QueryClient#queryclientfetchquery
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
   * @link https://tanstack.com/query/v4/docs/reference/QueryClient#queryclientfetchinfinitequery
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
   * @link https://tanstack.com/query/v4/docs/reference/QueryClient#queryclientprefetchquery
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
   * @link https://tanstack.com/query/v4/docs/reference/QueryClient#queryclientprefetchinfinitequery
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
   * @link https://tanstack.com/query/v4/docs/reference/QueryClient#queryclientinvalidatequeries
   */
  invalidate(
    input?: inferProcedureInput<TProcedure>,
    filters?: InvalidateQueryFilters,
    options?: InvalidateOptions,
  ): Promise<void>;

  /**
   * @link https://tanstack.com/query/v4/docs/reference/QueryClient#queryclientrefetchqueries
   */
  refetch(
    input?: inferProcedureInput<TProcedure>,
    filters?: RefetchQueryFilters,
    options?: RefetchOptions,
  ): Promise<void>;

  /**
   * @link https://tanstack.com/query/v4/docs/reference/QueryClient#queryclientcancelqueries
   */
  cancel(
    input?: inferProcedureInput<TProcedure>,
    options?: CancelOptions,
  ): Promise<void>;

  /**
   * @link https://tanstack.com/query/v4/docs/reference/QueryClient#queryclientresetqueries
   */
  reset(
    input?: inferProcedureInput<TProcedure>,
    options?: ResetOptions,
  ): Promise<void>;

  /**
   * @link https://tanstack.com/query/v4/docs/reference/QueryClient#queryclientsetquerydata
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
   * @link https://tanstack.com/query/v4/docs/reference/QueryClient#queryclientsetquerydata
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
   * @link https://tanstack.com/query/v4/docs/reference/QueryClient#queryclientgetquerydata
   */
  getData(
    input?: inferProcedureInput<TProcedure>,
  ): inferTransformedProcedureOutput<TProcedure> | undefined;

  /**
   * @link https://tanstack.com/query/v4/docs/reference/QueryClient#queryclientgetquerydata
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
    input?: undefined,
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
> = ProtectedIntersection<
  DecoratedProxyTRPCContextProps<TRouter, TSSRContext>,
  DecoratedProcedureUtilsRecord<TRouter>
>;

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

    return createRecursiveProxy((opts) => {
      const path = [key, ...opts.path];
      const utilName = path.pop() as keyof AnyDecoratedProcedure;

      const getOpts = (name: typeof utilName) => {
        if (['setData', 'setInfiniteData'].includes(name)) {
          const [input, updater, ...rest] = opts.args as Parameters<
            AnyDecoratedProcedure[typeof utilName]
          >;
          return {
            input,
            updater,
            rest,
          };
        }

        const [input, ...rest] = opts.args as Parameters<
          AnyDecoratedProcedure[typeof utilName]
        >;
        return { input, rest };
      };

      const { input, rest, updater } = getOpts(utilName);

      const contextMap: Record<keyof AnyDecoratedProcedure, () => unknown> = {
        fetch: () => context.fetchQuery(path, input, ...rest),
        fetchInfinite: () => context.fetchInfiniteQuery(path, input, ...rest),
        prefetch: () => context.prefetchQuery(path, input, ...rest),
        prefetchInfinite: () =>
          context.prefetchInfiniteQuery(path, input, ...rest),
        invalidate: () => context.invalidateQueries(path, input, ...rest),
        reset: () => context.resetQueries(path, input, ...rest),
        refetch: () => context.refetchQueries(path, input, ...rest),
        cancel: () => context.cancelQuery(path, input, ...rest),
        setData: () => context.setQueryData(path, input, updater, ...rest),
        setInfiniteData: () =>
          context.setInfiniteQueryData(path, input, updater, ...rest),
        getData: () => context.getQueryData(path, input),
        getInfiniteData: () => context.getInfiniteQueryData(path, input),
      };

      return contextMap[utilName]();
    });
  });
}
