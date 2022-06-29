import {
  AnyRouter,
  ClientDataTransformerOptions,
  DataTransformer,
  ProcedureOptions,
  ProcedureType,
  inferHandlerInput,
  inferProcedureInput,
  inferProcedureOutput,
  inferSubscriptionOutput,
} from '@trpc/server';
import {
  Observer,
  Unsubscribable,
  inferObservableValue,
  observableToPromise,
  share,
} from '@trpc/server/observable';
import { TRPCResultMessage } from '@trpc/server/rpc';
import { CancelFn } from '..';
import { TRPCClientError } from '../TRPCClientError';
import { getFetch } from '../getFetch';
import { httpBatchLink } from '../links';
import { createChain } from '../links/internals/createChain';
import { HTTP_METHODS } from '../links/internals/httpUtils';
import {
  transformOperationResult,
  transformSubscriptionOperationResult,
} from '../links/internals/transformOperationResult';
import {
  HTTPHeaders,
  OperationContext,
  OperationLink,
  OperationMethod,
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

function createRouterProxy(callback: (...args: [string, ...unknown[]]) => any) {
  return new Proxy({} as any, {
    get(_, path: string) {
      return (...args: unknown[]) => callback(path, ...args);
    },
  });
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

/** @internal */
export type CreateTRPCClientOptions<TRouter extends AnyRouter> =
  | CreateTRPCClientWithURLOptions
  | CreateTRPCClientWithLinksOptions<TRouter>;
export class TRPCClient<TRouter extends AnyRouter> {
  private readonly links: OperationLink<TRouter>[];
  public readonly runtime: TRPCClientRuntime;
  public readonly queries: TRouter['queries'];
  public readonly mutations: TRouter['mutations'];

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

    this.queries = createRouterProxy((path, ...args) =>
      this.query(path, ...(args as any)),
    );
    this.mutations = createRouterProxy((path, ...args) =>
      this.mutation(path, ...(args as any)),
    );
  }

  private $request<TInput = unknown, TOutput = unknown>({
    type,
    method,
    input,
    path,
    context = {},
  }: {
    type: ProcedureType;
    method: OperationMethod | undefined;
    input: TInput;
    path: string;
    context?: OperationContext;
  }) {
    const chain$ = createChain<TRouter, TInput, TOutput>({
      links: this.links as OperationLink<any, any, any>[],
      op: {
        id: getRequestId(),
        type,
        method,
        path,
        input,
        context,
      },
    });
    return chain$.pipe(share());
  }
  private requestAsPromise<TInput = unknown, TOutput = unknown>(opts: {
    type: ProcedureType;
    method: OperationMethod;
    input: TInput;
    path: string;
    context?: OperationContext;
  }): CancellablePromise<TOutput> {
    const observable$ = this.$request<TInput, TOutput>(opts);
    type TValue = inferObservableValue<typeof observable$>;
    const { promise, abort } = observableToPromise<TValue>(observable$);

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
    TQueries extends TRouter['_def']['queries'],
    TPath extends string & keyof TQueries,
  >(path: TPath, ...args: inferHandlerInput<TQueries[TPath]>) {
    const opts = args[1];
    const { context, method } = opts || {};
    return this.requestAsPromise<
      inferHandlerInput<TQueries[TPath]>,
      inferProcedureOutput<TQueries[TPath]>
    >({
      type: 'query',
      method: method ?? HTTP_METHODS['query'],
      path,
      input: args[0] as any,
      context,
    });
  }

  public mutation<
    TMutations extends TRouter['_def']['mutations'],
    TPath extends string & keyof TMutations,
  >(path: TPath, ...args: inferHandlerInput<TMutations[TPath]>) {
    const opts = args[1];
    const { context, method } = opts || {};
    return this.requestAsPromise<
      inferHandlerInput<TMutations[TPath]>,
      inferProcedureOutput<TMutations[TPath]>
    >({
      type: 'mutation',
      method: method ?? HTTP_METHODS['mutation'],
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
    opts: Omit<ProcedureOptions, 'method'> &
      Partial<Observer<TRPCResultMessage<TOutput>, TRPCClientError<TRouter>>>,
  ): Unsubscribable {
    const { context } = opts;
    const observable$ = this.$request<TInput, TOutput>({
      type: 'subscription',
      method: undefined,
      path,
      input,
      context,
    });
    const runtime = this.runtime;
    return observable$.subscribe({
      next(result) {
        const transformed = transformSubscriptionOperationResult(
          result,
          runtime,
        );
        if (transformed.ok) {
          opts.next?.(transformed.data);
          return;
        }
        opts.error?.(transformed.error);
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
