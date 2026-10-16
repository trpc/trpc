'use client';
import {
  createTrpcContext,
  hydrationOptions,
} from '@trpc12/tanstack-react-query';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { createTrpcClient, httpLink, routerType } from '@trpc12/trpc/client';
import type { FormOfSerializer } from '@trpc12/trpc/serializer';
import type { AppRouter } from '../server/router.ts';
import { serializer } from './serializer.ts';

/** The links' types: danSON's form, so hooks see `Date`s and files. */
type Links = { form: FormOfSerializer<typeof serializer> };

export const { TrpcProvider, useTrpc } = createTrpcContext<
  AppRouter,
  {},
  Links
>();

const url = () =>
  typeof window === 'undefined'
    ? `http://localhost:${process.env['PORT'] ?? 3000}/api/trpc`
    : '/api/trpc';

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(() =>
    createTrpcClient({
      router: routerType<AppRouter>(),
      links: [httpLink({ url: url(), batch: true, serializer })],
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
