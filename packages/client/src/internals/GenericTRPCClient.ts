import {
  AnyRouter,
  ClientDataTransformerOptions,
  CombinedDataTransformer,
  DataTransformer,
  DataTransformerOptions,
  DefaultDataTransformer,
} from '@trpc/server';
import {
  Unsubscribable,
  inferObservableValue,
  observableToPromise,
  share,
} from '@trpc/server/observable';
import { TRPCClientError } from '../TRPCClientError';
import { createChain } from '../links/internals/createChain';
import {
  OperationContext,
  OperationLink,
  TRPCClientRuntime,
  TRPCLink,
} from '../links/types';

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
        transformer?: ClientDataTransformerOptions;
      };

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
  | CreateTRPCClientBaseOptions<TRouter> & {
      links: TRPCLink<TRouter>[];
    };

export class GenericTRPCClient<TRouter extends AnyRouter> {
  private readonly links: OperationLink<AnyRouter>[];
  public readonly runtime: TRPCClientRuntime;
  private requestId: number;

  constructor(opts: CreateTRPCClientOptions<TRouter>) {
    this.requestId = 0;

    function getTransformer(): DataTransformer {
      if (!opts.transformer || typeof opts.transformer === 'string')
        return {
          serialize: (data) => data,
          deserialize: (data) => data,
        };
      // Type guard for `opts.transformer` because it can be `any`
      function isTransformer(obj: any): obj is ClientDataTransformerOptions {
        return true;
      }
      if (isTransformer(opts.transformer)) {
        if ('input' in opts.transformer)
          return {
            serialize: opts.transformer.input.serialize,
            deserialize: opts.transformer.output.deserialize,
          };
      }
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
  public query(path: string, input?: unknown, opts?: TRPCRequestOptions) {
    return this.requestAsPromise<unknown, any>({
      type: 'query',
      path,
      input,
      context: opts?.context,
      signal: opts?.signal,
    });
  }
  public mutation(path: string, input?: unknown, opts?: TRPCRequestOptions) {
    return this.requestAsPromise<unknown, any>({
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
