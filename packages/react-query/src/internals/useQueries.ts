import {
  QueryKey,
  UseQueryOptions,
  UseSuspenseQueryOptions,
} from '@tanstack/react-query';
import { AnyRouter } from '@trpc/server';
import { DistributiveOmit } from '@trpc/server/unstableInternalsExport';
import {
  UseQueriesProcedureRecord,
  UseSuspenseQueriesProcedureRecord,
  UseTRPCQueryOptions,
  UseTRPCQueryResult,
  UseTRPCSuspenseQueryOptions,
  UseTRPCSuspenseQueryResult,
} from '../shared';

/**
 * @internal
 */
export type UseQueryOptionsForUseQueries<
  TQueryFnData = unknown,
  TError = unknown,
  TData = TQueryFnData,
  TQueryKey extends QueryKey = QueryKey,
> = DistributiveOmit<
  UseQueryOptions<TQueryFnData, TError, TData, TQueryKey>,
  'queryKey'
>;

/**
 * @internal
 */
export type UseQueryOptionsForUseSuspenseQueries<
  TQueryFnData = unknown,
  TError = unknown,
  TData = TQueryFnData,
  TQueryKey extends QueryKey = QueryKey,
> = DistributiveOmit<
  UseSuspenseQueryOptions<TQueryFnData, TError, TData, TQueryKey>,
  'queryKey'
>;

/**
 * @internal
 */
export type TrpcQueryOptionsForUseQueries<TOutput, TData, TError> =
  DistributiveOmit<UseTRPCQueryOptions<TOutput, TData, TError>, 'queryKey'>;

/**
 * @internal
 */
export type TrpcQueryOptionsForUseSuspenseQueries<TOutput, TData, TError> =
  DistributiveOmit<
    UseTRPCSuspenseQueryOptions<TOutput, TData, TError>,
    'queryKey'
  >;

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

/**
 * @internal
 */
export declare type SuspenseQueriesResults<
  TQueriesOptions extends UseQueryOptionsForUseSuspenseQueries<
    any,
    any,
    any,
    any
  >[],
> = [
  {
    [TKey in keyof TQueriesOptions]: TQueriesOptions[TKey] extends UseQueryOptionsForUseSuspenseQueries<
      infer TQueryFnData,
      infer TError,
      infer TData,
      any
    >
      ? UseTRPCSuspenseQueryResult<
          unknown extends TData ? TQueryFnData : TData,
          TError
        >[0]
      : never;
  },
  {
    [TKey in keyof TQueriesOptions]: TQueriesOptions[TKey] extends UseQueryOptionsForUseSuspenseQueries<
      infer TQueryFnData,
      infer TError,
      infer TData,
      any
    >
      ? UseTRPCSuspenseQueryResult<
          unknown extends TData ? TQueryFnData : TData,
          TError
        >[1]
      : never;
  },
];

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

type GetSuspenseOptions<TQueryOptions> =
  TQueryOptions extends UseQueryOptionsForUseSuspenseQueries<any, any, any, any>
    ? TQueryOptions
    : never;

/**
 * @internal
 */
export type SuspenseQueriesOptions<
  TQueriesOptions extends any[],
  TResult extends any[] = [],
> = TQueriesOptions extends []
  ? []
  : TQueriesOptions extends [infer Head]
  ? [...TResult, GetSuspenseOptions<Head>]
  : TQueriesOptions extends [infer Head, ...infer Tail]
  ? QueriesOptions<Tail, [...TResult, GetSuspenseOptions<Head>]>
  : unknown[] extends TQueriesOptions
  ? TQueriesOptions
  : TQueriesOptions extends UseQueryOptionsForUseSuspenseQueries<
      infer TQueryFnData,
      infer TError,
      infer TData,
      infer TQueryKey
    >[]
  ? UseQueryOptionsForUseSuspenseQueries<
      TQueryFnData,
      TError,
      TData,
      TQueryKey
    >[]
  : UseQueryOptionsForUseSuspenseQueries[];

/**
 * @internal
 */
export type TRPCUseQueries<TRouter extends AnyRouter> = <
  TQueryOptions extends UseQueryOptionsForUseQueries<any, any, any, any>[],
>(
  queriesCallback: (
    t: UseQueriesProcedureRecord<TRouter>,
  ) => readonly [...QueriesOptions<TQueryOptions>],
) => QueriesResults<TQueryOptions>;

/**
 * @internal
 */
export type TRPCUseSuspenseQueries<TRouter extends AnyRouter> = <
  TQueryOptions extends UseQueryOptionsForUseSuspenseQueries<
    any,
    any,
    any,
    any
  >[],
>(
  queriesCallback: (
    t: UseSuspenseQueriesProcedureRecord<TRouter>,
  ) => readonly [...SuspenseQueriesOptions<TQueryOptions>],
) => SuspenseQueriesResults<TQueryOptions>;
