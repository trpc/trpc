import { httpBatchLink } from '@trpc/client';
import { createTRPCNext } from '@trpc/next';
import state from 'superjson';
import type { AppRouter } from './basic.trpc';

// The hoisted transformer avoids a name the file already uses
export const hydrationTransformer = 'taken';

export const trpc = createTRPCNext<AppRouter>({
  config() {
    return { links: [httpBatchLink({ url: '/api/trpc', transformer: state })] };
  },
  transformer: state,
});
