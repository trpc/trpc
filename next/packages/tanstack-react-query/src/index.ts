/**
 * React helpers for `@tanstack/react-query`: a context for the client and
 * its helpers, and `useSubscription`.
 *
 * @example
 * ```tsx
 * import { createTRPCContext } from '@trpcdev/tanstack-react-query';
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
import {
  createContext,
  createElement,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import type { RouterOf, TRPCClient } from 'trpcdev/client';
import {
  createTRPCQueryUtils,
  SubscriptionObserver,
  type SubscriptionResult,
  type TRPCQueryUtilsFor,
  type TRPCSubscriptionOptions,
} from '@trpcdev/tanstack-query';

export * from '@trpcdev/tanstack-query';

/**
 * Props of the `TRPCProvider` from {@link createTRPCContext}.
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export interface TRPCProviderProps<TRouter, TContext extends object = {}> {
  client: TRPCClient<RouterOf<TRouter>, TContext>;
  children?: ReactNode;
}

/**
 * What {@link createTRPCContext} returns.
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export interface TRPCReactContext<TRouter, TContext extends object = {}> {
  /** Provides the client. Render it inside `QueryClientProvider`. */
  TRPCProvider: (props: TRPCProviderProps<TRouter, TContext>) => ReactNode;
  /** The helpers for the provided client. */
  useTRPC: () => TRPCQueryUtilsFor<TRouter, TContext>;
  /** The provided client, for calls outside TanStack Query. */
  useTRPCClient: () => TRPCClient<RouterOf<TRouter>, TContext>;
}

/**
 * Creates a React context for a client and its helpers, for apps that
 * create the client per request or per test rather than as a module
 * singleton. `TContext` is what the client's links declare.
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
>(): TRPCReactContext<TRouter, TContext> {
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
      return createElement(Context, { value }, children);
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
 * const sub = useSubscription(
 *   trpc.post.onAdd.subscriptionOptions({ onData: (post) => toast(post.title) }),
 * );
 * if (sub.status === 'error') return <button onClick={sub.reset}>Retry</button>;
 * ```
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export function useSubscription<TEvent, TError>(
  options: TRPCSubscriptionOptions<TEvent, TError>,
): UseSubscriptionResult<TEvent, TError> {
  const [observer] = useState(() => new SubscriptionObserver(options));
  useEffect(() => observer.setOptions(options), [observer, options]);
  const result = useSyncExternalStore(
    observer.subscribe,
    observer.getCurrentResult,
    observer.getCurrentResult,
  );
  return useMemo(
    () => ({ ...result, reset: observer.reset }),
    [result, observer],
  );
}
