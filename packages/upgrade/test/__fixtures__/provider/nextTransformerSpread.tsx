import { httpBatchLink } from '@trpc/client';
import { createTRPCNext } from '@trpc/next';
import superjson from 'superjson';
import type { AppRouter } from './basic.trpc';
import { overrides } from './overrides';

// A spread may replace `input`, so read it from the whole object
export const trpc = createTRPCNext<AppRouter>({
  config() {
    return {
      links: [httpBatchLink({ url: '/api/trpc', transformer: superjson })],
    };
  },
  transformer: { input: superjson, output: superjson, ...overrides },
});
