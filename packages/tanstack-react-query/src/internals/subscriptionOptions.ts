import type { SkipToken } from '@tanstack/react-query';
import { hashKey, skipToken } from '@tanstack/react-query';
import type { TRPCClientErrorLike, TRPCUntypedClient } from '@trpc/client';
import type { TRPCConnectionState } from '@trpc/client/unstable-internals';
import type { Unsubscribable } from '@trpc/server/observable';
import type { inferAsyncIterableYield } from '@trpc/server/unstable-core-do-not-import';
import * as React from 'react';
import type {
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
  onConnectionStateChange?: (state: TRPCConnectionState<TError>) => void;
}

interface UnusedSkipTokenTRPCSubscriptionOptionsIn<TOutput, TError> {
  onStarted?: () => void;
  onData?: (data: inferAsyncIterableYield<TOutput>) => void;
  onError?: (err: TError) => void;
  onConnectionStateChange?: (state: TRPCConnectionState<TError>) => void;
}

interface TRPCSubscriptionOptionsOut<TOutput, TError>
  extends UnusedSkipTokenTRPCSubscriptionOptionsIn<TOutput, TError>,
    TRPCQueryOptionsResult {
  enabled: boolean;
  queryKey: TRPCQueryKey;
  subscribe: (
    innerOpts: UnusedSkipTokenTRPCSubscriptionOptionsIn<TOutput, TError>,
  ) => Unsubscribable;
}

export interface TRPCSubscriptionOptions<TDef extends ResolverDef> {
  (
    input: TDef['input'],
    opts?: UnusedSkipTokenTRPCSubscriptionOptionsIn<
      inferAsyncIterableYield<TDef['output']>,
      TRPCClientErrorLike<TDef>
    >,
  ): TRPCSubscriptionOptionsOut<
    inferAsyncIterableYield<TDef['output']>,
    TRPCClientErrorLike<TDef>
  >;
  (
    input: TDef['input'] | SkipToken,
    opts?: BaseTRPCSubscriptionOptionsIn<
      inferAsyncIterableYield<TDef['output']>,
      TRPCClientErrorLike<TDef>
    >,
  ): TRPCSubscriptionOptionsOut<
    inferAsyncIterableYield<TDef['output']>,
    TRPCClientErrorLike<TDef>
  >;
}
export type TRPCSubscriptionStatus =
  | 'idle'
  | 'connecting'
  | 'pending'
  | 'error';

export interface TRPCSubscriptionBaseResult<TOutput, TError> {
  status: TRPCSubscriptionStatus;
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
  data: TOutput | undefined;
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

type AnyTRPCSubscriptionOptionsIn =
  | BaseTRPCSubscriptionOptionsIn<unknown, unknown>
  | UnusedSkipTokenTRPCSubscriptionOptionsIn<unknown, unknown>;

type AnyTRPCSubscriptionOptionsOut = TRPCSubscriptionOptionsOut<
  unknown,
  unknown
>;

/**
 * @internal
 */
export const trpcSubscriptionOptions = (args: {
  subscribe: typeof TRPCUntypedClient.prototype.subscription;
  path: readonly string[];
  queryKey: TRPCQueryKey;
  opts: AnyTRPCSubscriptionOptionsIn;
}): AnyTRPCSubscriptionOptionsOut => {
  const { subscribe, path, queryKey, opts } = args;
  const input = queryKey[1]?.input;
  const enabled = 'enabled' in opts ? !!opts.enabled : input !== skipToken;

  const _subscribe: ReturnType<TRPCSubscriptionOptions<any>>['subscribe'] = (
    innerOpts,
  ) => {
    return subscribe(path.join('.'), input ?? undefined, innerOpts);
  };

  return {
    ...opts,
    enabled,
    subscribe: _subscribe,
    queryKey,
    trpc: createTRPCOptionsResult({ path }),
  };
};

export function useSubscription<TOutput, TError>(
  opts: TRPCSubscriptionOptionsOut<TOutput, TError>,
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
      onConnectionStateChange: (result) => {
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
      subscription.unsubscribe();
    };

    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    trackResult(resultRef.current, addTrackedProp),
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
        setState(trackResult(next, addTrackedProp));
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
  result: T,
  onTrackResult: (key: keyof T) => void,
): T {
  const trackedResult = new Proxy(result, {
    get(target, prop) {
      onTrackResult(prop as keyof T);
      return target[prop as keyof T];
    },
  });

  return trackedResult;
}
