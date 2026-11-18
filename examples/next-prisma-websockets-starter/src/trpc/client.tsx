'use client';

import type { QueryClient } from '@tanstack/react-query';
import { QueryClientProvider } from '@tanstack/react-query';
import {
  createTRPCClient,
  createWSClient,
  httpBatchLink,
  loggerLink,
  wsLink,
} from '@trpc/client';
import type { inferRouterOutputs } from '@trpc/server';
import {
  createTRPCContext,
  type TRPCOptionsProxy,
} from '@trpc/tanstack-react-query';
import { useState } from 'react';
import superjson from 'superjson';
import type { AppRouter } from '~/server/routers/_app';
import { vercelHost } from '~/utils/vercelHost';
import { makeQueryClient } from './query-client';

/**
 * A provider and a `useTRPC` hook from your `AppRouter` type signature.
 * @see https://trpc.io/docs/client/nextjs/app-router-setup#5-create-a-trpc-client-for-client-components
 */
export const { TRPCProvider, useTRPC } = createTRPCContext<AppRouter>();

/**
 * Types the handles that server components pass to client components
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

function getEndingLink(wsUrl: string) {
  if (typeof window === 'undefined') {
    /**
     * Client components also render on the server, where nothing calls the
     * API: queries arrive hydrated from server components, and subscriptions
     * start in the browser
     */
    return httpBatchLink<AppRouter>({
      /**
       * @see https://trpc.io/docs/v11/data-transformers
       */
      transformer: superjson,
      url: `${vercelHost ? `https://${vercelHost}` : process.env.APP_URL}/api/trpc`,
    });
  }
  // Lazy: React Strict Mode runs the `useState` initializer twice in dev,
  // and the discarded client must not hold a socket open. The idle check
  // re-arms while subscriptions are open, so give it a real interval.
  const client = createWSClient({
    url: wsUrl,
    lazy: { enabled: true, closeMs: 10_000 },
  });
  return wsLink<AppRouter>({
    client,
    /**
     * @see https://trpc.io/docs/v11/data-transformers
     */
    transformer: superjson,
  });
}

export function TRPCReactProvider(
  props: Readonly<{ children: React.ReactNode; wsUrl: string }>,
) {
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
            (process.env.NODE_ENV === 'development' &&
              typeof window !== 'undefined') ||
            (opts.direction === 'down' && opts.result instanceof Error),
        }),
        getEndingLink(props.wsUrl),
      ],
    }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
        {props.children}
      </TRPCProvider>
    </QueryClientProvider>
  );
}

/**
 * This is a helper method to infer the output of a query resolver
 * @example type HelloOutput = RouterOutputs['hello']
 */
export type RouterOutputs = inferRouterOutputs<AppRouter>;
