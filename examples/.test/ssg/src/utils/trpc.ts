import { httpBatchLink } from '@trpc/client';
import { createTRPCNext } from '@trpc/next';
import superjson from 'superjson';
import type { AppRouter } from '~/server/routers/_app';

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
       * @link https://trpc.io/docs/v11/client/links
       */
      links: [
        httpBatchLink({
          url: getBaseUrl() + '/api/trpc',
          /**
           * @link https://trpc.io/docs/v11/data-transformers
           */
          transformer: superjson,
        }),
      ],
    };
  },
  ssr: false,
  transformer: superjson,
});
