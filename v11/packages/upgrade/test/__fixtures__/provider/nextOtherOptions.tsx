import { httpBatchLink } from '@trpc/client';
import { createTRPCNext } from '@trpc/next';
import type { AppRouter } from './basic.trpc';

// Options with no replacement get a TODO each, not silence
export const trpc = createTRPCNext<AppRouter>({
  config() {
    return { links: [httpBatchLink({ url: '/api/trpc' })] };
  },
  overrides: {
    useMutation: {
      async onSuccess(opts) {
        await opts.originalFn();
        await opts.queryClient.invalidateQueries();
      },
    },
  },
  abortOnUnmount: true,
  ssr: false,
});
