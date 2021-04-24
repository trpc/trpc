import { createReactQueryHooks, createTRPCClient } from '@trpc/react';
// Type-only import:
// https://www.typescriptlang.org/docs/handbook/release-notes/typescript-3-8.html#type-only-imports-and-export
import type { AppRouter } from '../pages/api/trpc/[trpc]';

// create helper methods for queries, mutations, and subscriptionos
export const client = createTRPCClient<AppRouter>({
  url: '/api/trpc',
});

// create react query hooks for trpc
export const trpc = createReactQueryHooks({
  client,
});
