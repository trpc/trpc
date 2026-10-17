import { hashKey } from '@tanstack/query-core';
import type { TrpcQueryKey } from './keys.ts';

/**
 * Callbacks for a subscription. They always run with the latest options, so
 * changing them doesn't restart the subscription.
 * @since 0.1.0
 * @stability stable
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
 * @since 0.1.0
 * @stability stable
 */
export interface TrpcSubscriptionOptions<
  TEvent,
  TError,
> extends SubscriptionCallbacks<TEvent, TError> {
  /** Identifies the subscription; a new key restarts it. */
  readonly subscriptionKey: TrpcQueryKey;
  /** `false` (or `input: skipToken`) keeps it idle. */
  readonly enabled: boolean;
  /** Opens the subscription. Aborting `signal` closes it. */
  readonly subscribe: (opts: { signal: AbortSignal }) => AsyncIterable<TEvent>;
  /**
   * Observers with the same cache and key share one subscription.
   * `subscriptionOptions()` passes its client's cache; without one, each
   * observer has its own.
   */
  readonly subscriptionCache?: SubscriptionCache | undefined;
}

/**
 * - `idle`: disabled, not started yet, or ended by the server.
 * - `connecting`: started; no event yet.
 * - `active`: at least one event arrived and the subscription is open.
 * - `error`: it failed; `reset()` starts it again.
 * @since 0.1.0
 * @stability stable
 */
export type SubscriptionStatus = 'idle' | 'connecting' | 'active' | 'error';

/**
 * A subscription's state. `data` is the latest event.
 * @since 0.1.0
 * @stability stable
 */
export type SubscriptionResult<TEvent, TError> =
  | { status: 'idle'; data: TEvent | undefined; error: null }
  | { status: 'connecting'; data: TEvent | undefined; error: null }
  | { status: 'active'; data: TEvent; error: null }
  | { status: 'error'; data: TEvent | undefined; error: TError };

/** Options a {@link SubscriptionObserver} accepts. @internal */
type AnyOptions<TEvent, TError> = TrpcSubscriptionOptions<TEvent, TError>;

interface Member<TEvent, TError> {
  options(): AnyOptions<TEvent, TError>;
  receive(result: SubscriptionResult<TEvent, TError>): void;
}

const idle = { status: 'idle', data: undefined, error: null } as const;

/** @internal */
class SharedSubscription<TEvent, TError> {
  result: SubscriptionResult<TEvent, TError> = idle;
  readonly members: Set<Member<TEvent, TError>> = new Set();
  readonly release: () => void;
  #controller: AbortController | undefined;

  constructor(release: () => void) {
    this.release = release;
  }

  join(member: Member<TEvent, TError>): void {
    this.members.add(member);
    if (this.members.size === 1) this.#start(member.options());
    else member.receive(this.result);
  }

  leave(member: Member<TEvent, TError>): void {
    this.members.delete(member);
    if (this.members.size > 0) return;
    this.#stop();
    this.release();
  }

  restart(options: AnyOptions<TEvent, TError>): void {
    this.#stop();
    this.#set(idle);
    this.#start(options);
  }

  #set(result: SubscriptionResult<TEvent, TError>): void {
    this.result = result;
    for (const member of this.members) member.receive(result);
  }

  #each(fn: (options: AnyOptions<TEvent, TError>) => void): void {
    for (const member of this.members) fn(member.options());
  }

  #start(options: AnyOptions<TEvent, TError>): void {
    const controller = new AbortController();
    this.#controller = controller;
    this.#set({ status: 'connecting', data: this.result.data, error: null });
    const live = () =>
      this.#controller === controller && !controller.signal.aborted;
    void (async () => {
      try {
        for await (const event of options.subscribe({
          signal: controller.signal,
        })) {
          if (!live()) return;
          this.#set({ status: 'active', data: event, error: null });
          this.#each((o) => o.onData?.(event));
        }
        if (!live()) return;
        this.#controller = undefined;
        this.#set({ status: 'idle', data: this.result.data, error: null });
        this.#each((o) => o.onComplete?.());
      } catch (cause) {
        if (!live()) return;
        this.#controller = undefined;
        const error = cause as TError;
        this.#set({ status: 'error', data: this.result.data, error });
        this.#each((o) => o.onError?.(error));
      }
    })();
  }

  #stop(): void {
    this.#controller?.abort();
    this.#controller = undefined;
  }
}

/**
 * The running subscriptions of one client, by key. Observers that join a
 * key share its connection, state and events; each keeps its own callbacks.
 * The subscription closes when its last observer leaves.
 * @since 0.1.0
 * @stability stable
 */
export class SubscriptionCache {
  readonly #entries = new Map<string, SharedSubscription<any, any>>();

  /** @internal */
  join<TEvent, TError>(
    hash: string,
    member: Member<TEvent, TError>,
  ): SharedSubscription<TEvent, TError> {
    let entry = this.#entries.get(hash) as
      | SharedSubscription<TEvent, TError>
      | undefined;
    if (!entry) {
      const created = new SharedSubscription<TEvent, TError>(() => {
        if (this.#entries.get(hash) === created) this.#entries.delete(hash);
      });
      this.#entries.set(hash, created);
      entry = created;
    }
    entry.join(member);
    return entry;
  }

  /** How many subscriptions are open. */
  get size(): number {
    return this.#entries.size;
  }
}

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
 * @since 0.1.0
 * @stability stable
 */
export class SubscriptionObserver<TEvent, TError> {
  #options: AnyOptions<TEvent, TError>;
  #hash: string;
  #result: SubscriptionResult<TEvent, TError> = idle;
  #listeners = new Set<(result: SubscriptionResult<TEvent, TError>) => void>();
  #entry: SharedSubscription<TEvent, TError> | undefined;
  readonly #cache: SubscriptionCache;
  readonly #member: Member<TEvent, TError>;

  constructor(options: AnyOptions<TEvent, TError>) {
    this.#options = options;
    this.#hash = hashKey(options.subscriptionKey);
    this.#cache = options.subscriptionCache ?? new SubscriptionCache();
    this.#member = {
      options: () => this.#options,
      receive: (result) => this.#set(result),
    };
  }

  /** The current state. A new object whenever something changes. */
  getCurrentResult = (): SubscriptionResult<TEvent, TError> => this.#result;

  /**
   * Listens for state changes; returns the unsubscribe function. The first
   * listener starts (or joins) the subscription and the last one leaves it.
   */
  subscribe = (
    listener: (result: SubscriptionResult<TEvent, TError>) => void,
  ): (() => void) => {
    this.#listeners.add(listener);
    if (this.#listeners.size === 1) this.#join();
    return () => {
      this.#listeners.delete(listener);
      if (this.#listeners.size === 0) this.#leave();
    };
  };

  /**
   * Updates the options. A different key or `enabled` moves to that
   * subscription (and clears `data`); new callbacks apply right away.
   */
  setOptions = (options: AnyOptions<TEvent, TError>): void => {
    const hash = hashKey(options.subscriptionKey);
    const restart =
      hash !== this.#hash || options.enabled !== this.#options.enabled;
    this.#options = options;
    this.#hash = hash;
    if (restart && this.#listeners.size > 0) {
      this.#leave();
      this.#set(idle);
      this.#join();
    }
  };

  /** Clears the state and starts again, for every observer of the key. */
  reset = (): void => {
    if (this.#entry) this.#entry.restart(this.#options);
    else this.#set(idle);
  };

  #set(result: SubscriptionResult<TEvent, TError>): void {
    this.#result = result;
    for (const listener of this.#listeners) listener(result);
  }

  #join(): void {
    if (!this.#options.enabled || this.#entry) return;
    this.#entry = this.#cache.join(this.#hash, this.#member);
  }

  #leave(): void {
    this.#entry?.leave(this.#member);
    this.#entry = undefined;
  }
}
