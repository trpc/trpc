import {
  AnyRouter,
  ClientDataTransformerOptions,
  DataTransformer,
  inferProcedureInput,
  inferProcedureOutput,
  inferSubscriptionOutput,
} from '@trpc/server';
import {
  Unsubscribable,
  inferObservableValue,
  observableToPromise,
  share,
} from '@trpc/server/observable';
import { inferTransformedProcedureOutput } from '@trpc/server/shared';
import { TRPCClientError } from '../TRPCClientError';
import { createChain } from '../links/internals/createChain';
import {
  OperationContext,
  OperationLink,
  TRPCClientRuntime,
  TRPCLink,
} from '../links/types';

interface CreateTRPCClientBaseOptions {
  /**
   * Data transformer
   * @link https://trpc.io/docs/data-transformers
   **/
  transformer?: ClientDataTransformerOptions;
}

type TRPCType = 'subscription' | 'query' | 'mutation';
export interface TRPCRequestOptions {
  /**
   * Pass additional context to links
   */
  context?: OperationContext;
  signal?: AbortSignal;
}

export interface TRPCSubscriptionObserver<TValue, TError> {
  onStarted: () => void;
  onData: (value: TValue) => void;
  onError: (err: TError) => void;
  onStopped: () => void;
  onComplete: () => void;
}

/** @internal */
export type CreateTRPCClientOptions<TRouter extends AnyRouter> =
  | CreateTRPCClientBaseOptions & {
      links: TRPCLink<TRouter>[];
    };

export class TRPCClient<TRouter extends AnyRouter> {
  private readonly links: OperationLink<TRouter>[];
  public readonly runtime: TRPCClientRuntime;
  private requestId: number;

  constructor(opts: CreateTRPCClientOptions<TRouter>) {
    this.requestId = 0;

    function getTransformer(): DataTransformer {
      if (!opts.transformer)
        return {
          serialize: (data) => data,
          deserialize: (data) => data,
        };
      if ('input' in opts.transformer)
        return {
          serialize: opts.transformer.input.serialize,
          deserialize: opts.transformer.output.deserialize,
        };
      return opts.transformer;
    }

    this.runtime = {
      transformer: getTransformer(),
    };
    // Initialize the links
    this.links = opts.links.map((link) => link(this.runtime));
  }

  private $request<TInput = unknown, TOutput = unknown>({
    type,
    input,
    path,
    context = {},
  }: {
    type: TRPCType;
    input: TInput;
    path: string;
    context?: OperationContext;
  }) {
    const chain$ = createChain<TRouter, TInput, TOutput>({
      links: this.links as OperationLink<any, any, any>[],
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
    type: TRPCType;
    input: TInput;
    path: string;
    context?: OperationContext;
    signal?: AbortSignal;
  }): Promise<TOutput> {
    const req$ = this.$request<TInput, TOutput>(opts);
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
  public query<
    TQueries extends TRouter['_def']['queries'],
    TPath extends string & keyof TQueries,
    TInput extends inferProcedureInput<TQueries[TPath]>,
  >(path: TPath, input?: TInput, opts?: TRPCRequestOptions) {
    type TOutput = inferProcedureOutput<TQueries[TPath]>;
    return this.requestAsPromise<TInput, TOutput>({
      type: 'query',
      path,
      input: input as TInput,
      context: opts?.context,
      signal: opts?.signal,
    });
  }
  public mutation<
    TMutations extends TRouter['_def']['mutations'],
    TPath extends string & keyof TMutations,
    TInput extends inferProcedureInput<TMutations[TPath]>,
  >(path: TPath, input?: TInput, opts?: TRPCRequestOptions) {
    type TOutput = inferTransformedProcedureOutput<TMutations[TPath]>;
    return this.requestAsPromise<TInput, TOutput>({
      type: 'mutation',
      path,
      input: input as TInput,
      context: opts?.context,
      signal: opts?.signal,
    });
  }
  public subscription<
    TSubscriptions extends TRouter['_def']['subscriptions'],
    TPath extends string & keyof TSubscriptions,
    // TODO - this should probably be updated to use inferTransformedProcedureOutput but this is only hit for legacy clients
    TOutput extends inferSubscriptionOutput<TRouter, TPath>,
    TInput extends inferProcedureInput<TSubscriptions[TPath]>,
  >(
    path: TPath,
    input: TInput,
    opts: TRPCRequestOptions &
      Partial<TRPCSubscriptionObserver<TOutput, TRPCClientError<TRouter>>>,
  ): Unsubscribable {
    const observable$ = this.$request<TInput, TOutput>({
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
          opts.onData?.((envelope.result as any).data);
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
