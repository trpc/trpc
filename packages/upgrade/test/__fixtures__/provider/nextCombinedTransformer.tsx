import { httpBatchLink } from '@trpc/client';
import { createTRPCNext } from '@trpc/next';
import superjson from 'superjson';
import type { AppRouter } from './basic.trpc';

// `{ input, output }` transformers hydrate with `input`
const combined = { input: superjson, output: superjson };

export const trpc = createTRPCNext<AppRouter>({
  config() {
    return {
      links: [httpBatchLink({ url: '/api/trpc', transformer: combined })],
    };
  },
  transformer: combined,
});
