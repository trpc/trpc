/**
 * Vue helpers for `@tanstack/vue-query`: an app plugin (or `provideTRPC`)
 * for the client and its helpers, and `useSubscription`.
 *
 * Pass a getter to `useQuery` so the options follow reactive input:
 *
 * @example
 * ```ts
 * import { createTRPCContext } from '@trpcdev/tanstack-vue-query';
 *
 * export const { TRPCPlugin, useTRPC } = createTRPCContext<AppRouter>();
 * app.use(VueQueryPlugin).use(TRPCPlugin, { client });
 *
 * // in setup()
 * const trpc = useTRPC();
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
 * Options of the `TRPCPlugin` from {@link createTRPCContext}.
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export interface TRPCPluginOptions<TRouter, TContext extends object = {}> {
  client: TRPCClient<RouterOf<TRouter>, TContext>;
}

/**
 * What {@link createTRPCContext} returns.
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export interface TRPCVueContext<TRouter, TContext extends object = {}> {
  /** Provides the client to the whole app: `app.use(TRPCPlugin, { client })`. */
  TRPCPlugin: Plugin<[TRPCPluginOptions<TRouter, TContext>]>;
  /** Provides the client to the current component's descendants. */
  provideTRPC: (client: TRPCClient<RouterOf<TRouter>, TContext>) => void;
  /** The helpers for the provided client. */
  useTRPC: () => TRPCQueryUtilsFor<TRouter, TContext>;
  /** The provided client, for calls outside TanStack Query. */
  useTRPCClient: () => TRPCClient<RouterOf<TRouter>, TContext>;
}

/**
 * Creates an injection key and helpers for a client and its helpers.
 * `TContext` is what the client's links declare.
 *
 * @example
 * ```ts
 * const { TRPCPlugin, useTRPC } = createTRPCContext<AppRouter>();
 * createApp(App).use(VueQueryPlugin).use(TRPCPlugin, { client }).mount('#app');
 * ```
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export function createTRPCContext<
  TRouter,
  TContext extends object = {},
>(): TRPCVueContext<TRouter, TContext> {
  type Client = TRPCClient<RouterOf<TRouter>, TContext>;
  type Value = { client: Client; utils: TRPCQueryUtilsFor<TRouter, TContext> };
  const key: InjectionKey<Value> = Symbol('trpc');
  const value = (client: Client): Value => ({
    client,
    utils: createTRPCQueryUtils({ client }),
  });
  const use = (): Value => {
    const injected = inject(key, null);
    if (!injected) {
      throw new Error('Install TRPCPlugin or call provideTRPC() first');
    }
    return injected;
  };
  return {
    TRPCPlugin: {
      install: (app, opts) => {
        app.provide(key, value(opts.client));
      },
    },
    provideTRPC: (client) => provide(key, value(client)),
    useTRPC: () => use().utils,
    useTRPCClient: () => use().client,
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
  options: MaybeRefOrGetter<TRPCSubscriptionOptions<TEvent, TError>>,
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
