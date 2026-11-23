import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { httpBatchLink, createTRPCClient } from '@trpc/client';
import { useState } from 'react';
import { TRPCProvider } from './basic';

export function App(props: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  // TODO(@trpc/upgrade): add your router type: `createTRPCClient<AppRouter>()`
  const [trpcClient] = useState(() =>
    createTRPCClient({ links: [httpBatchLink({ url: '/api/trpc' })] }),
  );
  return (
    <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        {props.children}
      </QueryClientProvider>
    </TRPCProvider>
  );
}
