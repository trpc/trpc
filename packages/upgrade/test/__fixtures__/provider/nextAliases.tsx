import { QueryClient as QC } from '@tanstack/react-query';
import { httpBatchLink } from '@trpc/client';
import { createTRPCNext } from '@trpc/next';
import type { AppRouter } from './basic.trpc';

const shared = { queryClientConfig: { defaultOptions: {} } };
const urls = { QueryClient: '/api/trpc' };

export const trpc = createTRPCNext<AppRouter>({
  config() {
    // Property names that match an import stay as they are
    const { QueryClient: url } = urls;
    return {
      links: [httpBatchLink({ url: urls.QueryClient ?? url })],
      ...shared,
    };
  },
});

export const unrelated = new QC();
