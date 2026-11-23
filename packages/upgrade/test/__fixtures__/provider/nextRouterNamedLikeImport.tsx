import { QueryClient as QC } from '@tanstack/react-query';
import { httpBatchLink } from '@trpc/client';
import { createTRPCNext } from '@trpc/next';
import type { AppRouter as QueryClient } from './basic.trpc';

// A router type named like an import keeps its name
export const trpc = createTRPCNext<QueryClient>({
  config() {
    return { links: [httpBatchLink({ url: '/api/trpc' })] };
  },
});

export const unrelated = new QC();
