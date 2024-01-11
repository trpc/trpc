'use client';
import { QueryClient } from '@tanstack/react-query';
import { httpBatchLink } from '@trpc/client';
import { cache } from 'react';
import superjson from 'superjson';
import { getUrl } from '~/trpc/shared';
import { trpc } from './Providers';

export const getQueryClient = cache(() => new QueryClient());
export const getTrpcClient = cache(() => trpc.createClient({
  links: [
    httpBatchLink({
      url: getUrl(),
    }),
  ],
  transformer: superjson
}));
