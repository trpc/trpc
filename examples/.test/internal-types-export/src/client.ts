import { createTRPCProxyClient, httpLink } from '@trpc/client';
import type { AppRouter } from './server.js';

export const client = createTRPCProxyClient<AppRouter>({
  links: [
    httpLink({
      url: '/api/trpc',
    })
  ]
});
