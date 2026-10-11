/**
 * Solid helpers for `@tanstack/solid-query`: a context for the client and
 * its helpers, and `useSubscription`.
 *
 * Pass an accessor to `useQuery` so the options follow signals:
 *
 * @example
 * ```tsx
 * import { createTRPCContext } from '@trpcdev/tanstack-solid-query';
 *
 * export const { TRPCProvider, useTRPC } = createTRPCContext<AppRouter>();
 *
 * function Post(props: { id: string }) {
 *   const trpc = useTRPC();
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
import type { RouterOf, TRPCClient } from 'trpcdev/client';
import {
  createTRPCQueryUtils,
  SubscriptionObserver,
  type SubscriptionStatus,
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
  children?: JSX.Element;
}

/**
 * What {@link createTRPCContext} returns.
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export interface TRPCSolidContext<TRouter, TContext extends object = {}> {
  /** Provides the client. Render it inside `QueryClientProvider`. */
  TRPCProvider: (props: TRPCProviderProps<TRouter, TContext>) => JSX.Element;
  /** The helpers for the provided client. */
  useTRPC: () => TRPCQueryUtilsFor<TRouter, TContext>;
  /** The provided client, for calls outside TanStack Query. */
  useTRPCClient: () => TRPCClient<RouterOf<TRouter>, TContext>;
}

/**
 * Creates a Solid context for a client and its helpers. `TContext` is what
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
>(): TRPCSolidContext<TRouter, TContext> {
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
    TRPCProvider: (props) => {
      const client = untrack(() => props.client);
      return createComponent(Context.Provider, {
        value: { client, utils: createTRPCQueryUtils({ client }) },
        get children() {
          return props.children;
        },
      });
    },
    useTRPC: () => use().utils,
    useTRPCClient: () => use().client,
  };
}

/**
 * What {@link useSubscription} returns. The fields are reactive getters,
 * like `useQuery`'s result: don't destructure them.
 * @since 12.0.0-alpha.0
 * @stability experimental
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
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export function useSubscription<TEvent, TError>(
  options: Accessor<TRPCSubscriptionOptions<TEvent, TError>>,
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
