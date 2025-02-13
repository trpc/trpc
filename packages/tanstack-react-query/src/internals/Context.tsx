import { type QueryClient } from '@tanstack/react-query';
import type { TRPCClient } from '@trpc/client';
import type { AnyTRPCRouter } from '@trpc/server';
import * as React from 'react';
import {
  createTRPCOptionsProxy,
  type TRPCOptionsProxy,
} from './createOptionsProxy';

export function createTRPCContext<TRouter extends AnyTRPCRouter>() {
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
