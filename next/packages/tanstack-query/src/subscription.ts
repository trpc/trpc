import { hashKey } from '@tanstack/query-core';
import type { TRPCQueryKey } from './keys.ts';

/**
 * Callbacks for a subscription. They always run with the latest options, so
 * changing them doesn't restart the subscription.
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export interface SubscriptionCallbacks<TEvent, TError> {
  /** Every event, in order. */
  onData?: ((event: TEvent) => void) | undefined;
  onError?: ((error: TError) => void) | undefined;
  /** The server ended the subscription. */
  onComplete?: (() => void) | undefined;
}

/**
 * What `subscriptionOptions()` returns, for a framework's `useSubscription`
 * or a {@link SubscriptionObserver}.
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export interface TRPCSubscriptionOptions<
  TEvent,
  TError,
> extends SubscriptionCallbacks<TEvent, TError> {
  /** Identifies the subscription; a new key restarts it. */
  readonly subscriptionKey: TRPCQueryKey;
  /** `false` (or `input: skipToken`) keeps it idle. */
  readonly enabled: boolean;
  /** Opens the subscription. Aborting `signal` closes it. */
  readonly subscribe: (opts: { signal: AbortSignal }) => AsyncIterable<TEvent>;
}

/**
 * - `idle`: disabled, not started yet, or ended by the server.
 * - `connecting`: started; no event yet.
 * - `active`: at least one event arrived and the subscription is open.
 * - `error`: it failed; `reset()` starts it again.
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export type SubscriptionStatus = 'idle' | 'connecting' | 'active' | 'error';

/**
 * A subscription's state. `data` is the latest event.
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export type SubscriptionResult<TEvent, TError> =
  | { status: 'idle'; data: TEvent | undefined; error: null }
  | { status: 'connecting'; data: TEvent | undefined; error: null }
  | { status: 'active'; data: TEvent; error: null }
  | { status: 'error'; data: TEvent | undefined; error: TError };

/** Options a {@link SubscriptionObserver} accepts. @internal */
type AnyOptions<TEvent, TError> = TRPCSubscriptionOptions<TEvent, TError>;

/**
 * Runs a subscription for UI code, like TanStack's `QueryObserver` does for
 * queries. It starts with the first listener, stops with the last, and
 * restarts when the key or `enabled` changes. Framework adapters wrap it.
 *
 * @example
 * ```ts
 * const observer = new SubscriptionObserver(
 *   trpc.post.onAdd.subscriptionOptions({ input: { channel: 'news' } }),
 * );
 * const unsubscribe = observer.subscribe((result) => render(result.data));
 * ```
 * @since 12.0.0-alpha.0
 * @stability experimental
 */
export class SubscriptionObserver<TEvent, TError> {
  #options: AnyOptions<TEvent, TError>;
  #hash: string;
  #result: SubscriptionResult<TEvent, TError>;
  #listeners = new Set<(result: SubscriptionResult<TEvent, TError>) => void>();
  #controller: AbortController | undefined;

  constructor(options: AnyOptions<TEvent, TError>) {
    this.#options = options;
    this.#hash = hashKey(options.subscriptionKey);
    this.#result = { status: 'idle', data: undefined, error: null };
  }

  /** The current state. A new object whenever something changes. */
  getCurrentResult = (): SubscriptionResult<TEvent, TError> => this.#result;

  /**
   * Listens for state changes; returns the unsubscribe function. The first
   * listener starts the subscription and the last one stops it.
   */
  subscribe = (
    listener: (result: SubscriptionResult<TEvent, TError>) => void,
  ): (() => void) => {
    this.#listeners.add(listener);
    if (this.#listeners.size === 1) this.#start();
    return () => {
      this.#listeners.delete(listener);
      if (this.#listeners.size === 0) this.#stop();
    };
  };

  /**
   * Updates the options. A different key or `enabled` restarts the
   * subscription (and clears `data`); new callbacks apply right away.
   */
  setOptions = (options: AnyOptions<TEvent, TError>): void => {
    const hash = hashKey(options.subscriptionKey);
    const restart =
      hash !== this.#hash || options.enabled !== this.#options.enabled;
    this.#options = options;
    this.#hash = hash;
    if (restart && this.#listeners.size > 0) {
      this.#stop();
      this.#set({ status: 'idle', data: undefined, error: null });
      this.#start();
    }
  };

  /** Clears the state and starts again. */
  reset = (): void => {
    this.#stop();
    this.#set({ status: 'idle', data: undefined, error: null });
    if (this.#listeners.size > 0) this.#start();
  };

  #set(result: SubscriptionResult<TEvent, TError>): void {
    this.#result = result;
    for (const listener of this.#listeners) listener(result);
  }

  #start(): void {
    if (!this.#options.enabled || this.#controller) return;
    const controller = new AbortController();
    this.#controller = controller;
    this.#set({ status: 'connecting', data: this.#result.data, error: null });
    const { signal } = controller;
    const live = () => this.#controller === controller && !signal.aborted;
    void (async () => {
      try {
        for await (const event of this.#options.subscribe({ signal })) {
          if (!live()) return;
          this.#set({ status: 'active', data: event, error: null });
          this.#options.onData?.(event);
        }
        if (!live()) return;
        this.#controller = undefined;
        this.#set({ status: 'idle', data: this.#result.data, error: null });
        this.#options.onComplete?.();
      } catch (cause) {
        if (!live()) return;
        this.#controller = undefined;
        const error = cause as TError;
        this.#set({ status: 'error', data: this.#result.data, error });
        this.#options.onError?.(error);
      }
    })();
  }

  #stop(): void {
    this.#controller?.abort();
    this.#controller = undefined;
  }
}
