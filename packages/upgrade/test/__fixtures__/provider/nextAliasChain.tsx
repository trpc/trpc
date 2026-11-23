import {
  QueryClient as QueryClientProvider,
  QueryClientProvider as RQProvider,
} from '@tanstack/react-query';
import { httpBatchLink } from '@trpc/client';
import { createTRPCNext } from '@trpc/next';
import type { AppRouter } from './basic.trpc';

// Each alias is used once: `QueryClient` is `QueryClientProvider` here
export const trpc = createTRPCNext<AppRouter>({
  config() {
    return { links: [httpBatchLink({ url: '/api/trpc' })] };
  },
});

export const used = [QueryClientProvider, RQProvider];
