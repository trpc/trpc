import type { inferRouterOutputs } from '@trpc/server';
import { dinero, type Dinero } from 'dinero.js';
import superjson from 'superjson';
import type { AppRouter } from '~/server/api/router';

export const transformer = superjson;

transformer.registerCustom(
  {
    isApplicable: (val): val is Dinero<number> => {
      try {
        dinero(val);
        return true;
      } catch {
        return false;
      }
    },
    serialize: (val) => JSON.stringify(val),
    deserialize: (val) => dinero(JSON.parse(val).price),
  },
  'dinero',
);

function getBaseUrl() {
  if (typeof window !== 'undefined') return '';
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return 'http://localhost:3000';
}

export function getUrl() {
  return getBaseUrl() + '/api/trpc';
}

export type RouterOutputs = inferRouterOutputs<AppRouter>;
