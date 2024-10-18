import { hashKey, skipToken, type SkipToken } from '@tanstack/react-query';
import type { TRPCClientError, TRPCUntypedClient } from '@trpc/client';
import type { AnyTRPCRouter } from '@trpc/server';
import type { Unsubscribable } from '@trpc/server/observable';
import type {
  AnyRootTypes,
  AnySubscriptionProcedure,
  inferAsyncIterableYield,
  inferProcedureInput,
  inferTransformedSubscriptionOutput,
} from '@trpc/server/unstable-core-do-not-import';
import { useEffect, useRef } from 'react';
import type { TRPCQueryKey, TRPCQueryOptionsResult } from './types';
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

export interface TRPCSubscriptionOptions<
  TRoot extends AnyRootTypes,
  TProcedure extends AnySubscriptionProcedure,
> {
  (
    input: inferProcedureInput<TProcedure>,
    opts: UnusedSkipTokenTRPCSubscriptionOptionsIn<
      inferTransformedSubscriptionOutput<TRoot, TProcedure>,
      TRPCClientError<TRoot>
    >,
  ): TRPCSubscriptionOptionsOut<
    inferTransformedSubscriptionOutput<TRoot, TProcedure>,
    TRPCClientError<TRoot>
  >;
  (
    input: inferProcedureInput<TProcedure> | SkipToken,
    opts: BaseTRPCSubscriptionOptionsIn<
      inferTransformedSubscriptionOutput<TRoot, TProcedure>,
      TRPCClientError<TRoot>
    >,
  ): TRPCSubscriptionOptionsOut<
    inferTransformedSubscriptionOutput<TRoot, TProcedure>,
    TRPCClientError<TRoot>
  >;
}

export function trpcSubscriptionOptions<
  TRoot extends AnyRootTypes,
  TProcedure extends AnySubscriptionProcedure,
>(args: {
  untypedClient: TRPCUntypedClient<AnyTRPCRouter>;
  path: readonly string[];
  queryKey: TRPCQueryKey;
  opts: BaseTRPCSubscriptionOptionsIn<unknown, unknown>;
}): ReturnType<TRPCSubscriptionOptions<TRoot, TProcedure>> {
  const { untypedClient, path, queryKey, opts } = args;
  const input = queryKey[1]?.input;
  const enabled = opts?.enabled ?? input !== skipToken;

  const subscribe: ReturnType<
    TRPCSubscriptionOptions<TRoot, TProcedure>
  >['subscribe'] = (innerOpts) => {
    return untypedClient.subscription(
      path.join('.'),
      input ?? undefined,
      innerOpts as any,
    );
  };

  return {
    ...opts,
    enabled,
    subscribe,
    queryKey,
    trpc: createTRPCOptionsResult({ path }),
  };
}

export function useSubscription<TOutput, TError>(
  opts: TRPCSubscriptionOptionsOut<TOutput, TError>,
): void {
  const optsRef = useRef(opts);
  optsRef.current = opts;

  useEffect(() => {
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
