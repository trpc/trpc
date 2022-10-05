import {
  QueryClient,
  UseInfiniteQueryResult,
  UseMutationResult,
  UseQueryResult,
} from '@tanstack/react-query';
import { AnyRouter, MaybePromise } from '@trpc/server';

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
  }) => MaybePromise<unknown>;
}

/**
 * @internal
 */
export interface CreateTRPCReactOptions<_TRouter extends AnyRouter> {
  /**
   * Override behaviors of the built-in hooks
   */
  unstable_overrides?: {
    useMutation?: Partial<UseMutationOverride>;
  };
}

interface TRPCHookResult {
  trpc: {
    path: string;
  };
}

/**
 * @internal
 */
export type TRPCUseQueryResult<TData, TError> = UseQueryResult<TData, TError> &
  TRPCHookResult;

/**
 * @internal
 */
export type TRPCUseInfiniteQueryResult<TData, TError> = UseInfiniteQueryResult<
  TData,
  TError
> &
  TRPCHookResult;

/**
 * @internal
 */
export type TRPCUseMutationResult<TData, TError, TVariables, TContext> =
  UseMutationResult<TData, TError, TVariables, TContext> & TRPCHookResult;
