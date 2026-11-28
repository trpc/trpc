import {
  createTRPCClient,
  httpLink,
  retryLink,
  routerType,
} from '@trpc/client';
import type { inferRouterInputs, inferRouterOutputs } from '@trpc/server';
import type { AppRouter } from './server.js';

export const client = createTRPCClient<AppRouter>({
  links: [
    httpLink({
      url: '/api/trpc',
    }),
  ],
});

// Declaration files must be able to name the types the links infer
export const clientWithRouterType = createTRPCClient({
  router: routerType<AppRouter>(),
  links: [retryLink({ retry: () => false }), httpLink({ url: '/api/trpc' })],
});

export const clientWithoutContext = createTRPCClient({
  router: routerType<AppRouter>(),
  links: [httpLink({ url: '/api/trpc' })],
});

export type RouterInputs = inferRouterInputs<AppRouter>;
export type RouterOutputs = inferRouterOutputs<AppRouter>;
