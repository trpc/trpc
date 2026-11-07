import type { QueryClient } from '@tanstack/react-query';
import type { TRPCClient } from '@trpc/client';
import type { AnyTRPCRouter } from '@trpc/server';
import * as React from 'react';
import type { KeyPrefixOptions } from './proxy';
import { createRenderProxy } from './proxy';
import type { TRPCHandleFeatureFlags, TRPCHandleProxy } from './types';

/**
 * The props of the provider from {@link createTRPCHandleContext}
 */
export type TRPCHandleProviderProps<
  TRouter extends AnyTRPCRouter,
  TFeatureFlags extends TRPCHandleFeatureFlags = { keyPrefix: false },
> = {
  children: React.ReactNode;
  queryClient: QueryClient;
  trpcClient: TRPCClient<TRouter>;
} & KeyPrefixOptions<TFeatureFlags>;

/**
 * What {@link createTRPCHandleContext} returns: the provider, the hook for
 * the handle proxy, and the hook for the tRPC client. Name them as you like.
 */
export type CreateTRPCHandleContextResult<
  TRouter extends AnyTRPCRouter,
  TFeatureFlags extends TRPCHandleFeatureFlags = { keyPrefix: false },
> = readonly [
  TRPCHandleProvider: React.FC<TRPCHandleProviderProps<TRouter, TFeatureFlags>>,
  useTRPCHandles: () => TRPCHandleProxy<TRouter, TFeatureFlags>,
  useTRPCClient: () => TRPCClient<TRouter>,
];

/**
 * Creates a provider and two hooks, for an app that reads handles without
 * `useTRPC()`:
 * - the provider gives the tRPC client and `QueryClient` to the hooks;
 * - the first hook returns the handle proxy, for `fromHandle` and `waterfallHandle`;
 * - the second returns the tRPC client, for mutations.
 *
 * @example
 * ```ts
 * export const [TRPCHandleProvider, useTRPCHandles, useTRPCClient] =
 *   createTRPCHandleContext<AppRouter>();
 * ```
 * @see https://trpc.io/docs/client/tanstack-react-query/handles#standalone
 */
export function createTRPCHandleContext<
  TRouter extends AnyTRPCRouter,
  TFeatureFlags extends TRPCHandleFeatureFlags = { keyPrefix: false },
>(): CreateTRPCHandleContextResult<TRouter, TFeatureFlags> {
  const ClientContext = React.createContext<TRPCClient<TRouter> | null>(null);
  const HandleContext = React.createContext<TRPCHandleProxy<
    TRouter,
    TFeatureFlags
  > | null>(null);

  const TRPCHandleProvider: React.FC<
    TRPCHandleProviderProps<TRouter, TFeatureFlags>
  > = (props) => {
    const value = React.useMemo(
      () =>
        createRenderProxy<TRouter, TFeatureFlags>({
          client: props.trpcClient,
          queryClient: props.queryClient,
          prefix: props.keyPrefix,
        }),
      [props.trpcClient, props.queryClient, props.keyPrefix],
    );
    return (
      <ClientContext.Provider value={props.trpcClient}>
        <HandleContext.Provider value={value}>
          {props.children}
        </HandleContext.Provider>
      </ClientContext.Provider>
    );
  };
  TRPCHandleProvider.displayName = 'TRPCHandleProvider';

  function useTRPCHandles() {
    const proxy = React.useContext(HandleContext);
    if (!proxy) {
      throw new Error(
        'useTRPCHandles() can only be used inside of a <TRPCHandleProvider>',
      );
    }
    return proxy;
  }

  function useTRPCClient() {
    const client = React.useContext(ClientContext);
    if (!client) {
      throw new Error(
        'useTRPCClient() can only be used inside of a <TRPCHandleProvider>',
      );
    }
    return client;
  }

  return [TRPCHandleProvider, useTRPCHandles, useTRPCClient] as const;
}
