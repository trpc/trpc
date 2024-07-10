import type {
  DefinedUseQueryResult,
  DehydratedState,
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
  TRPCRequestOptions,
  TRPCUntypedClient,
} from '@trpc/client';
import type {
  AnyRouter,
  DistributiveOmit,
} from '@trpc/server/unstable-core-do-not-import';
import type { ReactNode } from 'react';
import type { TRPCContextProps } from '../../internals/context';
import type { TRPCQueryKey } from '../../internals/getQueryKey';

export type OutputWithCursor<TData, TCursor = any> = {
  cursor: TCursor | null;
  data: TData;
};

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

export interface TRPCUseQueryBaseOptions {
  /**
   * tRPC-related options
   */
  trpc?: TRPCReactRequestOptions;
}

export interface UseTRPCQueryOptions<
  TOutput,
  TData,
  TError,
  TQueryOptsData = TOutput,
> extends DistributiveOmit<
      UseBaseQueryOptions<TOutput, TError, TData, TQueryOptsData, any>,
      'queryKey'
    >,
    TRPCUseQueryBaseOptions {}

export interface UseTRPCSuspenseQueryOptions<TOutput, TData, TError>
  extends DistributiveOmit<
      UseSuspenseQueryOptions<TOutput, TError, TData, any>,
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

export interface TRPCQueryOptions<TData, TError>
  extends DistributiveOmit<QueryOptions<TData, TError, TData, any>, 'queryKey'>,
    TRPCUseQueryBaseOptions {
  queryKey: TRPCQueryKey;
}

export type ExtractCursorType<TInput> = TInput extends { cursor?: any }
  ? TInput['cursor']
  : unknown;

export interface UseTRPCInfiniteQueryOptions<TInput, TOutput, TError>
  extends DistributiveOmit<
      UseInfiniteQueryOptions<
        TOutput,
        TError,
        TOutput,
        TOutput,
        any,
        ExtractCursorType<TInput>
      >,
      'queryKey' | 'initialPageParam'
    >,
    TRPCUseQueryBaseOptions {
  initialCursor?: ExtractCursorType<TInput>;
}

export interface UseTRPCSuspenseInfiniteQueryOptions<TInput, TOutput, TError>
  extends DistributiveOmit<
      UseSuspenseInfiniteQueryOptions<
        TOutput,
        TError,
        TOutput,
        TOutput,
        any,
        ExtractCursorType<TInput>
      >,
      'queryKey' | 'initialPageParam'
    >,
    TRPCUseQueryBaseOptions {
  initialCursor?: ExtractCursorType<TInput>;
}

export interface UseTRPCMutationOptions<
  TInput,
  TError,
  TOutput,
  TContext = unknown,
> extends UseMutationOptions<TOutput, TError, TInput, TContext>,
    TRPCUseQueryBaseOptions {}

type StateCallbackOptions<TError> =
  | {
      state: 'idle';
      data: null;
    }
  | {
      state: 'connecting';
      data: TError | null;
    }
  | {
      state: 'pending';
      data: null;
    }
  | {
      state: 'failed';
      data: TError;
    }
  | {
      state: 'success';
      data: null;
    };

export type SubscriptionState = StateCallbackOptions<unknown>['state'];

export interface UseTRPCSubscriptionOptions<TOutput, TError> {
  enabled?: boolean;
  /**
   * @deprecated use onStateChange instead
   */
  onStarted?: () => void;
  /**
   * @deprecated use onStateChange instead
   */
  onError?: (err: TError) => void;
  onData: (data: TOutput) => void;
  onStateChange?: (opts: StateCallbackOptions<TError>) => void;
}

export interface restartSubscriptionOptionsBase {}

export interface restartSubscriptionOptionsWithLastEventId
  extends restartSubscriptionOptionsBase {
  /**
   * Defaults to `true` in case of failure or if the subscription is still active
   */
  sendLastEventId: boolean;
}

export type restartSubscriptionOptions<TLastEventIdInput extends boolean> =
  TLastEventIdInput extends true
    ? restartSubscriptionOptionsWithLastEventId
    : restartSubscriptionOptionsBase;

export type restartSubscriptionFn<TLastEventIdInput extends boolean> = (
  options?: restartSubscriptionOptions<TLastEventIdInput>,
) => void;

export interface TRPCSubscriptionBaseResult<TInput, TError> {
  /**
   * The timestamp for when the connection was last (re-)established
   */
  connectionStartedAt: number;
  /**
   * The timestamp for when the connection was initially established
   */
  initialConnectionStartedAt: number;
  /**
   * The last error that has captured
   * - Defaults to `null`
   * - Resets to `null` after connection is re-established
   */
  error: TError | null;
  /**
   * The timestamp for when the last error was captured
   */
  errorUpdatedAt: number;
  /**
   * Reconnection attempts since last successful connection
   */
  reconnectionAttemptCount: number;
  /**
   * Error count since subscription was started
   */
  errorUpdateCount: number;
  /**
   * The error that caused the subscription to stop
   */
  failureReason: TError | null;
  /**
   * Is `true` when the subscription is establishing the initial connection
   */
  isStarting: boolean;
  /**
   * Is `true` when the subscription has successfully connected at least once
   */
  isStarted: boolean;
  /**
   * Is `true` if the subscription is (re-)establishing a connection
   */
  isConnecting: boolean;
  /**
   * Is `true` when the subscription is connected
   */
  isConnected: boolean;
  /**
   * Is `true` if the subscription is re-establishing a connection
   */
  isReconnecting: boolean;
  /**
   * Is `true` if the subscription is stopped either due to an error or if the subscription has successfully completed
   * - No attempt to re-establish the connection will be made
   */
  isStopped: boolean;
  /**
   * Is `true` if the subscription ended in an error state
   */
  isFailed: boolean;
  /**
   * Is `true` if the subscription has successfully completed
   */
  isSuccess: boolean;
  /**
   * The current state of the subscription
   * - Will be:
   *  - `'idle'` when the subscription is not enabled
   *  - `'connecting'` when the subscription is (re-)establishing the connection
   *  - `'pending'` when the subscription is connected and receiving data
   *  - `'failed'` when the subscription has stopped due to an error
   *  - `'success'` when the subscription has successfully completed
   */
  status: SubscriptionState;
  /**
   * Restart the subscription
   */
  restart: restartSubscriptionFn<
    TInput extends {
      lastEventId: string | null;
    }
      ? true
      : false
  >;
}

export interface TRPCSubscriptionIdleResult<TInput, TError>
  extends TRPCSubscriptionBaseResult<TInput, TError> {
  error: null;
  failureReason: null;
  isStarting: false;
  isStarted: false;
  isConnecting: false;
  isConnected: false;
  isReconnecting: false;
  isStopped: false;
  isFailed: false;
  isSuccess: false;
  status: 'idle';
}

export interface TRPCSubscriptionStartingResult<TInput, TError>
  extends TRPCSubscriptionBaseResult<TInput, TError> {
  error: null;
  failureReason: null;
  isStarting: true;
  isStarted: false;
  isConnecting: true;
  isConnected: false;
  isReconnecting: false;
  isStopped: false;
  isFailed: false;
  isSuccess: false;
  status: 'connecting';
}

export interface TRPCSubscriptionConnectedResult<TInput, TError>
  extends TRPCSubscriptionBaseResult<TInput, TError> {
  error: null;
  failureReason: null;
  isStarting: false;
  isStarted: true;
  isConnecting: false;
  isConnected: true;
  isReconnecting: false;
  isStopped: false;
  isFailed: false;
  isSuccess: false;
  status: 'pending';
}

export interface TRPCSubscriptionReconnectingResult<TInput, TError>
  extends TRPCSubscriptionBaseResult<TInput, TError> {
  error: TError;
  failureReason: null;
  isStarting: false;
  isStarted: true;
  isConnecting: true;
  isConnected: false;
  isReconnecting: true;
  isStopped: false;
  isFailed: false;
  isSuccess: false;
  status: 'connecting';
}

export interface TRPCSubscriptionFailureResult<TInput, TError>
  extends TRPCSubscriptionBaseResult<TInput, TError> {
  error: TError;
  failureReason: TError;
  isStarting: false;
  isStarted: true;
  isConnecting: false;
  isConnected: false;
  isReconnecting: false;
  isStopped: true;
  isFailed: true;
  isSuccess: false;
  status: 'failed';
}

export interface TRPCSubscriptionSuccessResult<TInput, TError>
  extends TRPCSubscriptionBaseResult<TInput, TError> {
  error: null;
  failureReason: null;
  isStarting: false;
  isStarted: true;
  isConnecting: false;
  isConnected: false;
  isReconnecting: false;
  isStopped: true;
  isFailed: false;
  isSuccess: true;
  status: 'success';
}

export type UseTRPCSubscriptionResult<TInput, TError> =
  | TRPCSubscriptionIdleResult<TInput, TError>
  | TRPCSubscriptionStartingResult<TInput, TError>
  | TRPCSubscriptionConnectedResult<TInput, TError>
  | TRPCSubscriptionReconnectingResult<TInput, TError>
  | TRPCSubscriptionFailureResult<TInput, TError>
  | TRPCSubscriptionSuccessResult<TInput, TError>;

export interface TRPCProviderProps<TRouter extends AnyRouter, TSSRContext>
  extends TRPCContextProps<TRouter, TSSRContext> {
  children: ReactNode;
}

export type TRPCProvider<TRouter extends AnyRouter, TSSRContext> = (
  props: TRPCProviderProps<TRouter, TSSRContext>,
) => JSX.Element;

export type UseDehydratedState<TRouter extends AnyRouter> = (
  client: TRPCUntypedClient<TRouter>,
  trpcState: DehydratedState | undefined,
) => DehydratedState | undefined;

export type CreateClient<TRouter extends AnyRouter> = (
  opts: CreateTRPCClientOptions<TRouter>,
) => TRPCUntypedClient<TRouter>;

type coerceAsyncIterableToArray<TValue> = TValue extends AsyncIterable<
  infer $Inferred
>
  ? $Inferred[]
  : TValue;

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

export interface TRPCHookResult {
  trpc: {
    path: string;
  };
}
