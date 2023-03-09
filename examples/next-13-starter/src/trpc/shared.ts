import type { inferRouterOutputs } from '@trpc/server';
import type { AppRouter } from '~/server/api/router';

function getBaseUrl() {
  if (typeof window !== 'undefined') return '';
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return 'http://localhost:3000';
}

export function getUrl() {
  return getBaseUrl() + '/api/trpc';
}

export type RouterOutputs = inferRouterOutputs<AppRouter>;
