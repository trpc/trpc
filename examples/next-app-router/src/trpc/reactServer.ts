import { httpBatchLink, loggerLink } from '@trpc/client';
import { createTRPCNextAppRouter } from '@trpc/next-app-router/react-server';
import { headers } from 'next/headers';
import { cache } from 'react';
import { AppRouter } from '~/server/router';

function getBaseUrl() {
  if (typeof window !== 'undefined') return '';
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return 'http://localhost:3000';
}

export const api = cache(() =>
  createTRPCNextAppRouter<AppRouter>({
    config() {
      return {
        links: [
          httpBatchLink({
            headers() {
              return Object.fromEntries(headers());
            },
            url: getBaseUrl() + '/api/trpc',
          }),
        ],
      };
    },
  }),
);
