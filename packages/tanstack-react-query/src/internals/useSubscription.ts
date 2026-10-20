'use client';

import { hashKey } from '@tanstack/react-query';
import * as React from 'react';
import type {
  TRPCSubscriptionOptionsOut,
  TRPCSubscriptionResult,
} from './subscriptionOptions';

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
