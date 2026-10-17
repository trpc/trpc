/**
 * Type-level prototype of 19's option-bag API on top of real
 * `@tanstack/query-core` types: `queryOptions({ input, ...tanstack })`, the v11
 * positional form for comparison, `skipToken`, `DataTag` keys, explicit
 * infinite `input: (pageParam) => …` vs v11's `cursor` convention, and
 * `streamedOptions`. `declare`-only; names follow the proposal text and none
 * of this is decided API.
 */
import type {
  DataTag,
  InfiniteData,
  InfiniteQueryObserverOptions,
  QueryKey,
  QueryObserverOptions,
  SkipToken,
} from '@tanstack/query-core';

export type TrpcQueryKey = readonly [
  path: readonly string[],
  opts?: { input?: unknown; type?: 'query' | 'infinite' },
];

type Simplify<T> = { [K in keyof T]: T[K] } & {};
type InputBag<TInput> = undefined extends TInput
  ? { input?: TInput | SkipToken }
  : { input: TInput | SkipToken };
/** No-input procedures can be called with no argument at all. */
type BagArgs<TInput, TOpts> = undefined extends TInput
  ? [opts?: InputBag<TInput> & TOpts]
  : [opts: InputBag<TInput> & TOpts];

type QueryOpts<TOutput, TError, TData> = Omit<
  QueryObserverOptions<TOutput, TError, TData, TOutput, TrpcQueryKey>,
  'queryKey' | 'queryFn'
>;
type QueryResult<TOutput, TError, TData> = QueryObserverOptions<
  TOutput,
  TError,
  TData,
  TOutput,
  DataTag<TrpcQueryKey, TOutput, TError>
> & { queryKey: DataTag<TrpcQueryKey, TOutput, TError> };

type InfiniteOpts<TOutput, TError, TData, TPageParam> = Omit<
  InfiniteQueryObserverOptions<
    TOutput,
    TError,
    TData,
    TrpcQueryKey,
    TPageParam
  >,
  'queryKey' | 'queryFn'
>;
type InfiniteResult<TOutput, TError, TData, TPageParam> =
  InfiniteQueryObserverOptions<
    TOutput,
    TError,
    TData,
    DataTag<TrpcQueryKey, InfiniteData<TOutput, TPageParam>, TError>,
    TPageParam
  > & {
    queryKey: DataTag<TrpcQueryKey, InfiniteData<TOutput, TPageParam>, TError>;
  };

/** 19's proposed option bag. */
export interface QueryProcedureUtils<TInput, TOutput, TError> {
  queryOptions<TData = TOutput>(
    ...args: BagArgs<TInput, QueryOpts<TOutput, TError, TData>>
  ): QueryResult<TOutput, TError, TData>;
  queryKey(
    ...args: undefined extends TInput
      ? [opts?: { input?: TInput }]
      : [opts: { input: TInput }]
  ): DataTag<TrpcQueryKey, TOutput, TError>;
  /** Explicit page-param mapping. */
  infiniteOptions<TPageParam, TData = InfiniteData<TOutput, TPageParam>>(
    opts: { input: (pageParam: TPageParam) => TInput } & InfiniteOpts<
      TOutput,
      TError,
      TData,
      TPageParam
    >,
  ): InfiniteResult<TOutput, TError, TData, TPageParam>;
}

/** v11's positional form, for comparison. */
export interface PositionalQueryProcedureUtils<TInput, TOutput, TError> {
  queryOptions<TData = TOutput>(
    input: TInput | SkipToken,
    opts?: QueryOpts<TOutput, TError, TData>,
  ): QueryResult<TOutput, TError, TData>;
  /** v11's convention: the page param is the input's `cursor`. */
  infiniteQueryOptions<TData = InfiniteData<TOutput, CursorOf<TInput>>>(
    input: Omit<TInput, 'cursor' | 'direction'> | SkipToken,
    opts: Omit<
      InfiniteOpts<TOutput, TError, TData, CursorOf<TInput>>,
      'initialPageParam'
    > & { initialCursor?: CursorOf<TInput> },
  ): InfiniteResult<TOutput, TError, TData, CursorOf<TInput>>;
}
type CursorOf<TInput> = TInput extends { cursor?: infer C }
  ? Exclude<C, undefined> | null
  : never;

/** `async function*` outputs: data is the accumulated chunks. */
export interface StreamProcedureUtils<TInput, TChunk, TError> {
  streamedOptions<TData = TChunk[]>(
    ...args: BagArgs<TInput, QueryOpts<TChunk[], TError, TData>>
  ): QueryResult<TChunk[], TError, TData>;
}

// --- the frameworks' side, simplified from @tanstack/react-query et al. -----------------

export declare function useQuery<
  TQueryFnData,
  TError,
  TData,
  TQueryKey extends QueryKey,
>(
  options: QueryObserverOptions<
    TQueryFnData,
    TError,
    TData,
    TQueryFnData,
    TQueryKey
  >,
): { data: TData | undefined; error: TError | null };

export declare function useInfiniteQuery<
  TQueryFnData,
  TError,
  TData,
  TQueryKey extends QueryKey,
  TPageParam,
>(
  options: InfiniteQueryObserverOptions<
    TQueryFnData,
    TError,
    TData,
    TQueryKey,
    TPageParam
  >,
): { data: TData | undefined };

export type { Simplify };
