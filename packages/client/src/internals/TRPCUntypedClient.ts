import type {
  inferObservableValue,
  Unsubscribable,
} from '@trpc/server/observable';
import {
  observable,
  observableToAsyncIterable,
  observableToPromise,
  share,
} from '@trpc/server/observable';
import type {
  AnyRouter,
  inferAsyncIterableYield,
  InferrableClientTypes,
  Maybe,
  TypeError,
} from '@trpc/server/unstable-core-do-not-import';
import { createChain } from '../links/internals/createChain';
import type { TRPCConnectionState } from '../links/internals/subscriptions';
import type {
  OperationContext,
  OperationLink,
  OperationResultEnvelope,
  TRPCClientRuntime,
  TRPCLink,
} from '../links/types';
import { TRPCClientError } from '../TRPCClientError';

type TRPCType = 'mutation' | 'query' | 'subscription';
/** The options of a call made with the untyped client. */
export interface TRPCRequestOptions {
  /**
   * Context for the links, such as a flag a `splitLink` reads.
   * @see https://trpc.io/docs/client/links#managing-context
   */
  context?: OperationContext;
  /**
   * Aborts the call. With `httpBatchLink`, the request is only aborted once
   * every call in its batch is, so an aborted call can still get a result.
   */
  signal?: AbortSignal;
}

/** The callbacks a subscription takes on the client. */
export interface TRPCSubscriptionObserver<TValue, TError> {
  /** Called when the link sends a `started` result. */
  onStarted: (opts: { context: OperationContext | undefined }) => void;
  /** Called with each event. */
  onData: (value: inferAsyncIterableYield<TValue>) => void;
  /** Called when the subscription ends with an error. */
  onError: (err: TError) => void;
  /**
   * Called when the link sends a `stopped` result. Not every link sends
   * one; `localLink` doesn't.
   */
  onStopped: () => void;
  /** Called when the subscription's observable completes, for any reason. */
  onComplete: () => void;
  /** Called when the connection connects, drops or reconnects. */
  onConnectionStateChange: (state: TRPCConnectionState<TError>) => void;
}

type ObserverKey = keyof TRPCSubscriptionObserver<unknown, unknown>;

/**
 * What `subscribe(input, { events: true })` yields: data, `started`, and
 * the connection's `state` while the subscription runs. The loop ends when
 * the subscription ends: on completion, abort or `break`, or right after an
 * `error` event.
 * @see https://trpc.io/docs/client/vanilla/setup#iterating-every-event
 */
export type SubscriptionEvent<TData, TError = TRPCClientError<AnyRouter>> =
  | { type: 'started'; context: OperationContext | undefined }
  | { type: 'data'; data: TData }
  | Exclude<TRPCConnectionState<TError>, { state: 'idle' }>
  | { type: 'error'; error: TError };

/**
 * Subscription options without callbacks: `TOpts` must not have any of the
 * callback keys, not even set to `undefined`.
 * @internal
 */
export type TRPCSubscriptionWithoutCallbacks<TOpts> = TOpts & {
  [TKey in keyof TOpts & ObserverKey]: never;
};

/**
 * Subscription callbacks, at least one of which is defined.
 * @internal
 */
export type TRPCSubscriptionCallbacks<TValue, TError> = Partial<
  TRPCSubscriptionObserver<TValue, TError>
> &
  {
    [TKey in ObserverKey]: Pick<TRPCSubscriptionObserver<TValue, TError>, TKey>;
  }[ObserverKey];

/**
 * Options for a subscription iterated with `for await`.
 * @internal
 */
export interface TRPCSubscriptionIterableOptions<TEvents extends boolean> {
  /**
   * Yield every event as a `SubscriptionEvent`, such as connection-state
   * changes and errors, instead of only data.
   */
  events?: TEvents;
}

const observerKeys: ObserverKey[] = [
  'onStarted',
  'onData',
  'onError',
  'onStopped',
  'onComplete',
  'onConnectionStateChange',
];

function throwOnIterate(): never {
  throw new Error(
    "A subscription with callbacks can't be iterated. Call subscribe() without callbacks to use for await.",
  );
}

/**
 * The event for a link message, or `null` for `stopped` and `idle`, which
 * only say that the subscription ended; the loop ending already says that.
 */
function toEvent(
  envelope: OperationResultEnvelope<unknown, TRPCClientError<AnyRouter>>,
): SubscriptionEvent<unknown> | null {
  const { result } = envelope;
  switch (result.type) {
    case 'started':
      return { type: 'started', context: envelope.context };
    case 'stopped':
      return null;
    case 'state':
      return result.state === 'idle' ? null : result;
    case 'data':
    case undefined:
      return { type: 'data', data: result.data };
  }
}

/**
 * The options of `createTRPCClient`.
 * @internal
 */
export type CreateTRPCClientOptions<TRouter extends InferrableClientTypes> = {
  /**
   * The links each call goes through, in order. The last one must send
   * the call, such as `httpBatchLink`.
   * @see https://trpc.io/docs/client/links
   */
  links: TRPCLink<TRouter>[];
  transformer?: TypeError<'The transformer property has moved to httpLink/httpBatchLink/wsLink'>;
};

/**
 * A client that calls procedures by path string, without types.
 * `createTRPCClient` wraps one.
 */
export class TRPCUntypedClient<TInferrable extends InferrableClientTypes> {
  private readonly links: OperationLink<TInferrable>[];
  public readonly runtime: TRPCClientRuntime;
  private requestId: number;

  constructor(opts: CreateTRPCClientOptions<TInferrable>) {
    this.requestId = 0;

    this.runtime = {};

    // Initialize the links
    this.links = opts.links.map((link) => link(this.runtime));
  }

  private $request<TInput = unknown, TOutput = unknown>(opts: {
    type: TRPCType;
    input: TInput;
    path: string;
    context?: OperationContext;
    signal: Maybe<AbortSignal>;
  }) {
    const chain$ = createChain<AnyRouter, TInput, TOutput>({
      links: this.links as OperationLink<any, any, any>[],
      op: {
        ...opts,
        context: opts.context ?? {},
        id: ++this.requestId,
      },
    });
    return chain$.pipe(share());
  }

  private async requestAsPromise<TInput = unknown, TOutput = unknown>(opts: {
    type: TRPCType;
    input: TInput;
    path: string;
    context?: OperationContext;
    signal: Maybe<AbortSignal>;
  }): Promise<TOutput> {
    try {
      const req$ = this.$request<TInput, TOutput>(opts);
      type TValue = inferObservableValue<typeof req$>;

      const envelope = await observableToPromise<TValue>(req$);
      const data = (envelope.result as any).data;
      return data;
    } catch (err) {
      throw TRPCClientError.from(err as Error);
    }
  }
  /** Calls a query. */
  public query(path: string, input?: unknown, opts?: TRPCRequestOptions) {
    return this.requestAsPromise<unknown, unknown>({
      type: 'query',
      path,
      input,
      context: opts?.context,
      signal: opts?.signal,
    });
  }
  /** Calls a mutation. */
  public mutation(path: string, input?: unknown, opts?: TRPCRequestOptions) {
    return this.requestAsPromise<unknown, unknown>({
      type: 'mutation',
      path,
      input,
      context: opts?.context,
      signal: opts?.signal,
    });
  }
  /**
   * Starts a subscription. With callbacks, returns what stops it. Without,
   * returns an async iterator to read it with `for await`, which `signal`,
   * `break` or `return()` stops. It can be iterated once. It yields only
   * data, or every `SubscriptionEvent` with `events: true`.
   * @see https://trpc.io/docs/client/vanilla/setup#5-use-subscriptions
   */
  public subscription(
    path: string,
    input: unknown,
    opts: TRPCSubscriptionCallbacks<unknown, TRPCClientError<AnyRouter>> &
      TRPCRequestOptions &
      TRPCSubscriptionIterableOptions<never>,
  ): Unsubscribable;
  public subscription<
    TOpts extends TRPCRequestOptions &
      Partial<TRPCSubscriptionObserver<unknown, TRPCClientError<AnyRouter>>> &
      Required<TRPCSubscriptionIterableOptions<true>>,
  >(
    path: string,
    input: unknown,
    opts: TRPCSubscriptionWithoutCallbacks<TOpts>,
  ): AsyncIterableIterator<SubscriptionEvent<unknown>>;
  public subscription<
    TOpts extends TRPCRequestOptions &
      Partial<TRPCSubscriptionObserver<unknown, TRPCClientError<AnyRouter>>> &
      TRPCSubscriptionIterableOptions<false> = TRPCRequestOptions,
  >(
    path: string,
    input: unknown,
    opts?: TRPCSubscriptionWithoutCallbacks<TOpts>,
  ): AsyncIterableIterator<unknown>;
  public subscription(
    path: string,
    input: unknown,
    opts: Partial<
      TRPCSubscriptionObserver<unknown, TRPCClientError<AnyRouter>>
    > &
      TRPCRequestOptions &
      TRPCSubscriptionIterableOptions<boolean> = {},
  ): Unsubscribable | AsyncIterableIterator<unknown> {
    const hasCallbacks = observerKeys.some(
      (key) => typeof opts[key] === 'function',
    );
    if (!hasCallbacks && observerKeys.some((key) => key in opts)) {
      throw new Error(
        'subscribe() was called with callbacks, but none of them is defined. Pass at least one callback, or omit them all to iterate with for await.',
      );
    }
    if (hasCallbacks && opts.events) {
      throw new Error(
        "A subscription with callbacks can't use `events: true`, which only applies to for await. Use callbacks or iterate, not both.",
      );
    }
    const observable$ = this.$request({
      type: 'subscription',
      path,
      input,
      context: opts.context,
      signal: opts.signal,
    });
    if (!hasCallbacks) {
      const events = opts.events === true;
      const values$ = observable<unknown, TRPCClientError<AnyRouter>>(
        (observer) =>
          observable$.subscribe({
            next(envelope) {
              if (events) {
                const event = toEvent(envelope);
                if (event) {
                  observer.next(event);
                }
              } else if (
                envelope.result.type === 'data' ||
                envelope.result.type === undefined
              ) {
                observer.next(envelope.result.data);
              }
            },
            error(err) {
              if (events) {
                observer.next({ type: 'error', error: err });
                observer.complete();
              } else {
                observer.error(err);
              }
            },
            complete: () => observer.complete(),
          }),
      );
      const iterator = observableToAsyncIterable(
        values$,
        opts.signal ?? new AbortController().signal,
      );
      // a second loop over the same iterator would split the data with the
      // first, or end straight away once the first has left
      let iterated = false;
      iterator[Symbol.asyncIterator] = () => {
        if (iterated) {
          throw new Error(
            'A subscription can only be iterated once. Call subscribe() again for another loop.',
          );
        }
        iterated = true;
        return iterator;
      };
      return iterator;
    }
    const subscription = observable$.subscribe({
      next(envelope) {
        switch (envelope.result.type) {
          case 'state': {
            opts.onConnectionStateChange?.(envelope.result);
            break;
          }
          case 'started': {
            opts.onStarted?.({
              context: envelope.context,
            });
            break;
          }
          case 'stopped': {
            opts.onStopped?.();
            break;
          }
          case 'data':
          case undefined: {
            opts.onData?.(envelope.result.data);
            break;
          }
        }
      },
      error(err) {
        opts.onError?.(err);
      },
      complete() {
        opts.onComplete?.();
      },
    });
    return Object.assign(subscription, {
      [Symbol.asyncIterator]: throwOnIterate,
    });
  }
}
