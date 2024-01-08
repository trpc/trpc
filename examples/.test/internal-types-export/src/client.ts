import { createTRPCClient, httpLink } from '@trpc/client';
import type { AppRouter } from './server.js';

export const client = createTRPCClient<AppRouter>({
  links: [
    httpLink({
      url: '/api/trpc',
    })
  ]
});
