import type {
  DefinedUseQueryResult,
  FetchInfiniteQueryOptions,
  FetchQueryOptions,
  InfiniteData,
  InfiniteQueryObserverSuccessResult,
  InitialDataFunction,
  QueryObserverSuccessResult,
  QueryOptions,
  UseBaseQueryOptions,
  UseInfiniteQueryOptions,
  UseInfiniteQueryResult,
  UseMutationOptions,
  UseMutationResult,
  UseQueryResult,
  UseSuspenseInfiniteQueryOptions,
  UseSuspenseInfiniteQueryResult,
  UseSuspenseQueryOptions,
  UseSuspenseQueryResult,
} from '@tanstack/react-query';
import type {
  CreateTRPCClientOptions,
  TRPCClient,
  TRPCRequestOptions,
  TRPCUntypedClient,
} from '@trpc/client';
import type {
  AnyRouter,
  coerceAsyncIterableToArray,
  DistributiveOmit,
} from '@trpc/server/unstable-core-do-not-import';
import type { JSX, ReactNode } from 'react';
import type { TRPCContextProps } from '../../internals/context';
import type { TRPCQueryKey } from '../../internals/getQueryKey';

/**
 * A page of data and the cursor that fetched it.
 */
export type OutputWithCursor<TData, TCursor = any> = {
  cursor: TCursor | null;
  data: TData;
};

/**
 * tRPC options for a single hook call, passed as `trpc`.
 */
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

/**
 * Adds the `trpc` option to TanStack Query options.
 */
export interface TRPCUseQueryBaseOptions {
  /**
   * tRPC-related options
   */
  trpc?: TRPCReactRequestOptions;
}

/**
 * Options for `useQuery`: TanStack Query options without `queryKey`, plus `trpc`.
 * @see https://trpc.io/docs/client/react/useQuery
 */
export interface UseTRPCQueryOptions<
  TOutput,
  TData,
  TError,
  TQueryOptsData = TOutput,
>
  extends
    DistributiveOmit<
      UseBaseQueryOptions<TOutput, TError, TData, TQueryOptsData, any>,
      'queryKey'
    >,
    TRPCUseQueryBaseOptions {}

/**
 * Options for `useSuspenseQuery`.
 * @see https://trpc.io/docs/client/react/suspense#usesuspensequery
 */
export interface UseTRPCSuspenseQueryOptions<TOutput, TData, TError>
  extends
    DistributiveOmit<
      UseSuspenseQueryOptions<TOutput, TError, TData, any>,
      'queryKey'
    >,
    TRPCUseQueryBaseOptions {}

/**
 * Options for `usePrefetchQuery`.
 * @see https://trpc.io/docs/client/react/suspense#component-level-prefetching-with-useprefetchquery
 */
export interface UseTRPCPrefetchQueryOptions<TOutput, TData, TError>
  extends
    DistributiveOmit<
      FetchQueryOptions<TOutput, TError, TData, any>,
      'queryKey'
    >,
    TRPCUseQueryBaseOptions {}

/** @internal **/
export interface DefinedUseTRPCQueryOptions<
  TOutput,
  TData,
  TError,
  TQueryOptsData = TOutput,
> extends DistributiveOmit<
  UseTRPCQueryOptions<TOutput, TData, TError, TQueryOptsData>,
  'queryKey'
> {
  initialData: InitialDataFunction<TQueryOptsData> | TQueryOptsData;
}

/**
 * TanStack Query options with a tRPC query key.
 */
export interface TRPCQueryOptions<TData, TError>
  extends
    DistributiveOmit<QueryOptions<TData, TError, TData, any>, 'queryKey'>,
    TRPCUseQueryBaseOptions {
  queryKey: TRPCQueryKey;
}

/**
 * The type of the `cursor` field in a procedure's input.
 */
export type ExtractCursorType<TInput> = TInput extends { cursor?: any }
  ? TInput['cursor']
  : unknown;

/**
 * Options for `useInfiniteQuery`. Use `initialCursor` instead of `initialPageParam`.
 * @see https://trpc.io/docs/client/react/useInfiniteQuery
 */
export interface UseTRPCInfiniteQueryOptions<TInput, TOutput, TError>
  extends
    DistributiveOmit<
      UseInfiniteQueryOptions<
        TOutput,
        TError,
        TOutput,
        any,
        ExtractCursorType<TInput>
      >,
      'queryKey' | 'initialPageParam'
    >,
    TRPCUseQueryBaseOptions {
  /**
   * The cursor for the first page.
   */
  initialCursor?: ExtractCursorType<TInput>;
}

/**
 * Options for `usePrefetchInfiniteQuery`.
 * @see https://trpc.io/docs/client/react/suspense#component-level-prefetching-with-useprefetchinfinitequery
 */
export type UseTRPCPrefetchInfiniteQueryOptions<TInput, TOutput, TError> =
  DistributiveOmit<
    FetchInfiniteQueryOptions<
      TOutput,
      TError,
      TOutput,
      any,
      ExtractCursorType<TInput>
    >,
    'queryKey' | 'initialPageParam'
  > &
    TRPCUseQueryBaseOptions & {
      /**
       * The cursor for the first page.
       */
      initialCursor?: ExtractCursorType<TInput>;
    };

/**
 * Options for `useSuspenseInfiniteQuery`.
 * @see https://trpc.io/docs/client/react/suspense#usesuspenseinfinitequery
 */
export interface UseTRPCSuspenseInfiniteQueryOptions<TInput, TOutput, TError>
  extends
    DistributiveOmit<
      UseSuspenseInfiniteQueryOptions<
        TOutput,
        TError,
        TOutput,
        any,
        ExtractCursorType<TInput>
      >,
      'queryKey' | 'initialPageParam'
    >,
    TRPCUseQueryBaseOptions {
  /**
   * The cursor for the first page.
   */
  initialCursor?: ExtractCursorType<TInput>;
}

/**
 * Options for `useMutation`.
 * @see https://trpc.io/docs/client/react/useMutation
 */
export interface UseTRPCMutationOptions<
  TInput,
  TError,
  TOutput,
  TContext = unknown,
>
  extends
    UseMutationOptions<TOutput, TError, TInput, TContext>,
    TRPCUseQueryBaseOptions {}

/**
 * Options for `useSubscription`.
 * @see https://trpc.io/docs/client/react/useSubscription#options
 */
export interface UseTRPCSubscriptionOptions<TOutput, TError> {
  /**
   * @deprecated
   * use a `skipToken` from `@tanstack/react-query` instead
   * this will be removed in v12
   */
  enabled?: boolean;
  /**
   * Called when the subscription is started
   */
  onStarted?: () => void;
  /**
   * Called when new data is received
   */
  onData?: (data: TOutput) => void;
  /**
   * Called when an **unrecoverable error** occurs and the subscription is closed
   */
  onError?: (err: TError) => void;
  /**
   * Called when the subscription is completed on the server
   */
  onComplete?: () => void;
  /**
   * tRPC-related options
   */
  trpc?: Pick<TRPCRequestOptions, 'context'>;
}

/**
 * Fields shared by every `useSubscription` result.
 * @see https://trpc.io/docs/client/react/useSubscription#return-type
 */
export interface TRPCSubscriptionBaseResult<TOutput, TError> {
  status: 'idle' | 'connecting' | 'pending' | 'error';
  data: undefined | TOutput;
  error: null | TError;
  /**
   * Reset the subscription
   */
  reset: () => void;
}

/**
 * `useSubscription` result while the subscription is not running.
 */
export interface TRPCSubscriptionIdleResult<
  TOutput,
> extends TRPCSubscriptionBaseResult<TOutput, null> {
  status: 'idle';
  data: undefined;
  error: null;
}

/**
 * `useSubscription` result while connecting or reconnecting.
 */
export interface TRPCSubscriptionConnectingResult<
  TOutput,
  TError,
> extends TRPCSubscriptionBaseResult<TOutput, TError> {
  status: 'connecting';
  data: undefined | TOutput;
  error: TError | null;
}

/**
 * `useSubscription` result while connected and waiting for data.
 */
export interface TRPCSubscriptionPendingResult<
  TOutput,
> extends TRPCSubscriptionBaseResult<TOutput, undefined> {
  status: 'pending';
  data: TOutput | undefined;
  error: null;
}

/**
 * `useSubscription` result after an error that stopped the subscription.
 */
export interface TRPCSubscriptionErrorResult<
  TOutput,
  TError,
> extends TRPCSubscriptionBaseResult<TOutput, TError> {
  status: 'error';
  data: TOutput | undefined;
  error: TError;
}

/**
 * The result of `useSubscription`. Check `status` to narrow it.
 * @see https://trpc.io/docs/client/react/useSubscription#return-type
 */
export type TRPCSubscriptionResult<TOutput, TError> =
  | TRPCSubscriptionIdleResult<TOutput>
  | TRPCSubscriptionConnectingResult<TOutput, TError>
  | TRPCSubscriptionErrorResult<TOutput, TError>
  | TRPCSubscriptionPendingResult<TOutput>;

/**
 * Props for the `Provider` from `createTRPCReact`.
 */
export interface TRPCProviderProps<
  TRouter extends AnyRouter,
  TSSRContext,
> extends Omit<TRPCContextProps<TRouter, TSSRContext>, 'client'> {
  children: ReactNode;
  client: TRPCClient<TRouter> | TRPCUntypedClient<TRouter>;
}

/**
 * The `Provider` component from `createTRPCReact`.
 * @see https://trpc.io/docs/client/react/setup#4-add-trpc-providers
 */
export type TRPCProvider<TRouter extends AnyRouter, TSSRContext> = (
  props: TRPCProviderProps<TRouter, TSSRContext>,
) => JSX.Element;

/**
 * A function that creates a tRPC client.
 */
export type CreateClient<TRouter extends AnyRouter> = (
  opts: CreateTRPCClientOptions<TRouter>,
) => TRPCUntypedClient<TRouter>;

/**
 * @internal
 */
export type UseTRPCQueryResult<TData, TError> = TRPCHookResult &
  UseQueryResult<coerceAsyncIterableToArray<TData>, TError>;

/**
 * @internal
 */
export type DefinedUseTRPCQueryResult<TData, TError> = DefinedUseQueryResult<
  TData,
  TError
> &
  TRPCHookResult;

/**
 * @internal
 */
export type UseTRPCQuerySuccessResult<TData, TError> =
  QueryObserverSuccessResult<TData, TError> & TRPCHookResult;

/**
 * @internal
 */
export type UseTRPCSuspenseQueryResult<TData, TError> = [
  TData,
  UseSuspenseQueryResult<TData, TError> & TRPCHookResult,
];

/**
 * @internal
 */
export type UseTRPCInfiniteQueryResult<TData, TError, TInput> = TRPCHookResult &
  UseInfiniteQueryResult<
    InfiniteData<TData, NonNullable<ExtractCursorType<TInput>> | null>,
    TError
  >;

/**
 * @internal
 */
export type UseTRPCInfiniteQuerySuccessResult<TData, TError, TInput> =
  InfiniteQueryObserverSuccessResult<
    InfiniteData<TData, NonNullable<ExtractCursorType<TInput>> | null>,
    TError
  > &
    TRPCHookResult;

/**
 * @internal
 */
export type UseTRPCSuspenseInfiniteQueryResult<TData, TError, TInput> = [
  InfiniteData<TData, NonNullable<ExtractCursorType<TInput>> | null>,
  UseSuspenseInfiniteQueryResult<
    InfiniteData<TData, NonNullable<ExtractCursorType<TInput>> | null>,
    TError
  > &
    TRPCHookResult,
];

/**
 * @internal
 */
export type UseTRPCMutationResult<TData, TError, TVariables, TContext> =
  TRPCHookResult & UseMutationResult<TData, TError, TVariables, TContext>;

/**
 * Extra fields that tRPC adds to every hook result.
 */
export interface TRPCHookResult {
  trpc: {
    /**
     * The dot-separated procedure path, such as `post.byId`.
     */
    path: string;
  };
}
