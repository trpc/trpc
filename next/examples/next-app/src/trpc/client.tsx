'use client';
import {
  createTrpcContext,
  hydrationOptions,
} from '@trpc12/tanstack-react-query';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { createTrpcClient, httpLink, routerType } from '@trpc12/trpc/client';
import type { AppRouter } from '../server/router.ts';
import { serializer } from './serializer.ts';

const url = () =>
  typeof window === 'undefined'
    ? `http://localhost:${process.env['PORT'] ?? 3000}/api/trpc`
    : '/api/trpc';

const makeClient = () =>
  createTrpcClient({
    router: routerType<AppRouter>(),
    links: [httpLink({ url: url(), batch: true, serializer })],
  });

// Typed from the client, so hooks see danSON's `Date`s and files.
export const [TrpcProvider, useTrpc] = createTrpcContext<typeof makeClient>();

export function Providers(props: { children: ReactNode }) {
  const [client] = useState(makeClient);
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          ...hydrationOptions({ client }),
          queries: { staleTime: 30_000 },
        },
      }),
  );
  return (
    <QueryClientProvider client={queryClient}>
      <TrpcProvider client={client}>{props.children}</TrpcProvider>
    </QueryClientProvider>
  );
}
