import type {
  DataTag,
  DefinedInitialDataInfiniteOptions,
  DefinedInitialDataOptions,
  InfiniteData,
  QueryClient,
  UndefinedInitialDataInfiniteOptions,
  UndefinedInitialDataOptions,
  UnusedSkipTokenInfiniteOptions,
  UnusedSkipTokenOptions,
} from '@tanstack/react-query';
import type {
  AnyRouter,
  coerceAsyncIterableToArray,
  DistributiveOmit,
  MaybePromise,
} from '@trpc/server/unstable-core-do-not-import';
import type { TRPCQueryKey } from '../internals/getQueryKey';
import type { ExtractCursorType, TRPCReactRequestOptions } from './hooks/types';

/**
 * Adds the `trpc` option to TanStack Query options.
 */
export interface TRPCQueryBaseOptions {
  /**
   * tRPC-related options
   */
  trpc?: TRPCReactRequestOptions;
}

/**
 * Extra fields that tRPC adds to the options it returns.
 */
export interface TRPCQueryOptionsResult {
  trpc: {
    /**
     * The dot-separated procedure path, such as `post.byId`.
     */
    path: string;
  };
}

type TRPCOptionOverrides = 'queryKey' | 'queryFn' | 'queryHashFn' | 'queryHash';
type TRPCInfiniteOptionOverrides = TRPCOptionOverrides | 'initialPageParam';

/**
 * Options you pass to `queryOptions` without `initialData`.
 */
export interface UndefinedTRPCQueryOptionsIn<TQueryFnData, TData, TError>
  extends
    DistributiveOmit<
      UndefinedInitialDataOptions<
        coerceAsyncIterableToArray<TQueryFnData>,
        TError,
        coerceAsyncIterableToArray<TData>,
        TRPCQueryKey
      >,
      TRPCOptionOverrides
    >,
    TRPCQueryBaseOptions {}

/**
 * What `queryOptions` returns without `initialData`.
 */
export interface UndefinedTRPCQueryOptionsOut<TQueryFnData, TOutput, TError>
  extends
    UndefinedInitialDataOptions<
      coerceAsyncIterableToArray<TQueryFnData>,
      TError,
      coerceAsyncIterableToArray<TOutput>,
      TRPCQueryKey
    >,
    TRPCQueryOptionsResult {
  queryKey: DataTag<TRPCQueryKey, coerceAsyncIterableToArray<TOutput>, TError>;
}

/**
 * Options you pass to `queryOptions` with `initialData`.
 */
export interface DefinedTRPCQueryOptionsIn<TQueryFnData, TData, TError>
  extends
    DistributiveOmit<
      DefinedInitialDataOptions<
        coerceAsyncIterableToArray<TQueryFnData>,
        TError,
        coerceAsyncIterableToArray<TData>,
        TRPCQueryKey
      >,
      TRPCOptionOverrides
    >,
    TRPCQueryBaseOptions {}

/**
 * What `queryOptions` returns with `initialData`.
 */
export interface DefinedTRPCQueryOptionsOut<TQueryFnData, TData, TError>
  extends
    DefinedInitialDataOptions<
      coerceAsyncIterableToArray<TQueryFnData>,
      TError,
      coerceAsyncIterableToArray<TData>,
      TRPCQueryKey
    >,
    TRPCQueryOptionsResult {
  queryKey: DataTag<TRPCQueryKey, coerceAsyncIterableToArray<TData>, TError>;
}

/**
 * Options you pass to `queryOptions` when the input can't be `skipToken`.
 */
export interface UnusedSkipTokenTRPCQueryOptionsIn<TQueryFnData, TData, TError>
  extends
    DistributiveOmit<
      UnusedSkipTokenOptions<
        coerceAsyncIterableToArray<TQueryFnData>,
        TError,
        coerceAsyncIterableToArray<TData>,
        TRPCQueryKey
      >,
      TRPCOptionOverrides
    >,
    TRPCQueryBaseOptions {}

/**
 * What `queryOptions` returns when the input can't be `skipToken`.
 */
export interface UnusedSkipTokenTRPCQueryOptionsOut<
  TQueryFnData,
  TOutput,
  TError,
>
  extends
    UnusedSkipTokenOptions<
      coerceAsyncIterableToArray<TQueryFnData>,
      TError,
      coerceAsyncIterableToArray<TOutput>,
      TRPCQueryKey
    >,
    TRPCQueryOptionsResult {
  queryKey: DataTag<TRPCQueryKey, coerceAsyncIterableToArray<TOutput>, TError>;
}

/**
 * Options you pass to `infiniteQueryOptions` without `initialData`.
 */
export interface UndefinedTRPCInfiniteQueryOptionsIn<
  TInput,
  TQueryFnData,
  TData,
  TError,
>
  extends
    DistributiveOmit<
      UndefinedInitialDataInfiniteOptions<
        TQueryFnData,
        TError,
        InfiniteData<TData, NonNullable<ExtractCursorType<TInput>> | null>,
        TRPCQueryKey,
        NonNullable<ExtractCursorType<TInput>> | null
      >,
      TRPCInfiniteOptionOverrides
    >,
    TRPCQueryBaseOptions {
  /**
   * The cursor for the first page.
   */
  initialCursor?: NonNullable<ExtractCursorType<TInput>> | null;
}

/**
 * What `infiniteQueryOptions` returns without `initialData`.
 */
export interface UndefinedTRPCInfiniteQueryOptionsOut<
  TInput,
  TQueryFnData,
  TData,
  TError,
>
  extends
    DistributiveOmit<
      UndefinedInitialDataInfiniteOptions<
        TQueryFnData,
        TError,
        InfiniteData<TData, NonNullable<ExtractCursorType<TInput>> | null>,
        TRPCQueryKey,
        NonNullable<ExtractCursorType<TInput>> | null
      >,
      'initialPageParam'
    >,
    TRPCQueryOptionsResult {
  queryKey: DataTag<TRPCQueryKey, TData, TError>;
  initialPageParam: NonNullable<ExtractCursorType<TInput>> | null;
}

/**
 * Options you pass to `infiniteQueryOptions` with `initialData`.
 */
export interface DefinedTRPCInfiniteQueryOptionsIn<
  TInput,
  TQueryFnData,
  TData,
  TError,
>
  extends
    DistributiveOmit<
      DefinedInitialDataInfiniteOptions<
        TQueryFnData,
        TError,
        InfiniteData<TData, NonNullable<ExtractCursorType<TInput>> | null>,
        TRPCQueryKey,
        NonNullable<ExtractCursorType<TInput>> | null
      >,
      TRPCInfiniteOptionOverrides
    >,
    TRPCQueryBaseOptions {
  /**
   * The cursor for the first page.
   */
  initialCursor?: NonNullable<ExtractCursorType<TInput>> | null;
}

/**
 * What `infiniteQueryOptions` returns with `initialData`.
 */
export interface DefinedTRPCInfiniteQueryOptionsOut<
  TInput,
  TQueryFnData,
  TData,
  TError,
>
  extends
    DistributiveOmit<
      DefinedInitialDataInfiniteOptions<
        TQueryFnData,
        TError,
        InfiniteData<TData, NonNullable<ExtractCursorType<TInput>> | null>,
        TRPCQueryKey,
        NonNullable<ExtractCursorType<TInput>> | null
      >,
      'initialPageParam'
    >,
    TRPCQueryOptionsResult {
  queryKey: DataTag<TRPCQueryKey, TData, TError>;
  initialPageParam: NonNullable<ExtractCursorType<TInput>> | null;
}

/**
 * Options you pass to `infiniteQueryOptions` when the input can't be `skipToken`.
 */
export interface UnusedSkipTokenTRPCInfiniteQueryOptionsIn<
  TInput,
  TQueryFnData,
  TData,
  TError,
>
  extends
    DistributiveOmit<
      UnusedSkipTokenInfiniteOptions<
        TQueryFnData,
        TError,
        InfiniteData<TData, NonNullable<ExtractCursorType<TInput>> | null>,
        TRPCQueryKey,
        NonNullable<ExtractCursorType<TInput>> | null
      >,
      TRPCInfiniteOptionOverrides
    >,
    TRPCQueryBaseOptions {
  /**
   * The cursor for the first page.
   */
  initialCursor?: NonNullable<ExtractCursorType<TInput>> | null;
}

/**
 * What `infiniteQueryOptions` returns when the input can't be `skipToken`.
 */
export interface UnusedSkipTokenTRPCInfiniteQueryOptionsOut<
  TInput,
  TQueryFnData,
  TData,
  TError,
>
  extends
    DistributiveOmit<
      UnusedSkipTokenInfiniteOptions<
        TQueryFnData,
        TError,
        InfiniteData<TData, NonNullable<ExtractCursorType<TInput>> | null>,
        TRPCQueryKey,
        NonNullable<ExtractCursorType<TInput>> | null
      >,
      'initialPageParam'
    >,
    TRPCQueryOptionsResult {
  queryKey: DataTag<TRPCQueryKey, TData, TError>;
  initialPageParam: NonNullable<ExtractCursorType<TInput>> | null;
}

/**
 * @internal
 */
export interface UseMutationOverride {
  onSuccess: (opts: {
    /**
     * Calls the original function that was defined in the query's `onSuccess` option
     */
    originalFn: () => MaybePromise<unknown>;
    queryClient: QueryClient;
    /**
     * Meta data passed in from the `useMutation()` hook
     */
    meta: Record<string, unknown>;
  }) => MaybePromise<unknown>;
}

/**
 * @internal
 */
export interface CreateTRPCReactOptions<_TRouter extends AnyRouter> {
  /**
   * Override behaviors of the built-in hooks
   */
  overrides?: {
    useMutation?: Partial<UseMutationOverride>;
  };

  /**
   * Abort all queries when unmounting
   * @default false
   */
  abortOnUnmount?: boolean;

  /**
   * Override the default context provider
   * @default undefined
   */
  context?: React.Context<any>;
}
