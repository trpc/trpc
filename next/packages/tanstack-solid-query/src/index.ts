/**
 * Solid helpers for `@tanstack/solid-query`: a context for the client and
 * its helpers, and `useSubscription`.
 *
 * Pass an accessor to `useQuery` so the options follow signals:
 *
 * @example
 * ```tsx
 * import { createTrpcContext } from '@trpc12/tanstack-solid-query';
 *
 * export const [TrpcProvider, useTrpc] = createTrpcContext<AppRouter>();
 *
 * function Post(props: { id: string }) {
 *   const trpc = useTrpc();
 *   const post = useQuery(() => trpc.post.byId.queryOptions({ input: { id: props.id } }));
 *   return <h1>{post.data?.title}</h1>;
 * }
 * ```
 * @module
 */
import {
  createComponent,
  createContext,
  createEffect,
  createSignal,
  onCleanup,
  onMount,
  untrack,
  useContext,
  type Accessor,
  type JSX,
} from 'solid-js';
import type { ChainTypes, RouterOf, TrpcClient } from '@trpc12/trpc/client';
import {
  createTrpcQueryUtils,
  SubscriptionObserver,
  type SubscriptionStatus,
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
 * @since 0.0.1
 * @stability stable
 */
export interface TrpcProviderProps<
  TRouter,
  TContext extends object = {},
  TLinks extends ChainTypes = {},
> {
  client: TrpcClient<RouterOf<TRouter>, TContext, undefined, TLinks>;
  children?: JSX.Element;
}

/**
 * What {@link createTrpcContext} returns, as a tuple to name freely, like
 * Solid's context providers: the provider (render it inside
 * `QueryClientProvider`), the hook for the provided client's helpers and
 * the hook for the client itself, for calls outside TanStack Query.
 * @since 0.0.1
 * @stability stable
 */
export type TrpcSolidContext<
  TRouter,
  TContext extends object = {},
  TLinks extends ChainTypes = {},
> = readonly [
  TrpcProvider: (
    props: TrpcProviderProps<TRouter, TContext, TLinks>,
  ) => JSX.Element,
  useTrpc: () => TrpcQueryUtilsFor<TRouter, TContext, TLinks>,
  useTrpcClient: () => TrpcClient<
    RouterOf<TRouter>,
    TContext,
    undefined,
    TLinks
  >,
];

/**
 * Creates a Solid context for a client and its helpers.
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
 * @since 0.0.1
 * @stability stable
 */
export function createTrpcContext<TSource>(
  opts: TrpcContextOptions = {},
): TrpcSolidContext<
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
    const client = untrack(() => props.client);
    return createComponent(Context.Provider, {
      value: { client, utils: createTrpcQueryUtils({ ...opts, client }) },
      get children() {
        return props.children;
      },
    });
  };
  return [TrpcProvider, () => use().utils, () => use().client];
}

/**
 * What {@link useSubscription} returns. The fields are reactive getters,
 * like `useQuery`'s result: don't destructure them.
 * @since 0.0.1
 * @stability stable
 */
export interface UseSubscriptionResult<TEvent, TError> {
  readonly status: SubscriptionStatus;
  /** The latest event. */
  readonly data: TEvent | undefined;
  readonly error: TError | null;
  /** Clears the state and subscribes again. */
  reset: () => void;
}

/**
 * Subscribes while the component is mounted. The accessor is tracked, so a
 * new input restarts the subscription.
 *
 * @example
 * ```tsx
 * const sub = useSubscription(() =>
 *   trpc.clock.ticks.subscriptionOptions({ input: { from: from() } }),
 * );
 * return <p>{sub.data}</p>;
 * ```
 * @since 0.0.1
 * @stability stable
 */
export function useSubscription<TEvent, TError>(
  options: Accessor<TrpcSubscriptionOptions<TEvent, TError>>,
): UseSubscriptionResult<TEvent, TError> {
  const observer = new SubscriptionObserver(untrack(options));
  const [result, setResult] = createSignal(observer.getCurrentResult());
  createEffect(() => observer.setOptions(options()));
  let unsubscribe: (() => void) | undefined;
  onMount(() => {
    unsubscribe = observer.subscribe((next) => setResult(() => next));
    setResult(() => observer.getCurrentResult());
  });
  onCleanup(() => unsubscribe?.());
  return {
    get status() {
      return result().status;
    },
    get data() {
      return result().data;
    },
    get error() {
      return result().error;
    },
    reset: observer.reset,
  };
}
