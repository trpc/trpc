import type { QueryClient } from '@tanstack/react-query';
import type { CreateTRPCClient, TRPCClient } from '@trpc/client';
import type { AnyTRPCRouter } from '@trpc/server';
import * as React from 'react';
import type { TRPCOptionsProxy } from './createOptionsProxy';
import { createTRPCOptionsProxy } from './createOptionsProxy';

export interface CreateTRPCContextResult<TRouter extends AnyTRPCRouter> {
  TRPCProvider: React.FC<{
    children: React.ReactNode;
    queryClient: QueryClient;
    trpcClient: CreateTRPCClient<TRouter>;
  }>;
  useTRPC: () => TRPCOptionsProxy<TRouter>;
}
/**
 * Create a set of type-safe provider-consumers
 *
 * @see https://trpc.io/docs/client/tanstack-react-query/setup#3a-setup-the-trpc-context-provider
 */
export function createTRPCContext<
  TRouter extends AnyTRPCRouter,
>(): CreateTRPCContextResult<TRouter> {
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
      <TRPCContext.Provider value={value}>
        {props.children}
      </TRPCContext.Provider>
    );
  }

  function useTRPC() {
    const utils = React.useContext(TRPCContext);
    if (!utils) {
      throw new Error('useTRPC() can only be used inside of a <TRPCProvider>');
    }
    return utils;
  }

  return { TRPCProvider, useTRPC };
}
