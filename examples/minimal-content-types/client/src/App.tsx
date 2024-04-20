import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { httpLink } from '@trpc/client';
import { useState } from 'react';
import { SendFileButton } from './SendFileButton';
import { SendMultipartFormDataButton } from './SendMultipartFormDataButton';
import { trpc } from './utils/trpc';

export function App() {
  const [queryClient] = useState(() => new QueryClient());
  const [trpcClient] = useState(() =>
    trpc.createClient({
      links: [
        httpLink({
          url: 'http://localhost:2022',
        }),
      ],
    }),
  );
  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
            width: '10rem',
          }}
        >
          <SendMultipartFormDataButton />

          <SendFileButton />
        </div>
      </QueryClientProvider>
    </trpc.Provider>
  );
}
