import { httpBatchLink } from '@trpc/client';
import { createTRPCNext } from '@trpc/next';
import type { AppRouter } from './basic.trpc';

// `config` may open a WebSocket, so `withTRPC` must call it once per mount
export const configCalls = { count: 0 };

export const trpc = createTRPCNext<AppRouter>({
  config() {
    configCalls.count++;
    return {
      links: [httpBatchLink({ url: 'http://localhost/api/trpc' })],
      queryClientConfig: { defaultOptions: { queries: { retry: false } } },
    };
  },
});
