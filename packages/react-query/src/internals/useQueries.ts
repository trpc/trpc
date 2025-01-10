import type {
  QueryKey,
  UseQueryOptions,
  UseSuspenseQueryOptions,
  UseSuspenseQueryResult,
} from '@tanstack/react-query';
import type {
  AnyRouter,
  DistributiveOmit,
} from '@trpc/server/unstable-core-do-not-import';
import type {
  UseQueriesProcedureRecord,
  UseSuspenseQueriesProcedureRecord,
  UseTRPCQueryOptions,
  UseTRPCQueryResult,
  UseTRPCSuspenseQueryOptions,
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
      any,
      infer TData,
      any
    >
      ? unknown extends TData
        ? TQueryFnData
        : TData
      : never;
  },
  {
    [TKey in keyof TQueriesOptions]: TQueriesOptions[TKey] extends UseQueryOptionsForUseSuspenseQueries<
      infer TQueryFnData,
      infer TError,
      infer TData,
      any
    >
      ? UseSuspenseQueryResult<
          unknown extends TData ? TQueryFnData : TData,
          TError
        >
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
          ? UseQueryOptionsForUseQueries<
              TQueryFnData,
              TError,
              TData,
              TQueryKey
            >[]
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
      ? SuspenseQueriesOptions<Tail, [...TResult, GetSuspenseOptions<Head>]>
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
  TCombinedResult = QueriesResults<TQueryOptions>,
>(
  queriesCallback: (
    t: UseQueriesProcedureRecord<
      TRouter['_def']['_config']['$types'],
      TRouter['_def']['record']
    >,
  ) => readonly [...QueriesOptions<TQueryOptions>],
  options?: {
    combine?: (results: QueriesResults<TQueryOptions>) => TCombinedResult;
  },
) => TCombinedResult;

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
    t: UseSuspenseQueriesProcedureRecord<
      TRouter['_def']['_config']['$types'],
      TRouter['_def']['record']
    >,
  ) => readonly [...SuspenseQueriesOptions<TQueryOptions>],
) => SuspenseQueriesResults<TQueryOptions>;
