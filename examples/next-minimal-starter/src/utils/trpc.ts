import { httpBatchLink, splitLink } from '@trpc/client';
import { unstable_formDataLink } from '@trpc/client/links/formDataLink';
import { createTRPCNext } from '@trpc/next';
import { AppRouter } from '../pages/api/trpc/[trpc]';

function getBaseUrl() {
  if (typeof window !== 'undefined') {
    // In the browser, we return a relative URL
    return '';
  }
  // When rendering on the server, we return an absolute URL

  // reference for vercel.com
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }

  // assume localhost
  return `http://localhost:${process.env.PORT ?? 3000}`;
}

export const trpc = createTRPCNext<AppRouter>({
  config() {
    const url = getBaseUrl() + '/api/trpc';
    return {
      links: [
        splitLink({
          condition(op) {
            return op.input instanceof FormData;
          },
          true: unstable_formDataLink({
            url,
          }),
          false: httpBatchLink({
            url,
          }),
        }),
      ],
    };
  },
  ssr: false,
});
