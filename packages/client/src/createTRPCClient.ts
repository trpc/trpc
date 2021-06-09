/* eslint-disable @typescript-eslint/no-explicit-any */
import type {
  AnyRouter,
  ClientDataTransformerOptions,
  DataTransformer,
  HTTPErrorResponseEnvelope,
  HTTPSuccessResponseEnvelope,
  inferHandlerInput,
  inferProcedureInput,
  inferProcedureOutput,
  inferSubscriptionOutput,
  Maybe,
} from '@trpc/server';
import { getAbortController, getFetch } from './internals/fetchHelpers';
import {
  CancelFn,
  LinkRuntimeOptions,
  OperationContext,
  OperationLink,
  TRPCLink,
} from './links/core';
import { executeChain } from './internals/executeChain';
import { httpLink } from './links/httpLink';

type CancellablePromise<T = unknown> = Promise<T> & {
  cancel: CancelFn;
};

/* istanbul ignore next */
const retryDelay = (attemptIndex: number) =>
  attemptIndex === 0 ? 0 : Math.min(1000 * 2 ** attemptIndex, 30000);

export class TRPCClientError<TRouter extends AnyRouter> extends Error {
  public readonly json?: Maybe<HTTPErrorResponseEnvelope<TRouter>>;
  /**
   * @deprecated will always be `undefined` and will be removed in next major
   */
  public readonly res?: Maybe<Response>;
  public readonly originalError?: Maybe<Error>;
  public readonly shape?: HTTPErrorResponseEnvelope<TRouter>['error'];

  constructor(
    message: string,
    {
      json,
      originalError,
    }: {
      json?: Maybe<HTTPErrorResponseEnvelope<TRouter>>;
      originalError?: Maybe<Error>;
    },
  ) {
    super(message);
    this.message = message;
    this.json = json;
    this.originalError = originalError;
    this.shape = this.json?.error;

    Object.setPrototypeOf(this, TRPCClientError.prototype);
  }
}

export interface FetchOptions {
  fetch?: typeof fetch;
  AbortController?: typeof AbortController;
}

export type CreateTRPCClientOptions<TRouter extends AnyRouter> = {
  /**
   * @deprecated likely to be removed
   */
  onSuccess?: (data: HTTPSuccessResponseEnvelope<unknown>) => void;
  /**
   * @deprecated likely to be removed
   */
  onError?: (error: TRPCClientError<TRouter>) => void;
  /**
   * add ponyfills for fetch / abortcontroller
   */
  fetchOpts?: FetchOptions;
  /**
   * @deprecated use `headers` instead
   */
  getHeaders?: () => Record<string, string | string[] | undefined>;
  headers?:
    | LinkRuntimeOptions['headers']
    | ReturnType<LinkRuntimeOptions['headers']>;
  transformer?: ClientDataTransformerOptions;
} & (
  | {
      url: string;
    }
  | {
      links: TRPCLink[];
    }
);
type TRPCType = 'subscription' | 'query' | 'mutation';

export type RequestOptions = {
  context?: OperationContext;
};
export class TRPCClient<TRouter extends AnyRouter> {
  private readonly links: OperationLink[];
  /**
   * @deprecated use `runtime` instead
   */
  public readonly transformer: DataTransformer;
  private opts: CreateTRPCClientOptions<TRouter>;
  public readonly runtime: LinkRuntimeOptions;

  constructor(opts: CreateTRPCClientOptions<TRouter>) {
    this.opts = opts;
    const transformer: DataTransformer = (this.transformer = opts.transformer
      ? 'input' in opts.transformer
        ? {
            serialize: opts.transformer.input.serialize,
            deserialize: opts.transformer.output.deserialize,
          }
        : opts.transformer
      : {
          serialize: (data) => data,
          deserialize: (data) => data,
        });

    const _fetch = getFetch(opts.fetchOpts?.fetch);
    const AC = getAbortController(opts.fetchOpts?.AbortController);

    function getHeadersFn(): LinkRuntimeOptions['headers'] {
      if (opts.headers) {
        const headers = opts.headers;
        return typeof headers === 'function' ? headers : () => headers;
      }
      if (opts.getHeaders) {
        return opts.getHeaders;
      }
      return () => ({});
    }
    this.runtime = {
      transformer,
      AbortController: AC as any,
      fetch: _fetch as any,
      headers: getHeadersFn(),
    };

    if ('links' in opts) {
      this.opts = opts;
      this.links = opts.links.map((link) => link(this.runtime));
    } else {
      this.links = [
        httpLink({
          url: opts.url,
        })(this.runtime),
      ];
    }
  }

  public request({
    type,
    input,
    path,
    context = {},
  }: {
    type: TRPCType;
    input: unknown;
    path: string;
    context?: OperationContext;
  }) {
    const $result = executeChain({
      links: this.links,
      op: {
        type,
        path,
        input,
        context,
      },
    });

    const promise: Partial<CancellablePromise> = new Promise(
      (resolve, reject) => {
        $result.subscribe((result) => {
          if (result instanceof Error || !result.ok) {
            const error =
              result instanceof Error
                ? result
                : new TRPCClientError(result.error.message, {
                    json: result,
                  });

            reject(error);
            this.opts.onError?.(error);
          } else {
            this.opts.onSuccess?.(result);
            resolve(result.data);
          }
          $result.destroy();
        });
      },
    );

    promise.cancel = () => {
      $result.destroy();
    };
    return promise as any;
  }
  public query<
    TQueries extends TRouter['_def']['queries'],
    TPath extends string & keyof TQueries,
  >(
    path: TPath,
    ...args: [...inferHandlerInput<TQueries[TPath]>, RequestOptions?]
  ): CancellablePromise<inferProcedureOutput<TQueries[TPath]>> {
    const context = (args[1] as RequestOptions | undefined)?.context;
    return this.request({
      type: 'query',
      path,
      input: args[0],
      context,
    });
  }

  public mutation<
    TMutations extends TRouter['_def']['mutations'],
    TPath extends string & keyof TMutations,
  >(
    path: TPath,
    ...args: [...inferHandlerInput<TMutations[TPath]>, RequestOptions?]
  ): CancellablePromise<inferProcedureOutput<TMutations[TPath]>> {
    const context = (args[1] as RequestOptions | undefined)?.context;
    return this.request({
      type: 'mutation',
      path,
      input: args[0],
      context,
    });
  }
  /* istanbul ignore next */
  public subscriptionOnce<
    TSubscriptions extends TRouter['_def']['subscriptions'],
    TPath extends string & keyof TSubscriptions,
    TOutput extends inferSubscriptionOutput<TRouter, TPath>,
    TInput extends inferProcedureInput<TSubscriptions[TPath]>,
  >(
    path: TPath,
    input: TInput,
    opts?: RequestOptions,
  ): CancellablePromise<TOutput[]> {
    let stopped = false;
    let nextTry: any; // setting as `NodeJS.Timeout` causes compat issues, can probably be solved
    let currentRequest: CancellablePromise<TOutput[]> | null = null;
    const context = opts?.context;
    const promise = new Promise<TOutput[]>((resolve, reject) => {
      const exec = async () => {
        if (stopped) {
          return;
        }
        try {
          currentRequest = this.request({
            type: 'subscription',
            input,
            path,
            context,
          });
          const data = await currentRequest;

          resolve(data as any);
        } catch (_err) {
          const err: TRPCClientError<TRouter> = _err;

          if (err.json?.statusCode === 408) {
            // server told us to reconnect
            exec();
          } else {
            reject(err);
          }
        }
      };
      exec();
    }) as CancellablePromise<TOutput[]>;
    promise.cancel = () => {
      stopped = true;
      clearTimeout(nextTry);
      currentRequest?.cancel && currentRequest.cancel();
    };

    return promise as any as CancellablePromise<TOutput[]>;
  }
  /* istanbul ignore next */
  public subscription<
    TSubscriptions extends TRouter['_def']['subscriptions'],
    TPath extends string & keyof TSubscriptions,
    TOutput extends inferSubscriptionOutput<TRouter, TPath>,
    TInput extends inferProcedureInput<TSubscriptions[TPath]>,
  >(
    path: TPath,
    opts: {
      initialInput: TInput;
      onError?: (err: TRPCClientError<TRouter>) => void;
      onData?: (data: TOutput[]) => void;
      /**
       * Input cursor for next call to subscription endpoint
       */
      nextInput: (data: TOutput[]) => TInput;
      context?: OperationContext;
    },
  ): CancelFn {
    let stopped = false;

    // let nextTry: any; // setting as `NodeJS.Timeout` causes compat issues, can probably be solved
    let currentPromise: CancellablePromise<TOutput[]> | null = null;

    let attemptIndex = 0;
    const unsubscribe: CancelFn = () => {
      stopped = true;
      currentPromise?.cancel();
      currentPromise = null;
    };
    const exec = async (input: TInput) => {
      try {
        currentPromise = this.subscriptionOnce(path, input);
        const res = await currentPromise;
        attemptIndex = 0;
        opts.onData && opts.onData(res);

        const nextInput = opts.nextInput(res);
        exec(nextInput);
      } catch (err) {
        if (stopped) {
          return;
        }
        opts.onError && opts.onError(err);
        attemptIndex++;
        setTimeout(() => {
          exec(input);
        }, retryDelay(attemptIndex));
      }
    };
    exec(opts.initialInput);
    return unsubscribe;
  }
}

export function createTRPCClient<TRouter extends AnyRouter>(
  opts: CreateTRPCClientOptions<TRouter>,
) {
  return new TRPCClient<TRouter>(opts);
}
