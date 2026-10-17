/**
 * Preact helpers for `@tanstack/preact-query`: a context for the client and
 * its helpers, and `useSubscription`.
 *
 * @example
 * ```tsx
 * import { createTrpcContext } from '@trpc12/tanstack-preact-query';
 *
 * export const [TrpcProvider, useTrpc] = createTrpcContext<AppRouter>();
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
import type { ChainTypes, RouterOf, TrpcClient } from '@trpc12/trpc/client';
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
} from '@trpc12/tanstack-query';

export * from '@trpc12/tanstack-query';

/**
 * Props of the `TrpcProvider` from {@link createTrpcContext}.
 * @since 0.1.0
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
 * What {@link createTrpcContext} returns, as a tuple to name freely: the
 * provider (render it inside `QueryClientProvider`), the hook for the
 * provided client's helpers, the hook for the client itself (calls outside
 * TanStack Query), and the Preact context, for bridging it into another
 * render tree: read it with `useContext`, then provide that value on the
 * other side.
 * @since 0.1.0
 * @stability stable
 */
export type TrpcPreactContext<
  TRouter,
  TContext extends object = {},
  TLinks extends ChainTypes = {},
> = readonly [
  TrpcProvider: (
    props: TrpcProviderProps<TRouter, TContext, TLinks>,
  ) => VNode<any>,
  useTrpc: () => TrpcQueryUtilsFor<TRouter, TContext, TLinks>,
  useTrpcClient: () => TrpcClient<
    RouterOf<TRouter>,
    TContext,
    undefined,
    TLinks
  >,
  context: PreactContext<unknown>,
];

/**
 * Creates a Preact context for a client and its helpers.
 * `TSource` is the client factory's type (`typeof makeClient`) or the
 * client's, which bring its links' context and types too, or a router type.
 *
 * @example
 * ```tsx
 * const makeClient = () =>
 *   createTrpcClient({ router: routerType<AppRouter>(), links: [httpLink({ url })] });
 * const [TrpcProvider, useTrpc] = createTrpcContext<typeof makeClient>();
 *
 * <QueryClientProvider client={queryClient}>
 *   <TrpcProvider client={client}>
 *     <App />
 *   </TrpcProvider>
 * </QueryClientProvider>;
 * ```
 * @since 0.1.0
 * @stability stable
 */
export function createTrpcContext<TSource>(
  opts: TrpcContextOptions = {},
): TrpcPreactContext<
  SourceRouter<TSource>,
  SourceContext<TSource>,
  SourceLinks<TSource>
> {
  type TRouter = SourceRouter<TSource>;
  type TContext = SourceContext<TSource>;
  type TLinks = SourceLinks<TSource>;
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
  const TrpcProvider = (
    props: TrpcProviderProps<TRouter, TContext, TLinks>,
  ) => {
    const { client } = props;
    const value = useMemo(
      () => ({ client, utils: createTrpcQueryUtils({ ...opts, client }) }),
      [client],
    );
    return h(Context.Provider, { value }, props.children);
  };
  return [
    TrpcProvider,
    () => use().utils,
    () => use().client,
    Context as PreactContext<unknown>,
  ];
}

/**
 * What {@link useSubscription} returns: the latest event and status.
 * @since 0.1.0
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
 * @since 0.1.0
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
