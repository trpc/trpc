import { httpBatchLink } from '@trpc/client';
import { createTRPCNext } from '@trpc/next';
import type { AppRouter } from '~/server/routers/_app';
import superjson from 'superjson';

function getBaseUrl() {
  if (typeof window !== 'undefined') {
    return '';
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  return `http://localhost:${process.env.PORT ?? 3000}`;
}

export const trpc = createTRPCNext<AppRouter>({
  config() {
    return {
      /**
       * @see https://trpc.io/docs/v11/client/links
       */
      links: [
        httpBatchLink({
          url: getBaseUrl() + '/api/trpc',
          /**
           * @see https://trpc.io/docs/v11/data-transformers
           */
          transformer: superjson,
        }),
      ],
    };
  },
  ssr: false,
  transformer: superjson,
});
