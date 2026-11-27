'use client';

import type { QueryClient } from '@tanstack/react-query';
import { QueryClientProvider } from '@tanstack/react-query';
import type { TRPCLink } from '@trpc/client';
import {
  createTRPCClient,
  createWSClient,
  httpBatchLink,
  loggerLink,
  wsLink,
  routerType,
} from '@trpc/client';
import type { TRPCOptionsProxy } from '@trpc/tanstack-react-query';
import { createTRPCContext } from '@trpc/tanstack-react-query';
import { useState } from 'react';
import type { AppRouter } from '~/server/routers/_app';
import { msgpackEncoder } from '~/utils/encoder';
import { makeQueryClient } from './query-client';

const WS_URL = 'ws://localhost:3001';
const APP_URL = 'http://localhost:3000';

export const { TRPCProvider, useTRPC } = createTRPCContext<AppRouter>();
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

function getEndingLink(): TRPCLink<AppRouter> {
  if (typeof window === 'undefined') {
    // Client components also render on the server, but the page loads
    // their queries in a server component, so this link is never used.
    // It just keeps the server from opening a WebSocket.
    return httpBatchLink({ url: `${APP_URL}/api/trpc` });
  }

  const client = createWSClient({
    url: WS_URL,
    experimental_encoder: msgpackEncoder,
    // connect on the first subscription, so the spare client that React's
    // Strict Mode makes in development never opens a socket. The idle check
    // re-arms while a subscription is open, so give it a real interval.
    lazy: { enabled: true, closeMs: 10_000 },
  });

  return wsLink({ client });
}

export function TRPCReactProvider(props: { children: React.ReactNode }) {
  const queryClient = getQueryClient();
  const [trpcClient] = useState(() =>
    createTRPCClient({
      router: routerType<AppRouter>(),
      links: [loggerLink({ enabled: () => true }), getEndingLink()],
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
