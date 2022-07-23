import { createReactQueryHooks, createReactQueryHooksProxy } from '@trpc/react';
import type { AnyRouter } from '@trpc/server';
import { WithTRPCNoSSROptions, withTRPC } from './withTRPC';

export function setupTRPC<TRouter extends AnyRouter>(
  opts: WithTRPCNoSSROptions<TRouter>,
) {
  const hooks = createReactQueryHooks<TRouter>();
  const proxy = createReactQueryHooksProxy<TRouter>(hooks);

  const _withTRPC = withTRPC<TRouter>(opts);

  return {
    proxy,
    useContext: hooks.useContext,
    useInfiniteQuery: hooks.useInfiniteQuery,
    useMutation: hooks.useMutation,
    useQuery: hooks.useQuery,
    useSubscription: hooks.useSubscription,
    withTRPC: _withTRPC,
    queries: hooks.queries,
  };
}
