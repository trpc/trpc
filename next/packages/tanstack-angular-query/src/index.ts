/**
 * Angular helpers for `@tanstack/angular-query-experimental`: providers and
 * injectors for the client and its helpers, and `injectSubscription`.
 *
 * Pass a function to `injectQuery` so the options follow signals:
 *
 * @example
 * ```ts
 * import { createTrpcContext } from '@trpcdev/tanstack-angular-query';
 *
 * export const { provideTrpc, injectTrpc } = createTrpcContext<AppRouter>();
 *
 * bootstrapApplication(App, {
 *   providers: [provideTanStackQuery(new QueryClient()), provideTrpc(client)],
 * });
 *
 * // in a component
 * trpc = injectTrpc();
 * id = input.required<string>();
 * post = injectQuery(() => this.trpc.post.byId.queryOptions({ input: { id: this.id() } }));
 * ```
 * @module
 */
import {
  afterNextRender,
  assertInInjectionContext,
  computed,
  DestroyRef,
  effect,
  inject,
  InjectionToken,
  Injector,
  runInInjectionContext,
  signal,
  untracked,
  type Provider,
  type Signal,
} from '@angular/core';
import type { RouterOf, TrpcClient } from 'trpcdev/client';
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
 * What {@link createTrpcContext} returns.
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export interface TrpcAngularContext<TRouter, TContext extends object = {}> {
  /** Provides the client, next to `provideTanStackQuery`. */
  provideTrpc: (client: TrpcClient<RouterOf<TRouter>, TContext>) => Provider;
  /** The helpers for the provided client. Call in an injection context. */
  injectTrpc: () => TrpcQueryUtilsFor<TRouter, TContext>;
  /** The provided client, for calls outside TanStack Query. */
  injectTrpcClient: () => TrpcClient<RouterOf<TRouter>, TContext>;
}

/**
 * Creates an injection token and helpers for a client and its helpers.
 * `TContext` is what the client's links declare.
 *
 * @example
 * ```ts
 * const { provideTrpc, injectTrpc } = createTrpcContext<AppRouter>();
 * providers: [provideTanStackQuery(queryClient), provideTrpc(client)];
 * ```
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export function createTrpcContext<TRouter, TContext extends object = {}>(
  opts: TrpcContextOptions = {},
): TrpcAngularContext<TRouter, TContext> {
  type Value = {
    client: TrpcClient<RouterOf<TRouter>, TContext>;
    utils: TrpcQueryUtilsFor<TRouter, TContext>;
  };
  const token = new InjectionToken<Value>('trpc');
  return {
    provideTrpc: (client) => ({
      provide: token,
      useValue: { client, utils: createTrpcQueryUtils({ ...opts, client }) },
    }),
    injectTrpc: () => inject(token).utils,
    injectTrpcClient: () => inject(token).client,
  };
}

/**
 * Options of {@link injectSubscription}.
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export interface InjectSubscriptionOptions {
  /** Use outside an injection context. */
  injector?: Injector;
}

/**
 * What {@link injectSubscription} returns: signals for the latest event and
 * status.
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export interface InjectSubscriptionResult<TEvent, TError> {
  status: Signal<SubscriptionStatus>;
  /** The latest event. */
  data: Signal<TEvent | undefined>;
  error: Signal<TError | null>;
  /** Clears the state and subscribes again. */
  reset: () => void;
}

/**
 * Subscribes from the first browser render until the injector is
 * destroyed; nothing runs during SSR. The function is tracked, so a new
 * input restarts the subscription.
 *
 * @example
 * ```ts
 * from = signal(10);
 * ticks = injectSubscription(() =>
 *   this.trpc.clock.ticks.subscriptionOptions({ input: { from: this.from() } }),
 * );
 * // template: {{ ticks.data() }}
 * ```
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export function injectSubscription<TEvent, TError>(
  options: () => TrpcSubscriptionOptions<TEvent, TError>,
  opts: InjectSubscriptionOptions = {},
): InjectSubscriptionResult<TEvent, TError> {
  if (!opts.injector) assertInInjectionContext(injectSubscription);
  return runInInjectionContext(opts.injector ?? inject(Injector), () => {
    const observer = new SubscriptionObserver(untracked(options));
    const result = signal(observer.getCurrentResult());
    effect(() => {
      const next = options();
      untracked(() => observer.setOptions(next));
    });
    let unsubscribe: (() => void) | undefined;
    afterNextRender(() => {
      unsubscribe = observer.subscribe((next) => result.set(next));
      result.set(observer.getCurrentResult());
    });
    inject(DestroyRef).onDestroy(() => unsubscribe?.());
    return {
      status: computed(() => result().status),
      data: computed(() => result().data),
      error: computed(() => result().error),
      reset: observer.reset,
    };
  });
}
