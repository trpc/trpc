import type { SkipToken } from '@tanstack/react-query';
import { hashKey, skipToken } from '@tanstack/react-query';
import type { TRPCClientErrorLike, TRPCUntypedClient } from '@trpc/client';
import type { TRPCConnectionState } from '@trpc/client/unstable-internals';
import type { Unsubscribable } from '@trpc/server/observable';
import type { inferAsyncIterableYield } from '@trpc/server/unstable-core-do-not-import';
import * as React from 'react';
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

interface TRPCSubscriptionOptionsOut<
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
  opts: AnyTRPCSubscriptionOptionsIn;
}): AnyTRPCSubscriptionOptionsOut<TFeatureFlags> => {
  const { subscribe, path, queryKey, input, opts } = args;
  const enabled = 'enabled' in opts ? !!opts.enabled : input !== skipToken;

  const _subscribe: ReturnType<
    TRPCSubscriptionOptions<any, TFeatureFlags>
  >['subscribe'] = (innerOpts) => {
    return subscribe(
      path.join('.'),
      input === skipToken ? undefined : input,
      innerOpts,
    );
  };

  return {
    ...opts,
    enabled,
    subscribe: _subscribe,
    queryKey,
    trpc: createTRPCOptionsResult({ path }),
  };
};

/**
 * Runs a subscription while the component is mounted.
 *
 * @example
 * ```ts
 * const trpc = useTRPC();
 * const sub = useSubscription(
 *   trpc.chat.onMessage.subscriptionOptions({ roomId }),
 * );
 * ```
 *
 * @see https://trpc.io/docs/client/tanstack-react-query/usage#subscriptionOptions
 */
export function useSubscription<TOutput, TError>(
  opts: TRPCSubscriptionOptionsOut<TOutput, TError, any>,
): TRPCSubscriptionResult<TOutput, TError> {
  type $Result = TRPCSubscriptionResult<TOutput, TError>;

  const optsRef = React.useRef(opts);
  optsRef.current = opts;

  const trackedProps = React.useRef(new Set<keyof $Result>([]));

  const addTrackedProp = React.useCallback((key: keyof $Result) => {
    trackedProps.current.add(key);
  }, []);

  type Unsubscribe = () => void;
  const currentSubscriptionRef = React.useRef<Unsubscribe>(() => {
    // noop
  });

  const reset = React.useCallback((): void => {
    // unsubscribe from the previous subscription
    currentSubscriptionRef.current?.();

    updateState(getInitialState);
    if (!opts.enabled) {
      return;
    }

    // links complete the observable when it's unsubscribed, which must not
    // be treated as the server ending the subscription
    let isUnsubscribed = false;
    let isEnded = false;
    // runs before the user's callback, so a `reset()` from inside it wins
    const setEnded = () => {
      if (isEnded) {
        return;
      }
      isEnded = true;
      updateState((prev) => ({
        ...prev,
        status: 'idle',
        data: undefined,
        error: null,
      }));
    };

    const subscription = opts.subscribe({
      onStarted: () => {
        optsRef.current.onStarted?.();
        updateState((prev) => ({
          ...(prev as any),
          status: 'pending',
          error: null,
        }));
      },
      onData: (data) => {
        optsRef.current.onData?.(data);
        updateState((prev) => ({
          ...(prev as any),
          status: 'pending',
          data,
          error: null,
        }));
      },
      onError: (error) => {
        optsRef.current.onError?.(error);
        updateState((prev) => ({
          ...(prev as any),
          status: 'error',
          error,
        }));
      },
      onStopped: () => {
        if (isUnsubscribed) {
          return;
        }
        setEnded();
        optsRef.current.onStopped?.();
      },
      onComplete: () => {
        if (isUnsubscribed) {
          return;
        }
        setEnded();
        optsRef.current.onComplete?.();
      },
      onConnectionStateChange: (result) => {
        optsRef.current.onConnectionStateChange?.(result);
        updateState((prev) => {
          switch (result.state) {
            case 'connecting':
              return {
                ...prev,
                status: 'connecting',
                error: result.error,
              };
            case 'pending':
              // handled in onStarted
              return prev;
            case 'idle':
              return {
                ...prev,
                status: 'idle',
                data: undefined,
                error: null,
              };
          }
        });
      },
    });

    currentSubscriptionRef.current = () => {
      isUnsubscribed = true;
      subscription.unsubscribe();
    };
    // oxlint-disable-next-line react/exhaustive-deps
  }, [hashKey(opts.queryKey), opts.enabled]);

  const getInitialState = React.useCallback((): $Result => {
    return opts.enabled
      ? {
          data: undefined,
          error: null,
          status: 'connecting',
          reset,
        }
      : {
          data: undefined,
          error: null,
          status: 'idle',
          reset,
        };
  }, [opts.enabled, reset]);

  const resultRef = React.useRef<$Result>(getInitialState());

  const [state, setState] = React.useState<$Result>(
    trackResult(resultRef, addTrackedProp),
  );

  state.reset = reset;

  const updateState = React.useCallback(
    (callback: (prevState: $Result) => $Result) => {
      const prev = resultRef.current;
      const next = (resultRef.current = callback(prev));

      let shouldUpdate = false;
      for (const key of trackedProps.current) {
        if (prev[key] !== next[key]) {
          shouldUpdate = true;
          break;
        }
      }
      if (shouldUpdate) {
        setState(trackResult(resultRef, addTrackedProp));
      }
    },
    [addTrackedProp],
  );

  React.useEffect(() => {
    if (!opts.enabled) {
      return;
    }
    reset();

    return () => {
      currentSubscriptionRef.current?.();
    };
  }, [reset, opts.enabled]);

  return state;
}

function trackResult<T extends object>(
  result: React.RefObject<T>,
  onTrackResult: (key: keyof T) => void,
): T {
  const trackedResult = new Proxy(result.current, {
    get(_target, prop) {
      onTrackResult(prop as keyof T);
      // Bypass target, so that we always get the latest value
      return result.current[prop as keyof T];
    },
  });

  return trackedResult;
}
