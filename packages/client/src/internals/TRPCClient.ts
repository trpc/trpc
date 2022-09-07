import {
  AnyRouter,
  ClientDataTransformerOptions,
  DataTransformer,
  inferProcedureInput,
  inferProcedureOutput,
  inferSubscriptionOutput,
} from '@trpc/server';
import { ProcedureRecord } from '@trpc/server';
import {
  Unsubscribable,
  inferObservableValue,
  observableToPromise,
  share,
} from '@trpc/server/observable';
import { TRPCClientError } from '../TRPCClientError';
import { getFetch } from '../getFetch';
import { httpBatchLink } from '../links';
import { createChain } from '../links/internals/createChain';
import {
  HTTPHeaders,
  OperationContext,
  OperationLink,
  TRPCClientRuntime,
  TRPCLink,
} from '../links/types';
import { getAbortController } from './fetchHelpers';

interface CreateTRPCClientBaseOptions {
  /**
   * Add ponyfill for fetch
   */
  fetch?: typeof fetch;
  /**
   * add polyfill for AbortController
   */
  AbortController?: typeof AbortController;
  /**
   * headers to be set on outgoing requests / callback that of said headers
   */
  headers?: HTTPHeaders | (() => HTTPHeaders | Promise<HTTPHeaders>);
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

/**
 * This type prohibits `url` from being provided along with `links`
 * @internal
 */
export type CreateTRPCClientOptions<TRouter extends AnyRouter> =
  | CreateTRPCClientBaseOptions &
      (
        | {
            links: TRPCLink<TRouter>[];
          }
        | {
            url: string;
            links?: never;
          }
      );

export type AssertType<T, K> = T extends K ? T : never;
/**
 * @deprecated
 */
export type AssertLegacyDef<TRouter extends AnyRouter> =
  TRouter['_def']['legacy'] extends Record<
    'subscriptions' | 'queries' | 'mutations',
    ProcedureRecord
  >
    ? TRouter['_def']['legacy']
    : {
        subscriptions: {};
        queries: {};
        mutations: {};
      };

export class TRPCClient<TRouter extends AnyRouter> {
  private readonly links: OperationLink<TRouter>[];
  public readonly runtime: TRPCClientRuntime;
  private requestId: number;
  private getRequestId() {
    return ++this.requestId;
  }

  constructor(opts: CreateTRPCClientOptions<TRouter>) {
    const _fetch = getFetch(opts?.fetch);
    const AC = getAbortController(opts?.AbortController);
    this.requestId = 0;

    function getHeadersFn(): TRPCClientRuntime['headers'] {
      if (opts.headers) {
        const headers = opts.headers;
        return typeof headers === 'function' ? headers : () => headers;
      }
      return () => ({});
    }

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
      AbortController: AC,
      fetch: _fetch,
      headers: getHeadersFn(),
      transformer: getTransformer(),
    };

    const getLinks = (): OperationLink<TRouter>[] => {
      if (opts.links) {
        return opts.links.map((link) => link(this.runtime));
      }
      return [httpBatchLink({ url: opts.url })(this.runtime)];
    };

    this.links = getLinks();
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
        id: this.getRequestId(),
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
    TQueries extends AssertLegacyDef<TRouter>['queries'],
    TPath extends string & keyof TQueries,
    TInput extends inferProcedureInput<
      AssertType<TQueries, ProcedureRecord>[TPath]
    >,
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
    TMutations extends AssertLegacyDef<TRouter>['mutations'],
    TPath extends string & keyof TMutations,
    TInput extends inferProcedureInput<
      AssertType<TMutations, ProcedureRecord>[TPath]
    >,
  >(path: TPath, input?: TInput, opts?: TRPCRequestOptions) {
    type TOutput = inferProcedureOutput<TMutations[TPath]>;
    return this.requestAsPromise<TInput, TOutput>({
      type: 'mutation',
      path,
      input: input as TInput,
      context: opts?.context,
      signal: opts?.signal,
    });
  }
  public subscription<
    TSubscriptions extends AssertLegacyDef<TRouter>['subscriptions'],
    TPath extends string & keyof TSubscriptions,
    TOutput extends inferSubscriptionOutput<TRouter, TPath>,
    TInput extends inferProcedureInput<
      AssertType<TSubscriptions, ProcedureRecord>[TPath]
    >,
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
