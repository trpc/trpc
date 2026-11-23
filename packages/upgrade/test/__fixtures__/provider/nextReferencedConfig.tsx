import { httpBatchLink } from '@trpc/client';
import { createTRPCNext } from '@trpc/next';
import superjson from 'superjson';
import type { AppRouter } from './basic.trpc';

function getTransformer() {
  return superjson;
}

function clientConfig() {
  return {
    links: [httpBatchLink({ url: '/api/trpc', transformer: superjson })],
  };
}

export const trpc = createTRPCNext<AppRouter>({
  config: clientConfig,
  ssr: false,
  transformer: getTransformer(),
});
