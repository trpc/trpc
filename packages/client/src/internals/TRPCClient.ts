import {
  AnyRouter,
  ClientDataTransformerOptions,
  DataTransformer,
  inferHandlerInput,
  inferProcedureInput,
  inferProcedureOutput,
  inferSubscriptionOutput,
} from '@trpc/server';
import { TRPCResult } from '@trpc/server/rpc';
import { TRPCClientError } from '../TRPCClientError';
import { getFetch } from '../getFetch';
import {
  CancelFn,
  HTTPHeaders,
  LinkRuntimeOptions,
  OperationContext,
  OperationLink,
  TRPCLink,
} from '../links/core';
import { httpBatchLink } from '../links/httpBatchLink';
import { TRPCAbortError } from './TRPCAbortError';
import { executeChain } from './executeChain';
import { getAbortController } from './fetchHelpers';
import { ObservableCallbacks, UnsubscribeFn } from './observable';

type CancellablePromise<T = unknown> = Promise<T> & {
  cancel: CancelFn;
};

/**
 * @deprecated no longer used
 */
export interface FetchOptions {
  fetch?: typeof fetch;
  AbortController?: typeof AbortController;
}
let idCounter = 0;
function getRequestId() {
  return ++idCounter;
}

export type CreateTRPCClientOptions<TRouter extends AnyRouter> = {
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
} & (
  | {
      /**
       * HTTP URL of API
       **/
      url: string;
    }
  | {
      /**
       * @link https://trpc.io/docs/links
       **/
      links: TRPCLink<TRouter>[];
    }
);
type TRPCType = 'subscription' | 'query' | 'mutation';
export interface TRPCRequestOptions {
  /**
   * Pass additional context to links
   */
  context?: OperationContext;
}
export class TRPCClient<TRouter extends AnyRouter> {
  private readonly links: OperationLink<TRouter>[];
  public readonly runtime: LinkRuntimeOptions;

  constructor(opts: CreateTRPCClientOptions<TRouter>) {
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

    const _fetch = getFetch(opts?.fetch);
    const AC = getAbortController(opts?.AbortController);

    function getHeadersFn(): LinkRuntimeOptions['headers'] {
      if (opts.headers) {
        const headers = opts.headers;
        return typeof headers === 'function' ? headers : () => headers;
      }
      return () => ({});
    }
    this.runtime = {
      transformer,
      AbortController: AC as any,
      fetch: _fetch,
      headers: getHeadersFn(),
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
    const $result = executeChain<TRouter, TInput, TOutput>({
      links: this.links as any,
      op: {
        id: getRequestId(),
        type,
        path,
        input,
        context,
      },
    });

    return $result;
  }
  private requestAsPromise<TInput = unknown, TOutput = unknown>(opts: {
    type: TRPCType;
    input: TInput;
    path: string;
    context?: OperationContext;
  }): CancellablePromise<TOutput> {
    const $result = this.$request<TInput, TOutput>(opts);

    const promise = new Promise<TOutput>((resolve, reject) => {
      const res = $result.get();
      if (res?.type === 'data') {
        resolve(res.data);
        $result.done();
        return;
      }
      $result.subscribe({
        onNext: (result) => {
          if (result?.type !== 'data') {
            return;
          }
          resolve(result.data);

          $result.done();
        },
        onError(err) {
          reject(err);
          $result.done();
        },
        onDone() {
          reject(TRPCClientError.from(new TRPCAbortError()));
        },
      });
    }) as CancellablePromise<TOutput>;
    promise.cancel = () => {
      $result.done();
    };

    return promise;
  }
  public query<
    TQueries extends TRouter['_def']['queries'],
    TPath extends string & keyof TQueries,
  >(
    path: TPath,
    ...args: [...inferHandlerInput<TQueries[TPath]>, TRPCRequestOptions?]
  ) {
    const context = (args[1] as TRPCRequestOptions | undefined)?.context;
    return this.requestAsPromise<
      inferHandlerInput<TQueries[TPath]>,
      inferProcedureOutput<TQueries[TPath]>
    >({
      type: 'query',
      path,
      input: args[0] as any,
      context,
    });
  }

  public mutation<
    TMutations extends TRouter['_def']['mutations'],
    TPath extends string & keyof TMutations,
  >(
    path: TPath,
    ...args: [...inferHandlerInput<TMutations[TPath]>, TRPCRequestOptions?]
  ) {
    const context = (args[1] as TRPCRequestOptions | undefined)?.context;
    return this.requestAsPromise<
      inferHandlerInput<TMutations[TPath]>,
      inferProcedureOutput<TMutations[TPath]>
    >({
      type: 'mutation',
      path,
      input: args[0] as any,
      context,
    });
  }
  public subscription<
    TSubscriptions extends TRouter['_def']['subscriptions'],
    TPath extends string & keyof TSubscriptions,
    TOutput extends inferSubscriptionOutput<TRouter, TPath>,
    TInput extends inferProcedureInput<TSubscriptions[TPath]>,
  >(
    path: TPath,
    input: TInput,
    opts: TRPCRequestOptions &
      ObservableCallbacks<TRPCResult<TOutput>, TRPCClientError<TRouter>>,
  ): UnsubscribeFn {
    const $res = this.$request<TInput, TOutput>({
      type: 'subscription',
      path,
      input,
      context: opts.context,
    });
    $res.subscribe({
      onNext(output) {
        if (output) {
          opts.onNext?.(output);
        }
      },
      onError(err) {
        opts.onError?.(err);
      },
      onDone: opts.onDone,
    });
    return () => {
      $res.done();
    };
  }
}
