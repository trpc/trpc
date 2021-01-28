import { createReactQueryHooks, createTRPCClient } from '@trpc/react';
import { QueryClient } from 'react-query';
// Type-only import:
// https://www.typescriptlang.org/docs/handbook/release-notes/typescript-3-8.html#type-only-imports-and-export
import type { AppRouter, Context } from '../pages/api/trpc/[...trpc]';
import superjson from 'superjson';

// create helper methods for queries, mutations, and subscriptionos
export const client = createTRPCClient<AppRouter>({
  url: '/api/trpc',
});

// create react query hooks for trpc
export const trpc = createReactQueryHooks<AppRouter, Context>({
  client,
  queryClient: new QueryClient(),
  transformer: superjson,
});
