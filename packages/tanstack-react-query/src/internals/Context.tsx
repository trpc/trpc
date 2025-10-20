import type { QueryClient } from '@tanstack/react-query';
import type { TRPCClient } from '@trpc/client';
import type { AnyTRPCRouter } from '@trpc/server';
import * as React from 'react';
import type { TRPCOptionsProxy } from './createOptionsProxy';
import { createTRPCOptionsProxy } from './createOptionsProxy';
import type { DefaultFeatureFlags, FeatureFlags } from './types';

export interface CreateTRPCContextOpts<TEnablePrefix extends boolean> {
  /**
   * Enable support for prefixing all query keys with a given string or array of strings
   *
   * ```tsx
   *  <TRPCProvider
   *    trpcClient={ctx.client}
   *    queryClient={queryClient}
   *    queryKeyPrefix={['user-123']}
   *  >
   *    {ui}
   *  </TRPCProvider>
   * ```
   *
   * Will be the default in v12
   */
  enableKeyPrefix?: TEnablePrefix;
}

export interface CreateTRPCContextResult<
  TRouter extends AnyTRPCRouter,
  TFeatureFlags extends FeatureFlags = DefaultFeatureFlags,
> {
  TRPCProvider: React.FC<{
    children: React.ReactNode;
    queryClient: QueryClient;
    trpcClient: TRPCClient<TRouter>;
    queryKeyPrefix?: TFeatureFlags['enablePrefix'] extends true
      ? string | string[]
      : never;
  }>;
  useTRPC: () => TRPCOptionsProxy<TRouter, TFeatureFlags>;
  useTRPCClient: () => TRPCClient<TRouter>;
}

/**
 * Create a set of type-safe provider-consumers
 *
 * @see https://trpc.io/docs/client/tanstack-react-query/setup#3a-setup-the-trpc-context-provider
 */
export function createTRPCContextWithFeatureFlags<
  TRouter extends AnyTRPCRouter,
>() {
  return function <TEnablePrefix extends boolean>(
    _opts?: CreateTRPCContextOpts<TEnablePrefix>,
  ) {
    return __createTRPCContext<TRouter, { enablePrefix: TEnablePrefix }>();
  };
}

/**
 * Create a set of type-safe provider-consumers
 *
 * @see https://trpc.io/docs/client/tanstack-react-query/setup#3a-setup-the-trpc-context-provider
 */
export function createTRPCContext<
  TRouter extends AnyTRPCRouter,
>(): CreateTRPCContextResult<TRouter, { enablePrefix: false }> {
  return __createTRPCContext<TRouter, { enablePrefix: false }>();
}

export function __createTRPCContext<
  TRouter extends AnyTRPCRouter,
  TFeatureFlags extends FeatureFlags = DefaultFeatureFlags,
>(): CreateTRPCContextResult<TRouter, TFeatureFlags> {
  const TRPCClientContext = React.createContext<TRPCClient<TRouter> | null>(
    null,
  );
  const TRPCContext = React.createContext<TRPCOptionsProxy<
    TRouter,
    TFeatureFlags
  > | null>(null);

  function TRPCProvider(
    props: Readonly<{
      children: React.ReactNode;
      queryClient: QueryClient;
      trpcClient: TRPCClient<TRouter>;
      queryKeyPrefix?: TFeatureFlags['enablePrefix'] extends true
        ? string | string[]
        : never;
    }>,
  ) {
    const value = React.useMemo(
      () =>
        createTRPCOptionsProxy<TRouter, TFeatureFlags>({
          client: props.trpcClient,
          queryClient: props.queryClient,
          queryKeyPrefix: props.queryKeyPrefix,
        }),
      [props.trpcClient, props.queryClient, props.queryKeyPrefix],
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
