import type { SkipToken } from '@tanstack/react-query';
import { skipToken } from '@tanstack/react-query';
import type { TRPCClientErrorLike, TRPCUntypedClient } from '@trpc/client';
import type { TRPCConnectionState } from '@trpc/client/unstable-internals';
import type { Unsubscribable } from '@trpc/server/observable';
import type { inferAsyncIterableYield } from '@trpc/server/unstable-core-do-not-import';
import type {
  DefaultFeatureFlags,
  FeatureFlags,
  ResolverDef,
  TRPCQueryKey,
  TRPCQueryOptionsResult,
} from './types';
import { createTRPCOptionsResult } from './utils';

interface BaseTRPCSubscriptionOptionsIn<TOutput, TError> {
  enabled?: boolean;
  onStarted?: () => void;
  onData?: (data: inferAsyncIterableYield<TOutput>) => void;
  onError?: (err: TError) => void;
  onStopped?: () => void;
  /**
   * Called when the subscription is completed on the server.
   * The status will transition to `'idle'` with `data: undefined`.
   */
  onComplete?: () => void;
  onConnectionStateChange?: (state: TRPCConnectionState<TError>) => void;
}

interface UnusedSkipTokenTRPCSubscriptionOptionsIn<TOutput, TError> {
  onStarted?: () => void;
  onData?: (data: inferAsyncIterableYield<TOutput>) => void;
  onError?: (err: TError) => void;
  onStopped?: () => void;
  /**
   * Called when the subscription is completed on the server.
   * The status will transition to `'idle'` with `data: undefined`.
   */
  onComplete?: () => void;
  onConnectionStateChange?: (state: TRPCConnectionState<TError>) => void;
}

export interface TRPCSubscriptionOptionsOut<
  TOutput,
  TError,
  TFeatureFlags extends FeatureFlags,
>
  extends
    UnusedSkipTokenTRPCSubscriptionOptionsIn<TOutput, TError>,
    TRPCQueryOptionsResult {
  enabled: boolean;
  queryKey: TRPCQueryKey<TFeatureFlags['keyPrefix']>;
  subscribe: (
    innerOpts: UnusedSkipTokenTRPCSubscriptionOptionsIn<TOutput, TError>,
  ) => Unsubscribable;
}

/**
 * The `subscriptionOptions` helper on a subscription procedure. Returns options for {@link useSubscription}.
 * @see https://trpc.io/docs/client/tanstack-react-query/usage#subscriptionOptions
 */
export interface TRPCSubscriptionOptions<
  TDef extends ResolverDef,
  TFeatureFlags extends FeatureFlags = DefaultFeatureFlags,
> {
  (
    input: TDef['input'],
    opts?: UnusedSkipTokenTRPCSubscriptionOptionsIn<
      inferAsyncIterableYield<TDef['output']>,
      TRPCClientErrorLike<TDef>
    >,
  ): TRPCSubscriptionOptionsOut<
    inferAsyncIterableYield<TDef['output']>,
    TRPCClientErrorLike<TDef>,
    TFeatureFlags
  >;
  (
    input: TDef['input'] | SkipToken,
    opts?: BaseTRPCSubscriptionOptionsIn<
      inferAsyncIterableYield<TDef['output']>,
      TRPCClientErrorLike<TDef>
    >,
  ): TRPCSubscriptionOptionsOut<
    inferAsyncIterableYield<TDef['output']>,
    TRPCClientErrorLike<TDef>,
    TFeatureFlags
  >;
}
/**
 * The status of a subscription.
 */
export type TRPCSubscriptionStatus =
  | 'idle'
  | 'connecting'
  | 'pending'
  | 'error';

/**
 * Fields shared by every {@link useSubscription} result.
 */
export interface TRPCSubscriptionBaseResult<TOutput, TError> {
  /**
   * Where the subscription is in its lifecycle.
   */
  status: TRPCSubscriptionStatus;
  /**
   * The last data received.
   */
  data: undefined | TOutput;
  /**
   * The last error, if any.
   */
  error: null | TError;
  /**
   * Reset the subscription
   */
  reset: () => void;
}

/**
 * Result while the subscription is not running.
 */
export interface TRPCSubscriptionIdleResult<
  TOutput,
> extends TRPCSubscriptionBaseResult<TOutput, null> {
  status: 'idle';
  data: undefined;
  error: null;
}

/**
 * Result while connecting or reconnecting.
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
 * Result while connected and waiting for data.
 */
export interface TRPCSubscriptionPendingResult<
  TOutput,
> extends TRPCSubscriptionBaseResult<TOutput, undefined> {
  status: 'pending';
  data: TOutput | undefined;
  error: null;
}

/**
 * Result after an error that stopped the subscription.
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
 * The result of {@link useSubscription}. Check `status` to narrow it.
 */
export type TRPCSubscriptionResult<TOutput, TError> =
  | TRPCSubscriptionIdleResult<TOutput>
  | TRPCSubscriptionConnectingResult<TOutput, TError>
  | TRPCSubscriptionErrorResult<TOutput, TError>
  | TRPCSubscriptionPendingResult<TOutput>;

type AnyTRPCSubscriptionOptionsIn =
  | BaseTRPCSubscriptionOptionsIn<unknown, unknown>
  | UnusedSkipTokenTRPCSubscriptionOptionsIn<unknown, unknown>;

type AnyTRPCSubscriptionOptionsOut<TFeatureFlags extends FeatureFlags> =
  TRPCSubscriptionOptionsOut<unknown, unknown, TFeatureFlags>;

/**
 * @internal
 */
export const trpcSubscriptionOptions = <
  TFeatureFlags extends FeatureFlags,
>(args: {
  subscribe: typeof TRPCUntypedClient.prototype.subscription;
  path: string[];
  queryKey: TRPCQueryKey<TFeatureFlags['keyPrefix']>;
  /**
   * The raw input before queryKey serialization. Required to correctly detect
   * `skipToken` because `getQueryKeyInternal` strips it from the queryKey args.
   */
  input: unknown;
  opts?: AnyTRPCSubscriptionOptionsIn;
}): AnyTRPCSubscriptionOptionsOut<TFeatureFlags> => {
  const { subscribe, path, queryKey, input, opts = {} } = args;
  const enabled = 'enabled' in opts ? !!opts.enabled : input !== skipToken;

  const _subscribe: ReturnType<
    TRPCSubscriptionOptions<any, TFeatureFlags>
  >['subscribe'] = (innerOpts) => {
    return subscribe(path.join('.'), input === skipToken ? undefined : input, {
      ...innerOpts,
      // `subscribe` needs at least one defined callback to return an `Unsubscribable`
      onComplete: () => innerOpts.onComplete?.(),
    });
  };

  return {
    ...opts,
    enabled,
    subscribe: _subscribe,
    queryKey,
    trpc: createTRPCOptionsResult({ path }),
  };
};
