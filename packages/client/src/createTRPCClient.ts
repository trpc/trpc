/* eslint-disable @typescript-eslint/no-explicit-any */
import type {
  AnyRouter,
  HTTPResponseEnvelope,
  HTTPSuccessResponseEnvelope,
  inferAsyncReturnType,
  inferEndpointArgs,
  inferHandler,
  inferSubscriptionData,
  Maybe,
} from '@trpcdev/server';

type UnsubscribeFn = () => void;

const retryDelay = (attemptIndex: number) =>
  attemptIndex === 0 ? 0 : Math.min(1000 * 2 ** attemptIndex, 30000);

type inferSubscriptionFn<TRouter extends AnyRouter> = <
  TPath extends keyof TRouter['_def']['subscriptions'],
  TArgs extends inferEndpointArgs<TRouter['_def']['subscriptions'][TPath]> &
    any[],
  TData extends inferSubscriptionData<
    inferAsyncReturnType<TRouter['_def']['subscriptions'][TPath]>
  >
>(
  pathAndArgs: [TPath, ...TArgs],
  opts: {
    onSuccess?: (data: TData) => void;
    onError?: (error: TRPCClientError) => void;
    getNextArgs?: (data: TData) => TArgs;
  },
) => UnsubscribeFn;

type CancelFn = () => void;
type CancellablePromise<T = unknown> = Promise<T> & {
  cancel: CancelFn;
};
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
}

export function createTRPCClient<TRouter extends AnyRouter>(
  opts: CreateTRPCClientOptions,
) {
  const { fetchOpts, url } = opts;
  const _fetch = getFetch(fetchOpts?.fetch);
  const AC = getAbortController(fetchOpts?.AbortController);

  async function handleResponse(promise: Promise<Response>) {
    let res: Maybe<Response> = null;
    let json: Maybe<HTTPResponseEnvelope<unknown>> = null;
    try {
      res = await promise;
      json = (await res.json()) as HTTPResponseEnvelope<unknown>;

      if (json.ok) {
        opts.onSuccess &&
          opts.onSuccess({
            ...json,
            data: json.data,
          });
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
  type TRPCType = 'subscription' | 'query' | 'mutation';
  function request({
    type,
    args,
    path,
  }: {
    type: TRPCType;
    args: unknown[];
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
        body: JSON.stringify({ args }),
        url: `${url}/${path}`,
      }),
      mutation: () => ({
        method: 'POST',
        body: JSON.stringify({ args }),
        url: `${url}/${path}`,
      }),
      query: () => ({
        method: 'GET',
        url:
          `${url}/${path}` +
          (args.length
            ? `?args=${encodeURIComponent(JSON.stringify(args))}`
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

    const promise: CancellablePromise<any> & {
      cancel(): void;
    } = handleResponse(fetch(reqUrl, reqOpts)) as any;
    promise.cancel = () => {
      ac?.abort();
    };

    return promise;
  }

  const query: inferHandler<TRouter['_def']['queries']> = async (
    path: string,
    ...args: unknown[]
  ) => {
    return request({
      type: 'query',
      path,
      args,
    });
  };

  const mutate: inferHandler<TRouter['_def']['mutations']> = async (
    path,
    ...args
  ) => {
    return request({
      type: 'mutation',
      path,
      args,
    });
  };

  function subscriptionOnce<
    TPath extends keyof TRouter['_def']['subscriptions'] & string,
    TArgs extends inferEndpointArgs<TRouter['_def']['subscriptions'][TPath]> &
      any[]
  >(path: TPath, ...args: TArgs) {
    type TData = inferSubscriptionData<
      inferAsyncReturnType<TRouter['_def']['subscriptions'][TPath]>
    >;
    let stopped = false;
    let nextTry: NodeJS.Timeout;
    let currentRequest: ReturnType<typeof request> | null = null;
    let attemptIndex = 0;

    console.log('subscriptioonOnce', { path, args });
    const promise = new Promise<TData>((resolve, reject) => {
      async function exec() {
        if (stopped) {
          return;
        }
        try {
          currentRequest = request({
            type: 'subscription',
            args,
            path,
          });
          const data = await currentRequest;
          console.log('response', { path, args, data });
          resolve(data);
          attemptIndex = 0;
        } catch (_err) {
          if (stopped) {
            reject(_err);
            return;
          }
          const err: TRPCClientError = _err;
          // console.log('❌ subscription failed :(', err.message);
          if (err.json?.statusCode === 408) {
            attemptIndex = 0;
          } else {
            attemptIndex++;
          }
          const delay = retryDelay(attemptIndex);
          nextTry = setTimeout(exec, delay);
        }
      }
      exec();
    }) as CancellablePromise<TData>;
    promise.cancel = () => {
      stopped = true;
      clearTimeout(nextTry);
      currentRequest?.cancel && currentRequest.cancel();
    };

    return promise;
  }

  const subscription: inferSubscriptionFn<TRouter> = (
    [path, ...args],
    opts,
  ) => {
    let stopped = false;
    let controller: AbortController | null = null;
    let nextTry: NodeJS.Timeout;
    let attemptIndex = 0;
    const exec = async (...thisArgs: typeof args) => {
      // console.log('args', args);
      if (stopped) {
        // console.log('subscriptions have stopped');
        return;
      }
      controller = AC ? new AC() : null;
      const signal = controller?.signal;
      const promise = _fetch(`${url}/${path}`, {
        method: 'PATCH',
        body: JSON.stringify({
          args: args,
        }),
        headers: getHeaders(),
        signal,
      });
      try {
        // console.log('⏳  waiting for', path, thisArgs);
        const data = await handleResponse(promise);

        if (stopped) {
          return;
        }
        opts.onSuccess && opts.onSuccess(data);

        const nextArgs = opts.getNextArgs ? opts.getNextArgs(data) : thisArgs;
        // console.log('nextArgs', nextArgs);
        attemptIndex = 0;

        exec(...nextArgs);
      } catch (_err) {
        if (stopped) {
          console.log('sub stopped');
          return;
        }
        const err: TRPCClientError = _err;
        // console.log('❌ subscription failed :(', err.message);
        if (err.json?.statusCode === 408) {
          attemptIndex = 0;
        } else {
          attemptIndex++;
        }
        const delay = retryDelay(attemptIndex);
        // console.log('trying again in', delay, 'ms');
        nextTry = setTimeout(() => {
          exec(...thisArgs);
        }, delay);
      }
    };
    // console.log('argds', args);
    exec(...args);
    return () => {
      stopped = true;
      clearTimeout(nextTry);
      controller?.abort();
    };
  };
  return {
    request,
    query,
    mutate,
    subscription,
    subscriptionOnce,
  };
}

export type TRPCClient = ReturnType<typeof createTRPCClient>;
