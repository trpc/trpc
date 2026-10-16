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
import type { ChainTypes, RouterOf, TrpcClient } from 'trpcdev/client';
import {
  createTrpcQueryUtils,
  SubscriptionObserver,
  type SubscriptionResult,
  type TrpcQueryUtilsFor,
  type TrpcSubscriptionOptions,
  type SourceContext,
  type SourceLinks,
  type SourceRouter,
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
  children?: ReactNode;
}

/**
 * What {@link createTrpcContext} returns.
 * @since 12.0.0-alpha.0
 * @stability stable
 */
export interface TrpcReactContext<
  TRouter,
  TContext extends object = {},
  TLinks extends ChainTypes = {},
> {
  /** Provides the client. Render it inside `QueryClientProvider`. */
  TrpcProvider: (
    props: TrpcProviderProps<TRouter, TContext, TLinks>,
  ) => ReactNode;
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
   * The React context itself, for bridging it into another renderer
   * (react-three-fiber, react-pdf): read it with `useContext`, then
   * provide that value on the other side.
   */
  context: ReactContext<unknown>;
}

/**
 * Creates a React context for a client and its helpers, for apps that
 * create the client per request or per test rather than as a module
 * singleton.
 * `TSource` is the client's type (`ReturnType<typeof makeClient>`), which
 * brings its links' context and types too, or a router type with
 * `TContext` and `TLinks` spelled out.
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
  TSource,
  TContext extends object = SourceContext<TSource>,
  TLinks extends ChainTypes = SourceLinks<TSource>,
>(
  opts: TrpcContextOptions = {},
): TrpcReactContext<SourceRouter<TSource>, TContext, TLinks> {
  type TRouter = SourceRouter<TSource>;
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
 * const sub = useSubscription(
 *   trpc.post.onAdd.subscriptionOptions({ onData: (post) => toast(post.title) }),
 * );
 * if (sub.status === 'error') return <button onClick={sub.reset}>Retry</button>;
 * ```
 * @since 12.0.0-alpha.0
 * @stability stable
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
