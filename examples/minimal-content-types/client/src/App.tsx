import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { httpLink, createTRPCClient } from '@trpc/client';
import { useState } from 'react';
import type { AppRouter } from '../../server/index';
import { SendFileButton } from './SendFileButton';
import { SendMultipartFormDataButton } from './SendMultipartFormDataButton';
import { TRPCProvider } from './utils/trpc';

export function App() {
  const [queryClient] = useState(() => new QueryClient());
  const [trpcClient] = useState(() =>
    createTRPCClient<AppRouter>({
      links: [
        httpLink({
          url: 'http://localhost:2022',
        }),
      ],
    }),
  );
  return (
    <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
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
    </TRPCProvider>
  );
}
