import { QueryClient as QC } from '@tanstack/react-query';
import { httpBatchLink } from '@trpc/client';
import { createTRPCNext } from '@trpc/next';
import type { AppRouter } from './basic.trpc';

// A config function named like an import keeps its name
function QueryClient() {
  return { links: [httpBatchLink({ url: '/api/trpc' })] };
}

export const trpc = createTRPCNext<AppRouter>({ config: QueryClient });

export const unrelated = new QC();
