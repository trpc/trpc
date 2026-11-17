import { QueryClient as QC } from '@tanstack/react-query';
import { httpBatchLink } from '@trpc/client';
import { createTRPCNext } from '@trpc/next';
import type { AppRouter } from './basic.trpc';

const shared = { queryClientConfig: { defaultOptions: {} } };

export const trpc = createTRPCNext<AppRouter>({
  config() {
    return { links: [httpBatchLink({ url: '/api/trpc' })], ...shared };
  },
});

export const unrelated = new QC();
