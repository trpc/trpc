import { createTRPCClient, httpLink } from '@trpc/client';
import type { inferRouterInputs, inferRouterOutputs } from '@trpc/server';
import type { AppRouter } from './server.js';

export const client = createTRPCClient<AppRouter>({
  links: [
    httpLink({
      url: '/api/trpc',
    }),
  ],
});

export type RouterInputs = inferRouterInputs<AppRouter>;
export type RouterOutputs = inferRouterOutputs<AppRouter>;
