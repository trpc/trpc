import type { QueryClient } from '@tanstack/react-query';
import type { RouterType, TRPCClient } from '@trpc/client';
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
 * What {@link createTRPCContext} types its hooks from: a router, a client,
 * or a function that creates the client.
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
 * The options of `createTRPCContext`: the router's type as
 * `router: routerType<AppRouter>()`, or the client (or the function that
 * creates it) as `client`, so `trpc.context` is typed from its links.
 * Only their types are used.
 * @public
 */
export type CreateTRPCContextOptions<
  TSource extends TRPCContextSource,
  TKeyPrefix extends boolean,
> = (
  | {
      /**
       * The router's type, from `routerType<AppRouter>()`. It's a type
       * only: nothing about the router is sent or bundled.
       */
      router: RouterType<TSource & AnyTRPCRouter>;
      client?: never;
    }
  | {
      /**
       * The client, or the function that creates it, such as
       * `makeTRPCClient`. Only its type is used: it isn't called, and
       * `TRPCProvider` still takes the client.
       */
      client: TSource;
      router?: never;
    }
) & {
  /**
   * `true` prefixes query and mutation keys; `TRPCProvider` then takes the
   * prefix as `keyPrefix`.
   * @see https://trpc.io/docs/client/tanstack-react-query/usage#keyPrefix
   */
  keyPrefix?: TKeyPrefix;
};

/**
 * Creates a `TRPCProvider` and the `useTRPC` and `useTRPCClient` hooks.
 * Pass the router's type with `routerType`, or the client (or the function
 * that creates it) to type `trpc.context` from its links.
 *
 * @example
 * ```ts
 * export const { TRPCProvider, useTRPC, useTRPCClient } = createTRPCContext({
 *   router: routerType<AppRouter>(),
 * });
 * // or, with `trpc.context` typed from the links
 * const makeTRPCClient = () =>
 *   createTRPCClient({ router: routerType<AppRouter>(), links });
 * export const { TRPCProvider, useTRPC } = createTRPCContext({
 *   client: makeTRPCClient,
 * });
 * ```
 *
 * @see https://trpc.io/docs/client/tanstack-react-query/setup#3a-set-up-the-trpc-context-provider
 */
// One signature whose type parameter a router also satisfies, so
// `typeof createTRPCContext<AppRouter>` still instantiates.
// `FeatureFlags` is allowed too, so `typeof createTRPCContext<AppRouter,
// { keyPrefix: true }>` also still instantiates.
export function createTRPCContext<
  TSource extends TRPCContextSource,
  const TKeyPrefix extends boolean | FeatureFlags = false,
>(
  opts: CreateTRPCContextOptions<
    TSource,
    TKeyPrefix extends FeatureFlags ? TKeyPrefix['keyPrefix'] : TKeyPrefix
  >,
): CreateTRPCContextResult<
  inferSourceRouter<TSource>,
  TKeyPrefix extends FeatureFlags ? TKeyPrefix : { keyPrefix: TKeyPrefix },
  inferSourceLinkContext<TSource>,
  inferSourceClient<TSource>
>;
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
// Kept last: `ReturnType<typeof createTRPCContext>` reads the last overload.
export function createTRPCContext<
  TRouter extends AnyTRPCRouter,
  TFeatureFlags extends FeatureFlags = DefaultFeatureFlags,
>(): CreateTRPCContextResult<TRouter, TFeatureFlags>;
export function createTRPCContext<
  TRouter extends AnyTRPCRouter,
  TFeatureFlags extends FeatureFlags,
  TLinkContext extends object,
  TClient,
>(
  // only types: `router`, `client` and `keyPrefix` change nothing at runtime
  _opts?: CreateTRPCContextOptions<TRouter, TFeatureFlags['keyPrefix']>,
): CreateTRPCContextResult<TRouter, TFeatureFlags, TLinkContext, TClient> {
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
