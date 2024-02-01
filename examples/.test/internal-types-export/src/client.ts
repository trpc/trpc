import { createTRPCClient, httpLink } from '@trpc/client';
import type { AppRouter } from './server.js';
import type { inferRouterInputs, inferRouterOutputs } from '@trpc/server';

export const client = createTRPCClient<AppRouter>({
  links: [
    httpLink({
      url: '/api/trpc',
    })
  ]
});


export type RouterInputs = inferRouterInputs<AppRouter>;
export type RouterOutputs = inferRouterOutputs<AppRouter>;
