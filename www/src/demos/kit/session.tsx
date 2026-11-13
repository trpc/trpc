import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  createTRPCContext,
  createTRPCOptionsProxy,
  type TRPCOptionsProxy,
} from '@trpc/tanstack-react-query';
import type { ReactNode } from 'react';

import {
  type AppRouter,
  createDemoClient,
  createHttpDemoClient,
} from './backend.ts';
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
 * How a demo's calls reach its server: `call` sends each one by itself, and
 * `http` batches the ones made together into a request, as an app does.
 */
export type Transport = 'call' | 'http';

/**
 * One run of a demo, as a browser tab: a network, a query client and the
 * tRPC proxy for loaders. Reloading the tab, or switching variants, starts a
 * new one.
 */
export function createSession(opts: {
  readonly latency: number;
  readonly origin: string | undefined;
  readonly transport: Transport;
}) {
  const network = createNetwork();
  network.latency = opts.latency;
  const client =
    opts.transport === 'http'
      ? createHttpDemoClient(network, opts.origin)
      : createDemoClient(network, opts.origin);
  const queryClient = createQueryClient();
  return {
    client,
    network,
    queryClient,
    trpc: createTRPCOptionsProxy<AppRouter>({ client, queryClient }),
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
