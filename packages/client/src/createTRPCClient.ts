/* eslint-disable @typescript-eslint/no-explicit-any */
import type {
  AnyRouter,
  ClientDataTransformerOptions,
  DataTransformer,
  inferHandlerInput,
  inferProcedureInput,
  inferProcedureOutput,
  inferSubscriptionOutput,
} from '@trpc/server';
import { TRPCResult } from '@trpc/server/rpc';
import { executeChain } from './internals/executeChain';
import { getAbortController, getFetch } from './internals/fetchHelpers';
import { ObservableCallbacks, UnsubscribeFn } from './internals/observable';
import { TRPCAbortErrorSignal } from './internals/TRPCAbortErrorSignal';
import {
  CancelFn,
  LinkRuntimeOptions,
  OperationContext,
  OperationLink,
  TRPCLink,
} from './links/core';
import { httpLink } from './links/httpLink';
import { TRPCClientError } from './TRPCClientError';

type CancellablePromise<T = unknown> = Promise<T> & {
  cancel: CancelFn;
};

export interface FetchOptions {
  fetch?: typeof fetch;
  AbortController?: typeof AbortController;
}

export type CreateTRPCClientOptions<TRouter extends AnyRouter> = {
  /**
   * add ponyfills for fetch / abortcontroller
   */
  fetchOpts?: FetchOptions;
  headers?:
    | LinkRuntimeOptions['headers']
    | ReturnType<LinkRuntimeOptions['headers']>;
  transformer?: ClientDataTransformerOptions;
} & (
  | {
      url: string;
    }
  | {
      links: TRPCLink<TRouter>[];
    }
);
type TRPCType = 'subscription' | 'query' | 'mutation';

type RequestOptions = {
  context?: OperationContext;
};
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

    const _fetch = getFetch(opts.fetchOpts?.fetch);
    const AC = getAbortController(opts.fetchOpts?.AbortController);

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
      fetch: _fetch as any,
      headers: getHeadersFn(),
    };

    if ('links' in opts) {
      this.links = opts.links.map((link) => link(this.runtime));
    } else {
      this.links = [
        httpLink({
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
          // this is used to bubble up to the ending link
          if (err.originalError?.name !== 'TRPCAbortErrorSignal') {
            reject(err);
            $result.done();
          }
        },
      });
    }) as CancellablePromise<TOutput>;
    promise.cancel = () => {
      $result.error(TRPCClientError.from(new TRPCAbortErrorSignal()));
    };

    return promise;
  }
  public query<
    TQueries extends TRouter['_def']['queries'],
    TPath extends string & keyof TQueries,
  >(
    path: TPath,
    ...args: [...inferHandlerInput<TQueries[TPath]>, RequestOptions?]
  ) {
    const context = (args[1] as RequestOptions | undefined)?.context;
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
    ...args: [...inferHandlerInput<TMutations[TPath]>, RequestOptions?]
  ) {
    const context = (args[1] as RequestOptions | undefined)?.context;
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
    opts: RequestOptions &
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
      onError: opts.onError,
      onDone: opts.onDone,
    });
    return () => {
      $res.error(TRPCClientError.from(new TRPCAbortErrorSignal()));
    };
  }
}

export function createTRPCClient<TRouter extends AnyRouter>(
  opts: CreateTRPCClientOptions<TRouter>,
) {
  return new TRPCClient<TRouter>(opts);
}
