import type { CreateTRPCClientOptions } from '@trpc/client/src/internals/TRPCClient';
import { createReactQueryHooks } from '@trpc/react';
import type { AnyRouter } from '@trpc/server';
import React, { useState } from 'react';
import { QueryClient, QueryClientProvider } from 'react-query';

type QueryClientConfig = ConstructorParameters<typeof QueryClient>[0];

export type WithTRPCConfig<TRouter extends AnyRouter> =
  CreateTRPCClientOptions<TRouter> & {
    queryClientConfig?: QueryClientConfig;
  };

interface WithTRPCOptions<TRouter extends AnyRouter> {
  config: (info: Record<never, never>) => WithTRPCConfig<TRouter>;
}

export interface WithTRPCNoSSROptions<TRouter extends AnyRouter>
  extends WithTRPCOptions<TRouter> {
  ssr?: false;
}

export function withTRPC<TRouter extends AnyRouter>(
  opts: WithTRPCNoSSROptions<TRouter>,
) {
  const { config: getClientConfig } = opts;
  const trpc = createReactQueryHooks<TRouter>();

  return (Component: React.FC) => {
    const WithTRPC = (props: Record<never, never>) => {
      const [{ queryClient, trpcClient }] = useState(() => {
        const config = getClientConfig({});

        const queryClient = new QueryClient(config.queryClientConfig);
        const trpcClient = trpc.createClient(config);
        return {
          queryClient,
          trpcClient,
        };
      });

      return (
        <trpc.Provider client={trpcClient} queryClient={queryClient}>
          <QueryClientProvider client={queryClient}>
            <Component {...props} />
          </QueryClientProvider>
        </trpc.Provider>
      );
    };

    const displayName = Component.displayName || Component.name || 'Component';
    WithTRPC.displayName = `withTRPC(${displayName})`;

    return WithTRPC as any;
  };
}
