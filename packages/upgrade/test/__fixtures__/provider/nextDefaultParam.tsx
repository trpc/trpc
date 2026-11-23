import { httpBatchLink } from '@trpc/client';
import { createTRPCNext } from '@trpc/next';
import type { AppRouter } from './basic.trpc';

// A default value keeps the parameter, typed
export const trpc = createTRPCNext<AppRouter>({
  config({ ctx } = {}) {
    return { links: [httpBatchLink({ url: ctx ? '/api/trpc' : '/trpc' })] };
  },
});
