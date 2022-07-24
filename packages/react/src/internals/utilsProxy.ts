import { TRPCClientError } from '@trpc/client';
import {
  AnyRouter,
  OmitNeverKeys,
  Procedure,
  QueryProcedure,
  inferHandlerInput,
  inferProcedureInput,
  inferProcedureOutput,
} from '@trpc/server';
import { createProxy } from '@trpc/server/shared';
import {
  CancelOptions,
  InfiniteData,
  InvalidateOptions,
  InvalidateQueryFilters,
  RefetchOptions,
  RefetchQueryFilters,
  SetDataOptions,
} from 'react-query';
import { Updater } from 'react-query/types/core/utils';
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
    input: inferHandlerInput<TProcedure>,
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
    input: inferHandlerInput<TProcedure>,
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
    input: inferHandlerInput<TProcedure>,
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
    input: inferHandlerInput<TProcedure>,
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

type UtilName = keyof DecorateProcedure<any, any>;

export function createReactQueryUtilsProxy<TRouter extends AnyRouter>(
  context: TRPCContextState<AnyRouter, unknown>,
) {
  const proxy = createProxy(({ path, args }) => {
    const pathCopy = [...path];
    const utilName = pathCopy.pop() as UtilName;

    const fullPath = pathCopy.join('.');

    switch (utilName) {
      case 'fetch': {
        const [input, ...rest] = args;
        const queryKey = getQueryKey(fullPath, input);
        return context.fetchQuery(queryKey, ...(rest as any));
      }
      case 'fetchInfinite': {
        const [input, ...rest] = args;
        const queryKey = getQueryKey(fullPath, input);
        return context.fetchInfiniteQuery(queryKey, ...(rest as any));
      }
      case 'prefetch': {
        const [input, ...rest] = args;
        const queryKey = getQueryKey(fullPath, input);
        return context.prefetchQuery(queryKey, ...(rest as any));
      }
      case 'prefetchInfinite': {
        const [input, ...rest] = args;
        const queryKey = getQueryKey(fullPath, input);
        return context.prefetchInfiniteQuery(queryKey, ...(rest as any));
      }
      case 'invalidate': {
        const [input, ...rest] = args;
        const queryKey = getQueryKey(fullPath, input);
        return context.invalidateQueries(queryKey, ...(rest as any));
      }
      case 'refetch': {
        const [input, ...rest] = args;
        const queryKey = getQueryKey(fullPath, input);
        return context.refetchQueries(queryKey, ...(rest as any));
      }
      case 'cancel': {
        const [input, ...rest] = args;
        const queryKey = getQueryKey(fullPath, input);
        return context.cancelQuery(queryKey, ...(rest as any));
      }
      case 'setData': {
        const [updater, input, ...rest] = args;
        const queryKey = getQueryKey(fullPath, input);
        return context.setQueryData(queryKey, updater, ...(rest as any));
      }
      case 'setInfiniteData': {
        const [updater, input, ...rest] = args;
        const queryKey = getQueryKey(fullPath, input);
        return context.setInfiniteQueryData(
          queryKey,
          updater as any,
          ...(rest as any),
        );
      }
      case 'getData': {
        const [input] = args;
        const queryKey = getQueryKey(fullPath, input);
        return context.getQueryData(queryKey);
      }
      case 'getInfiniteData': {
        const [input] = args;
        const queryKey = getQueryKey(fullPath, input);
        return context.getInfiniteQueryData(queryKey);
      }
    }
  });
  return proxy as DecoratedProcedureUtilsRecord<TRouter>;
}
