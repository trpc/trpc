import { createTRPCClient } from '@trpc/client';
import type { AppRouter } from '../server/routers/_app';

export const client = createTRPCClient<AppRouter>({
  url: 'http://localhost:3000/api/trpc',
});
