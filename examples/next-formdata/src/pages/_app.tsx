import { QueryClientProvider } from '@tanstack/react-query';
import {
  createTRPCClient,
  httpBatchLink,
  httpLink,
  isNonJsonSerializable,
  loggerLink,
  splitLink,
} from '@trpc/client';
import type { AppProps } from 'next/app';
import { useState } from 'react';
import { makeQueryClient } from '../utils/query-client';
import { TRPCProvider } from '../utils/trpc';
import type { AppRouter } from './api/trpc/[trpc]';

export default function App({ Component, pageProps }: AppProps) {
  const [queryClient] = useState(makeQueryClient);
  const [trpcClient] = useState(() => {
    // The client only calls the API from the browser
    const url = '/api/trpc';
    return createTRPCClient<AppRouter>({
      links: [
        loggerLink({
          enabled: (op) =>
            process.env.NODE_ENV === 'development' ||
            (op.direction === 'down' && op.result instanceof Error),
        }),
        splitLink({
          condition: (op) => isNonJsonSerializable(op.input),
          true: httpLink({
            url,
          }),
          false: httpBatchLink({
            url,
          }),
        }),
      ],
    });
  });

  return (
    <QueryClientProvider client={queryClient}>
      <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
        <Component {...pageProps} />
      </TRPCProvider>
    </QueryClientProvider>
  );
}
