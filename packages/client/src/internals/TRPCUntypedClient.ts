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

type TRPCType = 'mutation' | 'query' | 'subscription';
export interface TRPCRequestOptions {
  /**
   * Pass additional context to links
   */
  context?: OperationContext;
  signal?: AbortSignal;
}

export interface TRPCSubscriptionObserver<TValue, TError> {
  onStarted: (opts: { context: OperationContext | undefined }) => void;
  onData: (value: inferAsyncIterableYield<TValue>) => void;
  onError: (err: TError) => void;
  onStopped: () => void;
  onComplete: () => void;
  onConnectionStateChange: (state: TRPCConnectionState<TError>) => void;
}

/** @internal */
export type CreateTRPCClientOptions<TRouter extends InferrableClientTypes> = {
  links: TRPCLink<TRouter>[];
  transformer?: TypeError<'The transformer property has moved to httpLink/httpBatchLink/wsLink'>;
};

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
  public query(path: string, input?: unknown, opts?: TRPCRequestOptions) {
    return this.requestAsPromise<unknown, unknown>({
      type: 'query',
      path,
      input,
      context: opts?.context,
      signal: opts?.signal,
    });
  }
  public mutation(path: string, input?: unknown, opts?: TRPCRequestOptions) {
    return this.requestAsPromise<unknown, unknown>({
      type: 'mutation',
      path,
      input,
      context: opts?.context,
      signal: opts?.signal,
    });
  }
  public subscription(
    path: string,
    input: unknown,
    opts: Partial<
      TRPCSubscriptionObserver<unknown, TRPCClientError<AnyRouter>>
    > &
      TRPCRequestOptions,
  ): Unsubscribable {
    const observable$ = this.$request({
      type: 'subscription',
      path,
      input,
      context: opts.context,
      signal: opts.signal,
    });
    return observable$.subscribe({
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
  }
}
