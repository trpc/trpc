'use client';

import type { QueryClient } from '@tanstack/react-query';
import { QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { createTRPCClient, httpBatchLink, loggerLink } from '@trpc/client';
import type { TRPCOptionsProxy } from '@trpc/tanstack-react-query';
import { createTRPCContext } from '@trpc/tanstack-react-query';
import { useState } from 'react';
import superjson from 'superjson';
import type { AppRouter } from '../server/routers/_app';
import { makeQueryClient } from './query-client';

/**
 * Typesafe hooks from your `AppRouter` type signature.
 * @see https://trpc.io/docs/client/nextjs/app-router-setup#5-create-a-trpc-client-for-client-components
 */
export const { TRPCProvider, useTRPC } = createTRPCContext<AppRouter>();

/**
 * Types the query handles that server components pass to client components.
 * @see https://trpc.io/docs/client/tanstack-react-query/handles#typing-props
 */
export type TRPC = TRPCOptionsProxy<AppRouter>;

let browserQueryClient: QueryClient | undefined;
function getQueryClient() {
  if (typeof window === 'undefined') {
    // Server: always make a new query client
    return makeQueryClient();
  }
  // Browser: reuse the client so it survives React suspending the initial render
  return (browserQueryClient ??= makeQueryClient());
}

export function TRPCReactProvider(props: { children: React.ReactNode }) {
  const queryClient = getQueryClient();
  const [trpcClient] = useState(() =>
    createTRPCClient<AppRouter>({
      /**
       * @see https://trpc.io/docs/v11/client/links
       */
      links: [
        // adds pretty logs to your console in development and logs errors in production
        loggerLink({
          enabled: (opts) =>
            process.env.NODE_ENV === 'development' ||
            (opts.direction === 'down' && opts.result instanceof Error),
        }),
        httpBatchLink({
          // Server components call the router directly, so the client only
          // calls the API from the browser
          url: '/api/trpc',
          /**
           * @see https://trpc.io/docs/v11/data-transformers
           */
          transformer: superjson,
        }),
      ],
    }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
        {props.children}
      </TRPCProvider>
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  );
}
