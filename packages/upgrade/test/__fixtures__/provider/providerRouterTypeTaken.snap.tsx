// The file has its own `AppRouter`, and the router type is in an `index` file
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { httpBatchLink, createTRPCClient } from '@trpc/client';
import { useState } from 'react';
import { TRPCProvider } from './basic';
import type { AppRouter as AppRouter2 } from './server/index';

type AppRouter = { local: true };
export const local: AppRouter = { local: true };

export function App(props: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  const [trpcClient] = useState(() =>
    createTRPCClient<AppRouter2>({
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
