// `AppRouter` and `AppRouter2` are taken: one in the file, one in the component
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { httpBatchLink } from '@trpc/client';
import { useState } from 'react';
import { trpc } from './basic';

type AppRouter = { local: true };
export const local: AppRouter = { local: true };

export function App(props: { children: React.ReactNode }) {
  type AppRouter2 = { local: true };
  const local2: AppRouter2 = { local: true };
  void local2;
  const [queryClient] = useState(() => new QueryClient());
  const [trpcClient] = useState(() =>
    trpc.createClient({ links: [httpBatchLink({ url: '/api/trpc' })] }),
  );
  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        {props.children}
      </QueryClientProvider>
    </trpc.Provider>
  );
}
