import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { httpBatchLink } from '@trpc/client';
import { Suspense, useState } from 'react';
import { Greeting } from './Greeting';
import { trpc } from './utils/trpc';
import { RunPrefetch } from './RunPrefetch';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'


export function App() {
  const [queryClient] = useState(() => new QueryClient());
  const [trpcClient] = useState(() =>
    trpc.createClient({
      links: [
        httpBatchLink({
          url: 'http://localhost:2022',
        }),
      ],
    }),
  );
  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <RunPrefetch />
        <Suspense fallback={<div>Loading...</div>}>
          <Greeting />
        </Suspense>
        <ReactQueryDevtools initialIsOpen={false} />
      </QueryClientProvider>
    </trpc.Provider>
  );
}
