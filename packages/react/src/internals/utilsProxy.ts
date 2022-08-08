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
import { createProxy } from '@trpc/server/shared';
import {
  TRPCContextState,
  TRPCFetchInfiniteQueryOptions,
  TRPCFetchQueryOptions,
} from './context';
import { getQueryKey } from './getQueryKey';

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
 * @internal
 */
export type DecoratedProcedureUtilsRecord<TRouter extends AnyRouter> =
  OmitNeverKeys<{
    [TKey in keyof TRouter['_def']['record']]: TRouter['_def']['record'][TKey] extends AnyRouter
      ? DecoratedProcedureUtilsRecord<TRouter['_def']['record'][TKey]>
      : // utils only apply to queries
      TRouter['_def']['record'][TKey] extends QueryProcedure<any>
      ? DecorateProcedure<TRouter, TRouter['_def']['record'][TKey]>
      : never;
  }>;

type AnyDecoratedProcedure = DecorateProcedure<any, any>;

export function createReactQueryUtilsProxy<TRouter extends AnyRouter>(
  context: TRPCContextState<AnyRouter, unknown>,
) {
  const proxy = createProxy(({ path, args }) => {
    const pathCopy = [...path];
    const utilName = pathCopy.pop() as keyof AnyDecoratedProcedure;

    const fullPath = pathCopy.join('.');

    switch (utilName) {
      case 'fetch': {
        const [input, ...rest] = args as Parameters<
          AnyDecoratedProcedure['fetch']
        >;
        const queryKey = getQueryKey(fullPath, input);
        return context.fetchQuery(queryKey, ...rest);
      }
      case 'fetchInfinite': {
        const [input, ...rest] = args as Parameters<
          AnyDecoratedProcedure['fetchInfinite']
        >;
        const queryKey = getQueryKey(fullPath, input);
        return context.fetchInfiniteQuery(queryKey, ...rest);
      }
      case 'prefetch': {
        const [input, ...rest] = args as Parameters<
          AnyDecoratedProcedure['prefetch']
        >;
        const queryKey = getQueryKey(fullPath, input);
        return context.prefetchQuery(queryKey, ...rest);
      }
      case 'prefetchInfinite': {
        const [input, ...rest] = args;
        const queryKey = getQueryKey(fullPath, input);
        return context.prefetchInfiniteQuery(queryKey, ...(rest as any));
      }
      case 'invalidate': {
        const [input, ...rest] = args as Parameters<
          AnyDecoratedProcedure['invalidate']
        >;
        const queryKey = getQueryKey(fullPath, input);
        return context.invalidateQueries(queryKey, ...rest);
      }
      case 'refetch': {
        const [input, ...rest] = args as Parameters<
          AnyDecoratedProcedure['refetch']
        >;
        const queryKey = getQueryKey(fullPath, input);
        return context.refetchQueries(queryKey, ...rest);
      }
      case 'cancel': {
        const [input, ...rest] = args as Parameters<
          AnyDecoratedProcedure['cancel']
        >;
        const queryKey = getQueryKey(fullPath, input);
        return context.cancelQuery(queryKey, ...rest);
      }
      case 'setData': {
        const [updater, input, ...rest] = args as Parameters<
          AnyDecoratedProcedure['setData']
        >;
        const queryKey = getQueryKey(fullPath, input);
        return context.setQueryData(queryKey, updater, ...rest);
      }
      case 'setInfiniteData': {
        const [updater, input, ...rest] = args as Parameters<
          AnyDecoratedProcedure['setInfiniteData']
        >;
        const queryKey = getQueryKey(fullPath, input);
        return context.setInfiniteQueryData(queryKey, updater as any, ...rest);
      }
      case 'getData': {
        const [input] = args as Parameters<AnyDecoratedProcedure['getData']>;
        const queryKey = getQueryKey(fullPath, input);
        return context.getQueryData(queryKey);
      }
      case 'getInfiniteData': {
        const [input] = args as Parameters<
          AnyDecoratedProcedure['getInfiniteData']
        >;
        const queryKey = getQueryKey(fullPath, input);
        return context.getInfiniteQueryData(queryKey);
      }
    }
  });
  return proxy as DecoratedProcedureUtilsRecord<TRouter>;
}
