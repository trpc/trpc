'use client';
import {
  createTrpcContext,
  hydrationOptions,
} from '@trpcdev/tanstack-react-query';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { createTrpcClient, httpLink } from 'trpcdev/client';
import type { AppRouter } from '../server/router.ts';

export const { TrpcProvider, useTrpc } = createTrpcContext<AppRouter>();

const url = () =>
  typeof window === 'undefined'
    ? `http://localhost:${process.env['PORT'] ?? 3000}/api/trpc`
    : '/api/trpc';

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(() =>
    createTrpcClient<AppRouter>({
      links: [httpLink({ url: url(), batch: true })],
    }),
  );
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
      <TrpcProvider client={client}>{children}</TrpcProvider>
    </QueryClientProvider>
  );
}
