import { httpBatchLink } from '@trpc/client';
import { createTRPCNext } from '@trpc/next';
import superjson from 'superjson';
import type { AppRouter } from './basic.trpc';

/**
 * The hooks for the app
 */
export const trpc = createTRPCNext<AppRouter>({
  config(opts) {
    return {
      links: [
        httpBatchLink({
          url: '/api/trpc',
          transformer: superjson,
          headers: () => opts.ctx?.req?.headers ?? {},
        }),
      ],
      queryClientConfig: { defaultOptions: { queries: { staleTime: 60 } } },
    };
  },
  ssr: true,
  transformer: superjson,
});
