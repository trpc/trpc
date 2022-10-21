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
   * Override the default context providers in tRPC
   * @default undefined
   */
  context?: {
    trpc: React.Context<any>;
    reactQuery: React.Context<any>;
  };
}
