import type { QueryClient } from '@tanstack/react-query';
import type { TRPCClient } from '@trpc/client';
import type { AnyTRPCRouter } from '@trpc/server';
import * as React from 'react';
import type { KeyPrefixOptions } from './proxy';
import { createRenderProxy } from './proxy';
import type { TRPCHandleFeatureFlags, TRPCHandleProxy } from './types';

/**
 * What {@link createTRPCHandleContext} returns.
 */
export interface CreateTRPCHandleContextResult<
  TRouter extends AnyTRPCRouter,
  TFeatureFlags extends TRPCHandleFeatureFlags = { keyPrefix: false },
> {
  /**
   * Provides the tRPC client and `QueryClient` to `useTRPCHandles` and
   * `useTRPCClient`.
   */
  TRPCHandleProvider: React.FC<
    {
      children: React.ReactNode;
      queryClient: QueryClient;
      trpcClient: TRPCClient<TRouter>;
    } & KeyPrefixOptions<TFeatureFlags>
  >;
  /**
   * Returns the handle proxy, for `fromHandle` and `waterfallHandle`.
   * @see https://trpc.io/docs/client/tanstack-react-query/handles#standalone
   */
  useTRPCHandles: () => TRPCHandleProxy<TRouter, TFeatureFlags>;
  /** Returns the tRPC client, for calling mutations */
  useTRPCClient: () => TRPCClient<TRouter>;
}

/**
 * Creates a `TRPCHandleProvider` and the `useTRPCHandles` and
 * `useTRPCClient` hooks, for an app that reads handles without `useTRPC()`.
 *
 * @example
 * ```ts
 * export const { TRPCHandleProvider, useTRPCHandles, useTRPCClient } =
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

  const TRPCHandleProvider: CreateTRPCHandleContextResult<
    TRouter,
    TFeatureFlags
  >['TRPCHandleProvider'] = (props) => {
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

  return { TRPCHandleProvider, useTRPCHandles, useTRPCClient };
}
