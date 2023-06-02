// app/providers.jsx
'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { loggerLink } from '@trpc/client';
import { experimental_nextHttpLink } from '@trpc/next/app-dir/links/nextHttp';
import { ReactQueryStreamedHydration } from '@trpc/rq-hydration';
import { api } from '~/trpc/client';
import React from 'react';

const getUrl = () => {
  const base = (() => {
    const vcurl = process.env.VERCEL_URL;
    if (vcurl) {
      return `https://${vcurl}`;
    }
    if (typeof window === 'undefined') {
      return 'http://localhost:3000';
    }
    return '';
  })();

  return `${base}/api/trpc`;
};

export function Providers(props: { children: React.ReactNode }) {
  const [queryClient] = React.useState(
    () =>
      new QueryClient({
        // defaultOptions: {
        //   queries: {
        //     refetchOnReconnect: false,
        //     refetchOnMount: false,
        //     refetchInterval: Infinity,
        //     refetchOnWindowFocus: false,
        //     staleTime: Infinity,
        //   },
        // },
      }),
  );

  const [trpcClient] = React.useState(() =>
    api.createClient({
      links: [
        loggerLink(),
        experimental_nextHttpLink({
          batch: false,
          url: getUrl(),
          revalidate: 0,
        }),
      ],
    }),
  );

  return (
    <api.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <ReactQueryStreamedHydration>
          {props.children}
        </ReactQueryStreamedHydration>
        <ReactQueryDevtools initialIsOpen={false} />
      </QueryClientProvider>
    </api.Provider>
  );
}
