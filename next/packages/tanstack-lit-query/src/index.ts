/**
 * Lit helpers for `@tanstack/lit-query`: a provider element and a context
 * consumer for the client and its helpers, and
 * `createSubscriptionController`.
 *
 * Pass a function to `createQueryController` so the options follow host
 * state. Without a provider, `createTRPCQueryUtils({ client })` from the
 * root entry point works too.
 *
 * @example
 * ```ts
 * import { createTRPCContext } from '@trpcdev/tanstack-lit-query';
 *
 * export const { TRPCProvider, useTRPC } = createTRPCContext<AppRouter>();
 * customElements.define('trpc-provider', TRPCProvider);
 *
 * class PostView extends LitElement {
 *   static properties = { postId: {} };
 *   trpc = useTRPC(this);
 *   post = createQueryController(this, () =>
 *     this.trpc.post.byId.queryOptions({ input: { id: this.postId } }),
 *   );
 *   render() {
 *     return html`<h1>${this.post().data?.title}</h1>`;
 *   }
 * }
 * ```
 * @module
 */
import {
  ContextConsumer,
  ContextProvider,
  createContext,
  type Context,
} from '@lit/context';
import {
  html,
  LitElement,
  type PropertyValues,
  type ReactiveController,
  type ReactiveControllerHost,
  type ReactiveElement,
  type TemplateResult,
} from 'lit';
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
 * The provider element class from {@link createTRPCContext}. Set `.client`
 * as a property.
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export interface TRPCProviderElement<
  TRouter,
  TContext extends object = {},
> extends LitElement {
  client: TRPCClient<RouterOf<TRouter>, TContext>;
}

/**
 * What {@link createTRPCContext} returns.
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export interface TRPCLitContext<TRouter, TContext extends object = {}> {
  /**
   * Provides the client to descendants. Not registered: pass it to
   * `customElements.define` under a tag of your choice.
   */
  TRPCProvider: new () => TRPCProviderElement<TRouter, TContext>;
  /**
   * The helpers for the provided client, resolved on first use. Call in a
   * field initializer and use them once the host is connected (in render or
   * in controller option functions).
   */
  useTRPC: (host: ReactiveElement) => TRPCQueryUtilsFor<TRouter, TContext>;
  /** The provided client, resolved on first use. */
  useTRPCClient: (
    host: ReactiveElement,
  ) => TRPCClient<RouterOf<TRouter>, TContext>;
  /** The `@lit/context` key, for `@consume` or a custom provider. */
  context: Context<
    unknown,
    | {
        client: TRPCClient<RouterOf<TRouter>, TContext>;
        utils: TRPCQueryUtilsFor<TRouter, TContext>;
      }
    | undefined
  >;
}

/** Forwards every property read to the value `resolve` returns. */
function lazy<T extends object>(resolve: () => T): T {
  return new Proxy({} as T, {
    get: (_target, key) => Reflect.get(resolve(), key),
  });
}

/**
 * Creates a `@lit/context` key, a provider element and consumers for a
 * client and its helpers. `TContext` is what the client's links declare.
 *
 * @example
 * ```ts
 * const { TRPCProvider, useTRPC } = createTRPCContext<AppRouter>();
 * customElements.define('trpc-provider', TRPCProvider);
 *
 * html`<query-client-provider .client=${queryClient}>
 *   <trpc-provider .client=${client}><post-view></post-view></trpc-provider>
 * </query-client-provider>`;
 * ```
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export function createTRPCContext<
  TRouter,
  TContext extends object = {},
>(): TRPCLitContext<TRouter, TContext> {
  type Client = TRPCClient<RouterOf<TRouter>, TContext>;
  type Value = { client: Client; utils: TRPCQueryUtilsFor<TRouter, TContext> };
  const context = createContext<Value | undefined>(Symbol('trpc'));

  class TRPCProvider extends LitElement {
    static override properties = { client: { attribute: false } };
    declare client: Client;
    #provider = new ContextProvider(this, { context });

    #provide(): void {
      if (this.client && this.#provider.value?.client !== this.client) {
        const client = this.client;
        this.#provider.setValue({
          client,
          utils: createTRPCQueryUtils({ client }),
        });
      }
    }

    override connectedCallback(): void {
      super.connectedCallback();
      this.#provide();
    }

    protected override willUpdate(changed: PropertyValues): void {
      if (changed.has('client')) this.#provide();
    }

    protected override render(): TemplateResult {
      return html`<slot></slot>`;
    }
  }

  const consume = (host: ReactiveElement) => {
    const consumer = new ContextConsumer(host, { context, subscribe: true });
    return (): Value => {
      if (!consumer.value) {
        throw new Error('Render inside the TRPCProvider element first');
      }
      return consumer.value;
    };
  };
  return {
    TRPCProvider,
    useTRPC: (host) => {
      const value = consume(host);
      return lazy(() => value().utils);
    },
    useTRPCClient: (host) => {
      const value = consume(host);
      return lazy(() => value().client);
    },
    context,
  };
}

/**
 * What {@link createSubscriptionController} returns: call it (or read
 * `current`) during render for the latest state.
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export type SubscriptionResultAccessor<TEvent, TError> =
  (() => SubscriptionResult<TEvent, TError>) & {
    readonly current: SubscriptionResult<TEvent, TError>;
    /** Clears the state and subscribes again. */
    reset: () => void;
    /** Removes the controller from its host and unsubscribes. */
    destroy: () => void;
  };

type OptionsOrFn<TEvent, TError> =
  | TRPCSubscriptionOptions<TEvent, TError>
  | (() => TRPCSubscriptionOptions<TEvent, TError>);

class SubscriptionController<TEvent, TError> implements ReactiveController {
  #host: ReactiveControllerHost;
  #options: OptionsOrFn<TEvent, TError>;
  #observer: SubscriptionObserver<TEvent, TError> | undefined;
  #unsubscribe: (() => void) | undefined;
  #connected = false;

  constructor(
    host: ReactiveControllerHost,
    options: OptionsOrFn<TEvent, TError>,
  ) {
    this.#host = host;
    this.#options = options;
    host.addController(this);
  }

  #read(): TRPCSubscriptionOptions<TEvent, TError> {
    return typeof this.#options === 'function'
      ? this.#options()
      : this.#options;
  }

  hostConnected(): void {
    this.#connected = true;
    // Later, so field initializers (and context consumers) run first.
    queueMicrotask(() => {
      if (!this.#connected || this.#unsubscribe) return;
      const options = this.#read();
      if (this.#observer) this.#observer.setOptions(options);
      else this.#observer = new SubscriptionObserver(options);
      this.#unsubscribe = this.#observer.subscribe(() =>
        this.#host.requestUpdate(),
      );
      this.#host.requestUpdate();
    });
  }

  hostUpdate(): void {
    if (this.#unsubscribe && typeof this.#options === 'function') {
      this.#observer?.setOptions(this.#options());
    }
  }

  hostDisconnected(): void {
    this.#connected = false;
    this.#unsubscribe?.();
    this.#unsubscribe = undefined;
  }

  get current(): SubscriptionResult<TEvent, TError> {
    return (
      this.#observer?.getCurrentResult() ?? {
        status: 'idle',
        data: undefined,
        error: null,
      }
    );
  }

  reset = (): void => this.#observer?.reset();

  destroy = (): void => {
    this.hostDisconnected();
    this.#host.removeController(this);
  };
}

/**
 * Subscribes while the host is connected; nothing runs during SSR. Pass a
 * function so the options are read again on each host update: a new input
 * restarts the subscription.
 *
 * @example
 * ```ts
 * class Ticker extends LitElement {
 *   static properties = { from: {} };
 *   trpc = useTRPC(this);
 *   ticks = createSubscriptionController(this, () =>
 *     this.trpc.clock.ticks.subscriptionOptions({ input: { from: this.from } }),
 *   );
 *   render() {
 *     return html`<p>${this.ticks().data}</p>`;
 *   }
 * }
 * ```
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export function createSubscriptionController<TEvent, TError>(
  host: ReactiveControllerHost,
  options: OptionsOrFn<TEvent, TError>,
): SubscriptionResultAccessor<TEvent, TError> {
  const controller = new SubscriptionController(host, options);
  return Object.defineProperties(() => controller.current, {
    current: { get: () => controller.current, enumerable: true },
    reset: { value: controller.reset },
    destroy: { value: controller.destroy },
  }) as SubscriptionResultAccessor<TEvent, TError>;
}
