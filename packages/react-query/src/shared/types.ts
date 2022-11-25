import { QueryClient } from '@tanstack/react-query';
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
  unstable_overrides?: {
    useMutation?: Partial<UseMutationOverride>;
  };

  /**
   * Override the default context provider
   * @default undefined
   */
  context?: React.Context<any>;
  /**
   * Override the default React Query context
   * @default undefined
   */
  reactQueryContext?: React.Context<QueryClient | undefined>;
}
