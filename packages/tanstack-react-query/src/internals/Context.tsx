import { type QueryClient } from '@tanstack/react-query';
import { type CreateTRPCClient } from '@trpc/client';
import type { AnyRouter } from '@trpc/server/unstable-core-do-not-import';
import * as React from 'react';
import {
  createTRPCOptionsProxy,
  type TRPCOptionsProxy,
} from './createOptionsProxy';

export function createTRPCContext<TRouter extends AnyRouter>() {
  const TRPCContext = React.createContext<TRPCOptionsProxy<TRouter> | null>(
    null,
  );

  function TRPCProvider(
    props: Readonly<{
      children: React.ReactNode;
      queryClient: QueryClient;
      trpcClient: CreateTRPCClient<TRouter>;
      methods?: Record<string, (...args: unknown[]) => unknown>;
    }>,
  ) {
    const value = React.useMemo(
      () =>
        createTRPCOptionsProxy({
          client: props.trpcClient,
          queryClient: props.queryClient,
          methods: props.methods,
        }),
      [props.trpcClient, props.queryClient, props.methods],
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
