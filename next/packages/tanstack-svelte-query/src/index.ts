/**
 * Svelte helpers for `@tanstack/svelte-query`: context helpers for the
 * client and its helpers, and `createSubscription`.
 *
 * Pass a getter to `createQuery` so the options follow `$state`:
 *
 * @example
 * ```ts
 * // trpc.ts
 * import { createTrpcContext } from '@trpc12/tanstack-svelte-query';
 *
 * export const { setTrpcContext, useTrpc } = createTrpcContext<AppRouter>();
 * ```
 *
 * ```svelte
 * <script lang="ts">
 *   const trpc = useTrpc();
 *   let { id } = $props();
 *   const post = createQuery(() => trpc.post.byId.queryOptions({ input: { id } }));
 * </script>
 *
 * <h1>{post.data?.title}</h1>
 * ```
 * @module
 */
import { getContext, setContext } from 'svelte';
import type { ChainTypes, RouterOf, TrpcClient } from '@trpc12/trpc/client';
import {
  createTrpcQueryUtils,
  type TrpcQueryUtilsFor,
  type SourceContext,
  type SourceLinks,
  type SourceRouter,
  type TrpcContextOptions,
} from '@trpc12/tanstack-query';

export * from '@trpc12/tanstack-query';

export {
  createSubscription,
  type CreateSubscriptionResult,
} from './subscription.svelte.ts';

/**
 * What {@link createTrpcContext} returns.
 * @since 0.0.1
 * @stability stable
 */
export interface TrpcSvelteContext<
  TRouter,
  TContext extends object = {},
  TLinks extends ChainTypes = {},
> {
  /**
   * Sets the client on the current component's context, for its
   * descendants. Call it during component init, next to
   * `QueryClientProvider` or `setQueryClientContext`.
   */
  setTrpcContext: (
    client: TrpcClient<RouterOf<TRouter>, TContext, undefined, TLinks>,
  ) => TrpcQueryUtilsFor<TRouter, TContext, TLinks>;
  /** The helpers for the client in context. */
  useTrpc: () => TrpcQueryUtilsFor<TRouter, TContext, TLinks>;
  /** The client in context, for calls outside TanStack Query. */
  useTrpcClient: () => TrpcClient<
    RouterOf<TRouter>,
    TContext,
    undefined,
    TLinks
  >;
}

/**
 * Creates a context key and helpers for a client and its helpers.
 *
 * `TSource` is the client's type (`ReturnType<typeof makeClient>`), which
 * brings its links' context and types too, or a router type with
 * `TContext` and `TLinks` spelled out.
 *
 * @example
 * ```svelte
 * <script lang="ts">
 *   import { QueryClient, QueryClientProvider } from '@tanstack/svelte-query';
 *   import { setTrpcContext } from './trpc.ts';
 *
 *   setTrpcContext(client);
 * </script>
 *
 * <QueryClientProvider client={new QueryClient()}>
 *   <App />
 * </QueryClientProvider>
 * ```
 * @since 0.0.1
 * @stability stable
 */
export function createTrpcContext<
  TSource,
  TContext extends object = SourceContext<TSource>,
  TLinks extends ChainTypes = SourceLinks<TSource>,
>(
  opts: TrpcContextOptions = {},
): TrpcSvelteContext<SourceRouter<TSource>, TContext, TLinks> {
  type TRouter = SourceRouter<TSource>;
  type Value = {
    client: TrpcClient<RouterOf<TRouter>, TContext, undefined, TLinks>;
    utils: TrpcQueryUtilsFor<TRouter, TContext, TLinks>;
  };
  const key = Symbol('trpc');
  const use = (): Value => {
    const value = getContext<Value | undefined>(key);
    if (!value) throw new Error('Call setTrpcContext() in a parent first');
    return value;
  };
  return {
    setTrpcContext: (client) =>
      setContext<Value>(key, {
        client,
        utils: createTrpcQueryUtils({ ...opts, client }),
      }).utils,
    useTrpc: () => use().utils,
    useTrpcClient: () => use().client,
  };
}
