/**
 * Svelte helpers for `@tanstack/svelte-query`: context helpers for the
 * client and its helpers, and `createSubscription`.
 *
 * Pass a getter to `createQuery` so the options follow `$state`:
 *
 * @example
 * ```ts
 * // trpc.ts
 * import { createTRPCContext } from '@trpcdev/tanstack-svelte-query';
 *
 * export const { setTRPCContext, useTRPC } = createTRPCContext<AppRouter>();
 * ```
 *
 * ```svelte
 * <script lang="ts">
 *   const trpc = useTRPC();
 *   let { id } = $props();
 *   const post = createQuery(() => trpc.post.byId.queryOptions({ input: { id } }));
 * </script>
 *
 * <h1>{post.data?.title}</h1>
 * ```
 * @module
 */
import { getContext, setContext } from 'svelte';
import type { RouterOf, TRPCClient } from 'trpcdev/client';
import {
  createTRPCQueryUtils,
  type TRPCQueryUtilsFor,
} from '@trpcdev/tanstack-query';

export * from '@trpcdev/tanstack-query';

export {
  createSubscription,
  type CreateSubscriptionResult,
} from './subscription.svelte.ts';

/**
 * What {@link createTRPCContext} returns.
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export interface TRPCSvelteContext<TRouter, TContext extends object = {}> {
  /**
   * Sets the client on the current component's context, for its
   * descendants. Call it during component init, next to
   * `QueryClientProvider` or `setQueryClientContext`.
   */
  setTRPCContext: (
    client: TRPCClient<RouterOf<TRouter>, TContext>,
  ) => TRPCQueryUtilsFor<TRouter, TContext>;
  /** The helpers for the client in context. */
  useTRPC: () => TRPCQueryUtilsFor<TRouter, TContext>;
  /** The client in context, for calls outside TanStack Query. */
  useTRPCClient: () => TRPCClient<RouterOf<TRouter>, TContext>;
}

/**
 * Creates a context key and helpers for a client and its helpers.
 * `TContext` is what the client's links declare.
 *
 * @example
 * ```svelte
 * <script lang="ts">
 *   import { QueryClient, QueryClientProvider } from '@tanstack/svelte-query';
 *   import { setTRPCContext } from './trpc.ts';
 *
 *   setTRPCContext(client);
 * </script>
 *
 * <QueryClientProvider client={new QueryClient()}>
 *   <App />
 * </QueryClientProvider>
 * ```
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export function createTRPCContext<
  TRouter,
  TContext extends object = {},
>(): TRPCSvelteContext<TRouter, TContext> {
  type Value = {
    client: TRPCClient<RouterOf<TRouter>, TContext>;
    utils: TRPCQueryUtilsFor<TRouter, TContext>;
  };
  const key = Symbol('trpc');
  const use = (): Value => {
    const value = getContext<Value | undefined>(key);
    if (!value) throw new Error('Call setTRPCContext() in a parent first');
    return value;
  };
  return {
    setTRPCContext: (client) =>
      setContext<Value>(key, {
        client,
        utils: createTRPCQueryUtils({ client }),
      }).utils,
    useTRPC: () => use().utils,
    useTRPCClient: () => use().client,
  };
}
