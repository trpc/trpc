import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  createTRPCContext,
  type TRPCOptionsProxy,
} from '@trpc/tanstack-react-query';
import {
  createTRPCLoaderProxy,
  type TRPCLoaderOptionsProxy,
} from '@trpc/tanstack-react-query/unstable-handles';
import type { ReactNode } from 'react';

import { type AppRouter, createDemoClient } from './backend.ts';
import { createNetwork, type Network } from './network.ts';

export const { TRPCProvider, useTRPC } = createTRPCContext<AppRouter>();

export type TRPC = TRPCOptionsProxy<AppRouter>;
/** The loaders' proxy: unlike `useTRPC()`'s, it can load handles */
export type LoaderTRPC = TRPCLoaderOptionsProxy<AppRouter>;

/** How long a demo's data stays fresh. */
export const staleTime = 5000;

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { refetchOnWindowFocus: false, retry: false, staleTime },
    },
  });
}

/**
 * One run of a demo, as a browser tab: a network, a query client and the
 * tRPC proxy for loaders. Reloading the tab, or switching variants, starts a
 * new one.
 */
export function createSession(latency: number, origin?: string) {
  const network = createNetwork();
  network.latency = latency;
  const client = createDemoClient(network, origin);
  const queryClient = createQueryClient();
  return {
    client,
    network,
    queryClient,
    trpc: createTRPCLoaderProxy<AppRouter>({ client, queryClient }),
  };
}

export type Session = ReturnType<typeof createSession>;

export function SessionProvider(props: {
  readonly children: ReactNode;
  readonly session: Session;
}) {
  return (
    <QueryClientProvider client={props.session.queryClient}>
      <TRPCProvider
        queryClient={props.session.queryClient}
        trpcClient={props.session.client}
      >
        {props.children}
      </TRPCProvider>
    </QueryClientProvider>
  );
}

export type { Network };
