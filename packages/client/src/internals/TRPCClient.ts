import {
  AnyRouter,
  ClientDataTransformerOptions,
  DataTransformer,
  inferHandlerInput,
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
import { CancelFn } from '..';
import { TRPCClientError } from '../TRPCClientError';
import { getFetch } from '../getFetch';
import { httpBatchLink } from '../links';
import { createChain } from '../links/internals/createChain';
import {
  transformOperationResult,
  transformSubscriptionOperationResult,
} from '../links/internals/transformOperationResult';
import {
  HTTPHeaders,
  OperationContext,
  OperationLink,
  TRPCClientRuntime,
  TRPCLink,
} from '../links/types';
import { getAbortController } from './fetchHelpers';

type CancellablePromise<T = unknown> = Promise<T> & {
  cancel: CancelFn;
};

let idCounter = 0;
function getRequestId() {
  return ++idCounter;
}
interface CreateTRPCClientBaseOptions {
  /**
   * Add ponyfill for fetch
   */
  fetch?: typeof fetch;
  /**
   * add ponyfill for AbortController
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

/** @internal */
export interface CreateTRPCClientWithURLOptions
  extends CreateTRPCClientBaseOptions {
  /**
   * HTTP URL of API
   **/
  url: string;
}

/** @internal */
export interface CreateTRPCClientWithLinksOptions<TRouter extends AnyRouter>
  extends CreateTRPCClientBaseOptions {
  /**
   * @link https://trpc.io/docs/links
   **/
  links: TRPCLink<TRouter>[];
}

type TRPCType = 'subscription' | 'query' | 'mutation';
export interface TRPCRequestOptions {
  /**
   * Pass additional context to links
   */
  requestContext?: OperationContext;
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
  | CreateTRPCClientWithLinksOptions<TRouter>
  | CreateTRPCClientWithURLOptions;

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

  constructor(opts: CreateTRPCClientOptions<TRouter>) {
    const _fetch = getFetch(opts?.fetch);
    const AC = getAbortController(opts?.AbortController);

    function getHeadersFn(): TRPCClientRuntime['headers'] {
      if (opts.headers) {
        const headers = opts.headers;
        return typeof headers === 'function' ? headers : () => headers;
      }
      return () => ({});
    }

    const transformer: DataTransformer = opts.transformer
      ? 'input' in opts.transformer
        ? {
            serialize: opts.transformer.input.serialize,
            deserialize: opts.transformer.output.deserialize,
          }
        : opts.transformer
      : {
          serialize: (data) => data,
          deserialize: (data) => data,
        };

    this.runtime = {
      AbortController: AC as any,
      fetch: _fetch,
      headers: getHeadersFn(),
      transformer,
    };

    if ('links' in opts) {
      this.links = opts.links.map((link) => link(this.runtime));
    } else {
      this.links = [
        httpBatchLink({
          url: opts.url,
        })(this.runtime),
      ];
    }
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
        id: getRequestId(),
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
  }): CancellablePromise<TOutput> {
    const req$ = this.$request<TInput, TOutput>(opts);
    type TValue = inferObservableValue<typeof req$>;
    const { promise, abort } = observableToPromise<TValue>(req$);

    const cancellablePromise: CancellablePromise<any> = new Promise<TOutput>(
      (resolve, reject) => {
        promise
          .then((result) => {
            const transformed = transformOperationResult(result, this.runtime);
            if (transformed.ok) {
              resolve(transformed.data);
              return;
            }
            reject(transformed.error);
          })
          .catch((err) => {
            reject(TRPCClientError.from(err));
          });
      },
    ) as any;
    cancellablePromise.cancel = abort;

    return cancellablePromise;
  }
  public query<
    TQueries extends AssertLegacyDef<TRouter>['queries'],
    TPath extends string & keyof TQueries,
  >(
    path: TPath,
    ...args: [
      ...inferHandlerInput<AssertType<TQueries, ProcedureRecord>[TPath]>,
      TRPCRequestOptions?,
    ]
  ) {
    const context = (args[1] as TRPCRequestOptions | undefined)?.requestContext;
    return this.requestAsPromise<
      inferHandlerInput<AssertType<TQueries, ProcedureRecord>[TPath]>,
      inferProcedureOutput<TQueries[TPath]>
    >({
      type: 'query',
      path,
      input: args[0] as any,
      context,
    });
  }
  public mutation<
    TMutations extends AssertLegacyDef<TRouter>['mutations'],
    TPath extends string & keyof TMutations,
  >(
    path: TPath,
    ...args: [
      ...inferHandlerInput<AssertType<TMutations, ProcedureRecord>[TPath]>,
      TRPCRequestOptions?,
    ]
  ) {
    const context = (args[1] as TRPCRequestOptions | undefined)?.requestContext;
    return this.requestAsPromise<
      inferHandlerInput<AssertType<TMutations, ProcedureRecord>[TPath]>,
      inferProcedureOutput<TMutations[TPath]>
    >({
      type: 'mutation',
      path,
      input: args[0] as any,
      context,
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
      context: opts.requestContext,
    });
    const runtime = this.runtime;
    return observable$.subscribe({
      next(result) {
        const transformed = transformSubscriptionOperationResult(
          result,
          runtime,
        );
        if (transformed.ok) {
          if (transformed.data.type === 'started') {
            opts.onStarted?.();
          } else if (transformed.data.type === 'stopped') {
            opts.onStopped?.();
          } else if (transformed.data.type === 'data') {
            opts.onData?.(transformed.data.data);
          }
          return;
        }
        opts.onError?.(transformed.error);
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
