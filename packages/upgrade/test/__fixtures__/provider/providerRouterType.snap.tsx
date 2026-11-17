// The router type comes from `basic.trpc`, which `basic` passes to `createTRPCReact`
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { httpBatchLink, createTRPCClient } from '@trpc/client';
import { useState } from 'react';
import { TRPCProvider } from './basic';
import type { AppRouter } from './basic.trpc';

export function App(props: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  const [trpcClient] = useState(() =>
    createTRPCClient<AppRouter>({
      links: [httpBatchLink({ url: '/api/trpc' })],
    }),
  );
  return (
    <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        {props.children}
      </QueryClientProvider>
    </TRPCProvider>
  );
}
