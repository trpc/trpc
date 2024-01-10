import type { QueryKey, UseQueryOptions } from '@tanstack/react-query';
import type { AnyRouter } from '@trpc/server';
import type {
  UseQueriesProcedureRecord,
  UseTRPCQueryOptions,
  UseTRPCQueryResult,
} from '../shared';

/**
 * @internal
 */
export type UseQueryOptionsForUseQueries<
  TQueryFnData = unknown,
  TError = unknown,
  TData = TQueryFnData,
  TQueryKey extends QueryKey = QueryKey,
> = Omit<UseQueryOptions<TQueryFnData, TError, TData, TQueryKey>, 'context'>;

/**
 * @internal
 */
export type TrpcQueryOptionsForUseQueries<
  TPath,
  TInput,
  TOutput,
  TData,
  TError,
> = Omit<UseTRPCQueryOptions<TPath, TInput, TOutput, TData, TError>, 'context'>;

/**
 * @internal
 */
export declare type QueriesResults<
  TQueriesOptions extends UseQueryOptionsForUseQueries<any, any, any, any>[],
> = {
  [TKey in keyof TQueriesOptions]: TQueriesOptions[TKey] extends UseQueryOptionsForUseQueries<
    infer TQueryFnData,
    infer TError,
    infer TData,
    any
  >
    ? UseTRPCQueryResult<unknown extends TData ? TQueryFnData : TData, TError>
    : never;
};

type GetOptions<TQueryOptions> =
  TQueryOptions extends UseQueryOptionsForUseQueries<any, any, any, any>
    ? TQueryOptions
    : never;

/**
 * @internal
 */
export type QueriesOptions<
  TQueriesOptions extends any[],
  TResult extends any[] = [],
> = TQueriesOptions extends []
  ? []
  : TQueriesOptions extends [infer Head]
  ? [...TResult, GetOptions<Head>]
  : TQueriesOptions extends [infer Head, ...infer Tail]
  ? QueriesOptions<Tail, [...TResult, GetOptions<Head>]>
  : unknown[] extends TQueriesOptions
  ? TQueriesOptions
  : TQueriesOptions extends UseQueryOptionsForUseQueries<
      infer TQueryFnData,
      infer TError,
      infer TData,
      infer TQueryKey
    >[]
  ? UseQueryOptionsForUseQueries<TQueryFnData, TError, TData, TQueryKey>[]
  : UseQueryOptionsForUseQueries[];

/**
 * @internal
 */
export type TRPCUseQueries<TRouter extends AnyRouter> = <
  TQueryOptions extends UseQueryOptionsForUseQueries<any, any, any, any>[],
>(
  queriesCallback: (
    t: UseQueriesProcedureRecord<TRouter>,
  ) => readonly [...QueriesOptions<TQueryOptions>],
  context?: UseQueryOptions['context'],
) => QueriesResults<TQueryOptions>;
