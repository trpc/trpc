import type {
  inferObservableValue,
  Unsubscribable,
} from '@trpc/server/observable';
import { observableToPromise, share } from '@trpc/server/observable';
import type {
  AnyRouter,
  InferrableClientTypes,
  ProcedureType,
  TypeError,
} from '@trpc/server/unstable-core-do-not-import';
import type { TRPCDecoratedClientOptions } from '../createTRPCClientOptions';
import { createChain } from '../links/internals/createChain';
import type {
  OperationContext,
  OperationLink,
  TRPCClientRuntime,
  TRPCLink,
  TRPCLinkDecoration,
  TRPCRequestOptions,
} from '../links/types';
import { TRPCClientError } from '../TRPCClientError';

export interface TRPCSubscriptionObserver<TValue, TError> {
  onStarted: () => void;
  onData: (value: TValue) => void;
  onError: (err: TError) => void;
  onStopped: () => void;
  onComplete: () => void;
}

/** @internal */
export type CreateTRPCClientOptions<TRoot extends InferrableClientTypes> = {
  links: TRPCLink<TRoot>[];
  transformer?: TypeError<'The transformer property has moved to httpLink/httpBatchLink/wsLink'>;
};

/** @internal */
export type UntypedClientProperties =
  | '$request'
  | 'links'
  | 'mutation'
  | 'query'
  | 'requestAsPromise'
  | 'requestId'
  | 'runtime'
  | 'subscription';

export class TRPCUntypedClient<
  TRoot extends InferrableClientTypes,
  TDecoration extends TRPCLinkDecoration = TRPCLinkDecoration,
> {
  private readonly links: OperationLink<TRoot>[];
  public readonly runtime: TRPCClientRuntime;
  private requestId: number;

  constructor(
    opts:
      | CreateTRPCClientOptions<TRoot>
      | TRPCDecoratedClientOptions<TRoot, TDecoration>,
  ) {
    this.requestId = 0;

    this.runtime = {};

    // Initialize the links
    this.links = opts.links.map((link) => link(this.runtime));
  }

  public $request<TInput = unknown>({
    type,
    input,
    path,
    context = {},
  }: {
    type: ProcedureType;
    input: TInput;
    path: string;
    context?: OperationContext;
  }) {
    const chain$ = createChain<AnyRouter>({
      links: this.links as OperationLink<any>[],
      op: {
        id: ++this.requestId,
        type,
        path,
        input,
        context,
      },
    });
    return chain$.pipe(share());
  }
  private requestAsPromise<TInput = unknown, TOutput = unknown>(opts: {
    type: ProcedureType;
    input: TInput;
    path: string;
    context?: OperationContext;
    signal?: AbortSignal;
  }): Promise<TOutput> {
    const req$ = this.$request<TInput>(opts);
    type TValue = inferObservableValue<typeof req$>;
    const { promise, abort } = observableToPromise<TValue>(req$);

    const abortablePromise = new Promise<TOutput>((resolve, reject) => {
      opts.signal?.addEventListener('abort', abort);

      promise
        .then((envelope) => {
          resolve((envelope.result as any).data);
        })
        .catch((err) => {
          reject(TRPCClientError.from(err));
        });
    });

    return abortablePromise;
  }
  public query(path: string, input?: unknown, opts?: TRPCRequestOptions) {
    return this.requestAsPromise<unknown, unknown>({
      ...opts,
      type: 'query',
      path,
      input,
    });
  }
  public mutation(
    path: string,
    input?: unknown,
    opts?: TRPCRequestOptions<TDecoration, 'mutation'>,
  ) {
    return this.requestAsPromise<unknown, unknown>({
      ...opts,
      type: 'mutation',
      path,
      input,
    });
  }
  public subscription(
    path: string,
    input: unknown,
    opts: Partial<
      TRPCSubscriptionObserver<unknown, TRPCClientError<AnyRouter>> &
        TRPCRequestOptions<TDecoration, 'subscription'>
    >,
  ): Unsubscribable {
    const observable$ = this.$request({
      type: 'subscription',
      path,
      input,
      context: opts?.context,
    });
    return observable$.subscribe({
      next(envelope) {
        if (envelope.result.type === 'started') {
          opts.onStarted?.();
        } else if (envelope.result.type === 'stopped') {
          opts.onStopped?.();
        } else {
          opts.onData?.(envelope.result.data);
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
