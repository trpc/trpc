/**
 * Preact helpers for `@tanstack/preact-query`: a context for the client and
 * its helpers, and `useSubscription`.
 *
 * @example
 * ```tsx
 * import { createTRPCContext } from '@trpcdev/tanstack-query/preact';
 *
 * export const { TRPCProvider, useTRPC } = createTRPCContext<AppRouter>();
 *
 * function Post({ id }: { id: string }) {
 *   const trpc = useTRPC();
 *   const post = useQuery(trpc.post.byId.queryOptions({ input: { id } }));
 *   return <h1>{post.data?.title}</h1>;
 * }
 * ```
 * @module
 */
import { createContext, h, type ComponentChildren, type VNode } from 'preact';
import { useContext, useEffect, useMemo, useState } from 'preact/hooks';
import type { RouterOf, TRPCClient } from 'trpcdev/client';
import {
  createTRPCQueryUtils,
  SubscriptionObserver,
  type SubscriptionResult,
  type TRPCQueryUtilsFor,
  type TRPCSubscriptionOptions,
} from '../index.ts';

/**
 * Props of the `TRPCProvider` from {@link createTRPCContext}.
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export interface TRPCProviderProps<TRouter, TContext extends object = {}> {
  client: TRPCClient<RouterOf<TRouter>, TContext>;
  children?: ComponentChildren;
}

/**
 * What {@link createTRPCContext} returns.
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export interface TRPCPreactContext<TRouter, TContext extends object = {}> {
  /** Provides the client. Render it inside `QueryClientProvider`. */
  TRPCProvider: (props: TRPCProviderProps<TRouter, TContext>) => VNode<any>;
  /** The helpers for the provided client. */
  useTRPC: () => TRPCQueryUtilsFor<TRouter, TContext>;
  /** The provided client, for calls outside TanStack Query. */
  useTRPCClient: () => TRPCClient<RouterOf<TRouter>, TContext>;
}

/**
 * Creates a Preact context for a client and its helpers. `TContext` is what
 * the client's links declare.
 *
 * @example
 * ```tsx
 * const { TRPCProvider, useTRPC } = createTRPCContext<AppRouter>();
 *
 * <QueryClientProvider client={queryClient}>
 *   <TRPCProvider client={client}>
 *     <App />
 *   </TRPCProvider>
 * </QueryClientProvider>;
 * ```
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export function createTRPCContext<
  TRouter,
  TContext extends object = {},
>(): TRPCPreactContext<TRouter, TContext> {
  type Value = {
    client: TRPCClient<RouterOf<TRouter>, TContext>;
    utils: TRPCQueryUtilsFor<TRouter, TContext>;
  };
  const Context = createContext<Value | null>(null);
  const use = (): Value => {
    const value = useContext(Context);
    if (!value) throw new Error('Wrap your component in <TRPCProvider>');
    return value;
  };
  return {
    TRPCProvider: ({ client, children }) => {
      const value = useMemo(
        () => ({ client, utils: createTRPCQueryUtils({ client }) }),
        [client],
      );
      return h(Context.Provider, { value }, children);
    },
    useTRPC: () => use().utils,
    useTRPCClient: () => use().client,
  };
}

/**
 * What {@link useSubscription} returns: the latest event and status.
 * @since 12.0.0-alpha.0
 * @stability experimental
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
 * @stability experimental
 */
export function useSubscription<TEvent, TError>(
  options: TRPCSubscriptionOptions<TEvent, TError>,
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
