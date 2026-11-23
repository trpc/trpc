import { httpBatchLink } from '@trpc/client';
import { createTRPCNext } from '@trpc/next';
import type { AppRouter } from './basic.trpc';

// A config function called `config` stays callable in `makeQueryClient`
function config() {
  return { links: [httpBatchLink({ url: '/api/trpc' })] };
}

export const trpc = createTRPCNext<AppRouter>({ config });
