/**
 * Lit helpers for `@tanstack/lit-query`: a provider element and a context
 * consumer for the client and its helpers, and
 * `createSubscriptionController`.
 *
 * Pass a function to `createQueryController` so the options follow host
 * state. Without a provider, `createTrpcQueryUtils({ client })` from the
 * root entry point works too.
 *
 * @example
 * ```ts
 * import { createTrpcContext } from '@trpc12/tanstack-lit-query';
 *
 * export const { TrpcProvider, useTrpc } = createTrpcContext<AppRouter>();
 * customElements.define('trpc-provider', TrpcProvider);
 *
 * class PostView extends LitElement {
 *   static properties = { postId: {} };
 *   trpc = useTrpc(this);
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
 * The provider element class from {@link createTrpcContext}. Set `.client`
 * as a property.
 * @since 0.0.1
 * @stability stable
 */
export interface TrpcProviderElement<
  TRouter,
  TContext extends object = {},
  TLinks extends ChainTypes = {},
> extends LitElement {
  client: TrpcClient<RouterOf<TRouter>, TContext, undefined, TLinks>;
}

/**
 * What {@link createTrpcContext} returns.
 * @since 0.0.1
 * @stability stable
 */
export interface TrpcLitContext<
  TRouter,
  TContext extends object = {},
  TLinks extends ChainTypes = {},
> {
  /**
   * Provides the client to descendants. Not registered: pass it to
   * `customElements.define` under a tag of your choice.
   */
  TrpcProvider: new () => TrpcProviderElement<TRouter, TContext, TLinks>;
  /**
   * The helpers for the provided client, resolved on first use. Call in a
   * field initializer and use them once the host is connected (in render or
   * in controller option functions).
   */
  useTrpc: (
    host: ReactiveElement,
  ) => TrpcQueryUtilsFor<TRouter, TContext, TLinks>;
  /** The provided client, resolved on first use. */
  useTrpcClient: (
    host: ReactiveElement,
  ) => TrpcClient<RouterOf<TRouter>, TContext, undefined, TLinks>;
  /** The `@lit/context` key, for `@consume` or a custom provider. */
  context: Context<
    unknown,
    | {
        client: TrpcClient<RouterOf<TRouter>, TContext, undefined, TLinks>;
        utils: TrpcQueryUtilsFor<TRouter, TContext, TLinks>;
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
 * client and its helpers.
 * `TSource` is the client's type (`ReturnType<typeof makeClient>`), which
 * brings its links' context and types too, or a router type with
 * `TContext` and `TLinks` spelled out.
 *
 * @example
 * ```ts
 * const { TrpcProvider, useTrpc } = createTrpcContext<AppRouter>();
 * customElements.define('trpc-provider', TrpcProvider);
 *
 * html`<query-client-provider .client=${queryClient}>
 *   <trpc-provider .client=${client}><post-view></post-view></trpc-provider>
 * </query-client-provider>`;
 * ```
 * @since 0.0.1
 * @stability stable
 */
export function createTrpcContext<
  TSource,
  TContext extends object = SourceContext<TSource>,
  TLinks extends ChainTypes = SourceLinks<TSource>,
>(
  opts: TrpcContextOptions = {},
): TrpcLitContext<SourceRouter<TSource>, TContext, TLinks> {
  type TRouter = SourceRouter<TSource>;
  type Client = TrpcClient<RouterOf<TRouter>, TContext, undefined, TLinks>;
  type Value = {
    client: Client;
    utils: TrpcQueryUtilsFor<TRouter, TContext, TLinks>;
  };
  const context = createContext<Value | undefined>(Symbol('trpc'));

  class TrpcProvider extends LitElement {
    static override properties = { client: { attribute: false } };
    declare client: Client;
    #provider = new ContextProvider(this, { context });

    #provide(): void {
      if (this.client && this.#provider.value?.client !== this.client) {
        const client = this.client;
        this.#provider.setValue({
          client,
          utils: createTrpcQueryUtils({ ...opts, client }),
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
        throw new Error('Render inside the TrpcProvider element first');
      }
      return consumer.value;
    };
  };
  return {
    TrpcProvider,
    useTrpc: (host) => {
      const value = consume(host);
      return lazy(() => value().utils);
    },
    useTrpcClient: (host) => {
      const value = consume(host);
      return lazy(() => value().client);
    },
    context,
  };
}

/**
 * What {@link createSubscriptionController} returns: call it (or read
 * `current`) during render for the latest state.
 * @since 0.0.1
 * @stability stable
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
  | TrpcSubscriptionOptions<TEvent, TError>
  | (() => TrpcSubscriptionOptions<TEvent, TError>);

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

  #read(): TrpcSubscriptionOptions<TEvent, TError> {
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
 *   trpc = useTrpc(this);
 *   ticks = createSubscriptionController(this, () =>
 *     this.trpc.clock.ticks.subscriptionOptions({ input: { from: this.from } }),
 *   );
 *   render() {
 *     return html`<p>${this.ticks().data}</p>`;
 *   }
 * }
 * ```
 * @since 0.0.1
 * @stability stable
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
