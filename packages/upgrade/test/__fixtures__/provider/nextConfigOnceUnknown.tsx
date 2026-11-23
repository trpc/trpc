import { httpBatchLink } from '@trpc/client';
import { createTRPCNext } from '@trpc/next';
import type { AppRouter } from './basic.trpc';

// `config` may open a WebSocket, so `withTRPC` must call it once per mount,
// even when the codemod can't see whether it returns `queryClientConfig`
export const configCalls = { count: 0 };

const clientConfig = () => {
  configCalls.count++;
  return { links: [httpBatchLink({ url: 'http://localhost/api/trpc' })] };
};

export const trpc = createTRPCNext<AppRouter>({ config: clientConfig });
