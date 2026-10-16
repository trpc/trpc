/**
 * Vue helpers for `@tanstack/vue-query`: an app plugin (or `provideTrpc`)
 * for the client and its helpers, and `useSubscription`.
 *
 * Pass a getter to `useQuery` so the options follow reactive input:
 *
 * @example
 * ```ts
 * import { createTrpcContext } from '@trpcdev/tanstack-vue-query';
 *
 * export const { TrpcPlugin, useTrpc } = createTrpcContext<AppRouter>();
 * app.use(VueQueryPlugin).use(TrpcPlugin, { client });
 *
 * // in setup()
 * const trpc = useTrpc();
 * const post = useQuery(() => trpc.post.byId.queryOptions({ input: { id: id.value } }));
 * ```
 * @module
 */
import {
  computed,
  getCurrentInstance,
  inject,
  onMounted,
  onScopeDispose,
  provide,
  shallowRef,
  toValue,
  watch,
  type ComputedRef,
  type InjectionKey,
  type MaybeRefOrGetter,
  type Plugin,
} from 'vue';
import type { ChainTypes, RouterOf, TrpcClient } from 'trpcdev/client';
import {
  createTrpcQueryUtils,
  SubscriptionObserver,
  type SubscriptionStatus,
  type TrpcQueryUtilsFor,
  type TrpcSubscriptionOptions,
  type TrpcContextOptions,
} from '@trpcdev/tanstack-query';

export * from '@trpcdev/tanstack-query';

/**
 * Options of the `TrpcPlugin` from {@link createTrpcContext}.
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export interface TrpcPluginOptions<
  TRouter,
  TContext extends object = {},
  TLinks extends ChainTypes = {},
> {
  client: TrpcClient<RouterOf<TRouter>, TContext, undefined, TLinks>;
}

/**
 * What {@link createTrpcContext} returns.
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export interface TrpcVueContext<
  TRouter,
  TContext extends object = {},
  TLinks extends ChainTypes = {},
> {
  /** Provides the client to the whole app: `app.use(TrpcPlugin, { client })`. */
  TrpcPlugin: Plugin<[TrpcPluginOptions<TRouter, TContext, TLinks>]>;
  /** Provides the client to the current component's descendants. */
  provideTrpc: (
    client: TrpcClient<RouterOf<TRouter>, TContext, undefined, TLinks>,
  ) => void;
  /** The helpers for the provided client. */
  useTrpc: () => TrpcQueryUtilsFor<TRouter, TContext, TLinks>;
  /** The provided client, for calls outside TanStack Query. */
  useTrpcClient: () => TrpcClient<
    RouterOf<TRouter>,
    TContext,
    undefined,
    TLinks
  >;
}

/**
 * Creates an injection key and helpers for a client and its helpers.
 * `TContext` is what the client's links declare.
 *
 * @example
 * ```ts
 * const { TrpcPlugin, useTrpc } = createTrpcContext<AppRouter>();
 * createApp(App).use(VueQueryPlugin).use(TrpcPlugin, { client }).mount('#app');
 * ```
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export function createTrpcContext<
  TRouter,
  TContext extends object = {},
  TLinks extends ChainTypes = {},
>(opts: TrpcContextOptions = {}): TrpcVueContext<TRouter, TContext, TLinks> {
  type Client = TrpcClient<RouterOf<TRouter>, TContext, undefined, TLinks>;
  type Value = {
    client: Client;
    utils: TrpcQueryUtilsFor<TRouter, TContext, TLinks>;
  };
  const key: InjectionKey<Value> = Symbol('trpc');
  const value = (client: Client): Value => ({
    client,
    utils: createTrpcQueryUtils({ ...opts, client }),
  });
  const use = (): Value => {
    const injected = inject(key, null);
    if (!injected) {
      throw new Error('Install TrpcPlugin or call provideTrpc() first');
    }
    return injected;
  };
  return {
    TrpcPlugin: {
      install: (app, opts) => {
        app.provide(key, value(opts.client));
      },
    },
    provideTrpc: (client) => provide(key, value(client)),
    useTrpc: () => use().utils,
    useTrpcClient: () => use().client,
  };
}

/**
 * What {@link useSubscription} returns: refs for the latest event and
 * status.
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export interface UseSubscriptionReturn<TEvent, TError> {
  status: ComputedRef<SubscriptionStatus>;
  /** The latest event. */
  data: ComputedRef<TEvent | undefined>;
  error: ComputedRef<TError | null>;
  /** Clears the state and subscribes again. */
  reset: () => void;
}

/**
 * Subscribes while the component is mounted (or the effect scope is
 * active). Pass a getter or ref so a new input restarts the subscription.
 *
 * @example
 * ```ts
 * const { data } = useSubscription(() =>
 *   trpc.post.onAdd.subscriptionOptions({ input: { channel: channel.value } }),
 * );
 * ```
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export function useSubscription<TEvent, TError>(
  options: MaybeRefOrGetter<TrpcSubscriptionOptions<TEvent, TError>>,
): UseSubscriptionReturn<TEvent, TError> {
  const observer = new SubscriptionObserver(toValue(options));
  const result = shallowRef(observer.getCurrentResult());
  let unsubscribe: (() => void) | undefined;
  const start = () => {
    unsubscribe = observer.subscribe((next) => (result.value = next));
    result.value = observer.getCurrentResult();
  };
  onScopeDispose(() => unsubscribe?.());
  if (getCurrentInstance()) onMounted(start);
  else start();
  watch(
    () => toValue(options),
    (next) => observer.setOptions(next),
  );
  return {
    status: computed(() => result.value.status),
    data: computed(() => result.value.data),
    error: computed(() => result.value.error),
    reset: observer.reset,
  };
}
