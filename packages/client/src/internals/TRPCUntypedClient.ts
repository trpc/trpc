import {
  AnyRouter,
  ClientDataTransformerOptions,
  CombinedDataTransformer,
  DataTransformerOptions,
  DefaultDataTransformer,
} from '@trpc/server';
import {
  inferObservableValue,
  observableToPromise,
  share,
  Unsubscribable,
} from '@trpc/server/observable';
import { createChain } from '../links/internals/createChain';
import {
  OperationContext,
  OperationLink,
  TRPCClientRuntime,
  TRPCLink,
} from '../links/types';
import { TRPCClientError } from '../TRPCClientError';

type CreateTRPCClientBaseOptions<TRouter extends AnyRouter> =
  TRouter['_def']['_config']['transformer'] extends DefaultDataTransformer
  ? {
    /**
     * Data transformer
     *
     * You must use the same transformer on the backend and frontend
     * @link https://trpc.io/docs/data-transformers
     **/
    transformer?: 'You must set a transformer on the backend router';
  }
  : TRouter['_def']['_config']['transformer'] extends DataTransformerOptions
  ? {
    /**
     * Data transformer
     *
     * You must use the same transformer on the backend and frontend
     * @link https://trpc.io/docs/data-transformers
     **/
    transformer: TRouter['_def']['_config']['transformer'] extends CombinedDataTransformer
    ? DataTransformerOptions
    : TRouter['_def']['_config']['transformer'];
  }
  : {
    /**
     * Data transformer
     *
     * You must use the same transformer on the backend and frontend
     * @link https://trpc.io/docs/data-transformers
     **/
    transformer?:
    | /** @deprecated **/ ClientDataTransformerOptions
    | CombinedDataTransformer;
  };

type TRPCType = 'subscription' | 'query' | 'mutation' | 'queryGenerator' | "mutationGenerator";
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
  | CreateTRPCClientBaseOptions<TRouter> & {
    links: TRPCLink<TRouter>[];
  };

/** @internal */
export type UntypedClientProperties =
  | 'links'
  | 'runtime'
  | 'requestId'
  | '$request'
  | 'requestAsPromise'
  | 'query'
  | 'mutation'
  | 'subscription';

type RecursivePromise<TType> = Promise<{ value?: TType, next: RecursivePromise<TType> | null }>;

export class TRPCUntypedClient<TRouter extends AnyRouter> {
  private readonly links: OperationLink<AnyRouter>[];
  public readonly runtime: TRPCClientRuntime;
  private requestId: number;

  constructor(opts: CreateTRPCClientOptions<TRouter>) {
    this.requestId = 0;

    const combinedTransformer: CombinedDataTransformer = (() => {
      const transformer = opts.transformer as
        | DataTransformerOptions
        | undefined;

      if (!transformer) {
        return {
          input: {
            serialize: (data) => data,
            deserialize: (data) => data,
          },
          output: {
            serialize: (data) => data,
            deserialize: (data) => data,
          },
        };
      }
      if ('input' in transformer) {
        return opts.transformer as CombinedDataTransformer;
      }
      return {
        input: transformer,
        output: transformer,
      };
    })();

    this.runtime = {
      transformer: {
        serialize: (data) => combinedTransformer.input.serialize(data),
        deserialize: (data) => combinedTransformer.output.deserialize(data),
      },
      combinedTransformer,
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
    const chain$ = createChain<AnyRouter, TInput, TOutput>({
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



  private async * requestAsAsyncGenerator<TInput = unknown, TOutput = unknown>(opts: {
    type: TRPCType;
    input: TInput;
    path: string;
    context?: OperationContext;
    signal?: AbortSignal;
  }): AsyncGenerator<TOutput> {
    const req$ = this.$request<TInput, TOutput>(opts);

    let resolveNext: (value: {
      value?: TOutput;
      next: RecursivePromise<TOutput> | null;
    } | PromiseLike<{
      value?: TOutput;
      next: RecursivePromise<TOutput> | null;
    }>) => void;

    let rejectNext: (reason?: any) => void;
    let promise: RecursivePromise<TOutput> = new Promise((resolve, reject) => {
      resolveNext = resolve;
      rejectNext = reject;
    });

    const unsubscribe = req$.subscribe({
      next: value => {
        // eslint-disable-next-line no-console
        let resolveNextNext: typeof resolveNext | undefined;
        let rejectNextNext: typeof rejectNext | undefined;

        promise = new Promise((resolve, reject) => {
          resolveNextNext = resolve;
          rejectNextNext = reject;
        })

        if (value.result.type === 'data') {
          resolveNext?.({
            value: value.result.data,
            next: promise
          });

          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          resolveNext = resolveNextNext!;
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          rejectNext = rejectNextNext!;
        }
      },
      error: err => {
        rejectNext(err);
      },
      complete: () => {
        resolveNext?.({
          value: undefined,
          next: null
        });  // signal that the subscribable has completed
      }
    });

    try {
      let currentPromise: RecursivePromise<TOutput> = promise;
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      while (true) {
        const { value, next } = await currentPromise;
        if (value === undefined)
          break;

        yield value;

        if (next)
          currentPromise = next;
        else
          break
      }
    } finally {
      unsubscribe.unsubscribe();
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
  public queryGenerator(path: string, input?: unknown, opts?: TRPCRequestOptions) {
    return this.requestAsAsyncGenerator<unknown, unknown>({
      type: 'queryGenerator',
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
  public mutationGenerator(path: string, input?: unknown, opts?: TRPCRequestOptions) {
    return this.requestAsAsyncGenerator<unknown, unknown>({
      type: 'mutationGenerator',
      path,
      input,
      context: opts?.context,
      signal: opts?.signal,
    });
  }
  public subscription(
    path: string,
    input: unknown,
    opts: TRPCRequestOptions &
      Partial<TRPCSubscriptionObserver<unknown, TRPCClientError<AnyRouter>>>,
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
