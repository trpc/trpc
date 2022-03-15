import {
  AnyRouter,
  inferHandlerInput,
  inferProcedureInput,
  inferProcedureOutput,
  inferSubscriptionOutput,
} from '@trpc/server';
import { TRPCResult } from '@trpc/server/rpc';
import { CancelFn } from '..';
import { getFetch } from '../getFetch';
import { httpBatchLink } from '../links/httpBatchLink';
import { createChain } from '../links/internals/createChain';
import { transformOperationResult } from '../links/internals/transformOperationResult';
import {
  HTTPHeaders,
  LinkRuntime,
  OperationContext,
  OperationLink,
  TRPCLink,
} from '../links/types';
import { Unsubscribable } from '../observable';
import { inferObservableValue } from '../observable/observable';
import { share } from '../observable/operators';
import { Observer } from '../observable/types';
import { observableToPromise } from '../observable/util/observableToPromise';
import { TRPCClientError } from '../TRPCClientError';
import { getAbortController } from './fetchHelpers';

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
   * @link http://localhost:3000/docs/links
   **/
  links: TRPCLink<TRouter>[];
}

type TRPCType = 'subscription' | 'query' | 'mutation';
export interface TRPCRequestOptions {
  /**
   * Pass additional context to links
   */
  context?: OperationContext;
}

/** @internal */
export type CreateTRPCClientOptions<TRouter extends AnyRouter> =
  | CreateTRPCClientWithLinksOptions<TRouter>
  | CreateTRPCClientWithURLOptions;
export class TRPCClient<TRouter extends AnyRouter> {
  private readonly links: OperationLink<TRouter>[];
  public readonly runtime: LinkRuntime;

  constructor(opts: CreateTRPCClientOptions<TRouter>) {
    const _fetch = getFetch(opts?.fetch);
    const AC = getAbortController(opts?.AbortController);

    function getHeadersFn(): LinkRuntime['headers'] {
      if (opts.headers) {
        const headers = opts.headers;
        return typeof headers === 'function' ? headers : () => headers;
      }
      return () => ({});
    }
    this.runtime = {
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
            const transformed = transformOperationResult(result);
            if (transformed.ok) {
              resolve(transformed.data as any);
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
  ): Unsubscribable {
    const observable$ = this.$request<TInput, TOutput>({
      type: 'subscription',
      path,
      input,
      context: opts.context,
    });
    return observable$.subscribe({
      next(result) {
        if ('error' in result.data) {
          const err = TRPCClientError.from(result.data, {
            meta: result.context,
          });

          opts.error?.(err);
          return;
        }
        opts.next?.(result.data.result);
      },
      error(err) {
        opts.error?.(err);
      },
      complete() {
        opts.complete?.();
      },
    });
  }
}
