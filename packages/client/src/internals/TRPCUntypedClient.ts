import type {
  inferObservableValue,
  Unsubscribable,
} from '@trpc/server/observable';
import { observableToPromise, share } from '@trpc/server/observable';
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
  TRPCClientRuntime,
  TRPCLink,
} from '../links/types';
import { TRPCClientError } from '../TRPCClientError';
import type { TRPCSubscription } from './iterableSubscription';
import { iterableSubscription } from './iterableSubscription';

export type { TRPCSubscription } from './iterableSubscription';

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

const subscriptionCallbacks: Record<
  keyof TRPCSubscriptionObserver<unknown, unknown>,
  true
> = {
  onStarted: true,
  onData: true,
  onError: true,
  onStopped: true,
  onComplete: true,
  onConnectionStateChange: true,
};

/**
 * Subscription options without callbacks, so `subscribe()` returns an
 * `AsyncIterable`.
 * @internal
 */
export type NoSubscriptionCallbacks = {
  [TKey in keyof TRPCSubscriptionObserver<unknown, unknown>]?: never;
};

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
  /** Starts a subscription without callbacks, to iterate with `for await`. */
  public subscription(
    path: string,
    input: unknown,
    opts?: TRPCRequestOptions & NoSubscriptionCallbacks,
  ): TRPCSubscription<unknown>;
  /** Starts a subscription with callbacks. Returns what stops it. */
  public subscription(
    path: string,
    input: unknown,
    opts: Partial<
      TRPCSubscriptionObserver<unknown, TRPCClientError<AnyRouter>>
    > &
      TRPCRequestOptions,
  ): Unsubscribable;
  public subscription(
    path: string,
    input: unknown,
    opts: Partial<
      TRPCSubscriptionObserver<unknown, TRPCClientError<AnyRouter>>
    > &
      TRPCRequestOptions = {},
  ): Unsubscribable | TRPCSubscription<unknown> {
    const observable$ = this.$request({
      type: 'subscription',
      path,
      input,
      context: opts.context,
      signal: opts.signal,
    });
    const hasCallbacks = Object.keys(subscriptionCallbacks).some(
      (key) => opts[key as keyof typeof subscriptionCallbacks] !== undefined,
    );
    if (!hasCallbacks) {
      return iterableSubscription(observable$, opts.signal);
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
    return {
      unsubscribe: () => subscription.unsubscribe(),
      [Symbol.asyncIterator]() {
        throw new Error(
          'Cannot iterate a subscription that was started with callbacks; omit the callbacks to use for-await',
        );
      },
    };
  }
}
