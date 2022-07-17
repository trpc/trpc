import { createReactQueryHooksProxy, setupReact } from '@trpc/react';
import { AnyRouter } from '@trpc/server';
import { NextPageContext } from 'next/types';
import {
  WithTRPCNoSSROptions,
  WithTRPCSSROptions,
  _withTRPC,
} from './withTRPC';

export function setupTrpcNext<
  TRouter extends AnyRouter,
  TSSRContext extends NextPageContext = NextPageContext,
>(opts: WithTRPCNoSSROptions<TRouter> | WithTRPCSSROptions<TRouter>) {
  const hooks = setupReact<TRouter, TSSRContext>();
  const proxy = createReactQueryHooksProxy<TRouter, TSSRContext>(hooks);

  // TODO: maybe set TSSRContext to `never` when using `WithTRPCNoSSROptions`
  const withTRPC = _withTRPC<TRouter, TSSRContext>(hooks, opts);

  return {
    proxy,
    useContext: hooks.useContext,
    useInfiniteQuery: hooks.useInfiniteQuery,
    useMutation: hooks.useMutation,
    useQuery: hooks.useQuery,
    useSubscription: hooks.useSubscription,
    withTRPC,
    queries: hooks.queries,
  };
}
