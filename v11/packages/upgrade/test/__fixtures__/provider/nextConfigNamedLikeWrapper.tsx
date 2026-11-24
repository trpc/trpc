import { httpBatchLink } from '@trpc/client';
import { createTRPCNext } from '@trpc/next';
import type { AppRouter } from './basic.trpc';

// A config function named like a `withTRPC` local stays callable
export const configCalls = { count: 0 };

function queryClient() {
  configCalls.count++;
  return { links: [httpBatchLink({ url: 'http://localhost/api/trpc' })] };
}

export const trpc = createTRPCNext<AppRouter>({ config: queryClient });
