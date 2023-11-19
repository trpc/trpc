import { QueryClient } from '@tanstack/react-query';
import { AnyRouter } from '@trpc/server';
import { MaybePromise } from '@trpc/server/unstableInternalsExport';

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
