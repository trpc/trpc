import { createTRPCProxyClient, httpBatchLink } from '@trpc/client';
import { createTRPCNextAppRouter } from '@trpc/next-app-router/client';
import { AppRouter } from '~/server/router';

function getBaseUrl() {
  if (typeof window !== 'undefined') return '';
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return 'http://localhost:3000';
}

export const api = createTRPCProxyClient<AppRouter>({
  links: [
    httpBatchLink({
      url: getBaseUrl() + '/api/trpc',
    }),
  ],
});
