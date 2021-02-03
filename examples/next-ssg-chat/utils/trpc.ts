import { createReactQueryHooks, createTRPCClient } from '@trpc/react';
import type { DataTransformer, inferRouteOutput } from '@trpc/server';
import { QueryClient } from 'react-query';
import superjson from 'superjson';
import { Normi } from 'normi';
// ℹ️ Type-only import:
// https://www.typescriptlang.org/docs/handbook/release-notes/typescript-3-8.html#type-only-imports-and-export
import type { AppRouter, Context } from '../pages/api/trpc/[...trpc]';

const normi = process.browser ? new Normi() : null;

const transformer: DataTransformer = {
  serialize: superjson.serialize,
  deserialize(data) {
    const d = superjson.deserialize(data);
    if (normi) {
      const n = normi.merge(d);
      return n.value;
    }

    return d;
  },
};
// create helper methods for queries, mutations, and subscriptionos
export const client = createTRPCClient<AppRouter>({
  url: '/api/trpc',
  transformer,
});

// create react query hooks for trpc
export const trpc = createReactQueryHooks<AppRouter, Context>({
  client,
  queryClient: new QueryClient(),
});

/**
 * This is a helper method to infer the output of a query resolver
 * @example type HelloOutput = inferQueryOutput<'hello'>
 */
export type inferQueryOutput<
  TRouteKey extends keyof AppRouter['_def']['queries']
> = inferRouteOutput<AppRouter['_def']['queries'][TRouteKey]>;
