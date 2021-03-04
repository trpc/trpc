import { createReactQueryHooks, createTRPCClient } from '@trpc/react';
import type { inferProcedureOutput } from '@trpc/server';
import { QueryClient } from 'react-query';
import superjson from 'superjson';
// ℹ️ Type-only import:
// https://www.typescriptlang.org/docs/handbook/release-notes/typescript-3-8.html#type-only-imports-and-export
import type { AppRouter } from '../pages/api/trpc/[trpc]';

// create helper methods for queries, mutations, and subscriptionos
export const client = createTRPCClient<AppRouter>({
  url: '/api/trpc',
  transformer: superjson,
});

// create react query hooks for trpc
export const trpc = createReactQueryHooks({
  client,
  queryClient: new QueryClient(),
});

/**
 * This is a helper method to infer the output of a query resolver
 * @example type HelloOutput = inferQueryOutput<'hello'>
 */
export type inferQueryOutput<
  TRouteKey extends keyof AppRouter['_def']['queries']
> = inferProcedureOutput<AppRouter['_def']['queries'][TRouteKey]>;
