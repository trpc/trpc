/* eslint-disable @typescript-eslint/no-explicit-any */
import type {
  AnyRouter,
  DataTransformer,
  HTTPResponseEnvelope,
  HTTPSuccessResponseEnvelope,
  inferHandlerInput,
  inferProcedureInput,
  inferProcedureOutput,
  inferSubscriptionOutput,
  Maybe,
} from '@trpc/server';
import { getAbortController, getFetch } from './helpers';

type CancelFn = () => void;
type CancellablePromise<T = unknown> = Promise<T> & {
  cancel: CancelFn;
};

/* istanbul ignore next */
const retryDelay = (attemptIndex: number) =>
  attemptIndex === 0 ? 0 : Math.min(1000 * 2 ** attemptIndex, 30000);

export class TRPCClientError extends Error {
  public readonly json?: Maybe<HTTPResponseEnvelope<unknown>>;
  public readonly res?: Maybe<Response>;
  public readonly originalError?: Maybe<Error>;

  constructor(
    message: string,
    {
      res,
      json,
      originalError,
    }: {
      res?: Maybe<Response>;
      json?: Maybe<HTTPResponseEnvelope<unknown>>;
      originalError?: Maybe<Error>;
    },
  ) {
    super(message);
    this.message = message;
    this.res = res;
    this.json = json;
    this.originalError = originalError;

    Object.setPrototypeOf(this, TRPCClientError.prototype);
  }
}

/* istanbul ignore next */
export class NextInputError extends Error {
  public readonly originalError: Error;

  constructor(originalError: Error) {
    super(
      `nextInput() threw an error - subscription is stopped: ${originalError.message}`,
    );
    this.originalError = originalError;

    Object.setPrototypeOf(this, NextInputError.prototype);
  }
}

export interface FetchOptions {
  fetch?: typeof fetch;
  AbortController?: typeof AbortController;
}

export interface CreateTRPCClientOptions {
  url: string;
  fetchOpts?: FetchOptions;
  getHeaders?: () => Record<string, string | undefined>;
  onSuccess?: (data: HTTPSuccessResponseEnvelope<unknown>) => void;
  onError?: (error: TRPCClientError) => void;
  transformer?: DataTransformer;
}
type TRPCType = 'subscription' | 'query' | 'mutation';

export class TRPCClient<TRouter extends AnyRouter> {
  private fetch: typeof fetch;
  private AC: ReturnType<typeof getAbortController>;
  public readonly transformer: DataTransformer;
  private opts: CreateTRPCClientOptions;

  constructor(opts: CreateTRPCClientOptions) {
    const { fetchOpts } = opts;
    this.opts = opts;
    const _fetch = getFetch(fetchOpts?.fetch);
    this.fetch = (...args) => _fetch(...args);
    this.AC = getAbortController(fetchOpts?.AbortController);
    this.transformer = opts.transformer ?? {
      serialize: (data) => data,
      deserialize: (data) => data,
    };
  }

  private serializeInput(input: unknown) {
    return typeof input !== 'undefined'
      ? this.transformer.serialize(input)
      : input;
  }
  private async handleResponse(promise: Promise<Response>) {
    let res: Maybe<Response> = null;
    let json: Maybe<HTTPResponseEnvelope<unknown>> = null;
    try {
      res = await promise;
      const rawJson = await res.json();
      json = this.transformer.deserialize(
        rawJson,
      ) as HTTPResponseEnvelope<unknown>;

      if (json.ok) {
        this.opts.onSuccess && this.opts.onSuccess(json);
        return json.data as any;
      }
      throw new TRPCClientError(json.error.message, { json, res });
    } catch (originalError) {
      let err: TRPCClientError = originalError;
      if (!(err instanceof TRPCClientError)) {
        err = new TRPCClientError(originalError.message, {
          originalError,
          res,
          json,
        });
      }
      this.opts.onError && this.opts.onError(err);
      throw err;
    }
  }
  private getHeaders() {
    return {
      'content-type': 'application/json',
      ...(this.opts.getHeaders ? this.opts.getHeaders() : {}),
    };
  }

  public request({
    type,
    input,
    path,
  }: {
    type: TRPCType;
    input: unknown;
    path: string;
  }) {
    type ReqOpts = {
      method: string;
      body?: string;
      url: string;
    };
    const { url } = this.opts;
    const reqOptsMap: Record<TRPCType, () => ReqOpts> = {
      subscription: () => ({
        method: 'PATCH',
        body: JSON.stringify({ input: this.serializeInput(input) }),
        url: `${url}/${path}`,
      }),
      mutation: () => ({
        method: 'POST',
        body: JSON.stringify({ input: this.serializeInput(input) }),
        url: `${url}/${path}`,
      }),
      query: () => ({
        method: 'GET',
        url:
          `${url}/${path}` +
          (input != null
            ? `?input=${encodeURIComponent(
                JSON.stringify(this.serializeInput(input)),
              )}`
            : ''),
      }),
    };

    const reqOptsFn = reqOptsMap[type];
    /* istanbul ignore next */
    if (!reqOptsFn) {
      throw new Error(`Unhandled type "${type}"`);
    }
    const ac = this.AC ? new this.AC() : null;

    const { url: reqUrl, ...rest } = reqOptsFn();
    const reqOpts = {
      ...rest,
      signal: ac?.signal,
      headers: this.getHeaders(),
    };
    // console.log('reqOpts', {reqUrl, reqOpts, type, input})
    const promise: CancellablePromise<any> & {
      cancel(): void;
    } = this.handleResponse(this.fetch(reqUrl, reqOpts)) as any;
    promise.cancel = () => {
      ac?.abort();
    };

    return promise;
  }
  public query<
    TQueries extends TRouter['_def']['queries'],
    TPath extends string & keyof TQueries
  >(
    path: TPath,
    ...args: inferHandlerInput<TQueries[TPath]>
  ): CancellablePromise<inferProcedureOutput<TQueries[TPath]>> {
    return this.request({
      type: 'query',
      path,
      input: args[0],
    });
  }

  public mutation<
    TMutations extends TRouter['_def']['mutations'],
    TPath extends string & keyof TMutations
  >(
    path: TPath,
    ...args: inferHandlerInput<TMutations[TPath]>
  ): CancellablePromise<inferProcedureOutput<TMutations[TPath]>> {
    return this.request({
      type: 'mutation',
      path,
      input: args[0],
    });
  }
  /* istanbul ignore next */
  public subscriptionOnce<
    TSubscriptions extends TRouter['_def']['subscriptions'],
    TPath extends string & keyof TSubscriptions,
    TOutput extends inferSubscriptionOutput<TRouter, TPath>,
    TInput extends inferProcedureInput<TSubscriptions[TPath]>
  >(path: TPath, input: TInput): CancellablePromise<TOutput[]> {
    let stopped = false;
    let nextTry: any; // setting as `NodeJS.Timeout` causes compat issues, can probably be solved
    let currentRequest: CancellablePromise<TOutput[]> | null = null;

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
          });
          const data = await currentRequest;
          // console.log('response', { path, input, data });
          resolve(data);
        } catch (_err) {
          const err: TRPCClientError = _err;

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

    return (promise as any) as CancellablePromise<TOutput[]>;
  }
  /* istanbul ignore next */
  public subscription<
    TSubscriptions extends TRouter['_def']['subscriptions'],
    TPath extends string & keyof TSubscriptions,
    TOutput extends inferSubscriptionOutput<TRouter, TPath>,
    TInput extends inferProcedureInput<TSubscriptions[TPath]>
  >(
    path: TPath,
    opts: {
      initialInput: TInput;
      onError?: (err: NextInputError | TRPCClientError) => void;
      onData?: (data: TOutput[]) => void;
      /**
       * Input cursor for next call to subscription endpoint
       */
      nextInput: (data: TOutput[]) => TInput;
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

        try {
          const nextInput = opts.nextInput(res);
          exec(nextInput);
        } catch (_err) {
          const err = new NextInputError(_err);
          opts.onError && opts.onError(err);
          unsubscribe();
          return;
        }
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
  opts: CreateTRPCClientOptions,
) {
  return new TRPCClient<TRouter>(opts);
}
