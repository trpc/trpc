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
  inferRouterClient,
  TRPCRequestOptions,
  TRPCUntypedClient,
} from '@trpc/client';
import type { ClientContext } from '@trpc/client/internals/types';
import type {
  AnyRouter,
  DistributiveOmit,
} from '@trpc/server/unstable-core-do-not-import';
import type { JSX, ReactNode } from 'react';
import type { TRPCContextProps } from '../../internals/context';
import type { TRPCQueryKey } from '../../internals/getQueryKey';

export type OutputWithCursor<TData, TCursor = any> = {
  cursor: TCursor | null;
  data: TData;
};

export interface TRPCReactRequestOptions<TContext extends ClientContext>
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
  /**
   * Context to be passed to the procedure
   */
  context?: TContext;
}

export interface TRPCUseQueryBaseOptions<TContext extends ClientContext> {
  /**
   * tRPC-related options
   */
  trpc?: TRPCReactRequestOptions<TContext>;
}

export interface UseTRPCQueryOptions<
  TOutput,
  TData,
  TError,
  TContext extends ClientContext,
  TQueryOptsData = TOutput,
> extends DistributiveOmit<
      UseBaseQueryOptions<TOutput, TError, TData, TQueryOptsData, any>,
      'queryKey'
    >,
    TRPCUseQueryBaseOptions<TContext> {}

export interface UseTRPCSuspenseQueryOptions<
  TOutput,
  TData,
  TError,
  TContext extends ClientContext,
> extends DistributiveOmit<
      UseSuspenseQueryOptions<TOutput, TError, TData, any>,
      'queryKey'
    >,
    TRPCUseQueryBaseOptions<TContext> {}

export interface UseTRPCPrefetchQueryOptions<
  TOutput,
  TData,
  TError,
  TContext extends ClientContext,
> extends DistributiveOmit<
      FetchQueryOptions<TOutput, TError, TData, any>,
      'queryKey'
    >,
    TRPCUseQueryBaseOptions<TContext> {}

/** @internal **/
export interface DefinedUseTRPCQueryOptions<
  TOutput,
  TData,
  TError,
  TContext extends ClientContext,
  TQueryOptsData = TOutput,
> extends DistributiveOmit<
    UseTRPCQueryOptions<TOutput, TData, TError, TContext, TQueryOptsData>,
    'queryKey'
  > {
  initialData: InitialDataFunction<TQueryOptsData> | TQueryOptsData;
}

export interface TRPCQueryOptions<TData, TError, TContext extends ClientContext>
  extends DistributiveOmit<QueryOptions<TData, TError, TData, any>, 'queryKey'>,
    TRPCUseQueryBaseOptions<TContext> {
  queryKey: TRPCQueryKey;
}

export type ExtractCursorType<TInput> = TInput extends { cursor?: any }
  ? TInput['cursor']
  : unknown;

export interface UseTRPCInfiniteQueryOptions<
  TInput,
  TOutput,
  TError,
  TContext extends ClientContext,
> extends DistributiveOmit<
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
    TRPCUseQueryBaseOptions<TContext> {
  initialCursor?: ExtractCursorType<TInput>;
}

export type UseTRPCPrefetchInfiniteQueryOptions<
  TInput,
  TOutput,
  TError,
  TContext extends ClientContext,
> = DistributiveOmit<
  FetchInfiniteQueryOptions<
    TOutput,
    TError,
    TOutput,
    any,
    ExtractCursorType<TInput>
  >,
  'queryKey' | 'initialPageParam'
> &
  TRPCUseQueryBaseOptions<TContext> & {
    initialCursor?: ExtractCursorType<TInput>;
  };

export interface UseTRPCSuspenseInfiniteQueryOptions<
  TInput,
  TOutput,
  TError,
  TContext extends ClientContext,
> extends DistributiveOmit<
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
    TRPCUseQueryBaseOptions<TContext> {
  initialCursor?: ExtractCursorType<TInput>;
}

export interface UseTRPCMutationOptions<
  TInput,
  TError,
  TOutput,
  TContext extends ClientContext,
> extends UseMutationOptions<TOutput, TError, TInput, TContext>,
    TRPCUseQueryBaseOptions<TContext> {}

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
}

export interface TRPCSubscriptionBaseResult<TOutput, TError> {
  status: 'idle' | 'connecting' | 'pending' | 'error';
  data: undefined | TOutput;
  error: null | TError;
  /**
   * Reset the subscription
   */
  reset: () => void;
}

export interface TRPCSubscriptionIdleResult<TOutput>
  extends TRPCSubscriptionBaseResult<TOutput, null> {
  status: 'idle';
  data: undefined;
  error: null;
}

export interface TRPCSubscriptionConnectingResult<TOutput, TError>
  extends TRPCSubscriptionBaseResult<TOutput, TError> {
  status: 'connecting';
  data: undefined | TOutput;
  error: TError | null;
}

export interface TRPCSubscriptionPendingResult<TOutput>
  extends TRPCSubscriptionBaseResult<TOutput, undefined> {
  status: 'pending';
  data: TOutput;
  error: null;
}

export interface TRPCSubscriptionErrorResult<TOutput, TError>
  extends TRPCSubscriptionBaseResult<TOutput, TError> {
  status: 'error';
  data: TOutput | undefined;
  error: TError;
}

export type TRPCSubscriptionResult<TOutput, TError> =
  | TRPCSubscriptionIdleResult<TOutput>
  | TRPCSubscriptionConnectingResult<TOutput, TError>
  | TRPCSubscriptionErrorResult<TOutput, TError>
  | TRPCSubscriptionPendingResult<TOutput>;

export interface TRPCProviderProps<
  TRouter extends AnyRouter,
  TSSRContext,
  TContext extends ClientContext,
> extends Omit<TRPCContextProps<TRouter, TSSRContext>, 'client'> {
  children: ReactNode;
  client: inferRouterClient<TRouter, TContext> | TRPCUntypedClient<TRouter>;
}

export type TRPCProvider<
  TRouter extends AnyRouter,
  TSSRContext,
  TContext extends ClientContext,
> = (props: TRPCProviderProps<TRouter, TSSRContext, TContext>) => JSX.Element;

export type CreateClient<TRouter extends AnyRouter> = (
  opts: CreateTRPCClientOptions<TRouter>,
) => TRPCUntypedClient<TRouter>;

export type coerceAsyncIterableToArray<TValue> =
  TValue extends AsyncIterable<infer $Inferred> ? $Inferred[] : TValue;

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
