import type { QueryClient } from '@tanstack/react-query';
import type { TRPCClient } from '@trpc/client';
import type { AnyTRPCRouter } from '@trpc/server';
import * as React from 'react';
import type { TRPCOptionsProxy } from './createOptionsProxy';
import { createTRPCOptionsProxy } from './createOptionsProxy';
import type {
  DefaultFeatureFlags,
  FeatureFlags,
  KeyPrefixOptions,
} from './types';

type TRPCProviderType<TFeatureFlags extends FeatureFlags, TClient> = React.FC<
  {
    children: React.ReactNode;
    queryClient: QueryClient;
    trpcClient: TClient;
  } & KeyPrefixOptions<TFeatureFlags>
>;

type AnyTRPCClient = TRPCClient<any, any>;

/**
 * What {@link createTRPCContext} takes: a router's type, a client's type
 * (`typeof trpcClient`), or the type of a function that creates the client
 * (`typeof makeClient`).
 * @internal
 */
export type TRPCContextSource =
  | AnyTRPCRouter
  | AnyTRPCClient
  | ((...args: any[]) => AnyTRPCClient);

type inferSourceClient<TSource> = TSource extends AnyTRPCRouter
  ? TRPCClient<TSource>
  : TSource extends (...args: any[]) => infer $Client
    ? $Client
    : TSource;

/**
 * The router of a {@link TRPCContextSource}.
 * @internal
 */
export type inferSourceRouter<TSource extends TRPCContextSource> =
  TSource extends AnyTRPCRouter
    ? TSource
    : inferSourceClient<TSource> extends TRPCClient<infer $Router, any>
      ? $Router
      : never;

/**
 * The `context` the links of a {@link TRPCContextSource}'s client read:
 * anything, for a router type or a client created with a type argument.
 * @internal
 */
export type inferSourceLinkContext<TSource extends TRPCContextSource> =
  TSource extends AnyTRPCRouter
    ? Record<string, unknown>
    : inferSourceClient<TSource> extends TRPCClient<any, infer $Context>
      ? $Context
      : Record<string, unknown>;

/**
 * What {@link createTRPCContext} returns.
 */
export interface CreateTRPCContextResult<
  TRouter extends AnyTRPCRouter,
  TFeatureFlags extends FeatureFlags = DefaultFeatureFlags,
  TLinkContext extends object = Record<string, unknown>,
  TClient = TRPCClient<TRouter>,
> {
  /**
   * Provides the tRPC client and `QueryClient` to `useTRPC` and
   * `useTRPCClient`.
   */
  TRPCProvider: TRPCProviderType<TFeatureFlags, TClient>;
  /**
   * Returns the options proxy for your router.
   * @see https://trpc.io/docs/client/tanstack-react-query/usage
   */
  useTRPC: () => TRPCOptionsProxy<TRouter, TFeatureFlags, TLinkContext>;
  /**
   * Returns the tRPC client, for calling procedures directly.
   * @see https://trpc.io/docs/client/tanstack-react-query/usage#useTRPCClient
   */
  useTRPCClient: () => TClient;
}

/**
 * Creates a `TRPCProvider` and the `useTRPC` and `useTRPCClient` hooks for
 * your router.
 *
 * @example
 * ```ts
 * export const { TRPCProvider, useTRPC, useTRPCClient } =
 *   createTRPCContext<AppRouter>();
 * ```
 *
 * @see https://trpc.io/docs/client/tanstack-react-query/setup#3a-set-up-the-trpc-context-provider
 */
export function createTRPCContext<
  TRouter extends AnyTRPCRouter,
  TFeatureFlags extends FeatureFlags = DefaultFeatureFlags,
>(): CreateTRPCContextResult<TRouter, TFeatureFlags>;
/**
 * Creates a `TRPCProvider` and the `useTRPC` and `useTRPCClient` hooks for
 * a client. Pass the client's type, or the type of the function that
 * creates it, and the `trpc.context` option is typed from what its links
 * read.
 *
 * @example
 * ```ts
 * const makeClient = () =>
 *   createTRPCClient({ router: routerType<AppRouter>(), links });
 * export const { TRPCProvider, useTRPC, useTRPCClient } =
 *   createTRPCContext<typeof makeClient>();
 * ```
 *
 * @see https://trpc.io/docs/client/tanstack-react-query/setup#3a-set-up-the-trpc-context-provider
 */
export function createTRPCContext<
  TClientSource extends AnyTRPCClient | ((...args: any[]) => AnyTRPCClient),
  TFeatureFlags extends FeatureFlags = DefaultFeatureFlags,
>(): CreateTRPCContextResult<
  inferSourceRouter<TClientSource>,
  TFeatureFlags,
  inferSourceLinkContext<TClientSource>,
  inferSourceClient<TClientSource>
>;
export function createTRPCContext<
  TRouter extends AnyTRPCRouter,
  TFeatureFlags extends FeatureFlags,
  TLinkContext extends object,
  TClient,
>(): CreateTRPCContextResult<TRouter, TFeatureFlags, TLinkContext, TClient> {
  const TRPCClientContext = React.createContext<TClient | null>(null);
  const TRPCContext = React.createContext<TRPCOptionsProxy<
    TRouter,
    TFeatureFlags,
    TLinkContext
  > | null>(null);

  const TRPCProvider: TRPCProviderType<TFeatureFlags, TClient> = (props) => {
    const value = React.useMemo(
      () =>
        createTRPCOptionsProxy<TRouter, TFeatureFlags, TLinkContext>({
          // `TClient` is the client of `TRouter` and `TLinkContext`
          client: props.trpcClient as TRPCClient<TRouter, TLinkContext>,
          queryClient: props.queryClient,
          keyPrefix: props.keyPrefix as any,
        }),
      [props.trpcClient, props.queryClient, props.keyPrefix],
    );
    return (
      <TRPCClientContext.Provider value={props.trpcClient}>
        <TRPCContext.Provider value={value}>
          {props.children}
        </TRPCContext.Provider>
      </TRPCClientContext.Provider>
    );
  };
  TRPCProvider.displayName = 'TRPCProvider';

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
