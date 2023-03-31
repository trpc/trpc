import type { inferRouterInputs, inferRouterOutputs } from '@trpc/server';
import { dinero, type Dinero } from 'dinero.js';
import superjson from 'superjson';
import type { AppRouter } from '~/server/api/router';

superjson.registerCustom(
  {
    isApplicable: (val): val is Dinero<number> => {
      try {
        (val as Dinero<number>).calculator.add(1, 2);
        return true;
      } catch {
        return false;
      }
    },
    serialize: (val) => {
      return val.toJSON();
    },
    deserialize: (val) => {
      return dinero(val);
    },
  },
  'dinero.js',
);

export const transformer = superjson;

function getBaseUrl() {
  if (typeof window !== 'undefined') return '';
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return 'http://localhost:3000';
}

export function getUrl() {
  return getBaseUrl() + '/api/trpc';
}
