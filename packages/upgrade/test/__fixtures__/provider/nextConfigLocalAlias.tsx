import { QueryClient as config } from '@tanstack/react-query';
import { httpBatchLink } from '@trpc/client';
import { createTRPCNext } from '@trpc/next';
import type { AppRouter } from './basic.trpc';

// `makeQueryClient`'s own variable doesn't hide `config`, the QueryClient
function getLinks() {
  return { links: [httpBatchLink({ url: '/api/trpc' })] };
}

export const trpc = createTRPCNext<AppRouter>({ config: getLinks });

export const unrelated = new config();
