/**
 * React helpers for `@tanstack/react-query`: a context for the client and
 * its helpers, and `useSubscription`.
 *
 * @example
 * ```tsx
 * import { createTrpcContext } from '@trpcdev/tanstack-react-query';
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
  createElement,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type Context as ReactContext,
  type ReactNode,
} from 'react';
import type { RouterOf, TrpcClient } from 'trpcdev/client';
import {
  createTrpcQueryUtils,
  SubscriptionObserver,
  type SubscriptionResult,
  type TrpcQueryUtilsFor,
  type TrpcSubscriptionOptions,
} from '@trpcdev/tanstack-query';

export * from '@trpcdev/tanstack-query';

/**
 * Props of the `TrpcProvider` from {@link createTrpcContext}.
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export interface TrpcProviderProps<TRouter, TContext extends object = {}> {
  client: TrpcClient<RouterOf<TRouter>, TContext>;
  children?: ReactNode;
}

/**
 * What {@link createTrpcContext} returns.
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export interface TrpcReactContext<TRouter, TContext extends object = {}> {
  /** Provides the client. Render it inside `QueryClientProvider`. */
  TrpcProvider: (props: TrpcProviderProps<TRouter, TContext>) => ReactNode;
  /** The helpers for the provided client. */
  useTrpc: () => TrpcQueryUtilsFor<TRouter, TContext>;
  /** The provided client, for calls outside TanStack Query. */
  useTrpcClient: () => TrpcClient<RouterOf<TRouter>, TContext>;
  /**
   * The React context itself, for bridging it into another renderer
   * (react-three-fiber, react-pdf): read it with `useContext`, then
   * provide that value on the other side.
   */
  context: ReactContext<unknown>;
}

/**
 * Creates a React context for a client and its helpers, for apps that
 * create the client per request or per test rather than as a module
 * singleton. `TContext` is what the client's links declare.
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
 * @stability experimental
 */
export function createTrpcContext<
  TRouter,
  TContext extends object = {},
>(): TrpcReactContext<TRouter, TContext> {
  type Value = {
    client: TrpcClient<RouterOf<TRouter>, TContext>;
    utils: TrpcQueryUtilsFor<TRouter, TContext>;
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
        () => ({ client, utils: createTrpcQueryUtils({ client }) }),
        [client],
      );
      return createElement(Context, { value }, children);
    },
    useTrpc: () => use().utils,
    useTrpcClient: () => use().client,
    context: Context as ReactContext<unknown>,
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
  options: TrpcSubscriptionOptions<TEvent, TError>,
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
