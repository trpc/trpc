import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  createTRPCContext,
  createTRPCOptionsProxy,
  type TRPCOptionsProxy,
} from '@trpc/tanstack-react-query';
import { createContext, type ReactNode, use } from 'react';

import { type AppRouter, createDemoClient } from './backend.ts';
import { createNetwork, type Network } from './network.ts';

export const { TRPCProvider, useTRPC } = createTRPCContext<AppRouter>();

export type TRPC = TRPCOptionsProxy<AppRouter>;

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
    trpc: createTRPCOptionsProxy<AppRouter>({ client, queryClient }),
  };
}

export type Session = ReturnType<typeof createSession>;

const NetworkContext = createContext<Network | null>(null);

/** The session's network, for a component that starts its own trace. */
export function useNetwork() {
  const network = use(NetworkContext);
  if (!network) {
    throw new Error('useNetwork() needs a SessionProvider');
  }
  return network;
}

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
        <NetworkContext value={props.session.network}>
          {props.children}
        </NetworkContext>
      </TRPCProvider>
    </QueryClientProvider>
  );
}

export type { Network };
