// `AppRouter` and `AppRouter2` are taken: one in the file, one in the component
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { httpBatchLink, createTRPCClient } from '@trpc/client';
import { useState } from 'react';
import { TRPCProvider } from './basic';
import type { AppRouter as AppRouter3 } from './server/index';

type AppRouter = { local: true };
export const local: AppRouter = { local: true };

export function App(props: { children: React.ReactNode }) {
  type AppRouter2 = { local: true };
  const local2: AppRouter2 = { local: true };
  void local2;
  const [queryClient] = useState(() => new QueryClient());
  const [trpcClient] = useState(() =>
    createTRPCClient<AppRouter3>({
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
