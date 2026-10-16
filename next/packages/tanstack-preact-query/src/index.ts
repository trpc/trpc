/**
 * Preact helpers for `@tanstack/preact-query`: a context for the client and
 * its helpers, and `useSubscription`.
 *
 * @example
 * ```tsx
 * import { createTrpcContext } from '@trpcdev/tanstack-preact-query';
 *
 * export const { TrpcProvider, useTrpc } = createTrpcContext<AppRouter>();
 *
 * function Post({ id }: { id: string }) {
 *   const trpc = useTrpc();
 *   const post = useQuery(trpc.post.byId.queryOptions({ input: { id } }));
 *   return <h1>{post.data?.title}</h1>;
 * }
 * ```
 * @module
 */
import {
  createContext,
  h,
  type ComponentChildren,
  type Context as PreactContext,
  type VNode,
} from 'preact';
import { useContext, useEffect, useMemo, useState } from 'preact/hooks';
import type { ChainTypes, RouterOf, TrpcClient } from 'trpcdev/client';
import {
  createTrpcQueryUtils,
  SubscriptionObserver,
  type SubscriptionResult,
  type TrpcQueryUtilsFor,
  type TrpcSubscriptionOptions,
  type TrpcContextOptions,
} from '@trpcdev/tanstack-query';

export * from '@trpcdev/tanstack-query';

/**
 * Props of the `TrpcProvider` from {@link createTrpcContext}.
 * @since 12.0.0-alpha.0
 * @stability stable
 */
export interface TrpcProviderProps<
  TRouter,
  TContext extends object = {},
  TLinks extends ChainTypes = {},
> {
  client: TrpcClient<RouterOf<TRouter>, TContext, undefined, TLinks>;
  children?: ComponentChildren;
}

/**
 * What {@link createTrpcContext} returns.
 * @since 12.0.0-alpha.0
 * @stability stable
 */
export interface TrpcPreactContext<
  TRouter,
  TContext extends object = {},
  TLinks extends ChainTypes = {},
> {
  /** Provides the client. Render it inside `QueryClientProvider`. */
  TrpcProvider: (
    props: TrpcProviderProps<TRouter, TContext, TLinks>,
  ) => VNode<any>;
  /** The helpers for the provided client. */
  useTrpc: () => TrpcQueryUtilsFor<TRouter, TContext, TLinks>;
  /** The provided client, for calls outside TanStack Query. */
  useTrpcClient: () => TrpcClient<
    RouterOf<TRouter>,
    TContext,
    undefined,
    TLinks
  >;
  /**
   * The Preact context itself, for bridging it into another render tree:
   * read it with `useContext`, then provide that value on the other side.
   */
  context: PreactContext<unknown>;
}

/**
 * Creates a Preact context for a client and its helpers. `TContext` is what
 * the client's links declare.
 *
 * @example
 * ```tsx
 * const { TrpcProvider, useTrpc } = createTrpcContext<AppRouter>();
 *
 * <QueryClientProvider client={queryClient}>
 *   <TrpcProvider client={client}>
 *     <App />
 *   </TrpcProvider>
 * </QueryClientProvider>;
 * ```
 * @since 12.0.0-alpha.0
 * @stability stable
 */
export function createTrpcContext<
  TRouter,
  TContext extends object = {},
  TLinks extends ChainTypes = {},
>(opts: TrpcContextOptions = {}): TrpcPreactContext<TRouter, TContext, TLinks> {
  type Value = {
    client: TrpcClient<RouterOf<TRouter>, TContext, undefined, TLinks>;
    utils: TrpcQueryUtilsFor<TRouter, TContext, TLinks>;
  };
  const Context = createContext<Value | null>(null);
  const use = (): Value => {
    const value = useContext(Context);
    if (!value) throw new Error('Wrap your component in <TrpcProvider>');
    return value;
  };
  return {
    TrpcProvider: ({ client, children }) => {
      const value = useMemo(
        () => ({ client, utils: createTrpcQueryUtils({ ...opts, client }) }),
        [client],
      );
      return h(Context.Provider, { value }, children);
    },
    useTrpc: () => use().utils,
    useTrpcClient: () => use().client,
    context: Context as PreactContext<unknown>,
  };
}

/**
 * What {@link useSubscription} returns: the latest event and status.
 * @since 12.0.0-alpha.0
 * @stability stable
 */
export type UseSubscriptionResult<TEvent, TError> = SubscriptionResult<
  TEvent,
  TError
> & {
  /** Clears the state and subscribes again. */
  reset: () => void;
};

/**
 * Subscribes while the component is mounted. A new key (input) or
 * `enabled` restarts the subscription; callbacks can change freely.
 *
 * @example
 * ```tsx
 * const sub = useSubscription(trpc.post.onAdd.subscriptionOptions());
 * return <p>{sub.data?.title}</p>;
 * ```
 * @since 12.0.0-alpha.0
 * @stability stable
 */
export function useSubscription<TEvent, TError>(
  options: TrpcSubscriptionOptions<TEvent, TError>,
): UseSubscriptionResult<TEvent, TError> {
  const [observer] = useState(() => new SubscriptionObserver(options));
  const [result, setResult] = useState(observer.getCurrentResult);
  useEffect(() => observer.setOptions(options), [observer, options]);
  useEffect(() => {
    const unsubscribe = observer.subscribe(setResult);
    setResult(observer.getCurrentResult());
    return unsubscribe;
  }, [observer]);
  return useMemo(
    () => ({ ...result, reset: observer.reset }),
    [result, observer],
  );
}
