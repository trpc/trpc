import type {
  DataTag,
  DefinedInitialDataOptions,
  QueryClient,
  UndefinedInitialDataOptions,
} from '@tanstack/react-query';
import type {
  AnyRouter,
  DistributiveOmit,
  MaybePromise,
} from '@trpc/server/unstable-core-do-not-import';
import type { TRPCQueryKey } from '../internals/getQueryKey';

export interface TRPCQueryBaseOptions {
  /**
   * tRPC-related options
   */
  trpc?: Record<never, never>;
}

export interface UndefinedTRPCQueryOptionsIn<TOutput, TError>
  extends DistributiveOmit<
      UndefinedInitialDataOptions<TOutput, TError, TOutput, TRPCQueryKey>,
      'queryKey' | 'queryFn' | 'queryHashFn' | 'queryHash'
    >,
    TRPCQueryBaseOptions {}

export interface UndefinedTRPCQueryOptionsOut<TOutput, TError>
  extends UndefinedInitialDataOptions<TOutput, TError, TOutput, TRPCQueryKey> {
  queryKey: DataTag<TRPCQueryKey, TOutput>;
}

export interface DefinedTRPCQueryOptionsIn<TOutput, TError>
  extends DistributiveOmit<
      DefinedInitialDataOptions<TOutput, TError, TOutput, TRPCQueryKey>,
      'queryKey' | 'queryFn' | 'queryHashFn' | 'queryHash'
    >,
    TRPCQueryBaseOptions {}

export interface DefinedTRPCQueryOptionsOut<TOutput, TError>
  extends DefinedInitialDataOptions<TOutput, TError, TOutput, TRPCQueryKey> {
  queryKey: DataTag<TRPCQueryKey, TOutput>;
}

/**
 * @internal
 */
export interface UseMutationOverride {
  onSuccess: (opts: {
    /**
     * Calls the original function that was defined in the query's `onSuccess` option
     */
    originalFn: () => MaybePromise<unknown>;
    queryClient: QueryClient;
    /**
     * Meta data passed in from the `useMutation()` hook
     */
    meta: Record<string, unknown>;
  }) => MaybePromise<unknown>;
}

/**
 * @internal
 */
export interface CreateTRPCReactOptions<_TRouter extends AnyRouter> {
  /**
   * Override behaviors of the built-in hooks
   */
  overrides?: {
    useMutation?: Partial<UseMutationOverride>;
  };

  /**
   * Abort all queries when unmounting
   * @default false
   */
  abortOnUnmount?: boolean;

  /**
   * Override the default context provider
   * @default undefined
   */
  context?: React.Context<any>;
}
