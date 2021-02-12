/* eslint-disable @typescript-eslint/no-explicit-any */
import type {
  AnyRouter,
  DataTransformer,
  HTTPResponseEnvelope,
  HTTPSuccessResponseEnvelope,
  inferHandlerFn,
  inferHandlerInput,
  inferRouteInput,
  inferRouteOutput,
  inferSubscriptionOutput,
  Maybe,
} from '@trpc/server';

type CancelFn = () => void;
type CancellablePromise<T = unknown> = Promise<T> & {
  cancel: CancelFn;
};

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
function getAbortController(
  ac?: typeof AbortController,
): Maybe<typeof AbortController> {
  if (ac) {
    return ac;
  }
  if (typeof window !== 'undefined' && window.AbortController) {
    return window.AbortController;
  }
  if (typeof global !== 'undefined' && global.AbortController) {
    return global.AbortController;
  }
  return null;
}
function getFetch(f?: typeof fetch): typeof fetch {
  if (f) {
    return f;
  }
  if (typeof window !== 'undefined' && window.fetch) {
    return window.fetch;
  }
  if (typeof global !== 'undefined' && global.fetch) {
    return global.fetch;
  }

  throw new Error('No fetch implementation found');
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

export class TRPCClient2<TRouter extends AnyRouter<TContext>> {
  private fetch: typeof fetch;
  private AC: ReturnType<typeof getAbortController>;
  private transformer: DataTransformer;
  private opts: CreateTRPCClientOptions;

  constructor(opts: CreateTRPCClientOptions) {
    const { fetchOpts } = opts;
    this.opts = opts;
    this.fetch = getFetch(fetchOpts?.fetch);
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
    TPath extends string & TQueries
  >(
    path: TPath,
    ...args: inferHandlerInput<TQueries, TPath>
  ): CancellablePromise<inferRouteOutput<TQueries[TPath]>> {
    return this.request({
      type: 'query',
      path,
      input: args[0],
    });
  }

  public mutation<
    TMutations extends TRouter['_def']['mutations'],
    TPath extends string & TMutations
  >(
    path: TPath,
    ...args: inferHandlerInput<TMutations, TPath>
  ): CancellablePromise<inferRouteOutput<TMutations[TPath]>> {
    return this.request({
      type: 'mutation',
      path,
      input: args[0],
    });
  }

  public subscriptionOnce<
    TSubscriptions extends TRouter['_def']['subscriptions'],
    TPath extends string & TSubscriptions,
    TOutput extends inferSubscriptionOutput<TRouter, TPath>
  >(
    path: TPath,
    ...args: inferHandlerInput<TSubscriptions, TPath>
  ): CancellablePromise<TOutput[]> {
    const [input] = args;
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
}
// export type TRPCClient2<
//   TRouter extends Router<TContext, TQueries, TMutations, TSubscriptions>,
//   TContext,
//   TQueries extends TRouter['_def']['queries'] = TRouter['_def']['queries'],
//   TMutations extends TRouter['_def']['mutations'] = TRouter['_def']['mutations'],
//   TSubscriptions extends TRouter['_def']['subscriptions'] = TRouter['_def']['subscriptions']
// > = (
//   opts: CreateTRPCClientOptions,
// ) => {
//   request: (opts: {
//     type: TRPCType;
//     input: unknown;
//     path: string;
//   }) => CancellablePromise<any>;
//   mutation: inferHandlerFn<TMutations>;
//   query: inferHandlerFn<TMutations>;
//   subscriptionOnce<
//     TPath extends keyof TSubscriptions & string,
//     TInput extends inferRouteInput<TSubscriptions[TPath]>,
//     TOutput extends inferSubscriptionOutput<TRouter, TPath>
//   >(
//     path: TPath,
//     input: TInput,
//   ): CancellablePromise<TOutput[]>;
//   subscription: <
//     TPath extends keyof TSubscriptions & string,
//     TInput extends inferRouteInput<TSubscriptions[TPath]>,
//     TOutput extends inferSubscriptionOutput<TRouter, TPath>
//   >(
//     path: TPath,
//     opts: {
//       initialInput: TInput;
//       onError?: (err: NextInputError | TRPCClientError) => void;
//       onData?: (data: TOutput[]) => void;
//       /**
//        * Input cursor for next call to subscription endpoint
//        */
//       nextInput: (data: TOutput[]) => TInput;
//     },
//   ) => CancelFn;
//   transformer: DataTransformer;
// };

export function createTRPCClient<TRouter extends AnyRouter>(
  opts: CreateTRPCClientOptions,
) {
  const { fetchOpts, url } = opts;
  const _fetch = getFetch(fetchOpts?.fetch);
  const AC = getAbortController(fetchOpts?.AbortController);
  type TQueries = TRouter['_def']['queries'];
  type TMutations = TRouter['_def']['mutations'];
  type TSubscriptions = TRouter['_def']['subscriptions'];
  const {
    transformer = {
      serialize: (data) => data,
      deserialize: (data) => data,
    },
  } = opts;

  const serializeInput = (input: unknown): unknown =>
    typeof input !== 'undefined' ? transformer.serialize(input) : input;

  async function handleResponse(promise: Promise<Response>) {
    let res: Maybe<Response> = null;
    let json: Maybe<HTTPResponseEnvelope<unknown>> = null;
    try {
      res = await promise;
      const rawJson = await res.json();
      json = transformer.deserialize(rawJson) as HTTPResponseEnvelope<unknown>;

      if (json.ok) {
        opts.onSuccess && opts.onSuccess(json);
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
      opts.onError && opts.onError(err);
      throw err;
    }
  }
  function getHeaders() {
    return {
      'content-type': 'application/json',
      ...(opts.getHeaders ? opts.getHeaders() : {}),
    };
  }

  function request({
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
    const reqOptsMap: Record<TRPCType, () => ReqOpts> = {
      subscription: () => ({
        method: 'PATCH',
        body: JSON.stringify({ input: serializeInput(input) }),
        url: `${url}/${path}`,
      }),
      mutation: () => ({
        method: 'POST',
        body: JSON.stringify({ input: serializeInput(input) }),
        url: `${url}/${path}`,
      }),
      query: () => ({
        method: 'GET',
        url:
          `${url}/${path}` +
          (input != null
            ? `?input=${encodeURIComponent(
                JSON.stringify(serializeInput(input)),
              )}`
            : ''),
      }),
    };

    const reqOptsFn = reqOptsMap[type];
    if (!reqOptsFn) {
      throw new Error(`Unhandled type "${type}"`);
    }
    const ac = AC ? new AC() : null;

    const { url: reqUrl, ...rest } = reqOptsFn();
    const reqOpts = {
      ...rest,
      signal: ac?.signal,
      headers: getHeaders(),
    };
    // console.log('reqOpts', {reqUrl, reqOpts, type, input})
    const promise: CancellablePromise<any> & {
      cancel(): void;
    } = handleResponse(_fetch(reqUrl, reqOpts)) as any;
    promise.cancel = () => {
      ac?.abort();
    };

    return promise;
  }

  const query: inferHandlerFn<TQueries> = async (path, ...args) => {
    return request({
      type: 'query',
      path,
      input: args[0],
    });
  };
  const mutate: inferHandlerFn<TMutations> = async (path, ...args) => {
    return request({
      type: 'mutation',
      path,
      input: args[0],
    });
  };

  function subscriptionOnce<
    TPath extends keyof TSubscriptions & string,
    TInput extends inferRouteInput<TSubscriptions[TPath]>,
    TOutput extends inferSubscriptionOutput<TRouter, TPath>
  >(path: TPath, input: TInput): CancellablePromise<TOutput[]> {
    let stopped = false;
    let nextTry: any; // setting as `NodeJS.Timeout` causes compat issues, can probably be solved
    let currentRequest: ReturnType<typeof request> | null = null;

    const promise = new Promise<TOutput[]>((resolve, reject) => {
      async function exec() {
        if (stopped) {
          return;
        }
        try {
          currentRequest = request({
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
      }
      exec();
    }) as CancellablePromise<TOutput[]>;
    promise.cancel = () => {
      stopped = true;
      clearTimeout(nextTry);
      currentRequest?.cancel && currentRequest.cancel();
    };

    return promise;
  }

  function subscription<
    TPath extends keyof TSubscriptions & string,
    TInput extends inferRouteInput<TSubscriptions[TPath]>,
    TOutput extends inferSubscriptionOutput<TRouter, TPath>
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
  ) {
    let stopped = false;
    // let nextTry: any; // setting as `NodeJS.Timeout` causes compat issues, can probably be solved
    let currentPromise: CancellablePromise<TOutput[]> | null = null;

    let attemptIndex = 0;
    const unsubscribe: CancelFn = () => {
      stopped = true;
      currentPromise?.cancel();
      currentPromise = null;
    };
    async function exec(input: TInput) {
      try {
        currentPromise = subscriptionOnce(path, input);
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
    }
    exec(opts.initialInput);
    return unsubscribe;
  }

  return {
    request,
    query,
    mutate,
    subscriptionOnce,
    subscription,
    transformer,
  };
}

export type TRPCClient = ReturnType<typeof createTRPCClient>;
