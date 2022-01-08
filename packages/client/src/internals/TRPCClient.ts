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
import { CancelFn } from '..';
import { getFetch } from '../getFetch';
import {
  createChain,
  HTTPHeaders,
  LinkRuntimeOptions,
  OperationLink,
  OperationMeta,
  transformOperationResult,
  TRPCLink,
} from '../links/core2';
import { httpBatchLink } from '../links/httpBatchLink';
import { inferObservableValue, toPromise } from '../rx/observable';
import { share } from '../rx/operators';
import { Observer } from '../rx/types';
import { TRPCClientError } from '../TRPCClientError';
import { getAbortController } from './fetchHelpers';
import { UnsubscribeFn } from './observable';
import { TRPCAbortError } from './TRPCAbortError';

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
   * @link http://localhost:3000/docs/data-transformers
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
       * @link http://localhost:3000/docs/links
       **/
      links: TRPCLink<TRouter>[];
    }
);
type TRPCType = 'subscription' | 'query' | 'mutation';
export interface TRPCRequestOptions {
  /**
   * Pass additional context to links
   */
  context?: OperationMeta;
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
    context?: OperationMeta;
  }) {
    const chain$ = createChain<TRouter, TInput, TOutput>({
      links: this.links as OperationLink<any, any, any>[],
      op: {
        id: getRequestId(),
        type,
        path,
        input,
        meta: context,
      },
    });
    return chain$.pipe(share());
  }
  private requestAsPromise<TInput = unknown, TOutput = unknown>(opts: {
    type: TRPCType;
    input: TInput;
    path: string;
    context?: OperationMeta;
  }): CancellablePromise<TOutput> {
    const req$ = this.$request<TInput, TOutput>(opts);
    type TValue = inferObservableValue<typeof req$>;
    const { promise, abort } = toPromise<TValue>(req$);
    const cancellablePromise: CancellablePromise<any> = promise.then(
      (result) => {
        if (result === undefined) {
          throw TRPCClientError.from(new TRPCAbortError());
        }

        const transformed = transformOperationResult(result);
        if (transformed.ok) {
          return transformed.data;
        }
        throw transformed.error;
      },
    ) as any;
    cancellablePromise.cancel = abort;

    return cancellablePromise;
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
      Partial<Observer<TRPCResult<TOutput>, TRPCClientError<TRouter>>>,
  ): UnsubscribeFn {
    const observable$ = this.$request<TInput, TOutput>({
      type: 'subscription',
      path,
      input,
      context: opts.context,
    });
    const observer = observable$.subscribe({
      next(result) {
        if ('error' in result.data) {
          const err = TRPCClientError.from(result.data, { meta: result.meta });

          opts.error?.(err);
          return;
        }
        opts.next?.(result.data.result);
      },
      error: opts.error,
      complete: opts.complete,
    });
    return () => {
      observer.unsubscribe();
    };
  }
}
