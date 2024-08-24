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
  ConnectionState,
  CreateTRPCClientOptions,
  TRPCConnectionStateMessage,
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

export interface UseTRPCSubscriptionOptions<TOutput, TError> {
  enabled?: boolean;
  onStarted?: () => void;
  /**
   * @deprecated use onStateChange instead
   */
  onError?: (err: TError) => void;
  onData: (data: TOutput) => void;
  onStateChange?: (state: TRPCConnectionStateMessage<TError>) => void;
}

export interface restartSubscriptionOptionsBase {
  /**
   * Cancel the current subscription and re-establish a new one
   * - Defaults to `true`
   * - Set to `false` no new subscription will be established if there is already an active subscription
   */
  cancelSubscription?: boolean;
}

export interface restartSubscriptionOptionsWithLastEventId
  extends restartSubscriptionOptionsBase {
  /**
   * Defaults to `true` in case of failure or if the subscription is still active
   * - When the susbscription has successfully completed, it will be set to `false`
   */
  sendLastEventId?: boolean;
}

export type restartSubscriptionOptions<TInput> = TInput extends {
  lastEventId?: string | null;
} | void
  ? restartSubscriptionOptionsWithLastEventId
  : restartSubscriptionOptionsBase;

export type restartSubscriptionFn<TInput> = (
  options?: restartSubscriptionOptions<TInput>,
) => void;

export interface TRPCSubscriptionBaseResult<_TInput, TOutput, TError> {
  /**
   * The last data received from the subscription
   */
  data: TOutput | null;
  /**
   * The timestamp for when the connection was last (re-)established
   */
  connectionStartedAt: number;
  /**
   * The timestamp for when the connection was initially established
   */
  initialConnectionStartedAt: number;
  /**
   * The error that caused the subscription to stop
   * - Defaults to `null`
   * - Resets to `null` after the subscription is restarted and the connection is re-established
   */
  error: TError | null;
  /**
   * The timestamp for when the last error was captured
   */
  errorUpdatedAt: number;
  /**
   * The reason for the reconnection
   * - Resets to `null` after the subscription is restarted and the connection is re-established
   */
  connectionError: TError | null;
  /**
   * Reconnection attempts since last successful connection
   */
  connectionAttemptCount: number;
  /**
   * The timestamp for when the last reconnection error was captured
   */
  connectionErrorUpdatedAt: number;
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
   * - Alias for `status === 'connecting'`
   */
  isConnecting: boolean;
  /**
   * Is `true` when the subscription is connected and listening for data
   * - Alias for `status === 'pending'`
   */
  isPending: boolean;
  /**
   * Is `true` if the subscription is re-establishing a connection
   * - Alias for `status === 'connecting' && isStarted === true`
   */
  isReconnecting: boolean;
  /**
   * Is `true` if the subscription ended in an error state
   * - Alias for `status === 'error'`
   */
  isError: boolean;
  /**
   * The current state of the subscription
   * - Will be:
   *  - `'idle'` when the subscription is not enabled
   *  - `'connecting'` when the subscription is (re-)establishing the connection
   *  - `'pending'` when the subscription is connected and receiving data
   *  - `'error'` when the subscription has stopped due to an error
   */
  status: ConnectionState;
  /**
   * Restart the subscription
   */
  // restart: restartSubscriptionFn<TInput>;
}

export interface TRPCSubscriptionIdleResult<TInput, TOutput, TError>
  extends TRPCSubscriptionBaseResult<TInput, TOutput, TError> {
  data: null;
  error: null;
  errorUpdatedAt: 0;
  connectionError: null;
  isStarting: false;
  isStarted: false;
  isConnecting: false;
  isPending: false;
  isReconnecting: false;
  isError: false;
  connectionAttemptCount: 0;
  connectionErrorUpdatedAt: 0;
  connectionStartedAt: 0;
  initialConnectionStartedAt: 0;
  status: 'idle';
}

const defaultIdleResult: Omit<
  TRPCSubscriptionIdleResult<unknown, unknown, unknown>,
  'restart'
> = {
  data: null,
  connectionStartedAt: 0,
  initialConnectionStartedAt: 0,
  error: null,
  errorUpdatedAt: 0,
  connectionError: null,
  connectionAttemptCount: 0,
  isStarting: false,
  isStarted: false,
  isConnecting: false,
  isPending: false,
  isReconnecting: false,
  isError: false,
  connectionErrorUpdatedAt: 0,
  status: 'idle',
};

export const getIdleResult = <
  TInput,
  TOutput,
  TError,
>(): //  restart: restartSubscriptionFn<TInput>,
TRPCSubscriptionIdleResult<TInput, TOutput, TError> => {
  return {
    ...defaultIdleResult,
    data: null,
    //    restart,
  };
};

export interface TRPCSubscriptionStartingResult<TInput, TOutput, TError>
  extends TRPCSubscriptionBaseResult<TInput, TOutput, TError> {
  connectionStartedAt: 0;
  initialConnectionStartedAt: 0;
  error: null;
  data: null;
  connectionError: TError | null;
  isStarting: true;
  isStarted: false;
  isConnecting: true;
  isPending: false;
  isReconnecting: false;
  isError: false;
  status: 'connecting';
}

export const getStartingResult = <TInput, TOutput, TError>(
  // restart: restartSubscriptionFn<TInput>,
  previous?:
    | TRPCSubscriptionIdleResult<TInput, TOutput, TError>
    | TRPCSubscriptionErrorResult<TInput, TOutput, TError>
    | TRPCSubscriptionStartingResult<TInput, TOutput, TError>,
  error?: TError | null,
): TRPCSubscriptionStartingResult<TInput, TOutput, TError> => {
  const now = Date.now();

  if (previous) {
    return {
      ...defaultIdleResult,
      ...previous,
      data: null,
      connectionError: error ?? null,
      isStarting: true,
      isConnecting: true,
      errorUpdatedAt: 0,
      connectionAttemptCount: previous.connectionAttemptCount + 1,
      connectionErrorUpdatedAt: error ? now : 0,
      connectionStartedAt: 0,
      initialConnectionStartedAt: 0,
      error: null,
      isStarted: false,
      isError: false,
      status: 'connecting',
    };
  }

  return {
    ...getIdleResult(/*restart*/),
    connectionError: error ?? null,
    isStarting: true,
    isConnecting: true,
    errorUpdatedAt: 0,
    connectionAttemptCount: 0,
    connectionErrorUpdatedAt: error ? now : 0,
    status: 'connecting',
  };
};

export interface TRPCSubscriptionPendingResult<TInput, TOutput, TError>
  extends TRPCSubscriptionBaseResult<TInput, TOutput, TError> {
  error: null;
  connectionError: null;
  connectionAttemptCount: 0;
  isStarting: false;
  isStarted: true;
  isConnecting: false;
  isPending: true;
  isReconnecting: false;
  isError: false;
  status: 'pending';
}

export const getPendingResult = <TInput, TOutput, TError>(
  previous: UseTRPCSubscriptionResult<TInput, TOutput, TError>,
  data?: TOutput,
): TRPCSubscriptionPendingResult<TInput, TOutput, TError> => {
  const time = Date.now();

  if (previous.isStarting) {
    return {
      ...previous,
      error: null,
      isStarting: false,
      isStarted: true,
      isConnecting: false,
      isReconnecting: false,
      isPending: true,
      status: 'pending',
      connectionStartedAt: time,
      connectionAttemptCount: 0,
      connectionError: null,
      initialConnectionStartedAt: time,
    };
  }

  return {
    ...previous,
    data: data ?? previous.data,
    error: null,
    isError: false,
    isStarting: false,
    isStarted: true,
    isConnecting: false,
    isReconnecting: false,
    isPending: true,
    status: 'pending',
    connectionStartedAt: time,
    connectionAttemptCount: 0,
    connectionError: null,
  };
};

export interface TRPCSubscriptionReconnectingResult<TInput, TOutput, TError>
  extends TRPCSubscriptionBaseResult<TInput, TOutput, TError> {
  error: null;
  connectionError: TError;
  isStarting: false;
  isStarted: true;
  isConnecting: true;
  isPending: false;
  isReconnecting: true;
  isError: false;
  status: 'connecting';
}

export const getReconnectingResult = <TInput, TOutput, TError>(
  previous:
    | TRPCSubscriptionPendingResult<TInput, TOutput, TError>
    | TRPCSubscriptionReconnectingResult<TInput, TOutput, TError>,
  error: TError,
): TRPCSubscriptionReconnectingResult<TInput, TOutput, TError> => {
  return {
    ...previous,
    isStarting: false,
    isStarted: true,
    isConnecting: true,
    isReconnecting: true,
    isPending: false,
    status: 'connecting',
    connectionError: error,
    connectionAttemptCount: previous.connectionAttemptCount + 1,
  };
};

export const getConnectingResult = <TInput, TOutput, TError>(
  previous: UseTRPCSubscriptionResult<TInput, TOutput, TError>,
  error: TError | null,
): TRPCSubscriptionConnectingResult<TInput, TOutput, TError> => {
  if (previous.isReconnecting || previous.isPending) {
    if (!error) throw new Error('Reconnecting without error?');

    return getReconnectingResult(previous, error);
  }

  return getStartingResult(/*previous.restart, */ previous, error);
};

export interface TRPCSubscriptionErrorResult<TInput, TOutput, TError>
  extends TRPCSubscriptionBaseResult<TInput, TOutput, TError> {
  error: TError;
  isStarting: false;
  isStarted: true; // Not sure about this one
  isConnecting: false;
  isPending: false;
  isReconnecting: false;
  isError: true;
  status: 'error';
}

export const getErrorResult = <TInput, TOutput, TError>(
  previous: UseTRPCSubscriptionResult<TInput, TOutput, TError>,
  error: TError,
): TRPCSubscriptionErrorResult<TInput, TOutput, TError> => {
  return {
    ...previous,
    isStarting: false,
    isStarted: true,
    isConnecting: false,
    isReconnecting: false,
    isPending: false,
    isError: true,
    status: 'error',
    error,
    errorUpdatedAt: Date.now(),
  };
};

export type TRPCSubscriptionConnectingResult<TInput, TOutput, TError> =
  | TRPCSubscriptionStartingResult<TInput, TOutput, TError>
  | TRPCSubscriptionReconnectingResult<TInput, TOutput, TError>;

export type UseTRPCSubscriptionResult<TInput, TOutput, TError> =
  | TRPCSubscriptionIdleResult<TInput, TOutput, TError>
  | TRPCSubscriptionPendingResult<TInput, TOutput, TError>
  | TRPCSubscriptionConnectingResult<TInput, TOutput, TError>
  | TRPCSubscriptionErrorResult<TInput, TOutput, TError>;

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
