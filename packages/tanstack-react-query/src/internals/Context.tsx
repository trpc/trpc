import type { QueryClient } from '@tanstack/react-query';
import type { TRPCClient } from '@trpc/client';
import type { AnyTRPCRouter } from '@trpc/server';
import * as React from 'react';
import type { TRPCOptionsProxy } from './createOptionsProxy';
import { createTRPCOptionsProxy } from './createOptionsProxy';

export interface CreateTRPCContextResult<TRouter extends AnyTRPCRouter> {
  TRPCProvider: React.FC<{
    children: React.ReactNode;
    queryClient: QueryClient;
    trpcClient: TRPCClient<TRouter>;
  }>;
  useTRPC: () => TRPCOptionsProxy<TRouter>;
  useTRPCClient: () => TRPCClient<TRouter>;
}
/**
 * Create a set of type-safe provider-consumers
 *
 * @see https://trpc.io/docs/client/tanstack-react-query/setup#3a-setup-the-trpc-context-provider
 */
export function createTRPCContext<
  TRouter extends AnyTRPCRouter,
>(): CreateTRPCContextResult<TRouter> {
  const TRPCClientContext = React.createContext<TRPCClient<TRouter> | null>(
    null,
  );
  const TRPCContext = React.createContext<TRPCOptionsProxy<TRouter> | null>(
    null,
  );

  function TRPCProvider(
    props: Readonly<{
      children: React.ReactNode;
      queryClient: QueryClient;
      trpcClient: TRPCClient<TRouter>;
    }>,
  ) {
    const value = React.useMemo(
      () =>
        createTRPCOptionsProxy({
          client: props.trpcClient,
          queryClient: props.queryClient,
        }),
      [props.trpcClient, props.queryClient],
    );
    return (
      <TRPCClientContext.Provider value={props.trpcClient}>
        <TRPCContext.Provider value={value}>
          {props.children}
        </TRPCContext.Provider>
      </TRPCClientContext.Provider>
    );
  }

  function useTRPC() {
    const utils = React.useContext(TRPCContext);
    if (!utils) {
      throw new Error('useTRPC() can only be used inside of a <TRPCProvider>');
    }
    return utils;
  }

  function useTRPCClient() {
    const client = React.useContext(TRPCClientContext);
    if (!client) {
      throw new Error(
        'useTRPCClient() can only be used inside of a <TRPCProvider>',
      );
    }
    return client;
  }

  return { TRPCProvider, useTRPC, useTRPCClient };
}
