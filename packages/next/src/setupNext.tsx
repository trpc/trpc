import { createReactQueryHooks, createReactQueryProxy } from '@trpc/react';
import { AnyRouter } from '@trpc/server';
import { NextPageContext } from 'next/types';
import { WithTRPCNoSSROptions, WithTRPCSSROptions, withTRPC } from './withTRPC';

export function setupTRPC<
  TRouter extends AnyRouter,
  TSSRContext extends NextPageContext = NextPageContext,
>(opts: WithTRPCNoSSROptions<TRouter> | WithTRPCSSROptions<TRouter>) {
  const hooks = createReactQueryHooks<TRouter, TSSRContext>();
  const proxy = createReactQueryProxy<TRouter, TSSRContext>(hooks);

  // TODO: maybe set TSSRContext to `never` when using `WithTRPCNoSSROptions`
  const _withTRPC = withTRPC<TRouter, TSSRContext>(opts);

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
