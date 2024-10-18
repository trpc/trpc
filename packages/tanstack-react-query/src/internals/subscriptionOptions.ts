import { hashKey, skipToken, type SkipToken } from '@tanstack/react-query';
import type { TRPCClientErrorLike, TRPCUntypedClient } from '@trpc/client';
import type { Unsubscribable } from '@trpc/server/observable';
import type {
  AnyRouter,
  inferAsyncIterableYield,
} from '@trpc/server/unstable-core-do-not-import';
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
  onData: (data: inferAsyncIterableYield<TOutput>) => void;
  onError?: (err: TError) => void;
}

interface UnusedSkipTokenTRPCSubscriptionOptionsIn<TOutput, TError> {
  onStarted?: () => void;
  onData: (data: inferAsyncIterableYield<TOutput>) => void;
  onError?: (err: TError) => void;
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
    opts: UnusedSkipTokenTRPCSubscriptionOptionsIn<
      TDef['output'],
      TRPCClientErrorLike<TDef>
    >,
  ): TRPCSubscriptionOptionsOut<TDef['output'], TRPCClientErrorLike<TDef>>;
  (
    input: TDef['input'] | SkipToken,
    opts: BaseTRPCSubscriptionOptionsIn<
      TDef['output'],
      TRPCClientErrorLike<TDef>
    >,
  ): TRPCSubscriptionOptionsOut<TDef['output'], TRPCClientErrorLike<TDef>>;
}

export const trpcSubscriptionOptions = (args: {
  untypedClient: TRPCUntypedClient<AnyRouter>;
  path: readonly string[];
  queryKey: TRPCQueryKey;
  opts: BaseTRPCSubscriptionOptionsIn<unknown, unknown>;
}) => {
  const { untypedClient, path, queryKey, opts } = args;
  const input = queryKey[1]?.input;
  const enabled = opts?.enabled ?? input !== skipToken;

  const subscribe: ReturnType<TRPCSubscriptionOptions<any>>['subscribe'] = (
    innerOpts,
  ) => {
    return untypedClient.subscription(
      path.join('.'),
      input ?? undefined,
      innerOpts,
    );
  };

  return {
    ...opts,
    enabled,
    subscribe,
    queryKey,
    trpc: createTRPCOptionsResult({ path }),
  };
};

export function useSubscription<TOutput, TError>(
  opts: TRPCSubscriptionOptionsOut<TOutput, TError>,
): void {
  const optsRef = React.useRef(opts);
  optsRef.current = opts;

  React.useEffect(() => {
    if (opts.enabled === false) {
      return;
    }

    let isStopped = false;
    const subscription = opts.subscribe({
      onStarted: () => {
        if (!isStopped) {
          optsRef.current.onStarted?.();
        }
      },
      onData: (data) => {
        if (!isStopped) {
          optsRef.current.onData(data);
        }
      },
      onError: (err) => {
        if (!isStopped) {
          optsRef.current.onError?.(err);
        }
      },
    });
    return () => {
      isStopped = true;
      subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hashKey(opts.queryKey), opts.enabled]);
}
