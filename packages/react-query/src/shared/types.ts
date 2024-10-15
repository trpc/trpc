import type {
  DataTag,
  DefinedInitialDataInfiniteOptions,
  DefinedInitialDataOptions,
  InfiniteData,
  QueryClient,
  UndefinedInitialDataInfiniteOptions,
  UndefinedInitialDataOptions,
} from '@tanstack/react-query';
import type { TRPCRequestOptions } from '@trpc/client';
import type {
  AnyRouter,
  DistributiveOmit,
  MaybePromise,
} from '@trpc/server/unstable-core-do-not-import';
import type { TRPCQueryKey } from '../internals/getQueryKey';
import type {
  coerceAsyncIterableToArray,
  ExtractCursorType,
} from './hooks/types';

export interface TRPCReactRequestOptions
  // For RQ, we use their internal AbortSignals instead of letting the user pass their own
  extends Omit<TRPCRequestOptions, 'signal'> {
  /**
   * Opt out of SSR for this query by passing `ssr: false`
   */
  ssr?: boolean;
  /**
   * Opt out or into aborting request on unmount
   */
  abortOnUnmount?: boolean;
}

export interface TRPCQueryBaseOptions {
  /**
   * tRPC-related options
   */
  trpc?: TRPCReactRequestOptions;
}

export interface TRPCQueryOptionsResult {
  trpc: {
    path: string;
  };
}

type TRPCOptionOverrides = 'queryKey' | 'queryFn' | 'queryHashFn' | 'queryHash';
type TRPCInfiniteOptionOverrides = TRPCOptionOverrides | 'initialPageParam';

/**
 * QueryOptions API helpers
 */
export interface UndefinedTRPCQueryOptionsIn<TOutput, TError>
  extends DistributiveOmit<
      UndefinedInitialDataOptions<
        coerceAsyncIterableToArray<TOutput>,
        TError,
        coerceAsyncIterableToArray<TOutput>,
        TRPCQueryKey
      >,
      TRPCOptionOverrides
    >,
    TRPCQueryBaseOptions {}

export interface UndefinedTRPCQueryOptionsOut<TOutput, TError>
  extends UndefinedInitialDataOptions<
      coerceAsyncIterableToArray<TOutput>,
      TError,
      coerceAsyncIterableToArray<TOutput>,
      TRPCQueryKey
    >,
    TRPCQueryOptionsResult {
  queryKey: DataTag<TRPCQueryKey, coerceAsyncIterableToArray<TOutput>>;
}

export interface DefinedTRPCQueryOptionsIn<TOutput, TError>
  extends DistributiveOmit<
      DefinedInitialDataOptions<
        coerceAsyncIterableToArray<TOutput>,
        TError,
        coerceAsyncIterableToArray<TOutput>,
        TRPCQueryKey
      >,
      TRPCOptionOverrides
    >,
    TRPCQueryBaseOptions {}

export interface DefinedTRPCQueryOptionsOut<TOutput, TError>
  extends DefinedInitialDataOptions<
      coerceAsyncIterableToArray<TOutput>,
      TError,
      coerceAsyncIterableToArray<TOutput>,
      TRPCQueryKey
    >,
    TRPCQueryOptionsResult {
  queryKey: DataTag<TRPCQueryKey, coerceAsyncIterableToArray<TOutput>>;
}

/**
 * InifiniteQueryOptions helpers
 */
export interface UndefinedTRPCInfiniteQueryOptionsIn<TInput, TOutput, TError>
  extends DistributiveOmit<
      UndefinedInitialDataInfiniteOptions<
        TOutput,
        TError,
        InfiniteData<TOutput, NonNullable<ExtractCursorType<TInput>> | null>,
        TRPCQueryKey,
        NonNullable<ExtractCursorType<TInput>> | null
      >,
      TRPCInfiniteOptionOverrides
    >,
    TRPCQueryBaseOptions {
  initialCursor?: NonNullable<ExtractCursorType<TInput>> | null;
}

export interface UndefinedTRPCInfiniteQueryOptionsOut<TInput, TOutput, TError>
  extends DistributiveOmit<
      UndefinedInitialDataInfiniteOptions<
        TOutput,
        TError,
        InfiniteData<TOutput, NonNullable<ExtractCursorType<TInput>> | null>,
        TRPCQueryKey,
        NonNullable<ExtractCursorType<TInput>> | null
      >,
      'initialPageParam'
    >,
    TRPCQueryOptionsResult {
  queryKey: DataTag<TRPCQueryKey, TOutput>;
  initialPageParam: NonNullable<ExtractCursorType<TInput>> | null;
}

export interface DefinedTRPCInfiniteQueryOptionsIn<TInput, TOutput, TError>
  extends DistributiveOmit<
      DefinedInitialDataInfiniteOptions<
        TOutput,
        TError,
        InfiniteData<TOutput, NonNullable<ExtractCursorType<TInput>> | null>,
        TRPCQueryKey,
        NonNullable<ExtractCursorType<TInput>> | null
      >,
      TRPCInfiniteOptionOverrides
    >,
    TRPCQueryBaseOptions {
  initialCursor?: NonNullable<ExtractCursorType<TInput>> | null;
}

export interface DefinedTRPCInfiniteQueryOptionsOut<TInput, TOutput, TError>
  extends DistributiveOmit<
      DefinedInitialDataInfiniteOptions<
        TOutput,
        TError,
        InfiniteData<TOutput, NonNullable<ExtractCursorType<TInput>> | null>,
        TRPCQueryKey,
        NonNullable<ExtractCursorType<TInput>> | null
      >,
      'initialPageParam'
    >,
    TRPCQueryOptionsResult {
  queryKey: DataTag<TRPCQueryKey, TOutput>;
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
